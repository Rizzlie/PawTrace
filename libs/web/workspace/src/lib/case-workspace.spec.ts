import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserSnapshot, type SnapshotStorage } from '@pawtrace/browser-persistence';
import type { CaseDocument } from '@pawtrace/case-domain';
const { parseCaseFile } = await import('@pawtrace/case-domain');
const { default: file } = await import('@pawtrace/case-domain/fixtures/complete-case-v1.json');
import { CaseStore } from './case-store/case-store';
import { provideDispatcher } from '@ngrx/signals/events';

function document(): CaseDocument {
  const parsed = parseCaseFile(JSON.stringify(file));
  if (!parsed.success) throw new Error('Invalid fixture');
  return parsed.data;
}

function activeDocument(state: InstanceType<typeof CaseStore>): CaseDocument {
  const active = state.document();
  if (!active) throw new Error('Expected an active case');
  return active;
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

class Storage implements SnapshotStorage {
  saved: unknown = document();
  jobs: { snapshot: CaseDocument; completion: ReturnType<typeof deferred> }[] = [];
  async read() {
    return this.saved;
  }
  write(snapshot: CaseDocument) {
    const completion = deferred();
    this.jobs.push({ snapshot: structuredClone(snapshot), completion });
    return completion.promise.then(() => {
      this.saved = snapshot;
    });
  }
}

async function setup(storage = new Storage()) {
  TestBed.configureTestingModule({
    providers: [...provideDispatcher(), CaseStore, { provide: BrowserSnapshot, useValue: storage }],
  });
  const state = TestBed.inject(CaseStore);
  await state.initialize();
  return {
    state,
    storage,
  };
}

it('keeps point placement and Signal Forms isolated until confirmation, preserving imported history', async () => {
  const { state } = await setup();
  const original = structuredClone(activeDocument(state).points[0]);
  await state.editPoint(original.id);
  const editor = state.pointEditor();
  if (!editor) throw new Error('Expected point editor');
  editor.fields.name().value.set('Nowa nazwa');
  state.placePoint({ sessionId: editor.id, coordinates: { latitude: 51.5, longitude: 20.5 } });
  expect(activeDocument(state).points[0]).toEqual(original);
  state.changeViewport({ latitude: 52, longitude: 21, zoom: 12 });
  expect(editor.fields.latitude().value()).toBe('51.5');
  expect(editor.fields.name().value()).toBe('Nowa nazwa');
  expect(await state.savePoint(editor.id)).toBe(true);
  expect(activeDocument(state).points[0]).toEqual({
    ...original,
    name: 'Nowa nazwa',
    coordinates: { latitude: 51.5, longitude: 20.5 },
  });
});

it.each(['stay', 'abort'] as const)('cancels a pending point Save on %s', async (choice) => {
  const { state } = await setup();
  await state.editPoint('point-home');
  const editor = state.pointEditor();
  if (!editor) throw new Error('Expected editor');
  const original = structuredClone(activeDocument(state));
  editor.fields.name().value.set('Delayed point');
  const cancellation = new AbortController();
  const exit = state.requestEditorExit(cancellation.signal);
  const saving = state.resolveEditorTransition('save');
  if (choice === 'stay') await state.resolveEditorTransition('stay');
  else cancellation.abort();
  await saving;
  expect(await exit).toBe(false);
  expect(activeDocument(state)).toEqual(original);
  expect(state.pointEditor()?.id).toBe(editor.id);
});

it('validates new points, cancels geometry and ignores stale placement and field writes', async () => {
  const { state } = await setup();
  const original = structuredClone(activeDocument(state));
  await state.editPoint();
  const first = state.pointEditor();
  if (!first) throw new Error('Expected editor');
  expect(await state.savePoint(first.id)).toBe(false);
  first.fields.name().value.set('Szkic');
  state.placePoint({ sessionId: first.id, coordinates: { latitude: 50, longitude: 19 } });
  state.discardEditor(first.id);
  await state.editPoint();
  const next = state.pointEditor();
  if (!next) throw new Error('Expected editor');
  first.fields.name().value.set('Spóźniona zmiana');
  state.placePoint({ sessionId: first.id, coordinates: { latitude: 51, longitude: 20 } });
  expect(next.fields.name().value()).toBe('');
  expect(next.fields.latitude().value()).toBe('');
  state.discardEditor(next.id);
  expect(activeDocument(state)).toEqual(original);
});

it('protects dirty point transitions with Stay, validation, Save and Discard', async () => {
  const { state } = await setup();
  await state.editPoint();
  const editor = state.pointEditor();
  if (!editor) throw new Error('Expected editor');
  editor.fields.name().value.set('Karmienie');
  const stay = state.editPoint('point-home');
  await state.resolveEditorTransition('stay');
  await stay;
  expect(state.pointEditor()?.id).toBe(editor.id);
  const save = state.editPoint('point-home');
  await state.resolveEditorTransition('save');
  expect(state.closeRequested()).toBe(true);
  state.placePoint({ sessionId: editor.id, coordinates: { latitude: 51, longitude: 20 } });
  editor.fields.roles.feeding_location().value.set(true);
  editor.fields.escape().value.set(true);
  await state.resolveEditorTransition('save');
  await save;
  const committed = activeDocument(state).points.at(-1);
  expect(committed).toMatchObject({
    name: 'Karmienie',
    roles: ['feeding_location'],
    coordinates: { latitude: 51, longitude: 20 },
  });
  expect(activeDocument(state).case.escape.escapePointId).toBe(committed?.id);
  const current = state.pointEditor();
  if (!current) throw new Error('Expected next editor');
  current.fields.name().value.set('Odrzuć mnie');
  const leave = state.requestEditorExit();
  await state.resolveEditorTransition('discard');
  expect(await leave).toBe(true);
  expect(activeDocument(state).points[0].name).not.toBe('Odrzuć mnie');
});

it('deletes a place only after confirmation and unlinks its observations without removing assets or other records', async () => {
  const { state } = await setup();
  const original = structuredClone(activeDocument(state));
  state.requestPointRemoval('point-shed');
  expect(state.deletingPoint()?.entries).toHaveLength(7);
  state.cancelPointRemoval();
  expect(activeDocument(state)).toEqual(original);
  state.requestPointRemoval('point-shed');
  state.confirmPointRemoval();
  const exported = parseCaseFile(await state.exportJson());
  expect(exported.success).toBe(true);
  expect(activeDocument(state).points.map((point) => point.id)).toEqual(['point-home']);
  expect(activeDocument(state).areas[0].checks[0].observationEntryId).toBeNull();
  expect(activeDocument(state).areas.map((area) => area.id)).toEqual(
    original.areas.map((area) => area.id),
  );
  expect(activeDocument(state).assets).toEqual(original.assets);
  state.requestPointRemoval('point-home');
  state.confirmPointRemoval();
  expect(activeDocument(state).case.escape.escapePointId).toBeNull();
});

it('isolates nested Signal Forms edits, preserves them across map changes, and commits once', async () => {
  const { state } = await setup();
  const original = structuredClone(activeDocument(state));
  state.openProfile();
  const editor = state.profileEditor();
  if (!editor) throw new Error('Expected profile editor');
  editor.fields.animal.name().value.set('Mruczek');
  editor.fields.animal.age.value().value.set('7');
  editor.fields.animal.age.approximate().value.set(true);
  state.changeViewport({ latitude: 50, longitude: 21, zoom: 10 });
  expect(editor.fields.animal.age.value().value()).toBe('7');
  expect(activeDocument(state).animal).toEqual(original.animal);
  expect(JSON.parse(await state.exportJson()).animal).toEqual(original.animal);
  const revision = state.persistence().revision;
  expect(await state.saveProfile(editor.id)).toBe(true);
  expect(activeDocument(state).animal).toMatchObject({
    name: 'Mruczek',
    age: { value: 7, unit: 'years', approximate: true },
  });
  expect(activeDocument(state).animal?.photos).toEqual(original.animal?.photos);
  expect(activeDocument(state).mapView.zoom).toBe(10);
  expect(state.persistence().revision).toBe(revision + 1);
  expect(state.profileEditor()).toBeNull();
});

it('discards the draft, ignores old-session field writes and leaves committed data intact', async () => {
  const { state } = await setup();
  const original = structuredClone(activeDocument(state));
  state.openProfile();
  const first = state.profileEditor();
  if (!first) throw new Error('Expected profile editor');
  first.fields.animal.age.value().value.update(() => '3');
  state.discardEditor(first.id);
  state.openProfile();
  const second = state.profileEditor();
  if (!second) throw new Error('Expected new editor');
  first.fields.animal.name().value.set('Stale name');
  expect(await state.saveProfile(first.id)).toBe(false);
  expect(second.fields.animal.name().value()).toBe(original.animal?.name);
  expect(state.editorDirty()).toBe(false);
  expect(activeDocument(state)).toEqual(original);
});

it('protects a dirty editor during replacement and keeps it on Stay or invalid Save', async () => {
  const { state } = await setup();
  state.openProfile();
  const editor = state.profileEditor();
  if (!editor) throw new Error('Expected profile editor');
  editor.fields.animal.weightKilograms().value.set('-1');
  state.prepareNewCase();
  expect(state.closeRequested()).toBe(true);
  await state.resolveEditorTransition('save');
  expect(state.editorError()).toContain('weightKilograms');
  expect(state.profileEditor()?.id).toBe(editor.id);
  expect(state.candidate()).not.toBeNull();
  await state.resolveEditorTransition('stay');
  expect(state.candidate()).toBeNull();
  expect(state.profileEditor()?.id).toBe(editor.id);
  state.prepareNewCase();
  await state.resolveEditorTransition('discard');
  expect(state.profileEditor()).toBeNull();
  expect(state.candidate()).not.toBeNull();
  expect(state.closeRequested()).toBe(false);
});

it('waits for Save / Discard / Stay before allowing route exit', async () => {
  const { state } = await setup();
  state.openProfile();
  const editor = state.profileEditor();
  if (!editor) throw new Error('Expected editor');
  editor.fields.animal.name().value.set('Route draft');
  const stayed = state.requestEditorExit();
  await state.resolveEditorTransition('stay');
  expect(await stayed).toBe(false);
  expect(state.profileEditor()?.id).toBe(editor.id);
  const discarded = state.requestEditorExit();
  await state.resolveEditorTransition('discard');
  expect(await discarded).toBe(true);
  expect(state.profileEditor()).toBeNull();
});

it('cancels a superseded route exit without discarding the draft', async () => {
  const { state } = await setup();
  state.openProfile();
  const editor = state.profileEditor();
  if (!editor) throw new Error('Expected editor');
  editor.fields.animal.name().value.set('Keep me');
  const cancellation = new AbortController();
  const decision = state.requestEditorExit(cancellation.signal);
  cancellation.abort();
  expect(await decision).toBe(false);
  expect(state.closeRequested()).toBe(false);
  expect(state.profileEditor()?.fields.animal.name().value()).toBe('Keep me');
});

it('cancels pending replacement when route exit supersedes its dirty-editor decision', async () => {
  const { state } = await setup();
  const original = state.document();
  state.openProfile();
  const editor = state.profileEditor();
  if (!editor) throw new Error('Expected editor');
  editor.fields.animal.name().value.set('Keep this draft');
  state.prepareNewCase();
  const leaving = state.requestEditorExit();
  await state.resolveEditorTransition('stay');
  expect(await leaving).toBe(false);
  expect(state.candidate()).toBeNull();
  await state.confirmReplacement();
  expect(state.document()).toBe(original);
  expect(state.profileEditor()?.fields.animal.name().value()).toBe('Keep this draft');
});

it('keeps a cancelled or unchanged editor from creating a document revision', async () => {
  const { state } = await setup();
  const original = structuredClone(state.document());
  state.openProfile();
  const editor = state.profileEditor();
  if (!editor) throw new Error('Expected editor');
  expect(await state.saveProfile(editor.id)).toBe(true);
  expect(state.document()).toEqual(original);
  expect(state.persistence().revision).toBe(0);
  state.openProfile();
  const reopened = state.profileEditor();
  if (!reopened) throw new Error('Expected editor');
  reopened.fields.animal.name().value.set('Cancel me');
  state.discardEditor(reopened.id);
  expect(state.document()).toEqual(original);
  expect(state.persistence().revision).toBe(0);
});

it('rejects an unknown point and an invalid time without losing the draft', async () => {
  const { state } = await setup();
  state.openProfile();
  const editor = state.profileEditor();
  if (!editor) throw new Error('Expected editor');
  editor.fields.escape.escapePointId().value.set('missing-point');
  expect(await state.saveProfile(editor.id)).toBe(false);
  expect(state.editorError()).toContain('escapePointId');
  editor.fields.escape.escapePointId().value.set('');
  editor.fields.escape.time.kind().value.set('exact');
  editor.fields.escape.time.at().value.set('2026-03-29T02:30');
  expect(await state.saveProfile(editor.id)).toBe(false);
  expect(state.editorError()).toContain('occurredAt.at');
  expect(state.persistence().revision).toBe(0);
});

it('interprets a native local date/time in the case zone and preserves its instant on reopening', async () => {
  const { state } = await setup();
  state.openProfile();
  const editor = state.profileEditor();
  if (!editor) throw new Error('Expected editor');
  editor.fields.escape.time.kind().value.set('exact');
  editor.fields.escape.time.at().value.set('2026-10-27T18:30');
  expect(await state.saveProfile(editor.id)).toBe(true);
  expect(activeDocument(state).case.escape.occurredAt).toEqual({
    kind: 'exact',
    at: '2026-10-27T17:30:00.000Z',
    description: 'Około czternastej',
  });
  state.openProfile();
  expect(state.profileEditor()?.fields.escape.time.at().value()).toBe('2026-10-27T18:30:00');
});

it('keeps an unsaved committed profile exportable after storage failure and retries it', async () => {
  const { state, storage } = await setup();
  state.openProfile();
  const editor = state.profileEditor();
  if (!editor) throw new Error('Expected editor');
  editor.fields.animal.species().value.set('Papuga');
  await state.saveProfile(editor.id);
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(1));
  storage.jobs[0].completion.reject(new Error('Quota'));
  await vi.waitFor(() => expect(state.saveStatus()).toBe('error'));
  expect(JSON.parse(await state.exportJson()).animal.species).toBe('Papuga');
  state.retrySave();
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(2));
  storage.jobs[1].completion.resolve();
  await vi.waitFor(() => expect(state.saveStatus()).toBe('saved'));
});

