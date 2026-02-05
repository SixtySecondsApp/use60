# MeetingBaaS Integration Plan
## use60 White-labelled Meeting Recording

**Last Updated:** 2026-01-04  
**Overall Status:** 🔴 Not Started

---

## Quick Reference

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Database Schema & Core Models | 🔴 Not Started |
| Phase 2 | Webhook Infrastructure | 🔴 Not Started |
| Phase 3 | MeetingBaaS API Integration | 🔴 Not Started |
| Phase 4 | Recording Rules Engine | 🔴 Not Started |
| Phase 5 | Transcript & AI Processing | 🔴 Not Started |
| Phase 6 | CRM Integration | 🔴 Not Started |
| Phase 7 | Notifications (Slack) | 🔴 Not Started |
| Phase 8 | User Interface | 🔴 Not Started |
| Phase 9 | Testing & QA | 🔴 Not Started |

**Status Key:** 🔴 Not Started | 🟡 In Progress | 🟢 Done | ⏸️ Blocked

---

## Configuration

### Environment Variables Required

```env
# MeetingBaaS
MEETINGBAAS_API_KEY=
MEETINGBAAS_WEBHOOK_SECRET=

# Storage
AWS_S3_BUCKET_RECORDINGS=
AWS_S3_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# Transcription
GLADIA_API_KEY=

# Existing (should already have)
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
OPENAI_API_KEY=
```

### MeetingBaaS API Reference
- **Base URL:** `https://api.meetingbaas.com/v2`
- **Docs:** https://docs.meetingbaas.com/api-v2/reference
- **Key Endpoints:**
  - `POST /bots` - Deploy bot to meeting
  - `GET /bots` - List bots
  - `GET /bots/{id}` - Get bot status
  - `DELETE /bots/{id}` - Remove bot from meeting

---

## Phase 1: Database Schema & Core Models

**Status:** 🔴 Not Started  
**Estimated Effort:** 1 day  
**Dependencies:** None

### Tasks

- [ ] **1.1** Create `recording_rules` table
- [ ] **1.2** Create `recordings` table
- [ ] **1.3** Create `recording_usage` table
- [ ] **1.4** Create `bot_deployments` table
- [ ] **1.5** Add organisation settings columns for recording preferences
- [ ] **1.6** Create database indexes
- [ ] **1.7** Generate TypeScript types from schema

### Schema Definitions

#### 1.1 recording_rules
```sql
CREATE TABLE recording_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL = org-wide rule
  
  -- Rule criteria
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0, -- Higher = evaluated first
  
  -- Domain rules
  domain_mode TEXT CHECK (domain_mode IN ('external_only', 'internal_only', 'specific_domains', 'all')),
  specific_domains TEXT[], -- For 'specific_domains' mode
  internal_domain TEXT, -- Company domain for external detection
  
  -- Attendee rules
  min_attendee_count INTEGER DEFAULT 1,
  max_attendee_count INTEGER, -- NULL = no limit
  
  -- Title keyword rules
  title_keywords TEXT[], -- Match if title contains ANY of these
  title_keywords_exclude TEXT[], -- Exclude if title contains ANY of these
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recording_rules_org ON recording_rules(organisation_id);
CREATE INDEX idx_recording_rules_user ON recording_rules(user_id);
```

#### 1.2 recordings
```sql
CREATE TABLE recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id), -- Who owns this recording
  
  -- Meeting info
  meeting_platform TEXT NOT NULL CHECK (meeting_platform IN ('zoom', 'google_meet', 'microsoft_teams')),
  meeting_url TEXT NOT NULL,
  meeting_title TEXT,
  meeting_start_time TIMESTAMPTZ,
  meeting_end_time TIMESTAMPTZ,
  meeting_duration_seconds INTEGER,
  
  -- Calendar link (if triggered from calendar)
  calendar_event_id TEXT,
  
  -- MeetingBaaS references
  bot_id TEXT, -- MeetingBaaS bot ID
  meetingbaas_recording_id TEXT,
  
  -- Storage
  recording_s3_key TEXT,
  recording_s3_url TEXT,
  transcript_s3_key TEXT,
  
  -- Transcript data
  transcript_json JSONB, -- Full transcript with timestamps and speakers
  transcript_text TEXT, -- Plain text version for search
  
  -- AI Analysis
  summary TEXT,
  highlights JSONB, -- [{timestamp, text, type}]
  action_items JSONB, -- Extracted by use60 AI
  
  -- Speaker identification
  speakers JSONB, -- [{speaker_id, email, name, is_internal}]
  speaker_identification_method TEXT CHECK (speaker_identification_method IN ('email_match', 'ai_inference', 'manual')),
  
  -- CRM links
  crm_contacts JSONB, -- [{contact_id, email, name, crm_type}]
  crm_deal_id TEXT,
  crm_activity_id TEXT, -- Created activity in CRM
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'recording', 'processing', 'ready', 'failed')),
  error_message TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recordings_org ON recordings(organisation_id);
CREATE INDEX idx_recordings_user ON recordings(user_id);
CREATE INDEX idx_recordings_status ON recordings(status);
CREATE INDEX idx_recordings_bot ON recordings(bot_id);
CREATE INDEX idx_recordings_created ON recordings(created_at DESC);
CREATE INDEX idx_recordings_search ON recordings USING gin(to_tsvector('english', transcript_text));
```

