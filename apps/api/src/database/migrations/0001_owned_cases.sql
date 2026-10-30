CREATE TABLE "action_detail" (
	"case_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"type" text DEFAULT 'action' NOT NULL,
	"details_fields" text[],
	"action_kind" text,
	"food_type" text,
	"food_quantity_value" double precision,
	"food_quantity_unit" text,
	CONSTRAINT "action_detail_case_id_entry_id_pk" PRIMARY KEY("case_id","entry_id"),
	CONSTRAINT "action_entry_type" CHECK ("action_detail"."type" = 'action'),
	CONSTRAINT "action_detail_fields" CHECK ("action_detail"."details_fields" <@ ARRAY['kind', 'foodType', 'foodQuantity']::text[]),
	CONSTRAINT "action_quantity_pair" CHECK (("action_detail"."food_quantity_value" IS NULL) = ("action_detail"."food_quantity_unit" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "animal_profile" (
	"case_id" text PRIMARY KEY NOT NULL,
	"record_id" text NOT NULL,
	"present_fields" text[] NOT NULL,
	"name" text,
	"species" text,
	"breed" text,
	"coat_color" text,
	"coat_pattern" text,
	"size" text,
	"distinguishing_features" text,
	"collar_harness" text,
	"microchip_number" text,
	"illnesses" text,
	"injuries" text,
	"mobility_limitations" text,
	"sensory_limitations" text,
	"medication" text,
	"temperament" text,
	"reactions_to_people" text,
	"reactions_to_animals" text,
	"fears" text,
	"response_to_calls" text,
	"attraction_methods" text,
	"favorite_food" text,
	"usual_routes" text,
	"usual_places" text,
	"previous_escapes" text,
	"additional_information" text,
	"neutered" boolean,
	"microchipped" boolean,
	"familiar_with_area" boolean,
	"sex" text,
	"outdoor_access" text,
	"age_value" double precision,
	"age_unit" text,
	"age_approximate" boolean,
	"weight_kilograms" double precision,
	"main_photo" text,
	CONSTRAINT "animal_profile_case_record" CHECK ("animal_profile"."record_id" = "animal_profile"."case_id"),
	CONSTRAINT "animal_profile_fields" CHECK ("animal_profile"."present_fields" <@ ARRAY['name', 'species', 'breed', 'coatColor', 'coatPattern', 'size', 'distinguishingFeatures', 'collarHarness', 'microchipNumber', 'illnesses', 'injuries', 'mobilityLimitations', 'sensoryLimitations', 'medication', 'temperament', 'reactionsToPeople', 'reactionsToAnimals', 'fears', 'responseToCalls', 'attractionMethods', 'favoriteFood', 'usualRoutes', 'usualPlaces', 'previousEscapes', 'additionalInformation', 'neutered', 'microchipped', 'familiarWithArea', 'sex', 'outdoorAccess', 'age', 'weightKilograms', 'photos', 'mainPhoto', 'photoCaptions']::text[]),
	CONSTRAINT "animal_profile_age" CHECK (("animal_profile"."age_value" IS NULL) = ("animal_profile"."age_unit" IS NULL) AND ("animal_profile"."age_unit" IS NULL) = ("animal_profile"."age_approximate" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "area_check" (
	"case_id" text NOT NULL,
	"id" text NOT NULL,
	"kind" text DEFAULT 'area_check' NOT NULL,
	"area_id" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"description" text,
	"result" text,
	"observation_entry_id" text,
	"observation_type" text DEFAULT 'observation' NOT NULL,
	"method" text,
	"actual_shape" text NOT NULL,
	"actual_center" geometry(Point,4326),
	"actual_radius_meters" double precision,
	"actual_vertices" geometry(Polygon,4326),
	CONSTRAINT "area_check_case_id_id_pk" PRIMARY KEY("case_id","id"),
	CONSTRAINT "area_check_position" UNIQUE("case_id","area_id","position"),
	CONSTRAINT "area_check_kind" CHECK ("area_check"."kind" = 'area_check'),
	CONSTRAINT "area_check_observation_type" CHECK ("area_check"."observation_type" = 'observation'),
	CONSTRAINT "area_check_result_known" CHECK ("area_check"."result" IS NULL OR "area_check"."result" IN ('no_animal_or_signs', 'possible_signs', 'animal_seen', 'animal_secured', 'unable_to_check', 'other_or_inconclusive')),
	CONSTRAINT "area_check_animal_seen_link" CHECK (("area_check"."result" IS NOT DISTINCT FROM 'animal_seen') = ("area_check"."observation_entry_id" IS NOT NULL)),
	CONSTRAINT "area_check_actual_geometry" CHECK (CASE "area_check"."actual_shape"
      WHEN 'circle' THEN "area_check"."actual_center" IS NOT NULL AND "area_check"."actual_radius_meters" IS NOT NULL AND "area_check"."actual_vertices" IS NULL
      WHEN 'polygon' THEN "area_check"."actual_vertices" IS NOT NULL AND "area_check"."actual_center" IS NULL AND "area_check"."actual_radius_meters" IS NULL
      ELSE false END)
);
--> statement-breakpoint
CREATE TABLE "case_escape" (
	"case_id" text PRIMARY KEY NOT NULL,
	"record_id" text NOT NULL,
	"escape_point_id" text,
	"description" text,
	"direction_of_travel" text,
	"familiar_with_location" boolean,
	CONSTRAINT "case_escape_case_record" CHECK ("case_escape"."record_id" = "case_escape"."case_id")
);
--> statement-breakpoint
CREATE TABLE "case_mutation" (
	"owner_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"operation" text NOT NULL,
	"case_id" text NOT NULL,
	"result_version" integer,
	"saved_at" timestamp with time zone,
	"committed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_mutation_owner_id_idempotency_key_pk" PRIMARY KEY("owner_id","idempotency_key"),
	CONSTRAINT "case_mutation_operation" CHECK ("case_mutation"."operation" IN ('create', 'save', 'rename', 'delete'))
);
--> statement-breakpoint
CREATE TABLE "case_record" (
	"case_id" text NOT NULL,
	"id" text NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "case_record_case_id_id_pk" PRIMARY KEY("case_id","id"),
	CONSTRAINT "case_record_kind" UNIQUE("case_id","id","kind"),
	CONSTRAINT "case_record_kind_known" CHECK ("case_record"."kind" IN ('case', 'point', 'entry', 'area', 'area_check'))
);
--> statement-breakpoint
CREATE TABLE "event_time" (
	"case_id" text NOT NULL,
	"record_id" text NOT NULL,
	"kind" text NOT NULL,
	"at" text,
	"range_start" text,
	"range_end" text,
	"date" text,
	"description" text,
	CONSTRAINT "event_time_case_id_record_id_pk" PRIMARY KEY("case_id","record_id"),
	CONSTRAINT "event_time_variant" CHECK (CASE "event_time"."kind"
        WHEN 'exact' THEN "event_time"."at" IS NOT NULL AND "event_time"."range_start" IS NULL AND "event_time"."range_end" IS NULL AND "event_time"."date" IS NULL
        WHEN 'approximate' THEN "event_time"."at" IS NOT NULL AND "event_time"."range_start" IS NULL AND "event_time"."range_end" IS NULL AND "event_time"."date" IS NULL
        WHEN 'range' THEN "event_time"."at" IS NULL AND "event_time"."date" IS NULL AND ("event_time"."range_start" IS NOT NULL OR "event_time"."range_end" IS NOT NULL)
        WHEN 'date' THEN "event_time"."date" IS NOT NULL AND "event_time"."at" IS NULL AND "event_time"."range_start" IS NULL AND "event_time"."range_end" IS NULL
        WHEN 'unknown' THEN "event_time"."at" IS NULL AND "event_time"."range_start" IS NULL AND "event_time"."range_end" IS NULL AND "event_time"."date" IS NULL
        ELSE false END)
);
--> statement-breakpoint
CREATE TABLE "history_entry" (
	"case_id" text NOT NULL,
	"id" text NOT NULL,
	"kind" text DEFAULT 'entry' NOT NULL,
	"point_id" text NOT NULL,
	"position" integer NOT NULL,
	"type" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"description" text,
	"status" text NOT NULL,
	"rejection_reason" text,
	CONSTRAINT "history_entry_case_id_id_pk" PRIMARY KEY("case_id","id"),
	CONSTRAINT "history_entry_type" UNIQUE("case_id","id","type"),
	CONSTRAINT "history_entry_position" UNIQUE("case_id","point_id","position"),
	CONSTRAINT "history_entry_kind" CHECK ("history_entry"."kind" = 'entry'),
	CONSTRAINT "history_entry_type_known" CHECK ("history_entry"."type" IN ('observation', 'action', 'check', 'note')),
	CONSTRAINT "history_entry_status" CHECK (("history_entry"."status" = 'active' AND "history_entry"."rejection_reason" IS NULL)
        OR ("history_entry"."type" = 'observation' AND "history_entry"."status" = 'rejected' AND "history_entry"."rejection_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "observation_detail" (
	"case_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"type" text DEFAULT 'observation' NOT NULL,
	"source" text,
	"source_description" text,
	"uncertainty_radius_meters" double precision,
	"identification" text NOT NULL,
	CONSTRAINT "observation_detail_case_id_entry_id_pk" PRIMARY KEY("case_id","entry_id"),
	CONSTRAINT "observation_entry_type" CHECK ("observation_detail"."type" = 'observation'),
	CONSTRAINT "observation_source_known" CHECK ("observation_detail"."source" IS NULL OR "observation_detail"."source" IN ('personal_observation', 'another_person', 'surveillance', 'other')),
	CONSTRAINT "observation_identification_known" CHECK ("observation_detail"."identification" IN ('target_animal', 'different_animal', 'uncertain'))
);
--> statement-breakpoint
CREATE TABLE "owned_case" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"time_zone" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"map_center" geometry(Point,4326) NOT NULL,
	"map_zoom" double precision NOT NULL,
	"map_basemap" text NOT NULL,
	CONSTRAINT "owned_case_version_positive" CHECK ("owned_case"."version" > 0),
	CONSTRAINT "owned_case_basemap" CHECK ("owned_case"."map_basemap" IN ('osm', 'satellite'))
);
--> statement-breakpoint
CREATE TABLE "photo_asset" (
	"case_id" text NOT NULL,
	"position" integer NOT NULL,
	"filename" text NOT NULL,
	"original_name" text,
	"media_type" text,
	"size_bytes" bigint,
	"width_pixels" bigint,
	"height_pixels" bigint,
	"thumbnail_filename" text,
	"preview_filename" text,
	CONSTRAINT "photo_asset_case_id_filename_pk" PRIMARY KEY("case_id","filename"),
	CONSTRAINT "photo_asset_position" UNIQUE("case_id","position")
);
--> statement-breakpoint
CREATE TABLE "photo_caption" (
	"case_id" text NOT NULL,
	"record_id" text NOT NULL,
	"position" integer NOT NULL,
	"filename" text NOT NULL,
	"caption" text NOT NULL,
	CONSTRAINT "photo_caption_case_id_filename_pk" PRIMARY KEY("case_id","filename"),
	CONSTRAINT "photo_caption_position" UNIQUE("case_id","position"),
	CONSTRAINT "photo_caption_case_record" CHECK ("photo_caption"."record_id" = "photo_caption"."case_id")
);
--> statement-breakpoint
CREATE TABLE "photo_reference" (
	"case_id" text NOT NULL,
	"record_id" text NOT NULL,
	"position" integer NOT NULL,
	"filename" text NOT NULL,
	CONSTRAINT "photo_reference_case_id_record_id_position_pk" PRIMARY KEY("case_id","record_id","position"),
	CONSTRAINT "photo_reference_filename" UNIQUE("case_id","record_id","filename")
);
--> statement-breakpoint
CREATE TABLE "point_check_detail" (
	"case_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"type" text DEFAULT 'check' NOT NULL,
	"result" text,
	"observation_entry_id" text,
	"observation_type" text DEFAULT 'observation' NOT NULL,
	"method" text,
	"details_fields" text[],
	"food_status" text,
	CONSTRAINT "point_check_detail_case_id_entry_id_pk" PRIMARY KEY("case_id","entry_id"),
	CONSTRAINT "check_entry_type" CHECK ("point_check_detail"."type" = 'check'),
	CONSTRAINT "point_check_observation_type" CHECK ("point_check_detail"."observation_type" = 'observation'),
	CONSTRAINT "point_check_result_known" CHECK ("point_check_detail"."result" IS NULL OR "point_check_detail"."result" IN ('no_animal_or_signs', 'possible_signs', 'animal_seen', 'animal_secured', 'unable_to_check', 'other_or_inconclusive')),
	CONSTRAINT "point_check_animal_seen_link" CHECK (("point_check_detail"."result" IS NOT DISTINCT FROM 'animal_seen') = ("point_check_detail"."observation_entry_id" IS NOT NULL)),
	CONSTRAINT "point_check_detail_fields" CHECK ("point_check_detail"."details_fields" <@ ARRAY['foodStatus']::text[])
);
--> statement-breakpoint
CREATE TABLE "point_role" (
	"case_id" text NOT NULL,
	"point_id" text NOT NULL,
	"position" integer NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "point_role_case_id_point_id_position_pk" PRIMARY KEY("case_id","point_id","position"),
	CONSTRAINT "point_role_unique" UNIQUE("case_id","point_id","role"),
	CONSTRAINT "point_role_known" CHECK ("point_role"."role" IN ('potential_hiding_place', 'feeding_location', 'trail_camera', 'other'))
);
--> statement-breakpoint
CREATE TABLE "point" (
	"case_id" text NOT NULL,
	"id" text NOT NULL,
	"kind" text DEFAULT 'point' NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"location" geometry(Point,4326) NOT NULL,
	"description" text,
	CONSTRAINT "point_case_id_id_pk" PRIMARY KEY("case_id","id"),
	CONSTRAINT "point_position" UNIQUE("case_id","position"),
	CONSTRAINT "point_kind" CHECK ("point"."kind" = 'point')
);
--> statement-breakpoint
CREATE TABLE "search_area" (
	"case_id" text NOT NULL,
	"id" text NOT NULL,
	"kind" text DEFAULT 'area' NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"planned_shape" text,
	"planned_center" geometry(Point,4326),
	"planned_radius_meters" double precision,
	"planned_vertices" geometry(Polygon,4326),
	CONSTRAINT "search_area_case_id_id_pk" PRIMARY KEY("case_id","id"),
	CONSTRAINT "search_area_position" UNIQUE("case_id","position"),
	CONSTRAINT "search_area_kind" CHECK ("search_area"."kind" = 'area'),
	CONSTRAINT "search_area_planned_geometry" CHECK (CASE "search_area"."planned_shape"
      WHEN 'circle' THEN "search_area"."planned_center" IS NOT NULL AND "search_area"."planned_radius_meters" IS NOT NULL AND "search_area"."planned_vertices" IS NULL
      WHEN 'polygon' THEN "search_area"."planned_vertices" IS NOT NULL AND "search_area"."planned_center" IS NULL AND "search_area"."planned_radius_meters" IS NULL
      ELSE "search_area"."planned_shape" IS NULL AND "search_area"."planned_center" IS NULL AND "search_area"."planned_radius_meters" IS NULL AND "search_area"."planned_vertices" IS NULL END)
);
--> statement-breakpoint
ALTER TABLE "action_detail" ADD CONSTRAINT "action_detail_entry_fk" FOREIGN KEY ("case_id","entry_id","type") REFERENCES "public"."history_entry"("case_id","id","type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_profile" ADD CONSTRAINT "animal_profile_record_fk" FOREIGN KEY ("case_id","record_id") REFERENCES "public"."case_record"("case_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_profile" ADD CONSTRAINT "animal_profile_main_photo_fk" FOREIGN KEY ("case_id","record_id","main_photo") REFERENCES "public"."photo_reference"("case_id","record_id","filename") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_check" ADD CONSTRAINT "area_check_record_fk" FOREIGN KEY ("case_id","id","kind") REFERENCES "public"."case_record"("case_id","id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_check" ADD CONSTRAINT "area_check_area_fk" FOREIGN KEY ("case_id","area_id") REFERENCES "public"."search_area"("case_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_check" ADD CONSTRAINT "area_check_observation_fk" FOREIGN KEY ("case_id","observation_entry_id","observation_type") REFERENCES "public"."history_entry"("case_id","id","type") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_escape" ADD CONSTRAINT "case_escape_record_fk" FOREIGN KEY ("case_id","record_id") REFERENCES "public"."case_record"("case_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_escape" ADD CONSTRAINT "case_escape_point_fk" FOREIGN KEY ("case_id","escape_point_id") REFERENCES "public"."point"("case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_mutation" ADD CONSTRAINT "case_mutation_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_record" ADD CONSTRAINT "case_record_case_id_owned_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."owned_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_time" ADD CONSTRAINT "event_time_record_fk" FOREIGN KEY ("case_id","record_id") REFERENCES "public"."case_record"("case_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_entry" ADD CONSTRAINT "history_entry_record_fk" FOREIGN KEY ("case_id","id","kind") REFERENCES "public"."case_record"("case_id","id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_entry" ADD CONSTRAINT "history_entry_point_fk" FOREIGN KEY ("case_id","point_id") REFERENCES "public"."point"("case_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_detail" ADD CONSTRAINT "observation_detail_entry_fk" FOREIGN KEY ("case_id","entry_id","type") REFERENCES "public"."history_entry"("case_id","id","type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owned_case" ADD CONSTRAINT "owned_case_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_asset" ADD CONSTRAINT "photo_asset_case_id_owned_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."owned_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_caption" ADD CONSTRAINT "photo_caption_photo_fk" FOREIGN KEY ("case_id","record_id","filename") REFERENCES "public"."photo_reference"("case_id","record_id","filename") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_reference" ADD CONSTRAINT "photo_reference_record_fk" FOREIGN KEY ("case_id","record_id") REFERENCES "public"."case_record"("case_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_check_detail" ADD CONSTRAINT "check_detail_entry_fk" FOREIGN KEY ("case_id","entry_id","type") REFERENCES "public"."history_entry"("case_id","id","type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_check_detail" ADD CONSTRAINT "point_check_observation_fk" FOREIGN KEY ("case_id","observation_entry_id","observation_type") REFERENCES "public"."history_entry"("case_id","id","type") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_role" ADD CONSTRAINT "point_role_point_fk" FOREIGN KEY ("case_id","point_id") REFERENCES "public"."point"("case_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point" ADD CONSTRAINT "point_record_fk" FOREIGN KEY ("case_id","id","kind") REFERENCES "public"."case_record"("case_id","id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_area" ADD CONSTRAINT "search_area_record_fk" FOREIGN KEY ("case_id","id","kind") REFERENCES "public"."case_record"("case_id","id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "owned_case_owner" ON "owned_case" USING btree ("owner_id","saved_at");