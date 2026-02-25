// supabase/functions/_shared/slackBlocks.ts
// Reusable Slack Block Kit builders for consistent message formatting
// Following the slack-blocks skill for sales assistant bots

/**
 * Slack Block Kit Types
 */
export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

export interface SlackMessage {
  blocks: SlackBlock[];
  text?: string; // Fallback text for notifications
}

/**
 * Slack Block Kit safety helpers (prevent "invalid_blocks")
 *
 * Slack limits:
 * - header plain_text: 150 chars
 * - section mrkdwn: 3000 chars
 * - section field: 2000 chars
 * - context mrkdwn: 2000 chars
 * - button text: 75 chars
 * - button value: 2000 chars
 */
const truncate = (value: string, max: number): string => {
  const v = String(value ?? '');
  if (v.length <= max) return v;
  if (max <= 1) return v.slice(0, max);
  return `${v.slice(0, max - 1)}…`;
};

const safeHeaderText = (text: string): string => truncate(text, 150);
const safeButtonText = (text: string): string => truncate(text, 75);
const safeMrkdwn = (text: string): string => truncate(text, 2800);
const safeFieldText = (text: string): string => truncate(text, 1900);
const safeContextMrkdwn = (text: string): string => truncate(text, 1900);
const safeButtonValue = (value: string): string => truncate(value, 1900);

export interface ActionItem {
  task: string;
  suggestedOwner?: string;
  dueInDays?: number;
  dealId?: string;
}

export interface MeetingDebriefData {
  meetingTitle: string;
  meetingId: string;
  attendees: string[];
  duration: number;
  dealName?: string;
  dealId?: string;
  dealStage?: string;
  summary: string;
  sentiment: 'positive' | 'neutral' | 'challenging';
  sentimentScore: number;
  talkTimeRep: number;
  talkTimeCustomer: number;
  actionItems: ActionItem[];
  coachingInsight: string;
  keyQuotes?: string[];
  appUrl: string;
}

export interface DailyDigestData {
  teamName: string;
  date: string;
  currencyCode?: string;
  currencyLocale?: string;
  meetings: Array<{
    time: string;
    userName: string;
    slackUserId?: string;
    title: string;
    prepNote?: string;
    isImportant?: boolean;
  }>;
  overdueTasks: Array<{
    userName: string;
    slackUserId?: string;
    task: string;
    daysOverdue: number;
  }>;
  dueTodayTasks: Array<{
    userName: string;
    slackUserId?: string;
    task: string;
  }>;
  insights: string[];
  weekStats: {
    dealsCount: number;
    dealsValue: number;
    meetingsCount: number;
    activitiesCount: number;
    pipelineValue: number;
  };
  appUrl: string;
}

export interface MeetingPrepData {
  meetingTitle: string;
  meetingId: string;
  meetingStartTime?: string;
  userName: string;
  slackUserId?: string;
  currencyCode?: string;
  currencyLocale?: string;
  attendees: Array<{
    name: string;
    title?: string;
    isDecisionMaker?: boolean;
    meetingCount?: number;
    isFirstMeeting?: boolean;
  }>;
  company: {
    id?: string;
    name: string;
    domain?: string;
    industry?: string;
    size?: string;
    stage?: string;
  };
  deal?: {
    name: string;
    id: string;
    value: number;
    stage: string;
    winProbability?: number;
    daysInPipeline?: number;
  };
  lastMeetingNotes?: string;
  lastMeetingDate?: string;
  talkingPoints: string[];
  meetingUrl?: string;
  appUrl: string;
  meetingHistory?: Array<{
    date: string;
    title: string;
    outcome?: 'positive' | 'neutral' | 'negative';
    keyTopics?: string[];
  }>;
  riskSignals?: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
  }>;
  previousObjections?: Array<{
    objection: string;
    resolution?: string;
    resolved: boolean;
  }>;
  stageQuestions?: string[];
  checklistReminders?: string[];
  scriptSteps?: Array<{
    stepName: string;
    topics: string[];
  }>;
  leadProfile?: {
    name?: string;
    title?: string;
    linkedin_url?: string;
    role_seniority?: string;
    decision_authority?: string;
    background?: string;
    content_topics?: string[];
    connection_points?: Array<{
      point: string;
      tier?: string;
      suggested_use?: string;
    }>;
  };
}

export interface DealRoomData {
  dealName: string;
  dealId: string;
  dealValue: number;
  dealStage: string;
  currencyCode?: string;
  currencyLocale?: string;
  ownerName?: string;
  ownerSlackUserId?: string;
  winProbability?: number;
  companyName?: string;
  companyIndustry?: string;
  companySize?: string;
  company?: {
    name: string;
    industry?: string;
    size?: string;
    location?: string;
  };
  contacts?: Array<{
    name: string;
    title?: string;
    isDecisionMaker?: boolean;
  }>;
  keyContacts?: Array<{
    name: string;
    title?: string;
    isDecisionMaker?: boolean;
  }>;
  aiAssessment?: {
    winProbability: number;
    keyFactors: string[];
    risks: string[];
  };
  appUrl: string;
}

export interface DealStageChangeData {
  dealName: string;
  dealId: string;
  previousStage: string;
  newStage: string;
  updatedBy: string;
  slackUserId?: string;
  appUrl: string;
}

export interface DealActivityData {
  dealName: string;
  dealId: string;
  activityType: string;
  description: string;
  createdBy: string;
  slackUserId?: string;
  appUrl: string;
}

export interface WinProbabilityChangeData {
  dealName: string;
  dealId: string;
  previousProbability: number;
  newProbability: number;
  factors: string[];
  suggestedActions: string[];
  appUrl: string;
}

export interface DealWonData {
  dealName: string;
  dealId: string;
  dealValue: number;
  currencyCode?: string;
  currencyLocale?: string;
  companyName: string;
  closedBy: string;
  slackUserId?: string;
  daysInPipeline?: number;
  winningFactors?: string[];
  archiveImmediately?: boolean;
  appUrl: string;
}

export interface DealLostData {
  dealName: string;
  dealId: string;
  dealValue: number;
  currencyCode?: string;
  currencyLocale?: string;
  companyName: string;
  lostReason?: string;
  closedBy: string;
  slackUserId?: string;
  lessonsLearned?: string[];
  archiveImmediately?: boolean;
  appUrl: string;
}

/**
 * Format currency for Slack messages.
 *
 * Defaults to GBP/en-GB so we don't accidentally show USD/$.
 */
