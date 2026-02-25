# Consult Report: Setup Wizard Agent Blend
Generated: 2026-02-24

## User Request
Improve the Setup Wizard screens to blend with the Agent Activation Flow's style and tone. The Setup Wizard is the host flow — keep all 5 integration steps and credits gamification. Remove the persona config step (default to "Sixty" / "concise"). Remove the Agent Activation Flow as it was a concept.

## Clarifications
- Q: Which flow should be the host?
- A: Setup Wizard is the host — keep all integrations, credits, store, and DB.

- Q: Keep credits gamification?
- A: Yes, keep the +20 per step, 100 total.

- Q: Keep current integrations?
- A: Yes, all 5 steps stay (Calendar, Notetaker, CRM, Email Style, Test Email).

- Q: Include persona step (name + tone)?
- A: No. Default to "Sixty" + "concise". User can change later in Settings > Agent Persona.

- Q: Production or demo only?
- A: Production — improve the real Setup Wizard, retire Agent Activation Flow.

- Q: Agent name default?
- A: Silently default to "Sixty". Welcome screen says "I'm Sixty, your AI sales agent."

- Q: Scan on completion — block Done?
- A: Yes, block the Done button until scan completes.

## Agent Findings

### Codebase Scout

**Existing Assets:**
| Path | Relevance |
|------|-----------|
| `src/components/setup-wizard/SetupWizardDialog.tsx` | Host container — AnimatePresence, step routing |
| `src/components/setup-wizard/SetupWizardWelcome.tsx` | Welcome screen — rewrite with agent personality |
| `src/components/setup-wizard/SetupWizardComplete.tsx` | Complete screen — rewrite with agent scan |
| `src/components/setup-wizard/SetupWizardStepper.tsx` | Step indicator — replace with pill-dot style |
| `src/components/setup-wizard/steps/*.tsx` | 5 step files — update copy only |
| `src/lib/stores/setupWizardStore.ts` | Store — no changes needed |
| `src/components/agent/AgentActivationFlow.tsx` | Source of agent visual language — then remove |
| `supabase/functions/agent-initial-scan/` | Edge function for agent scan — reuse on completion |

**Gaps:**
- No agent persona auto-creation in setup wizard flow
- Complete screen has no scan/briefing capability

### Patterns Analyst

**Visual patterns to adopt from AgentActivationFlow:**
- Hero icon: `w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600` with `Bot` icon
- Success icon: `bg-gradient-to-br from-emerald-400 to-blue-500` with `Check` icon
- Step indicator: pill dots (`w-6 h-1.5` active, `w-1.5 h-1.5` inactive, `rounded-full`)
- Feature bullets: `Check` icon in `text-emerald-500` with `mt-0.5 flex-shrink-0`
- Scanning animation: `animate-pulse` on Bot icon + `Loader2 animate-spin`
- Slide transitions: `x: 20 → 0 → -20` at `0.2s` (already used in setup wizard)

**Copy tone to adopt:**
- First person from agent: "I need...", "I'll...", "Here's what I found"
- Confident and specific: names exact times, exact deliverables
- Short sentences, present tense, no passive voice

**Patterns to keep from Setup Wizard:**
- Credits gamification UI (gradient numbers, +20 badges)
- OAuth flows and integration status checks
- Skip/Back/Continue navigation
- Store + DB persistence
- Dark mode support

### Risk Scanner

| Severity | Risk | Mitigation |
|----------|------|------------|
| Low | Agent scan on completion may fail (no data) | Already has fallback copy in edge function |
| Low | Removing AgentActivationFlow may have orphan references | Search all imports before deletion |
| Low | `upsert_agent_persona` RPC needed on completion | Already used in AgentActivationFlow — copy pattern |

### Scope Sizer

**Total estimate:** 2-2.5 hours
**Stories:** 6
**Parallel opportunities:** Stories 1-3 can run in parallel (no file overlap)

## Final Recommendation

### Story Breakdown

#### Story 1: Rewrite Welcome Screen with Agent Personality
**Files:** `SetupWizardWelcome.tsx`
**Changes:**
- Replace `Rocket` icon with `Bot` in blue-to-purple gradient container (`bg-gradient-to-br from-blue-500 to-purple-600`)
- Change heading: "Welcome to 60" → "Meet Sixty, your AI sales agent"
- Change subtitle: "Let's get you set up in under 5 minutes" → "I'm your always-on teammate. Let's get connected so I can start working for you."
- Keep credit incentive card (unchanged)
- Keep step list with +20 badges (unchanged)
- Update step labels/descriptions to agent voice:
  - Calendar: "Connect Calendar" → "Connect your calendar" / "So I can prep you for meetings"
  - Notetaker: "Enable AI Notetaker" → "Enable meeting recording" / "So I can join and take notes"
  - CRM: "Connect CRM" → "Connect your pipeline" / "So I can monitor your deals"
  - Follow-ups: "Configure Follow-ups" → "Learn your writing style" / "So my emails sound like you"
  - Test: "Run Your First Test" → "See me in action" / "Watch me research and write a cold email"
