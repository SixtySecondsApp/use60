# Consult Report: Smart Listening — Account Intelligence & Intent Signals
Generated: 2026-02-07

## User Request
> Can we come up with smart listening that can know the latest on top accounts? Push intent signals and changes at key accounts to reps (like news, job changes, or custom research prompts) to cut manual work and boost conversion.

## Clarifications
- **Delivery**: In-app (Ops table) + Slack for high-priority signals
- **Signal sources**: All three — Apollo signals, custom AI research prompts, web/news scraping
- **Account scope**: Manual watchlist + auto-monitor from open deals
- **Default frequency**: Weekly (Monday morning, before morning brief)
- **User control**: Users can adjust frequency per-account with explicit cost/credit warnings before increasing

---

## Agent Findings

### 1. Codebase Scout — Existing Assets

#### Directly Reusable Infrastructure

| Asset | Path | Relevance |
|-------|------|-----------|
| **Proactive notification engine** | `supabase/functions/_shared/proactive/` | Full Slack+in-app delivery, deduplication, cooldowns, recipient resolution — plug new signal types directly in |
| **Apollo search API** | `supabase/functions/apollo-search/index.ts` | Already calls `/v1/mixed_people/api_search` — extend for people change monitoring |
| **Apollo person enrichment** | `supabase/functions/apollo-enrich/index.ts` | Caches full Apollo response in `source_data.apollo` — can diff snapshots for change detection |
| **Apollo org enrichment** | `supabase/functions/apollo-org-enrich/index.ts` | Company-level data (funding, headcount, tech stack) — diff for company-level signals |
| **Apollo credits tracking** | `supabase/functions/apollo-credits/index.ts` | Rate limit awareness — critical for periodic monitoring budget |
| **Slack Block Kit builders** | `supabase/functions/_shared/slackBlocks.ts` | 150+ lines of reusable blocks — add `buildAccountSignalMessage()` template |
| **Cron job pattern** | `api/cron/slack-deal-risk-alert.ts` | Standard Vercel cron → Supabase edge function pattern — copy for account monitor |
| **Ops table system** | `src/components/ops/OpsTable.tsx`, `OpsTableCell.tsx` | 15+ column types, virtualized rendering, inline actions — add `signal` column type |
| **ICP profile generation** | `supabase/functions/generate-icp-profiles/index.ts` | AI-generated ICPs with Apollo filters — potential auto-watchlist source |
| **Deal risk detection** | `supabase/functions/deal-analyze-risk-signals/index.ts` | Signal detection + evidence pattern — reuse for account-level signals |
| **Relationship health scoring** | `relationship_health_scores` table | Per-contact health tracking — extend to per-account aggregate |
| **Company enrichment (Perplexity)** | `supabase/functions/enrich-company/index.ts` | AI web search for company intel — directly reusable for news/research signals |

#### Gaps Identified
- No `account_watchlist` or `account_signals` tables
- No periodic re-enrichment / change detection system
- No web scraping edge function (only Perplexity-based AI search)
- No "signal" column type in Ops table
- No account-level health aggregation (only contact-level)

### 2. Patterns Analyst — Conventions to Follow

#### Edge Function Pattern (from `slack-morning-brief/index.ts`)
```typescript
// Auth: cron secret OR service role
const isCronAuth = verifyCronSecret(req, cronSecret);
const isServiceRole = isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY);
if (!isCronAuth && !isServiceRole) return errorResponse('Unauthorized', req, 401);

// Use proactive engine for delivery
import { getSlackOrgSettings, getSlackRecipients, shouldSendNotification,
         recordNotificationSent, deliverToSlack, deliverToInApp } from '../_shared/proactive/index.ts';
```

#### Cron Job Pattern (from `api/cron/slack-deal-risk-alert.ts`)
```typescript
// Vercel cron → POST to Supabase edge function with x-cron-secret header
const response = await fetch(`${SUPABASE_URL}/functions/v1/{function-name}`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'x-cron-secret': CRON_SECRET },
  body: JSON.stringify({}),
});
```

#### Proactive Notification Type (extend `types.ts`)
```typescript
// Add to ProactiveNotificationType union:
| 'account_signal_alert'     // Individual signal push
| 'account_intelligence_digest'  // Daily digest of all signals per account
```

#### Ops Table Column Type (extend `opsTableService.ts`)
```typescript
// Existing column types: text, email, enrichment, status, apollo_property,
//   apollo_org_property, button, formula, integration, action
// Add: 'signal' type for displaying latest intent signals in table cells
```

