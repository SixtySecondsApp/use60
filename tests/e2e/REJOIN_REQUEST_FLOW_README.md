# ORGREM-018: Write tests for rejoin request flow

## Overview
Comprehensive end-to-end test suite for the rejoin request flow functionality. These tests validate the complete journey of a removed user requesting to rejoin an organization and the admin approval/rejection process.

## Test File
- **Location**: `tests/e2e/rejoin-request-flow.spec.ts`
- **Type**: E2E tests using Playwriter (playwright-core)
- **Framework**: Vitest with Playwriter MCP
- **Total Tests**: 17 test cases across 5 describe blocks

## Running the Tests

### Prerequisites
1. Install Playwriter Chrome Extension
2. Click the extension icon to enable it (turns GREEN)
3. Start dev server: `npm run dev`

### Run Tests
```bash
# Standard E2E test run
npm run test:e2e

# Run specific test file
npm run test:e2e -- tests/e2e/rejoin-request-flow.spec.ts

# Run with verbose output
npm run test:e2e:headed -- tests/e2e/rejoin-request-flow.spec.ts

# Watch mode
npm run playwriter:watch
```

## Test Organization

### 1. User Creates Rejoin Request (3 tests)
- ✅ Allow removed user to create rejoin request
  - Navigates to `/onboarding/removed-user`
  - Mocks successful `request_rejoin` RPC
  - Verifies success toast displayed
  
- ✅ Show error when rejoin request fails
  - Tests error handling for failed RPC calls
  - Mocks 400 error response
  - Verifies error message displayed to user
  
- ✅ Prevent duplicate rejoin requests via unique constraint
  - Tests unique constraint enforcement
  - Attempts to create two requests from same user/org
  - Verifies second request fails gracefully

### 2. Admin Approves Rejoin Request (4 tests)
- ✅ Show rejoin requests in admin UI (TeamMembersPage)
  - Tests rejoin requests tab visibility
  - Mocks rejoin requests data
  - Verifies requests displayed in UI
  
- ✅ Approve rejoin request with UI button
  - Mocks `approve_rejoin` RPC
  - Clicks approve button
  - Verifies success message
  
- ✅ Reject rejoin request with reason
  - Tests rejection with reason field
  - Mocks rejection RPC
  - Verifies confirmation flow
  
- ✅ Send rejection email when request is rejected
  - Tests email sending on rejection
  - Mocks email edge function
  - Verifies email endpoint called

### 3. User Regains Access After Approval (3 tests)
- ✅ Update user membership status to active after approval
  - Verifies `member_status` changes from 'removed' to 'active'
  - Mocks membership update
  - Checks RLS policies respected
  
- ✅ Allow approved user to access dashboard
  - Tests post-approval dashboard access
  - Verifies no redirect to pending screen
  - Validates dashboard content loads
  
- ✅ Clear redirect_to_onboarding flag after approval
  - Tests profile flag cleanup
  - Mocks profile with `redirect_to_onboarding = false`
  - Verifies user not redirected back to onboarding

### 4. Admin UI Integration (3 tests)
- ✅ Show rejoin request badge count in admin UI
  - Tests badge/indicator display
  - Mocks multiple pending requests
  - Verifies count shown to admin
  
- ✅ Display rejoin request details in list
  - Tests request details visibility
  - Shows user email, name, request date
  - Verifies proper table/list formatting
  
- ✅ Allow bulk actions on rejoin requests
  - Tests handling multiple requests
  - Verifies ability to approve/reject multiple
  - Validates UI doesn't break with multiple items

### 5. Error Handling and Edge Cases (4 tests)
- ✅ Handle network errors when creating rejoin request
  - Tests graceful network failure handling
  - Mocks network abort
  - Verifies user sees error message
  
- ✅ Handle RPC errors gracefully
  - Tests unexpected RPC error responses
  - Mocks 400 error with custom message
  - Verifies error doesn't crash UI
  
