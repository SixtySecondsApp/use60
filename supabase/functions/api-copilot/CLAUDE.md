# API Copilot Edge Function

## Overview

The main AI Copilot backend - a large edge function (~14,200 lines) that powers the conversational AI assistant. Uses Google Gemini Flash with function calling.

## Architecture

### 4-Tool Surface

The copilot exposes exactly 4 tools to the AI model:

| Tool | Purpose | When Used |
|------|---------|-----------|
| `list_skills` | Lists available skills for the organization | When agent needs to discover capabilities |
| `get_skill` | Retrieves a compiled skill document | When agent needs skill instructions |
| `execute_action` | Executes CRM actions and runs skills/sequences | For all data operations |
| `resolve_entity` | Resolves ambiguous person references | First-name-only disambiguation |

### Hierarchical Action Space

`execute_action` supports many sub-actions, keeping the tool surface small:

**Data Retrieval:**
- `get_contact`, `get_lead`, `get_deal`
- `get_pipeline_summary`, `get_pipeline_deals`, `get_pipeline_forecast`
- `get_meetings`, `get_next_meeting`, `get_meetings_for_period`
- `get_contacts_needing_attention`, `get_meeting_count`
- `search_emails`, `list_tasks`

**Writing:**
- `draft_email` - Generates email draft
- `update_crm` - Updates CRM records (requires `confirm: true`)
- `create_task` - Creates tasks (in sequences)

**Skills/Sequences:**
- `run_skill` - Executes a single skill
- `run_sequence` - Executes a multi-step sequence

## V1 Deterministic Router

For core workflows, requests are routed deterministically (bypassing free-form LLM reasoning):

```typescript
// routeToV1Workflow() maps intents to sequences
"prep me for my next meeting" → seq-next-meeting-command-center
"post-meeting follow-up"      → seq-post-meeting-followup-pack
"what follow-ups am I missing"→ seq-followup-zero-inbox
"pipeline focus"              → seq-pipeline-focus-tasks
"catch me up"                 → seq-catch-me-up
```

This ensures consistent, reliable behavior for high-frequency tasks.

## Sequence Execution Flow

1. **Load sequence** from `organization_skills` + `platform_skills`
2. **Validate**: enabled, active, category = 'agent-sequence'
3. **Resolve input mappings** using `${trigger.params.*}` and `${outputs.*}`
4. **Execute steps** in order:
   - Skills: `executeAgentSkillWithContract()`
   - Actions: `executeAction()`
5. **Handle failures**: `on_failure: stop|continue|fallback`
6. **Return** execution result with outputs

## Preview → Confirm Pattern

Write operations use a two-step flow:

### Step 1: Preview (is_simulation: true)
```typescript
execute_action({
  action: 'run_sequence',
  params: {
    sequence_key: 'seq-pipeline-focus-tasks',
    is_simulation: true  // Preview mode
  }
})
```
- Actions with `requires_approval` return previews
- `pending_action` stored in assistant message metadata

### Step 2: Confirm
```typescript
// User says "Confirm" or clicks confirm button
// System detects pending_action and re-executes:
execute_action({
  action: 'run_sequence',
  params: {
    sequence_key: 'seq-pipeline-focus-tasks',
    is_simulation: false,
    confirm: true
  }
})
```

## Confirmable Sequences

Only these sequences support confirmation:
- `seq-pipeline-focus-tasks`
- `seq-next-meeting-command-center`
- `seq-deal-rescue-pack`
- `seq-post-meeting-followup-pack`
- `seq-deal-map-builder`
- `seq-daily-focus-plan`
- `seq-followup-zero-inbox`
- `seq-deal-slippage-guardrails`

## Structured Response Detection

`detectAndStructureResponse()` determines output format:

### Priority Order
1. **Sequence-based** - Sequence key → response type mapping
2. **Tool-based** - Specific tools trigger specific responses
3. **Intent-based** - Keyword patterns in user message

### Sequence → Response Type Mapping
```typescript
const SEQUENCE_RESPONSE_MAP = {
  'seq-pipeline-focus-tasks': 'pipeline_focus_tasks',
  'seq-deal-rescue-pack': 'deal_rescue_pack',
  'seq-next-meeting-command-center': 'next_meeting_command_center',
  'seq-post-meeting-followup-pack': 'post_meeting_followup_pack',
  'seq-deal-map-builder': 'deal_map_builder',
  'seq-daily-focus-plan': 'daily_focus_plan',
  'seq-followup-zero-inbox': 'followup_zero_inbox',
  'seq-deal-slippage-guardrails': 'deal_slippage_guardrails',
  'seq-catch-me-up': 'daily_brief'
};
```

## Key Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `handleChat()` | ~line 339 | Entry point for chat requests |
| `executeToolCall()` | ~line 4577 | Tool call executor |
| `handleResolveEntity()` | ~line 5042 | Entity disambiguation |
| `calculateV1Confidence()` | ~line 8335 | V1 routing confidence scoring |
| `routeToV1Workflow()` | ~line 8386 | Deterministic V1 routing |
| `detectAndStructureResponse()` | ~line 8606 | Response format detection |

## Template Variable Resolution

```typescript
// For simple paths
resolvePath(context, 'outputs.contact.name');

// For array indices
resolvePath(context, 'outputs.leads[0].contact.name');

// For full variable replacement
resolveExpression('${foo}', context);

// For embedded variables
resolveExpression('Hello ${name}!', context);
```

## Common Debugging

### Response Not Structured
Check `detectAndStructureResponse()` - ensure your sequence/tool triggers the right pattern.

### Sequence Not Executing
1. Verify sequence exists in `platform_skills`
2. Check `is_active = true` and `category = 'agent-sequence'`
3. Verify org has skill enabled in `organization_skills`

### Confirmation Not Working
1. Check `pending_action` is stored correctly
2. Verify sequence is in confirmable list
3. Check `is_simulation` flag in execution

### Tool Call Failing
1. Check tool name is one of the 4 allowed
2. Verify action name is valid for `execute_action`
3. Check required parameters are provided

## Performance Notes

- Function is ~14,200 lines - consider splitting for maintainability
- Heavy use of Gemini API - watch for rate limits
- Sequence execution can chain many DB calls - use connection pooling

## Environment Variables

Required secrets:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_GEMINI_API_KEY` - For AI model
- `OPENAI_API_KEY` - Fallback (if configured)

## Related Files

- `supabase/functions/_shared/sequenceExecutor.ts` - Sequence execution engine
- `supabase/functions/_shared/copilot_adapters/executeAction.ts` - Action router
- `supabase/functions/_shared/agentSkillExecutor.ts` - Skill execution
- `src/lib/contexts/CopilotContext.tsx` - Frontend state management


<claude-mem-context>
# Recent Activity

<!-- This section is auto-generated by claude-mem. Edit content outside the tags. -->

*No recent activity*
</claude-mem-context>