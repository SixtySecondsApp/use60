# PRD: Copilot Improvements

## Introduction
Address 10 issues identified during testing of the AI Copilot feature. Fixes range from critical security/scoping issues to UI polish improvements.

## Goals
- Fix critical data scoping issue where meetings query returns all org meetings instead of user's meetings
- Resolve template variable interpolation bug in task cards
- Improve response formatting for "catch me up" queries
- Ensure correct date context in email generation
- Filter calendar events to only show meetings with external attendees
- Add real-time context gathering display with data counts
- Fix progress stepper updates during processing
- Polish UI issues (duplicate icons, bot icon branding)
- Expose email tone selection in UI (future enhancement)

## User Stories

### US-001: Fix Recent Calls Query Scoping (CRITICAL)
**Description:** As a user, I want the "recent calls" query to only return MY meetings from the last 2 weeks so that I don't see other team members' private meeting data.

**Acceptance Criteria:**
- [ ] `fetchFathomContext` function accepts `userId` parameter in addition to `orgId`
- [ ] Query filters by `owner_user_id` (not `user_id` - per CLAUDE.md gotcha)
- [ ] Query adds `.gte('start_time', twoWeeksAgo)` filter for last 14 days
- [ ] Caller in `useCopilotContextData` passes userId to `fetchFathomContext`
- [ ] Test: "Summarize my recent calls" returns only current user's meetings
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-002: Fix Task Template Variables Not Resolving
**Description:** As a user, I want task cards to display actual contact names instead of unresolved template variables like `${outputs.lead_data.leads[0].contact.name}`.

**Acceptance Criteria:**
- [ ] Identify root cause: locate where tasks are created with unresolved variables
- [ ] Fix variable interpolation to resolve `${...}` syntax before storing in tasks table
- [ ] Existing tasks with unresolved variables display gracefully (fallback text)
- [ ] New tasks created by workflows have resolved variable values
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-003: Ensure Current Date in Email Prompts
**Description:** As a user, I want generated emails to reference the correct current date so that scheduling suggestions and date references are accurate.

**Acceptance Criteria:**
- [ ] `generateEmailDraft()` function receives current date in context
- [ ] Email prompt includes `TODAY'S DATE: ${todayISO}` instruction
- [ ] Generated emails reference correct dates for "tomorrow", "next week", etc.
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-004: Filter Meetings to Show Only Those With Attendees
**Description:** As a user, I want "next meeting" to only show events where I have someone to meet with, not solo calendar blocks.

**Acceptance Criteria:**
- [ ] Calendar query adds `.not('attendees', 'is', null)` filter
- [ ] Query fetches more events (limit 5+) to find one with attendees
- [ ] Post-query filter ensures at least one non-self attendee
- [ ] "Prep me for my next meeting" returns meeting with external participants
- [ ] Solo events (focus time, reminders) are excluded
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-005: Improve "Catch Me Up" Response Formatting
**Description:** As a user, I want the "catch me up" response to be formatted with clear sections and markdown so it's easy to scan.

**Acceptance Criteria:**
- [ ] "Catch me up" intent handler adds markdown formatting instructions to prompt
- [ ] Response includes `## This Week's Summary` section with bullet points
- [ ] Response includes `## Today's Schedule` section with table format
- [ ] Response includes `## Action Items` section with numbered list
- [ ] Bold formatting used for key numbers and names
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-006: Add Real-Time Context Gathering Display
**Description:** As a user, I want to see counts of data being gathered (e.g., "40 deals / 2 meetings") so I know the Copilot is working with my information.

**Acceptance Criteria:**
- [ ] `useCopilotContextData` returns summary object with counts (dealCount, meetingCount, contactCount, taskCount)
- [ ] `CopilotRightPanel` Context section header displays counts (e.g., "2 deals, 3 meetings")
- [ ] Counts update as context data loads
- [ ] Zero counts show appropriate state (no "0 deals" clutter)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-007: Fix Progress Stepper Updates
**Description:** As a user, I want the Progress section to show actual steps as the AI processes my request, not just "Steps will show as the task unfolds".

**Acceptance Criteria:**
- [ ] Verify state flow: useToolCall.ts -> CopilotContext -> CopilotRightPanel
- [ ] `progressSteps` state updates when tool calls are made
- [ ] Progress indicators animate through pending -> active -> complete states
- [ ] Step labels show actual tool/action names (e.g., "Searching deals", "Analyzing meetings")
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-008: Fix Duplicate Icons in Right Panel
**Description:** As a user, I want distinct icons for Progress and Action Items sections so I can quickly identify each section.

**Acceptance Criteria:**
- [ ] Progress section keeps Zap icon
- [ ] Action Items section uses ListChecks (or CheckSquare) icon instead of Zap
- [ ] Import statement added for new icon
- [ ] Visual distinction is clear between sections
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-009: Change Bot Icon to 60 Logo
**Description:** As a user, I want the Copilot bot messages to show the 60 logo instead of a generic Sparkles icon for brand consistency.

**Acceptance Criteria:**
- [ ] Identify available 60 logo asset in codebase (check /assets, /public)
- [ ] Update ChatMessage.tsx to use local asset instead of Supabase storage URL
- [ ] Fallback to Sparkles only if asset fails to load
- [ ] Bot icon displays consistently across all messages
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-010: Add Email Tone Selection UI (Future Enhancement)
**Description:** As a user, I want to select the tone of voice for generated emails (professional, friendly, concise) so I can match my communication style.

**Acceptance Criteria:**
- [ ] Tone system already exists in api-copilot (professional, friendly, concise)
- [ ] Add tone selector UI element when drafting emails (dropdown or pill buttons)
- [ ] Selected tone is passed to generateEmailDraft() function
- [ ] Default tone is "professional" if not specified
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

## Functional Requirements
- FR-1: All meeting queries must filter by `owner_user_id` to prevent cross-user data exposure
- FR-2: Template variables must be resolved at workflow execution time, not display time
- FR-3: Date context must be included in all time-sensitive AI prompts
- FR-4: Calendar event suggestions must exclude solo events without external attendees
- FR-5: Structured responses must use markdown formatting for readability

## Non-Goals (Out of Scope)
- Refactoring the entire Copilot architecture
- Adding new AI capabilities or intents
- Changing the underlying LLM or prompt engineering approach
- Mobile-specific UI optimizations

## Technical Considerations
- `meetings` table uses `owner_user_id` column (not `user_id`) - critical gotcha
- Template variable syntax mismatch: `{{var}}` in promptVariables.ts vs `${var}` in templates
- Edge function `api-copilot/index.ts` is large (~5000 lines) - targeted changes only
- React Query caching may need invalidation after context data changes

## Success Metrics
- Zero instances of cross-user meeting data exposure
- 100% of task cards display resolved contact names
- "Catch me up" responses render with proper markdown formatting
- User feedback confirms improved Copilot experience
