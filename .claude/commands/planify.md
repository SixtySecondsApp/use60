---
requires-profile: true
---

# Planify: Transform Markdown to Structured Plan

---

## STEP 0: Select Model Profile

Before proceeding, ask the user to select which model profile to use:
- **Economy** — Fastest, lowest cost
- **Balanced** — Good balance of speed & accuracy
- **Thorough** — Most accurate, highest cost

Use the `AskUserQuestion` tool with these options.

**Note**: Based on selection, appropriate models will be assigned:
- Economy: Simple plans, straightforward documentation
- Balanced: Complex projects, multi-phase transformations
- Thorough: Large-scale strategic planning, deep analysis

---

Transform any markdown document into a structured implementation plan with phases, tasks, and status tracking.

## Input
- `$ARGUMENTS` - Path to the markdown file to transform (e.g., `@feature-spec.md` or full path)

## Transformation Rules

### 1. Analyze the Source Document
- Identify logical groupings of work (these become phases)
- Extract individual action items (these become tasks)
- Preserve technical details (schemas, code snippets, formulas)
- Note dependencies between sections

### 2. Create Phase Structure
For each major section or logical grouping:

```markdown
## Phase N: [Phase Name]
**Status:** `NOT STARTED`

[One-line description of what this phase accomplishes]

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| N.1 | [Task description] | `NOT STARTED` | [Context/details] |
| N.2 | [Task description] | `NOT STARTED` | [Context/details] |
```

### 3. Status Values
Use these status indicators consistently:
- `NOT STARTED` - Work has not begun
- `IN PROGRESS` - Currently being worked on
- `BLOCKED` - Waiting on dependency or decision
- `COMPLETE` - Finished and verified
- `DEFERRED` - Postponed to future iteration

### 4. Preserve Technical Content
Keep all:
- Code snippets and schemas
- Formulas and calculations
- Architecture diagrams
- API specifications
- Configuration examples

Place these under the relevant phase as subsections.

### 5. Add Implementation Metadata

#### At the top of the document:
```markdown
# [Project Name] Implementation Plan

> [One-line summary of the goal]

## Current State Summary
[Brief overview of what exists today and what gap this addresses]
```

#### At the bottom of the document:
```markdown
## Implementation Order
[Show recommended sequence with dependencies]

## Success Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| [metric] | [target] | [how measured] |

## Architecture Diagram (if applicable)
[ASCII or mermaid diagram showing system flow]
```

### 6. Phase Ordering Guidelines
- Foundation/data layers first
- Core functionality second
- Integration/visibility third
- Automation/optimization fourth
- Documentation last

## Output
- Overwrite the source file with the structured plan
- Maintain the same filename
- All phases start as `NOT STARTED`
- All tasks start as `NOT STARTED`

## Example Transformation

**Before:**
```markdown
We need to add user notifications. First create the table,
then add the service layer. Also need Slack integration and
email sending. Should track read/unread status.
```

**After:**
```markdown
## Phase 1: Database Layer
**Status:** `NOT STARTED`

Create notification storage with read tracking.

### Tasks
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.1 | Create `notifications` table | `NOT STARTED` | Include read_at timestamp |
| 1.2 | Add indexes for user lookup | `NOT STARTED` | user_id + created_at |

## Phase 2: Service Layer
**Status:** `NOT STARTED`

Build notification CRUD and delivery logic.

### Tasks
| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.1 | Create `notificationService.ts` | `NOT STARTED` | CRUD + mark read |
| 2.2 | Add Slack delivery | `NOT STARTED` | Use existing Slack client |
| 2.3 | Add email delivery | `NOT STARTED` | Template-based emails |
```
