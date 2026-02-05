# Sales Assistant Enhancement Research
**Learnings from OpenClaw/Moltbot Architecture**

Date: 2026-01-29 (Updated: 2026-02-03)
Source: [openclaw/openclaw](https://github.com/openclaw/openclaw)

---

## Update: 2026-02-03 — Competitive Analysis vs. Sixty's New Autonomous Copilot

### What We've Built (New Capabilities)

Since this research was written, Sixty has implemented several key features:

#### ✅ **Autonomous Skill-Based Copilot** (IMPLEMENTED)
```typescript
// copilot-autonomous edge function
- Claude's native tool_use API for skill selection
- Skills converted to Claude tool definitions with input_schema from YAML
- Streaming SSE with token-by-token delivery
- Analytics tracking (copilot_executions, copilot_tool_calls)
```

#### ✅ **Parallel Execution in Sequences** (IMPLEMENTED)
```typescript
// SequenceOrchestrator updates
- execution_mode: 'sequential' | 'parallel'
- parallel_group for concurrent step execution
- Promise.allSettled() for parallel batches
- Condition expressions for conditional steps
```

#### ✅ **Token Streaming** (IMPLEMENTED)
```typescript
// anthropic.messages.stream() for real-time UX
- SSE 'token' events streamed to frontend
- message_complete markers for completion
- Accumulated content display in useCopilotChat
```

#### ✅ **HITL (Human-in-the-Loop)** (IMPLEMENTED)
```typescript
// Sequence steps can pause for approval
- hitl_before / hitl_after configuration
- Slack and in-app approval channels
- Timeout handling with configurable actions
```

---

### Competitive Gap Analysis: Sixty vs. OpenClaw/Moltbot

| Capability | OpenClaw/Moltbot | Sixty | Gap |
|------------|------------------|-------|-----|
| **Autonomous Skill Selection** | ✅ Via tool registry | ✅ Via platform_skills | None |
| **Token Streaming** | ✅ Native | ✅ Implemented | None |
| **Parallel Execution** | ✅ Session-level | ✅ Step-level | None |
| **Multi-Channel Delivery** | ✅ 13+ channels | ⚠️ Slack + In-App only | **HIGH** |
| **Persistent Sessions** | ✅ Per-channel sessions | ❌ Session-per-request | **HIGH** |
| **Pre-Compaction Memory** | ✅ Auto memory flush | ❌ Not implemented | **HIGH** |
| **Entity-Scoped Sessions** | ✅ Via session tools | ❌ Not implemented | **MEDIUM** |
| **Webhook Event System** | ✅ Gmail Pub/Sub, webhooks | ❌ Cron only | **HIGH** |
| **Configurable Thinking Levels** | ✅ Per-task model/thinking | ⚠️ Fixed model | **MEDIUM** |
| **Voice Integration** | ✅ ElevenLabs + Wake Word | ❌ Not implemented | **LOW** |
| **Skill Marketplace** | ✅ ClawdHub registry | ❌ Manual skill addition | **LOW** |
| **DM Security/Pairing** | ✅ Pairing codes | N/A (not multi-channel) | N/A |

---

### Priority Recommendations for Sixty

Based on the updated gap analysis:

#### 🔴 **CRITICAL (Next Sprint)**

1. **Persistent Sessions with Memory** — Without this, every copilot conversation starts from scratch
2. **Webhook Event System** — Real-time triggers from CRM, calendar, email

#### 🟡 **HIGH PRIORITY (Next 2-4 Weeks)**

3. **Pre-Compaction Memory Flush** — Preserve context when hitting token limits
4. **Multi-Channel Delivery** — Add email (Resend), SMS (Twilio), Teams
5. **Entity-Scoped Sessions** — Remember context per deal/contact/meeting

#### 🟢 **MEDIUM PRIORITY (Backlog)**

6. **Configurable Thinking Levels** — Route simple tasks to Haiku, complex to Opus
7. **Session Coordination Tools** — Cross-session search and intelligence

---

---

## Executive Summary

Moltbot is a local-first personal AI assistant with sophisticated proactive behavior, learning mechanisms, and multi-channel communication capabilities. This document analyzes its architecture to identify enhancement opportunities for our Sixty sales assistant.

**Key Opportunities Identified:**
1. **Enhanced Memory & Learning**: Session-based context preservation with pre-compaction memory flush
2. **Richer Event System**: Webhook-based event handling beyond cron jobs
3. **Multi-Channel Communication**: Unified routing across messaging platforms
4. **Session Intelligence**: Cross-session context and agent-to-agent coordination
5. **Dynamic Capabilities**: Runtime skill discovery and loading from registry

---

## 1. Proactive Behavior System

### Moltbot's Approach

**Cron Scheduling:**
```typescript
// Three schedule patterns
{
  "at": "2024-03-15T09:00:00Z",        // One-shot ISO 8601 timestamp
  "every": 3600000,                     // Fixed interval in milliseconds
  "cron": "0 9 * * 1-5 America/New_York" // Five-field cron with timezone
}

// Two execution models
{
  "systemEvent": "heartbeat",           // Main session queue
  "agentTurn": {                        // Isolated session
    "message": "Check pipeline health",
    "model": "anthropic/claude-sonnet-4",
    "thinking": "medium",
    "timeout": 30000
  }
}
```

**Webhook Integration:**
```typescript
// System events (enqueue to main session)
POST /hooks/wake
{
  "text": "New email from high-value prospect",
  "mode": "now" | "next-heartbeat"
}

// Isolated agent execution
POST /hooks/agent
{
  "message": "Analyze this email",
  "model": "anthropic/claude-opus-4",
  "thinking": "high",
  "channel": "slack:-1001234567890",
  "timeout": 60000
}
```

**Gmail Pub/Sub Integration:**
- Real-time email triggers via Google Pub/Sub
- Automatic webhook routing to agent sessions
- Custom payload transformations via `hooks.mappings`

### Our Current Implementation

**Pipeline Analysis (PROACTIVE-002):**
```typescript
// Cron-only approach - runs daily at 9am
async function analyzeAllUsers(supabase: any) {
  // Analyze pipeline for all users
  // Create Action Centre items
  // Send Slack notifications
}
```

**Limitations:**
- ❌ No webhook-based event handling
- ❌ Fixed schedule only (no one-shot or interval patterns)
- ❌ No external event triggers (email, calendar, CRM changes)
- ❌ No configurable thinking levels per task
- ❌ No isolated vs. main session distinction

### Suggested Improvements

#### 1.1 Enhanced Scheduling System

**Priority: HIGH** | **Effort: MEDIUM**

```typescript
// supabase/functions/_shared/proactive/scheduler.ts
interface ProactiveSchedule {
  type: 'cron' | 'interval' | 'at' | 'event';
  pattern?: string;              // Cron pattern or ISO timestamp
  interval?: number;             // Milliseconds for interval
  eventType?: string;            // For webhook events
  executionMode: 'main' | 'isolated';
  config: {
    message: string;
    thinkingLevel: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    timeout?: number;
    deliveryChannel?: string[];  // ['slack', 'in-app', 'email']
  };
}

// Examples
const schedules: ProactiveSchedule[] = [
  {
    type: 'cron',
    pattern: '0 9 * * 1-5',  // Weekday mornings
    executionMode: 'isolated',
    config: {
      message: 'Daily pipeline pulse',
      thinkingLevel: 'medium',
      deliveryChannel: ['slack', 'in-app']
    }
  },
  {
    type: 'at',
    pattern: '2024-03-15T14:00:00Z',  // One-shot reminder
    executionMode: 'main',
    config: {
      message: 'Meeting prep for BigCorp demo',
      thinkingLevel: 'high'
    }
  },
  {
    type: 'interval',
    interval: 3600000,  // Every hour
    executionMode: 'isolated',
    config: {
      message: 'Check for urgent deal updates',
      thinkingLevel: 'low'
    }
  }
];
```

**Benefits:**
- ✅ Flexible scheduling patterns for different use cases
- ✅ One-shot reminders for specific events
- ✅ Interval-based checks for time-sensitive data
- ✅ Configurable thinking depth per task (save cost on routine checks)

#### 1.2 Webhook Event System

**Priority: HIGH** | **Effort: MEDIUM-HIGH**

```typescript
// supabase/functions/proactive-webhook/index.ts
interface WebhookEvent {
  source: 'bullhorn' | 'fathom' | 'gmail' | 'calendar' | 'custom';
  eventType: string;
  payload: Record<string, unknown>;
  userId: string;
  organizationId: string;
}

// Webhook handlers for different sources
const eventHandlers: Record<string, EventHandler> = {
  'bullhorn.candidate.statusChanged': async (event) => {
    // Trigger proactive outreach when candidate moves to Interview stage
    return {
      action: 'isolated_agent',
      message: `Candidate ${event.payload.name} moved to Interview. Prep outreach.`,
      thinkingLevel: 'high',
      sequenceKey: 'seq-candidate-interview-prep'
    };
  },

  'fathom.recording.completed': async (event) => {
    // Analyze meeting recording and create follow-up tasks
    return {
      action: 'isolated_agent',
      message: `Analyze recording ${event.payload.recordingId} and create action items`,
      thinkingLevel: 'high',
      deliveryChannel: ['slack', 'in-app']
    };
  },

  'gmail.email.received': async (event) => {
    if (event.payload.from === 'high-value-prospect@bigcorp.com') {
      return {
        action: 'main_session',
        message: `Priority email from ${event.payload.from}. Draft response?`,
        thinkingLevel: 'high',
        mode: 'now'
      };
    }
  },

  'calendar.meeting.scheduled': async (event) => {
    // Auto-schedule prep task 24h before meeting
    return {
      action: 'scheduled',
      executeAt: new Date(event.payload.startTime).getTime() - 86400000, // 24h before
      message: `Prep for meeting with ${event.payload.attendees.join(', ')}`,
      thinkingLevel: 'high'
    };
  }
};

// Generic webhook endpoint with auth
serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!verifyWebhookToken(authHeader)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const event: WebhookEvent = await req.json();
  const handler = eventHandlers[`${event.source}.${event.eventType}`];

  if (handler) {
    const action = await handler(event);
    await executeProactiveAction(event.userId, event.organizationId, action);
  }

  return new Response(JSON.stringify({ success: true }));
});
```

**Integration Points:**
- **Bullhorn**: Candidate status changes, new submissions, interview scheduled
- **Fathom**: Recording completed, transcript available, key moments detected
- **Gmail Pub/Sub**: High-priority emails from tracked contacts/deals
- **Google Calendar**: Meeting scheduled, meeting starting soon, meeting completed
- **Custom CRM**: Deal stage changed, deal at risk, overdue task

**Benefits:**
- ✅ Real-time reactivity to business events
- ✅ No polling delays - instant notifications
- ✅ Event-driven workflows (better UX than scheduled checks)
- ✅ Contextual proactive behavior based on actual activity

---

## 2. Memory & Learning System

### Moltbot's Approach

**Session Architecture:**
```typescript
// Persistent session storage
interface Session {
  id: string;                    // "agent:<agentId>:<channel>:group:<id>"
  transcript: Message[];         // Full JSONL history
  context: Record<string, any>;  // Session state
  metadata: {
    label: string;
    provider: string;
    from: string;
    to: string;
  };
}

// Session isolation strategies
const dmScope: 'unified' | 'per-peer' | 'per-channel' | 'per-account' = 'unified';
```

**Pre-Compaction Memory Flush:**
```typescript
// Before hitting context limits, trigger silent model turn
async function preCompactionFlush(session: Session) {
  await model.complete({
    system: `You are about to lose context. Write important facts to disk.

    Skills available:
    - write_memory(key, value): Store long-term facts
    - update_context(updates): Update session context

    Review conversation and preserve critical information.`,
    messages: session.transcript,
    temperature: 0.3
  });
}
```

**Context Pruning:**
```typescript
// Remove tool results but preserve JSONL
function pruneContext(transcript: Message[]): Message[] {
  return transcript.map(msg => {
    if (msg.role === 'tool' && msg.type === 'tool_result') {
      // Keep tool call ID but remove large result content
      return { ...msg, content: '[pruned]' };
    }
    return msg;
  });
}
```

### Our Current Implementation

**Agent State:**
```typescript
interface AgentState {
  phase: 'idle' | 'understand' | 'plan' | 'execute' | 'report';
  goal: AgentGoal | null;
  context: Record<string, any>;
  plan: ExecutionPlan | null;
  executedSteps: PlannedStep[];
  gaps: SkillGap[];
  conversationHistory: AgentMessage[];
  sessionId: string;
  startedAt: Date;
}
```

**Limitations:**
- ❌ No persistent session storage (state lost between sessions)
- ❌ No pre-compaction memory preservation
- ❌ No session isolation strategies
- ❌ Context not carried across conversations
- ❌ No explicit memory management commands

### Suggested Improvements

#### 2.1 Persistent Session Storage

**Priority: HIGH** | **Effort: HIGH**

```typescript
// supabase/migrations/add_agent_sessions.sql
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  session_key TEXT NOT NULL,  -- "main" or "deal:123" or "contact:456"
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, organization_id, session_key)
);

CREATE INDEX idx_agent_sessions_activity
  ON agent_sessions(user_id, organization_id, last_activity_at DESC);

// Session management
interface SessionManager {
  // Get or create session
  async getSession(key: string): Promise<Session>;

  // Append to transcript
  async appendMessage(sessionKey: string, message: Message): Promise<void>;

  // Update context (merge, don't replace)
  async updateContext(sessionKey: string, updates: Record<string, any>): Promise<void>;

  // Prune old tool results (keep last N messages)
  async pruneToolResults(sessionKey: string, keepLast: number): Promise<void>;

  // Archive session (move to cold storage)
  async archiveSession(sessionKey: string): Promise<void>;
}
```

**Session Key Strategies:**
```typescript
// Main conversation (unified across all interactions)
const mainKey = 'main';

// Deal-specific context
const dealKey = `deal:${dealId}`;

// Contact-specific context
const contactKey = `contact:${contactId}`;

// Meeting-specific context
const meetingKey = `meeting:${meetingId}`;

// User can switch contexts: "Let's talk about the BigCorp deal"
// Agent recognizes entity and switches to deal-specific session
```

**Benefits:**
- ✅ Conversation continuity across days/weeks
- ✅ Context-aware responses based on history
- ✅ Deal/contact-specific memory
- ✅ No "starting from scratch" each conversation

#### 2.2 Pre-Compaction Memory System

**Priority: MEDIUM** | **Effort: MEDIUM**

```typescript
// src/lib/copilot/agent/memory.ts
interface MemoryFlush {
  trigger: 'token_limit' | 'time_based' | 'manual';
  threshold: number;  // e.g., 80% of token limit
}

async function executeMemoryFlush(
  session: Session,
  anthropic: Anthropic
): Promise<{ preserved: Record<string, any> }> {
  const systemPrompt = `You are about to lose conversation context due to token limits.

  Review the conversation and extract:
  1. Key facts about deals, contacts, and relationships
  2. User preferences and communication style
  3. Ongoing tasks or commitments you've made
  4. Important deadlines or upcoming events
  5. Any unresolved questions or action items

  Return JSON with this structure:
  {
    "deals": { "dealId": { "status": "...", "next_steps": "..." } },
    "contacts": { "contactId": { "relationship": "...", "notes": "..." } },
    "preferences": { "communication_style": "...", "priorities": "..." },
    "commitments": ["Task 1", "Task 2"],
    "context": { "key": "value" }
  }`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    temperature: 0.1,  // Deterministic extraction
    system: systemPrompt,
    messages: session.transcript
  });

  const preserved = JSON.parse(response.content[0].text);

  // Store in long-term memory
  await supabase.from('agent_memory').upsert({
    user_id: session.userId,
    organization_id: session.organizationId,
    memory_type: 'pre_compaction',
    content: preserved,
    source_session_id: session.id,
    created_at: new Date()
  });

  // Update session context
  await sessionManager.updateContext(session.key, {
    _preserved_memory: preserved,
    _last_compaction: new Date()
  });

  return { preserved };
}

// Trigger automatically
async function checkAndFlushMemory(session: Session) {
  const tokenCount = estimateTokens(session.transcript);
  const tokenLimit = 180000;  // For Claude Sonnet

  if (tokenCount > tokenLimit * 0.8) {  // 80% threshold
    console.log('[Memory] Approaching token limit, triggering pre-compaction flush');
    await executeMemoryFlush(session, anthropic);

    // Prune transcript but keep preserved memory
    await sessionManager.pruneToolResults(session.key, 50);  // Keep last 50 messages
  }
}
```

**Benefits:**
- ✅ Graceful context management at scale
- ✅ Important facts preserved even with long conversations
- ✅ Automatic memory consolidation
- ✅ Reduced context loss during truncation

#### 2.3 Explicit Memory Commands

**Priority: MEDIUM** | **Effort: LOW**

```typescript
// Add to skills system
const memorySkills: Skill[] = [
  {
    skill_key: 'remember_fact',
    frontmatter: {
      name: 'Remember Fact',
      description: 'Store a fact in long-term memory',
      category: 'memory',
      parameters: {
        key: { type: 'string', required: true },
        value: { type: 'any', required: true },
        context: { type: 'string' }  // 'deal', 'contact', 'user'
      }
    },
    execute: async ({ key, value, context }) => {
      await supabase.from('agent_memory').insert({
        user_id: userId,
        organization_id: orgId,
        memory_type: context || 'general',
        content: { [key]: value },
        created_at: new Date()
      });

      return { success: true, message: `Remembered: ${key}` };
    }
  },

  {
    skill_key: 'recall_fact',
    frontmatter: {
      name: 'Recall Fact',
      description: 'Retrieve a fact from long-term memory',
      category: 'memory',
      parameters: {
        key: { type: 'string', required: true },
        context: { type: 'string' }
      }
    },
    execute: async ({ key, context }) => {
      const { data } = await supabase
        .from('agent_memory')
        .select('content')
        .eq('user_id', userId)
        .eq('memory_type', context || 'general')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      return { success: true, data: data?.content?.[key] };
    }
  }
];

// User: "Remember that BigCorp prefers technical demos over business cases"
// Agent: "Got it, I'll remember that BigCorp prefers technical demos."
//        [Uses remember_fact skill with context='deal:bigcorp']

// Later...
// User: "What does BigCorp prefer?"
// Agent: [Uses recall_fact skill] "BigCorp prefers technical demos over business cases."
```

**Benefits:**
- ✅ Explicit user control over memory
- ✅ Long-term fact storage across sessions
- ✅ Context-specific memories (deal, contact, user)
- ✅ Agent can proactively recall relevant facts

---

## 3. Multi-Channel Communication

### Moltbot's Approach

**Unified Routing:**
```typescript
// Single agent can deliver to any channel
const channels = [
  'whatsapp',
  'telegram',
  'slack',
  'discord',
  'signal',
  'imessage',
  'google-chat',
  'matrix'
];

// Channel-specific configuration
interface ChannelConfig {
  chunking: {
    maxLength: number;      // Slack: 4000, WhatsApp: 4096
    strategy: 'split' | 'truncate' | 'summarize';
  };
  formatting: {
    markdown: boolean;      // Slack: yes, WhatsApp: limited
    mentions: boolean;
    reactions: boolean;
  };
  delivery: {
    mode: 'mention' | 'always' | 'dm-only';
    replyTo: boolean;       // Thread vs. new message
  };
}
```

**DM Security:**
```typescript
// Unknown senders require pairing code
const dmPolicy: 'open' | 'pairing' | 'allowlist' = 'pairing';

// User must approve: moltbot pairing approve discord AB12CD
async function handleUnknownSender(channel: string, senderId: string) {
  const pairingCode = generateCode();

  await sendMessage(channel, senderId,
    `🔐 Hi! I'm an AI assistant. To start chatting, please ask your admin to approve pairing code: ${pairingCode}`
  );

  // Store pending pairing
  await db.insert('pending_pairings', {
    channel,
    sender_id: senderId,
    code: pairingCode,
    expires_at: Date.now() + 3600000  // 1 hour
  });
}
```

**Group Mention Gating:**
```typescript
// Only respond when mentioned in groups
const groupActivation: 'mention' | 'always' = 'mention';