it('acknowledges only the stored revision and coalesces pending map changes', async () => {
  const { state, storage } = await setup();
  const updatedAt = activeDocument(state).case.updatedAt;
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 8 });
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 9 });
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 10 });
  expect(state.persistence().revision).toBe(3);
  expect(state.saveStatus()).toBe('saving');
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(1));
  storage.jobs[0].completion.resolve();
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(2));
  expect(state.persistence().savedRevision).toBe(1);
  expect(state.saveStatus()).toBe('saving');
  storage.jobs[1].completion.resolve();
  await vi.waitFor(() => expect(state.saveStatus()).toBe('saved'));
  expect(activeDocument(state).mapView.zoom).toBe(10);
  expect(activeDocument(state).case.updatedAt).toBe(updatedAt);
  expect(storage.saved).toEqual(state.document());
});

it('retains latest memory and the previous snapshot after failure, exports it and retries explicitly', async () => {
  const { state, storage } = await setup();
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 8 });
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(1));
  storage.jobs[0].completion.reject(new Error('Quota'));
  await vi.waitFor(() => expect(state.saveStatus()).toBe('error'));
  expect(storage.saved).toEqual(document());
  const parsed = parseCaseFile(await state.exportJson());
  expect(parsed.success && parsed.data.mapView.zoom).toBe(8);
  expect(state.persistence().savedRevision).toBe(0);
  state.retrySave();
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(2));
  storage.jobs[1].completion.resolve();
  await vi.waitFor(() => expect(state.saveStatus()).toBe('saved'));
});

