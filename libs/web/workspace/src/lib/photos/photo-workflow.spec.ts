import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideDispatcher } from '@ngrx/signals/events';
const { createEmptyCase } = await import('@pawtrace/case-domain');
import { CaseStorage } from '../cases/case-storage';
import { CaseStore } from '../case-store/case-store';
import { PhotoCard } from './photo-card';
import { PhotoGallery } from './photo-gallery';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { PhotoTransfers } from './photo-transfers';

const newCase = () =>
  createEmptyCase({
    id: 'case-1',
    title: 'Nowa sprawa',
    timeZone: 'UTC',
    now: new Date().toISOString(),
  });
const filename = 'efb08652-e68f-4652-a876-38197646d123.heic';
const metadata = {
  filename,
  originalName: 'kot.heic',
  mediaType: 'image/heic',
  sizeBytes: 42,
  widthPixels: 16,
  heightPixels: 12,
  thumbnailFilename: 'thumbnail.png',
  previewFilename: 'preview.png',
  processing: {
    thumbnail: { status: 'ready', filename: 'thumbnail.png' },
    preview: { status: 'ready', filename: 'preview.png' },
  },
};

async function setup() {
  const document = { ...newCase(), animal: { photos: [filename] } };
  const write = vi.fn(async () => ({ version: 2 }));
  TestBed.configureTestingModule({
    providers: [
      ...provideDispatcher(),
      provideHttpClient(),
      provideHttpClientTesting(),
      CaseStore,
      {
        provide: CaseStorage,
        useValue: { read: async () => ({ document, version: 1 }), write },
      },
    ],
  });
  const state = TestBed.inject(CaseStore);
  await state.open('case-1');
  return { state, http: TestBed.inject(HttpTestingController), document, write };
}

it('resolves case photo metadata without a card and renders it without requests or document writes', async () => {
  const { state, http, document, write } = await setup();
  const revision = state.persistence().revision;
  const before = JSON.parse(await state.exportJson());
  http.expectOne(`/api/assets/${filename}/metadata`).flush(metadata);
  expect(state.document()).toEqual(document);
  expect(state.persistence().revision).toBe(revision);
  const after = JSON.parse(await state.exportJson());
  expect({ ...after, exportedAt: before.exportedAt }).toEqual(before);
  expect(write).not.toHaveBeenCalled();
  const fixture = TestBed.createComponent(PhotoCard);
  fixture.componentRef.setInput('filename', filename);
  await fixture.whenStable();
  expect(fixture.nativeElement.textContent).toContain('kot.heic');
  expect(state.persistence().revision).toBe(revision);
  fixture.nativeElement.querySelector('img').dispatchEvent(new Event('error'));
  await fixture.whenStable();
  expect(fixture.nativeElement.textContent).toContain('Miniatura niedostępna');
  state.reloadPhoto(filename);
  http.expectOne(`/api/assets/${filename}/metadata`).flush(metadata);
  await fixture.whenStable();
  expect(fixture.nativeElement.querySelector('img')).not.toBeNull();
  expect(state.persistence().revision).toBe(revision);
  http.verify();
});

it('keeps a working thumbnail and original download after the full preview fails', async () => {
  const { state, http } = await setup();
  http.expectOne(`/api/assets/${filename}/metadata`).flush(metadata);
  const fixture = TestBed.createComponent(PhotoCard);
  fixture.componentRef.setInput('filename', filename);
  await fixture.whenStable();
  const host: HTMLElement = fixture.nativeElement;
  const open = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent?.trim() === 'Powiększ zdjęcie',
  );
  if (!open) throw new Error('Expected preview action');
  open.click();
  await fixture.whenStable();
  document.querySelector('[role="dialog"] img')?.dispatchEvent(new Event('error'));
  await fixture.whenStable();
  expect(fixture.nativeElement.querySelector('img')).not.toBeNull();
  expect(fixture.nativeElement.textContent).not.toContain('Zdjęcie niedostępne');
  expect(fixture.nativeElement.querySelector('a[download]')).not.toBeNull();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Podgląd niedostępny');
  expect(state.document()?.animal?.photos).toEqual([filename]);
  http.verify();
});

