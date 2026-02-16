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
    const { task_id } = await req.json();

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

    // Dispatch to handler based on deliverable_type
    let deliverableData: Record<string, unknown>;

    try {
      switch (task.deliverable_type) {
        case 'email_draft':
          deliverableData = await handleEmailDraft(supabase, task);
          break;
        case 'research_brief':
          deliverableData = await handleResearchBrief(supabase, task);
          break;
        case 'meeting_prep':
          deliverableData = await handleMeetingPrep(supabase, task);
          break;
        case 'crm_update':
          deliverableData = await handleCrmUpdate(supabase, task);
          break;
        case 'content_draft':
          deliverableData = await handleContentDraft(supabase, task);
          break;
        default:
          return errorResponse(
            `Unknown deliverable_type: ${task.deliverable_type}`,
            req,
            400
          );
      }

      // Update task with deliverable data and status
      const { error: updateDraftError } = await supabase
        .from('tasks')
        .update({
          ai_status: 'draft_ready',
          deliverable_data: deliverableData,
          status: 'draft_ready',
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
        .select('id, title, stage, value, owner_id, created_at, updated_at, notes')
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
        .select('id, first_name, last_name, email, phone, company, title, owner_id')
        .eq('id', task.contact_id)
        .maybeSingle();

      if (contact) {
        context.contact = contact;
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
        .select('id, title, start_time, end_time, owner_user_id, summary, transcript')
        .eq('id', meetingId)
        .maybeSingle();

      if (meeting) {
        context.meeting = meeting;

        // Try to get transcript from meeting_transcripts table if not in meeting
        if (!meeting.transcript) {
          const { data: transcriptData } = await supabase
            .from('meeting_transcripts')
            .select('transcript')
            .eq('meeting_id', meetingId)
            .maybeSingle();

          if (transcriptData?.transcript) {
            context.transcript = transcriptData.transcript;
          }
        } else {
          context.transcript = meeting.transcript;
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
  task: any
): Promise<Record<string, unknown>> {
  const context = await fetchTaskContext(supabase, task);

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
    contextDetails += `\nDeal: ${context.deal.title} (Stage: ${context.deal.stage}, Value: ${context.deal.value || 'N/A'})`;
    if (context.deal.notes) {
      contextDetails += `\nDeal Notes: ${context.deal.notes}`;
    }
  }

  if (context.contact) {
    contextDetails += `\nContact: ${context.contact.first_name} ${context.contact.last_name}`;
    if (context.contact.title) {
      contextDetails += ` - ${context.contact.title}`;
    }
    if (context.contact.company) {
      contextDetails += ` at ${context.contact.company}`;
    }
  }

  if (context.company) {
    contextDetails += `\nCompany: ${context.company.name}`;
    if (context.company.industry) {
      contextDetails += ` (Industry: ${context.company.industry})`;
    }
  }

  if (context.meeting) {
    contextDetails += `\nRecent Meeting: ${context.meeting.title}`;
    if (context.meeting.summary) {
      contextDetails += `\nMeeting Summary: ${context.meeting.summary}`;
    }
  }

  if (context.transcript) {
    const truncatedTranscript = context.transcript.substring(0, 1000);
    contextDetails += `\nMeeting Transcript (excerpt): ${truncatedTranscript}${context.transcript.length > 1000 ? '...' : ''}`;
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
  task: any
): Promise<Record<string, unknown>> {
  const context = await fetchTaskContext(supabase, task);

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
- Company: ${context.contact.company || 'Unknown'}`;
  }

  if (context.deal) {
    contextDetails += `\n\nActive Opportunity:
- Deal: ${context.deal.title}
- Stage: ${context.deal.stage}
- Value: ${context.deal.value || 'Not specified'}
- Notes: ${context.deal.notes || 'None'}`;
  }

  if (context.meeting) {
    contextDetails += `\n\nRecent Engagement:
- Meeting: ${context.meeting.title}
- Date: ${context.meeting.start_time}`;
    if (context.meeting.summary) {
      contextDetails += `\n- Summary: ${context.meeting.summary}`;
    }
  }

  if (context.transcript) {
    const truncatedTranscript = context.transcript.substring(0, 1500);
    contextDetails += `\n\nConversation Context:
${truncatedTranscript}${context.transcript.length > 1500 ? '...' : ''}`;
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
  task: any
): Promise<Record<string, unknown>> {
  const context = await fetchTaskContext(supabase, task);

  // Fetch past meetings for the same contact/deal
  let pastMeetings = [];
  if (task.contact_id || task.deal_id) {
    const query = supabase
      .from('meetings')
      .select('id, title, start_time, summary, transcript')
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
- Company: ${context.contact.company || 'Unknown'}`;
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
- Title: ${context.deal.title}
- Stage: ${context.deal.stage}
- Value: ${context.deal.value || 'Not specified'}
- Notes: ${context.deal.notes || 'None'}`;
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

  if (context.transcript) {
    const truncatedTranscript = context.transcript.substring(0, 1000);
    contextDetails += `\n\nRecent Conversation Excerpt:
${truncatedTranscript}${context.transcript.length > 1000 ? '...' : ''}`;
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
  task: any
): Promise<Record<string, unknown>> {
  const context = await fetchTaskContext(supabase, task);

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
- Title: ${context.deal.title}
- Stage: ${context.deal.stage}
- Value: ${context.deal.value || 'Not set'}
- Notes: ${context.deal.notes || 'None'}
- Last Updated: ${context.deal.updated_at}`;
  }

  if (context.contact) {
    contextDetails += `\n\nContact Information:
- Name: ${context.contact.first_name} ${context.contact.last_name}
- Email: ${context.contact.email || 'Not set'}
- Title: ${context.contact.title || 'Not set'}
- Company: ${context.contact.company || 'Not set'}`;
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

  if (context.transcript) {
    const truncatedTranscript = context.transcript.substring(0, 1500);
    contextDetails += `\n\nMeeting Transcript (excerpt):
${truncatedTranscript}${context.transcript.length > 1500 ? '...' : ''}`;
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
  task: any
): Promise<Record<string, unknown>> {
  const context = await fetchTaskContext(supabase, task);

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
- Title: ${context.deal.title}
- Stage: ${context.deal.stage}
- Value: ${context.deal.value || 'Not specified'}`;
  }

  if (context.contact) {
    contextDetails += `\n\nTarget Audience:
- Contact: ${context.contact.first_name} ${context.contact.last_name}
- Title: ${context.contact.title || 'Unknown'}
- Company: ${context.contact.company || 'Unknown'}`;
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
    const truncatedTranscript = context.transcript.substring(0, 1000);
    contextDetails += `\n\nConversation Reference:
${truncatedTranscript}${context.transcript.length > 1000 ? '...' : ''}`;
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