function shouldRespond(message: Message, botUserId: string): boolean {
  if (message.isDM) return true;

  if (groupActivation === 'mention') {
    return message.mentions.includes(botUserId);
  }

  return true;  // Always mode
}
```

### Our Current Implementation

**Delivery Channels:**
```typescript
// supabase/functions/_shared/proactive/deliverySlack.ts
async function sendSlackNotification(userId: string, message: any) {
  const { data: slackAuth } = await supabase
    .from('slack_auth')
    .select('access_token, channel_id')
    .eq('user_id', userId)
    .maybeSingle();

  // Only Slack is implemented
  await fetch('https://slack.com/api/chat.postMessage', { ... });
}

// supabase/functions/_shared/proactive/deliveryInApp.ts
async function sendInAppNotification(userId: string, notification: any) {
  // In-app notifications via Action Centre
  await supabase.from('action_centre_items').insert({ ... });
}
```

**Limitations:**
- ❌ Only Slack + in-app (no SMS, email, WhatsApp, Teams)
- ❌ No unified routing logic
- ❌ No channel-specific formatting
- ❌ No DM security patterns
- ❌ No mention gating for group contexts
- ❌ No delivery preferences per user

### Suggested Improvements

#### 3.1 Unified Multi-Channel System

**Priority: MEDIUM** | **Effort: HIGH**

```typescript
// src/lib/copilot/delivery/channelRouter.ts
interface DeliveryConfig {
  channels: {
    primary: ChannelType;
    fallback: ChannelType[];
    preferences: {
      urgent: ChannelType;      // Critical alerts
      daily: ChannelType;        // Daily summaries
      conversations: ChannelType; // Back-and-forth chat
    };
  };
  formatting: {
    useMarkdown: boolean;
    includeEmojis: boolean;
    maxLength: number;
  };
  timing: {
    respectQuietHours: boolean;
    quietStart: string;  // "22:00"
    quietEnd: string;    // "08:00"
  };
}

