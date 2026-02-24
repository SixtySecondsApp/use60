# Progress Log — Enrichment Column @Mention for Column References

## Codebase Patterns

- AddColumnModal uses a plain `<textarea>` for enrichment prompts — now with @mention dropdown
- Enrichment engine in `enrich-dynamic-table/index.ts` dumps all row data as JSON + inserts prompt
- Column keys are snake_case (e.g. `company_name`, `first_name`)
- @mention regex: `/@([a-z][a-z0-9_]*)/g` — matches keys starting with lowercase letter

---

## Session Log

### 2026-02-04 — MENTION-001 ✅
**Story**: Pass existing columns from DynamicTableDetailPage to AddColumnModal
**Files**: src/components/dynamic-tables/AddColumnModal.tsx, src/pages/DynamicTableDetailPage.tsx
**Gates**: lint ✅ (0 new warnings) | typecheck: skipped (non-final)
**Learnings**: Prop is optional with default `[]` so modal works standalone

---

### 2026-02-04 — MENTION-003 ✅
**Story**: Resolve @column_key references in enrichment prompts per row
**Files**: supabase/functions/enrich-dynamic-table/index.ts
**Gates**: N/A (Deno edge function, not linted by frontend ESLint)
**Learnings**: `resolveColumnMentions()` function added before the prompt-building loop. Uses `rowContext[key] ?? 'N/A'` fallback.

---

### 2026-02-04 — MENTION-002 ✅
**Story**: Build @mention autocomplete dropdown in enrichment prompt textarea
**Files**: src/components/dynamic-tables/AddColumnModal.tsx
**Gates**: lint ✅ (0 new warnings) | typecheck: skipped (non-final)
**Learnings**:
- Used `onMouseDown` with `e.preventDefault()` on dropdown items to prevent textarea blur
- Dropdown positioned absolutely below textarea with `mt-1`
- Keyboard: ArrowUp/Down cycle through options, Enter selects, Escape dismisses
- `requestAnimationFrame` used to restore cursor position after inserting mention
- Templates updated with @column_key syntax (e.g. `@company_name`, `@title`)
- Added `AtSign` icon from lucide-react for dropdown items and hint text

---

## Feature Complete ✅

All 3 stories implemented. Summary of changes:

1. **AddColumnModal** — New `existingColumns` prop, @mention dropdown with keyboard nav, updated templates
2. **DynamicTableDetailPage** — Passes `columns.map(c => ({ key: c.key, label: c.label }))` to modal
3. **enrich-dynamic-table/index.ts** — `resolveColumnMentions()` replaces `@key` with row values before sending to Claude
