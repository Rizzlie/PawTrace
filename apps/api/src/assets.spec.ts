import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { request } from 'node:http';
import { join } from 'node:path';
import { assetsPath, ORIGIN, type ApiClient } from '../tests/case-client';
import { startPhotoApplication } from '../tests/photo-application';

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

// A real, one-pixel PNG; decoding is deliberately outside the F11 contract.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);

describe('original photo storage over HTTP', () => {
  let harness: Awaited<ReturnType<typeof startPhotoApplication>>;
  let client: ApiClient;
  let caseId: string;
  let base: string;

  beforeAll(async () => {
    harness = await startPhotoApplication('pawtrace-assets-');
    ({ client, caseId } = await harness.owner('storage'));
    base = assetsPath(caseId);
  });
  afterAll(() => harness.stop());

  const upload = (bytes = png, name = 'kot.png', type = 'image/png') =>
    client.upload(caseId, bytes, name, type);
  const download = async (filename: string) =>
    Buffer.from(await (await client.fetch('GET', `${base}/${filename}`)).arrayBuffer());
  const metadata = async (filename: string) =>
    (await client.fetch('GET', `${base}/${filename}/metadata`)).json();
  const staged = () => readdir(join(harness.directory, 'staging')).catch(() => []);
  /** The storage key behind a filename, used only to inject filesystem faults. */
  const storageIds = () => readdir(join(harness.directory, 'objects'));

  it('publishes a stored original and downloads the exact received bytes', async () => {
    const { status, body: asset } = await upload();
    expect(status).toBe(201);
    expect(asset).toMatchObject({
      originalName: 'kot.png',
      mediaType: 'image/png',
      sizeBytes: png.length,
      widthPixels: null,
      heightPixels: null,
      thumbnailFilename: null,
      previewFilename: null,
      processing: { thumbnail: { status: 'pending' }, preview: { status: 'not_required' } },
    });
    expect(asset.filename).toMatch(/^[0-9a-f-]{36}\.png$/u);
    const response = await client.fetch('GET', `${base}/${asset.filename}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
    expect((await client.fetch('GET', `${base}/${asset.filename}/metadata`)).status).toBe(200);
    expect(await metadata(asset.filename)).toMatchObject({ filename: asset.filename });
  });

  it('preserves a compound HEIC original without requiring its decoder', async () => {
    // Signature-only fixture: intentionally undecodable, to keep F12 failures separate.
    const heic = Buffer.from('00000018667479706865766300000000686576636d696631', 'hex');
    const { status, body: asset } = await upload(heic, 'telefon.jpg', 'image/jpeg');
    expect(status).toBe(201);
    expect(asset).toMatchObject({
      mediaType: 'image/heic',
      processing: { preview: { status: 'pending' } },
    });
    expect(asset.filename).toMatch(/\.heic$/u);
    expect(await download(asset.filename)).toEqual(heic);
  });

  it('rejects a truncated signature as a format error without a successful reference', async () => {
    const response = await upload(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'kot.png');
    expect(response.status).toBe(415);
    expect(response.body).not.toHaveProperty('filename');
    expect(await staged()).toEqual([]);
    expect((await upload()).status).toBe(201);
  });

  it.each([
    ['jpg', 'image/jpeg'],
    ['webp', 'image/webp'],
    ['heic', 'image/heic'],
  ])(
    'recognizes real %s content regardless of browser filename and MIME',
    async (extension, mediaType) => {
      const bytes = await readFile(
        join(import.meta.dirname, `../tests/fixtures/photo.${extension}`),
      );
      const { status, body: asset } = await upload(bytes, 'żółw.txt', 'text/plain');
      expect(status).toBe(201);
      expect(asset).toMatchObject({ originalName: 'żółw.txt', mediaType, sizeBytes: bytes.length });
      expect(asset.filename.endsWith(`.${extension}`)).toBe(true);
      expect(digest(await download(asset.filename))).toBe(digest(bytes));
    },
  );

  it('keeps earlier uploads with the same client name under distinct filenames', async () => {
    const first = (await upload()).body;
    const changed = Buffer.concat([png, Buffer.from('second')]);
    const second = (await upload(changed)).body;
    expect(first.filename).not.toBe(second.filename);
    expect(await download(first.filename)).toEqual(png);
    expect(await download(second.filename)).toEqual(changed);
  });

  it.each([Buffer.from('not a photo'), Buffer.from('GIF89a................'), Buffer.alloc(0)])(
    'rejects unsupported content advertised as PNG',
    async (bytes) => {
      const before = await storageIds();
      const response = await upload(bytes);
      expect(response.status).toBe(415);
      expect(response.body).not.toHaveProperty('filename');
      expect(await storageIds()).toEqual(before);
    },
  );

  it('retains originals and metadata when the application is recreated', async () => {
    const asset = (await upload()).body;
    const before = await metadata(asset.filename);
    await harness.restart();
    expect(await metadata(asset.filename)).toEqual(
      expect.objectContaining({ filename: before.filename, sizeBytes: png.length }),
    );
    expect(await download(asset.filename)).toEqual(png);
  });

  it('reports an original-write failure and allows retry without publishing a filename', async () => {
    const roots = join(harness.directory, 'staging');
    await rm(roots, { recursive: true, force: true });
    await writeFile(roots, 'filesystem obstruction');
    const response = await upload();
    expect(response.status).toBe(507);
    expect(response.body).toMatchObject({ error: 'original_storage_failed', retryable: true });
    await rm(roots);
    expect((await upload()).status).toBe(201);
  });

  it('does not publish a completed file when a later multipart field invalidates the request', async () => {
    const before = await storageIds();
    const body = new FormData();
    body.append('file', new Blob([new Uint8Array(png)]), 'kot.png');
    body.append('unexpected', 'field');
    const response = await client.fetch('POST', base, body);
    expect(response.status).toBe(400);
    expect(await response.json()).not.toHaveProperty('filename');
    expect(await storageIds()).toEqual(before);
    expect(await staged()).toEqual([]);
    expect((await upload()).status).toBe(201);
  });

  const multipartHead =
    '--photo\r\nContent-Disposition: form-data; name="file"; filename="kot.png"\r\nContent-Type: image/png\r\n\r\n';
  /** Signed-in peer headers for a hand-written multipart request. */
  async function rawHeaders() {
    const cookie = client.cookieHeader();
    return {
      cookie,
      origin: ORIGIN,
      'x-xsrf-token': client.csrfToken(),
      'content-type': 'multipart/form-data; boundary=photo',
    };
  }

  it('returns a transport error for a truncated multipart body and keeps the API usable', async () => {
    const before = await storageIds();
    const response = await fetch(harness.base + base, {
      method: 'POST',
      headers: await rawHeaders(),
      body: Buffer.concat([Buffer.from(multipartHead), png]),
    });
    expect(response.status).toBe(400);
    expect(await storageIds()).toEqual(before);
    expect((await upload()).status).toBe(201);
  });

  it('never publishes an interrupted original and permits a new upload', async () => {
    const before = await storageIds();
    const pending = request(harness.base + base, {
      method: 'POST',
      headers: await rawHeaders(),
    });
    pending.on('error', () => {
      /* Deliberately disconnected client. */
    });
    pending.write(multipartHead);
    pending.write(Buffer.concat([png, Buffer.alloc(128 * 1024)]));
    // Let the real socket start streaming before interrupting its multipart body.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const closed = new Promise<void>((resolve) => pending.once('close', resolve));
    pending.destroy();
    await closed;
    await vi.waitFor(async () => {
      expect(await staged()).toEqual([]);
    });
    expect(await storageIds()).toEqual(before);
    expect((await upload()).status).toBe(201);
  });

  it.each([
    'missing.png',
    '..%5C..%5Cpackage.json',
    '%2E%2E%2Fpackage.json',
    '%00',
    '11111111-1111-4111-8111-111111111111.png',
  ])('safely reports unavailable original %s', async (filename) => {
    expect((await client.fetch('GET', `${base}/${filename}`)).status).toBe(404);
    expect((await client.fetch('GET', `${base}/${filename}/metadata`)).status).toBe(404);
  });

  it('keeps a successful original downloadable when external derivative processing fails', async () => {
    const before = await storageIds();
    const asset = (await upload()).body;
    const [storageId] = (await storageIds()).filter((id) => !before.includes(id));
    // Controlled filesystem fixture stands in for F12's external processing process.
    const record = join(harness.directory, 'objects', storageId, 'metadata.json');
    const { filename, ...stored } = asset;
    const failed = {
      ...stored,
      processing: { ...asset.processing, thumbnail: { status: 'failed', error: 'decoder_failed' } },
    };
    await writeFile(record, JSON.stringify(failed));
    expect(await metadata(filename)).toEqual({ ...failed, filename });
    expect(await download(filename)).toEqual(png);
    await rm(join(harness.directory, 'objects', storageId, 'original'));
    expect((await client.fetch('GET', `${base}/${filename}`)).status).toBe(404);
  });

  it('accepts an original above the rejected 20 MB proposal without truncation', async () => {
    const bytes = Buffer.concat([png, Buffer.alloc(21 * 1024 * 1024, 0x61)]);
    const { status, body: asset } = await upload(bytes);
    expect(status).toBe(201);
    expect(asset.sizeBytes).toBe(bytes.length);
    expect(digest(await download(asset.filename))).toBe(digest(bytes));
  });
});