type ChannelType = 'slack' | 'email' | 'sms' | 'teams' | 'in-app';

class UnifiedDelivery {
  async send(
    userId: string,
    message: ProactiveMessage,
    config?: Partial<DeliveryConfig>
  ): Promise<DeliveryResult> {
    // Get user preferences
    const userPrefs = await this.getUserPreferences(userId);
    const finalConfig = { ...this.defaults, ...userPrefs, ...config };

    // Check quiet hours
    if (this.isQuietHours(finalConfig.timing) && message.priority !== 'urgent') {
      return { queued: true, deliverAt: this.nextActiveTime(finalConfig.timing) };
    }

    // Select channel based on message type and priority
    const channel = this.selectChannel(message, finalConfig);

    // Format message for channel
    const formatted = await this.formatMessage(message, channel, finalConfig);

    // Attempt delivery with fallback
    try {
      return await this.deliverToChannel(channel, formatted);
    } catch (error) {
      console.warn(`[Delivery] ${channel} failed, trying fallback`);

      for (const fallbackChannel of finalConfig.channels.fallback) {
        try {
          return await this.deliverToChannel(fallbackChannel, formatted);
        } catch {}
      }

      throw new Error('All delivery channels failed');
    }
  }

  private selectChannel(
    message: ProactiveMessage,
    config: DeliveryConfig
  ): ChannelType {
    if (message.priority === 'urgent') {
      return config.channels.preferences.urgent;
    }

    if (message.type === 'daily_summary') {
      return config.channels.preferences.daily;
    }

    if (message.conversational) {
      return config.channels.preferences.conversations;
    }

    return config.channels.primary;
  }

