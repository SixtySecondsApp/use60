---
name: 60-housekeeping
invoke: /60/housekeeping
description: Proactive cleanup — archive orphans, docs audit, code scan, maintenance proposals, Dev Bot queue
---

# /60/housekeeping — Proactive Cleanup, Docs Audit, Maintenance Queue

**Purpose**: Archive orphaned files, scan for missing documentation, propose maintenance tickets, feed Dev Bot queue. Phase 7 of `/60/ship`. Also runs standalone as a proactive agent.

**Input**: $ARGUMENTS

---

## OVERVIEW

Housekeeping is more than cleanup — it's a proactive agent that leaves the codebase better than it found it. Every run identifies gaps, proposes improvements, and queues work for Dev Bot to handle overnight.

```
CLEANUP — archive orphaned .sixty/ files
  |
  v
DOCS AUDIT — scan for missing, stale, or incorrect documentation
  |
  v
CODE SCAN — dead code, TODOs, missing patterns
  |
  v
PROPOSALS — create tickets for everything found
  |
  v
QUEUE — feed Dev Bot for overnight execution
  |
  v
REPORT — summary of what was cleaned + what's queued
```

---

## STEP 1: Archive Orphaned Files

### 1a. Scan .sixty/ Directory

List all files in `.sixty/`. For each file:
- Is it referenced by an active `pipeline.json`? → Keep
- Is it part of the standard structure (pipeline.json, progress.md, config.json)? → Keep
- Is it in `.sixty/runs/<slug>/`? → Keep (organized)
- Otherwise → Candidate for archiving

### 1b. Archive Old Files

```bash
mkdir -p .sixty/archive/$(date +%Y-%m-%d)-cleanup/
```

Move orphaned files to the archive:
- Old `PHASE_*.md` files
- Old `*_SUMMARY.md`, `*_COMPLETE.md` files
- Old `*_PLAN.json` files
- Anything not linked to current pipeline

Log what was moved:
```
Archived 47 orphaned files from .sixty/:
  .sixty/archive/2026-03-07-cleanup/
    PHASE_6_COMPLETION_REPORT.md
    PHASE_7_INDEX.md
    EMAIL_STANDARDIZATION_STATUS.md
    ... (44 more)
```

### 1c. Organize Active Files

Ensure the directory structure matches the standard:
```
.sixty/
  pipeline.json          # Active pipeline state
  config.json            # Project config
  progress.md            # Execution log
  runs/                  # Per-run artifacts
    <runSlug>/
      prd.md             # PRD for this run
      transcript.md      # Extracted transcript notes (if applicable)
      consult.md         # Discovery report
  archive/               # Archived runs + cleanups
    YYYY-MM-DD-<slug>/
```

Move any `tasks/prd-*.md` files into their corresponding `.sixty/runs/<slug>/` directories.

---

## STEP 2: Documentation Audit

### 2a. Feature Inventory

Scan the codebase to build an inventory of features:
- Routes / pages in `src/app/` or `src/pages/`
- Edge functions in `supabase/functions/`
- Major components in `src/components/`
- Services in `src/lib/services/`
- Database tables from migrations

### 2b. Documentation Inventory

Scan for existing docs:
- `docs/` directory (developer docs)
- `docs/user/` directory (user-facing docs)
- `docs/api/` (API docs)
- `docs/integrations/` (integration docs)
- README files
- JSDoc / inline documentation

### 2c. Cross-Reference

For each feature, check:

```
Feature: Meeting Prep
  Code: src/features/meeting-prep/ (exists)
  Dev docs: docs/features/meeting-prep.md (exists)
  User docs: docs/user/meeting-prep.md (MISSING)
  Visibility: external (customer-facing)
  Status: NEEDS USER DOCS

Feature: Copilot Agent
  Code: src/features/copilot/ (exists)
  Dev docs: docs/copilot/agent.md (exists)
  User docs: docs/user/copilot.md (MISSING)
  Visibility: unreleased
  Status: PREPARE DRAFT USER DOCS

Feature: Email Branding
  Code: src/features/email/ (exists)
  Dev docs: docs/EMAIL_BRANDING_GUIDE.md (exists but STALE)
  User docs: none
  Visibility: internal
  Status: UPDATE DEV DOCS (references old template system)
```

### 2d. Stale Documentation Check

For each doc file, check if the code it references still exists:
- Does the component/function/table still exist?
- Has the API surface changed since the doc was written?
- Are code examples still valid?

Flag stale docs:
```
Stale documentation found:
  docs/EMAIL_BRANDING_GUIDE.md — references EmailTemplateV1 (deleted in commit abc123)
  docs/integrations/clerk-setup.md — references deprecated Clerk v4 API
```

---

## STEP 3: Code Quality Scan

