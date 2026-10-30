import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { assetsPath, type ApiClient } from '../tests/case-client';
import { startPhotoApplication } from '../tests/photo-application';

describe('photo derivatives over HTTP', () => {
  let harness: Awaited<ReturnType<typeof startPhotoApplication>>;
  let client: ApiClient;
  let caseId: string;
  let base: string;

  beforeAll(async () => {
    harness = await startPhotoApplication('pawtrace-processing-');
    ({ client, caseId } = await harness.owner('processing'));
    base = assetsPath(caseId);
  });
  afterAll(() => harness.stop());

  const get = (path: string) => client.fetch('GET', `${base}/${path}`);
  const metadataOf = async (filename: string) => (await get(`${filename}/metadata`)).json();
  const originalOf = async (filename: string) =>
    Buffer.from(await (await get(filename)).arrayBuffer());

  async function upload(bytes: Uint8Array, name: string) {
    const response = await client.upload(caseId, bytes, name);
    expect(response.status).toBe(201);
    return response.body;
  }

  async function settled(filename: string, status: string) {
    await vi.waitFor(
      async () => {
        expect((await metadataOf(filename)).processing.thumbnail.status).toBe(status);
      },
      { timeout: 10_000 },
    );
    return metadataOf(filename);
  }

  it('creates a thumbnail asynchronously while retaining the original bytes', async () => {
    const bytes = await readFile(join(import.meta.dirname, '../tests/fixtures/photo.jpg'));
    const original = await upload(bytes, 'kot.jpg');
    await vi.waitFor(
      async () => {
        const metadata = await metadataOf(original.filename);
        expect(metadata.processing.thumbnail.status).toBe('ready');
        expect(metadata.widthPixels).toBe(200);
        expect(metadata.heightPixels).toBe(133);
        expect(metadata.thumbnailFilename).toBe(metadata.processing.thumbnail.filename);
        const thumbnail = await get(`${original.filename}/thumbnail`);
        expect(thumbnail.status).toBe(200);
        expect(thumbnail.headers.get('content-type')).toContain('image/png');
        expect((await thumbnail.arrayBuffer()).byteLength).toBeGreaterThan(0);
      },
      { timeout: 10_000 },
    );
    expect(await originalOf(original.filename)).toEqual(bytes);
    expect((await get(`${original.filename}/preview`)).status).toBe(404);
  });

  it('exposes decoder failures per derivative and retries the same saved original', async () => {
    const bytes = Buffer.from('00000018667479706865766300000000686576636d696631', 'hex');
    const asset = await upload(bytes, 'uszkodzone.heic');
    const failed = await settled(asset.filename, 'failed');
    await vi.waitFor(
      async () => {
        expect((await metadataOf(asset.filename)).processing.preview).toEqual({
          status: 'failed',
          error: 'decoder_failed',
        });
      },
      { timeout: 10_000 },
    );
    expect(failed.processing.thumbnail).toEqual({ status: 'failed', error: 'decoder_failed' });
    expect((await get(`${asset.filename}/thumbnail`)).status).toBe(404);
    const retry = await client.fetch('POST', `${base}/${asset.filename}/retry`);
    expect(retry.status).toBe(201);
    expect(await retry.json()).toMatchObject({
      filename: asset.filename,
      processing: { thumbnail: { status: 'pending' }, preview: { status: 'pending' } },
    });
    await settled(asset.filename, 'failed');
    expect(await originalOf(asset.filename)).toEqual(bytes);
  }, 20_000);

  it('does not reprocess completed derivatives when retry is requested', async () => {
    const bytes = await readFile(join(import.meta.dirname, '../tests/fixtures/photo.jpg'));
    const asset = await upload(bytes, 'kot.jpg');
    const ready = await settled(asset.filename, 'ready');
    const thumbnail = Buffer.from(await (await get(`${asset.filename}/thumbnail`)).arrayBuffer());
    const retries = await Promise.all(
      Array.from({ length: 8 }, () => client.fetch('POST', `${base}/${asset.filename}/retry`)),
    );
    for (const retry of retries) {
      expect(retry.status).toBe(201);
      expect(await retry.json()).toEqual(ready);
    }
    expect(Buffer.from(await (await get(`${asset.filename}/thumbnail`)).arrayBuffer())).toEqual(
      thumbnail,
    );
  }, 15_000);

  it('recovers a published pending original when the application restarts', async () => {
    const bytes = await readFile(join(import.meta.dirname, '../tests/fixtures/photo.jpg'));
    const asset = await upload(bytes, 'kot.jpg');
    await harness.restart();
    const ready = await settled(asset.filename, 'ready');
    expect(ready.filename).toBe(asset.filename);
    expect(await originalOf(asset.filename)).toEqual(bytes);
  }, 15_000);

  it('does not create processing records for unknown or unsafe filenames', async () => {
    for (const filename of ['11111111-1111-4111-8111-111111111111.png', '..%5Cpackage.json']) {
      expect((await client.fetch('POST', `${base}/${filename}/retry`)).status).toBe(404);
      expect((await get(`${filename}/thumbnail`)).status).toBe(404);
    }
  });

  it('recovers from derivative-write failure without uploading the original again', async () => {
    const bytes = await readFile(join(import.meta.dirname, '../tests/fixtures/photo.jpg'));
    const before = await readdir(join(harness.directory, 'objects'));
    const asset = await upload(bytes, 'kot.jpg');
    const [storageId] = (await readdir(join(harness.directory, 'objects'))).filter(
      (id) => !before.includes(id),
    );
    // External filesystem fault; assertions stay on HTTP.
    const obstruction = join(harness.directory, 'objects', storageId, 'thumbnail.png');
    await mkdir(obstruction);
    const failed = await settled(asset.filename, 'failed');
    expect(failed.processing.thumbnail).toEqual({
      status: 'failed',
      error: 'derivative_write_failed',
    });
    expect(await originalOf(asset.filename)).toEqual(bytes);
    await rm(obstruction, { recursive: true });
    expect((await client.fetch('POST', `${base}/${asset.filename}/retry`)).status).toBe(201);
    await settled(asset.filename, 'ready');
    expect((await get(`${asset.filename}/thumbnail`)).status).toBe(200);
  }, 20_000);
});
