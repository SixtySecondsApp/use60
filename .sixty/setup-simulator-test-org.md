# Simulator Test Organization Setup

## Purpose

Creates a dedicated test organization (`00000000-0000-0000-0000-000000000001`) specifically for the onboarding simulator. This ensures:
- Consistent testing without interfering with real user data
- No organization ID mismatches causing polling issues
- Reliable enrichment testing in Real API mode

## Setup Instructions

### 1. Run the SQL Script

Go to your Supabase Dashboard:
1. Navigate to **SQL Editor**
2. Copy and paste the contents of `/tmp/create_simulator_test_org.sql`
3. Click **Run**

The script will:
- Create test org with ID `00000000-0000-0000-0000-000000000001`
- Associate it with an admin user
- Clean up any existing test data
- Set up proper memberships

### 2. Verify Creation

Run this query to confirm:

```sql
SELECT
  id,
  name,
  company_domain,
  created_by,
  is_active
FROM organizations
WHERE id = '00000000-0000-0000-0000-000000000001';
```

You should see:
- **name**: "Simulator Test Organization"
- **company_domain**: "simulator-test.internal"
- **is_active**: true

### 3. Test the Simulator

1. Go to the onboarding simulator page
2. Enable **Real API Mode**
3. Enter `conturae.com` as the test domain
4. Click **Start Walkthrough**

The simulator will now use the dedicated test org ID, ensuring proper enrichment tracking.

## Troubleshooting

### Enrichment Stuck at 10%?

Check the enrichment status:

```sql
SELECT
  id,
  organization_id,
  domain,
  status,
  error_message,
  created_at
FROM organization_enrichment
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
ORDER BY created_at DESC
LIMIT 3;
```

### Clean Up Test Data

To reset the simulator test org:

```sql
-- Clean up enrichments
DELETE FROM organization_enrichment
WHERE organization_id = '00000000-0000-0000-0000-000000000001';

-- Clean up context
DELETE FROM organization_context
WHERE organization_id = '00000000-0000-0000-0000-000000000001';

-- Clean up skills
DELETE FROM organization_skills
WHERE organization_id = '00000000-0000-0000-0000-000000000001';
```

## Changes Made

1. **SQL Script**: `/tmp/create_simulator_test_org.sql` - Creates dedicated test org
2. **Simulator Update**: Changed `FALLBACK_ORG_ID` → `SIMULATOR_TEST_ORG_ID` in `OnboardingFlowSimulatorV2.tsx`
3. **Edge Function**: Added error handling for status updates in `deep-enrich-organization/index.ts`

## Architecture

```
Simulator (Real API Mode)
    ↓
Uses SIMULATOR_TEST_ORG_ID
    ↓
Calls deep-enrich-organization edge function
    ↓
Creates enrichment record with org_id = SIMULATOR_TEST_ORG_ID
    ↓
Polls for status using same org_id
    ↓
✅ No org ID mismatch!
```

Before this fix, the simulator sometimes used different org IDs for creating vs polling enrichments, causing the "stuck at 10%" issue.