#### 1.3 recording_usage
```sql
CREATE TABLE recording_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  
  -- Period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Counts
  recordings_count INTEGER DEFAULT 0,
  recordings_limit INTEGER DEFAULT 20,
  
  -- Tracking
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organisation_id, period_start)
);

CREATE INDEX idx_recording_usage_org_period ON recording_usage(organisation_id, period_start);
```

#### 1.4 bot_deployments
```sql
CREATE TABLE bot_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  recording_id UUID REFERENCES recordings(id) ON DELETE SET NULL,
  
  -- MeetingBaaS
  bot_id TEXT NOT NULL, -- MeetingBaaS bot ID
  
  -- Status tracking
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'joining', 'in_meeting', 'leaving', 'completed', 'failed')),
  status_history JSONB DEFAULT '[]', -- [{status, timestamp, details}]
  
  -- Meeting details
  meeting_url TEXT NOT NULL,
  scheduled_join_time TIMESTAMPTZ,
  actual_join_time TIMESTAMPTZ,
  leave_time TIMESTAMPTZ,
  
  -- Bot config used
  bot_name TEXT,
  bot_image_url TEXT,
  entry_message TEXT,
  
  -- Errors
  error_code TEXT,
  error_message TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bot_deployments_bot ON bot_deployments(bot_id);
CREATE INDEX idx_bot_deployments_org ON bot_deployments(organisation_id);
CREATE INDEX idx_bot_deployments_status ON bot_deployments(status);
```

#### 1.5 Organisation Settings Extension
```sql
-- Add to existing organisations table or create organisation_settings
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS recording_settings JSONB DEFAULT '{
  "bot_name": "60 Notetaker",
  "bot_image_url": null,
  "entry_message_enabled": true,
  "entry_message": "Hi! I''m here to take notes so {rep_name} can focus on our conversation. 📝",
  "default_transcription_provider": "gladia",
  "recordings_limit": 20
}';

ALTER TABLE organisations ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{
  "recording_started": {"slack": true, "email": false, "in_app": true},
  "recording_failed": {"slack": true, "email": true, "in_app": true},
  "recording_ready": {"slack": true, "email": false, "in_app": true},
  "hitl_required": {"slack": true, "email": false, "in_app": true}
}';
```

---

## Phase 2: Webhook Infrastructure

**Status:** 🔴 Not Started  
**Estimated Effort:** 1-2 days  
**Dependencies:** Phase 1

### Tasks

- [ ] **2.1** Create Vercel API route for webhook ingestion `/api/webhooks/meetingbaas`
- [ ] **2.2** Implement webhook signature verification
- [ ] **2.3** Create Supabase Edge Function for async processing
- [ ] **2.4** Set up webhook event logging table
- [ ] **2.5** Implement retry logic for failed processing
- [ ] **2.6** Create webhook event types and handlers

### Webhook Events to Handle

| Event | Description | Action |
|-------|-------------|--------|
| `bot.joining` | Bot is joining the meeting | Update status, notify user |
| `bot.in_meeting` | Bot successfully joined | Update status |
| `bot.left` | Bot left the meeting | Trigger processing pipeline |
| `bot.failed` | Bot failed to join | Update status, notify user, log error |
| `recording.ready` | Recording file available | Download to S3, start transcription |
| `transcript.ready` | Transcript available (if using MeetingBaaS transcription) | Store and trigger AI analysis |

### 2.1 Webhook Ingestion Endpoint

```typescript
// /api/webhooks/meetingbaas/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Verify MeetingBaaS webhook signature
function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get('x-meetingbaas-signature');
    
    // Verify signature
    if (!signature || !verifySignature(payload, signature, process.env.MEETINGBAAS_WEBHOOK_SECRET!)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    
    const event = JSON.parse(payload);
    
    // Log webhook event
    await supabase.from('webhook_events').insert({
      source: 'meetingbaas',
      event_type: event.type,
      payload: event,
      status: 'received'
    });
    
    // Respond immediately (async processing happens in Edge Function)
    // Trigger Edge Function via database insert or direct invocation
    await supabase.functions.invoke('process-meetingbaas-webhook', {
      body: event
    });
    
    return NextResponse.json({ received: true });
    
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
```

### 2.3 Edge Function for Processing

```typescript
// supabase/functions/process-meetingbaas-webhook/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req) => {
  const event = await req.json();
  
  try {
    switch (event.type) {
      case 'bot.joining':
        await handleBotJoining(event);
        break;
      case 'bot.in_meeting':
        await handleBotInMeeting(event);
        break;
      case 'bot.left':
        await handleBotLeft(event);
        break;
      case 'bot.failed':
        await handleBotFailed(event);
        break;
      case 'recording.ready':
        await handleRecordingReady(event);
        break;
      case 'transcript.ready':
        await handleTranscriptReady(event);
        break;
      default:
        console.log('Unknown event type:', event.type);
    }
    
    return new Response(JSON.stringify({ processed: true }), { status: 200 });
    
  } catch (error) {
    console.error('Processing error:', error);
    
    // Log failure for retry
    await supabase.from('webhook_events')
      .update({ status: 'failed', error: error.message })
      .eq('payload->id', event.id);
    
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});

async function handleBotJoining(event: any) {
  await supabase.from('bot_deployments')
    .update({ 
      status: 'joining',
      status_history: supabase.sql`status_history || ${JSON.stringify([{status: 'joining', timestamp: new Date().toISOString()}])}::jsonb`
    })
    .eq('bot_id', event.bot_id);
  
  // TODO: Send notification
}

async function handleBotInMeeting(event: any) {
  await supabase.from('bot_deployments')
    .update({ 
      status: 'in_meeting',
      actual_join_time: new Date().toISOString()
    })
    .eq('bot_id', event.bot_id);
  
  await supabase.from('recordings')
    .update({ status: 'recording' })
    .eq('bot_id', event.bot_id);
}

async function handleBotLeft(event: any) {
  await supabase.from('bot_deployments')
    .update({ 
      status: 'completed',
      leave_time: new Date().toISOString()
    })
    .eq('bot_id', event.bot_id);
}

async function handleBotFailed(event: any) {
  await supabase.from('bot_deployments')
    .update({ 
      status: 'failed',
      error_code: event.error_code,
      error_message: event.error_message
    })
    .eq('bot_id', event.bot_id);
  
  await supabase.from('recordings')
    .update({ 
      status: 'failed',
      error_message: event.error_message
    })
    .eq('bot_id', event.bot_id);
  
  // TODO: Send failure notification
}

async function handleRecordingReady(event: any) {
  // Download from MeetingBaaS and upload to our S3
  // Then trigger transcription pipeline
  // TODO: Implement in Phase 5
}

async function handleTranscriptReady(event: any) {
  // Store transcript and trigger AI analysis
  // TODO: Implement in Phase 5
}
```

