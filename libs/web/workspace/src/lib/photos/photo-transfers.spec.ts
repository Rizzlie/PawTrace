import { TestBed } from '@angular/core/testing';
import { createEnvironmentInjector, DestroyRef, EnvironmentInjector } from '@angular/core';
import { provideHttpClient, HttpEventType } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PhotoTransfers } from './photo-transfers';

const metadata = {
  filename: 'efb08652-e68f-4652-a876-38197646d123.jpg',
  originalName: 'Kot.jpg',
  mediaType: 'image/jpeg',
  sizeBytes: 42,
  widthPixels: null,
  heightPixels: null,
  thumbnailFilename: null,
  previewFilename: null,
  processing: { thumbnail: { status: 'pending' }, preview: { status: 'pending' } },
};

it('limits concurrent uploads, reports progress, retries failures and returns only stored originals', () => {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), PhotoTransfers],
  });
  const transfers = TestBed.inject(PhotoTransfers);
  const http = TestBed.inject(HttpTestingController);
  const stored: string[] = [];
  const target = { caseId: 'case', generation: 0, editorId: 1 };
  transfers.add(
    [new File(['a'], 'a.jpg'), new File(['b'], 'b.jpg'), new File(['c'], 'c.jpg')],
    target,
    (asset) => stored.push(asset.filename),
    TestBed.inject(DestroyRef),
  );
  const requests = http.match('/api/cases/case/assets');
  expect(requests).toHaveLength(2);
  requests[0].event({ type: HttpEventType.UploadProgress, loaded: 25, total: 100 });
  expect(transfers.jobs()[0].progress).toBe(25);
  requests[0].flush({ message: 'Brak miejsca' }, { status: 507, statusText: 'Storage full' });
  expect(transfers.jobs()[0].status).toBe('failed');
  expect(stored).toEqual([]);
  const third = http.expectOne('/api/cases/case/assets');
  requests[1].flush(metadata);
  third.flush({ ...metadata, filename: 'efb08652-e68f-4652-a876-38197646d124.jpg' });
  transfers.retry(transfers.jobs()[0].id);
  http
    .expectOne('/api/cases/case/assets')
    .flush({ ...metadata, filename: 'efb08652-e68f-4652-a876-38197646d125.jpg' });
  expect(stored).toEqual([
    metadata.filename,
    'efb08652-e68f-4652-a876-38197646d124.jpg',
    'efb08652-e68f-4652-a876-38197646d125.jpg',
  ]);
  expect(transfers.jobs().every((job) => job.status === 'stored')).toBe(true);
  http.verify();
});

it('confirms an invalid successful response by filename without uploading the saved file again', () => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const transfers = TestBed.inject(PhotoTransfers);
  const http = TestBed.inject(HttpTestingController);
  const stored: string[] = [];
  transfers.add(
    [new File(['a'], 'a.jpg')],
    { caseId: 'case', generation: 0, editorId: 1 },
    (asset) => stored.push(asset.filename),
    TestBed.inject(DestroyRef),
  );
  http.expectOne('/api/cases/case/assets').flush({ filename: metadata.filename });
  expect(transfers.jobs()[0].status).toBe('unconfirmed');
  expect(stored).toEqual([]);
  transfers.retry(transfers.jobs()[0].id);
  http.expectNone((request) => request.method === 'POST');
  http.expectOne(`/api/cases/case/assets/${metadata.filename}/metadata`).flush(metadata);
  expect(stored).toEqual([metadata.filename]);
  http.verify();
});

it('cancels active and queued uploads when their owner is destroyed without notifying it', () => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const transfers = TestBed.inject(PhotoTransfers);
  const http = TestBed.inject(HttpTestingController);
  const owner = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
  const stored = vi.fn();
  transfers.add(
    [new File(['a'], 'a.jpg'), new File(['b'], 'b.jpg'), new File(['c'], 'c.jpg')],
    { caseId: 'case', generation: 0, editorId: 1 },
    stored,
    owner.get(DestroyRef),
  );
  const active = http.match('/api/cases/case/assets');
  expect(active).toHaveLength(2);
  owner.destroy();
  expect(active.every((request) => request.cancelled)).toBe(true);
  expect(transfers.jobs()).toEqual([]);
  expect(stored).not.toHaveBeenCalled();
  http.verify();
});

it('never offers an upload retry for an unidentifiable successful response', () => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const transfers = TestBed.inject(PhotoTransfers);
  const http = TestBed.inject(HttpTestingController);
  const stored = vi.fn();
  transfers.add(
    [new File(['a'], 'a.jpg')],
    { caseId: 'case', generation: 0, editorId: 1 },
    stored,
    TestBed.inject(DestroyRef),
  );
  http.expectOne('/api/cases/case/assets').flush({ unexpected: true });
  expect(transfers.jobs()[0]).toMatchObject({ status: 'unconfirmed', confirmationFilename: null });
  transfers.retry(transfers.jobs()[0].id);
  http.expectNone(() => true);
  expect(stored).not.toHaveBeenCalled();
  http.verify();
});
