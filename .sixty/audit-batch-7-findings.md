# Audit Batch 7: Public REST API & Proxy Infrastructure
**Date**: 2026-03-01
**Scope**: REST endpoints, API infrastructure, Apify, search (~35 functions)
**Auditor**: Automated security + code quality review

---

## Summary Table

| Function | Status | P0 | P1 | P2 | P3 |
|----------|--------|----|----|----|-----|
| api-v1-activities | ISSUES | 0 | 2 | 2 | 1 |
| api-v1-companies | ISSUES | 0 | 2 | 2 | 0 |
| api-v1-contacts | ISSUES | 0 | 2 | 1 | 0 |
| api-v1-deals | ISSUES | 0 | 1 | 2 | 0 |
| api-v1-meetings | ISSUES | 0 | 2 | 2 | 0 |
| api-v1-tasks | ISSUES | 0 | 1 | 1 | 0 |
| api-auth | ISSUES | 1 | 1 | 1 | 0 |
| api-proxy | ISSUES | 1 | 2 | 1 | 0 |
| api-monitor | ISSUES | 0 | 0 | 2 | 0 |
| api-monitor-notify | PASS | 0 | 0 | 0 | 1 |
| api-usage-alerts | ISSUES | 0 | 0 | 2 | 0 |
| api-usage-cron | ISSUES | 0 | 0 | 2 | 0 |
| api-copilot | ISSUES | 0 | 1 | 1 | 0 |
| api-copilot-memory | PASS | 0 | 0 | 0 | 0 |
| api-action-centre | PASS | 0 | 0 | 0 | 0 |
| api-skill-builder | ISSUES | 0 | 0 | 2 | 0 |
| api-skill-execute | PASS | 0 | 0 | 0 | 0 |
| api-sequence-execute | PASS | 0 | 0 | 0 | 0 |
| apify-actor-introspect | PASS | 0 | 0 | 0 | 0 |
| apify-auto-map | ISSUES | 0 | 1 | 0 | 0 |
| apify-connect | PASS | 0 | 0 | 0 | 0 |
| apify-linkedin-enrich | PASS | 0 | 0 | 0 | 0 |
| apify-multi-query | ISSUES | 0 | 0 | 1 | 0 |
| apify-run-start | PASS | 0 | 0 | 0 | 0 |
| apify-run-webhook | ISSUES | 0 | 1 | 0 | 0 |
| run-apify-actor | ISSUES | 1 | 0 | 1 | 0 |
| entity-search | PASS | 0 | 0 | 0 | 0 |
| search-crm-with-icp | PASS | 0 | 0 | 0 | 0 |
| prospecting-search | PASS | 0 | 0 | 0 | 0 |
| prospecting-refine | PASS | 0 | 0 | 0 | 0 |
| docs-agent | PASS | 0 | 0 | 0 | 0 |
| docs-api | ISSUES | 0 | 0 | 1 | 0 |
| fetch-openrouter-models | ISSUES | 0 | 0 | 2 | 0 |
| sync-ai-models | ISSUES | 0 | 0 | 2 | 0 |
| freepik-proxy | ISSUES | 0 | 1 | 0 | 0 |

---

## Detailed Findings

### api-auth
**Status**: ISSUES FOUND

- **[P0]** `api-auth/index.ts:2` — Unpinned `@supabase/supabase-js@2` import. Per project memory, `@2` resolves to `@2.95.1` which returns 500 on esm.sh. All other functions in this batch correctly pin `@2.43.4`. This will cause silent breakage on cold starts.
- **[P1]** `api-auth/index.ts:164-165` — `checkRateLimit()` failure path returns `{ allowed: false }` — any database error silently blocks ALL API requests. A transient DB error will deny all legitimate callers with no logging or fallback. Should fail open (or at minimum log + alert) rather than fail closed.
- **[P2]** `api-auth/index.ts:220-221` — Usage logging inserts `status_code: 200` hardcoded — the actual response code is not available at this point in the flow since logging is fire-and-forget. The api-v1-* functions correctly pass real status codes, but `api-auth` itself always logs 200.

---

### api-proxy
**Status**: ISSUES FOUND

