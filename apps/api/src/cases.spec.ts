import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApplication } from './application';
import { startProvider } from '../tests/oidc-provider';
import { ApiClient } from '../tests/case-client';

const DATABASE_URL = 'postgres://pawtrace_test:local-test-only@127.0.0.1:55432/pawtrace_test';
const fixture = (name: string) => {
  const { exportedAt, ...document } = JSON.parse(
    readFileSync(
      join(__dirname, '../../../libs/shared/case-domain/src/fixtures', name + '-case-v1.json'),
      'utf8',
    ),
  );
  void exportedAt;
  return document;
};
/** The only documented root metadata change: the server owns the case identity. */
const asCase = (id: string, document: ReturnType<typeof fixture>) => ({
  ...document,
  case: { ...document.case, id },
});

let provider: Awaited<ReturnType<typeof startProvider>>;
let app: NestExpressApplication;
let base: string;
const run = randomUUID().slice(0, 8);

async function start() {
  app = await createApplication({
    ignoreEnvFile: true,
    authentication: { provider: provider.configuration },
  });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
}

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', DATABASE_URL);
  vi.stubEnv('SESSION_SECRET', 'test-session-secret-at-least-32-characters');
  vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
  vi.stubEnv('AUTH_EMAIL_ALLOWLIST', '');
  provider = await startProvider();
  await start();
});
afterAll(async () => {
  await app?.close();
  await provider?.close();
  vi.unstubAllEnvs();
});

const owner = (name: string) => ApiClient.signIn(base, provider, `${name}-${run}`);

it('lets one owner create, list, open, rename and delete private cases while another owner gets non-disclosing 404s', async () => {
  const alice = await owner('alice');
  const bob = await owner('bob');
  const first = await alice.create('Poszukiwania Luny');
  const second = await alice.create('Poszukiwania Burka');
  expect(first.status).toBe(201);
  expect(first.body).toMatchObject({ version: 1 });
  expect(second.body.id).not.toBe(first.body.id);

  const list = await alice.request('GET', '/api/cases');
  expect(list.status).toBe(200);
  expect(list.body.map((item: { title: string }) => item.title).sort()).toEqual([
    'Poszukiwania Burka',
    'Poszukiwania Luny',
  ]);

  const opened = await alice.open(first.body.id);
  expect(opened.status).toBe(200);
  expect(opened.body.version).toBe(1);
  expect(opened.body.document).toMatchObject({
    schemaVersion: 1,
    case: { id: first.body.id, title: 'Poszukiwania Luny', timeZone: 'Europe/Warsaw' },
    animal: null,
    points: [],
  });
  expect(opened.body.document.case.createdAt).toBe(opened.body.document.case.updatedAt);

  expect((await bob.request('GET', '/api/cases')).body).toEqual([]);
  const path = '/api/cases/' + first.body.id;
  for (const attempt of [
    await bob.open(first.body.id),
    await bob.save(first.body.id, 1, opened.body.document),
    await bob.request('PATCH', path, { body: { title: 'Przejęta' }, version: 1 }),
    await bob.request('DELETE', path, { version: 1 }),
  ])
    expect(attempt).toMatchObject({ status: 404, body: { error: 'not_found' } });
  expect((await alice.open('absent-' + run)).status).toBe(404);

  const renamed = await alice.request('PATCH', path, {
    body: { title: 'Luna — Żoliborz' },
    version: 1,
  });
  expect(renamed).toMatchObject({ status: 200, body: { id: first.body.id, version: 2 } });
  const afterRename = await alice.open(first.body.id);
  expect(afterRename.body.document.case.title).toBe('Luna — Żoliborz');
  expect(afterRename.body.document.case.updatedAt).not.toBe(opened.body.document.case.updatedAt);

  expect((await alice.request('DELETE', path, { version: 2 })).status).toBe(204);
  expect((await alice.open(first.body.id)).status).toBe(404);
  expect(
    (await alice.request('GET', '/api/cases')).body.map((item: { id: string }) => item.id),
  ).toEqual([second.body.id]);
  expect((await alice.open(second.body.id)).status).toBe(200);
});

