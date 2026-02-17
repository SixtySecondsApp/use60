/**
 * Slack Notification Prompts
 *
 * AI prompts for generating Slack notification content including
 * meeting debriefs, daily digests, meeting prep, and task suggestions.
 *
 * @category Slack Notifications
 * @model claude-haiku-4-5-20251001 (fast, efficient for notifications)
 * @temperature 0.5 (balanced creativity with consistency)
 */

import type { PromptTemplate, PromptVariable } from './index';

// ============================================================================
// Meeting Debrief Prompt
// ============================================================================

export const SLACK_MEETING_DEBRIEF_SYSTEM_PROMPT = `You are a sales meeting analyst creating concise Slack notifications for sales teams.

Your goal is to provide an actionable meeting summary that helps:
1. Sales managers quickly understand meeting outcomes without watching recordings
2. Sales reps get immediate coaching feedback
3. Teams stay aligned on deal progress

Focus on:
- Brevity - This goes to Slack, keep it scannable
- Action-orientation - Emphasize what needs to happen next
- Insight - Surface things humans might miss
- Positivity in coaching - Frame feedback constructively

Return ONLY valid JSON with no additional text.`;

export const SLACK_MEETING_DEBRIEF_USER_PROMPT = `Analyze this sales meeting and provide a Slack-ready summary:

MEETING: \${meetingTitle}
ATTENDEES: \${attendees}
DURATION: \${duration} minutes
DEAL: \${dealName} (Stage: \${dealStage}, Value: \${dealValue})

TRANSCRIPT:
\${transcript}

Return your analysis as JSON with this exact structure:
{
  "summary": "2-3 sentence summary of the meeting - focus on outcomes and next steps",
  "sentiment": "positive" | "neutral" | "challenging",
  "sentimentScore": 0-100,
  "talkTimeRep": 0-100,
  "talkTimeCustomer": 0-100,
  "actionItems": [
    {
      "task": "Specific, actionable task description",
      "suggestedOwner": "Name or role of who should do this",
      "dueInDays": 1-14
    }
  ],
  "coachingInsight": "One specific, constructive tip for the sales rep based on this call",
  "keyQuotes": ["Notable quote from the customer that reveals intent or concerns"]
}

Guidelines:
- Keep summary under 3 sentences
- actionItems should be 2-4 concrete tasks extracted from the meeting
- coachingInsight should be specific and actionable (e.g., "Consider asking about budget earlier - it came up late")
- sentiment: "positive" = buying signals present, "challenging" = objections/concerns, "neutral" = informational
- Talk time: estimate based on who spoke more. Ideal is 30-40% rep.`;

export const SLACK_MEETING_DEBRIEF_VARIABLES: PromptVariable[] = [
  {
    name: 'meetingTitle',
    description: 'Title of the meeting',
    type: 'string',
    required: true,
    example: 'Discovery Call - Acme Corp',
    source: 'meetings',
  },
  {
    name: 'attendees',
    description: 'List of attendees',
    type: 'string',
    required: true,
    example: 'John Smith (CEO), Sarah Johnson (Rep)',
    source: 'meetings',
  },
  {
    name: 'duration',
    description: 'Meeting duration in minutes',
    type: 'number',
    required: true,
    example: '32',
    source: 'meetings',
  },
  {
    name: 'dealName',
    description: 'Name of the associated deal',
    type: 'string',
    required: false,
    example: 'Acme Corp - Enterprise License',
    source: 'deals',
  },
  {
    name: 'dealStage',
    description: 'Current deal stage',
    type: 'string',
    required: false,
    example: 'Opportunity',
    source: 'deals',
  },
  {
    name: 'dealValue',
    description: 'Deal value',
    type: 'string',
    required: false,
    example: '$50,000',
    source: 'deals',
  },
  {
    name: 'transcript',
    description: 'Full meeting transcript',
    type: 'string',
    required: true,
    example: '[Transcript content...]',
    source: 'meetings',
  },
];

