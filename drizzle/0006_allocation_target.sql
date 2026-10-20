CREATE TABLE "allocation_target" (
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_bp" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocation_target_owner_id_kind_pk" PRIMARY KEY("owner_id","kind"),
	CONSTRAINT "allocation_target_kind_check" CHECK ("allocation_target"."kind" in ('etf', 'stock', 'fund', 'bond', 'crypto', 'metal', 'other', 'cash')),
	CONSTRAINT "allocation_target_bp_check" CHECK ("allocation_target"."target_bp" between 1 and 10000)
);
--> statement-breakpoint
ALTER TABLE "allocation_target" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "allocation_target" ADD CONSTRAINT "allocation_target_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "allocation_target_owner" ON "allocation_target" AS PERMISSIVE FOR ALL TO "rt100k_app" USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());