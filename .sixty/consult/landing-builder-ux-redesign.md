# Consult Report: landing-builder-ux-redesign
Generated: 2026-03-01

## User Request
"The landing page does not render and the experience is messy at full screen. Chat should be centered at the bottom, chat history hidden by default."

## Clarifications
1. **Chat panel style** → Floating command bar (Spotlight/⌘K style), centered bottom
2. **Chat trigger** → Input field always visible, history collapsed by default (expands upward)
3. **Section editor vs chat** → Separate: clicking section opens inline editor in right panel, chat bar is its own thing
4. **Right sidebar** → Redesign for cleaner feel but keep progress (12/12) visible
5. **Preview priority** → Preview is hero. Show real-time building (copy writing out, assets appearing). After render, start editing.

## Bug: Preview "Script Error"

### Root Cause
`sectionRenderer.ts` outputs complete `<!DOCTYPE html>` raw HTML (Tailwind + Google Fonts, no React).
`LandingCodePreview.tsx` ALWAYS processes code through Babel/React pipeline:
1. `prepareForPreview()` strips imports, detects component name → defaults to `'App'` (no component found in raw HTML)
2. Wraps code in `<script type="text/babel">` tag
3. Calls `React.createElement(App)` → `App` is undefined → "Script error"

### Fix
Detect whether `code` prop is raw HTML (starts with `<!DOCTYPE` or `<html>`) vs React JSX.
- Raw HTML → render directly as `srcDoc` (bypass Babel pipeline entirely)
- React JSX → existing pipeline (CDN React + Babel + stubs)

**File**: `src/components/landing-builder/LandingCodePreview.tsx` (lines 173-409)

## Layout Analysis

### Current (Assembly Mode)
- `AssemblyPreview` takes full width, full height
- Floating chat panel: `absolute bottom-4 left-4 w-[380px] h-[480px]`
- Minimizes to a 12x12 button
- No right panel in assembly mode (only in Strategy/Copy phases)
- Section list badges overlay top-right of preview

### Desired
- Preview takes `flex-1` (hero)
- Right panel `w-80`: section list (top) + properties editor (bottom, on click)
- Floating chat bar: centered bottom, `max-w-[600px]`, input always visible
- Chat history: collapsed by default, expands upward on toggle

### Existing Components Available (NOT wired into assembly)
- `SectionListPanel.tsx` (258 lines) — drag/drop with @dnd-kit, badges, type labels
- `PropertiesPanel.tsx` (466 lines) — copy editing, layout selector, style picker, asset regen

## Stories

See `.sixty/plan.json` for execution plan.

## Architecture Notes
- State: `assemblySections` in LandingPageBuilder is source of truth
- `SectionListPanel` needs `sections`, `onReorder`, `onSelect` props
- `PropertiesPanel` needs `section`, `onUpdate`, `onRegenerateAsset` props
- `AssistantShell` can be extracted from current floating panel and placed in `FloatingChatBar`
- Quick actions already supported via `phaseActions` prop on `AssistantShell`