export const SLACK_MEETING_DEBRIEF_RESPONSE_SCHEMA = `{
  "type": "object",
  "required": ["summary", "sentiment", "sentimentScore", "talkTimeRep", "talkTimeCustomer", "actionItems", "coachingInsight"],
  "properties": {
    "summary": { "type": "string" },
    "sentiment": { "type": "string", "enum": ["positive", "neutral", "challenging"] },
    "sentimentScore": { "type": "number", "minimum": 0, "maximum": 100 },
    "talkTimeRep": { "type": "number", "minimum": 0, "maximum": 100 },
    "talkTimeCustomer": { "type": "number", "minimum": 0, "maximum": 100 },
    "actionItems": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["task", "dueInDays"],
        "properties": {
          "task": { "type": "string" },
          "suggestedOwner": { "type": "string" },
          "dueInDays": { "type": "number" }
        }
      }
    },
    "coachingInsight": { "type": "string" },
    "keyQuotes": { "type": "array", "items": { "type": "string" } }
  }
}`;

export const slackMeetingDebriefTemplate: PromptTemplate = {
  id: 'slack-meeting-debrief',
  name: 'Slack Meeting Debrief',
  description: 'Generates meeting summary, sentiment, action items, and coaching insights for Slack notifications.',
  featureKey: 'slack_meeting_debrief',
  systemPrompt: SLACK_MEETING_DEBRIEF_SYSTEM_PROMPT,
  userPrompt: SLACK_MEETING_DEBRIEF_USER_PROMPT,
  variables: SLACK_MEETING_DEBRIEF_VARIABLES,
  responseFormat: 'json',
  responseSchema: SLACK_MEETING_DEBRIEF_RESPONSE_SCHEMA,
};

// ============================================================================
// Daily Digest Prompt
// ============================================================================

export const SLACK_DAILY_DIGEST_SYSTEM_PROMPT = `You are a sales operations analyst generating AI insights for a team's morning Slack digest.

Your goal is to provide 2-3 brief, actionable insights that help the team prioritize their day.

Focus on:
- Deals at risk or needing immediate action
- Patterns or trends the team should know about
- Quick wins that are available today
- Time-sensitive opportunities

Keep each insight to ONE concise sentence. Be specific and actionable.

Return ONLY valid JSON with no additional text.`;

export const SLACK_DAILY_DIGEST_USER_PROMPT = `Generate morning insights for the sales team's standup digest:

TODAY'S DATE: \${today}
TIMEZONE: \${timezone}

TODAY'S MEETINGS (\${meetingsCount} total):
\${meetingsList}

OVERDUE TASKS (\${overdueCount} total):
\${overdueTasks}

TASKS DUE TODAY (\${dueTodayCount} total):
\${dueTodayTasks}

PIPELINE STATUS:
\${pipelineStatus}

DEALS NEEDING ATTENTION:
- Stale deals (no activity 14+ days): \${staleDealsCount}
- At-risk deals (win prob dropped): \${atRiskDealsCount}

\${staleDeals}

Return insights as JSON:
{
  "insights": [
    "Brief, specific insight about what the team should focus on",
    "Another actionable insight based on the data"
  ],
  "urgentItems": ["Optional: any items requiring immediate attention"]
}

Guidelines:
- Return 2-3 insights maximum
- Each insight should be one sentence, under 100 characters if possible
- Focus on patterns and priorities, not just restating the data
- Be specific (mention company names, deal values, dates)
- Frame positively when possible ("3 deals closing this week" vs "Only 3 deals")`;

