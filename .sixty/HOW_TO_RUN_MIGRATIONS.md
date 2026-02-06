# How to Run Database Migrations

## ✅ WORKING METHOD - Use This

### The Problem
Direct PostgreSQL connections (pg library, Supabase CLI) don't work due to pooler/tenant authentication issues.

### The Solution
Use **Supabase REST API** to update tables directly.

### Script to Use
```bash
node apply-migration-api.mjs
```

**Location**: `apply-migration-api.mjs` (root directory)

### How It Works
1. Reads the migration SQL file
2. Parses out the data (html_body, text_body, variables)
3. Uses Supabase REST API with service role key to PATCH the table
4. Verifies the update was successful

### Why This Works
- Uses the same REST API that the Supabase client uses
- Service role key authenticates properly
- No need for direct database connections
- Works with RLS policies

---

## Script Details

**File**: `apply-migration-api.mjs`

**What it does**:
- Tries Method 1: `exec_sql` RPC function (usually doesn't exist)
- Falls back to Method 2: Direct REST API table update (✅ THIS WORKS)
- Parses migration SQL to extract values
- Makes PATCH request to `/rest/v1/encharge_email_templates`
- Verifies update by checking variables include new fields

**Requirements**:
- `.env.staging` must have correct `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Migration file must be in `supabase/migrations/` directory

---

## For Future Migrations

### Template for Email Template Migrations

```javascript
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.staging') });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function updateEmailTemplate(templateName, newData) {
  const endpoint = `${supabaseUrl}/rest/v1/encharge_email_templates`;

  const response = await fetch(
    `${endpoint}?template_name=eq.${templateName}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        ...newData,
        updated_at: new Date().toISOString()
      })
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(JSON.stringify(error));
  }

  return await response.json();
}

// Usage:
await updateEmailTemplate('organization_invitation', {
  html_body: '...',
  text_body: '...',
  variables: [...]
});
```

---

## Other Migration Types

### For Schema Changes (tables, columns, functions)

Use the **Supabase SQL Editor** in the dashboard:
1. Go to: https://supabase.com/dashboard/project/{project-id}/sql/new
2. Paste migration SQL
3. Click Run

### For RLS Policies

Use the Supabase REST API with the same pattern:
```javascript
const response = await fetch(
  `${supabaseUrl}/rest/v1/rpc/create_policy`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`
    },
    body: JSON.stringify({
      policy_name: 'my_policy',
      table_name: 'my_table',
      definition: 'USING (auth.uid() = user_id)'
    })
  }
);
```

---

## Failed Approaches (Don't Use)

### ❌ Direct PostgreSQL Connection
```bash
# These DON'T work:
node run-migrations-pg.mjs          # Tenant not found error
node run-migrations-pooler.mjs      # Tenant not found error
node run-migrations-direct.mjs      # Host not found error
```

**Why they fail**:
- Pooler URLs require specific authentication formats
- Direct connection hosts don't resolve correctly
- Password/tenant authentication issues

### ❌ Supabase CLI
```bash
# This DOESN'T work:
npx supabase db push --db-url "..."  # Connection errors
```

**Why it fails**:
- CLI expects different connection string format
- Pooler tenant resolution issues
- Same authentication problems as pg library

---

## Environment Variables

Make sure `.env.staging` has:

```bash
# These must match the correct project
SUPABASE_URL=https://caerqjzvuerejfrdtygb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# The service role key JWT should decode to:
# {
#   "iss": "supabase",
#   "ref": "caerqjzvuerejfrdtygb",  ← Must match project ID
#   "role": "service_role"
# }
```

**How to verify project match**:
1. Check SUPABASE_URL contains project ID
2. Decode service role key JWT (use jwt.io)
3. Ensure "ref" field matches project ID in URL

---

## Troubleshooting

### Error: "Tenant or user not found"
**Cause**: Service role key is from wrong project
**Fix**: Get correct key from Supabase dashboard for the target project

### Error: "404 Not Found"
**Cause**: Table doesn't exist or RLS policy blocks access
**Fix**:
1. Check table exists in database
2. Verify service role key has admin access
3. Service role bypasses RLS, so this shouldn't happen

### Error: "Could not find function"
**Cause**: Trying to use RPC function that doesn't exist
**Fix**: Use direct table update method (PATCH request)

---

## Summary

✅ **Use**: `apply-migration-api.mjs` for email template migrations
✅ **Use**: Supabase SQL Editor for schema changes
❌ **Don't use**: Direct PostgreSQL connections
❌ **Don't use**: Supabase CLI db push

**Working pattern**:
```
Migration SQL → Parse data → REST API PATCH → Verify
```

This approach works reliably and doesn't require fighting with database connection strings.
