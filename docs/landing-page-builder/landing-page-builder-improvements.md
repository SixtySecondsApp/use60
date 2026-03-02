# PRD: Landing Page Builder — Progressive Assembly + Chat Editor

**ID:** PRD-LP-002  
**Status:** Reviewed  
**Author:** Andrew / Claude  
**Date:** 1 March 2026  
**Replaces:** Landing Page Editor — Panel-Based Section Editor (original spec)

---

## 1. Problem

The current Landing Page Builder runs four sequential phases: Strategy → Copy → Visuals → Build. The Visuals phase blocks the user for minutes while images and SVGs generate. The Build phase produces a monolithic React component that can't be edited post-generation. Users must re-run entire phases to make changes. This is slow, frustrating, and violates the "60 seconds or less" philosophy.

The original fix proposed a 3-panel Framer-style editor as the default experience. On review, this introduces a power-user interface for users who live in their calendar and want things done for them — not a canvas to tinker with.

## 2. Revised Approach

**Core insight:** The problem isn't "users need an editor." It's that the build feels slow and the user has nothing to do while assets generate.

**Solution:** A progressive assembly experience where the page visibly comes together piece by piece. The AI makes all the decisions. The user watches it happen in real time and can talk to the result.

**Three layers:**

| Layer | What it does | User experience |
|-------|-------------|-----------------|
| **Section Data Model** | Structured sections with copy, layout, style, assets | Foundation — unchanged from original spec |
| **Progressive Assembly Engine** | Renders skeleton instantly, waterfalls assets in the background | User sees the page build itself — never stares at a spinner |
| **Chat-Driven Editing** | Natural language commands to modify sections, regenerate assets, reorder | "Make the hero image more minimal" / "Swap sections 3 and 4" |
| **Advanced Editor** (toggle) | 3-panel section editor for full manual control | Power users only — hidden by default |

**New flow:**

```
Brief → Strategy → Copy → PROGRESSIVE ASSEMBLY (live preview builds itself)
                            ├─ Skeleton renders immediately (copy + layout)
                            ├─ Assets waterfall in (images, SVGs, section by section)
                            ├─ Chat stays active throughout ("change the hero image")
                            └─ "Edit Mode" toggle → 3-panel editor (advanced)
```

---

## 3. Design Principles

**AI picks, user steers.** The AI selects layouts, generates assets, applies brand colours. The user intervenes only when something isn't right — via chat, not configuration panels.

**Progressive render, not loading screens.** The page skeleton appears instantly. Assets resolve section-by-section with shimmer placeholders that fade into final content. The user sees the AI "working down the page." This buys time for slow operations (SVG generation) without the user feeling blocked.

**Chat is the interface.** The same chat that handled Strategy and Copy continues into the assembly phase. Users say "that hero image doesn't feel right, try something warmer" or "move the testimonials above the CTA." No mode switching, no new UI to learn.

**Editor is the escape hatch.** The 3-panel editor exists for users who want pixel-level control. It's a toggle, not the default path. Most users never need it.

---

## 4. Section Data Model (Foundation)

Unchanged from original spec. This is the structured backbone that both the progressive assembly engine and the advanced editor consume.

### 4.1 Schema Migration

**Story: EDIT-001** — Add sections JSONB column to landing_builder_sessions

**File:** `supabase/migrations/2026XXXX_add_landing_sections.sql`

```sql
ALTER TABLE landing_builder_sessions
  ADD COLUMN sections jsonb DEFAULT '[]'::jsonb;
```

### 4.2 Section Shape

```typescript
interface LandingSection {
  id: string;                // uuid
  type: SectionType;         // see enum below
  order: number;             // sort position
  copy: {
    headline: string;
    subhead: string;
    body: string;
    cta: string;
  };
  layout_variant: LayoutVariant;
  image_url: string | null;
  image_status: AssetStatus;   // NEW — tracks generation state
  svg_code: string | null;
  svg_status: AssetStatus;     // NEW — tracks generation state
  style: {
    bg_color: string;
    text_color: string;
    accent_color: string;
  };
}

type SectionType = 'hero' | 'problem' | 'solution' | 'features' | 'social-proof' | 'cta' | 'faq' | 'footer';

type LayoutVariant = 'centered' | 'split-left' | 'split-right' | 'cards-grid';

type AssetStatus = 'idle' | 'generating' | 'complete' | 'failed';
```

> **Change from original:** Added `image_status` and `svg_status` fields to track asset generation state per section. This powers the progressive loading UI.

