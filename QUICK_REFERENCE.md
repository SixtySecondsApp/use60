# Quick Reference - Leave Organization & Onboarding Fixes

## 🚀 60-Second Deployment

```bash
# 1. Merge PR
git checkout main && git merge origin/fix/go-live-bug-fixes && git push

# 2. Deploy RPC functions (pick one)
npx supabase db push --linked  # OR manually execute SQL in Supabase Dashboard

# 3. Deploy to production
vercel deploy --prod
```

## 🧪 Quick Test

**Credentials:**
- Email: `max.parish501@gmail.com`
- Password: `NotTesting@1`

**Test Flow:**
1. Login → Settings → Organization Management
2. Click "Leave Team" → Confirm
3. Expect: Redirect to `/onboarding/removed-user`
4. Click "Choose Different Org"
5. Expect: No infinite spinner, page loads in 3-5 seconds

## 📋 What Changed

| Issue | Fix | File |
|-------|-----|------|
| Can't leave org (RLS) | Use RPC function | `leaveOrganizationService.ts` |
| Infinite loading after leave | Handle missing RPC | `OnboardingV2.tsx` |
| Bad redirect flow | Use window.location | `RemovedUserStep.tsx` |

## ⚠️ If Something Breaks

```bash
# Quick rollback
git revert 0d3bee8d d99fa080 8a720587
git push origin main
vercel deploy --prod
```

## 📚 Full Docs

- **DEPLOYMENT_AND_TEST_GUIDE.md** - Complete step-by-step
- **LEAVE_ORGANIZATION_FIX_SUMMARY.md** - Technical deep-dive
- **FINAL_STATUS_REPORT.md** - Full status & verification
- **test-leave-org.mjs** - Automated E2E tests

## ✅ Checklist

- [ ] RPC functions deployed
- [ ] Code deployed to prod
- [ ] Leave org test passes
- [ ] Org selection test passes
- [ ] No console errors
- [ ] No infinite spinners

## 🆘 Troubleshooting

| Error | Solution |
|-------|----------|
| "Could not find function" | Run `supabase db push --linked` |
| Infinite spinner | Check browser console for PGRST202 error |
| No redirect | Verify `window.location.href` works |
| RLS error | Confirm RPC has SECURITY DEFINER |

## 📞 Commands

```bash
# Check if functions exist
supabase functions list

# Verify RPC in staging
supabase db pull --linked

# Run e2e tests
node test-leave-org.mjs

# View deployment logs
vercel logs --prod
```

**Status:** ✅ Ready for production

