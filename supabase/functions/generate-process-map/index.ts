/// <reference path="../deno.d.ts" />

/**
 * Generate Process Map Edge Function
 *
 * Two-Phase AI Generation:
 * - Phase 1: Claude Opus generates structured ProcessStructure JSON (source of truth)
 * - Phase 2: Claude Haiku transforms JSON → Mermaid code (horizontal + vertical)
 *
 * This ensures both views display identical steps, which is critical for the testing system.
 *
 * Supported process types:
 * - integration: HubSpot, Google, Fathom, Slack, JustCall, SavvyCal, MeetingBaaS
 * - workflow: Meeting Intelligence, Task Extraction, VSL Analytics, Sentry Bridge, API Optimization, Onboarding V2
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { logAICostEvent } from '../_shared/costTracking.ts'

// Model constants for two-phase generation
const OPUS_MODEL = 'claude-opus-4-5-20251101'
const HAIKU_MODEL = 'claude-haiku-4-5-20251001'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  action?: 'generate' | 'list'  // default: 'generate'
  processType?: 'integration' | 'workflow'
  processName?: string
  regenerate?: boolean
  // direction is deprecated - we now generate both views
}

// ProcessStructure types (source of truth for both Mermaid and testing)
interface ProcessStructure {
  schemaVersion: '1.0'
  metadata: {
    processType: 'integration' | 'workflow'
    processName: string
    title: string
    description: string
    generatedAt: string
    modelUsed: string
  }
  subgraphs: Array<{
    id: string
    label: string
    nodeIds: string[]
    order: number
  }>
  nodes: Array<{
    id: string
    label: string
    shape: 'terminal' | 'process' | 'storage' | 'decision' | 'subroutine' | 'async'
    subgraphId: string
    executionOrder: number
    stepType: 'trigger' | 'action' | 'condition' | 'transform' | 'external_call' | 'storage' | 'notification'
    integration?: string
    description?: string
    testConfig?: {
      mockable: boolean
      requiresRealApi?: boolean
      operations?: ('read' | 'write' | 'delete')[]
    }
  }>
  connections: Array<{
    from: string
    to: string
    style: 'normal' | 'critical' | 'optional'
    label?: string
  }>
  styling: {
    nodeClasses: {
      terminal: string[]
      storage: string[]
      logic: string[]
      async: string[]
      primary: string[]
    }
  }
}

interface ProcessMapRecord {
  id: string
  org_id: string
  process_type: string
  process_name: string
  title: string
  description: string | null
  process_structure: ProcessStructure | null
  mermaid_code: string | null
  mermaid_code_horizontal: string | null
  mermaid_code_vertical: string | null
  generation_status: 'pending' | 'structure_ready' | 'partial' | 'complete'
  generated_by: string
  version: number
  created_at: string
  updated_at: string
}

// Process descriptions - short for cards, long for View More expansion (supports markdown)
interface ProcessDescriptionData {
  short: string;  // One-line summary for cards
  long: string;   // Detailed description for "View More" expansion
}

const PROCESS_DESCRIPTIONS: Record<string, Record<string, ProcessDescriptionData>> = {
  integration: {
    hubspot: {
      short: `Two-way sync of contacts, deals, and tasks with HubSpot CRM via OAuth and webhooks.`,
      long: `**HubSpot CRM Integration** provides bidirectional synchronization between use60 and HubSpot.

**Authentication**: OAuth 2.0 flow with secure token refresh

**Sync Capabilities**:
- Contacts: Two-way sync with field mapping and duplicate detection
- Deals: Pipeline and stage synchronization with activity logging
- Tasks: Bi-directional task sync with due date and priority mapping

**Data Flow**:
1. OAuth grant establishes secure connection
2. Initial full sync pulls existing HubSpot data
3. Webhooks trigger real-time updates for changes
4. Background sync ensures consistency every 15 minutes

**Features**: Field mapping customization, conflict resolution, activity history preservation`
    },
    google: {
      short: `Sync Gmail, Calendar, and Tasks via OAuth. Match attendees to CRM contacts.`,
      long: `**Google Workspace Integration** connects Gmail, Calendar, and Tasks to your CRM workflow.

**Authentication**: OAuth 2.0 with granular scope permissions

**Calendar Sync**:
- Bi-directional event synchronization
- Attendee matching to CRM contacts by email
- Meeting prep data attached to calendar events
- Automatic activity logging for meetings

**Gmail Integration**:
- Email tracking and logging to contact timeline
- Thread detection and conversation grouping
- Attachment handling and storage

**Tasks Sync**:
- Two-way task synchronization
- Priority and due date mapping
- List-based organization

**Features**: Working hours awareness, timezone handling, conflict detection`
    },
    fathom: {
      short: `Import meeting recordings via OAuth. Generate thumbnails, transcripts, and AI summaries.`,
      long: `**Fathom Integration** imports meeting recordings for AI-powered analysis.

**Authentication**: OAuth 2.0 with Fathom API

**Import Flow**:
1. OAuth connection established per user
2. Automatic discovery of new recordings
3. Parallel import of video, transcript, and summary
4. Thumbnail generation from video keyframes

**Data Captured**:
- Full video recording with playback support
- AI-generated transcript with speaker diarization
- Meeting summary with key topics
- Action items extracted by Fathom AI
- Attendee list matched to CRM contacts

**Processing**:
- Background thumbnail generation
- Transcript indexing for search
- Automatic activity creation
- Meeting Intelligence indexing queue

**Features**: Incremental sync, duplicate detection, per-user isolation`
    },
    slack: {
      short: `Send deal alerts and meeting summaries to Slack channels via bot integration.`,
      long: `**Slack Integration** sends real-time notifications and enables deal room collaboration.

**Authentication**: OAuth 2.0 with Slack Bot scopes

**Notification Types**:
- Deal stage changes and pipeline alerts
- Meeting summary shares
- Task reminders and assignments
- Relationship health warnings
- Win/loss announcements

**Deal Rooms**:
- Automatic channel creation per deal
- Stakeholder invitations
- Activity feed integration
- Document sharing

**Message Formatting**:
- Rich Block Kit layouts
- Interactive buttons for quick actions
- Threaded conversations
- Emoji and mention support

**Features**: Channel mapping, notification preferences, message templates`
    },
    justcall: {
      short: `Sync call recordings via API. Fetch transcripts and run AI analysis.`,
      long: `**JustCall Integration** syncs call recordings for AI-powered analysis.

**Authentication**: API key-based authentication

**Sync Flow**:
1. Periodic polling for new call recordings
2. Fetch recording audio and metadata
3. Retrieve or generate transcript
4. Run AI analysis for insights

**Data Captured**:
- Call recording audio files
- Transcript with timestamps
- Call duration and direction
- Caller/recipient identification
- AI-generated call summary

**AI Analysis**:
- Sentiment detection
- Key topic extraction
- Action item identification
- Follow-up suggestions

**Features**: Incremental sync, contact matching, activity logging`
    },
    savvycal: {
      short: `Sync bookings via webhook. Auto-create contacts and log activities.`,
      long: `**SavvyCal Integration** captures bookings and creates CRM records automatically.

**Authentication**: Webhook-based with API key validation

**Booking Flow**:
1. Webhook received on new booking
2. Contact lookup or creation
3. Activity record creation
4. Calendar event sync

**Data Captured**:
- Booking date, time, and duration
- Attendee name and email
- Meeting type and link
- Booking form responses
- Lead source tracking

**Automation**:
- Auto-create contacts from new bookings
- Lead source attribution by scheduling link
- Pipeline stage assignment
- Notification triggers

**Features**: Link-based lead source mapping, custom field mapping, duplicate prevention`
    },
    meetingbaas: {
      short: `Auto-record meetings via calendar sync. Extract meeting URLs, deploy bots, run AI analysis.`,
      long: `**MeetingBaaS Integration** provides automated meeting recording with AI-powered analysis.

**Calendar Connection**:
- OAuth connection to Google or Microsoft calendars
- Real-time event monitoring via MeetingBaaS API
- Automatic meeting URL extraction from event descriptions
- Support for Zoom, Google Meet, Teams, and Webex

**Meeting URL Extraction**:
- Parse calendar event descriptions for meeting links
- Check conferenceData and hangoutLink fields
- Multi-platform URL pattern matching
- Priority-based URL selection

**Bot Deployment**:
- Automatic bot scheduling based on calendar events
- Just-in-time bot deployment before meeting start
- Real-time status tracking via webhooks
- Graceful handling of cancellations

**Webhook Processing**:
- Status update webhooks (joining, recording, completed)
- Recording availability notifications
- Error and failure event handling
- Retry logic for transient failures

**AI Analysis Pipeline**:
- Sentiment scoring (-1.0 to 1.0)
- Coaching ratings (0-100 scale)
- Talk time analysis (rep vs customer)
- Action item extraction
- Meeting summary generation
- Key moment highlighting

**Thumbnail Generation**:
- Automatic thumbnail extraction from video
- Multiple frame sampling
- S3 storage with CDN delivery
- Lazy loading optimization

**Features**: Multi-platform support, AI insights, automatic transcription, real-time status tracking`
    },
  },
  workflow: {
    meeting_intelligence: {
      short: `AI-powered search across team meetings using semantic understanding and structured filtering.`,
      long: `**Meeting Intelligence** transforms conversation data into searchable knowledge through a multi-phase AI pipeline.

**Setup Phase**:
1. Connect Fathom account via OAuth integration
2. Navigate to /meetings/intelligence to access the search interface
3. Team members with connected accounts contribute to shared index

**Indexing Engine**:
- Meetings with transcripts queued in \`meeting_index_queue\`
- Async processing via \`meeting-intelligence-process-queue\` edge function
- Per-organization File Search Store created in Google Gemini API
- Content hashing prevents duplicate processing
- Index status tracked in \`meeting_file_search_index\` table

**Search Flow**:
1. User enters natural language query
2. Claude parses query to extract semantic intent + structured filters
3. Filters include: sentiment, date range, company, action items, team member
4. Gemini File Search API performs semantic search across indexed transcripts
5. PostgreSQL enriches results with meeting metadata
6. AI generates synthesized answer with source citations

**Key Features**:
- Team-wide search across all members' conversations
- Sentiment filtering (positive/negative/neutral)
- Smart date parsing ("last week" → date range)
- Action item awareness filtering
- Fallback keyword search when semantic index unavailable
- Source citations with click-through to original recordings`
    },
    task_extraction: {
      short: `Auto-create tasks from meetings and calls using AI extraction and smart templates.`,
      long: `**Task Extraction Workflow** automatically creates tasks from meetings and calls using AI.

**Trigger Points**:
- New Fathom meeting imported with action items
- New JustCall recording processed
- Manual trigger from meeting detail page

**Extraction Process**:
1. AI analyzes transcript for action items
2. Each action item evaluated for task-worthiness
3. Template matching based on action type
4. Task created with appropriate due date

**Smart Templates**:
- Follow-up email templates
- Proposal preparation tasks
- Contract/document requests
- Meeting scheduling tasks
- Internal review tasks

**Task Properties**:
- Auto-assigned to meeting owner
- Due date inferred from context
- Priority based on urgency keywords
- Linked to source meeting/call
- Contact/deal association

**Features**: Duplicate prevention, template customization, notification triggers`
    },
    vsl_analytics: {
      short: `Track video engagement anonymously for A/B testing across landing page variants.`,
      long: `**VSL Analytics Workflow** tracks video sales letter engagement for A/B testing.

**Tracking Setup**:
- Embed tracking script on landing pages
- Configure video player events
- Set up variant identification

**Data Collection**:
- Anonymous visitor identification
- Video play/pause/seek events
- Watch time and completion rate
- Variant assignment (A/B)
- Conversion events

**Analysis Pipeline**:
1. Raw events collected via edge function
2. Session aggregation and deduplication
3. Variant performance calculation
4. Statistical significance testing

**Metrics Tracked**:
- Play rate (impressions to plays)
- Average watch time
- Completion rate
- Drop-off points
- Conversion correlation

**Features**: Privacy-first design, real-time dashboards, automated winner detection`
    },
    sentry_bridge: {
      short: `Convert Sentry error alerts into AI Dev Hub tasks automatically via MCP.`,
      long: `**Sentry Bridge Workflow** converts error alerts into development tasks automatically.

**Integration Flow**:
1. Sentry webhook receives error event
2. Error classified by severity and type
3. AI Dev Hub task created via MCP
4. Slack notification sent to dev channel

**Error Classification**:
- Critical: Immediate task creation
- High: Task with high priority
- Medium: Task with normal priority
- Low: Grouped/batched task creation

**Task Content**:
- Error title and message
- Stack trace summary
- Affected users count
- First/last occurrence
- Reproduction context

**AI Enhancement**:
- Root cause suggestions
- Similar issue detection
- Fix recommendation
- Estimated complexity

**Features**: Deduplication, auto-assignment, priority escalation, resolution tracking`
    },
    api_optimization: {
      short: `Reduce API calls 95% with smart polling, batching, and working hours awareness.`,
      long: `**API Call Optimization Workflow** dramatically reduces external API consumption.

**Optimization Strategies**:

1. **Smart Polling**:
   - Adaptive polling intervals based on activity
   - Working hours awareness (no polling at night)
   - Event-driven sync when webhooks available

2. **Request Batching**:
   - Combine multiple operations into single requests
   - Batch size optimization per API
   - Queue-based batch processing

3. **Intelligent Caching**:
   - Response caching with TTL
   - Conditional requests (ETags)
   - Stale-while-revalidate patterns

4. **Rate Limit Management**:
   - Token bucket implementation
   - Automatic backoff and retry
   - Fair queuing across users

**Results**:
- 95% reduction in API calls
- Faster response times from cache
- Zero rate limit errors
- Lower infrastructure costs

**Features**: Per-integration configuration, monitoring dashboard, alert thresholds`
    },
    onboarding_v2: {
      short: `Skills-based AI onboarding with 3 paths: corporate email, personal email + website, and Q&A fallback.`,
      long: `**Onboarding V2 Flow** provides intelligent skills-based AI assistant configuration through three distinct paths based on user email type.

**Flow Paths**:

1. **Corporate Email Path** (e.g., user@acme.com):
   - Email domain detected as corporate
   - Automatic website enrichment from domain
   - AI scrapes website for company context
   - Gemini 2-prompt pipeline generates skills config
   - Direct to skills configuration review

2. **Personal Email + Website Path** (e.g., user@gmail.com with website):
   - Personal email domain detected
   - User prompted for company website
   - Website enrichment via same AI pipeline
   - Proceed to skills configuration

3. **Personal Email + Q&A Path** (no website):
   - User selects "I don't have a website"
   - 6-question progressive Q&A flow
   - Questions collect: company name, description, industry, target customers, products, competitors
   - AI generates skills from Q&A answers
   - Lower confidence score (0.70) vs website enrichment (0.85)

**Enrichment Pipeline**:
1. Deep website scraping via Jina Reader API
2. Google Search for supplementary data (competitors, news, team size)
3. Gemini 3 Flash analysis (company profile, products, target market)
4. Second Gemini pass generates skill configurations
5. Confidence scoring based on data completeness

**Skill Configuration**:
- Each skill has: name, description, example prompts, enabled toggle
- User can customize which skills to enable
- Skills stored in organization_configs table
- Powers AI assistant behavior and suggested prompts

**Data Model**:
- \`organization_enrichment\` stores raw enrichment data
- \`enrichment_skills_config\` stores generated skills
- Zustand store manages client-side flow state

**Features**: Personal email detection, progressive disclosure UI, confidence scoring, manual data fallback`
    },
    deal_health_momentum: {
      short: `Proactive deal clarity and execution tracking with Slack nudges for deals needing attention.`,
      long: `**Deal Health Momentum Workflow** unifies Deal Health Score + Risk Signals + Deal Truth + Close Plan to keep deals moving forward.

**Triggers**:
- Nightly cron refresh (health + risk aggregates)
- After meeting processing completes
- After email activity classification
- After CRM sync updates
- Manual Slack command: /sixty deal <name>

**Data Layers**:

1. **Deal Truth (Clarity Layer)**:
   - 6 fields: pain, success_metric, champion, economic_buyer, next_step, top_risks
   - Each field has: value, confidence (0-1), source, last_updated_at
   - Clarity Score = next_step_dated(30) + economic_buyer(25) + champion(20) + success_metric(15) + risks(10)
   - Stored in \`deal_truth_fields\` table

2. **Close Plan (Execution Layer)**:
   - 6 milestones: success_criteria, stakeholders_mapped, solution_fit, commercials_aligned, legal_procurement, signature_kickoff
   - Each milestone: owner_id, due_date, status (pending/in_progress/completed/blocked), blocker_note
   - Overdue milestones drag momentum score
   - Stored in \`deal_close_plan_items\` table

3. **Health Score (Behavioral Layer)**:
   - 5 signals: stage_velocity, sentiment, engagement, activity_recency, response_time
   - Composite health_status: healthy, attention, warning, critical, stalled
   - Stored in \`deal_health_scores\` table

4. **Risk Signals (Detection Layer)**:
   - AI-detected friction points with categories and severity
   - Aggregated to overall_risk_level: low, medium, high, critical
   - Stored in \`deal_risk_signals\` and \`deal_risk_aggregates\`

**Momentum Score Calculation**:
\`\`\`
momentum = 0.55 * clarity_score + 0.25 * (100 - risk_score) + 0.20 * health_score - overdue_penalty
\`\`\`

**Notification Triggers**:
- health_status IN (warning, critical, stalled)
- overall_risk_level IN (high, critical)
- clarity_score < 50
- economic_buyer unknown AND next_step undated

**Slack Card Actions**:
- Set Next Step: Opens modal with date picker and confidence selector
- Mark Milestone: Update close plan item status
- Answer Question: 1-click responses for low-confidence truth fields
- Log Activity: Quick activity logging
- Create Task: Generate task from context

**Deduplication**:
- \`deal_momentum_nudge\`: 24-hour cooldown per deal
- \`deal_clarification_question\`: 4-hour cooldown per deal+field
- Tracked in \`slack_notifications_sent\` table

**Edge Functions**:
- \`slack-deal-momentum\`: Proactive nudge delivery (cron-triggered)
- \`slack-interactive/handlers/momentum.ts\`: Button and modal handlers
- \`slack-slash-commands/handlers/deal.ts\`: /sixty deal command

**Features**: Risk-triggered questions, 1-click confidence updates, close plan progress tracking, momentum scoring, in-app notification mirroring`
    },
  },
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Safely parse request body - handle empty or malformed JSON
    let body: RequestBody = { action: 'list' };
    try {
      const text = await req.text();
      if (text && text.trim()) {
        body = JSON.parse(text);
      }
    } catch (parseError) {
      // If no body provided or invalid JSON, default to 'list' action
      console.log('No request body or invalid JSON, defaulting to list action');
    }

    const {
      action = 'generate',
      processType,
      processName,
      regenerate,
    } = body;

    // Validate required fields based on action
    if (action === 'generate' && (!processType || !processName)) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: processType, processName' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client with user auth
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Get current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify user is a platform admin (internal + is_admin)
    // Use service role to check admin status securely
    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Check if user is a platform admin (must be in internal_users AND have is_admin = true)
    const { data: profile, error: profileError } = await supabaseService
      .from('profiles')
      .select('email, is_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is admin
    if (!profile.is_admin) {
      return new Response(
        JSON.stringify({ error: 'Platform admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is in internal_users whitelist
    const { data: internalUser, error: internalError } = await supabaseService
      .from('internal_users')
      .select('email')
      .eq('email', profile.email?.toLowerCase())
      .eq('is_active', true)
      .single()

    if (internalError || !internalUser) {
      return new Response(
        JSON.stringify({ error: 'Internal user access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's org
    const { data: membership, error: membershipError } = await supabaseClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .single()

    if (membershipError || !membership) {
      return new Response(
        JSON.stringify({ error: 'User not in any organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const orgId = membership.org_id

    // Handle LIST action - fetch all process maps for the organization
    if (action === 'list') {
      console.log('Listing process maps for org:', orgId)

      const { data: processMaps, error: listError } = await supabaseService
        .from('process_maps')
        .select('*')
        .eq('org_id', orgId)
        .order('updated_at', { ascending: false })

      if (listError) {
        console.error('Error fetching process maps:', listError)
        return new Response(
          JSON.stringify({ error: 'Failed to fetch process maps', details: listError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`Found ${processMaps?.length || 0} process maps`)
      return new Response(
        JSON.stringify({
          processMaps: processMaps || [],
          count: processMaps?.length || 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if process map already exists (unless regenerate)
    // Use service role to avoid RLS issues (since INSERT uses service role too)
    if (!regenerate) {
      const { data: existingMap } = await supabaseService
        .from('process_maps')
        .select('*')  // Select all fields for complete response
        .eq('org_id', orgId)
        .eq('process_type', processType)
        .eq('process_name', processName)
        .order('version', { ascending: false })
        .limit(1)
        .single()

      if (existingMap) {
        return new Response(
          JSON.stringify({
            message: 'Process map already exists',
            processMap: existingMap,
            cached: true
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Get process description
    const processDescription = PROCESS_DESCRIPTIONS[processType]?.[processName]
    if (!processDescription) {
      return new Response(
        JSON.stringify({ error: `Unknown process: ${processType}/${processName}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get current version for this process
    const { data: latestVersion } = await supabaseClient
      .from('process_maps')
      .select('version')
      .eq('org_id', orgId)
      .eq('process_type', processType)
      .eq('process_name', processName)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    const newVersion = (latestVersion?.version || 0) + 1
    const title = formatTitle(processType, processName)

    // ============================================================================
    // TWO-PHASE GENERATION
    // Phase 1: Opus generates structured ProcessStructure JSON (source of truth)
    // Phase 2: Haiku transforms JSON → Mermaid code (horizontal + vertical)
    // ============================================================================

    console.log(`[Phase 1] Generating process structure with Opus for ${processType}/${processName}...`)

    // Phase 1: Generate ProcessStructure with Opus
    let processStructure: ProcessStructure | null = null
    let opusInputTokens = 0
    let opusOutputTokens = 0
    try {
      const phase1Result = await generateProcessStructure(processType, processName, processDescription.long, title)
      processStructure = phase1Result.structure
      opusInputTokens = phase1Result.inputTokens
      opusOutputTokens = phase1Result.outputTokens
      console.log(`[Phase 1] Structure generated: ${processStructure?.nodes?.length || 0} nodes, ${processStructure?.connections?.length || 0} connections`)
    } catch (structureError) {
      console.error('[Phase 1] Failed to generate structure:', structureError)
      return new Response(
        JSON.stringify({ error: 'Failed to generate process structure', details: (structureError as Error).message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!processStructure || !processStructure.nodes || processStructure.nodes.length === 0) {
      console.error('[Phase 1] Invalid structure generated')
      return new Response(
        JSON.stringify({ error: 'Invalid process structure generated' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Phase 2: Render BOTH views with Haiku in parallel
    console.log(`[Phase 2] Rendering both Mermaid views with Haiku...`)

    const [horizontalResult, verticalResult] = await Promise.allSettled([
      renderMermaidFromStructure(processStructure, 'horizontal'),
      renderMermaidFromStructure(processStructure, 'vertical')
    ])

    const horizontalCode = horizontalResult.status === 'fulfilled' ? horizontalResult.value : null
    const verticalCode = verticalResult.status === 'fulfilled' ? verticalResult.value : null

    if (horizontalResult.status === 'rejected') {
      console.error('[Phase 2] Horizontal render failed:', horizontalResult.reason)
    }
    if (verticalResult.status === 'rejected') {
      console.error('[Phase 2] Vertical render failed:', verticalResult.reason)
    }

    // Determine generation status
    let generationStatus: 'pending' | 'structure_ready' | 'partial' | 'complete' = 'structure_ready'
    if (horizontalCode && verticalCode) {
      generationStatus = 'complete'
    } else if (horizontalCode || verticalCode) {
      generationStatus = 'partial'
    }

    console.log(`[Phase 2] Rendered: horizontal=${!!horizontalCode}, vertical=${!!verticalCode}, status=${generationStatus}`)

    // Log AI cost events (fire-and-forget): Opus (Phase 1) + Haiku (Phase 2)
    if (opusInputTokens > 0 || opusOutputTokens > 0) {
      logAICostEvent(
        supabaseService, user.id, orgId,
        'anthropic', OPUS_MODEL,
        opusInputTokens, opusOutputTokens,
        'generate_process_map',
        undefined,
        { source: 'user_initiated', phase: 'structure' },
      ).catch((e: unknown) => console.warn('[generate-process-map] cost log error (opus):', e))
    }

    // Store in database with structure and both views
    const { data: processMap, error: insertError } = await supabaseService
      .from('process_maps')
      .insert({
        org_id: orgId,
        process_type: processType,
        process_name: processName,
        title,
        description: processDescription.short.trim(),
        description_long: processDescription.long.trim(),
        process_structure: processStructure, // Store the source of truth JSON
        mermaid_code: verticalCode || horizontalCode, // Keep legacy column populated
        mermaid_code_horizontal: horizontalCode,
        mermaid_code_vertical: verticalCode,
        generation_status: generationStatus,
        generated_by: user.id,
        version: newVersion
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error storing process map:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to store process map', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        message: generationStatus === 'complete'
          ? 'Process map generated successfully (structure + both views)'
          : generationStatus === 'partial'
          ? 'Process map generated partially (structure + one view)'
          : 'Process structure generated (views pending)',
        processMap,
        generated: true,
        generationStatus,
        nodeCount: processStructure.nodes.length,
        connectionCount: processStructure.connections.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in generate-process-map:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// ============================================================================
// PHASE 1: Generate ProcessStructure with Claude Opus
// ============================================================================

const OPUS_STRUCTURE_SYSTEM_PROMPT = `You are an expert at analyzing software integration processes and creating structured workflow representations.

Your task is to analyze a process description and output a structured JSON representation that captures the complete workflow with all its steps, connections, and organization.

## OUTPUT FORMAT

Return ONLY valid JSON matching this exact structure (no markdown, no explanation):

{
  "schemaVersion": "1.0",
  "metadata": {
    "processType": "<integration|workflow>",
    "processName": "<name>",
    "title": "<Human Readable Title>",
    "description": "<Brief one-line description>",
    "generatedAt": "<ISO timestamp>",
    "modelUsed": "claude-opus-4-5-20251101"
  },
  "subgraphs": [
    {
      "id": "<PascalCaseId>",
      "label": "<Emoji> <UPPERCASE TITLE>",
      "nodeIds": ["<node1>", "<node2>"],
      "order": 0
    }
  ],
  "nodes": [
    {
      "id": "<PascalCaseId>",
      "label": "<2-4 word label>",
      "shape": "<terminal|process|storage|decision|subroutine|async>",
      "subgraphId": "<matching subgraph id>",
      "executionOrder": 1,
      "stepType": "<trigger|action|condition|transform|external_call|storage|notification>",
      "integration": "<optional integration name>",
      "description": "<description for testing>",
      "testConfig": {
        "mockable": true,
        "requiresRealApi": false,
        "operations": ["read"]
      }
    }
  ],
  "connections": [
    {
      "from": "<nodeId>",
      "to": "<nodeId>",
      "style": "<normal|critical|optional>",
      "label": "<optional edge label>"
    }
  ],
  "styling": {
    "nodeClasses": {
      "terminal": ["<nodeIds for start/end>"],
      "storage": ["<nodeIds for database ops>"],
      "logic": ["<nodeIds for decisions>"],
      "async": ["<nodeIds for webhooks/events>"],
      "primary": ["<nodeIds for everything else>"]
    }
  }
}

## GUIDELINES

### Subgraphs (3-5 recommended)
Create logical groupings with emoji headers:
- 🛠️ CONFIGURATION & AUTH - Setup, OAuth, credentials
- 🔄 SYNC ENGINE - Data synchronization steps
- ⚙️ DATA PROCESSING - Transformation, extraction
- ⚡ AUTOMATION ENGINE - Automated actions
- 🔔 NOTIFICATIONS - Alerts, notifications
- 🧠 AI INTELLIGENCE - AI analysis steps
- 💾 DATA STORAGE - Database operations

### Node IDs
- Use PascalCase: OAuthGrant, ContactSync, ValidateToken
- Keep unique and descriptive
- No spaces or special characters

### Node Labels
- MAXIMUM 4 words
- No special characters (no &, #, :, <, >)
- Use "and" instead of "&"
- Simple, clear descriptions

### Shape Selection
- terminal: Start/End points only
- storage: Database, cache, queue operations
- decision: If/else, validation checks
- subroutine: Edge functions, API calls
- async: Webhooks, events, async operations
- process: Everything else

### Step Types (for testing)
- trigger: Entry points (webhooks, scheduled tasks)
- external_call: API calls to external services
- transform: Data transformation, AI processing
- storage: Database read/write
- condition: Branching logic
- action: General actions
- notification: Alerts, messages

### Execution Order
- Start nodes = 1
- Follow dependencies for subsequent numbering
- Parallel steps can share the same order number

### Test Configuration
- mockable: true for most steps
- requiresRealApi: true if step needs live external data
- operations: ["read"], ["write"], ["delete"], or combinations

CRITICAL: Return ONLY the JSON object. No markdown code blocks, no explanation text.`

async function generateProcessStructure(
  processType: string,
  processName: string,
  description: string,
  title: string
): Promise<{ structure: ProcessStructure; inputTokens: number; outputTokens: number }> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicApiKey) {
    throw new Error('AI service not configured')
  }

  const timestamp = new Date().toISOString()
  const userPrompt = `Analyze this ${processType} process and generate a structured JSON representation:

Process: ${processName.replace(/_/g, ' ').toUpperCase()}
Title: ${title}

Description:
${description}

Current timestamp for generatedAt: ${timestamp}

Generate the complete process structure JSON following the schema exactly.`

  console.log(`[Phase 1] Calling Opus API...`)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: OPUS_MODEL,
      max_tokens: 8192,
      temperature: 0.2,
      system: OPUS_STRUCTURE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[Phase 1] Opus API error:', errorText)
    throw new Error(`Opus API error: ${response.status}`)
  }

  const responseData = await response.json()
  let jsonText = responseData.content[0]?.text || ''

  // Clean up the response - remove markdown code blocks if present
  const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1].trim()
  }

  // Parse and validate
  const structure: ProcessStructure = JSON.parse(jsonText)

  // Basic validation
  if (!structure.schemaVersion || !structure.nodes || !structure.connections) {
    throw new Error('Invalid structure: missing required fields')
  }

  return {
    structure,
    inputTokens: responseData.usage?.input_tokens || 0,
    outputTokens: responseData.usage?.output_tokens || 0,
  }
}

// ============================================================================
// PHASE 2: Render Mermaid from ProcessStructure with Claude Haiku
// ============================================================================

const HAIKU_RENDER_SYSTEM_PROMPT = `You are a Mermaid diagram renderer. Your task is to convert a structured process JSON into valid Mermaid flowchart code.

## INPUT
You will receive:
1. A JSON structure containing nodes, connections, and subgraphs
2. A direction: "horizontal" (LR) or "vertical" (TB)

## OUTPUT
Return ONLY valid Mermaid code starting with "flowchart <direction>".

## SHAPE MAPPING (NEVER use quotes inside these shapes)
Convert shape types to Mermaid syntax:
- terminal: ((Label))   - Example: Start((Start))
- process: [Label]      - Example: Step1[Process Data]
- storage: [(Label)]    - Example: DB[(Database)]
- decision: {Label}     - Example: Check{Valid?}
- subroutine: [[Label]] - Example: Func[[API Call]]
- async: >Label]        - Example: Hook>Webhook]

## CONNECTION MAPPING (CRITICAL - follow syntax exactly)
NEVER use pipe syntax like -->|Label|. Use these formats ONLY:
- normal without label: A --> B
- normal with label: A -- Label --> B
- critical without label: A ==> B
- critical with label: A == Label ==> B
- optional without label: A -.-> B
- optional with label: A -. Label .-> B

## REQUIRED STRUCTURE
1. flowchart <LR or TB>
2. Subgraph blocks in order (with direction TB inside each)
3. Node definitions within their subgraphs
4. All connections after subgraph blocks close
5. Styling definitions at end

## REQUIRED STYLING (always include at end)
    classDef primary fill:#e0e7ff,stroke:#4f46e5,stroke-width:2px,color:#1e1b4b
    classDef storage fill:#dbeafe,stroke:#3b82f6,stroke-width:2px,color:#1e3a5f
    classDef logic fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f
    classDef io fill:#d1fae5,stroke:#059669,stroke-width:2px,color:#064e3b
    classDef terminal fill:#e2e8f0,stroke:#475569,stroke-width:2px,color:#0f172a
    classDef async fill:#fce7f3,stroke:#db2777,stroke-width:2px,color:#831843

    class <terminal_nodes> terminal
    class <storage_nodes> storage
    class <logic_nodes> logic
    class <async_nodes> async
    class <primary_nodes> primary

    linkStyle default stroke:#64748b,stroke-width:2px

## STRICT RULES
- NEVER use quotes inside shape brackets: [Label] not ["Label"]
- NEVER use pipe labels: A -- Label --> B not A -->|Label| B
- NEVER use colons in labels: "OAuth Flow" not "OAuth: Flow"
- NEVER use special characters: no &, #, <, >, :, or quotes in labels
- NEVER use parentheses in labels: "API Call" not "API (Call)"
- NEVER use <br/> tags
- Use "and" instead of "&"
- Every node MUST have a class assigned from styling.nodeClasses
- Use subgraph order from JSON
- Keep labels to 2-4 words maximum

CRITICAL: Return ONLY the Mermaid code. No markdown, no explanation.`

async function renderMermaidFromStructure(
  processStructure: ProcessStructure,
  direction: 'horizontal' | 'vertical'
): Promise<string | null> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicApiKey) {
    throw new Error('AI service not configured')
  }

  const mermaidDirection = direction === 'horizontal' ? 'LR' : 'TB'
  const userPrompt = `Convert this process structure to Mermaid code with ${mermaidDirection} (${direction === 'horizontal' ? 'left-to-right' : 'top-to-bottom'}) direction:

${JSON.stringify(processStructure, null, 2)}

Generate the Mermaid flowchart code starting with "flowchart ${mermaidDirection}".`

  console.log(`[Phase 2] Calling Haiku API for ${direction} view...`)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 4096,
      temperature: 0.1, // Low temperature for consistent rendering
      system: HAIKU_RENDER_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[Phase 2] Haiku API error (${direction}):`, errorText)
    throw new Error(`Haiku API error: ${response.status}`)
  }

  const responseData = await response.json()
  let mermaidCode = responseData.content[0]?.text || ''

  // Clean up the response - remove markdown code blocks if present
  const codeBlockMatch = mermaidCode.match(/```(?:mermaid)?\s*([\s\S]*?)\s*```/)
  if (codeBlockMatch) {
    mermaidCode = codeBlockMatch[1].trim()
  }

  // Ensure it starts with valid Mermaid syntax
  if (!mermaidCode.startsWith('flowchart') && !mermaidCode.startsWith('graph')) {
    console.error(`[Phase 2] Invalid Mermaid code generated (${direction}):`, mermaidCode.substring(0, 100))
    return null
  }

  // Sanitize the generated code to fix common issues
  mermaidCode = sanitizeMermaidCode(mermaidCode)

  console.log(`[Phase 2] ${direction} view generated successfully`)
  return mermaidCode
}

/**
 * Sanitize Mermaid code to fix common AI generation issues
 * This handles many edge cases that can cause Mermaid parser errors
 */