### 4.3 Workspace Service + Types

**Story: EDIT-002** — Update workspace service and types

**Files:**
- `src/lib/services/landingBuilderWorkspaceService.ts` — add `updateSections()`, `updateSection()`, `updateSectionAssetStatus()` methods
- `src/components/landing-builder/types.ts` — add `LandingSection` interface, `AssetStatus` type, update `LandingBuilderWorkspace`
- `src/lib/hooks/useLandingBuilderWorkspace.ts` — add mutation hooks for sections

**Key methods:**

```typescript
// Bulk update all sections (reorder, initial creation)
updateSections(sessionId: string, sections: LandingSection[]): Promise<void>

// Update a single section (copy edit, style change, layout swap)
updateSection(sessionId: string, sectionId: string, patch: Partial<LandingSection>): Promise<void>

// Update asset status + URL for a specific section (progressive generation)
updateSectionAsset(
  sessionId: string, 
  sectionId: string, 
  assetType: 'image' | 'svg', 
  status: AssetStatus, 
  url?: string
): Promise<void>
```

---

## 5. Section Renderer (Deterministic)

**Story: EDIT-003** — Section-to-code renderer

**File:** `src/components/landing-builder/sectionRenderer.ts` (NEW)

Pure function. No AI call. Takes structured sections and produces a single React + Tailwind component string for iframe preview.

```typescript
function renderSectionsToCode(
  sections: LandingSection[], 
  brandConfig: BrandConfig
): string
```

Each section type has a template map with layout variants:

```typescript
const SECTION_TEMPLATES: Record<SectionType, Record<LayoutVariant, (section: LandingSection) => string>> = {
  hero: {
    centered: (s) => `...`,
    'split-left': (s) => `...`,
    'split-right': (s) => `...`,
  },
  features: {
    'cards-grid': (s) => `...`,
    centered: (s) => `...`,
  },
  // ...
};
```

**Asset placeholder handling:** When `image_status === 'generating'`, the template renders a shimmer placeholder div with matching dimensions. When `image_status === 'complete'`, it renders the actual image. This is what makes the progressive assembly feel smooth — the skeleton is always valid, assets just resolve into it.

```typescript
function renderImageSlot(section: LandingSection): string {
  if (section.image_status === 'generating') {
    return `<div class="animate-pulse bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded-xl aspect-video" />`;
  }
  if (section.image_url) {
    return `<img src="${section.image_url}" class="rounded-xl w-full object-cover animate-fadeIn" />`;
  }
  return ''; // idle or no image needed
}
```

**Template diversity — launch lean, expand post-launch.** At launch, each section type ships with **2 layout variants** (16 templates total across 8 section types). The builder agent selects variants based on content characteristics (long body text → split layout, short punchy copy → centered, multiple items → cards grid). This is enough to avoid identical pages while keeping the initial build scope tight. Post-launch, we expand to 3-4 variants per type and introduce a contribution model where high-performing templates get promoted to the library. This is a composable system — the template map is the leverage point, not a fixed set.

> **Launch target:** 2 variants per section type = 16 templates. Prioritise the most visually distinct pairing for each type (e.g., hero: `centered` + `split-left`, features: `cards-grid` + `centered`).

---

## 6. Progressive Assembly Engine (New — Replaces Build Phase)

This is the core new concept. Instead of a monolithic Build phase that generates everything and hands the user a finished page, the assembly engine orchestrates a visible, staged build process.

### 6.1 Assembly Orchestrator

**Story: EDIT-004** — Progressive assembly orchestrator

**File:** `src/components/landing-builder/assemblyOrchestrator.ts` (NEW)

The orchestrator runs after Copy phase approval. It:

1. **Parses approved copy into sections** using strategy layout structure
2. **Applies brand colours** from research phase
3. **Renders skeleton immediately** — all copy and layouts render with shimmer placeholders for assets
4. **Queues asset generation** — images and SVGs generate section-by-section, top to bottom
5. **Updates sections progressively** — as each asset completes, the section updates and the preview re-renders

```typescript
interface AssemblyOrchestrator {
  // Called once after copy approval
  startAssembly(
    workspace: LandingBuilderWorkspace,
    onSectionUpdate: (sectionId: string, patch: Partial<LandingSection>) => void,
    onComplete: () => void,
  ): void;

  // Called by chat to regenerate a specific asset
  regenerateAsset(
    sectionId: string,
    assetType: 'image' | 'svg',
    prompt?: string, // optional user override
  ): void;

  // Cancel all pending generations
  cancelAll(): void;
}
```

