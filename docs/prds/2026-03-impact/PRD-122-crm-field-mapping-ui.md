# PRD-122: CRM Field Mapping & Auto-Update Configuration

**Priority:** Tier 2 — High-Impact Quick Win
**Current Score:** 3 (ALPHA) — auto-update pipeline works, configuration is hardcoded
**Target Score:** 4 (BETA)
**Estimated Effort:** 8-10 hours
**Dependencies:** None

---

## Problem

CRM auto-update is one of 60's most valuable features — `agent-crm-update` (605 lines) extracts fields from meeting transcripts, classifies confidence, and routes high-confidence fields to auto-apply while flagging approval-required fields for HITL. `crm-writeback-worker` (706 lines) handles async writes with retry logic.

But the configuration is hardcoded:
1. **No field mapping UI** — which transcript fields map to which CRM fields is determined in code
2. **No approval threshold configuration** — what confidence level triggers auto-apply vs approval is fixed
3. **No audit trail UI** — `crm-writeback-worker` logs mutations but nothing displays them
4. **No field-level toggle** — can't say "auto-update notes but always approve stage changes"
5. **`CRMFieldMappingSettings.tsx` exists** but needs verification of completeness

## Goal

A configuration page where admins set per-field auto-update rules (auto/approve/never), confidence thresholds, and view an audit trail of all CRM mutations.

## Success Criteria

- [ ] CRM field mapping settings page with per-field configuration
- [ ] Three modes per field: auto-apply, require approval, never update
- [ ] Confidence threshold slider per field (above threshold = auto, below = approve)
- [ ] Audit trail showing all CRM mutations with before/after values
- [ ] Undo capability for recent auto-applied changes
- [ ] Preview mode: show what would be updated without actually writing

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| CRM-CFG-001 | Extend CRMFieldMappingSettings page with per-field mode selector | frontend | 2h | — |
| CRM-CFG-002 | Add confidence threshold slider per field | frontend | 1.5h | CRM-CFG-001 |
| CRM-CFG-003 | Build CRM mutation audit trail view | frontend | 2h | — |
| CRM-CFG-004 | Add undo capability for recent auto-applied changes | frontend + backend | 2h | CRM-CFG-003 |
| CRM-CFG-005 | Create preview mode showing proposed updates | frontend + backend | 1.5h | — |
| CRM-CFG-006 | Store field mapping config in crm_field_rules table | backend | 1.5h | — |

## Technical Notes

- `agent-crm-update` (605 lines) has the extraction + classification pipeline — read field mappings from config
- `crm-writeback-worker` (706 lines) does async writes — already logs mutations, needs a query endpoint
- `CRMFieldMappingSettings.tsx` exists in settings — extend with per-field controls
- Current auto-apply fields: notes, next_steps, activity_log, stakeholders (high confidence)
- Current approval-required fields: stage, close_date, value (any confidence)
- `crm_field_rules` table: org_id, crm_field, mode (auto/approve/never), confidence_threshold (0-100), updated_by
- Audit trail: query `crm-writeback-worker` mutation logs — need RPC for paginated retrieval
- Undo: store previous values in mutation log, create `undo-crm-mutation` edge function that reverts
- Preview mode: run extraction pipeline but return results without writing — `dry_run` parameter
