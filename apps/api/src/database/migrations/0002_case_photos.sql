CREATE TABLE "photo_removal" (
	"storage_id" uuid PRIMARY KEY NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stored_photo" (
	"storage_id" uuid PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"filename" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stored_photo_filename" UNIQUE("case_id","filename")
);
--> statement-breakpoint
ALTER TABLE "stored_photo" ADD CONSTRAINT "stored_photo_case_id_owned_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."owned_case"("id") ON DELETE cascade ON UPDATE no action;