### 6.2 Asset Generation Queue

**Story: EDIT-005** — Background asset generation with priority queue

**File:** `src/components/landing-builder/assetQueue.ts` (NEW)

A simple priority queue that processes asset generation requests serially (to avoid rate limiting) with the following priority order:

1. **Hero section image** — first thing the user sees, generate first
2. **Above-fold SVG animations** — visible without scrolling
3. **Remaining images** — top to bottom
4. **Remaining SVGs** — top to bottom
5. **User-requested regenerations** — jump to front of queue

```typescript
interface AssetQueueItem {
  sectionId: string;
  assetType: 'image' | 'svg';
  priority: number;         // lower = higher priority
  prompt: string;           // generated from section copy + brand context
  userOverride?: string;    // if user requested regen with specific prompt
}

class AssetGenerationQueue {
  enqueue(item: AssetQueueItem): void;
  prioritise(sectionId: string, assetType: 'image' | 'svg'): void; // bump to front
  cancel(sectionId: string, assetType: 'image' | 'svg'): void;
  cancelAll(): void;
  onComplete: (sectionId: string, assetType: 'image' | 'svg', result: string) => void;
  onError: (sectionId: string, assetType: 'image' | 'svg', error: Error) => void;
}
```

**Failure handling — retry with modified prompt:**

Asset generation (especially SVG via Gemini) has a ~15-20% failure rate. The queue handles failures with an automatic retry strategy:

1. **First attempt fails** → Queue automatically retries with a **modified prompt**. The retry prompt simplifies the original request: reduces animation complexity, removes filter effects, and shortens the description. The goal is to give the model a cleaner target.
2. **Retry fails** → Section falls back to a **static placeholder** (clean geometric shape matching the brand palette). The chat proactively notifies the user: "I couldn't generate the animation for the Features section — I've placed a placeholder. You can say 'retry features animation' anytime, or I can try a different style."
3. **Assembly completion with gaps** → The "your page is ready" message acknowledges gaps: "Your page is ready. 7 of 8 assets generated successfully. The Features section has a placeholder — want me to try again?" The page is treated as **ready with gaps**, not blocked.
4. **Bulk regen partial failures** → Chat reports: "Regenerated 4 of 6 images. The Problem and FAQ sections failed — want me to retry those with simpler prompts?"

```typescript
interface RetryStrategy {
  maxAttempts: 2;                    // original + 1 retry
  promptSimplifier: (originalPrompt: string) => string;  // strips complexity
  fallbackRenderer: (section: LandingSection) => string;  // static placeholder
}
```

The `promptSimplifier` removes keywords like "intricate", "complex animation", "multi-step", "particle effects" and replaces with simpler alternatives. This materially improves retry success rates.

**Existing services reused (not modified):**
- `src/lib/services/nanoBananaService.ts` — image generation
- `src/lib/services/geminiSvgService.ts` — SVG animation generation

### 6.3 Progressive Preview Component

**Story: EDIT-006** — Live preview with progressive asset rendering

**File:** `src/components/landing-builder/ProgressivePreview.tsx` (NEW)

Wraps the existing `LandingCodePreview` iframe but adds:

- **Section highlight on completion** — subtle pulse/glow when an asset resolves into a section, so the user sees the AI "working down the page"
- **Scroll-to-section** — when the chat references a section, auto-scroll the preview to it
- **Asset status overlay** — small badge per section showing generation state (generating spinner, checkmark on complete)
- **Device width toggles** — reused from existing `LandingCodePreview`

The preview re-renders every time a section updates (copy change, asset resolve, reorder). Because `renderSectionsToCode()` is deterministic and fast, this feels instant.

```typescript
interface ProgressivePreviewProps {
  sections: LandingSection[];
  brandConfig: BrandConfig;
  highlightSectionId?: string;  // section currently being discussed in chat
  onSectionClick?: (sectionId: string) => void; // for future editor integration
}
```

### 6.4 Assembly Choreography

The visual choreography matters. This is what makes it feel polished rather than janky.

**Stage 1 — Instant (0ms):**
- Full page skeleton renders with all copy, layouts, and brand colours
- Image slots show shimmer placeholders (animated gradient pulse)
- SVG slots show static placeholder illustrations (simple geometric shapes)
- Preview is fully scrollable — user can see the whole page structure

