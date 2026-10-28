import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';
import sharp from 'sharp';

const exec = promisify(execFile);
const docker = async (...args) =>
  (await exec('docker', args, { maxBuffer: 16 * 1024 * 1024 })).stdout.trim();
const image = process.env.ASSET_TEST_IMAGE ?? 'pawtrace:image-processing-check';
const scratch = resolve('.scratch');
await mkdir(scratch, { recursive: true });
const directory = await mkdtemp(join(scratch, 'image-processing-check-'));
const mount = `type=bind,source=${directory},target=/app/data/assets`;
const containers = new Set();
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fixtures = 'apps/api/tests/fixtures';
const manifest = JSON.parse(await readFile(`${fixtures}/heic/manifest.json`, 'utf8'));
const artifacts = join(directory, 'evidence');
await mkdir(artifacts);

async function waitFor(read, accept, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  let last;
  do {
    try {
      last = await read();
      if (accept(last)) return last;
    } catch (error) {
      last = error;
    }
    await setTimeout(100);
  } while (Date.now() < deadline);
  throw new Error(`Verification timed out: ${JSON.stringify(last)}`);
}

async function start(extra = []) {
  const name = `pawtrace-image-check-${randomUUID()}`;
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
    ...extra,
    image,
  );
  const address = await docker('port', name, '3000/tcp');
  const base = `http://${address}/api`;
  await waitFor(
    () => fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) }).then((r) => r.status),
    (status) => status === 200,
    30_000,
  );
  return { name, base };
}

async function stop(runtime) {
  await docker('rm', '--force', runtime.name);
  containers.delete(runtime.name);
}

async function upload(runtime, bytes, name = 'photo.heic') {
  const body = new FormData();
  body.append('file', new Blob([bytes]), name);
  const response = await fetch(`${runtime.base}/assets`, { method: 'POST', body });
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}

async function metadata(runtime, asset) {
  const response = await fetch(`${runtime.base}/assets/${asset.filename}/metadata`);
  assert.equal(response.status, 200);
  return response.json();
}

async function settled(runtime, asset) {
  return waitFor(
    () => metadata(runtime, asset),
    (m) => Object.values(m.processing).every((d) => d.status !== 'pending'),
  );
}

async function original(runtime, asset, bytes) {
  const response = await fetch(`${runtime.base}/assets/${asset.filename}`);
  assert.equal(response.status, 200);
  assert.equal(hash(new Uint8Array(await response.arrayBuffer())), hash(bytes));
}

