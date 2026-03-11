---
name: 60-launch
invoke: /60/launch
description: New project setup — template clone, Railway, auth, secrets, CLAUDE.md generation, Slack war room
---

# /60/launch — Project Infrastructure Setup

**Purpose**: Stand up a new project from scratch — template, Railway, auth, secrets, CLAUDE.md, Slack. Phase 0 of `/60/ship`.

**Input**: $ARGUMENTS

---

## WHEN TO RUN

- Called automatically by `/60/ship` when building a NEW application
- Skipped when adding features to an existing codebase (e.g., use60)
- Can be run standalone: `/60/launch "Acme Billing Portal"`

---

## STEP 1: Project Owner Interview

Before any infrastructure, understand the mission. Ask 3-5 questions, ONE at a time:

1. **"What does this project do in one sentence?"**
   → Becomes the project description everywhere (Railway, Dev Hub, CLAUDE.md)

2. **"Who is the primary user and what's their number one pain?"**
   → Shapes CLAUDE.md "Who we build for" section

3. **"What must this project never become?"**
   → Shapes CLAUDE.md guardrails (like use60's "never a stale task list")

4. **"Any hard constraints?"** (timeline, budget, existing tech, integrations)
   → Informs PLAN phase later

5. **"What does success look like in 30 days?"**
   → Becomes success metrics in CLAUDE.md

Stop when you have enough. Don't ask what you can infer from the project name or context.

---

## STEP 2: Clone Template

```bash
git clone https://github.com/SixtySecondsApp/template-nextjs-full-stack <project-name>
cd <project-name>
npm install
```

If clone fails, ask the user for an alternative repo URL or whether to use the current directory.

Initialize git if not already a repo:
```bash
git init
git add .
git commit -m "chore: initial project from template-nextjs-full-stack"
```

---

## STEP 3: Railway Setup

**Requires**: Railway MCP tools. If unavailable, log warning and provide manual instructions.

### 3a. Create Railway Project

Use Railway MCP to:
1. Create a new project named: `<project-name>` (kebab-case)
2. Set description: the one-liner from Step 1
3. Create environments: `staging` and `production`

### 3b. Create Services

Based on the template (Next.js full-stack):

1. **Web service**: Next.js app
   - Link to GitHub repo (if pushed)
   - Set build command: `npm run build`
   - Set start command: `npm start`

2. **Database** (if needed):
   - Create Postgres instance
   - Store connection string in Railway env vars

### 3c. Store Railway References

Update `.sixty/pipeline.json`:
```json
{
  "infrastructure": {
    "railway": {
      "projectId": "<from Railway MCP>",
      "projectName": "<project-name>",
      "services": ["web", "postgres"],
      "environments": ["staging", "production"]
    }
  }
}
```

If Railway MCP is unavailable:
```
Railway MCP not available. Manual setup needed:
1. Create project at railway.app: <project-name>
2. Add Next.js service linked to your repo
3. Add Postgres if needed
4. Set env vars (listed below)
```

---

## STEP 4: Authentication Setup (Clerk)

### 4a. Collect Clerk Keys

Ask the user:
```
"Do you have Clerk keys ready? I need:
 - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
 - CLERK_SECRET_KEY

Paste them or say 'skip' to add later."
```

### 4b. Store in AI Dev Hub Secrets Manager

If Dev Hub MCP is available:
1. Store both keys in the project's secrets namespace
2. Tag as: `auth`, `clerk`, `production`

### 4c. Create Test User

```
"I'll create a test user for automated testing.
 Suggested: test@<project-name>.dev / TestPass123!

 OK or provide different credentials?"
```

Store test credentials in Dev Hub secrets manager under `test` namespace.

### 4d. Inject to Railway

If Railway MCP is available:
1. Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in Railway env vars
2. Set `CLERK_SECRET_KEY` in Railway env vars
3. Set test credentials in staging environment only

### 4e. Create Local .env.local

Write `.env.local` with all collected keys:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
```

Add `.env.local` to `.gitignore` if not already there.

---

## STEP 5: Collect Additional Secrets

Based on what the project needs (inferred from interview + description):

```
"Based on your project, you might need these services.
 Which do you have keys for? (provide now or add later)

 - Stripe (payments): STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY
 - Resend (email): RESEND_API_KEY
 - OpenAI (AI features): OPENAI_API_KEY
 - Other: tell me what you need"
```

For each provided key:
1. Store in Dev Hub secrets manager (project-scoped)
2. Inject to Railway env vars
3. Add to `.env.local`
4. Note test-mode keys vs production keys

For skipped keys, add to `pipeline.json.infrastructure.secrets.missing[]` so the heartbeat can request them later.

---

## STEP 6: Generate CLAUDE.md

Write a `CLAUDE.md` file at the project root. Keep it under 80 lines. Based on the interview answers:

```markdown
# <Project Name>

<One-sentence description from interview>

## Who We Build For

<Primary user and their pain, from interview>

## What This Must Never Become

<Guardrails from interview>

## Engineering Principles

1. Ship fast, iterate faster.
2. Test credentials stored from day one.
3. Every feature has dev docs and user docs.
4. Heartbeat observations are tickets, not ignored.

## Tech Stack

- **Framework**: Next.js (App Router)
- **Auth**: Clerk
- **Database**: Postgres (Railway)
- **Hosting**: Railway
- **Testing**: Vitest + Playwriter MCP (E2E)

## Critical Rules

### Always
- Read files before editing
- Store secrets in Dev Hub secrets manager, never in code
- Test with stored test credentials, not personal accounts
- Update docs when changing user-facing features

### Never
- Hardcode API keys or secrets
- Skip test creation for new features
- Deploy without staging verification
- Ignore heartbeat HIGH severity observations

## Environments

| Env | Where | Command |
|-----|-------|---------|
| Development | localhost:3000 | `npm run dev` |
| Staging | Railway staging | auto-deploy on push |
| Production | Railway production | manual promote |

## Success Criteria (30 Days)

<From interview>
```

---

## STEP 7: Initialize Pipeline State

Create `.sixty/pipeline.json` with all infrastructure references populated.

Create `.sixty/progress.md`:
```markdown
# Progress Log — <Project Name>

## Codebase Patterns
(Populated during BUILD phase)

---

## Session Log

### <timestamp> — LAUNCH complete
- Template: template-nextjs-full-stack
- Railway: <project-name> (web + postgres)
- Clerk: configured, test user created
- Secrets: N collected, M pending
---
```

---

## STEP 8: Slack War Room

If Slack MCP is available:

1. Post to the appropriate channel (e.g., #dev or #projects):
   ```
   New project launched: <project-name>
   <one-liner description>

   Railway: <link>
   Branch: main
   Team: TBD (assigned during PLAN phase)

   Continuing to DISCOVER phase...
   ```

2. Store the thread timestamp in `pipeline.json.slack.warRoomThreadTs`

If Slack MCP unavailable, log: "Slack not available — updates will be terminal-only."

---

## STEP 9: Output Summary

```
Project launched: <project-name>

  Template: template-nextjs-full-stack
  Railway: <project-name> (2 services)
  Clerk: configured + test user created
  Secrets: N collected, M pending
  CLAUDE.md: generated from interview
  Slack: war room thread created

  Continuing to DISCOVER phase...
```

If called from `/60/ship`, return control to the orchestrator.
If called standalone, suggest: "Run `/60/ship` to continue the pipeline."

---

## ERROR HANDLING

| Error | Action |
|-------|--------|
| Template clone fails | Ask for alternative URL or use current directory |
| Railway MCP unavailable | Print manual setup instructions, continue |
| Clerk keys not provided | Store as missing, remind during BUILD if needed |
| Dev Hub MCP unavailable | Store secrets locally in .env.local only |
| Slack MCP unavailable | Terminal output only, continue |
| npm install fails | Log error, ask user to resolve, continue |
