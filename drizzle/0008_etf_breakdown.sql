CREATE TABLE "etf_breakdown" (
	"owner_id" text NOT NULL,
	"instrument_id" uuid NOT NULL,
	"fund_name" text,
	"as_of" date,
	"rows" integer NOT NULL,
	"countries" jsonb NOT NULL,
	"sectors" jsonb NOT NULL,
	"top" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "etf_breakdown_owner_id_instrument_id_pk" PRIMARY KEY("owner_id","instrument_id"),
	CONSTRAINT "etf_breakdown_rows_check" CHECK ("etf_breakdown"."rows" between 1 and 20000),
	CONSTRAINT "etf_breakdown_name_check" CHECK ("etf_breakdown"."fund_name" is null or char_length("etf_breakdown"."fund_name") <= 120)
);
--> statement-breakpoint
ALTER TABLE "etf_breakdown" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "etf_breakdown" ADD CONSTRAINT "etf_breakdown_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etf_breakdown" ADD CONSTRAINT "etf_breakdown_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "etf_breakdown_owner" ON "etf_breakdown" AS PERMISSIVE FOR ALL TO "rt100k_app" USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());