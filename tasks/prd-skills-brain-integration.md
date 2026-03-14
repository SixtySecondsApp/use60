# PRD: Skills × Brain Integration — Bidirectional Intelligence

## Introduction

The Brain fills itself (Brain Alive: 23 stories). Skills execute actions (65 abilities, 60+ action types). But they don't talk to each other. Skills don't know what the Brain remembers, and the Brain doesn't know what skills are available. This PRD connects them — making every skill Brain-aware and every skill execution a memory that feeds the next one.

## Goals

- Every skill execution reads relevant Brain context before running (zero config — auto-injected)
- Every skill execution writes a memory back after running (institutional knowledge compounds)
- Brain page recommends skills based on current memory state (overdue commitment → follow-up drafter)
- V1-simulate abilities consolidated into orchestrator sequences (one toggle path, not two)
- Skill frontmatter V2 gains `brain_context` field declaring required Brain tables
- Compiled skill cache includes pre-fetched Brain data (5-min TTL, no extra queries per invocation)

## User Stories

### LAYER 1: Brain-Aware Skills (skills read Brain)

### SBI-001: Add brain_context field to skill frontmatter V2
**Description:** As a platform admin, I want skills to declare which Brain tables they need so the copilot auto-injects relevant memory context before skill execution.

**Acceptance Criteria:**
- [ ] `brain_context` field added to V2 frontmatter spec in `SKILL_FRONTMATTER_GUIDE.md`
- [ ] Accepted values: array of `['contact_memory', 'deal_memory_events', 'copilot_memories', 'commitments', 'none']`
- [ ] Default: `['contact_memory', 'deal_memory_events']` (most skills benefit from deal + contact context)
- [ ] Field stored in `platform_skills.frontmatter` JSONB and compiled into `organization_skills.compiled_frontmatter`
- [ ] Compilation pipeline (`compile-organization-skills`) passes `brain_context` through unchanged
- [ ] Typecheck passes

### SBI-002: Auto-inject Brain context into skill execution
**Description:** As a copilot user, I want skills to automatically receive Brain memory context so they produce more personalized, context-aware outputs without me providing background.

**Acceptance Criteria:**
- [ ] In `copilot-autonomous`, when `get_skill` returns a skill with `brain_context` in frontmatter, fetch the declared Brain tables
- [ ] Brain data fetched for the active contact/deal (resolved from conversation context or seed_context)
- [ ] Data formatted as `[BRAIN CONTEXT]` block appended to the skill's compiled_content before execution
- [ ] Block includes: relationship strength, open commitments, recent objections, last sentiment (max 400 tokens)
- [ ] Cache Brain context per (orgId, contactId, dealId) with 5-min TTL (reuse `fleetRouter.ts` cache pattern)
- [ ] If no Brain data exists, skill executes normally (no block added)
- [ ] Typecheck passes

### SBI-003: Update top 10 most-used skills with brain_context declarations
**Description:** As a platform admin, I want the most impactful skills to declare their Brain context needs so they immediately benefit from memory injection.

**Acceptance Criteria:**
- [ ] Identify top 10 skills by execution count from `copilot_skill_executions` (or manually: follow-up drafter, meeting prep, deal health, lead qualification, proposal generator, objection handler, coaching analysis, competitive intel, daily focus planner, deal rescue)
- [ ] Each skill's `platform_skills.frontmatter` updated with appropriate `brain_context` array
- [ ] Skills that handle contacts get `['contact_memory', 'copilot_memories']`
- [ ] Skills that handle deals get `['deal_memory_events', 'commitments']`
- [ ] Skills that handle both get full array
- [ ] Migration updates frontmatter JSONB for these 10 skills
- [ ] Typecheck passes

### LAYER 2: Skills Write Back to Brain (skills create memories)

### SBI-004: Create skill execution → memory writer utility
**Description:** As the system, I want every skill execution to automatically create a copilot_memories entry summarizing what happened so the Brain accumulates institutional knowledge.

**Acceptance Criteria:**
- [ ] New utility `_shared/skills/writeSkillMemory.ts` created
- [ ] Function: `writeSkillMemory(skillKey, userId, orgId, input, output, entities, supabase)`
- [ ] Creates a `copilot_memories` entry with category='fact', subject=skill name + summary, content=key output
- [ ] Links to contact_id and deal_id if provided in entities
- [ ] Truncates content to 500 chars max
- [ ] Deduplicates: if a memory with same subject exists within 24h, updates instead of inserting
- [ ] Non-blocking: errors logged, never fails the skill execution
- [ ] Typecheck passes

### SBI-005: Wire skill memory writer into execute_action flow
**Description:** As the system, I want the execute_action handler to automatically call the memory writer after successful skill executions.

**Acceptance Criteria:**
- [ ] `executeAction.ts` calls `writeSkillMemory()` after successful `run_skill` and `invoke_skill` actions
- [ ] Memory includes: skill_key, action summary (first 200 chars of output), entities referenced
- [ ] Only writes for skills that produce substantive output (skip data-access queries, format selections)
- [ ] Skippable via `brain_context: ['none']` in skill frontmatter (opt-out)
- [ ] `copilot_skill_executions` table already tracks execution — memory writer reads from this
- [ ] Typecheck passes

### LAYER 3: Brain Recommends Skills

### SBI-006: Create useSuggestedSkills hook — Brain state → skill recommendations
**Description:** As a rep viewing the Brain page, I want to see suggested skills based on my current memory state so I know what actions to take next.

