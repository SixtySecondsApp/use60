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
    // Authenticate the caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing authorization header', req, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const token = authHeader.replace('Bearer ', '');
    const isServiceCall = token === supabaseServiceKey;

    let supabase;
    let userId: string | null = null;

    if (isServiceCall) {
      // Internal service-to-service call (e.g., from task-signal-processor)
      supabase = createClient(supabaseUrl, supabaseServiceKey);
    } else {
      // User JWT call
      supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: { Authorization: authHeader },
        },
      });

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        return errorResponse('Unauthorized', req, 401);
      }
      userId = user.id;
    }

    // Parse request body
    const body = await req.json();
    const { action, task_id, skill_key } = body;

    // Handle canvas refinement action — returns immediately, no task status update
    if (action === 'refine_canvas') {
      const { current_content, conversation_history, user_instruction } = body;

      if (!user_instruction) {
        return errorResponse('Missing user_instruction in request body', req, 400);
      }

      const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
      if (!apiKey) {
        return errorResponse('ANTHROPIC_API_KEY not configured', req, 500);
      }

      const messages: Array<{ role: string; content: string }> = [
        {
          role: 'user',
          content: `Here is the current draft:\n\n${current_content || '(empty)'}\n\nInstruction: ${user_instruction}`,
        },
      ];

      const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          system: `You are a sales writing assistant. The user has a draft deliverable (email, proposal, etc.) and wants you to refine it based on their instruction. Return ONLY the refined content, no explanations or preamble.`,
          messages,
        }),
      });

      if (!claudeResponse.ok) {
        const errText = await claudeResponse.text();
        return errorResponse(`Claude API error: ${claudeResponse.status} - ${errText}`, req, 500);
      }

      const claudeData = await claudeResponse.json();
      const refinedContent = claudeData.content?.[0]?.text || current_content;

      return jsonResponse({ content: refinedContent }, req);
    }

    if (!task_id) {
      return errorResponse('Missing task_id in request body', req, 400);
    }

    // Fetch the task
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select(
        'id, title, description, task_type, deliverable_type, deliverable_data, ai_status, assigned_to, company_id, deal_id, contact_id, contact_name, contact_email, meeting_id, metadata'
      )
      .eq('id', task_id)
      .maybeSingle();

    if (taskError) {
      return errorResponse(`Failed to fetch task: ${taskError.message}`, req, 500);
    }

    if (!task) {
      return errorResponse('Task not found', req, 404);
    }

    // Validate task belongs to user (skip for service calls)
    if (!isServiceCall && task.assigned_to !== userId) {
      return errorResponse('Task not assigned to you', req, 403);
    }

    // Update ai_status to 'working'
    const { error: updateWorkingError } = await supabase
      .from('tasks')
      .update({ ai_status: 'working', updated_at: new Date().toISOString() })
      .eq('id', task_id);

    if (updateWorkingError) {
      console.error('Failed to update ai_status to working:', updateWorkingError);
    }

    // Dispatch to handler based on skill_key (if provided) or deliverable_type
    let deliverableData: Record<string, unknown>;

    // Resolve organization_id for the task owner (used for skill lookup scoping)
    let orgId: string | null = null;
    if (task.assigned_to) {
      const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: membership } = await serviceClient
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', task.assigned_to)
        .limit(1)
        .maybeSingle();
      orgId = membership?.org_id ?? null;
    }

    // Pre-fetch context once for use in both the handler and metadata write-back
    const taskContext = await fetchTaskContext(supabase, task);

    try {
      if (skill_key) {
        // Skill-based execution path
        deliverableData = await handleSkillExecution(supabase, task, skill_key, orgId, taskContext);
      } else {
        // Legacy deliverable_type dispatch
        switch (task.deliverable_type) {
          case 'email_draft':
            deliverableData = await handleEmailDraft(supabase, task, taskContext);
            break;
          case 'research_brief':
            deliverableData = await handleResearchBrief(supabase, task, taskContext);
            break;
          case 'meeting_prep':
            deliverableData = await handleMeetingPrep(supabase, task, taskContext);
            break;
          case 'crm_update':
            deliverableData = await handleCrmUpdate(supabase, task, taskContext);
            break;
          case 'content_draft':
            deliverableData = await handleContentDraft(supabase, task, taskContext);
            break;
          case 'proposal':
            deliverableData = await handleProposalGeneration(supabase, task, taskContext);
            break;
          case 'follow_up':
            deliverableData = await handleFollowUpDraft(supabase, task, taskContext);
            break;
          default:
            return errorResponse(
              `Unknown deliverable_type: ${task.deliverable_type}`,
              req,
              400
            );
        }
      }

      // Build enriched metadata from the context that was used
      const enrichedMetadata = {
        ...(task.metadata || {}),
        enriched_at: new Date().toISOString(),
        meeting_context: taskContext.meeting
          ? {
              id: taskContext.meeting.id,
              title: taskContext.meeting.title,
              date: taskContext.meeting.start_time,
              summary: taskContext.meeting.summary,
              action_items: taskContext.meetingActionItems || [],
            }
          : null,
        contact_context: taskContext.contact
          ? {
              id: taskContext.contact.id,
              name: `${taskContext.contact.first_name} ${taskContext.contact.last_name}`,
              title: taskContext.contact.title,
              company: taskContext.contact.company_name,
              last_contacted_at: taskContext.contact.last_contacted_at,
              recent_activities: (taskContext.recentActivities || []).map((a: any) => ({
                type: a.activity_type,
                subject: a.subject,
                created_at: a.created_at,
              })),
            }
          : null,
        deal_context: taskContext.deal
          ? {
              id: taskContext.deal.id,
              name: taskContext.deal.name,
              value: taskContext.deal.value,
              expected_close_date: taskContext.deal.expected_close_date,
              priority: taskContext.deal.priority,
              risk_level: taskContext.deal.risk_level,
            }
          : null,
      };

      // Update task with deliverable data, status, and enriched metadata
      const { error: updateDraftError } = await supabase
        .from('tasks')
        .update({
          ai_status: 'draft_ready',
          deliverable_data: deliverableData,
          status: 'draft_ready',
          metadata: enrichedMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', task_id);

      if (updateDraftError) {
        throw new Error(`Failed to update task with draft: ${updateDraftError.message}`);
      }

      return jsonResponse(
        {
          success: true,
          task_id,
          deliverable_type: task.deliverable_type,
          ai_status: 'draft_ready',
        },
        req
      );
    } catch (handlerError) {
      // Update ai_status to 'failed' on handler error
      const { error: updateFailedError } = await supabase
        .from('tasks')
        .update({ ai_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', task_id);

      if (updateFailedError) {
        console.error('Failed to update ai_status to failed:', updateFailedError);
      }

      throw handlerError;
    }
  } catch (error) {
    console.error('Error in unified-task-ai-worker:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      req,
      500
    );
  }
});

// AI Helper Functions

async function callClaude(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    if (!data.content || !data.content[0] || !data.content[0].text) {
      throw new Error('Invalid response from Claude API');
    }

    return data.content[0].text;
  } catch (error) {
    console.error('Error calling Claude:', error);
    throw new Error(
      `Failed to generate AI content: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

interface TaskContext {
  deal?: any;
  contact?: any;
  company?: any;
  meeting?: any;
  transcript?: string;
  recentActivities?: any[];
  meetingActionItems?: any[];
}

async function fetchTaskContext(
  supabase: any,
  task: any
): Promise<TaskContext> {
  const context: TaskContext = {};

  try {
    // Fetch deal if present
    if (task.deal_id) {
      const { data: deal } = await supabase
        .from('deals')
        .select('id, name, stage_id, value, expected_close_date, notes, next_steps, priority, risk_level, owner_id, updated_at')
        .eq('id', task.deal_id)
        .maybeSingle();

      if (deal) {
        context.deal = deal;
      }
    }

    // Fetch contact if present
    if (task.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, phone, company_name, title, last_contacted_at, owner_id')
        .eq('id', task.contact_id)
        .maybeSingle();

      if (contact) {
        context.contact = contact;
      }

      // Fetch recent activities for the contact
      const { data: activities } = await supabase
        .from('activities')
        .select('id, activity_type, subject, created_at, notes')
        .eq('contact_id', task.contact_id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (activities && activities.length > 0) {
        context.recentActivities = activities;
      }
    }

    // Fetch company if present
    if (task.company_id) {
      const { data: company } = await supabase
        .from('companies')
        .select('id, name, domain, industry, size, description')
        .eq('id', task.company_id)
        .maybeSingle();

      if (company) {
        context.company = company;
      }
    }

    // Fetch meeting - check metadata first, then direct field
    const meetingId = task.metadata?.meeting_id || task.meeting_id;
    if (meetingId) {
      const { data: meeting } = await supabase
        .from('meetings')
        .select('id, title, start_time, end_time, owner_user_id, summary, summary_oneliner, sentiment_score, transcript_text')
        .eq('id', meetingId)
        .maybeSingle();

      if (meeting) {
        context.meeting = meeting;

        // Use transcript_text from the meetings table (truncated to 2000 chars)
        if (meeting.transcript_text) {
          context.transcript = meeting.transcript_text.substring(0, 2000);
        }

        // Fetch action items linked to the meeting
        const { data: actionItems } = await supabase
          .from('meeting_action_items')
          .select('id, title, description, assignee_name, due_date, status')
          .eq('meeting_id', meetingId)
          .limit(10);

        if (actionItems && actionItems.length > 0) {
          context.meetingActionItems = actionItems;
        }
      }
    }

    return context;
  } catch (error) {
    console.error('Error fetching task context:', error);
    return context; // Return partial context if some queries fail
  }
}

// Handler implementations

async function handleEmailDraft(
  supabase: any,
  task: any,
  context?: TaskContext
): Promise<Record<string, unknown>> {
  if (!context) context = await fetchTaskContext(supabase, task);

  const systemPrompt = `You are a professional sales email assistant. Generate personalized, concise follow-up emails that are:
- Professional yet warm in tone
- Clear and action-oriented
- Personalized based on context provided
- Under 200 words
- Formatted with a clear subject line and body

Return your response in this exact format:
SUBJECT: [subject line]
BODY: [email body]`;

  // Build context for the email
  const contactName = task.contact_name || context.contact?.first_name || 'there';
  const contactEmail = task.contact_email || context.contact?.email || '';

  let contextDetails = '';

  if (context.deal) {
    contextDetails += `\nDeal: ${context.deal.name} (Value: ${context.deal.value || 'N/A'})`;
    if (context.deal.expected_close_date) {
      contextDetails += ` — Expected Close: ${context.deal.expected_close_date}`;
    }
    if (context.deal.notes) {
      contextDetails += `\nDeal Notes: ${context.deal.notes}`;
    }
    if (context.deal.next_steps) {
      contextDetails += `\nNext Steps: ${context.deal.next_steps}`;
    }
  }

  if (context.contact) {
    contextDetails += `\nContact: ${context.contact.first_name} ${context.contact.last_name}`;
    if (context.contact.title) {
      contextDetails += ` - ${context.contact.title}`;
    }
    if (context.contact.company_name) {
      contextDetails += ` at ${context.contact.company_name}`;
    }
    if (context.contact.last_contacted_at) {
      contextDetails += `\nLast Contacted: ${context.contact.last_contacted_at}`;
    }
  }

  if (context.company) {
    contextDetails += `\nCompany: ${context.company.name}`;
    if (context.company.industry) {
      contextDetails += ` (Industry: ${context.company.industry})`;
    }
  }

  if (context.recentActivities && context.recentActivities.length > 0) {
    contextDetails += `\nRecent Activities: ${context.recentActivities.map((a: any) => `${a.activity_type}: ${a.subject}`).join(', ')}`;
  }

  if (context.meeting) {
    contextDetails += `\nRecent Meeting: ${context.meeting.title}`;
    if (context.meeting.summary) {
      contextDetails += `\nMeeting Summary: ${context.meeting.summary}`;
    }
  }

  if (context.meetingActionItems && context.meetingActionItems.length > 0) {
    contextDetails += `\nMeeting Action Items: ${context.meetingActionItems.map((ai: any) => ai.title).join(', ')}`;
  }

  if (context.transcript) {
    contextDetails += `\nMeeting Transcript (excerpt): ${context.transcript}${context.transcript.length >= 2000 ? '...' : ''}`;
  }

  const userPrompt = `Generate a professional follow-up email for:

Task: ${task.title}
Description: ${task.description || 'No additional description'}
Recipient: ${contactName} (${contactEmail})
${contextDetails}

The email should follow up on the task and move the conversation forward with clear next steps.`;

  const response = await callClaude(systemPrompt, userPrompt);

  // Parse the response to extract subject and body
  const subjectMatch = response.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
  const bodyMatch = response.match(/BODY:\s*([\s\S]+)/i);

  const subject = subjectMatch?.[1]?.trim() || `Follow-up: ${task.title}`;
  const body = bodyMatch?.[1]?.trim() || response;

  return {
    to: contactEmail,
    subject,
    body,
    generated_at: new Date().toISOString(),
  };
}

async function handleResearchBrief(
  supabase: any,
  task: any,
  context?: TaskContext
): Promise<Record<string, unknown>> {
  if (!context) context = await fetchTaskContext(supabase, task);

  const systemPrompt = `You are a business research analyst creating comprehensive research briefs for sales teams.

Analyze the provided context and create a structured research brief with multiple sections.

Return your response in this exact JSON format:
{
  "sections": [
    {
      "title": "Section Title",
      "content": "Detailed content for this section"
    }
  ],
  "sources": ["source 1", "source 2"]
}

Include sections like: Company Overview, Industry Context, Key Decision Makers, Recent Developments, Strategic Opportunities, Recommended Approach.`;

  let contextDetails = `Research Topic: ${task.title}\n`;

  if (task.description) {
    contextDetails += `Objective: ${task.description}\n`;
  }

  if (context.company) {
    contextDetails += `\n\nCompany Information:
- Name: ${context.company.name}
- Domain: ${context.company.domain || 'Unknown'}
- Industry: ${context.company.industry || 'Unknown'}
- Size: ${context.company.size || 'Unknown'}
- Description: ${context.company.description || 'No description available'}`;
  }

  if (context.contact) {
    contextDetails += `\n\nKey Contact:
- Name: ${context.contact.first_name} ${context.contact.last_name}
- Title: ${context.contact.title || 'Unknown'}
- Email: ${context.contact.email || 'Not available'}
- Company: ${context.contact.company_name || 'Unknown'}`;
    if (context.contact.last_contacted_at) {
      contextDetails += `\n- Last Contacted: ${context.contact.last_contacted_at}`;
    }
  }

  if (context.recentActivities && context.recentActivities.length > 0) {
    contextDetails += `\n\nRecent Activities:`;
    context.recentActivities.forEach((a: any) => {
      contextDetails += `\n- ${a.activity_type}: ${a.subject}`;
    });
  }

  if (context.deal) {
    contextDetails += `\n\nActive Opportunity:
- Deal: ${context.deal.name}
- Value: ${context.deal.value || 'Not specified'}
- Expected Close: ${context.deal.expected_close_date || 'Not set'}
- Priority: ${context.deal.priority || 'Not set'}
- Notes: ${context.deal.notes || 'None'}
- Next Steps: ${context.deal.next_steps || 'None'}`;
  }

  if (context.meeting) {
    contextDetails += `\n\nRecent Engagement:
- Meeting: ${context.meeting.title}
- Date: ${context.meeting.start_time}`;
    if (context.meeting.summary) {
      contextDetails += `\n- Summary: ${context.meeting.summary}`;
    }
  }

  if (context.meetingActionItems && context.meetingActionItems.length > 0) {
    contextDetails += `\n\nMeeting Action Items:`;
    context.meetingActionItems.forEach((ai: any) => {
      contextDetails += `\n- ${ai.title}${ai.assignee_name ? ` (${ai.assignee_name})` : ''}`;
    });
  }

  if (context.transcript) {
    contextDetails += `\n\nConversation Context:
${context.transcript}${context.transcript.length >= 2000 ? '...' : ''}`;
  }

  const userPrompt = `Create a comprehensive research brief based on the following context:

${contextDetails}

The brief should be actionable, insightful, and help the sales team understand the opportunity and develop an effective approach.`;

  const response = await callClaude(systemPrompt, userPrompt);

  // Parse JSON response
  let result;
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    } else {
      result = JSON.parse(response);
    }
  } catch (parseError) {
    console.error('Failed to parse research brief:', parseError);
    // Fallback structure
    result = {
      sections: [
        {
          title: 'Research Brief',
          content: response,
        },
      ],
      sources: ['Internal CRM data', 'Meeting transcripts'],
    };
  }

  return {
    ...result,
    generated_at: new Date().toISOString(),
  };
}

async function handleMeetingPrep(
  supabase: any,
  task: any,
  context?: TaskContext
): Promise<Record<string, unknown>> {
  if (!context) context = await fetchTaskContext(supabase, task);

  // Fetch past meetings for the same contact/deal
  let pastMeetings = [];
  if (task.contact_id || task.deal_id) {
    const query = supabase
      .from('meetings')
      .select('id, title, start_time, summary, transcript_text')
      .order('start_time', { ascending: false })
      .limit(3);

    if (task.deal_id) {
      const { data } = await query.eq('deal_id', task.deal_id);
      if (data) pastMeetings = data;
    } else if (task.contact_id) {
      // Search meetings by contact_id if available
      const { data } = await query.eq('contact_id', task.contact_id);
      if (data) pastMeetings = data;
    }
  }

  // Fetch calendar event if available
  let calendarEvent = null;
  const meetingId = task.metadata?.meeting_id || task.meeting_id;
  if (meetingId) {
    const { data } = await supabase
      .from('calendar_events')
      .select('id, title, start_time, end_time, attendees, location, description')
      .eq('meeting_id', meetingId)
      .maybeSingle();

    if (data) calendarEvent = data;
  }

  const systemPrompt = `You are an executive assistant preparing a comprehensive meeting brief.

Your task is to analyze all available context and create a strategic meeting preparation document.

Return your response in this exact JSON format:
{
  "brief": "2-3 paragraph executive summary of the meeting context and objectives",
  "talking_points": ["point 1", "point 2", "point 3"],
  "risks": ["risk 1", "risk 2"],
  "attendee_intel": {
    "attendee_name": "relevant background or notes about this person"
  }
}`;

  let contextDetails = `Meeting: ${task.title}\n`;

  if (task.description) {
    contextDetails += `Objective: ${task.description}\n`;
  }

  if (calendarEvent) {
    contextDetails += `\nScheduled: ${calendarEvent.start_time}`;
    if (calendarEvent.attendees && calendarEvent.attendees.length > 0) {
      contextDetails += `\nAttendees: ${calendarEvent.attendees.join(', ')}`;
    }
    if (calendarEvent.description) {
      contextDetails += `\nAgenda: ${calendarEvent.description}`;
    }
  }

  if (context.contact) {
    contextDetails += `\n\nPrimary Contact:
- Name: ${context.contact.first_name} ${context.contact.last_name}
- Title: ${context.contact.title || 'Unknown'}
- Company: ${context.contact.company_name || 'Unknown'}`;
    if (context.contact.last_contacted_at) {
      contextDetails += `\n- Last Contacted: ${context.contact.last_contacted_at}`;
    }
  }

  if (context.recentActivities && context.recentActivities.length > 0) {
    contextDetails += `\n\nRecent Activity History:`;
    context.recentActivities.forEach((a: any) => {
      contextDetails += `\n- ${a.activity_type}: ${a.subject}`;
    });
  }

  if (context.company) {
    contextDetails += `\n\nCompany Background:
- Name: ${context.company.name}
- Industry: ${context.company.industry || 'Unknown'}
- Size: ${context.company.size || 'Unknown'}
- Description: ${context.company.description || 'No description available'}`;
  }

  if (context.deal) {
    contextDetails += `\n\nActive Deal:
- Name: ${context.deal.name}
- Value: ${context.deal.value || 'Not specified'}
- Expected Close: ${context.deal.expected_close_date || 'Not set'}
- Priority: ${context.deal.priority || 'Not set'}
- Risk Level: ${context.deal.risk_level || 'Not assessed'}
- Notes: ${context.deal.notes || 'None'}
- Next Steps: ${context.deal.next_steps || 'None'}`;
  }

  if (pastMeetings.length > 0) {
    contextDetails += `\n\nPast Interactions:`;
    pastMeetings.forEach((meeting: Record<string, string>, idx: number) => {
      contextDetails += `\n${idx + 1}. ${meeting.title} (${meeting.start_time})`;
      if (meeting.summary) {
        contextDetails += `\n   Summary: ${meeting.summary}`;
      }
    });
  }

  if (context.meetingActionItems && context.meetingActionItems.length > 0) {
    contextDetails += `\n\nOpen Action Items from Last Meeting:`;
    context.meetingActionItems.forEach((ai: any) => {
      contextDetails += `\n- ${ai.title}${ai.assignee_name ? ` (${ai.assignee_name})` : ''}${ai.status ? ` [${ai.status}]` : ''}`;
    });
  }

  if (context.transcript) {
    contextDetails += `\n\nRecent Conversation Excerpt:
${context.transcript}${context.transcript.length >= 2000 ? '...' : ''}`;
  }

  const userPrompt = `Prepare a comprehensive meeting brief based on this context:

${contextDetails}

Focus on strategic talking points, potential risks to address, and any relevant intelligence about attendees that would help ensure a successful meeting.`;

  const response = await callClaude(systemPrompt, userPrompt);

  // Parse JSON response
  let result;
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    } else {
      result = JSON.parse(response);
    }
  } catch (parseError) {
    console.error('Failed to parse meeting prep:', parseError);
    // Fallback structure
    result = {
      brief: response,
      talking_points: ['Review agenda', 'Discuss objectives', 'Plan next steps'],
      risks: [],
      attendee_intel: {},
    };
  }

  return {
    ...result,
    generated_at: new Date().toISOString(),
  };
}

async function handleCrmUpdate(
  supabase: any,
  task: any,
  context?: TaskContext
): Promise<Record<string, unknown>> {
  if (!context) context = await fetchTaskContext(supabase, task);

  const systemPrompt = `You are a sales operations expert analyzing CRM data quality and suggesting updates based on recent interactions.

Analyze the provided context and suggest specific field updates with confidence scores.

Return your response as a JSON array of suggestions in this exact format:
[
  {
    "field": "field_name",
    "old_value": "current value or null",
    "new_value": "suggested new value",
    "confidence": 0.85,
    "reason": "Brief explanation for the suggestion"
  }
]

Focus on actionable updates like stage changes, priority adjustments, next steps, or data enrichment.`;

  let contextDetails = '';

  if (context.deal) {
    contextDetails += `\nCurrent Deal State:
- Name: ${context.deal.name}
- Value: ${context.deal.value || 'Not set'}
- Expected Close: ${context.deal.expected_close_date || 'Not set'}
- Priority: ${context.deal.priority || 'Not set'}
- Risk Level: ${context.deal.risk_level || 'Not assessed'}
- Notes: ${context.deal.notes || 'None'}
- Next Steps: ${context.deal.next_steps || 'None'}
- Last Updated: ${context.deal.updated_at}`;
  }

  if (context.contact) {
    contextDetails += `\n\nContact Information:
- Name: ${context.contact.first_name} ${context.contact.last_name}
- Email: ${context.contact.email || 'Not set'}
- Title: ${context.contact.title || 'Not set'}
- Company: ${context.contact.company_name || 'Not set'}
- Last Contacted: ${context.contact.last_contacted_at || 'Not recorded'}`;
  }

  if (context.recentActivities && context.recentActivities.length > 0) {
    contextDetails += `\n\nRecent Activities:`;
    context.recentActivities.forEach((a: any) => {
      contextDetails += `\n- ${a.activity_type}: ${a.subject}`;
      if (a.notes) contextDetails += ` — ${a.notes}`;
    });
  }

  if (context.company) {
    contextDetails += `\n\nCompany Information:
- Name: ${context.company.name}
- Industry: ${context.company.industry || 'Not set'}
- Size: ${context.company.size || 'Not set'}
- Description: ${context.company.description || 'None'}`;
  }

  if (context.meeting) {
    contextDetails += `\n\nRecent Meeting:
- Title: ${context.meeting.title}
- Date: ${context.meeting.start_time}
- Summary: ${context.meeting.summary || 'No summary available'}`;
  }

  if (context.meetingActionItems && context.meetingActionItems.length > 0) {
    contextDetails += `\n\nOpen Action Items:`;
    context.meetingActionItems.forEach((ai: any) => {
      contextDetails += `\n- ${ai.title}${ai.status ? ` [${ai.status}]` : ''}`;
    });
  }

  if (context.transcript) {
    contextDetails += `\n\nMeeting Transcript (excerpt):
${context.transcript}${context.transcript.length >= 2000 ? '...' : ''}`;
  }

  const userPrompt = `Based on the following CRM data and recent interactions, suggest specific field updates:

Task Context: ${task.title}
Description: ${task.description || 'No description'}
${contextDetails}

Analyze this information and suggest CRM updates that would improve data quality and reflect the current state of the relationship.`;

  const response = await callClaude(systemPrompt, userPrompt);

  // Parse JSON from response
  let suggestions = [];
  try {
    // Try to extract JSON array from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      suggestions = JSON.parse(jsonMatch[0]);
    } else {
      // Fallback: try parsing the whole response
      suggestions = JSON.parse(response);
    }
  } catch (parseError) {
    console.error('Failed to parse CRM suggestions:', parseError);
    // Return a generic suggestion if parsing fails
    suggestions = [
      {
        field: 'notes',
        old_value: context.deal?.notes || null,
        new_value: 'AI analysis completed - review recommended',
        confidence: 0.5,
        reason: 'Unable to generate specific suggestions from context',
      },
    ];
  }

  const entityType = task.deal_id ? 'deal' : task.contact_id ? 'contact' : 'company';
  const entityId = task.deal_id || task.contact_id || task.company_id;

  return {
    suggestions,
    entity_type: entityType,
    entity_id: entityId,
    generated_at: new Date().toISOString(),
  };
}

async function handleContentDraft(
  supabase: any,
  task: any,
  context?: TaskContext
): Promise<Record<string, unknown>> {
  if (!context) context = await fetchTaskContext(supabase, task);

  const systemPrompt = `You are a professional content writer specializing in business and sales content.

Create high-quality content based on the provided requirements and context. The content should be:
- Well-structured and engaging
- Appropriate for the intended audience
- Action-oriented and valuable
- Formatted in clean markdown

Return ONLY the content itself in markdown format. Do not include any JSON wrapping or metadata.`;

  let contextDetails = `Content Request: ${task.title}\n`;

  if (task.description) {
    contextDetails += `Requirements: ${task.description}\n`;
  }

  if (context.deal) {
    contextDetails += `\nRelated Deal:
- Name: ${context.deal.name}
- Stage: ${context.deal.stage_id || 'Unknown'}
- Value: ${context.deal.value || 'Not specified'}`;
  }

  if (context.contact) {
    contextDetails += `\n\nTarget Audience:
- Contact: ${context.contact.first_name} ${context.contact.last_name}
- Title: ${context.contact.title || 'Unknown'}
- Company: ${context.contact.company_name || 'Unknown'}`;
  }

  if (context.company) {
    contextDetails += `\n\nCompany Context:
- Name: ${context.company.name}
- Industry: ${context.company.industry || 'Unknown'}
- Description: ${context.company.description || 'No description available'}`;
  }

  if (context.meeting) {
    contextDetails += `\n\nRecent Discussion:
- Meeting: ${context.meeting.title}`;
    if (context.meeting.summary) {
      contextDetails += `\n- Summary: ${context.meeting.summary}`;
    }
  }

  if (context.transcript) {
    contextDetails += `\n\nConversation Reference:
${context.transcript}${context.transcript.length >= 2000 ? '...' : ''}`;
  }

  const userPrompt = `Create content based on the following context:

${contextDetails}

The content should be professional, engaging, and tailored to the context provided. Use appropriate headings, bullet points, and formatting to make it easy to read and actionable.`;

  const content = await callClaude(systemPrompt, userPrompt);

  return {
    content,
    format: 'markdown',
    generated_at: new Date().toISOString(),
  };
}

async function handleProposalGeneration(
  supabase: any,
  task: any,
  context?: TaskContext
): Promise<Record<string, unknown>> {
  if (!context) context = await fetchTaskContext(supabase, task);

  const systemPrompt = `You are a professional B2B sales proposal writer. Generate a comprehensive, well-structured proposal based on the provided context.

The proposal should include:
- Executive Summary
- Understanding of Client Needs (based on meeting notes and deal context)
- Proposed Solution
- Key Benefits and ROI
- Pricing/Investment section (use placeholder ranges if no specific pricing available)
- Timeline and Next Steps
- Terms and Conditions (brief)

Format the proposal in clean markdown. Be professional, specific to the client, and action-oriented.
Keep total length under 1500 words.`;

  let contextDetails = `Proposal for: ${task.title}\n`;
  if (task.description) contextDetails += `Description: ${task.description}\n`;

  if (context.deal) {
    contextDetails += `\nDeal Information:\n- Name: ${context.deal.name}\n- Value: ${context.deal.value || 'TBD'}\n- Expected Close: ${context.deal.expected_close_date || 'TBD'}`;
    if (context.deal.notes) contextDetails += `\n- Notes: ${context.deal.notes}`;
    if (context.deal.next_steps) contextDetails += `\n- Next Steps: ${context.deal.next_steps}`;
  }

  if (context.contact) {
    contextDetails += `\n\nClient Contact:\n- Name: ${context.contact.first_name} ${context.contact.last_name}`;
    if (context.contact.title) contextDetails += `\n- Title: ${context.contact.title}`;
    if (context.contact.company_name) contextDetails += `\n- Company: ${context.contact.company_name}`;
  }

  if (context.company) {
    contextDetails += `\n\nCompany:\n- Name: ${context.company.name}`;
    if (context.company.industry) contextDetails += `\n- Industry: ${context.company.industry}`;
    if (context.company.size) contextDetails += `\n- Size: ${context.company.size}`;
  }

  if (context.meeting) {
    contextDetails += `\n\nRecent Meeting: ${context.meeting.title}`;
    if (context.meeting.summary) contextDetails += `\nMeeting Summary: ${context.meeting.summary}`;
  }

  if (context.meetingActionItems && context.meetingActionItems.length > 0) {
    contextDetails += `\n\nAction Items from Meeting:\n${context.meetingActionItems.map((ai: any) => `- ${ai.title}`).join('\n')}`;
  }

  if (context.transcript) {
    contextDetails += `\n\nMeeting Transcript (excerpt): ${context.transcript}`;
  }

  const response = await callClaude(systemPrompt, contextDetails);
  return {
    content: response,
    generated_at: new Date().toISOString(),
  };
}

async function handleFollowUpDraft(
  supabase: any,
  task: any,
  context?: TaskContext
): Promise<Record<string, unknown>> {
  if (!context) context = await fetchTaskContext(supabase, task);

  const systemPrompt = `You are a professional sales follow-up email writer. Draft a concise, personalized follow-up email after a meeting or interaction.

The email should:
- Reference specific topics discussed in the meeting
- Summarize key action items and commitments
- Propose clear next steps with dates
- Be warm but professional
- Be under 200 words
- Include a clear call-to-action

Return your response in this exact format:
SUBJECT: [subject line]
BODY: [email body]`;

  const contactName = task.contact_name || context.contact?.first_name || 'there';
  const contactEmail = task.contact_email || context.contact?.email || '';

  let contextDetails = `Follow-up for: ${task.title}\nRecipient: ${contactName} (${contactEmail})\n`;

  if (context.meeting) {
    contextDetails += `\nMeeting: ${context.meeting.title}`;
    if (context.meeting.start_time) {
      contextDetails += ` (${new Date(context.meeting.start_time).toLocaleDateString()})`;
    }
    if (context.meeting.summary) contextDetails += `\nMeeting Summary: ${context.meeting.summary}`;
  }

  if (context.meetingActionItems && context.meetingActionItems.length > 0) {
    contextDetails += `\n\nAction Items:\n${context.meetingActionItems.map((ai: any) => `- ${ai.title}${ai.assignee_name ? ` (${ai.assignee_name})` : ''}${ai.due_date ? ` - due ${ai.due_date}` : ''}`).join('\n')}`;
  }

  if (context.transcript) {
    contextDetails += `\n\nMeeting Transcript (excerpt): ${context.transcript}`;
  }

  if (context.deal) {
    contextDetails += `\n\nDeal: ${context.deal.name}`;
    if (context.deal.next_steps) contextDetails += `\nAgreed Next Steps: ${context.deal.next_steps}`;
  }

  const response = await callClaude(systemPrompt, contextDetails);

  const subjectMatch = response.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
  const bodyMatch = response.match(/BODY:\s*([\s\S]+)/i);

  return {
    to: contactEmail,
    subject: subjectMatch?.[1]?.trim() || `Follow-up: ${task.title}`,
    body: bodyMatch?.[1]?.trim() || response,
    generated_at: new Date().toISOString(),
  };
}

// Skill-based execution handler

async function handleSkillExecution(
  supabase: any,
  task: any,
  skillKey: string,
  orgId: string | null,
  context?: TaskContext
): Promise<Record<string, unknown>> {
  if (!orgId) {
    throw new Error(`Cannot fetch skill "${skillKey}": organization not found for task owner`);
  }
  // Fetch the skill content from organization_skills, scoped to the task owner's org
  const { data: skills, error: skillError } = await supabase
    .from('organization_skills')
    .select('skill_key, frontmatter, content')
    .eq('skill_key', skillKey)
    .eq('organization_id', orgId)
    .eq('is_enabled', true)
    .limit(1);

  if (skillError) {
    throw new Error(`Failed to fetch skill "${skillKey}": ${skillError.message}`);
  }

  const skill = skills?.[0];
  if (!skill) {
    throw new Error(`Skill "${skillKey}" not found or not enabled`);
  }

  // Use pre-fetched context if provided, otherwise fetch it
  if (!context) context = await fetchTaskContext(supabase, task);

  // Build the user prompt from task + context
  let contextDetails = `Task: ${task.title}\n`;
  if (task.description) {
    contextDetails += `Description: ${task.description}\n`;
  }

  if (context.contact) {
    contextDetails += `\nContact: ${context.contact.first_name} ${context.contact.last_name}`;
    if (context.contact.title) contextDetails += ` - ${context.contact.title}`;
    if (context.contact.company_name) contextDetails += ` at ${context.contact.company_name}`;
    if (context.contact.email) contextDetails += `\nEmail: ${context.contact.email}`;
    if (context.contact.last_contacted_at) contextDetails += `\nLast Contacted: ${context.contact.last_contacted_at}`;
  }

  if (context.recentActivities && context.recentActivities.length > 0) {
    contextDetails += `\n\nRecent Activities: ${context.recentActivities.map((a: any) => `${a.activity_type}: ${a.subject}`).join(', ')}`;
  }

  if (context.company) {
    contextDetails += `\n\nCompany: ${context.company.name}`;
    if (context.company.industry) contextDetails += ` (${context.company.industry})`;
    if (context.company.description) contextDetails += `\nDescription: ${context.company.description}`;
  }

  if (context.deal) {
    contextDetails += `\n\nDeal: ${context.deal.name}`;
    if (context.deal.value) contextDetails += `\nValue: ${context.deal.value}`;
    if (context.deal.expected_close_date) contextDetails += `\nExpected Close: ${context.deal.expected_close_date}`;
    if (context.deal.priority) contextDetails += `\nPriority: ${context.deal.priority}`;
    if (context.deal.notes) contextDetails += `\nNotes: ${context.deal.notes}`;
    if (context.deal.next_steps) contextDetails += `\nNext Steps: ${context.deal.next_steps}`;
  }

  if (context.meeting) {
    contextDetails += `\n\nMeeting: ${context.meeting.title}`;
    if (context.meeting.summary) contextDetails += `\nSummary: ${context.meeting.summary}`;
  }

  if (context.meetingActionItems && context.meetingActionItems.length > 0) {
    contextDetails += `\n\nMeeting Action Items: ${context.meetingActionItems.map((ai: any) => ai.title).join(', ')}`;
  }

  if (context.transcript) {
    contextDetails += `\n\nTranscript excerpt:\n${context.transcript}${context.transcript.length >= 2000 ? '...' : ''}`;
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Use the skill content as system prompt, task context as user prompt
  const systemPrompt = `${skill.content}\n\nTODAY'S DATE: ${today}`;
  const userPrompt = `Execute this skill for the following task and context:\n\n${contextDetails}`;

  const response = await callClaude(systemPrompt, userPrompt);

  return {
    content: response,
    format: 'markdown',
    skill_key: skillKey,
    skill_name: (skill.frontmatter as Record<string, unknown>)?.name || skillKey,
    generated_at: new Date().toISOString(),
  };
}