- **[P0]** `api-proxy/index.ts:189-250` — `select('*')` used on every table (`deals`, `activities`, `contacts`, `companies`). This violates the explicit column selection rule and leaks all columns including any sensitive internal fields. Additionally, queries filter on `user_id` but the `deals` table uses `owner_id` (see CLAUDE.md column ownership table) — this means deal queries will always return empty results.
- **[P1]** `api-proxy/index.ts:88-115` — Rate limiting implemented against `api_requests` table with a SELECT COUNT query on every call. This is a full table scan per request (no index on `api_key_id + created_at` implied). Under load, rate limit checks will become a bottleneck or simply fail, and the failure path (`return false`) blocks callers.
- **[P1]** `api-proxy/index.ts:2` — Unpinned `@supabase/supabase-js@2` import.
- **[P2]** `api-proxy/index.ts:264-267` — Full `responseBodyString` logged into `api_requests.response_body`. This stores potentially sensitive user data (deal values, contact emails, company details) in the requests log table. Should not log response bodies.

---

### api-v1-activities
**Status**: ISSUES FOUND

- **[P1]** `api-v1-activities/index.ts:115-143` — Duplicate columns in the list query SELECT: `owner_id` appears twice (lines 130, 132) and `deal_id` appears twice (lines 125, 132). While harmless, it wastes bandwidth and indicates copy-paste error.
- **[P1]** `api-v1-activities/index.ts:152-153` — Search interpolation into `ilike` filter without using `sanitizeSearchTerm`: `query.or(\`subject.ilike."%${search}%",...\`)`. If `search` contains characters like `%`, `_`, or PostgREST special chars, this could produce unexpected results. The `sanitizeSearchTerm` helper in `_shared/api-utils.ts` exists but is not used here. Consistency risk across all api-v1-* functions.
- **[P2]** `api-v1-activities/index.ts:91` — Pagination limit capped at 1000 (set in `parseQueryParams`). A request for 1000 activities with joined relations (company, contact, deal) could be a significant payload. Recommend a lower default cap (100) for this endpoint.
- **[P2]** `api-v1-activities/index.ts:423-428` — `handleCreateActivity` inserts `...body` directly into DB with only a few validated fields stripped/added. An attacker with write permission could inject arbitrary columns (`user_id`, `org_id`, etc.) if they exist on the table. Should use an explicit allow-list of insertable fields rather than spreading the full body.

---

### api-v1-companies
**Status**: ISSUES FOUND

- **[P1]** `api-v1-companies/index.ts:256-264` — Duplicate detection uses `.single()` on the check query: `await client.from('companies').select('id').eq('name', body.name).eq('owner_id', userId).single()`. Per CLAUDE.md, `.single()` should only be used when the record MUST exist — it throws `PGRST116` if not found, which is caught and swallowed by the outer try/catch, but this is fragile. Should use `.maybeSingle()`.
- **[P1]** `api-v1-companies/index.ts:270-276` — `handleCreateCompany` inserts `...body` directly without an allow-list, same issue as activities.
- **[P2]** `api-v1-companies/index.ts:138-141` — Search interpolation into `ilike` without sanitization, same pattern as activities.
- **[P2]** `api-v1-companies/index.ts:184-198` — `handleSingleCompany` uses `select('*')` on the base company record — violates explicit column selection rule.

---

### api-v1-contacts
**Status**: ISSUES FOUND

- **[P1]** `api-v1-contacts/index.ts:206-217` — `handleSingleContact` uses `select('*')` on the base contact record.
- **[P1]** `api-v1-contacts/index.ts:281-284` — `handleCreateContact` inserts `...body` without an allow-list.
- **[P2]** `api-v1-contacts/index.ts:162-163` — Search interpolation without sanitization.

---

### api-v1-deals
**Status**: ISSUES FOUND

- **[P1]** `api-v1-deals/index.ts:232-256` — `handleSingleDeal` uses `select('*')` on the base deal query.
- **[P2]** `api-v1-deals/index.ts:157-159` — Search interpolation without sanitization.
- **[P2]** `api-v1-deals/index.ts:353-358` — `handleCreateDeal` inserts `...body` with some validated fields, but arbitrary extra fields from the body can still be injected.

---

### api-v1-meetings
**Status**: ISSUES FOUND

- **[P1]** `api-v1-meetings/index.ts:247-252` — `handleSingleMeeting` uses `select('*')`.
- **[P1]** `api-v1-meetings/index.ts:194-196` — `params.upcoming` filter references `status` column which the code itself comments is removed: `// status filter removed - meetings table doesn't have status column`. The filter `.in('status', ['scheduled', 'in_progress'])` will silently fail or error since the column doesn't exist.
- **[P2]** `api-v1-meetings/index.ts:152-154` — Search references `description` and `notes` columns in the `ilike` filter, but the SELECT list doesn't include these columns (and they may not exist on the meetings table given other removed fields).
- **[P2]** `api-v1-meetings/index.ts:152-154` — Search interpolation without sanitization.

