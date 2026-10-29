import { createApplication } from './application';
import { startProvider, signIn, responseCookies } from '../tests/oidc-provider';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('serves public bootstrap and direct Angular routes from a hidden checkout without exposing private API', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pawtrace-bootstrap-'));
  const webRoot = join(directory, '.web-root');
  await mkdir(webRoot);
  await writeFile(join(webRoot, 'index.html'), '<html>PawTrace bootstrap</html>');
  vi.stubEnv('WEB_ROOT', webRoot);
  const app = await createApplication({ ignoreEnvFile: true });
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    for (const path of ['/', '/profile']) {
      const response = await fetch(base + path, { headers: { accept: 'text/html' } });
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('PawTrace bootstrap');
    }
    expect((await fetch(base + '/api/map-config')).status).toBe(401);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

beforeEach(() => {
  vi.stubEnv(
    'DATABASE_URL',
    'postgres://pawtrace_test:local-test-only@127.0.0.1:55432/pawtrace_test',
  );
  vi.stubEnv('SESSION_SECRET', 'test-session-secret-at-least-32-characters');
  vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
  vi.stubEnv('AUTH_EMAIL_ALLOWLIST', '');
});
afterEach(() => vi.unstubAllEnvs());

it.each([
  'state',
  'nonce',
  'pkce',
  'signature',
  'issuer',
  'audience',
  'expired',
  'cancel',
  'failure',
])('rejects %s without a usable application session', async (fault) => {
  const provider = await startProvider();
  provider.control.fault = fault;
  const app = await createApplication({
    ignoreEnvFile: true,
    authentication: { provider: provider.configuration },
  });
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const login = await signIn(base);
    expect(login.finish.headers.get('location')).toBe(
      fault === 'cancel' ? '/?login=cancelled' : '/?login=failed',
    );
    expect((await fetch(base + '/api/auth/me', { headers: { cookie: login.cookie } })).status).toBe(
      401,
    );
  } finally {
    await app.close();
    await provider.close();
  }
});

it('uses HTTPS host-only secure cookies and rejects controlled dependencies in production', async () => {
  const provider = await startProvider();
  vi.stubEnv('PUBLIC_ORIGIN', 'https://pawtrace.example');
  const app = await createApplication({
    ignoreEnvFile: true,
    authentication: { provider: provider.configuration },
  });
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const login = await signIn(base, { 'x-forwarded-proto': 'https' });
    expect(login.finish.headers.get('location')).toBe('/');
    const cookie = login.finish.headers
      .getSetCookie()
      .find((value) => value.startsWith('__Host-pawtrace='));
    expect(cookie).toMatch(/; Secure;/);
    expect(cookie).toMatch(/; HttpOnly;/);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).not.toMatch(/Domain=/i);
    vi.stubEnv('NODE_ENV', 'production');
    await expect(
      createApplication({
        ignoreEnvFile: true,
        authentication: { provider: provider.configuration },
      }),
    ).rejects.toThrow('unavailable in production');
  } finally {
    await app.close();
    await provider.close();
  }
});

it('has no absolute thirty-day cap while background API traffic remains active', async () => {
  const provider = await startProvider();
  let time = Date.now();
  const app = await createApplication({
    ignoreEnvFile: true,
    authentication: { provider: provider.configuration, now: () => time },
  });
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    let cookie = (await signIn(base)).cookie;
    for (let week = 0; week < 6; week++) {
      time += 6 * 86_400_000;
      const response = await fetch(base + '/api/map-config', { headers: { cookie } });
      expect(response.status).toBe(200);
      cookie = responseCookies(response);
    }
  } finally {
    await app.close();
    await provider.close();
  }
});

it('consumes the callback once and rejects forged, unverified and unlisted identities', async () => {
  const provider = await startProvider();
  vi.stubEnv('AUTH_EMAIL_ALLOWLIST', 'alice@example.test');
  const app = await createApplication({
    ignoreEnvFile: true,
    authentication: { provider: provider.configuration },
  });
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const login = await signIn(base);
    const callback = new URL(login.callback);
    const replay = await fetch(base + callback.pathname + callback.search, {
      redirect: 'manual',
      headers: { cookie: login.binding },
    });
    expect(replay.headers.get('location')).toBe('/?login=failed');
    expect(
      (await fetch(base + '/api/auth/me', { headers: { cookie: responseCookies(replay) } })).status,
    ).toBe(401);
    provider.control.subject = 'bob';
    provider.control.email = 'bob@example.test';
    expect((await signIn(base)).finish.headers.get('location')).toBe('/?login=denied');
    provider.control.email = 'alice@example.test';
    provider.control.verified = false;
    expect((await signIn(base)).finish.headers.get('location')).toBe('/?login=denied');
    expect(
      (
        await fetch(base + '/api/auth/me', {
          headers: { 'x-user-email': 'alice@example.test', authorization: 'Bearer forged' },
        })
      ).status,
    ).toBe(401);
  } finally {
    await app.close();
    await provider.close();
  }
});