**Acceptance Criteria:**
- [ ] New hook `src/lib/hooks/useSuggestedSkills.ts`
- [ ] Queries Brain state: overdue commitments, decaying contacts, at-risk deals, recent coaching improvements
- [ ] Maps each state to a recommended skill:
  - Overdue commitment → `followup-reply-drafter` or `copilot-chase`
  - Decaying contact → `deal-reengagement-intervention` or `warm-intro-drafter`
  - At-risk deal → `deal-rescue-plan` or `deal-next-best-actions`
  - Coaching gap → `coaching-analysis`
  - New deal → `lead-qualification` or `deal-map-builder`
- [ ] Returns max 3 suggestions with: skillKey, skillName, reason, urgency, entityId
- [ ] Uses React Query with 5-min stale, org from useOrgStore
- [ ] Typecheck passes

### SBI-007: Add Suggested Skills section to Brain page
**Description:** As a rep, I want the Brain page to show me which skills to run based on what the Brain knows so I can take immediate action.

**Acceptance Criteria:**
- [ ] New component `src/components/brain/BrainSuggestedSkills.tsx`
- [ ] Renders 2-3 skill suggestion cards below the insight cards on Brain page
- [ ] Each card: skill icon (from abilityRegistry gradient/icon), skill name, reason text, "Run" button
- [ ] "Run" button opens copilot with a pre-filled message: "Run {skillName} for {entity}"
- [ ] Cards only appear when suggestions exist (hidden when empty)
- [ ] Wired into BrainPage.tsx between BrainInsightCards and MeetingPrepCard
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### LAYER 4: Consolidate V1 → V2 Abilities

### SBI-008: Migrate V1-simulate abilities to orchestrator sequences
**Description:** As a platform admin, I want V1 localStorage-toggle abilities migrated to DB-backed orchestrator sequences so there's one consistent toggle path.

**Acceptance Criteria:**
- [ ] Identify all abilities with `backendType: 'v1-simulate'` in abilityRegistry.ts (approximately 9)
- [ ] For each V1 ability, create a matching entry in `user_sequence_preferences` with the same sequence_type
- [ ] Update abilityRegistry.ts: change `backendType` from `'v1-simulate'` to `'orchestrator'` for migrated abilities
- [ ] Remove localStorage toggle logic in `AgentMarketplacePage.tsx` for migrated abilities
- [ ] All toggles now use `useAgentAbilityPreferences` hook (DB-backed)
- [ ] Verify: toggling a migrated ability ON/OFF persists across browsers
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### SBI-009: Consolidate cron-job abilities into orchestrator event types
**Description:** As a platform admin, I want cron-job abilities unified with the orchestrator so they share the same preference/toggle system.

**Acceptance Criteria:**
- [ ] Identify all abilities with `backendType: 'cron-job'` in abilityRegistry.ts (approximately 8)
- [ ] Map each to an existing orchestrator sequence_type or create new ones in the CHECK constraint
- [ ] Update abilityRegistry.ts: change `backendType` to `'orchestrator'` for these
- [ ] Extend `user_sequence_preferences` CHECK constraint to include new sequence types
- [ ] Cron edge functions already check preferences (TRINITY-007 wired this) — verify they use the correct sequence_type
- [ ] Typecheck passes

### LAYER 5: Brain Context Cache

### SBI-010: Create Brain context cache for skill execution
**Description:** As the system, I want Brain context pre-fetched and cached so skill execution doesn't add latency with per-invocation Brain queries.

**Acceptance Criteria:**
- [ ] New utility `_shared/skills/brainContextCache.ts`
- [ ] `getBrainContext(orgId, contactId, dealId, userId, tables, supabase): Promise<BrainContext>`
- [ ] Uses in-memory Map cache with 5-min TTL (matches fleetRouter pattern)
- [ ] Cache key: `${orgId}:${contactId}:${dealId}:${tables.sort().join(',')}`
- [ ] Returns typed `BrainContext` object: `{ contactMemory?, dealEvents?, memories?, commitments? }`
- [ ] Formats into `[BRAIN CONTEXT]` markdown block (max 400 tokens)
- [ ] Cache shared across skill invocations within same edge function isolate
- [ ] Typecheck passes

## Functional Requirements

- FR-1: Brain context injection must add <50ms latency to skill execution (cache hit) or <200ms (cache miss)
- FR-2: Skill memory writes must be non-blocking — never delay the skill response
- FR-3: V1→V2 ability migration must preserve existing user toggle states (don't reset preferences)
- FR-4: Suggested skills must update within 5 minutes of Brain state changes
- FR-5: Brain context cache must not leak between orgs (cache key includes orgId)

## Non-Goals (Out of Scope)

- User-created custom skills (future — platform-only for now)
- Skill marketplace / skill sharing between orgs
- Real-time skill execution streaming in Brain page
- Skill version rollback UI
- Custom `brain_context` overrides per-org (use platform defaults)

## Technical Considerations

- **Frontmatter change**: `brain_context` is a new field in V2 JSONB — backward compatible (null = default behavior)
- **Compilation pipeline**: `compile-organization-skills` already runs — no new pipeline needed, just pass `brain_context` through
- **Cache pattern**: Reuse `fleetRouter.ts` Map + TTL pattern — proven at scale
- **Memory writer**: Similar to `logAgentAction()` pattern — fire-and-forget after skill completion
- **V1 migration**: One-time migration script + abilityRegistry.ts changes — no schema changes needed
- **Pin `@supabase/supabase-js@2.43.4`** on esm.sh in any new edge functions

## Success Metrics

- 80%+ of skill executions include Brain context (within 2 weeks of shipping)
- Skill outputs measurably more personalized (A/B test follow-up email quality)
- Brain page shows 1+ skill suggestion for users with active pipeline
- Zero V1 localStorage toggles remaining — all DB-backed
- Skill execution → memory write rate: >90% of substantive skill runs

## Open Questions

- None — all technical details verified against codebase
