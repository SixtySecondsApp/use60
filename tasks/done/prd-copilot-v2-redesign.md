# PRD: Copilot V2 Redesign

## Introduction

Transform the existing Sales Copilot from a single-panel chat interface into a brilliant two-panel experience with Action Items, Context awareness, and 100vh viewport compliance. The goal is to make the Copilot feel like talking to a teammate who's been in every meeting and knows your HubSpot inside out.

**Guiding Principle**: Make what we have brilliant before adding anything new.

## Goals

- Replace the "Artifacts" concept with actionable "Action Items" (human-in-the-loop approval queue)
- Enforce 100vh viewport height — chat input always visible, no page scroll
- Show Context panel displaying HubSpot + Fathom data the AI is using (builds trust)
- Display Connected integrations panel with status indicators
- Reduce welcome state actions from 6 to 4 (only capabilities we deliver well)
- Update quick prompts to match actual Copilot capabilities

## User Stories

### US-001: Implement 100vh Layout Container

**Description:** As a user, I want the Copilot interface to fit entirely within my viewport so that the chat input is always visible without scrolling the page.

**Acceptance Criteria:**
- [ ] CopilotLayout container uses `h-screen` / `100vh` with `overflow-hidden`
- [ ] Chat messages area scrolls internally within a flex container
- [ ] Chat input area has `flex-shrink-0` and is always visible at bottom
- [ ] Right panel scrolls independently from chat area
- [ ] Layout works on common screen sizes (1280x720, 1920x1080, 2560x1440)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-002: Create Right Panel Shell with Tab Structure

**Description:** As a user, I want a right sidebar panel on the Copilot page so that I can see Action Items, Context, and Connected integrations.

**Acceptance Criteria:**
- [ ] Right panel is 320px wide with border-left separator
- [ ] Panel contains three collapsible sections: Action Items, Context, Connected
- [ ] Each section has header with icon and optional count badge
- [ ] Sections are independently scrollable if content overflows
- [ ] Panel respects the 100vh constraint
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-003: Build Action Items Panel with Empty State

**Description:** As a user, I want to see an Action Items panel that shows pending actions the AI has prepared for my approval.

**Acceptance Criteria:**
- [ ] Action Items section shows count badge in header (e.g., "Action Items (2)")
- [ ] Empty state displays: "No pending actions. Ask me to draft a follow-up or prep for a meeting."
- [ ] Panel uses the ActionItem TypeScript interface from the brief
- [ ] Styling matches the design.jsx glassmorphic dark theme
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-004: Implement Action Item Card Component

**Description:** As a user, I want each Action Item to display as a card with preview text and action buttons so I can quickly review and approve AI-generated actions.

**Acceptance Criteria:**
- [ ] Card shows icon based on type (email, meeting-prep, crm-update, reminder)
- [ ] Card displays title, preview snippet, and timestamp ("Generated 2m ago")
- [ ] Card has three action buttons: Preview, Edit, Approve (or Approve & Send for emails)
- [ ] Hover state highlights the card with violet border
- [ ] Card is keyboard accessible (focusable, Enter to expand)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-005: Build Action Item Preview Modal

**Description:** As a user, I want to click "Preview" on an Action Item to see the full content in a modal so I can review it before approving.

**Acceptance Criteria:**
- [ ] Modal opens with full action content (email body, meeting brief, etc.)
- [ ] Modal has Edit, Approve, and Dismiss buttons in footer
- [ ] Dismiss button shows feedback options ("Not relevant" / "Bad timing")
- [ ] Modal closes on Escape key or clicking outside
- [ ] Modal is responsive and doesn't exceed viewport
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-006: Build Context Panel with Data Sources

**Description:** As a user, I want to see what data the Copilot is using (HubSpot, Fathom, Calendar) so I can trust its responses are grounded in real information.

**Acceptance Criteria:**
- [ ] Context section shows HubSpot data: company name, deal value, contact name/role, activity count
- [ ] Context section shows Fathom data: call count, last call date/duration, key insight
- [ ] Context section shows Calendar data: next meeting date/time
- [ ] Each source is clickable to show more detail or link out
- [ ] Icons match integration branding (orange for HubSpot, microphone for Fathom, calendar for Calendar)
- [ ] Empty state shows when no context is loaded
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-007: Build Connected Integrations Panel

**Description:** As a user, I want to see which integrations are connected so I know what data sources the Copilot can access.

**Acceptance Criteria:**
- [ ] Shows compact row of integration icons with checkmarks for connected status
- [ ] Integrations shown: HubSpot, Fathom, Slack, Calendar (only these 4)
- [ ] Green dot indicator for connected integrations
- [ ] "Add connector" button links to settings/integrations page
- [ ] Disconnected integrations show gray/muted state
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-008: Update Welcome State with 4 Suggested Actions

