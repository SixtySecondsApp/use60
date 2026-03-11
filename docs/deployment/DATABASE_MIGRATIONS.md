# Database Migrations

## The golden rule

**One way in, one way out.** Every schema change goes through a migration file in
`supabase/migrations/`. No dashboard SQL. No ad-hoc `psql`. If it's not in a file,
it didn't happen.

---

## Creating a migration

```bash
./scripts/new-migration.sh add_user_preferences
# → supabase/migrations/20260306143022_add_user_preferences.sql
```

The script generates a UTC timestamp so migrations always sort correctly.

### Naming conventions

| Pattern | Example |
|---------|---------|
| New table | `add_user_preferences` |
| New column | `add_status_to_deals` |
| New RPC/function | `create_get_pipeline_stats_rpc` |
| RLS policy | `rls_deals_owner_policy` |
| Fix/patch | `fix_contacts_rls` |
| Index | `idx_meetings_owner_user_id` |
| Data backfill | `backfill_deal_stages` |

### Writing good migrations

```sql
-- Use IF NOT EXISTS / OR REPLACE for idempotency
CREATE TABLE IF NOT EXISTS user_preferences ( ... );
CREATE OR REPLACE FUNCTION get_stats() RETURNS ... ;
CREATE INDEX IF NOT EXISTS idx_foo ON bar (col);

-- Policies are NOT idempotent — always drop first
DROP POLICY IF EXISTS "users can read own deals" ON deals;
CREATE POLICY "users can read own deals" ON deals
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());
```

### What goes in the file header

```sql
-- Migration: add_user_preferences
-- Date: 20260306143022
--
-- What this migration does:
--   Adds a user_preferences table for storing per-user settings
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS user_preferences;
```

---

## Workflow

```
feature branch → PR to staging → merge → staging auto-apply
                                          ↓
                            staging → main PR → merge → production auto-apply
```

### Step by step

1. **Create the file**: `./scripts/new-migration.sh <name>`
2. **Write your SQL**
3. **Test locally**: `npx supabase db push --linked --dry-run`
4. **Commit & push**: `git add supabase/migrations/... && git commit`
5. **Open PR to staging**: CI runs `validate-migrations` (dry-run against staging DB)
6. **Merge**: CI auto-applies to staging, Slack notification fires
7. **Staging → main PR**: CI validates against production DB
8. **Merge to main**: CI auto-applies to production, Slack notification fires

### What CI does

| Event | Job | Action |
|-------|-----|--------|
| PR to staging/main | `validate-migrations` | Dry-run — blocks PR if SQL is broken |
| Push to staging | `apply-staging` | `supabase db push --linked` + Slack |
| Push to main | `apply-production` | `supabase db push --linked` + Slack |

Workflow file: `.github/workflows/db-migrations.yml`

---

## Rules

### Do
- One migration per concern — don't bundle unrelated changes
- Use idempotent SQL (`IF NOT EXISTS`, `CREATE OR REPLACE`)
- Include a rollback strategy for destructive changes
- Test with `--dry-run` before pushing
- Keep migrations small and focused

### Don't
- Never apply SQL directly via the Supabase dashboard
- Never edit or rename an already-merged migration file
- Never reuse a timestamp from an existing migration
- Never put multiple `CREATE TABLE` statements for unrelated tables in one file
- Never commit migrations that depend on data that might not exist (use `IF EXISTS` guards)

---

## Troubleshooting

### "Found local migration files to be inserted before the last migration"

Local files have timestamps older than the latest applied remote migration.
Fix: rename the file to a new timestamp or use `--include-all`.

```bash
# Check current state
npx supabase migration list --linked

# If file content was already applied via dashboard, mark it
npx supabase migration repair --status applied <timestamp> --linked
```

### "policy already exists"

Your migration uses `CREATE POLICY` without dropping first. Fix:

```sql
DROP POLICY IF EXISTS "policy_name" ON table_name;
CREATE POLICY "policy_name" ON table_name ...;
```

### "relation already exists"

Add `IF NOT EXISTS`:

```sql
CREATE TABLE IF NOT EXISTS table_name ( ... );
```

### Migration applied to staging but fails on production

Production may have different data. Common causes:
- `NOT NULL` on a column with existing NULL values → add `DEFAULT` or backfill first
- `UNIQUE` constraint on column with duplicates → clean data in a prior migration
- Different RLS policies or functions → check with `migration list --linked`

### Emergency: need to skip a migration on a specific environment

```bash
npx supabase migration repair --status reverted <timestamp> --linked
```

This tells the CLI to ignore that migration. Use sparingly.
