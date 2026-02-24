# Quick Fix Summary

## Bug #1: Infinite Load in OrgContext

**File**: `src/lib/contexts/OrgContext.tsx` (lines 213-222)

**Problem**: Redirect loop on `/inactive-organization` page

**Fix**: Add pathname check before redirect
```typescript
// Check if active org is inactive and redirect to inactive page
useEffect(() => {
  if (!activeOrg || !activeOrgId) return;

  // ADD THIS LINE:
  if (window.location.pathname.includes('/inactive-organization')) return;

  if (activeOrg.is_active === false) {
    logger.log('[OrgContext] Active org is inactive, redirecting to inactive page');
    window.location.href = '/inactive-organization';
  }
}, [activeOrg, activeOrgId]);
```

---

## Bug #2: Cannot Log Out

**File**: `src/pages/InactiveOrganizationScreen.tsx`

**Problem**: Navigate to non-existent `/auth/logout` route

**Fix**:

1. **Add state** (after line 28):
```typescript
const [isSigningOut, setIsSigningOut] = useState(false);
```

2. **Replace handler** (lines 153-156):
```typescript
const handleSignOut = async () => {
  try {
    setIsSigningOut(true);
    await logout();
    navigate('/auth/login', { replace: true });
  } catch (err) {
    logger.error('[InactiveOrganizationScreen] Error signing out:', err);
    toast.error('Failed to sign out', {
      description: 'Please try again or contact support.'
    });
  } finally {
    setIsSigningOut(false);
  }
};
```

3. **Update button** (lines 335-346):
```typescript
<Button
  onClick={handleSignOut}
  disabled={isSigningOut}
  variant="outline"
  className="w-full justify-between"
  size="lg"
>
  <span className="flex items-center gap-2">
    <LogOut className="w-4 h-4" />
    Sign Out
  </span>
  {isSigningOut && <RefreshCw className="w-4 h-4 animate-spin" />}
</Button>
```

---

## Detailed Instructions

See `BUG_FIX_INSTRUCTIONS.md` for:
- Complete problem analysis
- Root cause explanations
- Step-by-step implementation guide
- Testing procedures
- Pattern references
- Deployment notes
