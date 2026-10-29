import type { NextFunction, Request, RequestHandler, Response } from 'express';
import session from 'express-session';
import type { Configuration } from 'openid-client' with { 'resolution-mode': 'import' };
import { randomUUID } from 'node:crypto';
import { eq, lte, sql } from 'drizzle-orm';
import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Environment } from '../app/environment';
import { openDatabase } from './database';
import { flows, users } from './schema';
import { INACTIVITY_MS, opaque, PostgresSessions } from './session-store';

export type AuthenticationDependencies = { provider?: Configuration; now?: () => number };
type Settings = Pick<
  Environment,
  | 'NODE_ENV'
  | 'DATABASE_URL'
  | 'PUBLIC_ORIGIN'
  | 'SESSION_SECRET'
  | 'GOOGLE_CLIENT_ID'
  | 'GOOGLE_CLIENT_SECRET'
  | 'AUTH_EMAIL_ALLOWLIST'
>;

/** Nest-owned module implementation: OIDC and durable session lifecycle behind HTTP. */
export class Authentication implements OnApplicationShutdown {
  private readonly now: () => number;
  private readonly secure: boolean;
  private readonly name: string;
  private readonly flowName: string;
  private readonly cookieOptions;
  private readonly store?: PostgresSessions;
  private readonly sessionMiddleware?: RequestHandler;
  private configuration?: Configuration;
  private closed = false;

  private constructor(
    private readonly env: Settings,
    private readonly database: Awaited<ReturnType<typeof openDatabase>> | undefined,
    dependencies: AuthenticationDependencies,
  ) {
    this.now = dependencies.now ?? Date.now;
    this.configuration = dependencies.provider;
    this.secure = new URL(env.PUBLIC_ORIGIN).protocol === 'https:';
    this.name = this.secure ? '__Host-pawtrace' : 'pawtrace';
    this.flowName = this.secure ? '__Host-pawtrace-login' : 'pawtrace-login';
    this.cookieOptions = {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'lax' as const,
      path: '/',
    };
    if (database) {
      this.store = new PostgresSessions(database.db, this.now, this.secure);
      this.sessionMiddleware = session({
        name: this.name,
        secret: env.SESSION_SECRET,
        store: this.store,
        resave: false,
        saveUninitialized: false,
        rolling: false,
        cookie: { ...this.cookieOptions, maxAge: INACTIVITY_MS },
      });
    }
  }

  static async create(env: Settings, dependencies: AuthenticationDependencies = {}) {
    if (env.NODE_ENV === 'production' && (dependencies.provider || dependencies.now))
      throw new Error('Controlled authentication dependencies are unavailable in production');
    return new Authentication(
      env,
      env.DATABASE_URL ? await openDatabase(env.DATABASE_URL) : undefined,
      dependencies,
    );
  }

  async onApplicationShutdown() {
    if (!this.closed) {
      this.closed = true;
      await this.database?.close();
    }
  }

  middleware(req: Request, res: Response, next: NextFunction) {
    const path = new URL(req.originalUrl, 'http://localhost').pathname;
    if (
      !path.startsWith('/api/') ||
      ['/api/health', '/api/ready', '/api/auth/login'].includes(path)
    ) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    if (!this.sessionMiddleware) {
      next();
      return;
    }
    this.sessionMiddleware(req, res, (error?: unknown) =>
      error ? next(new ServiceUnavailableException({ error: 'session_unavailable' })) : next(),
    );
  }

  async ready() {
    try {
      if (!this.database) throw new Error('Not configured');
      await this.database.db.execute(sql`SELECT 1`);
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException({ error: 'database_unavailable' });
    }
  }

  private async provider() {
    const oidc = await import('openid-client');
    this.configuration ??= await oidc.discovery(
      new URL('https://accounts.google.com'),
      this.env.GOOGLE_CLIENT_ID,
      { client_secret: this.env.GOOGLE_CLIENT_SECRET, id_token_signed_response_alg: 'RS256' },
      oidc.ClientSecretPost(this.env.GOOGLE_CLIENT_SECRET),
      { execute: [oidc.enableNonRepudiationChecks], timeout: 10 },
    );
    return this.configuration;
  }

