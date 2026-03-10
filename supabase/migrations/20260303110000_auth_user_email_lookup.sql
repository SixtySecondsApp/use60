-- Helper RPC: look up auth.users.id by email (service role only)
-- Used by complete-test-user-signup to reclaim orphaned auth accounts
CREATE OR REPLACE FUNCTION get_auth_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;