  private async formatMessage(
    message: ProactiveMessage,
    channel: ChannelType,
    config: DeliveryConfig
  ): Promise<FormattedMessage> {
    const formatter = this.formatters[channel];
    return formatter.format(message, config.formatting);
  }
}

// Channel formatters
const slackFormatter: MessageFormatter = {
  format: (message, config) => ({
    blocks: buildSlackBlocks(message),
    text: message.text,
    mrkdwn: config.useMarkdown
  }),
  maxLength: 4000
};

const emailFormatter: MessageFormatter = {
  format: (message, config) => ({
    subject: message.title,
    html: buildEmailHTML(message),
    text: stripMarkdown(message.text)
  }),
  maxLength: 100000
};

const smsFormatter: MessageFormatter = {
  format: (message, config) => ({
    body: truncate(stripMarkdown(message.text), 160),
    media: message.imageUrl
  }),
  maxLength: 160
};

const teamsFormatter: MessageFormatter = {
  format: (message, config) => ({
    body: {
      contentType: 'html',
      content: buildTeamsHTML(message)
    },
    attachments: buildAdaptiveCards(message)
  }),
  maxLength: 28000
};
```

**Usage:**
```typescript
const delivery = new UnifiedDelivery();

// Send pipeline analysis
await delivery.send(userId, {
  type: 'daily_summary',
  priority: 'normal',
  title: 'Pipeline Pulse',
  text: '5 deals need attention...',
  actions: [
    { label: 'View Details', url: '/action-centre' },
    { label: 'Snooze', action: 'snooze' }
  ]
});

// Send urgent alert (ignores quiet hours, uses urgent channel)
await delivery.send(userId, {
  type: 'alert',
  priority: 'urgent',
  title: 'BigCorp Deal At Risk',
  text: 'No contact in 14 days, deal value $500K',
  conversational: false
});

// Conversational message (uses chat channel like Slack)
await delivery.send(userId, {
  type: 'question',
  priority: 'normal',
  text: 'Should I send the follow-up email to BigCorp?',
  conversational: true
});
```

**Benefits:**
- ✅ Consistent experience across channels
- ✅ Smart channel selection based on context
- ✅ Quiet hours and delivery preferences
- ✅ Fallback handling for reliability
- ✅ User control over notification preferences

#### 3.2 SMS & Email Integration

**Priority: LOW-MEDIUM** | **Effort: MEDIUM**

```typescript
// supabase/functions/_shared/proactive/deliverySMS.ts
import { Twilio } from 'twilio';

const twilioClient = new Twilio(
  Deno.env.get('TWILIO_ACCOUNT_SID')!,
  Deno.env.get('TWILIO_AUTH_TOKEN')!
);