/** Gaps beyond the complete fixture: sparse profile, edge time/offset forms, detail presence. */
function variantDocument(id: string) {
  const base = fixture('complete');
  const time = (value: object) => value;
  return {
    ...base,
    case: {
      ...base.case,
      id,
      title: 'Kot 🐾 „Łatka” — é',
      createdAt: '2026-10-01T08:00:00.123456789-03:30',
      updatedAt: '2026-10-02T23:59:59Z',
      timeZone: 'America/St_Johns',
      escape: {
        ...base.case.escape,
        occurredAt: time({
          kind: 'range',
          start: null,
          end: '2026-03-29T03:30:00+02:00',
          description: null,
        }),
        escapePointId: 'punkt/ć 1',
        familiarWithLocation: null,
      },
    },
    animal: { name: 'Łatka', neutered: false, age: null, photos: [], photoCaptions: [] },
    points: [
      {
        id: 'punkt/ć 1',
        name: 'Ogród #1',
        coordinates: { latitude: -33.86881998765432, longitude: 151.2092959123456 },
        roles: ['other', 'trail_camera'],
        description: null,
        photos: ['a.jpg', 'b.jpg'],
        entries: [
          {
            id: '00042',
            type: 'action',
            occurredAt: time({
              kind: 'exact',
              at: '2026-10-15T22:00:00.5+14:00',
              description: null,
            }),
            createdAt: '2026-10-15T22:00:00Z',
            updatedAt: '2026-10-15T22:00:00Z',
            description: null,
            status: 'active',
            rejectionReason: null,
            photos: [],
            details: {},
          },
          {
            id: 'akcja: brak',
            type: 'action',
            occurredAt: time({ kind: 'date', date: '2024-02-29', description: null }),
            createdAt: '2026-10-15T22:00:00Z',
            updatedAt: '2026-10-15T22:00:00Z',
            description: null,
            status: 'active',
            rejectionReason: null,
            photos: [],
            details: { kind: null, foodQuantity: null },
          },
          {
            id: 'akcja-null',
            type: 'action',
            occurredAt: time({ kind: 'unknown', description: 'Ktoś mówił, że „w nocy”' }),
            createdAt: '2026-10-15T22:00:00Z',
            updatedAt: '2026-10-15T22:00:00Z',
            description: 'Bez szczegółów',
            status: 'active',
            rejectionReason: null,
            photos: [],
            details: null,
          },
          {
            id: 'obs:1',
            type: 'observation',
            occurredAt: time({
              kind: 'range',
              start: '2026-10-15T23:00:00-01:00',
              end: null,
              description: null,
            }),
            createdAt: '2026-10-15T22:00:00Z',
            updatedAt: '2026-10-15T22:00:00Z',
            description: null,
            status: 'rejected',
            rejectionReason: 'To był inny kot',
            photos: [],
            source: null,
            sourceDescription: null,
            uncertaintyRadiusMeters: 0.25,
            identification: 'uncertain',
          },
          {
            id: 'kontrola-1',
            type: 'check',
            occurredAt: time({
              kind: 'approximate',
              at: '2026-10-16T00:00:00+00:00',
              description: null,
            }),
            createdAt: '2026-10-15T22:00:00Z',
            updatedAt: '2026-10-15T22:00:00Z',
            description: null,
            status: 'active',
            rejectionReason: null,
            photos: [],
            result: 'animal_seen',
            observationEntryId: 'obs:1',
            method: null,
            details: { foodStatus: null },
          },
          {
            id: 'kontrola-2',
            type: 'check',
            occurredAt: time({ kind: 'unknown', description: null }),
            createdAt: '2026-10-15T22:00:00Z',
            updatedAt: '2026-10-15T22:00:00Z',
            description: null,
            status: 'active',
            rejectionReason: null,
            photos: [],
            result: null,
            observationEntryId: null,
            method: 'Latarka',
            details: {},
          },
        ],
      },
    ],
    areas: [
      {
        id: 'obszar-wklęsły',
        name: 'Wklęsły',
        description: null,
        photos: [],
        // Concave, clockwise and geographically asymmetric: swapped axes would move it far away.
        plannedGeometry: {
          type: 'polygon',
          vertices: [
            { latitude: 54.35, longitude: 18.64 },
            { latitude: 54.36, longitude: 18.66 },
            { latitude: 54.352, longitude: 18.651 },
            { latitude: 54.34, longitude: 18.67 },
          ],
        },
        checks: [
          {
            id: 'przeszukanie-1',
            occurredAt: time({ kind: 'date', date: '2026-10-17', description: 'Rano' }),
            createdAt: '2026-10-17T06:00:00Z',
            updatedAt: '2026-10-17T06:00:00Z',
            description: null,
            photos: ['c.jpg'],
            result: 'no_animal_or_signs',
            observationEntryId: null,
            method: null,
            actualGeometry: {
              type: 'circle',
              center: { latitude: 54.3512345678912, longitude: 18.6498765432198 },
              radiusMeters: 123.456789012,
            },
          },
        ],
      },
    ],
    assets: [
      {
        filename: 'a.jpg',
        originalName: null,
        mediaType: null,
        sizeBytes: 0,
        widthPixels: null,
        heightPixels: null,
        thumbnailFilename: null,
        previewFilename: null,
      },
      {
        filename: 'huge.heic',
        originalName: 'Ogromne zdjęcie.HEIC',
        mediaType: 'image/heic',
        sizeBytes: 9_007_199_254_740_991,
        widthPixels: 3_000_000_000,
        heightPixels: 1,
        thumbnailFilename: 'huge.thumb.webp',
        previewFilename: 'huge.preview.jpg',
      },
    ],
    mapView: { center: { latitude: -33.8688, longitude: 151.2093 }, zoom: 21.5, basemap: 'osm' },
  };
}

