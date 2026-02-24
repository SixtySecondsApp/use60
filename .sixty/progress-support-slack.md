# Progress Log — Support Centre: Slack + Admin Queue

## Codebase Patterns
- Slack action IDs use `::` delimiter: `{action}::{entityId}`
- Realtime subscriptions follow: `.channel('name').on('postgres_changes', {...}).subscribe()`
- Platform admin pages: `platformAdmin` access + lazy-loaded in lazyPages.tsx
- Notification badges: red circle with count text, `animate-ping` pulse on outer ring
- Edge functions: `getCorsHeaders(req)` from `_shared/corsHelper.ts`
- Security definer RPCs for cross-org queries with explicit admin checks

---

## Session Log

*(No stories executed yet)*