const formatCurrency = (value: number, currency: string = 'GBP', locale?: string): string => {
  const code = (currency || 'GBP').toUpperCase();
  const effectiveLocale = locale || (code === 'USD' ? 'en-US' : code === 'EUR' ? 'en-IE' : code === 'AUD' ? 'en-AU' : code === 'CAD' ? 'en-CA' : 'en-GB');
  return new Intl.NumberFormat(effectiveLocale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

/**
 * Get sentiment indicator
 */
const getSentimentBadge = (sentiment: string, score: number): string => {
  const emoji = '';
  return `${emoji} ${sentiment.charAt(0).toUpperCase() + sentiment.slice(1)} (${score}%)`;
};

/**
 * Get talk time indicator
 */
const getTalkTimeBadge = (repPercent: number): string => {
  // Ideal is 30-40% rep talk time
  if (repPercent >= 25 && repPercent <= 45) return `${repPercent}%`;
  return `${repPercent}%`;
};

// =============================================================================
// PRIMITIVE BLOCK BUILDERS
// =============================================================================

export const divider = (): SlackBlock => ({ type: 'divider' });

export const header = (text: string): SlackBlock => ({
  type: 'header',
  text: {
    type: 'plain_text',
    text: safeHeaderText(text),
    emoji: true,
  },
});

export const section = (text: string): SlackBlock => ({
  type: 'section',
  text: {
    type: 'mrkdwn',
    text: safeMrkdwn(text),
  },
});

/**
 * Section with fields (key-value pairs) - great for data display
 */
export const sectionWithFields = (fields: Array<{ label: string; value: string }>): SlackBlock => ({
  type: 'section',
  fields: fields.slice(0, 10).map((f) => ({
    type: 'mrkdwn',
    text: safeFieldText(`*${f.label}*\n${f.value}`),
  })),
});

/**
 * Section with accessory button
 */
export const sectionWithButton = (
  text: string,
  buttonText: string,
  actionId: string,
  value: string,
  style?: 'primary' | 'danger'
): SlackBlock => ({
  type: 'section',
  text: {
    type: 'mrkdwn',
    text: safeMrkdwn(text),
  },
  accessory: {
    type: 'button',
    text: {
      type: 'plain_text',
      text: safeButtonText(buttonText),
      emoji: true,
    },
    action_id: actionId,
    value: safeButtonValue(value),
    ...(style && { style }),
  },
});

/**
 * Section with image accessory
 */
export const sectionWithImage = (
  text: string,
  imageUrl: string,
  altText: string
): SlackBlock => ({
  type: 'section',
  text: {
    type: 'mrkdwn',
    text: safeMrkdwn(text),
  },
  accessory: {
    type: 'image',
    image_url: imageUrl,
    alt_text: altText,
  },
});

export const context = (elements: string[]): SlackBlock => ({
  type: 'context',
  elements: elements.map((text) => ({
    type: 'mrkdwn',
    text: safeContextMrkdwn(text),
  })),
});

/**
 * Actions block with buttons (max 3 recommended for UX)
 */
export const actions = (
  buttons: Array<{
    text: string;
    actionId: string;
    value: string;
    style?: 'primary' | 'danger';
    url?: string;
  }>
): SlackBlock => ({
  type: 'actions',
  elements: buttons.slice(0, 5).map((btn) => ({
    type: 'button',
    text: {
      type: 'plain_text',
      text: safeButtonText(btn.text),
      emoji: true,
    },
    action_id: btn.actionId,
    // URL buttons should not have value (Slack can reject)
    ...(btn.url ? {} : { value: safeButtonValue(btn.value) }),
    ...(btn.style && { style: btn.style }),
    ...(btn.url && { url: btn.url }),
  })),
});

// =============================================================================
// LINK FOOTER & ENTITY CONTEXT HELPERS
// =============================================================================

/**
 * Data for building a context block with deep links to relevant entities.
 */
export interface LinkFooterData {
  appUrl: string;
  dealId?: string;
  dealName?: string;
  contactId?: string;
  contactName?: string;
  meetingId?: string;
  meetingTitle?: string;
}

/**
 * Returns a context block with deep links to relevant entities.
 * Only includes links for IDs that are present.
 * Falls back to a general app link if no specific links are provided.
 */
export const buildLinkFooter = (data: LinkFooterData): SlackBlock | null => {
  const links: string[] = [];

  if (data.dealId) {
    links.push(`<${data.appUrl}/deals/${data.dealId}|View Deal>`);
  }
  if (data.contactId) {
    links.push(`<${data.appUrl}/contacts/${data.contactId}|View Contact>`);
  }
  if (data.meetingId) {
    links.push(`<${data.appUrl}/meetings/${data.meetingId}|View Meeting>`);
  }

  // Always add a general app link if no specific links
  if (links.length === 0) {
    links.push(`<${data.appUrl}|Open in 60>`);
  }

  return context([links.join('  ·  ')]);
};

/**
 * Data for building a fields section with key entity details.
 */
export interface EntityContextData {
  dealName?: string;
  dealStage?: string;
  dealValue?: number;
  contactName?: string;
  companyName?: string;
  lastActivity?: string;
  currencyCode?: string;
  currencyLocale?: string;
}

/**
 * Returns a fields section with 2-4 key entity details.
 * Returns null if no data fields are populated.
 */
export const entityContextBlock = (data: EntityContextData): SlackBlock | null => {
  const fields: Array<{ label: string; value: string }> = [];

  if (data.dealName) {
    fields.push({ label: 'Deal', value: truncate(data.dealName, 60) });
  }
  if (data.dealStage) {
    fields.push({ label: 'Stage', value: data.dealStage });
  }
  if (data.dealValue !== undefined) {
    fields.push({ label: 'Value', value: formatCurrency(data.dealValue, data.currencyCode, data.currencyLocale) });
  }
  if (data.contactName) {
    fields.push({ label: 'Contact', value: truncate(data.contactName, 60) });
  }
  if (data.companyName) {
    fields.push({ label: 'Company', value: truncate(data.companyName, 60) });
  }
  if (data.lastActivity) {
    fields.push({ label: 'Last Activity', value: data.lastActivity });
  }

  if (fields.length === 0) return null;

  return sectionWithFields(fields.slice(0, 4));
};

// =============================================================================
// ACTION CONFIRMATION BUILDERS (SLACK-006)
// =============================================================================

/**
 * Unified action confirmation — replaces original message after any action.
 * Used for: snooze, dismiss, complete, approve, reject, expired.
 */
export interface ActionConfirmationData {
  action: 'snoozed' | 'dismissed' | 'completed' | 'approved' | 'rejected' | 'expired' | 'sent' | 'created';
  slackUserId?: string;
  actionedBy?: string;
  timestamp: string;
  /** Short description of what was acted on, e.g. "Deal: Acme Corp — £35k" */
  entitySummary: string;
  /** Optional extra detail line, e.g. "Snoozed until Mon Feb 10" */
  detail?: string;
  /** Original notification type for context */
  notificationType?: string;
}

const actionConfirmationConfig: Record<string, { emoji: string; label: string }> = {
  'snoozed': { emoji: '', label: 'Snoozed' },
  'dismissed': { emoji: '', label: 'Dismissed' },
  'completed': { emoji: '', label: 'Completed' },
  'approved': { emoji: '', label: 'Approved' },
  'rejected': { emoji: '', label: 'Rejected' },
  'expired': { emoji: '', label: 'Expired' },
  'sent': { emoji: '', label: 'Sent' },
  'created': { emoji: '', label: 'Created' },
};

export const buildActionConfirmation = (data: ActionConfirmationData): SlackMessage => {
  const blocks: SlackBlock[] = [];
  const config = actionConfirmationConfig[data.action] || { emoji: '', label: data.action };
  const userMention = data.slackUserId ? `<@${data.slackUserId}>` : (data.actionedBy || 'Unknown');

  const formattedTime = new Date(data.timestamp).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  // Main confirmation
  blocks.push(
    section(
      `${config.emoji} *${config.label}* by ${userMention}\n` +
      `_${truncate(data.entitySummary, 120)}_`
    )
  );

  // Optional detail (e.g., snooze duration, rejection reason)
  if (data.detail) {
    blocks.push(context([truncate(data.detail, 200)]));
  }

  // Timestamp footer
  blocks.push(context([formattedTime]));

  return {
    blocks,
    text: `${config.label}: ${truncate(data.entitySummary, 80)}`,
  };
};

// =============================================================================
// MESSAGE BUILDERS
// =============================================================================

/**
 * Meeting Debrief - Post-call summary with AI analysis
 */
export const buildMeetingDebriefMessage = (data: MeetingDebriefData): SlackMessage => {
  const blocks: SlackBlock[] = [];

  // Header — assertive past-tense
  blocks.push(header(`Meeting Complete | ${truncate(data.meetingTitle, 100)}`));

  // Evidence line
  blocks.push(context([
    `Trigger: ${data.actionItems.length} action item${data.actionItems.length !== 1 ? 's' : ''} detected, ${data.sentiment} sentiment`,
  ]));

  // Key metrics as fields
  blocks.push(sectionWithFields([
    { label: 'Sentiment', value: getSentimentBadge(data.sentiment, data.sentimentScore) },
    { label: 'Duration', value: `${data.duration} mins` },
    { label: 'Rep Talk Time', value: getTalkTimeBadge(data.talkTimeRep) },
    { label: 'Customer', value: `${data.talkTimeCustomer}%` },
  ]));

  // Summary
  blocks.push(section(`*Summary*\n${truncate(data.summary, 500)}`));

  blocks.push(divider());

  // Action Items (max 3 shown inline)
  if (data.actionItems.length > 0) {
    blocks.push(section('*Action Items*'));
    
    data.actionItems.slice(0, 3).forEach((item, index) => {
      const ownerText = item.suggestedOwner ? ` → _${item.suggestedOwner}_` : '';
      const dueText = item.dueInDays ? ` (${item.dueInDays}d)` : '';
      const taskValue = JSON.stringify({
        title: truncate(item.task, 150),
        dealId: data.dealId,
        dueInDays: item.dueInDays || 3,
        meetingId: data.meetingId,
      });

      blocks.push(sectionWithButton(
        `• ${truncate(item.task, 180)}${ownerText}${dueText}`,
        'Add',
        `add_task_${index}`,
        taskValue,
        'primary'
      ));
    });

    // Bulk action for multiple items
    if (data.actionItems.length > 1) {
      const allTasksValue = JSON.stringify({
        tasks: data.actionItems.slice(0, 5).map((item) => ({
          title: truncate(item.task, 150),
          dealId: data.dealId,
          dueInDays: item.dueInDays || 3,
          meetingId: data.meetingId,
        })),
      });

      blocks.push(actions([
        { text: `Add All ${data.actionItems.length} Tasks`, actionId: 'add_all_tasks', value: allTasksValue, style: 'primary' },
      ]));
    }

    blocks.push(divider());
  }

  // Coaching Insight
  if (data.coachingInsight) {
    blocks.push(section(`*Coaching Tip*\n${truncate(data.coachingInsight, 400)}`));
  }

  // Key Quote (if available)
  if (data.keyQuotes && data.keyQuotes.length > 0) {
    blocks.push(context([`_"${truncate(data.keyQuotes[0], 200)}"_`]));
  }

  // Action buttons row 1 - View links
  const viewButtons: Array<{ text: string; actionId: string; value: string; url?: string; style?: 'primary' }> = [
    { text: 'View Meeting', actionId: 'view_meeting', value: data.meetingId, url: `${data.appUrl}/meetings/${data.meetingId}`, style: 'primary' },
  ];

  if (data.dealId) {
    viewButtons.push({ text: 'View Deal', actionId: 'view_deal', value: data.dealId, url: `${data.appUrl}/deals/${data.dealId}` });
  }

  blocks.push(actions(viewButtons));

  // Action buttons row 2 - Quick actions
  const actionValue = JSON.stringify({
    meetingId: data.meetingId,
    meetingTitle: data.meetingTitle,
    dealId: data.dealId,
    dealName: data.dealName,
    attendees: data.attendees,
  });

  const quickActions: Array<{ text: string; actionId: string; value: string; style?: 'primary' }> = [
    { text: 'Draft Follow-up', actionId: 'debrief_draft_followup', value: actionValue },
  ];

  if (data.dealId) {
    quickActions.push({ text: 'Update Deal', actionId: 'debrief_update_deal', value: actionValue });
  }

  blocks.push(actions(quickActions));

  return {
    blocks,
    text: `Meeting Debrief: ${truncate(data.meetingTitle, 60)} - ${truncate(data.summary, 80)}`,
  };
};

/**
 * Daily Digest - Morning standup summary
 */
export const buildDailyDigestMessage = (data: DailyDigestData): SlackMessage => {
  const blocks: SlackBlock[] = [];

  // Header
  blocks.push(header(`Good Morning, ${truncate(data.teamName, 50)}!`));
  blocks.push(context([`${data.date}`]));

  // Quick Stats
  blocks.push(sectionWithFields([
    { label: 'Pipeline', value: formatCurrency(data.weekStats.pipelineValue, data.currencyCode, data.currencyLocale) },
    { label: 'Meetings', value: `${data.meetings.length} today` },
    { label: 'Due Today', value: `${data.dueTodayTasks.length} tasks` },
    { label: 'Overdue', value: `${data.overdueTasks.length} tasks` },
  ]));

  blocks.push(divider());

  // Today's Meetings (if any)
  if (data.meetings.length > 0) {
    const meetingLines = data.meetings.slice(0, 4).map((m) => {
      const userMention = m.slackUserId ? `<@${m.slackUserId}>` : m.userName;
      const important = m.isImportant ? '' : '';
      return `${important}*${m.time}* ${userMention} - ${truncate(m.title, 80)}`;
    });

    blocks.push(section(`*TODAY'S MEETINGS*\n${meetingLines.join('\n')}`));

    if (data.meetings.length > 4) {
      blocks.push(context([`+ ${data.meetings.length - 4} more meetings`]));
    }
  }

  // Tasks Needing Attention
  if (data.overdueTasks.length > 0) {
    const overdueLines = data.overdueTasks.slice(0, 3).map((t) => {
      const userMention = t.slackUserId ? `<@${t.slackUserId}>` : t.userName;
      return `${userMention}: ${truncate(t.task, 60)} (${t.daysOverdue}d overdue)`;
    });

    blocks.push(section(`*OVERDUE TASKS*\n${overdueLines.join('\n')}`));
  }

  // AI Insights
  if (data.insights.length > 0) {
    blocks.push(divider());
    const insightLines = data.insights.slice(0, 3).map((insight) => `• ${truncate(insight, 150)}`);
    blocks.push(section(`*AI INSIGHTS*\n${insightLines.join('\n')}`));
  }

  // Week Stats Summary
  blocks.push(divider());
  blocks.push(context([
    `This week: ${data.weekStats.dealsCount} deals closed (${formatCurrency(data.weekStats.dealsValue, data.currencyCode, data.currencyLocale)}) | ${data.weekStats.meetingsCount} meetings | ${data.weekStats.activitiesCount} activities`,
  ]));

  // Action button
  blocks.push(actions([
    { text: 'View Dashboard', actionId: 'view_dashboard', value: 'dashboard', url: `${data.appUrl}/dashboard`, style: 'primary' },
    { text: 'View Tasks', actionId: 'view_tasks', value: 'tasks', url: `${data.appUrl}/tasks` },
  ]));

  return {
    blocks,
    text: `Daily Digest for ${data.date} - ${data.meetings.length} meetings, ${data.overdueTasks.length} overdue tasks`,
  };
};

/**
 * Meeting Prep - Pre-meeting intelligence card
 */
export const buildMeetingPrepMessage = (data: MeetingPrepData): SlackMessage => {
  const blocks: SlackBlock[] = [];

  // Header with user mention — calculate dynamic time-to-meeting
  const userMention = data.slackUserId ? `<@${data.slackUserId}>` : data.userName;
  let timeLabel = 'soon';
  if (data.meetingStartTime) {
    const now = Date.now();
    const startMs = new Date(data.meetingStartTime).getTime();
    const diffMins = Math.round((startMs - now) / 60_000);
    if (diffMins <= 0) {
      timeLabel = 'now';
    } else if (diffMins < 60) {
      timeLabel = `in ${diffMins} mins`;
    } else {
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      timeLabel = mins > 0 ? `in ${hours}h ${mins}m` : `in ${hours}h`;
    }
  }
  blocks.push(header(`Meeting ${timeLabel}`));
  blocks.push(section(`*${truncate(data.meetingTitle, 100)}*\n${userMention}`));

  // Evidence line
  const evidenceParts: string[] = [`Trigger: Meeting starts ${timeLabel}`];
  const critRisks = data.riskSignals?.filter(r => r.severity === 'critical' || r.severity === 'high') || [];
  if (critRisks.length > 0) {
    evidenceParts.push(`${critRisks.length} deal risk${critRisks.length !== 1 ? 's' : ''} flagged`);
  }
  blocks.push(context(evidenceParts));

  // Risk Alerts (if critical/high)
  const criticalRisks = data.riskSignals?.filter(r => r.severity === 'critical' || r.severity === 'high') || [];
  if (criticalRisks.length > 0) {
    const riskEmoji = '';
    const riskLines = criticalRisks.slice(0, 2).map(r => {
      const badge = '';
      return `${badge} ${truncate(r.description, 100)}`;
    });
    blocks.push(section(`${riskEmoji} *DEAL RISKS*\n${riskLines.join('\n')}`));
  }

  blocks.push(divider());

  // Key info as fields
  const fields: Array<{ label: string; value: string }> = [];
  
  if (data.attendees.length > 0) {
    const keyAttendee = data.attendees.find(a => a.isDecisionMaker) || data.attendees[0];
    const badge = keyAttendee.isDecisionMaker ? '' : '';
    fields.push({ label: 'With', value: `${keyAttendee.name}${keyAttendee.title ? ` (${keyAttendee.title})` : ''}${badge}` });
  }

  const companyDisplay = data.company.domain && data.company.name !== data.company.domain
    ? `${data.company.name} (${data.company.domain})`
    : data.company.name;
  fields.push({ label: 'Company', value: companyDisplay });

  if (data.deal) {
    fields.push({ label: 'Deal', value: `${formatCurrency(data.deal.value, data.currencyCode, data.currencyLocale)} - ${data.deal.stage}` });
    if (data.deal.winProbability !== undefined) {
      fields.push({ label: 'Win Prob', value: `${data.deal.winProbability}%` });
    }
  }

  if (fields.length > 0) {
    blocks.push(sectionWithFields(fields));
  }

  // Quick Prep Notes
  const prepItems: string[] = [];
  
  if (data.lastMeetingNotes) {
    prepItems.push(`Last meeting: _"${truncate(data.lastMeetingNotes, 120)}"_`);
  }

  // Unresolved objections
  const unresolvedObjections = data.previousObjections?.filter(o => !o.resolved) || [];
  if (unresolvedObjections.length > 0) {
    prepItems.push(`Open objection: ${truncate(unresolvedObjections[0].objection, 100)}`);
  }

  // Key talking point
  if (data.talkingPoints.length > 0) {
    prepItems.push(`Key point: ${truncate(data.talkingPoints[0], 100)}`);
  }

  if (prepItems.length > 0) {
    blocks.push(section(`*Quick Prep:*\n${prepItems.join('\n')}`));
  }

  // Lead Profile (person-level intel)
  if (data.leadProfile) {
    const lp = data.leadProfile;
    blocks.push(divider());
    blocks.push(header('Attendee Intel'));

    // Person card: name, title, seniority
    const nameParts: string[] = [];
    if (lp.name) {
      const displayName = lp.linkedin_url ? `<${lp.linkedin_url}|${lp.name}>` : `*${lp.name}*`;
      nameParts.push(displayName);
    }
    if (lp.title) nameParts.push(lp.title);
    if (nameParts.length > 0) {
      blocks.push(section(nameParts.join(' · ')));
    }

    // Key fields as compact info
    const infoFields: Array<{ label: string; value: string }> = [];
    if (lp.role_seniority) infoFields.push({ label: 'Level', value: lp.role_seniority });
    if (lp.decision_authority) infoFields.push({ label: 'Authority', value: truncate(lp.decision_authority, 80) });
    if (infoFields.length > 0) {
      blocks.push(sectionWithFields(infoFields));
    }

    // Background as a concise summary
    if (lp.background) {
      blocks.push(context([`${truncate(lp.background, 250)}`]));
    }

    // Connection points with proper tier matching
    if (lp.connection_points && lp.connection_points.length > 0) {
      blocks.push(divider());
      const cpLines = lp.connection_points.slice(0, 3).map(cp => {
        const tierRaw = String(cp.tier || '3').replace(/[^0-9]/g, '') || '3';
        const tierBadge = '';
        const useHint = cp.suggested_use ? ` _→ ${truncate(cp.suggested_use, 80)}_` : '';
        return `${tierBadge} ${truncate(cp.point, 100)}${useHint}`;
      });
      blocks.push(section(`*Conversation Starters*\n${cpLines.join('\n')}`));
    }

    // Topics as context line
    if (lp.content_topics && lp.content_topics.length > 0) {
      blocks.push(context([`Talks about: ${lp.content_topics.slice(0, 4).join(' · ')}`]));
    }
  }

  // Action buttons (max 3)
  const buttonRow: Array<{ text: string; actionId: string; value: string; url?: string; style?: 'primary' }> = [];

  if (data.meetingUrl) {
    buttonRow.push({ text: 'Join Call', actionId: 'join_meeting', value: data.meetingId, url: data.meetingUrl, style: 'primary' });
  }

  if (data.deal) {
    buttonRow.push({ text: 'View Deal', actionId: 'view_deal', value: data.deal.id, url: `${data.appUrl}/deals/${data.deal.id}` });
  }

  if (data.company.id) {
    buttonRow.push({ text: 'Company Profile', actionId: 'view_company', value: data.company.id, url: `${data.appUrl}/companies/${data.company.id}` });
  }

  buttonRow.push({ text: 'Full Prep', actionId: 'view_meeting', value: data.meetingId, url: `${data.appUrl}/meetings/${data.meetingId}` });

  blocks.push(actions(buttonRow.slice(0, 3)));

  // Escape hatch — dismiss
  blocks.push(actions([
    { text: 'Dismiss', actionId: 'dismiss_meeting_prep', value: data.meetingId },
  ]));

  // Context
  if (data.attendees.length > 1) {
    blocks.push(context([`${data.attendees.length} attendees • ${data.company.industry || 'Company'}`]));
  }

  return {
    blocks,
    text: `Meeting Prep: ${data.meetingTitle} ${timeLabel}`,
  };
};

/**
 * Deal Room - Initial channel message
 */
export const buildDealRoomMessage = (data: DealRoomData): SlackMessage => {
  const blocks: SlackBlock[] = [];
  const companyName = data.companyName || data.company?.name || 'Unknown Company';
  const ownerMention = data.ownerSlackUserId ? `<@${data.ownerSlackUserId}>` : (data.ownerName || 'Unknown');
  const hasWinProb = data.winProbability !== undefined && data.winProbability !== null;

  // Header
  blocks.push(header(`${truncate(companyName, 80)} Deal Room`));

  // Key deal info as fields
  blocks.push(sectionWithFields([
    { label: 'Value', value: formatCurrency(data.dealValue, data.currencyCode, data.currencyLocale) },
    { label: 'Stage', value: data.dealStage },
    { label: 'Owner', value: ownerMention },
    { label: 'Win Prob', value: hasWinProb ? `${data.winProbability}%` : 'TBD' },
  ]));

  blocks.push(divider());

  // Company Info
  const industry = data.companyIndustry || data.company?.industry;
  const size = data.companySize || data.company?.size;
  const location = data.company?.location;

  const companyDetails = [industry, size, location].filter(Boolean).join(' • ');
  if (companyDetails) {
    blocks.push(section(`*Company*\n${companyDetails}`));
  }

  // Key Contacts
  const contacts = data.keyContacts || data.contacts || [];
  if (contacts.length > 0) {
    const contactLines = contacts.slice(0, 3).map((c) => {
      const badge = c.isDecisionMaker ? '' : '';
      return `• *${c.name}*${c.title ? ` (${c.title})` : ''}${badge}`;
    });
    blocks.push(section(`*Key Contacts*\n${contactLines.join('\n')}`));
  }

  // AI Assessment
  if (data.aiAssessment) {
    blocks.push(divider());
    const assessmentLines: string[] = [];
    if (data.aiAssessment.keyFactors?.length > 0) {
      assessmentLines.push(`${data.aiAssessment.keyFactors.slice(0, 2).join(', ')}`);
    }
    if (data.aiAssessment.risks?.length > 0) {
      assessmentLines.push(`${data.aiAssessment.risks.slice(0, 2).join(', ')}`);
    }
    if (assessmentLines.length > 0) {
      blocks.push(section(`*AI Assessment*\n${assessmentLines.join('\n')}`));
    }
  }

  // Action buttons
  blocks.push(actions([
    { text: 'View Deal', actionId: 'view_deal', value: data.dealId, url: `${data.appUrl}/deals/${data.dealId}`, style: 'primary' },
    { text: 'Log Activity', actionId: 'log_activity', value: data.dealId },
  ]));

  // Context
  blocks.push(context([`Created ${new Date().toLocaleDateString()} • Updates will be posted here`]));

  return {
    blocks,
    text: `Deal Room: ${companyName} - ${formatCurrency(data.dealValue, data.currencyCode, data.currencyLocale)}`,
  };
};

export const buildDealRoomWelcomeMessage = (data: DealRoomData): SlackMessage => {
  return buildDealRoomMessage(data);
};

/**
 * Deal Stage Change - Pipeline movement notification
 */
export const buildDealStageChangeMessage = (data: DealStageChangeData): SlackMessage => {
  const blocks: SlackBlock[] = [];
  const userMention = data.slackUserId ? `<@${data.slackUserId}>` : data.updatedBy;

  // Determine if this is progress or regression
  const stages = ['sql', 'opportunity', 'verbal', 'signed'];
  const prevIndex = stages.indexOf(data.previousStage.toLowerCase());
  const newIndex = stages.indexOf(data.newStage.toLowerCase());
  const isProgress = newIndex > prevIndex;
  const emoji = '';

  blocks.push(section(`${emoji} *Stage Update*\n*${data.dealName}*\n${data.previousStage} → *${data.newStage}*`));

  blocks.push(context([`Updated by ${userMention} • Just now`]));

  if (data.dealId && data.appUrl) {
    blocks.push(actions([
      { text: 'View Deal', actionId: 'view_deal', value: data.dealId, url: `${data.appUrl}/deals/${data.dealId}` },
    ]));
  }

  return {
    blocks,
    text: `Stage Update: ${data.dealName} → ${data.newStage}`,
  };
};

/**
 * Deal Activity - Activity logged notification
 */
export const buildDealActivityMessage = (data: DealActivityData): SlackMessage => {
  const blocks: SlackBlock[] = [];
  const userMention = data.slackUserId ? `<@${data.slackUserId}>` : data.createdBy;

  const activityEmoji: Record<string, string> = {
    'call': '',
    'email': '',
    'meeting': '',
    'proposal': '',
    'note': '',
    'task': '',
    'demo': '',
  };
  const emoji = activityEmoji[data.activityType.toLowerCase()] || '';

  blocks.push(section(`${emoji} *${data.activityType}* by ${userMention}\n\n${truncate(data.description, 300)}`));

  if (data.dealId && data.appUrl) {
    blocks.push(actions([
      { text: 'View Deal', actionId: 'view_deal', value: data.dealId, url: `${data.appUrl}/deals/${data.dealId}` },
    ]));
  }

  return {
    blocks,
    text: `${data.activityType}: ${truncate(data.description, 100)}`,
  };
};

/**
 * Win Probability Change - Risk alert
 */
export const buildWinProbabilityChangeMessage = (data: WinProbabilityChangeData): SlackMessage => {
  const blocks: SlackBlock[] = [];

  const change = data.newProbability - data.previousProbability;
  const isIncrease = change > 0;
  const emoji = '';
  const direction = isIncrease ? '↑' : '↓';
  const headerEmoji = '';

  blocks.push(header(`${headerEmoji} Win Probability ${isIncrease ? 'Increased' : 'Dropped'}`));

  blocks.push(sectionWithFields([
    { label: 'Deal', value: truncate(data.dealName, 60) },
    { label: 'Change', value: `${data.previousProbability}% → ${data.newProbability}% (${direction}${Math.abs(change)}%)` },
  ]));

  if (data.factors && data.factors.length > 0) {
    blocks.push(section(`*${isIncrease ? 'Positive Signals' : 'Risk Factors'}*\n${data.factors.slice(0, 3).map(f => `• ${truncate(f, 100)}`).join('\n')}`));
  }

  if (!isIncrease && data.suggestedActions && data.suggestedActions.length > 0) {
    blocks.push(section(`*Suggested Actions*\n${data.suggestedActions.slice(0, 3).map(a => `• ${truncate(a, 100)}`).join('\n')}`));
  }

  const buttonRow: Array<{ text: string; actionId: string; value: string; url?: string; style?: 'primary' | 'danger' }> = [];

  if (data.dealId && data.appUrl) {
    buttonRow.push({ text: 'View Deal', actionId: 'view_deal', value: data.dealId, url: `${data.appUrl}/deals/${data.dealId}`, style: 'primary' });
  }
  if (!isIncrease) {
    buttonRow.push({ text: 'Create Task', actionId: 'create_task_from_alert', value: JSON.stringify({ dealId: data.dealId, type: 'win_probability' }) });
  }

  blocks.push(actions(buttonRow.slice(0, 3)));

  return {
    blocks,
    text: `Win Probability ${isIncrease ? 'increased' : 'dropped'}: ${data.dealName} ${data.previousProbability}% → ${data.newProbability}%`,
  };
};

/**
 * Deal Won - Celebration message
 */
export const buildDealWonMessage = (data: DealWonData): SlackMessage => {
  const blocks: SlackBlock[] = [];
  const userMention = data.slackUserId ? `<@${data.slackUserId}>` : data.closedBy;

  // Celebratory header
  blocks.push(header('DEAL WON!'));

  // Main announcement
  blocks.push(section(`*${data.companyName}* just signed!\n\n*${formatCurrency(data.dealValue, data.currencyCode, data.currencyLocale)}* Contract${data.daysInPipeline ? `\n*${data.daysInPipeline} days* in pipeline` : ''}`));

  blocks.push(divider());

  // Winning factors (if provided)
  if (data.winningFactors && data.winningFactors.length > 0) {
    const factorLines = data.winningFactors.slice(0, 3).map(f => `• ${truncate(f, 80)}`);
    blocks.push(section(`*Winning Factors*\n${factorLines.join('\n')}`));
  }

  // Context
  blocks.push(context([`Closed by ${userMention} • Great work!`]));

  // Action buttons
  blocks.push(actions([
    { text: 'Celebrate', actionId: 'celebrate_deal', value: data.dealId, style: 'primary' },
    { text: 'Case Study', actionId: 'create_case_study', value: data.dealId },
    { text: 'View Deal', actionId: 'view_deal', value: data.dealId, url: `${data.appUrl}/deals/${data.dealId}` },
  ]));

  return {
    blocks,
    text: `Deal Won! ${data.companyName} - ${formatCurrency(data.dealValue, data.currencyCode, data.currencyLocale)}`,
  };
};

/**
 * Deal Lost - Respectful close notification
 */
export const buildDealLostMessage = (data: DealLostData): SlackMessage => {
  const blocks: SlackBlock[] = [];
  const userMention = data.slackUserId ? `<@${data.slackUserId}>` : data.closedBy;

  blocks.push(section(`*Deal Lost*\n\n*${data.companyName}* - ${formatCurrency(data.dealValue, data.currencyCode, data.currencyLocale)}`));

  if (data.lostReason) {
    blocks.push(section(`*Reason:* ${truncate(data.lostReason, 200)}`));
  }

  // Lessons learned (if provided)
  if (data.lessonsLearned && data.lessonsLearned.length > 0) {
    const lessonLines = data.lessonsLearned.slice(0, 2).map(l => `• ${truncate(l, 100)}`);
    blocks.push(section(`*Takeaways*\n${lessonLines.join('\n')}`));
  }

  blocks.push(context([`Closed by ${userMention} • This channel will be archived`]));

  if (data.dealId && data.appUrl) {
    blocks.push(actions([
      { text: 'View Deal', actionId: 'view_deal', value: data.dealId, url: `${data.appUrl}/deals/${data.dealId}` },
    ]));
  }

  return {
    blocks,
    text: `Deal Lost: ${data.companyName} - ${formatCurrency(data.dealValue, data.currencyCode, data.currencyLocale)}`,
  };
};

/**
 * Task confirmation (ephemeral response)
 */
export const buildTaskAddedConfirmation = (taskTitle: string, count: number = 1): SlackMessage => {
  const message = count === 1
    ? `Task added: "${truncate(taskTitle, 60)}"`
    : `${count} tasks added to your task list!`;

  return {
    blocks: [section(message)],
    text: message,
  };
};

// =============================================================================
// HITL (Human-in-the-Loop) TYPES & BUILDERS
// =============================================================================

export type HITLResourceType =
  | 'email_draft'
  | 'follow_up'
  | 'task_list'
  | 'summary'
  | 'meeting_notes'
  | 'proposal_section'
  | 'coaching_tip';

export interface HITLApprovalData {
  approvalId: string;
  resourceType: HITLResourceType;
  resourceId: string;
  resourceName: string;
  content: {
    subject?: string;
    body?: string;
    recipient?: string;
    recipientEmail?: string;
    items?: string[];
    summary?: string;
    [key: string]: unknown;
  };
  context?: {
    dealName?: string;
    dealId?: string;
    contactName?: string;
    meetingTitle?: string;
    meetingId?: string;
    confidence?: number;
  };
  expiresAt?: string;
  appUrl: string;
}

export interface HITLConfirmationData {
  approvalId: string;
  title: string;
  items: Array<{
    id: string;
    label: string;
    description?: string;
    selected?: boolean;
  }>;
  context?: string;
  appUrl: string;
}

export interface HITLEditRequestData {
  approvalId: string;
  resourceType: HITLResourceType;
  original: {
    label: string;
    content: string;
  };
  suggested: {
    label: string;
    content: string;
  };
  changesSummary?: string[];
  context?: {
    dealName?: string;
    reason?: string;
  };
  appUrl: string;
}

export interface HITLActionedConfirmation {
  action: 'approved' | 'rejected' | 'edited';
  resourceType: string;
  resourceName: string;
  actionedBy: string;
  slackUserId?: string;
  timestamp: string;
  editSummary?: string;
  rejectionReason?: string;
}

/**
 * Get emoji badge for HITL resource type
 */
const getHITLResourceEmoji = (resourceType: HITLResourceType): string => {
  const emojiMap: Record<HITLResourceType, string> = {
    'email_draft': '',
    'follow_up': '',
    'task_list': '',
    'summary': '',
    'meeting_notes': '',
    'proposal_section': '',
    'coaching_tip': '',
  };
  return emojiMap[resourceType] || '';
};

/**
 * Format resource type for display
 */
const formatResourceType = (resourceType: string): string => {
  return resourceType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

/**
 * Build HITL Approval Message
 * Used for email drafts, follow-ups, summaries needing approval
 */
export const buildHITLApprovalMessage = (data: HITLApprovalData): SlackMessage => {
  const blocks: SlackBlock[] = [];

  const emoji = getHITLResourceEmoji(data.resourceType);
  const typeLabel = formatResourceType(data.resourceType);

  // Header with resource type badge
  blocks.push(header(`${emoji} Review: ${truncate(typeLabel, 80)}`));

  // Entity context block (SLK-006) — structured deal/contact summary after header
  const entityCtx = entityContextBlock({
    dealName: data.context?.dealName,
    contactName: data.context?.contactName,
  });
  if (entityCtx) blocks.push(entityCtx);

  // Context section (deal, contact, meeting)
  if (data.context) {
    const contextParts: string[] = [];
    if (data.context.meetingTitle) contextParts.push(`${truncate(data.context.meetingTitle, 40)}`);
    if (data.context.confidence !== undefined) {
      contextParts.push(`${data.context.confidence}% confidence`);
    }

    if (contextParts.length > 0) {
      blocks.push(context(contextParts));
    }
  }

  blocks.push(divider());

  // Content preview based on resource type
  if (data.resourceType === 'email_draft' || data.resourceType === 'follow_up') {
    // Email-style content
    if (data.content.recipient || data.content.recipientEmail) {
      const recipient = data.content.recipient || data.content.recipientEmail;
      blocks.push(section(`*To:* ${truncate(recipient as string, 100)}`));
    }
    if (data.content.subject) {
      blocks.push(section(`*Subject:* ${truncate(data.content.subject, 200)}`));
    }
    if (data.content.body) {
      blocks.push(section(`*Message:*\n${truncate(data.content.body, 800)}`));
    }
  } else if (data.resourceType === 'task_list' && data.content.items) {
    // Task list content
    const taskLines = data.content.items.slice(0, 5).map((item) => `• ${truncate(item, 100)}`);
    blocks.push(section(`*Tasks:*\n${taskLines.join('\n')}`));
    if (data.content.items.length > 5) {
      blocks.push(context([`+ ${data.content.items.length - 5} more tasks`]));
    }
  } else if (data.content.summary) {
    // Generic summary content
    blocks.push(section(`*Content:*\n${truncate(data.content.summary, 800)}`));
  } else if (data.content.body) {
    // Fallback to body
    blocks.push(section(`*Content:*\n${truncate(data.content.body, 800)}`));
  }

  blocks.push(divider());

  // Action buttons with HITL action ID convention: {action}::{resource_type}::{approval_id}
  const callbackValue = JSON.stringify({ approvalId: data.approvalId });

  blocks.push({
    type: 'actions',
    block_id: `hitl_actions::${data.approvalId}`,
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Approve'), emoji: true },
        style: 'primary',
        action_id: `approve::${data.resourceType}::${data.approvalId}`,
        value: safeButtonValue(callbackValue),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Edit'), emoji: true },
        action_id: `edit::${data.resourceType}::${data.approvalId}`,
        value: safeButtonValue(callbackValue),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Reject'), emoji: true },
        style: 'danger',
        action_id: `reject::${data.resourceType}::${data.approvalId}`,
        value: safeButtonValue(callbackValue),
      },
    ],
  });

  // Expiry and resource context
  const contextItems: string[] = [];
  if (data.expiresAt) {
    const expiresDate = new Date(data.expiresAt);
    const hoursLeft = Math.max(0, Math.round((expiresDate.getTime() - Date.now()) / 3600000));
    contextItems.push(`Expires in ${hoursLeft} hours`);
  }
  if (data.resourceName) {
    contextItems.push(truncate(data.resourceName, 60));
  }
  if (contextItems.length > 0) {
    blocks.push(context([contextItems.join(' • ')]));
  }

  // Deep link footer (SLK-005)
  const linkFooter = buildLinkFooter({
    appUrl: data.appUrl,
    dealId: data.context?.dealId,
    dealName: data.context?.dealName,
    meetingId: data.context?.meetingId,
    meetingTitle: data.context?.meetingTitle,
  });
  if (linkFooter) blocks.push(linkFooter);

  return {
    blocks,
    text: `Review requested: ${typeLabel} - ${truncate(data.resourceName || 'Pending approval', 60)}`,
  };
};

/**
 * Build HITL Multi-Item Confirmation Message
 * Used for bulk approvals with checkboxes
 */
export const buildHITLConfirmationMessage = (data: HITLConfirmationData): SlackMessage => {
  const blocks: SlackBlock[] = [];

  blocks.push(header(`${truncate(data.title, 100)}`));

  if (data.context) {
    blocks.push(context([truncate(data.context, 150)]));
  }

  blocks.push(divider());

  // Build checkbox group (max 10 options per Slack limits)
  const options = data.items.slice(0, 10).map((item) => ({
    text: {
      type: 'mrkdwn' as const,
      text: item.description
        ? `*${truncate(item.label, 60)}*\n${truncate(item.description, 100)}`
        : `*${truncate(item.label, 80)}*`,
    },
    value: item.id,
  }));

  const initialOptions = data.items
    .filter((item) => item.selected !== false)
    .slice(0, 10)
    .map((item) => ({
      text: {
        type: 'mrkdwn' as const,
        text: item.description
          ? `*${truncate(item.label, 60)}*\n${truncate(item.description, 100)}`
          : `*${truncate(item.label, 80)}*`,
      },
      value: item.id,
    }));

  blocks.push({
    type: 'section',
    block_id: 'hitl_items_selection',
    text: {
      type: 'mrkdwn',
      text: 'Select items to include:',
    },
    accessory: {
      type: 'checkboxes',
      action_id: `select_items::confirmation::${data.approvalId}`,
      options,
      ...(initialOptions.length > 0 ? { initial_options: initialOptions } : {}),
    },
  });

  blocks.push(divider());

  // Bulk action buttons
  const allItemIds = data.items.map((i) => i.id);
  blocks.push({
    type: 'actions',
    block_id: `hitl_bulk_actions::${data.approvalId}`,
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Confirm Selected'), emoji: true },
        style: 'primary',
        action_id: `confirm_selected::confirmation::${data.approvalId}`,
        value: safeButtonValue(JSON.stringify({ approvalId: data.approvalId })),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Confirm All'), emoji: true },
        action_id: `confirm_all::confirmation::${data.approvalId}`,
        value: safeButtonValue(JSON.stringify({ approvalId: data.approvalId, itemIds: allItemIds })),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Cancel'), emoji: true },
        style: 'danger',
        action_id: `cancel::confirmation::${data.approvalId}`,
        value: safeButtonValue(JSON.stringify({ approvalId: data.approvalId })),
      },
    ],
  });

  return {
    blocks,
    text: `Confirmation needed: ${truncate(data.title, 80)}`,
  };
};

/**
 * Build HITL Edit Request Message
 * Side-by-side original vs suggested content comparison
 */
export const buildHITLEditRequestMessage = (data: HITLEditRequestData): SlackMessage => {
  const blocks: SlackBlock[] = [];

  blocks.push(header('Suggested Changes'));

  if (data.context?.dealName) {
    const contextText = data.context.reason
      ? `${truncate(data.context.dealName, 40)} • ${truncate(data.context.reason, 60)}`
      : `${truncate(data.context.dealName, 60)}`;
    blocks.push(context([contextText]));
  }

  blocks.push(divider());

  // Original content
  blocks.push(section(`*${truncate(data.original.label, 40)}:*`));
  blocks.push(section(`\`\`\`${truncate(data.original.content, 600)}\`\`\``));

  blocks.push(divider());

  // Suggested content
  blocks.push(section(`*${truncate(data.suggested.label, 40)}:*`));
  blocks.push(section(`\`\`\`${truncate(data.suggested.content, 600)}\`\`\``));

  // Changes summary
  if (data.changesSummary && data.changesSummary.length > 0) {
    blocks.push(divider());
    const changeLines = data.changesSummary.slice(0, 3).map((c) => `• ${truncate(c, 80)}`);
    blocks.push(section(`*Key Changes:*\n${changeLines.join('\n')}`));
  }

  blocks.push(divider());

  // Action buttons
  const callbackValue = JSON.stringify({ approvalId: data.approvalId });
  blocks.push({
    type: 'actions',
    block_id: `hitl_edit_actions::${data.approvalId}`,
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Use Suggested'), emoji: true },
        style: 'primary',
        action_id: `use_suggested::${data.resourceType}::${data.approvalId}`,
        value: safeButtonValue(JSON.stringify({ ...JSON.parse(callbackValue), choice: 'suggested' })),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Keep Original'), emoji: true },
        action_id: `keep_original::${data.resourceType}::${data.approvalId}`,
        value: safeButtonValue(JSON.stringify({ ...JSON.parse(callbackValue), choice: 'original' })),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Customize'), emoji: true },
        action_id: `customize::${data.resourceType}::${data.approvalId}`,
        value: safeButtonValue(callbackValue),
      },
    ],
  });

  return {
    blocks,
    text: `Suggested changes for ${formatResourceType(data.resourceType)}`,
  };
};

