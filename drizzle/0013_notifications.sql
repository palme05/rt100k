CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"amount_cents" bigint,
	"link" text,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notification_kind_check" CHECK ("notification"."kind" in ('price_alert', 'dividend', 'milestone', 'speculation_end')),
	CONSTRAINT "notification_text_check" CHECK (char_length("notification"."title") between 1 and 120 and ("notification"."body" is null or char_length("notification"."body") <= 500) and char_length("notification"."dedupe_key") between 1 and 200),
	CONSTRAINT "notification_link_check" CHECK ("notification"."link" is null or "notification"."link" ~ '^/app(/[A-Za-z0-9_/-]*)?$')
);
--> statement-breakpoint
ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "price_alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"instrument_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"threshold_micros" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"triggered_at" timestamp with time zone,
	CONSTRAINT "price_alert_direction_check" CHECK ("price_alert"."direction" in ('above', 'below')),
	CONSTRAINT "price_alert_threshold_check" CHECK ("price_alert"."threshold_micros" > 0)
);
--> statement-breakpoint
ALTER TABLE "price_alert" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscription_endpoint_check" CHECK ("push_subscription"."endpoint" ~ '^https://' and char_length("push_subscription"."endpoint") <= 1000),
	CONSTRAINT "push_subscription_keys_check" CHECK ("push_subscription"."p256dh" ~ '^[A-Za-z0-9_-]{80,100}$' and "push_subscription"."auth" ~ '^[A-Za-z0-9_-]{16,32}$')
);
--> statement-breakpoint
ALTER TABLE "push_subscription" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_alert" ADD CONSTRAINT "price_alert_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_alert" ADD CONSTRAINT "price_alert_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_owner_dedupe_idx" ON "notification" USING btree ("owner_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notification_owner_idx" ON "notification" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "price_alert_owner_idx" ON "price_alert" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscription_owner_endpoint_idx" ON "push_subscription" USING btree ("owner_id","endpoint");--> statement-breakpoint
CREATE POLICY "notification_owner" ON "notification" AS PERMISSIVE FOR ALL TO "rt100k_app" USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());--> statement-breakpoint
CREATE POLICY "price_alert_owner" ON "price_alert" AS PERMISSIVE FOR ALL TO "rt100k_app" USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());--> statement-breakpoint
CREATE POLICY "push_subscription_owner" ON "push_subscription" AS PERMISSIVE FOR ALL TO "rt100k_app" USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());