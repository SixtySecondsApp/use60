# Phase 3: @60 Chrome Extension — Gmail + LinkedIn

**Product:** use60
**Date:** 7 February 2026
**Author:** Andrew Bryce
**Status:** Draft
**Depends on:** Phase 1 (Slack), Phase 2 (HubSpot) — copilot engine, webhook handler, action routing, state management all in place

---

## The Problem

After Phases 1 and 2, @60 lives in Slack and HubSpot. But reps still spend significant chunks of their day in two other places: Gmail (reading and writing emails) and LinkedIn (researching prospects, connecting, monitoring activity). Every time a rep is in Gmail or LinkedIn and needs @60, they have to switch to Slack or HubSpot, lose their context, and come back. That friction kills adoption.

The Chrome Extension solves this by injecting @60 directly into the page. The rep stays where they are, and @60 works alongside them.

---

## Why Chrome Extension

A Chrome Extension is the lowest-friction way to bring @60 to Gmail and LinkedIn because:

- No API access needed from Google or LinkedIn — we're injecting UI into the page, not building on their platforms
- No plan tier restrictions (unlike HubSpot Enterprise for App Cards)
- Works for every user regardless of their Gmail or LinkedIn plan
- Single codebase covers both surfaces
- We already have experience building Chrome extensions (LinkedIn Company ID Finder)
- The copilot backend is already built — we're just adding another front door

---

## Architecture

The extension is a thin UI layer. All intelligence lives in Supabase Edge Functions, exactly like Slack and HubSpot.

```
┌─────────────────────────────────────────────────┐
│              Chrome Extension                    │
│                                                  │
│  ┌────────────┐  ┌────────────┐  ┌───────────┐  │
│  │ @60 Side   │  │ Context    │  │ Page      │  │
│  │ Panel      │  │ Extractor  │  │ Injector  │  │
│  └─────┬──────┘  └─────┬──────┘  └─────┬─────┘  │
│        │               │               │         │
└────────┼───────────────┼───────────────┼─────────┘
         │               │               │
         ▼               ▼               ▼
┌─────────────────────────────────────────────────┐
│  Background Service Worker                       │
│                                                  │
│  • Auth state (Supabase session)                 │
│  • Context assembly (page data + use60 data)     │
│  • API calls to Edge Functions                   │
│  • Badge notifications                           │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│  Supabase Edge Functions                         │
│  (Same copilot engine as Slack + HubSpot)        │
│                                                  │
│  /extension/command   → Parse + route to copilot │
│  /extension/action    → Handle button clicks     │
│  /extension/context   → Return use60 context     │
│                        for current page entity   │
└─────────────────────────────────────────────────┘
```

---

## Extension Components

### 1. @60 Side Panel

A persistent side panel that slides in from the right edge of the browser. Activated by:
- Clicking the @60 extension icon in the toolbar
- Keyboard shortcut (configurable, default: `Cmd+Shift+6` / `Ctrl+Shift+6`)
- Clicking an injected @60 button on the page

The side panel contains:
- **Command input** — same natural language input as HubSpot and Slack
- **Context card** — shows what @60 knows about the person/company on the current page
- **Results area** — displays copilot output with action buttons
- **Recent commands** — last 5 interactions for quick reference

The side panel uses Chrome's Side Panel API (Manifest V3), which means it persists as the user navigates between pages and doesn't interfere with page content.

### 2. Context Extractor

A content script that reads the current page and extracts relevant entity data. This runs automatically when the user is on Gmail or LinkedIn.

**Gmail context extraction:**
- Sender name and email address
- Email subject and thread snippet
- Other participants in the thread
- Whether the user is composing, reading, or in the inbox

**LinkedIn context extraction:**
- Profile page: name, title, company, headline, location
- Company page: company name, industry, size, description
- Sales Navigator: lead/account data visible on the page
- Search results: current search parameters

The extractor doesn't scrape full profile data — it reads what's visible on the page and passes it to the copilot, which can then enrich via Apollo and Apify if the user asks.

### 3. Page Injector

Injects small, contextual @60 buttons directly into Gmail and LinkedIn's UI at strategic points.

**Gmail injections:**

