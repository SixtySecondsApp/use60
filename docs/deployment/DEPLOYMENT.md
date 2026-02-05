# Deployment Guide

Complete guide for deploying use60 to production and staging environments.

## Quick Reference

| Task | Command |
|------|---------|
| Deploy edge functions to staging | `./scripts/deploy-functions-staging.sh` |
| Deploy edge functions to production | `./scripts/deploy-functions-production.sh` |
| Deploy migrations to staging | `./scripts/deploy-migrations.sh staging` |
| Deploy migrations to production | `./scripts/deploy-migrations.sh production` |
| Sync production data to staging | `npm run sync:staging` |
| Compare environments | `npm run sync:staging:compare` |

## Environments

| Environment | Project ID | URL |
|-------------|------------|-----|
| **Production** | `ygdpgliavpxeugaajgrb` | https://app.use60.com |
| **Staging** | `idurpiwkzxkzccifnrsu` | https://staging.use60.com |

## Prerequisites

1. **Supabase CLI** installed and authenticated:
   ```bash
   npm install -g supabase
   supabase login
   ```

2. **Access Token** configured:
   ```bash
   # Your access token should be in .env.production
   export SUPABASE_ACCESS_TOKEN=sbp_xxx
   ```

3. **Scripts executable**:
   ```bash
   chmod +x scripts/deploy-*.sh
   ```

---

## 1. Edge Functions Deployment

Edge functions are serverless Deno functions that run on Supabase's infrastructure.

### Deploy to Staging (Safe)
```bash
# Deploy all functions
./scripts/deploy-functions-staging.sh

# Deploy a specific function
./scripts/deploy-functions-staging.sh health

# List deployed functions
./scripts/deploy-functions-staging.sh --list
```

### Deploy to Production (Caution!)
```bash
# Deploy all functions (with confirmation)
./scripts/deploy-functions-production.sh

# Deploy a specific function
./scripts/deploy-functions-production.sh api-auth

# Skip confirmation (CI/CD use)
./scripts/deploy-functions-production.sh --force

# List deployed functions
./scripts/deploy-functions-production.sh --list
```

### Function Secrets

After deploying, ensure secrets are set in Supabase Dashboard:
1. Go to **Edge Functions** → **Secrets**
2. Add required environment variables:
   - `OPENAI_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `SLACK_SIGNING_SECRET`
   - etc.

### Testing Functions

```bash
# Test health endpoint
curl https://ygdpgliavpxeugaajgrb.supabase.co/functions/v1/health

# Test with auth
curl -H "Authorization: Bearer YOUR_ANON_KEY" \
  https://ygdpgliavpxeugaajgrb.supabase.co/functions/v1/api-auth
```

---

## 2. Database Migrations

Database schema changes are managed through SQL migration files in `supabase/migrations/`.

### Check Migration Status
```bash
# Check staging
./scripts/deploy-migrations.sh staging --status

# Check production
./scripts/deploy-migrations.sh production --status

# List local migrations
./scripts/deploy-migrations.sh --list
```

### Deploy to Staging
```bash
# Deploy pending migrations
./scripts/deploy-migrations.sh staging

# Dry run (preview only)
./scripts/deploy-migrations.sh staging --dry-run
```

### Deploy to Production
```bash
# Deploy with confirmation prompt
./scripts/deploy-migrations.sh production

# Skip confirmation (CI/CD)
./scripts/deploy-migrations.sh production --force
```

### Creating New Migrations

```bash
# Create a new migration file
supabase migration new my_migration_name

# This creates: supabase/migrations/YYYYMMDDHHMMSS_my_migration_name.sql
```

### Migration Best Practices

1. **Test locally first**: `supabase db push` (local)
2. **Deploy to staging**: `./scripts/deploy-migrations.sh staging`
3. **Verify in staging**: Test the app thoroughly
4. **Deploy to production**: `./scripts/deploy-migrations.sh production`
5. **Never edit deployed migrations**: Create new ones to fix issues

---

## 3. Data Synchronization

Sync production data to staging for realistic testing.

### Compare Environments
```bash
# See table counts in both environments
npm run sync:staging:compare
```

Output shows:
- Record counts for each table
- Differences between environments
- Which tables need syncing

### Sync Data (Interactive)
```bash
npm run sync:staging
```

Interactive menu options:
1. **Full sync** - Replace all data (slower but complete)
2. **Incremental sync** - Only sync missing records (faster)
3. **Specific tables** - Choose which tables to sync
4. **Sync differences** - Only tables with differences
5. **Dry run** - Preview without changes

### Sync Data (CLI)
```bash
# Full sync all tables
node scripts/sync-production-to-staging.js --tables=all

