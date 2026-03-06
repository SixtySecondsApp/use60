> **Note:** This template has moved to `.github/PULL_REQUEST_TEMPLATE.md` where GitHub auto-populates it on new PRs. This file is kept for reference.

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

## Test plan

- [ ] Smoke test on staging before merge (`npm run dev:staging`)
- [ ] Key user flows work in production after merge
- [ ] No new errors in Supabase edge function logs
- [ ] Supabase security lints clear (Dashboard → Advisors → Security)
- [ ]

## Post-merge steps (REQUIRED)

```bash
# Reset staging to main — prevents commit divergence
git checkout staging && git fetch origin
git reset --hard origin/main
git push origin staging --force
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
