CREATE TABLE "booking_undo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"action" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_undo_action_check" CHECK ("booking_undo"."action" in ('delete', 'update') and ("booking_undo"."action" = 'delete') = ("booking_undo"."changed_at" is null))
);
--> statement-breakpoint
ALTER TABLE "booking_undo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "goal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"target_cents" bigint NOT NULL,
	"target_date" date,
	"monthly_cents" bigint,
	"return_bp" integer,
	"scope" text DEFAULT 'all' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_id_owner_unique" UNIQUE("id","owner_id"),
	CONSTRAINT "goal_name_check" CHECK (char_length("goal"."name") between 1 and 60),
	CONSTRAINT "goal_amounts_check" CHECK ("goal"."target_cents" > 0 and ("goal"."monthly_cents" is null or "goal"."monthly_cents" >= 0)),
	CONSTRAINT "goal_return_check" CHECK ("goal"."return_bp" is null or "goal"."return_bp" between -2000 and 3000),
	CONSTRAINT "goal_scope_check" CHECK ("goal"."scope" in ('all', 'selected'))
);
--> statement-breakpoint
ALTER TABLE "goal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "goal_portfolio" (
	"goal_id" uuid NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	CONSTRAINT "goal_portfolio_goal_id_portfolio_id_pk" PRIMARY KEY("goal_id","portfolio_id")
);
--> statement-breakpoint
ALTER TABLE "goal_portfolio" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "watchlist_item" (
	"owner_id" text NOT NULL,
	"instrument_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_item_owner_id_instrument_id_pk" PRIMARY KEY("owner_id","instrument_id"),
	CONSTRAINT "watchlist_item_note_check" CHECK ("watchlist_item"."note" is null or char_length("watchlist_item"."note") <= 200)
);
--> statement-breakpoint
ALTER TABLE "watchlist_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "booking_undo" ADD CONSTRAINT "booking_undo_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_undo" ADD CONSTRAINT "booking_undo_portfolio_owner_fk" FOREIGN KEY ("portfolio_id","owner_id") REFERENCES "public"."portfolio"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_portfolio" ADD CONSTRAINT "goal_portfolio_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_portfolio" ADD CONSTRAINT "goal_portfolio_goal_owner_fk" FOREIGN KEY ("goal_id","owner_id") REFERENCES "public"."goal"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_portfolio" ADD CONSTRAINT "goal_portfolio_portfolio_owner_fk" FOREIGN KEY ("portfolio_id","owner_id") REFERENCES "public"."portfolio"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_item" ADD CONSTRAINT "watchlist_item_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_item" ADD CONSTRAINT "watchlist_item_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_undo_owner_idx" ON "booking_undo" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "goal_owner_idx" ON "goal" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "goal_portfolio_owner_idx" ON "goal_portfolio" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "watchlist_item_instrument_idx" ON "watchlist_item" USING btree ("instrument_id");--> statement-breakpoint
CREATE POLICY "booking_undo_owner" ON "booking_undo" AS PERMISSIVE FOR ALL TO "rt100k_app" USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());--> statement-breakpoint
CREATE POLICY "goal_owner" ON "goal" AS PERMISSIVE FOR ALL TO "rt100k_app" USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());--> statement-breakpoint
CREATE POLICY "goal_portfolio_owner" ON "goal_portfolio" AS PERMISSIVE FOR ALL TO "rt100k_app" USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());--> statement-breakpoint
CREATE POLICY "watchlist_item_owner" ON "watchlist_item" AS PERMISSIVE FOR ALL TO "rt100k_app" USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());