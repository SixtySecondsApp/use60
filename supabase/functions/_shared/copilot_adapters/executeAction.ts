import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AdapterRegistry } from './registry.ts';
import type { ActionResult, AdapterContext, ExecuteActionName, InvokeSkillParams, CreateTaskParams } from './types.ts';

type SupabaseClient = ReturnType<typeof createClient>;

// Maximum skill nesting depth to prevent infinite recursion
const MAX_INVOKE_DEPTH = 3;

const normalizeDueDate = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  if (['completed', 'done', 'n/a', 'na', 'none', 'null', 'undefined', 'tbd', 'unknown'].includes(lowered)) {
    return null;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

export async function executeAction(
  client: SupabaseClient,
  userId: string,
  orgId: string | null,
  action: ExecuteActionName,
  params: Record<string, unknown>,
  options?: { userAuthToken?: string }
): Promise<ActionResult & { capability?: string; provider?: string }> {
  const confirm = params.confirm === true;
  const ctx: AdapterContext = { userId, orgId, confirm };

  const registry = new AdapterRegistry(client, userId);
  const adapters = await registry.forOrg(orgId);
  
  // Map action to capability and provider
  const getCapabilityForAction = (action: ExecuteActionName): { capability: string; provider?: string } => {
    // CRM actions
    if (['get_contact', 'get_deal', 'get_company_status', 'get_pipeline_summary', 'get_pipeline_deals', 'get_pipeline_forecast', 'get_contacts_needing_attention', 'update_crm'].includes(action)) {
      const crmCap = adapters.capabilities.find(c => c.capability === 'crm');
      return { capability: 'crm', provider: crmCap?.provider };
    }
    // Calendar/Meeting actions
    if (['get_meetings', 'create_meeting', 'update_meeting'].includes(action)) {
      const calendarCap = adapters.capabilities.find(c => c.capability === 'calendar');
      return { capability: 'calendar', provider: calendarCap?.provider };
    }
    // Email actions
    if (['search_emails', 'draft_email', 'send_email'].includes(action)) {
      const emailCap = adapters.capabilities.find(c => c.capability === 'email');
      return { capability: 'email', provider: emailCap?.provider };
    }
    // Transcript actions
    if (['get_transcript', 'search_transcripts'].includes(action)) {
      const transcriptCap = adapters.capabilities.find(c => c.capability === 'transcript');
      return { capability: 'transcript', provider: transcriptCap?.provider };
    }
    // Messaging actions
    if (['send_notification', 'send_slack_message'].includes(action)) {
      const messagingCap = adapters.capabilities.find(c => c.capability === 'messaging');
      return { capability: 'messaging', provider: messagingCap?.provider };
    }
    return { capability: 'unknown' };
  };
  
  const { capability, provider } = getCapabilityForAction(action);
  
  // Helper to add capability metadata to results
  const addCapabilityMeta = (result: ActionResult): ActionResult & { capability?: string; provider?: string } => {
    return { ...result, capability, provider };
  };

  switch (action) {
    case 'get_contact':
      return addCapabilityMeta(await adapters.crm.getContact({
        id: params.id ? String(params.id) : undefined,
        email: params.email ? String(params.email) : undefined,
        name: params.name ? String(params.name) : undefined,
      }));

    case 'get_lead': {
      // Get lead with enrichment data from leads table (SavvyCal bookings, prep data, etc.)
      const email = params.email ? String(params.email) : undefined;
      const name = params.name ? String(params.name) : undefined;
      const contactId = params.contact_id ? String(params.contact_id) : undefined;
      const dateFrom = params.date_from ? String(params.date_from) : undefined;
      const dateTo = params.date_to ? String(params.date_to) : undefined;
      const dateField = params.date_field ? String(params.date_field) : 'created_at'; // 'created_at' or 'meeting_start'

      // Allow date-only queries (e.g., "leads from today")
      if (!email && !name && !contactId && !dateFrom && !dateTo) {
        return { success: false, data: null, error: 'get_lead requires email, name, contact_id, or date filters (date_from/date_to)' };
      }

      let query = client
        .from('leads')
        .select(`
          id,
          external_source,
          status,
          priority,
          enrichment_status,
          enrichment_provider,
          prep_status,
          prep_summary,
          contact_id,
          contact_name,
          contact_first_name,
          contact_last_name,
          contact_email,
          contact_phone,
          contact_timezone,
          domain,
          meeting_title,
          meeting_description,
          meeting_start,
          meeting_end,
          meeting_duration_minutes,
          meeting_timezone,
          meeting_url,
          conferencing_type,
          conferencing_url,
          metadata,
          created_at,
          updated_at
        `)
        .is('deleted_at', null)
        .order('meeting_start', { ascending: false, nullsFirst: false });

      // Apply identity filters
      if (contactId) {
        query = query.eq('contact_id', contactId);
      } else if (email) {
        query = query.ilike('contact_email', `%${email}%`);
      } else if (name) {
        query = query.ilike('contact_name', `%${name}%`);
      }

      // Apply date filters (can be combined with identity filters)
      if (dateFrom) {
        query = query.gte(dateField, dateFrom);
      }
      if (dateTo) {
        query = query.lte(dateField, dateTo);
      }

      const { data: leads, error: leadsError } = await query.limit(5);

      if (leadsError) {
        return { success: false, data: null, error: `Failed to fetch leads: ${leadsError.message}` };
      }

      if (!leads || leads.length === 0) {
        return {
          success: true,
          data: {
            found: false,
            message: `No leads found for ${email || name || contactId}`
          },
          source: 'leads'
        };
      }

      // Fetch prep notes/insights for all found leads
      const leadIds = leads.map((l: any) => l.id);
      const { data: prepNotes } = await client
        .from('lead_prep_notes')
        .select('lead_id, note_type, title, body, is_auto_generated, sort_order')
        .in('lead_id', leadIds)
        .order('sort_order', { ascending: true });

      // Group prep notes by lead_id
      const notesByLeadId: Record<string, any[]> = {};
      if (prepNotes) {
        prepNotes.forEach((note: any) => {
          if (!notesByLeadId[note.lead_id]) {
            notesByLeadId[note.lead_id] = [];
          }
          notesByLeadId[note.lead_id].push(note);
        });
      }

      // Extract useful enrichment data from metadata
      const enrichedLeads = leads.map((lead: any) => {
        const metadata = lead.metadata || {};

        // Extract custom fields from SavvyCal
        const customFields: Record<string, string> = {};
        if (metadata.savvycal?.fields?.attendee) {
          metadata.savvycal.fields.attendee.forEach((field: any) => {
            if (field.label && field.value) {
              customFields[field.label] = field.value;
            }
          });
        }
        // Also check top-level question fields
        if (metadata.question_1?.question && metadata.question_1?.answer) {
          customFields[metadata.question_1.question] = metadata.question_1.answer;
        }
        if (metadata.question_2?.question && metadata.question_2?.answer) {
          customFields[metadata.question_2.question] = metadata.question_2.answer;
        }

        return {
          id: lead.id,
          source: lead.external_source,
          status: lead.status,
          priority: lead.priority,

          // Contact info
          contact: {
            id: lead.contact_id,
            name: lead.contact_name,
            first_name: lead.contact_first_name,
            last_name: lead.contact_last_name,
            email: lead.contact_email,
            phone: lead.contact_phone || customFields['Phone'] || null,
            timezone: lead.contact_timezone,
          },

          // Company/domain
          domain: lead.domain,

          // Meeting info
          meeting: lead.meeting_start ? {
            title: lead.meeting_title,
            description: lead.meeting_description,
            start: lead.meeting_start,
            end: lead.meeting_end,
            duration_minutes: lead.meeting_duration_minutes,
            timezone: lead.meeting_timezone,
            url: lead.meeting_url,
            conferencing_type: lead.conferencing_type,
            conferencing_url: lead.conferencing_url || metadata.conferencing?.join_url,
          } : null,

          // Enrichment data
          enrichment: {
            status: lead.enrichment_status,
            provider: lead.enrichment_provider,
            prep_status: lead.prep_status,
            prep_summary: lead.prep_summary,
            research_summary: metadata.prep_ai?.research_summary || null,
          },

          // Custom fields from booking form
          custom_fields: Object.keys(customFields).length > 0 ? customFields : null,

          // Raw metadata for additional context
          booking_source: metadata.savvycal ? 'savvycal' : metadata.import_source || null,

          // Prep notes and insights (from lead_prep_notes table)
          prep_notes: notesByLeadId[lead.id]?.filter((n: any) => n.note_type !== 'insight') || [],
          insights: notesByLeadId[lead.id]?.filter((n: any) => n.note_type === 'insight').map((n: any) => ({
            title: n.title,
            body: n.body,
            is_auto_generated: n.is_auto_generated,
          })) || [],

          created_at: lead.created_at,
          updated_at: lead.updated_at,
        };
      });

      return {
        success: true,
        data: {
          found: true,
          count: enrichedLeads.length,
          leads: enrichedLeads,
        },
        source: 'leads',
      };
    }

    case 'get_deal':
      return addCapabilityMeta(await adapters.crm.getDeal({
        id: params.id ? String(params.id) : undefined,
        name: params.name ? String(params.name) : undefined,
        close_date_from: params.close_date_from ? String(params.close_date_from) : undefined,
        close_date_to: params.close_date_to ? String(params.close_date_to) : undefined,
        status: params.status ? String(params.status) : undefined,
        stage_id: params.stage_id ? String(params.stage_id) : undefined,
        include_health: params.include_health === true,
        limit: params.limit ? Number(params.limit) : undefined,
      }));

    case 'get_pipeline_summary':
      return addCapabilityMeta(await adapters.crm.getPipelineSummary({}));

    case 'get_pipeline_deals':
      return addCapabilityMeta(await adapters.crm.getPipelineDeals({
        filter: params.filter ? String(params.filter) as 'closing_soon' | 'at_risk' | 'stale' | 'needs_attention' : undefined,
        days: params.days ? Number(params.days) : undefined,
        period: params.period ? String(params.period) : undefined,
        include_health: params.include_health === true,
        limit: params.limit ? Number(params.limit) : undefined,
      }));

    case 'get_pipeline_forecast':
      return addCapabilityMeta(await adapters.crm.getPipelineForecast({
        period: params.period ? String(params.period) : undefined,
      }));

    case 'get_contacts_needing_attention':
      return addCapabilityMeta(await adapters.crm.getContactsNeedingAttention({
        days_since_contact: params.days_since_contact ? Number(params.days_since_contact) : undefined,
        filter: params.filter ? String(params.filter) as 'at_risk' | 'ghost' | 'all' : undefined,
        limit: params.limit ? Number(params.limit) : undefined,
      }));

    case 'get_company_status':
      return addCapabilityMeta(await adapters.crm.getCompanyStatus({
        company_id: params.company_id ? String(params.company_id) : undefined,
        company_name: params.company_name ? String(params.company_name) : undefined,
        domain: params.domain ? String(params.domain) : undefined,
      }));

    case 'get_meetings':
      return addCapabilityMeta(await adapters.meetings.listMeetings({
        meeting_id: (params.meeting_id ?? params.meetingId) ? String(params.meeting_id ?? params.meetingId) : undefined,
        contactEmail: params.contactEmail ? String(params.contactEmail) : undefined,
        contactId: params.contactId ? String(params.contactId) : undefined,
        limit: params.limit ? Number(params.limit) : undefined,
      }));

    case 'search_emails':
      return addCapabilityMeta(await adapters.email.searchEmails({
        contact_email: params.contact_email ? String(params.contact_email) : undefined,
        contact_id: params.contact_id ? String(params.contact_id) : undefined,
        contact_name: params.contact_name ? String(params.contact_name) : undefined,
        query: params.query ? String(params.query) : undefined,
        limit: params.limit ? Number(params.limit) : undefined,
      }));

    case 'draft_email':
      return addCapabilityMeta(await adapters.email.draftEmail({
        to: params.to ? String(params.to) : undefined,
        subject: params.subject ? String(params.subject) : undefined,
        context: params.context ? String(params.context) : undefined,
        tone: params.tone ? String(params.tone) : undefined,
      }));

    case 'update_crm': {
      const entity = params.entity as 'deal' | 'contact' | 'task' | 'activity';
      const id = params.id ? String(params.id) : '';
      const updates = (params.updates || {}) as Record<string, unknown>;
      return addCapabilityMeta(await adapters.crm.updateCRM({ entity, id, updates }, ctx));
    }

    case 'send_notification':
      return addCapabilityMeta(await adapters.notifications.sendNotification(
        {
          channel: params.channel ? (String(params.channel) as 'slack') : 'slack',
          message: params.message ? String(params.message) : '',
          blocks: params.blocks ?? undefined,
          meta: (params.meta as Record<string, unknown>) ?? undefined,
        },
        ctx
      ));

    case 'enrich_contact': {
      // Input validation - email is required for enrichment
      const email = params.email ? String(params.email).trim() : '';
      if (!email) {
        return { success: false, data: null, error: 'Email is required for contact enrichment' };
      }
      // Basic email format validation
      if (!email.includes('@') || !email.includes('.')) {
        return { success: false, data: null, error: 'Invalid email format for contact enrichment' };
      }
      return adapters.enrichment.enrichContact({
        email,
        name: params.name ? String(params.name).trim() : undefined,
        title: params.title ? String(params.title).trim() : undefined,
        company_name: params.company_name ? String(params.company_name).trim() : undefined,
      });
    }

    case 'enrich_company': {
      // Input validation - either name or domain is required
      const name = params.name ? String(params.name).trim() : '';
      const domain = params.domain ? String(params.domain).trim() : undefined;
      const website = params.website ? String(params.website).trim() : undefined;

      if (!name && !domain && !website) {
        return { success: false, data: null, error: 'At least one of name, domain, or website is required for company enrichment' };
      }
      return adapters.enrichment.enrichCompany({
        name,
        domain,
        website,
      });
    }

    case 'run_skill': {
      // Execute a skill with AI processing and return generated output
      const skillKey = params.skill_key ? String(params.skill_key) : '';
      if (!skillKey) {
        return { success: false, data: null, error: 'skill_key is required for run_skill' };
      }

      if (!orgId) {
        return { success: false, data: null, error: 'Organization context required to run skills' };
      }

      // Build context from params (support both skill_context and context for backwards compatibility)
      const skillContext = (params.skill_context || params.context || {}) as Record<string, unknown>;
      const dryRun = params.dry_run === true || params.is_simulation === true;

      // Prefer org-enabled compiled skill docs; fallback to prompt runtime if not enabled (handled internally)
      const { executeAgentSkillWithContract } = await import('../agentSkillExecutor.ts');
      const result = await executeAgentSkillWithContract(client as any, {
        organizationId: orgId,
        userId,
        skillKey,
        context: skillContext,
        dryRun,
      });

      return {
        success: result.status !== 'failed',
        data: result,
        error: result.error,
        source: 'run_skill',
      };
    }

    case 'run_sequence': {
      // Execute a multi-step agent sequence (category=agent-sequence) and return execution results
      const sequenceKey = params.sequence_key ? String(params.sequence_key) : '';
      if (!sequenceKey) {
        return { success: false, data: null, error: 'sequence_key is required for run_sequence' };
      }

      if (!orgId) {
        return { success: false, data: null, error: 'Organization context required to run sequences' };
      }

      const sequenceContext = (params.sequence_context || params.context || {}) as Record<string, unknown>;
      const isSimulation = params.is_simulation === true;

      // Execute directly (no nested edge-function invocation) so Copilot can run sequences using service-role DB access,
      // while still enforcing org membership checks internally.
      const { executeSequence } = await import('../sequenceExecutor.ts');
      const data = await executeSequence(client as any, {
        organizationId: orgId,
        userId,
        sequenceKey,
        sequenceContext,
        isSimulation,
      });

      return {
        success: true,
        data,
        source: 'run_sequence',
      };
    }

    case 'invoke_skill': {
      // Skill composition: allows skills to invoke other skills
      const skillKey = params.skill_key ? String(params.skill_key) : '';
      if (!skillKey) {
        return { success: false, data: null, error: 'skill_key is required for invoke_skill' };
      }

      // Recursion protection - extract depth from params or invoke_metadata
      const invokeMetadata = params.invoke_metadata as { depth?: number; parent_skill?: string } | undefined;
      const currentDepth = (params._invoke_depth as number) || invokeMetadata?.depth || 0;
      if (currentDepth >= MAX_INVOKE_DEPTH) {
        return {
          success: false,
          data: null,
          error: `Max skill nesting depth (${MAX_INVOKE_DEPTH}) exceeded. Skill chain: ${params._parent_skill || invokeMetadata?.parent_skill || 'root'} → ${skillKey}`,
        };
      }

      // Circular dependency detection
      const parentSkill = params._parent_skill
        ? String(params._parent_skill)
        : invokeMetadata?.parent_skill || null;
      if (parentSkill === skillKey) {
        return {
          success: false,
          data: null,
          error: `Circular skill invocation detected: ${skillKey} cannot invoke itself`,
        };
      }

      // Validate org_id is available for skill lookup
      if (!orgId) {
        return { success: false, data: null, error: 'Organization context required to invoke skills' };
      }

      // AUTHORIZATION: Verify user is a member of the organization
      const { data: membership, error: membershipError } = await client
        .from('organization_memberships')
        .select('role')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .maybeSingle();

      if (membershipError) {
        console.error('[invoke_skill] Error checking membership:', membershipError.message);
        return { success: false, data: null, error: 'Failed to verify organization membership' };
      }

      if (!membership) {
        console.warn('[invoke_skill] User not a member of organization:', { userId, orgId, skillKey });
        return { success: false, data: null, error: 'User is not a member of this organization' };
      }

      // Fetch the target skill from organization_skills or platform_skills
      const { data: skillData, error: skillError } = await client
        .from('organization_skills')
        .select(`
          skill_id,
          compiled_content,
          compiled_frontmatter,
          platform_skills:platform_skill_id(category, frontmatter, content_template, is_active)
        `)
        .eq('skill_id', skillKey)
        .eq('organization_id', orgId)
        .eq('is_enabled', true)
        .maybeSingle();

      if (skillError) {
        console.error('[invoke_skill] Database error fetching skill:', skillError.message);
        return { success: false, data: null, error: `Failed to fetch skill: ${skillError.message}` };
      }

      if (!skillData) {
        return { success: false, data: null, error: `Skill not found or not enabled: ${skillKey}` };
      }

      // Merge context: parent context (from previous invoke) + explicit context (from params)
      // Both _parent_context and context can be used, with context taking precedence
      const parentContext = (params._parent_context || params.parent_context || {}) as Record<string, unknown>;
      const explicitContext = (params.context || {}) as Record<string, unknown>;
      const mergedContext = params.merge_parent_context !== false
        ? { ...parentContext, ...explicitContext }
        : explicitContext;

      return {
        success: true,
        data: {
          skill_key: skillKey,
          skill_content: skillData.compiled_content || skillData.platform_skills?.content_template || '',
          skill_frontmatter: skillData.compiled_frontmatter || skillData.platform_skills?.frontmatter || {},
          context: mergedContext,
          invoke_metadata: {
            depth: currentDepth + 1,
            parent_skill: skillKey, // Track current skill as parent for next invocation
            max_depth: MAX_INVOKE_DEPTH,
          },
        },
        source: 'invoke_skill',
      };
    }

    case 'get_booking_stats': {
      // Check if user is admin for org-wide queries
      let isAdmin = false;
      if (params.org_wide === true && orgId) {
        const { data: profile } = await client
          .from('profiles')
          .select('is_admin')
          .eq('id', userId)
          .maybeSingle();
        isAdmin = profile?.is_admin === true;
      }

      return adapters.meetings.getBookingStats({
        period: params.period ? String(params.period) : undefined,
        filter_by: params.filter_by ? String(params.filter_by) : undefined,
        source: params.source ? String(params.source) : undefined,
        org_wide: params.org_wide === true,
        isAdmin,
        orgId: orgId || undefined,
      });
    }

    case 'get_meeting_count': {
      // Get count of meetings for a period with timezone awareness
      const period = params.period ? String(params.period) as 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'this_month' : 'this_week';
      const timezone = params.timezone ? String(params.timezone) : undefined;
      const weekStartsOn = params.week_starts_on !== undefined ? (Number(params.week_starts_on) as 0 | 1) : undefined;

      return adapters.meetings.getMeetingCount({
        period,
        timezone,
        weekStartsOn,
      });
    }

    case 'get_next_meeting': {
      // Get next upcoming meeting with optional CRM context enrichment
      const includeContext = params.include_context !== false; // Default to true for hero feature
      const timezone = params.timezone ? String(params.timezone) : undefined;

      return adapters.meetings.getNextMeeting({
        includeContext,
        timezone,
      });
    }

    case 'get_meetings_for_period': {
      // Get list of meetings for today, tomorrow, or a specific day of the week
      const validPeriods = [
        'today', 'tomorrow', 'this_week', 'next_week', 'last_week',
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
      ];
      const rawPeriod = params.period ? String(params.period).toLowerCase() : 'today';
      const period = validPeriods.includes(rawPeriod) ? rawPeriod : 'today';
      const timezone = params.timezone ? String(params.timezone) : undefined;
      const weekStartsOn = params.week_starts_on !== undefined ? (Number(params.week_starts_on) as 0 | 1) : undefined;
      const includeContext = params.include_context === true;
      const limit = params.limit ? Number(params.limit) : undefined;

      return adapters.meetings.getMeetingsForPeriod({
        period,
        timezone,
        weekStartsOn,
        includeContext,
        limit,
      });
    }

    case 'get_time_breakdown': {
      // Get time breakdown statistics (meetings vs other activities)
      const period = params.period ? String(params.period) as 'this_week' | 'last_week' | 'this_month' | 'last_month' : 'this_week';
      const timezone = params.timezone ? String(params.timezone) : undefined;
      const weekStartsOn = params.week_starts_on !== undefined ? (Number(params.week_starts_on) as 0 | 1) : undefined;

      return adapters.meetings.getTimeBreakdown({
        period,
        timezone,
        weekStartsOn,
      });
    }

    case 'create_task': {
      // Create a task in the database
      const title = params.title ? String(params.title) : '';
      if (!title) {
        return { success: false, data: null, error: 'title is required for create_task' };
      }

      const normalizedDueDate = normalizeDueDate(params.due_date);
      const taskPreview = {
        title,
        description: params.description ? String(params.description) : null,
        status: 'pending',
        priority: params.priority || 'medium',
        due_date: normalizedDueDate,
        contact_id: params.contact_id ? String(params.contact_id) : null,
        deal_id: params.deal_id ? String(params.deal_id) : null,
        assignee_id: params.assignee_id ? String(params.assignee_id) : null,
      };

      // Require confirmation for write operations
      if (!ctx.confirm) {
        return {
          success: false,
          data: null,
          error: 'Confirmation required to create task',
          needs_confirmation: true,
          preview: taskPreview,
          source: 'create_task',
        };
      }

      const taskData: Record<string, unknown> = {
        assigned_to: taskPreview.assignee_id || userId, // Use assignee if provided, else current user
        created_by: userId,
        title,
        description: taskPreview.description,
        status: 'pending',
        priority: taskPreview.priority,
        created_at: new Date().toISOString(),
      };

      // Add optional relations
      if (taskPreview.due_date) {
        taskData.due_date = taskPreview.due_date;
      }
      if (taskPreview.contact_id) {
        taskData.contact_id = taskPreview.contact_id;
      }
      if (taskPreview.deal_id) {
        taskData.deal_id = taskPreview.deal_id;
      }

      const { data: newTask, error: taskError } = await client
        .from('tasks')
        .insert(taskData)
        .select('id, title, status, priority, due_date')
        .single();

      if (taskError) {
        return { success: false, data: null, error: `Failed to create task: ${taskError.message}` };
      }

      return {
        success: true,
        data: {
          task_id: newTask.id,
          title: newTask.title,
          status: newTask.status,
          priority: newTask.priority,
          due_date: newTask.due_date,
          message: `Task "${title}" created successfully`,
        },
        source: 'create_task',
      };
    }

    case 'list_tasks': {
      // Build query with filters
      let query = client
        .from('tasks')
        .select('id, title, description, status, priority, due_date, task_type, contact_name, company, created_at')
        .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
        .order('due_date', { ascending: true, nullsFirst: false });

      // Apply optional filters
      if (params.status) {
        query = query.eq('status', String(params.status));
      }
      if (params.priority) {
        query = query.eq('priority', String(params.priority));
      }
      if (params.contact_id) {
        query = query.eq('contact_id', String(params.contact_id));
      }
      if (params.deal_id) {
        query = query.eq('deal_id', String(params.deal_id));
      }
      if (params.company_id) {
        query = query.eq('company_id', String(params.company_id));
      }
      if (params.due_before) {
        query = query.lte('due_date', String(params.due_before));
      }
      if (params.due_after) {
        query = query.gte('due_date', String(params.due_after));
      }

      // Apply limit (default 20, max 50)
      const limit = Math.min(Number(params.limit) || 20, 50);
      query = query.limit(limit);

      const { data: tasks, error: tasksError } = await query;

      if (tasksError) {
        return { success: false, data: null, error: `Failed to list tasks: ${tasksError.message}` };
      }

      return {
        success: true,
        data: {
          tasks: tasks || [],
          count: tasks?.length || 0,
          filters_applied: {
            status: params.status || null,
            priority: params.priority || null,
            contact_id: params.contact_id || null,
            deal_id: params.deal_id || null,
            company_id: params.company_id || null,
          },
        },
        source: 'list_tasks',
      };
    }

    case 'create_activity': {
      // Input validation
      const activityType = params.type ? String(params.type) : '';
      const validTypes = ['outbound', 'meeting', 'proposal', 'sale'];
      if (!activityType || !validTypes.includes(activityType)) {
        return { success: false, data: null, error: `type is required and must be one of: ${validTypes.join(', ')}` };
      }

      const clientName = params.client_name ? String(params.client_name).trim() : '';
      if (!clientName) {
        return { success: false, data: null, error: 'client_name is required for create_activity' };
      }

      const activityPreview = {
        type: activityType,
        client_name: clientName,
        details: params.details ? String(params.details) : null,
        amount: params.amount ? Number(params.amount) : null,
        date: params.date ? String(params.date) : new Date().toISOString(),
        status: params.status || 'completed',
        priority: params.priority || 'medium',
        contact_id: params.contact_id ? String(params.contact_id) : null,
        deal_id: params.deal_id ? String(params.deal_id) : null,
        company_id: params.company_id ? String(params.company_id) : null,
      };

      // Require confirmation for write operations
      if (!ctx.confirm) {
        return {
          success: false,
          data: null,
          error: 'Confirmation required to create activity',
          needs_confirmation: true,
          preview: activityPreview,
          source: 'create_activity',
        };
      }

      const activityData: Record<string, unknown> = {
        user_id: userId,
        type: activityType,
        client_name: clientName,
        details: activityPreview.details,
        amount: activityPreview.amount,
        date: activityPreview.date,
        status: activityPreview.status,
        priority: activityPreview.priority,
        created_at: new Date().toISOString(),
      };

      // Add optional relations
      if (activityPreview.contact_id) {
        activityData.contact_id = activityPreview.contact_id;
      }
      if (activityPreview.deal_id) {
        activityData.deal_id = activityPreview.deal_id;
      }
      if (activityPreview.company_id) {
        activityData.company_id = activityPreview.company_id;
      }

      const { data: newActivity, error: activityError } = await client
        .from('activities')
        .insert(activityData)
        .select('id, type, client_name, status, amount, date')
        .single();

      if (activityError) {
        return { success: false, data: null, error: `Failed to create activity: ${activityError.message}` };
      }

      return {
        success: true,
        data: {
          activity_id: newActivity.id,
          type: newActivity.type,
          client_name: newActivity.client_name,
          status: newActivity.status,
          amount: newActivity.amount,
          date: newActivity.date,
          message: `Activity "${activityType}" for "${clientName}" created successfully`,
        },
        source: 'create_activity',
      };
    }

    case 'search_leads_create_table': {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

      console.log(`[executeAction] search_leads_create_table called. userId=${userId}, orgId=${orgId}, hasToken=${!!options?.userAuthToken}, params keys: ${Object.keys(params).join(', ')}`);

      // Separate meta params from Apollo/AI Ark search params
      // copilot-dynamic-table expects { query_description, search_params: {...}, source?, table_name? }
      const {
        query, query_description, title, table_name,
        source, action, auto_enrich, target_table_id,
        ...searchParams
      } = params as Record<string, unknown>;

      const queryDescription = String(query_description || query || 'Lead search');
      const normalizedSearchParams: Record<string, unknown> = { ...searchParams };
      const apolloFilterKeys = [
        'person_titles',
        'person_locations',
        'person_seniorities',
        'person_departments',
        'organization_num_employees_ranges',
        'organization_latest_funding_stage_cd',
        'q_keywords',
        'q_organization_keyword_tags',
        'q_organization_domains',
      ];
      const hasApolloFilter = apolloFilterKeys.some((key) => {
        const value = normalizedSearchParams[key];
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'string') return value.trim().length > 0;
        return value != null;
      });

      // Keep lead search resilient for plain-English prompts (e.g. "marketing agencies in bristol")
      // by inferring minimal Apollo filters when the model omitted structured params.
      if (!hasApolloFilter && queryDescription) {
        const locationMatch = queryDescription.match(/\b(?:in|near|around)\s+([a-zA-Z][a-zA-Z\s-]{1,60})/i);
        if (!normalizedSearchParams.person_locations && locationMatch?.[1]) {
          const location = locationMatch[1].trim().replace(/\s+/g, ' ');
          normalizedSearchParams.person_locations = [location];
        }

        if (!normalizedSearchParams.q_keywords) {
          const keywordSeed = queryDescription
            .replace(/^\s*(find|search|show|build|prospect)(\s+me)?\s+/i, '')
            .replace(/\b(?:in|near|around)\s+[a-zA-Z][a-zA-Z\s-]{1,60}\b/i, '')
            .replace(/\s+/g, ' ')
            .trim();

          if (keywordSeed) {
            normalizedSearchParams.q_keywords = keywordSeed;
          }
        }

        if (!normalizedSearchParams.per_page) {
          normalizedSearchParams.per_page = 25;
        }
      }

      const requestBody = {
        query_description: queryDescription,
        search_params: normalizedSearchParams,
        table_name: table_name || title || undefined,
        source: source || 'apollo',
        action: action || undefined,
        target_table_id: target_table_id || undefined,
        auto_enrich: auto_enrich || undefined,
      };
      console.log(`[executeAction] search_leads_create_table request body:`, JSON.stringify(requestBody));

      // Pass user JWT through — both functions deployed with --no-verify-jwt
      const authToken = options?.userAuthToken || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/copilot-dynamic-table`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            'apikey': Deno.env.get('SUPABASE_ANON_KEY')!,
          },
          body: JSON.stringify(requestBody),
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          console.error(`[executeAction] search_leads_create_table failed (${resp.status}):`, errBody);
          return { success: false, data: null, error: `Dynamic table creation failed (${resp.status}): ${errBody}` };
        }

        const result = await resp.json();
        return { success: true, data: result };
      } catch (e: any) {
        return { success: false, data: null, error: e?.message || 'Failed to create dynamic table' };
      }
    }

    case 'enrich_table_column': {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const enrichAuthHeader = options?.userAuthToken
        ? `Bearer ${options.userAuthToken}`
        : `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/enrich-dynamic-table`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': enrichAuthHeader,
            'apikey': Deno.env.get('SUPABASE_ANON_KEY')!,
          },
          body: JSON.stringify({
            table_id: params.table_id ? String(params.table_id) : '',
            column_id: params.column_id ? String(params.column_id) : '',
            row_ids: params.row_ids,
          }),
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          return { success: false, data: null, error: `Enrichment failed: ${errBody}` };
        }

        const result = await resp.json();
        return { success: true, data: result };
      } catch (e: any) {
        return { success: false, data: null, error: e?.message || 'Failed to enrich table column' };
      }
    }

    // =========================================================================
    // Ops Table CRUD
    // =========================================================================

    case 'list_ops_tables': {
      if (!orgId) {
        return { success: false, data: null, error: 'Organization context required to list ops tables' };
      }

      const limit = Math.min(Number(params.limit) || 50, 100);
      let query = client
        .from('dynamic_tables')
        .select('id, name, description, source_type, row_count, created_at, updated_at')
        .eq('organization_id', orgId)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (params.source_type) {
        query = query.eq('source_type', String(params.source_type));
      }

      const { data: tables, error: tablesError } = await query;

      if (tablesError) {
        return { success: false, data: null, error: `Failed to list ops tables: ${tablesError.message}` };
      }

      return {
        success: true,
        data: { tables: tables || [], count: tables?.length || 0 },
        source: 'list_ops_tables',
      };
    }

    case 'get_ops_table': {
      if (!orgId) {
        return { success: false, data: null, error: 'Organization context required to get ops table' };
      }

      const tableId = params.table_id ? String(params.table_id) : '';
      if (!tableId) {
        return { success: false, data: null, error: 'table_id is required for get_ops_table' };
      }

      const { data: table, error: tableError } = await client
        .from('dynamic_tables')
        .select('id, name, description, source_type, source_query, row_count, created_at, updated_at')
        .eq('id', tableId)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (tableError) {
        return { success: false, data: null, error: `Failed to get ops table: ${tableError.message}` };
      }

      if (!table) {
        return { success: false, data: null, error: `Ops table not found: ${tableId}` };
      }

      // Fetch columns for the table
      const { data: columns } = await client
        .from('dynamic_table_columns')
        .select('id, name, column_type, position, config')
        .eq('table_id', tableId)
        .order('position', { ascending: true });

      return {
        success: true,
        data: { ...table, columns: columns || [] },
        source: 'get_ops_table',
      };
    }

    case 'create_ops_table': {
      if (!orgId) {
        return { success: false, data: null, error: 'Organization context required to create ops table' };
      }

      const tableName = params.name ? String(params.name) : '';
      if (!tableName) {
        return { success: false, data: null, error: 'name is required for create_ops_table' };
      }

      const tablePreview = {
        name: tableName,
        description: params.description ? String(params.description) : null,
        columns: Array.isArray(params.columns) ? params.columns : [],
      };

      // Require confirmation for write operations
      if (!ctx.confirm) {
        return {
          success: false,
          data: null,
          error: 'Confirmation required to create ops table',
          needs_confirmation: true,
          preview: tablePreview,
          source: 'create_ops_table',
        };
      }

      const { data: newTable, error: createError } = await client
        .from('dynamic_tables')
        .insert({
          organization_id: orgId,
          created_by: userId,
          name: tableName,
          description: tablePreview.description,
          source_type: 'manual',
          row_count: 0,
        })
        .select('id, name, description, source_type, row_count, created_at')
        .single();

      if (createError) {
        return { success: false, data: null, error: `Failed to create ops table: ${createError.message}` };
      }

      // Create columns if provided
      const columnsToCreate = tablePreview.columns as Array<{ name: string; column_type: string; config?: Record<string, unknown> }>;
      if (columnsToCreate.length > 0) {
        const columnRows = columnsToCreate.map((col, idx) => ({
          table_id: newTable.id,
          name: col.name,
          column_type: col.column_type || 'text',
          position: idx,
          config: col.config || {},
        }));

        const { error: colError } = await client
          .from('dynamic_table_columns')
          .insert(columnRows);

        if (colError) {
          console.error('[create_ops_table] Failed to create columns:', colError.message);
        }
      }

      return {
        success: true,
        data: {
          table_id: newTable.id,
          name: newTable.name,
          description: newTable.description,
          column_count: columnsToCreate.length,
          message: `Ops table "${tableName}" created successfully`,
        },
        source: 'create_ops_table',
      };
    }

    case 'delete_ops_table': {
      if (!orgId) {
        return { success: false, data: null, error: 'Organization context required to delete ops table' };
      }

      const tableId = params.table_id ? String(params.table_id) : '';
      if (!tableId) {
        return { success: false, data: null, error: 'table_id is required for delete_ops_table' };
      }

      // Require confirmation for destructive operations
      if (!ctx.confirm) {
        // Fetch table name for preview
        const { data: tableInfo } = await client
          .from('dynamic_tables')
          .select('id, name, row_count')
          .eq('id', tableId)
          .eq('organization_id', orgId)
          .maybeSingle();

        return {
          success: false,
          data: null,
          error: 'Confirmation required to delete ops table',
          needs_confirmation: true,
          preview: tableInfo || { table_id: tableId },
          source: 'delete_ops_table',
        };
      }

      const { error: deleteError } = await client
        .from('dynamic_tables')
        .delete()
        .eq('id', tableId)
        .eq('organization_id', orgId);

      if (deleteError) {
        return { success: false, data: null, error: `Failed to delete ops table: ${deleteError.message}` };
      }

      return {
        success: true,
        data: { table_id: tableId, message: 'Ops table deleted successfully' },
        source: 'delete_ops_table',
      };
    }

    // =========================================================================
    // Ops Column & Row Operations
    // =========================================================================

    case 'add_ops_column': {
      if (!orgId) {
        return { success: false, data: null, error: 'Organization context required to add ops column' };
      }

      const tableId = params.table_id ? String(params.table_id) : '';
      const colName = params.name ? String(params.name) : '';
      const colType = params.column_type ? String(params.column_type) : 'text';

      if (!tableId) {
        return { success: false, data: null, error: 'table_id is required for add_ops_column' };
      }
      if (!colName) {
        return { success: false, data: null, error: 'name is required for add_ops_column' };
      }

      // Verify table belongs to org
      const { data: tbl } = await client
        .from('dynamic_tables')
        .select('id')
        .eq('id', tableId)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (!tbl) {
        return { success: false, data: null, error: `Ops table not found: ${tableId}` };
      }

      // Get max position for ordering
      const { data: maxCol } = await client
        .from('dynamic_table_columns')
        .select('position')
        .eq('table_id', tableId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextPosition = (maxCol?.position ?? -1) + 1;

      const { data: newCol, error: colError } = await client
        .from('dynamic_table_columns')
        .insert({
          table_id: tableId,
          name: colName,
          column_type: colType,
          position: nextPosition,
          config: (params.config as Record<string, unknown>) || {},
        })
        .select('id, name, column_type, position')
        .single();

      if (colError) {
        return { success: false, data: null, error: `Failed to add column: ${colError.message}` };
      }

      return {
        success: true,
        data: { column: newCol, message: `Column "${colName}" added successfully` },
        source: 'add_ops_column',
      };
    }

    case 'get_ops_table_data': {
      if (!orgId) {
        return { success: false, data: null, error: 'Organization context required to get ops table data' };
      }

      const tableId = params.table_id ? String(params.table_id) : '';
      if (!tableId) {
        return { success: false, data: null, error: 'table_id is required for get_ops_table_data' };
      }

      // Verify table belongs to org
      const { data: tbl } = await client
        .from('dynamic_tables')
        .select('id, name')
        .eq('id', tableId)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (!tbl) {
        return { success: false, data: null, error: `Ops table not found: ${tableId}` };
      }

      // Fetch columns
      const { data: columns } = await client
        .from('dynamic_table_columns')
        .select('id, name, column_type, position')
        .eq('table_id', tableId)
        .order('position', { ascending: true });

      // Fetch rows with pagination
      const limit = Math.min(Number(params.limit) || 50, 200);
      const offset = Number(params.offset) || 0;

      const { data: rows, error: rowsError } = await client
        .from('dynamic_table_rows')
        .select('id, position, created_at, updated_at')
        .eq('table_id', tableId)
        .order('position', { ascending: true })
        .range(offset, offset + limit - 1);

      if (rowsError) {
        return { success: false, data: null, error: `Failed to fetch rows: ${rowsError.message}` };
      }

      // Fetch cells for those rows
      const rowIds = (rows || []).map((r: any) => r.id);
      let cells: any[] = [];
      if (rowIds.length > 0) {
        const { data: cellData } = await client
          .from('dynamic_table_cells')
          .select('id, row_id, column_id, value, confidence, status')
          .in('row_id', rowIds);
        cells = cellData || [];
      }

      // Group cells by row
      const cellsByRow: Record<string, any[]> = {};
      for (const cell of cells) {
        if (!cellsByRow[cell.row_id]) cellsByRow[cell.row_id] = [];
        cellsByRow[cell.row_id].push(cell);
      }

      const enrichedRows = (rows || []).map((row: any) => ({
        ...row,
        cells: cellsByRow[row.id] || [],
      }));

      return {
        success: true,
        data: {
          table_name: tbl.name,
          columns: columns || [],
          rows: enrichedRows,
          row_count: enrichedRows.length,
          offset,
          limit,
        },
        source: 'get_ops_table_data',
      };
    }

    case 'add_ops_rows': {
      if (!orgId) {
        return { success: false, data: null, error: 'Organization context required to add ops rows' };
      }

      const tableId = params.table_id ? String(params.table_id) : '';
      if (!tableId) {
        return { success: false, data: null, error: 'table_id is required for add_ops_rows' };
      }

      const rowsData = Array.isArray(params.rows) ? params.rows : [];
      if (rowsData.length === 0) {
        return { success: false, data: null, error: 'rows array is required and must not be empty' };
      }

      // Require confirmation for write operations
      if (!ctx.confirm) {
        return {
          success: false,
          data: null,
          error: 'Confirmation required to add rows',
          needs_confirmation: true,
          preview: { table_id: tableId, row_count: rowsData.length },
          source: 'add_ops_rows',
        };
      }

      // Verify table belongs to org
      const { data: tbl } = await client
        .from('dynamic_tables')
        .select('id')
        .eq('id', tableId)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (!tbl) {
        return { success: false, data: null, error: `Ops table not found: ${tableId}` };
      }

      // Get columns for mapping
      const { data: columns } = await client
        .from('dynamic_table_columns')
        .select('id, name')
        .eq('table_id', tableId);

      const colByName: Record<string, string> = {};
      for (const col of columns || []) {
        colByName[col.name] = col.id;
      }

      // Get max position
      const { data: maxRow } = await client
        .from('dynamic_table_rows')
        .select('position')
        .eq('table_id', tableId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();

      let nextPos = (maxRow?.position ?? -1) + 1;

      // Insert rows and cells
      const insertedRowIds: string[] = [];
      for (const rowData of rowsData) {
        const { data: newRow, error: rowErr } = await client
          .from('dynamic_table_rows')
          .insert({ table_id: tableId, position: nextPos++ })
          .select('id')
          .single();

        if (rowErr || !newRow) continue;
        insertedRowIds.push(newRow.id);

        // Insert cells for each column value
        const cellInserts: Array<{ row_id: string; column_id: string; value: unknown }> = [];
        for (const [key, val] of Object.entries(rowData as Record<string, unknown>)) {
          const colId = colByName[key];
          if (colId) {
            cellInserts.push({ row_id: newRow.id, column_id: colId, value: val });
          }
        }

        if (cellInserts.length > 0) {
          await client.from('dynamic_table_cells').insert(cellInserts);
        }
      }

      // Update row count
      await client
        .from('dynamic_tables')
        .update({ row_count: nextPos })
        .eq('id', tableId);

      return {
        success: true,
        data: {
          table_id: tableId,
          rows_added: insertedRowIds.length,
          row_ids: insertedRowIds,
          message: `${insertedRowIds.length} row(s) added successfully`,
        },
        source: 'add_ops_rows',
      };
    }

    case 'update_ops_cell': {
      if (!orgId) {
        return { success: false, data: null, error: 'Organization context required to update ops cell' };
      }

      const rowId = params.row_id ? String(params.row_id) : '';
      const columnId = params.column_id ? String(params.column_id) : '';

      if (!rowId || !columnId) {
        return { success: false, data: null, error: 'row_id and column_id are required for update_ops_cell' };
      }

      // Verify the row belongs to a table in the user's org
      const { data: row } = await client
        .from('dynamic_table_rows')
        .select('id, table_id, dynamic_tables!inner(organization_id)')
        .eq('id', rowId)
        .maybeSingle();

      if (!row || (row as any).dynamic_tables?.organization_id !== orgId) {
        return { success: false, data: null, error: `Row not found or not in your organization` };
      }

      // Upsert the cell (leverages UNIQUE(row_id, column_id) constraint)
      const { data: cell, error: cellError } = await client
        .from('dynamic_table_cells')
        .upsert(
          { row_id: rowId, column_id: columnId, value: params.value },
          { onConflict: 'row_id,column_id' }
        )
        .select('id, row_id, column_id, value')
        .single();

      if (cellError) {
        return { success: false, data: null, error: `Failed to update cell: ${cellError.message}` };
      }

      return {
        success: true,
        data: { cell, message: 'Cell updated successfully' },
        source: 'update_ops_cell',
      };
    }

    // =========================================================================
    // Ops AI Features
    // =========================================================================

    case 'ai_query_ops_table': {
      if (!orgId) {
        return { success: false, data: null, error: 'Organization context required for AI query' };
      }

      const tableId = params.table_id ? String(params.table_id) : '';
      const queryText = params.query ? String(params.query) : '';

      if (!tableId || !queryText) {
        return { success: false, data: null, error: 'table_id and query are required for ai_query_ops_table' };
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const authHeader = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/ops-table-ai-query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({
            table_id: tableId,
            query: queryText,
            organization_id: orgId,
            user_id: userId,
          }),
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          return { success: false, data: null, error: `AI query failed: ${errBody}` };
        }

        const result = await resp.json();
        return { success: true, data: result, source: 'ai_query_ops_table' };
      } catch (e: any) {
        return { success: false, data: null, error: e?.message || 'Failed to execute AI query' };
      }
    }

    case 'ai_transform_ops_column': {
      if (!orgId) {
        return { success: false, data: null, error: 'Organization context required for AI transform' };
      }

      const tableId = params.table_id ? String(params.table_id) : '';
      const columnId = params.column_id ? String(params.column_id) : '';
      const prompt = params.prompt ? String(params.prompt) : '';

      if (!tableId || !columnId || !prompt) {
        return { success: false, data: null, error: 'table_id, column_id, and prompt are required for ai_transform_ops_column' };
      }

      // Require confirmation for write operations
      if (!ctx.confirm) {
        return {
          success: false,
          data: null,
          error: 'Confirmation required to transform column with AI',
          needs_confirmation: true,
          preview: { table_id: tableId, column_id: columnId, prompt },
          source: 'ai_transform_ops_column',
        };
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const authHeader = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/ops-table-transform-column`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({
            table_id: tableId,
            column_id: columnId,
            prompt,
            row_ids: Array.isArray(params.row_ids) ? params.row_ids : undefined,
            organization_id: orgId,
            user_id: userId,
          }),
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          return { success: false, data: null, error: `AI transform failed: ${errBody}` };
        }

        const result = await resp.json();
        return { success: true, data: result, source: 'ai_transform_ops_column' };
      } catch (e: any) {
        return { success: false, data: null, error: e?.message || 'Failed to transform column' };
      }
    }

    case 'get_enrichment_status': {
      if (!orgId) {
        return { success: false, data: null, error: 'Organization context required to get enrichment status' };
      }

      const tableId = params.table_id ? String(params.table_id) : '';
      if (!tableId) {
        return { success: false, data: null, error: 'table_id is required for get_enrichment_status' };
      }

      // Verify table belongs to org
      const { data: tbl } = await client
        .from('dynamic_tables')
        .select('id')
        .eq('id', tableId)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (!tbl) {
        return { success: false, data: null, error: `Ops table not found: ${tableId}` };
      }

      let query = client
        .from('enrichment_jobs')
        .select('id, column_id, status, total_rows, processed_rows, failed_rows, started_at, last_processed_row_index')
        .eq('table_id', tableId)
        .order('started_at', { ascending: false });

      if (params.column_id) {
        query = query.eq('column_id', String(params.column_id));
      }

      const { data: jobs, error: jobsError } = await query.limit(20);

      if (jobsError) {
        return { success: false, data: null, error: `Failed to get enrichment status: ${jobsError.message}` };
      }

      return {
        success: true,
        data: { jobs: jobs || [], count: jobs?.length || 0 },
        source: 'get_enrichment_status',
      };
    }

    // =========================================================================
    // Ops Rules & Automation
    // =========================================================================

    case 'create_ops_rule': {
      if (!orgId) {
        return { success: false, data: null, error: 'Organization context required to create ops rule' };
      }

      const tableId = params.table_id ? String(params.table_id) : '';
      const ruleName = params.name ? String(params.name) : '';
      const triggerType = params.trigger_type ? String(params.trigger_type) : '';
      const actionType = params.action_type ? String(params.action_type) : '';

      if (!tableId || !ruleName || !triggerType || !actionType) {
        return { success: false, data: null, error: 'table_id, name, trigger_type, and action_type are required for create_ops_rule' };
      }

      const rulePreview = {
        table_id: tableId,
        name: ruleName,
        trigger_type: triggerType,
        condition: (params.condition as Record<string, unknown>) || {},
        action_type: actionType,
        action_config: (params.action_config as Record<string, unknown>) || {},
      };

      // Require confirmation for write operations
      if (!ctx.confirm) {
        return {
          success: false,
          data: null,
          error: 'Confirmation required to create ops rule',
          needs_confirmation: true,
          preview: rulePreview,
          source: 'create_ops_rule',
        };
      }

      // Verify table belongs to org
      const { data: tbl } = await client
        .from('dynamic_tables')
        .select('id')
        .eq('id', tableId)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (!tbl) {
        return { success: false, data: null, error: `Ops table not found: ${tableId}` };
      }

      const { data: newRule, error: ruleError } = await client
        .from('ops_rules')
        .insert({
          table_id: tableId,
          name: ruleName,
          trigger_type: triggerType,
          condition: rulePreview.condition,
          action_type: actionType,
          action_config: rulePreview.action_config,
          is_enabled: true,
          created_by: userId,
        })
        .select('id, name, trigger_type, action_type, is_enabled, created_at')
        .single();

      if (ruleError) {
        return { success: false, data: null, error: `Failed to create rule: ${ruleError.message}` };
      }

      return {
        success: true,
        data: { rule: newRule, message: `Rule "${ruleName}" created successfully` },
        source: 'create_ops_rule',
      };
    }

    case 'list_ops_rules': {
      if (!orgId) {
        return { success: false, data: null, error: 'Organization context required to list ops rules' };
      }

      const tableId = params.table_id ? String(params.table_id) : '';
      if (!tableId) {
        return { success: false, data: null, error: 'table_id is required for list_ops_rules' };
      }

      // Verify table belongs to org
      const { data: tbl } = await client
        .from('dynamic_tables')
        .select('id')
        .eq('id', tableId)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (!tbl) {
        return { success: false, data: null, error: `Ops table not found: ${tableId}` };
      }

      const { data: rules, error: rulesError } = await client
        .from('ops_rules')
        .select('id, name, trigger_type, condition, action_type, action_config, is_enabled, consecutive_failures, created_at, updated_at')
        .eq('table_id', tableId)
        .order('created_at', { ascending: false });

      if (rulesError) {
        return { success: false, data: null, error: `Failed to list rules: ${rulesError.message}` };
      }

      return {
        success: true,
        data: { rules: rules || [], count: rules?.length || 0 },
        source: 'list_ops_rules',
      };
    }

    // =========================================================================
    // Ops Integration Sync
    // =========================================================================

    case 'sync_ops_hubspot': {
      if (!orgId) {
        return { success: false, data: null, error: 'Organization context required for HubSpot sync' };
      }

      const tableId = params.table_id ? String(params.table_id) : '';
      if (!tableId) {
        return { success: false, data: null, error: 'table_id is required for sync_ops_hubspot' };
      }

      // Require confirmation for sync operations
      if (!ctx.confirm) {
        return {
          success: false,
          data: null,
          error: 'Confirmation required to sync with HubSpot',
          needs_confirmation: true,
          preview: {
            table_id: tableId,
            list_id: params.list_id || null,
            field_mapping: params.field_mapping || null,
          },
          source: 'sync_ops_hubspot',
        };
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const authHeader = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/sync-hubspot-ops-table`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({
            table_id: tableId,
            list_id: params.list_id ? String(params.list_id) : undefined,
            field_mapping: params.field_mapping || undefined,
            organization_id: orgId,
            user_id: userId,
          }),
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          return { success: false, data: null, error: `HubSpot sync failed: ${errBody}` };
        }

        const result = await resp.json();
        return { success: true, data: result, source: 'sync_ops_hubspot' };
      } catch (e: any) {
        return { success: false, data: null, error: e?.message || 'Failed to sync with HubSpot' };
      }
    }

    case 'sync_ops_attio': {
      if (!orgId) {
        return { success: false, data: null, error: 'Organization context required for Attio sync' };
      }

      const tableId = params.table_id ? String(params.table_id) : '';
      if (!tableId) {
        return { success: false, data: null, error: 'table_id is required for sync_ops_attio' };
      }

      // Require confirmation for sync operations
      if (!ctx.confirm) {
        return {
          success: false,
          data: null,
          error: 'Confirmation required to sync with Attio',
          needs_confirmation: true,
          preview: {
            table_id: tableId,
            list_id: params.list_id || null,
            field_mapping: params.field_mapping || null,
          },
          source: 'sync_ops_attio',
        };
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const authHeader = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/sync-attio-ops-table`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({
            table_id: tableId,
            list_id: params.list_id ? String(params.list_id) : undefined,
            field_mapping: params.field_mapping || undefined,
            organization_id: orgId,
            user_id: userId,
          }),
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          return { success: false, data: null, error: `Attio sync failed: ${errBody}` };
        }

        const result = await resp.json();
        return { success: true, data: result, source: 'sync_ops_attio' };
      } catch (e: any) {
        return { success: false, data: null, error: e?.message || 'Failed to sync with Attio' };
      }
    }

    case 'push_ops_to_instantly': {
      if (!orgId) {
        return { success: false, data: null, error: 'Organization context required to push to Instantly' };
      }

      const tableId = params.table_id ? String(params.table_id) : '';
      if (!tableId) {
        return { success: false, data: null, error: 'table_id is required for push_ops_to_instantly' };
      }

      // Require confirmation for push operations
      if (!ctx.confirm) {
        return {
          success: false,
          data: null,
          error: 'Confirmation required to push to Instantly',
          needs_confirmation: true,
          preview: {
            table_id: tableId,
            campaign_id: params.campaign_id || null,
            row_count: Array.isArray(params.row_ids) ? params.row_ids.length : 'all',
          },
          source: 'push_ops_to_instantly',
        };
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const authHeader = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/push-to-instantly`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({
            table_id: tableId,
            campaign_id: params.campaign_id ? String(params.campaign_id) : undefined,
            row_ids: Array.isArray(params.row_ids) ? params.row_ids : undefined,
            organization_id: orgId,
            user_id: userId,
          }),
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          return { success: false, data: null, error: `Push to Instantly failed: ${errBody}` };
        }

        const result = await resp.json();
        return { success: true, data: result, source: 'push_ops_to_instantly' };
      } catch (e: any) {
        return { success: false, data: null, error: e?.message || 'Failed to push to Instantly' };
      }
    }

    // =========================================================================
    // Ops Insights
    // =========================================================================

    case 'get_ops_insights': {
      if (!orgId) {
        return { success: false, data: null, error: 'Organization context required to get ops insights' };
      }

      const tableId = params.table_id ? String(params.table_id) : '';
      if (!tableId) {
        return { success: false, data: null, error: 'table_id is required for get_ops_insights' };
      }

      // Verify table belongs to org
      const { data: tbl } = await client
        .from('dynamic_tables')
        .select('id')
        .eq('id', tableId)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (!tbl) {
        return { success: false, data: null, error: `Ops table not found: ${tableId}` };
      }

      // Try to get fresh insights from edge function
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const authHeader = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/ops-table-insights-engine`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({
            table_id: tableId,
            insight_type: params.insight_type ? String(params.insight_type) : undefined,
            organization_id: orgId,
            user_id: userId,
          }),
        });

        if (resp.ok) {
          const result = await resp.json();
          return { success: true, data: result, source: 'get_ops_insights' };
        }
      } catch {
        // Fall through to cached insights
      }

      // Fallback: return cached insights from the table
      let insightsQuery = client
        .from('ops_table_insights')
        .select('id, insight_type, data, generated_at')
        .eq('table_id', tableId)
        .order('generated_at', { ascending: false });

      if (params.insight_type) {
        insightsQuery = insightsQuery.eq('insight_type', String(params.insight_type));
      }

      const { data: insights, error: insightsError } = await insightsQuery.limit(20);

      if (insightsError) {
        return { success: false, data: null, error: `Failed to get insights: ${insightsError.message}` };
      }

      return {
        success: true,
        data: { insights: insights || [], count: insights?.length || 0, cached: true },
        source: 'get_ops_insights',
      };
    }

    case 'search_crm_contacts': {
      const { searchCrmContacts } = await import('./crmIndexAdapter.ts');
      const searchParams = {
        query: params.query ? String(params.query) : undefined,
        email: params.email ? String(params.email) : undefined,
        name: params.name ? String(params.name) : undefined,
        company: params.company ? String(params.company) : undefined,
        jobTitle: params.job_title ? String(params.job_title) : undefined,
        lifecycleStage: params.lifecycle_stage ? String(params.lifecycle_stage) : undefined,
        hasActiveDeal: params.has_active_deal !== undefined ? Boolean(params.has_active_deal) : undefined,
        limit: params.limit ? Number(params.limit) : 25,
      };

      const result = await searchCrmContacts(client, orgId, searchParams);
      return {
        ...result,
        source: 'search_crm_contacts',
      };
    }

    case 'search_crm_companies': {
      const { searchCrmCompanies } = await import('./crmIndexAdapter.ts');
      const searchParams = {
        query: params.query ? String(params.query) : undefined,
        name: params.name ? String(params.name) : undefined,
        domain: params.domain ? String(params.domain) : undefined,
        industry: params.industry ? String(params.industry) : undefined,
        limit: params.limit ? Number(params.limit) : 25,
      };

      const result = await searchCrmCompanies(client, orgId, searchParams);
      return {
        ...result,
        source: 'search_crm_companies',
      };
    }

    case 'search_crm_deals': {
      const { searchCrmDeals } = await import('./crmIndexAdapter.ts');
      const searchParams = {
        query: params.query ? String(params.query) : undefined,
        stage: params.stage ? String(params.stage) : undefined,
        pipeline: params.pipeline ? String(params.pipeline) : undefined,
        minAmount: params.min_amount ? Number(params.min_amount) : undefined,
        limit: params.limit ? Number(params.limit) : 25,
      };

      const result = await searchCrmDeals(client, orgId, searchParams);
      return {
        ...result,
        source: 'search_crm_deals',
      };
    }

    case 'materialize_contact': {
      const crmSource = params.crm_source ? String(params.crm_source) : '';
      const crmRecordId = params.crm_record_id ? String(params.crm_record_id) : '';

      if (!crmSource || !crmRecordId) {
        return {
          success: false,
          data: null,
          error: 'crm_source and crm_record_id are required for materialize_contact',
          source: 'materialize_contact',
        };
      }

      // Fetch the index record first
      const { data: indexRecord, error: indexError } = await client
        .from('crm_contact_index')
        .select('*')
        .eq('org_id', orgId)
        .eq('crm_source', crmSource)
        .eq('crm_record_id', crmRecordId)
        .maybeSingle();

      if (indexError || !indexRecord) {
        return {
          success: false,
          data: null,
          error: `Contact not found in CRM index: ${crmSource}/${crmRecordId}`,
          source: 'materialize_contact',
        };
      }

      // Import and call materialization service
      const { materializeContact } = await import('../materializationService.ts');
      const result = await materializeContact(client, orgId, indexRecord);

      return {
        ...result,
        source: result.source || 'materialize_contact',
      };
    }

    // =========================================================================
    // Meeting Intelligence
    // =========================================================================

    case 'meeting_intelligence_query': {
      const question = params.question ? String(params.question) : '';
      if (!question) {
        return { success: false, data: null, error: 'question is required for meeting_intelligence_query' };
      }

      const meetingAnalyticsBaseUrl =
        Deno.env.get('MEETING_ANALYTICS_BASE_URL') ||
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/meeting-analytics`;
      const authToken = options?.userAuthToken || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

      try {
        const resp = await fetch(`${meetingAnalyticsBaseUrl}/api/search/ask`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '',
          },
          body: JSON.stringify({
            question,
            transcriptId: params.transcriptId ? String(params.transcriptId) : undefined,
            maxMeetings: params.maxMeetings ? Number(params.maxMeetings) : 20,
            includeDemo: false,
          }),
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          return { success: false, data: null, error: `Meeting analytics service unavailable: ${errBody}` };
        }

        const result = await resp.json();
        return {
          success: true,
          data: {
            answer: result.answer,
            sources: result.sources,
            structuredData: result.structuredData || [],
            segmentsSearched: result.segmentsSearched,
            meetingsAnalyzed: result.meetingsAnalyzed,
            totalMeetings: result.totalMeetings,
            isAggregateQuestion: result.isAggregateQuestion,
            specificMeeting: result.specificMeeting,
          },
          source: 'meeting_intelligence_query',
        };
      } catch (e: any) {
        return { success: false, data: null, error: `Meeting analytics service unavailable: ${e?.message || 'Unknown error'}` };
      }
    }

    case 'search_meeting_context': {
      const query = params.query ? String(params.query) : '';
      if (!query) {
        return { success: false, data: null, error: 'query is required for search_meeting_context' };
      }

      // Build enriched question from optional name/company context
      const contextPrefix = [
        params.contactName ? `Contact: ${String(params.contactName)}` : '',
        params.companyName ? `Company: ${String(params.companyName)}` : '',
      ].filter(Boolean).join(', ');
      const enrichedQuery = contextPrefix ? `${contextPrefix}. ${query}` : query;

      const meetingAnalyticsBaseUrl =
        Deno.env.get('MEETING_ANALYTICS_BASE_URL') ||
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/meeting-analytics`;
      const authToken = options?.userAuthToken || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

      try {
        const resp = await fetch(`${meetingAnalyticsBaseUrl}/api/search/ask`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '',
          },
          body: JSON.stringify({
            question: enrichedQuery,
            maxMeetings: params.maxResults ? Number(params.maxResults) : 5,
            includeDemo: false,
          }),
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          return { success: false, data: null, error: `Meeting analytics service unavailable: ${errBody}` };
        }

        const result = await resp.json();
        return {
          success: true,
          data: {
            answer: result.answer,
            sources: result.sources,
            structuredData: result.structuredData || [],
            segmentsSearched: result.segmentsSearched,
            meetingsAnalyzed: result.meetingsAnalyzed,
            totalMeetings: result.totalMeetings,
            isAggregateQuestion: result.isAggregateQuestion,
            specificMeeting: result.specificMeeting,
          },
          source: 'search_meeting_context',
        };
      } catch (e: any) {
        return { success: false, data: null, error: `Meeting analytics service unavailable: ${e?.message || 'Unknown error'}` };
      }
    }

    // =========================================================================
    // Meeting Analytics Aggregation
    // =========================================================================

    case 'meeting_analytics_dashboard': {
      const meetingAnalyticsBaseUrl =
        Deno.env.get('MEETING_ANALYTICS_BASE_URL') ||
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/meeting-analytics`;
      const authToken = options?.userAuthToken || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

      try {
        const url = new URL(`${meetingAnalyticsBaseUrl}/api/dashboard/metrics`);
        if (params.includeDemo !== undefined) url.searchParams.set('includeDemo', String(params.includeDemo));
        if (params.demoOnly !== undefined) url.searchParams.set('demoOnly', String(params.demoOnly));

        const resp = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '',
          },
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          return { success: false, data: null, error: `Meeting analytics dashboard unavailable: ${errBody}` };
        }

        const result = await resp.json();
        return { success: true, data: result, source: 'meeting_analytics_dashboard' };
      } catch (e: any) {
        return { success: false, data: null, error: `Meeting analytics dashboard unavailable: ${e?.message || 'Unknown error'}` };
      }
    }

    case 'meeting_analytics_talk_time': {
      const meetingAnalyticsBaseUrl =
        Deno.env.get('MEETING_ANALYTICS_BASE_URL') ||
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/meeting-analytics`;
      const authToken = options?.userAuthToken || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

      try {
        const url = new URL(`${meetingAnalyticsBaseUrl}/api/analytics/talk-time`);
        if (params.includeDemo !== undefined) url.searchParams.set('includeDemo', String(params.includeDemo));
        if (params.demoOnly !== undefined) url.searchParams.set('demoOnly', String(params.demoOnly));
        if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit));

        const resp = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '',
          },
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          return { success: false, data: null, error: `Meeting analytics talk-time unavailable: ${errBody}` };
        }

        const result = await resp.json();
        return { success: true, data: result, source: 'meeting_analytics_talk_time' };
      } catch (e: any) {
        return { success: false, data: null, error: `Meeting analytics talk-time unavailable: ${e?.message || 'Unknown error'}` };
      }
    }

    case 'meeting_analytics_sentiment_trends': {
      const meetingAnalyticsBaseUrl =
        Deno.env.get('MEETING_ANALYTICS_BASE_URL') ||
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/meeting-analytics`;
      const authToken = options?.userAuthToken || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

      try {
        const url = new URL(`${meetingAnalyticsBaseUrl}/api/analytics/sentiment-trends`);
        if (params.includeDemo !== undefined) url.searchParams.set('includeDemo', String(params.includeDemo));
        if (params.demoOnly !== undefined) url.searchParams.set('demoOnly', String(params.demoOnly));
        if (params.days !== undefined) url.searchParams.set('days', String(params.days));

        const resp = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '',
          },
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          return { success: false, data: null, error: `Meeting analytics sentiment-trends unavailable: ${errBody}` };
        }

        const result = await resp.json();
        return { success: true, data: result, source: 'meeting_analytics_sentiment_trends' };
      } catch (e: any) {
        return { success: false, data: null, error: `Meeting analytics sentiment-trends unavailable: ${e?.message || 'Unknown error'}` };
      }
    }

    case 'meeting_analytics_insights': {
      const transcriptId = params.transcriptId ? String(params.transcriptId) : '';
      if (!transcriptId) {
        return { success: false, data: null, error: 'transcriptId is required for meeting_analytics_insights' };
      }

      const meetingAnalyticsBaseUrl =
        Deno.env.get('MEETING_ANALYTICS_BASE_URL') ||
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/meeting-analytics`;
      const authToken = options?.userAuthToken || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

      try {
        const url = new URL(`${meetingAnalyticsBaseUrl}/api/insights/${transcriptId}`);

        const resp = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '',
          },
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          return { success: false, data: null, error: `Meeting analytics insights unavailable: ${errBody}` };
        }

        const result = await resp.json();
        return { success: true, data: result, source: 'meeting_analytics_insights' };
      } catch (e: any) {
        return { success: false, data: null, error: `Meeting analytics insights unavailable: ${e?.message || 'Unknown error'}` };
      }
    }

    // ── Sales targets / goals ─────────────────────────────────────────────────

    case 'get_targets': {
      // Return current month's targets for the user
      const today = new Date();
      const startOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

      const { data: targetRow, error: targetErr } = await client
        .from('targets')
        .select('id, revenue_target, outbound_target, meetings_target, proposal_target, start_date, end_date')
        .eq('user_id', userId)
        .gte('start_date', startOfMonth)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (targetErr) {
        return { success: false, data: null, error: `Failed to fetch targets: ${targetErr.message}` };
      }

      if (!targetRow) {
        return {
          success: true,
          data: {
            targets_set: false,
            message: 'No targets have been set for this month yet.',
            revenue_target: 0,
            outbound_target: 0,
            meetings_target: 0,
            proposal_target: 0,
          },
          source: 'get_targets',
        };
      }

      return {
        success: true,
        data: {
          targets_set: true,
          id: targetRow.id,
          revenue_target: targetRow.revenue_target,
          outbound_target: targetRow.outbound_target,
          meetings_target: targetRow.meetings_target,
          proposal_target: targetRow.proposal_target,
          start_date: targetRow.start_date,
          end_date: targetRow.end_date,
        },
        source: 'get_targets',
      };
    }

    case 'upsert_target': {
      const field = params.field ? String(params.field) : '';
      const validFields = ['revenue_target', 'outbound_target', 'meetings_target', 'proposal_target'];
      if (!validFields.includes(field)) {
        return {
          success: false,
          data: null,
          error: `field must be one of: ${validFields.join(', ')}`,
        };
      }

      const rawValue = params.value;
      const value = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue ?? ''));
      if (isNaN(value) || value < 0) {
        return { success: false, data: null, error: 'value must be a non-negative number' };
      }

      const fieldLabels: Record<string, string> = {
        revenue_target: 'New Business revenue goal',
        outbound_target: 'Outbound activities goal',
        meetings_target: 'Meetings goal',
        proposal_target: 'Proposals goal',
      };

      const preview = { field, value, label: fieldLabels[field] };

      if (!ctx.confirm) {
        return {
          success: false,
          data: null,
          error: 'Confirmation required to update sales target',
          needs_confirmation: true,
          preview,
          source: 'upsert_target',
        };
      }

      // Find or create the current month's target row
      const today = new Date();
      const startOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const endOfMonth = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

      const { data: existing, error: fetchErr } = await client
        .from('targets')
        .select('id')
        .eq('user_id', userId)
        .gte('start_date', startOfMonth)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchErr) {
        return { success: false, data: null, error: `Failed to look up targets: ${fetchErr.message}` };
      }

      if (existing?.id) {
        const { error: updateErr } = await client
          .from('targets')
          .update({ [field]: value })
          .eq('id', existing.id);
        if (updateErr) {
          return { success: false, data: null, error: `Failed to update target: ${updateErr.message}` };
        }
      } else {
        const { error: insertErr } = await client
          .from('targets')
          .insert({
            user_id: userId,
            revenue_target: 0,
            outbound_target: 0,
            meetings_target: 0,
            proposal_target: 0,
            start_date: startOfMonth,
            end_date: endOfMonth,
            [field]: value,
          });
        if (insertErr) {
          return { success: false, data: null, error: `Failed to create target: ${insertErr.message}` };
        }
      }

      return {
        success: true,
        data: {
          field,
          value,
          label: fieldLabels[field],
          message: `${fieldLabels[field]} updated to ${value}.`,
        },
        source: 'upsert_target',
      };
    }

    default:
      return { success: false, data: null, error: `Unknown action: ${String(action)}` };
  }
}

