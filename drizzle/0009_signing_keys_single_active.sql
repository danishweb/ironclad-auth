CREATE UNIQUE INDEX "signing_keys_single_active_true" ON "signing_keys" ((1)) WHERE "is_active" = true;--> statement-breakpoint