#### Dedupe Pattern (from `dedupe.ts`)
```
Key: {type}:{orgId}:{recipientId}:{entityId}
Cooldown: configurable per notification type
```

### 3. Risk Scanner — Risks & Mitigations

| Severity | Area | Risk | Mitigation |
|----------|------|------|------------|
| **HIGH** | Apollo API | Periodic enrichment burns credits. 100 accounts × weekly = ~400/month. Users who increase to daily = ~3,000/month. | Default weekly Monday cadence keeps costs low. Cost warnings shown before frequency increase. Budget check before each run — skip if exhausted. |
| **HIGH** | Edge Function Timeout | Web scraping + AI analysis per account could exceed 60s Supabase timeout. | Process accounts in batches. Fan out to per-account sub-invocations. Use Perplexity API (fast) instead of raw scraping. |
| **MEDIUM** | Schema Migration | New tables needed: `account_watchlist`, `account_signals`, `account_signal_snapshots`. Need RLS policies. | Follow existing migration patterns. Add RLS matching `contacts`/`deals` policies (owner_id OR org sharing). |
| **MEDIUM** | Cost — AI Research | Custom prompts per account using Perplexity could get expensive at scale. | Weekly default keeps costs ~$0.05-0.10/account/week. Show per-account cost estimate in UI before enabling. |
| **MEDIUM** | Slack Noise | Too many account signals = alert fatigue = reps mute notifications. | Weekly Monday digest batches everything into 1 message. Only critical signals (champion left, funding) get immediate DM. |
| **LOW** | Data Freshness | Apollo data can be stale (updated monthly). Web scraping results vary. | Show signal age. Let reps trigger manual refresh. Mark confidence levels. |
| **LOW** | Vercel Cron Limits | Already 23 crons. Vercel Pro allows unlimited. | Add 2 new crons (account-monitor, account-digest). Well within limits. |

### 4. Scope Sizer — Story Breakdown

#### Total Estimate
- **Optimistic**: 8 hours (with parallel execution)
- **Realistic**: 12-14 hours
- **Pessimistic**: 18 hours

---

## Synthesis

### Agreements (all analyses align)
- Proactive notification engine is purpose-built for this — plug in new signal types
- Apollo enrichment + Perplexity web search provide the signal sources
- Ops table column system is extensible for a new `signal` column type
- Cron infrastructure has capacity for 2 more jobs
- Need new DB tables but existing migration patterns make this low-risk

### Key Architectural Decision: Signal Pipeline

