---
name: 60-consult
invoke: /60-consult
description: AI-Powered Requirements Discovery — asks 3-10 clarifying questions, deploys sub-agents, then auto-chains into plan/prd and run
---

# 60/consult — AI-Powered Requirements Discovery

**Purpose**: Gather requirements through intelligent conversation while sub-agents explore the codebase in parallel. Synthesize findings, then AUTOMATICALLY chain into planning and execution. No manual steps between stages.

---

## CRITICAL: AUTO-CHAIN RULES

**YOU MUST FOLLOW THESE RULES. THEY ARE NOT OPTIONAL.**

1. After presenting findings, you MUST use AskUserQuestion to ask: "Proceed with 60/plan or 60/prd?"
2. After the user answers, you MUST immediately invoke the Skill tool to run the chosen skill. DO NOT just tell the user to run it themselves.
3. The chosen skill (plan or prd) MUST then automatically invoke `/60-run` when it completes. DO NOT suggest the user run it — YOU run it.
4. **NEVER end with "you can now run..." or "next steps: run..."** — YOU run the next step automatically.
5. The full pipeline is: `consult → (plan OR prd) → run`. All three execute in one session with zero manual handoff.

---

## Cross-Platform Compatibility

- Works on **Windows**, **macOS**, and **Linux**
- All file paths use forward slashes (`/`)
- Shell commands run via Claude's Bash tool (bash on all platforms, including Windows)
- Uses Claude's built-in tools (Glob, Grep, Read, Edit) which are OS-agnostic
- No OS-specific commands

---

## Step 0: Model Profile Selection (FIRST STEP)

**Before anything else**, ask the user to select a model profile. This determines which models are used for all sub-agents throughout the entire chain (consult → plan/prd → run).

[Uses AskUserQuestion tool:]

Question: "Select your model profile for this session. This applies to the entire pipeline (consult → plan → run):"
Options:
  - Economy — Fastest, lowest cost. Haiku scouts, Sonnet implementation. Best for simple features.
  - Balanced (Recommended) — Good speed & quality. Haiku scouts, Sonnet analysis & implementation. Best for most work.
  - Thorough — Maximum quality. Sonnet scouts, Opus analysis & implementation. Best for critical/complex features.

Skip with `--profile <name>`.

### Model Assignments by Profile

| Agent Role | Economy | Balanced | Thorough |
|------------|---------|----------|----------|
| Leader/Orchestrator | Sonnet | Opus | Opus |
| Codebase Scout | Haiku | Sonnet | Opus |
| Patterns Analyst | Haiku | Sonnet | Opus |
| Risk Scanner | Haiku | Sonnet | Opus |
| Scope Sizer | Haiku | Sonnet | Opus |

**This profile is passed to all downstream skills in the chain.** When 60/plan or 60/run is auto-invoked, they inherit this profile and do NOT re-prompt.

---

## Phase 1: Initial Discovery (3-10 Questions, MINIMUM 3)

The orchestrator asks a MINIMUM of 3 clarifying questions and up to 10. Questions must cover requirements AND proactively suggest improvements.

### Question Strategy — 4 Mandatory Categories

#### 1. Core Requirements (at least 1-2 questions)
- What exactly does the user want?
- What are the key user flows?

#### 2. Logic & Clarity Challenges (at least 1 question)
- Question assumptions in the request
- Identify ambiguities or contradictions
- Challenge vague requirements ("what do you mean by 'fast'?")
- Ask about edge cases ("what happens when X fails?")

#### 3. Nice-to-Have Suggestions (at least 1 question)
- Proactively suggest related features the user may not have considered
- Example: If user says "add a new page", ask about navigation, SEO, loading states, empty states, error states
- Example: If user says "add user profiles", suggest avatar uploads, activity feeds, privacy settings
- Frame as: "Would you also like to include [suggestion]? This is commonly paired with [feature] because [reason]."

#### 4. Best Practices & Recommendations (at least 1 question)
- Suggest industry best practices relevant to the request
- Recommend accessibility considerations
- Suggest performance optimizations
- Recommend security measures if applicable

### Question Rules

