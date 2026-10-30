import { bigint, boolean, index, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'app_user',
  {
    id: uuid('id').primaryKey(),
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    email: text('email').notNull(),
  },
  (table) => [unique('app_user_issuer_subject_unique').on(table.issuer, table.subject)],
);

export const sessions = pgTable('app_session', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  csrf: text('csrf').notNull(),
  currentSid: text('current_sid').notNull(),
  rotatedAt: bigint('rotated_at', { mode: 'number' }).notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  revoked: boolean('revoked').notNull().default(false),
});

export const identifiers = pgTable(
  'session_identifier',
  {
    sid: text('sid').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    validUntil: bigint('valid_until', { mode: 'number' }),
  },
  (table) => [index('session_identifier_family').on(table.sessionId)],
);

export const flows = pgTable('oidc_flow', {
  state: text('state').primaryKey(),
  nonce: text('nonce').notNull(),
  verifier: text('verifier').notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
});