---

## Phase 3: MeetingBaaS API Integration

**Status:** 🔴 Not Started  
**Estimated Effort:** 1 day  
**Dependencies:** Phase 1, Phase 2

### Tasks

- [ ] **3.1** Create MeetingBaaS API client class
- [ ] **3.2** Implement bot deployment function
- [ ] **3.3** Implement bot status checking
- [ ] **3.4** Implement bot cancellation
- [ ] **3.5** Handle rate limiting
- [ ] **3.6** Add error handling and logging

### 3.1 MeetingBaaS Client

```typescript
// lib/meetingbaas/client.ts

interface BotConfig {
  meeting_url: string;
  bot_name?: string;
  bot_image?: string;
  entry_message?: string;
  recording_mode?: 'speaker_view' | 'gallery_view' | 'audio_only';
  webhook_url: string;
  reserved?: boolean; // Join immediately vs scheduled
  deduplication_key?: string;
}

interface BotResponse {
  id: string;
  status: string;
  meeting_url: string;
  created_at: string;
}

class MeetingBaaSClient {
  private baseUrl = 'https://api.meetingbaas.com/v2';
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  private async request<T>(
    method: string,
    endpoint: string,
    body?: any
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`MeetingBaaS API error: ${error.message || response.statusText}`);
    }
    
    return response.json();
  }
  
  async deployBot(config: BotConfig): Promise<BotResponse> {
    return this.request<BotResponse>('POST', '/bots', config);
  }
  
  async getBot(botId: string): Promise<BotResponse> {
    return this.request<BotResponse>('GET', `/bots/${botId}`);
  }
  
  async listBots(params?: { status?: string; limit?: number }): Promise<BotResponse[]> {
    const query = new URLSearchParams(params as any).toString();
    return this.request<BotResponse[]>('GET', `/bots?${query}`);
  }
  
  async deleteBot(botId: string): Promise<void> {
    await this.request<void>('DELETE', `/bots/${botId}`);
  }
  
  async getRecording(botId: string): Promise<{ url: string; expires_at: string }> {
    return this.request('GET', `/bots/${botId}/recording`);
  }
  
  async getTranscript(botId: string): Promise<any> {
    return this.request('GET', `/bots/${botId}/transcript`);
  }
}

export const meetingBaaSClient = new MeetingBaaSClient(process.env.MEETINGBAAS_API_KEY!);
```

### 3.2 Bot Deployment Service

```typescript
// lib/meetingbaas/deploy-bot.ts

import { meetingBaaSClient } from './client';
import { createClient } from '@supabase/supabase-js';

interface DeployBotParams {
  organisationId: string;
  userId: string;
  meetingUrl: string;
  meetingTitle?: string;
  calendarEventId?: string;
  attendees?: { email: string; name?: string }[];
}

export async function deployBot(params: DeployBotParams) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  
  // Get organisation settings
  const { data: org } = await supabase
    .from('organisations')
    .select('recording_settings')
    .eq('id', params.organisationId)
    .single();
  
  const settings = org?.recording_settings || {};
  
  // Check usage limits
  const { data: usage } = await supabase
    .from('recording_usage')
    .select('recordings_count, recordings_limit')
    .eq('organisation_id', params.organisationId)
    .gte('period_start', getMonthStart())
    .single();
  
  if (usage && usage.recordings_count >= usage.recordings_limit) {
    throw new Error('Monthly recording limit reached');
  }
  
  // Detect platform from URL
  const platform = detectPlatform(params.meetingUrl);
  
  // Create recording record first
  const { data: recording, error: recordingError } = await supabase
    .from('recordings')
    .insert({
      organisation_id: params.organisationId,
      user_id: params.userId,
      meeting_platform: platform,
      meeting_url: params.meetingUrl,
      meeting_title: params.meetingTitle,
      calendar_event_id: params.calendarEventId,
      status: 'pending'
    })
    .select()
    .single();
  
  if (recordingError) throw recordingError;
  
  // Prepare entry message with variable substitution
  let entryMessage = settings.entry_message_enabled ? settings.entry_message : undefined;
  if (entryMessage) {
    // Get user name for substitution
    const { data: user } = await supabase
      .from('users')
      .select('name')
      .eq('id', params.userId)
      .single();
    
    entryMessage = entryMessage.replace('{rep_name}', user?.name || 'your host');
  }
  
  // Deploy bot via MeetingBaaS
  const bot = await meetingBaaSClient.deployBot({
    meeting_url: params.meetingUrl,
    bot_name: settings.bot_name || '60 Notetaker',
    bot_image: settings.bot_image_url,
    entry_message: entryMessage,
    webhook_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/meetingbaas`,
    deduplication_key: recording.id, // Prevent duplicate bots
  });
  
  // Update recording with bot ID
  await supabase
    .from('recordings')
    .update({ bot_id: bot.id })
    .eq('id', recording.id);
  
  // Create bot deployment record
  await supabase
    .from('bot_deployments')
    .insert({
      organisation_id: params.organisationId,
      recording_id: recording.id,
      bot_id: bot.id,
      meeting_url: params.meetingUrl,
      bot_name: settings.bot_name,
      bot_image_url: settings.bot_image_url,
      entry_message: entryMessage,
      status: 'scheduled'
    });
  
  // Increment usage count
  await supabase.rpc('increment_recording_usage', {
    org_id: params.organisationId,
    period: getMonthStart()
  });
  
  return { recording, bot };
}

