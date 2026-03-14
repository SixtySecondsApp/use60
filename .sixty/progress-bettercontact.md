# Progress Log — BetterContact Integration

## Codebase Patterns (Must Follow)
- Clone `useExploriumIntegration.ts` for integration hook (provider='bettercontact')
- Clone `ExplloriumConfigModal.tsx` for config modal
- Edge functions: `getCorsHeaders(req)`, pin `@supabase/supabase-js@2.43.4`, `maybeSingle()`
- BYOK: read from `integration_credentials` WHERE provider='bettercontact', no env fallback
- Enrichment: cache full response in `source_data.bettercontact`, extract fields via FIELD_MAP
- Cell upsert: { row_id, column_id, value, status, source, confidence, error_message }
- Credits: `logFlatRateCostEvent()` for flat-rate, `checkCreditBalance()` for pre-flight
- Migration pattern: DROP CONSTRAINT IF EXISTS → ADD CONSTRAINT with expanded values
- Webhook router: add handler to `webhook-integrations/index.ts` providerHandlers map

## BetterContact API Quick Reference
- Base: `https://app.bettercontact.rocks/api/v2`
- Auth: `X-API-Key` header
- Rate: 60 req/min
- Enrich: POST /async → GET /async/{id} (async, status='terminated' when done)
- Lead Find: POST /lead_finder/async → GET /lead_finder/async/{id}
- Credits: GET /account?email=X&api_key=Y

---

## Session Log

### BC-001 — Integration Credentials & Config Modal
**Files:** src/lib/hooks/useBetterContactIntegration.ts, src/components/integrations/BetterContactConfigModal.tsx, src/pages/Integrations.tsx
**Status:** Complete
**Notes:** Cloned Explorium pattern. BYOK only — no "platform key" state. Cyan brand color. 9 integration points in Integrations.tsx.

### BC-002 — Database Schema Migration
**Files:** supabase/migrations/20260312233928_add_bettercontact_integration.sql
**Status:** Complete
**Notes:** Added 'bettercontact' to source_type CHECK, 'bettercontact_property' to column_type CHECK, bettercontact_property_name column, bettercontact_requests table with RLS.

### BC-003 — Copilot Skill Definitions
**Files:** skills/atomic/bettercontact-enrich/SKILL.md, skills/atomic/bettercontact-lead-finder/SKILL.md
**Status:** Complete
**Notes:** Two atomic skills — enrichment and lead finder. Trigger patterns for natural language.

### BC-004 — Submit Enrichment Edge Function
**Files:** supabase/functions/bettercontact-enrich/index.ts
**Status:** Complete
**Notes:** Router pattern with submit/status/credits actions. Smart column matching. Cache in source_data.bettercontact. Webhook URL registration. BYOK key from integration_credentials.

### BC-005 — Webhook Receiver + Polling Fallback
**Files:** supabase/functions/webhook-integrations/handlers/bettercontact.ts, supabase/functions/webhook-integrations/index.ts, supabase/functions/bettercontact-enrich/index.ts
**Status:** Complete
**Notes:** Webhook handler processes results via custom_fields.row_id mapping. poll_and_process action added as fallback. Both paths cache in source_data.bettercontact.

### BC-006 — Email Deliverability Status Column
**Files:** src/components/ops/cells/BetterContactStatusCell.tsx
**Status:** Complete
**Notes:** Color-coded badges for deliverable/catch_all/catch_all_safe/catch_all_not_safe/undeliverable/not_found.

### BC-007 — Frontend Enrichment Trigger + Progress UI
**Files:** src/lib/services/betterContactService.ts, src/components/ops/enrichmentTemplates.ts
**Status:** Complete
**Notes:** Static service class with 4 methods. 5 enrichment templates (email, phone, deliverability, provider, job title).

### BC-008 — Lead Finder Edge Function + Search Service
**Files:** supabase/functions/bettercontact-lead-finder/index.ts, src/lib/services/betterContactSearchService.ts
**Status:** Complete
**Notes:** Submit + poll pattern. Auto-creates Ops table with 8 columns from search results. Exponential backoff polling in frontend service.

### BC-009 — Cascade Enrichment Integration
**Files:** supabase/functions/enrich-router/handlers/cascade.ts
**Status:** Complete
**Notes:** BetterContact added as 3rd provider in cascade (after Apollo + AI Ark). BYOK check, async submit+poll with 60s max timeout. Non-blocking — skip silently if no API key.

### BC-010 — Provider Attribution + Analytics
**Files:** src/components/integrations/BetterContactConfigModal.tsx
**Status:** Complete
**Notes:** Usage analytics section added to config modal. Shows total runs, contacts enriched, credits used from bettercontact_requests table.
