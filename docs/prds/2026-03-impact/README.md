# March 2026 Impact PRDs

Generated from the production readiness audit of all 88 features. These 22 PRDs target the highest-impact improvements — features with strong backends but missing frontends, duplicated features needing consolidation, and core differentiators stuck below production quality.

## Priority Tiers

### Tier 1 — Ship Blockers (must-fix before launch)
| PRD | Title | Current Score | Target | Impact |
|-----|-------|--------------|--------|--------|
| PRD-101 | Command Centre Consolidation | 1 → 4 | Production CC | THE core value prop — 4 demo variants, no production version |
| PRD-102 | Feature Catalogue Deduplication | mixed | Clean catalogue | 7 duplicate/overlapping features inflating count |
| PRD-103 | Autonomy Dashboard Polish | 3 → 4 | Ship-ready autonomy | Key differentiator stuck with basic settings UI |
| PRD-114 | Campaign Management Dashboard | 2 → 4 | Campaign UI | Full Instantly API integration, zero campaign UI |
| PRD-115 | Outreach Analytics Dashboard | 1 → 4 | Outreach metrics | Data collected across systems, zero visualisation |
| PRD-116 | Forecast Dashboard | 1 → 4 | Forecast page | RPCs and snapshots exist, zero frontend |
| PRD-118 | Global Search & Command Palette | 2 → 4 | Cmd+K search | Search fragments exist, no unified experience |
| PRD-123 | Setup Wizard & Activation Checklist | 2 → 4 | First-run setup | Components built but not mounted in app |

### Tier 2 — High-Impact Quick Wins (backend exists, needs frontend)
| PRD | Title | Current Score | Target | Impact |
|-----|-------|--------------|--------|--------|
| PRD-104 | Deal Memory Frontend | 3 → 4 | Memory UI in deal sheet | Unique differentiator — no competitor has this |
| PRD-105 | Competitive Intelligence Library | 3 → 4 | Battlecard management page | Agent builds them, nowhere to manage them |
| PRD-106 | Pipeline Patterns Dashboard | 3 → 4 | Insights page | Statistical detection runs, results buried in Slack |
| PRD-107 | Internal Meeting Prep Surface | 3 → 4 | Prep brief in meeting detail | Backend classifies, no UI shows the prep |
| PRD-117 | Win/Loss Analysis Dashboard | 2 → 4 | Outcome analysis | Backend extracts signals, no analysis UI |
| PRD-119 | Pipeline Advanced Views & Bulk Ops | 3 → 4 | Power-user pipeline | Kanban + table work, missing filters/bulk/export |
| PRD-120 | Follow-Up Draft Review & Scheduling | 3 → 4 | Draft inbox | Generation + sending work, no draft management |
| PRD-121 | Stakeholder Mapping & Buying Committee | 1 → 3 | Buying committee view | Basic contact roles exist, no hierarchy or mapping |
| PRD-122 | CRM Field Mapping & Auto-Update Config | 3 → 4 | Config UI | Auto-update pipeline works, configuration hardcoded |

### Tier 3 — Differentiator Upgrades (lift from scaffold to beta)
| PRD | Title | Current Score | Target | Impact |
|-----|-------|--------------|--------|--------|
| PRD-108 | Coaching & Team Intelligence UI | 2 → 4 | Team analytics dashboard | Org-wide learning is the enterprise unlock |
| PRD-110 | Meeting Content Library | 2 → 4 | Searchable call library | Share best calls, search across all recordings |
| PRD-111 | Progressive Learning Slack Flow | 3 → 4 | Config questions via Slack | Agent self-configures — key to "no setup" promise |
| PRD-112 | AI Model Routing End-to-End | 1 → 4 | Per-feature model enforcement | Settings page exists, backend doesn't enforce |
| PRD-113 | Deal Intelligence MEDDIC Panel | 2 → 4 | Rich deal intelligence sheet | Auto-populated from meetings, not manual entry |

## Estimated Total Effort
~200-265 hours across all 22 PRDs. Tier 1 should ship first (3-4 weeks). Tier 2 can be parallelised (2-3 weeks). Tier 3 fills the following sprint.
