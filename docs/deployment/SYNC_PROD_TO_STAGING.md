# Production → Staging Data Sync

Copy production data to the staging branch database.

## Prerequisites

1. **Docker Desktop** - Must be running (required by Supabase CLI)
2. **Supabase CLI** - `brew install supabase/tap/supabase`
3. **PostgreSQL 17 client** - `brew install postgresql@17`
4. **Database password** - Get from Supabase Dashboard → Project Settings → Database

## Quick Start

```bash
# Set connection URLs (replace <password> with your database password)
export PROD_DB_URL="postgresql://postgres.ygdpgliavpxeugaajgrb:<password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
export STAGING_DB_URL="postgresql://postgres.caerqjzvuerejfrdtygb:<password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"

# Run the sync
SYNC_PROD_TO_STAGING=yes npm run sync:staging:full
```

## Connection String Format

Use **Supavisor session mode** (port 5432) with the pooler:

```
postgresql://postgres.<project_ref>:<password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres
```

| Environment | Project Ref | Pooler Host |
|-------------|-------------|-------------|
| Production | `ygdpgliavpxeugaajgrb` | `aws-1-eu-west-1.pooler.supabase.com` |
| Staging | `caerqjzvuerejfrdtygb` | `aws-1-eu-west-1.pooler.supabase.com` |

> **Important**: Use `aws-1-eu-west-1` not `aws-0-eu-west-1` for eu-west-1 region.

## What Gets Synced

| Schema | Synced | Notes |
|--------|--------|-------|
| `public` | ✅ | All application data |
| `auth` | ✅ | Users, identities (excludes sessions/tokens) |
| `storage` | ❌ | Supabase internal tables - not accessible |

**Excluded tables**: `auth.sessions`, `auth.refresh_tokens`, `auth.audit_log_entries`

## How It Works

1. **Dump** - Uses `supabase db dump` which includes `session_replication_role=replica` to bypass FK constraints
2. **Truncate** - Clears staging tables (preserves schema)
3. **Restore** - Loads production data via `psql`
4. **Validate** - Compares row counts between environments

## Verification

The script outputs row counts for key tables:

```
Production counts:
auth.users      39
deals           672
meetings        1736
organizations   21
profiles        38

Staging counts:
auth.users      39
deals           672
meetings        1736
organizations   21
profiles        38
```

If counts match, the sync succeeded.

## Troubleshooting

### "Docker is not running"
Start Docker Desktop before running the sync.

### "Tenant or user not found"
Wrong password or incorrect pooler URL. Verify:
- Password matches what's in Supabase Dashboard
- Using `aws-1-eu-west-1` (not `aws-0-`)
- Using port `5432` (session mode)

### "Connection refused"
Direct database connections may be blocked. Always use the pooler URL.

### "pg_dump version mismatch"
Upgrade PostgreSQL client:
```bash
brew install postgresql@17
brew link postgresql@17 --force --overwrite
```

### "Permission denied for table"
Some Supabase internal tables (especially in `storage` schema) are not accessible. The script excludes these by default.

## Advanced Options

```bash
# Custom schemas (default: public,auth)
export SYNC_SCHEMAS="public,auth"

# Custom exclusions
export EXCLUDE_TABLE_DATA="auth.sessions,auth.refresh_tokens,auth.audit_log_entries"

# Custom dump file location
export DUMP_FILE="$PWD/tmp/my-dump.sql"
```

## Notes

- **Passwords won't work** - Auth users are synced but passwords may not work across environments. Use password reset flows.
- **Sessions are excluded** - Users will need to log in again on staging.
- **Storage objects excluded** - Files in storage buckets are not synced.