/**
 * Build HITL Actioned Confirmation (replaces original message after action)
 */
export const buildHITLActionedConfirmation = (data: HITLActionedConfirmation): SlackMessage => {
  const blocks: SlackBlock[] = [];

  const actionConfig: Record<string, { emoji: string; label: string }> = {
    'approved': { emoji: '', label: 'Approved' },
    'rejected': { emoji: '', label: 'Rejected' },
    'edited': { emoji: '', label: 'Edited & Approved' },
  };

  const config = actionConfig[data.action] || { emoji: '', label: data.action };
  const userMention = data.slackUserId ? `<@${data.slackUserId}>` : data.actionedBy;
  const typeLabel = formatResourceType(data.resourceType);

  // Main confirmation message
  blocks.push(
    section(
      `${config.emoji} *${config.label}* by ${userMention}\n` +
        `_${typeLabel} • ${truncate(data.resourceName, 60)}_`
    )
  );

  // Edit summary (if edited)
  if (data.action === 'edited' && data.editSummary) {
    blocks.push(context([`${truncate(data.editSummary, 150)}`]));
  }

  // Rejection reason (if rejected)
  if (data.action === 'rejected' && data.rejectionReason) {
    blocks.push(context([`_"${truncate(data.rejectionReason, 150)}"_`]));
  }

  // Timestamp
  const formattedTime = new Date(data.timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  blocks.push(context([formattedTime]));

  return {
    blocks,
    text: `${config.label}: ${truncate(data.resourceName, 60)}`,
  };
};

/**
 * Morning Brief Data Interface
 */
export interface MorningBriefData {
  userName: string;
  slackUserId?: string;
  date: string;
  currencyCode?: string;
  currencyLocale?: string;
  meetings: Array<{
    id?: string;
    time: string;
    title: string;
    contactName?: string;
    companyName?: string;
    dealValue?: number;
    dealStage?: string;
    isImportant?: boolean;
    engagementPattern?: {
      avg_response_time_hours: number | null;
      best_email_day: string | null;
      best_email_hour: number | null;
      response_trend: string | null;
    } | null;
  }>;
  tasks: {
    overdue: Array<{
      id?: string;
      title: string;
      daysOverdue: number;
      dealName?: string;
      contactId?: string;
    }>;
    dueToday: Array<{
      id?: string;
      title: string;
      dealName?: string;
    }>;
  };
  deals: Array<{
    name: string;
    id: string;
    value: number;
    stage: string;
    closeDate?: string;
    daysUntilClose?: number;
    isAtRisk?: boolean;
    daysSinceActivity?: number;
    deltaTag?: string; // SLACK-008/014: 'NEW', 'STAGE: x → y', 'VALUE UP', 'STALE'
  }>;
  emailsToRespond: number;
  insights: string[];
  priorities: string[];
  // SLACK-011: Instantly campaign data
  campaigns?: Array<{
    id: string;
    name: string;
    newReplies: number;
    totalSent: number;
    bounceRate: number;
    completionPct: number;
    isNotable: boolean;
  }>;
  // SIG-010: Signal Watch — top heating and cooling deals
  signalWatch?: {
    heatingUp: Array<{
      deal_id: string;
      deal_name: string;
      deal_value: number | null;
      temperature: number;
      trend: string;
      signal_count_24h: number;
    }>;
    coolingDown: Array<{
      deal_id: string;
      deal_name: string;
      deal_value: number | null;
      temperature: number;
      trend: string;
      signal_count_24h: number;
    }>;
  };
  appUrl: string;
}

/**
 * Build Morning Brief Message
 */
export const buildMorningBriefMessage = (data: MorningBriefData): SlackMessage => {
  const blocks: SlackBlock[] = [];
  const userName = data.slackUserId ? `<@${data.slackUserId}>` : data.userName;
  const formatCurrency = (amount: number) => {
    if (!data.currencyCode) return `£${amount.toLocaleString()}`;
    return new Intl.NumberFormat(data.currencyLocale || 'en-GB', {
      style: 'currency',
      currency: data.currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Header
  blocks.push(header(safeHeaderText(`Good morning, ${data.userName}`)));

  blocks.push(section(safeMrkdwn(`*Here's your day at a glance*`)));
  blocks.push(divider());

  // Count actionable items for header subtitle
  const actionableCount =
    data.tasks.overdue.length +
    data.deals.filter(d => d.isAtRisk || (d.daysSinceActivity && d.daysSinceActivity > 5)).length;

  if (actionableCount > 0) {
    blocks.push(section(safeMrkdwn(`*${actionableCount} item${actionableCount !== 1 ? 's' : ''} need${actionableCount === 1 ? 's' : ''} attention*`)));
  } else {
    blocks.push(section(safeMrkdwn(`*Here's your day at a glance*`)));
  }
  blocks.push(divider());

  // ─── NEEDS ACTION section (deals at risk, overdue tasks) ───
  const needsAction: SlackBlock[] = [];

  // Deals needing attention (at-risk or stale)
  const urgentDeals = data.deals
    .filter(d => d.isAtRisk || (d.daysSinceActivity && d.daysSinceActivity > 5))
    .slice(0, 3);

  if (urgentDeals.length > 0) {
    urgentDeals.forEach(d => {
      const riskReason = d.daysSinceActivity && d.daysSinceActivity > 5
        ? `No activity for ${d.daysSinceActivity} days`
        : d.daysUntilClose !== undefined && d.daysUntilClose <= 0
          ? 'Close date passed'
          : 'At risk';
      // SLACK-008/014: Show delta tag if present
      const deltaLabel = d.deltaTag ? ` \`${d.deltaTag}\`` : '';
      needsAction.push(
        section(safeMrkdwn(
          `*${d.name}* — ${formatCurrency(d.value)}${deltaLabel}\n${riskReason}`
        ))
      );
      needsAction.push(actions([
        { text: 'Draft follow-up', actionId: `draft_followup::deal::${d.id}`, value: JSON.stringify({ dealId: d.id, dealName: d.name }), style: 'primary' },
        { text: 'View deal', actionId: 'view_deal', value: d.id, url: `${data.appUrl}/deals/${d.id}` },
        { text: 'Snooze', actionId: `snooze::deal::${d.id}`, value: JSON.stringify({ entityType: 'deal', entityId: d.id, entityName: d.name, duration: '3d' }) },
      ]));
    });
  }

  // Overdue tasks needing attention
  if (data.tasks.overdue.length > 0) {
    data.tasks.overdue.slice(0, 3).forEach(t => {
      const overdueLabel = `Overdue by ${t.daysOverdue} day${t.daysOverdue !== 1 ? 's' : ''}`;
      const dealCtx = t.dealName ? ` — ${t.dealName}` : '';
      needsAction.push(
        section(safeMrkdwn(`*${truncate(t.title, 80)}*${dealCtx}\n${overdueLabel}`))
      );
      if (t.id) {
        needsAction.push(actions([
          { text: 'Complete', actionId: 'task_complete', value: JSON.stringify({ taskId: t.id }) },
          { text: 'Snooze', actionId: `snooze::task::${t.id}`, value: JSON.stringify({ entityType: 'task', entityId: t.id, entityName: t.title, duration: '1d' }) },
          ...(t.contactId ? [{ text: 'Draft follow-up', actionId: `draft_followup::contact::${t.contactId}`, value: JSON.stringify({ contactId: t.contactId }) }] : []),
        ]));
      }
    });
  }

  if (needsAction.length > 0) {
    blocks.push(section(safeMrkdwn('*Needs attention*')));
    blocks.push(...needsAction);
    blocks.push(divider());
  }

  // ─── TODAY section (meetings with prep buttons) ───
  if (data.meetings.length > 0) {
    blocks.push(section(safeMrkdwn(`*Today — ${data.meetings.length} meeting${data.meetings.length !== 1 ? 's' : ''}*`)));
    data.meetings.slice(0, 5).forEach(m => {
      const dealInfo = m.dealValue ? ` _(${m.dealStage || 'Deal'}, ${formatCurrency(m.dealValue)})_` : '';
      if (m.id) {
        blocks.push(
          sectionWithButton(
            `${m.time} — ${m.title}${dealInfo}`,
            'Prep me',
            `prep_meeting::${m.id}`,
            JSON.stringify({ meetingId: m.id })
          )
        );
      } else {
        blocks.push(section(safeMrkdwn(`${m.time} — ${m.title}${dealInfo}`)));
      }
    });
    blocks.push(divider());
  }

  // ─── PRIORITIES section ───
  if (data.priorities.length > 0) {
    const prioritiesText = data.priorities
      .slice(0, 5)
      .map(p => `• ${p}`)
      .join('\n');
    blocks.push(section(safeMrkdwn(`*Priorities*\n\n${prioritiesText}`)));
  }

  // ─── TASKS section (due today only — overdue moved to Needs Action) ───
  if (data.tasks.dueToday.length > 0) {
    const tasksText = data.tasks.dueToday
      .slice(0, 3)
      .map(t => `• ${t.title}${t.dealName ? ` _(${t.dealName})_` : ''}`)
      .join('\n');
    blocks.push(section(safeMrkdwn(`*Due today*\n\n${tasksText}`)));
  }

  // ─── DEALS section (non-urgent deals closing this week) ───
  const nonUrgentDeals = data.deals
    .filter(d => !d.isAtRisk && !(d.daysSinceActivity && d.daysSinceActivity > 5))
    .slice(0, 3);

  if (nonUrgentDeals.length > 0) {
    const dealsText = nonUrgentDeals
      .map(d => {
        const closeInfo = d.daysUntilClose !== undefined
          ? ` _(closing in ${d.daysUntilClose} day${d.daysUntilClose !== 1 ? 's' : ''})_`
          : '';
        // SLACK-008/014: Show delta tag if present
        const deltaLabel = d.deltaTag ? ` \`${d.deltaTag}\`` : '';
        return `• ${d.name} — ${formatCurrency(d.value)}${deltaLabel}${closeInfo}`;
      })
      .join('\n');
    blocks.push(section(safeMrkdwn(`*Pipeline*\n\n${dealsText}`)));
  }

  // ─── CAMPAIGNS section (SLACK-011: Instantly campaign highlights) ───
  if (data.campaigns && data.campaigns.length > 0) {
    const notableCampaigns = data.campaigns.filter(c => c.isNotable);
    const campaignsToShow = notableCampaigns.length > 0 ? notableCampaigns : data.campaigns;

    const campaignLines = campaignsToShow.slice(0, 3).map(c => {
      const parts: string[] = [];
      if (c.newReplies > 0) parts.push(`${c.newReplies} new repl${c.newReplies !== 1 ? 'ies' : 'y'}`);
      if (c.bounceRate > 5) parts.push(`${c.bounceRate}% bounce`);
      if (c.completionPct >= 90) parts.push(`${c.completionPct}% complete`);
      if (parts.length === 0) parts.push(`${c.totalSent} sent`);
      return `• *${truncate(c.name, 40)}* — ${parts.join(', ')}`;
    });

    blocks.push(section(safeMrkdwn(`*Campaigns*\n\n${campaignLines.join('\n')}`)));
  }

  // ─── SIGNAL WATCH section (SIG-010: heating-up / cooling-down deals) ───
  if (data.signalWatch) {
    const { heatingUp, coolingDown } = data.signalWatch;
    const hasSignals = heatingUp.length > 0 || coolingDown.length > 0;
    if (hasSignals) {
      const signalLines: string[] = [];

      if (heatingUp.length > 0) {
        signalLines.push('*Heating up* :fire:');
        heatingUp.slice(0, 3).forEach(d => {
          const tempPct = Math.round(d.temperature * 100);
          const valueStr = d.deal_value != null ? ` — ${formatCurrency(d.deal_value)}` : '';
          const signalsStr = d.signal_count_24h > 0 ? ` _(${d.signal_count_24h} signal${d.signal_count_24h !== 1 ? 's' : ''} today)_` : '';
          signalLines.push(`  • *${truncate(d.deal_name, 40)}*${valueStr} · ${tempPct}% temp${signalsStr}`);
        });
      }

      if (coolingDown.length > 0) {
        if (heatingUp.length > 0) signalLines.push('');
        signalLines.push('*Cooling down* :snowflake:');
        coolingDown.slice(0, 3).forEach(d => {
          const tempPct = Math.round(d.temperature * 100);
          const valueStr = d.deal_value != null ? ` — ${formatCurrency(d.deal_value)}` : '';
          signalLines.push(`  • *${truncate(d.deal_name, 40)}*${valueStr} · ${tempPct}% temp`);
        });
      }

      blocks.push(divider());
      blocks.push(section(safeMrkdwn(`*Signal Watch*\n\n${signalLines.join('\n')}`)));
    }
  }

  // ─── EMAILS ───
  if (data.emailsToRespond > 0) {
    blocks.push(section(safeMrkdwn(`*${data.emailsToRespond} email${data.emailsToRespond !== 1 ? 's' : ''} need${data.emailsToRespond === 1 ? 's' : ''} response*`)));
  }

  // ─── INSIGHTS ───
  if (data.insights.length > 0) {
    blocks.push(divider());
    const insightsText = data.insights
      .slice(0, 3)
      .map(i => `• ${i}`)
      .join('\n');
    blocks.push(section(safeMrkdwn(`*Insights*\n\n${insightsText}`)));
  }

  blocks.push(divider());

  // ─── FOOTER ACTIONS ───
  blocks.push(actions([
    { text: 'View Full Day', actionId: 'view_full_day', value: 'calendar', url: `${data.appUrl}/calendar` },
    { text: 'Start Focus Mode', actionId: 'start_focus_mode', value: 'tasks', url: `${data.appUrl}/tasks` },
  ]));

  return {
    blocks,
    text: `Good morning ${data.userName}! ${actionableCount > 0 ? `${actionableCount} items need attention.` : 'Here\'s your day at a glance.'}`,
  };
};

/**
 * Stale Deal Alert Data Interface
 */
export interface StaleDealAlertData {
  userName: string;
  slackUserId?: string;
  deal: {
    name: string;
    id: string;
    value: number;
    stage: string;
    closeDate?: string;
    daysUntilClose?: number;
    daysSinceLastActivity: number;
    lastActivityDate?: string;
    lastActivityType?: string;
  };
  suggestedActions: string[];
  reEngagementDraft?: string;
  currencyCode?: string;
  currencyLocale?: string;
  appUrl: string;
}

/**
 * Build Stale Deal Alert Message
 */
export const buildStaleDealAlertMessage = (data: StaleDealAlertData): SlackMessage => {
  const blocks: SlackBlock[] = [];
  const userName = data.slackUserId ? `<@${data.slackUserId}>` : data.userName;
  const formatCurrency = (amount: number) => {
    if (!data.currencyCode) return `£${amount.toLocaleString()}`;
    return new Intl.NumberFormat(data.currencyLocale || 'en-GB', {
      style: 'currency',
      currency: data.currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Header
  blocks.push(header(safeHeaderText('Deal going cold')));

  // Entity context block (SLK-006) — deal name + last activity date
  const staleEntityCtx = entityContextBlock({
    dealName: data.deal.name,
    dealStage: data.deal.stage,
    lastActivity: data.deal.lastActivityDate
      ? new Date(data.deal.lastActivityDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : `${data.deal.daysSinceLastActivity} days ago`,
  });
  if (staleEntityCtx) blocks.push(staleEntityCtx);

  blocks.push(section(safeMrkdwn(
    `*${data.deal.name}* - No activity in *${data.deal.daysSinceLastActivity} day${data.deal.daysSinceLastActivity !== 1 ? 's' : ''}*`
  )));

  // Context
  const contextParts: string[] = [];
  contextParts.push(`${formatCurrency(data.deal.value)}`);
  contextParts.push(`${data.deal.stage} stage`);
  if (data.deal.closeDate) {
    const daysUntilClose = data.deal.daysUntilClose || 0;
    if (daysUntilClose > 0) {
      contextParts.push(`Close date: ${daysUntilClose} day${daysUntilClose !== 1 ? 's' : ''} away`);
    } else {
      contextParts.push(`Close date: ${Math.abs(daysUntilClose)} day${Math.abs(daysUntilClose) !== 1 ? 's' : ''} overdue`);
    }
  }
  if (data.deal.lastActivityDate) {
    contextParts.push(`Last activity: ${new Date(data.deal.lastActivityDate).toLocaleDateString()}`);
  }

  blocks.push(context([safeContextMrkdwn(contextParts.join(' • '))]));
  blocks.push(divider());

  // Activity timeline
  if (data.deal.lastActivityType) {
    blocks.push(section(safeMrkdwn(
      `*Last activity*\n\n• ${data.deal.lastActivityType}${data.deal.lastActivityDate ? ` (${new Date(data.deal.lastActivityDate).toLocaleDateString()})` : ''}\n• _${data.deal.daysSinceLastActivity} days of silence..._`
    )));
  }

  // Suggested actions
  if (data.suggestedActions.length > 0) {
    const actionsText = data.suggestedActions
      .slice(0, 3)
      .map(a => `• ${a}`)
      .join('\n');
    
    blocks.push(section(safeMrkdwn(`*Suggested next steps*\n\n${actionsText}`)));
  }

  // Re-engagement draft (if available)
  if (data.reEngagementDraft) {
    blocks.push(divider());
    blocks.push(section(safeMrkdwn(`*Re-engagement draft*`)));
    blocks.push(section(safeMrkdwn(`_${safeMrkdwn(data.reEngagementDraft.substring(0, 500))}_`)));
  }

  blocks.push(divider());

  // Actions
  blocks.push(actions([
    {
      text: { type: 'plain_text', text: safeButtonText('Open Deal'), emoji: true },
      url: `${data.appUrl}/deals/${data.deal.id}`,
      action_id: 'open_deal',
    },
    {
      text: { type: 'plain_text', text: safeButtonText('Create Task'), emoji: true },
      action_id: 'create_task',
      value: safeButtonValue(JSON.stringify({ dealId: data.deal.id, dealName: data.deal.name })),
    },
    {
      text: { type: 'plain_text', text: safeButtonText('Send Check-in'), emoji: true },
      action_id: 'send_checkin',
      value: safeButtonValue(JSON.stringify({ dealId: data.deal.id })),
    },
  ]));

  return {
    blocks,
    text: `Deal ${data.deal.name} has no activity in ${data.deal.daysSinceLastActivity} days.`,
  };
};

/**
 * Email Reply Alert Data Interface
 */
export interface EmailReplyAlertData {
  userName: string;
  slackUserId?: string;
  email: {
    subject: string;
    from: string;
    fromName?: string;
    threadId?: string;
    receivedAt: string;
  };
  contact?: {
    name: string;
    companyName?: string;
  };
  deal?: {
    name: string;
    id: string;
    stage: string;
  };
  sentiment: 'positive' | 'neutral' | 'negative';
  keyPoints: string[];
  suggestedReply?: string;
  suggestedActions: string[];
  appUrl: string;
}

/**
 * Build Email Reply Alert Message
 */
export const buildEmailReplyAlertMessage = (data: EmailReplyAlertData): SlackMessage => {
  const blocks: SlackBlock[] = [];
  const userName = data.slackUserId ? `<@${data.slackUserId}>` : data.userName;
  const sentimentEmoji = '';

  // Header
  blocks.push(header(safeHeaderText('Reply received')));

  // Entity context block (SLK-006) — contact name + company + deal context
  const emailEntityCtx = entityContextBlock({
    contactName: data.contact?.name,
    companyName: data.contact?.companyName,
    dealName: data.deal?.name,
    dealStage: data.deal?.stage,
  });
  if (emailEntityCtx) blocks.push(emailEntityCtx);

  const fromDisplay = data.contact?.name || data.email.fromName || data.email.from;
  const contextText = data.deal
    ? `*${fromDisplay}* from *${data.contact?.companyName || 'Unknown'}* replied to your email`
    : `*${fromDisplay}* replied to your email`;

  blocks.push(section(safeMrkdwn(contextText)));

  // Context
  const contextParts: string[] = [];
  contextParts.push(`${sentimentEmoji} ${data.sentiment.charAt(0).toUpperCase() + data.sentiment.slice(1)} sentiment`);
  contextParts.push(`Re: ${truncate(data.email.subject, 40)}`);
  contextParts.push(`Just now`);
  blocks.push(context([safeContextMrkdwn(contextParts.join(' • '))]));
  blocks.push(divider());

  // Key points
  if (data.keyPoints.length > 0) {
    const pointsText = data.keyPoints
      .slice(0, 5)
      .map(p => `• ${p}`)
      .join('\n');
    
    blocks.push(section(safeMrkdwn(`*Key points detected*\n\n${pointsText}`)));
  }

  // Deal context
  if (data.deal) {
    blocks.push(section(safeMrkdwn(
      `*Deal context*\n• ${data.deal.name} • ${data.deal.stage} stage`
    )));
  }

  // Suggested reply
  if (data.suggestedReply) {
    blocks.push(divider());
    blocks.push(section(safeMrkdwn(`*Suggested reply*`)));
    blocks.push(section(safeMrkdwn(`_${safeMrkdwn(data.suggestedReply.substring(0, 800))}_`)));
  }

  // Suggested actions
  if (data.suggestedActions.length > 0) {
    blocks.push(divider());
    const actionsText = data.suggestedActions
      .slice(0, 3)
      .map(a => `• ${a}`)
      .join('\n');
    
    blocks.push(section(safeMrkdwn(`*Suggested next steps*\n\n${actionsText}`)));
  }

  blocks.push(divider());

  // Actions
  const actionButtons: any[] = [
    {
      text: { type: 'plain_text', text: safeButtonText('Reply'), emoji: true },
      style: 'primary',
      action_id: 'reply_email',
      value: safeButtonValue(JSON.stringify({ 
        threadId: data.email.threadId,
        from: data.email.from,
      })),
    },
  ];

  if (data.suggestedReply) {
    actionButtons.push({
      text: { type: 'plain_text', text: safeButtonText('Edit First'), emoji: true },
      action_id: 'edit_reply',
      value: safeButtonValue(JSON.stringify({ 
        threadId: data.email.threadId,
        draft: data.suggestedReply,
      })),
    });
  }

  if (data.deal) {
    actionButtons.push({
      text: { type: 'plain_text', text: safeButtonText('Update Deal'), emoji: true },
      action_id: 'update_deal',
      value: safeButtonValue(JSON.stringify({ dealId: data.deal.id })),
    });
  }

  actionButtons.push({
    text: { type: 'plain_text', text: safeButtonText('View Email'), emoji: true },
    url: `${data.appUrl}/emails${data.email.threadId ? `?thread=${data.email.threadId}` : ''}`,
    action_id: 'view_email',
  });

  blocks.push(actions(actionButtons));

  return {
    blocks,
    text: `Reply from ${fromDisplay}: ${data.email.subject}`,
  };
};

// =============================================================================
// SLASH COMMAND BLOCK BUILDERS
// =============================================================================

/**
 * Contact Card Data for /sixty contact
 */
export interface ContactCardData {
  contact: {
    id: string;
    email: string | null;
    full_name: string | null;
    phone: string | null;
    title: string | null;
    company: string | null;
    source: 'sixty' | 'hubspot';
  };
  dealContext?: {
    id: string;
    name: string;
    value: number;
    stage: string;
  };
  lastTouch?: {
    date: string;
    type: string;
    summary?: string;
  };
  nextStep?: string;
  riskSignals?: string[];
  healthScore?: number;
  totalMeetings?: number;
  currencyCode?: string;
  currencyLocale?: string;
  appUrl: string;
}

/**
 * Build Contact Card for /sixty contact command
 */
export const buildContactCardMessage = (data: ContactCardData): SlackMessage => {
  const blocks: SlackBlock[] = [];
  const c = data.contact;
  const sourceBadge = c.source === 'hubspot' ? ' (HubSpot)' : '';

  // Header with name and company
  const headerText = c.company
    ? `${truncate(c.full_name || 'Unknown', 50)} - ${truncate(c.company, 40)}`
    : `${truncate(c.full_name || 'Unknown', 80)}`;
  blocks.push(header(headerText));

  // Contact details as fields
  const fields: Array<{ label: string; value: string }> = [];

  if (c.email) {
    fields.push({ label: 'Email', value: c.email });
  }
  if (c.phone) {
    fields.push({ label: 'Phone', value: c.phone });
  }
  if (c.title) {
    fields.push({ label: 'Title', value: c.title });
  }
  if (data.healthScore !== undefined) {
    const healthEmoji = '';
    fields.push({ label: 'Health', value: `${healthEmoji} ${data.healthScore}%` });
  }

  if (fields.length > 0) {
    blocks.push(sectionWithFields(fields));
  }

  blocks.push(divider());

  // Deal context
  if (data.dealContext) {
    const dealValue = formatCurrency(data.dealContext.value, data.currencyCode, data.currencyLocale);
    blocks.push(section(`*Active Deal:* ${truncate(data.dealContext.name, 60)} - ${dealValue} (${data.dealContext.stage})`));
  }

  // Last touch
  if (data.lastTouch) {
    const touchDate = new Date(data.lastTouch.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const touchSummary = data.lastTouch.summary ? ` - ${truncate(data.lastTouch.summary, 60)}` : '';
    blocks.push(section(`*Last Touch:* ${touchDate} - ${data.lastTouch.type}${touchSummary}`));
  }

  // Next step
  if (data.nextStep) {
    blocks.push(section(`*Next Step:* ${truncate(data.nextStep, 100)}`));
  }

  // Risk signals
  if (data.riskSignals && data.riskSignals.length > 0) {
    const riskLines = data.riskSignals.slice(0, 2).map(r => `• ${truncate(r, 80)}`);
    blocks.push(section(riskLines.join('\n')));
  }

  blocks.push(divider());

  // Action buttons
  const buttonRow: Array<{ text: string; actionId: string; value: string; url?: string; style?: 'primary' }> = [];

  buttonRow.push({
    text: 'Create Task',
    actionId: 'create_task_for_contact',
    value: JSON.stringify({ contactId: c.id, contactName: c.full_name }),
    style: 'primary',
  });

  buttonRow.push({
    text: 'Draft Follow-up',
    actionId: 'draft_followup_contact',
    value: JSON.stringify({ contactId: c.id, contactName: c.full_name, email: c.email }),
  });

  if (data.dealContext) {
    buttonRow.push({
      text: 'View Deal',
      actionId: 'view_deal',
      value: data.dealContext.id,
      url: `${data.appUrl}/deals/${data.dealContext.id}`,
    });
  }

  blocks.push(actions(buttonRow.slice(0, 3)));

  // Source badge context
  const contextItems: string[] = [];
  if (data.totalMeetings) {
    contextItems.push(`${data.totalMeetings} meeting${data.totalMeetings !== 1 ? 's' : ''}`);
  }
  contextItems.push(`Source: ${c.source === 'hubspot' ? 'HubSpot' : 'Sixty'}`);
  blocks.push(context(contextItems));

  // Deep link footer (SLK-005)
  const linkFooter = buildLinkFooter({
    appUrl: data.appUrl,
    contactId: c.id,
    contactName: c.full_name || undefined,
    dealId: data.dealContext?.id,
    dealName: data.dealContext?.name,
  });
  if (linkFooter) blocks.push(linkFooter);

  return {
    blocks,
    text: `Contact: ${c.full_name || 'Unknown'} - ${c.company || 'No company'}`,
  };
};

/**
 * Deal Snapshot Data for /sixty deal
 */
export interface DealSnapshotData {
  deal: {
    id: string;
    name: string;
    company: string | null;
    value: number;
    stage: string;
    stageName?: string;
    expectedCloseDate: string | null;
    probability?: number;
    source: 'sixty' | 'hubspot';
  };
  primaryContact?: {
    name: string;
    email?: string;
    title?: string;
  };
  daysInStage?: number;
  nextSteps?: string;
  recentActivity?: Array<{
    date: string;
    type: string;
    summary?: string;
  }>;
  risks?: string[];
  currencyCode?: string;
  currencyLocale?: string;
  appUrl: string;
}

/**
 * Build Deal Snapshot for /sixty deal command
 */
export const buildDealSnapshotMessage = (data: DealSnapshotData): SlackMessage => {
  const blocks: SlackBlock[] = [];
  const d = data.deal;
  const dealValue = formatCurrency(d.value, data.currencyCode, data.currencyLocale);
  const sourceBadge = d.source === 'hubspot' ? ' (HubSpot)' : '';

  // Header
  const headerText = d.company
    ? `${truncate(d.name, 50)} - ${truncate(d.company, 40)}`
    : `${truncate(d.name, 100)}`;
  blocks.push(header(headerText));

  // Key metrics as fields
  const fields: Array<{ label: string; value: string }> = [];
  fields.push({ label: 'Value', value: dealValue });
  fields.push({ label: 'Stage', value: d.stageName || d.stage });

  if (d.expectedCloseDate) {
    const closeDate = new Date(d.expectedCloseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    fields.push({ label: 'Expected Close', value: closeDate });
  }

  if (d.probability !== undefined) {
    fields.push({ label: 'Probability', value: `${d.probability}%` });
  }

  blocks.push(sectionWithFields(fields));

  // Primary contact
  if (data.primaryContact) {
    const titlePart = data.primaryContact.title ? ` (${data.primaryContact.title})` : '';
    blocks.push(section(`*Primary:* ${truncate(data.primaryContact.name, 50)}${titlePart}`));
  }

  // Days in stage
  if (data.daysInStage !== undefined) {
    const emoji = '';
    blocks.push(section(`${emoji} *Days in Stage:* ${data.daysInStage}`));
  }

  blocks.push(divider());

  // Recent activity
  if (data.recentActivity && data.recentActivity.length > 0) {
    const activityLines = data.recentActivity.slice(0, 3).map(a => {
      const date = new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const summary = a.summary ? ` - ${truncate(a.summary, 40)}` : '';
      return `• ${date} - ${a.type}${summary}`;
    });
    blocks.push(section(`*Recent Activity:*\n${activityLines.join('\n')}`));
  }

  // Risks
  if (data.risks && data.risks.length > 0) {
    const riskLines = data.risks.slice(0, 2).map(r => `• ${truncate(r, 80)}`);
    blocks.push(section(`*Risks:*\n${riskLines.join('\n')}`));
  }

  blocks.push(divider());

  // Action buttons
  blocks.push(actions([
    {
      text: 'Update Stage',
      actionId: 'update_deal_stage',
      value: JSON.stringify({ dealId: d.id, dealName: d.name }),
      style: 'primary',
    },
    {
      text: 'Log Activity',
      actionId: 'log_deal_activity',
      value: JSON.stringify({ dealId: d.id, dealName: d.name }),
    },
    {
      text: 'Create Task',
      actionId: 'create_task_for_deal',
      value: JSON.stringify({ dealId: d.id, dealName: d.name }),
    },
  ]));

  // More actions row
  blocks.push(actions([
    {
      text: 'Draft Check-in',
      actionId: 'draft_checkin_deal',
      value: JSON.stringify({ dealId: d.id, dealName: d.name, contactEmail: data.primaryContact?.email }),
    },
    {
      text: 'View in App',
      actionId: 'view_deal',
      value: d.id,
      url: `${data.appUrl}/deals/${d.id}`,
    },
  ]));

  // Source context
  blocks.push(context([`Source: ${d.source === 'hubspot' ? 'HubSpot' : 'Sixty'}`]));

  return {
    blocks,
    text: `Deal: ${d.name} - ${dealValue} (${d.stageName || d.stage})`,
  };
};

/**
 * Day at a Glance Data for /sixty today
 */
export interface DayAtGlanceData {
  userName: string;
  slackUserId?: string;
  date: string;
  currencyCode?: string;
  currencyLocale?: string;
  meetings: Array<{
    time: string;
    title: string;
    companyName?: string;
    dealValue?: number;
    meetingId?: string;
  }>;
  tasks: {
    overdue: Array<{ title: string; daysOverdue: number; dealName?: string }>;
    dueToday: Array<{ title: string; dealName?: string }>;
  };
  dealsClosingThisWeek: Array<{
    id: string;
    name: string;
    value: number;
    stage: string;
    daysUntilClose?: number;
  }>;
  emailsToRespond: number;
  ghostRiskContacts?: number;
  appUrl: string;
}

/**
 * Build Day at a Glance for /sixty today command
 */
export const buildDayAtGlanceMessage = (data: DayAtGlanceData): SlackMessage => {
  const blocks: SlackBlock[] = [];
  const userMention = data.slackUserId ? `<@${data.slackUserId}>` : data.userName;

  // Header
  blocks.push(header('Today at a Glance'));
  blocks.push(context([`${data.date} • ${userMention}`]));

  blocks.push(divider());

  // Meetings section
  if (data.meetings.length > 0) {
    const meetingLines = data.meetings.slice(0, 5).map(m => {
      const company = m.companyName ? ` (${truncate(m.companyName, 20)})` : '';
      const deal = m.dealValue ? ` - ${formatCurrency(m.dealValue, data.currencyCode, data.currencyLocale)}` : '';
      return `• *${m.time}* - ${truncate(m.title, 40)}${company}${deal}`;
    });
    blocks.push(section(`*${data.meetings.length} Meeting${data.meetings.length !== 1 ? 's' : ''}*\n${meetingLines.join('\n')}`));
  } else {
    blocks.push(section(`*No meetings today* - Focus time!`));
  }

  // Tasks section
  const totalTasks = data.tasks.overdue.length + data.tasks.dueToday.length;
  if (totalTasks > 0) {
    const taskLines: string[] = [];

    data.tasks.overdue.slice(0, 2).forEach(t => {
      taskLines.push(`${truncate(t.title, 50)} _(${t.daysOverdue}d overdue)_`);
    });

    data.tasks.dueToday.slice(0, 3).forEach(t => {
      taskLines.push(`• ${truncate(t.title, 60)}`);
    });

    blocks.push(section(`*${totalTasks} Task${totalTasks !== 1 ? 's' : ''} Due*\n${taskLines.join('\n')}`));

    if (data.tasks.overdue.length > 2 || data.tasks.dueToday.length > 3) {
      const moreCount = Math.max(0, data.tasks.overdue.length - 2) + Math.max(0, data.tasks.dueToday.length - 3);
      blocks.push(context([`+ ${moreCount} more tasks`]));
    }
  }

  // Deals closing this week
  if (data.dealsClosingThisWeek.length > 0) {
    const dealLines = data.dealsClosingThisWeek.slice(0, 3).map(d => {
      const closeInfo = d.daysUntilClose !== undefined && d.daysUntilClose >= 0
        ? ` _(${d.daysUntilClose === 0 ? 'today' : `${d.daysUntilClose}d`})_`
        : '';
      return `• ${truncate(d.name, 35)} - ${formatCurrency(d.value, data.currencyCode, data.currencyLocale)} - ${d.stage}${closeInfo}`;
    });
    blocks.push(section(`*${data.dealsClosingThisWeek.length} Deal${data.dealsClosingThisWeek.length !== 1 ? 's' : ''} Closing This Week*\n${dealLines.join('\n')}`));
  }

  // Email and engagement alerts
  const alerts: string[] = [];
  if (data.emailsToRespond > 0) {
    alerts.push(`${data.emailsToRespond} email${data.emailsToRespond !== 1 ? 's' : ''} need response`);
  }
  if (data.ghostRiskContacts && data.ghostRiskContacts > 0) {
    alerts.push(`${data.ghostRiskContacts} contact${data.ghostRiskContacts !== 1 ? 's' : ''} going cold`);
  }

  if (alerts.length > 0) {
    blocks.push(section(alerts.join('\n')));
  }

  blocks.push(divider());

  // Action buttons
  blocks.push(actions([
    {
      text: 'View Dashboard',
      actionId: 'view_dashboard',
      value: 'dashboard',
      url: `${data.appUrl}/dashboard`,
      style: 'primary',
    },
    {
      text: 'All Tasks',
      actionId: 'view_tasks',
      value: 'tasks',
      url: `${data.appUrl}/tasks`,
    },
    {
      text: 'Refresh',
      actionId: 'refresh_today',
      value: 'refresh',
    },
  ]));

  return {
    blocks,
    text: `Today at a Glance: ${data.meetings.length} meetings, ${totalTasks} tasks`,
  };
};

/**
 * Follow-up Draft Data for /sixty follow-up HITL
 */
export interface FollowUpDraftData {
  approvalId: string;
  recipient: {
    name: string;
    email: string;
    company?: string;
  };
  subject: string;
  body: string;
  context?: {
    dealName?: string;
    dealId?: string;
    lastMeetingDate?: string;
    lastMeetingTitle?: string;
  };
  confidence: number;
  appUrl: string;
}

/**
 * Build Follow-up Draft HITL for /sixty follow-up command
 */
export const buildFollowUpDraftMessage = (data: FollowUpDraftData): SlackMessage => {
  const blocks: SlackBlock[] = [];

  // Header
  blocks.push(header('Follow-up Draft'));

  // Context
  const contextParts: string[] = [];
  if (data.recipient.company) {
    contextParts.push(`${data.recipient.name} @ ${data.recipient.company}`);
  } else {
    contextParts.push(`${data.recipient.name}`);
  }
  if (data.context?.dealName) {
    contextParts.push(`${truncate(data.context.dealName, 30)}`);
  }
  contextParts.push(`${data.confidence}% confidence`);
  blocks.push(context(contextParts));

  blocks.push(divider());

  // Email preview
  blocks.push(section(`*To:* ${data.recipient.email}`));
  blocks.push(section(`*Subject:* ${truncate(data.subject, 150)}`));
  blocks.push(section(`*Message:*\n${truncate(data.body, 800)}`));

  // Meeting context
  if (data.context?.lastMeetingDate) {
    const meetingDate = new Date(data.context.lastMeetingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    blocks.push(context([`Last meeting: ${meetingDate}${data.context.lastMeetingTitle ? ` - ${truncate(data.context.lastMeetingTitle, 40)}` : ''}`]));
  }

  blocks.push(divider());

  // HITL action buttons
  const callbackValue = JSON.stringify({
    approvalId: data.approvalId,
    recipientEmail: data.recipient.email,
    subject: data.subject,
    body: data.body,
    dealId: data.context?.dealId,
  });

  blocks.push({
    type: 'actions',
    block_id: `followup_actions::${data.approvalId}`,
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Approve & Send'), emoji: true },
        style: 'primary',
        action_id: `approve::follow_up::${data.approvalId}`,
        value: safeButtonValue(callbackValue),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Edit'), emoji: true },
        action_id: `edit::follow_up::${data.approvalId}`,
        value: safeButtonValue(callbackValue),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Reject'), emoji: true },
        style: 'danger',
        action_id: `reject::follow_up::${data.approvalId}`,
        value: safeButtonValue(callbackValue),
      },
    ],
  });

  // Deep link footer (SLK-005)
  const followUpLinkFooter = buildLinkFooter({
    appUrl: data.appUrl,
    dealId: data.context?.dealId,
    dealName: data.context?.dealName,
  });
  if (followUpLinkFooter) blocks.push(followUpLinkFooter);

  return {
    blocks,
    text: `Follow-up draft for ${data.recipient.name}: ${truncate(data.subject, 60)}`,
  };
};

/**
 * Search Results Picker for disambiguation
 */
export interface SearchResultsPickerData {
  query: string;
  entityType: 'contact' | 'deal';
  results: Array<{
    id: string;
    displayName: string;
    subtitle?: string;
    source: 'sixty' | 'hubspot';
  }>;
  showCrmButton: boolean;
  crmAvailable: boolean;
}

/**
 * Build Search Results Picker for ambiguous queries
 */
export const buildSearchResultsPickerMessage = (data: SearchResultsPickerData): SlackMessage => {
  const blocks: SlackBlock[] = [];
  const emoji = '';
  const label = data.entityType === 'contact' ? 'Contacts' : 'Deals';

  blocks.push(header(`${emoji} ${label} matching "${truncate(data.query, 30)}"`));

  if (data.results.length === 0) {
    blocks.push(section(`No ${label.toLowerCase()} found matching your query.`));

    if (data.crmAvailable && data.showCrmButton) {
      blocks.push(actions([
        {
          text: 'Search CRM',
          actionId: `search_crm_${data.entityType}`,
          value: JSON.stringify({ query: data.query, entityType: data.entityType }),
          style: 'primary',
        },
      ]));
    }
  } else {
    // Show results as buttons
    const resultButtons = data.results.slice(0, 5).map((r, i) => {
      const sourceBadge = r.source === 'hubspot' ? ' (HubSpot)' : '';
      return {
        text: `${truncate(r.displayName, 35)}${sourceBadge}`,
        actionId: `select_${data.entityType}_${i}`,
        value: JSON.stringify({ id: r.id, source: r.source }),
      };
    });

    blocks.push(actions(resultButtons));

    // Show subtitles as context
    const contextItems = data.results.slice(0, 5)
      .filter(r => r.subtitle)
      .map(r => `${truncate(r.displayName, 20)}: ${truncate(r.subtitle || '', 30)}`);

    if (contextItems.length > 0) {
      blocks.push(context(contextItems));
    }

    // CRM search fallback
    if (data.crmAvailable && data.showCrmButton && data.results.every(r => r.source === 'sixty')) {
      blocks.push(divider());
      blocks.push(actions([
        {
          text: 'Search CRM for more',
          actionId: `search_crm_${data.entityType}`,
          value: JSON.stringify({ query: data.query, entityType: data.entityType }),
        },
      ]));
    }
  }

  return {
    blocks,
    text: `Found ${data.results.length} ${label.toLowerCase()} matching "${data.query}"`,
  };
};

// =============================================================================
// DEAL MOMENTUM CARD
// =============================================================================

/**
 * Deal Truth Field for momentum card
 */
export interface DealMomentumTruthField {
  fieldKey: string;
  label: string;
  value: string | null;
  confidence: number; // 0-1
  contactName?: string;
  championStrength?: 'strong' | 'moderate' | 'weak' | 'unknown';
  nextStepDate?: string;
  isWarning?: boolean; // Low confidence or missing
}

/**
 * Close Plan Milestone for momentum card
 */
export interface DealMomentumMilestone {
  milestoneKey: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'skipped';
  ownerName?: string;
  dueDate?: string;
  isOverdue?: boolean;
  blockerNote?: string;
}

/**
 * Deal Momentum Card Data
 */
export interface DealMomentumData {
  deal: {
    id: string;
    name: string;
    company: string | null;
    value: number;
    stage: string;
    stageName?: string;
  };
  scores: {
    momentum: number;      // 0-100 overall momentum
    clarity: number;       // 0-100 clarity score
    health?: number;       // 0-100 health score
    risk?: number;         // 0-100 risk score (higher = more risky)
  };
  truthFields: DealMomentumTruthField[];
  closePlan: {
    completed: number;
    total: number;
    overdue: number;
    blocked: number;
    milestones: DealMomentumMilestone[];
  };
  recommendedActions: string[];
  currencyCode?: string;
  currencyLocale?: string;
  appUrl: string;
}

/**
 * Get momentum score indicator
 */
const getMomentumIndicator = (score: number): { emoji: string; label: string; color: string } => {
  if (score >= 80) return { emoji: '', label: 'Strong', color: 'good' };
  if (score >= 60) return { emoji: '', label: 'Fair', color: 'warning' };
  if (score >= 40) return { emoji: '', label: 'Needs Attention', color: 'warning' };
  return { emoji: '', label: 'At Risk', color: 'danger' };
};

/**
 * Get confidence indicator
 */
const getConfidenceIndicator = (confidence: number): string => {
  if (confidence >= 0.8) return '';       // High confidence, no indicator needed
  if (confidence >= 0.6) return ' [?]';      // Medium confidence
  return ' [!]';                             // Low confidence - needs attention
};

/**
 * Format truth field value for display
 */
const formatTruthFieldValue = (field: DealMomentumTruthField): string => {
  const indicator = getConfidenceIndicator(field.confidence);
  const warning = field.isWarning ? ' [!]' : '';

  if (!field.value) {
    return `_Not defined_${warning}`;
  }

  // Special formatting for champion with strength
  if (field.fieldKey === 'champion' && field.contactName) {
    const strengthLabel = field.championStrength
      ? ` (${field.championStrength})`
      : '';
    return `${field.contactName}${strengthLabel}${indicator}`;
  }

  // Special formatting for next step with date
  if (field.fieldKey === 'next_step') {
    if (field.nextStepDate) {
      const date = new Date(field.nextStepDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `"${truncate(field.value, 35)}" - ${date}${indicator}`;
    }
    return `"${truncate(field.value, 40)}" - _No date set_${warning}`;
  }

  // Special formatting for economic buyer
  if (field.fieldKey === 'economic_buyer' && field.contactName) {
    return `${field.contactName}${indicator}`;
  }

  // Default formatting
  return `"${truncate(field.value, 50)}"${indicator}`;
};

/**
 * Get milestone status icon
 */
const getMilestoneIcon = (milestone: DealMomentumMilestone): string => {
  switch (milestone.status) {
    case 'completed': return '[done]';
    case 'in_progress': return '[...]';
    case 'blocked': return '[blocked]';
    case 'skipped': return '[skip]';
    default: return milestone.isOverdue ? '[!]' : '[ ]';
  }
};

/**
 * Build progress bar for close plan
 */
const buildProgressBar = (completed: number, total: number, width: number = 10): string => {
  const pct = total > 0 ? completed / total : 0;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
};

/**
 * Build Deal Momentum Card for /sixty deal command and proactive notifications
 */
export const buildDealMomentumMessage = (data: DealMomentumData): SlackMessage => {
  const blocks: SlackBlock[] = [];
  const d = data.deal;
  const dealValue = formatCurrency(d.value, data.currencyCode, data.currencyLocale);

  // Header with deal info
  const headerText = d.company
    ? `${truncate(d.name, 40)} - ${truncate(d.company, 30)}`
    : truncate(d.name, 75);
  blocks.push(header(`${headerText}`));

  // Momentum + Key metrics
  const momentum = getMomentumIndicator(data.scores.momentum);
  const metricsLine = [
    `*${momentum.emoji} Momentum:* ${data.scores.momentum}%`,
    `*Value:* ${dealValue}`,
    `*Stage:* ${d.stageName || d.stage}`,
  ].join('  •  ');
  blocks.push(section(metricsLine));

  blocks.push(divider());

  // Deal Truth Section
  const clarityPct = data.scores.clarity;
  const clarityEmoji = '';
  blocks.push(section(`*${clarityEmoji} Deal Truth* (Clarity: ${clarityPct}%)`));

  // Display truth fields with indicators
  const truthFieldLines: string[] = [];
  for (const field of data.truthFields) {
    const value = formatTruthFieldValue(field);
    truthFieldLines.push(`• *${field.label}:* ${value}`);
  }
  if (truthFieldLines.length > 0) {
    blocks.push(section(truthFieldLines.join('\n')));
  }

  blocks.push(divider());

  // Close Plan Section
  const cp = data.closePlan;
  const progressBar = buildProgressBar(cp.completed, cp.total);
  const overdueText = cp.overdue > 0 ? ` ${cp.overdue} overdue` : '';
  const blockedText = cp.blocked > 0 ? ` ${cp.blocked} blocked` : '';
  blocks.push(section(`*Close Plan* (${cp.completed}/${cp.total}) ${progressBar}${overdueText}${blockedText}`));

  // Display milestones
  const milestoneLines: string[] = [];
  for (const m of cp.milestones) {
    const icon = getMilestoneIcon(m);
    let line = `${icon} ${m.title}`;

    // Add due date and owner for non-completed milestones
    if (m.status !== 'completed' && m.status !== 'skipped') {
      const parts: string[] = [];
      if (m.dueDate) {
        const date = new Date(m.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        parts.push(`Due: ${date}`);
      }
      if (m.ownerName) {
        parts.push(`@${m.ownerName}`);
      }
      if (parts.length > 0) {
        line += ` - ${parts.join(' ')}`;
      }
      if (m.status === 'blocked' && m.blockerNote) {
        line += `\n    _Blocked: ${truncate(m.blockerNote, 50)}_`;
      }
    }
    milestoneLines.push(line);
  }
  if (milestoneLines.length > 0) {
    blocks.push(section(milestoneLines.join('\n')));
  }

  // Recommended Actions Section (if any)
  if (data.recommendedActions.length > 0) {
    blocks.push(divider());
    blocks.push(section(`*Recommended Actions:*`));
    const actionLines = data.recommendedActions.slice(0, 3).map(a => `• ${truncate(a, 80)}`);
    blocks.push(section(actionLines.join('\n')));
  }

  blocks.push(divider());

  // Action buttons - Row 1: Primary actions
  blocks.push(actions([
    {
      text: 'Set Next Step',
      actionId: 'set_deal_next_step',
      value: JSON.stringify({ dealId: d.id, dealName: d.name }),
      style: 'primary',
    },
    {
      text: 'Mark Milestone',
      actionId: 'complete_deal_milestone',
      value: JSON.stringify({ dealId: d.id, dealName: d.name }),
    },
    {
      text: 'Log Activity',
      actionId: 'log_deal_activity',
      value: JSON.stringify({ dealId: d.id, dealName: d.name }),
    },
  ]));

  // Action buttons - Row 2: Secondary actions
  blocks.push(actions([
    {
      text: 'Create Task',
      actionId: 'create_task_for_deal',
      value: JSON.stringify({ dealId: d.id, dealName: d.name }),
    },
    {
      text: 'View in App',
      actionId: 'view_deal',
      value: d.id,
      url: `${data.appUrl}/deals/${d.id}`,
    },
  ]));

  // Score context
  const scoreContext: string[] = [];
  if (data.scores.health !== undefined) {
    scoreContext.push(`Health: ${data.scores.health}%`);
  }
  if (data.scores.risk !== undefined) {
    const riskLevel = data.scores.risk >= 70 ? 'High' : data.scores.risk >= 40 ? 'Medium' : 'Low';
    scoreContext.push(`Risk: ${riskLevel}`);
  }
  scoreContext.push(`Clarity: ${data.scores.clarity}%`);
  blocks.push(context(scoreContext));

  return {
    blocks,
    text: `Deal Momentum: ${d.name} - ${momentum.label} (${data.scores.momentum}%)`,
  };
};

/**
 * Build Clarification Question Card for Slack DM
 * Used when we need user to confirm low-confidence fields
 */
export interface ClarificationQuestionData {
  dealId: string;
  dealName: string;
  companyName?: string;
  fieldKey: string;
  fieldLabel: string;
  question: string;
  currentValue?: string;
  suggestedOptions?: Array<{
    id: string;
    label: string;
  }>;
  appUrl: string;
}

export const buildClarificationQuestionMessage = (data: ClarificationQuestionData): SlackMessage => {
  const blocks: SlackBlock[] = [];

  // Header with deal context
  const dealLabel = data.companyName
    ? `${data.dealName} (${data.companyName})`
    : data.dealName;
  blocks.push(section(`*Quick question about ${truncate(dealLabel, 50)}*`));

  // The question
  blocks.push(section(data.question));

  // Show current value if we have one
  if (data.currentValue) {
    blocks.push(context([`Current value: "${truncate(data.currentValue, 50)}"`]));
  }

  // Build action buttons
  const actionButtons: Array<{
    text: string;
    actionId: string;
    value: string;
    style?: 'primary' | 'danger';
  }> = [];

  // If we have suggested options, show them as buttons
  if (data.suggestedOptions && data.suggestedOptions.length > 0) {
    for (const option of data.suggestedOptions.slice(0, 3)) {
      actionButtons.push({
        text: truncate(option.label, 30),
        actionId: `confirm_truth_field_${data.fieldKey}`,
        value: JSON.stringify({
          dealId: data.dealId,
          fieldKey: data.fieldKey,
          confirmedValue: option.id,
          confirmedLabel: option.label,
        }),
        style: 'primary',
      });
    }
  } else {
    // Simple Yes/No/Unknown for confirmation
    actionButtons.push({
      text: 'Yes',
      actionId: `confirm_truth_field_${data.fieldKey}`,
      value: JSON.stringify({
        dealId: data.dealId,
        fieldKey: data.fieldKey,
        confirmation: 'yes',
        currentValue: data.currentValue,
      }),
      style: 'primary',
    });
    actionButtons.push({
      text: 'No',
      actionId: `confirm_truth_field_${data.fieldKey}`,
      value: JSON.stringify({
        dealId: data.dealId,
        fieldKey: data.fieldKey,
        confirmation: 'no',
        currentValue: data.currentValue,
      }),
    });
  }

  // Always add "Unknown" option
  actionButtons.push({
    text: 'Unknown',
    actionId: `confirm_truth_field_${data.fieldKey}`,
    value: JSON.stringify({
      dealId: data.dealId,
      fieldKey: data.fieldKey,
      confirmation: 'unknown',
    }),
  });

  blocks.push(actions(actionButtons));

  // Link to deal
  blocks.push(context([`<${data.appUrl}/deals/${data.dealId}|View deal in Sixty>`]));

  return {
    blocks,
    text: `Question about ${data.dealName}: ${data.question}`,
  };
};

// =============================================================================
// Smart Listening: Account Signal Alert
// =============================================================================

export interface AccountSignalAlertData {
  companyName: string;
  signalType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  summary: string;
  recommendedAction: string;
  evidence?: string;
  watchlistId: string;
  signalId: string;
  appUrl: string;
}

const SEVERITY_EMOJI: Record<string, string> = {
  critical: ':red_circle:',
  high: ':large_orange_circle:',
  medium: ':large_yellow_circle:',
  low: ':white_circle:',
};

const SIGNAL_TYPE_LABEL: Record<string, string> = {
  job_change: 'Job Change',
  title_change: 'Title Change',
  company_change: 'Company Change',
  funding_event: 'Funding Event',
  company_news: 'Company News',
  hiring_surge: 'Hiring Surge',
  tech_stack_change: 'Tech Stack Change',
  competitor_mention: 'Competitor Activity',
  custom_research_result: 'Research Result',
};

export const buildAccountSignalAlert = (data: AccountSignalAlertData): SlackMessage => {
  const blocks: SlackBlock[] = [];
  const severityEmoji = SEVERITY_EMOJI[data.severity] || ':white_circle:';
  const typeLabel = SIGNAL_TYPE_LABEL[data.signalType] || data.signalType;

  blocks.push(header(safeHeaderText(`Account Signal — ${data.companyName}`)));
  blocks.push(divider());

  blocks.push(section(safeMrkdwn(
    `${severityEmoji} *${data.severity.toUpperCase()}* — ${typeLabel}\n\n${data.title}`
  )));

  blocks.push(section(safeMrkdwn(data.summary)));

  if (data.recommendedAction) {
    blocks.push(section(safeMrkdwn(`*Recommended:* ${data.recommendedAction}`)));
  }

  blocks.push(divider());

  blocks.push(actions([
    {
      text: 'View Signals',
      actionId: 'account_signal_view',
      url: `${data.appUrl}/ops?signal=${data.watchlistId}`,
    },
    {
      text: 'Dismiss',
      actionId: 'account_signal_dismiss',
      value: safeButtonValue(JSON.stringify({ signalId: data.signalId })),
    },
  ]));

  return {
    blocks,
    text: `Account Signal: ${data.companyName} — ${data.title}`,
  };
};

// =============================================================================
// Smart Listening: Weekly Account Intelligence Digest
// =============================================================================

export interface AccountDigestEntry {
  companyName: string;
  watchlistId: string;
  signals: Array<{
    signalType: string;
    severity: string;
    title: string;
  }>;
}

export interface AccountDigestData {
  recipientName: string;
  weekDate: string;
  accounts: AccountDigestEntry[];
  totalSignals: number;
  appUrl: string;
}

export const buildAccountIntelligenceDigest = (data: AccountDigestData): SlackMessage => {
  const blocks: SlackBlock[] = [];

  blocks.push(header(safeHeaderText(`Weekly Account Intelligence — ${data.weekDate}`)));
  blocks.push(section(safeMrkdwn(
    `Hey ${data.recipientName}! Here's what changed at your watched accounts this week.`
  )));
  blocks.push(divider());

  // Group signals per account (max 10 accounts to stay within Slack limits)
  const displayAccounts = data.accounts.slice(0, 10);

  for (const account of displayAccounts) {
    const signalLines = account.signals.slice(0, 5).map(s => {
      const emoji = SEVERITY_EMOJI[s.severity] || ':white_circle:';
      const label = SIGNAL_TYPE_LABEL[s.signalType] || s.signalType;
      return `${emoji} ${label}: ${s.title}`;
    }).join('\n');

    const extra = account.signals.length > 5 ? `\n_+${account.signals.length - 5} more signals_` : '';

    blocks.push(section(safeMrkdwn(
      `*${account.companyName}* — ${account.signals.length} signal${account.signals.length > 1 ? 's' : ''}\n${signalLines}${extra}`
    )));
  }

  if (data.accounts.length > 10) {
    blocks.push(context([`_+${data.accounts.length - 10} more accounts with signals_`]));
  }

  blocks.push(divider());
  blocks.push(context([
    `${data.totalSignals} signal${data.totalSignals !== 1 ? 's' : ''} across ${data.accounts.length} account${data.accounts.length !== 1 ? 's' : ''} this week`,
  ]));

  blocks.push(actions([
    {
      text: 'View All Signals',
      actionId: 'account_digest_view_all',
      url: `${data.appUrl}/settings/smart-listening`,
    },
    {
      text: 'Manage Watchlist',
      actionId: 'account_digest_manage',
      url: `${data.appUrl}/settings/smart-listening`,
    },
  ]));

  return {
    blocks,
    text: `Weekly Account Intelligence: ${data.totalSignals} signals across ${data.accounts.length} accounts`,
  };
};

// =============================================================================
// Coaching Messages
// =============================================================================

export interface CoachingMicroFeedbackData {
  analysisId: string;
  meetingTitle: string;
  talkRatio: number;
  questionQualityScore: number;
  objectionHandlingScore: number;
  discoveryDepthScore?: number;
  overallScore?: number;
  insights: Array<{ category: string; text: string; severity: 'positive' | 'neutral' | 'improvement' | 'high' }>;
  recommendations?: Array<{ category: string; action: string }>;
  appUrl: string;
}

export interface WeeklyCoachingDigestData {
  userName: string;
  slackUserId?: string;
  meetingsAnalyzed: number;
  avgTalkRatio: number;
  avgQuestionScore: number;
  avgObjectionScore: number;
  avgDiscoveryDepthScore?: number;
  overallScore?: number;
  improvingAreas: string[];
  focusAreas: string[];
  winningPatterns: string[];
  weekOverWeek: {
    talkRatioChange: number;
    questionScoreChange: number;
    objectionScoreChange?: number;
  };
  topMoment?: string;
  weeklyChallenge?: string;
  recommendations?: Array<{ category: string; action: string }>;
  appUrl: string;
}

/**
 * Per-meeting coaching micro-feedback — concise performance card
 */
export const buildCoachingMicroFeedbackMessage = (data: CoachingMicroFeedbackData): SlackMessage => {
  const blocks: SlackBlock[] = [];
  const title = safeHeaderText(`Quick Coaching: ${data.meetingTitle}`);

  blocks.push(header(title));
  blocks.push(divider());

  // Score bar helper
  const scoreBar = (score: number, max = 1): string => {
    const pct = Math.round(score * (max === 1 ? 100 : 1));
    const filled = Math.round(pct / 10);
    return '█'.repeat(Math.min(filled, 10)) + '░'.repeat(Math.max(10 - filled, 0)) + ` ${pct}%`;
  };

  // Talk ratio with benchmark indicator
  const talkEmoji = '';
  const talkLabel = data.talkRatio > 60 ? 'Too high' : data.talkRatio < 30 ? 'Too low' : 'Good range';

  const fields: Array<{ label: string; value: string }> = [
    { label: 'Talk Ratio', value: `${talkEmoji} ${data.talkRatio}% you / ${100 - data.talkRatio}% them _(${talkLabel})_` },
    { label: 'Questions', value: scoreBar(data.questionQualityScore) },
    { label: 'Objection Handling', value: scoreBar(data.objectionHandlingScore) },
  ];

  if (data.discoveryDepthScore !== undefined) {
    fields.push({ label: 'Discovery Depth', value: scoreBar(data.discoveryDepthScore) });
  }

  blocks.push(sectionWithFields(fields));

  // Overall score if available
  if (data.overallScore !== undefined && data.overallScore !== null) {
    blocks.push(section(`*Overall Score:* ${data.overallScore}/10`));
  }

  // Insights grouped by severity
  const positives = data.insights.filter(i => i.severity === 'positive').slice(0, 2);
  const improvements = data.insights.filter(i => i.severity === 'improvement' || i.severity === 'high').slice(0, 2);
  const neutrals = data.insights.filter(i => i.severity === 'neutral').slice(0, 1);

  const insightLines: string[] = [];
  for (const i of positives) insightLines.push(`• ${i.text}`);
  for (const i of improvements) insightLines.push(`• ${i.text}`);
  for (const i of neutrals) insightLines.push(`${i.text}`);

  if (insightLines.length > 0) {
    blocks.push(section(safeMrkdwn(insightLines.join('\n'))));
  }

  // Top recommendation
  if (data.recommendations && data.recommendations.length > 0) {
    blocks.push(section(safeMrkdwn(`*Focus:* ${data.recommendations[0].action}`)));
  }

  // Action buttons
  blocks.push(actions([
    { text: 'Full Report', actionId: `coach_view_details_${data.analysisId}`, value: data.analysisId, url: `${data.appUrl}/coaching/${data.analysisId}`, style: 'primary' as const },
    { text: 'Preferences', actionId: `coach_adjust_prefs_${data.analysisId}`, value: data.analysisId, url: `${data.appUrl}/settings/coaching` },
    { text: 'Got It', actionId: `coach_dismiss_${data.analysisId}`, value: data.analysisId },
  ]));

  return {
    blocks,
    text: `Coaching: ${data.meetingTitle} — Talk ${data.talkRatio}%, Questions ${Math.round(data.questionQualityScore * 100)}%`,
  };
};

/**
 * Weekly coaching digest — aggregated performance across multiple calls
 */
export const buildWeeklyCoachingDigestMessage = (data: WeeklyCoachingDigestData): SlackMessage => {
  const blocks: SlackBlock[] = [];
  const userMention = data.slackUserId ? `<@${data.slackUserId}>` : data.userName;

  blocks.push(header('Weekly Coaching Digest'));
  blocks.push(context([`${userMention} • ${data.meetingsAnalyzed} meeting${data.meetingsAnalyzed !== 1 ? 's' : ''} analyzed this week`]));
  blocks.push(divider());

  // Trend helper
  const trend = (change: number): string => {
    if (change > 0) return `+${change.toFixed(1)}%`;
    if (change < 0) return `${change.toFixed(1)}%`;
    return 'flat';
  };

  // Score bar
  const pctBar = (score: number): string => {
    const pct = Math.round(score * 100);
    const filled = Math.round(pct / 10);
    return '█'.repeat(Math.min(filled, 10)) + '░'.repeat(Math.max(10 - filled, 0)) + ` ${pct}%`;
  };

  // Talk ratio with benchmark context
  const talkEmoji = '';

  const metricFields: Array<{ label: string; value: string }> = [
    { label: 'Avg Talk Ratio', value: `${talkEmoji} ${data.avgTalkRatio}% ${trend(data.weekOverWeek.talkRatioChange)}\n_Benchmark: 43% (Gong top performers)_` },
    { label: 'Question Quality', value: `${pctBar(data.avgQuestionScore)} ${trend(data.weekOverWeek.questionScoreChange)}` },
    { label: 'Objection Handling', value: `${pctBar(data.avgObjectionScore)}${data.weekOverWeek.objectionScoreChange !== undefined ? ' ' + trend(data.weekOverWeek.objectionScoreChange) : ''}` },
  ];

  if (data.avgDiscoveryDepthScore !== undefined) {
    metricFields.push({ label: 'Discovery Depth', value: pctBar(data.avgDiscoveryDepthScore) });
  }

  blocks.push(sectionWithFields(metricFields));

  if (data.overallScore !== undefined && data.overallScore !== null) {
    blocks.push(section(`*Overall Score:* ${data.overallScore}/10`));
  }

  // Improving areas
  if (data.improvingAreas.length > 0) {
    blocks.push(section(safeMrkdwn(
      `*Improving:*\n${data.improvingAreas.slice(0, 3).map(a => `• ${a}`).join('\n')}`
    )));
  }

  // Focus areas
  if (data.focusAreas.length > 0) {
    blocks.push(section(safeMrkdwn(
      `*Focus Areas:*\n${data.focusAreas.slice(0, 3).map(a => `• ${a}`).join('\n')}`
    )));
  }

  // Winning patterns
  if (data.winningPatterns.length > 0) {
    blocks.push(section(safeMrkdwn(
      `*Winning Patterns:*\n${data.winningPatterns.slice(0, 3).map(a => `• ${a}`).join('\n')}`
    )));
  }

  // Top moment of the week
  if (data.topMoment) {
    blocks.push(divider());
    blocks.push(section(safeMrkdwn(`*Best Moment This Week:*\n${data.topMoment}`)));
  }

  // Weekly challenge
  if (data.weeklyChallenge) {
    blocks.push(section(safeMrkdwn(`*This Week's Challenge:*\n${data.weeklyChallenge}`)));
  }

  // Top recommendation
  if (data.recommendations && data.recommendations.length > 0) {
    blocks.push(section(safeMrkdwn(`*Top Recommendation:*\n${data.recommendations[0].action}`)));
  }

  // Action buttons
  blocks.push(actions([
    { text: 'Full Report', actionId: 'coach_view_details_weekly', value: 'weekly', url: `${data.appUrl}/coaching`, style: 'primary' as const },
    { text: 'Preferences', actionId: 'coach_adjust_prefs_weekly', value: 'weekly', url: `${data.appUrl}/settings/coaching` },
  ]));

  blocks.push(context([`Week ending ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`]));

  return {
    blocks,
    text: `Weekly Coaching: ${data.meetingsAnalyzed} meetings — Talk ${data.avgTalkRatio}%, Questions ${Math.round(data.avgQuestionScore * 100)}%, Objections ${Math.round(data.avgObjectionScore * 100)}%`,
  };
};

// =============================================================================
// CRM UPDATE MESSAGE BUILDER
// =============================================================================

export interface CrmUpdateData {
  dealName: string;
  dealId: string;
  meetingTitle: string;
  meetingId: string;
  userName: string;
  slackUserId?: string;
  changes: Array<{
    updateId: string;
    field_name: string;
    old_value: unknown;
    new_value: unknown;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
  }>;
  appUrl: string;
}

/**
 * Build CRM Update Message
 * Shows automatic CRM field updates after a meeting with confidence indicators and undo actions
 */
export const buildCrmUpdateMessage = (data: CrmUpdateData): SlackMessage => {
  const blocks: SlackBlock[] = [];
  const userMention = data.slackUserId ? `<@${data.slackUserId}>` : data.userName;

  // Header with deal name
  blocks.push(header(`CRM Updated: ${truncate(data.dealName, 100)}`));

  // Context: meeting and user
  blocks.push(context([
    `After meeting: ${truncate(data.meetingTitle, 80)} | By ${userMention}`,
  ]));

  blocks.push(divider());

  // Confidence badge helper
  const getConfidenceBadge = (confidence: 'high' | 'medium' | 'low'): string => {
    switch (confidence) {
      case 'high': return 'High';
      case 'medium': return 'Medium';
      case 'low': return 'Low';
    }
  };

  // Format value helper
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '_empty_';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return JSON.stringify(value);
  };

  // Show each change (max 5)
  data.changes.slice(0, 5).forEach((change) => {
    const oldVal = formatValue(change.old_value);
    const newVal = formatValue(change.new_value);
    const confidenceBadge = getConfidenceBadge(change.confidence);

    // Field change with confidence badge
    blocks.push(section(safeMrkdwn(
      `*${change.field_name}*: \`${truncate(oldVal, 50)}\` → \`${truncate(newVal, 50)}\`\n${confidenceBadge}`
    )));

    // Reasoning in context
    if (change.reasoning) {
      blocks.push(context([`_${truncate(change.reasoning, 200)}_`]));
    }

    // Undo button if updateId present
    if (change.updateId) {
      blocks.push(actions([
        { text: 'Undo', actionId: `undo_crm_update::${change.updateId}`, value: change.updateId },
      ]));
    }
  });

  blocks.push(divider());

  // Action buttons
  blocks.push(actions([
    { text: 'View Deal', actionId: 'view_deal_crm', value: data.dealId, url: `${data.appUrl}/deals/${data.dealId}`, style: 'primary' },
    { text: 'View All Changes', actionId: 'view_all_changes', value: data.dealId, url: `${data.appUrl}/deals/${data.dealId}` },
  ]));

  return {
    blocks,
    text: `CRM Updated: ${data.dealName} — ${data.changes.length} field${data.changes.length !== 1 ? 's' : ''} changed after meeting`,
  };
};

// =============================================================================
// DEAL RISK ALERT MESSAGE BUILDER
// =============================================================================

export interface DealRiskAlertData {
  dealName: string;
  dealId: string;
  dealValue?: number;
  dealStage?: string;
  currencyCode?: string;
  currencyLocale?: string;
  riskScore: number;
  previousScore?: number;
  signals: Array<{
    type: string;
    weight: number;
    description: string;
  }>;
  suggestedAction?: string;
  ownerName?: string;
  ownerSlackUserId?: string;
  appUrl: string;
}

/**
 * Build Deal Risk Alert Message
 * Alerts team when a deal's risk score increases or crosses a threshold
 */
export const buildDealRiskAlertMessage = (data: DealRiskAlertData): SlackMessage => {
  const blocks: SlackBlock[] = [];
  const ownerMention = data.ownerSlackUserId ? `<@${data.ownerSlackUserId}>` : (data.ownerName || 'Unassigned');

  // Header with warning
  blocks.push(header(`Deal Risk Alert: ${truncate(data.dealName, 90)}`));

  // Entity context block (SLK-006) — deal name + stage + value inline
  const riskEntityCtx = entityContextBlock({
    dealName: data.dealName,
    dealStage: data.dealStage,
    dealValue: data.dealValue,
    currencyCode: data.currencyCode,
    currencyLocale: data.currencyLocale,
  });
  if (riskEntityCtx) blocks.push(riskEntityCtx);

  // Risk score bar helper
  const getRiskBar = (score: number): string => {
    const normalizedScore = Math.max(0, Math.min(100, score));
    const filled = Math.round(normalizedScore / 10);
    const emoji = '█';
    return emoji.repeat(Math.max(filled, 1)) + '░'.repeat(Math.max(10 - filled, 0));
  };

  // Delta from previous score
  const getDelta = (): string => {
    if (data.previousScore === undefined) return '';
    const delta = data.riskScore - data.previousScore;
    if (delta > 0) return ` +${delta}`;
    if (delta < 0) return ` ${delta}`;
    return ' →';
  };

  // Key fields
  const fields: Array<{ label: string; value: string }> = [
    { label: 'Risk Score', value: `${data.riskScore}/100 ${getRiskBar(data.riskScore)}` },
  ];

  if (data.previousScore !== undefined) {
    fields.push({ label: 'Change', value: getDelta() || 'No change' });
  }

  if (data.dealStage) {
    fields.push({ label: 'Stage', value: data.dealStage });
  }

  if (data.dealValue !== undefined) {
    fields.push({ label: 'Value', value: formatCurrency(data.dealValue, data.currencyCode, data.currencyLocale) });
  }

  blocks.push(sectionWithFields(fields));

  blocks.push(divider());

  // Risk signals (top 5)
  if (data.signals.length > 0) {
    const getWeightBadge = (weight: number): string => {
      if (weight >= 7) return '';
      if (weight >= 4) return '';
      return '';
    };

    const signalLines = data.signals.slice(0, 5).map(s =>
      `${getWeightBadge(s.weight)} *${s.type}* (${s.weight}/10): ${truncate(s.description, 120)}`
    ).join('\n');

    blocks.push(section(safeMrkdwn(`*Risk Signals*\n${signalLines}`)));
  }

  // Suggested action
  if (data.suggestedAction) {
    blocks.push(section(safeMrkdwn(`*Suggested Action*\n${truncate(data.suggestedAction, 300)}`)));
  }

  blocks.push(divider());

  // Action buttons
  blocks.push(actions([
    { text: 'View Deal', actionId: 'view_deal_risk', value: data.dealId, url: `${data.appUrl}/deals/${data.dealId}`, style: 'primary' },
    { text: 'Snooze 1 Week', actionId: `snooze_risk_alert::${data.dealId}`, value: data.dealId },
    { text: 'Dismiss', actionId: `dismiss_risk_alert::${data.dealId}`, value: data.dealId, style: 'danger' },
  ]));

  // Context: timestamp
  blocks.push(context([`Alert triggered ${new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`]));

  return {
    blocks,
    text: `Risk Alert: ${data.dealName} — Risk score ${data.riskScore}/100`,
  };
};

// =============================================================================
// RE-ENGAGEMENT ALERT MESSAGE BUILDER
// =============================================================================

export interface ReengagementAlertData {
  contactName: string;
  contactTitle?: string;
  companyName: string;
  dealName: string;
  dealId: string;
  dealValue?: number;
  currencyCode?: string;
  currencyLocale?: string;
  lossReason?: string;
  closeDate?: string;
  signal: {
    type: string;
    description: string;
    source?: string;
  };
  draftEmail?: {
    subject: string;
    body: string;
  };
  appUrl: string;
}

/**
 * Build Re-engagement Alert Message
 * Suggests reaching back out to lost deals based on signals (company growth, funding, hiring, etc.)
 */
export const buildReengagementAlertMessage = (data: ReengagementAlertData): SlackMessage => {
  const blocks: SlackBlock[] = [];

  // Header
  blocks.push(header('Re-engagement Opportunity'));

  // Signal description
  blocks.push(section(safeMrkdwn(
    `*${data.signal.type}*\n${truncate(data.signal.description, 300)}`
  )));

  // Contact and deal details
  const contactInfo = data.contactTitle
    ? `${data.contactName}\n_${data.contactTitle}_`
    : data.contactName;

  const dealInfo = data.dealValue !== undefined
    ? `${data.dealName}\n${formatCurrency(data.dealValue, data.currencyCode, data.currencyLocale)}`
    : data.dealName;

  const lostInfo = [
    data.closeDate || 'Unknown date',
    data.lossReason ? `\n_${truncate(data.lossReason, 60)}_` : '',
  ].join('');

  blocks.push(sectionWithFields([
    { label: 'Contact', value: contactInfo },
    { label: 'Company', value: data.companyName },
    { label: 'Deal', value: dealInfo },
    { label: 'Lost', value: lostInfo },
  ]));

  // Draft email preview
  if (data.draftEmail) {
    blocks.push(divider());
    blocks.push(section(safeMrkdwn('*Draft Outreach*')));
    blocks.push(section(safeMrkdwn(
      `*Subject:* ${truncate(data.draftEmail.subject, 150)}\n\n${truncate(data.draftEmail.body, 400)}`
    )));
  }

  blocks.push(divider());

  // HITL action buttons
  blocks.push(actions([
    { text: 'Send Email', actionId: `reengagement_send::${data.dealId}`, value: data.dealId, style: 'primary' },
    { text: 'Edit', actionId: `reengagement_edit::${data.dealId}`, value: data.dealId },
    { text: 'Snooze 2 Weeks', actionId: `reengagement_snooze::${data.dealId}`, value: data.dealId },
    { text: 'Remove', actionId: `reengagement_remove::${data.dealId}`, value: data.dealId, style: 'danger' },
  ]));

  // Context: source and timestamp
  const contextElements = [];
  if (data.signal.source) {
    contextElements.push(`Source: ${data.signal.source}`);
  }
  contextElements.push(new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
  blocks.push(context(contextElements));

  // Deep link footer (SLK-005)
  const linkFooter = buildLinkFooter({
    appUrl: data.appUrl,
    dealId: data.dealId,
    dealName: data.dealName,
  });
  if (linkFooter) blocks.push(linkFooter);

  return {
    blocks,
    text: `Re-engagement: ${data.contactName} at ${data.companyName} — ${data.signal.type}`,
  };
};

// =============================================================================
// HITL INTERACTIVE BUILDERS (WIRE-005)
// =============================================================================

/**
 * Data for proposal review HITL message
 */
export interface ProposalReviewData {
  title: string;
  deal_name: string;
  contact_name: string;
  summary: string;
  total_value?: number;
  sections: Array<{ title: string; preview: string }>;
  jobId: string;
  pendingActionId: string;
  appUrl?: string;
  dealId?: string;
  contactId?: string;
}

/**
 * Build Slack blocks for proposal review and approval
 */
export function buildProposalReviewMessage(data: ProposalReviewData): SlackBlock[] {
  const blocks: SlackBlock[] = [
    header(`Proposal Ready: ${data.title}`),
    divider(),
  ];

  // Main fields
  const fields = [
    { label: 'Deal', value: data.deal_name },
    { label: 'Contact', value: data.contact_name },
  ];
  if (data.total_value) {
    fields.push({ label: 'Value', value: `$${data.total_value.toLocaleString()}` });
  }
  blocks.push(sectionWithFields(fields));

  // Summary
  blocks.push(section(`*Summary:*\n${safeMrkdwn(data.summary)}`));

  // Section previews
  if (data.sections.length > 0) {
    blocks.push(divider());
    for (const sec of data.sections.slice(0, 3)) {
      blocks.push(section(`*${sec.title}*\n${truncate(sec.preview, 200)}...`));
    }
    if (data.sections.length > 3) {
      blocks.push(context([`+${data.sections.length - 3} more sections`]));
    }
  }

  // Action buttons
  blocks.push(divider());
  blocks.push(actions([
    { text: 'Approve & Send', actionId: `prop_approve_send_${data.jobId}`, value: data.pendingActionId, style: 'primary' },
    { text: 'Edit First', actionId: `prop_edit_${data.jobId}`, value: data.pendingActionId },
    { text: 'Share Link', actionId: `prop_share_link_${data.jobId}`, value: data.pendingActionId },
    { text: 'Skip', actionId: `prop_skip_${data.jobId}`, value: data.pendingActionId },
  ]));

  // Deep link footer (SLK-005)
  if (data.appUrl) {
    const proposalLinkFooter = buildLinkFooter({
      appUrl: data.appUrl,
      dealId: data.dealId,
      dealName: data.deal_name,
      contactId: data.contactId,
      contactName: data.contact_name,
    });
    if (proposalLinkFooter) blocks.push(proposalLinkFooter);
  }

  return blocks;
}

/**
 * Data for calendar slots HITL message
 */
export interface CalendarSlotsData {
  slots: Array<{ start_time: string; end_time: string; score?: number; timezone?: string }>;
  jobId: string;
  pendingActionId: string;
  prospectName?: string;
}

/**
 * Build Slack blocks for calendar time slot selection
 */
export function buildCalendarSlotsMessage(data: CalendarSlotsData): SlackBlock[] {
  const blocks: SlackBlock[] = [
    header(`Available Times${data.prospectName ? ` for ${data.prospectName}` : ''}`),
    divider(),
  ];

  // Helper function to format slot time
  const formatSlotTime = (isoTime: string, timezone?: string): string => {
    try {
      const date = new Date(isoTime);
      return date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: timezone,
      });
    } catch {
      return isoTime;
    }
  };

  // Add slots as radio button options
  const options = data.slots.slice(0, 5).map((slot, i) => ({
    text: { type: 'plain_text' as const, text: `${formatSlotTime(slot.start_time, slot.timezone)} - ${formatSlotTime(slot.end_time, slot.timezone)}` },
    value: `${i}`,
  }));

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: 'Select a time slot:' },
    accessory: {
      type: 'radio_buttons',
      action_id: `cal_select_slot_${data.jobId}`,
      options,
    },
  });

  blocks.push(divider());

  // Action buttons
  blocks.push(actions([
    { text: 'Send Invite', actionId: `cal_send_invite_${data.jobId}`, value: data.pendingActionId, style: 'primary' },
    { text: 'Send Times via Email', actionId: `cal_send_times_${data.jobId}`, value: data.pendingActionId },
    { text: 'More Options', actionId: `cal_more_${data.jobId}`, value: data.pendingActionId },
    { text: 'I\'ll Handle This', actionId: `cal_handle_${data.jobId}`, value: data.pendingActionId },
  ]));

  return blocks;
}

/**
 * Data for email preview HITL message
 */
export interface EmailPreviewData {
  to: string;
  subject: string;
  body: string;
  jobId: string;
  pendingActionId: string;
  cc?: string;
  bcc?: string;
}

/**
 * Build Slack blocks for email preview and approval
 */
export function buildEmailPreviewMessage(data: EmailPreviewData): SlackBlock[] {
  const blocks: SlackBlock[] = [
    header('Email Ready to Send'),
    divider(),
  ];

  // Main fields
  blocks.push(sectionWithFields([
    { label: 'To', value: data.to },
    { label: 'Subject', value: data.subject },
  ]));

  // Add CC/BCC if present
  if (data.cc || data.bcc) {
    const ccBccFields = [];
    if (data.cc) ccBccFields.push({ label: 'CC', value: data.cc });
    if (data.bcc) ccBccFields.push({ label: 'BCC', value: data.bcc });
    blocks.push(sectionWithFields(ccBccFields));
  }

  // Body preview (truncate to 500 chars)
  const bodyPreview = truncate(data.body, 500);
  blocks.push(divider());
  blocks.push(section(`*Body:*\n${bodyPreview}`));

  // Action buttons
  blocks.push(divider());
  blocks.push(actions([
    { text: 'Send Now', actionId: `email_send_now_${data.jobId}`, value: data.pendingActionId, style: 'primary' },
    { text: 'Edit in use60', actionId: `email_edit_${data.jobId}`, value: data.pendingActionId },
    { text: 'Send Later', actionId: `email_send_later_${data.jobId}`, value: data.pendingActionId },
    { text: 'Cancel', actionId: `email_cancel_${data.jobId}`, value: data.pendingActionId, style: 'danger' },
  ]));

  return blocks;
}

/**
 * Data for campaign report message
 */
export interface CampaignReportData {
  campaign_name: string;
  campaign_id: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
  status: 'healthy' | 'warning' | 'underperforming';
  replies?: Array<{
    id: string;
    from_name: string;
    intent: 'positive' | 'negative' | 'ooo' | 'unsubscribe' | 'other';
    snippet: string;
  }>;
  suggestions?: Array<{
    type: string;
    description: string;
  }>;
}

/**
 * Build Slack blocks for campaign daily report
 */
export function buildCampaignReportMessage(data: CampaignReportData): SlackMessage {
  const statusEmoji = '';

  const blocks: SlackBlock[] = [
    header(`Campaign Report: ${data.campaign_name}`),
    divider(),
    sectionWithFields([
      { label: 'Status', value: `${statusEmoji} ${data.status}` },
      { label: 'Sent', value: `${data.sent}` },
      { label: 'Open Rate', value: `${(data.open_rate * 100).toFixed(1)}%` },
      { label: 'Reply Rate', value: `${(data.reply_rate * 100).toFixed(1)}%` },
    ]),
  ];

  // Add reply sections
  const replies = data.replies || [];
  if (replies.length > 0) {
    blocks.push(divider());
    blocks.push(section(`*Recent Replies (${replies.length}):*`));

    const intentBadge: Record<string, string> = {
      positive: 'Positive',
      negative: 'Negative',
      ooo: 'OOO',
      unsubscribe: 'Unsubscribe',
      other: 'Other',
    };

    for (const reply of replies.slice(0, 5)) {
      blocks.push(section(`*${reply.from_name}* — ${intentBadge[reply.intent] || reply.intent}\n>${truncate(reply.snippet, 200)}`));
      blocks.push(actions([
        { text: 'Draft Response', actionId: `camp_draft_response_${reply.id}`, value: reply.id },
        { text: 'View Thread', actionId: `camp_view_thread_${reply.id}`, value: reply.id },
        { text: 'Mark Closed', actionId: `camp_mark_closed_${reply.id}`, value: reply.id },
        { text: 'Add to Nurture', actionId: `camp_add_nurture_${reply.id}`, value: reply.id },
      ]));
    }
  }

  // Add suggestion section
  const suggestions = data.suggestions || [];
  if (suggestions.length > 0) {
    blocks.push(divider());
    blocks.push(section('*Optimization Suggestions:*'));
    for (const suggestion of suggestions) {
      blocks.push(section(`• *${suggestion.type}*: ${suggestion.description}`));
    }
    blocks.push(actions([
      { text: 'Apply Suggestions', actionId: `camp_apply_suggestion_${data.campaign_id}`, value: data.campaign_id, style: 'primary' },
      { text: 'Keep Testing', actionId: `camp_keep_testing_${data.campaign_id}`, value: data.campaign_id },
    ]));
  }

  return {
    blocks,
    text: `Campaign Report: ${data.campaign_name} — ${statusEmoji} ${data.status}`,
  };
}

/**
 * Data for campaign ready notification (sent when orchestrator finishes building a campaign)
 */
export interface CampaignReadyData {
  campaign_name: string;
  table_id: string;
  table_name: string;
  leads_found: number;
  emails_generated: number;
  campaign_id?: string;
  duration_sec: number;
  conversation_id?: string;
  app_url?: string;
}

/**
 * Build Slack blocks for "campaign ready" notification
 */
export function buildCampaignReadyMessage(data: CampaignReadyData): SlackMessage {
  const appUrl = data.app_url || 'https://app.use60.com';
  const durationMin = Math.floor(data.duration_sec / 60);
  const durationSec = data.duration_sec % 60;
  const durationStr = durationMin > 0 ? `${durationMin}m ${durationSec}s` : `${durationSec}s`;

  const blocks: SlackBlock[] = [
    header(`Your campaign is ready`),
    section(`*${truncate(data.campaign_name, 200)}* has been built and is waiting for your review.`),
    divider(),
    sectionWithFields([
      { label: 'Leads Found', value: `${data.leads_found}` },
      { label: 'Emails Generated', value: `${data.emails_generated}` },
      { label: 'Build Time', value: durationStr },
      { label: 'Table', value: truncate(data.table_name, 40) },
    ]),
    divider(),
    actions([
      { text: 'Open in Ops Table', actionId: `campaign_ready_open_table_${data.table_id}`, value: data.table_id, url: `${appUrl}/ops/${data.table_id}`, style: 'primary' },
      ...(data.conversation_id
        ? [{ text: 'Continue in Copilot', actionId: `campaign_ready_continue_${data.conversation_id}`, value: data.conversation_id, url: `${appUrl}/copilot?conversation=${data.conversation_id}` }]
        : []),
    ]),
  ];

  return {
    blocks,
    text: `Your campaign "${data.campaign_name}" is ready — ${data.leads_found} leads, ${data.emails_generated} emails generated in ${durationStr}`,
  };
}

// =============================================================================
// SUPPORT TICKET DATA INTERFACES
// =============================================================================

export interface SupportTicketData {
  ticketId: string;
  subject: string;
  description: string;
  orgName: string;
  userName: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
}

export interface SupportReplyData extends SupportTicketData {
  replyPreview: string;
  replierName: string;
}

// =============================================================================
// SUPPORT TICKET MESSAGE BUILDERS
// =============================================================================

/**
 * Get a human-readable priority indicator for support tickets
 */
const getSupportPriorityLabel = (priority: string): string => {
  switch (priority.toLowerCase()) {
    case 'urgent': return 'URGENT';
    case 'high':   return 'High';
    case 'medium': return 'Medium';
    case 'low':    return 'Low';
    default:       return priority;
  }
};

/**
 * New Support Ticket notification — sent to the support channel when a ticket is created.
 */
export const buildSupportTicketNotification = (data: SupportTicketData): SlackBlock[] => {
  const descriptionPreview = truncate(data.description, 200);
  const formattedDate = new Date(data.createdAt).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  return [
    header('New Support Ticket'),
    section(`*${safeMrkdwn(data.subject)}*\n${descriptionPreview}`),
    sectionWithFields([
      { label: 'Organization', value: data.orgName },
      { label: 'Priority', value: getSupportPriorityLabel(data.priority) },
      { label: 'Category', value: data.category },
      { label: 'Status', value: data.status },
    ]),
    context([`Submitted by ${data.userName} | ${formattedDate}`]),
    divider(),
    actions([
      { text: 'Assign to me', actionId: `support_assign::${data.ticketId}`, value: data.ticketId, style: 'primary' },
      { text: 'View in Platform', actionId: `support_view::${data.ticketId}`, value: data.ticketId },
      { text: 'Mark Urgent', actionId: `support_priority_urgent::${data.ticketId}`, value: data.ticketId },
      { text: 'Mark High', actionId: `support_priority_high::${data.ticketId}`, value: data.ticketId },
    ]),
  ];
};

/**
 * Customer Reply notification — sent when a customer replies to an existing ticket.
 */
export const buildSupportReplyNotification = (data: SupportReplyData): SlackBlock[] => {
  const replyPreview = truncate(data.replyPreview, 200);

  return [
    header('Customer Reply'),
    section(`*Re: ${safeMrkdwn(data.subject)}*\n${replyPreview}`),
    context([`From ${data.replierName} | Org: ${data.orgName}`]),
    divider(),
    actions([
      { text: 'Assign to me', actionId: `support_assign::${data.ticketId}`, value: data.ticketId, style: 'primary' },
      { text: 'View in Platform', actionId: `support_view::${data.ticketId}`, value: data.ticketId },
    ]),
  ];
};

/**
 * Support ticket status change notification.
 */
export const buildSupportStatusChange = (data: {
  ticketId: string;
  subject: string;
  oldStatus: string;
  newStatus: string;
  changedBy: string;
}): SlackBlock[] => {
  return [
    section(
      `*Support ticket status updated*\n` +
      `_${truncate(data.subject, 150)}_\n` +
      `${data.oldStatus} → *${data.newStatus}*`
    ),
    context([`Changed by ${data.changedBy}`]),
  ];
};

// =============================================================================
// CRM-006: CRM Auto-Update HITL Approval Message
// =============================================================================

export interface CRMAppliedChange {
  field_name: string;
  new_value: unknown;
  confidence: 'high' | 'medium' | 'low';
}

export interface CRMPendingApproval {
  id: string;
  field_name: string;
  old_value: unknown;
  new_value: unknown;
  confidence: 'high' | 'medium' | 'low';
  reasoning?: string;
}

export interface CRMSkippedField {
  field_name: string;
  reasoning?: string;
}

export interface CRMApprovalMessageData {
  dealId: string;
  dealName: string;
  meetingId: string;
  meetingTitle: string;
  autoApplied: CRMAppliedChange[];
  pendingApprovals: CRMPendingApproval[];
  skippedFields: CRMSkippedField[];
  appUrl: string;
}

/**
 * Format a CRM field value for display in Slack
 */
const formatCRMValue = (value: unknown, fieldName: string): string => {
  if (value === null || value === undefined) return '_empty_';
  const str = String(value);
  if (str.length === 0) return '_empty_';

  // Truncate long values
  const display = str.length > 80 ? str.slice(0, 79) + '…' : str;

  // Currency formatting for deal_value
  if (fieldName === 'deal_value' || fieldName === 'value') {
    const num = parseFloat(str.replace(/[$,]/g, ''));
    if (!isNaN(num)) return `$${num.toLocaleString()}`;
  }

  return display;
};

/**
 * Confidence badge — plain text labels safe for mrkdwn
 */
const crmConfidenceBadge = (confidence: 'high' | 'medium' | 'low'): string => {
  switch (confidence) {
    case 'high': return '[HIGH]';
    case 'medium': return '[MED]';
    case 'low': return '[LOW]';
    default: return '';
  }
};

/**
 * Build CRM Approval Message
 *
 * Slack Block Kit message sent after a meeting ends when CRM fields were
 * extracted. Summarises auto-applied changes and presents pending fields
 * for per-field or bulk approve/reject/edit.
 *
 * Stays within the Slack 50-block limit by capping pending fields shown.
 */
export const buildCRMApprovalMessage = (data: CRMApprovalMessageData): SlackMessage => {
  const blocks: SlackBlock[] = [];

  // --- Header ---
  const headerText = `CRM Update — ${truncate(data.dealName, 60)} from ${truncate(data.meetingTitle, 40)}`;
  blocks.push(header(headerText));

  // --- Context: deal + meeting links ---
  const contextParts: string[] = [];
  if (data.appUrl) {
    contextParts.push(`<${data.appUrl}/deals/${data.dealId}|View Deal>`);
    contextParts.push(`<${data.appUrl}/meetings/${data.meetingId}|View Meeting>`);
  }
  if (contextParts.length > 0) {
    blocks.push(context(contextParts));
  }

  // --- Auto-applied section ---
  if (data.autoApplied.length > 0) {
    blocks.push(divider());
    const autoLines = data.autoApplied.slice(0, 8).map((c) => {
      const displayValue = formatCRMValue(c.new_value, c.field_name);
      const fieldLabel = c.field_name.replace(/_/g, ' ');
      return `*${fieldLabel}:* ${displayValue}`;
    });
    blocks.push(section(`*Auto-applied (${data.autoApplied.length} field${data.autoApplied.length !== 1 ? 's' : ''})*\n${autoLines.join('\n')}`));
  }

  // --- Per-field approvals ---
  if (data.pendingApprovals.length > 0) {
    blocks.push(divider());
    blocks.push(section(`*Needs your review (${data.pendingApprovals.length} field${data.pendingApprovals.length !== 1 ? 's' : ''})*`));

    // Budget: header(1) + context(1) + divider(up to 2) + auto section(up to 2) +
    //         review header(1) + divider(1) + approve-all row(1) + skipped(up to 2) = ~11 fixed blocks
    // Remaining: 50 - 11 = 39. Each field costs 2 blocks (section + actions).
    const MAX_FIELD_BLOCKS = 36; // 18 fields max
    const maxFields = Math.floor(MAX_FIELD_BLOCKS / 2);
    const fieldsToShow = data.pendingApprovals.slice(0, maxFields);

    for (const field of fieldsToShow) {
      const fieldLabel = field.field_name.replace(/_/g, ' ');
      const oldDisplay = formatCRMValue(field.old_value, field.field_name);
      const newDisplay = formatCRMValue(field.new_value, field.field_name);
      const badge = crmConfidenceBadge(field.confidence);
      const reasoning = field.reasoning ? `\n_${truncate(field.reasoning, 80)}_` : '';

      blocks.push(
        section(
          `*${fieldLabel}* ${badge}\n${oldDisplay} → *${newDisplay}*${reasoning}`
        )
      );

      // Per-field action buttons: action_id format: crm_{action}::{field_name}::{queue_id}
      const queueValue = safeButtonValue(JSON.stringify({ queueId: field.id, fieldName: field.field_name }));
      blocks.push({
        type: 'actions',
        block_id: `crm_field_actions::${field.id}`,
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: safeButtonText('Approve'), emoji: false },
            style: 'primary',
            action_id: `crm_approve::${field.field_name}::${field.id}`,
            value: queueValue,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: safeButtonText('Reject'), emoji: false },
            style: 'danger',
            action_id: `crm_reject::${field.field_name}::${field.id}`,
            value: queueValue,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: safeButtonText('Edit'), emoji: false },
            action_id: `crm_edit::${field.field_name}::${field.id}`,
            value: queueValue,
          },
        ],
      });
    }

    if (data.pendingApprovals.length > maxFields) {
      blocks.push(
        context([`+ ${data.pendingApprovals.length - maxFields} more field(s) — view in app`])
      );
    }
  }

  // --- Approve All / Reject All ---
  if (data.pendingApprovals.length > 0) {
    blocks.push(divider());
    const allQueueIds = data.pendingApprovals.map((f) => f.id);
    const bulkValue = safeButtonValue(JSON.stringify({ queueIds: allQueueIds, dealId: data.dealId }));
    blocks.push({
      type: 'actions',
      block_id: `crm_bulk_actions::${data.dealId}`,
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: safeButtonText('Approve All'), emoji: false },
          style: 'primary',
          action_id: `crm_approve_all::${data.dealId}`,
          value: bulkValue,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: safeButtonText('Reject All'), emoji: false },
          style: 'danger',
          action_id: `crm_reject_all::${data.dealId}`,
          value: bulkValue,
        },
      ],
    });
  }

  // --- Low-confidence skipped fields ---
  if (data.skippedFields.length > 0) {
    const skippedNames = data.skippedFields
      .slice(0, 5)
      .map((f) => f.field_name.replace(/_/g, ' '))
      .join(', ');
    const suffix = data.skippedFields.length > 5 ? ` +${data.skippedFields.length - 5} more` : '';
    blocks.push(context([`Noted (low confidence, not applied): ${skippedNames}${suffix}`]));
  }

  const pendingCount = data.pendingApprovals.length;
  const autoCount = data.autoApplied.length;
  const fallbackText =
    `CRM Update for ${data.dealName}: ${autoCount} auto-applied, ${pendingCount} awaiting approval`;

  return { blocks, text: fallbackText };
};

