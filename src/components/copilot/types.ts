/**
 * Type definitions for AI Copilot, Contact Record, and Smart Search features
 */

// ============================================================================
// Copilot Types
// ============================================================================

import type { ToolCall } from '../copilot/toolTypes';
import type { EntityDisambiguationData } from './responses/EntityDisambiguationResponse';
import type { ProspectingClarificationData } from './responses/ProspectingClarificationResponse';
import type { ClarifyingQuestion } from '@/lib/utils/prospectingDetector';

export interface CampaignWorkflowData {
  original_prompt: string;
  questions: ClarifyingQuestion[];
  suggested_campaign_name: string;
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  recommendations?: Recommendation[];
  toolCall?: ToolCall;
  structuredResponse?: CopilotResponse; // New structured response format
  entityDisambiguation?: EntityDisambiguationData; // Interactive contact selection for disambiguation
  preflightQuestions?: ProspectingClarificationData; // Prospecting clarification before workflow
  campaignWorkflow?: CampaignWorkflowData; // Campaign workflow clarification
  isError?: boolean; // UX-001: Flag to indicate this message is an error response
}

export interface Recommendation {
  id: string;
  priority: number;
  title: string;
  description: string;
  actions: Action[];
  tags: Tag[];
  dealId?: string;
  contactId?: string;
  metadata?: Record<string, any>;
}

export interface Action {
  id: string;
  label: string;
  type: 'draft_email' | 'schedule_call' | 'view_brief' | 'view_deal' | 'view_contact' | 'custom';
  variant: 'primary' | 'secondary';
  callback?: () => void;
  href?: string;
}

export interface Tag {
  id: string;
  label: string;
  color: string;
}

export interface CopilotState {
  mode: 'empty' | 'active';
  messages: CopilotMessage[];
  isLoading: boolean;
  currentInput: string;
  conversationId?: string;
}

export interface TemporalContextPayload {
  isoString: string;
  localeString: string;
  date: string;
  time: string;
  timezone: string;
  offsetMinutes: number;
}

export interface CopilotContext {
  currentView?: 'dashboard' | 'contact' | 'pipeline' | 'deal';
  contactId?: string;
  dealIds?: string[];
  orgId?: string;
  userId: string;
  temporalContext?: TemporalContextPayload;
}

export interface CopilotContextPayload {
  message: string;
  conversationId?: string;
  context: CopilotContext;
}

export interface CopilotAPIRequest {
  message: string;
  conversationId?: string;
  context: CopilotContext;
}

export interface ToolExecutionDetail {
  toolName: string;
  args: any;
  result: any;
  latencyMs: number;
  success: boolean;
  error?: string;
  capability?: string;
  provider?: string;
}

export interface CopilotAPIResponse {
  response: {
    type: 'text' | 'recommendations' | 'action_required';
    content: string;
    recommendations?: Recommendation[];
    structuredResponse?: CopilotResponse; // New structured response format
  };
  conversationId: string;
  timestamp: string;
  tool_executions?: ToolExecutionDetail[];
}

export type CopilotResponsePayload = CopilotAPIResponse;

// ============================================================================
// Structured Response Types
// ============================================================================

export type CopilotResponseType =
  | 'activity'
  | 'pipeline'
  | 'meeting'
  | 'email'
  | 'calendar'
  | 'lead'
  | 'task'
  | 'contact'
  | 'roadmap'
  | 'sales_coach'
  | 'goal_tracking'
  | 'trend_analysis'
  | 'forecast'
  | 'team_comparison'
  | 'metric_focus'
  | 'insights'
  | 'stage_analysis'
  | 'activity_breakdown'
  | 'deal_health'
  | 'contact_relationship'
  | 'communication_history'
  | 'meeting_prep'
  | 'meeting_count'
  | 'meeting_briefing'
  | 'meeting_list'
  | 'time_breakdown'
  | 'data_quality'
  | 'pipeline_forecast'
  | 'activity_planning'
  | 'company_intelligence'
  | 'workflow_process'
  | 'search_discovery'
  | 'contact_selection'
  | 'activity_creation'
  | 'task_creation'
  | 'proposal_selection'
  | 'action_summary'
  | 'pipeline_focus_tasks'
  | 'deal_rescue_pack'
  | 'next_meeting_command_center'
  | 'post_meeting_followup_pack'
  | 'deal_map_builder'
  | 'daily_focus_plan'
  | 'followup_zero_inbox'
  | 'deal_slippage_guardrails'
  | 'daily_brief'
  | 'dynamic_table'
  | 'pipeline_outreach';

export interface CopilotResponse {
  type: CopilotResponseType;
  summary: string; // Brief intro text
  data: ResponseData;
  actions: QuickActionResponse[];
  metadata?: ResponseMetadata;
}

export interface QuickActionResponse {
  id: string;
  label: string;
  type: 'primary' | 'secondary' | 'tertiary';
  icon?: string;
  callback: string; // API endpoint or action name
  params?: Record<string, any>;
}

export interface ResponseMetadata {
  totalCount?: number;
  timeGenerated: string;
  dataSource: string[];
  confidence?: number; // 0-100
  warning?: string;
  timezone?: string;
  dateRange?: {
    start?: string;
    end?: string;
  };
  requestedDurationMinutes?: number;
  workingHours?: {
    start: string;
    end: string;
  };
  slotsEvaluated?: number;
  totalFreeMinutes?: number;
  totalBusyMinutes?: number;
}

export type ResponseData = 
  | PipelineResponseData
  | EmailResponseData
  | CalendarResponseData
  | ActivityResponseData
  | LeadResponseData
  | TaskResponseData
  | ContactResponseData
  | RoadmapResponseData
  | SalesCoachResponseData
  | GoalTrackingResponseData
  | TrendAnalysisResponseData
  | ForecastResponseData
  | TeamComparisonResponseData
  | MetricFocusResponseData
  | InsightsResponseData
  | StageAnalysisResponseData
  | ActivityBreakdownResponseData
  | DealHealthResponseData
  | ContactRelationshipResponseData
  | CommunicationHistoryResponseData
  | MeetingPrepResponseData
  | DataQualityResponseData
  | PipelineForecastResponseData
  | ActivityPlanningResponseData
  | CompanyIntelligenceResponseData
  | WorkflowProcessResponseData
  | SearchDiscoveryResponseData
  | ContactSelectionResponseData
  | ActivityCreationResponseData
  | TaskCreationResponseData
  | ProposalSelectionResponseData
  | ActionSummaryResponseData
  | MeetingCountResponseData
  | MeetingBriefingResponseData
  | MeetingListResponseData
  | TimeBreakdownResponseData
  | PipelineFocusTasksResponseData
  | DealRescuePackResponseData
  | NextMeetingCommandCenterResponseData
  | PostMeetingFollowUpPackResponseData
  | DealMapBuilderResponseData
  | DailyFocusPlanResponseData
  | FollowupZeroInboxResponseData
  | DealSlippageGuardrailsResponseData
  | DailyBriefResponseData;