function detectPlatform(url: string): 'zoom' | 'google_meet' | 'microsoft_teams' {
  if (url.includes('zoom.us')) return 'zoom';
  if (url.includes('meet.google.com')) return 'google_meet';
  if (url.includes('teams.microsoft.com')) return 'microsoft_teams';
  throw new Error('Unsupported meeting platform');
}

function getMonthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
}
```

---

## Phase 4: Recording Rules Engine

**Status:** 🔴 Not Started  
**Estimated Effort:** 1-2 days  
**Dependencies:** Phase 1, Phase 3

### Tasks

- [ ] **4.1** Create rules evaluation engine
- [ ] **4.2** Implement domain matching (external/internal detection)
- [ ] **4.3** Implement attendee count rules
- [ ] **4.4** Implement title keyword matching
- [ ] **4.5** Create calendar event processor
- [ ] **4.6** Add rule management API endpoints
- [ ] **4.7** Create default rules for new organisations

### 4.1 Rules Engine

```typescript
// lib/recording-rules/engine.ts

import { createClient } from '@supabase/supabase-js';

interface CalendarEvent {
  id: string;
  title: string;
  meeting_url: string;
  attendees: { email: string; name?: string; organizer?: boolean }[];
  start_time: string;
  end_time: string;
}

interface RecordingRule {
  id: string;
  name: string;
  is_active: boolean;
  priority: number;
  domain_mode: 'external_only' | 'internal_only' | 'specific_domains' | 'all';
  specific_domains: string[] | null;
  internal_domain: string | null;
  min_attendee_count: number;
  max_attendee_count: number | null;
  title_keywords: string[] | null;
  title_keywords_exclude: string[] | null;
}

interface RuleEvaluationResult {
  shouldRecord: boolean;
  matchedRule: RecordingRule | null;
  reasons: string[];
}

export async function evaluateRecordingRules(
  organisationId: string,
  userId: string,
  event: CalendarEvent
): Promise<RuleEvaluationResult> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  
  // Get active rules for this org/user, ordered by priority
  const { data: rules } = await supabase
    .from('recording_rules')
    .select('*')
    .eq('organisation_id', organisationId)
    .eq('is_active', true)
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .order('priority', { ascending: false });
  
  if (!rules || rules.length === 0) {
    return {
      shouldRecord: false,
      matchedRule: null,
      reasons: ['No active recording rules configured']
    };
  }
  
  // Evaluate each rule in priority order
  for (const rule of rules) {
    const result = evaluateSingleRule(rule, event);
    if (result.matches) {
      return {
        shouldRecord: true,
        matchedRule: rule,
        reasons: result.reasons
      };
    }
  }
  
  return {
    shouldRecord: false,
    matchedRule: null,
    reasons: ['No rules matched this meeting']
  };
}

function evaluateSingleRule(
  rule: RecordingRule,
  event: CalendarEvent
): { matches: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  // Check title exclusions first (these override everything)
  if (rule.title_keywords_exclude && rule.title_keywords_exclude.length > 0) {
    const titleLower = event.title.toLowerCase();
    for (const keyword of rule.title_keywords_exclude) {
      if (titleLower.includes(keyword.toLowerCase())) {
        return { matches: false, reasons: [`Title contains excluded keyword: ${keyword}`] };
      }
    }
  }
  
  // Check attendee count
  const attendeeCount = event.attendees.length;
  if (attendeeCount < rule.min_attendee_count) {
    return { 
      matches: false, 
      reasons: [`Attendee count (${attendeeCount}) below minimum (${rule.min_attendee_count})`] 
    };
  }
  if (rule.max_attendee_count && attendeeCount > rule.max_attendee_count) {
    return { 
      matches: false, 
      reasons: [`Attendee count (${attendeeCount}) above maximum (${rule.max_attendee_count})`] 
    };
  }
  reasons.push(`Attendee count (${attendeeCount}) within range`);
  
  // Check domain rules
  if (rule.domain_mode !== 'all' && rule.internal_domain) {
    const externalAttendees = event.attendees.filter(
      a => !a.email.endsWith(`@${rule.internal_domain}`)
    );
    const hasExternal = externalAttendees.length > 0;
    
    switch (rule.domain_mode) {
      case 'external_only':
        if (!hasExternal) {
          return { matches: false, reasons: ['No external attendees (internal meeting)'] };
        }
        reasons.push('Has external attendees');
        break;
        
      case 'internal_only':
        if (hasExternal) {
          return { matches: false, reasons: ['Has external attendees'] };
        }
        reasons.push('Internal meeting only');
        break;
        
      case 'specific_domains':
        if (rule.specific_domains && rule.specific_domains.length > 0) {
          const matchesDomain = externalAttendees.some(a => 
            rule.specific_domains!.some(d => a.email.endsWith(`@${d}`))
          );
          if (!matchesDomain) {
            return { matches: false, reasons: ['No attendees from specified domains'] };
          }
          reasons.push('Has attendees from target domains');
        }
        break;
    }
  }
  
  // Check title keywords (if specified, at least one must match)
  if (rule.title_keywords && rule.title_keywords.length > 0) {
    const titleLower = event.title.toLowerCase();
    const matchedKeyword = rule.title_keywords.find(
      keyword => titleLower.includes(keyword.toLowerCase())
    );
    if (!matchedKeyword) {
      return { matches: false, reasons: ['Title does not contain required keywords'] };
    }
    reasons.push(`Title matches keyword: ${matchedKeyword}`);
  }
  
  return { matches: true, reasons };
}
```

### 4.5 Calendar Event Processor

```typescript
// lib/recording-rules/calendar-processor.ts

