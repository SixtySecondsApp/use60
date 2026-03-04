# PRD: Support & Docs Page Fixes

## Introduction

Fix all bugs found during Drue's production testing of the Support Centre (/support), Documentation (/docs), and AI Chat assistant pages. Issues include broken markdown rendering, text overflow, missing navigation, DOM nesting warnings, duplicate messages, missing profile photos, and a CORS error on ticket email notifications.

## Goals

- Zero console errors/warnings on Support Centre and Docs pages
- AI Chat renders markdown properly (bold, lists, paragraphs)
- Users can only see their own support tickets
- Support ticket conversations show real profile photos
- All navigation flows complete without dead ends

## User Stories

### US-001: Fix TableOfContents Text Overflow & Duplicate Keys
**Description:** As a user reading docs, I want the "On this page" sidebar to display properly without text going off-screen.

**Acceptance Criteria:**
- [ ] TOC items truncate with ellipsis when text exceeds container width
- [ ] Duplicate heading slugs get unique keys (append `-N` suffix for duplicates)
- [ ] No "Encountered two children with the same key" warning in console
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-002: Add Back Button to Support Page
**Description:** As a user on the Support Centre page, I want a back/home button so I can navigate away.

**Acceptance Criteria:**
- [ ] Back arrow button in the hero area navigates to previous page or dashboard
- [ ] Uses ArrowLeft icon from lucide-react
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-003: Render Markdown in AI Chat Responses
**Description:** As a user chatting with the AI assistant, I want responses to render bold text, lists, and paragraphs properly instead of raw markdown.

**Acceptance Criteria:**
- [ ] Assistant messages use ReactMarkdown with remarkGfm (already installed)
- [ ] `**bold**` renders as bold, lists render as lists, paragraphs have spacing
- [ ] Styling matches existing chat bubble theme (inherits text color, no jarring contrast)
- [ ] Links open in new tab with rel="noopener noreferrer"
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-004: Fix Suggested Questions Double-Send Bug
**Description:** As a user clicking a suggested question in the hero, the AI chat should send exactly one message, not two.

**Acceptance Criteria:**
- [ ] Replace `initialQuerySent` state with a ref tracking last sent query string
- [ ] Clicking a suggested question from the hero sends exactly 1 message
- [ ] Clicking a different suggested question after the first also sends exactly 1 message
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-005: Fix Duplicate Key Warning on Source Articles
**Description:** As a developer, the SupportAIChat should not produce React key warnings.

**Acceptance Criteria:**
- [ ] Source article links use `${article.slug}-${index}` as key instead of `article.id`
- [ ] No "Each child in a list should have a unique key" warning in console
- [ ] Typecheck passes

### US-006: Add User Profile Photos to Ticket Conversation
**Description:** As a user viewing a support ticket conversation, I want to see real profile photos and proper sender labels.

**Acceptance Criteria:**
- [ ] User messages show the user's avatar_url from profiles table (fallback to initials)
- [ ] Agent/admin messages show "System Administrator" label (not "Support Agent")
- [ ] Agent messages use a shield or admin icon instead of generic Bot icon
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-007: Fix SlackChannelSelector Nested Button Warning
**Description:** As a developer, the SlackChannelSelector should not produce DOM nesting warnings.

**Acceptance Criteria:**
- [ ] Clear (X) button inside PopoverTrigger changed from `<button>` to `<span role="button">`
- [ ] No "button cannot appear as descendant of button" warning in console
- [ ] Clear functionality still works (onPointerDown fires correctly)
- [ ] Typecheck passes

### US-008: Fix Support Ticket Email CORS Error
**Description:** As a user creating a support ticket, the email notification should not fail with a CORS error.

**Acceptance Criteria:**
- [ ] Add `send-support-ticket-email` to supabase/config.toml with `verify_jwt = false`
- [ ] Email notification fires without CORS error after ticket creation
- [ ] Ticket still creates successfully even if email fails (fire-and-forget preserved)
- [ ] Typecheck passes

### US-009: Add User ID Filter to Support Tickets Query
**Description:** As a defense-in-depth measure, the support tickets query should explicitly filter by user_id.

**Acceptance Criteria:**
- [ ] useSupportTickets hook adds `.eq('user_id', user.id)` to the query
- [ ] Users only see their own tickets (verified RLS + client filter)
- [ ] Typecheck passes

## Functional Requirements

- FR-1: TableOfContents must truncate text that exceeds the 14rem (w-56) container width
- FR-2: TableOfContents must generate unique keys when multiple headings produce the same slug
- FR-3: Support page hero must include a navigation button (back arrow)
- FR-4: AI Chat assistant messages must render markdown using ReactMarkdown
- FR-5: Suggested question buttons must send exactly one message per click
- FR-6: Ticket conversation must show real user avatars and "System Administrator" for agent messages
- FR-7: SlackChannelSelector must not nest interactive elements
- FR-8: send-support-ticket-email must be configured in config.toml for CORS
- FR-9: Support ticket queries must include user_id filter

## Non-Goals (Out of Scope)

- Rebuilding the support page design from scratch
- Adding new support ticket features (tags, attachments, SLA)
- Modifying the docs-agent edge function behavior
- Adding admin ticket management features
- Stripe/billing integration for support tiers

## Technical Considerations

- `react-markdown` (^10.1.0) and `remark-gfm` already installed — used in DocsPage.tsx
- RLS policies already enforce user-level ticket isolation server-side
- The docs-agent returns plain text with `**bold**` markdown — only frontend rendering needed
- config.toml changes require deployment: `supabase functions deploy send-support-ticket-email --no-verify-jwt`
- No schema changes required
- No new dependencies required

## Success Metrics

- Zero console warnings on /support and /docs pages
- AI Chat bold text renders correctly in 100% of responses
- Support ticket creation succeeds without CORS errors
- All 9 stories pass acceptance criteria and typecheck
