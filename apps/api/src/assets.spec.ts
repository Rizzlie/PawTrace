import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApplication } from './application';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomUUID: vi.fn(actual.randomUUID) };
});

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename), rm: vi.fn(actual.rm) };
});

const reservedId = '11111111-1111-4111-8111-111111111111';
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

// A real, one-pixel PNG; decoding is deliberately outside the F11 contract.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);

describe('original photo storage over HTTP', () => {
  let app: NestExpressApplication;
  let directory: string;
  let base: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'pawtrace-assets-'));
    vi.stubEnv('ASSET_DIRECTORY', directory);
    app = await createApplication({ ignoreEnvFile: true });
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/assets`;
  });

  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
    vi.mocked(randomUUID).mockClear();
    await rm(directory, { recursive: true, force: true });
  });

  function upload(bytes = png, name = 'kot.png', type = 'image/png') {
    const body = new FormData();
    body.append('file', new Blob([new Uint8Array(bytes)], { type }), name);
    return fetch(base, { method: 'POST', body });
  }

  it('publishes a stored original and downloads the exact received bytes', async () => {
    const response = await upload();
    expect(response.status).toBe(201);
    const asset = await response.json();
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
    const download = await fetch(`${base}/${asset.filename}`);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe('image/png');
    expect(download.headers.get('content-disposition')).toContain('attachment');
    expect(Buffer.from(await download.arrayBuffer())).toEqual(png);
    const metadata = await fetch(`${base}/${asset.filename}/metadata`);
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toEqual(asset);
  });

  it('preserves a compound HEIC original without requiring its decoder', async () => {
    // Signature-only fixture: intentionally undecodable, to keep F12 failures separate.
    const heic = Buffer.from('00000018667479706865766300000000686576636d696631', 'hex');
    const response = await upload(heic, 'telefon.jpg', 'image/jpeg');
    expect(response.status).toBe(201);
    const asset = await response.json();
    expect(asset).toMatchObject({
      mediaType: 'image/heic',
      processing: { preview: { status: 'pending' } },
    });
    expect(asset.filename).toMatch(/\.heic$/u);
    expect(Buffer.from(await (await fetch(`${base}/${asset.filename}`)).arrayBuffer())).toEqual(
      heic,
    );
  });

  it('rejects a truncated signature as a format error without a successful reference', async () => {
    const response = await upload(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'kot.png');
    expect(response.status).toBe(415);
    expect(await response.json()).not.toHaveProperty('filename');
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
      const response = await upload(bytes, 'żółw.txt', 'text/plain');
      expect(response.status).toBe(201);
      const asset = await response.json();
      expect(asset).toMatchObject({ originalName: 'żółw.txt', mediaType, sizeBytes: bytes.length });
      expect(asset.filename.endsWith(`.${extension}`)).toBe(true);
      const downloaded = await fetch(`${base}/${asset.filename}`);
      expect(digest(new Uint8Array(await downloaded.arrayBuffer()))).toBe(digest(bytes));
    },
  );

  it('retries a reserved server name without overwriting earlier uploads with the same client name', async () => {
    vi.mocked(randomUUID).mockReturnValueOnce(reservedId).mockReturnValueOnce(reservedId);
    const first = await (await upload()).json();
    const second = await (await upload(Buffer.concat([png, Buffer.from('second')]))).json();
    expect(first.filename).not.toBe(second.filename);
    expect(first.filename).toBe(`${reservedId}.png`);
    expect(Buffer.from(await (await fetch(`${base}/${first.filename}`)).arrayBuffer())).toEqual(
      png,
    );
    expect(Buffer.from(await (await fetch(`${base}/${second.filename}`)).arrayBuffer())).toEqual(
      Buffer.concat([png, Buffer.from('second')]),
    );
  });

  it.each([Buffer.from('not a photo'), Buffer.from('GIF89a................'), Buffer.alloc(0)])(
    'rejects unsupported content advertised as PNG',
    async (bytes) => {
      vi.mocked(randomUUID).mockReturnValueOnce(reservedId);
      const response = await upload(bytes);
      expect(response.status).toBe(415);
      expect(await response.json()).not.toHaveProperty('filename');
      expect((await fetch(`${base}/${reservedId}.png`)).status).toBe(404);
    },
  );

  it('retains originals and metadata when the application is recreated', async () => {
    const asset = await (await upload()).json();
    await app.close();
    app = await createApplication({ ignoreEnvFile: true });
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/assets`;
    expect(await (await fetch(`${base}/${asset.filename}/metadata`)).json()).toEqual(asset);
    expect(Buffer.from(await (await fetch(`${base}/${asset.filename}`)).arrayBuffer())).toEqual(
      png,
    );
  });

  it('reports an original-write failure and allows retry without publishing a filename', async () => {
    await app.close();
    const obstructed = join(directory, 'not-a-directory');
    await writeFile(obstructed, 'filesystem obstruction');
    vi.stubEnv('ASSET_DIRECTORY', obstructed);
    app = await createApplication({ ignoreEnvFile: true });
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/assets`;
    const response = await upload();
    expect(response.status).toBe(507);
    expect(await response.json()).toMatchObject({
      error: 'original_storage_failed',
      retryable: true,
    });
    await rm(obstructed);
    expect((await upload()).status).toBe(201);
  });

  it('does not publish a completed file when a later multipart field invalidates the request', async () => {
    vi.mocked(randomUUID).mockReturnValueOnce(reservedId);
    const body = new FormData();
    body.append('file', new Blob([new Uint8Array(png)]), 'kot.png');
    body.append('unexpected', 'field');
    const response = await fetch(base, { method: 'POST', body });
    expect(response.status).toBe(400);
    expect(await response.json()).not.toHaveProperty('filename');
    expect((await fetch(`${base}/${reservedId}.png/metadata`)).status).toBe(404);
    expect((await upload()).status).toBe(201);
  });

  it('returns a transport error for a truncated multipart body and keeps the API usable', async () => {
    vi.mocked(randomUUID).mockReturnValueOnce(reservedId);
    const response = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=photo' },
      body: Buffer.concat([
        Buffer.from(
          '--photo\r\nContent-Disposition: form-data; name="file"; filename="kot.png"\r\nContent-Type: image/png\r\n\r\n',
        ),
        png,
      ]),
    });
    expect(response.status).toBe(400);
    expect((await fetch(`${base}/${reservedId}.png`)).status).toBe(404);
    expect((await upload()).status).toBe(201);
  });

  it('never publishes an interrupted original and permits a new upload', async () => {
    vi.mocked(randomUUID).mockReturnValueOnce(reservedId);
    const pending = request(base, {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=photo' },
    });
    pending.on('error', () => {
      /* Deliberately disconnected client. */
    });
    pending.write(
      '--photo\r\nContent-Disposition: form-data; name="file"; filename="kot.png"\r\nContent-Type: image/png\r\n\r\n',
    );
    pending.write(Buffer.concat([png, Buffer.alloc(128 * 1024)]));
    // Let the real socket start streaming before interrupting its multipart body.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const closed = new Promise<void>((resolve) => pending.once('close', resolve));
    pending.destroy();
    await closed;
    await vi.waitFor(async () => {
      expect((await fetch(`${base}/${reservedId}.png`)).status).toBe(404);
    });
    expect((await upload()).status).toBe(201);
  });

  it.each([
    'missing.png',
    '..%5C..%5Cpackage.json',
    '%2E%2E%2Fpackage.json',
    `${reservedId}.png`,
    `${reservedId}.json`,
  ])('safely reports unavailable original %s', async (filename) => {
    expect((await fetch(`${base}/${filename}`)).status).toBe(404);
    expect((await fetch(`${base}/${filename}/metadata`)).status).toBe(404);
  });

  it('keeps a successful original downloadable when external derivative processing fails', async () => {
    const asset = await (await upload()).json();
    // Controlled filesystem fixture stands in for F12's external processing process.
    const failed = {
      ...asset,
      processing: { ...asset.processing, thumbnail: { status: 'failed', error: 'decoder_failed' } },
    };
    await writeFile(
      join(directory, asset.filename.slice(0, 36), 'metadata.json'),
      JSON.stringify(failed),
    );
    expect(await (await fetch(`${base}/${asset.filename}/metadata`)).json()).toEqual(failed);
    expect(Buffer.from(await (await fetch(`${base}/${asset.filename}`)).arrayBuffer())).toEqual(
      png,
    );
    await rm(join(directory, asset.filename.slice(0, 36), asset.filename));
    expect((await fetch(`${base}/${asset.filename}`)).status).toBe(404);
  });

  it('accepts an original above the rejected 20 MB proposal without truncation', async () => {
    const bytes = Buffer.concat([png, Buffer.alloc(21 * 1024 * 1024, 0x61)]);
    const response = await upload(bytes);
    expect(response.status).toBe(201);
    const asset = await response.json();
    expect(asset.sizeBytes).toBe(bytes.length);
    const downloaded = await fetch(`${base}/${asset.filename}`);
    expect(digest(new Uint8Array(await downloaded.arrayBuffer()))).toBe(digest(bytes));
  });

  it('preserves the primary per-file storage error when cleanup also fails', async () => {
    vi.mocked(randomUUID).mockReturnValueOnce(reservedId);
    // Filesystem fault injection, still observed through the public HTTP interface.
    vi.mocked(rename).mockRejectedValueOnce(
      Object.assign(new Error('Disk full'), { code: 'ENOSPC' }),
    );
    vi.mocked(rm).mockRejectedValueOnce(
      Object.assign(new Error('Read-only filesystem'), { code: 'EROFS' }),
    );
    const response = await upload();
    expect(response.status).toBe(507);
    expect(await response.json()).toMatchObject({
      error: 'original_storage_failed',
      systemCode: 'ENOSPC',
      retryable: true,
    });
    expect((await fetch(`${base}/${reservedId}.png`)).status).toBe(404);
    expect((await upload()).status).toBe(201);
  });
});
