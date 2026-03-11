# PRD-102: Feature Catalogue Deduplication

**Priority:** Tier 1 — Ship Blocker
**Current Score:** Mixed (multiple features at score 1 overlap with score 3-4 features)
**Target Score:** Clean catalogue with accurate counts
**Estimated Effort:** 4-6 hours
**Dependencies:** PRD-101 (Command Centre must be consolidated first)

---

## Problem

7 features in the catalogue are duplicates or overlaps that inflate the feature count and confuse positioning:

| Duplicate | Overlaps With | Resolution |
|-----------|--------------|------------|
| `command-centre` (score 1) | `CCDetailPanel`, `CCItemCard` components (score 4 when wired) | Merge into single CC feature after PRD-101 |
| `email-action-centre` (score 1) | `command-centre` email filter view | Remove — CC with email filter replaces this |
| `agent-fleet` (score 1) | `fleet-orchestrator` (score 4) | Remove — fleet-orchestrator IS the agent fleet |
| `slack-copilot` (score 1) | `slack-conversational-copilot` (score 4) | Remove — same feature, different names |
| `competitive-intel` (score 1) | `competitive-intel-agent` (score 3) | Merge — one feature with agent + UI |
| `crm-writeback` (score 2) | `crm-auto-update` (score 4) | Merge — CRM writeback IS the auto-update feature |
| `semantic-search` (score 1) | `meeting-analytics-v2` search + `smart-search` (score 4) | Remove — search exists in two better places |

## Goal

Reduce catalogue from 88 to 81 accurate, non-overlapping features. Every feature is distinct and independently valuable.

## Success Criteria

- [ ] 7 duplicate features removed or merged in `feature_list.html`
- [ ] Feature count updated: 88 → 81
- [ ] `architecture-diagram.html` updated if any referenced features change
- [ ] No orphaned feature references in demo pages or settings

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| DEDUP-001 | Remove 5 duplicate features from feature_list.html | docs | 2h | PRD-101 done |
| DEDUP-002 | Merge 2 overlapping features (competitive-intel, crm-writeback) | docs | 1h | — |
| DEDUP-003 | Update stats (header, footer, hero) to 81 features | docs | 30m | DEDUP-001, DEDUP-002 |
| DEDUP-004 | Audit demo pages for orphaned feature references | frontend | 1h | DEDUP-001 |
| DEDUP-005 | Update architecture diagram if needed | docs | 1h | DEDUP-001 |

## What Gets Removed

Features removed from catalogue (code stays, just not marketed as separate features):
- `command-centre` → merged into consolidated CC (PRD-101)
- `email-action-centre` → subsumed by CC email filter
- `agent-fleet` → infrastructure detail, not user-facing feature
- `slack-copilot` → replaced by `slack-conversational-copilot`
- `semantic-search` → exists within `smart-search` and `meeting-analytics-v2`
- `competitive-intel` → merged into `competitive-intel-agent`
- `crm-writeback` → merged into `crm-auto-update`
