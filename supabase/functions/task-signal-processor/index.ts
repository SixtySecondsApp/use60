import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  try {
    // Validate caller — this function should only be called by internal services
    // (orchestrator, webhooks, cron jobs) using the service role key
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Allow service role key or anon key (for internal function-to-function calls)
    const token = authHeader?.replace('Bearer ', '');
    if (token !== supabaseServiceKey && token !== supabaseAnonKey) {
      // If not a service key, try to validate as a user JWT
      const testClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader || '' } },
      });
      const { error: authError } = await testClient.auth.getUser();
      if (authError) {
        return errorResponse('Unauthorized', req, 401);
      }
    }

    // Parse request body
    const { signal_type, data, user_id } = await req.json();

    if (!signal_type || !data || !user_id) {
      return errorResponse(
        'Missing required fields: signal_type, data, user_id',
        req,
        400
      );
    }

    // Validate signal_type
    const validSignalTypes = [
      'meeting_ended',
      'deal_stale',
      'calendar_approaching',
      'email_received',
      'close_date_approaching',
      'proposal_stale',
      'thread_dormant',
      'buyer_commitment_due',
      'verbal_commitment_detected',
      'meeting_no_show',
    ];

    if (!validSignalTypes.includes(signal_type)) {
      return errorResponse(
        `Invalid signal_type. Must be one of: ${validSignalTypes.join(', ')}`,
        req,
        400
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Create task with appropriate defaults based on signal type
    let taskData: Record<string, unknown> = {
      assigned_to: user_id,
      created_by: user_id,
      status: 'pending_review',
      source: signal_type,
      trigger_event: signal_type,
      metadata: {
        signal_data: data,
        signal_timestamp: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    switch (signal_type) {
      case 'meeting_ended':
        taskData = {
          ...taskData,
          source: 'meeting_transcript',
          task_type: 'follow_up',
          deliverable_type: 'email_draft',
          title: data.meeting_title
            ? `Follow up on ${data.meeting_title}`
            : 'Meeting follow-up',
          description: data.summary || 'Follow up on recent meeting',
          ai_status: 'queued',
          risk_level: 'low',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
          ...(data.meeting_id && { meeting_id: data.meeting_id }),
          ...(data.contact_id && { contact_id: data.contact_id }),
          ...(data.deal_id && { deal_id: data.deal_id }),
          ...(data.company_id && { company_id: data.company_id }),
        };
        break;

      case 'deal_stale':
        taskData = {
          ...taskData,
          source: 'deal_signal',
          task_type: 'follow_up',
          deliverable_type: 'action_plan',
          title: data.deal_name
            ? `Re-engage on ${data.deal_name}`
            : 'Re-engage stale deal',
          description: `Deal has been inactive for ${data.days_inactive || 'several'} days`,
          ai_status: 'queued',
          risk_level: 'high',
          expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days
          ...(data.deal_id && { deal_id: data.deal_id }),
          ...(data.contact_id && { contact_id: data.contact_id }),
          ...(data.company_id && { company_id: data.company_id }),
        };
        break;

      case 'calendar_approaching':
        taskData = {
          ...taskData,
          source: 'calendar_trigger',
          task_type: 'meeting_prep',
          deliverable_type: 'meeting_prep',
          title: data.event_title
            ? `Prepare for ${data.event_title}`
            : 'Meeting preparation',
          description: data.description || 'Prepare for upcoming meeting',
          ai_status: 'queued',
          risk_level: 'medium',
          due_date: data.event_start_time,
          expires_at: data.event_start_time, // Expires when meeting starts
          ...(data.calendar_event_id && { calendar_event_id: data.calendar_event_id }),
          ...(data.contact_id && { contact_id: data.contact_id }),
          ...(data.deal_id && { deal_id: data.deal_id }),
          ...(data.company_id && { company_id: data.company_id }),
        };
        break;

      case 'email_received':
        taskData = {
          ...taskData,
          source: 'email_detected',
          task_type: 'email',
          deliverable_type: 'email_draft',
          title: data.email_subject
            ? `Respond to: ${data.email_subject}`
            : 'Email response',
          description: data.detected_intent || 'Respond to email',
          ai_status: 'queued',
          risk_level: 'low',
          expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days
          ...(data.email_id && { email_id: data.email_id }),
          ...(data.contact_id && { contact_id: data.contact_id }),
          ...(data.deal_id && { deal_id: data.deal_id }),
          ...(data.company_id && { company_id: data.company_id }),
        };
        break;

      case 'close_date_approaching':
        taskData = {
          ...taskData,
          source: 'deal_signal',
          task_type: 'follow_up',
          deliverable_type: 'email_draft',
          title: data.deal_name ? `Chase decision on ${data.deal_name}` : 'Chase deal decision',
          description: `Deal close date is ${data.days_until_close || 'approaching'} days away. Time to push for a decision.`,
          ai_status: 'queued',
          risk_level: 'high',
          expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          ...(data.deal_id && { deal_id: data.deal_id }),
          ...(data.contact_id && { contact_id: data.contact_id }),
          ...(data.company_id && { company_id: data.company_id }),
        };
        break;

      case 'proposal_stale':
        taskData = {
          ...taskData,
          source: 'deal_signal',
          task_type: 'follow_up',
          deliverable_type: 'email_draft',
          title: data.proposal_title ? `Follow up on ${data.proposal_title}` : 'Follow up on proposal',
          description: `Proposal sent ${data.days_since_sent || 'several'} days ago with no response.`,
          ai_status: 'queued',
          risk_level: 'medium',
          expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          ...(data.deal_id && { deal_id: data.deal_id }),
          ...(data.contact_id && { contact_id: data.contact_id }),
          ...(data.company_id && { company_id: data.company_id }),
        };
        break;

      case 'thread_dormant':
        taskData = {
          ...taskData,
          source: 'email_detected',
          task_type: 'follow_up',
          deliverable_type: 'email_draft',
          title: data.contact_name ? `Re-engage ${data.contact_name}` : 'Re-engage quiet prospect',
          description: `Email thread has been dormant for ${data.days_dormant || 'several'} days.`,
          ai_status: 'queued',
          risk_level: 'medium',
          expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          ...(data.deal_id && { deal_id: data.deal_id }),
          ...(data.contact_id && { contact_id: data.contact_id }),
          ...(data.company_id && { company_id: data.company_id }),
        };
        break;

      case 'buyer_commitment_due':
        taskData = {
          ...taskData,
          source: 'meeting_transcript',
          task_type: 'follow_up',
          deliverable_type: 'email_draft',
          title: data.contact_name
            ? `Nudge ${data.contact_name} on ${data.commitment || 'commitment'}`
            : 'Follow up on buyer commitment',
          description: data.commitment || 'Buyer action item is past due date.',
          ai_status: 'queued',
          risk_level: 'high',
          expires_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          ...(data.deal_id && { deal_id: data.deal_id }),
          ...(data.contact_id && { contact_id: data.contact_id }),
          ...(data.meeting_id && { meeting_id: data.meeting_id }),
        };
        break;

      case 'verbal_commitment_detected':
        taskData = {
          ...taskData,
          source: 'meeting_transcript',
          task_type: 'follow_up',
          deliverable_type: 'email_draft',
          title: data.contact_name
            ? `Confirm verbal agreement with ${data.contact_name}`
            : 'Confirm verbal commitment',
          description: data.commitment_detail || 'High-confidence buying signal detected in meeting.',
          ai_status: 'queued',
          risk_level: 'high',
          expires_at: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
          ...(data.deal_id && { deal_id: data.deal_id }),
          ...(data.contact_id && { contact_id: data.contact_id }),
          ...(data.meeting_id && { meeting_id: data.meeting_id }),
        };
        break;

      case 'meeting_no_show':
        taskData = {
          ...taskData,
          source: 'calendar_trigger',
          task_type: 'follow_up',
          deliverable_type: 'email_draft',
          title: data.contact_name
            ? `Reschedule with ${data.contact_name}`
            : 'Reschedule no-show meeting',
          description: data.meeting_title
            ? `${data.contact_name || 'Prospect'} did not attend "${data.meeting_title}". Draft a reschedule email.`
            : 'Meeting attendee did not show up. Draft a reschedule email.',
          ai_status: 'queued',
          risk_level: 'medium',
          expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          ...(data.deal_id && { deal_id: data.deal_id }),
          ...(data.contact_id && { contact_id: data.contact_id }),
          ...(data.meeting_id && { meeting_id: data.meeting_id }),
          ...(data.company_id && { company_id: data.company_id }),
        };
        break;
    }

    // Insert the task
    const { data: createdTask, error: insertError } = await supabase
      .from('tasks')
      .insert(taskData)
      .select(
        'id, title, description, task_type, deliverable_type, status, ai_status, source, created_at'
      )
      .single();

    if (insertError) {
      throw new Error(`Failed to create task: ${insertError.message}`);
    }

    // Optionally trigger the AI worker if the task has a deliverable_type
    if (createdTask.deliverable_type) {
      // Trigger AI worker asynchronously (fire and forget)
      // Use the service role key since this is an internal server-to-server call
      const workerUrl = `${supabaseUrl}/functions/v1/unified-task-ai-worker`;

      fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ task_id: createdTask.id }),
      }).catch((error) => {
        console.error('Failed to trigger AI worker:', error);
      });
    }

    return jsonResponse(
      {
        success: true,
        task: createdTask,
        ai_worker_triggered: !!createdTask.deliverable_type,
      },
      req,
      201
    );
  } catch (error) {
    console.error('Error in task-signal-processor:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      req,
      500
    );
  }
});