// =============================================================================
// RE-ENGAGEMENT HITL APPROVAL (REN-006)
// =============================================================================

export interface ReengagementSignal {
  type: string;
  source: string;
  description: string;
  score_delta: number;
  detected_at: string;
  url?: string;
}

export interface ReengagementApprovalData {
  dealId: string;
  dealName: string;
  dealValue: number | null;
  companyName: string | null;
  contactName: string;
  contactEmail: string;
  ownerName: string | null;
  ownerSlackUserId?: string;
  // Signal context
  score: number;
  temperature: number;
  daysSinceClose: number;
  lossReason: string | null;
  topSignals: ReengagementSignal[];
  // Draft email
  emailSubject: string;
  emailBody: string;
  signalSummary: string;
  // Routing
  appUrl: string;
}

/**
 * Build Re-engagement HITL Approval Message
 *
 * Sent to a rep's DM when the re-engagement pipeline finds a hot deal.
 * Buttons use `reengagement_*::deal_id` convention — routed in slack-interactive.
 *
 * Action IDs:
 *   reengagement_send::{dealId}    — approve and mark as converted
 *   reengagement_edit::{dealId}    — placeholder (edit in-app)
 *   reengagement_snooze::{dealId}  — snooze 14 days
 *   reengagement_remove::{dealId}  — remove from watchlist
 */