| Location | Button | What it does |
|---|---|---|
| Email toolbar (when reading) | "@60" icon button | Opens side panel with email context pre-loaded |
| Compose window (bottom bar) | "Draft with @60" | Opens side panel to help write the email |
| Thread view (below last email) | "Follow up with @60" | Pre-fills command: "write a follow-up to this thread" |

**LinkedIn injections:**

| Location | Button | What it does |
|---|---|---|
| Profile page (below Connect) | "@60" floating button | Opens side panel with profile context pre-loaded |
| Company page (header area) | "@60" floating button | Opens side panel with company context |
| Search results (per result) | Small @60 icon | Opens side panel for that specific person |
| Sales Navigator lead view | "@60" button in sidebar | Opens side panel with lead data |

Injected buttons are styled to feel native to each platform — subtle, not intrusive. They use Gmail's and LinkedIn's design language (colours, spacing, icon style) so they don't look like adware.

---

## Surface 1: Gmail

### Core Use Cases

**Reading an email — "What should I do with this?"**

Rep opens an email from a prospect. They click the @60 button or open the side panel. @60 already knows who the sender is (email match to HubSpot contact), the deal context, and the email content.

```
Side Panel shows:
┌──────────────────────────────────────┐
│ 📧 Email from Sarah Chen             │
│ Acme Corp • VP Sales • £35k deal     │
│ Stage: Proposal Sent                 │
├──────────────────────────────────────┤
│                                      │
│ 💡 @60 suggests:                     │
│ Sarah is asking about pricing for    │
│ the pilot. Based on your last call,  │
│ she's comparing against Outreach.    │
│                                      │
│ [Draft reply] [View deal] [Add note] │
│                                      │
├──────────────────────────────────────┤
│ Type a command...                    │
└──────────────────────────────────────┘
```

**Composing an email — "Help me write this"**

Rep starts composing an email. They click "Draft with @60". The side panel opens with the recipient pre-loaded. The rep types: "write a follow-up referencing our pilot discussion." @60 generates the email body using meeting transcript + tone of voice + deal context, and the rep can insert it directly into the compose window.

**Inbox triage — "What needs my attention?"**

Rep opens Gmail and hits the keyboard shortcut. Types: "what emails need my attention today?" @60 scans recent emails (visible in the inbox, not accessing Gmail API), cross-references with HubSpot deal data, and surfaces the priority items.

### Gmail-Specific Technical Notes

**Content script injection:** Gmail uses dynamic rendering, so the content script needs to observe DOM mutations to detect when the user opens an email, starts composing, or navigates. We use a `MutationObserver` watching for Gmail's known DOM patterns.

**Email content extraction:** When reading an email, the content script extracts the visible email body, sender info, and subject from the DOM. It does NOT access Gmail's API — everything comes from what's rendered on the page.

**Compose insertion:** When @60 generates email copy, the "Insert into email" button uses `document.execCommand('insertText')` or clipboard injection to paste the content into Gmail's compose editor at the cursor position.

**No Gmail API dependency:** The extension works entirely through DOM interaction. This means no OAuth with Google, no Gmail API scopes, no permission prompts beyond the standard Chrome Extension permissions. The user installs the extension and it works.

---

## Surface 2: LinkedIn

### Core Use Cases

**Viewing a prospect profile — "Tell me about this person"**

Rep lands on a LinkedIn profile. The @60 button appears below the "Connect" button. They click it. The side panel opens with the profile context extracted from the page.

```
Side Panel shows:
┌──────────────────────────────────────┐
│ 👤 James Wright                      │
│ CRO at TechCorp • London             │
├──────────────────────────────────────┤
│                                      │
│ 📊 use60 knows:                      │
│ • In HubSpot: Deal "TechCorp Pilot"  │
│   Stage: Demo Scheduled • £22k       │
│ • Last meeting: 12 days ago          │
│ • No follow-up sent yet ⚠️           │
│                                      │
│ [Draft follow-up] [Enrich contact]   │
│ [Add to campaign] [Prep for meeting] │
│                                      │
├──────────────────────────────────────┤
│ 🔍 From this page:                   │
│ • Recent post about "AI in RevOps"   │
│ • Previously at DataFlow (3 years)   │
│ • 500+ connections                   │
│                                      │
├──────────────────────────────────────┤
│ Type a command...                    │
└──────────────────────────────────────┘
```

**Researching before a connection request — "Should I connect?"**