**Stage 2 — Progressive (2-30 seconds):**
- Hero image generates first (highest visual impact)
- As each asset completes:
  - Shimmer placeholder cross-fades to actual image/SVG (300ms ease-out)
  - Section gets a subtle highlight pulse (green ring, 800ms, fades out)
  - Status badge updates to checkmark
- Assets generate roughly top-to-bottom but the queue handles priority

**Stage 3 — Complete:**
- All assets resolved
- Chat shows a summary: "Your page is ready. 8 sections, 4 images, 3 animations. Want to change anything?"
- "Edit Mode" toggle becomes available in toolbar

**If the user starts chatting during Stage 2:**
- Chat commands execute immediately (copy changes, reorders)
- Asset regeneration requests jump to front of queue
- Current generation is NOT interrupted — it completes, then the regen starts

---

## 7. Chat-Driven Section Editing

The chat UI that handled Strategy and Copy phases continues seamlessly into the assembly phase. The user never leaves the chat — the preview just appears alongside it.

### 7.1 Section Edit Agent

**Story: EDIT-007** — Chat agent for section editing commands

**File:** `src/components/landing-builder/agents/sectionEditAgent.ts` (NEW)

This agent handles natural language commands that modify sections. It receives the current sections array as context and returns structured edit operations.

**Supported intents:**

| Intent | Example | Operation |
|--------|---------|-----------|
| Edit copy | "Change the hero headline to 'Ship faster'" | `updateSection(id, { copy: { headline: '...' } })` |
| Regenerate image | "The hero image is too corporate, try something warmer" | `regenerateAsset(id, 'image', prompt)` |
| Regenerate SVG | "Make that animation more subtle" | `regenerateAsset(id, 'svg', prompt)` |
| Reorder sections | "Move testimonials above the CTA" | `updateSections(reordered)` |
| Remove section | "Drop the FAQ section" | `updateSections(filtered)` |
| Add section | "Add a pricing section after features" | `updateSections(withNew)` |
| Change layout | "Make the features section a card grid instead" | `updateSection(id, { layout_variant: 'cards-grid' })` |
| Change style | "Make that section darker" | `updateSection(id, { style: { bg_color: '...' } })` |
| Bulk regen | "Regenerate all images" | Queue all image regenerations |

**Agent prompt structure:**

```
You are a landing page editor and creative director. You receive the user's message
and the current sections array.

Return a JSON object with:
- ops: array of operations to apply
- message: conversational response explaining what you did or asking for clarification
- highlight_section_id: the section being discussed (for preview scroll/highlight)

Available operations:
- { op: "update_copy", section_id, field, value }
- { op: "update_layout", section_id, variant }
- { op: "update_style", section_id, style_patch }
- { op: "regenerate_asset", section_id, asset_type, prompt_override }
- { op: "reorder", section_ids } // new order
- { op: "remove", section_id }
- { op: "add", after_section_id, section_type, copy }

AMBIGUITY HANDLING — ALWAYS CLARIFY, NEVER GUESS:

When the user's request is vague or references a section ambiguously, DO NOT guess.
Ask a focused clarifying question that helps steer them toward a great result.
Your job is part editor, part creative director — help the user articulate what
they actually want.

Examples:
- "Make it better" → "Which section feels off? I can tighten the copy, try a
  different layout, or regenerate the visuals — what's bugging you most?"
- "I don't like the middle part" → "You have 3 sections in the middle: Problem,
  Features, and Social Proof. Which one isn't working for you?"
- "The colors feel off" → "Do you mean the whole page palette, or a specific
  section? I can adjust background colors, accent colors, or both."
- "That section" → Reference the last section discussed in conversation history.
  If no prior context, ask: "Which section are you referring to?"

When clarifying, suggest specific options so the user can pick rather than describe.
The user may not know what they want — your questions should help them discover it.
Frame questions as "Would you prefer X or Y?" rather than open-ended "What do you want?"
```

**Clarify-first philosophy:** Users building landing pages often have a feeling ("something's off") but not a specific fix in mind. The agent's job is to help them articulate what they want by offering concrete options. This mirrors the Strategy phase's brief-extraction approach — the AI steers the user toward something that looks amazing rather than waiting for perfect instructions. A clarifying question that takes 5 seconds is always better than a wrong edit that takes 30 seconds to undo.

The agent uses the cheapest capable model (Haiku for classification, Sonnet only if the request requires generating new copy). Credit-metered through `creditLedger`.

### 7.2 Chat + Preview Layout

