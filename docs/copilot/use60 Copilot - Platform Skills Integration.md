

## What You've Built

Your Platform Skills system is the **context generation engine**. It handles:

- ✅ Skill templates with `${variable}` interpolation
- ✅ Organization context as key-value pairs
- ✅ Compilation of skills with org-specific values
- ✅ Version control and auto-refresh
- ✅ Platform admin UI for skill management
- ✅ Agent integration via `get_organization_skills_for_agent()`

## What the Copilot Needs on Top

The copilot needs three additional layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Copilot                               │
│                                                                 │
│  "Prep me for my call with Sarah"                              │
│                              │                                  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: MCP Skill Router                                      │
│  - Exposes skills as executable tools to AI                     │
│  - Routes skill invocations to platform API                     │
│  - Returns structured results                                   │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: Integration Adapters                                  │
│  - Fathom, Fireflies, use60 Engine (meeting intelligence)      │
│  - HubSpot, Salesforce, Bullhorn (CRM)                         │
│  - Gmail, Outlook (email)                                       │
│  - Unified response format regardless of source                 │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: Platform Skills Engine (YOU HAVE THIS)               │
│  - Compiled skills with org context                             │
│  - organization_context key-value store                         │
│  - get_organization_skills_for_agent()                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: MCP Skill Router

### The Problem

Your `get_organization_skills_for_agent()` returns skill **documents** (instructions for the AI). But the copilot also needs to **execute actions** - query CRM, fetch meetings, draft emails.

### The Solution

Two MCP tool types (plus entity resolution):

```typescript
// Tool 1: Get skill instructions (uses your existing function)
{
  name: "get_skill",
  description: "Retrieve a compiled skill document for guidance",
  inputSchema: {
    type: "object",
    properties: {
      skill_key: { 
        type: "string",
        enum: ["lead-qualification", "follow-up-email", "call-prep", ...]
      }
    }
  }
}

// Tool 2: Execute actions (reads + writes, plus sequences)
{
  name: "execute_action",
  description: "Execute an action or sequence defined by a skill",
  inputSchema: {
    type: "object", 
    properties: {
      action: {
        type: "string",
        enum: [
          "get_contact",
          "get_deal",
          "get_meetings",
          "get_meetings_for_period",
          "search_emails",
          "draft_email",
          "update_crm",
          "send_notification",
          "run_skill",
          "run_sequence"
        ]
      },
      params: { type: "object" }
    }
  }
}

// Tool 3: Resolve ambiguous person references (first-name-only)
{
  name: "resolve_entity",
  description: "Resolve a person/company mentioned by the user across CRM + meetings + calendar + email",
  inputSchema: {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"]
  }
}
```

### How It Works Together

```
User: "Prep me for my call with Sarah at Acme"

AI thinks: I need the call-prep skill for guidance
    ↓
AI calls: get_skill({ skill_key: "call-prep" })
    ↓
Returns: Compiled skill document with org-specific ICP, products, etc.
    ↓
AI reads skill, knows it needs: contact, deal, recent meetings, emails
    ↓
AI calls: execute_action({ 
  action: "get_contact", 
  params: { identifier: "sarah@acme.com" }
})
    ↓
AI calls: execute_action({ 
  action: "get_meetings", 
  params: { contact_email: "sarah@acme.com", limit: 3 }
})
    ↓
AI synthesizes briefing using skill guidance + fetched data
```

---

## Layer 2: Integration Adapters

Your platform has integrations. The copilot needs unified access.

### Meeting Intelligence Adapters

```typescript
// src/lib/integrations/meetings/types.ts

interface MeetingAdapter {
  source: 'fathom' | 'fireflies' | 'use60';
  
  listMeetings(params: {
    contactEmail?: string;
    dateRange?: { from: Date; to: Date };
    limit?: number;
  }): Promise<Meeting[]>;
  
  getMeetingSummary(meetingId: string): Promise<MeetingSummary>;
  
  searchTranscripts(query: string, filters?: {
    contactEmail?: string;
    dateRange?: { from: Date; to: Date };
  }): Promise<TranscriptSearchResult[]>;
  
  getActionItems(meetingId: string): Promise<ActionItem[]>;
}

// Unified meeting format (regardless of source)
interface Meeting {
  id: string;
  source: 'fathom' | 'fireflies' | 'use60';
  title: string;
  date: Date;
  duration_minutes: number;
  participants: { name: string; email: string }[];
  summary?: string;
  action_items?: ActionItem[];
  transcript_available: boolean;
}
```