export const buildReengagementApprovalMessage = (data: ReengagementApprovalData): SlackMessage => {
  const blocks: SlackBlock[] = [];

  // --- Header — assertive low-tier ---
  const headerText = safeHeaderText(`Opportunity Spotted | ${data.dealName}`);
  blocks.push(header(headerText));

  // --- Deal + contact context ---
  const dealValueStr = data.dealValue
    ? `$${Number(data.dealValue).toLocaleString()}`
    : 'value unknown';

  const contextParts: string[] = [
    `Company: *${truncate(data.companyName || 'Unknown', 50)}*`,
    `Value: *${dealValueStr}*`,
    `Lost: *${data.daysSinceClose} days ago*`,
  ];
  if (data.lossReason) {
    contextParts.push(`Reason: ${data.lossReason.replace(/_/g, ' ')}`);
  }

  blocks.push(section(safeMrkdwn(contextParts.join(' • '))));

  // --- Evidence ---
  blocks.push(context([`Trigger: ${truncate(data.signalSummary, 200)}`]));

  // --- Signal summary ---
  blocks.push(divider());

  const signalSummaryText = safeMrkdwn(
    `*Why now?* ${data.signalSummary}\n\n` +
    `Relevance score: *${data.score}/100* • Temperature: *${(data.temperature * 100).toFixed(0)}%*`
  );
  blocks.push(section(signalSummaryText));

  // Top signals (max 3)
  if (data.topSignals.length > 0) {
    const signalLines = data.topSignals
      .slice(0, 3)
      .map((s) => {
        const typeLabel = s.type.replace(/_/g, ' ');
        const desc = truncate(s.description, 120);
        return `• *[${typeLabel}]* ${desc}`;
      })
      .join('\n');

    blocks.push(section(safeMrkdwn(`*Signals detected:*\n${signalLines}`)));
  }

  // --- Draft email preview ---
  blocks.push(divider());

  blocks.push(section(safeMrkdwn(
    `*Draft email to ${truncate(data.contactName, 50)}* (${truncate(data.contactEmail, 80)})`
  )));

  blocks.push(section(safeMrkdwn(
    `*Subject:* ${truncate(data.emailSubject, 200)}`
  )));

  blocks.push(section(safeMrkdwn(
    `*Message:*\n${truncate(data.emailBody, 700)}`
  )));

  // --- Action buttons ---
  blocks.push(divider());

  const dealIdSafe = truncate(data.dealId, 36); // UUID length

  blocks.push({
    type: 'actions',
    block_id: `reengage_actions::${dealIdSafe}`,
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Approve & Send'), emoji: false },
        style: 'primary',
        action_id: `reengagement_send::${dealIdSafe}`,
        value: safeButtonValue(JSON.stringify({
          dealId: data.dealId,
          contactEmail: data.contactEmail,
          contactName: data.contactName,
        })),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Edit Draft'), emoji: false },
        action_id: `reengagement_edit::${dealIdSafe}`,
        value: safeButtonValue(JSON.stringify({ dealId: data.dealId })),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Snooze 30d'), emoji: false },
        action_id: `reengagement_snooze::${dealIdSafe}`,
        value: safeButtonValue(JSON.stringify({ dealId: data.dealId, snoozeDays: 30 })),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Dismiss'), emoji: false },
        style: 'danger',
        action_id: `reengagement_remove::${dealIdSafe}`,
        value: safeButtonValue(JSON.stringify({ dealId: data.dealId })),
      },
    ],
  });

  // --- Footer context ---
  blocks.push(context([
    safeContextMrkdwn(
      `Re-engagement pipeline • <${data.appUrl}/deals/${data.dealId}|View deal>`
    ),
  ]));

  return {
    blocks,
    text: `Re-engagement opportunity: ${data.dealName} — ${data.signalSummary}`,
  };
};

