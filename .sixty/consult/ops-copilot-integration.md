# Consult Report: Ops ↔ Copilot Full Integration
Generated: 2026-02-11

## User Request
"Can we connect the Ops feature fully with Copilot and add the features to the skills so the skills know what tools in the app to use"

## Decision
Full build — all actions, all skills, all response types in one pass.

---

## Current State

### Copilot's 4-Tool Architecture
- `resolve_entity` — Resolve ambiguous person references
- `list_skills` — List available skills
- `get_skill` — Get skill document
- `execute_action` — Execute CRM/data actions (27 sub-actions)

### Existing Ops Actions (only 2)
1. `search_leads_create_table` — Create table from Apollo search
2. `enrich_table_column` — Start enrichment on a column

### Existing Ops UI Actions (in AssistantShell.tsx)
- `open_dynamic_table` — Navigate to ops table
- `add_enrichment` — Navigate to ops table with enrich action
- `push_to_instantly` — Navigate to ops table with push action

### Existing Response Component
- `OpsTableResponse` — Shows table creation results

---

## Ops Feature Inventory (What Exists)

### 74 Components in src/components/ops/
- Table CRUD, column management, row editing
- 6 import wizards (CSV, HubSpot, Attio, Apollo, Cross-Ops, Apify)
- AI features: query, transform, dedup, insights, recipes
- Rules & automation: conditional rules, workflow builder
- Integration sync: HubSpot, Attio, Instantly (push/pull/history)
- Views: save/load/filter/sort/group

### 20+ Edge Functions
- `copilot-dynamic-table` — AI table creation
- `enrich-dynamic-table` — AI enrichment engine
- `ops-table-ai-query` — NL queries
- `ops-table-transform-column` — Bulk transforms
- `ops-table-cross-query` — Cross-table queries
- `ops-table-predictions` — ML scoring
- `ops-table-insights-engine` — AI analytics
- `ops-table-workflow-engine` — Multi-step workflows
- `ops-workflow-orchestrator` — NL workflow builder
- `evaluate-ops-rule` — Rule evaluation
- `sync-hubspot-ops-table` — HubSpot sync
- `sync-attio-ops-table` — Attio sync
- `sync-instantly-engagement` — Instantly metrics
- `push-to-instantly` — Campaign push
- `import-from-ops-table` — Cross-table import

### Key Hooks
- `useEnrichment` — Job management + polling
- `useOpsTableSearch` — Apollo search → table creation
- `useOpsRules` — CRUD for automation rules
- `useActionExecution` — Button action execution
- `useHubSpotSync` — HubSpot bidirectional sync
- `useAttioSync` — Attio sync
- `useInstantlyPush` / `useInstantlySync` — Instantly integration
- `useWorkflowOrchestrator` — AI workflow builder

### Database Tables
- `dynamic_tables` — Table metadata
- `dynamic_table_rows` — Row storage
- `dynamic_table_cells` — Cell values (row_id, column_id, value)
- `dynamic_table_columns` — Column definitions
- `dynamic_table_views` — Saved views
- `enrichment_jobs` — Enrichment job tracking
- `ops_rules` — Automation rules
- `ops_table_workflows` — Multi-step workflows
- `ops_table_insights` — AI insights
- `conditional_formatting_rules` — Cell formatting

---

## Implementation Plan

### Layer 1: Backend — New execute_action Sub-Actions

Add to `ExecuteActionName` in `copilot_adapters/types.ts` and implement handlers in `executeAction.ts`.

#### Table CRUD
- `list_ops_tables` — List tables for org (name, row_count, source_type, enrichment status)
- `get_ops_table` — Get table details (columns, row_count, enrichment stats)
- `create_ops_table` — Create empty table with optional columns
- `delete_ops_table` — Delete table (with confirmation param)

#### Column & Row Management
- `add_ops_column` — Add column to table (type, name, config)
- `get_ops_table_data` — Get rows with optional filtering/sorting/pagination
- `add_ops_rows` — Insert rows with cell values
- `update_ops_cell` — Update a single cell value

#### AI Features
- `ai_query_ops_table` — Natural language query (calls ops-table-ai-query)
- `ai_transform_ops_column` — Bulk AI transform (calls ops-table-transform-column)
- `get_enrichment_status` — Get enrichment job progress

#### Rules & Automation
- `create_ops_rule` — Create automation rule
- `list_ops_rules` — List rules for a table

#### Integration Sync
- `sync_ops_hubspot` — Push/pull HubSpot (calls sync-hubspot-ops-table)
- `sync_ops_attio` — Push/pull Attio (calls sync-attio-ops-table)
- `push_ops_to_instantly` — Push to Instantly campaign (calls push-to-instantly)

#### Insights
- `get_ops_insights` — Get AI insights (calls ops-table-insights-engine)

### Layer 2: Skills

#### Atomic Skills (skills/atomic/)

1. **ops-table-manager** — Table CRUD + column management
   - triggers: "create an ops table", "list my ops tables", "add a column", "show my tables"
   - requires_capabilities: [crm, ops_tables]
   - actions: list_ops_tables, get_ops_table, create_ops_table, add_ops_column

2. **ops-data-manager** — Row operations + data viewing
   - triggers: "add leads to my table", "show table data", "update cell"
   - requires_capabilities: [ops_tables]
   - actions: get_ops_table_data, add_ops_rows, update_ops_cell

3. **ops-enrichment-manager** — Enrichment lifecycle
   - triggers: "enrich this column", "check enrichment status", "how's my enrichment going"
   - requires_capabilities: [ops_tables, enrichment]
   - actions: enrich_table_column, get_enrichment_status

