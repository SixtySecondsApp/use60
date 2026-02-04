-- Fix RLS violation in org_email_categorization_settings trigger
-- The trigger function needs SECURITY DEFINER to bypass RLS policies
-- when creating default settings for new organizations during onboarding

CREATE OR REPLACE FUNCTION "public"."create_default_email_categorization_settings"()
    RETURNS "trigger"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO org_email_categorization_settings (org_id, is_enabled, label_mode)
  VALUES (NEW.id, true, 'mode_a_internal_only')
  ON CONFLICT (org_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Set the proper owner
ALTER FUNCTION "public"."create_default_email_categorization_settings"() OWNER TO "postgres";
