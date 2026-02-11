# Skill Patterns Reference

These patterns represent common approaches that work well across different skill categories. Choose the pattern that best fits your use case, then adapt the template.

## Choosing Your Approach

Think about whether your skill is **problem-first** or **tool-first**:

- **Problem-first**: "I need to set up a project workspace" → Your skill orchestrates the right calls in the right sequence. Users describe outcomes; the skill handles the tools.
- **Tool-first**: "I have Notion MCP connected" → Your skill teaches Claude the optimal workflows and best practices. Users have access; the skill provides expertise.

Most skills lean one direction. Knowing which helps you pick the right pattern.

---

## Pattern 1: Sequential Workflow Orchestration

**Use when:** Users need multi-step processes in a specific order.

**Template:**

```markdown
# Workflow: [Name]

## Step 1: [Action]
Call MCP tool: `tool_name`
Parameters: [list key params]
Validation: [what to check before proceeding]

## Step 2: [Action]  
Call MCP tool: `tool_name`
Wait for: [dependency from Step 1]
Parameters: [list key params, reference Step 1 outputs]

## Step 3: [Action]
Call MCP tool: `tool_name`
Parameters: [list key params]

## Step 4: [Confirmation]
Verify all steps completed.
Summary: [what to show the user]
```

**Key techniques:**
- Explicit step ordering with dependencies
- Validation at each stage before proceeding
- Rollback instructions for failures ("If Step 3 fails, undo Step 2 by...")
- Clear output at each step so the user can follow along

**Real-world example:** Customer onboarding — create account → setup payment → create subscription → send welcome email.

---

## Pattern 2: Multi-MCP Coordination

**Use when:** Workflows span multiple services (e.g., Figma + Drive + Linear + Slack).

**Template:**

```markdown
# Multi-Service Workflow: [Name]

## Phase 1: [Source Service] (via [MCP Name])
1. [Fetch/export from source]
2. [Transform or validate data]
3. [Prepare for next phase]

Validation: Confirm [data/assets] are ready before Phase 2.

## Phase 2: [Destination Service] (via [MCP Name])
1. [Create/upload to destination]
2. [Apply metadata or configuration]
3. [Generate references for Phase 3]

Validation: Confirm [items] created successfully.

## Phase 3: [Coordination Service] (via [MCP Name])
1. [Create tasks/tickets/notifications]
2. [Link references from Phase 1-2]
3. [Assign to people]

## Phase 4: [Notification Service] (via [MCP Name])
1. [Post summary to team channel]
2. [Include all relevant links]
```

**Key techniques:**
- Clear phase separation with named services
- Data passing between phases (outputs of Phase 1 feed into Phase 2)
- Validation gates before moving to next phase
- Centralized error handling ("If any phase fails, post error summary to Slack")

**Real-world example:** Design handoff — export from Figma → upload assets to Drive → create Linear tasks → notify team in Slack.

---

## Pattern 3: Iterative Refinement

**Use when:** Output quality improves with iteration (reports, designs, content).

**Template:**

```markdown
# Iterative [Output Type] Creation

## Initial Draft
1. [Gather inputs/data]
2. Generate first draft
3. Save to working file

## Quality Check
Run validation against these criteria:
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]

If using a script: `python scripts/check_quality.py --input {file}`

## Refinement Loop
For each issue found:
1. Address the specific issue
2. Regenerate affected section
3. Re-validate
4. Continue until all criteria pass OR 3 iterations max

## Finalization
1. Apply final formatting
2. Generate executive summary
3. Save final version
```

**Key techniques:**
- Explicit quality criteria (not "make it good" but specific checkable items)
- Iteration cap to prevent infinite loops (usually 3 rounds)
- Validation scripts for deterministic checks
- Clear "done" conditions

**Real-world example:** Report generation — draft report → validate data accuracy → check formatting → refine weak sections → finalize.

---

## Pattern 4: Context-Aware Tool Selection

**Use when:** The same goal can be achieved different ways depending on context.

**Template:**

```markdown
# Smart [Action]: Context-Based Approach

## Decision Tree
Evaluate these conditions:
1. [Condition A] → Use [Approach 1]
2. [Condition B] → Use [Approach 2]
3. [Condition C] → Use [Approach 3]
4. Default → Use [Fallback Approach]

## Approach 1: [Name]
When: [specific condition]
Steps: [numbered steps]
Tools: [which MCP/built-in tools]

## Approach 2: [Name]
When: [specific condition]
Steps: [numbered steps]
Tools: [which MCP/built-in tools]

## Approach 3: [Name]
When: [specific condition]
Steps: [numbered steps]
Tools: [which MCP/built-in tools]

## After Execution
Explain to the user why this approach was chosen.
```

**Key techniques:**
- Clear decision criteria (not ambiguous)
- Fallback options for edge cases
- Transparency about choices (tell the user why)
- Each approach is self-contained

**Real-world example:** File storage — large files go to cloud storage, collaborative docs go to Notion, code goes to GitHub, temp files stay local.

---

## Pattern 5: Domain-Specific Intelligence

**Use when:** Your skill adds specialized knowledge beyond what tool access provides.

**Template:**

```markdown
# [Domain] Expert: [Workflow Name]

## Pre-Check (Domain Rules)
Before taking action, apply these domain rules:
1. [Rule 1 with rationale]
2. [Rule 2 with rationale]  
3. [Rule 3 with rationale]

If any rule fails:
- [Specific handling per rule]
- [Escalation path if needed]

## Execution
IF pre-check passed:
1. [Primary action steps]
2. [Apply domain-specific best practices]
3. [Complete workflow]

ELSE:
1. [Alternative path]
2. [Flag for review]

## Documentation
- Log all decisions and rationale
- Record any exceptions or edge cases
- Generate audit trail if required
```

**Key techniques:**
- Domain expertise embedded as decision logic, not just instructions
- Compliance/validation before action (not after)
- Comprehensive audit trail
- Clear governance and escalation paths

**Real-world example:** Payment processing with compliance — check sanctions lists → verify jurisdiction → assess risk → process or flag for review → generate audit report.

---

## Combining Patterns

Many real skills combine multiple patterns. For example:

- **Sequential + Domain Intelligence**: An onboarding workflow that includes compliance checks at specific steps
- **Multi-MCP + Iterative Refinement**: Cross-service data sync that validates and retries until consistent
- **Context-Aware + Sequential**: A deployment skill that chooses AWS/GCP/Azure based on the project, then follows a provider-specific sequence

When combining, keep each pattern's section clearly separated so instructions don't blur together.