it('drains an in-flight save, drops obsolete pending writes, and activates import only after storage commits', async () => {
  const { state, storage } = await setup();
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 8 });
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 9 });
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(1));
  await state.prepareImport(
    JSON.stringify({
      ...file,
      case: { ...file.case, id: 'imported', title: 'Imported' },
    }),
  );
  const replacement = state.confirmReplacement();
  state.changeViewport({ latitude: 1, longitude: 1, zoom: 3 });
  expect(activeDocument(state).case.id).toBe(file.case.id);
  expect(activeDocument(state).mapView.zoom).toBe(9);
  storage.jobs[0].completion.resolve();
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(2));
  expect(storage.jobs[1].snapshot.case.id).toBe('imported');
  expect(activeDocument(state).case.id).toBe(file.case.id);
  storage.jobs[1].completion.resolve();
  await replacement;
  expect(activeDocument(state).case.id).toBe('imported');
  expect(state.persistence().generation).toBe(1);
  expect(state.persistence().revision).toBe(0);
  expect(state.saveStatus()).toBe('saved');
  expect(storage.jobs).toHaveLength(2);
  expect(parseCaseFile(await state.exportJson())).toEqual({
    success: true,
    data: storage.saved,
  });
});

it('keeps a newer unsaved old case recoverable when replacement fails', async () => {
  const { state, storage } = await setup();
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 8 });
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 9 });
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(1));
  state.prepareNewCase();
  const replacing = state.confirmReplacement();
  storage.jobs[0].completion.resolve();
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(2));
  storage.jobs[1].completion.reject(new Error('Quota'));
  await replacing;
  expect(activeDocument(state).mapView.zoom).toBe(9);
  expect(state.persistence().savedRevision).toBe(1);
  expect(state.saveStatus()).toBe('unsaved');
  state.cancelReplacement();
  state.retrySave();
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(3));
  storage.jobs[2].completion.resolve();
  await vi.waitFor(() => expect(state.saveStatus()).toBe('saved'));
});

