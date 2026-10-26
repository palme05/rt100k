CREATE TABLE "instrument_class" (
	"owner_id" text NOT NULL,
	"instrument_id" uuid NOT NULL,
	"country" text,
	"sector" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instrument_class_owner_id_instrument_id_pk" PRIMARY KEY("owner_id","instrument_id"),
	CONSTRAINT "instrument_class_country_check" CHECK ("instrument_class"."country" is null or char_length("instrument_class"."country") between 1 and 60),
	CONSTRAINT "instrument_class_sector_check" CHECK ("instrument_class"."sector" is null or char_length("instrument_class"."sector") between 1 and 60),
	CONSTRAINT "instrument_class_any_check" CHECK ("instrument_class"."country" is not null or "instrument_class"."sector" is not null)
);
--> statement-breakpoint
ALTER TABLE "instrument_class" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "etf_breakdown" ADD COLUMN "holdings" jsonb;--> statement-breakpoint
ALTER TABLE "etf_breakdown" ADD COLUMN "country_basis" text;--> statement-breakpoint
ALTER TABLE "etf_breakdown" ADD COLUMN "china_fixes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "instrument_class" ADD CONSTRAINT "instrument_class_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrument_class" ADD CONSTRAINT "instrument_class_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "instrument_class_instrument_idx" ON "instrument_class" USING btree ("instrument_id");--> statement-breakpoint
ALTER TABLE "etf_breakdown" ADD CONSTRAINT "etf_breakdown_basis_check" CHECK ("etf_breakdown"."country_basis" is null or "etf_breakdown"."country_basis" in ('herkunft', 'boerse'));--> statement-breakpoint
ALTER TABLE "etf_breakdown" ADD CONSTRAINT "etf_breakdown_fixes_check" CHECK ("etf_breakdown"."china_fixes" between 0 and 20000);--> statement-breakpoint
CREATE POLICY "instrument_class_owner" ON "instrument_class" AS PERMISSIVE FOR ALL TO "rt100k_app" USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());