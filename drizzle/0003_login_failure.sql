CREATE TABLE "login_failure" (
	"email_hash" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "login_failure" TO rt100k_app;
