CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE TABLE "oidc_flow" (
	"state" text PRIMARY KEY NOT NULL,
	"nonce" text NOT NULL,
	"verifier" text NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_identifier" (
	"sid" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"valid_until" bigint
);
--> statement-breakpoint
CREATE TABLE "app_session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"csrf" text NOT NULL,
	"current_sid" text NOT NULL,
	"rotated_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"email" text NOT NULL,
	CONSTRAINT "app_user_issuer_subject_unique" UNIQUE("issuer","subject")
);
--> statement-breakpoint
ALTER TABLE "session_identifier" ADD CONSTRAINT "session_identifier_session_id_app_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."app_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_session" ADD CONSTRAINT "app_session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_identifier_family" ON "session_identifier" USING btree ("session_id");
