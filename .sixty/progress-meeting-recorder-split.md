# Progress Log — Meeting Recorder Settings Split

## Overview
Splitting consolidated meeting recorder settings from `/settings/meeting-sync` into dedicated integration pages following the existing integration pattern.

**Target State:**
- `/settings/integrations/fathom` - Fathom settings (visible when connected)
- `/settings/integrations/fireflies` - Fireflies settings (visible when connected)
- `/settings/integrations/60-notetaker` - 60 Notetaker settings (visible when enabled)
- Remove `/settings/meeting-sync` entirely

---

## Codebase Patterns
<!-- Reusable learnings across all stories -->

### Integration Settings Page Pattern
- Use `SettingsPageWrapper` component for consistent layout
- Import integration hook for connection state
- Render settings component inside wrapper
- Add route to `App.tsx` following `/settings/integrations/{name}` pattern

### Settings Navigation Pattern (Settings.tsx)
- Add section to `allSettingsSections` array with `id`, `label`, `icon`, `description`, `path`
- Add hook import for integration (e.g., `useFirefliesIntegration`)
- Derive `show{Name}Settings` boolean from hook's `isConnected` (and `!loading`)
- Add conditional filter in `settingsSections` useMemo
- Add section ID to `integrationSections` array in categories

### Notetaker Connection Status
- `isConnected = isOrgEnabled && isUserEnabled && googleConnected`
- All three conditions must be true for the user to be considered "connected"

---

## Session Log

### 2026-01-24 — Plan Created
**Action**: Generated execution plan from user-provided specification
**Files**:
- `.sixty/plan-meeting-recorder-split.json`
- `.sixty/progress-meeting-recorder-split.md`

**Verification Completed:**
- ✅ MeetingSyncPage.tsx exists with Fathom + Fireflies sections (250 lines)
- ✅ Settings.tsx has conditional navigation pattern already (Slack, JustCall, HubSpot, Bullhorn)
- ✅ useFirefliesIntegration hook exists with `isConnected` property
- ✅ useNotetakerIntegration hook exists with `isConnected`, `isOrgEnabled`, `isUserEnabled`
- ✅ SettingsPageWrapper component exists for consistent page layout
- ✅ No existing `/settings/integrations/*.tsx` pages (directory needs to be created)
- ✅ Routes follow pattern: `/settings/integrations/slack`, `/settings/integrations/justcall`, etc.

**Stories Generated**: 6
**Estimated Total**: ~110 min sequential, ~75 min with parallel execution

---

## Story Execution

### MEET-001: Create Fathom Integration Settings Page
**Status**: ⏳ Pending
**Files**:
- `src/pages/settings/integrations/FathomIntegrationPage.tsx` (new)
- `src/App.tsx` (add route)

---

### MEET-002: Create Fireflies Integration Settings Page
**Status**: ⏳ Pending
**Files**:
- `src/pages/settings/integrations/FirefliesIntegrationPage.tsx` (new)
- `src/App.tsx` (add route)

---

### MEET-003: Create 60 Notetaker Integration Settings Page
**Status**: ⏳ Pending
**Files**:
- `src/pages/settings/integrations/NotetakerIntegrationPage.tsx` (new)
- `src/components/integrations/NotetakerSettings.tsx` (new - extract from modal)
- `src/App.tsx` (add route)

---

### MEET-004: Add Meeting Recorder Connect Cards to Integrations Page
**Status**: ⏳ Pending (blocked by MEET-001, MEET-002, MEET-003)
**Files**:
- `src/pages/Integrations.tsx` (modify)

---

### MEET-005: Update Settings Navigation for Conditional Integration Links
**Status**: ⏳ Pending (blocked by MEET-001-004)
**Files**:
- `src/pages/Settings.tsx` (modify)

---

### MEET-006: Remove Meeting Sync Page and Route
**Status**: ⏳ Pending (blocked by all previous stories)
**Files**:
- `src/App.tsx` (remove route)
- `src/pages/settings/MeetingSyncPage.tsx` (delete)

---

## Quality Gates
| Gate | Status | Notes |
|------|--------|-------|
| TypeScript | ⏳ | Run after MEET-006 |
| Lint | ⏳ | Run after MEET-006 |
| Build | ⏳ | Run after MEET-006 |
| Manual Test | ⏳ | Test all 5 scenarios |
