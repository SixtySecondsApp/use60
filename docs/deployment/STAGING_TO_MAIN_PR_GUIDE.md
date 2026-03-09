# Staging → Main PR Guide

Every time we merge staging into production, follow this checklist in order.
Skipping the post-merge reset is what causes the "888 commits ahead" problem.

---

## Why this matters

We merge staging → main via merge commits (non-fast-forward). This brings the
code across but leaves staging's branch pointer untouched — so staging
immediately shows N commits ahead again. The reset below is what fixes that.

---

## Pre-merge checklist

- [ ] All features to be released are merged into `staging` and tested
- [ ] No pending migration conflicts (run `npx supabase migration list --linked`)
- [ ] Edge functions needed for new features are deployed to staging
- [ ] No `.env` secrets or service role keys accidentally committed
- [ ] QA smoke test done on staging (`npm run dev:staging`)

---

## Creating the PR

```bash
gh pr create \
  --base main \
  --head staging \
  --title "release: staging → main — <short description>" \
  --body "$(cat docs/deployment/PR_TEMPLATE.md)"
```

Or use GitHub UI: **New pull request** → base: `main` ← compare: `staging`

### PR title format

```
release: staging → main — <what changed in one line>
```

### PR body sections (required)

| Section | What to include |
|---------|----------------|
| **Summary** | Bullet points — features, fixes, migrations, security changes |
| **Test plan** | Checkbox list of things to verify after merge |
| **Post-merge steps** | Always include the staging reset commands (see below) |

---

## After the PR is merged

**Do this immediately — before starting any new work on staging.**

```bash
git checkout staging
git fetch origin
git reset --hard origin/main
git push origin staging --force
```

Then verify:

```bash
gh api repos/SixtySecondsApp/use60/compare/main...staging \
  --jq '{ahead_by: .ahead_by, behind_by: .behind_by}'
# Expected: { "ahead_by": 0, "behind_by": 0 }
```

---

## Edge functions — production deploy

After the PR merges, deploy any new or changed edge functions:

```bash
# Deploy a single function
npx supabase functions deploy <function-name> --project-ref ygdpgliavpxeugaajgrb

# Deploy multiple
for fn in function-one function-two function-three; do
  npx supabase functions deploy $fn --project-ref ygdpgliavpxeugaajgrb
done
```

> **Note:** If a function needs public access (webhook, demo endpoint), add `--no-verify-jwt`

---

## Database migrations — production push

> **Automated:** Migrations are auto-applied by CI when code merges to `main`.
> The `db-migrations` workflow runs `supabase db push --linked` and sends a Slack
> notification on success or failure. You do not need to run this manually.

**Manual fallback** (emergency only):

```bash
# Push pending migrations to production (linked project)
npx supabase db push --linked
```

If the push fails due to duplicate timestamps, temporarily move the
conflicting files:

```bash
mv supabase/migrations/<conflicting-file>.sql /tmp/
npx supabase db push --linked
mv /tmp/<conflicting-file>.sql supabase/migrations/
```

If a migration needs to be marked as already applied:

```bash
npx supabase migration repair --status applied <timestamp> --linked
```

---

## Supabase environments

| Environment | Project ref | Branch | Deploy command |
|-------------|-------------|--------|----------------|
| Production  | `ygdpgliavpxeugaajgrb` | `main` | `--project-ref ygdpgliavpxeugaajgrb` |
| Staging     | `caerqjzvuerejfrdtygb` | `staging` | `--project-ref caerqjzvuerejfrdtygb --no-verify-jwt` |

---

## Rollback

If something breaks in production after a merge:

```bash
# Revert the merge commit on main
git revert -m 1 <merge-commit-sha>
git push origin main

# Redeploy the previous edge function version via Supabase dashboard
# (Functions → select function → Versions tab)
```

For database: migrations are not auto-rolled back. Write a compensating
migration manually if needed.

---

## Quick reference — full release flow

```bash
# 1. Confirm staging is ready
npm run dev:staging  # smoke test

# 2. Create the PR
gh pr create --base main --head staging --title "release: staging → main — <desc>"

# 3. Merge the PR on GitHub

# 4. Deploy edge functions to production
npx supabase functions deploy <changed-functions> --project-ref ygdpgliavpxeugaajgrb

# 5. Migrations auto-applied by CI (db-migrations workflow)
#    Manual fallback: npx supabase db push --linked

# 6. RESET STAGING (critical — prevents commit divergence)
git checkout staging && git fetch origin
git reset --hard origin/main
git push origin staging --force

# 7. Verify divergence is zero
gh api repos/SixtySecondsApp/use60/compare/main...staging --jq '.ahead_by'
# Expected: 0
```