**Story: EDIT-008** — Assembly phase layout (preview-first with chat overlay)

**File:** `src/components/landing-builder/LandingPageBuilder.tsx` (EDIT)

After Copy phase approval, the layout **collapses the right panel (`LandingBuilderRightPanel`) and the chat history sidebar entirely**. The preview takes over as the primary experience. The chat becomes a compact overlay panel anchored to the bottom-left, allowing the user to steer the page while watching it build.

**Layout transition:** The 3-column `CopilotLayout` (chat history + main + right panel) transitions to a **full-width preview with a floating chat panel**. This is a deliberate simplification — the pipeline timeline, mini-preview, and deliverable panels are no longer needed because the user is looking at the real thing.

```
┌──────────────────────────────────────────────────────────────────────┐
│  [mobile] [tablet] [desktop]       [Copy Code] [Download] [Edit Mode]│
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                        LIVE PREVIEW (full width)                     │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ ███████ Hero Section ████████████████████████████████████    │   │
│  │ ░░░░░░ shimmer... ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ Problem section ✓                                            │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ Features ⟳ generating...                                    │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ Social Proof                                                 │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│ ┌─────────────────────────────┐                                      │
│ │  Chat Panel (floating)      │                                      │
│ │  "Change the hero image..." │                                      │
│ │  "Move testimonials up"     │                                      │
│ │  [message input]            │                                      │
│ └─────────────────────────────┘                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Chat panel behaviour:**
- Anchored bottom-left, ~380px wide, max 50% viewport height
- Collapsible — user can minimise to just the input bar to maximise preview space
- Draggable handle to resize height
- Semi-transparent background so the preview is always visible behind it
- Full conversation history (strategy, copy, section edits) available via scroll

**Why full-width preview:** The right panel's pipeline timeline and mini-preview are redundant once the real preview is live. The user's attention should be on the page itself, not a sidebar. The chat is the control surface — it floats over the preview rather than competing with it for horizontal space. This gives the preview maximum real estate to show the page at realistic widths.

**Responsive behaviour:** On screens < 1024px, the chat panel becomes a bottom sheet (full-width, swipe-up to expand, swipe-down to minimise).

### 7.3 Section Reference in Chat

When the user talks about a section, the preview highlights it. When the AI responds about a section, it names it clearly:

> **User:** "The features section feels too long"  
> **60:** "I've trimmed the features body copy and switched to a cards-grid layout so each feature is scannable. The image is regenerating with a more compact composition."  
> *(Preview: features section pulses, shimmer appears on image slot)*

To enable this, the section edit agent returns a `highlight_section_id` with each response, which the preview component uses to scroll to and highlight the relevant section.

---

## 8. Advanced Editor (Toggle — Not Default)

The 3-panel editor from the original spec survives, but as an opt-in mode for power users.

### 8.1 Editor Toggle

**Story: EDIT-009** — "Edit Mode" toggle in preview toolbar

**File:** `src/components/landing-builder/EditorToolbar.tsx` (NEW)

A small toolbar at the top of the preview panel with:

- Device width toggles (reused from `LandingCodePreview`)
- **"Edit Mode" toggle** — switches from progressive preview to 3-panel editor
- "Copy Code" — copies rendered React component to clipboard
- "Download HTML" — standalone HTML file with CDN dependencies
- "Back to Chat" — collapses editor, returns to chat + preview split

When Edit Mode is active, the layout changes:

```
┌────────────┬──────────────────────┬──────────────┐
│ Section    │   Live Preview       │ Properties   │
│ List       │   (iframe)           │ Panel        │
│ (200px)    │   (flex-1)           │ (280px)      │
│            │                      │              │
│ dnd-kit    │                      │ Copy fields  │
│ sortable   │                      │ Layout pick  │
│            │                      │ Asset gen    │
│            │                      │ Style ctrl   │
└────────────┴──────────────────────┴──────────────┘
```

The chat panel is hidden (but accessible via "Back to Chat"). This is the Framer-like experience from the original spec, available for users who want direct manipulation.

### 8.2 Section List Panel

**Story: EDIT-010** — Section list with drag-and-drop

**File:** `src/components/landing-builder/SectionListPanel.tsx` (NEW)

Uses `@dnd-kit/sortable` (already installed). Each row shows:

- Drag handle
- Section type icon (Lucide)
- Section name
- Asset status indicators (image ✓/⟳, SVG ✓/⟳)
- Click to select → populates properties panel

### 8.3 Properties Panel

**Story: EDIT-011** — Properties panel for direct section editing

**File:** `src/components/landing-builder/PropertiesPanel.tsx` (NEW)

When a section is selected:

- **Copy fields:** Headline, Subhead, Body, CTA — `<textarea>` for each, changes re-render preview live
- **Layout variant:** Radio group of available variants for this section type
- **Image:** "Generate Image" button (calls Nano Banana), "Upload" for custom, shows current image with "Regenerate" option
- **SVG:** "Generate Animation" button (calls Gemini SVG service), shows `SvgPreview`, "Remove" to clear
- **Style:** Background colour picker, text colour picker (defaults from brand config)

All changes are saved to the sections array and the preview re-renders instantly via `renderSectionsToCode()`.

---

## 9. Pipeline Integration

### 9.1 Phase Restructure

**Story: EDIT-012** — Update pipeline phases and wire assembly

**Files:**
- `src/components/landing-builder/types.ts` — update `PIPELINE_PHASES` to 3 phases: Strategy, Copy, Assembly
- `src/components/landing-builder/LandingPageBuilder.tsx` — after Copy approval: parse sections, start assembly orchestrator, transition to chat + preview layout
- `src/components/landing-builder/LandingBuilderRightPanel.tsx` — update phase count and labels

**Phase transition flow:**

```
Phase 1: Strategy (chat)
  ↓ user approves strategy