it('renders a filename placeholder without a download action when metadata is unavailable', async () => {
  const { http } = await setup();
  http
    .expectOne(`/api/assets/${filename}/metadata`)
    .flush({}, { status: 404, statusText: 'Not found' });
  const fixture = TestBed.createComponent(PhotoCard);
  fixture.componentRef.setInput('filename', filename);
  await fixture.whenStable();
  expect(fixture.nativeElement.textContent).toContain(filename);
  expect(fixture.nativeElement.textContent).toContain('Zdjęcie niedostępne');
  expect(fixture.nativeElement.querySelector('a[download]')).toBeNull();
  http.verify();
});

it('does not project another active editor into a gallery with a stale editor identity', async () => {
  const { state, http } = await setup();
  http.expectOne(`/api/assets/${filename}/metadata`).flush(metadata);
  state.openProfile();
  const editor = state.profileEditor();
  if (!editor) throw new Error('Expected profile editor');
  const fixture = TestBed.createComponent(PhotoGallery);
  fixture.componentRef.setInput('editorId', editor.id);
  await fixture.whenStable();
  expect(fixture.nativeElement.querySelectorAll('article')).toHaveLength(1);
  fixture.componentRef.setInput('editorId', editor.id + 1);
  await fixture.whenStable();
  expect(fixture.nativeElement.querySelectorAll('article')).toHaveLength(0);
  expect(fixture.nativeElement.querySelector('select')).toBeNull();
  expect(fixture.nativeElement.querySelector('input[type=file]')?.disabled).toBe(true);
  http.verify();
});

it('derives retry progress and failure from the case workflow, prevents duplicate retries and resolves the refreshed preview', async () => {
  const { state, http } = await setup();
  const failed = {
    ...metadata,
    thumbnailFilename: null,
    previewFilename: null,
    processing: {
      thumbnail: { status: 'failed', error: 'decoder_failed' },
      preview: { status: 'failed', error: 'decoder_failed' },
    },
  };
  http.expectOne(`/api/assets/${filename}/metadata`).flush(failed);
  state.retryPhoto(filename);
  state.retryPhoto(filename);
  expect(state.photoReads()[filename].status).toBe('retrying');
  http
    .expectOne(`/api/assets/${filename}/retry`)
    .flush({}, { status: 503, statusText: 'Unavailable' });
  expect(state.photoReads()[filename]).toMatchObject({
    status: 'error',
    operation: 'retry',
    metadata: failed,
  });
  expect(state.photoReads()[filename].error).toContain('Nie rozpoczęto ponawiania');
  state.retryPhoto(filename);
  http.expectOne(`/api/assets/${filename}/retry`).flush({});
  http.expectOne(`/api/assets/${filename}/metadata`).flush(metadata);
  expect(state.photoReads()[filename]).toMatchObject({ status: 'ready', error: '', metadata });
  expect(state.document()?.assets).toEqual([]);
  http.verify();
});

it('cancels an obsolete metadata read when the case is replaced and keeps photo request state out of JSON', async () => {
  const { state, http } = await setup();
  const pending = http.expectOne(`/api/assets/${filename}/metadata`);
  await state.prepareImport(JSON.stringify({ ...newCase(), exportedAt: new Date().toISOString() }));
  await state.confirmReplacement();
  expect(pending.cancelled).toBe(true);
  expect(state.photoReads()).toEqual({});
  expect(state.document()?.assets).toEqual([]);
  expect(JSON.parse(await state.exportJson())).not.toHaveProperty('photoReads');
  http.verify();
});

it('binds uploads to the route store lifetime even when no gallery performs cleanup', async () => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const owner = createEnvironmentInjector(
    [
      ...provideDispatcher(),
      CaseStore,
      {
        provide: CaseStorage,
        useValue: {
          read: async () => ({ document: newCase(), version: 1 }),
          write: async () => ({ version: 2 }),
        },
      },
    ],
    TestBed.inject(EnvironmentInjector),
  );
  const state = owner.get(CaseStore);
  await state.open('case-1');
  state.openProfile();
  const editor = state.profileEditor();
  if (!editor) throw new Error('Expected profile editor');
  state.uploadPhotos(editor.id, [new File(['a'], 'a.jpg')]);
  const http = TestBed.inject(HttpTestingController);
  const upload = http.expectOne('/api/assets');
  owner.destroy();
  expect(upload.cancelled).toBe(true);
  expect(TestBed.inject(PhotoTransfers).jobs()).toEqual([]);
  http.verify();
});