Rep finds someone in search results. Clicks the @60 icon on that result. Side panel shows whether this person matches their ICP, whether they're already in HubSpot, and suggests a personalised connection message based on business context and what's visible on their profile.

**Company research — "What do we know?"**

Rep visits a company page. @60 automatically shows:
- Whether any contacts from this company are in HubSpot
- Active deals with this company
- ICP match score
- Quick actions: "Find decision makers", "Company intel", "Start sequence"

**Sales Navigator integration**

If the rep is using Sales Navigator, the context extractor reads the richer lead/account data visible on the page (lead status, account tier, notes). This gives @60 even more context without needing a Sales Navigator API integration.

### LinkedIn-Specific Technical Notes

**DOM injection challenges:** LinkedIn's UI is React-based with obfuscated class names that change between deployments. The injector needs to use stable selectors — data attributes, ARIA roles, and structural patterns rather than class names. We maintain a selector map that can be updated without a full extension release.

**Rate limiting awareness:** The extension does NOT make any requests to LinkedIn's servers. All data comes from what's already rendered on the page. The Apify enrichment only runs if the user explicitly triggers it from the side panel. This keeps us within LinkedIn's terms of service.

**Sales Navigator detection:** The content script detects whether the user is on regular LinkedIn or Sales Navigator based on URL patterns (`linkedin.com/in/` vs `linkedin.com/sales/`) and adapts the context extraction and button injection accordingly.

---

## Cross-Surface Intelligence

The extension has access to the same unified context as Slack and HubSpot:

| From the page | From use60 (via Edge Functions) |
|---|---|
| Sender email / profile name | HubSpot contact match |
| Email content / thread | Deal stage and pipeline |
| LinkedIn profile data | Meeting history and transcripts |
| Company information | Business context and ICP |
| Visible activity/posts | Tone of voice and email sign-off |
| | Campaign membership |
| | Previous @60 interactions |

**Contact matching:** When the context extractor finds an email address (Gmail) or a name + company (LinkedIn), the background service worker calls `/extension/context` which looks up the entity in HubSpot via the existing sync and returns the full use60 context.

**Match confidence:** Email matches are high confidence. Name + company matches may return multiple candidates — in that case, the side panel shows the top match with a "Not the right person?" option to search manually.

---

## Actions From the Extension

Every action available in Slack and HubSpot is available from the extension. The most common ones for each surface:

### Gmail Actions

| Action | What happens |
|---|---|
| Draft reply | Copilot generates reply using email thread + deal context + tone. "Insert into email" pastes it into compose |
| Draft follow-up | Generates a new email to the thread participants. Opens Gmail compose with content pre-filled |
| Summarise thread | Copilot summarises the email thread with key decisions, open questions, and suggested next steps |
| Add note to CRM | Creates a HubSpot note on the contact/deal record with selected email content |
| Create task | Creates a HubSpot task linked to the contact/deal |
| Enrich contact | Runs Apollo + Gemini enrichment, updates HubSpot record |

### LinkedIn Actions

| Action | What happens |
|---|---|
| Draft connection message | Generates a personalised connection request based on profile data + business context |
| Enrich contact | Runs full enrichment (Apollo + Apify + Gemini Flash) from what's visible on the profile |
| Add to campaign | Enriches email if missing, adds to Instantly campaign with personalised sequence |
| Find similar profiles | Triggers Apollo lookalike search based on this person's attributes |
| Draft InMail / message | Generates a personalised outreach message |
| Save to HubSpot | Creates or updates a HubSpot contact from the LinkedIn profile data |
| Company intel | Generates full company research brief using visible company page data + Apollo + Apify |

### Universal Actions (Both Surfaces)

| Action | What happens |
|---|---|
| @60 [any command] | Free-form command routed to copilot with page context |
| What should I focus on? | On-demand priority list from the morning briefing engine |
| Prep me for [meeting] | Pre-meeting prep sequence triggered from the side panel |

---

## Authentication

The extension needs to know which use60 user is signed in. Two approaches, in order of preference:

**Option A: Supabase session sharing**
If the user is already signed into use60 in the browser, the extension can read the Supabase session from cookies/localStorage on the use60 domain. The background service worker accesses this via `chrome.cookies` API. No separate login needed — if you're signed into use60, the extension just works.

