CREATE TABLE "apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "apps_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "apps_orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "apps_orgs_app_org_unique" UNIQUE("app_id","org_id")
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "orgs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "apps_orgs" ADD CONSTRAINT "apps_orgs_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apps_orgs" ADD CONSTRAINT "apps_orgs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_parent_id_orgs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."orgs"("id") ON DELETE set null ON UPDATE no action;