# ⚡ IMMEDIATE ACTION ITEMS

## 🔴 BLOCKING ISSUE

The `user_leave_organization` RPC function is not deployed to staging database.

**Error:** `Could not find the function public.user_leave_organization(p_org_id)`

---

## ✅ HOW TO FIX (Choose ONE)

### Option 1: Manual SQL (FASTEST - 3 minutes)

1. Open: https://app.supabase.com/
2. Select project: **caerqjzvuerejfrdtygb**
3. Click **SQL Editor** → **New Query**
4. Open file: `DEPLOY_RPC_NOW.md` in your project
5. Copy the SQL from the guide
6. Paste into SQL Editor and click **Run**
7. Done! ✅

### Option 2: CLI Deployment

```bash
cd sixty-sales-dashboard
npx supabase db push --linked
```

---

## 📋 NEXT STEPS AFTER DEPLOYMENT

1. **Refresh browser** - Clear cache if needed
2. **Test leave organization**
   - Login: `max.parish501@gmail.com` / `NotTesting@1`
   - Go to Settings → Organization Management
   - Click "Leave Team"
   - Should redirect to `/onboarding/removed-user`

3. **Test organization selection**
   - After leaving, click "Choose Different Organization"
   - Should load organization selection (no infinite spinner)

---

## 🔧 TECHNICAL CHANGES MADE

The code now has a **fallback approach**:
- ✅ First tries RPC function (ideal)
- ✅ If RPC not found (404) → Falls back to direct updates
- ✅ Works even if RPC not deployed yet
- ⚠️ Fallback may fail due to RLS, but will show proper error

**File Updated:** `src/lib/services/leaveOrganizationService.ts`

---

## 📊 STATUS

| Item | Status | Action |
|------|--------|--------|
| Code fixes | ✅ Complete | None - ready to deploy |
| Build validation | ✅ Passes | None - ready |
| Documentation | ✅ Complete | Review DEPLOY_RPC_NOW.md |
| RPC function | ❌ Not deployed | **Deploy now using guide above** |
| Testing | ⏳ Ready when RPC deployed | Test after RPC deployed |

---

## 📚 REFERENCE DOCS

All in your project root:
- `DEPLOY_RPC_NOW.md` ← **START HERE** for deployment
- `QUICK_REFERENCE.md` - 60-second overview
- `DEPLOYMENT_AND_TEST_GUIDE.md` - Full detailed guide
- `FINAL_STATUS_REPORT.md` - Complete technical report

---

## 🆘 IF DEPLOYMENT FAILS

1. **Check schema cache refresh**
   - Wait 1-2 minutes and refresh browser

2. **Verify function was created**
   - In SQL Editor, run:
   ```sql
   SELECT * FROM pg_proc WHERE proname = 'user_leave_organization';
   ```

3. **Check permissions**
   ```sql
   SELECT * FROM information_schema.role_routine_grants
   WHERE routine_name = 'user_leave_organization';
   ```

---

## 🎯 FINAL GOAL

Once RPC is deployed:
- ✅ Users can click "Leave Team" and it works
- ✅ Users are redirected to removed-user page
- ✅ Users can choose different organization
- ✅ Organization selection page loads instantly
- ✅ Zero infinite loading spinners

---

**⏱️ Time to fix: 3-5 minutes (just deploy the SQL)**

**Then deploy code: Merge PR and deploy normally**