**Option B: Extension popup login**
If no session is found, clicking the extension icon shows a small login form (email + password or magic link) that authenticates against Supabase Auth. The session is stored in `chrome.storage.session` and persists until the browser closes.

Recommendation: implement both. Option A is the zero-friction default. Option B is the fallback.

---

## Backend: Supabase Edge Functions

Three new Edge Functions, following existing patterns:

### /extension/command

Receives commands from the side panel. Identical flow to `/hubspot-command` — enrich context, route to copilot, return result (or write to Realtime for async results).

```
POST /extension/command
Body: {
  command: "draft a reply to this email",
  page_context: {
    surface: "gmail",               // or "linkedin"
    entity_type: "email_thread",    // or "linkedin_profile", "linkedin_company"
    extracted_data: {
      sender_email: "sarah@acme.com",
      subject: "Re: Pilot pricing",
      snippet: "Thanks for the proposal. Quick question on the per-seat pricing...",
      thread_participants: ["sarah@acme.com", "tom@acme.com"]
    }
  },
  user_id: "user_abc",
  org_id: "org_xyz"
}
```

### /extension/context

Returns use60's knowledge about the entity currently on screen. Called automatically when the side panel opens or the page changes.

```
GET /extension/context?email=sarah@acme.com&org_id=org_xyz

Response: {
  match: "high_confidence",
  hubspot_contact: {
    name: "Sarah Chen",
    company: "Acme Corp",
    title: "VP Sales",
    hubspot_id: "12345"
  },
  deal: {
    name: "Acme Corp Pilot",
    stage: "Proposal Sent",
    value: 35000,
    last_activity: "2026-01-28"
  },
  last_meeting: {
    date: "2026-01-28",
    summary: "Discussed pilot scope...",
    open_actions: ["Send pricing comparison"]
  },
  campaigns: [],
  suggestions: [
    { type: "follow_up", reason: "Meeting 10 days ago, no follow-up sent" }
  ]
}
```

### /extension/action

Handles button clicks from the side panel. Identical pattern to Phase 1 and 2 action handlers.

---

## Database Additions

Minimal — the extension uses the same state tables as Phases 1 and 2 with a new `surface` value.

```sql
-- Add 'chrome_gmail' and 'chrome_linkedin' as surface values
-- to existing copilot_commands and pending_actions tables

-- Extension-specific: track which pages the user has interacted with @60 on
create table extension_page_interactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id),
  user_id uuid references users(id),
  surface text not null, -- 'gmail', 'linkedin', 'linkedin_sales_nav'
  entity_type text not null, -- 'email_thread', 'linkedin_profile', 'linkedin_company'
  entity_identifier text not null, -- email address, linkedin URL, or company URL
  hubspot_match_id text, -- matched HubSpot record if found
  interaction_count integer default 1,
  last_command text,
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now()
);
```

This table helps @60 learn which prospects the rep is actively researching, feeding back into the proactive intelligence engine.

---

## Extension Manifest (V3)

```json
{
  "manifest_version": 3,
  "name": "use60 — AI Sales Copilot",
  "version": "1.0.0",
  "description": "@60 everywhere you work. AI-powered follow-ups, enrichment, and pipeline intelligence in Gmail and LinkedIn.",
  "permissions": [
    "activeTab",
    "sidePanel",
    "storage",
    "cookies"
  ],
  "host_permissions": [
    "https://mail.google.com/*",
    "https://www.linkedin.com/*",
    "https://*.use60.com/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://mail.google.com/*"],
      "js": ["content-scripts/gmail.js"],
      "css": ["content-scripts/gmail.css"]
    },
    {
      "matches": ["https://www.linkedin.com/*"],
      "js": ["content-scripts/linkedin.js"],
      "css": ["content-scripts/linkedin.css"]
    }
  ],
  "side_panel": {
    "default_path": "sidepanel/index.html"
  },
  "action": {
    "default_icon": "icons/icon-48.png",
    "default_title": "@60"
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

---

## Frontend: Extension Build

The side panel is a small React app bundled with Vite (consistent with your existing frontend tooling).

```
extension/
├── manifest.json
├── background.js                    # Service worker: auth, API calls, badge
├── content-scripts/
│   ├── gmail.js                     # Gmail DOM observer + button injector
│   ├── gmail.css                    # Injected button styles (Gmail-native look)
│   ├── linkedin.js                  # LinkedIn DOM observer + button injector
│   ├── linkedin.css                 # Injected button styles (LinkedIn-native look)
│   └── shared/
│       ├── context-extractor.js     # Reads page data, sends to service worker
│       └── button-injector.js       # Generic injection utility
├── sidepanel/
│   ├── index.html
│   ├── src/
│   │   ├── App.tsx                  # Side panel root
│   │   ├── components/
│   │   │   ├── CommandInput.tsx     # @60 text input
│   │   │   ├── ContextCard.tsx      # Entity context display
│   │   │   ├── ResultsPanel.tsx     # Copilot output + action buttons
│   │   │   ├── ActionButtons.tsx    # Approve / Edit / Dismiss
│   │   │   ├── SuggestionBanner.tsx # Proactive suggestions
│   │   │   └── LoginForm.tsx        # Fallback auth
│   │   ├── hooks/
│   │   │   ├── usePageContext.ts    # Listens to content script messages
│   │   │   ├── useAuth.ts          # Supabase session management
│   │   │   ├── useCopilot.ts       # Command submission + result streaming
│   │   │   └── useRealtimeResult.ts # Supabase Realtime for async results
│   │   └── utils/
│   │       └── api.ts              # Edge Function calls
│   └── vite.config.ts
└── icons/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