// =============================================================================
// Enhanced Morning Briefing (BRF-007)
// Extends the standard morning brief with pipeline math, quarter phase,
// coverage ratio, overnight summary, and action recommendation.
// =============================================================================

export interface PipelineMathSummary {
  target: number | null;
  closed_so_far: number;
  pct_to_target: number | null;
  total_pipeline: number;
  weighted_pipeline: number;
  coverage_ratio: number | null;
  gap_amount: number | null;
  projected_close: number | null;
  deals_at_risk: number;
}

export interface QuarterPhaseSummary {
  phase: 'build' | 'progress' | 'close';
  label: string;
  weekOfQuarter: number;
  weeksRemaining: number;
  description: string;
}

export interface OvernightEventSummary {
  type: string;
  description: string;
  deal_name: string | null;
  severity: 'info' | 'positive' | 'attention';
}

export interface ActionRecommendationSummary {
  action: string;
  rationale: string;
  target_deal_name: string | null;
  urgency: 'immediate' | 'today' | 'this_week';
  category: string;
}

export interface EnhancedMorningBriefData extends MorningBriefData {
  pipelineMath: PipelineMathSummary | null;
  quarterPhase: QuarterPhaseSummary | null;
  overnightEvents: OvernightEventSummary[];
  topAction: ActionRecommendationSummary | null;
  briefingFormat: 'detailed' | 'summary';
}

