# Context Tier Specification

The orchestrator loads context in three tiers, each with increasing latency and cost. Skills declare which tiers they need. The orchestrator only loads what's required — never speculatively loads tier 3 data.

---

## Tier 1: Organisation Context (Always Loaded)

**Latency**: ~200ms (cached after first load per invocation)
**Cost**: Zero (database reads only)
**Source modules**: `_shared/proactive/settings.ts`, `_shared/proactive/recipients.ts`, `_shared/costTracking.ts`

| Field | Source Table | Description |
|-------|-------------|-------------|
| `org.profile` | `organizations` | Company name, domain, industry, size |
| `org.icp` | `icp_profiles` | Ideal customer profile criteria |
| `org.products` | `product_profiles` | Product/service descriptions for context |
| `user.preferences` | `slack_user_preferences` | Quiet hours, max notifications/hr, timezone |
| `user.mappings` | `slack_user_mappings` | Briefing time, Slack user ID, timezone |
| `user.settings` | `user_settings` | AI provider preferences, feature flags |
| `features` | `notification_feature_settings` | Per-org feature toggles (which proactive features are enabled) |
| `cost_budget` | `costTracking.checkCostBudget()` | Remaining AI budget for the org |

### Loading Function

```typescript
async function loadTier1(orgId: string, userId: string): Promise<Tier1Context> {
  // All reads use existing _shared/proactive/ modules
  const [org, user, features, budget] = await Promise.all([
    loadOrgProfile(orgId),           // _shared/proactive/settings.ts
    loadUserPreferences(userId),     // _shared/proactive/settings.ts
    loadFeatureSettings(orgId),      // _shared/proactive/settings.ts
    checkCostBudget(orgId),          // _shared/costTracking.ts
  ])

  return {
    org: {
      ...org,
      icp: await loadICPProfile(orgId),
      products: await loadProductProfile(orgId),
    },
    user,
    features,
    cost_budget: budget,
  }
}
```

### Validation Rules