async function sendSMS(userId: string, message: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('phone_number, sms_enabled')
    .eq('id', userId)
    .single();

  if (!profile?.sms_enabled || !profile?.phone_number) {
    return false;
  }

  await twilioClient.messages.create({
    body: message,
    from: Deno.env.get('TWILIO_PHONE_NUMBER'),
    to: profile.phone_number
  });

  return true;
}

// supabase/functions/_shared/proactive/deliveryEmail.ts
import { Resend } from 'resend';

const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);

async function sendEmail(
  userId: string,
  subject: string,
  html: string
): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, email_notifications_enabled')
    .eq('id', userId)
    .single();

  if (!profile?.email_notifications_enabled) {
    return false;
  }

  await resend.emails.send({
    from: 'Sixty Assistant <assistant@use60.com>',
    to: profile.email,
    subject,
    html
  });

  return true;
}
```

**Use Cases:**
- **SMS**: Urgent deal alerts, meeting reminders (< 1 hour), critical tasks
- **Email**: Daily summaries, weekly reports, non-urgent insights
- **Slack**: Conversational, real-time updates, interactive actions
- **In-App**: Always-on fallback, detailed context, historical reference

---

## 4. Session Intelligence & Context Switching

### Moltbot's Approach

**Session-to-Session Communication:**
```typescript
// Agent can coordinate with other sessions
const sessionTools = [
  {
    name: 'sessions_list',
    description: 'List all active sessions',
    execute: async () => {
      return sessions.map(s => ({
        id: s.id,
        label: s.metadata.label,
        lastActivity: s.lastActivityAt
      }));
    }
  },

  {
    name: 'sessions_history',
    description: 'Get transcript from another session',
    parameters: { sessionId: 'string' },
    execute: async ({ sessionId }) => {
      const session = await getSession(sessionId);
      return session.transcript.slice(-20);  // Last 20 messages
    }
  },

  {
    name: 'sessions_send',
    description: 'Send message to another session',
    parameters: {
      sessionId: 'string',
      message: 'string'
    },
    execute: async ({ sessionId, message }) => {
      await appendMessage(sessionId, {
        role: 'user',
        content: `[From ${currentSession.id}]: ${message}`
      });
      return { success: true };
    }
  }
];
```

**Context Switching:**
```typescript
// User: "Let's talk about the BigCorp deal"
// Agent recognizes entity mention and switches session context

async function detectContextSwitch(message: string): Promise<string | null> {
  const entities = await extractEntities(message);

  if (entities.deal) {
    return `deal:${entities.deal.id}`;
  }

  if (entities.contact) {
    return `contact:${entities.contact.id}`;
  }

  if (entities.meeting) {
    return `meeting:${entities.meeting.id}`;
  }

  return null;  // Stay in current session
}

// Load new session context
async function switchSession(newKey: string) {
  const newSession = await sessionManager.getSession(newKey);

  // Provide context summary to agent
  return {
    switched: true,
    context: newSession.context,
    recentHistory: newSession.transcript.slice(-10)
  };
}
```

### Our Current Implementation

**Single Session:**
```typescript
// Agent only maintains state for current conversation
interface AgentState {
  sessionId: string;  // Generated per conversation
  conversationHistory: AgentMessage[];
  // No cross-session communication
  // No entity-specific contexts
}
```

**Limitations:**
- ❌ No session-to-session communication
- ❌ No entity-specific contexts (deal, contact, meeting)
- ❌ No context switching based on conversation
- ❌ Agent can't reference previous conversations about same deal
- ❌ No coordination between proactive and conversational sessions

### Suggested Improvements

#### 4.1 Entity-Scoped Sessions

**Priority: MEDIUM** | **Effort: MEDIUM-HIGH**

```typescript
// src/lib/copilot/sessions/entitySessions.ts
interface EntitySession extends Session {
  entityType: 'deal' | 'contact' | 'meeting' | 'task' | 'main';
  entityId?: string;
  parentSession?: string;  // Link to main session
}

class EntitySessionManager {
  // Get or create entity-specific session
  async getEntitySession(
    userId: string,
    organizationId: string,
    entityType: string,
    entityId: string
  ): Promise<EntitySession> {
    const sessionKey = `${entityType}:${entityId}`;

    let session = await this.sessionManager.getSession(sessionKey);

    if (!session) {
      // Create new entity session
      session = await this.sessionManager.createSession({
        userId,
        organizationId,
        sessionKey,
        context: await this.loadEntityContext(entityType, entityId),
        metadata: {
          entityType,
          entityId,
          parentSession: 'main'
        }
      });
    }

    return session;
  }

  // Load entity-specific context
  private async loadEntityContext(
    entityType: string,
    entityId: string
  ): Promise<Record<string, any>> {
    switch (entityType) {
      case 'deal':
        const deal = await supabase
          .from('deals')
          .select('*, contacts(*), deal_stages(*)')
          .eq('id', entityId)
          .single();

        return {
          dealName: deal.data.name,
          dealValue: deal.data.value,
          dealStage: deal.data.deal_stages?.name,
          primaryContact: deal.data.contacts?.first_name,
          // ... more context
        };

      case 'contact':
        const contact = await supabase
          .from('contacts')
          .select('*, organizations(*), deals(*)')
          .eq('id', entityId)
          .single();

        return {
          contactName: `${contact.data.first_name} ${contact.data.last_name}`,
          organization: contact.data.organizations?.name,
          activeDeals: contact.data.deals?.length,
          // ... more context
        };

      case 'meeting':
        const meeting = await supabase
          .from('calendar_events')
          .select('*, recordings(*)')
          .eq('id', entityId)
          .single();

        return {
          meetingTitle: meeting.data.title,
          meetingDate: meeting.data.start_time,
          attendees: meeting.data.attendees,
          hasRecording: !!meeting.data.recordings?.[0],
          // ... more context
        };
    }
  }

  // Detect entity mentions and switch context
  async detectAndSwitch(
    message: string,
    currentSession: Session
  ): Promise<{ switched: boolean; newSession?: EntitySession }> {
    // Extract entities from message
    const entities = await this.extractEntities(message);

    if (entities.deal) {
      const dealSession = await this.getEntitySession(
        currentSession.userId,
        currentSession.organizationId,
        'deal',
        entities.deal.id
      );

      return { switched: true, newSession: dealSession };
    }

    if (entities.contact) {
      const contactSession = await this.getEntitySession(
        currentSession.userId,
        currentSession.organizationId,
        'contact',
        entities.contact.id
      );

      return { switched: true, newSession: contactSession };
    }

    return { switched: false };
  }