function sanitizeMermaidCode(code: string): string {
  let sanitized = code

  // ============================================================================
  // PHASE 1: Fix special characters that break parsing
  // ============================================================================

  // Replace & with "and" (common parse error cause)
  sanitized = sanitized.replace(/&(?!amp;|lt;|gt;|quot;)/g, 'and')

  // Remove colons from labels (breaks parsing) - replace with dash
  // Match text inside brackets that contains colons
  sanitized = sanitized.replace(/(\[|\(|\{|>)([^\]\)\}]*):([^\]\)\}]*)(\]|\)|\})/g, '$1$2-$3$4')

  // Remove hash symbols from labels
  sanitized = sanitized.replace(/(\[|\(|\{|>)([^\]\)\}]*)#([^\]\)\}]*)(\]|\)|\})/g, '$1$2$3$4')

  // Remove angle brackets from labels (< and >)
  sanitized = sanitized.replace(/(\[|\(|\{)([^\]\)\}]*)<([^\]\)\}]*)(\]|\)|\})/g, '$1$2$3$4')
  sanitized = sanitized.replace(/(\[|\(|\{)([^\]\)\}]*)>([^\]\)\}]*)(\]|\)|\})/g, '$1$2$3$4')

  // ============================================================================
  // PHASE 2: Fix connection labels (pipe syntax is invalid in many cases)
  // ============================================================================

  // Fix all pipe labels in any connection: NodeA -->|Label| NodeB -> NodeA -- Label --> NodeB
  sanitized = sanitized.replace(/(\w+)\s*-->\s*\|([^|]+)\|\s*(\w+)/g, '$1 -- $2 --> $3')

  // Fix pipe labels with dotted arrows: NodeA -.->|Label| NodeB -> NodeA -. Label .-> NodeB
  sanitized = sanitized.replace(/(\w+)\s*-\.?-?>\s*\|([^|]+)\|\s*(\w+)/g, '$1 -. $2 .-> $3')

  // Fix pipe labels with thick arrows: NodeA ==>|Label| NodeB -> NodeA == Label ==> NodeB
  sanitized = sanitized.replace(/(\w+)\s*==>\s*\|([^|]+)\|\s*(\w+)/g, '$1 == $2 ==> $3')

  // Fix malformed dotted connections with pipe labels: -.-- |Label| NodeId -> -. Label .-> NodeId
  sanitized = sanitized.replace(/\.-{1,2}\s*\|([^|]+)\|\s*(\w+)/g, '-. $1 .-> $2')

  // Fix malformed normal connections with pipe labels: -- |Label| --> -> -- Label -->
  sanitized = sanitized.replace(/--\s*\|([^|]+)\|\s*-->/g, '-- $1 -->')

  // Fix malformed critical connections with pipe labels: == |Label| ==> -> == Label ==>
  sanitized = sanitized.replace(/==\s*\|([^|]+)\|\s*==>/g, '== $1 ==>')

  // ============================================================================
  // PHASE 3: Fix node shapes with quotes inside brackets
  // ============================================================================

  // Fix standard rectangles with quotes: ["Text"] -> [Text]
  sanitized = sanitized.replace(/\["([^"]*)"\]/g, '[$1]')

  // Fix cylinders with quotes: [("Text")] -> [(Text)]
  sanitized = sanitized.replace(/\[\("([^"]*)"\)\]/g, '[($1)]')

  // Fix diamonds with quotes: {"Text"} -> {Text}
  sanitized = sanitized.replace(/\{"([^"]*)"\}/g, '{$1}')

  // Fix double brackets with quotes: [["Text"]] -> [[Text]]
  sanitized = sanitized.replace(/\[\["([^"]*)"\]\]/g, '[[$1]]')

  // Fix terminal circles with quotes: (("Text")) -> ((Text))
  sanitized = sanitized.replace(/\(\("([^"]*)"\)\)/g, '(($1))')

  // Fix single parentheses with quotes: ("Text") -> (Text)
  sanitized = sanitized.replace(/\("([^"]*)"\)/g, '($1)')

  // Fix flags with quotes: >"Text"] -> >Text]
  sanitized = sanitized.replace(/>"([^"]*)"\]/g, '>$1]')

  // Fix flags with square brackets and quotes: >["Text"] -> >Text]
  sanitized = sanitized.replace(/>\["([^"]*)"\]/g, '>$1]')

  // Fix flags with just square brackets: >[Text] -> >Text]
  sanitized = sanitized.replace(/>\[([^\]]*)\]/g, '>$1]')

  // Fix parallelograms with quotes: [/"Text"/] -> [/Text/]
  sanitized = sanitized.replace(/\[\/"([^"]*)"\/\]/g, '[/$1/]')

  // ============================================================================
  // PHASE 4: Fix subgraph syntax
  // ============================================================================

  // Fix subgraph labels with quotes inside brackets: subgraph Name ["Label"] -> subgraph Name [Label]
  sanitized = sanitized.replace(/subgraph\s+(\w+)\s+\["([^"]*)"\]/g, 'subgraph $1 [$2]')

  // ============================================================================
  // PHASE 5: Clean up whitespace and formatting
  // ============================================================================

  // Remove <br/> from inside any shape brackets and replace with space
  sanitized = sanitized.replace(/<br\s*\/?>/gi, ' ')

  // Clean up any double spaces
  sanitized = sanitized.replace(/  +/g, ' ')

  // Clean up spaces before closing brackets
  sanitized = sanitized.replace(/ +\]/g, ']')
  sanitized = sanitized.replace(/ +\)/g, ')')
  sanitized = sanitized.replace(/ +\}/g, '}')

  // Remove empty lines (multiple newlines -> single newline)
  sanitized = sanitized.replace(/\n\s*\n/g, '\n')

  // ============================================================================
  // PHASE 6: Fix edge cases with parentheses in labels
  // ============================================================================

  // Remove parentheses from inside node labels: [Text (note)] -> [Text note]
  // Be careful not to affect valid syntax like ((terminal))
  sanitized = sanitized.replace(/\[([^\]]*)\(([^\)]*)\)([^\]]*)\]/g, '[$1$2$3]')

  return sanitized
}

/**
 * Format process name into readable title
 */
function formatTitle(processType: string, processName: string): string {
  const formattedName = processName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

  const typeLabel = processType === 'integration' ? 'Integration' : 'Workflow'
  return `${formattedName} ${typeLabel} Process Map`
}
