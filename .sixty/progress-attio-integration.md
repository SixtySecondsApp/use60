# Progress Log — Attio CRM Integration

## Codebase Patterns
<!-- Reusable learnings from this feature -->

- Attio API base: `https://api.attio.com/v2`
- OAuth authorize: `https://app.attio.com/authorize`
- Token exchange: `POST https://app.attio.com/oauth/token`
- Rate limits: 100 reads/s, 25 writes/s
- Values are always arrays — need toAttioValues/fromAttioValues adapter
- Assert (upsert) via PUT with `matching_attribute` query param
- Deal pipelines are Lists with status attributes
- Webhook security: shared-secret in query param (no documented HMAC)
- Mirror HubSpot patterns: admin action router, credential table, job queue

---

## Session Log

### 2026-02-11 — ATTIO-001 ✅
**Story**: Create Attio database schema and migrations
**Files**: supabase/migrations/20260211200000_attio_integration_schema.sql
**Gates**: lint ✅ | test ✅ | types: skipped
**Learnings**: Mirrored HubSpot migration pattern exactly. 6 tables + CHECK constraints + RLS + dequeue function.

---

### 2026-02-11 — ATTIO-005 ✅
**Story**: Build shared Attio API client with rate limiting and value adapter
**Files**: supabase/functions/_shared/attio.ts
**Gates**: lint ✅ | test ✅ | types: skipped
**Learnings**: Attio values always arrays — toAttioValues/fromAttioValues adapter handles conversion. Rate limits 10ms read / 40ms write spacing.

---