  // Extract entities from message using LLM
  private async extractEntities(message: string): Promise<{
    deal?: { id: string; name: string };
    contact?: { id: string; name: string };
    meeting?: { id: string; title: string };
  }> {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-3-5-20250114',  // Fast for entity extraction
      max_tokens: 500,
      temperature: 0.1,
      system: `Extract entity mentions from the message.

      Return JSON:
      {
        "deal": { "id": "uuid", "name": "exact name from message" },
        "contact": { "id": "uuid", "name": "exact name from message" },
        "meeting": { "id": "uuid", "title": "exact title from message" }
      }

      Only include entities that are explicitly mentioned.`,
      messages: [{ role: 'user', content: message }]
    });

    return JSON.parse(response.content[0].text);
  }
}
```

**Usage:**
```typescript
// User: "Tell me about the BigCorp deal"
const switchResult = await entitySessionManager.detectAndSwitch(
  message,
  currentSession
);

if (switchResult.switched) {
  // Load deal-specific context
  const dealContext = switchResult.newSession!.context;

  // Agent now has full deal history and context
  // Previous conversations about this deal are accessible
  // Deal-specific memory is active

  console.log(`Switched to deal session: ${dealContext.dealName}`);
}

// Agent response:
// "The BigCorp deal is currently in the Negotiation stage, valued at $500K.
//  Last time we talked (3 days ago), you mentioned they prefer technical demos.
//  Their primary contact is John Smith, and we have a demo scheduled for next week."
```

**Benefits:**
- ✅ Entity-aware conversations with full context
- ✅ Recall previous conversations about same entity
- ✅ Automatic context loading when entity mentioned
- ✅ Separate memory per deal/contact/meeting
- ✅ More relevant and personalized responses

#### 4.2 Session Coordination Tools

**Priority: LOW-MEDIUM** | **Effort: MEDIUM**

```typescript
// Add to skills system
const sessionTools: Skill[] = [
  {
    skill_key: 'list_active_sessions',
    frontmatter: {
      name: 'List Active Sessions',
      description: 'View all active conversation contexts',
      category: 'sessions'
    },
    execute: async () => {
      const sessions = await supabase
        .from('agent_sessions')
        .select('session_key, metadata, last_activity_at')
        .eq('user_id', userId)
        .eq('organization_id', orgId)
        .order('last_activity_at', { ascending: false })
        .limit(10);

      return {
        success: true,
        data: sessions.data?.map(s => ({
          key: s.session_key,
          type: s.metadata.entityType || 'main',
          entity: s.metadata.entityId,
          lastActive: s.last_activity_at
        }))
      };
    }
  },

  {
    skill_key: 'get_session_summary',
    frontmatter: {
      name: 'Get Session Summary',
      description: 'Get summary of another conversation context',
      category: 'sessions',
      parameters: {
        sessionKey: { type: 'string', required: true }
      }
    },
    execute: async ({ sessionKey }) => {
      const session = await supabase
        .from('agent_sessions')
        .select('transcript, context')
        .eq('user_id', userId)
        .eq('session_key', sessionKey)
        .single();

      // Generate summary using LLM
      const summary = await summarizeConversation(session.data.transcript);

      return { success: true, data: summary };
    }
  },

  {
    skill_key: 'cross_reference_sessions',
    frontmatter: {
      name: 'Cross-Reference Sessions',
      description: 'Find related information across different contexts',
      category: 'sessions',
      parameters: {
        query: { type: 'string', required: true }
      }
    },
    execute: async ({ query }) => {
      // Search across all user sessions
      const sessions = await supabase
        .from('agent_sessions')
        .select('session_key, transcript, context')
        .eq('user_id', userId);

      // Use vector search or LLM to find relevant information
      const relevantInfo = await findRelevantContext(query, sessions.data);

      return { success: true, data: relevantInfo };
    }
  }
];
```

**Example Use Case:**
```typescript
// User: "What deals are similar to BigCorp?"
// Agent uses cross_reference_sessions to search deal contexts

// Agent: "I found 3 similar deals:
// 1. TechStartup Inc - same industry, $300K value, closed last month
// 2. Enterprise Corp - similar size, $600K, currently in negotiation
// 3. SaaS Company - same product needs, $400K, won 2 weeks ago
//
// Would you like me to pull insights from how we won the SaaS Company deal?"
```

**Benefits:**
- ✅ Cross-session intelligence
- ✅ Pattern recognition across deals/contacts
- ✅ Learn from past successful interactions
- ✅ Proactive insights from related contexts

---

## 5. Dynamic Capabilities & Skills

### Moltbot's Approach

**ClawdHub Skill Registry:**
```typescript
// Skills can be discovered and installed at runtime
interface SkillRegistry {
  search(query: string): Promise<SkillManifest[]>;
  install(skillId: string): Promise<boolean>;
  update(skillId: string): Promise<boolean>;
  uninstall(skillId: string): Promise<boolean>;
}

// Skill categories
enum SkillSource {
  BUNDLED = 'bundled',      // Pre-installed core skills
  MANAGED = 'managed',       // From ClawdHub registry
  WORKSPACE = 'workspace'    // User-defined in ~/clawd/skills/
}

// Agent can auto-discover needed skills
async function handleMissingSkill(skillName: string) {
  const results = await registry.search(skillName);

  if (results.length > 0) {
    const bestMatch = results[0];

    // Ask user for permission
    await sendMessage(`Found skill "${bestMatch.name}" in registry. Install? [yes/no]`);

    const response = await waitForResponse();
    if (response === 'yes') {
      await registry.install(bestMatch.id);
      return true;
    }
  }

  return false;
}
```

**Configurable Thinking Levels:**
```typescript
// Per-task thinking configuration
type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

interface TaskConfig {
  model: string;
  thinking: ThinkingLevel;
  timeout: number;
}

// Routine tasks use minimal thinking (cheaper)
const dailyPulse: TaskConfig = {
  model: 'anthropic/claude-haiku-3-5',
  thinking: 'low',
  timeout: 30000
};

// Complex analysis uses high thinking
const dealStrategy: TaskConfig = {
  model: 'anthropic/claude-opus-4',
  thinking: 'high',
  timeout: 120000
};
```

### Our Current Implementation

**Static Skills:**
```typescript
// Skills are hardcoded in database or workspace
const skills = await skillsProvider.listSkills();

// No runtime discovery
// No auto-installation
// No thinking level configuration
// No skill marketplace
```

**Limitations:**
- ❌ Skills must be manually added to database
- ❌ No skill discovery at runtime
- ❌ No skill marketplace or registry
- ❌ No per-task model/thinking configuration
- ❌ No automatic skill updates
- ❌ No cost optimization via thinking levels

### Suggested Improvements

#### 5.1 Skill Marketplace & Discovery

**Priority: LOW** | **Effort: HIGH**

```typescript
// supabase/migrations/add_skill_marketplace.sql
CREATE TABLE skill_marketplace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  author_id UUID REFERENCES auth.users(id),
  author_name TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  source_url TEXT,  -- GitHub URL or similar
  install_count INTEGER NOT NULL DEFAULT 0,
  rating NUMERIC(3, 2),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE organization_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  skill_key TEXT NOT NULL,
  source TEXT NOT NULL,  -- 'marketplace' | 'workspace' | 'bundled'
  marketplace_skill_id UUID REFERENCES skill_marketplace(id),
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB DEFAULT '{}'::jsonb,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, skill_key)
);

