import session from 'express-session';
import { randomBytes } from 'node:crypto';
import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import type { Database } from './database';
import { identifiers, sessions } from './schema';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    csrf?: string;
    activity?: number;
  }
}
export const INACTIVITY_MS = 7 * 24 * 60 * 60 * 1000;
const ROTATION_MS = 24 * 60 * 60 * 1000;
const OVERLAP_MS = 60_000;
export const opaque = () => randomBytes(32).toString('base64url');

/** Maintained cookie/session middleware, backed by a transactional Drizzle adapter. */
export class PostgresSessions extends session.Store {
  constructor(
    private readonly db: Database,
    private readonly now: () => number,
    private readonly secure: boolean,
  ) {
    super();
  }

  override get(
    sid: string,
    callback: (error: unknown, value?: session.SessionData | null) => void,
  ): void {
    const now = this.now();
    void this.db
      .select({ userId: sessions.userId, csrf: sessions.csrf })
      .from(identifiers)
      .innerJoin(sessions, eq(sessions.id, identifiers.sessionId))
      .where(
        and(
          eq(identifiers.sid, sid),
          eq(sessions.revoked, false),
          gt(sessions.expiresAt, now),
          or(isNull(identifiers.validUntil), gt(identifiers.validUntil, now)),
        ),
      )
      .then(
        (rows) =>
          callback(
            null,
            rows[0]
              ? {
                  cookie: {
                    originalMaxAge: INACTIVITY_MS,
                    maxAge: INACTIVITY_MS,
                    httpOnly: true,
                    secure: this.secure,
                    path: '/',
                    sameSite: 'lax',
                  },
                  ...rows[0],
                }
              : null,
          ),
        callback,
      );
  }

  override set(
    sid: string,
    value: session.SessionData,
    callback?: (error?: unknown) => void,
  ): void {
    // Existing families are immutable here: delayed responses cannot undo revocation,
    // extend expiry or overwrite another tab's rotation. Retain identifiers as tombstones.
    void this.db
      .transaction(async (tx) => {
        const existing = await tx
          .select({ sid: identifiers.sid })
          .from(identifiers)
          .where(eq(identifiers.sid, sid));
        if (existing.length || !value.userId || !value.csrf) return;
        const now = this.now();
        await tx.insert(sessions).values({
          id: sid,
          userId: value.userId,
          csrf: value.csrf,
          currentSid: sid,
          rotatedAt: now,
          expiresAt: now + INACTIVITY_MS,
        });
        await tx.insert(identifiers).values({ sid, sessionId: sid });
      })
      .then(
        () => callback?.(),
        (error) => callback?.(error),
      );
  }

  override destroy(sid: string, callback?: (error?: unknown) => void): void {
    void this.db
      .update(sessions)
      .set({ revoked: true })
      .where(
        inArray(
          sessions.id,
          this.db
            .select({ id: identifiers.sessionId })
            .from(identifiers)
            .where(eq(identifiers.sid, sid)),
        ),
      )
      .then(
        () => callback?.(),
        (error) => callback?.(error),
      );
  }

  override touch(_sid: string, _value: session.SessionData, callback?: () => void): void {
    callback?.();
  }

  /** Serialize activity, rotation and logout on one durable family row. */
  async accept(sid: string, revoke = false): Promise<string | null> {
    return this.db.transaction(async (tx) => {
      const [found] = await tx
        .select({ session: sessions, validUntil: identifiers.validUntil })
        .from(identifiers)
        .innerJoin(sessions, eq(sessions.id, identifiers.sessionId))
        .where(eq(identifiers.sid, sid))
        .for('update', { of: sessions });
      const now = this.now();
      if (
        !found ||
        found.session.revoked ||
        found.session.expiresAt <= now ||
        (found.validUntil !== null && found.validUntil <= now)
      )
        return null;
      const row = found.session;
      if (revoke) {
        await tx.update(sessions).set({ revoked: true }).where(eq(sessions.id, row.id));
        return row.currentSid;
      }
      let current = row.currentSid;
      if (now - row.rotatedAt >= ROTATION_MS) {
        current = opaque();
        await tx
          .update(identifiers)
          .set({ validUntil: now + OVERLAP_MS })
          .where(eq(identifiers.sid, row.currentSid));
        await tx.insert(identifiers).values({ sid: current, sessionId: row.id });
        await tx
          .update(sessions)
          .set({ currentSid: current, rotatedAt: now })
          .where(eq(sessions.id, row.id));
      }
      await tx
        .update(sessions)
        .set({ expiresAt: now + INACTIVITY_MS })
        .where(eq(sessions.id, row.id));
      return current;
    });
  }
}
