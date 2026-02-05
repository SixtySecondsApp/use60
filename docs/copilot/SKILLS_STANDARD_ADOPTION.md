# Skills Standard Adoption Plan

Findings from analyzing [skills.sh](https://skills.sh/) (40K+ skills) and the [Agent Skills specification](https://agentskills.io) — the open standard created by Anthropic and adopted by 25+ agent platforms.

---

## The Standard: Agent Skills Format

The industry has converged on a simple, file-based format:

```
skill-name/
├── SKILL.md          # Required: YAML frontmatter + markdown instructions
├── scripts/          # Optional: executable code (Python, Bash, JS)
├── references/       # Optional: detailed docs loaded on-demand
└── assets/           # Optional: templates, schemas, data files
```

### Minimal Frontmatter

```yaml
---
name: meeting-prep-brief
description: Prepare a comprehensive pre-meeting brief with agenda, talking points, competitor positioning, and risk flags. Use when a user has an upcoming meeting and needs preparation.
---
```

Only `name` and `description` are required. Everything else is optional.

### Full Frontmatter (with optional fields)

```yaml
---
name: meeting-prep-brief
description: Prepare a comprehensive pre-meeting brief with agenda, talking points, competitor positioning, and risk flags.
license: Apache-2.0
compatibility: Requires CRM data access and calendar integration
allowed-tools: Bash(node:*) Read
metadata:
  author: sixty-ai
  version: "2.0"
  category: sales-ai
---
```

| Field | Required | Purpose |
|-------|----------|---------|
| `name` | Yes | Lowercase kebab-case, max 64 chars, must match directory name |
| `description` | Yes | Max 1024 chars — what the skill does AND when to use it |
| `license` | No | License identifier or reference |
| `compatibility` | No | Environment requirements (max 500 chars) |
| `metadata` | No | **Open key-value map** — any custom fields |
| `allowed-tools` | No | Pre-approved tools (experimental) |

---

## Can Our Extensions Fit the Standard?

**Yes.** The spec is designed to be extensible. Here's how our features map:

### 1. Custom Metadata (via `metadata` field)

The `metadata` field is an **arbitrary key-value map** — this is where our extensions live:

```yaml
---
name: meeting-prep-brief
description: Prepare a comprehensive pre-meeting brief with agenda, talking points, competitor positioning, and risk flags.
metadata:
  # Standard metadata
  author: sixty-ai
  version: "2.0"

  # 60-specific extensions
  category: sales-ai
  skill_type: atomic
  execution_mode: sync
  timeout_ms: 30000

  # Trigger system (60-specific)
  triggers:
    - pattern: "prep for meeting"
      intent: meeting_preparation
      confidence: 0.9
      examples:
        - "prepare for my meeting"
        - "meeting prep"
        - "get ready for the call"

  # Context requirements (60-specific)
  required_context:
    - company_name
    - deal_id
  optional_context:
    - contact_name

  # Input/output schema (60-specific)
  inputs:
    - name: meeting_id
      type: string
      required: true
  outputs:
    - name: brief
      type: object

  # Tags for filtering
  tags:
    - meetings
    - preparation
    - sales
---
```

### 2. Linked Skills / Sequences (via `metadata` + `references/`)

Sequences are skills that orchestrate other skills. They fit the standard using:

```
seq-next-meeting-command-center/
├── SKILL.md                    # Sequence instructions + linked_skills in metadata
├── references/
│   ├── step-1-gather.md        # Step details for gathering context
│   ├── step-2-analyze.md       # Step details for analysis
│   └── step-3-format.md        # Step details for output formatting
└── assets/
    └── output-template.json    # Structured output template
```

```yaml
---
name: seq-next-meeting-command-center
description: Complete meeting preparation workflow. Gathers context, analyzes attendees, prepares talking points, and generates a command center brief. Use when preparing for the next upcoming meeting.
metadata:
  author: sixty-ai
  version: "1.0"
  category: agent-sequence
  skill_type: sequence
  execution_mode: async
  timeout_ms: 300000

  # Linked skills (60-specific)
  linked_skills:
    - get-contact-context
    - meeting-prep-brief
    - deal-health-analysis
    - slack-briefing-format

  # Workflow definition (60-specific)
  workflow:
    - step: 1
      skill: get-contact-context
      parallel_group: gather
    - step: 2
      skill: meeting-prep-brief
      parallel_group: gather
    - step: 3
      skill: deal-health-analysis
      depends_on: [1, 2]
    - step: 4
      skill: slack-briefing-format
      depends_on: [3]
      hitl_before: true

  # HITL configuration (60-specific)
  hitl:
    preview_mode: true
    confirm_pattern: "confirm|approve|send"
    timeout_action: cancel
---
```

### 3. Custom Folders (Allowed by Spec)

The spec defines `scripts/`, `references/`, and `assets/` as conventional directories but does **not restrict** additional directories. Our folder system maps cleanly:

```
deal-health-analysis/
├── SKILL.md                    # Main instructions
├── scripts/
│   └── calculate-score.py      # Scoring algorithm
├── references/
│   ├── REFERENCE.md            # Detailed scoring methodology
│   ├── meddicc-framework.md    # MEDDICC criteria definitions
│   └── stage-weights.md        # Stage-specific weight tables
├── assets/
│   ├── output-template.json    # Structured output schema
│   └── score-thresholds.json   # Score interpretation ranges
└── examples/                   # Custom directory (allowed)
    ├── healthy-deal.md
    └── at-risk-deal.md
```

### 4. Organization Variables (Compilation Layer)

The spec doesn't cover compilation — it's a file format, not a runtime. Our variable interpolation (`${company_name}`, `${competitors}`) is an **application-layer feature** that operates on top of the standard format:

```markdown
# Meeting Prep Brief

## Company Context
You are preparing a brief for ${company_name}.

## Competitor Positioning
Known competitors: ${competitors|join(', ')}
Key differentiators: ${value_propositions|join('; ')}

## Instructions
1. Pull attendee information from CRM
2. Check recent deal activity
3. Identify ${company_name}-specific talking points
```

The raw `SKILL.md` contains the template variables. Our skill compiler resolves them at runtime. This is invisible to the standard — it just sees valid markdown.

---

## What Changes

### Current State vs. Target State

| Aspect | Current | Target |
|--------|---------|--------|
| **Storage** | Database rows (`platform_skills` table) | Filesystem (`SKILL.md`) synced to database |
| **Format** | JSONB frontmatter in DB column | YAML frontmatter in `SKILL.md` files |
| **Authoring** | SQL migrations or admin UI | Edit markdown files, git push |
| **Discovery** | Trigger-based routing only | Description-based + trigger-based (hybrid) |
| **Token budget** | No limit on `content_template` | Main body <5000 tokens, detail in `references/` |
| **Distribution** | Internal only | Publishable to skills.sh ecosystem |

### What We Keep (Competitive Advantages)

- **Organization-aware compilation** — `${company_name}`, `${competitors}`, etc.
- **Sequence orchestration** — Multi-skill chains with HITL gates
- **Structured output contract** — `SkillResult` interface
- **Confidence-based routing** — Sequence-first with thresholds
- **Preview/confirm pattern** — Simulation mode before execution

### What We Add

- **Standard-compliant file format** — `SKILL.md` files
- **Progressive disclosure** — metadata → instructions → resources (3-tier)
- **Description-driven discovery** — embedding-based matching as fallback
- **Simple authoring path** — just write markdown, no triggers required
- **Executable scripts** — `scripts/` directory for computation
- **Git-based workflow** — version control, PRs, community contributions

---

## Implementation Plan

### Phase 1: Adopt File Format

Convert existing skills from database-only to `SKILL.md` files that sync to the database.

**Directory structure:**

```
skills/
├── atomic/
│   ├── meeting-prep-brief/
│   │   ├── SKILL.md
│   │   ├── references/
│   │   │   └── talking-points-framework.md
│   │   └── assets/
│   │       └── output-schema.json
│   ├── meeting-digest-truth-extractor/
│   │   └── SKILL.md
│   ├── post-meeting-followup-drafter/
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── email-templates.md
│   ├── deal-next-best-actions/
│   │   └── SKILL.md
│   └── objection-to-playbook/
│       ├── SKILL.md
│       └── references/
│           └── playbook-library.md
├── sequences/
│   ├── seq-next-meeting-command-center/
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── step-definitions.md
│   ├── seq-post-meeting-followup-pack/
│   │   └── SKILL.md
│   ├── seq-deal-rescue-pack/
│   │   └── SKILL.md
│   ├── seq-pipeline-focus-tasks/
│   │   └── SKILL.md
│   ├── seq-daily-focus-plan/
│   │   └── SKILL.md
│   ├── seq-deal-map-builder/
│   │   └── SKILL.md
│   ├── seq-followup-zero-inbox/
│   │   └── SKILL.md
│   ├── seq-deal-slippage-guardrails/
│   │   └── SKILL.md
│   └── seq-catch-me-up/
│       └── SKILL.md
└── data-access/
    ├── get-contact-context/
    │   └── SKILL.md
    └── get-meetings-for-period/
        └── SKILL.md
```

**Sync mechanism:**

```
SKILL.md (git) → parse frontmatter + body → upsert platform_skills (DB)
```

A build step or edge function reads `SKILL.md` files, extracts frontmatter into the `frontmatter` JSONB column, and stores the markdown body as `content_template`. The database remains the runtime source of truth; files are the authoring source of truth.

### Phase 2: Progressive Disclosure

Enforce token budgets aligned with the spec:

| Tier | What | Token Budget | When Loaded |
|------|------|-------------|-------------|
| Metadata | `name` + `description` | ~50-100 tokens | Startup (all skills) |
| Instructions | `SKILL.md` body | <5,000 tokens | On activation |
| Resources | `references/`, `scripts/`, `assets/` | As needed | On demand during execution |

**Rule:** If a skill's main body exceeds 5,000 tokens, the author must move detail into `references/` files. The main body should contain the core workflow; references hold the deep context.

### Phase 3: Description-Based Discovery

Add embedding-based matching as a fallback routing layer:

```
User message
  │
  ├─ 1. Check triggers (confidence > 0.7) → Sequence match? → Execute
  │
  ├─ 2. Check triggers (confidence > 0.5) → Skill match? → Execute
  │
  └─ 3. Embedding similarity on descriptions → Match? → Execute
       (new fallback layer)
```

This means new skills can be authored with JUST a name and description — no triggers required. The system will still match them via semantic similarity. Triggers become an optimization for high-confidence routing, not a requirement.

### Phase 4: Scripts Support

Allow skills to bundle executable code:

```
deal-health-analysis/
├── SKILL.md
└── scripts/
    ├── calculate-score.py     # Scoring algorithm
    └── fetch-activity-data.js # Data fetching helper
```

The copilot can execute these via `allowed-tools` or through the existing `execute_action` tool. Scripts handle computation that prompting alone can't reliably do (scoring algorithms, data transforms, API calls).

### Phase 5: Publish to Ecosystem

Select generic-enough skills for open-source publication:

| Candidate | Why |
|-----------|-----|
| `meeting-prep-brief` | Universal sales skill, high demand |
| `deal-next-best-actions` | Stage-aware methodology, valuable pattern |
| `objection-to-playbook` | Common sales need, showcases structured output |

Strip org-specific compilation variables, publish to `sixty-ai/skills` repo, list on skills.sh. This drives awareness and establishes 60 as a thought leader in AI sales tooling.

---

## Example: Migrated Skill

### Before (Database-only)

```sql
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template)
VALUES (
  'meeting-prep-brief',
  'sales-ai',
  '{"name": "Meeting Prep Brief", "triggers": [{"pattern": "prep for meeting", "confidence": 0.9}], "inputs": [{"name": "meeting_id", "type": "string"}]}'::jsonb,
  'You are preparing a meeting brief for ${company_name}...'
);
```

### After (SKILL.md + DB sync)

**`skills/atomic/meeting-prep-brief/SKILL.md`:**

```markdown
---
name: meeting-prep-brief
description: |
  Prepare a comprehensive pre-meeting brief with agenda, talking points,
  competitor positioning, and risk flags. Use when a user has an upcoming
  meeting, asks to prep, or says "get ready for the call."
metadata:
  author: sixty-ai
  version: "2.0"
  category: sales-ai
  skill_type: atomic
  execution_mode: sync
  timeout_ms: 30000
  triggers:
    - pattern: "prep for meeting"
      intent: meeting_preparation
      confidence: 0.9
      examples:
        - "prepare for my meeting"
        - "meeting prep"
        - "get ready for the call"
        - "brief me before the meeting"
  required_context:
    - company_name
  inputs:
    - name: meeting_id
      type: string
      required: true
  outputs:
    - name: brief
      type: object
      description: Structured meeting brief
---

# Meeting Prep Brief

You are ${user_name}'s dedicated sales analyst at ${company_name}.
Prepare a thorough pre-meeting brief.

## Steps

1. **Identify the meeting** — Resolve the upcoming meeting from calendar data
2. **Gather attendee context** — Pull contact records, recent activity, deal status
3. **Analyze relationship health** — Check last touch, email sentiment, engagement trend
4. **Build talking points** — Based on deal stage, recent activity, and known pain points
5. **Flag risks** — Competitor mentions, stalled deals, missed commitments
6. **Format the brief** — Use structured output for the command center UI

## Competitor Positioning

Known competitors: ${competitors|join(', ')}

When a competitor is mentioned in recent activity, include:
- Our differentiators vs. that specific competitor
- Proof points and case studies
- Discovery questions to uncover the real evaluation criteria

## Output Format

Return a structured `meeting_brief` with:
- `meeting_summary` — Who, when, what stage, deal value
- `attendees` — Each person with role, sentiment, last interaction
- `talking_points` — Prioritized list with rationale
- `risks` — Flagged items with suggested mitigations
- `competitor_intel` — If applicable
- `suggested_agenda` — Recommended flow for the meeting
```

**`skills/atomic/meeting-prep-brief/references/talking-points-framework.md`:**

```markdown
# Talking Points Framework

## By Deal Stage

### Discovery
- Focus on pain points and current state
- Ask about decision process and timeline
- Understand budget and authority

### Evaluation
- Lead with differentiators vs. known competitors
- Share relevant case studies
- Address technical requirements

### Negotiation
- Reference agreed success criteria
- Reinforce ROI and business case
- Clarify implementation timeline

[... detailed framework continues ...]
```

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Store skills as files or DB? | **Both** — files are authoring truth, DB is runtime truth | Git workflow for authoring, fast DB queries for runtime |
| Break compatibility with current frontmatter? | **No** — migrate gradually | Current skills keep working, new format is additive |
| Require triggers for new skills? | **No** — description-only is valid | Lowers authoring barrier, embedding fallback handles routing |
| Custom directories beyond spec? | **Yes, via `metadata`** | Spec explicitly allows arbitrary metadata and extra directories |
| Publish skills externally? | **Phase 5** — after internal migration | Get the format right internally first |

---

## References

- [Agent Skills Specification](https://agentskills.io/specification) — the full format spec
- [skills.sh](https://skills.sh/) — skill directory and leaderboard (40K+ skills)
- [Anthropic Example Skills](https://github.com/anthropics/skills) — reference implementations
- [Vercel Agent Skills](https://github.com/vercel-labs/agent-skills) — high-adoption examples
- [Existing Skill Frontmatter Guide](./SKILL_FRONTMATTER_GUIDE.md) — our current V2 spec
