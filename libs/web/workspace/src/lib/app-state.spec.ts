import { TestBed } from "@angular/core/testing";
import {
  BrowserSnapshot,
  type SnapshotStorage,
} from "@pawtrace/browser-persistence";
import type { CaseDocument } from "@pawtrace/case-domain";
const { parseCaseFile } = await import("@pawtrace/case-domain");
const { default: file } =
  await import("@pawtrace/case-domain/fixtures/complete-case-v1.json");
import { AppState } from "./app-state";

function document(): CaseDocument {
  const parsed = parseCaseFile(JSON.stringify(file));
  if (!parsed.success) throw new Error("Invalid fixture");
  return parsed.data;
}

function activeDocument(state: AppState): CaseDocument {
  const active = state.document();
  if (!active) throw new Error("Expected an active case");
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
  jobs: { snapshot: CaseDocument; completion: ReturnType<typeof deferred> }[] =
    [];
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
    providers: [{ provide: BrowserSnapshot, useValue: storage }],
  });
  const state = TestBed.inject(AppState);
  await state.initialize();
  return { state, storage };
}

it("acknowledges only the stored revision and coalesces pending map changes", async () => {
  const { state, storage } = await setup();
  const updatedAt = activeDocument(state).case.updatedAt;
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 8 });
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 9 });
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 10 });
  expect(state.persistence().revision).toBe(3);
  expect(state.saveStatus()).toBe("saving");
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(1));
  storage.jobs[0].completion.resolve();
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(2));
  expect(state.persistence().savedRevision).toBe(1);
  expect(state.saveStatus()).toBe("saving");
  storage.jobs[1].completion.resolve();
  await vi.waitFor(() => expect(state.saveStatus()).toBe("saved"));
  expect(activeDocument(state).mapView.zoom).toBe(10);
  expect(activeDocument(state).case.updatedAt).toBe(updatedAt);
  expect(storage.saved).toEqual(state.document());
});

it("retains latest memory and the previous snapshot after failure, exports it and retries explicitly", async () => {
  const { state, storage } = await setup();
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 8 });
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(1));
  storage.jobs[0].completion.reject(new Error("Quota"));
  await vi.waitFor(() => expect(state.saveStatus()).toBe("error"));
  expect(storage.saved).toEqual(document());
  const parsed = parseCaseFile(await state.exportJson());
  expect(parsed.success && parsed.data.mapView.zoom).toBe(8);
  expect(state.persistence().savedRevision).toBe(0);
  state.retrySave();
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(2));
  storage.jobs[1].completion.resolve();
  await vi.waitFor(() => expect(state.saveStatus()).toBe("saved"));
});

it("drains an in-flight save, drops obsolete pending writes, and activates import only after storage commits", async () => {
  const { state, storage } = await setup();
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 8 });
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 9 });
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(1));
  await state.prepareImport(
    JSON.stringify({
      ...file,
      case: { ...file.case, id: "imported", title: "Imported" },
    }),
  );
  const replacement = state.confirmReplacement();
  state.changeViewport({ latitude: 1, longitude: 1, zoom: 3 });
  expect(activeDocument(state).case.id).toBe(file.case.id);
  expect(activeDocument(state).mapView.zoom).toBe(9);
  storage.jobs[0].completion.resolve();
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(2));
  expect(storage.jobs[1].snapshot.case.id).toBe("imported");
  expect(activeDocument(state).case.id).toBe(file.case.id);
  storage.jobs[1].completion.resolve();
  await replacement;
  expect(activeDocument(state).case.id).toBe("imported");
  expect(state.persistence().generation).toBe(1);
  expect(state.persistence().revision).toBe(0);
  expect(state.saveStatus()).toBe("saved");
  expect(storage.jobs).toHaveLength(2);
  expect(parseCaseFile(await state.exportJson())).toEqual({
    success: true,
    data: storage.saved,
  });
});

it("keeps a newer unsaved old case recoverable when replacement fails", async () => {
  const { state, storage } = await setup();
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 8 });
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 9 });
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(1));
  state.prepareNewCase();
  const replacing = state.confirmReplacement();
  storage.jobs[0].completion.resolve();
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(2));
  storage.jobs[1].completion.reject(new Error("Quota"));
  await replacing;
  expect(activeDocument(state).mapView.zoom).toBe(9);
  expect(state.persistence().savedRevision).toBe(1);
  expect(state.saveStatus()).toBe("unsaved");
  state.cancelReplacement();
  state.retrySave();
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(3));
  storage.jobs[2].completion.resolve();
  await vi.waitFor(() => expect(state.saveStatus()).toBe("saved"));
});