**Build pipeline:** Vite bundles the side panel into static assets. Content scripts and the service worker are plain JS (no bundler needed for these). A build script packages everything into a `.zip` for Chrome Web Store submission.

---

## Build Sequence

### Sprint 1 (Weeks 1–2): Extension Shell + Gmail Context

**Goal:** Extension installs, side panel opens, Gmail context is extracted and matched to HubSpot contacts.

| Task | Detail |
|---|---|
| Manifest V3 setup | Permissions, content scripts, side panel registration |
| Background service worker | Supabase auth (session sharing + fallback login) |
| Side panel React app | Command input, context card, basic results area |
| Gmail content script | MutationObserver for email open/compose, extract sender + subject + snippet |
| Context matching | `/extension/context` Edge Function — email → HubSpot lookup → return deal/contact data |
| Gmail button injection | @60 icon in email toolbar, "Draft with @60" in compose bar |

**Definition of done:** Install extension, open an email in Gmail, see the sender's HubSpot deal context in the side panel without clicking anything.

---

### Sprint 2 (Weeks 3–4): Gmail Actions + Compose Integration

**Goal:** Rep can draft replies, follow-ups, and take CRM actions from within Gmail.

| Task | Detail |
|---|---|
| `/extension/command` Edge Function | Receive commands with page context, route to copilot |
| Draft reply action | Copilot generates reply, "Insert into email" button pastes into Gmail compose |
| Draft follow-up action | Generates new email, opens Gmail compose with content |
| Compose insertion | `execCommand` or clipboard injection into Gmail's editor |
| Summarise thread action | Copilot reads visible thread content, returns summary |
| CRM actions | Add note, create task — write to HubSpot via existing API client |
| `/extension/action` Edge Function | Handle button clicks, reusing Phase 1/2 action handler pattern |

**Definition of done:** Rep reads an email, clicks "Draft reply", copilot generates a tone-matched reply using deal context, rep clicks "Insert", reply appears in Gmail's compose editor ready to send.

---

### Sprint 3 (Weeks 5–6): LinkedIn Surface

**Goal:** @60 works on LinkedIn profile pages, company pages, and Sales Navigator.

| Task | Detail |
|---|---|
| LinkedIn content script | DOM observer for profile/company/search pages, extract visible data |
| LinkedIn button injection | @60 buttons on profiles, company pages, search results |
| Selector resilience | Use ARIA roles + structural patterns, not class names. Selector map in config |
| Profile context matching | Name + company → HubSpot lookup (handle ambiguous matches) |
| LinkedIn-specific actions | Enrich contact, add to campaign, draft connection message, save to HubSpot, company intel |
| Sales Navigator detection | URL-based detection, richer context extraction from SN lead views |

**Definition of done:** Rep visits a LinkedIn profile, side panel shows HubSpot deal context + profile data from the page, rep clicks "Add to campaign", contact is enriched and added to an Instantly campaign with a personalised sequence.

---

### Sprint 4 (Weeks 7–8): Proactive Intelligence + Polish

