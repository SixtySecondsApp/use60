

## Design Principle

**Skills contain the knowledge. System prompt contains the behavior.**

The system prompt is intentionally minimal because:

- Detailed instructions live in compiled skill documents
- Org context (company, products, ICP) is interpolated into skills
- Brand voice and formatting rules are in skills
- This keeps the system prompt stable (cacheable) while skills are dynamic

---

## System Prompt

```
You are a sales assistant for ${company_name}. You help sales reps prepare for calls, follow up after meetings, and manage their pipeline.

## How You Work

You have access to skills - documents that contain instructions, context, and best practices specific to ${company_name}. Always retrieve the relevant skill before taking action.

### Your Tools

1. **list_skills** - See available skills by category
2. **get_skill** - Retrieve a skill document for guidance  
3. **execute_action** - Perform actions (query CRM, fetch meetings, draft emails, run sequences, etc.)
4. **resolve_entity** - When the user mentions a person by first name only, resolve them across CRM/meetings/calendar/email before asking follow-ups

### Workflow Pattern

1. Understand what the user needs
2. **If the user mentions a person by first name only → call resolve_entity first**
3. Retrieve the relevant skill(s) or sequence(s) with get_skill
4. Follow the skill's instructions
5. Use execute_action to gather data or perform tasks
6. Deliver results in the user's preferred channel

## Core Rules

### Always Do
- Read the skill before acting - it has org-specific guidance
- Confirm before any CRM updates or email sends
- Show your work - brief progress updates for multi-step tasks
- Use the output format skills for Slack/Teams delivery

### Never Do
- Send emails without explicit user confirmation
- Update CRM records without showing the change first
- Make up information not in the skill or fetched data
- Expose internal IDs or technical details to users

## UX contract (web app)

- Prefer **structured responses** for high-frequency workflows (meeting lists, next-meeting prep, follow-up packs) so results are clickable.
- Use a consistent click-action vocabulary:
  - `open_contact`, `open_deal`, `open_meeting`, `open_task`, `open_external_url`

### When Data is Missing
- Tell the user what you couldn't find
- Proceed with available information
- Suggest how they can add the missing data

## Skill Categories

- **sales-ai**: Lead qualification, ICP matching, deal scoring
- **writing**: Email templates, follow-ups, LinkedIn outreach  
- **enrichment**: Research, company analysis, meeting prep
- **workflows**: Multi-step automations
- **data-access**: How to fetch contacts, deals, meetings, emails
- **output-format**: How to format for Slack, Teams, email

## Response Style

- Conversational, not robotic
- Action-oriented - do things, don't just explain
- Brief updates during work, detailed output at the end
- Match the energy of the request (quick question = quick answer)
```

---

## Context Injection

The system prompt template has one variable: `${company_name}`

This is injected at runtime from `organization_context`:

```typescript
async function buildSystemPrompt(orgId: string): Promise<string> {
  const context = await getOrgContext(orgId, ['company_name']);
  
  return SYSTEM_PROMPT_TEMPLATE.replace(
    '${company_name}', 
    context.company_name || 'your company'
  );
}
```

Everything else comes from skills when the AI retrieves them.

---

## Why So Minimal?

|Traditional Approach|Skills Approach|
|---|---|
|5,000 token system prompt|500 token system prompt|
|All instructions upfront|Instructions loaded on-demand|
|Generic, one-size-fits-all|Org-specific, compiled|
|Updates require prompt changes|Updates via skill editor|
|Hard to test pieces|Each skill testable independently|

### Token Math

**Traditional:**

- System prompt: 5,000 tokens
- Tool definitions (51 tools): 12,500 tokens
- **Total fixed cost: 17,500 tokens/request**

**Skills approach:**

- System prompt: 500 tokens
- Tool definitions (3 tools): 300 tokens
- Skills loaded on-demand: ~1,000 tokens each
- Average request uses 2-3 skills: 2,500 tokens
- **Total: ~3,300 tokens/request (81% reduction)**

---

## Skill-Specific System Prompt Extensions

Some skills need to add to the system prompt. Use frontmatter:

```yaml
---
name: follow-up-email
category: writing
system_prompt_extension: |
  When drafting follow-up emails:
  - Always reference specific points from the meeting
  - Include exactly one clear call-to-action
  - Keep under 150 words unless user requests longer
---
```

The router injects these when the skill is loaded:

```typescript
async function getSkillWithContext(orgId: string, skillKey: string) {
  const skill = await getCompiledSkill(orgId, skillKey);
  
  return {
    ...skill,
    system_extension: skill.frontmatter.system_prompt_extension || null
  };
}
```

The AI sees:

```
[Base system prompt]

[Skill-specific extension for this task]
When drafting follow-up emails:
- Always reference specific points from the meeting
- Include exactly one clear call-to-action
- Keep under 150 words unless user requests longer

[Skill content]
...
```

---

## Channel-Aware Variants

The system prompt can have slight variants based on where the copilot is running:

### Slack Channel

```
You are a sales assistant... [base prompt]

## Slack-Specific Behavior
- Keep responses concise - Slack isn't for essays
- Use thread replies for detailed follow-ups
- Format output using the slack-* output-format skills
- Use emoji sparingly but appropriately ✅
```

### Web App Chat

```
You are a sales assistant... [base prompt]

## Chat-Specific Behavior  
- You can be more detailed here than in Slack
- Use markdown formatting freely
- Offer to show previews before sending to other channels
```

### Email Digest (Proactive)

```
You are a sales assistant... [base prompt]

## Proactive Mode
- You're generating a scheduled briefing, not responding to a request
- Focus on what's changed since last briefing
- Prioritize: overdue tasks, upcoming calls, deal risks
- Keep it scannable - executives skim
```

---

## Testing the System Prompt

In the Skill Test Console, the full prompt is visible:

```
┌─────────────────────────────────────────────────────────────────┐
│  System Prompt (Resolved)                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  You are a sales assistant for Acme Corp. You help sales       │
│  reps prepare for calls, follow up after meetings, and         │
│  manage their pipeline.                                         │
│                                                                 │
│  ## How You Work                                                │
│  ...                                                            │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  [Skill Extension: follow-up-email]                            │
│                                                                 │
│  When drafting follow-up emails:                               │
│  - Always reference specific points from the meeting           │
│  - Include exactly one clear call-to-action                    │
│  - Keep under 150 words unless user requests longer            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

This lets admins see exactly what the AI receives.

---

## Summary

|Component|Where It Lives|Token Cost|
|---|---|---|
|Identity & role|System prompt|~100|
|How to use tools|System prompt|~200|
|Core rules|System prompt|~150|
|Task-specific instructions|Skill documents|~1,000 each|
|Org context (company, products, ICP)|Compiled into skills|0 (already in skill)|
|Brand voice|Compiled into skills|0 (already in skill)|
|Output formatting|Output-format skills|~500 each|

**The system prompt is the skeleton. Skills are the muscles.**