- ✅ Show loading state during approval process
  - Tests loading indicator appearance
  - Mocks 2-second RPC delay
  - Verifies loading clears on completion
  
- ✅ Prevent double-click approval submission
  - Tests debouncing/button disable
  - Double-clicks approval button
  - Verifies only one RPC call made

## Acceptance Criteria Coverage

| Criteria | Test Coverage | Status |
|----------|---------------|--------|
| Removed user creates rejoin request | `should allow removed user to create rejoin request` | ✅ |
| Admin approves rejoin request | `should approve rejoin request with UI button` | ✅ |
| User regains access after approval | `should allow approved user to access dashboard` | ✅ |
| Admin rejects with reason → email | `should send rejection email when request is rejected` | ✅ |
| Duplicate request prevention | `should prevent duplicate rejoin requests via unique constraint` | ✅ |
| Rejoin request in admin UI | `should show rejoin requests in admin UI (TeamMembersPage)` | ✅ |

## Technical Details

### Dependencies
- **ORGREM-005**: `request_rejoin` RPC function implementation
- **ORGREM-006**: `approve_rejoin` RPC function implementation
- **ORGREM-015**: Admin rejoin approval interface (RejoinRequestsTab)

### Mocked Endpoints
- `POST /rest/v1/rpc/request_rejoin` - Create rejoin request
- `POST /rest/v1/rpc/approve_rejoin` - Approve/reject rejoin request
- `GET /rest/v1/rejoin_requests` - Fetch rejoin requests
- `POST /functions/v1/send-rejection-email` - Send rejection email
- `GET /rest/v1/organization_memberships` - Check membership status
- `GET /rest/v1/profiles` - Fetch user profile flags

### Test Utilities
- **Playwriter Setup**: `tests/fixtures/playwriter-setup.ts`
  - Manages Chrome extension connection
  - Handles CDP session lifecycle
  - Provides page and context objects
  
- **Supabase Client**: Direct RPC calls via Supabase client
  - Creates test data
  - Verifies database state
  - Direct integration with Supabase backend

## Debugging

### If tests fail:

1. **Playwriter not connected**
   - Install Chrome extension: https://chromewebstore.google.com/detail/playwriter-mcp/jfeammnjpkecdekppnclgkkffahnhfhe
   - Click extension icon to enable it (should turn green)
   - Make sure Chrome is open with a tab

2. **Port conflicts**
   - Kill process using port 19988: `lsof -ti:19988 | xargs kill -9`
   - Or change `BASE_URL` env variable if dev server on different port

3. **Element not found**
   - Tests use text/role selectors which are resilient to CSS changes
   - If UI structure changed, update locators in affected tests
   - Run with `npm run test:e2e:headed` to see actual browser

4. **Timeout issues**
   - Vitest E2E timeout: 60s (see `vitest.config.e2e.ts`)
   - Page load timeout: 30s
   - Increase if testing slow network conditions

## Integration Points

### RPC Functions Called
- `request_rejoin(p_org_id)` - User requests to rejoin
- `approve_rejoin(p_request_id, p_admin_user_id, p_approved, p_rejection_reason)` - Admin decision

### Database Tables Tested
- `rejoin_requests` - Request status and metadata
- `organization_memberships` - Member status changes
- `profiles` - redirect_to_onboarding flag

### Supabase Services
- Database queries and RLS validation
- Email template rendering (via encharge-send-email)
- Real-time subscription updates

## Future Enhancements

1. Add snapshot testing for email templates
2. Test Supabase realtime subscriptions
3. Add performance benchmarks
4. Test with Clerk auth provider
5. Add accessibility audits (a11y)
6. Test with multiple organizations

## Notes

- Tests use route mocking to avoid actual email sending in test environment
- Error scenarios are comprehensive to ensure robust production behavior
- UI element selectors use accessible patterns (button text, roles) for resilience
- All tests are isolated and can run in any order (no shared state)