### Adapter Registry

```typescript
// src/lib/integrations/meetings/registry.ts

class MeetingAdapterRegistry {
  private adapters: Map<string, MeetingAdapter> = new Map();
  
  register(source: string, adapter: MeetingAdapter) {
    this.adapters.set(source, adapter);
  }
  
  // Get adapter for org based on their connected integrations
  async getAdapterForOrg(orgId: string): Promise<MeetingAdapter | null> {
    const integration = await this.getOrgMeetingIntegration(orgId);
    if (!integration) return null;
    return this.adapters.get(integration.source);
  }
  
  // Aggregate across multiple sources if org has several
  async getAllMeetings(orgId: string, params: ListParams): Promise<Meeting[]> {
    const integrations = await this.getOrgMeetingIntegrations(orgId);
    const results = await Promise.all(
      integrations.map(int => 
        this.adapters.get(int.source)?.listMeetings(params)
      )
    );
    return results.flat().sort((a, b) => b.date - a.date);
  }
}
```

### Org Integration Config

Store which meeting tool each org uses:

```sql
-- Add to organization_integrations or similar
CREATE TABLE organization_meeting_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  source TEXT NOT NULL CHECK (source IN ('fathom', 'fireflies', 'use60')),
  credentials JSONB,  -- Encrypted API keys, tokens
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Enhancing Your Skill Categories

Your current categories need **execution skills** for the copilot:

|Current Category|Current Purpose|Add for Copilot|
|---|---|---|
|sales-ai|Scoring & qualification logic|✅ Good as-is (AI reads, applies logic)|
|writing|Content templates|✅ Good as-is (AI reads, generates content)|
|enrichment|Research guidance|⚠️ Needs execution hooks|
|workflows|Multi-step automation|⚠️ Needs execution hooks|

### New Category: `data-access`

Skills that define **how to fetch data**:

````yaml
---
name: get-contact-context
description: Retrieve full context for a contact before any interaction.
  Combines CRM data, meeting history, email threads, and research.
category: data-access
version: 1
triggers:
  - call_prep
  - email_compose
  - deal_review
actions:
  - get_contact
  - get_company
  - get_deal
  - get_meetings
  - search_emails
requires_integrations:
  - crm
  - meetings
  - email
---

# Get Contact Context

Retrieve comprehensive context for a contact.

## Data Sources (in priority order)

1. **CRM Record**
   - Contact: name, title, email, phone
   - Company: ${company_name} relationship
   - Deal: active opportunities, stage, value
   - Activities: recent touchpoints

2. **Meeting Intelligence**
   - Last 3 meetings with this contact
   - Key topics discussed
   - Action items (open and closed)
   - Sentiment trends

3. **Email Threads**
   - Last 5 email threads
   - Open questions or requests
   - Response patterns

4. **Research** (if available)
   - LinkedIn profile
   - Recent news mentions
   - Company updates

## Output Format

Return structured JSON:
```json
{
  "contact": { ... },
  "company": { ... },
  "deal": { ... },
  "meetings": [ ... ],
  "emails": [ ... ],
  "research": { ... }
}
````

````

### New Category: `output-format`

Skills that define **how to format outputs**:

```yaml
---
name: slack-briefing-format
description: Format call prep briefings for Slack delivery using Block Kit.
category: output-format
version: 1
output_channel: slack
---

# Slack Briefing Format

Format call preparation briefings for Slack using Block Kit.

## Structure

### Header Block
```json
{
  "type": "header",
  "text": {
    "type": "plain_text",
    "text": "📞 Call Prep: {contact_name} @ {company_name}"
  }
}
````

### Context Section

```json
{
  "type": "section",
  "fields": [
    { "type": "mrkdwn", "text": "*Role:* {contact_title}" },
    { "type": "mrkdwn", "text": "*Deal:* {deal_name} ({deal_stage})" },
    { "type": "mrkdwn", "text": "*Value:* {deal_value}" },
    { "type": "mrkdwn", "text": "*Last Contact:* {last_contact_date}" }
  ]
}
```