  async login(res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!this.database) throw new Error('Not configured');
      const oidc = await import('openid-client');
      const config = await this.provider();
      const state = oidc.randomState(),
        nonce = oidc.randomNonce(),
        verifier = oidc.randomPKCECodeVerifier();
      await this.database.db.delete(flows).where(lte(flows.expiresAt, this.now()));
      await this.database.db
        .insert(flows)
        .values({ state, nonce, verifier, expiresAt: this.now() + 600_000 });
      res.cookie(this.flowName, state, { ...this.cookieOptions, maxAge: 600_000 });
      res.redirect(
        oidc.buildAuthorizationUrl(config, {
          redirect_uri: this.env.PUBLIC_ORIGIN + '/api/auth/callback',
          scope: 'openid email',
          state,
          nonce,
          code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
          code_challenge_method: 'S256',
        }).href,
      );
    } catch {
      res.redirect('/?login=failed');
    }
  }

  async callback(req: Request, res: Response) {
    res.clearCookie(this.flowName, this.cookieOptions);
    try {
      if (!this.database) throw new Error('Not configured');
      const url = new URL(req.originalUrl, this.env.PUBLIC_ORIGIN);
      const states = url.searchParams.getAll('state');
      const bindings = (req.headers.cookie ?? '')
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part.startsWith(this.flowName + '='));
      if (
        states.length !== 1 ||
        bindings.length !== 1 ||
        bindings[0] !== this.flowName + '=' + states[0]
      )
        throw new Error('Invalid login binding');
      const [flow] = await this.database.db
        .delete(flows)
        .where(eq(flows.state, states[0]))
        .returning();
      if (!flow || flow.expiresAt <= this.now()) throw new Error('Expired login');
      if (url.searchParams.get('error') === 'access_denied') {
        res.redirect('/?login=cancelled');
        return;
      }
      const oidc = await import('openid-client');
      const tokens = await oidc.authorizationCodeGrant(await this.provider(), url, {
        expectedState: states[0],
        expectedNonce: flow.nonce,
        pkceCodeVerifier: flow.verifier,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      const allowed = this.env.AUTH_EMAIL_ALLOWLIST.split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
      if (
        !claims ||
        typeof claims.sub !== 'string' ||
        !claims.sub ||
        typeof claims.email !== 'string' ||
        claims.email_verified !== true ||
        (allowed.length && !allowed.includes(claims.email.toLowerCase()))
      ) {
        res.redirect('/?login=denied');
        return;
      }
      const [user] = await this.database.db
        .insert(users)
        .values({ id: randomUUID(), issuer: claims.iss, subject: claims.sub, email: claims.email })
        .onConflictDoUpdate({ target: [users.issuer, users.subject], set: { email: claims.email } })
        .returning({ id: users.id });
      await new Promise<void>((resolve, reject) =>
        req.session.regenerate((error) => (error ? reject(error) : resolve())),
      );
      req.session.userId = user.id;
      req.session.csrf = opaque();
      await new Promise<void>((resolve, reject) =>
        req.session.save((error) => (error ? reject(error) : resolve())),
      );
      res.redirect('/');
    } catch {
      res.redirect('/?login=failed');
    }
  }

  async authorize(req: Request, res: Response, ownerless: boolean, activity: boolean) {
    if (!req.session?.userId || !this.store) {
      const hadCookie = (req.headers.cookie ?? '')
        .split(';')
        .some((part) => part.trim().startsWith(this.name + '='));
      throw new UnauthorizedException({
        error: hadCookie ? 'session_expired' : 'authentication_required',
      });
    }
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (req.headers.origin !== this.env.PUBLIC_ORIGIN ||
        req.headers['x-xsrf-token'] !== req.session.csrf)
    )
      throw new ForbiddenException({ error: 'csrf_rejected' });
    if (ownerless) throw new NotFoundException({ error: 'not_found' });
    if (activity) await this.accept(req, res);
  }

  private async accept(req: Request, res: Response, revoke = false) {
    let sid: string | null;
    try {
      sid = (await this.store?.accept(req.sessionID, revoke)) ?? null;
    } catch {
      throw new ServiceUnavailableException({ error: 'session_unavailable' });
    }
    if (!sid) throw new UnauthorizedException({ error: 'session_expired' });
    req.sessionID = sid;
    if (req.session.id !== sid)
      this.store?.createSession(req, {
        cookie: req.session.cookie,
        userId: req.session.userId,
        csrf: req.session.csrf,
      });
    if (!revoke) {
      req.session.activity = this.now();
      req.session.cookie.maxAge = INACTIVITY_MS;
      res.cookie('XSRF-TOKEN', req.session.csrf, {
        path: '/',
        secure: this.secure,
        sameSite: 'strict',
        maxAge: INACTIVITY_MS,
      });
    }
  }

  async logout(req: Request, res: Response) {
    await this.accept(req, res, true);
    await new Promise<void>((resolve, reject) =>
      req.session.destroy((error) =>
        error
          ? reject(new ServiceUnavailableException({ error: 'session_unavailable' }))
          : resolve(),
      ),
    );
    res.clearCookie(this.name, this.cookieOptions);
    res.clearCookie('XSRF-TOKEN', { path: '/', secure: this.secure, sameSite: 'strict' });
  }

  async me(req: Request) {
    if (!this.database || !req.session.userId)
      throw new UnauthorizedException({ error: 'session_expired' });
    try {
      const [user] = await this.database.db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, req.session.userId));
      return user;
    } catch {
      throw new ServiceUnavailableException({ error: 'session_unavailable' });
    }
  }
}
