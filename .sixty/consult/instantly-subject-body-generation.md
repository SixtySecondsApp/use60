# Consult Report: Instantly Email Subject & Body Generation
Generated: 2026-02-07

## User Request
"For the Instantly Subject and Body columns, I need to create these with Formulas or AI prompts."

## Clarifications
- Q: How should subject/body columns generate content?
- A: **Both options** — user picks formula OR enrichment per column

- Q: Should push-to-instantly auto-detect subject/body columns?
- A: **Yes, auto-detect & push** as custom_variables per lead

---

## Analysis Findings

### Current State

The Instantly wizard's `author_steps` mode creates plain `text` columns for subject/body:
```
instantly_step_1_subject → columnType: 'text', isEnrichment: false
instantly_step_1_body    → columnType: 'text', isEnrichment: false
```

These are dumb text inputs. No formula evaluation. No AI generation. And `push-to-instantly` doesn't read them.

### Existing Infrastructure

| System | Ready? | What It Does |
|--------|--------|-------------|
| **Formula columns** | Yes | `@first_name & ", quick q about " & @company_name` → deterministic templates |
| **Enrichment columns** | Yes | AI prompt with `@column_key` refs → per-row AI generation |
| **push-to-instantly** | Partial | Pushes email + standard fields + `custom_variables` per lead |
| **Instantly API** | Yes | Supports `{{variable_name}}` in campaign email templates |

### The Integration Path

Instantly's email templates support **liquid-style variables**: `{{subject}}`, `{{email_body}}`, etc.

When pushing leads, we send:
```json
{
  "email": "jane@acme.com",
  "first_name": "Jane",
  "custom_variables": {
    "email_subject": "Hey Jane, saw Acme Corp is expanding",
    "email_body": "I noticed your team is growing..."
  }
}
```

The campaign template references `{{email_subject}}` and `{{email_body}}`.

---

## Recommended Architecture

### Change 1: Wizard creates formula/enrichment columns instead of text

Instead of creating plain `text` columns, the wizard should let the user choose:
- **Formula** → creates `column_type: 'formula'` with editable `formula_expression`
- **AI Prompt** → creates `column_type: 'enrichment'` with editable `enrichment_prompt`

The wizard's Step 3 gets a new sub-step: "How should email content be generated?"

### Change 2: push-to-instantly reads step columns as custom_variables

When pushing leads, `push-to-instantly` should:
1. Look at the campaign_config column's `sequence_mode`
2. If `author_steps`, find all sibling `sequence_step` columns (or step_N_subject/body columns)
3. Read their cell values per row
4. Send as `custom_variables` alongside standard fields

### Change 3: Step columns get `integration_config` with step metadata

Instead of plain text columns, step columns should be:
```typescript
{
  key: 'instantly_step_1_subject',
  label: 'Step 1 Subject',
  columnType: 'formula',  // or 'enrichment'
  formulaExpression: '"Hey " & @first_name & ", quick question"',
  // OR
  isEnrichment: true,
  enrichmentPrompt: 'Write a cold email subject for @first_name at @company_name...',
  integrationConfig: {
    instantly_subtype: 'sequence_step',
    step_config: { step_number: 1, field: 'subject' }
  }
}
```

This way:
- The column is a first-class formula or enrichment column (existing eval infrastructure works)
- The `integration_config` tags it as an Instantly step column (push function can find it)
- Users can edit the formula/prompt later via existing column menus

---

## Execution Plan

### Story 1: INSGEN-001 — Wizard Step 3: Content Generation Mode Picker
- In `InstantlyColumnWizard.tsx`, add a sub-step after step count selection
- User picks per-step: "Formula template" or "AI prompt"
- Formula mode: show expression input with `@column_key` autocomplete
- AI mode: show prompt textarea with `@column_key` reference helper
- Default formula template: `"Hey " & @first_name & ", ..."`
- Default AI prompt: `"Write a personalized cold email subject for @first_name at @company_name..."`

### Story 2: INSGEN-002 — Create Step Columns as Formula/Enrichment
- Change `handleFinish()` to create step columns with proper `columnType`
- Formula steps: `columnType: 'formula'`, `formulaExpression: userExpression`
- AI steps: `columnType: 'enrichment'`, `isEnrichment: true`, `enrichmentPrompt: userPrompt`
- Both: include `integrationConfig: { instantly_subtype: 'sequence_step', step_config: {...} }`
- Ensure CHECK constraint allows these types (formula/enrichment already allowed)

### Story 3: INSGEN-003 — Auto-Evaluate on Column Creation
- In `OpsDetailPage.tsx` `addColumnMutation.onSuccess`:
  - For formula step columns: auto-call `evaluate-formula` edge function
  - For enrichment step columns: auto-call `enrich-dynamic-table` edge function
- Existing auto-run logic already handles enrichment columns; wire formula columns similarly

### Story 4: INSGEN-004 — push-to-instantly Reads Step Columns
- In `push-to-instantly/index.ts`:
  - After building lead from field_mapping, check for step columns
  - Query `dynamic_table_columns` for columns with `integration_config->>'instantly_subtype' = 'sequence_step'` matching the same table
  - Read cell values for those columns per row
  - Map to `custom_variables`: `{ "step_1_subject": value, "step_1_body": value, ... }`
- Include these in the lead payload sent to Instantly bulk API

### Story 5: INSGEN-005 — Cell Rendering for Step Columns
- Update `OpsTableCell.tsx` to render formula/enrichment step columns properly
- Show the generated value (not a text input)
- Include re-run button (recalc formula / re-enrich)
- Show confidence badge for AI-generated content
- Show pending/loading state during evaluation

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Column type CHECK constraint | Low | `formula` and `enrichment` already in the CHECK |
| push-to-instantly timeout with many step columns | Low | Step column data is already in cells; just an extra query |
| AI enrichment cost for large tables | Medium | Existing batch/resume system handles this; add cost estimate UI |
| Instantly variable naming conflicts | Low | Use predictable names: `step_1_subject`, `step_1_body` |

## Files Affected

- `src/components/ops/InstantlyColumnWizard.tsx` — Main changes (Steps 1-2)
- `supabase/functions/push-to-instantly/index.ts` — Step 4
- `src/pages/OpsDetailPage.tsx` — Step 3 (auto-eval wiring)
- `src/components/ops/OpsTableCell.tsx` — Step 5 (minor rendering)
