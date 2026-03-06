# Consult Report: Meeting Settings Separation + Analysis Bug + Heatmap Skeleton
Generated: 2026-02-27

## User Request
Three distinct changes:
1. Break meeting settings out of the unified settings page into a dedicated page accessible from the meetings page, showing only connected recorders as cards/tiles
2. Fix meeting analysis edge function error where valid transcripts fail validation
3. Fix Activity Heatmap skeleton loading to match the actual rendered component

## Clarifications
- **Settings UX**: Cards/tiles layout for recorder selection
- **Navigation**: Back button to return to meetings list
- **Recorder type for bug**: Not sure / happens across multiple
- **Plan depth**: Balanced

---

## Agent Findings

### Codebase Scout: Meeting Settings Architecture

**Current state:**
- `MeetingSettingsPage.tsx` — tabbed page at `/settings/meeting-settings` with 3 tabs (always shows all 3)
- Settings button already exists in `UnifiedMeetingsList.tsx` toolbar (line 639-648)
- Currently navigates to `/settings/meeting-settings`
- Integration hooks expose `isConnected` status for each recorder

**Key files:**
- `/src/pages/settings/MeetingSettingsPage.tsx` (57 lines) — tabbed wrapper
- `/src/components/settings/NotetakerSettingsTab.tsx` — 60 Notetaker settings
- `/src/components/settings/FathomSettingsTab.tsx` — Fathom settings
- `/src/components/settings/FirefliesSettingsTab.tsx` — Fireflies settings
- `/src/components/meetings/UnifiedMeetingsList.tsx` — meetings list with Settings button
- `/src/pages/MeetingsPage.tsx` — routing wrapper (24 lines)

**Integration hooks (determine "connected" status):**
- `useFathomIntegration()` → `isConnected`
- `useFirefliesIntegration()` → `isConnected`
- `useNotetakerIntegration()` → `isConnected`

### Patterns Analyst: Transcript Validation

**5 edge functions with inconsistent validation:**

| Function | Check | Threshold | Status Code |
|----------|-------|-----------|-------------|
| `extract-content-topics` | `.trim().length < 50` | 50 chars | 422 |
| `generate-marketing-content` | `.trim().length < 50` | 50 chars | 422 |
| `meeting-generate-scorecard` | `.length < 100` | 100 chars | 400 |
| `meeting-process-structured-summary` | `.length < 100` | 100 chars | 400 |
| `meeting-intelligence-index` | `.length < 100` | 100 chars | 400 |
| `ask-meeting-ai` | `!transcript_text` | null only | 400 |
| `_shared/fetchRecentMeeting` | `wordCount() < 200` | 200 words | — |

**The correct pattern already exists** in `_shared/fetchRecentMeeting.ts`:
```typescript
const MIN_TRANSCRIPT_WORDS = 200
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}
```

### Risk Scanner: Heatmap Skeleton

**Dashboard.tsx skeleton (lines 936-958) vs actual Heatmap.tsx:**

| Element | Skeleton | Actual | Impact |
|---------|----------|--------|--------|
| Cell rounding | `rounded` | `rounded-lg` | Visual pop on load |
| Week labels | `h-8 w-full` fixed height | `flex items-center` text height | Skeleton way too tall |
| Week count | Hardcoded 5 | Dynamic 4-6 | Height mismatch |
| Header row | Missing empty first cell | Has empty `<div>` for week-label column | Grid misalignment |
| Legend | Missing | Full legend row with colors | Missing bottom section |

**Note:** `HeatmapSkeleton()` in `Heatmap.tsx` (lines 14-80) is better but also has minor mismatches with actual component.

---

## Synthesis

### Agreements
- Meeting settings refactor is clean — existing tab components can be reused inside card navigation
- Transcript validation fix is straightforward — standardize on word-count pattern
- Heatmap skeleton needs alignment with actual component structure

### Risks
- **Low**: Meeting settings route change may break bookmarks (add redirect)
- **Low**: Changing transcript validation thresholds could surface previously-hidden short transcripts
- **None**: Heatmap skeleton is purely visual

---

## Execution Plan

### Story 1: MEET-001 — Create Meeting Settings Hub Page
**Type**: Frontend | **Est**: 25min

Create a new `/meetings/settings` page showing connected recorders as cards/tiles.
- New component: `MeetingSettingsHub.tsx`
- Shows only connected recorders (using integration hooks)
- Card layout: icon, name, connection status, "Configure" button
- Back button to `/meetings`
- Empty state if no recorders connected → link to `/integrations`
- Clicking a card navigates to `/meetings/settings/:recorder` (reuses existing tab components)

**Files:**
- Create: `src/pages/meetings/MeetingSettingsHub.tsx`
- Edit: `src/pages/MeetingsPage.tsx` (add route)
- Edit: `src/App.tsx` (update/add routes)
- Edit: `src/components/meetings/UnifiedMeetingsList.tsx` (update Settings button target)

### Story 2: MEET-002 — Create Individual Recorder Settings Pages
**Type**: Frontend | **Est**: 20min

Create the detail view when clicking a recorder card.
- Reuse `NotetakerSettingsTab`, `FathomSettingsTab`, `FirefliesSettingsTab`
- Wrap each in a page layout with back button to hub
- Route: `/meetings/settings/:recorder`

**Files:**
- Create: `src/pages/meetings/MeetingRecorderSettingsPage.tsx`
- Edit: `src/pages/MeetingsPage.tsx` (add route)

### Story 3: MEET-003 — Fix Transcript Validation in Edge Functions
**Type**: Backend | **Est**: 15min

Standardize all transcript validation to use word-count pattern from `fetchRecentMeeting.ts`.
- Extract shared `validateTranscript()` helper to `_shared/`
- Use word count (minimum 20 words for analysis, not 200 — that's for auto-selection)
- Improve error messages: distinguish "no transcript" from "transcript too short"
- Consistent 422 status code

**Files:**
- Create: `supabase/functions/_shared/transcriptValidation.ts`
- Edit: `supabase/functions/extract-content-topics/index.ts`
- Edit: `supabase/functions/meeting-generate-scorecard/index.ts`
- Edit: `supabase/functions/meeting-process-structured-summary/index.ts`
- Edit: `supabase/functions/meeting-intelligence-index/index.ts`
- Edit: `supabase/functions/ask-meeting-ai/index.ts`

### Story 4: MEET-004 — Fix Activity Heatmap Skeleton
**Type**: Frontend | **Est**: 10min

Align Dashboard.tsx heatmap skeleton with actual Heatmap component structure.
- Fix cell rounding: `rounded` → `rounded-lg`
- Fix week label: match `flex items-center justify-end` pattern
- Add empty first cell in header row for grid alignment
- Use dynamic week count (or sensible default of 5 with matching height)
- Add skeleton legend row
- Also fix minor mismatches in `Heatmap.tsx` `HeatmapSkeleton()`

**Files:**
- Edit: `src/pages/Dashboard.tsx` (lines 936-958)
- Edit: `src/pages/Heatmap.tsx` (lines 14-80)

### Story 5: MEET-005 — Route Cleanup & Redirects
**Type**: Frontend | **Est**: 5min

Add redirects for old routes and clean up navigation.
- `/settings/meeting-settings` → redirect to `/meetings/settings`
- Remove old meeting settings routes from App.tsx
- Update any sidebar/nav links

**Files:**
- Edit: `src/App.tsx`
