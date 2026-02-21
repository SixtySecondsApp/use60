# Progress Log — AI Agent Alert Channel Routing

## Codebase Patterns
- Slack notification settings use `slack_notification_settings` table with `UNIQUE(org_id, feature)`
- Each feature is a single row; agent alerts use one row per category: `agent_alert_engineering`, `agent_alert_legal`, etc.
- `SlackChannelSelector` component handles channel fetching, bot membership checks, and selection
- `useUpdateNotificationSettings` does upsert (check exists → update or insert)
- `resolveSlackChannel()` in `intentActionRegistry.ts` scans keywords → returns channel name
- All Slack settings UI is admin-gated via `useIsOrgAdmin()`

---

## Session Log

(No sessions yet — run `60/dev-run` to begin execution)