import { evaluateRecordingRules } from './engine';
import { deployBot } from '../meetingbaas/deploy-bot';
import { createClient } from '@supabase/supabase-js';

interface CalendarEvent {
  id: string;
  title: string;
  meeting_url: string | null;
  attendees: { email: string; name?: string }[];
  start_time: string;
  end_time: string;
}

export async function processCalendarEvents(
  organisationId: string,
  userId: string,
  events: CalendarEvent[]
) {
  const results = [];
  
  for (const event of events) {
    // Skip events without meeting URLs
    if (!event.meeting_url) {
      results.push({
        eventId: event.id,
        action: 'skipped',
        reason: 'No meeting URL'
      });
      continue;
    }
    
    // Skip non-video meeting URLs
    if (!isVideoMeetingUrl(event.meeting_url)) {
      results.push({
        eventId: event.id,
        action: 'skipped',
        reason: 'Not a supported video meeting platform'
      });
      continue;
    }
    
    // Evaluate rules
    const evaluation = await evaluateRecordingRules(organisationId, userId, event);
    
    if (!evaluation.shouldRecord) {
      results.push({
        eventId: event.id,
        action: 'skipped',
        reason: evaluation.reasons.join(', ')
      });
      continue;
    }
    
    // Check if bot already scheduled for this event
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    
    const { data: existing } = await supabase
      .from('recordings')
      .select('id')
      .eq('calendar_event_id', event.id)
      .eq('organisation_id', organisationId)
      .single();
    
    if (existing) {
      results.push({
        eventId: event.id,
        action: 'skipped',
        reason: 'Bot already scheduled for this event'
      });
      continue;
    }
    
    // Deploy bot
    try {
      const { recording, bot } = await deployBot({
        organisationId,
        userId,
        meetingUrl: event.meeting_url,
        meetingTitle: event.title,
        calendarEventId: event.id,
        attendees: event.attendees
      });
      
      results.push({
        eventId: event.id,
        action: 'scheduled',
        recordingId: recording.id,
        botId: bot.id,
        matchedRule: evaluation.matchedRule?.name,
        reasons: evaluation.reasons
      });
      
    } catch (error) {
      results.push({
        eventId: event.id,
        action: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  return results;
}

function isVideoMeetingUrl(url: string): boolean {
  return (
    url.includes('zoom.us') ||
    url.includes('meet.google.com') ||
    url.includes('teams.microsoft.com')
  );
}
```

---

## Phase 5: Transcript & AI Processing

**Status:** 🔴 Not Started  
**Estimated Effort:** 2-3 days  
**Dependencies:** Phase 2, Phase 3

### Tasks

- [ ] **5.1** Implement S3 upload for recordings
- [ ] **5.2** Create Gladia transcription service
- [ ] **5.3** Create MeetingBaaS transcription fallback
- [ ] **5.4** Implement speaker identification (email matching)
- [ ] **5.5** Implement AI speaker inference for unknown speakers
- [ ] **5.6** Create HITL flow for speaker confirmation
- [ ] **5.7** Implement AI summary generation
- [ ] **5.8** Implement highlights extraction
- [ ] **5.9** Create processing pipeline orchestrator

### 5.2 Gladia Transcription Service

```typescript
// lib/transcription/gladia.ts

interface GladiaTranscriptResult {
  text: string;
  utterances: {
    speaker: number;
    start: number;
    end: number;
    text: string;
    confidence: number;
  }[];
  speakers: {
    id: number;
    count: number;
  }[];
}

export async function transcribeWithGladia(audioUrl: string): Promise<GladiaTranscriptResult> {
  // Step 1: Upload or provide URL
  const uploadResponse = await fetch('https://api.gladia.io/v2/upload', {
    method: 'POST',
    headers: {
      'x-gladia-key': process.env.GLADIA_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ audio_url: audioUrl }),
  });
  
  const { audio_url } = await uploadResponse.json();
  
  // Step 2: Request transcription
  const transcriptResponse = await fetch('https://api.gladia.io/v2/transcription', {
    method: 'POST',
    headers: {
      'x-gladia-key': process.env.GLADIA_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio_url,
      diarization: true,
      diarization_config: {
        min_speakers: 2,
        max_speakers: 10,
      },
    }),
  });
  
  const { result_url } = await transcriptResponse.json();
  
  // Step 3: Poll for results
  let result = null;
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes with 5s intervals
  
  while (!result && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const statusResponse = await fetch(result_url, {
      headers: { 'x-gladia-key': process.env.GLADIA_API_KEY! },
    });
    
    const status = await statusResponse.json();
    
    if (status.status === 'done') {
      result = status.result;
    } else if (status.status === 'error') {
      throw new Error(`Gladia transcription failed: ${status.error}`);
    }
    
    attempts++;
  }
  
  if (!result) {
    throw new Error('Gladia transcription timed out');
  }
  
  return result;
}
```

### 5.7 AI Summary Generation

```typescript
// lib/ai/meeting-summary.ts

interface TranscriptUtterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

interface MeetingSummary {
  overview: string;
  highlights: {
    timestamp: number;
    text: string;
    type: 'key_point' | 'decision' | 'action_item' | 'question' | 'objection';
  }[];
  speakers: {
    name: string;
    role: 'internal' | 'external' | 'unknown';
    talkTimePercent: number;
  }[];
}

export async function generateMeetingSummary(
  transcript: TranscriptUtterance[],
  meetingTitle: string,
  attendees: { name: string; email: string; isInternal: boolean }[]
): Promise<MeetingSummary> {
  
  const prompt = `Analyze this sales meeting transcript and provide a structured summary.

Meeting: ${meetingTitle}
Attendees: ${attendees.map(a => `${a.name} (${a.isInternal ? 'Internal' : 'External'})`).join(', ')}

Transcript:
${transcript.map(u => `[${formatTimestamp(u.start)}] ${u.speaker}: ${u.text}`).join('\n')}

Provide:
1. A 2-3 paragraph overview of the meeting (what was discussed, outcomes, next steps)
2. Key highlights with timestamps, categorized as: key_point, decision, action_item, question, objection
3. Talk time breakdown by speaker

Return as JSON matching this structure:
{
  "overview": "...",
  "highlights": [{"timestamp": 125, "text": "...", "type": "key_point"}],
  "speakers": [{"name": "...", "role": "internal", "talkTimePercent": 45}]
}`;

  // TODO: Call AI API (integrates with existing use60 AI infrastructure)
  
  return {
    overview: '',
    highlights: [],
    speakers: []
  };
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

### 5.9 Processing Pipeline Orchestrator

```typescript
// lib/recording-processor/pipeline.ts

import { createClient } from '@supabase/supabase-js';
import { transcribeWithGladia } from '../transcription/gladia';
import { identifySpeakers, inferSpeakersWithAI } from '../transcription/speaker-identification';
import { generateMeetingSummary } from '../ai/meeting-summary';
import { uploadToS3 } from '../storage/s3';

export async function processRecording(recordingId: string) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  
  // Get recording details
  const { data: recording } = await supabase
    .from('recordings')
    .select('*, organisations(recording_settings, internal_domain)')
    .eq('id', recordingId)
    .single();
  
  if (!recording) throw new Error('Recording not found');
  
  try {
    // Update status
    await supabase.from('recordings')
      .update({ status: 'processing' })
      .eq('id', recordingId);
    
    // Step 1: Download recording from MeetingBaaS
    const meetingBaaSRecordingUrl = await getRecordingUrl(recording.bot_id);
    
    // Step 2: Upload to our S3
    const s3Key = `recordings/${recording.organisation_id}/${recordingId}/recording.mp4`;
    await uploadToS3(meetingBaaSRecordingUrl, s3Key);
    
    // Step 3: Transcribe
    const transcriptionProvider = recording.organisations?.recording_settings?.default_transcription_provider || 'gladia';
    let transcript;
    
    if (transcriptionProvider === 'gladia') {
      const s3Url = getS3Url(s3Key);
      transcript = await transcribeWithGladia(s3Url);
    } else {
      // Use MeetingBaaS transcription
      transcript = await getMeetingBaaSTranscript(recording.bot_id);
    }
    
    // Step 4: Identify speakers
    const attendees = recording.attendees || [];
    const internalDomain = recording.organisations?.internal_domain;
    
    let speakers = await identifySpeakers(
      transcript.utterances,
      attendees,
      internalDomain
    );
    
    // If speakers couldn't be matched, use AI inference
    const unidentifiedCount = speakers.filter(s => s.identificationMethod === 'unknown').length;
    if (unidentifiedCount > 0 && attendees.length > 0) {
      speakers = await inferSpeakersWithAI(
        transcript.utterances,
        attendees,
        recording.meeting_title
      );
      
      // If AI confidence is low, flag for HITL
      const lowConfidence = speakers.some(s => s.confidence < 0.7);
      if (lowConfidence) {
        await flagForHITL(recordingId, 'speaker_confirmation', speakers);
      }
    }
    
    // Step 5: Generate AI summary
    const summary = await generateMeetingSummary(
      transcript.utterances.map(u => ({
        speaker: speakers.find(s => s.speakerId === u.speaker)?.name || `Speaker ${u.speaker}`,
        text: u.text,
        start: u.start,
        end: u.end
      })),
      recording.meeting_title,
      speakers.map(s => ({
        name: s.name || `Speaker ${s.speakerId}`,
        email: s.email || '',
        isInternal: s.isInternal
      }))
    );
    
    // Step 6: Store everything
    const transcriptS3Key = `recordings/${recording.organisation_id}/${recordingId}/transcript.json`;
    await uploadToS3(JSON.stringify(transcript), transcriptS3Key);
    
    await supabase.from('recordings').update({
      status: 'ready',
      recording_s3_key: s3Key,
      transcript_s3_key: transcriptS3Key,
      transcript_json: transcript,
      transcript_text: transcript.text,
      summary: summary.overview,
      highlights: summary.highlights,
      speakers: speakers,
      speaker_identification_method: speakers[0]?.identificationMethod || 'unknown'
    }).eq('id', recordingId);
    
    // Step 7: Trigger CRM sync (Phase 6)
    await triggerCRMSync(recordingId);
    
    // Step 8: Send notification
    await sendRecordingReadyNotification(recordingId);
    
  } catch (error) {
    await supabase.from('recordings').update({
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error'
    }).eq('id', recordingId);
    
    await sendRecordingFailedNotification(recordingId, error);
    
    throw error;
  }
}
```

---

## Phase 6: CRM Integration

**Status:** 🔴 Not Started  
**Estimated Effort:** 2 days  
**Dependencies:** Phase 5

### Tasks

- [ ] **6.1** Implement contact matching from attendee emails
- [ ] **6.2** Handle multiple contact matches
- [ ] **6.3** Implement deal association logic
- [ ] **6.4** Create HITL flow for multiple deals
- [ ] **6.5** Create HubSpot activity logging
- [ ] **6.6** Attach notes/summary to CRM contact
- [ ] **6.7** Add Bullhorn support (parallel to HubSpot)

### 6.5 HubSpot Activity Logging

```typescript
// lib/crm/hubspot-activity.ts

interface RecordingActivity {
  recordingId: string;
  meetingTitle: string;
  meetingDate: string;
  duration: number;
  summary: string;
  recordingUrl: string;
  contactIds: string[];
  dealId?: string;
}

export async function logHubSpotActivity(
  connection: any,
  activity: RecordingActivity
): Promise<string> {
  const hubspotClient = createHubSpotClient(connection.access_token);
  
  // Create engagement (meeting activity)
  const engagement = await hubspotClient.crm.objects.meetings.basicApi.create({
    properties: {
      hs_meeting_title: activity.meetingTitle,
      hs_meeting_body: formatActivityBody(activity),
      hs_meeting_start_time: activity.meetingDate,
      hs_meeting_end_time: new Date(
        new Date(activity.meetingDate).getTime() + activity.duration * 1000
      ).toISOString(),
      hs_meeting_outcome: 'COMPLETED'
    }
  });
  
  // Associate with contacts
  for (const contactId of activity.contactIds) {
    await hubspotClient.crm.objects.meetings.associationsApi.create(
      engagement.id,
      'contacts',
      contactId,
      [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 200 }]
    );
  }
  
  // Associate with deal if provided
  if (activity.dealId) {
    await hubspotClient.crm.objects.meetings.associationsApi.create(
      engagement.id,
      'deals',
      activity.dealId,
      [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 206 }]
    );
  }
  
  return engagement.id;
}

function formatActivityBody(activity: RecordingActivity): string {
  return `## Meeting Summary

${activity.summary}

---
📹 [View Full Recording](${activity.recordingUrl})

*Recorded and summarized by use60*`;
}
```

---

## Phase 7: Notifications (Slack)

**Status:** 🔴 Not Started  
**Estimated Effort:** 1-2 days  
**Dependencies:** Phase 5, Phase 6

### Tasks

- [ ] **7.1** Create notification service
- [ ] **7.2** Implement Slack Block Kit messages for each event type
- [ ] **7.3** Bot joining notification
- [ ] **7.4** Bot failed notification
- [ ] **7.5** Recording ready notification
- [ ] **7.6** HITL deal selection notification
- [ ] **7.7** HITL speaker confirmation notification
- [ ] **7.8** Implement notification preferences checking
- [ ] **7.9** Add email fallback notifications
- [ ] **7.10** Add in-app notification support

### 7.2 Slack Block Kit Messages

```typescript
// lib/notifications/slack-blocks.ts

export function recordingStartedBlocks(data: {
  meetingTitle: string;
  attendees: string[];
  platform: string;
}) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🎬 *Recording started*\n\n*${data.meetingTitle}*`
      }
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `📍 ${data.platform} • 👥 ${data.attendees.slice(0, 3).join(', ')}${data.attendees.length > 3 ? ` +${data.attendees.length - 3} more` : ''}`
        }
      ]
    }
  ];
}