export const SLACK_DAILY_DIGEST_VARIABLES: PromptVariable[] = [
  {
    name: 'today',
    description: 'Current date',
    type: 'string',
    required: true,
    example: 'Monday, December 9, 2024',
    source: 'computed',
  },
  {
    name: 'timezone',
    description: 'Team timezone',
    type: 'string',
    required: true,
    example: 'America/New_York',
    source: 'org_settings',
  },
  {
    name: 'meetingsCount',
    description: 'Number of meetings today',
    type: 'number',
    required: true,
    example: '5',
    source: 'calendar_events',
  },
  {
    name: 'meetingsList',
    description: 'List of today\'s meetings',
    type: 'string',
    required: true,
    example: '10am - Discovery with Acme Corp (Sarah)\n2pm - Demo with TechStart (Mike)',
    source: 'calendar_events',
  },
  {
    name: 'overdueCount',
    description: 'Number of overdue tasks',
    type: 'number',
    required: true,
    example: '3',
    source: 'tasks',
  },
  {
    name: 'overdueTasks',
    description: 'List of overdue tasks',
    type: 'string',
    required: true,
    example: '- Sarah: Follow up with John (2 days overdue)\n- Mike: Send contract (1 day overdue)',
    source: 'tasks',
  },
  {
    name: 'dueTodayCount',
    description: 'Number of tasks due today',
    type: 'number',
    required: true,
    example: '4',
    source: 'tasks',
  },
  {
    name: 'dueTodayTasks',
    description: 'List of tasks due today',
    type: 'string',
    required: true,
    example: '- Sarah: Send pricing to TechStart\n- Mike: Prep demo environment',
    source: 'tasks',
  },
  {
    name: 'pipelineStatus',
    description: 'Current pipeline status',
    type: 'string',
    required: true,
    example: 'Total: $320K | This week closing: $125K (3 deals)',
    source: 'deals',
  },
  {
    name: 'staleDealsCount',
    description: 'Number of stale deals',
    type: 'number',
    required: true,
    example: '2',
    source: 'deals',
  },
  {
    name: 'atRiskDealsCount',
    description: 'Number of at-risk deals',
    type: 'number',
    required: true,
    example: '1',
    source: 'deals',
  },
  {
    name: 'staleDeals',
    description: 'Details of stale deals',
    type: 'string',
    required: false,
    example: '- BigCo ($50K, Verbal, 14 days stale)\n- TechStart ($30K, Opportunity, 16 days stale)',
    source: 'deals',
  },
];

export const SLACK_DAILY_DIGEST_RESPONSE_SCHEMA = `{
  "type": "object",
  "required": ["insights"],
  "properties": {
    "insights": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1,
      "maxItems": 3
    },
    "urgentItems": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}`;

export const slackDailyDigestTemplate: PromptTemplate = {
  id: 'slack-daily-digest',
  name: 'Slack Daily Digest Insights',
  description: 'Generates AI insights for the morning standup digest based on team data.',
  featureKey: 'slack_daily_digest',
  systemPrompt: SLACK_DAILY_DIGEST_SYSTEM_PROMPT,
  userPrompt: SLACK_DAILY_DIGEST_USER_PROMPT,
  variables: SLACK_DAILY_DIGEST_VARIABLES,
  responseFormat: 'json',
  responseSchema: SLACK_DAILY_DIGEST_RESPONSE_SCHEMA,
};

// ============================================================================
// Meeting Prep Prompt
// ============================================================================

export const SLACK_MEETING_PREP_SYSTEM_PROMPT = `You are a meeting preparation assistant generating talking points for upcoming meetings.

Adapt your language to the meeting context:
- If there is an active deal or sales-specific signals (demo, proposal, negotiation), use sales-oriented language (pipeline, objections, closing).
- If there is NO deal and the meeting title suggests a service visit, onboarding, consultation, check-in, or support session, use professional service language (needs, expectations, next steps). Do NOT use sales jargon like "prospect", "pipeline", or "close".
- If the meeting appears to be internal (standup, sync, 1:1), focus on progress, blockers, and alignment.
- When uncertain, default to neutral professional language.

Your goal is to provide 3 specific, actionable talking points that help the user:
1. Reference relevant context from previous interactions
2. Address known concerns or open items
3. Define clear next steps

Keep talking points:
- Specific to this meeting and its participants
- Based on the provided context
- Actionable (things to say or ask)
- Concise (one sentence each)
- Appropriate in tone for the meeting type

Return ONLY valid JSON with no additional text.`;

export const SLACK_MEETING_PREP_USER_PROMPT = `Generate meeting prep talking points:

MEETING: \${meetingTitle}
TIME: \${meetingTime}

COMPANY: \${companyName}
- Industry: \${companyIndustry}
- Size: \${companySize}
- Stage: \${companyStage}

ATTENDEES:
\${attendeesList}

DEAL STATUS:
- Value: \${dealValue}
- Stage: \${dealStage}
- Days in pipeline: \${daysInPipeline}
- Win probability: \${winProbability}%

PREVIOUS MEETING NOTES (\${lastMeetingDate}):
\${lastMeetingNotes}

RECENT ACTIVITIES:
\${recentActivities}

Return talking points as JSON:
{
  "talkingPoints": [
    "Specific talking point referencing context",
    "Another talking point addressing a concern",
    "Third talking point to move deal forward"
  ],
  "keyReminder": "Optional: one important thing to remember about this prospect"
}

Guidelines:
- 3 talking points exactly
- Each should be specific to this person/company and meeting context
- Reference previous conversations when relevant
- Include at least one question to ask
- If there is deal data, focus on advancing the deal. If not, focus on understanding needs and agreeing on next steps.
- Match your tone to the meeting type — do not use sales language for non-sales meetings`;