async function derivative(runtime, asset, kind) {
  const response = await fetch(`${runtime.base}/assets/${asset.filename}/${kind}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^image\/png/u);
  return Buffer.from(await response.arrayBuffer());
}

async function retry(runtime, asset) {
  assert.equal(
    (await fetch(`${runtime.base}/assets/${asset.filename}/retry`, { method: 'POST' })).status,
    201,
  );
}

async function freezeNextWorker(runtime) {
  // Observe the real process tree, never replace the decoder with a test implementation.
  return docker(
    'exec',
    '--user',
    'root',
    runtime.name,
    'node',
    '-e',
    `
    const fs=require('fs');const deadline=Date.now()+15000;
    const timer=setInterval(()=>{
      const pids=fs.readFileSync('/proc/1/task/1/children','utf8').trim().split(/\\s+/).filter(Boolean);
      if(pids.length>1)process.exit(2);
      if(pids[0]){process.kill(Number(pids[0]),'SIGSTOP');console.log(pids[0]);clearInterval(timer);}
      else if(Date.now()>deadline)process.exit(3);
    },5);
  `,
  );
}

try {
  if (!process.env.ASSET_TEST_IMAGE) {
    console.log('Building production image...');
    await docker('build', '--tag', image, '.');
  }
  let runtime = await start();
  const versions = await docker(
    'exec',
    runtime.name,
    'node',
    '-e',
    "console.log(JSON.stringify(require('sharp').versions))",
  );
  console.log(`CODECS ${versions}`);
  const parsedVersions = JSON.parse(versions);
  assert.equal(parsedVersions.sharp, '0.35.5');
  assert.equal(parsedVersions.vips, '8.18.7');
  const heifVersion = await docker('exec', runtime.name, '/opt/codecs/bin/heif-info', '--version');
  assert.match(heifVersion, /1\.23\.7/u);
  console.log(`LIBHEIF ${heifVersion}`);
  console.log(await docker('exec', runtime.name, '/opt/codecs/bin/heif-dec', '--list-decoders'));

  const retained = [];
  for (const extension of ['jpg', 'webp', 'heic']) {
    const bytes = await readFile(`${fixtures}/photo.${extension}`);
    const asset = await upload(runtime, bytes, `photo.${extension}`);
    const complete = await settled(runtime, asset);
    assert.equal(complete.processing.thumbnail.status, 'ready');
    assert.equal(
      complete.processing.preview.status,
      extension === 'heic' ? 'ready' : 'not_required',
    );
    const thumbnail = await sharp(await derivative(runtime, asset, 'thumbnail')).metadata();
    assert.ok(thumbnail.width <= 480 && thumbnail.height <= 480);
    await original(runtime, asset, bytes);
    retained.push({ asset, bytes });
  }
  // A real PNG generated independently by Sharp also exercises transparent input.
  const png = await sharp({
    create: {
      width: 64,
      height: 32,
      channels: 4,
      background: { r: 100, g: 50, b: 20, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  const pngAsset = await upload(runtime, png, 'photo.png');
  assert.equal((await settled(runtime, pngAsset)).processing.thumbnail.status, 'ready');
  assert.equal(
    (await sharp(await derivative(runtime, pngAsset, 'thumbnail')).metadata()).hasAlpha,
    true,
  );
  await original(runtime, pngAsset, png);

  for (const [name, expected] of Object.entries(manifest)) {
    const bytes = await readFile(`${fixtures}/heic/${name}`);
    assert.equal(hash(bytes), expected.sha256, `Fixture hash: ${name}`);
    const asset = await upload(runtime, bytes, name);
    const complete = await settled(runtime, asset);
    assert.equal(complete.processing.thumbnail.status, 'ready', JSON.stringify(complete));
    assert.equal(complete.processing.preview.status, 'ready', JSON.stringify(complete));
    assert.equal(complete.widthPixels, expected.width, name);
    assert.equal(complete.heightPixels, expected.height, name);
    const preview = await derivative(runtime, asset, 'preview');
    const dimensions = await sharp(preview).metadata();
    assert.equal(dimensions.width, expected.width, name);
    assert.equal(dimensions.height, expected.height, name);
    const thumbnail = await sharp(await derivative(runtime, asset, 'thumbnail')).metadata();
    assert.ok(thumbnail.width <= 480 && thumbnail.height <= 480);
    if (name === 'alpha-transparency.heic') assert.equal(dimensions.hasAlpha, true);
    if (name !== 'large-48mp-grid.heic') await writeFile(join(artifacts, `${name}.png`), preview);
    await original(runtime, asset, bytes);
    retained.push({ asset, bytes });
    console.log(
      `PASS ${name}: ${dimensions.width}x${dimensions.height}, original SHA-256 unchanged.`,
    );
  }

  const corrupt = Buffer.from('00000018667479706865766300000000686576636d696631', 'hex');
  const broken = await upload(runtime, corrupt);
  const failed = await settled(runtime, broken);
  assert.equal(failed.processing.thumbnail.error, 'decoder_failed');
  assert.equal(failed.processing.preview.error, 'decoder_failed');
  await original(runtime, broken, corrupt);
  await retry(runtime, broken);
  assert.equal((await settled(runtime, broken)).processing.preview.status, 'failed');
  console.log('PASS corrupt decode: explicit failures, retry, original retained.');

  const basic = await readFile(`${fixtures}/heic/basic-8bit-srgb.heic`);
  const obstructed = await upload(runtime, basic);
  const obstruction = join(directory, obstructed.filename.slice(0, 36), 'preview.png');
  await mkdir(obstruction);
  const partial = await settled(runtime, obstructed);
  assert.equal(partial.processing.thumbnail.status, 'ready');
  assert.equal(partial.processing.preview.error, 'derivative_write_failed');
  const thumbnailHash = hash(await derivative(runtime, obstructed, 'thumbnail'));
  await original(runtime, obstructed, basic);
  await rm(obstruction, { recursive: true });
  await retry(runtime, obstructed);
  assert.equal((await settled(runtime, obstructed)).processing.preview.status, 'ready');
  assert.equal(hash(await derivative(runtime, obstructed, 'thumbnail')), thumbnailHash);
  console.log(
    'PASS derivative-write failure: healthy thumbnail retained; preview recovers against same original.',
  );

  const large = await readFile(`${fixtures}/heic/large-48mp-grid.heic`);
  const frozen = freezeNextWorker(runtime);
  const interrupted = await upload(runtime, large);
  const pid = await frozen;
  assert.equal((await fetch(`${runtime.base}/health`)).status, 200);
  await docker(
    'exec',
    '--user',
    'root',
    runtime.name,
    'node',
    '-e',
    `process.kill(${Number(pid)}, 'SIGKILL')`,
  );
  const exited = await settled(runtime, interrupted);
  assert.equal(exited.processing.thumbnail.error, 'worker_exited');
  await original(runtime, interrupted, large);
  await retry(runtime, interrupted);
  assert.equal((await settled(runtime, interrupted)).processing.thumbnail.status, 'ready');
  console.log(
    'PASS native worker SIGKILL: explicit failure; API and original survive; retry succeeds.',
  );

  const frozenAgain = freezeNextWorker(runtime);
  const pending = await upload(runtime, large);
  await frozenAgain;
  await stop(runtime); // Abrupt replacement while decoder holds partial work.
  runtime = await start();
  assert.equal((await settled(runtime, pending)).processing.preview.status, 'ready');
  for (const { asset, bytes } of retained) await original(runtime, asset, bytes);
  console.log('PASS container replacement: pending work recovered and earlier originals retained.');
  console.log(
    (await docker('logs', runtime.name))
      .split('\n')
      .filter((line) => line.includes('peak RSS'))
      .join('\n'),
  );
  await stop(runtime);

  runtime = await start(['--env', 'IMAGE_PROCESSING_TIMEOUT_MS=1']);
  const timed = await upload(runtime, basic);
  assert.equal((await settled(runtime, timed)).processing.preview.error, 'processing_timeout');
  await original(runtime, timed, basic);
  assert.equal((await fetch(`${runtime.base}/health`)).status, 200);
  await stop(runtime);
  runtime = await start();
  await retry(runtime, timed);
  assert.equal((await settled(runtime, timed)).processing.preview.status, 'ready');
  console.log(
    'PASS controlled processing timeout: resource failure retained original; retry after restart succeeds.',
  );
  await stop(runtime);

  runtime = await start(['--memory=192m', '--memory-swap=192m']);
  const constrained = await upload(runtime, large);
  const resourceResult = await waitFor(
    async () => {
      const state = JSON.parse(
        await docker('inspect', '--format', '{{json .State}}', runtime.name),
      );
      if (!state.Running) return { state };
      return { state, asset: await metadata(runtime, constrained) };
    },
    (result) =>
      !result.state.Running ||
      Object.values(result.asset.processing).every((d) => d.status !== 'pending'),
  );
  if (resourceResult.state.Running) {
    const events = await docker(
      'exec',
      runtime.name,
      'node',
      '-e',
      `
      const fs=require('fs');
      for(const path of ['/sys/fs/cgroup/memory.events','/sys/fs/cgroup/memory/memory.oom_control','/sys/fs/cgroup/memory.oom_control']){
        if(fs.existsSync(path)){console.log(fs.readFileSync(path,'utf8'));process.exit(0);}
      }
      process.exit(1);
    `,
    );
    assert.match(
      events,
      /oom_kill [1-9][0-9]*/u,
      'Controlled resource run must exercise a real cgroup OOM',
    );
    assert.ok(Object.values(resourceResult.asset.processing).some((d) => d.status === 'failed'));
    await original(runtime, constrained, large);
    console.log(
      `PASS actual 192 MiB cgroup OOM: API survived; failed derivative and original retained. ${events.replaceAll('\n', '; ')}`,
    );
  } else {
    assert.equal(resourceResult.state.OOMKilled, true);
    console.log(
      'OBSERVED actual 192 MiB cgroup OOM killed the API container; a sibling process alone does not guarantee API survival.',
    );
  }
  await stop(runtime);
  runtime = await start();
  await original(runtime, constrained, large);
  await retry(runtime, constrained);
  assert.equal((await settled(runtime, constrained)).processing.preview.status, 'ready');
  console.log(
    'PASS original and processing recover after actual cgroup OOM with normal resources.',
  );
  console.log(`Visual evidence: ${artifacts}`);
  await stop(runtime);
} finally {
  for (const name of containers) await docker('rm', '--force', name);
  const child = relative(scratch, directory);
  assert.ok(child.startsWith('image-processing-check-') && !child.includes('..'));
  // Keep visual evidence when explicitly requested; originals and temporary test assets are disposable.
  if (!process.env.KEEP_ASSET_EVIDENCE) await rm(directory, { recursive: true, force: true });
}
