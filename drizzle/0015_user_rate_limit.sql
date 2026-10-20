CREATE TABLE "user_rate_limit" (
	"owner_id" text NOT NULL,
	"action" text NOT NULL,
	"count" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	CONSTRAINT "user_rate_limit_owner_id_action_pk" PRIMARY KEY("owner_id","action"),
	CONSTRAINT "user_rate_limit_action_check" CHECK ("user_rate_limit"."action" ~ '^[a-z]{1,20}$')
);
--> statement-breakpoint
ALTER TABLE "user_rate_limit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_rate_limit" ADD CONSTRAINT "user_rate_limit_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "user_rate_limit_owner" ON "user_rate_limit" AS PERMISSIVE FOR ALL TO "rt100k_app" USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());