**Description:** As a user, I want to see 4 relevant suggested actions when I first open Copilot so I can quickly start a useful workflow.

**Acceptance Criteria:**
- [ ] Shows exactly 4 action cards in a 2x2 grid (not 6)
- [ ] Actions are: Draft a follow-up, Prep for a meeting, What needs attention?, Catch me up
- [ ] Each card has icon, label, and short description
- [ ] Cards use gradient backgrounds matching design.jsx
- [ ] Clicking a card starts the corresponding workflow
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-009: Update Quick Prompts to Match Capabilities

**Description:** As a user, I want the suggested prompts to reflect what the Copilot can actually do well so my first experience is successful.

**Acceptance Criteria:**
- [ ] Quick prompts updated to: "Draft follow-ups for today's meetings", "What did [contact] say about budget?", "Which deals haven't moved in 2 weeks?", "Prep me for my 3pm call", "Summarise my calls with [company]", "What action items am I behind on?"
- [ ] Prompts are generated dynamically where possible (contact names, meeting times)
- [ ] Clicking a prompt auto-sends it (current behavior maintained)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-010: Create ActionItem TypeScript Types and Store

**Description:** As a developer, I want TypeScript types and a Zustand store for Action Items so the feature has proper type safety and state management.

**Acceptance Criteria:**
- [ ] ActionItem interface matches the brief: id, type, status, title, preview, content, context, createdAt, actions
- [ ] ActionItemType union: 'follow-up' | 'meeting-prep' | 'crm-update' | 'reminder'
- [ ] ActionItemStatus union: 'pending' | 'approved' | 'dismissed' | 'edited'
- [ ] Zustand store with: items array, addItem, updateItem, removeItem, approveItem, dismissItem
- [ ] Store persists to localStorage for session continuity
- [ ] Typecheck passes

---

### US-011: Wire Action Item Approval Flow

**Description:** As a user, I want to approve an Action Item and have it execute (send email, update CRM, etc.) so the Copilot can take action on my behalf.

**Acceptance Criteria:**
- [ ] "Approve & Send" on follow-up emails triggers email send via existing email integration
- [ ] If email not configured, falls back to pushing draft to Slack DM
- [ ] "Approve" on CRM updates triggers HubSpot API call
- [ ] Success shows toast notification and moves item to completed state
- [ ] Failure shows error toast and keeps item in pending state
- [ ] Approved items are removed from the panel (or moved to completed section)
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

---

### US-012: Integrate Context Panel with CopilotContext

**Description:** As a developer, I want the Context panel to pull data from the existing CopilotContext so it reflects the current conversation's data sources.

**Acceptance Criteria:**
- [ ] Context panel reads from useCopilot() context state
- [ ] When user asks about a contact/deal, Context panel updates to show that entity
- [ ] HubSpot data pulled from existing hubspotService
- [ ] Fathom data pulled from existing meeting/transcript queries
- [ ] Calendar data pulled from existing calendar integration
- [ ] Context updates in real-time as conversation progresses
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

## Functional Requirements

- FR-1: The Copilot page must render within 100vh without page-level scrolling
- FR-2: The right panel must be collapsible on mobile (<768px) with a toggle button
- FR-3: Action Items must persist across page refreshes within the same session
- FR-4: The Context panel must update dynamically based on conversation context
- FR-5: All interactive elements must be keyboard accessible
- FR-6: The interface must work in both light and dark modes (dark mode primary)

## Non-Goals (Out of Scope)

- Salesforce integration
- Additional CRMs beyond HubSpot
- Email providers beyond what's connected
- Enrichment/research tools
- Sequence builders
- Creating new contacts/deals from Copilot
- Bulk CRM updates
- Workflow automation
- Custom property management in HubSpot

## Technical Considerations

- **Existing Components**: Reuse AssistantShell for chat, ChatMessage for messages, CopilotLayout as wrapper
- **State Management**: Add actionItemsStore (Zustand) alongside existing copilotStore
- **API Integration**: Leverage existing hubspotService, fathomService (if exists), calendar integration
- **Styling**: Use existing Tailwind config, Radix UI primitives, glassmorphic dark theme from design.jsx
- **Performance**: Right panel should not re-render on every chat message; use React.memo appropriately

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Action Items generated/day | 5+ per active user | Count in Zustand store / analytics |
| Approval rate | >60% | Approved / Generated |
| Time to approval | <5 min | Timestamp delta |
| Follow-ups sent via Copilot | 10+/week per user | Tracking via email integration |
| Layout compliance | 100vh on all tested viewports | Manual QA |
