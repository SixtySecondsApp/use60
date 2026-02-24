# Progress Log — HubSpot List Write Operations

## Codebase Patterns

- HubSpot credentials: `hubspot_org_credentials` table, fetched via service role
- Edge functions must pin `@supabase/supabase-js@2.43.4` (esm.sh CDN issue)
- Staging deploy: `npx supabase functions deploy <name> --project-ref caerqjzvuerejfrdtygb --no-verify-jwt`
- Existing push-to-hubspot: has list assignment stub at line 236, uses unpinned import
- HubSpotPushModal: accepts `listId` in onPush config but never passes it
- BulkActionsBar: has `onPushToHubSpot` prop, already wired from OpsDetailPage
- HubSpot Lists API: POST /crm/v3/lists (create), PUT /crm/v3/lists/{id}/memberships/add|remove
- Only MANUAL lists support add/remove members (not DYNAMIC)
- Row metadata: `source_id` (HubSpot contact ID), `source_data` (full HubSpot object)
- Table source_query: `list_id`, `sync_direction`, `last_synced_at`
- hubspot-admin edge function has `get_lists` handler (POST /crm/v3/lists/search)

---

## Session Log

### HL-001: Fix push-to-hubspot import pin + list assignment ✅
- Pinned `@supabase/supabase-js@2` → `@2.43.4` in `supabase/functions/push-to-hubspot/index.ts`
- Fixed `hubspot.request()` calls to use correct single-object signature `{ method, path, body }`
- Added `allHubSpotContactIds` array to collect contact IDs from batch responses
- Accept `config.createNewList` + `config.newListName` — creates MANUAL list via `POST /crm/v3/lists`
- Completed list assignment stub: `PUT /crm/v3/lists/{listId}/memberships/add` with collected contact IDs
- Returns `list_id` and `list_contacts_added` in response

### HL-004: Create hubspot-list-ops edge function ✅
- Created `supabase/functions/hubspot-list-ops/index.ts`
- Three actions: `create_list_from_table`, `add_to_list`, `remove_from_list`
- Auth: JWT validation + org membership check via table ownership
- `create_list_from_table`: gets source_ids from rows, creates MANUAL list, adds members in batches of 500, optionally links list_id to table source_query
- `add_to_list` / `remove_from_list`: simple wrappers around PUT /crm/v3/lists/{id}/memberships/add|remove

### HL-002: Extend HubSpotPushModal with list UI ✅
- Added `listAction` state (`'none' | 'existing' | 'new'`) with orange-themed radio buttons
- Existing list: dropdown populated from `hubspotLists` prop with loading state
- New list: text input for list name
- Exported `HubSpotPushConfig` type for reuse
- Push button now calls `handlePush()` which builds config with list params

### HL-003: Wire list fetch + pass to push modal ✅
- Added `hubspotLists`, `isLoadingLists`, `showSaveAsHubSpotList` state
- `fetchHubSpotLists` callback: fetches lists via `hubspot-admin` `get_lists` action
- BulkActionsBar `onPushToHubSpot` now triggers both `setShowHubSpotPush(true)` and `fetchHubSpotLists()`
- HubSpotPushModal receives `hubspotLists` and `isLoadingLists` props
- Push mutation uses `HubSpotPushConfig` type, toast shows list info

### HL-005: SaveAsHubSpotListModal + toolbar ✅
- Created `src/components/ops/SaveAsHubSpotListModal.tsx` — list name input, all/selected scope, link-list checkbox
- Added "Save List" button in HubSpot toolbar (orange, List icon)
- `createHubSpotListMutation` calls `hubspot-list-ops` `create_list_from_table` action
- Success toast shows list name + contact count

### HL-006: Auto-mirror row deletes to HubSpot list ✅
- Modified `deleteRowsMutation` to pre-capture `source_id` values before deletion
- On success: if bidirectional + list_id, fires `hubspot-list-ops` `remove_from_list` (fire-and-forget)
- Toast shows "Removed X contacts from HubSpot list"
- Non-bidirectional/pull-only tables: no HubSpot API call

## Deployments
- `push-to-hubspot` → staging `caerqjzvuerejfrdtygb` ✅
- `hubspot-list-ops` → staging `caerqjzvuerejfrdtygb` ✅

## Build Status
- Vite build: ✅ Passes (30.01s)
- All 6 stories complete