# Incremental sync (only missing records)
node scripts/sync-production-to-staging.js --tables=all --incremental

# Sync specific tables
node scripts/sync-production-to-staging.js --tables=activities,deals --incremental

# Dry run
node scripts/sync-production-to-staging.js --tables=all --dry-run --incremental
```

### Tables Synced
Data is synced in dependency order:
1. `profiles`, `organizations`, `organization_memberships`
2. `deal_stages`, `companies`, `contacts`
3. `deals`, `activities`, `meetings`, `tasks`
4. `calendar_events`, `fathom_integrations`
5. `action_items`, `meeting_attendees`, `meeting_insights`
6. `next_action_suggestions`, `proposals`, `relationship_health_scores`

### Incremental Sync
Tables supporting fast incremental sync (ID comparison):
- profiles, organizations, companies, contacts, deals
- activities, meetings, tasks, calendar_events, action_items

---

## 4. Full Deployment Workflow

### Recommended Deployment Order

1. **Deploy migrations to staging**
   ```bash
   ./scripts/deploy-migrations.sh staging
   ```

2. **Deploy edge functions to staging**
   ```bash
   ./scripts/deploy-functions-staging.sh
   ```

3. **Sync production data to staging** (optional)
   ```bash
   npm run sync:staging
   ```

4. **Test in staging environment**
   - Visit staging URL
   - Test new features/fixes
   - Verify data integrity

5. **Deploy migrations to production**
   ```bash
   ./scripts/deploy-migrations.sh production
   ```

6. **Deploy edge functions to production**
   ```bash
   ./scripts/deploy-functions-production.sh
   ```

7. **Verify production**
   - Check health endpoints
   - Test critical paths
   - Monitor error rates

### CI/CD Integration

For automated deployments:
```bash
# Staging (auto-deploy)
./scripts/deploy-migrations.sh staging --force
./scripts/deploy-functions-staging.sh

# Production (requires manual trigger or approval)
./scripts/deploy-migrations.sh production --force
./scripts/deploy-functions-production.sh --force
```

---

## 5. Troubleshooting

### Common Issues

**"Project not found" error**
```bash
# Ensure you're logged in
supabase login

# Link to project
supabase link --project-ref ygdpgliavpxeugaajgrb
```

**"Migration failed" error**
```bash
# Check migration status
./scripts/deploy-migrations.sh production --status

# View migration history
supabase migration list --project-ref ygdpgliavpxeugaajgrb
```

**"Function deployment failed"**
```bash
# Check function logs
supabase functions logs FUNCTION_NAME --project-ref ygdpgliavpxeugaajgrb

# Verify function exists
ls supabase/functions/FUNCTION_NAME/
```

**Data sync errors**
```bash
# Compare first
npm run sync:staging:compare

# Check for FK constraint issues
# Sync parent tables first (companies before contacts, etc.)
node scripts/sync-production-to-staging.js --tables=companies,contacts --incremental
```

### Emergency Rollback

**Edge Functions**: Re-deploy previous version from git
```bash
git checkout HEAD~1 -- supabase/functions/FUNCTION_NAME
./scripts/deploy-functions-production.sh FUNCTION_NAME
```

**Migrations**: Create a rollback migration
```bash
supabase migration new rollback_xxx
# Add reverse SQL statements
./scripts/deploy-migrations.sh production
```

---

## 6. NPM Scripts Reference

```json
{
  "sync:staging": "node scripts/sync-production-to-staging.js",
  "sync:staging:compare": "node scripts/sync-production-to-staging.js --compare",
  "sync:staging:dry-run": "node scripts/sync-production-to-staging.js --tables=all --dry-run"
}
```

Add to package.json for convenience:
```json
{
  "deploy:functions:staging": "./scripts/deploy-functions-staging.sh",
  "deploy:functions:production": "./scripts/deploy-functions-production.sh",
  "deploy:migrations:staging": "./scripts/deploy-migrations.sh staging",
  "deploy:migrations:production": "./scripts/deploy-migrations.sh production"
}
```

---

## 7. Security Notes

- **Never commit credentials** - Use environment variables
- **Production requires confirmation** - Scripts prompt for "yes"
- **Service role keys** - Only used server-side, never in frontend
- **Access tokens** - Keep in `.env.production` (gitignored)

---

## 8. Contact

For deployment issues:
- Check Supabase Dashboard logs
- Review edge function logs
- Contact team lead for production access