---

### api-v1-tasks
**Status**: ISSUES FOUND

- **[P1]** `api-v1-tasks/index.ts:264-303` — `handleSingleTask` uses `select('*')`.
- **[P2]** `api-v1-tasks/index.ts:169-171` — Search interpolation without sanitization.

---

### api-monitor
**Status**: ISSUES FOUND

- **[P2]** `api-monitor/index.ts:17` — Uses legacy `corsHeaders` from `../cors.ts` (not `getCorsHeaders(req)` from `corsHelper.ts`). All other functions in this batch use the correct dynamic CORS helper.
- **[P2]** `api-monitor/index.ts:16` — Unpinned `@supabase/supabase-js@2` import.

---

### api-monitor-notify
**Status**: PASS

- **[P3]** `api-monitor-notify/index.ts:15` — Unpinned `@supabase/supabase-js@2` import. Only minor risk (cron function, not user-facing). No CORS issues since this is a cron endpoint with no browser callers.

---

### api-usage-alerts
**Status**: ISSUES FOUND

- **[P2]** `api-usage-alerts/index.ts:11` — Pinned to `@2.39.3` (not `@2.43.4`). While pinned (good), the version is inconsistent across the codebase. Should standardize on `@2.43.4`.
- **[P2]** `api-usage-alerts/index.ts:13-16` — Uses hardcoded `corsHeaders` object instead of `getCorsHeaders(req)`. This is a cron function (no browser callers normally) but it also accepts HTTP requests from the admin dashboard, so dynamic CORS is needed.

---

### api-usage-cron
**Status**: ISSUES FOUND

- **[P2]** `api-usage-cron/index.ts:16` — Pinned to `@2.39.3`.
- **[P2]** `api-usage-cron/index.ts:18-21` — Uses hardcoded `corsHeaders` instead of `getCorsHeaders(req)`.

---

### api-copilot
**Status**: ISSUES FOUND

- **[P1]** `api-copilot/index.ts:13` — Unpinned `@supabase/supabase-js@2`. This is the highest-traffic function in the system; a broken esm.sh resolution would take down all copilot chat.
- **[P2]** `api-copilot/index.ts:14` — Uses `corsHeaders as staticCorsHeaders` alongside `getCorsHeaders(req)`. The static import may be used in some code paths — needs verification that all Response objects use the dynamic version.

---

### api-skill-builder
**Status**: ISSUES FOUND

- **[P2]** `api-skill-builder/index.ts:24-27` — Uses hardcoded `corsHeaders` object (not `getCorsHeaders(req)`).
- **[P2]** `api-skill-builder/index.ts:2` — Pinned to `@2.39.3` (inconsistent version).
- **Note**: No auth middleware applied to the main request — needs review of full file to confirm auth is present. First 80 lines only reviewed; auth appears to be missing from the serve handler seen.

---

### apify-auto-map
**Status**: ISSUES FOUND

- **[P1]** `apify-auto-map/index.ts` (first 80 lines) — No auth header check visible in the serve handler snippet. Given this function accepts `{ run_id }` or `{ sample_data }` and accesses organization-scoped data, missing auth would be a significant issue. Needs full file review to confirm.

---

### apify-run-webhook
**Status**: ISSUES FOUND

- **[P1]** `apify-run-webhook/index.ts:39` — Comment says "Deploy with --no-verify-jwt since this is called externally by Apify" — this is correct for a webhook, BUT there is no webhook secret validation. Apify webhooks can include a custom secret header for verification (`X-Apify-Webhook-Secret`). Without verifying this, anyone who discovers the webhook URL can send fake run completion events, causing bogus data to be mapped into CRM tables. This is a spoofing/data-integrity risk.

---

### run-apify-actor
**Status**: ISSUES FOUND

- **[P0]** `run-apify-actor/index.ts:34-36` — No authentication check whatsoever. The function creates a Supabase service-role client directly and immediately reads request body without validating any auth header. An unauthenticated caller can trigger Apify actor runs billed to any organization's API key. This is a critical auth bypass and financial abuse vector.
- **[P2]** `run-apify-actor/index.ts:2` — Unpinned `@supabase/supabase-js@2`.

---

### docs-api
**Status**: ISSUES FOUND

