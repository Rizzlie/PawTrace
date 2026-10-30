import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createApplication } from '../src/application';
import { startProvider } from './oidc-provider';

/** Separate test executable. Never included in the production tsconfig/webpack entry. */
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Test host cannot run in production');
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://pawtrace_test:local-test-only@127.0.0.1:55432/pawtrace_test',
    SESSION_SECRET: 'test-session-secret-at-least-32-characters',
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    PUBLIC_ORIGIN: 'http://127.0.0.1:4200',
    WEB_ROOT: resolve('dist/apps/web/browser'),
    AUTH_EMAIL_ALLOWLIST: '',
    ASSET_DIRECTORY: resolve('tmp/p01-browser-assets'),
  });
  const provider = await startProvider(3901);
  let time = Date.now();
  const start = async () => {
    const app = await createApplication({
      ignoreEnvFile: true,
      authentication: { provider: provider.configuration, now: () => time },
    });
    await app.listen(4200, '127.0.0.1');
    return app;
  };
  let app = await start();
  const control = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1:3902');
      if (req.method !== 'POST') {
        res.writeHead(405).end();
        return;
      }
      if (url.pathname === '/restart') {
        await app.close();
        app = await start();
      } else if (url.pathname === '/advance') time += Number(url.searchParams.get('ms'));
      else if (url.pathname === '/provider') {
        provider.control.fault = url.searchParams.get('fault') ?? '';
        provider.control.verified = url.searchParams.get('verified') !== 'false';
        provider.control.subject = url.searchParams.get('subject') ?? 'alice';
        provider.control.email = provider.control.subject + '@example.test';
      } else {
        res.writeHead(404).end();
        return;
      }
      res.end('ok');
    } catch {
      res.writeHead(500).end();
    }
  });
  control.listen(3902, '127.0.0.1');
  const close = async () => {
    control.close();
    await app.close();
    await provider.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void close());
  process.once('SIGINT', () => void close());
}
void main().catch(() => {
  console.error('Authentication test host failed');
  process.exitCode = 1;
});
