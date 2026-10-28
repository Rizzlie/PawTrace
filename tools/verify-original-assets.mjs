import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const docker = async (...args) =>
  (await exec('docker', args, { maxBuffer: 8 * 1024 * 1024 })).stdout.trim();
const image = process.env.ASSET_TEST_IMAGE ?? 'pawtrace:assets-check';
const scratch = resolve('.scratch');
await mkdir(scratch, { recursive: true });
const directory = await mkdtemp(join(scratch, 'assets-check-'));
const containers = new Set();
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);

async function start(mount) {
  const name = `pawtrace-assets-check-${randomUUID()}`;
  containers.add(name);
  await docker(
    'run',
    '--detach',
    '--name',
    name,
    '--publish',
    '127.0.0.1::3000',
    '--mount',
    mount,
    '--env',
    'ASSET_DIRECTORY=/app/data/assets',
    image,
  );
  const address = await docker('port', name, '3000/tcp');
  const base = `http://${address}/api`;
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return { name, base };
    } catch {
      /* The new container is still starting. */
    }
    if (Date.now() > deadline)
      throw new Error(`Container did not become ready: ${await docker('logs', name)}`);
    await setTimeout(200);
  }
}

async function stop(container) {
  await docker('rm', '--force', container.name);
  containers.delete(container.name);
}

function upload(base, bytes, filename = 'same-client-name.png') {
  const body = new FormData();
  body.append('file', new Blob([bytes], { type: 'application/octet-stream' }), filename);
  return fetch(`${base}/assets`, { method: 'POST', body, signal: AbortSignal.timeout(30_000) });
}

async function verifyOriginal(base, asset, bytes) {
  const response = await fetch(`${base}/assets/${asset.filename}`);
  assert.equal(response.status, 200);
  assert.equal(hash(new Uint8Array(await response.arrayBuffer())), hash(bytes));
  const metadata = await fetch(`${base}/assets/${asset.filename}/metadata`);
  assert.equal(metadata.status, 200);
  const current = await metadata.json();
  for (const field of ['filename', 'originalName', 'mediaType', 'sizeBytes']) {
    assert.deepEqual(current[field], asset[field]);
  }
}

try {
  if (!process.env.ASSET_TEST_IMAGE) {
    console.log('Building the production Docker image...');
    await docker('build', '--tag', image, '.');
  }
  const mount = `type=bind,source=${directory},target=/app/data/assets`;
  let runtime = await start(mount);
  const originals = [];
  for (const extension of ['png', 'jpg', 'webp', 'heic']) {
    const bytes =
      extension === 'png' ? png : await readFile(`apps/api/tests/fixtures/photo.${extension}`);
    const response = await upload(runtime.base, bytes);
    assert.equal(response.status, 201, await response.clone().text());
    const asset = await response.json();
    await verifyOriginal(runtime.base, asset, bytes);
    originals.push({ asset, bytes });
  }
  assert.equal(new Set(originals.map(({ asset }) => asset.filename)).size, 4);
  // Stream a larger original through the actual deployed path, not just an in-process server.
  const large = Buffer.concat([png, Buffer.alloc(32 * 1024 * 1024, 0x61)]);
  const response = await upload(runtime.base, large);
  assert.equal(response.status, 201, await response.clone().text());
  const largeAsset = await response.json();
  await verifyOriginal(runtime.base, largeAsset, large);
  originals.push({ asset: largeAsset, bytes: large });
  console.log(
    'PASS: JPEG/PNG/WebP/HEIC and 32 MiB original hash round-trips; client-name collisions.',
  );

  await stop(runtime);
  runtime = await start(mount);
  for (const { asset, bytes } of originals) await verifyOriginal(runtime.base, asset, bytes);
  assert.equal(
    (await fetch(`${runtime.base}/assets/11111111-1111-4111-8111-111111111111.png`)).status,
    404,
  );
  console.log(
    'PASS: container replacement retains all original filenames, metadata and bytes; missing original is 404.',
  );
  await stop(runtime);

  runtime = await start(`${mount},readonly`);
  const denied = await upload(runtime.base, png);
  assert.equal(denied.status, 507);
  const deniedBody = await denied.json();
  assert.equal(deniedBody.error, 'original_storage_failed');
  assert.equal(deniedBody.systemCode, 'EROFS');
  assert.equal('filename' in deniedBody, false);
  await verifyOriginal(runtime.base, originals[0].asset, png);
  console.log(
    'PASS: read-only mount reports EROFS with no successful reference; existing originals remain downloadable.',
  );
  await stop(runtime);

  runtime = await start(
    'type=tmpfs,destination=/app/data/assets,tmpfs-size=1048576,tmpfs-mode=1777',
  );
  const full = await upload(runtime.base, large);
  assert.equal(full.status, 507);
  const fullBody = await full.json();
  assert.equal(fullBody.error, 'original_storage_failed');
  assert.equal(fullBody.systemCode, 'ENOSPC');
  assert.equal('filename' in fullBody, false);
  const retry = await upload(runtime.base, png);
  assert.equal(retry.status, 201);
  await verifyOriginal(runtime.base, await retry.json(), png);
  assert.equal((await fetch(`${runtime.base}/health`)).status, 200);
  console.log(
    'PASS: real disk-full write fails independently; a new upload and API health still work after cleanup.',
  );
} finally {
  for (const name of containers) await docker('rm', '--force', name);
  const child = relative(scratch, directory);
  assert.ok(child.startsWith('assets-check-') && !child.includes('..'));
  await rm(directory, { recursive: true, force: true });
}