// ============================================================================
// Demo-grade sequence panels (Top 3 workflows)
// ============================================================================

export interface PipelineFocusTasksResponse extends CopilotResponse {
  type: 'pipeline_focus_tasks';
  data: PipelineFocusTasksResponseData;
}

export interface PipelineFocusTasksResponseData {
  sequenceKey: string;
  isSimulation: boolean;
  executionId?: string;
  deal: any | null;
  taskPreview: any | null;
}

export interface DealRescuePackResponse extends CopilotResponse {
  type: 'deal_rescue_pack';
  data: DealRescuePackResponseData;
}

export interface DealRescuePackResponseData {
  sequenceKey: string;
  isSimulation: boolean;
  executionId?: string;
  deal: any | null;
  plan: any | null;
  taskPreview: any | null;
}

export interface NextMeetingCommandCenterResponse extends CopilotResponse {
  type: 'next_meeting_command_center';
  data: NextMeetingCommandCenterResponseData;
}

export interface NextMeetingCommandCenterResponseData {
  sequenceKey: string;
  isSimulation: boolean;
  executionId?: string;
  meeting: any | null;
  brief: any | null;
  prepTaskPreview: any | null;
}

export interface PostMeetingFollowUpPackResponse extends CopilotResponse {
  type: 'post_meeting_followup_pack';
  data: PostMeetingFollowUpPackResponseData;
}

export interface PostMeetingFollowUpPackResponseData {
  sequenceKey: string;
  isSimulation: boolean;
  executionId?: string;
  meeting: any | null;
  contact: any | null;
  digest: any | null;
  pack: any | null;
  emailPreview: any | null;
  slackPreview: any | null;
  taskPreview: any | null;
}

export interface DealMapBuilderResponse extends CopilotResponse {
  type: 'deal_map_builder';
  data: DealMapBuilderResponseData;
}

export interface DealMapBuilderResponseData {
  sequenceKey: string;
  isSimulation: boolean;
  executionId?: string;
  deal: any | null;
  openTasks: any | null;
  plan: any | null;
  taskPreview: any | null;
}

export interface DailyFocusPlanResponse extends CopilotResponse {
  type: 'daily_focus_plan';
  data: DailyFocusPlanResponseData;
}

export interface DailyFocusPlanResponseData {
  sequenceKey: string;
  isSimulation: boolean;
  executionId?: string;
  pipelineDeals: any | null;
  contactsNeedingAttention: any | null;
  openTasks: any | null;
  plan: any | null;
  taskPreview: any | null;
}

export interface FollowupZeroInboxResponse extends CopilotResponse {
  type: 'followup_zero_inbox';
  data: FollowupZeroInboxResponseData;
}

export interface FollowupZeroInboxResponseData {
  sequenceKey: string;
  isSimulation: boolean;
  executionId?: string;
  emailThreads: any | null;
  triage: any | null;
  replyDrafts: any | null;
  emailPreview: any | null;
  taskPreview: any | null;
}

export interface DealSlippageGuardrailsResponse extends CopilotResponse {
  type: 'deal_slippage_guardrails';
  data: DealSlippageGuardrailsResponseData;
}

export interface DealSlippageGuardrailsResponseData {
  sequenceKey: string;
  isSimulation: boolean;
  executionId?: string;
  atRiskDeals: any | null;
  diagnosis: any | null;
  taskPreview: any | null;
  slackPreview: any | null;
}

// Daily Brief Response (Catch Me Up workflow)
export interface DailyBriefResponse extends CopilotResponse {
  type: 'daily_brief';
  data: DailyBriefResponseData;
}

export interface DailyBriefResponseData {
  sequenceKey: string;
  isSimulation: boolean;
  executionId?: string;
  greeting: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening';
  schedule: DailyBriefMeeting[];
  priorityDeals: DailyBriefDeal[];
  contactsNeedingAttention: DailyBriefContact[];
  tasks: DailyBriefTask[];
  tomorrowPreview?: DailyBriefMeeting[];
  summary: string;
}

export interface DailyBriefMeeting {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  attendees?: string[];
  linkedDealId?: string;
  linkedDealName?: string;
  meetingUrl?: string;
}

export interface DailyBriefDeal {
  id: string;
  name: string;
  value?: number;
  stage?: string;
  daysStale?: number;
  closeDate?: string;
  healthStatus?: 'healthy' | 'at_risk' | 'stale';
  company?: string;
  contactName?: string;
  contactEmail?: string;
}

export interface DailyBriefContact {
  id: string;
  name: string;
  email?: string;
  company?: string;
  lastContactDate?: string;
  daysSinceContact?: number;
  healthStatus?: 'healthy' | 'at_risk' | 'critical' | 'ghost' | 'unknown';
  riskLevel?: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  riskFactors?: string[];
  reason?: string;
}

export interface DailyBriefTask {
  id: string;
  title: string;
  dueDate?: string;
  priority?: 'high' | 'medium' | 'low';
  status?: string;
  linkedDealId?: string;
  linkedContactId?: string;
}

// Pipeline Outreach Response (batch email drafts from pipeline health review)
export interface PipelineOutreachResponse extends CopilotResponse {
  type: 'pipeline_outreach';
  data: PipelineOutreachResponseData;
}

export interface PipelineOutreachResponseData {
  pipeline_summary: PipelineOutreachSummary;
  email_drafts: PipelineEmailDraft[];
}

export interface PipelineOutreachSummary {
  stale_count: number;
  total_deals: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  health_score?: number;
  zero_interaction_count?: number;
}

export interface PipelineEmailMeetingContext {
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  meetingSummary?: string | null;
  pendingActionItems: Array<{ id: string; title: string }>;
}

export interface PipelineEmailDraft {
  contactId?: string;
  contactName: string;
  company?: string;
  to?: string;
  subject: string;
  body: string;
  urgency: 'high' | 'medium' | 'low';
  strategyNotes?: string;
  lastInteraction?: string;
  daysSinceContact?: number;
  dealId?: string;
  meetingContext?: PipelineEmailMeetingContext;
}

// Pipeline Response
export interface PipelineResponse extends CopilotResponse {
  type: 'pipeline';
  data: PipelineResponseData;
}

export interface PipelineResponseData {
  criticalDeals: Deal[];
  highPriorityDeals: Deal[];
  healthyDeals?: Deal[];
  dataIssues?: PipelineDataIssue[];
  metrics: PipelineMetrics;
  showStatsFirst?: boolean; // If true, show stats with filters before results
}

