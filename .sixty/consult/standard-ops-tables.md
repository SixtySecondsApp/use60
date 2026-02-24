# Consult Report: Standard Ops Tables
Generated: 2026-02-15

## User Request
"In ops can we have standard ops tables for: Leads, Meetings, All Contacts, All Companies. This makes ops a powerful database that works with your CRM to keep the CRM records enriched and usable with the AI copilot."

## Clarifications (5 Questions)

### Q1: Provisioning
**Q:** When should these standard tables be created?
**A:** Both — auto-create on first Ops visit + template gallery for re-creation if deleted.

### Q2: Data Source
**Q:** Should tables pull from app data or CRM?
**A:** Hybrid — app data (Supabase contacts, meetings, companies) + CRM (HubSpot/Attio) sync.

### Q3: Schema Flexibility
**Q:** Fixed or customizable schemas?
**A:** Fixed + extensible — core columns are locked (can't delete name/email), but users can add custom columns on top.

### Q4: Copilot & Automations
**Q:** How should copilot treat these tables, and should they ship with automations?
**A:** Canonical + pre-wired — copilot always knows these tables exist and can query them. Ships with 2-3 default automations per table.

### Q5: Sync Cadence
**Q:** Real-time, scheduled, or manual sync from CRM?
**A:** Real-time webhooks from CRM.

## Agent Findings

### Codebase Scout
- **Existing**: Full ops table CRUD (`opsTableService.ts`), HubSpot webhook handler, Attio webhook handler, bidirectional HubSpot sync, automation rules engine, view templates library, enrichment templates
- **Missing**: Table template system, system/locked columns, org auto-provisioning, copilot table awareness, default automation rules, conflict resolution for hybrid sync
- **Key insight**: The infrastructure is ~70% built — the gap is templates, canonical awareness, and column locking

### Risk Scanner
- **7 blockers identified**: No system column lock, no org provisioning service, copilot can't discover tables, no rule templates, hybrid conflict resolution undefined, webhook rate limiting, copilot tool registry
- **Key risks**: Column deletion breaks CRM sync, webhook flooding during bulk CRM imports, no conflict strategy for dual-source rows
- **Mitigations**: `is_system`/`is_locked` columns, idempotent provisioning RPC, rate limits per org, last-writer-wins with conflict log

### Schema Designer
- **4 table schemas**: 10-12 core columns each (44 total), all mapped to HubSpot/Attio properties
- **10 automations**: 2-3 per table covering enrichment, sync, alerts, cleanup
- **10 stories**: Phased across foundation → CRM integration → automations & UX
- **Estimate**: ~5 dev days across 3 phases

## Synthesis

### Agreements (all agents align)
- Need `is_system`/`is_locked` on `dynamic_table_columns` — core columns must be protected
- Need provisioning RPC that's idempotent (handles re-run safely)
- Webhook handlers already exist — extend them rather than rebuild
- Table schemas should map to both app tables and CRM properties
- Copilot needs explicit table tools in autonomous executor

### Conflicts (resolved)
1. **Risk Scanner estimated 385-595 hours** vs **Schema Designer estimated ~5 dev days**
   → Resolution: Risk Scanner inflated estimates by treating each blocker as independent work. Many overlap. Go with 5 dev days (realistic for this codebase maturity).

2. **Conflict resolution strategy**: Risk Scanner suggested 3 options
   → Resolution: "Last writer wins" with timestamp + source_type tracking + conflict log table. Simple, auditable, no user friction.

### Gaps
- No enrichment columns pre-defined for standard tables (add as optional locked columns)
- No table merge capability if user already has a "Leads" table (handle via naming: "Standard Leads")
- No feature flag gating (add `ops_standard_tables` capability check)

## Final Recommendation
Generate 10-story plan across 3 phases. See `.sixty/plan-org-standard-ops-tables.json`.
