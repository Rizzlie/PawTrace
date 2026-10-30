import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { promises, readFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import type { CaseDocument } from '@pawtrace/case-domain';
import { assetsPath, ORIGIN, type ApiClient } from '../tests/case-client';
import { startPhotoApplication, withDatabase } from '../tests/photo-application';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename), rm: vi.fn(actual.rm) };
});
const { rename: actualRename, rm: actualRm } = promises;

const digest = (bytes: ArrayBuffer | Uint8Array) =>
  createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
const fixture = (name: string) => readFile(join(import.meta.dirname, '../tests/fixtures', name));
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);

let harness: Awaited<ReturnType<typeof startPhotoApplication>>;
beforeAll(async () => {
  harness = await startPhotoApplication('pawtrace-case-photos-');
});
afterAll(() => harness.stop());

const completeDocument = (): CaseDocument => {
  const { exportedAt, ...document } = JSON.parse(
    readFileSync(
      join(
        import.meta.dirname,
        '../../../libs/shared/case-domain/src/fixtures/complete-case-v1.json',
      ),
      'utf8',
    ),
  );
  void exportedAt;
  return document;
};

/** Uploads and commits one profile photo; returns its case-scoped filename. */
async function attachedPhoto(client: ApiClient, caseId: string, bytes: Uint8Array) {
  const { filename } = (await client.upload(caseId, bytes)).body;
  const { body } = await client.open(caseId);
  const document = { ...body.document, animal: { photos: [filename] } };
  expect((await client.save(caseId, body.version, document)).status).toBe(200);
  return filename as string;
}

async function expectOriginal(
  client: ApiClient,
  caseId: string,
  filename: string,
  bytes: Uint8Array,
) {
  const original = await client.fetch('GET', `${assetsPath(caseId)}/${filename}`);
  expect(original.status).toBe(200);
  expect(digest(await original.arrayBuffer())).toBe(digest(bytes));
}

const rowsOf = (caseId: string) =>
  withDatabase(async (pool) =>
    (await pool.query('SELECT filename FROM stored_photo WHERE case_id = $1', [caseId])).rows.map(
      (row) => row.filename as string,
    ),
  );
const storageDirectories = (caseId: string) =>
  withDatabase(async (pool) =>
    (await pool.query('SELECT storage_id FROM stored_photo WHERE case_id = $1', [caseId])).rows.map(
      (row) => row.storage_id as string,
    ),
  );

/** Trigger faults as in P02: the failure happens inside the real statement. */
const failInsertsInto = (table: string, name: string, caseId: string) =>
  withDatabase(async (pool) => {
    await pool.query(`CREATE OR REPLACE FUNCTION ${name}() RETURNS trigger AS $$
      BEGIN
        IF NEW.case_id = '${caseId}' THEN RAISE EXCEPTION 'injected failure'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER ${name} BEFORE INSERT ON ${table}
      FOR EACH ROW EXECUTE FUNCTION ${name}()`);
  });
const dropFault = (table: string, name: string) =>
  withDatabase(async (pool) => {
    await pool.query(`DROP TRIGGER ${name} ON ${table}`);
    await pool.query(`DROP FUNCTION ${name}`);
  });
const failRegistration = (caseId: string) =>
  failInsertsInto('stored_photo', 'p03_fail_registration', caseId);
const allowRegistration = () => dropFault('stored_photo', 'p03_fail_registration');
const failAttachment = (caseId: string) =>
  failInsertsInto('photo_reference', 'p03_fail_attachment', caseId);
const allowAttachment = () => dropFault('photo_reference', 'p03_fail_attachment');

const routes = (caseId: string, filename: string) => {
  const asset = `${assetsPath(caseId)}/${filename}`;
  return [
    ['GET', asset],
    ['GET', `${asset}/metadata`],
    ['GET', `${asset}/thumbnail`],
    ['GET', `${asset}/preview`],
    ['POST', `${asset}/retry`],
  ] as const;
};

