CREATE TABLE "privileges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "privileges_app_code_unique" UNIQUE("app_id","code")
);
--> statement-breakpoint
CREATE TABLE "role_privileges" (
	"role_id" uuid NOT NULL,
	"privilege_id" uuid NOT NULL,
	CONSTRAINT "role_privileges_role_id_privilege_id_pk" PRIMARY KEY("role_id","privilege_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_sensitive" boolean DEFAULT false NOT NULL,
	CONSTRAINT "roles_app_code_unique" UNIQUE("app_id","code")
);
--> statement-breakpoint
ALTER TABLE "privileges" ADD CONSTRAINT "privileges_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_privileges" ADD CONSTRAINT "role_privileges_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_privileges" ADD CONSTRAINT "role_privileges_privilege_id_privileges_id_fk" FOREIGN KEY ("privilege_id") REFERENCES "public"."privileges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;