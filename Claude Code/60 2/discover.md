---
name: 60-discover
invoke: /60/discover
description: Research-first requirements discovery — deploys 5 parallel agents to analyze codebase, find patterns, scan risks, and size scope
---

# /60/discover — Research-First Requirements Discovery

**Purpose**: Parse input (transcript/description/PRD), deploy parallel research agents, find similar projects, identify gaps, compose the right team. Phase 1 of `/60/ship`. Replaces `/consult`.

**Input**: $ARGUMENTS

---

## OVERVIEW

Unlike simple Q&A, DISCOVER deploys specialized sub-agents that analyze your codebase, search for similar projects, and cross-reference past work — while asking you only the questions that research couldn't answer.

```
INPUT (transcript / description / PRD / interactive)
  |
  v
PARSE + CLASSIFY
  |
  +---> Codebase Scout (Explore agent)
  +---> Patterns Analyst (Explore agent)
  +---> Risk Scanner (Explore agent)
  +---> GitHub Scout (web search + repo analysis)
  +---> Scope Sizer (Plan agent)
  |
  v
SYNTHESIS (combine all agent findings)
  |
  v
GAP QUESTIONS (only what research didn't answer, 2-3 max)
  |
  v
TEAM COMPOSITION (auto-scored from findings)
  |
  v
Output: populated pipeline.json ready for DEFINE phase
```

---

## STEP 1: Parse and Classify Input

### Transcript Detection
Look for these signals:
- Timestamps (00:00, 0:00:00, [10:32])
- Speaker labels ("Andrew:", "Client:", "Speaker 1:")
- Conversational markers ("yeah", "exactly", "so basically")
- Meeting platform artifacts (Otter.ai, Fireflies, Zoom transcript headers)

If transcript detected:
1. Extract **requirements** — explicit asks, feature requests, pain points
2. Extract **constraints** — budget, timeline, tech preferences, integrations mentioned
3. Extract **stakeholders** — who said what, decision makers vs influencers
4. Extract **open questions** — things discussed but not resolved
5. Store all in `pipeline.json.input`

### PRD Document Detection
Look for:
- "User Stories", "Acceptance Criteria", "Requirements" headers
- "As a [user], I want..." patterns
- "FR-1:", "US-001:" numbering

If PRD detected:
1. Parse into structured requirements
2. Identify gaps (missing acceptance criteria, vague stories)
3. Proceed directly to agent research (fewer gap questions needed)

### Description
Plain text without file structure markers:
1. Store as initial context
2. More gap questions will be needed

### Interactive
No input provided:
1. Ask: "What are we building?"
2. Wait for response, then classify that response

---

## STEP 2: Deploy Research Agents (Parallel)

Launch all 5 agents simultaneously using the Agent tool. Each runs as an Explore or Plan subagent.

### Agent 1: CODEBASE SCOUT

```
Subagent type: Explore
Thoroughness: very thorough

Mission: Map all existing code relevant to this feature request.

Search for:
- Components, hooks, utilities that could be reused
- Existing data models and schema
- API endpoints and edge functions
- Related features already implemented
- Service patterns and data flow

Output format:
  existing_assets: [{ path, relevance, notes }]
  gaps_identified: ["No invoices table", "No Stripe integration"]
  suggested_locations: { feature_code, components, hooks, services }
  reusable_patterns: [{ pattern, example_file, description }]
```

### Agent 2: PATTERNS ANALYST

```
Subagent type: Explore
Thoroughness: medium

Mission: Identify coding conventions the implementation must follow.

Analyze:
- State management approach (React Query vs Zustand vs other)
- Component structure and naming
- Error handling patterns
- Testing patterns and file locations
- File organization conventions
- Import and export patterns

Output format:
  patterns_detected: { category: { style, rule, example_file } }
  must_follow: ["All DB calls through React Query hooks", ...]
```

### Agent 3: RISK SCANNER

