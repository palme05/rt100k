CREATE TABLE "csv_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "csv_mapping_name_check" CHECK (char_length("csv_mapping"."name") between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "csv_mapping" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "import_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"file_hash" text NOT NULL,
	"source" text NOT NULL,
	"bookings" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_file_hash_check" CHECK ("import_file"."file_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "import_file_source_check" CHECK ("import_file"."source" in ('traderepublic', 'flatex', 'bitpanda', 'csv')),
	CONSTRAINT "import_file_bookings_check" CHECK ("import_file"."bookings" >= 0)
);
--> statement-breakpoint
ALTER TABLE "import_file" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "import_key" text;--> statement-breakpoint
ALTER TABLE "csv_mapping" ADD CONSTRAINT "csv_mapping_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_file" ADD CONSTRAINT "import_file_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "csv_mapping_owner_name_idx" ON "csv_mapping" USING btree ("owner_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "import_file_owner_hash_idx" ON "import_file" USING btree ("owner_id","file_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_import_key_idx" ON "booking" USING btree ("owner_id","import_key");--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_source_check" CHECK ("booking"."source" in ('manual', 'import'));--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_import_key_check" CHECK ("booking"."import_key" is null or "booking"."import_key" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
CREATE POLICY "csv_mapping_owner" ON "csv_mapping" AS PERMISSIVE FOR ALL TO "rt100k_app" USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());--> statement-breakpoint
CREATE POLICY "import_file_owner" ON "import_file" AS PERMISSIVE FOR ALL TO "rt100k_app" USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());