Phase 2: Copy (chat)
  ↓ user approves copy
Phase 3: Assembly (chat + preview split)
  ├─ Skeleton renders immediately
  ├─ Assets generate in background
  ├─ Chat accepts edit commands
  └─ Edit Mode toggle available when assembly complete
```

### 9.2 Remove Visuals Phase

**Story: EDIT-013** — Remove standalone Visuals phase

**Files:**
- `src/components/landing-builder/types.ts` — remove Visuals phase enum
- `src/components/landing-builder/LandingPageBuilder.tsx` — remove auto-invocation of visual artist agent, SVG batch generation, hero image generation from chat flow
- `src/components/landing-builder/agents/visualArtistAgent.ts` — keep file but no longer auto-invoked; asset generation now happens via `assetQueue.ts` during assembly

### 9.3 Builder Agent Update

**Story: EDIT-014** — Builder agent outputs sections JSON (not code)

**File:** `src/components/landing-builder/agents/builderAgent.ts` (EDIT)

The builder agent reads the workspace (strategy + copy + brand guidelines from research) and produces a `LandingSection[]` JSON array with:

- Copy slotted into each section from the approved copy phase
- Layout variant selected per section based on content characteristics
- Brand colours applied from research
- `image_status: 'idle'` and `svg_status: 'idle'` on all sections (assets generate separately)

No code generation — just structured data. The `sectionRenderer.ts` handles code output deterministically.

---

## 10. Export (AI-Polished Output)

**Story: EDIT-015** — Export with AI polish pass

**Files:**
- `src/components/landing-builder/EditorToolbar.tsx` — export buttons
- `src/components/landing-builder/agents/exportPolishAgent.ts` (NEW) — AI code generation from sections

Available in both chat + preview mode and edit mode.

**Two-tier rendering model:**

| Context | Renderer | Quality | Speed |
|---------|----------|---------|-------|
| **Live preview** | `renderSectionsToCode()` (deterministic templates) | Good — structurally correct, branded, responsive | Instant (~5ms) |
| **Export** | `exportPolishAgent` (AI pass) | Production — custom animations, refined spacing, bespoke responsive breakpoints | 10-20 seconds |

The deterministic renderer powers the live preview — fast, predictable, good enough for real-time feedback. But when the user clicks **Copy Code** or **Download HTML**, a final AI pass transforms the structured sections into polished, production-quality React + Tailwind code. This is the same quality level as the current builder agent, but informed by structured data (sections JSON + brand config) rather than raw copy markdown.

**Export polish agent:**

```typescript
// Takes structured sections (the source of truth) and produces bespoke code
async function generatePolishedCode(
  sections: LandingSection[],
  brandConfig: BrandConfig,
  workspace: LandingBuilderWorkspace,
): Promise<string>
```

The agent receives:
- The complete `LandingSection[]` array with all copy, layouts, styles, image URLs, and SVG code
- Brand config (colors, typography, tone)
- Strategy context (conversion thesis, section purposes)

It produces a single, production-ready React + Tailwind component with:
- Custom animations and transitions (not just template defaults)
- Refined spacing and typography hierarchy
- Responsive breakpoints tailored to content length
- Embedded SVG animations and optimised image tags
- Working form with validation
- Google Font imports

**UX flow:**
1. User clicks "Copy Code" or "Download HTML"
2. Button shows loading state: "Generating production code..." (10-20 seconds)
3. On completion:
   - **Copy Code** → clipboard contains polished React component, toast confirms
   - **Download HTML** → browser downloads standalone HTML file with CDN dependencies
4. Polished code is **cached in workspace** (`workspace.polished_code`) — subsequent exports are instant until sections change
5. Any section edit invalidates the cache (next export triggers a fresh AI pass)

**Credit cost:** One Sonnet call per export. Cached until sections change. Metered through `creditLedger`.

> **Why not just use templates for export?** The deterministic renderer produces structurally correct but generic code. For a landing page that someone is actually deploying, the difference between template output and AI-polished output is significant — custom spacing, animation choreography, and responsive refinements that templates can't provide. The preview gets you 80% of the way; the export pass delivers the remaining 20% that makes it feel bespoke.

---

## 11. Session Recovery

**Story: EDIT-016** — Resume assembly on page refresh

**File:** `src/components/landing-builder/LandingPageBuilder.tsx` (EDIT)

On workspace load, if `sections` exists and has content:

- Skip Strategy and Copy phases
- Render current sections into preview immediately
- Check for sections with `image_status === 'generating'` or `svg_status === 'generating'` — reset to `'idle'` (generation was interrupted)
- Show chat with context: "Welcome back. Your page has [N] sections. [M] still need images. Want me to continue generating, or would you like to make changes first?"
- User can say "continue" to restart asset queue, or jump straight to editing

---

## 12. File Change Summary

### New Files

| File | Purpose |
|------|---------|
| `supabase/migrations/2026XXXX_add_landing_sections.sql` | Add sections column |
| `src/components/landing-builder/sectionRenderer.ts` | Deterministic sections → React code |
| `src/components/landing-builder/assemblyOrchestrator.ts` | Progressive assembly coordinator |
| `src/components/landing-builder/assetQueue.ts` | Priority queue for background asset generation |
| `src/components/landing-builder/ProgressivePreview.tsx` | Live preview with progressive rendering |
| `src/components/landing-builder/agents/sectionEditAgent.ts` | Chat agent for section editing commands (clarify-first) |
| `src/components/landing-builder/agents/exportPolishAgent.ts` | AI polish pass for production-quality export code |
| `src/components/landing-builder/EditorToolbar.tsx` | Toolbar with device toggle, export, edit mode |
| `src/components/landing-builder/SectionListPanel.tsx` | Left panel with dnd-kit sortable |
| `src/components/landing-builder/PropertiesPanel.tsx` | Right panel with copy, layout, asset, style controls |

### Edited Files

| File | Changes |
|------|---------|
| `src/components/landing-builder/types.ts` | Add `LandingSection`, `AssetStatus`, update phases to 3 |
| `src/lib/services/landingBuilderWorkspaceService.ts` | Add sections CRUD methods |
| `src/lib/hooks/useLandingBuilderWorkspace.ts` | Add sections mutation hooks |
| `src/components/landing-builder/agents/builderAgent.ts` | Output sections JSON instead of monolithic React |
| `src/components/landing-builder/LandingPageBuilder.tsx` | Wire assembly, remove visuals phase, collapse to preview-first layout |
| `src/components/landing-builder/LandingBuilderRightPanel.tsx` | Collapse/hide during assembly phase |

### Existing Code Reused (Not Modified)

| File | Reused For |
|------|-----------|
| `src/components/ui/resizable.tsx` | Panel layout primitives |
| `src/components/landing-builder/LandingCodePreview.tsx` | Iframe preview (center panel) |
| `src/components/landing-builder/SvgPreview.tsx` | SVG preview in properties panel |
| `src/lib/services/geminiSvgService.ts` | SVG animation generation |
| `src/lib/services/nanoBananaService.ts` | Image generation |
| `@dnd-kit/sortable` | Drag and drop (already installed) |

---

## 13. Execution Order

### Phase A — Foundation (Stories 001–003)

Data model and deterministic renderer. Everything else depends on these.

```
EDIT-001 (schema migration)
  → EDIT-002 (workspace service + types)
    → EDIT-003 (section renderer)
