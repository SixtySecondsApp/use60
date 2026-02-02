# Organization User Removal Integration Tests

This directory contains comprehensive integration tests for the organization user removal feature (ORGREM-017).

## Test Files

### 1. org-user-removal.test.ts (7 tests)
Tests the core removal flow:
- ✅ Successfully remove a user from organization
- ✅ Prevent non-admin from removing users
- ✅ Prevent removing the last owner
- ✅ Allow removed user to view their data (SELECT allowed)
- ✅ Prevent removed user from updating data (UPDATE blocked by RLS)
- ✅ Prevent removed user from deleting data (DELETE blocked by RLS)
- ✅ Create audit trail on removal (removed_at, removed_by)

### 2. rejoin-requests.test.ts (8 tests)
Tests the rejoin request workflow:
- ✅ Allow removed user to request rejoin
- ✅ Prevent active user from requesting rejoin
- ✅ Prevent duplicate pending rejoin requests
- ✅ Approve rejoin request and restore access
- ✅ Reject rejoin request and keep user removed
- ✅ Prevent non-admin from approving rejoin requests
- ✅ Allow user to create new request after rejection
- ✅ Fetch pending rejoin requests for admin

### 3. org-removal-edge-cases.test.ts (10 tests)
Tests edge cases and error handling:
- ✅ Handle removing non-existent user gracefully
- ✅ Handle removing user from wrong organization
- ✅ Handle double removal (idempotency)
- ✅ Allow removing user with active tasks and deals
- ✅ Handle concurrent removal attempts
- ✅ Handle approving already-approved rejoin request
- ✅ Handle rejecting already-rejected request
- ✅ Handle invalid rejoin request ID
- ✅ Prevent self-removal
- ✅ Maintain data integrity across removal and rejoin

## Total Coverage
**25 integration tests** covering:
- Admin removal workflow
- RLS policy enforcement
- Audit trail tracking
- Rejoin request flow
- Edge cases and error handling
- Data integrity

## Running Tests

### Run all integration tests
```bash
npm run test:integration
```

### Run specific test file
```bash
npx vitest run --config vitest.config.integration.ts tests/integration/org-user-removal.test.ts
```

### Run with coverage
```bash
npx vitest run --config vitest.config.integration.ts --coverage
```

## Test Environment Setup

The tests use environment variables for authentication:
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key
- `TEST_ADMIN_EMAIL` - Test admin user email
- `TEST_ADMIN_PASSWORD` - Test admin user password
- `TEST_REMOVED_USER_EMAIL` - Test user to be removed email
- `TEST_REMOVED_USER_PASSWORD` - Test user to be removed password

When these are not set, the tests gracefully skip with a warning message.

## Test Architecture

The tests follow these patterns:
1. **Setup**: Create separate Supabase clients for admin and removed user
2. **Authentication**: Sign in with test credentials
3. **Isolation**: Each test is independent and can run in any order
4. **Cleanup**: Sign out all clients in afterAll hook
5. **Error Handling**: Gracefully skip if environment not configured

## RPC Functions Tested

- `remove_user_from_org` - Remove user from organization
- `request_rejoin` - Create rejoin request
- `approve_rejoin` - Approve/reject rejoin request

## Database Tables Tested

- `organization_memberships` - User membership status
- `rejoin_requests` - Rejoin request records
- `profiles` - User profile with redirect flags
- `deals` - Test data access (RLS enforcement)
- `tasks` - Test data access (RLS enforcement)

## Acceptance Criteria Verified

All acceptance criteria from ORGREM-017 are covered:
- ✅ Admin removes user from org
- ✅ Removed user membership status changes to 'removed'
- ✅ Removed user can view but not edit their old records (RLS)
- ✅ Audit trail (removed_at, removed_by) is recorded
- ✅ redirect_to_onboarding flag is set
- ✅ Prevents removing last owner
- ✅ Removed user can request rejoin
- ✅ Admin can approve/reject rejoin requests
- ✅ Edge cases and error conditions handled

## Implementation Notes

- Tests use `vitest` as the test runner
- Tests use `@supabase/supabase-js` for database operations
- Tests are configured in `vitest.config.integration.ts`
- Test timeout is set to 30 seconds (integration tests may take longer)
- Tests skip gracefully when environment variables are not configured
