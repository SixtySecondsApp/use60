# Playwright Test User Setup

## Overview

The Playwright test user is configured to mirror the data and permissions of `andrew.bryce@sixtyseconds.video` to ensure consistent testing across all application features and views.

## Test User Credentials

- **Email**: `playwright@test.com`
- **Password**: `TestPassword123!` (or set via `PLAYWRIGHT_TEST_PASSWORD` env variable)

## Features

The Playwright test user has:

1. **Same permissions and roles** as andrew.bryce
2. **Organization and team memberships** copied from andrew.bryce
3. **Calendar integration settings** (ready for Google Calendar connection)
4. **Sample test data** including:
   - Deals (marked with "(Test)" suffix)
   - Tasks (marked with "(Test)" suffix)
   - Calendar events (marked with "(Test)" suffix)
   - Contacts
   - Activities

## Setup Instructions

### Initial Setup

1. **Run the migration** to create database structures:
   ```bash
   npx supabase migration up
   ```

2. **Run the setup script** to create and configure the test user:
   ```bash
   npm run setup:playwright-user
   ```

3. **Add test credentials to your environment**:
   ```bash
   # Add to .env or .env.local
   TEST_USER_EMAIL=playwright@test.com
   TEST_USER_PASSWORD=TestPassword123!
   ```

### Google Calendar Integration

To enable Google Calendar for the test user:

1. Log in as the Playwright test user
2. Navigate to Calendar page
3. Click "Connect Calendar"
4. Authorize with a test Google account
5. The integration settings will be saved for future test runs

### Syncing Data

To keep the test user in sync with andrew.bryce's permissions:

```sql
-- Run in Supabase SQL editor
SELECT sync_playwright_test_user();
```

## Database Schema

The migration creates/updates the following for the test user:

- `profiles` - User profile with admin status and roles
- `organization_members` - Organization memberships
- `team_members` - Team memberships
- `calendar_integrations` - Calendar settings
- `user_preferences` - User preferences
- `notification_settings` - Notification preferences
- `api_keys` - API key configurations (test copies)

## Test Data

Sample data is automatically created:
- 10 test deals
- 10 test tasks
- 20 test calendar events
- 20 test contacts
- 30 test activities

All test data is marked with "(Test)" suffix for easy identification.

## Using in Playwright Tests

The auth setup is configured to use the test user:

```typescript
// tests/fixtures/auth.setup.ts
const testEmail = process.env.TEST_USER_EMAIL || 'playwright@test.com';
const testPassword = process.env.TEST_USER_PASSWORD || 'TestPassword123!';
```

Tests will automatically authenticate as this user and have access to:
- All the same views as andrew.bryce
- Calendar integration (if connected)
- Admin features
- Test data for verification

## Maintenance

### Refresh Test Data

To refresh test data, re-run the setup script:
```bash
npm run setup:playwright-user
```

### Update Permissions

If andrew.bryce's permissions change, sync the test user:
```sql
SELECT sync_playwright_test_user();
```

### Clean Up Test Data

To remove test data while keeping the user:
```sql
-- Remove test deals
DELETE FROM deals WHERE created_by = (
  SELECT id FROM auth.users WHERE email = 'playwright@test.com'
) AND deal_name LIKE '%(Test)';

-- Remove test tasks
DELETE FROM tasks WHERE assigned_to = (
  SELECT id FROM auth.users WHERE email = 'playwright@test.com'
) AND title LIKE '%(Test)';

-- Remove test calendar events
DELETE FROM calendar_events WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'playwright@test.com'
) AND title LIKE '%(Test)';
```

## Troubleshooting

### User Not Found

If the Playwright user doesn't exist:
1. Run `npm run setup:playwright-user`
2. Check Supabase Auth dashboard for user creation

### Permission Issues

If the test user lacks permissions:
1. Verify andrew.bryce user exists and has correct permissions
2. Run `SELECT sync_playwright_test_user();` to sync permissions

### Calendar Not Working

If calendar integration isn't working:
1. Log in as test user
2. Connect Google Calendar manually
3. Verify `calendar_integrations` table has entry for test user

### Test Data Missing

If test data is missing:
1. Check migration ran successfully
2. Re-run setup script: `npm run setup:playwright-user`
3. Verify data in Supabase dashboard

## Security Notes

- Test user password should be strong but different from production passwords
- Don't copy actual authentication tokens (Google OAuth, etc.)
- Test data is marked clearly to avoid confusion with real data
- Consider using a separate test database for CI/CD environments