it.each([
  ['complete', (id: string) => asCase(id, fixture('complete'))],
  ['minimal', (id: string) => asCase(id, fixture('minimal'))],
  ['variant', variantDocument],
])('reconstructs every v1 field of the %s document from relational rows', async (_, build) => {
  const alice = await owner('fidelity');
  const created = await alice.create('Przed zapisem');
  const document = build(created.body.id);
  const saved = await alice.save(created.body.id, 1, document);
  expect(saved).toMatchObject({ status: 200, body: { id: created.body.id, version: 2 } });
  const reopened = await alice.open(created.body.id);
  expect(reopened.status).toBe(200);
  expect(reopened.body.version).toBe(2);
  expect(reopened.body.document).toStrictEqual(document);
  expect(reopened.response.headers.get('etag')).toBe('"2"');
});

it('scopes imported identifiers to each case and rejects broken or cross-case references', async () => {
  const alice = await owner('scope');
  const bob = await owner('scope-other');
  const first = (await alice.create('Pierwsza')).body.id;
  const second = (await alice.create('Druga')).body.id;
  const foreign = (await bob.create('Obca')).body.id;
  for (const [client, id] of [
    [alice, first],
    [alice, second],
    [bob, foreign],
  ] as const)
    expect((await client.save(id, 1, asCase(id, fixture('complete')))).status).toBe(200);
  const renamed = asCase(second, fixture('complete'));
  renamed.points[1].name = 'Tylko w drugiej sprawie';
  expect((await alice.save(second, 2, renamed)).status).toBe(200);
  expect((await alice.open(first)).body.document).toStrictEqual(asCase(first, fixture('complete')));
  expect((await bob.open(foreign)).body.document.points[1].name).not.toBe(
    'Tylko w drugiej sprawie',
  );

  const broken = asCase(first, fixture('complete'));
  broken.areas[0].checks[0].observationEntryId = 'observation-missing';
  const escape = asCase(first, fixture('complete'));
  escape.case.escape.escapePointId = 'point-elsewhere';
  const duplicate = asCase(first, fixture('complete'));
  duplicate.areas[0].id = 'point-home';
  const nonObservation = asCase(first, fixture('complete'));
  nonObservation.areas[0].checks[0].observationEntryId = 'action-food';
  for (const candidate of [broken, escape, duplicate, nonObservation]) {
    const rejected = await alice.save(first, 2, candidate);
    expect(rejected).toMatchObject({ status: 400, body: { error: 'invalid_case' } });
  }
  expect((await alice.save(first, 2, asCase(second, fixture('complete')))).body.error).toBe(
    'case_id_mismatch',
  );
  expect((await alice.open(first)).body).toMatchObject({ version: 2 });
});

