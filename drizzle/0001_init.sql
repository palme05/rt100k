CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"actor_id" text,
	"type" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "booking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"instrument_id" uuid,
	"type" text NOT NULL,
	"occurred_on" date NOT NULL,
	"quantity" numeric(30, 12),
	"factor" numeric(20, 10),
	"amount_cents" bigint DEFAULT 0 NOT NULL,
	"fee_cents" bigint DEFAULT 0 NOT NULL,
	"tax_cents" bigint DEFAULT 0 NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_type_check" CHECK ("booking"."type" in ('buy', 'sell', 'dividend', 'interest', 'fee', 'tax', 'deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'split', 'staking')),
	CONSTRAINT "booking_amounts_check" CHECK ("booking"."amount_cents" >= 0 and "booking"."fee_cents" >= 0 and "booking"."tax_cents" >= 0),
	CONSTRAINT "booking_quantity_check" CHECK ("booking"."quantity" is null or "booking"."quantity" > 0),
	CONSTRAINT "booking_factor_check" CHECK ("booking"."factor" is null or "booking"."factor" > 0),
	CONSTRAINT "booking_currency_check" CHECK ("booking"."currency" = 'EUR'),
	CONSTRAINT "booking_note_check" CHECK ("booking"."note" is null or char_length("booking"."note") <= 500)
);
--> statement-breakpoint
ALTER TABLE "booking" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fx_daily" (
	"currency" char(3) NOT NULL,
	"day" date NOT NULL,
	"rate" numeric(20, 10) NOT NULL,
	CONSTRAINT "fx_daily_currency_day_pk" PRIMARY KEY("currency","day")
);
--> statement-breakpoint
CREATE TABLE "instrument" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"isin" text,
	"symbol" text,
	"coingecko_id" text,
	"metal" text,
	"currency" char(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instrument_kind_check" CHECK ("instrument"."kind" in ('stock', 'etf', 'fund', 'bond', 'crypto', 'metal', 'other')),
	CONSTRAINT "instrument_name_check" CHECK (char_length("instrument"."name") between 1 and 120),
	CONSTRAINT "instrument_isin_check" CHECK ("instrument"."isin" is null or "instrument"."isin" ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
	CONSTRAINT "instrument_metal_check" CHECK ("instrument"."metal" is null or "instrument"."metal" in ('XAU', 'XAG', 'XPT', 'XPD'))
);
--> statement-breakpoint
ALTER TABLE "instrument" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by" text,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invitation_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitation_role_check" CHECK ("invitation"."role" in ('member', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp with time zone,
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "portfolio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"broker" text,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"tax_simple" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "portfolio_kind_check" CHECK ("portfolio"."kind" in ('depot', 'krypto', 'cash', 'sachwert')),
	CONSTRAINT "portfolio_name_check" CHECK (char_length("portfolio"."name") between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "portfolio" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "portfolio_snapshot" (
	"portfolio_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"day" date NOT NULL,
	"value_cents" bigint NOT NULL,
	"invested_cents" bigint NOT NULL,
	CONSTRAINT "portfolio_snapshot_portfolio_id_day_pk" PRIMARY KEY("portfolio_id","day")
);
--> statement-breakpoint
ALTER TABLE "portfolio_snapshot" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "price_daily" (
	"instrument_id" uuid NOT NULL,
	"day" date NOT NULL,
	"close_micros" bigint NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "price_daily_instrument_id_day_pk" PRIMARY KEY("instrument_id","day")
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "road_settings" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"target_cents" bigint DEFAULT 10000000 NOT NULL,
	"monthly_contribution_cents" bigint DEFAULT 50000 NOT NULL,
	"expected_return_bp" integer DEFAULT 650 NOT NULL,
	"volatility_bp" integer DEFAULT 1500 NOT NULL,
	"include_tangibles" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "road_settings_ranges" CHECK ("road_settings"."target_cents" > 0 and "road_settings"."monthly_contribution_cents" >= 0 and "road_settings"."expected_return_bp" between -2000 and 3000 and "road_settings"."volatility_bp" between 0 and 10000)
);
--> statement-breakpoint
ALTER TABLE "road_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"two_factor_enabled" boolean DEFAULT false,
	"role" text DEFAULT 'member' NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_portfolio_id_portfolio_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrument" ADD CONSTRAINT "instrument_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_used_by_user_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio" ADD CONSTRAINT "portfolio_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_snapshot" ADD CONSTRAINT "portfolio_snapshot_portfolio_id_portfolio_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_snapshot" ADD CONSTRAINT "portfolio_snapshot_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_daily" ADD CONSTRAINT "price_daily_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "road_settings" ADD CONSTRAINT "road_settings_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_event_user_idx" ON "audit_event" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "booking_portfolio_idx" ON "booking" USING btree ("portfolio_id","occurred_on");--> statement-breakpoint
CREATE INDEX "booking_owner_idx" ON "booking" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "booking_instrument_idx" ON "booking" USING btree ("instrument_id");--> statement-breakpoint
CREATE UNIQUE INDEX "instrument_global_symbol_idx" ON "instrument" USING btree ("symbol") WHERE owner_id is null and symbol is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "instrument_global_coingecko_idx" ON "instrument" USING btree ("coingecko_id") WHERE owner_id is null and coingecko_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "instrument_global_metal_idx" ON "instrument" USING btree ("metal") WHERE owner_id is null and metal is not null;--> statement-breakpoint
CREATE INDEX "passkey_user_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "passkey_credential_idx" ON "passkey" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "portfolio_owner_idx" ON "portfolio" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "portfolio_snapshot_owner_idx" ON "portfolio_snapshot" USING btree ("owner_id","day");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_user_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE POLICY "audit_event_select_own" ON "audit_event" AS PERMISSIVE FOR SELECT TO "rt100k_app" USING (user_id = app_user_id());--> statement-breakpoint
CREATE POLICY "audit_event_insert" ON "audit_event" AS PERMISSIVE FOR INSERT TO "rt100k_app" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "audit_event_delete_expired" ON "audit_event" AS PERMISSIVE FOR DELETE TO "rt100k_app" USING (created_at < now() - interval '730 days');--> statement-breakpoint
CREATE POLICY "booking_owner" ON "booking" AS PERMISSIVE FOR ALL TO "rt100k_app" USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id() and exists (select 1 from portfolio p where p.id = portfolio_id and p.owner_id = app_user_id()));--> statement-breakpoint
CREATE POLICY "instrument_select" ON "instrument" AS PERMISSIVE FOR SELECT TO "rt100k_app" USING (owner_id is null or owner_id = app_user_id());--> statement-breakpoint
CREATE POLICY "instrument_insert" ON "instrument" AS PERMISSIVE FOR INSERT TO "rt100k_app" WITH CHECK (owner_id is null or owner_id = app_user_id());--> statement-breakpoint
CREATE POLICY "instrument_update_own" ON "instrument" AS PERMISSIVE FOR UPDATE TO "rt100k_app" USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());--> statement-breakpoint
CREATE POLICY "instrument_delete_own" ON "instrument" AS PERMISSIVE FOR DELETE TO "rt100k_app" USING (owner_id = app_user_id());--> statement-breakpoint
CREATE POLICY "portfolio_owner" ON "portfolio" AS PERMISSIVE FOR ALL TO "rt100k_app" USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());--> statement-breakpoint
CREATE POLICY "portfolio_snapshot_owner" ON "portfolio_snapshot" AS PERMISSIVE FOR ALL TO "rt100k_app" USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());--> statement-breakpoint
CREATE POLICY "road_settings_owner" ON "road_settings" AS PERMISSIVE FOR ALL TO "rt100k_app" USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());