- If `features` has the event type disabled, abort the orchestration
- If `cost_budget.remaining <= 0`, abort with budget notification
- If `user.preferences.quiet_hours` covers current time, defer (don't drop)
- If `org.profile` is missing (no org found), log error and abort

---

## Tier 2: Contact Context (Per-Contact Events)

**Latency**: ~500ms (multiple database queries)
**Cost**: Zero (database reads only)
**Loaded when**: Event payload contains `contact_id`, `deal_id`, or `meeting_id` with attendees

| Field | Source Table | Description |
|-------|-------------|-------------|
| `contact` | `contacts` | Name, email, title, company, owner_id |
| `company` | `companies` | Company details, domain, industry |
| `deal` | `deals` | Stage, amount, close date, owner_id |
| `meeting_history` | `meetings` | Previous meetings with this contact (owner_user_id filter) |
| `email_history` | `email_threads` / `email_messages` | Recent email exchanges |
| `activities` | `activities` | All logged activities for this contact |
| `tasks` | `tasks` | Open tasks related to this contact/deal |
| `notes` | `contact_notes` | Rep's notes on this contact |

### Loading Function

```typescript
async function loadTier2(
  payload: EventPayload,
  supabase: SupabaseClient
): Promise<Tier2Context | null> {
  // Determine the contact — might come from different payload fields
  let contactId = payload.contact_id
  if (!contactId && payload.meeting_id) {
    contactId = await getContactFromMeeting(payload.meeting_id, supabase)
  }
  if (!contactId && payload.deal_id) {
    contactId = await getContactFromDeal(payload.deal_id, supabase)
  }
  if (!contactId) return null  // No contact context available

  const [contact, deal, meetings, emails, activities] = await Promise.all([
    loadCRMContact(contactId, supabase),
    payload.deal_id ? loadCRMDeal(payload.deal_id, supabase) : null,
    loadMeetingHistory(contactId, supabase),
    loadEmailThread(contactId, supabase),
    loadActivities(contactId, supabase),
  ])

  return {
    contact,
    company: contact?.company_id ? await loadCRMCompany(contact.company_id, supabase) : null,
    deal,
    meeting_history: meetings,
    email_history: emails,
    activities,
  }
}
```

### Column Name Gotchas

These are critical — wrong column names cause silent failures:

| Table | User Column | WRONG | RIGHT |
|-------|-------------|-------|-------|
| `meetings` | `owner_user_id` | `user_id` | `owner_user_id` |
| `deals` | `owner_id` | `user_id` | `owner_id` |
| `contacts` | `owner_id` | `user_id` | `owner_id` |
| `activities` | `user_id` | — | `user_id` |
| `tasks` | `assigned_to` | `user_id` | `assigned_to` |

### Stale Deal Detection

The `deals` table does NOT have a `last_activity_at` column. Stale deal detection must join on `activities`:

```sql
SELECT d.id, d.name, d.stage, d.amount,
  MAX(a.created_at) as last_activity_at,
  EXTRACT(DAY FROM NOW() - MAX(a.created_at)) as days_inactive
FROM deals d
LEFT JOIN activities a ON a.deal_id = d.id
WHERE d.owner_id = :user_id
  AND d.stage NOT IN ('closed_won', 'closed_lost')
GROUP BY d.id
HAVING MAX(a.created_at) < NOW() - INTERVAL '14 days'
   OR MAX(a.created_at) IS NULL
ORDER BY d.amount DESC;
```

---

## Tier 3: On-Demand External Data

**Latency**: 2-15s per source
**Cost**: API credits (Apollo, Apify, OpenAI, etc.)
**Loaded when**: A specific skill in the sequence declares it needs tier 3 data

Tier 3 is subdivided by data source. The orchestrator only loads the specific sub-tier a skill requests.

### tier3:apollo — Contact Enrichment

| Field | Source | Description |
|-------|--------|-------------|
| `person` | Apollo People API | Current title, company, seniority, department |
| `email` | Apollo Email Finder | Verified email addresses |
| `phone` | Apollo Phone API | Direct dial, mobile number |
| `employment_history` | Apollo People API | Previous roles and companies |

**Latency**: 2-5s
**Cost**: 1 Apollo credit per lookup
**When needed**: Pre-meeting enrichment, new contact discovery, lead qualification

### tier3:linkedin — Social Profile Data

| Field | Source | Description |
|-------|--------|-------------|
| `profile` | Apify LinkedIn Scraper | Full LinkedIn profile data |
| `recent_posts` | Apify LinkedIn Scraper | Last 5 posts/shares |
| `job_changes` | Apify LinkedIn Scraper | Recent role changes |
| `mutual_connections` | Apify LinkedIn Scraper | Shared connections |

**Latency**: 5-15s (Apify actor execution)
**Cost**: ~$0.01 per profile (Apify usage)
**When needed**: Pre-meeting research, stale deal revival (job change triggers)

### tier3:news — Company Intelligence

| Field | Source | Description |
|-------|--------|-------------|
| `recent_news` | Web search (Apify Google Scraper) | Last 30 days of company news |
| `funding_events` | Web search | Recent funding rounds |
| `leadership_changes` | Web search | C-suite and VP-level changes |
| `product_launches` | Web search | New product announcements |

**Latency**: 5-10s
**Cost**: ~$0.01 per search (Apify usage)
**When needed**: Pre-meeting briefings, stale deal revival, competitive intel

### tier3:template — Proposal Templates

| Field | Source | Description |
|-------|--------|-------------|
| `templates` | `proposal_templates` table | Available proposal templates |
| `selected_template` | AI selection based on deal type | Best-fit template |
| `variables` | Template + CRM data | Pre-populated template variables |

**Latency**: 500ms (database read + AI selection)
**Cost**: ~$0.001 (AI template selection)
**When needed**: `proposal_generation` sequence

### tier3:campaign — Outreach Metrics

| Field | Source | Description |
|-------|--------|-------------|
| `campaigns` | Instantly API | Active campaign list |
| `metrics` | Instantly API | Open/click/reply/bounce rates |
| `replies` | Instantly API | New replies since last check |
| `sequences` | Instantly API | Sequence step performance |

**Latency**: 2-5s (Instantly API)
**Cost**: Zero (included in Instantly plan)
**When needed**: `campaign_check` sequence, morning brief campaign section

---

## Context Loading Configuration

Each step in an event sequence declares its context requirements:

```typescript
interface SequenceStep {
  order: number
  skill_key?: string
  action?: string
  requires_context: string[]  // ['tier1', 'tier2', 'tier3:apollo', 'tier3:news']
  // ...
}
```

The orchestrator pre-loads all unique tiers needed by the sequence before execution begins:

```typescript
async function loadContextForSequence(
  event: OrchestratorEvent,
  sequence: SequenceStep[],
  supabase: SupabaseClient
): Promise<SequenceContext> {
  // Collect all required tiers across all steps
  const allTiers = new Set(sequence.flatMap(s => s.requires_context))

  const context: SequenceContext = {
    tier1: await loadTier1(event.org_id, event.user_id),
  }

  if (allTiers.has('tier2')) {
    context.tier2 = await loadTier2(event.payload, supabase)
  }

  // Tier 3 is loaded lazily — only when the step that needs it executes
  // This is because tier 3 calls are expensive and the step might be skipped
  context.tier3Loaders = {}
  for (const tier of allTiers) {
    if (tier.startsWith('tier3:')) {
      const source = tier.split(':')[1]
      context.tier3Loaders[source] = () => loadTier3Source(source, event.payload, supabase)
    }
  }

  return context
}
```

**Key decision**: Tier 1 and Tier 2 are eagerly loaded (fast, free). Tier 3 sources are lazily loaded (slow, costly) — the loader function is prepared but not executed until the step that needs it actually runs.

---

## Context Size Limits

To prevent edge function memory issues, enforce limits on loaded context:

| Context | Max Size | Enforcement |
|---------|----------|-------------|
| Meeting history | Last 10 meetings | LIMIT 10 ORDER BY date DESC |
| Email history | Last 20 messages | LIMIT 20 ORDER BY date DESC |
| Activities | Last 50 entries | LIMIT 50 ORDER BY created_at DESC |
| News articles | Last 5 relevant | Top 5 by relevance score |
| LinkedIn posts | Last 5 posts | Most recent 5 |

These limits ensure the context payload stays under 100KB when serialised to `sequence_jobs.context`, keeping database writes fast and edge function memory under control.
