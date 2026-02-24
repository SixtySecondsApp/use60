# Consult Report: Delete Organization
Generated: 2026-02-06

## User Request
"Add ability to delete organizations from the platform/customers page. Users inside should become unassigned and go through onboarding again from the start. Keep user personal data (deals, contacts, activities)."

## Clarifications
- Q: Should all associated data be deleted, or just the org with users unassigned?
- A: Keep user data — remove org, unassign users, preserve their personal deals/contacts/activities

## Architecture Findings

### User-Org Relationship
- Users linked via `organization_memberships` table (many-to-many)
- NO `organization_id` column on profiles table
- Deleting memberships = users become unassigned

### Onboarding Re-entry
- `ProtectedRoute` checks `hasOrgMembership` — when false, redirects to `/onboarding`
- `needsOnboarding` check: `!onboarding_completed_at && step !== 'complete'`
- **CRITICAL**: Must reset `user_onboarding_progress` or users get stuck in redirect loop

### Cascade Behavior
- 313 ON DELETE CASCADE constraints on org-scoped tables
- Core sales data (contacts, deals, activities) uses `clerk_org_id` (text, no FK) — preserved
- Org-scoped data (integrations, AI, billing, settings) auto-deletes via CASCADE

### Existing Patterns
- `delete-user` edge function: JWT auth, admin check, specific error codes
- `org-deletion-cron`: scheduled deletion after 30-day deactivation
- `CustomerList.tsx`: DropdownMenu with actions per row

## Risks
| Severity | Risk | Mitigation |
|----------|------|------------|
| CRITICAL | Onboarding redirect loop if progress not reset | Reset user_onboarding_progress before deletion |
| HIGH | 313 CASCADE deletes on single operation | By design — org-scoped data should be deleted |
| MEDIUM | Active user sessions won't force-logout | ProtectedRoute handles on next navigation |
| LOW | Edge function config missing from config.toml | Explicitly added in plan |

## Plan
See `.sixty/plan-delete-organization.json` — 5 stories, ~75 minutes estimated.