it('persists a user basemap choice without changing case timestamps or other case fields', async () => {
  const { state, storage } = await setup();
  state.changeBasemap('osm');
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(1));
  storage.jobs[0].completion.resolve();
  await vi.waitFor(() => expect(state.saveStatus()).toBe('saved'));
  expect(state.document()).toEqual({
    ...document(),
    mapView: { ...document().mapView, basemap: 'osm' },
  });
});

it('retains invalid startup data until explicit successful replacement', async () => {
  const storage = new Storage();
  storage.saved = { schemaVersion: 99, data: 'recover me' };
  const { state } = await setup(storage);
  expect(state.document()).toBeNull();
  expect(state.persistence().recovery).toContain('Zachowano');
  expect(storage.jobs).toHaveLength(0);
  state.prepareNewCase();
  state.cancelReplacement();
  expect(storage.saved).toEqual({ schemaVersion: 99, data: 'recover me' });
});

it.each([
  '{',
  JSON.stringify({ ...file, schemaVersion: 99 }),
  JSON.stringify({ ...file, unknown: true }),
  JSON.stringify({
    ...file,
    case: {
      ...file.case,
      escape: { ...file.case.escape, escapePointId: 'missing' },
    },
  }),
])('rejects invalid import without changing the active or stored case: %#', async (text) => {
  const { state, storage } = await setup();
  await state.prepareImport(text);
  expect(state.candidate()).toBeNull();
  expect(state.fileError()).not.toBe('');
  expect(state.document()).toEqual(document());
  expect(storage.saved).toEqual(document());
  expect(storage.jobs).toHaveLength(0);
});

