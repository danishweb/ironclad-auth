CREATE OR REPLACE FUNCTION notify_auth_invalidate() RETURNS trigger AS $$
DECLARE
	payload text;
BEGIN
	IF TG_TABLE_NAME = 'memberships' THEN
		payload := json_build_object(
			'table', TG_TABLE_NAME,
			'op', TG_OP,
			'user_id', COALESCE(NEW.user_id, OLD.user_id)::text,
			'membership_id', COALESCE(NEW.id, OLD.id)::text
		)::text;
	ELSIF TG_TABLE_NAME = 'membership_org_units' THEN
		payload := json_build_object(
			'table', TG_TABLE_NAME,
			'op', TG_OP,
			'membership_id', COALESCE(NEW.membership_id, OLD.membership_id)::text
		)::text;
	ELSE
		payload := json_build_object('table', TG_TABLE_NAME, 'op', TG_OP)::text;
	END IF;
	PERFORM pg_notify('auth_invalidate', payload);
	RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER memberships_auth_invalidate
AFTER INSERT OR UPDATE OR DELETE ON "memberships"
FOR EACH ROW EXECUTE FUNCTION notify_auth_invalidate();--> statement-breakpoint
CREATE TRIGGER membership_org_units_auth_invalidate
AFTER INSERT OR UPDATE OR DELETE ON "membership_org_units"
FOR EACH ROW EXECUTE FUNCTION notify_auth_invalidate();