**Goal:** The extension proactively surfaces suggestions, and the experience is polished for Chrome Web Store.

| Task | Detail |
|---|---|
| Proactive suggestion banner | When side panel opens, show @60 suggestions for the current entity (overdue follow-up, deal risk, etc.) |
| Extension badge notifications | Background worker checks for pending actions, shows badge count on icon |
| Page interaction tracking | Log which prospects the rep is researching (feeds proactive engine) |
| Keyboard shortcut | Cmd+Shift+6 opens side panel |
| Cross-surface sync | Actions from extension appear in Slack and HubSpot, and vice versa |
| LinkedIn selector monitoring | Automated tests to detect when LinkedIn changes their DOM structure |
| Performance optimisation | Lazy-load side panel, debounce context extraction, cache HubSpot lookups |
| Chrome Web Store prep | Screenshots, description, privacy policy, review submission |

**Definition of done:** Extension runs smoothly on Gmail and LinkedIn without performance impact, proactively surfaces relevant suggestions, all actions sync across Slack/HubSpot/extension, ready for Chrome Web Store review.

---

## Distribution

### Phase 3a: Private Distribution (Immediate)

Distribute the extension to your own team and beta users via:
- Direct `.crx` file or unpacked extension for testing
- Chrome Web Store as an "unlisted" extension (accessible via direct link only)
- No public listing, no review queue delay

### Phase 3b: Public Distribution (Post-Stabilisation)

Once stable with 10+ beta users:
- Submit to Chrome Web Store for public listing
- Requires privacy policy, data handling disclosure, screenshots
- Chrome review typically takes 1–3 business days
- Listing includes use60 branding, feature description, and link to sign up

### Future: Firefox / Edge

Manifest V3 is largely compatible across Chromium-based browsers (Edge, Brave, Opera). Firefox has minor differences but the same architecture works. Plan for Chrome first, port later if demand justifies it.

---

## Privacy & Compliance

This matters for Chrome Web Store review and user trust.

**What the extension reads:**
- Visible page content on Gmail and LinkedIn only (sender info, email body, profile data)
- use60 session cookies for authentication

**What the extension does NOT do:**
- Does not access Gmail API or LinkedIn API
- Does not read emails the user hasn't opened
- Does not scrape LinkedIn profiles in the background
- Does not access any pages outside of Gmail and LinkedIn
- Does not store email content or LinkedIn data locally — everything is sent to use60's Edge Functions for processing and discarded after the response
- Does not run when the user is not on Gmail or LinkedIn

**Privacy policy requirements:**
- Disclose that the extension reads visible page content on Gmail and LinkedIn
- Disclose that data is sent to use60's servers for AI processing
- Confirm data is not sold or shared with third parties
- Confirm compliance with Chrome Web Store's user data policy

---

## Success Metrics

| Metric | What it measures | Target |
|---|---|---|
| Extension installs (beta) | Initial adoption | 20+ within first month |
| Daily active users | Are reps using it regularly? | >60% of installed base |
| Side panel opens per day per user | Engagement depth | 5+ per active user |
| Gmail actions per day | Email productivity impact | 3+ drafts/replies per user |
| LinkedIn actions per day | Prospecting impact | 2+ enrichments or campaign adds per user |
| "Insert into email" usage | Is the compose integration working? | >50% of drafted replies get inserted |
| Context match rate | Are we finding the right HubSpot contacts? | >80% automatic match on email, >60% on LinkedIn |
| Cross-surface adoption | Are reps using @60 across all surfaces? | >30% of users active on 3+ surfaces |

---

## What This Completes

After Phase 3, @60 lives everywhere a rep works:

| Surface | How reps interact | Phase |
|---|---|---|
| **Slack** | @60 commands, proactive alerts, interactive follow-ups | Phase 1 |
| **HubSpot** | Command input, quick actions, CRM cards, timeline events | Phase 2 |
| **Gmail** | Draft replies, follow-ups, thread summaries, CRM actions | Phase 3 |
| **LinkedIn** | Enrich prospects, add to campaigns, draft messages, company intel | Phase 3 |
| **use60 platform** | Full ops table, campaign management, analytics, settings | Core |

The rep never needs to context-switch to get value from use60. @60 is always there, always knows the context, and always has working buttons. That's the product.