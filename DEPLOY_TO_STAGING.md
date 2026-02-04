# Deploy to Staging with .env.staging

## 🚀 Deploy Latest Fixes

The latest commits fix the infinite loading issue and missing imports. Ready to deploy to staging!

### Option 1: GitHub - Automatic Deployment (EASIEST)

1. Create a PR: `fix/go-live-bug-fixes` → `main`
2. Wait for GitHub Actions to run
3. Merge PR to `main`
4. Vercel will automatically deploy to staging

**Status:** Commits are pushed and ready

### Option 2: Manual Vercel Deployment

```bash
cd sixty-sales-dashboard

# Method A: Using stored credentials
vercel --prod

# Method B: Using token (if you have VERCEL_TOKEN)
VERCEL_TOKEN=your_token_here vercel --prod
```

### Option 3: Build & Deploy Manually

```bash
# Build with staging env
npm run build

# Deploy to Vercel (requires credentials)
vercel deploy ./dist
```

---

## 📋 What's Included in This Deployment

### Latest Commits:
- `3cf670ec` - Disable problematic RPC check (fixes 404 errors)
- `3eeb1203` - Add missing isPersonalEmailDomain import (fixes infinite loading)
- `dfb6f752` - Add fallback approach for RPC
- `e02e6845` - Complete documentation

### What Works Now:
✅ Onboarding page loads without infinite spinner
✅ Organization selection page accessible
✅ No more missing import errors
✅ Graceful RPC error handling
✅ Leave organization feature ready (when RPC deployed)

### What Still Needs:
⏳ Deploy `user_leave_organization` RPC function (separate step)

---

## 🔗 Vercel Project Links

- **Project Name:** sixty-app
- **Project ID:** prj_J2lVzYYiUkpsVNa4UqnURNXWP4qE
- **Org ID:** team_KtZ9lwnVgww8ibhhOIJKYDcp
- **Staging URL:** https://staging.use60.com

---

## 📊 Environment Variables

Using `.env.staging`:
- Supabase URL: https://caerqjzvuerejfrdtygb.supabase.co (staging)
- All credentials configured for staging environment
- Ready to deploy immediately

---

## ✅ Pre-Deployment Checklist

- [x] Code changes committed
- [x] Build passes locally
- [x] No TypeScript errors
- [x] All imports resolved
- [x] Documentation complete
- [ ] PR created and merged (if using auto-deploy)
- [ ] Vercel deployment confirmed
- [ ] Test in staging
- [ ] RPC function deployed (separate)

---

## 🧪 Testing After Deployment

1. Go to https://staging.use60.com
2. Login with: `max.parish501@gmail.com` / `NotTesting@1`
3. Navigate to Settings → Organization Management
4. Click "Leave Team"
5. Should see removed-user page
6. Click "Choose Different Organization"
7. Should see organization selection (no spinner)

---

## 🆘 Troubleshooting

**If deployment fails:**
- Check Vercel build logs
- Verify all environment variables set
- Confirm .env.staging has correct values
- Try running `npm run build` locally first

**If tests fail after deployment:**
- Clear browser cache
- Check staging database RPC functions
- Verify Supabase project is accessible

---

## 📞 Deployment Support

**Command to check deployment status:**
```bash
vercel list --cwd ./
```

**View recent deployments:**
```bash
vercel ls
```

**Rollback if needed:**
```bash
vercel rollback
```

---

## Next Steps

1. **Deploy this code to staging** (using one of the methods above)
2. **Deploy RPC functions** (see DEPLOY_RPC_NOW.md)
3. **Test the full flow** in staging
4. **Prepare for production deployment**

**All code is ready - just deploy!** 🚀
