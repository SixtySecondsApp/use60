# Bug Fix: React Infinite Loop in DeactivateOrganizationDialog

**Date**: 2026-02-05
**Status**: ✅ Fixed & Committed
**Severity**: 🔴 Critical

---

## Problem

When attempting to deactivate an organization, users encountered a React error:

```
Uncaught Error: Too many re-renders. React limits the number of renders to prevent an infinite loop.
```

The component `DeactivateOrganizationDialog` crashed immediately when opened, blocking the entire deactivation feature.

---

## Root Cause

**Location**: `src/components/dialogs/DeactivateOrganizationDialog.tsx:124-126`

**The Bug**:
```typescript
// BEFORE (Lines 124-126) - WRONG ❌
if (step === 'confirm-warning' && validationError === null && confirmText === '' && reason === 'Billing issues') {
  handleOpen();  // ⚠️ Calling setState during render!
}
```

**Why it caused infinite loop**:
1. Component renders with initial state
2. Condition evaluates to `true`
3. `handleOpen()` is called, which updates state
4. State update triggers re-render
5. Condition is STILL `true` → calls `handleOpen()` again
6. **INFINITE LOOP** 🔄

**React Rule Violated**: You cannot call functions that update state during the render phase.

---

## Solution

Moved the initialization logic to a `useEffect` hook:

```typescript
// AFTER - CORRECT ✅
// Initialize dialog state when it opens
useEffect(() => {
  if (open) {
    handleOpen();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [open]);
```

**Why this works**:
- `useEffect` runs AFTER render completes
- Only triggers when `open` prop changes
- Breaks the infinite loop cycle

---

## Changes Made

### File Modified
- `src/components/dialogs/DeactivateOrganizationDialog.tsx`

### Specific Changes
1. **Line 1**: Added `useEffect` to imports
   ```typescript
   import { useState, useEffect } from 'react';
   ```

2. **Lines 121-126**: Replaced inline initialization with useEffect
   ```typescript
   // Initialize dialog state when it opens
   useEffect(() => {
     if (open) {
       handleOpen();
     }
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [open]);
   ```

3. **Removed Lines 124-126**: Deleted the problematic render-time call

---

## Testing

### Manual Test Steps
1. ✅ Log into staging
2. ✅ Navigate to Settings > Organization Management > Settings
3. ✅ Click "Deactivate and Leave Organization"
4. ✅ Dialog should open WITHOUT infinite loop error
5. ✅ Complete deactivation flow successfully

### Expected Behavior
- **Before Fix**: React error, white screen, dialog never opens
- **After Fix**: Dialog opens normally, deactivation proceeds

---

## Related Fixes

This fix was discovered after fixing the validation bug that prevented deactivating sole organizations. See `BUGFIX_ORG_DEACTIVATION.md` for details.

---

## Additional Updates: Interactive Model Profile Selection

As part of this fix session, all skill files were updated to use interactive button-based model profile selection instead of manual typing.

### Skills Updated
1. `60-bug/SKILL.md` - Bug discovery
2. `60-bugfix/SKILL.md` - Bug fixing
3. `60-consult/SKILL.md` - Requirements discovery
4. `60-run/SKILL.md` - Story execution
5. `60-hooks/SKILL.md` - Automation hooks

### What Changed
**Before**: User had to type "Economy", "Balanced", or "Thorough"
**After**: User selects from interactive buttons using `AskUserQuestion` tool

**Example**:
```
Question: "Which model profile would you like to use?"
Options (interactive buttons):
  • Economy (~$0.08) - Fastest, lowest cost
  • Balanced (~$0.30) (Recommended) - Good balance
  • Thorough (~$1.20) - Most accurate
```

---

## Deployment Status

### Staging
✅ **Fixed**: Committed to `fix/go-live-bug-fixes` branch (commit: `5c8f615c`)

### Production
⏳ **Pending**: Will be deployed in next release

---

## Commit Message

```
fix: Resolve React infinite loop in DeactivateOrganizationDialog

- Move initialization logic from render body to useEffect
- Prevents infinite re-render caused by calling setState during render
- Fix "Too many re-renders" error when opening deactivation dialog

Root cause: handleOpen() was called directly in render body (lines 124-126),
causing state updates during render which triggered infinite loop.

Solution: Moved initialization to useEffect that runs only when 'open' prop changes.

Fixes: React infinite loop error blocking organization deactivation
```