```
Subagent type: Explore
Thoroughness: thorough

Mission: Identify risks, blockers, and potential gotchas.

Check for:
- Schema changes requiring migrations
- Breaking changes to existing APIs
- Security implications (auth, permissions, RLS)
- Performance concerns
- Missing environment variables / secrets
- External service dependencies
- Cross-browser / cross-platform issues

Output format:
  risks: [{ severity: high|medium|low, area, issue, mitigation }]
  blockers: [{ type, description, blocking: boolean }]
  missing_secrets: ["STRIPE_SECRET_KEY", ...]
```

### Agent 4: GITHUB SCOUT

```
Subagent type: general-purpose

Mission: Find similar implementations to learn from.

Search order:
1. THIS REPO's git history — past implementations, archived runs, closed PRs
   - Check archive/ directory for previous features
   - Check .sixty/runs/ for past pipeline outputs
   - git log for relevant commits

2. ORGANIZATION REPOS — other Sixty projects
   - Search AI Dev Hub for similar completed tickets
   - Cross-project pattern library (if available)

3. PUBLIC REPOS — via web search
   - Search for: "<framework> <feature> implementation"
   - Look for well-structured examples with tests
   - Extract: file structures, data models, edge cases handled
   - Focus on repos with good patterns, not just any result

Output format:
  internal_references: [{ source, relevance, learnings }]
  org_references: [{ project, ticket, pattern }]
  public_references: [{ repo_description, key_patterns, applicable_learnings }]
  recommended_approach: "Based on X and Y, suggest..."
```

### Agent 5: SCOPE SIZER

```
Subagent type: Plan

Mission: Estimate effort, identify parallelism, score complexity for team composition.

Evaluate:
- Total estimated effort
- Natural story boundaries
- Dependency chains
- Parallel execution opportunities
- MVP vs full scope options

Output format:
  complexity_score: {
    storyCount: 0-2,
    schemaChanges: 0-1,
    externalAPIs: 0-2,
    crossFeatureDeps: 0-1,
    securitySurface: 0-2,
    novelArchitecture: 0-2,
    total: N,
    tier: 1-4
  }
  estimated_hours: { optimistic, realistic, pessimistic }
  parallel_opportunities: [{ stories, reason, time_saved }]
  mvp_suggestion: { stories, estimate, delivers, deferred }
```

---

## STEP 3: Synthesis

After all agents return, synthesize findings:

### Find Agreements
Where do all agents align? These become high-confidence inputs to the PRD.

### Find Conflicts
Where do agents disagree? Resolution rules:
- Story count differs → go with higher (safer)
- Estimate differs >50% → use pessimistic
- Different patterns found → pick most recent, or ask user
- Risk severity differs → go with higher

### Find Gaps
Things no agent covered that the input also didn't clarify. These become gap questions.

### Cross-Reference GitHub Scout Findings
If the GitHub Scout found relevant patterns:
- Flag reusable approaches: "Found a well-structured webhook pattern in org project-B"
- Flag anti-patterns: "Common mistake in public repos is X — we should avoid this"
- Suggest specific file structures based on findings

---

## STEP 3b: Brief Improvement Suggestions (5 options)

**Before** gap questions, offer 5 ways to strengthen the brief. These are proactive improvements the AI identifies — not clarifications, but upgrades.

Present as a numbered multiple-choice list. The user picks any combination (e.g. "1, 3, 5") or skips entirely with "0" or "move on".

### Format

```
Before we continue, here are 5 ways I'd strengthen this brief:

  1. [SCOPE]    Add offline support — the mobile use case implies spotty connectivity
  2. [UX]       Include an onboarding flow — first-time users won't know where to start
  3. [SECURITY] Add rate limiting on the webhook endpoint — public-facing APIs need it
  4. [PERF]     Paginate the invoice list from day one — the table will grow fast
  5. [EDGE]     Handle partial Stripe failures — what if payment succeeds but webhook fails?

Pick any to include (e.g. "1, 3, 5"), or "0" to skip.
```

### Categories to draw from