4. **ops-ai-analyst** — AI queries + insights
   - triggers: "query my ops table", "find leads where", "show insights", "analyze my table"
   - requires_capabilities: [ops_tables, web_search]
   - actions: ai_query_ops_table, get_ops_insights

5. **ops-ai-transform** — Bulk AI transformations
   - triggers: "transform column", "generate values for", "fill in column"
   - requires_capabilities: [ops_tables]
   - actions: ai_transform_ops_column

6. **ops-integration-sync** — HubSpot/Attio/Instantly sync
   - triggers: "sync with hubspot", "push to attio", "send to instantly", "sync my table"
   - requires_capabilities: [ops_tables, crm]
   - actions: sync_ops_hubspot, sync_ops_attio, push_ops_to_instantly

7. **ops-automation-builder** — Rules + workflows
   - triggers: "create a rule", "automate my table", "when a cell changes", "set up automation"
   - requires_capabilities: [ops_tables]
   - actions: create_ops_rule, list_ops_rules

#### Sequences (skills/sequences/)

8. **seq-ops-prospect-pipeline** — Full prospecting workflow
   - Search Apollo → Create table → Add enrichment columns → Start enrichment → Push to Instantly
   - workflow: [search_leads_create_table, add_ops_column, enrich_table_column, push_ops_to_instantly]

9. **seq-ops-hubspot-enrich-sync** — HubSpot round-trip
   - Import HubSpot list → Enrich with AI → Push back to HubSpot
   - workflow: [create_ops_table (from HubSpot), enrich_table_column, sync_ops_hubspot]

10. **seq-ops-table-from-scratch** — Build table from description
    - Create table → Add columns → AI populate → Enrich
    - workflow: [create_ops_table, add_ops_column (multiple), ai_transform_ops_column, enrich_table_column]

### Layer 3: Response Components + UI Actions

- Extend `OpsTableResponse` to handle table lists, data previews
- Add `OpsEnrichmentStatusResponse` for enrichment progress display
- Add `OpsInsightsResponse` for AI insights display
- Register new UI actions in AssistantShell.tsx:
  - `open_ops_rule_builder` — Navigate to rule builder
  - `open_ops_workflow` — Navigate to workflow builder
  - `open_ops_ai_query` — Open AI query bar

### Layer 4: Agent Classification

Update `agentClassifier.ts` and `agentDefinitions.ts`:
- Add all new actions to the "Prospecting" agent's `allowedActions`
- Update agent descriptions to mention ops table capabilities

---

## Patterns to Follow

### execute_action handler pattern (from executeAction.ts)
```typescript
case 'list_ops_tables': {
  const { data, error } = await client
    .from('dynamic_tables')
    .select('id, name, description, source_type, row_count, created_at, updated_at')
    .eq('organization_id', orgId)
    .order('updated_at', { ascending: false })
    .limit(params.limit ?? 20);
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}
```

### Skill frontmatter pattern
```yaml
name: "Ops Table Manager"
description: "Create, list, view, and manage ops tables. Add columns, rename tables, and organize your prospecting data."
metadata:
  category: "data-access"
  skill_type: "atomic"
  is_active: true
  triggers:
    - pattern: "create.*ops.*table|new.*table|make.*table"
      intent: "create_ops_table"
      confidence: 0.8
  keywords: ["ops", "table", "create", "columns", "prospecting"]
inputs:
  - name: table_name
    type: string
    description: "Name for the new table"
    required: false
outputs:
  - name: table
    type: object
    description: "The ops table details"
requires_capabilities:
  - ops_tables
  - crm
```

### Structured response detection (structuredResponseDetector.ts)
```typescript
// After ops table listing
if (action === 'list_ops_tables' && result.success) {
  return {
    type: 'ops_table_list',
    summary: `Found ${result.data.length} ops tables.`,
    data: { tables: result.data },
    actions: result.data.map(t => ({
      id: `open_table_${t.id}`,
      label: t.name,
      type: 'secondary',
      callback: 'open_dynamic_table',
      params: { table_id: t.id }
    }))
  };
}
```

---

## Risks

| Severity | Risk | Mitigation |
|---|---|---|
| High | New actions could bypass RLS | Use user-scoped client for ALL new action handlers |
| High | Heavy ops (enrichment, sync) could timeout copilot | Start async jobs, return job ID, skills check status |
| Medium | 17 new actions expand attack surface | Validate all params, use org_id scoping |
| Medium | Skills need org compilation | Follow existing sync-skills pipeline |
| Low | Response components for new types | Start with text summaries, add rich UI incrementally |

---

## File Inventory (Files to Create/Modify)

### Modify
1. `supabase/functions/_shared/copilot_adapters/types.ts` — Add 17 new ExecuteActionName entries
2. `supabase/functions/_shared/copilot_adapters/executeAction.ts` — Add 17 action handlers
3. `supabase/functions/_shared/agentDefinitions.ts` — Add new actions to Prospecting agent
4. `supabase/functions/_shared/agentClassifier.ts` — Add new actions to classification
5. `supabase/functions/_shared/structuredResponseDetector.ts` — Add response detection for new actions
6. `src/components/copilot/CopilotResponse.tsx` — Register new response types
7. `src/components/assistant/AssistantShell.tsx` — Add new UI action handlers

### Create
8-14. `skills/atomic/ops-table-manager/SKILL.md` (+ 6 more atomic skills)
15-17. `skills/sequences/seq-ops-prospect-pipeline/SKILL.md` (+ 2 more sequences)
18-19. `src/components/copilot/responses/OpsEnrichmentStatusResponse.tsx` (+ OpsInsightsResponse.tsx)
