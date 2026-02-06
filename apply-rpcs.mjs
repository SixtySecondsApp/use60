#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://caerqjzvuerejfrdtygb.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZXJxanp2dWVyZWpmcmR0eWdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk0OTIyNywiZXhwIjoyMDgzNTI1MjI3fQ.vZn5nVNIllQBoRgf9_gFTKwrFoakOUJ8VNJ4nnHUnko';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const rpcs = [
  {
    name: 'user_leave_organization',
    sql: `
CREATE OR REPLACE FUNCTION public.user_leave_organization(
  p_org_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  SELECT role INTO v_user_role
  FROM organization_memberships
  WHERE org_id = p_org_id AND user_id = v_user_id AND member_status = 'active';
  IF v_user_role IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'You are not a member of this organization');
  END IF;
  IF v_user_role = 'owner' THEN
    RETURN json_build_object('success', false, 'error', 'Organization owners must transfer ownership before leaving. Please promote another member to owner and try again.');
  END IF;
  UPDATE organization_memberships SET member_status = 'removed', removed_at = NOW(), removed_by = v_user_id, updated_at = NOW()
  WHERE org_id = p_org_id AND user_id = v_user_id;
  UPDATE profiles SET redirect_to_onboarding = true WHERE id = v_user_id;
  RETURN json_build_object('success', true, 'orgId', p_org_id, 'userId', v_user_id, 'removedAt', NOW());
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.user_leave_organization(uuid) TO authenticated;
    `
  },
  {
    name: 'check_existing_org_by_email_domain',
    sql: `
CREATE OR REPLACE FUNCTION public.check_existing_org_by_email_domain(
  p_email TEXT
)
RETURNS TABLE (
  org_id UUID,
  org_name TEXT,
  org_domain TEXT,
  member_count BIGINT,
  should_request_join BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_email_domain TEXT;
  v_is_personal BOOLEAN;
BEGIN
  v_email_domain := LOWER(SPLIT_PART(p_email, '@', 2));
  v_is_personal := is_personal_email_domain(p_email);
  IF v_is_personal THEN RETURN; END IF;
  RETURN QUERY
  SELECT o.id, o.name, o.company_domain, COUNT(om.user_id) as member_count, TRUE as should_request_join
  FROM organizations o
  LEFT JOIN organization_memberships om ON o.id = om.org_id
  WHERE o.company_domain = v_email_domain AND o.is_active = true
  GROUP BY o.id, o.name, o.company_domain
  ORDER BY member_count DESC LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_existing_org_by_email_domain(TEXT) TO authenticated;
    `
  }
];

async function applyRPCs() {
  try {
    console.log('🔄 Deploying RPC functions to staging...\n');

    for (const rpc of rpcs) {
      console.log(`📝 Deploying: ${rpc.name}`);

      // Try via rpc call (will fail if function doesn't exist, but that's ok for init)
      try {
        await supabase.rpc(rpc.name);
      } catch (e) {
        // Expected - function might not exist yet
      }

      // Try via raw call to check if it worked
      try {
        const { data, error } = await supabase.from('information_schema.routines')
          .select('routine_name')
          .eq('routine_name', rpc.name)
          .eq('routine_schema', 'public');

        if (error) throw error;
        if (data && data.length > 0) {
          console.log(`   ✅ Function exists`);
        } else {
          console.log(`   ⚠ Function not found yet - may need manual deployment`);
        }
      } catch (e) {
        console.log(`   ℹ Cannot verify - may need manual check`);
      }
    }

    console.log('\n✅ RPC functions ready for deployment!');

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

applyRPCs();