it('gives only the case owner every asset route; anonymous, foreign and stale URLs learn nothing', async () => {
  const alice = await harness.owner('alice');
  const bob = await harness.owner('bob');
  const bytes = await fixture('photo.jpg');
  const uploaded = await alice.client.upload(alice.caseId, bytes, 'kot.jpg', 'image/jpeg');
  expect(uploaded.status).toBe(201);
  const { filename } = uploaded.body;

  const original = await alice.client.fetch('GET', `${assetsPath(alice.caseId)}/${filename}`);
  expect(original.status).toBe(200);
  expect(digest(await original.arrayBuffer())).toBe(digest(bytes));
  expect(
    await alice.client.request('GET', `${assetsPath(alice.caseId)}/${filename}/metadata`),
  ).toMatchObject({ status: 200, body: { filename, originalName: 'kot.jpg' } });

  for (const [method, path] of routes(alice.caseId, filename)) {
    // No session at all.
    expect((await fetch(harness.base + path, { method })).status).toBe(401);
    // Another owner addressing the real case, and their own case with the guessed filename.
    for (const attempt of [path, path.replace(alice.caseId, bob.caseId)]) {
      const denied = await bob.client.fetch(method, attempt);
      expect(denied.status).toBe(404);
      expect(await denied.json()).toEqual({ error: 'not_found' });
    }
  }
  const absent = await bob.client.fetch('GET', `${assetsPath(bob.caseId)}/absent.png`);
  expect(await absent.json()).toEqual({ error: 'not_found' });

  // A foreign owner cannot add a file to the case, even before any body is read.
  const smuggled = await bob.client.upload(alice.caseId, png);
  expect(smuggled).toMatchObject({ status: 404, body: { error: 'not_found' } });
  expect(await bob.client.upload('missing-case', png)).toMatchObject({ status: 404 });
  const anonymous = new FormData();
  anonymous.append('file', new Blob([png]), 'kot.png');
  expect(
    (await fetch(harness.base + assetsPath(alice.caseId), { method: 'POST', body: anonymous }))
      .status,
  ).toBe(401);

  // The MVP's ownerless URLs stay closed, for the owner too.
  for (const path of [`/api/assets/${filename}`, `/api/assets/${filename}/metadata`]) {
    expect((await fetch(harness.base + path)).status).toBe(401);
    expect((await alice.client.fetch('GET', path)).status).toBe(404);
  }
  expect((await alice.client.upload(alice.caseId, png)).status).toBe(201);
});

it('keeps equal logical filenames in separate cases apart and never binds a JSON reference to a foreign original', async () => {
  const alice = await harness.owner('alice-names');
  const bob = await harness.owner('bob-names');
  const second = await alice.client.create('Druga sprawa');
  const aliceBytes = await fixture('photo.jpg');
  const bobBytes = await fixture('photo.webp');
  const shared = (await alice.client.upload(alice.caseId, aliceBytes, 'a.jpg', 'image/jpeg')).body
    .filename;
  const bobPhoto = (await bob.client.upload(bob.caseId, bobBytes, 'b.webp', 'image/webp')).body;

  // An identical name arriving by import (P08): the same logical filename in another case.
  await withDatabase((pool) =>
    pool.query('UPDATE stored_photo SET filename = $1 WHERE case_id = $2 AND filename = $3', [
      shared,
      bob.caseId,
      bobPhoto.filename,
    ]),
  );
  const read = async (client: ApiClient, caseId: string) =>
    digest(await (await client.fetch('GET', `${assetsPath(caseId)}/${shared}`)).arrayBuffer());
  expect(await read(alice.client, alice.caseId)).toBe(digest(aliceBytes));
  expect(await read(bob.client, bob.caseId)).toBe(digest(bobBytes));

  // An import-style reference with metadata claims the name, in another case of the same owner
  // and in another owner's case.
  for (const [client, caseId] of [
    [alice.client, second.body.id],
    [bob.client, (await bob.client.create('Import')).body.id],
  ] as const) {
    const { body } = await client.open(caseId);
    const claimed = {
      ...body.document,
      animal: { photos: [shared, 'unavailable-original.jpg'], mainPhoto: shared },
      assets: [
        {
          filename: shared,
          originalName: 'przejete.jpg',
          mediaType: 'image/jpeg',
          sizeBytes: aliceBytes.length,
          widthPixels: 1,
          heightPixels: 1,
          thumbnailFilename: null,
          previewFilename: null,
        },
      ],
    };
    expect((await client.save(caseId, body.version, claimed)).status).toBe(200);
    expect((await client.open(caseId)).body.document.animal.photos).toContain(shared);
    for (const [method, path] of routes(caseId, shared))
      expect((await client.fetch(method, path)).status).toBe(404);
  }
  expect(await read(alice.client, alice.caseId)).toBe(digest(aliceBytes));
});