it('stores positions as SRID 4326 longitude/latitude and keeps circles and open rings exact', async () => {
  const alice = await owner('spatial');
  const id = (await alice.create('Przestrzeń')).body.id;
  const document = variantDocument(id);
  expect((await alice.save(id, 1, document)).status).toBe(200);
  const { Client } = await import('pg');
  const sql = new Client({ connectionString: DATABASE_URL });
  await sql.connect();
  try {
    // Schema evidence only: the behavior itself is asserted through the HTTP round trip.
    const { rows } = await sql.query(
      `SELECT ST_SRID(location) AS srid, ST_X(location) AS x, ST_Y(location) AS y FROM point WHERE case_id = $1
       UNION ALL SELECT ST_SRID(planned_vertices), ST_NPoints(planned_vertices), ST_Y(ST_StartPoint(ST_ExteriorRing(planned_vertices)))
       FROM search_area WHERE case_id = $1`,
      [id],
    );
    expect(rows).toEqual([
      { srid: 4326, x: 151.2092959123456, y: -33.86881998765432 },
      { srid: 4326, x: 5, y: 54.35 },
    ]);
  } finally {
    await sql.end();
  }
  const reopened = (await alice.open(id)).body.document;
  expect(reopened.areas[0].plannedGeometry.vertices).toHaveLength(4);
  expect(reopened.areas[0].checks[0].actualGeometry).toStrictEqual(
    document.areas[0].checks[0].actualGeometry,
  );
  const replanned = structuredClone(document);
  replanned.areas[0].plannedGeometry = {
    type: 'circle',
    center: { latitude: 1, longitude: 2 },
    radiusMeters: 3,
  };
  expect((await alice.save(id, 2, replanned)).status).toBe(200);
  expect((await alice.open(id)).body.document.areas[0].checks[0].actualGeometry).toStrictEqual(
    document.areas[0].checks[0].actualGeometry,
  );
});

it('refuses cross-case references at the database even if a write bypassed the validator', async () => {
  const alice = await owner('constraints');
  const source = (await alice.create('Źródło')).body.id;
  const target = (await alice.create('Cel')).body.id;
  expect((await alice.save(source, 1, variantDocument(source))).status).toBe(200);
  expect((await alice.save(target, 1, asCase(target, fixture('complete')))).status).toBe(200);
  const { Client } = await import('pg');
  const sql = new Client({ connectionString: DATABASE_URL });
  await sql.connect();
  try {
    // Backstop evidence: these IDs exist only in the other case, so only the composite keys stop them.
    await expect(
      sql.query(`UPDATE case_escape SET escape_point_id = 'punkt/ć 1' WHERE case_id = $1`, [
        target,
      ]),
    ).rejects.toMatchObject({ code: '23503', constraint: 'case_escape_point_fk' });
    await expect(
      sql.query(
        `UPDATE area_check SET observation_entry_id = 'obs:1' WHERE case_id = $1 AND id = 'area-check-park'`,
        [target],
      ),
    ).rejects.toMatchObject({ code: '23503', constraint: 'area_check_observation_fk' });
    await expect(
      sql.query(
        `UPDATE area_check SET observation_entry_id = 'action-food' WHERE case_id = $1 AND id = 'area-check-park'`,
        [target],
      ),
    ).rejects.toMatchObject({ code: '23503', constraint: 'area_check_observation_fk' });
  } finally {
    await sql.end();
  }
  expect((await alice.open(target)).body.document).toStrictEqual(
    asCase(target, fixture('complete')),
  );
});

it('rejects text the relational store would alter through the case contract', async () => {
  const alice = await owner('text');
  const id = (await alice.create('Tekst')).body.id;
  for (const title of ['Zero\u0000bajt', 'Połowa\ud83d znaku']) {
    const candidate = asCase(id, fixture('minimal'));
    candidate.case.title = title;
    expect(await alice.save(id, 1, candidate)).toMatchObject({
      status: 400,
      body: { error: 'invalid_case', issues: [{ path: ['case', 'title'] }] },
    });
  }
  const emoji = asCase(id, fixture('minimal'));
  emoji.case.title = 'Para zastępcza 🐾';
  expect((await alice.save(id, 1, emoji)).status).toBe(200);
  expect((await alice.open(id)).body).toMatchObject({ version: 2, document: emoji });
});

