CREATE TABLE "goal_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"grantee_id" text,
	"role" text NOT NULL,
	"token_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_share_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "goal_share_role_check" CHECK ("goal_share"."role" in ('view', 'edit')),
	CONSTRAINT "goal_share_state_check" CHECK (("goal_share"."grantee_id" is null) = ("goal_share"."accepted_at" is null) and ("goal_share"."grantee_id" is null) = ("goal_share"."token_hash" is not null)),
	CONSTRAINT "goal_share_token_check" CHECK ("goal_share"."token_hash" is null or "goal_share"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "goal_share_not_self" CHECK ("goal_share"."grantee_id" is null or "goal_share"."grantee_id" <> "goal_share"."owner_id")
);
--> statement-breakpoint
ALTER TABLE "goal_share" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "goal_share" ADD CONSTRAINT "goal_share_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_share" ADD CONSTRAINT "goal_share_grantee_id_user_id_fk" FOREIGN KEY ("grantee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_share" ADD CONSTRAINT "goal_share_goal_owner_fk" FOREIGN KEY ("goal_id","owner_id") REFERENCES "public"."goal"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_share_goal_idx" ON "goal_share" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "goal_share_grantee_idx" ON "goal_share" USING btree ("grantee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goal_share_unique_grantee" ON "goal_share" USING btree ("goal_id","grantee_id") WHERE grantee_id is not null;--> statement-breakpoint
CREATE POLICY "goal_share_owner" ON "goal_share" AS PERMISSIVE FOR ALL TO "rt100k_app" USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());--> statement-breakpoint
CREATE POLICY "goal_share_grantee_read" ON "goal_share" AS PERMISSIVE FOR SELECT TO "rt100k_app" USING (grantee_id = app_user_id());--> statement-breakpoint
CREATE POLICY "goal_share_grantee_leave" ON "goal_share" AS PERMISSIVE FOR DELETE TO "rt100k_app" USING (grantee_id = app_user_id());