it('exports the committed snapshot without changing revision, timestamps or acknowledgement and cancels import', async () => {
  const { state, storage } = await setup();
  const before = state.persistence();
  await state.prepareImport(
    JSON.stringify({ ...file, case: { ...file.case, title: 'Candidate' } }),
  );
  const exported = await state.exportJson();
  expect(parseCaseFile(exported)).toEqual({ success: true, data: document() });
  expect(state.persistence()).toEqual(before);
  state.cancelReplacement();
  expect(state.candidate()).toBeNull();
  expect(state.document()).toEqual(document());
  expect(storage.jobs).toHaveLength(0);
});

it('retries a failed autosave on the next committed change without a background loop', async () => {
  const { state, storage } = await setup();
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 8 });
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(1));
  storage.jobs[0].completion.reject(new Error('Quota'));
  await vi.waitFor(() => expect(state.saveStatus()).toBe('error'));
  expect(storage.jobs).toHaveLength(1);
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 9 });
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(2));
  storage.jobs[1].completion.resolve();
  await vi.waitFor(() => expect(state.saveStatus()).toBe('saved'));
  expect(state.persistence().savedRevision).toBe(2);
});

it('does not reopen a cancelled import when asynchronous validation completes', async () => {
  const { state } = await setup();
  const importing = state.prepareImport(JSON.stringify(file));
  state.cancelReplacement();
  await importing;
  expect(state.candidate()).toBeNull();
});