it('rejects stale save, rename and delete atomically and lets exactly one concurrent writer win', async () => {
  const alice = await owner('versions');
  const id = (await alice.create('Wersje')).body.id;
  const path = '/api/cases/' + id;
  const document = asCase(id, fixture('complete'));
  expect((await alice.save(id, 1, document)).body.version).toBe(2);
  const stale = { ...document, case: { ...document.case, title: 'Nieaktualna' } };
  for (const attempt of [
    await alice.save(id, 1, stale),
    await alice.request('PATCH', path, { body: { title: 'Nieaktualna' }, version: 1 }),
    await alice.request('DELETE', path, { version: 1 }),
  ])
    expect(attempt).toMatchObject({ status: 412, body: { error: 'version_conflict', version: 2 } });
  expect((await alice.request('PUT', path, { body: { document } })).status).toBe(428);
  expect(
    (await alice.request('PUT', path, { body: { document }, version: 2, key: null })).status,
  ).toBe(400);

  const racing = await Promise.all(
    ['A', 'B', 'C'].map((suffix) =>
      alice.save(id, 2, { ...document, case: { ...document.case, title: 'Wyścig ' + suffix } }),
    ),
  );
  expect(racing.map((attempt) => attempt.status).sort()).toEqual([200, 412, 412]);
  const winner = racing.find((attempt) => attempt.status === 200);
  const reopened = await alice.open(id);
  expect(reopened.body.version).toBe(3);
  expect(winner?.body.version).toBe(3);
  expect(reopened.body.document.points).toStrictEqual(document.points);
  expect(reopened.body.document.case.title).toMatch(/^Wyścig [ABC]$/u);
});

it('replays a committed mutation whose acknowledgement was lost without duplicating or bypassing versions', async () => {
  const alice = await owner('replay');
  const createKey = randomUUID();
  const [created, duplicate] = await Promise.all([
    alice.create('Jedna sprawa', createKey),
    alice.create('Jedna sprawa', createKey),
  ]);
  expect(created.status).toBe(201);
  expect(duplicate.body).toStrictEqual(created.body);
  expect((await alice.create('Jedna sprawa', createKey)).body).toStrictEqual(created.body);
  expect((await alice.request('GET', '/api/cases')).body).toHaveLength(1);

  const id = created.body.id;
  const document = asCase(id, fixture('complete'));
  const saveKey = randomUUID();
  const saved = await alice.save(id, 1, document, saveKey);
  const newer = { ...document, case: { ...document.case, title: 'Nowsza wersja' } };
  expect((await alice.save(id, 2, newer)).body.version).toBe(3);
  // The client never saw `saved`: the retry returns its acknowledgement, not an overwrite.
  expect(await alice.save(id, 1, document, saveKey)).toMatchObject({
    status: 200,
    body: saved.body,
  });
  expect((await alice.open(id)).body).toMatchObject({ version: 3, document: newer });
  expect((await alice.save(id, 3, document, saveKey)).body.error).toBe('idempotency_key_reused');

  const deleteKey = randomUUID();
  const path = '/api/cases/' + id;
  expect((await alice.request('DELETE', path, { version: 3, key: deleteKey })).status).toBe(204);
  expect((await alice.request('DELETE', path, { version: 3, key: deleteKey })).status).toBe(204);
  expect((await alice.open(id)).status).toBe(404);
  const bob = await owner('replay-other');
  expect((await bob.create('Jedna sprawa', createKey)).body.id).not.toBe(id);
});

