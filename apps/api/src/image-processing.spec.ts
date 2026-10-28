import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApplication } from './application';

describe('photo derivatives over HTTP', () => {
  let app: NestExpressApplication;
  let directory: string;
  let base: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'pawtrace-processing-'));
    vi.stubEnv('ASSET_DIRECTORY', directory);
    app = await createApplication({ ignoreEnvFile: true });
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/assets`;
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  async function upload(bytes: Uint8Array, name: string) {
    const body = new FormData();
    body.append('file', new Blob([new Uint8Array(bytes)]), name);
    const response = await fetch(base, { method: 'POST', body });
    expect(response.status).toBe(201);
    return response.json();
  }

  async function settled(filename: string, status: string) {
    await vi.waitFor(
      async () => {
        const metadata = await (await fetch(`${base}/${filename}/metadata`)).json();
        expect(metadata.processing.thumbnail.status).toBe(status);
      },
      { timeout: 10_000 },
    );
    return (await fetch(`${base}/${filename}/metadata`)).json();
  }

  it('creates a thumbnail asynchronously while retaining the original bytes', async () => {
    const bytes = await readFile(join(import.meta.dirname, '../tests/fixtures/photo.jpg'));
    const body = new FormData();
    body.append('file', new Blob([bytes]), 'kot.jpg');
    const response = await fetch(base, { method: 'POST', body });
    expect(response.status).toBe(201);
    const original = await response.json();
    await vi.waitFor(
      async () => {
        const metadata = await (await fetch(`${base}/${original.filename}/metadata`)).json();
        expect(metadata.processing.thumbnail.status).toBe('ready');
        expect(metadata.widthPixels).toBe(200);
        expect(metadata.heightPixels).toBe(133);
        expect(metadata.thumbnailFilename).toBe(metadata.processing.thumbnail.filename);
        const thumbnail = await fetch(`${base}/${original.filename}/thumbnail`);
        expect(thumbnail.status).toBe(200);
        expect(thumbnail.headers.get('content-type')).toContain('image/png');
        expect((await thumbnail.arrayBuffer()).byteLength).toBeGreaterThan(0);
      },
      { timeout: 10_000 },
    );
    expect(Buffer.from(await (await fetch(`${base}/${original.filename}`)).arrayBuffer())).toEqual(
      bytes,
    );
    expect((await fetch(`${base}/${original.filename}/preview`)).status).toBe(404);
  });

  it('exposes decoder failures per derivative and retries the same saved original', async () => {
    const bytes = Buffer.from('00000018667479706865766300000000686576636d696631', 'hex');
    const asset = await upload(bytes, 'uszkodzone.heic');
    const failed = await settled(asset.filename, 'failed');
    await vi.waitFor(
      async () => {
        const metadata = await (await fetch(`${base}/${asset.filename}/metadata`)).json();
        expect(metadata.processing.preview).toEqual({ status: 'failed', error: 'decoder_failed' });
      },
      { timeout: 10_000 },
    );
    expect(failed.processing.thumbnail).toEqual({ status: 'failed', error: 'decoder_failed' });
    expect((await fetch(`${base}/${asset.filename}/thumbnail`)).status).toBe(404);
    const retry = await fetch(`${base}/${asset.filename}/retry`, { method: 'POST' });
    expect(retry.status).toBe(201);
    expect(await retry.json()).toMatchObject({
      filename: asset.filename,
      processing: { thumbnail: { status: 'pending' }, preview: { status: 'pending' } },
    });
    await settled(asset.filename, 'failed');
    expect(Buffer.from(await (await fetch(`${base}/${asset.filename}`)).arrayBuffer())).toEqual(
      bytes,
    );
  }, 20_000);

  it('does not reprocess completed derivatives when retry is requested', async () => {
    const bytes = await readFile(join(import.meta.dirname, '../tests/fixtures/photo.jpg'));
    const asset = await upload(bytes, 'kot.jpg');
    const ready = await settled(asset.filename, 'ready');
    const thumbnail = Buffer.from(
      await (await fetch(`${base}/${asset.filename}/thumbnail`)).arrayBuffer(),
    );
    const retries = await Promise.all(
      Array.from({ length: 8 }, () => fetch(`${base}/${asset.filename}/retry`, { method: 'POST' })),
    );
    for (const retry of retries) {
      expect(retry.status).toBe(201);
      expect(await retry.json()).toEqual(ready);
    }
    expect(
      Buffer.from(await (await fetch(`${base}/${asset.filename}/thumbnail`)).arrayBuffer()),
    ).toEqual(thumbnail);
  }, 15_000);

  it('recovers a published pending original when the application restarts', async () => {
    const bytes = await readFile(join(import.meta.dirname, '../tests/fixtures/photo.jpg'));
    const asset = await upload(bytes, 'kot.jpg');
    await app.close();
    app = await createApplication({ ignoreEnvFile: true });
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/assets`;
    const ready = await settled(asset.filename, 'ready');
    expect(ready.filename).toBe(asset.filename);
    expect(Buffer.from(await (await fetch(`${base}/${asset.filename}`)).arrayBuffer())).toEqual(
      bytes,
    );
  }, 15_000);

  it('does not create processing records for unknown or unsafe filenames', async () => {
    for (const filename of ['11111111-1111-4111-8111-111111111111.png', '..%5Cpackage.json']) {
      expect((await fetch(`${base}/${filename}/retry`, { method: 'POST' })).status).toBe(404);
      expect((await fetch(`${base}/${filename}/thumbnail`)).status).toBe(404);
    }
  });

  it('recovers from derivative-write failure without uploading the original again', async () => {
    const bytes = await readFile(join(import.meta.dirname, '../tests/fixtures/photo.jpg'));
    const asset = await upload(bytes, 'kot.jpg');
    // External filesystem fault; assertions stay on HTTP.
    const obstruction = join(directory, asset.filename.slice(0, 36), 'thumbnail.png');
    await mkdir(obstruction);
    const failed = await settled(asset.filename, 'failed');
    expect(failed.processing.thumbnail).toEqual({
      status: 'failed',
      error: 'derivative_write_failed',
    });
    expect(Buffer.from(await (await fetch(`${base}/${asset.filename}`)).arrayBuffer())).toEqual(
      bytes,
    );
    await rm(obstruction, { recursive: true });
    expect((await fetch(`${base}/${asset.filename}/retry`, { method: 'POST' })).status).toBe(201);
    await settled(asset.filename, 'ready');
    expect((await fetch(`${base}/${asset.filename}/thumbnail`)).status).toBe(200);
  }, 20_000);
});