it('does not replay a failed old-session snapshot after activating an imported case', async () => {
  const { state, storage } = await setup();
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 8 });
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 9 });
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(1));
  await state.prepareImport(
    JSON.stringify({ ...file, case: { ...file.case, id: 'next-session' } }),
  );
  const replacement = state.confirmReplacement();
  storage.jobs[0].completion.reject(new Error('Old-session transaction aborted'));
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(2));
  expect(activeDocument(state).case.id).toBe(file.case.id);
  storage.jobs[1].completion.resolve();
  await replacement;
  expect(state.persistence().savedRevision).toBe(0);
  expect(state.saveStatus()).toBe('saved');
  state.changeViewport({ latitude: 52, longitude: 21, zoom: 10 });
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(3));
  expect(storage.jobs[2].snapshot.case.id).toBe('next-session');
  expect(state.persistence().savedRevision).toBe(0);
  storage.jobs[2].completion.resolve();
  await vi.waitFor(() => expect(state.saveStatus()).toBe('saved'));
  expect(state.persistence().savedRevision).toBe(1);
  expect(activeDocument(state).case.id).toBe('next-session');
  // The replacement barrier drains callbacks before activation; an old-generation
  // completion cannot legally arrive afterwards through the storage Promise seam.
});
it('cancels an in-flight Save when the draft changes and preserves the latest fields', async () => {
  const { state } = await setup();
  state.openProfile();
  const session = state.profileEditor();
  if (!session) throw new Error('Expected editor');
  session.fields.animal.name().value.set('First edit');
  const saving = state.saveProfile(session.id);
  session.fields.animal.name().value.set('Latest edit');
  expect(await saving).toBe(false);
  expect(state.persistence().revision).toBe(0);
  expect(state.profileEditor()?.fields.animal.name().value()).toBe('Latest edit');
  expect(await state.saveProfile(session.id)).toBe(true);
  expect(activeDocument(state).animal?.name).toBe('Latest edit');
});

it('aborts an in-flight transition Save when navigation is cancelled', async () => {
  const { state } = await setup();
  state.openProfile();
  const session = state.profileEditor();
  if (!session) throw new Error('Expected editor');
  session.fields.animal.name().value.set('Keep editing');
  const cancellation = new AbortController();
  const leaving = state.requestEditorExit(cancellation.signal);
  const saving = state.resolveEditorTransition('save');
  cancellation.abort();
  await saving;
  expect(await leaving).toBe(false);
  expect(state.persistence().revision).toBe(0);
  expect(state.editorDirty()).toBe(true);
  expect(state.profileEditor()?.id).toBe(session.id);
});

it('isolates sibling workspace stores and their event dispatchers', async () => {
  TestBed.configureTestingModule({});
  const parent = TestBed.inject(EnvironmentInjector);
  const otherStorage = new Storage();
  const first = createEnvironmentInjector(
    [...provideDispatcher(), CaseStore, { provide: BrowserSnapshot, useValue: new Storage() }],
    parent,
  );
  const second = createEnvironmentInjector(
    [...provideDispatcher(), CaseStore, { provide: BrowserSnapshot, useValue: otherStorage }],
    parent,
  );
  try {
    const state = first.get(CaseStore);
    const other = second.get(CaseStore);
    await Promise.all([state.initialize(), other.initialize()]);
    state.openProfile();
    const editor = state.profileEditor();
    if (!editor) throw new Error('Expected editor');
    editor.fields.animal.name().value.set('Only first workspace');
    state.changeViewport({ latitude: 50, longitude: 21, zoom: 10 });
    expect(other.profileEditor()).toBeNull();
    expect(other.editorDirty()).toBe(false);
    expect(other.persistence().revision).toBe(0);
    expect(otherStorage.jobs).toHaveLength(0);
    expect(other.document()?.mapView.zoom).toBe(document().mapView.zoom);
  } finally {
    first.destroy();
    second.destroy();
  }
});

it('keeps the newest import candidate when an older parse completes after cancellation', async () => {
  const { state } = await setup();
  const older = structuredClone(file);
  older.case.title = 'Obsolete import';
  const newer = structuredClone(file);
  newer.case.title = 'Current import';
  const oldImport = state.prepareImport(JSON.stringify(older));
  state.cancelReplacement();
  const newImport = state.prepareImport(JSON.stringify(newer));
  await Promise.all([oldImport, newImport]);
  expect(state.candidate()?.case.title).toBe('Current import');
  expect(state.fileError()).toBe('');
  expect(state.persistence().revision).toBe(0);
});

it('ignores stale form writes without cancelling the current session Save', async () => {
  const { state } = await setup();
  state.openProfile();
  const old = state.profileEditor();
  if (!old) throw new Error('Expected old editor');
  state.discardEditor(old.id);
  state.openProfile();
  const current = state.profileEditor();
  if (!current) throw new Error('Expected current editor');
  current.fields.animal.name().value.set('Current saved profile');
  const saving = state.saveProfile(current.id);
  old.fields.animal.name().value.set('Obsolete delayed input');
  expect(await saving).toBe(true);
  expect(activeDocument(state).animal?.name).toBe('Current saved profile');
  expect(state.persistence().revision).toBe(1);
  expect(state.profileEditor()).toBeNull();
});