it('attaches an uploaded photo in every supported location and reopens each with its exact bytes', async () => {
  const { client, caseId } = await harness.owner('carol');
  const opened = await client.open(caseId);
  const fixtureDocument = completeDocument();
  const document: CaseDocument = {
    ...fixtureDocument,
    case: { ...fixtureDocument.case, id: caseId },
  };
  const bytes = (label: string) => Buffer.concat([png, Buffer.from(label)]);
  const entry = (type: string) => {
    const found = document.points.flatMap((point) => point.entries).find((e) => e.type === type);
    if (!found) throw new Error('Fixture lacks ' + type);
    return found;
  };
  const locations: Record<string, (filename: string) => void> = {
    profile: (filename) => {
      document.animal = {
        ...document.animal,
        photos: [filename],
        mainPhoto: filename,
        photoCaptions: [{ filename, caption: 'Główne' }],
      };
    },
    point: (filename) => {
      document.points[0].photos = [filename];
    },
    area: (filename) => {
      document.areas[0].photos = [filename];
    },
    areaCheck: (filename) => {
      document.areas[0].checks[0].photos = [filename];
    },
    ...Object.fromEntries(
      ['observation', 'action', 'check', 'note'].map((type) => [
        type,
        (filename: string) => {
          entry(type).photos = [filename];
        },
      ]),
    ),
  };
  const filenames: Record<string, string> = {};
  for (const [location, attach] of Object.entries(locations)) {
    const { status, body } = await client.upload(caseId, bytes(location), location + '.png');
    expect(status).toBe(201);
    filenames[location] = body.filename;
    attach(body.filename);
  }
  expect((await client.save(caseId, opened.body.version, document)).status).toBe(200);

  await harness.restart();
  const reopened = await client.open(caseId);
  expect(reopened.body.document).toStrictEqual(document);
  for (const [location, filename] of Object.entries(filenames)) {
    await expectOriginal(client, caseId, filename, bytes(location));
    const original = await client.fetch('GET', `${assetsPath(caseId)}/${filename}`);
    expect(original.headers.get('content-disposition')).toContain('attachment');
  }
});

