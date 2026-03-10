---
name: web-go
invoke: /web/go
description: Smart entry point — analyzes your input and routes to the right web pipeline command automatically
---

# /web/go — Smart Router

**Purpose**: Single entry point for all `/web/*` commands. Analyzes what you said, figures out where you are in the project, and routes to the right command. You never need to remember which command to use.

**Input**: $ARGUMENTS

---

## ROUTING LOGIC

Analyze the input and project state, then route to exactly one command. Do NOT ask the user which command — pick it and explain why in one line.

### Step 1: Check Project State

```
HAS .web/pipeline.json with phase != "complete"?
  → Active pipeline exists. Check if input relates to it.

HAS .web/style-guide.json?
  → Style decisions already locked. Skip design phase unless overriding.

HAS .web/brief.md?
  → Strategy exists but may not be designed/built yet.

NONE of the above?
  → Fresh start or ad-hoc task.
```

### Step 2: Classify Input

| Signal | Intent | Route |
|--------|--------|-------|
| "Plan the website", "what should our site look like", "site architecture", "SEO plan" | **Strategy** | `/web/brief` |
| "Choose a style", "pick colors", "font pairing", "moodboard", "design direction" | **Design** | `/web/design` |
| "Build a hero", "create pricing section", "make a landing page", "code the page" | **Build** | `/web/build` |
| "Generate a logo", "create banner", "hero image", "SVG animation", "icons", "social graphics" | **Assets** | `/web/assets` |
| "Make it better", "fix spacing", "accessibility check", "polish", "craft pass" | **Polish** | `/web/polish` |
| "Full website", "landing page from scratch", "redesign", "end-to-end" | **Full pipeline** | `/web/ship` |
| "Continue", "resume", "keep going", "next phase" | **Resume** | `/web/ship --resume` |
| "Quick", "just build", "add a section", small UI tweak | **Fast-path** | `/web/quick` |
| Bug fix, "fix the button", "wrong color", small CSS change | **Fast-path** | `/web/quick` |
| "Status", "where are we", "what's done" | **Status** | Read `.web/pipeline.json` and report |

### Step 3: Complexity Check (for ambiguous cases)

If the input could be either `/web/quick` or `/web/ship`, estimate scope:

```
QUICK if ALL true:
  - Single section or component
  - Style direction already exists or is obvious
  - No strategy/research needed
  - Could be done in one shot

SHIP if ANY true:
  - Full page or multi-page site
  - Needs competitive research or SEO planning
  - Requires moodboard / style exploration
  - Multiple asset types needed (images, SVGs, logos)
  - User said "from scratch" or "redesign"
```

### Step 4: Confidence Score and Route

Assign a confidence score (0-100%) to your top routing choice.

**High confidence (80%+)** — Route silently with one-line explanation:

```
Routing to /web/build — hero section with existing style guide locked
```

Then immediately execute.

**Low confidence (<80%)** — Show top 2 options:

```
  85% → /web/quick (single pricing section, style exists)
  60% → /web/ship  (might need strategy if this is a new page)

  Quick if you just want the component. Ship if this is a new page that needs the full treatment.
  [Q]uick / [S]hip
```

Wait for user to pick, then execute.

### Confidence Signals

| Signal | Boosts confidence |
|--------|------------------|
| Exact keyword match ("logo", "hero", "moodboard") | +30% |
| Active pipeline exists + related input | +25% |
| Style guide already locked | +20% |
| Clear scope (single section vs "the whole site") | +20% |
| Ambiguous scope ("make it look good") | -30% |
| Could be strategy OR build | -25% |

### Examples

```
Routing to /web/brief — "what should our homepage look like" needs strategy before building

Routing to /web/design — moodboard request, no style guide locked yet

Routing to /web/build — pricing section with style guide already in .web/

Routing to /web/assets — logo generation request, routing to asset pipeline

Routing to /web/ship --resume — active pipeline at BUILD phase (brief + design done)

Routing to /web/quick — "add a FAQ section" is a single component
```

---

## NO-INPUT BEHAVIOR

If called with no arguments:

1. **Active pipeline exists** → `/web/ship --resume`
2. **Style guide exists but no pipeline** → Ask: "What are we building with this style?"
3. **Nothing in .web/** → Ask: "What are we building?" then route the response

---

## RULES

1. **Never ask which command to use.** That's the whole point — you decide.
2. **Bias toward action.** If ambiguous between "research more" and "just build it", lean toward building.
3. **One routing line, then execute.** Don't explain the full pipeline — just route and go.
4. **Respect active pipelines.** If there's work in progress, default to resuming unless input is clearly unrelated.
5. **Pass the full input through.** Whatever the user said goes to the target command as its $ARGUMENTS.
6. **Respect locked style.** If `.web/style-guide.json` exists, don't re-run design unless user asks to change direction.