export const SLACK_MEETING_PREP_VARIABLES: PromptVariable[] = [
  {
    name: 'meetingTitle',
    description: 'Title of the upcoming meeting',
    type: 'string',
    required: true,
    example: 'Discovery Call with TechStart',
    source: 'calendar_events',
  },
  {
    name: 'meetingTime',
    description: 'Meeting time',
    type: 'string',
    required: true,
    example: '2:00 PM EST',
    source: 'calendar_events',
  },
  {
    name: 'companyName',
    description: 'Company name',
    type: 'string',
    required: true,
    example: 'TechStart Inc',
    source: 'companies',
  },
  {
    name: 'companyIndustry',
    description: 'Company industry',
    type: 'string',
    required: false,
    example: 'SaaS',
    source: 'companies',
  },
  {
    name: 'companySize',
    description: 'Company size',
    type: 'string',
    required: false,
    example: '50-100 employees',
    source: 'companies',
  },
  {
    name: 'companyStage',
    description: 'Company funding stage',
    type: 'string',
    required: false,
    example: 'Series A',
    source: 'companies',
  },
  {
    name: 'attendeesList',
    description: 'List of meeting attendees',
    type: 'string',
    required: true,
    example: '- Jane Doe (CEO) - Decision Maker, 3 prev meetings\n- Mike Smith (CTO) - First meeting',
    source: 'contacts',
  },
  {
    name: 'dealValue',
    description: 'Deal value',
    type: 'string',
    required: false,
    example: '$75,000',
    source: 'deals',
  },
  {
    name: 'dealStage',
    description: 'Current deal stage',
    type: 'string',
    required: false,
    example: 'Opportunity',
    source: 'deals',
  },
  {
    name: 'daysInPipeline',
    description: 'Days deal has been in pipeline',
    type: 'number',
    required: false,
    example: '21',
    source: 'deals',
  },
  {
    name: 'winProbability',
    description: 'Current win probability',
    type: 'number',
    required: false,
    example: '68',
    source: 'deals',
  },
  {
    name: 'lastMeetingDate',
    description: 'Date of last meeting',
    type: 'string',
    required: false,
    example: 'December 2, 2024',
    source: 'meetings',
  },
  {
    name: 'lastMeetingNotes',
    description: 'Notes from last meeting',
    type: 'string',
    required: false,
    example: 'Discussed pricing. Jane mentioned they are evaluating 3 vendors. Security review required.',
    source: 'meetings',
  },
  {
    name: 'recentActivities',
    description: 'Recent activities with this prospect',
    type: 'string',
    required: false,
    example: '- Dec 5: Email sent (proposal)\n- Dec 3: Call (pricing discussion)',
    source: 'activities',
  },
];

export const SLACK_MEETING_PREP_RESPONSE_SCHEMA = `{
  "type": "object",
  "required": ["talkingPoints"],
  "properties": {
    "talkingPoints": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 3,
      "maxItems": 3
    },
    "keyReminder": { "type": "string" }
  }
}`;

export const slackMeetingPrepTemplate: PromptTemplate = {
  id: 'slack-meeting-prep',
  name: 'Slack Meeting Prep Talking Points',
  description: 'Generates suggested talking points for upcoming meetings based on context.',
  featureKey: 'slack_meeting_prep',
  systemPrompt: SLACK_MEETING_PREP_SYSTEM_PROMPT,
  userPrompt: SLACK_MEETING_PREP_USER_PROMPT,
  variables: SLACK_MEETING_PREP_VARIABLES,
  responseFormat: 'json',
  responseSchema: SLACK_MEETING_PREP_RESPONSE_SCHEMA,
};

// ============================================================================
// Task Suggestions Prompt
// ============================================================================