// Skill discovery
interface SkillMarketplace {
  async search(query: string, category?: string): Promise<SkillListing[]> {
    const { data } = await supabase
      .from('skill_marketplace')
      .select('*')
      .textSearch('fts', query)
      .order('rating', { ascending: false })
      .order('install_count', { ascending: false })
      .limit(20);

    return data || [];
  }

  async install(
    organizationId: string,
    skillKey: string
  ): Promise<boolean> {
    // Fetch skill definition from marketplace
    const skill = await this.getSkill(skillKey);

    // Download and validate skill code
    const skillCode = await fetch(skill.source_url).then(r => r.text());

    // Parse and validate skill
    const parsed = parseSkill(skillCode);
    if (!validateSkill(parsed)) {
      throw new Error('Skill validation failed');
    }

    // Install to organization
    await supabase.from('organization_skills').insert({
      organization_id: organizationId,
      skill_key: skillKey,
      source: 'marketplace',
      marketplace_skill_id: skill.id,
      enabled: true
    });

    // Increment install count
    await supabase.rpc('increment_skill_installs', { skill_id: skill.id });

    return true;
  }

  async autoDiscover(
    capability: string,
    organizationId: string
  ): Promise<SkillListing | null> {
    // Search marketplace for needed capability
    const results = await this.search(capability);

    if (results.length === 0) return null;

    // Find best match
    const bestMatch = results[0];

    // Check if already installed
    const { data: existing } = await supabase
      .from('organization_skills')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('skill_key', bestMatch.skill_key)
      .maybeSingle();

    if (existing) return null;  // Already have it

    return bestMatch;
  }
}
```

**Agent Auto-Discovery:**
```typescript
// During planning phase, agent discovers needed skills
async function handleMissingCapability(
  capability: string,
  organizationId: string
): Promise<void> {
  const marketplace = new SkillMarketplace();

  // Search marketplace
  const skill = await marketplace.autoDiscover(capability, organizationId);

  if (skill) {
    // Suggest to user
    await sendMessage({
      type: 'skill_suggestion',
      title: `New Skill Available: ${skill.name}`,
      description: skill.description,
      actions: [
        { label: 'Install', action: 'install_skill', data: { skillKey: skill.skill_key } },
        { label: 'View Details', url: `/marketplace/skills/${skill.id}` },
        { label: 'Dismiss', action: 'dismiss' }
      ]
    });
  }
}

// Example flow:
// User: "Send a LinkedIn message to all prospects in California"
// Agent: "I don't have a LinkedIn integration skill yet."
//        [Searches marketplace]
//        "I found 'LinkedIn Messaging' skill by @john. Install? [Yes/No]"
// User: "Yes"
//        [Installs skill]
// Agent: "Installed! Now sending LinkedIn messages..."
```

**Benefits:**
- ✅ Expandable capabilities without code deployment
- ✅ Community-driven skill development
- ✅ Auto-discovery of needed skills
- ✅ User approval for new skills (security)
- ✅ Skill ratings and reviews

#### 5.2 Configurable Thinking & Cost Optimization

**Priority: MEDIUM** | **Effort: LOW**

```typescript
// Add thinking level configuration to proactive tasks
interface ProactiveTask {
  type: string;
  schedule: Schedule;
  config: {
    model: string;
    thinkingLevel: ThinkingLevel;
    maxTokens: number;
    temperature: number;
    timeout: number;
  };
}

// Cost-optimized configurations
const taskConfigs: Record<string, ProactiveTask['config']> = {
  // Cheap + fast for routine checks
  daily_pulse: {
    model: 'claude-haiku-3-5-20250114',
    thinkingLevel: 'low',
    maxTokens: 1000,
    temperature: 0.5,
    timeout: 15000
  },

  // Moderate cost for analysis
  pipeline_analysis: {
    model: 'claude-sonnet-4-20250514',
    thinkingLevel: 'medium',
    maxTokens: 3000,
    temperature: 0.3,
    timeout: 45000
  },

  // High quality for strategic work
  deal_strategy: {
    model: 'claude-opus-4-5-20251101',
    thinkingLevel: 'high',
    maxTokens: 8000,
    temperature: 0.7,
    timeout: 120000
  },

  // Maximum depth for complex problems
  deal_rescue: {
    model: 'claude-opus-4-5-20251101',
    thinkingLevel: 'xhigh',
    maxTokens: 16000,
    temperature: 0.6,
    timeout: 180000
  }
};

// Dynamic model selection
async function selectModel(
  taskType: string,
  priority: 'low' | 'medium' | 'high'
): Promise<ProactiveTask['config']> {
  const baseConfig = taskConfigs[taskType];

  if (priority === 'low') {
    // Use cheaper model
    return {
      ...baseConfig,
      model: 'claude-haiku-3-5-20250114',
      thinkingLevel: 'minimal'
    };
  }

  if (priority === 'high') {
    // Use best model
    return {
      ...baseConfig,
      model: 'claude-opus-4-5-20251101',
      thinkingLevel: 'high'
    };
  }

  return baseConfig;
}
```

**Cost Impact:**
```typescript
// Example cost comparison (approximate)
const costs = {
  haiku_minimal: 0.001,    // Daily pulse checks
  sonnet_low: 0.005,       // Standard analysis
  sonnet_medium: 0.015,    // Deep analysis
  opus_high: 0.080,        // Strategic work
  opus_xhigh: 0.150        // Complex problem-solving
};

// Routing logic saves money:
// - Routine checks: Haiku ($0.001) vs. Opus ($0.150) = 99% savings
// - 100 daily checks: $0.10/day vs. $15/day
// - $36/year vs. $5,475/year per user
```

**Benefits:**
- ✅ 90-99% cost reduction for routine tasks
- ✅ Better performance (faster responses for simple tasks)
- ✅ Reserved high-quality thinking for important work
- ✅ Configurable per organization/user
- ✅ Transparent cost tracking

---

## 6. Additional Improvements

### 6.1 Voice Integration

**Priority: LOW** | **Effort: HIGH**

```typescript
// Voice Wake for mobile/desktop
interface VoiceConfig {
  enabled: boolean;
  wakeWord: string;           // "Hey Sixty"
  language: string;            // "en-US"
  provider: 'elevenlabs' | 'google' | 'azure';
  voiceId: string;
}