### Talking Points

Use bullet list in section block. Max 5 points. Prioritize based on ${company_name}'s current sales priorities.

### Open Items

Warning style for items that need resolution.

### Actions

Button to view full CRM record, schedule follow-up.

## Brand Voice

Apply ${brand_tone} to all text content. Avoid: ${words_to_avoid}

````

---

## Updated Phase 5: Agent Integration

Your Phase 5 needs more detail for copilot integration:

### Stage 5.1: MCP Skill Router (Revised)

```typescript
// src/lib/mcp/skillRouter.ts

import { createClient } from '@supabase/supabase-js';
import { MeetingAdapterRegistry } from '../integrations/meetings/registry';
import { CRMAdapterRegistry } from '../integrations/crm/registry';

interface SkillRouterConfig {
  supabase: SupabaseClient;
  meetingAdapters: MeetingAdapterRegistry;
  crmAdapters: CRMAdapterRegistry;
}

export class SkillRouter {
  constructor(private config: SkillRouterConfig) {}

  // MCP Tool: Get compiled skill document
  async getSkill(orgId: string, skillKey: string): Promise<CompiledSkill> {
    const { data, error } = await this.config.supabase
      .rpc('get_organization_skills_for_agent', { p_org_id: orgId });
    
    if (error) throw error;
    
    const skill = data.find(s => s.skill_key === skillKey);
    if (!skill) throw new Error(`Skill not found: ${skillKey}`);
    
    return {
      skill_key: skill.skill_key,
      category: skill.category,
      frontmatter: skill.frontmatter,
      content: skill.content
    };
  }

  // MCP Tool: List available skills
  async listSkills(orgId: string, category?: string): Promise<SkillSummary[]> {
    const { data, error } = await this.config.supabase
      .rpc('get_organization_skills_for_agent', { p_org_id: orgId });
    
    if (error) throw error;
    
    let skills = data.filter(s => s.is_enabled);
    if (category) {
      skills = skills.filter(s => s.category === category);
    }
    
    return skills.map(s => ({
      skill_key: s.skill_key,
      name: s.frontmatter.name,
      description: s.frontmatter.description,
      category: s.category,
      triggers: s.frontmatter.triggers || []
    }));
  }

  // MCP Tool: Execute skill action
  async executeAction(
    orgId: string, 
    userId: string,
    action: string, 
    params: Record<string, any>
  ): Promise<ActionResult> {
    switch (action) {
      case 'get_contact':
        return this.getContact(orgId, params);
      case 'get_deal':
        return this.getDeal(orgId, params);
      case 'get_meetings':
        return this.getMeetings(orgId, params);
      case 'search_emails':
        return this.searchEmails(orgId, userId, params);
      case 'draft_email':
        return this.draftEmail(orgId, userId, params);
      case 'update_crm':
        return this.updateCRM(orgId, userId, params);
      case 'send_notification':
        return this.sendNotification(orgId, userId, params);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  private async getMeetings(orgId: string, params: {
    contactEmail?: string;
    limit?: number;
  }): Promise<ActionResult> {
    const adapter = await this.config.meetingAdapters.getAdapterForOrg(orgId);
    if (!adapter) {
      return {
        success: false,
        error: 'No meeting integration configured',
        data: null
      };
    }

    const meetings = await adapter.listMeetings({
      contactEmail: params.contactEmail,
      limit: params.limit || 5
    });

    return {
      success: true,
      data: { meetings },
      source: adapter.source
    };
  }

  // ... other action implementations
}
````

### Stage 5.2: Skill Testing Console (NEW)

Add to Phase 5 - this was missing:

```typescript
// src/components/platform/SkillTestConsole.tsx

interface SkillTestConsoleProps {
  skill: CompiledSkill;
  organizationId: string;
}