- Ask ONE question at a time
- **MINIMUM 3 questions, MAXIMUM 10 questions — this is mandatory**
- Always ask at least one "nice-to-have" suggestion question
- Always challenge at least one assumption or ask about edge cases
- Never ask about technical implementation details (agents figure that out)
- If the request is simple, still ask 3 questions minimum (use extras for suggestions and best practices)

### Example Question Flow

```
USER: 60/consult "Add a new settings page"

Q1 (Core): What settings should be configurable on this page?
USER: Profile info and notification preferences

Q2 (Logic): Should changes save automatically or require a "Save" button?
USER: Save button

Q3 (Nice-to-have): Settings pages commonly include avatar upload,
   email change with verification, and "delete account". Include any?
USER: Avatar upload and delete account

Q4 (Best Practice): For delete account, best practice requires typing
   "DELETE" to confirm plus a 30-day grace period. Include this?
USER: Yes

Q5 (Edge case): For avatar uploads — enforce size/format limits?
   I'd recommend max 5MB, JPEG/PNG only, initials as fallback.
USER: Yes, sounds good

ORCHESTRATOR: Got enough context. Running analysis agents...
```

---

## Phase 2: Sub-Agent Execution

Four specialized agents analyze the codebase in parallel.

### Agent 1: CODEBASE SCOUT
Map existing code relevant to the request — components, hooks, models, APIs.

### Agent 2: PATTERNS ANALYST
Identify coding conventions the implementation must follow — state management, component patterns, error handling, testing.

### Agent 3: RISK SCANNER
Identify risks, blockers, and gotchas — schema changes, security, dependencies.

### Agent 4: SCOPE SIZER
Estimate effort and break into right-sized stories with dependency mapping.

---

## Phase 3: Synthesis

Compare all agent outputs. Resolve conflicts. Build recommendation.

| Conflict Type | Resolution |
|---------------|------------|
| Story count differs | Go with higher count (safer) |
| Estimate differs >50% | Use pessimistic estimate |
| Different patterns found | Pick most recent or ask user |
| Risk severity differs | Go with higher severity |

---

## Phase 4: Present Findings

Present a summary with: codebase findings, risks, recommended stories, estimates.

---

## Phase 5: AUTO-CHAIN (MANDATORY — DO NOT SKIP)

**Immediately after presenting findings**, you MUST do the following:

### Step 1: Ask plan or prd

Use AskUserQuestion:

Question: "How would you like to proceed?"
Options:
  - 60/plan (Recommended) — Generate execution plan with stories and start building immediately
  - 60/prd — Generate a full Product Requirements Document first, then plan and build

### Step 2: Invoke the chosen skill

**DO NOT tell the user to run the command. YOU invoke it using the Skill tool.**

If user chose 60/plan:
- Invoke `/60-plan` via the Skill tool with all consult context
- Pass the selected model profile so 60/plan does NOT re-prompt
- 60/plan generates `.sixty/plan.json`
- 60/plan MUST then invoke `/60-run` automatically

If user chose 60/prd:
- Invoke `/60-prd` via the Skill tool with all consult context
- 60/prd generates PRD documents
- 60/prd MUST then invoke `/60-plan`, which MUST then invoke `/60-run`

### What MUST NOT happen

- DO NOT end with "Next steps: run /60-plan" — that defeats the purpose
- DO NOT end with "You're ready to run..." — YOU run it
- DO NOT present the plan and stop — you continue to execution
- DO NOT ask "would you like me to proceed?" after the plan/prd choice — just do it

**The user invokes `/60-consult` ONCE and the entire pipeline runs automatically until stories are being executed by `/60-run`.**

---

## Output Files

### `.sixty/consult/[feature].md`

Full analysis report saved for reference with: user request, Q&A, agent findings, synthesis, recommendation, and which downstream skill was auto-invoked.

---

## Flags Reference

| Flag | Description |
|------|-------------|
| `--quick` | Skip sub-agents, just Q&A (faster, less thorough) |
| `--deep` | Run additional agents: security audit, performance analysis |
| `--agents` | Show raw agent outputs (for debugging) |
| `--file <path>` | Load requirements from file instead of prompt |
| `--profile <name>` | Use specific model profile (economy, balanced, thorough) |