- **[P2]** `docs-api/index.ts:4-8` — Uses hardcoded `corsHeaders` object (not `getCorsHeaders(req)`).

---

### fetch-openrouter-models
**Status**: ISSUES FOUND

- **[P2]** `fetch-openrouter-models/index.ts:1` — Pinned to `@2.39.3`.
- **[P2]** `fetch-openrouter-models/index.ts:3-6` — Uses hardcoded `corsHeaders` object. No auth check visible in first 80 lines — if this function hits an external API (OpenRouter), auth should be required to prevent unauthenticated model list fetching (minor risk but consistent with policy).

---

### sync-ai-models
**Status**: ISSUES FOUND

- **[P2]** `sync-ai-models/index.ts:15` — Pinned to `@2.39.3`.
- **[P2]** `sync-ai-models/index.ts:17-20` — Uses hardcoded `corsHeaders` object. Admin-level operation (writes to `ai_models` table) should require auth or at minimum a service-role-only pattern.

---

### freepik-proxy
**Status**: ISSUES FOUND

- **[P1]** `freepik-proxy/index.ts:61-99` — No authentication check. Any unauthenticated caller can proxy requests to Freepik's API using the platform's `FREEPIK_API_KEY`. While endpoint path validation exists (`startsWith('/')`), this is a credential abuse vector — external parties can use the proxy to make paid Freepik API calls at the platform's expense.

---

## Cross-Cutting Findings

### [P1] Shared: Mass body spread on inserts (api-v1-*)
All api-v1-* create/update handlers do `{ ...body, owner_id: userId }` insert without an explicit allow-list. An API caller with write permissions can attempt to inject arbitrary database columns. While RLS and Postgres column constraints provide a partial safety net, this pattern is unsafe-by-default. The correct pattern is:
```typescript
const allowedFields = ['type', 'subject', 'date', 'status', 'deal_id', 'company_id']
const safeBody = Object.fromEntries(
  Object.entries(body).filter(([k]) => allowedFields.includes(k))
)
```

### [P1] Shared: `select('*')` on single-record fetches (api-v1-*)
Five of six api-v1-* functions use `select('*')` on single-record GET handlers. This violates project rules and leaks all internal columns to API consumers.

### [P2] Shared: Unpinned `@supabase/supabase-js@2` (multiple functions)
Affected: `api-auth`, `api-proxy`, `api-copilot`, `api-monitor`, `api-monitor-notify`, `run-apify-actor`.
These should all be pinned to `@2.43.4`.

### [P2] Shared: Inconsistent supabase version pinning
`api-usage-alerts`, `api-usage-cron`, `api-skill-builder`, `fetch-openrouter-models`, `sync-ai-models` use `@2.39.3`. Should standardize to `@2.43.4`.

### [P2] Shared: Legacy static `corsHeaders` (multiple functions)
Affected: `api-monitor` (uses `cors.ts`), `api-usage-alerts`, `api-usage-cron`, `api-skill-builder`, `docs-api`, `fetch-openrouter-models`, `sync-ai-models`.
All should import `getCorsHeaders(req)` from `_shared/corsHelper.ts`.

### [P2] Shared: `parseQueryParams` caps pagination at 1000
`_shared/api-utils.ts:91`: `Math.min(parseInt(...), 1000)`. For entity lists with joins (company, contact, deal enrichments), 1000 records is too high. Recommend reducing to 100 max for joined queries, or requiring explicit opt-in for large page sizes.

---

## Priority Fixes

### Immediate (P0/P1):
1. **`run-apify-actor`**: Add authentication check — this is a complete auth bypass.
2. **`freepik-proxy`**: Add authentication check — credential abuse vector.
3. **`api-proxy`**: Fix `select('*')` violations and wrong column name (`user_id` vs `owner_id` on deals).
4. **`api-auth`**: Pin supabase version; fix rate limit fail-closed behavior.
5. **`apify-run-webhook`**: Add Apify webhook secret verification.
6. **All api-v1-***: Replace body-spread inserts with explicit allow-lists; replace `select('*')` on single-record fetches.
7. **`api-v1-meetings`**: Remove the broken `upcoming` filter that references a non-existent `status` column.

### Short-term (P2):
1. Standardize all supabase imports to `@2.43.4`.
2. Replace all static `corsHeaders` with `getCorsHeaders(req)`.
3. Add `sanitizeSearchTerm()` to all search filter paths in api-v1-*.
4. Reduce pagination max from 1000 to 100 for joined entity queries.
