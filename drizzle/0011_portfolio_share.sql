CREATE TABLE "portfolio_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"grantee_id" text,
	"token_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_share_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "portfolio_share_state_check" CHECK (("portfolio_share"."grantee_id" is null) = ("portfolio_share"."accepted_at" is null) and ("portfolio_share"."grantee_id" is null) = ("portfolio_share"."token_hash" is not null)),
	CONSTRAINT "portfolio_share_token_check" CHECK ("portfolio_share"."token_hash" is null or "portfolio_share"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "portfolio_share_not_self" CHECK ("portfolio_share"."grantee_id" is null or "portfolio_share"."grantee_id" <> "portfolio_share"."owner_id")
);
--> statement-breakpoint
ALTER TABLE "portfolio_share" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "portfolio_share" ADD CONSTRAINT "portfolio_share_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_share" ADD CONSTRAINT "portfolio_share_grantee_id_user_id_fk" FOREIGN KEY ("grantee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Unique-Regel vor dem zusammengesetzten Fremdschlüssel (der sie voraussetzt)
ALTER TABLE "portfolio" ADD CONSTRAINT "portfolio_id_owner_unique" UNIQUE("id","owner_id");--> statement-breakpoint
ALTER TABLE "portfolio_share" ADD CONSTRAINT "portfolio_share_portfolio_owner_fk" FOREIGN KEY ("portfolio_id","owner_id") REFERENCES "public"."portfolio"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portfolio_share_portfolio_idx" ON "portfolio_share" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX "portfolio_share_grantee_idx" ON "portfolio_share" USING btree ("grantee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_share_unique_grantee" ON "portfolio_share" USING btree ("portfolio_id","grantee_id") WHERE grantee_id is not null;--> statement-breakpoint
CREATE POLICY "portfolio_share_owner" ON "portfolio_share" AS PERMISSIVE FOR ALL TO "rt100k_app" USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());--> statement-breakpoint
CREATE POLICY "portfolio_share_grantee_read" ON "portfolio_share" AS PERMISSIVE FOR SELECT TO "rt100k_app" USING (grantee_id = app_user_id());--> statement-breakpoint
CREATE POLICY "portfolio_share_grantee_leave" ON "portfolio_share" AS PERMISSIVE FOR DELETE TO "rt100k_app" USING (grantee_id = app_user_id());