// Example: Voice command triggers proactive action
// User: "Hey Sixty, what deals need my attention?"
// Agent: [Triggers pipeline analysis, responds via voice]
```

**Benefits:**
- ✅ Hands-free interaction
- ✅ Mobile-friendly
- ✅ Natural conversation flow
- ✅ Accessibility improvement

### 6.2 Heartbeat System

**Priority: LOW-MEDIUM** | **Effort: MEDIUM**

```typescript
// Periodic check-ins with the user
interface HeartbeatConfig {
  frequency: string;           // Cron pattern
  template: string;
  conditions: HeartbeatCondition[];
}

interface HeartbeatCondition {
  type: 'time_since_activity' | 'deals_at_risk' | 'overdue_tasks';
  threshold: number;
  message: string;
}

// Example heartbeat:
// If no activity in 2 days AND deals at risk > 0:
//   "👋 Hey! You have 3 deals that haven't been touched in a while.
//    Want me to help with follow-ups?"
```

**Benefits:**
- ✅ Proactive re-engagement
- ✅ Prevents deals from going stale
- ✅ Gentle reminders without nagging
- ✅ Context-aware check-ins

### 6.3 Approval Workflows

**Priority: MEDIUM** | **Effort: MEDIUM**

```typescript
// Human-in-the-loop for sensitive actions
interface ApprovalRequest {
  id: string;
  action: string;
  description: string;
  preview: any;
  risk: 'low' | 'medium' | 'high';
  expiresAt: Date;
}

// Example flow:
// Agent: "I'd like to send this follow-up email to BigCorp:"
//        [Shows preview]
//        "Approve? [Yes/Edit/No]"
// User: "Edit"
//        [Makes changes]
// User: "Send it"
//        [Agent sends with modifications]
```

**Current State:**
- ✅ We already have Action Centre for HITL approval (AC-005)
- ✅ Just need better integration with conversational flow

---

## Implementation Roadmap

### Phase 1: Foundation (2-3 weeks)
**Priority: HIGH**

1. **Persistent Session Storage** (5 days)
   - Implement `agent_sessions` table
   - Build SessionManager class
   - Add session isolation strategies
   - Test cross-session continuity

2. **Enhanced Scheduling** (3 days)
   - Add interval and one-shot scheduling
   - Implement configurable thinking levels
   - Add isolated vs. main session modes

3. **Webhook Event System** (4 days)
   - Create webhook endpoint
   - Add event handlers for Bullhorn, Fathom, Gmail
   - Implement webhook authentication
   - Test real-time event triggers

**Milestone:** Agent maintains context across conversations and responds to real-time events

### Phase 2: Intelligence (2-3 weeks)
**Priority: HIGH**

1. **Entity-Scoped Sessions** (5 days)
   - Implement entity session manager
   - Add context switching logic
   - Build entity context loaders
   - Test entity-aware conversations

2. **Pre-Compaction Memory System** (4 days)
   - Implement memory flush logic
   - Add automatic trigger at 80% token limit
   - Create long-term memory storage
   - Test memory preservation across compactions

3. **Memory Skills** (2 days)
   - Add remember_fact/recall_fact skills
   - Integrate with session context
   - Test memory retrieval

**Milestone:** Agent remembers context across sessions and entities

### Phase 3: Communication (2 weeks)
**Priority: MEDIUM**

1. **Unified Multi-Channel Delivery** (5 days)
   - Build UnifiedDelivery class
   - Implement channel formatters
   - Add quiet hours and preferences
   - Test fallback handling

2. **SMS & Email Integration** (3 days)
   - Integrate Twilio for SMS
   - Integrate Resend for email
   - Add user preferences UI
   - Test multi-channel routing

3. **Session Coordination Tools** (2 days)
   - Add session list/summary skills
   - Implement cross-reference search
   - Test session intelligence

**Milestone:** Agent communicates via multiple channels intelligently

### Phase 4: Capabilities (1-2 weeks)
**Priority: LOW-MEDIUM**

1. **Skill Marketplace** (5 days)
   - Build marketplace tables
   - Implement discovery logic
   - Add install/update/uninstall
   - Create marketplace UI

2. **Cost Optimization** (2 days)
   - Add per-task model configuration
   - Implement cost tracking
   - Build usage dashboard
   - Optimize routine tasks for Haiku

**Milestone:** Agent capabilities are extensible and cost-optimized

### Phase 5: Enhancement (1 week)
**Priority: LOW**

1. **Voice Integration** (3 days)
   - Integrate ElevenLabs or similar
   - Add wake word detection
   - Test voice commands

2. **Heartbeat System** (2 days)
   - Build heartbeat logic
   - Add conditional triggers
   - Test re-engagement

**Milestone:** Agent is more interactive and engaging

---

## Success Metrics

### Engagement Metrics
- **Session Continuity**: % of users with multi-day conversation threads
- **Entity Context Usage**: # of entity-specific sessions created per user
- **Proactive Response Rate**: % of proactive notifications acted upon
- **Cross-Session Intelligence**: # of successful entity reference resolutions

### Quality Metrics
- **Memory Accuracy**: % of correctly recalled facts after compaction
- **Context Relevance**: User rating of context-aware responses
- **Event Response Time**: Time from webhook trigger to notification
- **Multi-Channel Success**: Delivery success rate per channel

### Cost Metrics
- **Cost per Interaction**: Average cost per conversational turn
- **Model Efficiency**: % of tasks routed to Haiku vs. Opus
- **Token Utilization**: Avg tokens per response (should decrease with better context)

### Business Metrics
- **Deal Velocity**: Time to close deals (should decrease)
- **Task Completion Rate**: % of suggested actions completed
- **User Satisfaction**: NPS score for AI assistant
- **Feature Adoption**: % of users engaging with new capabilities

---

## Conclusion

Moltbot demonstrates sophisticated patterns for building a truly proactive, learning AI assistant:

1. **Richer Event System**: Beyond cron → webhooks, Gmail Pub/Sub, external triggers
2. **Persistent Memory**: Session storage, pre-compaction flush, entity contexts
3. **Multi-Channel Communication**: Unified routing, channel-specific formatting, DM security
4. **Session Intelligence**: Cross-session coordination, entity-scoped contexts, context switching
5. **Dynamic Capabilities**: Skill marketplace, runtime discovery, cost-optimized thinking levels

**Recommended Focus for Sixty:**
- **Phase 1 (Foundation)**: Persistent sessions + webhooks = immediate value
- **Phase 2 (Intelligence)**: Entity contexts + memory = killer feature
- **Phase 3 (Communication)**: Multi-channel = broader reach
- **Phase 4-5**: Nice-to-haves when foundation is solid

This creates a sales assistant that truly "knows" the user, learns over time, and proactively helps close deals.
