CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"app_org_id" uuid,
	"secret_hash" text NOT NULL,
	"name" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "api_keys_secret_hash_unique" UNIQUE("secret_hash")
);
--> statement-breakpoint
CREATE TABLE "signing_keys" (
	"kid" text PRIMARY KEY NOT NULL,
	"private_key_enc" text NOT NULL,
	"public_jwk" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_app_org_id_apps_orgs_id_fk" FOREIGN KEY ("app_org_id") REFERENCES "public"."apps_orgs"("id") ON DELETE cascade ON UPDATE no action;