/**
 * Build Enhanced Morning Briefing Slack message.
 * Extends the standard morning brief with pipeline math, quarter phase,
 * overnight summary, and top-action recommendation sections.
 * Respects briefingFormat: 'summary' renders compact bullet form.
 */
export const buildEnhancedMorningBriefMessage = (data: EnhancedMorningBriefData): SlackMessage => {
  const emBlocks: SlackBlock[] = [];
  const isSummary = data.briefingFormat === 'summary';

  const fmtCurrency = (v: number | null | undefined): string => {
    if (v == null) return 'N/A';
    if (!data.currencyCode) return `$${Math.round(v).toLocaleString()}`;
    return new Intl.NumberFormat(data.currencyLocale || 'en-US', {
      style: 'currency',
      currency: data.currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(v);
  };

  const fmtPct = (v: number | null): string =>
    v == null ? 'N/A' : `${Math.round(v * 100)}%`;

  // --- Header ---
  const phaseLabel = data.quarterPhase
    ? ` — ${data.quarterPhase.label} Phase, Wk ${data.quarterPhase.weekOfQuarter}`
    : '';
  emBlocks.push(header(safeHeaderText(`Good morning, ${data.userName}${phaseLabel}`)));
  emBlocks.push(divider());

  // --- Pipeline Math ---
  if (data.pipelineMath) {
    const pm = data.pipelineMath;

    if (isSummary) {
      const parts: string[] = [];
      if (pm.target !== null) {
        parts.push(
          `*Target:* ${fmtCurrency(pm.target)} | *Closed:* ${fmtCurrency(pm.closed_so_far)} (${fmtPct(pm.pct_to_target)})`
        );
      }
      parts.push(
        `*Pipeline:* ${fmtCurrency(pm.total_pipeline)} | *Weighted:* ${fmtCurrency(pm.weighted_pipeline)}`
      );
      if (pm.coverage_ratio !== null) {
        const flag = pm.coverage_ratio < 2.0 ? ' LOW' : '';
        parts.push(`*Coverage:* ${pm.coverage_ratio.toFixed(1)}x${flag}`);
      }
      emBlocks.push(section(safeMrkdwn(parts.join('\n'))));
    } else {
      const fields: Array<{ label: string; value: string }> = [];
      if (pm.target !== null) {
        fields.push({ label: 'Quota Target', value: fmtCurrency(pm.target) });
        fields.push({
          label: 'Closed So Far',
          value: `${fmtCurrency(pm.closed_so_far)} (${fmtPct(pm.pct_to_target)})`,
        });
      }
      fields.push({ label: 'Total Pipeline', value: fmtCurrency(pm.total_pipeline) });
      fields.push({ label: 'Weighted Pipeline', value: fmtCurrency(pm.weighted_pipeline) });
      if (pm.gap_amount !== null) {
        fields.push({ label: 'Gap to Target', value: fmtCurrency(pm.gap_amount) });
      }
      if (pm.coverage_ratio !== null) {
        const flag = pm.coverage_ratio < 2.0 ? ' — LOW' : pm.coverage_ratio >= 3.0 ? ' — GOOD' : '';
        fields.push({ label: 'Coverage Ratio', value: `${pm.coverage_ratio.toFixed(1)}x${flag}` });
      }
      if (pm.projected_close !== null) {
        fields.push({ label: 'Projected Close', value: fmtCurrency(pm.projected_close) });
      }
      if (pm.deals_at_risk > 0) {
        fields.push({ label: 'Deals at Risk', value: `${pm.deals_at_risk}` });
      }
      emBlocks.push(section(safeMrkdwn('*Pipeline Snapshot*')));
      if (fields.length > 0) {
        emBlocks.push(sectionWithFields(fields));
      }
    }
    emBlocks.push(divider());
  }

  // --- Quarter Phase (detailed only) ---
  if (data.quarterPhase && !isSummary) {
    const qp = data.quarterPhase;
    const weeksText =
      qp.weeksRemaining === 1 ? '1 week remaining' : `${qp.weeksRemaining} weeks remaining`;
    emBlocks.push(
      context([safeContextMrkdwn(`${weeksText} in quarter. ${truncate(qp.description, 100)}`)])
    );
    emBlocks.push(divider());
  }

  // --- Top Action ---
  if (data.topAction) {
    const ta = data.topAction;
    const urgencyPrefix =
      ta.urgency === 'immediate' ? 'IMMEDIATE: ' : ta.urgency === 'today' ? 'Today: ' : '';
    emBlocks.push(
      section(safeMrkdwn(`*Highest Leverage Action*\n${urgencyPrefix}${ta.action}`))
    );
    if (!isSummary && ta.rationale) {
      emBlocks.push(context([safeContextMrkdwn(ta.rationale)]));
    }
    emBlocks.push(divider());
  }

  // --- Overnight Events ---
  if (data.overnightEvents.length > 0) {
    const attentionEvents = data.overnightEvents.filter(e => e.severity === 'attention');
    const positiveEvents = data.overnightEvents.filter(e => e.severity === 'positive');
    const infoEvents = data.overnightEvents.filter(e => e.severity === 'info');

    if (isSummary) {
      const parts: string[] = [];
      if (attentionEvents.length > 0)
        parts.push(`${attentionEvents.length} signal${attentionEvents.length > 1 ? 's' : ''} need attention`);
      if (positiveEvents.length > 0)
        parts.push(`${positiveEvents.length} positive event${positiveEvents.length > 1 ? 's' : ''}`);
      if (infoEvents.length > 0)
        parts.push(`${infoEvents.length} enrichment${infoEvents.length > 1 ? 's' : ''} completed`);
      emBlocks.push(context([`While you slept: ${parts.join(', ')}`]));
    } else {
      emBlocks.push(
        section(safeMrkdwn(`*While you slept (${data.overnightEvents.length} update${data.overnightEvents.length > 1 ? 's' : ''})*`))
      );
      const prioritised = [
        ...attentionEvents,
        ...positiveEvents,
        ...infoEvents,
      ].slice(0, 3);
      for (const ev of prioritised) {
        const badge =
          ev.severity === 'attention' ? 'Attention' :
          ev.severity === 'positive' ? 'Good news' : 'Info';
        const dealCtx = ev.deal_name ? ` — _${truncate(ev.deal_name, 40)}_` : '';
        emBlocks.push(
          context([`[${badge}] ${truncate(ev.description, 120)}${dealCtx}`])
        );
      }
      if (data.overnightEvents.length > 3) {
        emBlocks.push(context([`+${data.overnightEvents.length - 3} more overnight updates`]));
      }
    }
    emBlocks.push(divider());
  }

  // --- Today's Meetings ---
  if (data.meetings.length > 0) {
    emBlocks.push(section(safeMrkdwn(`*Meetings today (${data.meetings.length})*`)));
    data.meetings.slice(0, 3).forEach(m => {
      const dealCtx = m.dealValue ? ` — ${fmtCurrency(m.dealValue)}` : '';
      const companyCtx = m.companyName ? ` at ${m.companyName}` : '';
      emBlocks.push(
        context([`${m.time} — *${truncate(m.title, 60)}*${companyCtx}${dealCtx}`])
      );
    });
    if (data.meetings.length > 3) {
      emBlocks.push(context([`+${data.meetings.length - 3} more meetings`]));
    }
    emBlocks.push(divider());
  }

  // --- Urgent Deals ---
  const urgentDeals = data.deals
    .filter(d => d.isAtRisk || (d.daysSinceActivity && d.daysSinceActivity > 7))
    .slice(0, 3);
  if (urgentDeals.length > 0) {
    emBlocks.push(section(safeMrkdwn('*Deals needing attention*')));
    for (const d of urgentDeals) {
      const staleLabel =
        d.daysSinceActivity && d.daysSinceActivity > 7 ? ` — ${d.daysSinceActivity}d dark` : '';
      emBlocks.push(context([`${truncate(d.name, 50)} — ${fmtCurrency(d.value)}${staleLabel}`]));
    }
    emBlocks.push(divider());
  }

  // --- Overdue Tasks ---
  if (data.tasks.overdue.length > 0) {
    const taskSummary = data.tasks.overdue
      .slice(0, 3)
      .map(t =>
        `${truncate(t.title, 60)} (${t.daysOverdue}d overdue${t.dealName ? ` — ${t.dealName}` : ''})`
      )
      .join('\n');
    emBlocks.push(
      section(safeMrkdwn(`*Overdue tasks (${data.tasks.overdue.length})*\n${taskSummary}`))
    );
    emBlocks.push(divider());
  }

  // --- Footer actions ---
  emBlocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Open Pipeline'), emoji: false },
        action_id: 'open_pipeline',
        url: `${data.appUrl}/pipeline`,
        style: 'primary',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Ask Copilot'), emoji: false },
        action_id: 'open_copilot',
        url: `${data.appUrl}/copilot`,
      },
    ],
  });

  const fallbackText = data.pipelineMath?.target
    ? `Good morning ${data.userName} — Pipeline: ${fmtCurrency(data.pipelineMath.total_pipeline)}, Target: ${fmtCurrency(data.pipelineMath.target)}`
    : `Good morning ${data.userName} — Pipeline: ${fmtCurrency(data.pipelineMath?.total_pipeline ?? 0)}`;

  return { blocks: emBlocks, text: fallbackText };
};

// =============================================================================
// Internal Meeting Prep — IMP-006
// =============================================================================

export interface InternalPrepMessageData {
  eventId: string;
  meetingTitle: string;
  meetingType: 'one_on_one' | 'pipeline_review' | 'qbr' | 'standup' | 'other';
  startTime: string;          // ISO string
  sections: Array<{ title: string; body: string }>;
  managerPrereadEnabled: boolean;
  appUrl: string;
}

/**
 * Build a Slack Block Kit message for an internal meeting prep briefing.
 * Includes a "Send to manager as pre-read" button when enabled.
 */
export const buildInternalPrepMessage = (data: InternalPrepMessageData): SlackMessage => {
  const blocks: SlackBlock[] = [];

  const typeLabel: Record<string, string> = {
    one_on_one: '1:1',
    pipeline_review: 'Pipeline Review',
    qbr: 'QBR',
    standup: 'Standup',
    other: 'Internal Meeting',
  };

  const label = typeLabel[data.meetingType] || 'Internal Meeting';
  const startDate = new Date(data.startTime).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  // Header
  blocks.push(headerBlock(safeHeaderText(`${label} Prep: ${data.meetingTitle}`)));
  blocks.push(contextBlock([safeContextMrkdwn(`${startDate} — auto-generated by 60 Copilot`)]));
  blocks.push(divider());

  // Sections (render up to 5 to stay within Slack's 50-block limit)
  const visibleSections = data.sections.slice(0, 5);
  for (const sec of visibleSections) {
    const body = safeMrkdwn(`*${sec.title}*\n${sec.body}`);
    blocks.push(section(body));
    blocks.push(divider());
  }

  // Action buttons
  const elements: SlackBlock[] = [
    {
      type: 'button',
      text: { type: 'plain_text', text: safeButtonText('View Full Prep'), emoji: false },
      action_id: 'view_brief',
      url: `${data.appUrl}/calendar`,
      style: 'primary',
    },
  ];

  if (data.managerPrereadEnabled) {
    elements.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: safeButtonText('Send to manager as pre-read'),
        emoji: false,
      },
      action_id: safeButtonValue(`imp_send_preread::${data.eventId}`),
      value: safeButtonValue(data.eventId),
    });
  }

  blocks.push({ type: 'actions', elements });

  blocks.push(contextBlock([
    safeContextMrkdwn(
      '_Internal meeting prep — visible only to you. ' +
      'Use the button above to share a condensed pre-read with your manager._'
    ),
  ]));

  const fallback = `${label} prep ready: ${data.meetingTitle} at ${startDate}`;
  return { blocks, text: safeMrkdwn(fallback) };
};

/**
 * Build a condensed manager pre-read DM for an internal meeting.
 * Sent when the rep clicks "Send to manager as pre-read".
 */
export const buildManagerPrereadMessage = (data: {
  repName: string;
  meetingTitle: string;
  meetingType: string;
  startTime: string;
  sections: Array<{ title: string; body: string }>;
  appUrl: string;
}): SlackMessage => {
  const blocks: SlackBlock[] = [];

  const startDate = new Date(data.startTime).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  blocks.push(headerBlock(safeHeaderText(`Pre-read: ${data.meetingTitle}`)));
  blocks.push(section(safeMrkdwn(
    `*Sent by:* ${data.repName}\n` +
    `*Time:* ${startDate}\n` +
    `*Type:* ${data.meetingType}`
  )));
  blocks.push(divider());

  // Show first 3 sections in the pre-read (condensed)
  for (const sec of data.sections.slice(0, 3)) {
    blocks.push(section(safeMrkdwn(`*${sec.title}*\n${safeMrkdwn(sec.body)}`)));
  }

  blocks.push(contextBlock([
    safeContextMrkdwn(`_Pre-read shared by ${data.repName} via 60 Copilot_`),
  ]));

  return {
    blocks,
    text: `Meeting pre-read from ${data.repName}: ${data.meetingTitle}`,
  };
};

// =============================================================================
// EOD Synthesis Message (EOD-006)
// =============================================================================

export interface EODScorecardData {
  date: string;
  timezone: string;
  meetings_completed: number;
  meetings_no_show: number;
  emails_sent: number;
  crm_updates_count: number;
  tasks_completed: number;
  deals_created_count: number;
  deals_created_value: number;
  pipeline_value_today: number;
  pipeline_value_change: number;
}

export interface EODOpenItemData {
  pending_replies: Array<{
    contact_name: string | null;
    subject: string | null;
    hours_waiting: number;
    deal_name: string | null;
  }>;
  unsent_drafts: number;
  incomplete_actions: Array<{
    description: string;
    meeting_title: string | null;
    deal_name: string | null;
  }>;
  overdue_tasks: Array<{
    title: string;
    days_overdue: number;
    deal_name: string | null;
    priority: string | null;
  }>;
  total_attention_items: number;
}

export interface EODTomorrowMeetingData {
  title: string;
  start_time: string;
  attendees_count: number;
  deal_name: string | null;
  prep_status: 'ready' | 'queued' | 'none';
  attention_flags: Array<{
    type: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
  }>;
}

export interface EODTomorrowPreviewData {
  date: string;
  meetings: EODTomorrowMeetingData[];
  total_meetings: number;
  high_attention_count: number;
  suggested_first_action: string | null;
}

export interface EODOvernightPlanItemData {
  type: string;
  label: string;
  description: string;
  count: number;
  will_appear_in_briefing: boolean;
}

export interface EODOvernightPlanData {
  plan_items: EODOvernightPlanItemData[];
  total_items: number;
  morning_briefing_preview: string;
}

export interface EODSynthesisData {
  userName: string;
  slackUserId?: string;
  date: string;
  scorecard: EODScorecardData;
  openItems: EODOpenItemData;
  tomorrowPreview?: EODTomorrowPreviewData;
  overnightPlan?: EODOvernightPlanData;
  detailLevel?: 'full' | 'summary';
  currencyCode?: string;
  currencyLocale?: string;
  appUrl: string;
}

/**
 * Build the EOD Synthesis Slack message.
 *
 * Slack limit: 50 blocks maximum.
 * Priority order if over limit:
 *   1. Header + Scorecard (always shown)
 *   2. Open Items (high-attention) — shown if space
 *   3. Tomorrow Preview — shown if space
 *   4. Overnight Plan — shown if space
 *   5. Footer actions — always included at end
 */
export const buildEODSynthesisMessage = (data: EODSynthesisData): SlackMessage => {
  const MAX_BLOCKS = 50;
  const isSummary = data.detailLevel === 'summary';

  const fmtCurrency = (v: number | null | undefined): string => {
    if (v == null) return 'N/A';
    if (!data.currencyCode) return `$${Math.round(v).toLocaleString()}`;
    return new Intl.NumberFormat(data.currencyLocale || 'en-US', {
      style: 'currency',
      currency: data.currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(v);
  };

  const fmtTime = (isoStr: string): string => {
    try {
      return new Date(isoStr).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return isoStr;
    }
  };

  const sc = data.scorecard;
  const oi = data.openItems;

  // ---- Section builders (each returns SlackBlock[]) ----

  const buildScorecard = (): SlackBlock[] => {
    const blocks: SlackBlock[] = [];
    const userMention = data.slackUserId ? `<@${data.slackUserId}>` : data.userName;
    blocks.push(header(safeHeaderText(`End of day, ${userMention}`)));
    blocks.push(divider());

    if (isSummary) {
      const parts: string[] = [];
      if (sc.meetings_completed > 0) parts.push(`*Meetings:* ${sc.meetings_completed}`);
      if (sc.emails_sent > 0) parts.push(`*Emails:* ${sc.emails_sent}`);
      if (sc.tasks_completed > 0) parts.push(`*Tasks done:* ${sc.tasks_completed}`);
      if (sc.deals_created_count > 0)
        parts.push(`*Deals created:* ${sc.deals_created_count} (${fmtCurrency(sc.deals_created_value)})`);
      const pipelineSign = sc.pipeline_value_change >= 0 ? '+' : '';
      parts.push(`*Pipeline:* ${fmtCurrency(sc.pipeline_value_today)} (${pipelineSign}${fmtCurrency(sc.pipeline_value_change)})`);
      blocks.push(section(safeMrkdwn(`*Today at a glance*\n${parts.join(' | ')}`)));
    } else {
      const fields: Array<{ label: string; value: string }> = [
        {
          label: 'Meetings',
          value: `${sc.meetings_completed}${sc.meetings_no_show > 0 ? ` (${sc.meetings_no_show} no-show)` : ''}`,
        },
        { label: 'Emails Sent', value: `${sc.emails_sent}` },
        { label: 'CRM Updates', value: `${sc.crm_updates_count}` },
        { label: 'Tasks Completed', value: `${sc.tasks_completed}` },
      ];
      if (sc.deals_created_count > 0) {
        fields.push({
          label: 'Deals Created',
          value: `${sc.deals_created_count} — ${fmtCurrency(sc.deals_created_value)}`,
        });
      }
      const pipelineSign = sc.pipeline_value_change >= 0 ? '+' : '';
      fields.push({
        label: 'Pipeline Today',
        value: `${fmtCurrency(sc.pipeline_value_today)} (${pipelineSign}${fmtCurrency(sc.pipeline_value_change)} vs yesterday)`,
      });
      blocks.push(section(safeMrkdwn("*Today's scorecard*")));
      blocks.push(sectionWithFields(fields));
    }
    blocks.push(divider());
    return blocks;
  };

  const buildOpenItems = (): SlackBlock[] => {
    if (oi.total_attention_items === 0) return [];
    const blks: SlackBlock[] = [];

    if (isSummary) {
      const parts: string[] = [];
      if (oi.pending_replies.length > 0)
        parts.push(`${oi.pending_replies.length} pending repl${oi.pending_replies.length > 1 ? 'ies' : 'y'}`);
      if (oi.overdue_tasks.length > 0)
        parts.push(`${oi.overdue_tasks.length} overdue task${oi.overdue_tasks.length > 1 ? 's' : ''}`);
      if (oi.incomplete_actions.length > 0)
        parts.push(`${oi.incomplete_actions.length} incomplete action item${oi.incomplete_actions.length > 1 ? 's' : ''}`);
      blks.push(section(safeMrkdwn(`*Before you wrap up:* ${parts.join(', ')}`)));
    } else {
      blks.push(section(safeMrkdwn(`*Open items (${oi.total_attention_items})*`)));

      // Pending replies (top 3)
      for (const reply of oi.pending_replies.slice(0, 3)) {
        const who = reply.contact_name || 'Unknown sender';
        const subj = reply.subject ? ` — "${truncate(reply.subject, 50)}"` : '';
        const dealCtx = reply.deal_name ? ` · _${truncate(reply.deal_name, 30)}_` : '';
        blks.push(context([`Reply pending: ${truncate(who, 30)}${subj} · ${reply.hours_waiting}h ago${dealCtx}`]));
      }

      // Overdue tasks (top 3)
      for (const task of oi.overdue_tasks.slice(0, 3)) {
        const dealCtx = task.deal_name ? ` — _${truncate(task.deal_name, 30)}_` : '';
        blks.push(context([`Overdue task: ${truncate(task.title, 60)} (${task.days_overdue}d)${dealCtx}`]));
      }

      // Incomplete actions (top 2)
      for (const actionItem of oi.incomplete_actions.slice(0, 2)) {
        const meetingCtx = actionItem.meeting_title
          ? ` from "${truncate(actionItem.meeting_title, 40)}"`
          : '';
        blks.push(context([`Action item${meetingCtx}: ${truncate(actionItem.description, 80)}`]));
      }

      if (oi.unsent_drafts > 0) {
        blks.push(context([`${oi.unsent_drafts} email draft${oi.unsent_drafts > 1 ? 's' : ''} unsent`]));
      }
    }
    blks.push(divider());
    return blks;
  };

  const buildTomorrowPreview = (): SlackBlock[] => {
    if (!data.tomorrowPreview || data.tomorrowPreview.total_meetings === 0) return [];
    const tp = data.tomorrowPreview;
    const blks: SlackBlock[] = [];

    if (isSummary) {
      const flagNote = tp.high_attention_count > 0
        ? ` — ${tp.high_attention_count} attention flag${tp.high_attention_count > 1 ? 's' : ''}`
        : '';
      blks.push(section(safeMrkdwn(
        `*Tomorrow:* ${tp.total_meetings} meeting${tp.total_meetings > 1 ? 's' : ''}${flagNote}`
      )));
    } else {
      blks.push(section(safeMrkdwn(`*Tomorrow\'s meetings (${tp.total_meetings})*`)));

      for (const m of tp.meetings.slice(0, 4)) {
        const time = fmtTime(m.start_time);
        const prepBadge =
          m.prep_status === 'ready' ? 'Brief ready' :
          m.prep_status === 'queued' ? 'Brief queued' : 'No brief';
        const dealCtx = m.deal_name ? ` · _${truncate(m.deal_name, 30)}_` : '';
        const flagNote = m.attention_flags.length > 0
          ? ` · ${truncate(m.attention_flags[0].description, 60)}`
          : '';
        blks.push(context([`${time} — *${truncate(m.title, 50)}*${dealCtx} · ${prepBadge}${flagNote}`]));
      }

      if (tp.meetings.length > 4) {
        blks.push(context([`+${tp.meetings.length - 4} more meeting${tp.meetings.length - 4 > 1 ? 's' : ''} tomorrow`]));
      }

      if (tp.suggested_first_action) {
        blks.push(section(safeMrkdwn(
          `*Suggested first action:* ${truncate(tp.suggested_first_action, 200)}`
        )));
      }
    }
    blks.push(divider());
    return blks;
  };

  const buildOvernightPlan = (): SlackBlock[] => {
    if (!data.overnightPlan || data.overnightPlan.total_items === 0) return [];
    const op = data.overnightPlan;
    const blks: SlackBlock[] = [];

    if (isSummary) {
      blks.push(context([safeContextMrkdwn(op.morning_briefing_preview)]));
    } else {
      const briefingItems = op.plan_items.filter(i => i.will_appear_in_briefing);
      if (briefingItems.length > 0) {
        const itemList = briefingItems
          .slice(0, 4)
          .map(i => `• ${i.label}: ${truncate(i.description, 80)}`)
          .join('\n');
        blks.push(section(safeMrkdwn(`*Tonight the agent will:*\n${itemList}`)));
      }
      blks.push(context([safeContextMrkdwn(op.morning_briefing_preview)]));
    }
    blks.push(divider());
    return blks;
  };

  // ---- Assemble sections with 50-block limit enforcement ----

  const scorecardBlocks = buildScorecard();
  const openItemBlocks = buildOpenItems();
  const tomorrowBlocks = buildTomorrowPreview();
  const overnightBlocks = buildOvernightPlan();

  // Footer actions block (always included — counts as 1 block)
  const footerBlock: SlackBlock = {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Looks Good'), emoji: false },
        action_id: 'eod_looks_good',
        value: safeButtonValue(`eod::${data.date}`),
        style: 'primary',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Adjust Priorities'), emoji: false },
        action_id: 'eod_adjust_priorities',
        value: safeButtonValue(`eod::${data.date}`),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText('Add a Task'), emoji: false },
        action_id: 'eod_add_task',
        value: safeButtonValue(`eod::${data.date}`),
      },
    ],
  };

  // Reserve 1 slot for footer; fill remaining slots in priority order
  const available = MAX_BLOCKS - 1;
  const allBlocks: SlackBlock[] = [];

  for (const b of scorecardBlocks) {
    if (allBlocks.length < available) allBlocks.push(b);
  }
  for (const b of openItemBlocks) {
    if (allBlocks.length < available) allBlocks.push(b);
  }
  for (const b of tomorrowBlocks) {
    if (allBlocks.length < available) allBlocks.push(b);
  }
  for (const b of overnightBlocks) {
    if (allBlocks.length < available) allBlocks.push(b);
  }

  allBlocks.push(footerBlock);

  // Fallback text for notifications
  const activitySummary = [
    sc.meetings_completed > 0 ? `${sc.meetings_completed} meeting${sc.meetings_completed > 1 ? 's' : ''}` : null,
    sc.emails_sent > 0 ? `${sc.emails_sent} email${sc.emails_sent > 1 ? 's' : ''}` : null,
    sc.tasks_completed > 0 ? `${sc.tasks_completed} task${sc.tasks_completed > 1 ? 's' : ''} done` : null,
  ].filter(Boolean).join(', ') || 'See your EOD summary';

  const attentionNote = oi.total_attention_items > 0
    ? ` ${oi.total_attention_items} item${oi.total_attention_items > 1 ? 's' : ''} need attention.`
    : '';

  const fallbackText = `End of day, ${data.userName} — ${activitySummary}.${attentionNote}`.trim();

  return { blocks: allBlocks, text: fallbackText };
};