it("persists a user basemap choice without changing case timestamps or other case fields", async () => {
  const { state, storage } = await setup();
  state.changeBasemap("osm");
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(1));
  storage.jobs[0].completion.resolve();
  await vi.waitFor(() => expect(state.saveStatus()).toBe("saved"));
  expect(state.document()).toEqual({
    ...document(),
    mapView: { ...document().mapView, basemap: "osm" },
  });
});

it("retains invalid startup data until explicit successful replacement", async () => {
  const storage = new Storage();
  storage.saved = { schemaVersion: 99, data: "recover me" };
  const { state } = await setup(storage);
  expect(state.document()).toBeNull();
  expect(state.persistence().recovery).toContain("Zachowano");
  expect(storage.jobs).toHaveLength(0);
  state.prepareNewCase();
  state.cancelReplacement();
  expect(storage.saved).toEqual({ schemaVersion: 99, data: "recover me" });
});

it.each([
  "{",
  JSON.stringify({ ...file, schemaVersion: 99 }),
  JSON.stringify({ ...file, unknown: true }),
  JSON.stringify({
    ...file,
    case: {
      ...file.case,
      escape: { ...file.case.escape, escapePointId: "missing" },
    },
  }),
])(
  "rejects invalid import without changing the active or stored case: %#",
  async (text) => {
    const { state, storage } = await setup();
    await state.prepareImport(text);
    expect(state.ui().candidate).toBeNull();
    expect(state.ui().error).not.toBe("");
    expect(state.document()).toEqual(document());
    expect(storage.saved).toEqual(document());
    expect(storage.jobs).toHaveLength(0);
  },
);

it("exports the committed snapshot without changing revision, timestamps or acknowledgement and cancels import", async () => {
  const { state, storage } = await setup();
  const before = state.persistence();
  await state.prepareImport(
    JSON.stringify({ ...file, case: { ...file.case, title: "Candidate" } }),
  );
  const exported = await state.exportJson();
  expect(parseCaseFile(exported)).toEqual({ success: true, data: document() });
  expect(state.persistence()).toEqual(before);
  state.cancelReplacement();
  expect(state.ui().candidate).toBeNull();
  expect(state.document()).toEqual(document());
  expect(storage.jobs).toHaveLength(0);
});

it("retries a failed autosave on the next committed change without a background loop", async () => {
  const { state, storage } = await setup();
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 8 });
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(1));
  storage.jobs[0].completion.reject(new Error("Quota"));
  await vi.waitFor(() => expect(state.saveStatus()).toBe("error"));
  expect(storage.jobs).toHaveLength(1);
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 9 });
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(2));
  storage.jobs[1].completion.resolve();
  await vi.waitFor(() => expect(state.saveStatus()).toBe("saved"));
  expect(state.persistence().savedRevision).toBe(2);
});

it("does not reopen a cancelled import when asynchronous validation completes", async () => {
  const { state } = await setup();
  const importing = state.prepareImport(JSON.stringify(file));
  state.cancelReplacement();
  await importing;
  expect(state.ui().candidate).toBeNull();
});

it("does not replay a failed old-session snapshot after activating an imported case", async () => {
  const { state, storage } = await setup();
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 8 });
  state.changeViewport({ latitude: 51, longitude: 20, zoom: 9 });
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(1));
  await state.prepareImport(
    JSON.stringify({ ...file, case: { ...file.case, id: "next-session" } }),
  );
  const replacement = state.confirmReplacement();
  storage.jobs[0].completion.reject(
    new Error("Old-session transaction aborted"),
  );
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(2));
  expect(activeDocument(state).case.id).toBe(file.case.id);
  storage.jobs[1].completion.resolve();
  await replacement;
  expect(state.persistence().savedRevision).toBe(0);
  expect(state.saveStatus()).toBe("saved");
  state.changeViewport({ latitude: 52, longitude: 21, zoom: 10 });
  await vi.waitFor(() => expect(storage.jobs).toHaveLength(3));
  expect(storage.jobs[2].snapshot.case.id).toBe("next-session");
  expect(state.persistence().savedRevision).toBe(0);
  storage.jobs[2].completion.resolve();
  await vi.waitFor(() => expect(state.saveStatus()).toBe("saved"));
  expect(state.persistence().savedRevision).toBe(1);
  expect(activeDocument(state).case.id).toBe("next-session");
  // The replacement barrier drains callbacks before activation; an old-generation
  // completion cannot legally arrive afterwards through the storage Promise seam.
});