describe('injected failures', () => {
  afterEach(() => {
    vi.mocked(rename).mockReset();
    vi.mocked(rm).mockReset();
    vi.mocked(rename).mockImplementation(actualRename);
    vi.mocked(rm).mockImplementation(actualRm);
  });

  const staged = () => readdir(join(harness.directory, 'staging')).catch(() => []);
  // The processing queue runs concurrently, so faults target paths instead of call order.
  const failPublication = () =>
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (String(from).includes('staging') && String(to).includes('objects'))
        throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' });
      return actualRename(from, to);
    });
  const failRemoval = (fragment: string, code: string) =>
    vi.mocked(rm).mockImplementation(async (path, options) => {
      if (String(path).includes(fragment))
        throw Object.assign(new Error('Removal failed'), { code });
      return actualRm(path, options);
    });

  it('reports a failed disk publication, leaves committed photos readable and retries cleanly', async () => {
    const { client, caseId } = await harness.owner('dave');
    const committed = await attachedPhoto(client, caseId, png);
    failPublication();
    const failed = await client.upload(caseId, Buffer.concat([png, Buffer.from('new')]));
    expect(failed).toMatchObject({
      status: 507,
      body: { error: 'original_storage_failed', systemCode: 'ENOSPC', retryable: true },
    });
    vi.mocked(rename).mockImplementation(actualRename);
    expect(await staged()).toEqual([]);
    expect(await rowsOf(caseId)).toEqual([committed]);
    await expectOriginal(client, caseId, committed, png);
    expect((await client.upload(caseId, png)).status).toBe(201);
  });

  it('preserves the primary storage error when cleanup also fails', async () => {
    const { client, caseId } = await harness.owner('dave-cleanup');
    failPublication();
    failRemoval('staging', 'EROFS');
    expect(await client.upload(caseId, png)).toMatchObject({
      status: 507,
      body: { error: 'original_storage_failed', systemCode: 'ENOSPC', retryable: true },
    });
    expect(await rowsOf(caseId)).toEqual([]);
    vi.mocked(rename).mockImplementation(actualRename);
    vi.mocked(rm).mockImplementation(actualRm);
    expect((await client.upload(caseId, png)).status).toBe(201);
    // The failed cleanup left its directory; the next start would clear it.
    await actualRm(join(harness.directory, 'staging'), { recursive: true });
  });

  it('reports a failed metadata commit without publishing the file, then accepts a retry', async () => {
    const { client, caseId } = await harness.owner('erin');
    const committed = await attachedPhoto(client, caseId, png);
    await failRegistration(caseId);
    try {
      const failed = await client.upload(caseId, Buffer.concat([png, Buffer.from('new')]));
      expect(failed).toMatchObject({
        status: 503,
        body: { error: 'photo_publication_failed', retryable: true },
      });
      expect(await staged()).toEqual([]);
      expect(await rowsOf(caseId)).toEqual([committed]);
    } finally {
      await allowRegistration();
    }
    await expectOriginal(client, caseId, committed, png);
    expect((await client.upload(caseId, png)).status).toBe(201);
  });

  it('keeps the previous case and its originals when the attachment commit fails', async () => {
    const { client, caseId } = await harness.owner('frank');
    const committed = await attachedPhoto(client, caseId, png);
    const candidate = (await client.upload(caseId, Buffer.concat([png, Buffer.from('c')]))).body;
    const { body } = await client.open(caseId);
    await failAttachment(caseId);
    try {
      const replaced = { ...body.document, animal: { photos: [candidate.filename] } };
      expect((await client.save(caseId, body.version, replaced)).status).toBe(500);
    } finally {
      await allowAttachment();
    }
    const after = await client.open(caseId);
    expect(after.body.version).toBe(body.version);
    expect(after.body.document.animal.photos).toEqual([committed]);
    await expectOriginal(client, caseId, committed, png);
  });

  it('never exposes or keeps a staged upload across a restart', async () => {
    const { client, caseId } = await harness.owner('grace');
    const leftover = join(harness.directory, 'staging', 'interrupted');
    await mkdir(leftover, { recursive: true });
    await writeFile(join(leftover, 'original'), png);
    expect((await fetch(`${harness.base}/staging/interrupted/original`)).ok).toBe(false);
    expect((await client.fetch('GET', `${assetsPath(caseId)}/original`)).status).toBe(404);
    await harness.restart();
    expect(await staged()).toEqual([]);
    expect((await client.upload(caseId, png)).status).toBe(201);
  });

  it('removes the originals of a deleted case, retries a failed removal after restart and keeps other cases', async () => {
    const { client, caseId } = await harness.owner('heidi');
    const other = (await client.create('Inna sprawa')).body.id as string;
    const kept = await attachedPhoto(client, other, png);
    const removed = await attachedPhoto(client, caseId, png);
    const unattached = (await client.upload(caseId, png)).body.filename;
    const directories = await storageDirectories(caseId);
    expect(directories).toHaveLength(2);
    const { body } = await client.open(caseId);

    failRemoval(directories[0], 'EBUSY');
    const deleted = await client.request('DELETE', `/api/cases/${caseId}`, {
      version: body.version,
    });
    expect(deleted.status).toBe(204);
    for (const filename of [removed, unattached])
      expect((await client.fetch('GET', `${assetsPath(caseId)}/${filename}`)).status).toBe(404);
    const objects = () => readdir(join(harness.directory, 'objects'));
    expect((await objects()).filter((id) => directories.includes(id))).toHaveLength(2);

    vi.mocked(rm).mockImplementation(actualRm);
    await harness.restart();
    expect((await objects()).filter((id) => directories.includes(id))).toEqual([]);
    await expectOriginal(client, other, kept, png);
  });

  it('leaves published originals alone when the database does not know them', async () => {
    const stray = join(harness.directory, 'objects', randomUUID());
    await mkdir(stray, { recursive: true });
    await writeFile(join(stray, 'original'), png);
    await harness.restart();
    expect(await readFile(join(stray, 'original'))).toEqual(png);
    await actualRm(stray, { recursive: true });
  });
});