export function recordingReadyBlocks(data: {
  meetingTitle: string;
  duration: string;
  summary: string;
  highlights: { type: string; text: string }[];
  actionItemCount: number;
  recordingUrl: string;
}) {
  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `✅ *Recording ready*\n\n*${data.meetingTitle}*\n⏱️ ${data.duration}`
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Summary*\n${data.summary.slice(0, 500)}${data.summary.length > 500 ? '...' : ''}`
      }
    }
  ];
  
  if (data.highlights.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Key Highlights*\n${data.highlights.slice(0, 3).map(h => `• ${h.text}`).join('\n')}`
      }
    });
  }
  
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '▶️ View Recording' },
        url: data.recordingUrl,
        action_id: 'view_recording'
      }
    ]
  });
  
  return blocks;
}

export function dealSelectionBlocks(data: {
  meetingTitle: string;
  recordingId: string;
  deals: { id: string; name: string; stage: string }[];
}) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🔗 *Link recording to deal*\n\n*${data.meetingTitle}*\n\nMultiple deals found. Which should this recording be linked to?`
      }
    },
    {
      type: 'actions',
      elements: data.deals.map(deal => ({
        type: 'button',
        text: { type: 'plain_text', text: `${deal.name} (${deal.stage})` },
        action_id: `select_deal_${deal.id}`,
        value: JSON.stringify({ recordingId: data.recordingId, dealId: deal.id })
      }))
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Skip - Don\'t link to a deal' },
          action_id: 'skip_deal_link',
          value: data.recordingId
        }
      ]
    }
  ];
}
```

