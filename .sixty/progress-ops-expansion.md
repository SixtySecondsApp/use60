# Ops Expansion — Progress Tracker

**Plan**: `.sixty/plan-ops-expansion.json`
**Consult**: `.sixty/consult/ops-expansion.md`
**Branch**: `feat/dynamic-tables`
**Stories**: 27 total | 16 complete | 0 in progress

---

## Phase 0: Stabilize Core
- [x] OPS-001 — Batch limits and checkpointing for enrichment
- [x] OPS-002 — Server-side filtering and sorting
- [x] OPS-003 — Rate limiting and concurrency control

## Phase 1: New Column Types
- [x] OPS-004 — Dropdown and tags columns
- [x] OPS-005 — Phone and checkbox columns
- [x] OPS-006 — Formula columns (schema + evaluator)
- [x] OPS-007 — Formula columns (UI + recalc)

## Phase 2: Integration Columns
- [x] OPS-008 — Integration column schema + shared infra
- [x] OPS-009 — Reoon email verification
- [x] OPS-010 — Apify actor runner
- [x] OPS-011 — Integration bulk retry + progress UI

## Phase 3: Action Columns & CRM Push
- [x] OPS-012 — Action button column type
- [x] OPS-013 — HubSpot push field mapping modal
- [x] OPS-014 — HubSpot push edge function
- [x] OPS-015 — Per-row CRM status column
- [x] OPS-016 — Re-enrich action

## Phase 4: HubSpot Pull
- [ ] OPS-017 — Connection check + list browser
- [ ] OPS-018 — Field mapping + column creation
- [ ] OPS-019 — Batch import edge function
- [ ] OPS-020 — Incremental sync

## Phase 5: Cross-Op Import
- [ ] OPS-021 — Source table selector + filter builder
- [ ] OPS-022 — Deep copy edge function

## Phase 6: Simple Rule Builder
- [ ] OPS-023 — Rules schema + evaluation engine
- [ ] OPS-024 — Trigger hooks (enrichment, cell update, row create)
- [ ] OPS-025 — Rule builder UI + execution log

## Phase 7: Views Enhancement
- [ ] OPS-026 — Conditional formatting
- [ ] OPS-027 — Column reordering (drag-drop)
