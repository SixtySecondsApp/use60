# Block Types and Limits Reference

Comprehensive reference for all Slack Block Kit block types, elements, and their constraints. Our `slackBlocks.ts` primitive builders auto-truncate to these limits.

## Block Types

### header
- **Purpose**: Top-level title for a message
- **Text limit**: 150 characters (plain_text only, no mrkdwn)
- **Builder**: `header(text)` — auto-truncates via `safeHeaderText()`
- **Usage**: One per message, always first block

### section
- **Purpose**: Primary content block with markdown support
- **Text limit**: 3000 characters (mrkdwn supported)
- **Fields**: Up to 10 field objects, each max 2000 chars
- **Accessory**: Optional single element (button, image, overflow, datepicker)
- **Builders**:
  - `section(text)` — auto-truncates via `safeMrkdwn()`
  - `sectionWithFields(fields)` — 2-column grid, max 10 fields
  - `sectionWithButton(text, btnText, actionId, value, style?)` — section + button accessory
  - `sectionWithImage(text, imageUrl, altText)` — section + image accessory

### context
- **Purpose**: Metadata, timestamps, attribution, footnotes
- **Element limit**: 10 elements max
- **Text limit**: 2000 chars per element (supports mrkdwn and image elements)
- **Builder**: `context(elements)` — auto-truncates, accepts string[] or mixed elements
- **Usage**: Bottom of message for timestamps, "Powered by" lines, metadata

### actions
- **Purpose**: Interactive buttons, selects, date pickers
- **Element limit**: 25 elements max (recommend 3-5 buttons)
- **Builder**: `actions(buttons)` — accepts button element array
- **Usage**: CTAs at bottom of message content, before context

### divider
- **Purpose**: Horizontal rule separator
- **Builder**: `divider()`
- **Usage**: Between distinct content groups only — use sparingly

### image (top-level)
- **Purpose**: Full-width image block
- **URL limit**: Must be HTTPS, publicly accessible
- **Alt text**: Required, max 2000 chars
- **Title**: Optional, max 2000 chars (plain_text only)

### input (modals only)
- **Purpose**: Form inputs in modal views
- **Label limit**: 2000 chars
- **Not used** in chat messages — only in modal surfaces

### rich_text
- **Purpose**: Formatted text with lists, quotes, code blocks
- **Usage**: Advanced formatting — prefer section with mrkdwn for simplicity

## Element Types

### button
- **Text limit**: 75 characters (plain_text only)
- **Value limit**: 2000 characters
- **Styles**: `primary` (green), `danger` (red), default (gray)
- **Rule**: Max 1 primary button per actions block
- **Constraint**: `value` and `url` are mutually exclusive — use `url` for external links only

### overflow
- **Purpose**: "..." menu for secondary actions
- **Options**: 2-5 items, each max 75 chars text + 3000 chars value
- **Usage**: When you need 4+ actions but want compact UI

### static_select / external_select
- **Purpose**: Dropdown menus
- **Options limit**: 100 items max
- **Usage**: Rare in notifications — more common in interactive workflows

### datepicker / timepicker
- **Purpose**: Date/time selection
- **Usage**: Scheduling flows, rare in notification messages

## Message-Level Limits

| Constraint | Limit |
|-----------|-------|
| Blocks per message | 50 |
| Total payload size | 50 KB |
| Attachments | 20 per message |
| Text field (top-level) | 40,000 chars |
| Unfurl limit | 5 URLs auto-unfurled |

## Recommended Limits (Sales Messages)

| Message Type | Block Count | Buttons |
|-------------|-------------|---------|
| Alert/notification | 4-6 | 1-2 |
| Meeting briefing | 8-12 | 2-3 |
| Coaching feedback | 6-10 | 1-2 |
| Weekly digest | 12-20 | 2-3 |
| HITL approval | 5-8 | 2-3 (approve/reject/edit) |
| Deal stage change | 4-6 | 1-2 |
| Win/loss celebration | 6-8 | 1 |

## action_id Convention

Format: `{domain}_{action}_{entityId}`

Examples:
- `meeting_view_abc123` — View meeting details
- `coaching_details_def456` — View coaching analysis
- `deal_open_ghi789` — Open deal in app
- `hitl_approve_jkl012` — Approve HITL action
- `hitl_reject_jkl012` — Reject HITL action
- `hitl_edit_jkl012` — Edit HITL draft

## Mrkdwn Formatting

| Syntax | Renders |
|--------|---------|
| `*bold*` | **bold** |
| `_italic_` | _italic_ |
| `~strike~` | ~~strike~~ |
| `` `code` `` | `code` |
| `> quote` | blockquote |
| `• item` | bullet point |
| `<url\|text>` | hyperlink |
| `<@U12345>` | user mention |
| `<!here>` | @here mention |
| `<!channel>` | @channel mention |

## Auto-Truncation Helpers

Our `slackBlocks.ts` provides safety wrappers:

| Helper | Limit | Usage |
|--------|-------|-------|
| `safeHeaderText(text)` | 150 chars | Header blocks |
| `safeMrkdwn(text)` | 2800 chars | Section text (with buffer) |
| `safeButtonText(text)` | 75 chars | Button labels |
| `safeFieldText(text)` | 1900 chars | Field values |

Always use these instead of raw string truncation — they handle edge cases like mid-emoji truncation and add ellipsis markers.
