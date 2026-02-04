# Deploy Leave Organization Feature to Staging

## Status
✅ **Code Implementation**: Complete and committed  
⏳ **Database Migrations**: Ready to deploy (network limitations prevented automated deployment)

## What's Ready

### Committed Code Changes
- ✅ `src/lib/services/leaveOrganizationService.ts` - Enhanced leave logic with verification
- ✅ `src/components/ProtectedRoute.tsx` - Dashboard access protection
- ✅ `src/pages/onboarding/v2/RemovedUserStep.tsx` - Org name display with removal type
- ✅ `src/pages/settings/TeamMembersPage.tsx` - Leave handler updates
- ✅ `src/pages/settings/OrganizationManagementPage.tsx` - Leave handler updates
- ✅ `src/lib/stores/onboardingV2Store.ts` - Auto-approval fix (exact domain only)

### Committed Migrations
- ✅ `supabase/migrations/20260204110000_create_user_leave_organization_rpc.sql` - RPC function
- ✅ `supabase/migrations/20260204120000_allow_users_to_leave_organization.sql` - RLS policy
- ✅ `supabase/migrations/20260204130000_deploy_leave_organization_complete.sql` - Combined idempotent

## Quickest Deployment: Supabase Dashboard

1. Go to https://app.supabase.com
2. Select project **caerqjzvuerejfrdtygb** (staging)
3. SQL Editor → New Query
4. Run the SQL from `supabase/migrations/20260204130000_deploy_leave_organization_complete.sql`
5. Done! ✅

That's it. The feature is deployed when the migrations run successfully.

## Full Documentation

See `STAGING_DEPLOYMENT_SQL.md` for complete step-by-step SQL instructions with verification queries.