// =============================================================================
// Command Centre Digest — CC8-007
// =============================================================================

export interface CCDigestItemBlock {
  id: string;
  title: string;
  summary: string;
  urgency: 'critical' | 'high' | 'normal' | 'low';
  item_type: string;
  has_drafted_action: boolean;
  drafted_action_display?: string;
}

export interface CCDigestTierBlock {
  items: CCDigestItemBlock[];
  total_count: number;
}

export interface CCDigestDataBlock {
  critical: CCDigestTierBlock;
  high: CCDigestTierBlock;
  normal_count: number;
  stats: {
    total_items: number;
    auto_completed_count: number;
    pipeline_value_sum: number;
    currency_code?: string;
    currency_locale?: string;
    proposals_awaiting: number;
  };
}

const CC_APP_URL = 'https://app.use60.com/command-centre';

const URGENCY_LABEL: Record<string, string> = {
  critical: '[!]',
  high: '[!]',
  normal: '',
  low: '',
};

/**
 * Build a Slack digest message for the Command Centre.
 * Groups items into critical / high tiers with HITL action buttons,
 * then shows a summary count for normal/low items and footer stats.
 *
 * Stays within Slack's 50-block limit by capping critical to 5 and high to 3.
 * Action IDs: cc_approve, cc_edit, cc_snooze, cc_dismiss.
 */
export const buildCommandCentreDigest = (data: CCDigestDataBlock): SlackMessage => {
  const blocks: SlackBlock[] = [];
  const MAX_BLOCKS = 50;

  const fmtCurrency = (value: number): string => {
    const code = (data.stats.currency_code || 'GBP').toUpperCase();
    const locale =
      data.stats.currency_locale ||
      (code === 'USD' ? 'en-US' : code === 'EUR' ? 'en-IE' : code === 'AUD' ? 'en-AU' : code === 'CAD' ? 'en-CA' : 'en-GB');
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // ---- Header ----
  blocks.push(header(safeHeaderText('Command Centre — Action Required')));
  blocks.push(
    context([
      safeContextMrkdwn(
        `${data.stats.total_items} item${data.stats.total_items !== 1 ? 's' : ''} need your attention — generated by 60 Copilot`,
      ),
    ]),
  );
  blocks.push(divider());

  // ---- Helper: render one item with HITL buttons ----
  const renderItem = (item: CCDigestItemBlock): void => {
    const emoji = URGENCY_LABEL[item.urgency] || '';
    const summaryLine = item.summary
      ? `\n${truncate(item.summary, 200)}`
      : '';
    const draftLine = item.has_drafted_action && item.drafted_action_display
      ? `\n_Suggested: ${truncate(item.drafted_action_display, 120)}_`
      : '';

    blocks.push(
      section(
        safeMrkdwn(
          `${emoji} *${truncate(item.title, 100)}*${summaryLine}${draftLine}`,
        ),
      ),
    );

    blocks.push(
      actions([
        {
          text: safeButtonText('Send'),
          actionId: `cc_approve::${item.id}`,
          value: item.id,
          style: 'primary',
        },
        {
          text: safeButtonText('Edit'),
          actionId: `cc_edit::${item.id}`,
          value: item.id,
        },
        {
          text: safeButtonText('Later'),
          actionId: `cc_snooze::${item.id}`,
          value: item.id,
        },
        {
          text: safeButtonText('Dismiss'),
          actionId: `cc_dismiss::${item.id}`,
          value: item.id,
          style: 'danger',
        },
        {
          text: safeButtonText('View'),
          actionId: `cc_view::${item.id}`,
          value: item.id,
          url: `${CC_APP_URL}?item=${item.id}`,
        },
      ]),
    );
  };

  // ---- Critical tier ----
  if (data.critical.total_count > 0) {
    blocks.push(section(safeMrkdwn(`*${URGENCY_LABEL.critical} Critical — ${data.critical.total_count} item${data.critical.total_count !== 1 ? 's' : ''}*`)));

    for (const item of data.critical.items) {
      if (blocks.length >= MAX_BLOCKS - 5) break; // keep room for footer
      renderItem(item);
    }

    if (data.critical.total_count > data.critical.items.length) {
      const more = data.critical.total_count - data.critical.items.length;
      blocks.push(
        context([safeContextMrkdwn(`+${more} more critical item${more !== 1 ? 's' : ''} — open Command Centre to see all`)]),
      );
    }

    blocks.push(divider());
  }

  // ---- High tier ----
  if (data.high.total_count > 0) {
    blocks.push(section(safeMrkdwn(`*${URGENCY_LABEL.high} High — ${data.high.total_count} item${data.high.total_count !== 1 ? 's' : ''}*`)));

    for (const item of data.high.items) {
      if (blocks.length >= MAX_BLOCKS - 5) break;
      renderItem(item);
    }

    if (data.high.total_count > data.high.items.length) {
      const more = data.high.total_count - data.high.items.length;
      blocks.push(
        context([safeContextMrkdwn(`+${more} more high-priority item${more !== 1 ? 's' : ''} — open Command Centre to see all`)]),
      );
    }

    blocks.push(divider());
  }

  // ---- Normal / Low summary ----
  if (data.normal_count > 0) {
    blocks.push(
      section(
        safeMrkdwn(
          `${URGENCY_LABEL.normal} *${data.normal_count} normal/low item${data.normal_count !== 1 ? 's' : ''}*`,
        ),
      ),
    );
    blocks.push(
      actions([
        {
          text: safeButtonText(`Show all ${data.normal_count}`),
          actionId: 'cc_show_all_normal',
          value: 'normal',
          url: CC_APP_URL,
        },
      ]),
    );
    blocks.push(divider());
  }

  // ---- Footer stats ----
  const statParts: string[] = [
    `*Total:* ${data.stats.total_items} item${data.stats.total_items !== 1 ? 's' : ''}`,
  ];
  if (data.stats.auto_completed_count > 0) {
    statParts.push(`*Auto-completed overnight:* ${data.stats.auto_completed_count}`);
  }
  if (data.stats.pipeline_value_sum > 0) {
    statParts.push(`*Pipeline at stake:* ${fmtCurrency(data.stats.pipeline_value_sum)}`);
  }
  if (data.stats.proposals_awaiting > 0) {
    statParts.push(
      `*Proposals awaiting response:* ${data.stats.proposals_awaiting}`,
    );
  }
  blocks.push(context([safeContextMrkdwn(statParts.join('  |  '))]));

  // ---- Open Command Centre CTA ----
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: safeButtonText('Open Command Centre'),
          emoji: false,
        },
        action_id: 'cc_open_command_centre',
        url: CC_APP_URL,
        style: 'primary',
      },
    ],
  });

  // Fallback notification text
  const criticalNote =
    data.critical.total_count > 0
      ? ` ${data.critical.total_count} critical item${data.critical.total_count !== 1 ? 's' : ''} need immediate attention.`
      : '';
  const fallbackText = safeMrkdwn(
    `Command Centre: ${data.stats.total_items} item${data.stats.total_items !== 1 ? 's' : ''} require action.${criticalNote}`,
  );

  return { blocks, text: fallbackText };
};

// ============================================================================
// CC12-003: Auto-execution overnight report
// ============================================================================

export interface AutoExecReportItem {
  id: string;
  title: string;
  item_type: string;
  drafted_action_type: string;
  drafted_action_display_text: string;
  confidence_score: number;
  resolved_at: string;
}

/**
 * Build a Slack summary of items auto-completed overnight by the CC engine.
 *
 * Format:
 *   use60 auto-completed N items overnight
 *   \u2705 Updated Acme Corp deal stage \u2192 Proposal
 *   \u2705 Created follow-up task: Call Sarah Chen (due Monday)
 *   ...
 *   All changes reversible for 24hrs.
 *   [View in Command Centre \u2192]  [Undo any \u2192]
 *
 * Stays within the 50-block limit (MAX_BLOCKS = 50).
 * Action IDs: cc_open_command_centre, cc_undo_menu.
 */
export function buildAutoExecutionReport(items: AutoExecReportItem[]): any[] {
  const MAX_BLOCKS = 50;
  const blocks: SlackBlock[] = [];

  const n = items.length;
  if (n === 0) return blocks;

  // ---- Header ----
  blocks.push(
    section(
      safeMrkdwn(
        `\u2705 *use60 auto-completed ${n} item${n !== 1 ? 's' : ''} overnight*`,
      ),
    ),
  );
  blocks.push(divider());

  // ---- One line per item ---- (cap at MAX_BLOCKS - 5 to leave room for footer)
  for (let i = 0; i < items.length; i++) {
    if (blocks.length >= MAX_BLOCKS - 5) {
      const remaining = items.length - i;
      blocks.push(
        context([
          safeContextMrkdwn(
            `+${remaining} more item${remaining !== 1 ? 's' : ''} — open Command Centre to see all`,
          ),
        ]),
      );
      break;
    }

    const item = items[i];
    const displayText = item.drafted_action_display_text
      ? truncate(item.drafted_action_display_text, 120)
      : truncate(item.title, 120);

    blocks.push(section(safeMrkdwn(`\u2705 ${displayText}`)));
  }

  // ---- Footer note ----
  blocks.push(divider());
  blocks.push(context([safeContextMrkdwn('All changes reversible for 24hrs.')]));

  // ---- CTA buttons ----
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: safeButtonText('View in Command Centre \u2192'),
          emoji: false,
        },
        action_id: 'cc_open_command_centre',
        url: CC_APP_URL,
        style: 'primary',
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: safeButtonText('Undo any \u2192'),
          emoji: false,
        },
        action_id: 'cc_undo_menu',
        value: 'undo_menu',
      },
    ],
  });

  return blocks;
}

// =============================================================================
// buildAutonomyPromotionMessage — AUT-005
// =============================================================================

export interface AutonomyPromotionData {
  orgId: string;
  actionType: string;
  actionLabel: string;
  approvedCount: number;
  totalCount: number;
  rejectionRate: number; // 0–1
  adminSlackUserId?: string;
}

/**
 * Build a Slack DM to org admin suggesting they promote an action type to auto-approve.
 * Sent when an action has >= 20 approvals with < 5% rejection over 30 days.
 */
export function buildAutonomyPromotionMessage(data: AutonomyPromotionData): SlackMessage {
  const {
    orgId,
    actionType,
    actionLabel,
    approvedCount,
    totalCount,
    rejectionRate,
    adminSlackUserId,
  } = data;

  const rejectionPercent = Math.round(rejectionRate * 100);
  const greeting = adminSlackUserId ? `<@${adminSlackUserId}> ` : '';
  const summaryText = `${greeting}*${actionLabel}* has been approved ${approvedCount}/${totalCount} times this month with ${rejectionPercent}% corrections. Your team is ready to auto-approve this action.`;

  return {
    text: `Automation opportunity: ${actionLabel} — ${approvedCount} approvals, ${rejectionPercent}% rejection rate`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: safeHeaderText('Automation Opportunity'),
          emoji: false,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: safeMrkdwn(summaryText),
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: safeFieldText(`*Action Type*\n${actionLabel}`),
          },
          {
            type: 'mrkdwn',
            text: safeFieldText(`*Approval Rate*\n${approvedCount}/${totalCount} (${100 - rejectionPercent}%)`),
          },
        ],
      },
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: safeButtonText('Enable Auto-Approve'),
              emoji: false,
            },
            style: 'primary',
            action_id: 'autonomy_promote_approve',
            value: safeButtonValue(JSON.stringify({ org_id: orgId, action_type: actionType, policy: 'auto' })),
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: safeButtonText('Dismiss'),
              emoji: false,
            },
            action_id: 'autonomy_promote_dismiss',
            value: safeButtonValue(JSON.stringify({ org_id: orgId, action_type: actionType })),
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: safeContextMrkdwn('You can always adjust this in Settings > Autonomy & Approvals.'),
          },
        ],
      },
    ],
  };
}

// =============================================================================
// buildAutonomyDemotionMessage — GRAD-004
// =============================================================================

export interface AutonomyDemotionData {
  orgId: string;
  actionType: string;
  actionLabel: string;
  fromPolicy: string;
  toPolicy: string;
  rejectionRate: number; // 0–100
  cooldownDays: number;
  reason: string;
}

/**
 * Build a Slack DM notifying org admin that an action type was auto-demoted
 * due to a rejection rate spike post-promotion.
 */
export function buildAutonomyDemotionMessage(data: AutonomyDemotionData): SlackMessage {
  const {
    actionLabel,
    fromPolicy,
    toPolicy,
    rejectionRate,
    cooldownDays,
    reason,
  } = data;

  const rejectionPct = Math.round(rejectionRate);
  const summaryText = `*${actionLabel}* has been demoted from *${fromPolicy}* to *${toPolicy}* due to elevated rejection rates.`;

  return {
    text: `Safety demotion: ${actionLabel} reverted from ${fromPolicy} to ${toPolicy} (${rejectionPct}% rejection rate)`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: safeHeaderText('Autonomy Safety Demotion'),
          emoji: false,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: safeMrkdwn(summaryText),
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: safeFieldText(`*Action Type*\n${actionLabel}`),
          },
          {
            type: 'mrkdwn',
            text: safeFieldText(`*Rejection Rate (7d)*\n${rejectionPct}%`),
          },
          {
            type: 'mrkdwn',
            text: safeFieldText(`*Policy Change*\n${fromPolicy} -> ${toPolicy}`),
          },
          {
            type: 'mrkdwn',
            text: safeFieldText(`*Cooldown*\n${cooldownDays} days`),
          },
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: safeMrkdwn(`*Reason:* ${reason}`),
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: safeContextMrkdwn(`This action cannot be re-promoted for ${cooldownDays} days. You can review this in Settings > Autonomy & Approvals.`),
          },
        ],
      },
    ],
  };
}

// =============================================================================
// Enhanced Coaching Digest Blocks (Phase 6: PRD-19)
// =============================================================================

export interface EnhancedCoachingDigestData {
  repName: string;
  weekOf: string;
  meetingsAnalyzed: number;
  overallScore: number | null;
  talkRatio: number | null;
  questionQuality: number | null;
  objectionHandling: number | null;
  discoveryDepth: number | null;
  weeklyWins: string[];
  dataBackedInsights: Array<{ insight: string; evidence: string; action: string }>;
  pipelinePatterns: Array<{ title: string; severity: string; pattern_type: string }>;
  competitiveTrends: Array<{ name: string; mentions: number; win_rate: number | null }>;
  progressionComparison: {
    status: string;
    vs_last_week?: { improving: string[]; declining: string[]; overall_trend: string };
    weeks_tracked?: number;
  };
  teamIntelligenceTip: string | null;
  forecastAccuracy: number | null;
}

export function buildEnhancedCoachingDigestBlocks(data: EnhancedCoachingDigestData): SlackMessage {
  const blocks: SlackBlock[] = [];

  // Header
  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: safeHeaderText(`Weekly Coaching Digest — ${data.weekOf}`), emoji: false },
  });

  // Score summary
  const scoreEmoji = (data.overallScore || 0) >= 0.7 ? ':star:' : (data.overallScore || 0) >= 0.5 ? ':chart_with_upwards_trend:' : ':target:';
  const trendText = data.progressionComparison?.vs_last_week?.overall_trend === 'improving'
    ? ' :arrow_up: Improving'
    : data.progressionComparison?.vs_last_week?.overall_trend === 'declining'
    ? ' :small_red_triangle_down: Needs attention'
    : ' :left_right_arrow: Stable';

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: safeMrkdwn(
        `${scoreEmoji} *${data.repName}* — ${data.meetingsAnalyzed} meetings analyzed this week${data.overallScore != null ? `\nOverall Score: *${Math.round(data.overallScore * 100)}%*${trendText}` : ''}`,
      ),
    },
  });

  // Metrics grid
  if (data.talkRatio != null) {
    const talkNote = data.talkRatio < 50 ? ':white_check_mark:' : data.talkRatio < 60 ? ':warning:' : ':x:';
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: safeFieldText(`*Talk Ratio*\n${Math.round(data.talkRatio)}% ${talkNote} (target: 43%)`) },
        { type: 'mrkdwn', text: safeFieldText(`*Question Quality*\n${Math.round((data.questionQuality || 0) * 100)}%`) },
        { type: 'mrkdwn', text: safeFieldText(`*Objection Handling*\n${Math.round((data.objectionHandling || 0) * 100)}%`) },
        { type: 'mrkdwn', text: safeFieldText(`*Discovery Depth*\n${Math.round((data.discoveryDepth || 0) * 100)}%`) },
      ],
    });
  }

  blocks.push({ type: 'divider' });

  // Weekly Wins
  if (data.weeklyWins.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: safeMrkdwn(`:trophy: *Weekly Wins*\n${data.weeklyWins.map(w => `• ${w}`).join('\n')}`),
      },
    });
    blocks.push({ type: 'divider' });
  }

  // Data-Backed Insights
  if (data.dataBackedInsights.length > 0) {
    const insightText = data.dataBackedInsights.slice(0, 3).map(i =>
      `*${i.insight}*\n_Evidence:_ ${i.evidence}\n_Action:_ ${i.action}`,
    ).join('\n\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: safeMrkdwn(`:brain: *Coaching Insights*\n\n${insightText}`) },
    });
    blocks.push({ type: 'divider' });
  }

  // Pipeline Patterns
  if (data.pipelinePatterns.length > 0) {
    const severityIcon: Record<string, string> = { critical: ':rotating_light:', warning: ':warning:', info: ':information_source:' };
    const patternText = data.pipelinePatterns.map(p =>
      `${severityIcon[p.severity] || ':information_source:'} ${p.title}`,
    ).join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: safeMrkdwn(`:bar_chart: *Pipeline Patterns*\n${patternText}`) },
    });
  }

  // Competitive Trends
  if (data.competitiveTrends.length > 0) {
    const compText = data.competitiveTrends.map(c =>
      `• *${c.name}*: ${c.mentions} mentions${c.win_rate != null ? `, ${Math.round(c.win_rate * 100)}% win rate` : ''}`,
    ).join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: safeMrkdwn(`:crossed_swords: *Competitive Trends*\n${compText}`) },
    });
  }

  // Team Intelligence Tip
  if (data.teamIntelligenceTip) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: safeMrkdwn(`:bulb: *From Your Team*\n${data.teamIntelligenceTip}`) },
    });
  }

  // Forecast Accuracy
  if (data.forecastAccuracy != null) {
    blocks.push({
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: safeContextMrkdwn(`:dart: Forecast Accuracy: ${Math.round(data.forecastAccuracy * 100)}%`) },
      ],
    });
  }

  // Progression note
  if (data.progressionComparison?.status === 'has_history') {
    const vs = data.progressionComparison.vs_last_week;
    const parts: string[] = [];
    if (vs?.improving.length) parts.push(`:arrow_up: Improved: ${vs.improving.join(', ')}`);
    if (vs?.declining.length) parts.push(`:small_red_triangle_down: Needs work: ${vs.declining.join(', ')}`);
    if (parts.length > 0) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: safeContextMrkdwn(`Week ${data.progressionComparison.weeks_tracked} of tracking | ${parts.join(' | ')}`) }],
      });
    }
  } else if (data.progressionComparison?.status === 'first_week') {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: safeContextMrkdwn(':seedling: First coaching week — tracking starts now. Next week you\'ll see trends.') }],
    });
  }

  return {
    blocks,
    text: `Weekly Coaching Digest for ${data.repName} — ${data.weekOf}`,
  };
}

// =============================================================================
// WEEKLY AGENT SCORECARD (SLK-017)
// =============================================================================

export interface WeeklyAgentScorecardData {
  emailsDrafted: number;
  emailsApproved: number;
  meetingsPrepped: number;
  dealsAlerted: number;
  totalInteractions: number;
  estimatedHoursSaved: string;
  appUrl: string;
}

export const buildWeeklyAgentScorecard = (data: WeeklyAgentScorecardData): SlackMessage => {
  const blocks: SlackBlock[] = [];

  blocks.push(header('Your Week with 60'));

  blocks.push(sectionWithFields([
    { label: 'Emails Drafted', value: `${data.emailsDrafted} (${data.emailsApproved} approved)` },
    { label: 'Meetings Prepped', value: `${data.meetingsPrepped}` },
    { label: 'Deals Flagged', value: `${data.dealsAlerted}` },
    { label: 'Time Saved', value: `~${data.estimatedHoursSaved} hours` },
  ]));

  blocks.push(divider());

  blocks.push(context([`${data.totalInteractions} total interactions this week`]));

  blocks.push(actions([
    { text: 'View Full Report', actionId: 'weekly_scorecard_view_report', value: 'weekly_report', url: `${data.appUrl}/dashboard`, style: 'primary' },
  ]));

  return {
    blocks,
    text: `Your week with 60: ${data.emailsDrafted} emails drafted, ${data.meetingsPrepped} meetings prepped, ~${data.estimatedHoursSaved}h saved`,
  };
};

// =============================================================================
// COMPACT NOTIFICATION RENDERER (SLK-015)
// =============================================================================

export interface CompactNotificationData {
  type: string;
  entityName: string;
  action: string;
  appUrl: string;
  dealId?: string;
  contactId?: string;
  meetingId?: string;
}

export const buildCompactNotification = (data: CompactNotificationData): SlackMessage => {
  const linkParts: string[] = [];

  if (data.dealId) {
    linkParts.push(`<${data.appUrl}/deals/${data.dealId}|View Deal>`);
  }
  if (data.contactId) {
    linkParts.push(`<${data.appUrl}/contacts/${data.contactId}|View Contact>`);
  }
  if (data.meetingId) {
    linkParts.push(`<${data.appUrl}/meetings/${data.meetingId}|View Meeting>`);
  }

  const linkText = linkParts.length > 0 ? ` · ${linkParts.join(' · ')}` : '';
  const line = `*${data.entityName}* ${data.action}${linkText}`;

  return {
    blocks: [context([line])],
    text: `${data.entityName} ${data.action}`,
  };
};
