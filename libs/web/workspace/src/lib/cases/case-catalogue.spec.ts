import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CaseCatalogue } from './case-catalogue';

const item = { id: 'case/1', title: 'Luna', version: 3, savedAt: '2026-10-30T08:00:00Z' };
const ack = { id: 'case/1', version: 4, savedAt: '2026-10-30T08:00:00Z' };

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return { catalogue: TestBed.inject(CaseCatalogue), http: TestBed.inject(HttpTestingController) };
}

it('repeats an uncertain create with the same key and starts a new key after success', async () => {
  const { catalogue, http } = setup();
  const lost = catalogue.submit({ kind: 'create', title: 'Luna' });
  const first = http.expectOne({ method: 'POST', url: '/api/cases' });
  first.error(new ProgressEvent('error'));
  expect(await lost).toEqual({ status: 'failed' });
  const retried = catalogue.submit({ kind: 'create', title: 'Luna' });
  const second = http.expectOne({ method: 'POST', url: '/api/cases' });
  const key = first.request.headers.get('Idempotency-Key');
  expect(second.request.headers.get('Idempotency-Key')).toBe(key);
  second.flush(ack);
  expect(await retried).toEqual({ status: 'created', id: 'case/1' });
  const next = catalogue.submit({ kind: 'create', title: 'Luna' });
  const third = http.expectOne({ method: 'POST', url: '/api/cases' });
  expect(third.request.headers.get('Idempotency-Key')).not.toBe(key);
  third.flush(ack);
  await next;
  http.verify();
});

it('uses a new key when the intent changes and after a definite rejection', async () => {
  const { catalogue, http } = setup();
  const lost = catalogue.submit({ kind: 'rename', item, title: 'Pierwsza' });
  const first = http.expectOne({ method: 'PATCH', url: '/api/cases/case%2F1' });
  expect(first.request.headers.get('If-Match')).toBe('"3"');
  first.flush({}, { status: 503, statusText: 'Unavailable' });
  expect(await lost).toEqual({ status: 'failed' });
  const changed = catalogue.submit({ kind: 'rename', item, title: 'Druga' });
  const second = http.expectOne({ method: 'PATCH' });
  expect(second.request.headers.get('Idempotency-Key')).not.toBe(
    first.request.headers.get('Idempotency-Key'),
  );
  second.flush({ error: 'invalid_case' }, { status: 400, statusText: 'Bad Request' });
  expect(await changed).toEqual({ status: 'invalid' });
  const again = catalogue.submit({ kind: 'rename', item, title: 'Druga' });
  const third = http.expectOne({ method: 'PATCH' });
  expect(third.request.headers.get('Idempotency-Key')).not.toBe(
    second.request.headers.get('Idempotency-Key'),
  );
  third.flush(ack);
  expect(await again).toEqual({ status: 'done' });
  http.verify();
});

it.each([
  [412, 'conflict'],
  [404, 'missing'],
  [500, 'failed'],
])('reports HTTP %i from a delete as %s', async (status, outcome) => {
  const { catalogue, http } = setup();
  const removing = catalogue.submit({ kind: 'delete', item });
  http
    .expectOne({ method: 'DELETE', url: '/api/cases/case%2F1' })
    .flush({}, { status, statusText: 'Rejected' });
  expect(await removing).toEqual({ status: outcome });
  http.verify();
});