it('keeps the previous complete case when the database fails after part of the mapping work', async () => {
  const alice = await owner('rollback');
  const id = (await alice.create('Wycofanie')).body.id;
  const document = asCase(id, fixture('complete'));
  expect((await alice.save(id, 1, document)).status).toBe(200);
  const { Client } = await import('pg');
  const sql = new Client({ connectionString: DATABASE_URL });
  await sql.connect();
  const trigger = `fail_${run.replace(/-/gu, '')}`;
  try {
    // Fault injection: photo metadata is written last, after every other relational table.
    await sql.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.filename = 'inject-${run}.jpg' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$`);
    await sql.query(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON photo_asset FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
    );
    const candidate = structuredClone(variantDocument(id));
    candidate.assets.push({ ...candidate.assets[0], filename: `inject-${run}.jpg` });
    expect((await alice.save(id, 2, candidate)).status).toBe(500);
  } finally {
    await sql.query(`DROP TRIGGER IF EXISTS ${trigger} ON photo_asset`);
    await sql.query(`DROP FUNCTION IF EXISTS ${trigger}()`);
    await sql.end();
  }
  expect((await alice.open(id)).body).toMatchObject({ version: 2 });
  expect((await alice.open(id)).body.document).toStrictEqual(document);
  expect((await alice.save(id, 2, variantDocument(id))).body.version).toBe(3);
});

it('preserves cases and applied migrations across application recreation with the retained database', async () => {
  const alice = await owner('restart');
  const id = (await alice.create('Po restarcie')).body.id;
  const document = asCase(id, fixture('complete'));
  expect((await alice.save(id, 1, document)).status).toBe(200);
  await app.close();
  await start();
  const again = await owner('restart');
  expect((await again.open(id)).body).toMatchObject({ version: 2, document });
});

it.each([
  ['complete', (id: string) => asCase(id, fixture('complete'))],
  ['variant', variantDocument],
])(
  'deletes and replaces a %s case whose rows hold every non-cascading reference',
  async (_, build) => {
    const alice = await owner('removal');
    const id = (await alice.create('Do usunięcia')).body.id;
    const path = '/api/cases/' + id;
    expect((await alice.save(id, 1, build(id))).status).toBe(200);
    // Replacing a linked document walks the same foreign keys as deleting it.
    expect((await alice.save(id, 2, build(id))).status).toBe(200);
    expect(await alice.request('DELETE', path, { version: 3 })).toMatchObject({ status: 204 });
    expect((await alice.open(id)).status).toBe(404);
    expect(
      (await alice.request('GET', '/api/cases')).body.map((c: { id: string }) => c.id),
    ).not.toContain(id);
  },
);

it('deletes a case when an observation precedes the check and area search linking it', async () => {
  const alice = await owner('removal-links');
  const id = (await alice.create('Powiązania')).body.id;
  const document = variantDocument(id);
  document.areas[0].checks[0].result = 'animal_seen';
  document.areas[0].checks[0].observationEntryId = 'obs:1';
  document.animal = {
    photos: ['a.jpg'],
    mainPhoto: 'a.jpg',
    photoCaptions: [{ filename: 'a.jpg', caption: 'Pierwsze' }],
  };
  expect((await alice.save(id, 1, document)).status).toBe(200);
  expect((await alice.request('DELETE', '/api/cases/' + id, { version: 2 })).status).toBe(204);
  expect((await alice.open(id)).status).toBe(404);
});

it('answers an unstorable case identifier like any other absent case on every route', async () => {
  const alice = await owner('identifier');
  const path = '/api/cases/%00';
  const absent = { status: 404, body: { error: 'not_found' } };
  expect(await alice.request('GET', path)).toMatchObject(absent);
  expect(
    await alice.request('PUT', path, { body: { document: fixture('minimal') }, version: 1 }),
  ).toMatchObject(absent);
  expect(await alice.request('PATCH', path, { body: { title: 'Nie' }, version: 1 })).toMatchObject(
    absent,
  );
  expect(await alice.request('DELETE', path, { version: 1 })).toMatchObject(absent);
  expect(await alice.request('GET', '/api/cases/a%00b')).toMatchObject(absent);
});

it('allows large case documents only on the case routes', async () => {
  const alice = await owner('body-limit');
  const id = (await alice.create('Duży dokument')).body.id;
  const large = asCase(id, fixture('minimal'));
  large.case.escape.description = 'x'.repeat(200_000);
  expect((await alice.save(id, 1, large)).status).toBe(200);
  expect((await alice.open(id)).body.document.case.escape.description).toHaveLength(200_000);
  const oversized = asCase(id, fixture('minimal'));
  oversized.case.escape.description = 'x'.repeat(10 * 1024 * 1024 + 1);
  expect((await alice.save(id, 2, oversized)).status).toBe(413);
  // Authentication routes keep the 100 kB default, and rejection precedes any session work.
  const outside = await fetch(base + '/api/auth/logout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ padding: 'x'.repeat(200_000) }),
  });
  expect(outside.status).toBe(413);
});
