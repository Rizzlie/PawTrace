import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

const SESSION_SECRET = 'verification-only-secret-at-least-32-characters';
const PUBLIC_ORIGIN = 'https://pawtrace.invalid';
const PASSWORD = 'verification-only';

/**
 * Disposable PostGIS and one owned case for the production-image verifiers. Google login cannot
 * run here and the image has no test login, so the session row is seeded in the database and its
 * cookie signed with the container's own secret: every request still crosses the real guard.
 */
export async function ownedAssetRuntime(docker) {
  const suffix = randomUUID();
  const network = `pawtrace-check-${suffix}`;
  const database = `pawtrace-check-db-${suffix}`;
  await docker('network', 'create', network);
  await docker(
    'run',
    '--detach',
    '--name',
    database,
    '--network',
    network,
    '--env',
    'POSTGRES_USER=pawtrace',
    '--env',
    'POSTGRES_DB=pawtrace',
    '--env',
    `POSTGRES_PASSWORD=${PASSWORD}`,
    'postgis/postgis:17-3.5',
  );
  const sql = (statement) =>
    docker('exec', database, 'psql', '-U', 'pawtrace', '-d', 'pawtrace', '-Atqc', statement);
  const deadline = Date.now() + 60_000;
  for (;;) {
    // The image's init script restarts the server, so ask over TCP rather than the local socket.
    const ready = await docker(
      'exec',
      database,
      'pg_isready',
      '-h',
      '127.0.0.1',
      '-U',
      'pawtrace',
      '-d',
      'pawtrace',
    ).catch(() => '');
    if (ready.includes('accepting connections') && (await sql('SELECT 1').catch(() => '')) === '1')
      break;
    if (Date.now() > deadline) throw new Error('Verification database did not start');
    await setTimeout(250);
  }

  const environment = [
    '--network',
    network,
    '--env',
    `DATABASE_URL=postgres://pawtrace:${PASSWORD}@${database}:5432/pawtrace`,
    '--env',
    `SESSION_SECRET=${SESSION_SECRET}`,
    '--env',
    'GOOGLE_CLIENT_ID=verification',
    '--env',
    'GOOGLE_CLIENT_SECRET=verification',
    '--env',
    `PUBLIC_ORIGIN=${PUBLIC_ORIGIN}`,
    '--env',
    'ASSET_DIRECTORY=/app/data/assets',
  ];

  let credentials;
  let caseId;
  /** Needs a started application: its migrations create the tables. */
  async function signIn(base) {
    const user = randomUUID();
    const sid = randomBytes(24).toString('base64url');
    const csrf = randomBytes(32).toString('base64url');
    const now = Date.now();
    await sql(`INSERT INTO app_user (id, issuer, subject, email)
      VALUES ('${user}', 'https://verification.invalid', '${user}', 'check@example.test')`);
    await sql(`INSERT INTO app_session (id, user_id, csrf, current_sid, rotated_at, expires_at)
      VALUES ('${sid}', '${user}', '${csrf}', '${sid}', ${now}, ${now + 86_400_000})`);
    await sql(`INSERT INTO session_identifier (sid, session_id) VALUES ('${sid}', '${sid}')`);
    const signature = createHmac('sha256', SESSION_SECRET)
      .update(sid)
      .digest('base64')
      .replace(/=+$/u, '');
    credentials = {
      cookie: `__Host-pawtrace=${encodeURIComponent(`s:${sid}.${signature}`)}`,
      origin: PUBLIC_ORIGIN,
      'x-xsrf-token': csrf,
    };
    const created = await fetch(`${base}/cases`, {
      method: 'POST',
      headers: {
        ...credentials,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({ title: 'Weryfikacja', timeZone: 'UTC' }),
    });
    if (created.status !== 201) throw new Error(`Case creation failed: ${created.status}`);
    ({ id: caseId } = await created.json());
  }

  return {
    environment,
    signIn,
    /** A request of the owner, on the owned case's asset routes. */
    assets: (base, path = '', options = {}) =>
      fetch(`${base}/cases/${caseId}/assets${path}`, {
        ...options,
        headers: { ...credentials, ...options.headers },
      }),
    /** The private directory behind a logical filename; only fault injection needs it. */
    storageId: (asset) =>
      sql(`SELECT storage_id FROM stored_photo WHERE filename = '${asset.filename}'`),
    async close() {
      await docker('rm', '--force', database);
      await docker('network', 'rm', network);
    },
  };
}
