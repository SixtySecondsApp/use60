# Old Project Deletion Checklist

Before deleting the old Supabase project (`ewtuefzeogytgmsnkpmb`), verify these items:

## ✅ Completed Checks

### Storage Migration
- ✅ All buckets migrated (`profile-images`, `meeting-assets`)
- ✅ All files copied (2 files from `profile-images`)
- ✅ No old URLs found in database tables

### Code References
- ✅ No references in `src/` (production code)
- ✅ No references in `supabase/functions/` (edge functions)
- ✅ No references in `.github/workflows/` (CI/CD)
- ✅ No references in `api/` (API routes)

## ⚠️ Remaining References (Non-Critical)

These files contain old project references but are **NOT actively used**:

### Documentation & Archives
- `docs/archive/*` - Historical documentation (safe to ignore)
- `docs/SUPABASE_STORAGE_MIGRATION.md` - Migration guide (references old project for context)

### Test & Development Scripts
- `scripts/migrate-storage.mjs` - Migration script (references old project by design)
- `scripts/migrate-profile-images.mjs` - Migration script (references old project by design)
- `scripts/check-old-urls.mjs` - Verification script (references old project by design)
- `scripts/deployment/*` - Deployment scripts (may reference old project for historical context)
- `tests/scripts/*` - Test scripts (may reference old project)

### Test HTML Files
- `public/*.html` - Test/debug HTML files (not used in production)
- `packages/landing/public/*.html` - Landing page test files (not used in production)
- `tools/testing/*.html` - Testing tools (not used in production)

### Configuration Files
- `.env.example` - Example file (may reference old project for documentation)

## 🔍 Final Verification Steps

### 1. Verify Production Environment Variables
Check that production deployments (Vercel, etc.) are using the NEW project:

```bash
# Check Vercel environment variables
# Should have:
# VITE_SUPABASE_URL=https://ygdpgliavpxeugaajgrb.supabase.co
# VITE_SUPABASE_ANON_KEY=<new-project-anon-key>
```

### 2. Verify Edge Functions Are Deployed to New Project
```bash
# List functions in new project
supabase functions list --project-ref ygdpgliavpxeugaajgrb
```

### 3. Verify Database Migrations Are Applied
```bash
# Check migration status in new project
supabase db remote commit --project-ref ygdpgliavpxeugaajgrb
```

### 4. Test Critical Functionality
- [ ] User authentication works
- [ ] Storage uploads/downloads work
- [ ] Edge functions respond correctly
- [ ] Database queries return expected data

### 5. Check External Integrations
Verify these are pointing to the NEW project:
- [ ] Clerk webhooks (if using Clerk auth)
- [ ] Slack webhooks
- [ ] Fathom webhooks
- [ ] Stripe webhooks
- [ ] Any other external service webhooks

## 🚨 Before Deleting

### Recommended: Keep Old Project for 30 Days
Even after migration, it's recommended to:
1. **Pause the old project** instead of deleting immediately
2. Keep it paused for 30 days as a safety net
3. Monitor the new project for any issues
4. Delete only after confirming everything works

### If You Must Delete Now

1. **Export final backup** (if not already done):
   ```bash
   # Export database
   supabase db dump --project-ref ewtuefzeogytgmsnkpmb > old-project-backup.sql
   ```

2. **Verify no active connections**:
   - Check Supabase Dashboard → Logs for any recent activity
   - Ensure no cron jobs or scheduled tasks are running

3. **Double-check environment variables**:
   - Vercel production environment
   - Local development `.env.local`
   - Any CI/CD secrets

## ✅ Safe to Delete Checklist

- [x] Storage migrated and verified
- [x] Database URLs updated (no old references found)
- [x] Production code updated (no hardcoded references)
- [x] Edge functions deployed to new project
- [ ] Production environment variables updated
- [ ] External webhooks updated
- [ ] Final backup exported (recommended)
- [ ] Tested critical functionality on new project

## 📝 Notes

- The 166 files with old project references are mostly:
  - Documentation/archives (safe)
  - Migration scripts (intentionally reference old project)
  - Test files (not used in production)
  
- **Production code is clean** - no active references to old project

## 🎯 Recommendation

**Status: ✅ SAFE TO DELETE** (after final verification)

The old project can be safely deleted after:
1. Verifying production environment variables point to new project
2. Confirming edge functions are deployed to new project
3. Testing critical functionality
4. (Optional) Exporting final backup

The remaining references in the codebase are non-critical (docs, test files, migration scripts).
