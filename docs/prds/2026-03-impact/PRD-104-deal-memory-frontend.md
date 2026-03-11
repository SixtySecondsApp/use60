# PRD-104: Deal Memory Frontend

**Priority:** Tier 2 — High-Impact Quick Win
**Current Score:** 3 (ALPHA) — backend complete, no frontend surface
**Target Score:** 4 (BETA)
**Estimated Effort:** 10-12 hours
**Dependencies:** None (backend is complete)

---

## Problem

Deal Memory is 60's most unique feature — no competitor maintains relationship memory across meetings. The backend is complete:
- `memory-commitment-tracker` extracts commitments with decay scoring
- `memory-snapshot-generator` consolidates timelines
- `_shared/memory/` has 10 modules (writer, reader, ragClient, snapshot, commitments, contacts, reps, decay, types, taxonomy)
- 4 DB tables store the knowledge graph
- RAG context injection feeds follow-up emails

But there's **no way for users to see this data**. The AI knows the full relationship history, but the user can't browse, search, or verify it. This undermines the "trust building" dimension — users need to see what the AI remembers.

## Goal

Surface deal memory in the deal sheet and contact profile so users can see commitments, objections, competitor mentions, and relationship trajectory.

## Success Criteria

- [ ] "Memory" tab in DealDetailsModal showing timeline of extracted events
- [ ] Event types visually distinguished: commitments, objections, competitors, stakeholders, sentiment, decisions
- [ ] Commitment tracker with status (open/fulfilled/expired) and decay indicator
- [ ] Contact profile card showing cross-deal interaction history
- [ ] "What 60 knows" summary card — one-glance relationship context
- [ ] User can flag incorrect memories for correction

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| MEM-001 | Create DealMemoryTab component for DealDetailsModal | frontend | 3h | — |
| MEM-002 | Build event timeline with type-specific icons and colours | frontend | 2h | MEM-001 |
| MEM-003 | Add commitment tracker panel (open/fulfilled/expired + decay) | frontend | 2h | MEM-001 |
| MEM-004 | Create ContactMemoryCard for contact profile page | frontend | 2h | — |
| MEM-005 | Build "What 60 knows" summary card (relationship context at a glance) | frontend | 1h | MEM-001 |
| MEM-006 | Add "Flag incorrect" action on memory events | frontend + backend | 1h | MEM-002 |
| MEM-007 | Create RPC to query deal memory events with pagination | backend | 1h | — |

## Technical Notes

- `deal_memory_events` table has: `deal_id`, `contact_id`, `event_type`, `content`, `confidence`, `source_meeting_id`, `created_at`
- `deal_memory_snapshots` table has consolidated timelines
- `_shared/memory/reader.ts` already has query functions — just need an RPC wrapper
- Event types from `_shared/memory/taxonomy.ts`: commitment, objection, competitor_mention, stakeholder_identified, sentiment_shift, decision_made
- Decay scoring from `_shared/memory/decay.ts` — commitments decay from 1.0 to 0.0 over configurable window

## Design Direction

- Memory tab sits alongside existing tabs in DealDetailsModal (Overview, Activity, Files, etc.)
- Timeline view similar to Activity feed but with colour-coded event type badges
- Commitment tracker: card layout with progress bar showing decay (green → amber → red)
- "What 60 knows" card: 3-4 sentence AI-generated summary of the relationship, shown at top of deal sheet
