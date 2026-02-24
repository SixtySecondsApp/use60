# Organization User Removal - Edge Cases Test Suite

**Story:** ORGREM-019
**Test File:** `tests/e2e/removal-edge-cases.spec.ts`
**Status:** Complete ✅

## Overview

This test suite validates edge cases and error handling for the organization user removal feature. It ensures the system handles exceptional scenarios gracefully without data loss or security vulnerabilities.

## Test Coverage

### 1. RPC Error Handling - Last Owner Protection
- **Test:** Cannot remove last owner via RPC
- **Validation:** RPC returns error when attempting to remove sole owner
- **Acceptance:** Error message contains "last owner" and success=false

- **Test:** Error toast shown when attempting in UI
- **Validation:** Frontend displays appropriate error message
- **Acceptance:** Toast notification shows user-friendly error

### 2. Self-Removal Prevention
- **Test:** RPC blocks self-removal attempts
- **Validation:** Returns error "cannot remove yourself"
- **Acceptance:** RPC enforces self-removal protection

- **Test:** UI hides remove button for current user
- **Validation:** Frontend prevents self-removal at UI level
- **Acceptance:** Remove button not visible for logged-in user

### 3. Concurrent Request Handling
- **Test:** Multiple simultaneous removal requests
- **Validation:** Handles race conditions without data corruption
- **Acceptance:** Only one request succeeds, others fail gracefully

- **Test:** Duplicate rejoin requests
- **Validation:** Unique constraint prevents duplicate pending requests
- **Acceptance:** Second request returns "already have pending request"

- **Test:** Concurrent approval attempts
- **Validation:** Request status check prevents double-processing
- **Acceptance:** Only one approval succeeds, other gets "already processed"

### 4. RLS Edge Cases - Removed Users and Data Access
- **Test:** Read-only access to historical data
- **Validation:** Removed users can view but not edit their old records
- **Acceptance:** Edit buttons disabled, view access maintained

- **Test:** Null reference handling
- **Validation:** UI handles removed user references gracefully
- **Acceptance:** No "undefined" or "null" displayed in UI

### 5. Email Delivery Failures - Non-Blocking
- **Test:** Removal succeeds despite email failure
- **Validation:** SMTP errors don't block user removal
- **Acceptance:** Success toast shown, removal completed

- **Test:** Email errors logged silently
- **Validation:** Errors logged to console, not shown to users
- **Acceptance:** No error alerts displayed for email failures

### 6. Network Timeout Handling
- **Test:** RPC timeout with loading state
- **Validation:** Loading indicator shown during slow requests
- **Acceptance:** UI remains responsive during timeout

- **Test:** Timeout error messaging
- **Validation:** Clear error shown after extended delay
- **Acceptance:** Error message suggests "try again"

- **Test:** Rejoin request timeout
- **Validation:** Handles network failures gracefully
- **Acceptance:** User-friendly error without crash

### 7. RPC Error Response Formats
- **Test:** Malformed error responses
- **Validation:** Handles unexpected JSON structures
- **Acceptance:** No crash, graceful degradation

- **Test:** Unexpected HTTP status codes
- **Validation:** Handles non-standard responses (e.g., 418)
- **Acceptance:** Generic error message displayed

### 8. Permission Edge Cases
- **Test:** Non-admin removal attempts
- **Validation:** RPC blocks non-admin users
- **Acceptance:** Error mentions "admin" or "permission"

- **Test:** UI hides buttons for non-admins
- **Validation:** Frontend enforces permission checks
- **Acceptance:** Remove buttons not visible to regular members

## Running the Tests

### Prerequisites

1. **Install Playwriter Chrome Extension**
   - Visit: https://chromewebstore.google.com/detail/playwriter-mcp/jfeammnjpkecdekppnclgkkffahnhfhe
   - Install the extension
   - The icon should turn GREEN when connected

2. **Start Development Server**
   ```bash
   npm run dev
   ```