it('admits distinct verified accounts with an empty allowlist and preserves issuer/subject identity across email changes', async () => {
  const provider = await startProvider();
  const app = await createApplication({
    ignoreEnvFile: true,
    authentication: { provider: provider.configuration },
  });
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const me = async () =>
      (
        await fetch(base + '/api/auth/me', { headers: { cookie: (await signIn(base)).cookie } })
      ).json();
    const alice = await me();
    provider.control.email = 'new-alice@example.test';
    expect((await me()).id).toBe(alice.id);
    provider.control.subject = 'bob';
    provider.control.email = 'bob@example.test';
    expect((await me()).id).not.toBe(alice.id);
  } finally {
    await app.close();
    await provider.close();
  }
});

it.each([0, 1])(
  'rejects inactivity at seven days plus %i ms before touching it',
  async (offset) => {
    const provider = await startProvider();
    let time = Date.now();
    const app = await createApplication({
      ignoreEnvFile: true,
      authentication: { provider: provider.configuration, now: () => time },
    });
    try {
      await app.listen(0, '127.0.0.1');
      const base = await app.getUrl();
      const login = await signIn(base);
      time += 604_800_000 + offset;
      for (let i = 0; i < 2; i++)
        expect(
          (await fetch(base + '/api/auth/me', { headers: { cookie: login.cookie } })).status,
        ).toBe(401);
    } finally {
      await app.close();
      await provider.close();
    }
  },
);

it('extends just-before-expiry API activity, converges concurrent rotation, and revokes all identifiers durably', async () => {
  const provider = await startProvider();
  let time = Date.now();
  const options = {
    ignoreEnvFile: true,
    authentication: { provider: provider.configuration, now: () => time },
  };
  let app = await createApplication(options);
  try {
    await app.listen(0, '127.0.0.1');
    let base = await app.getUrl();
    const login = await signIn(base);
    expect(login.finish.headers.getSetCookie().join(';')).toMatch(/HttpOnly/);
    expect(login.finish.headers.getSetCookie().join(';')).toMatch(/SameSite=Lax/i);
    expect(login.finish.headers.getSetCookie().join(';')).toMatch(/Expires=/);
    time += 604_799_999;
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        fetch(base + '/api/map-config', { headers: { cookie: login.cookie } }),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual(Array(8).fill(200));
    const cookies = responses.map(responseCookies);
    expect(new Set(cookies).size).toBe(1);
    expect(cookies[0]).not.toBe(login.cookie);
    const cookie = cookies[0];
    time += 60_000;
    expect((await fetch(base + '/api/auth/me', { headers: { cookie: login.cookie } })).status).toBe(
      401,
    );
    expect((await fetch(base + '/api/auth/me', { headers: { cookie } })).status).toBe(200);
    const csrf =
      cookie
        .split('; ')
        .find((part) => part.startsWith('XSRF-TOKEN='))
        ?.split('=')[1] ?? '';
    const logout = (headers: Record<string, string>) =>
      fetch(base + '/api/auth/logout', { method: 'POST', headers: { cookie, ...headers } });
    expect((await logout({ origin: 'https://evil.example', 'x-xsrf-token': csrf })).status).toBe(
      403,
    );
    expect((await logout({ origin: 'http://127.0.0.1:4200' })).status).toBe(403);
    expect((await logout({ origin: 'http://127.0.0.1:4200', 'x-xsrf-token': csrf })).status).toBe(
      204,
    );
    await app.close();
    app = await createApplication(options);
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    for (const old of [cookie, login.cookie])
      expect((await fetch(base + '/api/auth/me', { headers: { cookie: old } })).status).toBe(401);
  } finally {
    await app.close();
    await provider.close();
  }
});