Quick scan for maintenance opportunities (don't fix, just flag):

### Dead Code
- Unused imports (from lint output)
- Exported functions/types with no importers
- Unreachable code paths

### TODOs and FIXMEs
```bash
grep -rn "TODO\|FIXME\|HACK\|XXX" src/ supabase/ --include="*.ts" --include="*.tsx"
```

### Missing Patterns
- Components without error boundaries
- API endpoints without rate limiting
- Database queries without pagination
- Forms without loading/error states
- Tables without empty states

### Security Quick Check
- Any hardcoded keys or secrets
- Missing RLS policies on tables
- CORS misconfigurations
- Unvalidated user input

---

## STEP 4: Generate Proposals

For each finding, create a proposal:

### Proposal Format
```json
{
  "title": "Add user docs for Meeting Prep feature",
  "description": "Meeting Prep is customer-facing (external) but has no user documentation. Users need a guide explaining how to use meeting prep, talking points, and risk assessment features.",
  "type": "documentation|code-quality|security|feature-gap",
  "severity": "high|medium|low",
  "effort": "tier-1|tier-2|tier-3",
  "estimatedMinutes": 20,
  "category": "documentation",
  "assignable_to_dev_bot": true
}
```

### Severity Rules

**HIGH** (create immediately):
- Security issues (hardcoded keys, missing RLS)
- External features with no user docs
- Stale docs that could mislead users

**MEDIUM** (daily digest):
- Missing patterns (no loading states, no empty states)
- Performance concerns (no pagination)
- Internal features missing dev docs

**LOW** (backlog):
- Code style issues
- Dead code cleanup
- TODO resolution
- Nice-to-have improvements

---

## STEP 5: Create Dev Hub Tickets

If Dev Hub MCP is available:

### 5a. Create Maintenance Parent Ticket

```
Title: Maintenance: <date> Housekeeping Proposals
Description:
  Automated housekeeping scan found N items across:
  - X documentation gaps
  - Y code quality issues
  - Z security concerns

  Items are ranked by severity. Dev Bot can handle Tier 1-2 items.
```

### 5b. Create Subtasks

For each proposal:
- Title: Human-readable description
- Priority: from severity
- Tag: `maintenance`, `automated`, category

### 5c. Route to Dev Bot

For proposals marked `assignable_to_dev_bot: true` (Tier 1-2):
1. Assign to Dev Bot in Dev Hub
2. Dev Bot will pick up overnight
3. Each becomes a mini `/60/ship` pipeline (Tier 1)
4. PRs submitted for morning review

---

## STEP 6: Slack Notification

If Slack MCP available:

### Immediate (HIGH severity)
```
Housekeeping found a HIGH severity issue:

  Missing RLS policy on `invoices` table
  Any authenticated user can read all invoices across orgs.

  Ticket: TSK-0620
  Effort: Tier 1 (~15 min)

  > Assign to Dev Bot now?
  > I'll handle it later
```

### Digest (MEDIUM + LOW)
```
Housekeeping report — March 7, 2026

  Cleaned up: 47 orphaned files archived

  Proposals created: 8
    HIGH:  1 (missing RLS — assigned to Dev Bot)
    MEDIUM: 3 (missing docs, no pagination, no empty states)
    LOW:   4 (dead code, TODOs, code style)

  Dev Bot queue: 5 items (estimated 2h overnight work)

  Documentation gaps:
    3 external features missing user docs
    2 dev docs are stale
    1 unreleased feature needs DRAFT docs

  Full report: .sixty/housekeeping/2026-03-07.md
```

---

## STEP 7: Save Report

Write to `.sixty/housekeeping/<date>.md`:

```markdown
# Housekeeping Report — <date>

## Files Archived
- 47 files moved to .sixty/archive/<date>-cleanup/

## Documentation Audit
| Feature | Visibility | Dev Docs | User Docs | Status |
|---------|-----------|----------|-----------|--------|
| Meeting Prep | external | exists | MISSING | needs user docs |
| Copilot | unreleased | exists | MISSING | prepare DRAFT |
| Email Branding | internal | STALE | n/a | update dev docs |

## Code Quality
- 3 TODOs found
- 2 unused exports
- 1 component missing error boundary

## Security
- 1 missing RLS policy (HIGH)

## Proposals Created
| Ticket | Title | Severity | Dev Bot |
|--------|-------|----------|---------|
| TSK-0620 | Add RLS to invoices | HIGH | assigned |
| TSK-0621 | User docs for Meeting Prep | MEDIUM | queued |
| ... | ... | ... | ... |
```

---

## STEP 8: Output Summary

```
Housekeeping complete

  Archived: 47 orphaned files
  Docs audit: 3 gaps found, 2 stale docs flagged
  Code scan: 6 improvement opportunities
  Proposals: 8 tickets created in Dev Hub
  Dev Bot: 5 items queued for overnight execution

  Full report: .sixty/housekeeping/2026-03-07.md
```

---

## STANDALONE USAGE

Run outside of `/60/ship` for proactive maintenance:

```bash
/60/housekeeping              # Full scan + proposals
/60/housekeeping --docs-only  # Just documentation audit
/60/housekeeping --cleanup    # Just file archival
/60/housekeeping --propose    # Just create proposals (no cleanup)
```

---

## PROACTIVE AGENT BEHAVIOR

Housekeeping should be run:
1. **Automatically** after every `/60/ship` pipeline completes
2. **On schedule** — morning brief includes housekeeping highlights
3. **On demand** — team member asks in Slack "anything need cleaning up?"
4. **Before new pipelines** — `/60/ship` runs a quick cleanup before DISCOVER

The goal: every run leaves the codebase better than it found it. Documentation is always current. Dead code doesn't accumulate. Security gaps are caught and fixed overnight.

---

## ERROR HANDLING

| Error | Action |
|-------|--------|
| .sixty/ doesn't exist | Create it, nothing to archive |
| Dev Hub MCP unavailable | Log proposals to local file only |
| Slack MCP unavailable | Terminal output only |
| Large number of orphans (100+) | Ask user before bulk archiving |
| Stale doc references deleted code | Flag for removal, not auto-delete |
