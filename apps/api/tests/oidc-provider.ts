import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';

/** Real signed protocol peer, imported only by test entry points. No authenticated-request stub. */
export async function startProvider(port = 0) {
  const { exportJWK, generateKeyPair, SignJWT } = await import('jose');
  const oidc = await import('openid-client');
  const key = await generateKeyPair('RS256');
  const wrongKey = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(key.publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const codes = new Map<string, URLSearchParams>();
  const control = { subject: 'alice', email: 'alice@example.test', fault: '', verified: true };
  let issuer = '';
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', issuer);
      res.setHeader('content-type', 'application/json');
      if (url.pathname === '/.well-known/openid-configuration') {
        res.end(
          JSON.stringify({
            issuer,
            authorization_endpoint: issuer + '/authorize',
            token_endpoint: issuer + '/token',
            jwks_uri: issuer + '/jwks',
            response_types_supported: ['code'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
            token_endpoint_auth_methods_supported: ['client_secret_post'],
          }),
        );
      } else if (url.pathname === '/jwks') res.end(JSON.stringify({ keys: [jwk] }));
      else if (url.pathname === '/authorize') {
        const redirect = new URL(url.searchParams.get('redirect_uri') ?? '');
        const state = url.searchParams.get('state') ?? '';
        redirect.searchParams.set('state', control.fault === 'state' ? 'wrong-state' : state);
        if (control.fault === 'cancel') redirect.searchParams.set('error', 'access_denied');
        else {
          const code = randomUUID();
          if (control.fault === 'pkce') url.searchParams.set('code_challenge', 'wrong-challenge');
          codes.set(code, url.searchParams);
          redirect.searchParams.set('code', code);
        }
        res.writeHead(302, { location: redirect.href });
        res.end();
      } else if (url.pathname === '/token') {
        if (control.fault === 'failure') {
          res.writeHead(503);
          res.end('{}');
          return;
        }
        let body = '';
        for await (const chunk of req) body += chunk;
        const params = new URLSearchParams(body);
        const authorization = codes.get(params.get('code') ?? '');
        codes.delete(params.get('code') ?? '');
        const challenge = createHash('sha256')
          .update(params.get('code_verifier') ?? '')
          .digest('base64url');
        if (
          !authorization ||
          challenge !== authorization.get('code_challenge') ||
          params.get('client_secret') !== 'test-secret'
        ) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'invalid_grant' }));
          return;
        }
        const now = Math.floor(Date.now() / 1000);
        const token = await new SignJWT({
          email: control.email,
          email_verified: control.verified,
          nonce: control.fault === 'nonce' ? 'wrong' : authorization.get('nonce'),
        })
          .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
          .setIssuer(control.fault === 'issuer' ? 'https://wrong.example' : issuer)
          .setSubject(control.subject)
          .setAudience(control.fault === 'audience' ? 'wrong' : 'test-client')
          .setIssuedAt(now)
          .setExpirationTime(control.fault === 'expired' ? now - 3600 : now + 300)
          .sign(control.fault === 'signature' ? wrongKey.privateKey : key.privateKey);
        res.end(
          JSON.stringify({
            access_token: 'never-sent-to-browser',
            token_type: 'Bearer',
            id_token: token,
            expires_in: 300,
          }),
        );
      } else {
        res.writeHead(404);
        res.end('{}');
      }
    } catch {
      res.writeHead(500);
      res.end('{}');
    }
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing provider address');
  issuer = `http://127.0.0.1:${address.port}`;
  const configuration = await oidc.discovery(
    new URL(issuer),
    'test-client',
    'test-secret',
    oidc.ClientSecretPost('test-secret'),
    { execute: [oidc.allowInsecureRequests, oidc.enableNonRepudiationChecks] },
  );
  return {
    configuration,
    control,
    issuer,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

export function responseCookies(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

export async function signIn(base: string, headers: Record<string, string> = {}) {
  const start = await fetch(base + '/api/auth/login', { redirect: 'manual', headers });
  const binding = responseCookies(start);
  const authorization = await fetch(start.headers.get('location') ?? '', { redirect: 'manual' });
  const callback = authorization.headers.get('location') ?? '';
  const callbackRequest = new URL(callback);
  const finish = await fetch(base + callbackRequest.pathname + callbackRequest.search, {
    redirect: 'manual',
    headers: { ...headers, cookie: binding },
  });
  return { finish, cookie: responseCookies(finish), callback, binding };
}