---

## Phase 8: User Interface

**Status:** 🔴 Not Started  
**Estimated Effort:** 3-4 days  
**Dependencies:** Phase 1-7

### Tasks

- [ ] **8.1** Create Recordings list page
- [ ] **8.2** Create Recording detail page (video player, transcript, summary)
- [ ] **8.3** Create Recording rules management UI
- [ ] **8.4** Create manual meeting link submission form
- [ ] **8.5** Create bot settings page (name, avatar, entry message)
- [ ] **8.6** Create usage dashboard (recordings count, limit)
- [ ] **8.7** Add recording search functionality
- [ ] **8.8** Add transcript search within recordings
- [ ] **8.9** Create sharing/permissions UI
- [ ] **8.10** Integrate recordings into CRM contact/deal views

### UI Component Structure

```
/recordings
├── page.tsx                    # List all recordings
├── [id]/page.tsx              # Recording detail view
├── rules/page.tsx             # Manage recording rules
└── settings/page.tsx          # Bot settings

/components/recordings
├── RecordingsList.tsx         # Table/card list of recordings
├── RecordingCard.tsx          # Individual recording card
├── RecordingPlayer.tsx        # Video player with transcript sync
├── TranscriptViewer.tsx       # Searchable, timestamped transcript
├── SummaryPanel.tsx           # AI summary and highlights
├── RecordingRuleForm.tsx      # Create/edit rule form
├── RulesList.tsx              # List of active rules
├── ManualRecordingForm.tsx    # Paste meeting link form
├── BotSettingsForm.tsx        # Customize bot appearance
├── UsageIndicator.tsx         # Show recordings used/limit
└── RecordingSearch.tsx        # Search across recordings
```

