## Summary

<!-- Bullet points — group by type -->

**Features**
-

**Bug fixes**
-

**Migrations**
-

**Security / performance**
-

**Edge functions deployed**
-

## Database migrations checklist

<!-- Complete if this PR includes files in supabase/migrations/ -->

- [ ] Migration file follows naming convention: `YYYYMMDDHHMMSS_description.sql`
- [ ] Tested locally with `supabase db push --dry-run`
- [ ] CI dry-run (`validate-migrations`) passed
- [ ] No direct SQL changes applied via Supabase dashboard
- [ ] Destructive migrations (DROP, ALTER column type) include rollback strategy below

**Rollback strategy** (if destructive):
<!-- Describe how to reverse this migration if needed -->

## Test plan

- [ ] Smoke test on staging before merge (`npm run dev:staging`)
- [ ] Key user flows work in production after merge
- [ ] No new errors in Supabase edge function logs
- [ ] Supabase security lints clear (Dashboard > Advisors > Security)
- [ ]

## Post-merge steps (REQUIRED)

```bash
# Reset staging to main — prevents commit divergence
git checkout staging && git fetch origin
git reset --hard origin/main
git push origin staging --force
```