export interface Deal {
  id: string;
  name: string;
  value: number;
  stage: string;
  probability: number;
  closeDate?: string;
  daysUntilClose?: number;
  healthScore: number;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  reason: string; // Why it needs attention
}

export interface PipelineDataIssue {
  type: 'missing_close_date' | 'low_probability' | 'stale_deal' | 'no_activity';
  dealId: string;
  dealName: string;
  description: string;
}

export interface PipelineMetrics {
  totalValue: number;
  totalDeals: number;
  avgHealthScore: number;
  dealsAtRisk: number;
  closingThisWeek: number;
}

// Email Response
export interface EmailResponse extends CopilotResponse {
  type: 'email';
  data: EmailResponseData;
}

export interface EmailResponseData {
  email: EmailDraft;
  context: EmailContext;
  suggestions: EmailSuggestion[];
}

export interface EmailDraft {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  tone: 'professional' | 'friendly' | 'concise';
  sendTime?: string; // Suggested send time
}

export interface EmailContext {
  contactName: string;
  lastInteraction: string;
  lastInteractionDate: string;
  dealValue?: number;
  keyPoints: string[]; // Points to mention
  warnings?: string[]; // Things to avoid
}

export interface EmailSuggestion {
  label: string;
  action: 'change_tone' | 'add_point' | 'shorten' | 'add_calendar_link';
  description: string;
}

// Calendar/Meeting Response
export interface CalendarResponse extends CopilotResponse {
  type: 'calendar' | 'meeting';
  data: CalendarResponseData;
}

export interface CalendarResponseData {
  meetings: Meeting[];
  availability?: AvailabilitySlot[];
  prepBrief?: MeetingPrep;
}

export interface Meeting {
  id: string;
  title: string;
  attendees: Attendee[];
  startTime: string;
  endTime: string;
  status: 'upcoming' | 'today' | 'past';
  location?: string;
  hasPrepBrief: boolean;
  hasRecording?: boolean;
  dealId?: string;
  contactId?: string;
}

export interface Attendee {
  name: string;
  email: string;
}

export interface AvailabilitySlot {
  startTime: string;
  endTime: string;
  duration: number; // minutes
}

export interface MeetingPrep {
  meetingId: string;
  contactName: string;
  lastInteraction: string;
  talkingPoints: string[];
  discoveryQuestions: string[];
  dealContext?: DealContext;
  warnings?: string[];
}

export interface DealContext {
  dealId: string;
  dealName: string;
  value: number;
  stage: string;
  probability: number;
}

// Activity Response
export interface ActivityResponse extends CopilotResponse {
  type: 'activity';
  data: ActivityResponseData;
}

export interface ActivityResponseData {
  created?: ActivityItem[];
  upcoming?: ActivityItem[];
  overdue?: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  type: 'call' | 'email' | 'task' | 'meeting';
  title: string;
  description?: string;
  dueDate?: string;
  contactId?: string;
  contactName?: string;
  dealId?: string;
  status: 'pending' | 'completed' | 'overdue';
  priority: 'high' | 'medium' | 'low';
}

// Lead Response
export interface LeadResponse extends CopilotResponse {
  type: 'lead';
  data: LeadResponseData;
}

export interface LeadResponseData {
  newLeads: Lead[];
  hotLeads: Lead[];
  needsQualification: Lead[];
  metrics: LeadMetrics;
}

export interface Lead {
  id: string;
  name: string;
  company: string;
  email: string;
  phone?: string;
  score: number; // 0-100
  source: string;
  createdAt: string;
  lastActivity?: string;
  status: 'new' | 'contacted' | 'qualified' | 'unqualified';
  tags: string[];
}

export interface LeadMetrics {
  totalNew: number;
  avgScore: number;
  conversionRate: number;
  needingAction: number;
}

// Task Response
export interface TaskResponse extends CopilotResponse {
  type: 'task';
  data: TaskResponseData;
}

export interface TaskResponseData {
  urgentTasks: TaskItem[];
  highPriorityTasks: TaskItem[];
  dueToday: TaskItem[];
  overdue: TaskItem[];
  upcoming: TaskItem[];
  completed?: TaskItem[];
  metrics: TaskMetrics;
  showStatsFirst?: boolean; // If true, show stats with filters before results
}

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  daysUntilDue?: number;
  isOverdue: boolean;
  taskType: 'call' | 'email' | 'meeting' | 'follow_up' | 'demo' | 'proposal' | 'general';
  contactId?: string;
  contactName?: string;
  dealId?: string;
  dealName?: string;
  companyId?: string;
  companyName?: string;
  meetingId?: string;
  meetingName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskMetrics {
  totalTasks: number;
  urgentCount: number;
  highPriorityCount: number;
  dueTodayCount: number;
  overdueCount: number;
  completedToday: number;
  completionRate: number; // 0-100
}

// Contact Response
export interface ContactResponse extends CopilotResponse {
  type: 'contact';
  data: ContactResponseData;
}

export interface ContactResponseData {
  contact: ContactInfo;
  emails: EmailSummary[];
  deals: ContactDeal[];
  activities: ContactActivity[];
  meetings: ContactMeeting[];
  tasks: ContactTask[];
  metrics: ContactMetrics;
}

export interface ContactInfo {
  id: string;
  name: string;
  email: string;
  phone?: string;
  title?: string;
  company?: string;
  companyId?: string;
}

export interface EmailSummary {
  id: string;
  subject: string;
  summary: string;
  date: string;
  direction: 'sent' | 'received';
  snippet?: string;
}

export interface ContactDeal {
  id: string;
  name: string;
  value: number;
  stage: string;
  probability: number;
  closeDate?: string;
  healthScore: number;
}

export interface ContactActivity {
  id: string;
  type: string;
  notes?: string;
  date: string;
}

export interface ContactMeeting {
  id: string;
  title: string;
  date: string;
  summary?: string;
  hasTranscript: boolean;
}

export interface ContactTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string;
}

export interface ContactMetrics {
  totalDeals: number;
  totalDealValue: number;
  activeDeals: number;
  recentEmails: number;
  upcomingMeetings: number;
  pendingTasks: number;
}

// ============================================================================
// Contact Record Types
// ============================================================================

export interface ContactRecordData {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone?: string;
  title?: string;
  company?: string;
  companyId?: string;
  location?: string;
  avatar?: string;
  tags: string[];
  status: 'active' | 'inactive';
  dealHealth: DealHealth;
  stats: ContactStats;
  lastMeeting?: MeetingSummary;
  recentActivity: Activity[];
  aiInsights: AIInsight[];
}