it('health, rejected mutations, unknown routes and ownerless assets do not extend inactivity', async () => {
  const provider = await startProvider();
  let time = Date.now();
  const app = await createApplication({
    ignoreEnvFile: true,
    authentication: { provider: provider.configuration, now: () => time },
  });
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const login = await signIn(base);
    time += 604_799_999;
    for (const path of [
      '/api/health',
      '/api/ready',
      '/api/unknown',
      '/api/assets/legacy.jpg',
      '/api/assets/legacy.jpg/thumbnail',
      '/api/assets/legacy.jpg/preview',
      '/api/assets/legacy.jpg/metadata',
    ]) {
      const response = await fetch(base + path, { headers: { cookie: login.cookie } });
      expect(response.status).toBe(path.endsWith('health') || path.endsWith('ready') ? 200 : 404);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
    expect(
      (
        await fetch(base + '/api/auth/logout', {
          method: 'POST',
          headers: { cookie: login.cookie },
        })
      ).status,
    ).toBe(403);
    time += 1;
    expect((await fetch(base + '/api/auth/me', { headers: { cookie: login.cookie } })).status).toBe(
      401,
    );
  } finally {
    await app.close();
    await provider.close();
  }
});

it('does not revive a revoked family when logout races with identifier rotation in other tabs', async () => {
  const provider = await startProvider();
  let time = Date.now();
  const options = {
    ignoreEnvFile: true,
    authentication: { provider: provider.configuration, now: () => time },
  };
  let app = await createApplication(options);
  try {
    await app.listen(0, '127.0.0.1');
    let base = await app.getUrl();
    const login = await signIn(base);
    const first = await fetch(base + '/api/auth/me', { headers: { cookie: login.cookie } });
    const cookie = responseCookies(first);
    const csrf =
      cookie
        .split('; ')
        .find((part) => part.startsWith('XSRF-TOKEN='))
        ?.split('=')[1] ?? '';
    time += 86_400_000;
    const requests = Array.from({ length: 12 }, () =>
      fetch(base + '/api/map-config', { headers: { cookie } }),
    );
    const logout = await fetch(base + '/api/auth/logout', {
      method: 'POST',
      headers: { cookie, origin: 'http://127.0.0.1:4200', 'x-xsrf-token': csrf },
    });
    expect(logout.status).toBe(204);
    const responses = await Promise.all(requests);
    await app.close();
    app = await createApplication(options);
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    for (const saved of [cookie, ...responses.map(responseCookies)]) {
      expect((await fetch(base + '/api/auth/me', { headers: { cookie: saved } })).status).toBe(401);
    }
  } finally {
    await app.close();
    await provider.close();
  }
});

it('signs in through a signed OIDC code exchange and retains identity after restarting the application', async () => {
  const provider = await startProvider();
  const options = { ignoreEnvFile: true, authentication: { provider: provider.configuration } };
  const app = await createApplication(options);
  let restarted: Awaited<ReturnType<typeof createApplication>> | undefined;
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const login = await signIn(base);
    expect(login.finish.status).toBe(302);
    expect(login.finish.headers.get('location')).toBe('/');
    const me = await fetch(base + '/api/auth/me', { headers: { cookie: login.cookie } });
    expect(me.status).toBe(200);
    const identity = await me.json();
    expect(identity).toMatchObject({ email: 'alice@example.test' });
    expect(JSON.stringify(identity)).not.toContain('never-sent-to-browser');
    await app.close();
    restarted = await createApplication(options);
    await restarted.listen(0, '127.0.0.1');
    expect(
      await (
        await fetch((await restarted.getUrl()) + '/api/auth/me', {
          headers: { cookie: login.cookie },
        })
      ).json(),
    ).toEqual(identity);
  } finally {
    await app.close();
    await restarted?.close();
    await provider.close();
  }
});

it('denies anonymous private endpoints and ownerless legacy assets while health remains public', async () => {
  const app = await createApplication({ ignoreEnvFile: true });
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    for (const path of [
      '/api/map-config',
      '/api/assets/legacy.jpg',
      '/api/assets/legacy.jpg/thumbnail',
      '/api/assets/legacy.jpg/metadata',
    ]) {
      expect((await fetch(base + path)).status).toBe(401);
    }
    expect((await fetch(base + '/api/health')).status).toBe(200);
  } finally {
    await app.close();
  }
});