export function SkillTestConsole({ skill, organizationId }: SkillTestConsoleProps) {
  const [testMode, setTestMode] = useState<'mock' | 'live' | 'readonly'>('mock');
  const [input, setInput] = useState('');
  const [result, setResult] = useState<TestResult | null>(null);
  const [executing, setExecuting] = useState(false);

  const runTest = async () => {
    setExecuting(true);
    
    const response = await fetch('/api/copilot/test-skill', {
      method: 'POST',
      body: JSON.stringify({
        skill_key: skill.skill_key,
        organization_id: organizationId,
        test_input: input,
        mode: testMode
      })
    });

    const result = await response.json();
    setResult(result);
    setExecuting(false);
  };

  return (
    <div className="bg-white dark:bg-gray-900/80 rounded-xl border border-gray-200 dark:border-gray-700/50">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700/50 px-6 py-4">
        <h3 className="font-medium text-gray-900 dark:text-gray-100">
          Test: {skill.frontmatter.name}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {skill.skill_key}
        </p>
      </div>

      {/* Test Mode Selector */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700/50">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Test Mode
        </label>
        <div className="mt-2 flex gap-2">
          {(['mock', 'live', 'readonly'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setTestMode(mode)}
              className={cn(
                "px-4 py-2 text-sm rounded-lg border transition-colors",
                testMode === mode
                  ? "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-400"
                  : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
              )}
            >
              {mode === 'mock' && '🧪 Mock Data'}
              {mode === 'live' && '🔴 Live (Test Account)'}
              {mode === 'readonly' && '👁 Production (Read-Only)'}
            </button>
          ))}
        </div>
      </div>

      {/* Test Input */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700/50">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Test Prompt
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g., Prep me for my call with Sarah Chen at Acme Corp"
          className="mt-2 w-full h-24 bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-lg p-3 text-gray-900 dark:text-gray-100"
        />
        <button
          onClick={runTest}
          disabled={executing || !input}
          className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {executing ? 'Running...' : 'Run Test'}
        </button>
      </div>

      {/* Execution Log */}
      {result && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700/50">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Execution Log
          </h4>
          <div className="space-y-2 font-mono text-sm">
            {result.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-xs",
                  step.success 
                    ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                    : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                )}>
                  {step.success ? '✓' : '✗'}
                </span>
                <div>
                  <span className="text-gray-900 dark:text-gray-100">{step.action}</span>
                  <span className="text-gray-500 dark:text-gray-400 ml-2">
                    {step.duration}ms
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700/50 flex gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span>⏱ Total: {result.total_duration}ms</span>
            <span>💰 Tokens: {result.tokens_used}</span>
            <span>🔧 Actions: {result.action_count}</span>
          </div>
        </div>
      )}

      {/* Output */}
      {result?.output && (
        <div className="px-6 py-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Output
          </h4>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 prose dark:prose-invert prose-sm max-w-none">
            {result.output}
          </div>
        </div>
      )}
    </div>
  );
}
```

### Stage 5.3: Test API Endpoint (NEW)

```typescript
// src/pages/api/copilot/test-skill.ts

import { SkillRouter } from '@/lib/mcp/skillRouter';
import { MockAdapterRegistry } from '@/lib/integrations/mocks';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  const { skill_key, organization_id, test_input, mode } = await req.json();

  // Create appropriate adapters based on mode
  const adapters = mode === 'mock' 
    ? MockAdapterRegistry.create()
    : await createLiveAdapters(organization_id, { readonly: mode === 'readonly' });

  const router = new SkillRouter({
    supabase: createClient(/* ... */),
    meetingAdapters: adapters.meetings,
    crmAdapters: adapters.crm
  });

  // Get the compiled skill
  const skill = await router.getSkill(organization_id, skill_key);

  // Run the AI with the skill and test input
  const result = await runTestExecution({
    skill,
    input: test_input,
    router,
    mode
  });

  return Response.json(result);
}