export interface DealHealth {
  score: number; // 0-100
  metrics: {
    engagement: { value: number; label: string }; // 0-100
    momentum: { value: number; label: string };
    responseTime: { value: number; label: string };
  };
}

export interface ContactStats {
  totalMeetings: number;
  emailsSent: number;
  avgResponseTime: string; // e.g., "2.3 hours"
  dealValue: number;
  closeProbability: number; // 0-100
}

export interface MeetingSummary {
  id: string;
  date: Date;
  duration: number; // minutes
  discussionPoints: string[];
  actionItems: ActionItem[];
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentScore: number; // 1-5
  transcriptUrl?: string;
  recordingUrl?: string;
}

export interface ActionItem {
  id: string;
  text: string;
  completed: boolean;
  assignee?: string;
  assigneeId?: string;
  dueDate?: string | Date;
  meetingId?: string;
}

export interface Activity {
  id: string;
  type: 'email' | 'meeting' | 'reply' | 'linkedin' | 'call' | 'task' | 'note';
  title: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface AIInsight {
  id: string;
  type: 'high_engagement' | 'at_risk' | 'opportunity' | 'timing' | 'custom';
  content: string;
  priority: 'high' | 'medium' | 'low';
  suggestedActions?: string[];
  metadata: Record<string, any>;
  expiresAt?: Date;
}

// ============================================================================
// Smart Search Types
// ============================================================================

export interface SearchResult {
  id: string;
  type: 'contact' | 'deal' | 'meeting' | 'action' | 'copilot_query';
  title: string;
  subtitle?: string;
  avatar?: string;
  icon?: string;
  action: () => void;
  shortcut?: string;
  metadata?: Record<string, any>;
}

export interface QuickAction {
  id: string;
  label: string;
  icon: string; // Lucide icon name
  shortcut: string;
  action: () => void;
}

export interface RecentContact {
  id: string;
  name: string;
  company: string;
  initials: string;
  color: string;
  avatar?: string;
}

export interface CopilotSuggestion {
  id: string;
  query: string;
  action: () => void;
}

// ============================================================================
// Roadmap Response
// ============================================================================

export interface RoadmapResponse extends CopilotResponse {
  type: 'roadmap';
  data: RoadmapResponseData;
}

export interface RoadmapResponseData {
  roadmapItem: RoadmapItem;
  success: boolean;
  message?: string;
}

export interface RoadmapItem {
  id: string;
  title: string;
  description?: string;
  type: 'feature' | 'bug' | 'improvement' | 'other';
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'submitted' | 'under_review' | 'in_progress' | 'testing' | 'completed' | 'rejected';
  createdAt: string;
  updatedAt?: string;
}

// ============================================================================
// Sales Coach Response
// ============================================================================

export interface SalesCoachResponse extends CopilotResponse {
  type: 'sales_coach';
  data: SalesCoachResponseData;
}

export interface SalesCoachResponseData {
  comparison: {
    sales: MetricComparison;
    activities: MetricComparison;
    meetings: MetricComparison;
    winRate: MetricComparison;
    dealSize: MetricComparison;
    overall: 'improving' | 'declining' | 'stable';
  };
  metrics: {
    currentMonth: {
      totalRevenue: number;
      totalActivities: number;
      totalMeetings: number;
      dealsClosed: number;
      winRate: number;
      averageDealSize: number;
    };
    previousMonth: {
      totalRevenue: number;
      totalActivities: number;
      totalMeetings: number;
      dealsClosed: number;
      winRate: number;
      averageDealSize: number;
    };
  };
  insights: Insight[];
  recommendations: Recommendation[];
  period: {
    current: {
      month: string;
      year: number;
      day: number;
    };
    previous: {
      month: string;
      year: number;
      day: number;
    };
  };
}

export interface Insight {
  id: string;
  type: 'positive' | 'warning' | 'opportunity';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
}

// ============================================================================
// Goal Tracking Response
// ============================================================================

export interface GoalTrackingResponse extends CopilotResponse {
  type: 'goal_tracking';
  data: GoalTrackingResponseData;
}

export interface GoalTrackingResponseData {
  goals: Goal[];
  overallProgress: number; // 0-100
  period: {
    type: 'month' | 'quarter' | 'year';
    label: string;
    startDate: string;
    endDate: string;
  };
  metrics: GoalMetrics;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  current: number;
  progress: number; // 0-100
  unit: 'currency' | 'count' | 'percentage';
  deadline: string;
  status: 'on_track' | 'at_risk' | 'behind' | 'exceeded';
  remaining: number;
  projectedCompletion?: string;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface GoalMetrics {
  totalGoals: number;
  goalsOnTrack: number;
  goalsAtRisk: number;
  goalsBehind: number;
  averageProgress: number;
}

// ============================================================================
// Trend Analysis Response
// ============================================================================

export interface TrendAnalysisResponse extends CopilotResponse {
  type: 'trend_analysis';
  data: TrendAnalysisResponseData;
}

export interface TrendAnalysisResponseData {
  metric: string;
  period: {
    startDate: string;
    endDate: string;
    granularity: 'day' | 'week' | 'month' | 'quarter';
  };
  dataPoints: TrendDataPoint[];
  summary: TrendSummary;
  comparisons?: TrendComparison[];
}

export interface TrendDataPoint {
  date: string;
  value: number;
  label: string;
}

export interface TrendSummary {
  overallTrend: 'increasing' | 'decreasing' | 'stable';
  growthRate: number; // percentage
  averageValue: number;
  peakValue: number;
  peakDate: string;
  lowestValue: number;
  lowestDate: string;
  volatility: 'high' | 'medium' | 'low';
}

export interface TrendComparison {
  period: string;
  average: number;
  change: number; // percentage
}

// ============================================================================
// Forecast Response
// ============================================================================

export interface ForecastResponse extends CopilotResponse {
  type: 'forecast';
  data: ForecastResponseData;
}

export interface ForecastResponseData {
  period: {
    type: 'month' | 'quarter' | 'year';
    label: string;
    startDate: string;
    endDate: string;
  };
  forecast: ForecastMetrics;
  confidence: number; // 0-100
  assumptions: string[];
  scenarios: ForecastScenario[];
}

export interface ForecastMetrics {
  projectedRevenue: number;
  pipelineCoverage: number; // percentage
  weightedPipeline: number;
  bestCase: number;
  worstCase: number;
  mostLikely: number;
  dealsToClose: number;
}

export interface ForecastScenario {
  name: string;
  probability: number; // 0-100
  revenue: number;
  description: string;
}

// ============================================================================
// Team Comparison Response
// ============================================================================

export interface TeamComparisonResponse extends CopilotResponse {
  type: 'team_comparison';
  data: TeamComparisonResponseData;
}

export interface TeamComparisonResponseData {
  userMetrics: UserMetrics;
  teamAverage: TeamMetrics;
  ranking: Ranking;
  comparisons: MetricComparison[];
  period: {
    startDate: string;
    endDate: string;
  };
}

export interface UserMetrics {
  userId: string;
  userName: string;
  revenue: number;
  dealsClosed: number;
  activities: number;
  meetings: number;
  winRate: number;
  averageDealSize: number;
}

export interface TeamMetrics {
  averageRevenue: number;
  averageDealsClosed: number;
  averageActivities: number;
  averageMeetings: number;
  averageWinRate: number;
  averageDealSize: number;
}

export interface Ranking {
  position: number;
  totalMembers: number;
  percentile: number; // 0-100
  category: 'top_performer' | 'above_average' | 'average' | 'below_average';
}

export interface MetricComparison {
  metric: string;
  current: number;
  previous: number;
  change: number; // percentage
  changeType: 'increase' | 'decrease' | 'neutral';
  trend: 'up' | 'down' | 'stable';
}

// ============================================================================
// Metric Focus Response
// ============================================================================

export interface MetricFocusResponse extends CopilotResponse {
  type: 'metric_focus';
  data: MetricFocusResponseData;
}

export interface MetricFocusResponseData {
  metric: {
    name: string;
    value: number;
    unit: string;
    format: 'currency' | 'count' | 'percentage' | 'duration';
  };
  current: MetricValue;
  previous?: MetricValue;
  trend: TrendDataPoint[];
  breakdown?: MetricBreakdown[];
  insights: string[];
}

export interface MetricValue {
  value: number;
  period: string;
  change?: number; // percentage
  changeType?: 'increase' | 'decrease' | 'neutral';
}

export interface MetricBreakdown {
  category: string;
  value: number;
  percentage: number;
  trend?: 'up' | 'down' | 'stable';
}

// ============================================================================
// Insights Response
// ============================================================================

export interface InsightsResponse extends CopilotResponse {
  type: 'insights';
  data: InsightsResponseData;
}

export interface InsightsResponseData {
  priorityInsights: PriorityInsight[];
  quickWins: QuickWin[];
  focusAreas: FocusArea[];
  risks: Risk[];
  opportunities: Opportunity[];
}

export interface PriorityInsight {
  id: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  impact: 'high' | 'medium' | 'low';
  category: 'revenue' | 'activity' | 'pipeline' | 'efficiency' | 'quality';
  actionItems: string[];
  estimatedImpact?: string;
}

export interface QuickWin {
  id: string;
  title: string;
  description: string;
  effort: 'low' | 'medium' | 'high';
  impact: 'high' | 'medium' | 'low';
  action: string;
  estimatedResult?: string;
}

export interface FocusArea {
  id: string;
  title: string;
  description: string;
  metrics: string[];
  recommendations: string[];
}

export interface Risk {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  mitigation: string[];
}

export interface Opportunity {
  id: string;
  title: string;
  description: string;
  potentialValue: number;
  probability: number; // 0-100
  actionItems: string[];
}

// ============================================================================
// Stage Analysis Response
// ============================================================================

export interface StageAnalysisResponse extends CopilotResponse {
  type: 'stage_analysis';
  data: StageAnalysisResponseData;
}

export interface StageAnalysisResponseData {
  stages: StageMetrics[];
  conversionRates: ConversionRate[];
  timeInStage: TimeInStage[];
  distribution: StageDistribution;
  bottlenecks: Bottleneck[];
}

export interface StageMetrics {
  stage: string;
  dealCount: number;
  totalValue: number;
  averageValue: number;
  averageAge: number; // days
  healthScore: number; // 0-100
}

export interface ConversionRate {
  fromStage: string;
  toStage: string;
  rate: number; // percentage
  averageTime: number; // days
  trend: 'improving' | 'declining' | 'stable';
}

export interface TimeInStage {
  stage: string;
  averageDays: number;
  medianDays: number;
  longestDeal: number;
  shortestDeal: number;
}

export interface StageDistribution {
  totalDeals: number;
  totalValue: number;
  byStage: {
    stage: string;
    count: number;
    percentage: number;
    value: number;
  }[];
}

export interface Bottleneck {
  stage: string;
  issue: string;
  impact: 'high' | 'medium' | 'low';
  recommendation: string;
}

// ============================================================================
// Activity Breakdown Response
// ============================================================================

export interface ActivityBreakdownResponse extends CopilotResponse {
  type: 'activity_breakdown';
  data: ActivityBreakdownResponseData;
}

export interface ActivityBreakdownResponseData {
  period: {
    startDate: string;
    endDate: string;
  };
  breakdown: ActivityTypeBreakdown[];
  trends: ActivityTrend[];
  effectiveness: ActivityEffectiveness[];
  recommendations: string[];
}

export interface ActivityTypeBreakdown {
  type: 'call' | 'email' | 'meeting' | 'outbound' | 'proposal' | 'other';
  count: number;
  percentage: number;
  trend: 'up' | 'down' | 'stable';
  averagePerDay: number;
}

export interface ActivityTrend {
  type: string;
  dataPoints: TrendDataPoint[];
  overallTrend: 'increasing' | 'decreasing' | 'stable';
}

export interface ActivityEffectiveness {
  type: string;
  count: number;
  conversionRate: number; // percentage
  dealsGenerated: number;
  revenueGenerated: number;
  roi: number; // return on investment
}

// ============================================================================
// Deal Health Response
// ============================================================================

export interface DealHealthResponse extends CopilotResponse {
  type: 'deal_health';
  data: DealHealthResponseData;
}

export interface DealHealthResponseData {
  atRiskDeals: AtRiskDeal[];
  staleDeals: StaleDeal[];
  highValueDeals: HighValueDeal[];
  likelyToClose: LikelyToCloseDeal[];
  metrics: DealHealthMetrics;
}

export interface AtRiskDeal {
  id: string;
  name: string;
  value: number;
  stage: string;
  healthScore: number; // 0-100
  riskFactors: string[];
  lastActivity?: string;
  daysSinceActivity: number;
  owner: string;
  recommendation: string;
}

export interface StaleDeal {
  id: string;
  name: string;
  value: number;
  stage: string;
  daysInStage: number;
  lastActivity?: string;
  owner: string;
  recommendation: string;
}

export interface HighValueDeal {
  id: string;
  name: string;
  value: number;
  stage: string;
  healthScore: number;
  closeDate?: string;
  owner: string;
}

export interface LikelyToCloseDeal {
  id: string;
  name: string;
  value: number;
  stage: string;
  probability: number; // 0-100
  closeDate?: string;
  owner: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface DealHealthMetrics {
  totalAtRisk: number;
  totalStale: number;
  totalHighValue: number;
  totalLikelyToClose: number;
  averageHealthScore: number;
  dealsNeedingAttention: number;
}

// ============================================================================
// Contact Relationship Response
// ============================================================================

export interface ContactRelationshipResponse extends CopilotResponse {
  type: 'contact_relationship';
  data: ContactRelationshipResponseData;
}

export interface ContactRelationshipResponseData {
  contacts: RelationshipContact[];
  companyContacts?: CompanyContactGroup[];
  topContacts: RelationshipContact[];
  inactiveContacts: RelationshipContact[];
  metrics: RelationshipMetrics;
}

export interface RelationshipContact {
  id: string;
  name: string;
  email: string;
  company?: string;
  companyId?: string;
  title?: string;
  totalDealValue: number;
  activeDeals: number;
  lastContact?: string;
  daysSinceContact: number;
  relationshipStrength: 'strong' | 'moderate' | 'weak' | 'none';
  recentActivities: number;
  upcomingMeetings: number;
}

export interface CompanyContactGroup {
  companyId: string;
  companyName: string;
  contacts: RelationshipContact[];
  totalDealValue: number;
  activeDeals: number;
}

export interface RelationshipMetrics {
  totalContacts: number;
  contactsWithDeals: number;
  totalDealValue: number;
  averageDealValue: number;
  contactsNeedingFollowUp: number;
}

// ============================================================================
// Communication History Response
// ============================================================================

export interface CommunicationHistoryResponse extends CopilotResponse {
  type: 'communication_history';
  data: CommunicationHistoryResponseData;
}

export interface CommunicationHistoryResponseData {
  contactId?: string;
  contactName?: string;
  dealId?: string;
  dealName?: string;
  communications: Communication[];
  timeline: TimelineEvent[];
  overdueFollowUps: OverdueFollowUp[];
  nextActions: NextAction[];
  summary: CommunicationSummary;
}

export interface Communication {
  id: string;
  type: 'email' | 'call' | 'meeting' | 'task' | 'note';
  direction: 'sent' | 'received' | 'both';
  subject?: string;
  summary?: string;
  date: string;
  participants?: string[];
  relatedDealId?: string;
  relatedDealName?: string;
}

export interface TimelineEvent {
  id: string;
  date: string;
  type: string;
  title: string;
  description?: string;
  relatedTo?: string;
}

export interface OverdueFollowUp {
  id: string;
  type: 'email' | 'call' | 'meeting' | 'task';
  title: string;
  dueDate: string;
  daysOverdue: number;
  contactId?: string;
  contactName?: string;
  dealId?: string;
  dealName?: string;
}

export interface NextAction {
  id: string;
  type: 'email' | 'call' | 'meeting' | 'task';
  title: string;
  dueDate?: string;
  priority: 'high' | 'medium' | 'low';
  contactId?: string;
  contactName?: string;
  dealId?: string;
  dealName?: string;
}

export interface CommunicationSummary {
  totalCommunications: number;
  emailsSent: number;
  callsMade: number;
  meetingsHeld: number;
  lastContact?: string;
  averageResponseTime?: string;
  communicationFrequency: 'high' | 'medium' | 'low';
}

// ============================================================================
// Meeting Prep Response
// ============================================================================

export interface MeetingPrepResponse extends CopilotResponse {
  type: 'meeting_prep';
  data: MeetingPrepResponseData;
}

export interface MeetingPrepResponseData {
  meeting: MeetingInfo;
  contact: ContactInfo;
  deal?: DealInfo;
  lastInteractions: Interaction[];
  talkingPoints: string[];
  discoveryQuestions: string[];
  actionItems: MeetingActionItem[];
  risks: string[];
  opportunities: string[];
  context: MeetingContext;
}

export interface MeetingInfo {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  attendees: Attendee[];
  location?: string;
  description?: string;
}

export interface Interaction {
  id: string;
  type: 'email' | 'call' | 'meeting' | 'note';
  date: string;
  summary: string;
  keyPoints?: string[];
}

export interface MeetingActionItem {
  id: string;
  title: string;
  status: 'pending' | 'completed';
  assignedTo?: string;
  dueDate?: string;
  fromMeeting?: string;
}

export interface MeetingContext {
  relationshipDuration: string;
  dealStage?: string;
  dealValue?: number;
  previousMeetings: number;
  lastMeetingDate?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface ContactInfo {
  id: string;
  name: string;
  email: string;
  company?: string;
  title?: string;
  phone?: string;
}

export interface DealInfo {
  id: string;
  name: string;
  value: number;
  stage: string;
  probability: number;
  closeDate?: string;
  healthScore: number;
}

// ============================================================================
// Meeting Query Response Types (Phase 5 - Meeting Query Enhancement)
// ============================================================================

/**
 * Response for "How many meetings this week?" query
 */
export interface MeetingCountResponseData {
  count: number;
  period: 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'this_month';
  periodLabel: string; // Human-readable: "this week", "today", etc.
  breakdown?: {
    internal: number;
    external: number;
    oneOnOne: number;
    group: number;
  };
  comparison?: {
    previousPeriod: number;
    percentageChange: number;
    trend: 'up' | 'down' | 'stable';
  };
}

/**
 * Response for "What's my next meeting + context?" query (HERO FEATURE)
 */
export interface MeetingBriefingResponseData {
  meeting: UnifiedMeetingInfo;
  context: {
    company: MeetingCompanyContext | null;
    deal: MeetingDealContext | null;
    lastActivity: MeetingLastActivity | null;
    openTasks: MeetingTask[];
    previousMeetings: PreviousMeetingInfo[];
  };
  actionItems: {
    completed: MeetingActionItemEnhanced[];
    outstanding: MeetingActionItemEnhanced[];
  };
  suggestions: string[];
}

export interface UnifiedMeetingInfo {
  id: string;
  source: 'google_calendar' | 'savvycal' | 'fathom' | 'teams';
  title: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  attendees: MeetingAttendee[];
  location?: string;
  meetingUrl?: string;
  meetingType?: 'sales' | 'client' | 'internal' | 'unknown';
  status: 'confirmed' | 'tentative' | 'cancelled';
}

export interface MeetingAttendee {
  email: string;
  name?: string;
  isExternal: boolean;
  isOrganizer: boolean;
  responseStatus?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  crmContactId?: string;
}

export interface MeetingCompanyContext {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  size?: string;
  relationshipDuration?: string;
}

export interface MeetingDealContext {
  id: string;
  name: string;
  stage: string;
  value: number;
  probability: number;
  closeDate?: string;
  healthScore?: number;
  daysInStage?: number;
}

export interface MeetingLastActivity {
  type: 'email' | 'call' | 'meeting' | 'note' | 'task';
  date: string;
  summary: string;
}

export interface MeetingTask {
  id: string;
  title: string;
  dueDate?: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface PreviousMeetingInfo {
  id: string;
  title: string;
  date: string;
  summary?: string;
  keyTopics?: string[];
}

export interface MeetingActionItemEnhanced {
  id: string;
  description: string;
  owner: string;
  dueDate?: string;
  isCompleted: boolean;
  meetingId: string;
  meetingTitle?: string;
}

/**
 * Response for "What meetings do I have today/tomorrow?" query
 */
export interface MeetingListResponseData {
  meetings: UnifiedMeetingInfo[];
  period: 'today' | 'tomorrow';
  periodLabel: string;
  totalCount: number;
  totalDurationMinutes: number;
  breakdown?: {
    internal: number;
    external: number;
    withDeals: number;
  };
}

/**
 * Response for "Time breakdown" query (meetings vs other work)
 */
export interface TimeBreakdownResponseData {
  period: 'this_week' | 'last_week' | 'this_month' | 'last_month';
  periodLabel: string;
  totalHours: number;
  meetingHours: number;
  nonMeetingHours: number;
  breakdown: {
    internal: { hours: number; count: number };
    external: { hours: number; count: number };
    oneOnOne: { hours: number; count: number };
    group: { hours: number; count: number };
  };
  dailyDistribution: TimeBreakdownDay[];
  insights: string[];
  comparison?: {
    previousPeriod: number;
    percentageChange: number;
    trend: 'up' | 'down' | 'stable';
  };
}

export interface TimeBreakdownDay {
  date: string;
  dayLabel: string; // "Monday", "Tuesday", etc.
  meetingHours: number;
  meetingCount: number;
  busiest: boolean;
}

// ============================================================================
// Data Quality Response
// ============================================================================

export interface DataQualityResponse extends CopilotResponse {
  type: 'data_quality';
  data: DataQualityResponseData;
}

export interface DataQualityResponseData {
  issues: QualityDataIssue[];
  duplicates: DuplicateRecord[];
  incompleteRecords: IncompleteRecord[];
  metrics: DataQualityMetrics;
  recommendations: string[];
}

export interface QualityDataIssue {
  id: string;
  type: 'missing_close_date' | 'missing_email' | 'missing_phone' | 'missing_value' | 'stale_data' | 'invalid_data';
  entityType: 'deal' | 'contact' | 'company' | 'activity';
  entityId: string;
  entityName: string;
  issue: string;
  severity: 'high' | 'medium' | 'low';
  fixable: boolean;
}

export interface DuplicateRecord {
  id: string;
  type: 'contact' | 'company' | 'deal';
  records: DuplicateRecordItem[];
  confidence: number; // 0-100
  recommendation: 'merge' | 'review' | 'ignore';
}

export interface DuplicateRecordItem {
  id: string;
  name: string;
  email?: string;
  company?: string;
  value?: number;
  lastUpdated: string;
}

export interface IncompleteRecord {
  id: string;
  type: 'deal' | 'contact' | 'company';
  name: string;
  missingFields: string[];
  completeness: number; // 0-100
}

export interface DataQualityMetrics {
  totalIssues: number;
  highSeverityIssues: number;
  duplicateCount: number;
  incompleteCount: number;
  overallQualityScore: number; // 0-100
}

// ============================================================================
// Pipeline Forecast Response
// ============================================================================

export interface PipelineForecastResponse extends CopilotResponse {
  type: 'pipeline_forecast';
  data: PipelineForecastResponseData;
}

export interface PipelineForecastResponseData {
  period: {
    type: 'month' | 'quarter' | 'year';
    label: string;
    startDate: string;
    endDate: string;
  };
  forecast: ForecastBreakdown;
  coverage: CoverageMetrics;
  likelyToClose: ForecastDeal[];
  atRisk: ForecastDeal[];
  metrics: ForecastMetrics;
}

export interface ForecastBreakdown {
  bestCase: number;
  worstCase: number;
  mostLikely: number;
  weightedPipeline: number;
  committed: number;
}

export interface CoverageMetrics {
  pipelineCoverage: number; // percentage
  targetRevenue: number;
  coverageRatio: number;
  status: 'exceeded' | 'adequate' | 'insufficient';
}

export interface ForecastDeal {
  id: string;
  name: string;
  value: number;
  stage: string;
  probability: number; // 0-100
  closeDate?: string;
  owner: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ForecastMetrics {
  totalPipelineValue: number;
  weightedValue: number;
  dealsInPipeline: number;
  averageDealSize: number;
  averageCloseTime: number; // days
  forecastAccuracy?: number; // percentage
}

// ============================================================================
// Activity Planning Response
// ============================================================================

export interface ActivityPlanningResponse extends CopilotResponse {
  type: 'activity_planning';
  data: ActivityPlanningResponseData;
}

export interface ActivityPlanningResponseData {
  date: string;
  suggestedActivities: SuggestedActivity[];
  prioritizedTasks: PrioritizedTask[];
  scheduledMeetings: ScheduledMeeting[];
  timeBlocks: TimeBlock[];
  recommendations: string[];
}

export interface SuggestedActivity {
  id: string;
  type: 'call' | 'email' | 'meeting' | 'task' | 'follow_up';
  title: string;
  description?: string;
  priority: 'high' | 'medium' | 'low';
  estimatedDuration: number; // minutes
  relatedContactId?: string;
  relatedContactName?: string;
  relatedDealId?: string;
  relatedDealName?: string;
  reason: string;
}

export interface PrioritizedTask {
  id: string;
  title: string;
  description?: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  dueDate?: string;
  isOverdue: boolean;
  estimatedDuration: number;
  relatedContactId?: string;
  relatedContactName?: string;
  relatedDealId?: string;
  relatedDealName?: string;
}

export interface ScheduledMeeting {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  attendees: string[];
  location?: string;
  hasPrepBrief: boolean;
  relatedDealId?: string;
  relatedDealName?: string;
}

export interface TimeBlock {
  startTime: string;
  endTime: string;
  type: 'meeting' | 'focus_time' | 'break' | 'available';
  activity?: SuggestedActivity | PrioritizedTask;
}

// ============================================================================
// Company Intelligence Response
// ============================================================================

export interface CompanyIntelligenceResponse extends CopilotResponse {
  type: 'company_intelligence';
  data: CompanyIntelligenceResponseData;
}

export interface CompanyIntelligenceResponseData {
  company: CompanyInfo;
  contacts: CompanyContact[];
  deals: CompanyDeal[];
  activities: CompanyActivity[];
  meetings: CompanyMeeting[];
  insights: CompanyInsight[];
  metrics: CompanyMetrics;
}

export interface CompanyInfo {
  id: string;
  name: string;
  industry?: string;
  website?: string;
  address?: string;
  logo?: string;
  description?: string;
}

export interface CompanyContact {
  id: string;
  name: string;
  email: string;
  title?: string;
  phone?: string;
  isPrimary: boolean;
  lastContact?: string;
}

export interface CompanyDeal {
  id: string;
  name: string;
  value: number;
  stage: string;
  probability: number;
  closeDate?: string;
  healthScore: number;
  owner: string;
}

export interface CompanyActivity {
  id: string;
  type: string;
  date: string;
  summary?: string;
  contactId?: string;
  contactName?: string;
}

export interface CompanyMeeting {
  id: string;
  title: string;
  date: string;
  summary?: string;
  attendees: string[];
}

export interface CompanyInsight {
  id: string;
  type: 'opportunity' | 'risk' | 'trend' | 'relationship';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
}

export interface CompanyMetrics {
  totalDealValue: number;
  activeDeals: number;
  closedDeals: number;
  totalContacts: number;
  recentActivities: number;
  relationshipStrength: 'strong' | 'moderate' | 'weak';
}

// ============================================================================
// Workflow Process Response
// ============================================================================

export interface WorkflowProcessResponse extends CopilotResponse {
  type: 'workflow_process';
  data: WorkflowProcessResponseData;
}

export interface WorkflowProcessResponseData {
  process: ProcessInfo;
  currentStep: ProcessStep;
  nextSteps: ProcessStep[];
  stuckItems: StuckItem[];
  bottlenecks: ProcessBottleneck[];
  recommendations: string[];
}

export interface ProcessInfo {
  name: string;
  type: 'deal' | 'contact' | 'activity' | 'task';
  description?: string;
}

export interface ProcessStep {
  id: string;
  name: string;
  stage: string;
  description?: string;
  averageTime: number; // days
  itemsInStage: number;
  averageAge: number; // days
}

export interface StuckItem {
  id: string;
  name: string;
  stage: string;
  daysInStage: number;
  lastActivity?: string;
  owner: string;
  recommendation: string;
}

export interface ProcessBottleneck {
  stage: string;
  issue: string;
  impact: 'high' | 'medium' | 'low';
  itemsAffected: number;
  recommendation: string;
}

// ============================================================================
// Search Discovery Response
// ============================================================================

export interface SearchDiscoveryResponse extends CopilotResponse {
  type: 'search_discovery';
  data: SearchDiscoveryResponseData;
}

export interface SearchDiscoveryResponseData {
  query: string;
  results: DiscoverySearchResult[];
  filters: AppliedFilter[];
  totalResults: number;
  categories: ResultCategory[];
  metadata: Record<string, any>;
}

export interface DiscoverySearchResult {
  id: string;
  type: 'deal' | 'contact' | 'company' | 'meeting' | 'activity' | 'task';
  title: string;
  subtitle?: string;
  description?: string;
  metadata: Record<string, any>;
  relevance: number; // 0-100
  highlights?: string[];
}

export interface AppliedFilter {
  field: string;
  value: string;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than';
}

export interface ResultCategory {
  type: string;
  count: number;
  results: DiscoverySearchResult[];
}

// ============================================================================
// Contact Selection Response
// ============================================================================

export interface ContactSelectionResponse extends CopilotResponse {
  type: 'contact_selection';
  data: ContactSelectionResponseData;
}

export interface ContactSelectionResponseData {
  activityType: 'proposal' | 'meeting' | 'sale' | 'outbound' | 'task';
  activityDate: string;
  requiresContactSelection: boolean;
  prefilledName: string;
  prefilledEmail: string;
  suggestedContacts?: ContactSuggestion[];
  // Task-specific fields
  taskTitle?: string;
  taskType?: 'call' | 'email' | 'meeting' | 'follow_up' | 'demo' | 'proposal' | 'general';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

export interface ContactSuggestion {
  id: string;
  name: string;
  email?: string;
  company?: string;
}

// ============================================================================
// Activity Creation Response
// ============================================================================

export interface ActivityCreationResponse extends CopilotResponse {
  type: 'activity_creation';
  data: ActivityCreationResponseData;
}

export interface ActivityCreationResponseData {
  activityType: 'proposal' | 'meeting' | 'sale' | 'outbound';
  activityDate: string;
  contact: {
    id: string;
    name: string;
    email?: string;
    company?: string | null;
    companyId?: string | null;
  };
  requiresContactSelection: boolean;
}

// ============================================================================
// Task Creation Response
// ============================================================================

export interface TaskCreationResponse extends CopilotResponse {
  type: 'task_creation';
  data: TaskCreationResponseData;
}

export interface TaskCreationResponseData {
  title: string;
  description?: string;
  dueDate: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  taskType: 'call' | 'email' | 'meeting' | 'follow_up' | 'demo' | 'proposal' | 'general';
  contact: {
    id: string;
    name: string;
    email?: string;
    company?: string | null;
    companyId?: string | null;
  };
  requiresContactSelection: boolean;
  proposalId?: string | null;
  dealId?: string | null;
}

// ============================================================================
// Proposal Selection Response
// ============================================================================

export interface ProposalSelectionResponse extends CopilotResponse {
  type: 'proposal_selection';
  data: ProposalSelectionResponseData;
}

export interface ProposalSelectionResponseData {
  contact: {
    id: string;
    name: string;
    email?: string;
    company?: string | null;
    companyId?: string | null;
  };
  proposals: ProposalSuggestion[];
  taskTitle: string;
  taskType: 'call' | 'email' | 'meeting' | 'follow_up' | 'demo' | 'proposal' | 'general';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate: string | null;
}

export interface ProposalSuggestion {
  id: string;
  clientName: string;
  details?: string;
  amount?: number;
  date: string;
  dealId?: string | null;
  dealName?: string | null;
  dealValue?: number | null;
}

// ============================================================================
// Action Summary Response
// ============================================================================

export interface ActionSummaryResponse extends CopilotResponse {
  type: 'action_summary';
  data: ActionSummaryResponseData;
}

export interface ActionSummaryResponseData {
  actionsCompleted: number;
  actionItems: ActionSummaryItem[];
  metrics: ActionMetrics;
}

export interface ActionSummaryItem {
  entityType: string;
  operation: string;
  entityId?: string;
  entityName?: string;
  details?: string;
  success: boolean;
}

export interface ActionMetrics {
  dealsUpdated: number;
  clientsUpdated: number;
  contactsUpdated: number;
  tasksCreated: number;
  activitiesCreated: number;
}


