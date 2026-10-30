import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
const { createEmptyCase } = await import('@pawtrace/case-domain');
import { isUncertainOutcome, VersionConflict } from './case-api';
import { ServerCaseStorage } from './case-storage';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), ServerCaseStorage],
  });
  return {
    storage: TestBed.inject(ServerCaseStorage),
    http: TestBed.inject(HttpTestingController),
  };
}
const document = (title: string) =>
  createEmptyCase({ id: 'case/1', title, timeZone: 'UTC', now: '2026-10-30T08:00:00Z' });
const ack = (version: number) => ({ id: 'case/1', version, savedAt: '2026-10-30T08:00:00Z' });

it('reads a stored case with its version and resolves a missing case as absent', async () => {
  const { storage, http } = setup();
  const reading = storage.read('case/1');
  http
    .expectOne('/api/cases/case%2F1')
    .flush({ document: document('Start'), version: 4, savedAt: '2026-10-30T08:00:00Z' });
  expect(await reading).toMatchObject({ document: document('Start'), version: 4 });
  const missing = storage.read('other');
  http
    .expectOne('/api/cases/other')
    .flush({ error: 'not_found' }, { status: 404, statusText: 'Not Found' });
  expect(await missing).toBeUndefined();
  http.verify();
});

it('sends exactly the requested version and key and returns the acknowledged version', async () => {
  const { storage, http } = setup();
  const writing = storage.write({ document: document('Zapis'), version: 4, key: 'key-1' });
  const put = http.expectOne({ method: 'PUT', url: '/api/cases/case%2F1' });
  expect(put.request.headers.get('If-Match')).toBe('"4"');
  expect(put.request.headers.get('Idempotency-Key')).toBe('key-1');
  expect(put.request.body).toEqual({ document: document('Zapis') });
  put.flush(ack(5));
  expect(await writing).toMatchObject({ version: 5 });
  http.verify();
});

it('turns a stale write into a version conflict, which is a definite outcome', async () => {
  const { storage, http } = setup();
  const stale = storage.write({ document: document('Nieaktualna'), version: 4, key: 'key-2' });
  http
    .expectOne({ method: 'PUT' })
    .flush(
      { error: 'version_conflict', version: 9 },
      { status: 412, statusText: 'Precondition Failed' },
    );
  const failure = await stale.catch((error: unknown) => error);
  expect(failure).toEqual(new VersionConflict(9));
  expect(isUncertainOutcome(failure)).toBe(false);
  http.verify();
});

it('leaves a lost response uncertain', async () => {
  const { storage, http } = setup();
  const lost = storage.write({ document: document('Utracona'), version: 4, key: 'key-3' });
  http.expectOne({ method: 'PUT' }).error(new ProgressEvent('error'));
  expect(isUncertainOutcome(await lost.catch((error: unknown) => error))).toBe(true);
  http.verify();
});
