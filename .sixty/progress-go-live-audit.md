# Progress Log — Go-Live Audit Fixes
**Feature**: go-live-audit | **Created**: 2026-02-18 | **Target**: First public launch

---

## Codebase Patterns
- Edge functions: always use `getCorsHeaders(req)` from `_shared/corsHelper.ts` — never legacy `corsHeaders`
- Edge functions: always use JWT-protected auth unless explicitly webhook/public endpoint
- Webhook handlers: validate signature headers before processing any payload
- Supabase queries: use `.maybeSingle()` not `.single()` when record might not exist
- Contacts/deals: owner column is `owner_id` not `user_id`
- Fathom/OAuth secrets: NEVER use VITE_ prefix — store server-side in Deno.env

---

## Story Status

| ID | Title | Status | Est | Actual |
|----|-------|--------|-----|--------|
| GLIVE-001 | Re-enable MeetingBaaS webhook signature verification | pending | 30m | - |
| GLIVE-002 | Remove hardcoded staging UUIDs from MeetingBaaS webhook | pending | 30m | - |
| GLIVE-003 | Add X-Goog-Channel-Token validation to Google Calendar webhook | pending | 45m | - |
| GLIVE-004 | Create fathom-oauth-token edge function | pending | 60m | - |
| GLIVE-005 | Remove VITE_FATHOM_CLIENT_SECRET, update fathomApiService | pending | 45m | - |
| GLIVE-006 | Fix webhook renewal migration app.settings config | pending | 30m | - |
| GLIVE-007 | Implement detectAndStructureResponse in copilot-autonomous | pending | 120m | - |
| GLIVE-008 | Fix 10 skill validation errors | pending | 30m | - |
| GLIVE-009 | Fix routing — move standard table intent below sequences | pending | 45m | - |
| GLIVE-010 | Apply rate limiting to copilot-autonomous handler | pending | 20m | - |
| GLIVE-011 | Add try/catch around tool execution loop | pending | 30m | - |
| GLIVE-012 | Implement actual contact deletion in ContactsTable | pending | 45m | - |
| GLIVE-013 | Remove @ts-nocheck from useActivities, useTasks, useOriginalActivities | pending | 90m | - |
| GLIVE-014 | Add limit() and cursor pagination to deals query | pending | 30m | - |
| GLIVE-015 | Migrate legacy corsHeaders → getCorsHeaders in edge functions | pending | 90m | - |

**Total estimated**: ~10.5h | **Completed**: 0/15

---

## Session Log

<!-- Entries added as stories complete -->

