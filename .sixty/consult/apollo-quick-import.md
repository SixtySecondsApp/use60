# Consultation: Apollo Search Quick Import & Improvements

## Root Cause: Missing Preview Data

**RESOLVED**: Apollo's `mixed_people/api_search` endpoint returns a **reduced dataset** by design:

| Field | Search Returns | Enrichment Returns |
|-------|---------------|-------------------|
| Name | First name + obfuscated last name (`Po***r`) | Full name |
| Title | Full title | Full title |
| Company | Name only (no domain, no employees count) | Full org data |
| Email | `has_email: true/false` flag only | Actual email |
| Phone | `has_direct_phone: "Yes"/"No"` flag only | Actual number |
| Location | `has_city/has_state/has_country` flags only | Actual city/state/country |
| LinkedIn | Not returned | Full URL |
| Employees | `has_employee_count` flag only | Actual count |

**Fix applied**: Preview now shows availability indicators (checkmarks) and a data summary bar showing "X/50 have email available", etc.

---

## Recommended Improvements

### 1. Quick Import (NL → Table in One Click)

**Current flow** (5+ clicks):
```
Step 0: Type NL query → Click Search
Step 1: Review filters → Click Search Apollo
Step 2: Review preview → Configure enrichment → Click Create Table
→ Navigate to table
```

**Proposed "Quick Import" flow** (1 click):
```
NL bar: "CEOs in Bristol with emails" → Click "Quick Import"
→ Auto-parse → Auto-search → Auto-create table → Auto-enrich emails → Navigate
```

**Implementation**: Add a "Quick Import" button next to the NL search bar on Step 0. When clicked:
1. Parse NL query (detect enrichment keywords: "with emails", "with phone numbers")
2. Search Apollo
3. Create table immediately (auto-generate name from query)
4. Auto-enrich based on detected keywords
5. Navigate to the new table

**Enrichment keyword detection** in NL parser:
- "with emails" / "with email addresses" → `auto_enrich.email = true`
- "with phone numbers" / "with phones" / "with mobile" → `auto_enrich.phone = true`
- "with contact details" / "enriched" / "full details" → both email + phone

### 2. NL Enrichment Options

Update `parse-apollo-query` to detect enrichment intent and return it alongside search params:

```typescript
// New output field
interface ParsedApolloQuery {
  params: Partial<ApolloSearchParams>
  summary: string
  enrichment?: {           // NEW
    email?: boolean
    phone?: boolean
    reason?: string        // "User requested 'with emails'"
  }
}
```

### 3. Smarter Defaults from Business Context

Already partially implemented. The `parse-apollo-query` function fetches:
- `organization_enrichment.ideal_customer_profile` (JSONB)
- `organization_enrichment.employee_count` (target customer size)
- `organization_enrichment.target_market`

These are passed to Claude as context for setting default employee ranges.

### 4. Preview Data Availability Summary

**Implemented**: The preview now shows a 4-column summary grid:
```
| Email     | Phone     | Location  | LinkedIn  |
| 32/50     | 18/50     | 45/50     | 41/50     |
| available | available | available | available |
```

Plus checkmark/dash indicators in the Email and Phone columns when only flags (not actual data) are returned.

---

## Execution Plan

| # | Story | Type | Est. |
|---|-------|------|------|
| 1 | Add enrichment keyword detection to NL parser | backend | 20m |
| 2 | Add Quick Import button to Step 0 NL bar | frontend | 25m |
| 3 | Add Quick Import mutation (search+create+enrich in one call) | frontend+backend | 30m |
| 4 | Auto-generate table names from NL query | backend | 10m |
| 5 | Update copilot-dynamic-table to accept enrichment params | backend | 15m |

**Total estimate**: ~1.5-2 hours

---

## Architecture Notes

### Quick Import Flow
```
ApolloSearchWizard Step 0
  → useParseApolloQuery(query)           // Parse NL + detect enrichment
  → apolloSearchService.searchAndCreateTable({
      query_description: summary,
      search_params: params,
      table_name: auto-generated,
      auto_enrich: { email, phone }       // From NL detection
    })
  → copilot-dynamic-table                 // Already supports auto_enrich
  → Navigate to /ops/{table_id}
```

### Enrichment Detection Prompt Addition
```
If the user mentions wanting emails, phones, or contact details,
set the enrichment field accordingly:
- "with emails" → enrichment: { email: true }
- "with phone numbers" → enrichment: { phone: true }
- "with contact details" / "enriched" → enrichment: { email: true, phone: true }
```