```
┌──────────────────────────────────────────────────────────────────────┐
│                    SMART LISTENING PIPELINE                          │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  SOURCES (run on cron)                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │   Apollo     │  │  Perplexity │  │   Custom    │                │
│  │  Re-Enrich   │  │  Web Intel  │  │  AI Prompts │                │
│  │             │  │             │  │             │                │
│  │ • Job change │  │ • News      │  │ • User-def  │                │
│  │ • Title chg  │  │ • Funding   │  │   research  │                │
│  │ • Company    │  │ • Product   │  │   prompts   │                │
│  │   change    │  │   launches  │  │             │                │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                │
│         │                │                │                        │
│         └────────────────┼────────────────┘                        │
│                          ▼                                          │
│  PROCESSOR                                                          │
│  ┌──────────────────────────────────────────────┐                  │
│  │  account-signal-processor edge function       │                  │
│  │                                               │                  │
│  │  1. Diff current vs previous snapshot         │                  │
│  │  2. Classify signal (job_change, news,        │                  │
│  │     funding, competitor, custom_research)      │                  │
│  │  3. Score relevance (0-100)                   │                  │
│  │  4. Store in account_signals table            │                  │
│  │  5. If high relevance → trigger notification  │                  │
│  └──────────────┬───────────────────────────────┘                  │
│                 │                                                    │
│                 ▼                                                    │
│  DELIVERY                                                           │
│  ┌─────────────────────┐  ┌─────────────────────┐                  │
│  │  Slack (high prio)  │  │  In-App (all)       │                  │
│  │                     │  │                     │                  │
│  │  Immediate DM for:  │  │  • Signal column    │                  │
│  │  • Job changes      │  │    in Ops table     │                  │
│  │  • Funding events   │  │  • Notification     │                  │
│  │  • Custom triggers  │  │    badge            │                  │
│  │                     │  │  • Signal timeline  │                  │
│  │  Daily digest for:  │  │    per account      │                  │
│  │  • News mentions    │  │                     │                  │
│  │  • Hiring trends    │  │                     │                  │
│  │  • Tech changes     │  │                     │                  │
│  └─────────────────────┘  └─────────────────────┘                  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Recommended Execution Plan

### Phase 1: Foundation (Schema + Watchlist)
| # | Story | Type | Est. | Deps |
|---|-------|------|------|------|
| 1 | Create `account_watchlist` and `account_signals` tables with RLS | schema | 30min | — |
| 2 | Build watchlist management UI (add/remove accounts, auto-add from deals) | frontend | 45min | 1 |
| 3 | Create `useAccountWatchlist` hook + watchlist service | frontend | 30min | 1 |

### Phase 2: Signal Sources
| # | Story | Type | Est. | Deps |
|---|-------|------|------|------|
| 4 | Build `account-monitor` edge function — Apollo re-enrich + diff detection | backend | 60min | 1 |
| 5 | Add Perplexity web intelligence source to account-monitor | backend | 45min | 4 |
| 6 | Add custom AI research prompts (per-account configurable) | backend+frontend | 60min | 4 |

### Phase 3: Signal Processing + Storage
| # | Story | Type | Est. | Deps |
|---|-------|------|------|------|
| 7 | Build signal classifier + relevance scoring | backend | 45min | 4 |
| 8 | Create snapshot diffing system (detect changes between enrichment runs) | backend | 45min | 4 |

### Phase 4: Delivery — Slack
| # | Story | Type | Est. | Deps |
|---|-------|------|------|------|
| 9 | Add `account_signal_alert` + `account_intelligence_digest` notification types to proactive engine | backend | 30min | 7 |
| 10 | Build Slack Block Kit template for account signals | backend | 30min | 9 |
| 11 | Create `account-signal-digest` edge function + Vercel cron | backend | 45min | 9, 10 |

### Phase 5: Delivery — In-App (Ops Table)
| # | Story | Type | Est. | Deps |
|---|-------|------|------|------|
| 12 | Add `signal` column type to Ops table (latest signal indicator + timeline popover) | frontend | 60min | 7 |
| 13 | Build AccountSignalTimeline component (full signal history per account) | frontend | 45min | 12 |

### Phase 6: Orchestration + Settings
| # | Story | Type | Est. | Deps |
|---|-------|------|------|------|
| 14 | Create `account-monitor` Vercel cron (daily for watchlist, weekly for auto-monitored) | backend | 20min | 4 |
| 15 | Add Smart Listening settings panel (frequency, sources, notification preferences) | frontend | 45min | 2 |

### Parallel Execution Opportunities
- Stories 2+3 can run parallel (both depend only on schema)
- Stories 5+6 can run parallel (independent sources)
- Stories 7+8 can run parallel (processor components)
- Stories 12+13 can run parallel (independent UI components)

### MVP Option
**Stories 1-4, 7, 9-10, 14** = Core pipeline with Apollo-only signals + Slack delivery
- **Estimate**: 5-6 hours
- **Delivers**: Watchlist, daily Apollo change detection, Slack alerts for job changes/company updates
- **Deferred**: Web scraping, custom prompts, Ops table signal column, settings UI

---

## Signal Types (Recommended V1)

| Signal | Source | Priority | Slack Delivery |
|--------|--------|----------|----------------|
| **Job change** (champion left, new hire) | Apollo re-enrich diff | HIGH | Immediate DM |
| **Title change** (promotion, role shift) | Apollo re-enrich diff | MEDIUM | Daily digest |
| **Company funding** | Perplexity web intel | HIGH | Immediate DM |
| **Company news** (press, product launch) | Perplexity web intel | MEDIUM | Daily digest |
| **Hiring surge** (many new roles) | Apollo org re-enrich | MEDIUM | Daily digest |
| **Tech stack change** | Apollo org re-enrich | LOW | Daily digest |
| **Custom research trigger** | User-defined AI prompt | Configurable | Configurable |

---

## Slack Message Template (Proposed)

```
🔔 Account Signal — TechCorp

🔴 HIGH PRIORITY
Marcus Chen (your champion) changed roles
  Was: VP Engineering → Now: CTO

This could be a major opportunity — new CTO decisions
often trigger vendor reviews.