- Change CTA: "Let's Go" → "Get Started"

#### Story 2: Replace Numbered Stepper with Pill-Dot Indicator
**Files:** `SetupWizardStepper.tsx`
**Changes:**
- Remove numbered circles + labels
- Replace with horizontal pill-dot row:
  - Active: `w-6 h-1.5 rounded-full bg-blue-500`
  - Completed: `w-1.5 h-1.5 rounded-full bg-blue-300`
  - Future: `w-1.5 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700`
- Remove connector lines
- Add `transition-all` for smooth width changes
- Keep clickability for direct step navigation

#### Story 3: Update All 5 Step Headers with Agent-Voice Copy
**Files:** All 5 files in `steps/`
**Changes per step:**

**CalendarSetupStep:**
- Icon container: keep 40x40 pattern but use blue-to-purple gradient for pending (not flat indigo)
- Title: "Connect Google Calendar" (keep)
- Subtitle: → "I need your calendar to prep you for meetings and keep your schedule in sync."
- Bullet points: → "I'll auto-prepare briefings before your calls" / "I'll sync your events for smart scheduling" / "Required for me to join meetings as your notetaker"

**NotetakerSetupStep:**
- Subtitle: → "I'll join your meetings, record them, and pull out the key moments."
- Bullets: → "I'll sit in on meetings and take notes for you" / "I'll auto-transcribe everything" / "I'll extract action items and follow-ups"

**CrmSetupStep:**
- Subtitle: → "Connect your pipeline so I can track deal health and flag risks."
- (No bullets in current design — keep as-is)

**FollowUpSetupStep:**
- Subtitle: → "Let me study your sent emails so when I write for you, it sounds like you."
- Analysis section copy: → "I'll scan your last 90 days of sent emails to learn your tone, vocabulary, and sign-off."

**TestSetupStep:**
- Subtitle: → "Give me a real prospect — I'll deploy my research team and craft a personalized email."
- Phase headers (agent voice): "Deploying my research team..." / "Researching {name} at {company}..." / "Synthesizing what I found..." / "Writing your email now..."

#### Story 4: Rewrite Complete Screen with Agent Scan + "Ready"
**Files:** `SetupWizardComplete.tsx`
**Changes:**
- Replace `PartyPopper` with `Bot` in blue-to-purple gradient (or emerald-to-blue on scan complete)
- Replace heading: "You're all set!" → "Sixty is scanning your workspace..."  (during scan) → "Here's what I found" (after scan)
- Add scan functionality:
  - On mount, call `agent-initial-scan` edge function (copy pattern from AgentActivationFlow)
  - Show scanning state: pulsing Bot icon + `Loader2` spinner
  - Show results: AI-generated briefing text + 2x2 stats grid (Active Deals / Stale Deals / Overdue Tasks / Upcoming Meetings)
- Keep credits earned card below results
- Add "what to expect" bullets (from activation flow step 4):
  - "I'll send your first morning briefing tomorrow at 8:00 AM"
  - "I'll alert you when deals need attention"
  - "All my activity will appear in your agent feed"
  - "You can customize me anytime in Settings"
- Block "Start Using 60" button until scan completes (show `Loader2` while scanning)
- Change CTA: "Start Using 60" → "Let's Go" or "Done"

#### Story 5: Auto-Create Agent Persona on Wizard Completion
**Files:** `SetupWizardComplete.tsx` (or `setupWizardStore.ts`)
**Changes:**
- When scan fires on the complete screen, also call `upsert_agent_persona` RPC with defaults:
  - `agent_name: 'Sixty'`
  - `tone: 'concise'`
  - `frequency: 'balanced'`
  - `focus_areas: ['pipeline', 'meetings']`
  - `quiet_hours_start: '20:00'`
  - `quiet_hours_end: '08:00'`
  - `morning_briefing_time: '08:00'`
  - `morning_briefing_enabled: true`
  - `timezone: Intl.DateTimeFormat().resolvedOptions().timeZone`
- Fire-and-forget (non-blocking, don't block the scan or UI)

#### Story 6: Remove AgentActivationFlow + Demo Page References
**Files:** `AgentActivationFlow.tsx`, `AgentDemoPage.tsx`, `lazyPages.tsx`, `App.tsx`
**Changes:**
- Delete `src/components/agent/AgentActivationFlow.tsx`
- Remove `DemoActivationPreview` section from `AgentDemoPage.tsx` (keep other demo sections)
- Remove "Show/Hide Activation Flow" toggle button from demo page
- Remove any lazy import / route for AgentActivationFlow if present
- Search for and clean up any other imports of `AgentActivationFlow`
