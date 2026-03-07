---
name: 60-go
invoke: /60/go
description: Smart entry point — analyzes your input and routes to the right pipeline command automatically
---

# /60/go — Smart Router

**Purpose**: Single entry point for all `/60/*` commands. Analyzes what you said, figures out where you are in the project, and routes to the right command. You never need to remember which command to use.

**Input**: $ARGUMENTS

---

## ROUTING LOGIC

Analyze the input and project state, then route to exactly one command. Do NOT ask the user which command — pick it and explain why in one line.

### Step 1: Check Project State

```
HAS .sixty/pipeline.json with phase != "complete"?
  → Active pipeline exists. Check if input relates to it.

HAS .sixty/plan.json with pending stories?
  → Plan exists, stories ready to execute.

HAS prd.json or tasks/prd-*.md?
  → PRD exists but may not be planned yet.

NONE of the above?
  → Fresh start or ad-hoc task.
```

### Step 2: Classify Input

Read the input and classify into one of these intents:

| Signal | Intent | Route |
|--------|--------|-------|
| Bug report, error message, "fix", "broken", "wrong", typo, small tweak | **Quick fix** | `/60/quick` |
| "Continue", "resume", "keep going", "next story", no input + active pipeline | **Resume** | `/60/ship --resume` |
| "Status", "where are we", "progress", "what's left" | **Status check** | `/60/run --show` or read `.sixty/progress.md` |
| Vague idea, "I want to build", "what if we", brainstorm, question | **Discovery** | `/60/discover` |
| Detailed feature description, user stories, acceptance criteria | **PRD generation** | `/60/prd` |
| File path to transcript or meeting notes | **Full pipeline from transcript** | `/60/ship <file>` |
| File path to PRD or requirements doc | **Full pipeline from PRD** | `/60/ship <file>` |
| "Plan", "break down", "stories for" + feature name | **Planning** | `/60/plan --feature "<name>"` |
| "Run", "execute", "build it", "start building" + existing plan | **Execution** | `/60/run --all` |
| "Deploy", "PR", "ship it", "deliver" | **Delivery** | `/60/deliver` |
| "Audit", "cleanup", "dead code", "scan" | **Audit** | `/60/audit` |
| "Sync", "tickets", "dev hub" | **Sync** | `/60/sync` |
| "New project", "start fresh", "bootstrap" | **Launch** | `/60/ship` (full pipeline) |
| Complex feature (multiple systems, integrations, schema changes) | **Full pipeline** | `/60/ship "<description>"` |
| "Hooks", "automation", "crons" | **Hooks config** | `/60/hooks` |
| "Housekeeping", "maintenance", "archive" | **Housekeeping** | `/60/housekeeping` |

### Step 3: Complexity Check (for ambiguous cases)

If the input could be either `/60/quick` or `/60/ship`, estimate scope:

```
QUICK if ALL of these are true:
  - Likely touches 1-3 files
  - No schema/migration changes implied
  - No new API endpoints
  - No multi-component wiring
  - Could be done in <15 minutes

SHIP if ANY of these are true:
  - Mentions multiple features or systems
  - Implies schema changes
  - Needs research (unknown integration, new pattern)
  - Would touch 5+ files
  - Vague enough to need discovery
```

### Step 4: Confidence Score and Route

Assign a confidence score (0-100%) to your top routing choice.

**High confidence (80%+)** — Route silently with one-line explanation:

```
Routing to /60/quick — this is a single-file bug fix in the invoice formatter
```

Then immediately execute.

**Low confidence (<80%)** — Show top 2 options with reasoning:

```
  85% → /60/quick (shared component exists, 1-2 files)
  60% → /60/ship  (touches 12+ table components if no shared loader)

  Quick if there's a shared TableLoader component. Ship if each table is custom.
  Which approach? [Q]uick / [S]hip
```

Wait for user to pick, then execute.

### Confidence Signals

| Signal | Boosts confidence |
|--------|------------------|
| Exact keyword match ("fix", "audit", "resume") | +30% |
| File path provided | +20% |
| Active pipeline exists + related input | +25% |
| Clear scope (1-3 files vs "everything") | +20% |
| Ambiguous scope ("add X to all Y") | -30% |
| Could be quick OR complex | -25% |
| No project state to reference | -15% |

### Examples

```
Routing to /60/quick — this is a single-file bug fix in the invoice formatter

Routing to /60/discover — "AI-powered lead scoring" needs research before we plan

Routing to /60/ship --resume — you have an active pipeline at BUILD phase (5/9 stories done)

Routing to /60/run --all — plan exists with 7 pending stories, ready to execute

Routing to /60/ship "Add Stripe billing" — this touches schema, APIs, and UI, needs the full pipeline
```

Low-confidence example:
```
  75% → /60/quick  (if it's just the date formatter function)
  65% → /60/ship   (if dates are wrong across multiple views)

  Is this one place or everywhere? [Q]uick / [S]hip
```

---

## EXAMPLES

```bash
/60/go "The date is showing wrong on the invoice page"
# → /60/quick "The date is showing wrong on the invoice page"

/60/go "I want to add a notification center"
# → /60/discover "I want to add a notification center"

/60/go ./calls/acme-scoping-call.txt
# → /60/ship ./calls/acme-scoping-call.txt

/60/go "Keep going"
# → /60/ship --resume

/60/go "Add dark mode toggle with preference sync"
# → /60/ship "Add dark mode toggle with preference sync" (touches theme provider, DB prefs, multiple components)

/60/go "Change the button color on the login page to blue"
# → /60/quick "Change the button color on the login page to blue"

/60/go
# → (no input) Check for active pipeline → resume, or ask "What are we building?"

/60/go "How's the build going?"
# → Read .sixty/progress.md and pipeline.json, report status

/60/go "Run the audit"
# → /60/audit
```

---

## NO-INPUT BEHAVIOR

If called with no arguments:

1. **Active pipeline exists** → `/60/ship --resume`
2. **Plan exists with pending stories** → `/60/run --all`
3. **Nothing in .sixty/** → Ask: "What are we building?" then route the response

---

## RULES

1. **Never ask which command to use.** That's the whole point — you decide.
2. **Bias toward action.** If it's ambiguous between "research more" and "just do it", lean toward doing it.
3. **One routing line, then execute.** Don't explain the full pipeline — just route and go.
4. **Respect active pipelines.** If there's work in progress, default to resuming it unless the input is clearly unrelated.
5. **Pass the full input through.** Whatever the user said goes to the target command as its $ARGUMENTS.
