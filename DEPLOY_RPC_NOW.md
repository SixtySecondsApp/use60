# Deploy RPC Function to Staging NOW

The `user_leave_organization` RPC function needs to be deployed to the staging database immediately.

## Option 1: Quick Manual Deployment (5 minutes)

1. Go to **Supabase Dashboard**: https://app.supabase.com/
2. Select project: **caerqjzvuerejfrdtygb** (Staging)
3. Click **SQL Editor** in left sidebar
4. Click **New Query**
5. Copy-paste the entire SQL below:

```sql
-- Create user_leave_organization RPC function
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

-- Grant permission
GRANT EXECUTE ON FUNCTION public.user_leave_organization(uuid) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.user_leave_organization IS 'Allows authenticated users to leave an organization safely';
```

6. Click **Run** (Ctrl+Enter or Cmd+Enter)
7. Verify: You should see "Success. No rows returned"

## Option 2: CLI Deployment

```bash
cd sixty-sales-dashboard
npx supabase db push --linked
```

## Option 3: Direct via psql (if you have access)

```bash
psql postgres://postgres.caerqjzvuerejfrdtygb:PASSWORD@aws-0-eu-west-1.pooler.supabase.com:5432/postgres << 'EOF'
[paste SQL above]
EOF
```

## Verification

After deployment, verify the function exists:

1. In Supabase Dashboard → SQL Editor, run:
```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_schema='public' AND routine_name='user_leave_organization';
```

Should return: `user_leave_organization`

2. Or test from the app - the leave organization button should now work!

## If Still Getting 404

1. **Refresh Supabase schema cache**
   - Go to Settings → Database → Refresh cache (if available)
   - Or wait 1-2 minutes for auto-refresh

2. **Check if function was created**
   ```sql
   SELECT * FROM pg_proc WHERE proname = 'user_leave_organization';
   ```

3. **Check permissions**
   ```sql
   SELECT * FROM information_schema.role_routine_grants
   WHERE routine_name = 'user_leave_organization';
   ```

## Next Step

After deploying, refresh your browser and test the leave organization flow!