📋 Recommended Actions:
• Send congratulations + offer strategic session
• Update deal contacts and org chart
• Check if this affects your Q2 close timeline

[View Account] [Send Congrats] [Snooze 1 Week]
```

---

## Database Schema (Proposed)

```sql
-- Accounts to monitor
CREATE TABLE account_watchlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),  -- who added it

  -- What to watch
  account_type TEXT NOT NULL CHECK (account_type IN ('company', 'contact')),
  company_id UUID REFERENCES companies(id),
  contact_id UUID REFERENCES contacts(id),
  deal_id UUID REFERENCES deals(id),  -- if auto-added from deal

  -- Monitoring config
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'deal_auto')),
  monitor_frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (monitor_frequency IN ('weekly', 'twice_weekly', 'daily')),
  monitor_day TEXT NOT NULL DEFAULT 'monday' CHECK (monitor_day IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday')),
  enabled_sources TEXT[] DEFAULT ARRAY['apollo'],  -- apollo, web_intel, custom_prompt
  custom_research_prompt TEXT,  -- user-defined AI research prompt

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(org_id, user_id, company_id),
  UNIQUE(org_id, user_id, contact_id)
);

-- Detected signals
CREATE TABLE account_signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  watchlist_id UUID NOT NULL REFERENCES account_watchlist(id) ON DELETE CASCADE,

  -- Signal details
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'job_change', 'title_change', 'company_change',
    'funding_event', 'company_news', 'hiring_surge',
    'tech_stack_change', 'competitor_mention',
    'custom_research_result'
  )),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  relevance_score INT CHECK (relevance_score BETWEEN 0 AND 100),

  -- Content
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  details JSONB DEFAULT '{}',  -- source-specific structured data
  evidence TEXT,  -- what triggered this signal

  -- Source tracking
  source TEXT NOT NULL CHECK (source IN ('apollo_diff', 'web_intel', 'custom_prompt')),
  source_data JSONB DEFAULT '{}',  -- raw source response

  -- State
  is_read BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  is_actioned BOOLEAN DEFAULT false,
  actioned_at TIMESTAMPTZ,

  -- Notification tracking
  slack_notified BOOLEAN DEFAULT false,
  in_app_notified BOOLEAN DEFAULT false,

  detected_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enrichment snapshots for diffing
CREATE TABLE account_signal_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  watchlist_id UUID NOT NULL REFERENCES account_watchlist(id) ON DELETE CASCADE,

  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('apollo_person', 'apollo_org', 'web_intel')),
  snapshot_data JSONB NOT NULL,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_account_watchlist_org ON account_watchlist(org_id, is_active);
CREATE INDEX idx_account_watchlist_next_check ON account_watchlist(next_check_at) WHERE is_active = true;
CREATE INDEX idx_account_signals_watchlist ON account_signals(watchlist_id, detected_at DESC);
CREATE INDEX idx_account_signals_org ON account_signals(org_id, detected_at DESC);
CREATE INDEX idx_account_signals_unread ON account_signals(org_id, is_read) WHERE is_read = false;
CREATE INDEX idx_account_snapshots_watchlist ON account_signal_snapshots(watchlist_id, snapshot_type, created_at DESC);
```

---

## Questions Resolved During Analysis

1. **Default frequency** → Weekly Monday morning (6:30am UTC monitor, 7am UTC digest). Users can increase to twice-weekly or daily with cost warnings.
2. **Auto-monitored accounts** → Auto-add companies from open deals. Weekly frequency for all by default.
3. **Credit budgeting** → Check Apollo credits before each run. Skip accounts when budget exhausted. Prioritize manual watchlist over deal-auto.
4. **Cost transparency** → Show per-account and aggregate cost projections in settings UI before user changes frequency or enables expensive sources.

## Cost Model (Weekly Default)

| Source | Per Account/Week | 50 Accounts/Week | 50 Accounts/Month |
|--------|-----------------|-------------------|---------------------|
| Apollo re-enrich | ~1 credit | ~50 credits | ~200 credits |
| Perplexity web intel | ~$0.05 | ~$2.50 | ~$10 |
| Custom AI prompt | ~$0.05 | ~$2.50 | ~$10 |
| **All sources** | **~$0.10 + 1 credit** | **~$5 + 50 credits** | **~$20 + 200 credits** |

**If user increases to daily**: Multiply costs by ~7x. UI warns before confirming.