- **SCOPE** — missing features that complement the request
- **UX** — user experience gaps (empty states, onboarding, error messages)
- **SECURITY** — auth, permissions, rate limiting, data protection
- **PERF** — pagination, caching, indexing, lazy loading
- **EDGE** — error cases, race conditions, partial failures
- **COMPAT** — browser support, mobile, accessibility
- **OPS** — monitoring, logging, alerting, feature flags
- **DATA** — analytics events, audit trails, export capabilities

### Rules

1. Draw suggestions from research agent findings — not generic advice
2. Each suggestion is one sentence with a concrete reason
3. Tag each with a category prefix in brackets
4. Never repeat something already in the requirements
5. If the user says "0", "skip", "move on", "none", or similar → proceed immediately
6. Selected improvements get added to `pipeline.json.input.extractedRequirements`

---

## STEP 4: Gap Questions (3-10)

Ask 3-10 questions based on how much the research left unanswered. Fewer questions when the input is detailed (PRD with acceptance criteria). More questions when the input is vague (one-liner description). One question at a time. Wait for each answer.

Good gap questions:
- "The transcript mentions 'billing sync' but doesn't specify where — HubSpot, Stripe, or both?"
- "Should this be customer-visible immediately, or behind a feature flag first?"
- "The codebase has two auth patterns — Clerk middleware and Supabase RLS. Which should this feature use?"

Bad questions (don't ask these):
- Things the codebase analysis already answered
- Things the transcript/PRD explicitly stated
- Technical implementation details (agents figure those out)
- "What tech stack?" (already detected)

If the input + research covers everything, skip questions entirely:
```
Research complete — no gaps found. Proceeding to DEFINE.
```

---

## STEP 5: Team Composition

Using the Scope Sizer's complexity score, compose the team:

```
Complexity total: 5 → Tier 3

Team:
  Workers: Sonnet x3 (parallel story execution)
  Reviewer: Opus (quality validation)
  Architect: Opus (PLAN phase design)
  Manager: Opus (blocker resolution)

Reason: 9 stories, 1 schema change, Stripe integration (external API),
        payment security surface. Needs Opus oversight.
```

Store in `pipeline.json.team`.

---

## STEP 6: Update Pipeline State

Write to `.sixty/pipeline.json`:
- `input.type`, `input.source`, `input.extractedRequirements`, etc.
- `team` composition
- Initial `stories` outline (rough, refined in PLAN)
- `phaseGates.discover.status = "complete"`

---

## STEP 7: Output Summary

```
DISCOVER complete

  Input: transcript (42 min scoping call)
  Requirements: 8 extracted, 2 constraints identified
  Questions: 2 asked, 2 answered

  Research findings:
    Codebase: 12 reusable assets found, 3 gaps
    Patterns: React Query + Zustand, feature folder convention
    Risks: 2 high (migration + RLS), 1 medium (Stripe webhook)
    GitHub: Found webhook pattern in project-B, 2 public references
    Scope: 9 stories, ~4-5 hours, 2 parallel groups

  Team: Tier 3 (Sonnet workers x3, Opus reviewer + architect)

  Continuing to DEFINE...
```

---

## STANDALONE USAGE

When run outside `/60/ship`:

```bash
/60/discover "Add Stripe billing to our portal"
/60/discover ./calls/acme-scoping.txt
```

Outputs the full research report and suggests:
```
Discovery complete. Next steps:
  /60/ship --resume    (continue the pipeline)
  /60/prd              (generate PRD from these findings)
```

---

## ERROR HANDLING

| Error | Action |
|-------|--------|
| Agent times out | Use partial results, note gap |
| No relevant code found | Note greenfield, increase complexity score |
| Web search fails | Skip public repo research, rely on internal |
| Transcript too short (<5 lines) | Treat as description, ask more questions |
| Dev Hub MCP unavailable | Skip cross-project lookup |
| All agents fail | Fall back to manual Q&A (3-7 questions) |