3. **Ensure Supabase Environment Variables**
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

### Run Tests

```bash
# Run all edge case tests
npm run test:e2e -- removal-edge-cases

# Run with verbose output
npm run test:e2e:headed -- removal-edge-cases

# Run in UI mode
npm run test:e2e:ui
```

### CI/CD Integration

For automated CI environments without browser access, consider:

1. **Unit Test Alternative:** Convert critical RPC tests to unit tests
   ```bash
   npm run test:unit -- removal-edge-cases
   ```

2. **Mock Browser Mode:** Use headless Playwright (requires additional setup)
   ```bash
   npm run playwright:test -- removal-edge-cases
   ```

## Test Data Requirements

### Database State

Tests assume the following test data exists:

- **Test Organization:** `00000000-0000-0000-0000-000000000001`
- **Test Users:**
  - Last Owner: `00000000-0000-0000-0000-000000000002`
  - Self User: `00000000-0000-0000-0000-000000000003`
  - Target User: `00000000-0000-0000-0000-000000000004`
  - Test Request: `00000000-0000-0000-0000-000000000005`

### Seeding Test Data

```sql
-- Insert test organization
INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Test Org');

-- Insert test users (requires auth.users setup)
-- Note: Use Supabase dashboard or migrations for proper auth setup
```

## Troubleshooting

### Error: "Playwriter Chrome Extension not connected"
- **Solution:** Click the Playwriter extension icon in Chrome toolbar
- **Verify:** Icon should be GREEN
- **Check:** Extension has access to the current tab

### Error: "EADDRINUSE: address already in use"
- **Cause:** Another test process is still running
- **Solution:** Kill the existing process or restart terminal
- **Command:** `taskkill /F /IM node.exe` (Windows) or `killall node` (Mac/Linux)

### Error: "Test timeout"
- **Cause:** Development server not running or slow network
- **Solution:**
  1. Ensure `npm run dev` is running in separate terminal
  2. Check app loads at http://localhost:5175
  3. Increase timeout in `vitest.config.e2e.ts`

### Tests Skipped Due to Missing Data
- **Cause:** Test database doesn't have required seed data
- **Solution:** Run database migrations and seed scripts
- **Check:** Verify test users exist in `profiles` table

## Integration with Existing Test Suites

This test suite complements:

- **ORGREM-017:** Integration tests for removal flow
- **ORGREM-018:** Rejoin request flow tests
- **Unit Tests:** RPC function logic tests

Run all removal tests together:
```bash
npm run test:e2e -- orgrem
```

## Future Enhancements

1. **Snapshot Testing:** Add visual regression tests for error states
2. **Load Testing:** Simulate high-concurrency scenarios
3. **Accessibility:** Validate ARIA labels and keyboard navigation
4. **Mobile:** Test responsive behavior on mobile viewports

## Related Documentation

- [Organization User Removal Flow](../../.sixty/consult/org-user-removal.md)
- [RPC Functions](../../supabase/migrations/20260202093842_create_remove_user_from_org_rpc.sql)
- [Test Plan](../../.sixty/plan.json) - Story ORGREM-019

## Maintenance

**Last Updated:** 2026-02-02
**Test Author:** Claude Sonnet 4.5
**Review Schedule:** After each sprint or when RPC functions change

### Updating Tests

When modifying RPC functions or UI components, update:

1. Test assertions to match new error messages
2. Mock responses to reflect API changes
3. Selector queries if UI structure changes
4. Timeout values if performance degrades

### Test Stability

These tests are designed to be:
- **Idempotent:** Can run multiple times without side effects
- **Isolated:** Each test cleans up after itself
- **Deterministic:** Same input produces same output
- **Fast:** Complete in under 2 minutes total

## Support

For test failures or questions:

1. Check test output logs for specific error messages
2. Review console errors in browser DevTools
3. Verify database state matches expected seed data
4. Consult [CLAUDE.md](../../CLAUDE.md) for project patterns
