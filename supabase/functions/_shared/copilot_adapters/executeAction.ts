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
  params: Record<string, unknown>
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
      const authHeader = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/copilot-dynamic-table`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({
            query: params.query ? String(params.query) : '',
            title: params.title ? String(params.title) : undefined,
            person_titles: params.person_titles,
            person_locations: params.person_locations,
            organization_num_employees_ranges: params.organization_num_employees_ranges,
            person_seniorities: params.person_seniorities,
          }),
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          return { success: false, data: null, error: `Dynamic table creation failed: ${errBody}` };
        }

        const result = await resp.json();
        return { success: true, data: result };
      } catch (e: any) {
        return { success: false, data: null, error: e?.message || 'Failed to create dynamic table' };
      }
    }

    case 'enrich_table_column': {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const authHeader = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/enrich-dynamic-table`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
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

    default:
      return { success: false, data: null, error: `Unknown action: ${String(action)}` };
  }
}

