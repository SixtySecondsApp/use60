# PRD: Settings Page Fixes (TSK-0455)

## Introduction

The Settings page has 10 unresolved issues from TSK-0455 audit. Four items marked "done" are not actually fixed (hidden sections still visible, dialog centering). Six items are open bugs across follow-up configuration, Google Workspace, email sync, and organization invitations. This PRD covers all 10 fixes to bring TSK-0455 to completion.

## Goals

- Hide 3 unreleased settings sections (Task Auto-Sync, Smart Listening, Proactive Agent) from end-user navigation
- Fix off-centre dialog positioning in settings area
- Verify and fix Follow Up Configuration workflows
- Fix Google Workspace service toggle persistence
- Fix Email Sync button functionality
- Fix organization invitation email delivery and role assignment

## User Stories

### US-001: Hide Task Auto-Sync, Smart Listening, and Proactive Agent from Settings
**Description:** As a product owner, I want unreleased features hidden from the settings navigation so that users don't see broken or incomplete functionality.

**Acceptance Criteria:**
- [ ] Task Auto-Sync section is not visible in settings navigation
- [ ] Smart Listening section is not visible in settings navigation
- [ ] Proactive Agent section is not visible in settings navigation
- [ ] Routes to these pages redirect or show 404 if accessed directly
- [ ] No dead links remain in settings sidebar/tabs
- [ ] Typecheck passes

### US-002: Fix Off-Centre Dialogs in Settings
**Description:** As a user, I want dialogs and popups in settings to be properly centred so the UI looks polished.

**Acceptance Criteria:**
- [ ] EmailTrainingWizard dialog (Train from Sent Emails) is centred on screen
- [ ] Other settings dialogs using DialogContent are properly centred
- [ ] Dialogs don't render behind the fixed top bar
- [ ] Typecheck passes
- [ ] Verify in browser on dev server

### US-003: Verify Follow Up Configuration Workflows
**Description:** As a user, I want the Follow Up Configuration (Full Proposal, Quick Followup Email, Client Summary) to work so I can customize my follow-up templates.

**Acceptance Criteria:**
- [ ] "Add Default Workflows" seeds all 3 default workflows
- [ ] Each workflow can be edited and saved
- [ ] Each workflow can be deleted
- [ ] Workflows persist after page refresh
- [ ] Typecheck passes
- [ ] Verify in browser on dev server

### US-004: Fix Google Workspace Service Toggle Persistence
**Description:** As a user, I want to toggle OFF Gmail/Calendar/Drive services and have that setting persist so I can control which Google services are active.

**Acceptance Criteria:**
- [ ] Toggling OFF a service and clicking Save persists the change
- [ ] Returning to the page shows the correct toggle state
- [ ] The `service_preferences` JSONB column on `google_integrations` is properly updated
- [ ] If column doesn't exist, create migration to add it
- [ ] Typecheck passes
- [ ] Verify in browser on dev server

### US-005: Fix Email Sync Button
**Description:** As a user, I want the "Sync Emails" button to actually trigger email synchronization so I can import my emails.

**Acceptance Criteria:**
- [ ] Clicking "Sync Emails" triggers the sync process
- [ ] Progress indicator shows during sync
- [ ] "Emails Synced" count updates after completion
- [ ] If Google is not connected, button is disabled with helpful message
- [ ] Error states are handled with toast feedback
- [ ] Typecheck passes

### US-006: Fix Organization Invitation Role Assignment
**Description:** As an org admin, I want to invite team members with the correct role (Admin or Member) so that permissions are set properly.

**Acceptance Criteria:**
- [ ] Selecting "Member" role saves as "member" in the database (not "admin")
- [ ] Selecting "Admin" role saves as "admin" in the database
- [ ] Invitations list shows the correct role for each invite
- [ ] The role dropdown value is correctly passed to createInvitation service
- [ ] Typecheck passes
- [ ] Verify in browser on dev server

### US-007: Fix Organization Invitation Email Delivery
**Description:** As an org admin, I want invitation emails to actually be delivered so that invited users receive them.

**Acceptance Criteria:**
- [ ] Inviting a user with Admin role sends the invitation email
- [ ] Inviting a user with Member role sends the invitation email
- [ ] The send-router edge function handles invitation emails correctly
- [ ] Error messages are clear when email delivery fails
- [ ] If email provider is not configured, show actionable error message
- [ ] Typecheck passes

## Functional Requirements

- FR-1: Settings navigation must conditionally hide sections based on feature readiness
- FR-2: All Dialog/Sheet components in settings must use proper centering classes
- FR-3: Google Workspace toggle state must round-trip through `service_preferences` JSONB column
- FR-4: Email sync must call the appropriate service/edge function and report results
- FR-5: Invitation service must pass the user-selected role to the database insert
- FR-6: send-router edge function must support organization_invitation email type

## Non-Goals (Out of Scope)

- Building out Task Auto-Sync, Smart Listening, or Proactive Agent features
- Redesigning the settings page layout
- Adding new settings sections
- Email provider (Encharge/SendGrid) configuration — assume it's set up
- Google OAuth flow fixes (already marked complete)

## Technical Considerations

- Settings navigation is likely defined in a settings layout/router file
- Google Workspace uses `google_integrations.service_preferences` JSONB column
- Invitation emails go through `send-router` edge function
- Follow existing patterns: `maybeSingle()` for optional records, explicit column selection
- Branch: `fix/settings-page` (already created from staging)

## Success Metrics

- All 20 subtasks of TSK-0455 are genuinely complete
- No broken or stub functionality visible to end users in settings
- Invitation flow works end-to-end with correct roles

## Open Questions

- Is the email provider (Encharge) configured for staging? If not, invitation emails will fail regardless of code fixes.
- Does the `service_preferences` column exist on `google_integrations` or does it need a migration?
