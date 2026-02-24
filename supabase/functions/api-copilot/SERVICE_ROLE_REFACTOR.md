# Service Role Minimization - Refactoring Guide

**Goal**: Minimize service role key usage in api-copilot edge function to reduce attack surface.

## Clawdbot Lesson

> "With Control access, in certain internet facing exposed conditions, you inherit all of that capability."

Service role keys bypass ALL Row Level Security (RLS) policies. If an attacker compromises the edge function:
- ❌ Service role = Full database access to ALL users' data
- ✅ User-scoped = Limited to authenticated user's accessible data (via RLS)

## Current Risk Assessment

**Lines 230-240** of `api-copilot/index.ts`:
```typescript
const client = createClient(
  supabaseUrl,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  }
)
```

**Problem**: Service role client is used for ALL operations, even though JWT is attached.

## Refactoring Strategy

### 1. Default to User-Scoped Client

**Before**:
```typescript
const client = createClient(supabaseUrl, SERVICE_ROLE_KEY, {
  global: { headers: { Authorization: authHeader } }
})
```

**After**:
```typescript
// Default: user-scoped client (respects RLS)
const userClient = createClient(supabaseUrl, ANON_KEY, {
  global: { headers: { Authorization: authHeader } },
  auth: { persistSession: false }
})
```

### 2. Service Role ONLY When Necessary

Create a separate service role client ONLY for operations that require it:

```typescript
// ONLY for: persona compilation, cross-user queries, system operations
const serviceClient = createClient(supabaseUrl, SERVICE_ROLE_KEY, {
  global: { headers: { Authorization: authHeader } }, // Still attach JWT for context
  auth: { persistSession: false }
})
```

### 3. Justified Service Role Usage

Document WHY service role is needed for each usage:

```typescript
// ✅ JUSTIFIED: Persona compilation needs org-wide skill access
const serviceClient = createClient(supabaseUrl, SERVICE_ROLE_KEY, ...)
const persona = await getOrCompilePersona(serviceClient, orgId, userId, ...)

// ❌ UNJUSTIFIED: User queries their own contacts
// const { data } = await serviceClient.from('contacts')... // WRONG!
const { data } = await userClient.from('contacts')...     // CORRECT!
```

## Operations Requiring Service Role

### ✅ Legitimate Use Cases

1. **Persona Compilation** (lines 3725, 4186-4189)
   - Needs: Org-wide `organization_skills`, `platform_skills` access
   - Reason: Skills may belong to org, not individual user

2. **Cross-User Org Queries** (if any)
   - Needs: Query across org members (e.g., team performance)
   - Reason: RLS would block cross-user access

3. **Google Calendar Sync** (line 6645-6647)
   - Needs: Call edge function with service role auth
   - Reason: Edge-to-edge function call authentication

### ❌ Should Use User-Scoped

1. **User's Own Data** (contacts, deals, meetings, tasks)
   - Current RLS policies allow access via `auth.uid()`
   - Service role NOT needed

2. **Copilot Conversations** (CRITICAL)
   - Must use user-scoped client ONLY
   - New RLS policies EXPLICITLY exclude service role

3. **Calendar Events** (user's own calendar)
   - RLS allows `user_id = auth.uid()`
   - Service role NOT needed

## Implementation Steps

### Phase 1: Audit Current Usage

```bash
grep -n "createClient.*SERVICE_ROLE" api-copilot/index.ts
grep -n "\.from\(" api-copilot/index.ts | head -50
```

### Phase 2: Create Two Clients

```typescript
// Entry point (handleChat, etc.)
const userClient = createClient(supabaseUrl, ANON_KEY, {
  global: { headers: { Authorization: authHeader } },
  auth: { persistSession: false }
})

// ONLY create service client when NECESSARY
let serviceClient: SupabaseClient | null = null
const getServiceClient = () => {
  if (!serviceClient) {
    serviceClient = createClient(supabaseUrl, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false }
    })
  }
  return serviceClient
}
```

### Phase 3: Replace Service Usage

Pattern:
```typescript
// OLD
const { data } = await client.from('contacts')...

// NEW
const { data } = await userClient.from('contacts')...

// IF NEEDED
const { data } = await getServiceClient().from('organization_skills')...
```

### Phase 4: Add Audit Logging

```typescript
if (usingServiceRole) {
  await userClient.rpc('log_security_event', {
    p_operation: 'service_role_usage',
    p_table_name: tableName,
    p_metadata: { reason: 'persona_compilation' },
    p_severity: 'info'
  })
}
```

## Migration Checklist

- [ ] Create `userClient` as default client
- [ ] Create lazy `serviceClient` function
- [ ] Refactor `handleChat` to use `userClient`
- [ ] Refactor `executeToolCall` to use `userClient`
- [ ] Audit `executeAction` calls - use `userClient` by default
- [ ] Document each remaining `serviceClient` usage
- [ ] Add audit logging for service role usage
- [ ] Test with RLS enabled (ensure no PGRST301 errors)

## Testing Strategy

### 1. Test User-Scoped Access

```bash
# User should see their own data
curl -X POST https://YOUR_URL/api-copilot/chat \
  -H "Authorization: Bearer $USER_JWT" \
  -d '{"message": "Show my contacts"}'
```

### 2. Test RLS Enforcement

```bash
# User should NOT see other users' copilot conversations
curl -X GET https://YOUR_URL/api-copilot/conversations/$OTHER_USER_CONVO_ID \
  -H "Authorization: Bearer $USER_JWT"
# Expected: 403 or empty result
```

### 3. Test Persona Compilation (Service Role OK)

```bash
# Persona compilation should still work
curl -X POST https://YOUR_URL/api-copilot/chat \
  -H "Authorization: Bearer $USER_JWT" \
  -d '{"message": "What skills are available?"}'
```

## Security Benefits

1. **Reduced Attack Surface**: Compromised edge function = limited damage
2. **RLS Enforcement**: Database policies apply to copilot queries
3. **Audit Trail**: Service role usage is logged and monitored
4. **Least Privilege**: Copilot runs with minimal permissions by default

## Rollback Plan

If issues arise:
1. Comment out `userClient` usage
2. Revert to `client` (service role) temporarily
3. Debug RLS policy mismatches
4. Re-apply user-scoped client with fixes

## Success Criteria

- ✅ Copilot works for all normal user queries
- ✅ <90% of queries use user-scoped client
- ✅ Persona compilation still functional
- ✅ No unauthorized data access possible
- ✅ Audit logs show minimal service role usage

---

**Next Steps**: Implement Phase 1-3, test thoroughly, deploy to staging first.
