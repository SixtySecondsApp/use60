# Consult Report: Attio CRM Integration
Generated: 2026-02-11 09:30

## User Request
"Build an integration into Attio at the same standard as our HubSpot integration"

## Clarifications
- Q: Which Attio objects to sync?
- A: All (match HubSpot) — Companies, People, Deals, Tasks, Notes

- Q: Sync direction?
- A: Full bidirectional + webhooks

- Q: OAuth app registered?
- A: No — include setup instructions in plan

## Codebase Scout Findings

### HubSpot Integration Scope (Reference Standard)
- **14 edge functions**: OAuth (4), Admin (1), Sync (4), Import/Export (3), Webhooks (2)
- **2 shared utilities**: API client + copilot adapter
- **3+ database migrations**: Credentials, sync state, settings, history, queue
- **3 frontend hooks**: Integration management, sync, write-back
- **6 frontend pages/components**: Settings, config modal, import wizard, push modal, sync history, tests
- **2 Vercel cron jobs**: Token refresh, queue processing
- **6 test files**: Unit + integration tests

### Existing Attio State
- Listed as "Coming Soon" in integrations catalog (integrationPlans.ts:1017)
- Logo mapping exists (attio.com domain)
- Priority: medium, Category: CRM, Popularity: 4/5
- No integration code exists

## Patterns Analyst Findings

### Authentication Pattern
- User JWT validated via `anonClient.auth.getUser()`
- Org admin/owner role enforced via `organization_memberships`
- Service role for credential access only
- OAuth state with 10-min TTL, one-time use
- Token auto-refresh with 5-min expiry buffer

### Integration Architecture
- Organization-scoped (not per-user)
- Credentials in dedicated table (not `integration_credentials`)
- Admin endpoint as action router (single function, many actions)
- Job queue for async processing
- Sync history with revert capability

### CORS Pattern
- New functions: `getCorsHeaders(req)` from `corsHelper.ts`
- Legacy functions: `corsHeaders` constant (avoid for new code)

## Risk Scanner Findings

| Severity | Risk | Mitigation |
|----------|------|------------|
| High | 5+ new DB tables require careful migration | Mirror HubSpot schema exactly, test on dev first |
| High | OAuth app must be registered before development | Can use API key for dev, OAuth for staging/prod |
| Medium | Attio webhook security mechanism unclear | Implement shared-secret verification pattern |
| Medium | Attio token refresh not documented | Implement refresh-on-401 fallback |
| Medium | Attio value format differs (array-wrapped) | Build adapter layer in shared client |
| Low | Rate limits more generous than HubSpot | Still implement rate limiting (10ms read, 40ms write) |

## Attio API Reference

### Authentication
- OAuth2 authorization code flow
- Authorization: `https://app.attio.com/authorize`
- Token exchange: `POST https://app.attio.com/oauth/token`
- Bearer token in Authorization header
- Also supports single-workspace API keys

### Rate Limits
- Reads: 100/second
- Writes: 25/second
- 429 response with Retry-After header
- Score-based limits on list queries

### Data Model
- **Objects**: Structural templates (people, companies, deals, custom)
- **Records**: Individual instances of objects
- **Lists**: Aggregate records for business processes (deal pipelines = lists)
- **List Entries**: Records within lists (with list-specific attributes)
- **Attributes**: Columns on objects/lists (20+ types)
- **Values are always arrays** (supports multi-value)

### Key Endpoints
| Endpoint | Method | Path |
|----------|--------|------|
| Query records | POST | `/v2/objects/{object}/records/query` |
| Create record | POST | `/v2/objects/{object}/records` |
| Assert (upsert) | PUT | `/v2/objects/{object}/records` |
| Update record | PATCH | `/v2/objects/{object}/records/{id}` |
| Delete record | DELETE | `/v2/objects/{object}/records/{id}` |
| List lists | GET | `/v2/lists` |
| Query list entries | POST | `/v2/lists/{list}/entries/query` |
| Create list entry | POST | `/v2/lists/{list}/entries` |
| List notes | GET | `/v2/notes` |
| Create note | POST | `/v2/notes` |
| List tasks | GET | `/v2/tasks` |
| Create webhook | POST | `/v2/webhooks` |
| List webhooks | GET | `/v2/webhooks` |

### Filtering Syntax
```json
{
  "filter": {
    "$and": [
      { "name": { "full_name": { "$contains": "John" } } },
      { "email_addresses": { "email_address": { "$eq": "john@example.com" } } }
    ]
  },
  "sorts": [{ "direction": "asc", "attribute": "name" }],
  "limit": 500,
  "offset": 0
}
```

### Webhook Events (24 types)
- Records: created, updated, deleted, merged
- List entries: created, updated, deleted
- Notes: created, content.updated, updated, deleted
- Tasks: created, updated, deleted
- Comments: created, resolved, unresolved, deleted
- Lists: created, updated, deleted
- Object/list attributes: created, updated
- Workspace members: created
- Call recordings: created

## Synthesis

### Agreements (all analyses align)
- Full HubSpot parity requires ~23 stories across 9 phases
- Organization-scoped integration (not per-user)
- Must follow established OAuth + admin action router pattern
- Attio's array-value format needs adapter layer
- Bidirectional sync with job queue is proven pattern

### Key Architectural Decisions
1. **Separate credential table** (attio_org_credentials, not integration_credentials JSONB)
2. **Single admin endpoint** (attio-admin with action router, not separate functions per action)
3. **Shared API client** (_shared/attio.ts with AttioClient class)
4. **Value adapter** (toAttioValues/fromAttioValues for array-wrapped format)
5. **Shared-secret webhooks** (query param secret, since Attio doesn't document HMAC verification)
6. **Assert for upsert** (PUT with matching_attribute, not separate create-or-update logic)

## Final Recommendation
Full 23-story plan across 9 phases. MVP (11 stories, 7 days) delivers OAuth + Import + Settings. Full implementation: 16 days with parallel execution.