it('keeps unlinked and cancelled uploads readable until the case itself is deleted', async () => {
  const { client, caseId } = await harness.owner('ivan');
  const unlinked = await attachedPhoto(client, caseId, png);
  const cancelled = (await client.upload(caseId, Buffer.concat([png, Buffer.from('c')]))).body
    .filename;
  const { body } = await client.open(caseId);
  const empty = { ...body.document, animal: { photos: [] } };
  expect((await client.save(caseId, body.version, empty)).status).toBe(200);
  await expectOriginal(client, caseId, unlinked, png);
  expect((await client.fetch('GET', `${assetsPath(caseId)}/${cancelled}`)).status).toBe(200);

  // Reattaching an older reference restores the link without another upload.
  const current = await client.open(caseId);
  expect((await client.save(caseId, current.body.version, body.document)).status).toBe(200);
  await expectOriginal(client, caseId, unlinked, png);
});

it('ends photo access with the session: a stale photo URL does not outlive logout', async () => {
  const { client, caseId } = await harness.owner('judy');
  const filename = await attachedPhoto(client, caseId, png);
  const path = `${assetsPath(caseId)}/${filename}`;
  expect((await client.fetch('GET', path)).status).toBe(200);
  expect((await client.request('POST', '/api/auth/logout')).status).toBeLessThan(300);
  expect((await client.fetch('GET', path)).status).toBe(401);
});

it('refuses an upload whose case is deleted while its body is still arriving', async () => {
  const { client, caseId } = await harness.owner('kim');
  const before = await readdir(join(harness.directory, 'objects'));
  const { body: opened } = await client.open(caseId);
  const pending = request(harness.base + assetsPath(caseId), {
    method: 'POST',
    headers: {
      cookie: client.cookieHeader(),
      origin: ORIGIN,
      'x-xsrf-token': client.csrfToken(),
      'content-type': 'multipart/form-data; boundary=photo',
    },
  });
  const finished = new Promise<number | undefined>((resolve, reject) => {
    pending.once('response', (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    pending.once('error', reject);
  });
  pending.write(
    '--photo\r\nContent-Disposition: form-data; name="file"; filename="kot.png"\r\nContent-Type: image/png\r\n\r\n',
  );
  pending.write(png);
  // The ownership check at the start has passed and the file is streaming into staging.
  await vi.waitFor(async () => {
    expect(await readdir(join(harness.directory, 'staging'))).toHaveLength(1);
  });
  expect(
    (await client.request('DELETE', `/api/cases/${caseId}`, { version: opened.version })).status,
  ).toBe(204);
  pending.end('\r\n--photo--\r\n');
  expect(await finished).toBe(404);
  expect(await rowsOf(caseId)).toEqual([]);
  expect(await readdir(join(harness.directory, 'objects'))).toEqual(before);
  expect(await readdir(join(harness.directory, 'staging'))).toEqual([]);
});
