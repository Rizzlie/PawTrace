import { randomUUID } from 'node:crypto';
import { signIn } from './oidc-provider';

export const ORIGIN = 'http://127.0.0.1:4200';

/** A signed-in browser-like HTTP peer: cookie jar, CSRF echo and explicit idempotency keys. */
export class ApiClient {
  private readonly cookies = new Map<string, string>();

  private constructor(private readonly base: string) {}

  static async signIn(
    base: string,
    provider: { control: { subject: string; email: string } },
    subject: string,
  ) {
    provider.control.subject = subject;
    provider.control.email = `${subject}@example.test`;
    const client = new ApiClient(base);
    const login = await signIn(base);
    if (login.finish.headers.get('location') !== '/') throw new Error('Controlled login failed');
    client.remember(login.finish);
    client.remember(await fetch(base + '/api/auth/me', { headers: client.headers() }));
    return client;
  }

  private remember(response: Response) {
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const index = pair.indexOf('=');
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      origin: ORIGIN,
      'x-xsrf-token': this.cookies.get('XSRF-TOKEN') ?? '',
      ...extra,
    };
  }

  async request(
    method: string,
    path: string,
    options: { body?: unknown; version?: number | string; key?: string | null } = {},
  ) {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (options.version !== undefined) headers['if-match'] = `"${options.version}"`;
    const key = options.key === undefined ? randomUUID() : options.key;
    if (method !== 'GET' && key !== null) headers['idempotency-key'] = key;
    const response = await fetch(this.base + path, {
      method,
      headers: this.headers(headers),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    this.remember(response);
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : undefined, response };
  }

  async create(title: string, key?: string) {
    return this.request('POST', '/api/cases', {
      body: { title, timeZone: 'Europe/Warsaw' },
      key,
    });
  }

  async open(id: string) {
    return this.request('GET', '/api/cases/' + encodeURIComponent(id));
  }

  async save(id: string, version: number, document: unknown, key?: string) {
    return this.request('PUT', '/api/cases/' + encodeURIComponent(id), {
      body: { document },
      version,
      key,
    });
  }
}
