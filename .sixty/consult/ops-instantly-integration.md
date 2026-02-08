# Ops × Instantly.ai Integration — Consult Report

**Date**: 2026-02-06
**Feature**: Full Instantly.ai integration as an overlay on any Ops table
**Scope**: Campaign CRUD, lead push, engagement sync, analytics columns

---

## Context

Instantly.ai is a cold email outreach platform. Users want to:
1. Connect their Instantly workspace (org-level API key)
2. Manage Instantly campaigns from within Ops tables
3. Push enriched leads from any Ops table to Instantly campaigns
4. Pull engagement data (opens, replies, bounces, status) back as auto-added columns
5. View campaign analytics from Ops

## Architecture Decision: Overlay Integration

Unlike HubSpot (which is a `source_type`), Instantly is an **overlay** — any Ops table can be "connected" to one or more Instantly campaigns regardless of source. This is more flexible:
- Enrich leads in Ops (from CSV, Apollo, HubSpot, manual) → push to Instantly
- Pull engagement back regardless of original source
- One table can push to multiple campaigns

## Instantly API v2 Summary

- **Base URL**: `https://api.instantly.ai`
- **Auth**: Bearer token (API key)
- **Key endpoints**:
  - `GET /api/v2/campaigns` — List campaigns
  - `POST /api/v2/campaigns` — Create campaign
  - `POST /api/v2/campaigns/{id}/activate` — Activate
  - `POST /api/v2/campaigns/{id}/pause` — Pause
  - `DELETE /api/v2/campaigns/{id}` — Delete
  - `GET /api/v2/campaigns/analytics/overview` — Analytics
  - `POST /api/v2/leads` — Create lead
  - `POST /api/v2/leads/bulk` — Bulk add leads
  - `POST /api/v2/leads/list` — List/search leads (POST, not GET)
  - `PATCH /api/v2/leads/{id}` — Update lead
  - `GET /api/v2/lead-lists` — List lead lists
- **Lead fields**: email, first_name, last_name, company_name, custom_variables (flat key-value)
- **Pagination**: Cursor-based (`starting_after` + `limit`)
- **Webhooks**: `reply_received`, `email_sent`, `email_opened`, `email_bounced`, `lead_interested`, etc.

## Patterns to Replicate from HubSpot

1. **Credential storage**: `instantly_org_credentials` (service-role) + `instantly_org_integrations` (public)
2. **Admin edge function**: `instantly-admin` with multi-action dispatch pattern
3. **API client**: `InstantlyClient` class with rate limiting + retry (like `HubSpotClient`)
4. **Sync hook**: `useInstantlySync` (like `useHubSpotSync`)
5. **Batch operations**: Bulk lead push, chunked upserts for engagement pull
6. **UI**: Campaign picker modal, push button, sync history panel

## Key Differences from HubSpot

| Aspect | HubSpot | Instantly |
|--------|---------|-----------|
| Auth | OAuth2 (refresh tokens) | Static API key (Bearer) |
| Data direction | Source type OR overlay | Overlay only |
| Primary object | Contacts + properties | Leads + campaigns |
| Engagement data | Property changes | Email events (opens, replies, bounces) |
| Sync trigger | Manual or cron | Manual + webhook-driven |
| Campaign model | Lists | Campaigns with email sequences |

## Column Mapping Strategy

When pushing leads from Ops → Instantly:
- `email` column → `email` (required)
- `first_name` / `first name` → `first_name`
- `last_name` / `last name` → `last_name`
- `company` / `company_name` → `company_name`
- All other columns → `custom_variables` (flat key-value)

When pulling engagement back:
- Auto-add `instantly_status` column (lead interest status)
- Auto-add `instantly_email_status` column (sent/opened/replied/bounced)
- Auto-add `instantly_last_contacted` column (timestamp)
- Auto-add `instantly_reply_count` column (number)
- Auto-add `instantly_open_count` column (number)

## Risks & Mitigations

1. **Rate limits**: Workspace-shared, no published numbers → conservative 100ms delay + exponential backoff
2. **Bulk lead limit**: Unknown max batch size → chunk at 100 leads per request
3. **Webhook availability**: Requires Hyper Growth plan → graceful degradation to polling
4. **Custom variable schema**: Adding custom vars updates campaign schema globally → map carefully