```

### Phase B — Progressive Assembly Engine (Stories 004–006)

The core new experience. This replaces the Build phase.

```
EDIT-004 (assembly orchestrator)
  → EDIT-005 (asset generation queue)
    → EDIT-006 (progressive preview component)
```

### Phase C — Chat Editing + Pipeline Wiring (Stories 007–008, 012–014)

Chat-driven editing and pipeline integration. This makes the whole thing work end-to-end.

```
EDIT-007 (section edit agent)
EDIT-008 (chat + preview layout)
EDIT-012 (phase restructure)
EDIT-013 (remove visuals phase)
EDIT-014 (builder agent → sections JSON)
```

### Phase D — Advanced Editor (Stories 009–011)

The 3-panel editor toggle. Ship after the core experience is working.

```
EDIT-009 (editor toggle + toolbar)
  → EDIT-010 (section list panel)
  → EDIT-011 (properties panel)
```

### Phase E — Polish (Stories 015–016)

Export and session recovery.

```
EDIT-015 (export options)
EDIT-016 (session recovery)
```

**Critical path:** A → B → C → ship. Phases D and E can follow.

---

## 14. Verification

1. Start a new landing page project → complete Strategy → complete Copy → **layout collapses to full-width preview** with floating chat panel, right panel and sidebar hidden
2. Preview appears with skeleton (all copy, shimmer placeholders for assets) — full-width, no competing panels
3. Watch assets generate progressively — hero image first, then remaining images and SVGs, each fading in with subtle highlight
4. During generation, type "change the hero headline to something bolder" → copy updates instantly in preview
5. Type "that hero image is too corporate, try something warmer" → hero image slot returns to shimmer, regenerates with new prompt
6. Type "make it better" → agent asks a clarifying question: "Which section feels off? I can tighten the copy, try a different layout, or regenerate the visuals"
7. Type "swap sections 3 and 4" → preview reorders immediately
8. Type "regenerate all images" → all image slots shimmer, regenerate in sequence
9. **SVG generation fails** → auto-retries with simplified prompt → if retry fails, placeholder appears and chat notifies user
10. Assembly completes → chat confirms "your page is ready" (acknowledges any placeholder gaps) → "Edit Mode" toggle appears
11. Click Edit Mode → 3-panel editor opens, sections are draggable, properties panel edits apply live
12. Click "Back to Chat" → returns to preview-first layout with floating chat
13. Copy Code → **"Generating production code..." loading state** → polished React + Tailwind component copied to clipboard (AI pass, not template output)
14. Download HTML → same AI polish pass → standalone HTML file opens correctly in browser
15. Click Copy Code again → **instant** (cached, no AI call since sections haven't changed)
16. Refresh page mid-assembly → resume prompt appears, "continue" restarts asset queue
17. Device toggle (mobile/tablet/desktop) works in both preview and edit mode
18. Minimise chat panel → preview fills entire viewport, input bar remains at bottom-left
19. On screens < 1024px → chat becomes bottom sheet with swipe gestures

---

## 15. Credit Governance

All AI calls during assembly are metered through `creditLedger`:

| Operation | Model | Approximate Cost |
|-----------|-------|-----------------|
| Builder agent (sections JSON) | Sonnet | Medium — one-time per build |
| Section edit agent (intent + clarification) | Haiku | Low — per chat message |
| Section edit agent (copy generation) | Sonnet | Medium — only when generating new copy |
| Image generation | Nano Banana | Per image |
| SVG generation | Gemini | Per SVG (+ 1 auto-retry on failure) |
| Export polish agent | Sonnet | Medium — one-time per export (cached until sections change) |

The `modelRouter` selects the cheapest capable model. The `fleetThrottle` does not apply here (this is user-initiated, not fleet), but per-user budget limits still enforce ceilings.

---

## 16. Future Considerations

**Template library expansion (post-launch):** Launch ships with 2 variants per section type (16 total). Post-launch, expand to 3-4 variants per type. Track which templates produce pages that get exported/deployed — promote high-performing variants. Target: 32+ templates within 4 weeks of launch.

**A/B variant generation:** With structured sections, generating 2-3 hero variants and letting the user pick is trivial. The asset queue already supports this — just queue multiple generations for the same section and present them as options.

**Analytics integration:** Sections are individually trackable. Future: each section gets scroll-depth and click tracking, feeding back into "this layout variant converts better" intelligence.

**Collaborative editing:** The structured sections model supports real-time collaboration via Supabase Realtime. Multiple users could edit different sections simultaneously. Not in scope now, but the architecture supports it.