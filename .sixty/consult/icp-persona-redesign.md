# Consult Report: ICP + Buyer Persona Redesign
Generated: 2026-02-19

## User Request
"On the ICP profiles we have Ideal Customer Profile and Ideal Buyer Profile which both sound the same but the difference was meant to be ideal customer profile was for tying to the company profile as a broad ICP and then ideal buyer profile was a narrow ICP for each product or service offered."

## Clarifications

| # | Question | Answer |
|---|----------|--------|
| 1 | ICP primary use case? | Both inbound scoring + outbound targeting |
| 2 | IBP linking to products? | Loosely tagged (text field, no formal FK) |
| 3 | Volume per user? | Varies widely (1 to dozens) |
| 4 | AI behavior split? | Combined context — ICP filters companies, persona filters contacts within |
| 5 | UI layout? | Hierarchical — ICPs as parent cards, personas nested underneath |
| 6 | Field split? | Wants recommendations (mostly distinct fields per type) |
| 7 | Naming? | **Buyer Persona** (industry-standard, clear split from ICP) |
| 8 | Hierarchy enforcement? | Optional parent — personas CAN link to ICP but can exist standalone |
| 9 | AI search chaining? | Auto-chain when persona has parent ICP, direct search when standalone |

## Current State Analysis

### Database
- Single `icp_profiles` table with `profile_type: 'icp' | 'ibp'`
- `ICPCriteria` JSONB blob mixes firmographic + persona fields
- No `parent_icp_id` column — no hierarchy support
- `fact_profile_id` and `product_profile_id` are optional FKs
- `linked_table_id` auto-creates an ops table per profile
- Status simplified to `active | archived`

### UI
- Flat card grid with filter tabs ("All Profiles", "Customer Profiles", "Buyer Profiles")
- Same form for both types — all fields shown regardless of type
- Profile type shown as tiny "ICP" / "IBP" badge on cards
- No visual hierarchy or parent-child relationship

### AI/Copilot
- All profiles treated identically in search
- No chained company→contact workflow
- `search-crm-with-icp` edge function doesn't differentiate types

## Recommendations

### 1. Naming Convention

| Current | Proposed | DB Value | Icon |
|---------|----------|----------|------|
| Ideal Customer Profile | **Company ICP** | `icp` (unchanged) | `Building2` |
| Ideal Buyer Profile | **Buyer Persona** | `persona` (was `ibp`) | `UserCircle` |

### 2. Field Split

**Company ICP fields** (firmographic focus):
- Industries, Employee ranges, Revenue range, Funding stages
- Technology keywords, Geography (country/region/city), Custom keywords

**Buyer Persona fields** (demographic + psychographic):
- Seniority levels, Departments, Title keywords + search mode
- Pain points (NEW), Buying triggers (NEW), Messaging angle (NEW)
- Product/service tag — text field (NEW)
- Geography (optional, inherited from parent ICP if linked)

**Shared fields** (both types): Name, description, status, visibility, target provider

### 3. Hierarchical UI

- ICP cards are large "group" cards with personas nested as mini-cards inside
- "+ Add Persona" button inside each ICP card
- Standalone personas section at bottom for unparented personas
- Expand/collapse on ICP cards to show/hide child personas

### 4. AI Auto-Chain

- Persona with parent ICP → chain: company filter → contact filter within
- Standalone persona → direct contact search
- Copilot detects parent automatically and chains

### 5. Schema Changes

- Add `parent_icp_id UUID REFERENCES icp_profiles(id)` (nullable self-FK)
- Migrate `profile_type = 'ibp'` → `'persona'`
- Extend `ICPCriteria` with: `pain_points`, `buying_triggers`, `messaging_angle`, `product_tag`

## Risks

| Severity | Risk | Mitigation |
|----------|------|------------|
| Medium | Existing `ibp` profiles need migration | One-shot UPDATE + CHECK constraint swap |
| Medium | Form complexity increase | Conditional rendering based on type |
| Low | AI chaining adds latency | Parallel company+contact search where possible |
| Low | Grid rebuild is significant UI work | Can ship form split first (MVP) |