export const SLACK_TASK_SUGGESTIONS_SYSTEM_PROMPT = `You are a task generation assistant that creates actionable follow-up tasks from sales context.

Your goal is to identify 2-4 specific tasks that will help move deals forward or maintain customer relationships.

Focus on tasks that are:
- Specific and actionable (clear what needs to be done)
- Time-bound (reasonable deadlines)
- Tied to business outcomes
- Not duplicating existing work

Return ONLY valid JSON with no additional text.`;

export const SLACK_TASK_SUGGESTIONS_USER_PROMPT = `Generate follow-up tasks from this context:

CONTEXT TYPE: \${contextType}
COMPANY: \${companyName}
DEAL: \${dealName} (\${dealStage}, \${dealValue})
CONTACT: \${contactName}

SOURCE CONTENT:
\${sourceContent}

EXISTING TASKS (avoid duplicates):
\${existingTasks}

Return tasks as JSON:
{
  "tasks": [
    {
      "title": "Clear, actionable task title",
      "dueInDays": 3,
      "priority": "high" | "medium" | "low",
      "reasoning": "Brief explanation of why this task matters"
    }
  ]
}

Guidelines:
- 2-4 tasks maximum
- Each title should be under 80 characters
- dueInDays: 1-2 for urgent, 3-5 for medium, 7-14 for low priority
- Don't duplicate tasks that already exist
- Make tasks specific to the context provided`;

export const SLACK_TASK_SUGGESTIONS_VARIABLES: PromptVariable[] = [
  {
    name: 'contextType',
    description: 'Type of context (meeting, email, deal_update, etc.)',
    type: 'string',
    required: true,
    example: 'meeting',
    source: 'request',
  },
  {
    name: 'companyName',
    description: 'Company name',
    type: 'string',
    required: false,
    example: 'Acme Corp',
    source: 'companies',
  },
  {
    name: 'dealName',
    description: 'Deal name',
    type: 'string',
    required: false,
    example: 'Enterprise License',
    source: 'deals',
  },
  {
    name: 'dealStage',
    description: 'Deal stage',
    type: 'string',
    required: false,
    example: 'Verbal',
    source: 'deals',
  },
  {
    name: 'dealValue',
    description: 'Deal value',
    type: 'string',
    required: false,
    example: '$50,000',
    source: 'deals',
  },
  {
    name: 'contactName',
    description: 'Primary contact name',
    type: 'string',
    required: false,
    example: 'John Smith',
    source: 'contacts',
  },
  {
    name: 'sourceContent',
    description: 'Source content to analyze (transcript, email, notes)',
    type: 'string',
    required: true,
    example: '[Meeting transcript or email content...]',
    source: 'request',
  },
  {
    name: 'existingTasks',
    description: 'List of existing tasks to avoid duplicates',
    type: 'string',
    required: false,
    example: '- Send proposal (due Dec 10)\n- Follow up on pricing (due Dec 8)',
    source: 'tasks',
  },
];

export const SLACK_TASK_SUGGESTIONS_RESPONSE_SCHEMA = `{
  "type": "object",
  "required": ["tasks"],
  "properties": {
    "tasks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["title", "dueInDays", "priority"],
        "properties": {
          "title": { "type": "string" },
          "dueInDays": { "type": "number" },
          "priority": { "type": "string", "enum": ["high", "medium", "low"] },
          "reasoning": { "type": "string" }
        }
      }
    }
  }
}`;

export const slackTaskSuggestionsTemplate: PromptTemplate = {
  id: 'slack-task-suggestions',
  name: 'Slack Task Suggestions',
  description: 'Generates actionable tasks from context for Slack interactive blocks.',
  featureKey: 'slack_task_suggestions',
  systemPrompt: SLACK_TASK_SUGGESTIONS_SYSTEM_PROMPT,
  userPrompt: SLACK_TASK_SUGGESTIONS_USER_PROMPT,
  variables: SLACK_TASK_SUGGESTIONS_VARIABLES,
  responseFormat: 'json',
  responseSchema: SLACK_TASK_SUGGESTIONS_RESPONSE_SCHEMA,
};

// ============================================================================
// Export All Templates
// ============================================================================

export const slackNotificationTemplates = {
  meetingDebrief: slackMeetingDebriefTemplate,
  dailyDigest: slackDailyDigestTemplate,
  meetingPrep: slackMeetingPrepTemplate,
  taskSuggestions: slackTaskSuggestionsTemplate,
};
