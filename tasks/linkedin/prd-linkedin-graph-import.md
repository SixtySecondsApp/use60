---
name: linkedin-graph-import
overview: Add a manual LinkedIn archive import flow plus a personal relationship overlay that scores trust from uploaded connections and message history without mutating the shared org-wide graph. Reuse the existing relationship health/warmth foundations and the current CSV import/upload patterns where possible.
todos:
  - id: inspect-linkedin-archive-format
    content: Verify supported LinkedIn archive file shapes for connections and message exports before implementing parser logic
    status: pending
  - id: design-user-scoped-schema
    content: Design import tables and user-scoped trust score schema without mutating shared relationship graph tables
    status: pending
  - id: plan-import-wizard
    content: Reuse CSV import patterns to design a LinkedIn archive upload and review wizard
    status: pending
  - id: plan-trust-scoring
    content: Define v1 personal trust scoring rules for inbound-only vs bidirectional conversations
    status: pending
  - id: plan-ui-overlay
    content: Identify relationship graph/contact UI surfaces to show personal LinkedIn trust overlay
    status: pending
isProject: false
---

# LinkedIn Archive Import And Personal Trust Overlay

## Goal

Build a guided import that lets a user export their own LinkedIn archive, upload the archive or extracted files into `use60`, and see a personal relationship-strength overlay in the relationship graph. The imported data should remain user-scoped and must not mutate the shared org relationship graph.

## Product Shape

Use a two-part experience:

- A help guide in-app showing exactly how to export LinkedIn data manually.
- A multi-step import flow that accepts LinkedIn archive files, parses connections plus message history, and computes user-scoped trust signals.

Relationship trust should follow simple v1 rules:

- Connection with no messages: weak connection.
- Only inbound messages from the contact: likely cold / low-trust.
- Two-way exchange: trusted contact.
- More back-and-forth plus recency: stronger trust.

## Existing Foundations To Reuse

- Relationship graph and warmth foundation already exists in [supabase/migrations/20260223000100_contact_graph_schema.sql](/Users/admin/Documents/sixty-sales-dashboard/supabase/migrations/20260223000100_contact_graph_schema.sql), [supabase/migrations/20260303100001_contact_warmth_schema.sql](/Users/admin/Documents/sixty-sales-dashboard/supabase/migrations/20260303100001_contact_warmth_schema.sql), and [supabase/migrations/20260303100002_get_contact_graph_data_rpc.sql](/Users/admin/Documents/sixty-sales-dashboard/supabase/migrations/20260303100002_get_contact_graph_data_rpc.sql).
- Live UI surfaces already exist in [src/components/relationship-health/RelationshipHealthWidget.tsx](/Users/admin/Documents/sixty-sales-dashboard/src/components/relationship-health/RelationshipHealthWidget.tsx), [src/components/contacts/ContactRelationshipCard.tsx](/Users/admin/Documents/sixty-sales-dashboard/src/components/contacts/ContactRelationshipCard.tsx), and the contact/company pages fed by [src/lib/hooks/useContactCompanyGraph.ts](/Users/admin/Documents/sixty-sales-dashboard/src/lib/hooks/useContactCompanyGraph.ts).
- The best import UX pattern to copy is [src/components/ops/CSVImportOpsTableWizard.tsx](/Users/admin/Documents/sixty-sales-dashboard/src/components/ops/CSVImportOpsTableWizard.tsx) with persistence primitives from [src/lib/services/opsTableService.ts](/Users/admin/Documents/sixty-sales-dashboard/src/lib/services/opsTableService.ts).

## Implementation Plan

### 1. Add A User-Facing Export Guide

Create a lightweight guide panel/page linked from the import flow.

- Explain how to request a LinkedIn archive and which files to upload.
- List supported inputs for v1: `Connections.csv` and message export files if present.
- Set expectations clearly: manual upload only, no live LinkedIn API sync.

Likely files:

- New guide component/page near relationship graph settings or contacts area.
- Potentially reuse settings/help patterns already in app.

### 2. Create User-Scoped Import Schema

Add new tables for archive imports and parsed trust signals that are scoped to the importing user, not the org graph.

Recommended schema additions:

- `linkedin_archive_imports`
- `linkedin_import_contacts`
- `linkedin_import_messages`
- `linkedin_import_relationship_scores`

Model them by `user_id` plus `organization_id`, but keep scoring reads user-scoped. Do not write into `contact_graph`, `contact_warmth_scores`, or shared graph positions in v1.

### 3. Build The Archive Parsing Pipeline

Add a parser that can accept manually uploaded LinkedIn export files.

- Parse `Connections.csv` into normalized imported contacts.
- Parse message export files if present.
- Preserve raw payload metadata for debugging.
- Make the import idempotent per user/import run.

Recommended approach:

- Reuse the client-side wizard pattern from [src/components/ops/CSVImportOpsTableWizard.tsx](/Users/admin/Documents/sixty-sales-dashboard/src/components/ops/CSVImportOpsTableWizard.tsx).
- Add a dedicated backend import handler patterned after existing import-router handlers if server-side normalization is cleaner.

### 4. Derive Personal Trust Signals

Compute a simple transparent trust model from imported messages.

Initial scoring model:

- `isConnection`: base score
- `hasInboundOnlyMessages`: penalize to low trust / probable spam
- `hasBidirectionalMessages`: promote to trusted
- `messageCount`, `threadCount`, `lastMessageAt`, `firstConnectedAt`: strengthen or decay score

Output fields to store:

- `relationship_strength`
- `trust_tier` (`cold`, `known`, `trusted`, `strong`)
- `spam_likelihood` or `inbound_only_flag`
- counts for inbound, outbound, bidirectional threads, and recency

### 5. Match Imported People To Existing CRM Contacts

Add a user-scoped matching layer to connect imported LinkedIn people to existing CRM contacts when possible.

- Match via LinkedIn profile URL first.
- Fall back to name + company heuristics.
- Keep uncertain matches unresolved for manual review.

This gives the overlay a bridge into the existing contact views without contaminating shared graph data.

### 6. Expose The Personal Overlay In The Relationship UI

Augment the existing relationship graph/contact relationship surfaces with a user-only overlay.

- Show personal trust indicators on matched contacts.
- Show “cold spammer” / “trusted contact” style labels backed by the import score.
- Make it visually clear that this is `Your LinkedIn relationship signal`, not org-wide truth.

Best integration targets:

- [src/components/contacts/ContactRelationshipCard.tsx](/Users/admin/Documents/sixty-sales-dashboard/src/components/contacts/ContactRelationshipCard.tsx)
- [src/pages/contacts/components/ContactRightPanel.tsx](/Users/admin/Documents/sixty-sales-dashboard/src/pages/contacts/components/ContactRightPanel.tsx)
- [src/lib/hooks/useContactCompanyGraph.ts](/Users/admin/Documents/sixty-sales-dashboard/src/lib/hooks/useContactCompanyGraph.ts)

### 7. Add An Import Review Surface

After import, show:

- imported contact count
- matched CRM contacts count
- unmatched contacts needing review
- cold/inbound-only contacts
- trusted bidirectional contacts

This gives the feature an immediate “aha” moment and helps validate the parser/scoring.

### 8. Guardrails And Messaging

Keep the product wording precise:

- “Upload your LinkedIn archive”
- “Personal relationship overlay”
- “Imported from your manual LinkedIn export”

Avoid wording that suggests a live official LinkedIn sync.

## Suggested File Touch Points

- Relationship graph data and UI:
  - [src/lib/hooks/useContactCompanyGraph.ts](/Users/admin/Documents/sixty-sales-dashboard/src/lib/hooks/useContactCompanyGraph.ts)
  - [src/components/contacts/ContactRelationshipCard.tsx](/Users/admin/Documents/sixty-sales-dashboard/src/components/contacts/ContactRelationshipCard.tsx)
  - [src/pages/contacts/components/ContactRightPanel.tsx](/Users/admin/Documents/sixty-sales-dashboard/src/pages/contacts/components/ContactRightPanel.tsx)
- Import UX patterns to copy:
  - [src/components/ops/CSVImportOpsTableWizard.tsx](/Users/admin/Documents/sixty-sales-dashboard/src/components/ops/CSVImportOpsTableWizard.tsx)
  - [src/lib/services/opsTableService.ts](/Users/admin/Documents/sixty-sales-dashboard/src/lib/services/opsTableService.ts)
- Graph backend references to avoid mutating directly:
  - [supabase/migrations/20260223000100_contact_graph_schema.sql](/Users/admin/Documents/sixty-sales-dashboard/supabase/migrations/20260223000100_contact_graph_schema.sql)
  - [supabase/migrations/20260303100001_contact_warmth_schema.sql](/Users/admin/Documents/sixty-sales-dashboard/supabase/migrations/20260303100001_contact_warmth_schema.sql)
  - [supabase/functions/agent-relationship-graph/index.ts](/Users/admin/Documents/sixty-sales-dashboard/supabase/functions/agent-relationship-graph/index.ts)

## Execution Order

1. Define import schema and user-scoped score model.
2. Build the export guide plus upload wizard.
3. Implement parsers for connections and message files.
4. Add CRM contact matching.
5. Compute trust tiers and store results.
6. Surface the overlay in contact/relationship UI.
7. Add review/reporting screen for imported results.
8. Validate with sample LinkedIn archives and add tests for scoring edge cases.

## Notes On Scope

Keep v1 deliberately narrow:

- Manual upload only.
- Personal overlay only.
- No writes into org-wide `contact_graph` or shared warmth tables.
- No promises about every LinkedIn archive containing the same message structure.

If v1 succeeds, v2 can add approval-based promotion of selected trusted signals into the shared graph.