---

## Phase 9: Testing & QA

**Status:** 🔴 Not Started  
**Estimated Effort:** 2-3 days  
**Dependencies:** Phase 1-8

### Tasks

- [ ] **9.1** Unit tests for rules engine
- [ ] **9.2** Unit tests for speaker identification
- [ ] **9.3** Integration tests for webhook handling
- [ ] **9.4** Integration tests for MeetingBaaS API
- [ ] **9.5** E2E test: Calendar event → Recording ready
- [ ] **9.6** E2E test: Manual submission → Recording ready
- [ ] **9.7** Test Zoom bot joining
- [ ] **9.8** Test Google Meet bot joining
- [ ] **9.9** Test Microsoft Teams bot joining
- [ ] **9.10** Test CRM sync (HubSpot)
- [ ] **9.11** Test Slack notifications
- [ ] **9.12** Test HITL flows
- [ ] **9.13** Load testing for concurrent recordings
- [ ] **9.14** Security review (webhook signatures, S3 access)

---

## Appendix A: API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/recordings/manual` | Submit manual meeting link |
| GET | `/api/recordings` | List recordings |
| GET | `/api/recordings/:id` | Get recording details |
| DELETE | `/api/recordings/:id` | Delete recording |
| GET | `/api/recordings/:id/transcript` | Get full transcript |
| POST | `/api/recording-rules` | Create rule |
| GET | `/api/recording-rules` | List rules |
| PUT | `/api/recording-rules/:id` | Update rule |
| DELETE | `/api/recording-rules/:id` | Delete rule |
| GET | `/api/recording-usage` | Get usage stats |
| PUT | `/api/settings/recordings` | Update bot settings |
| POST | `/api/webhooks/meetingbaas` | MeetingBaaS webhooks |
| POST | `/api/webhooks/slack/interactions` | Slack HITL interactions |

---

## Appendix B: Error Codes

| Code | Description | User Message |
|------|-------------|--------------|
| `LIMIT_REACHED` | Monthly recording limit hit | "You've reached your recording limit for this month" |
| `INVALID_MEETING_URL` | Unsupported meeting platform | "This meeting URL isn't supported" |
| `BOT_JOIN_FAILED` | Bot couldn't join meeting | "Recording bot couldn't join - the host may need to admit it" |
| `BOT_KICKED` | Bot was removed from meeting | "Recording stopped - the bot was removed from the meeting" |
| `TRANSCRIPTION_FAILED` | Transcription service error | "We couldn't process the audio - please try again" |
| `CRM_SYNC_FAILED` | CRM API error | "Recording saved but CRM sync failed - we'll retry" |

---

## Appendix C: Data Flow Diagram

```
Calendar Event Detected
         │
         ▼
┌─────────────────┐
│  Rules Engine   │──── No match ────▶ Skip
└─────────────────┘
         │ Match
         ▼
┌─────────────────┐
│  Usage Check    │──── Limit hit ───▶ Notify user
└─────────────────┘
         │ OK
         ▼
┌─────────────────┐
│ Deploy Bot via  │
│  MeetingBaaS    │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ Webhook: Joined │──── Notify user
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Meeting runs   │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ Webhook: Left   │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ Webhook:        │
│ Recording Ready │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ Download to S3  │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ Transcribe      │
│ (Gladia)        │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ Identify        │
│ Speakers        │──── Low confidence ──▶ HITL: Confirm speakers
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ AI Summary &    │
│ Highlights      │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ CRM Sync        │──── Multiple deals ──▶ HITL: Select deal
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ Notify: Ready   │
└─────────────────┘
```

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-04 | 1.0 | Initial plan created |