async function runTestExecution({ skill, input, router, mode }) {
  const steps: ExecutionStep[] = [];
  const startTime = Date.now();

  // Create a test AI session that logs all actions
  const testSession = createTestSession({
    onAction: (action, params, result, duration) => {
      steps.push({ action, params, result, duration, success: !result.error });
    }
  });

  // Run the copilot with the skill
  const output = await testSession.run({
    system: buildSystemPrompt(skill),
    user: input,
    tools: router.getTools(),
    maxActions: mode === 'mock' ? 20 : 5 // Limit actions in live mode
  });

  return {
    success: true,
    steps,
    output,
    total_duration: Date.now() - startTime,
    tokens_used: testSession.getTokensUsed(),
    action_count: steps.length
  };
}
```

---

## Updated Roadmap

Your existing phases are solid. Here's what to add/modify:

### Phase 5: Agent Integration (Revised)

|Stage|Original|Add/Change|
|---|---|---|
|5.1|Agent Skills Edge Function|✅ Keep, rename to "Skill Reader"|
|5.2|MCP Skills Provider|→ **MCP Skill Router** (read + execute)|
|5.3|Skill Execution Tools|→ **Integration Adapters** (Fathom, Fireflies, CRM)|
|5.4|AI Co-Pilot Integration|✅ Keep|
|5.5|Testing & Verification|→ **Skill Test Console** (new UI component)|

### New Phase 5.5: Integration Adapters

|Stage|Deliverable|Effort|
|---|---|---|
|5.5.1|Meeting adapter interface + Fathom adapter|2 days|
|5.5.2|Fireflies adapter|1 day|
|5.5.3|use60 Engine adapter|1 day|
|5.5.4|CRM adapter interface (HubSpot first)|2 days|
|5.5.5|Adapter registry + org config|1 day|

### New Phase 5.6: Skill Test Console

|Stage|Deliverable|Effort|
|---|---|---|
|5.6.1|Test console UI component|2 days|
|5.6.2|Test API endpoint|1 day|
|5.6.3|Mock adapter registry|1 day|
|5.6.4|Test fixtures (sample data)|1 day|

---

## New Skills to Add

### `data-access` Category

|Skill|Purpose|
|---|---|
|`get-contact-context`|Full context retrieval for a contact|
|`get-deal-context`|Deal with related contacts, activities, meetings|
|`get-pipeline-snapshot`|Current pipeline state for forecasting|
|`search-meetings`|Query meeting intelligence|
|`search-emails`|Query email threads|

### `output-format` Category

|Skill|Purpose|
|---|---|
|`slack-briefing-format`|Block Kit for call prep|
|`slack-alert-format`|Block Kit for pipeline alerts|
|`slack-summary-format`|Block Kit for follow-up summaries|
|`teams-adaptive-card`|Teams formatting|
|`email-report-format`|HTML email reports|

---

## Database Additions

```sql
-- Add to Phase 1 migrations

-- Track which meeting tool each org uses
CREATE TABLE organization_meeting_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('fathom', 'fireflies', 'use60')),
  credentials_encrypted TEXT,  -- Encrypted credentials
  webhook_url TEXT,            -- For real-time sync
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(organization_id, source)
);

-- Skill test history (for debugging/analytics)
CREATE TABLE skill_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  skill_key TEXT NOT NULL,
  test_input TEXT,
  test_mode TEXT CHECK (test_mode IN ('mock', 'live', 'readonly')),
  result JSONB,
  duration_ms INT,
  tokens_used INT,
  action_count INT,
  success BOOLEAN,
  tested_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for admin dashboard
CREATE INDEX idx_skill_tests_org ON skill_test_runs(organization_id, created_at DESC);
```

---

## Summary: What Changes

|Area|Before|After|
|---|---|---|
|**Skill exposure**|51 MCP tools|3–4 MCP tools (get_skill, list_skills, execute_action, resolve_entity)|
|**Meeting tools**|Assumed use60 only|Fathom, Fireflies, use60 via adapters|
|**Skill categories**|4 (sales-ai, writing, enrichment, workflows)|6 (+ data-access, output-format)|
|**Testing**|Manual|Skill Test Console in admin UI|
|**Token usage**|~15,000 per request|~4,000 per request|

Your Platform Skills engine is the foundation. The copilot just needs the execution layer on top.

---

## UX/UI: progress story + clickable results (web app)

To make tool calling feel autonomous (not “waiting”), the web app uses:

- **Progress stepper while working**: the UI creates a placeholder step list from detected intent, then replaces it with backend tool telemetry once the response returns.
- **Structured response panels** for high-frequency workflows (meeting prep, follow-up pack, meetings list)
- **Standard click actions** emitted by panels:
  - `open_contact`, `open_deal`, `open_meeting`, `open_task`, `open_external_url`