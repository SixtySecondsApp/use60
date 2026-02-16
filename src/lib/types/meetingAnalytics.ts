/**
 * Meeting Analytics Types
 *
 * Types for the meeting-translation Railway API integration.
 * Prefixed with `Ma` to avoid collisions with existing dashboard types.
 */

// ============================================
// Transcript Types
// ============================================

export interface MaTranscript {
  id: string;
  externalId: string | null;
  sourceUrl: string;
  title: string | null;
  languageCode: string | null;
  audioDuration: number | null;
  overallConfidence: number | null;
  fullText: string;
  wordCount: number | null;
  createdAt: string;
  processedAt: string | null;
  isDemo: boolean;
  demoSessionId: string | null;
}

export interface MaTranscriptWithStats extends MaTranscript {
  stats: {
    segmentCount: number;
    topicCount: number;
    actionItemCount: number;
    keyMomentCount: number;
    qaPairCount: number;
    hasSummary: boolean;
    hasSentiment: boolean;
  };
}

// ============================================
// Segment & Search Types
// ============================================

export interface MaTranscriptSegment {
  id: string;
  transcriptId: string;
  segmentIndex: number;
  text: string;
  startTime: number;
  endTime: number;
  wordCount: number | null;
  avgConfidence: number | null;
}

export interface MaSearchResult {
  segment: MaTranscriptSegment;
  transcriptTitle: string | null;
  similarity: number;
}

export interface MaSearchResponse {
  query: string;
  results: MaSearchResult[];
  totalResults: number;
  searchTimeMs: number;
}

// ============================================
// Topic Types
// ============================================

export interface MaTopic {
  id: string;
  transcriptId: string;
  topicName: string;
  relevanceScore: number | null;
  mentionCount: number | null;
  keywords: string[] | null;
  createdAt: string;
}

// ============================================
// Sentiment Types
// ============================================

export type MaSentimentType = 'positive' | 'negative' | 'neutral' | 'mixed';

export interface MaSentimentAnalysis {
  id: string;
  transcriptId: string;
  segmentId: string | null;
  sentiment: MaSentimentType;
  confidence: number | null;
  positiveScore: number | null;
  negativeScore: number | null;
  neutralScore: number | null;
  createdAt: string;
}

// ============================================
// Action Item Types
// ============================================

export type MaPriority = 'high' | 'medium' | 'low';
export type MaActionStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface MaActionItem {
  id: string;
  transcriptId: string;
  actionText: string;
  assignee: string | null;
  dueDate: string | null;
  priority: MaPriority | null;
  status: MaActionStatus;
  startTime: number | null;
  endTime: number | null;
  createdAt: string;
}

// ============================================
// Key Moment Types
// ============================================

export type MaMomentType =
  | 'decision'
  | 'agreement'
  | 'disagreement'
  | 'question'
  | 'insight'
  | 'blocker'
  | 'milestone'
  | 'other';

export interface MaKeyMoment {
  id: string;
  transcriptId: string;
  momentType: MaMomentType;
  title: string | null;
  description: string | null;
  importanceScore: number | null;
  startTime: number | null;
  endTime: number | null;
  createdAt: string;
}

// ============================================
// Summary Types
// ============================================

export type MaSummaryType = 'brief' | 'detailed' | 'executive' | 'technical' | 'action_focused';

export interface MaSummary {
  id: string;
  transcriptId: string;
  summaryType: MaSummaryType;
  summaryText: string;
  createdAt: string;
}

// ============================================
// Q&A Types
// ============================================

export interface MaQAPair {
  id: string;
  transcriptId: string;
  questionText: string;
  answerText: string | null;
  questioner: string | null;
  answerer: string | null;
  questionTime: number | null;
  answerTime: number | null;
  isAnswered: boolean;
  createdAt: string;
}

// ============================================
// Dashboard Types
// ============================================

export interface MaDashboardSummary {
  totalMeetings: number;
  avgPerformanceScore: number;
  avgConversionScore: number;
  avgTalkTimeBalance: number;
  totalActionItems: number;
  completedActionItems: number;
  pendingActionItems: number;
}

export interface MaTopPerformer {
  id: string;
  title: string;
  score: number;
  grade: string;
  createdAt: string;
}

export interface MaPipelineHealth {
  id: string;
  title: string;
  conversionScore: number;
  status: 'hot' | 'warm' | 'cold';
  blockerCount: number;
  createdAt: string;
}

export interface MaDashboardTrends {
  meetingsThisWeek: number;
  meetingsLastWeek: number;
  meetingsTrend: number;
  scoreThisWeek: number;
  scoreLastWeek: number;
  scoreTrend: number;
  actionItemsCompleted: number;
  actionItemsCreated: number;
}

export interface MaDashboardAlert {
  type: 'action_items' | 'blockers' | 'talk_time' | 'sentiment' | 'performance';
  message: string;
  severity: 'info' | 'warning' | 'critical';
  transcriptId?: string;
  transcriptTitle?: string;
}

export interface MaDashboardMetrics {
  summary: MaDashboardSummary;
  topPerformers: MaTopPerformer[];
  pipelineHealth: MaPipelineHealth[];
  trends: MaDashboardTrends;
  alerts: MaDashboardAlert[];
  lastUpdated: string;
}

// ============================================
// Sales Performance Types
// ============================================

export interface MaSalesPerformance {
  id: string;
  title: string;
  createdAt: string;
  score: number;
  grade: string;
  metrics: {
    questionsAsked: number;
    questions: (string | null)[];
    agreements: number;
    agreementDetails: (string | null)[];
    totalActionItems: number;
    assignedActionItems: number;
    unassignedActionItems: number;
  };
  sentiment: string;
  summary: string;
  strengths: string[];
  improvements: string[];
}

// ============================================
// Transcript Insights (all insights for one transcript)
// ============================================

export interface MaTranscriptInsights {
  transcriptId: string;
  topics: MaTopic[];
  sentiment: MaSentimentAnalysis | null;
  segmentSentiments: MaSentimentAnalysis[];
  actionItems: MaActionItem[];
  keyMoments: MaKeyMoment[];
  summaries: MaSummary[];
  qaPairs: MaQAPair[];
}

// ============================================
// Report Types
// ============================================

export interface MaReportHighlights {
  topPerformer: { title: string; score: number; grade: string } | null;
  hottestDeal: { title: string; conversionScore: number } | null;
  meetingCount: number;
  actionItemsCreated: number;
  actionItemsCompleted: number;
  needsAttention: string[];
  recommendations: string[];
}

export interface MaReport {
  type: 'daily' | 'weekly';
  generatedAt: string;
  period: { start: string; end: string };
  metrics: MaDashboardMetrics;
  highlights: MaReportHighlights;
}

export interface MaReportHistoryEntry {
  id: string;
  reportType: 'daily' | 'weekly';
  channelType: 'slack' | 'email';
  channelTarget: string;
  status: 'sent' | 'failed';
  errorMessage: string | null;
  reportData: Record<string, unknown> | null;
  sentAt: string;
}

// ============================================
// Notification Settings Types
// ============================================

export type MaSettingType = 'slack' | 'email';
export type MaScheduleType = 'daily' | 'weekly';

export interface MaNotificationSetting {
  id: string;
  settingType: MaSettingType;
  channel: string;
  config: Record<string, unknown>;
  scheduleType: MaScheduleType | null;
  scheduleTime: string | null;
  scheduleDay: number | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MaNotificationSettingInput {
  settingType: MaSettingType;
  channel: string;
  config?: Record<string, unknown>;
  scheduleType?: MaScheduleType;
  scheduleTime?: string;
  scheduleDay?: number;
  enabled?: boolean;
}

// ============================================
// Analytics Types
// ============================================

export interface MaTalkTimeSpeaker {
  name: string;
  wordCount: number;
  percentage: number;
}

export interface MaTalkTimeEntry {
  id: string;
  title: string;
  createdAt: string;
  speakers: MaTalkTimeSpeaker[];
  totalWords: number;
  topSpeakerPercentage: number;
  isBalanced: boolean;
}

export interface MaConversionEntry {
  id: string;
  title: string;
  createdAt: string;
  conversionScore: number;
  status: 'hot' | 'warm' | 'cold';
  signals: {
    agreements: number;
    decisions: number;
    milestones: number;
    blockers: number;
    actionItems: number;
  };
  sentiment: string;
}

export interface MaSentimentTimelineEntry {
  transcriptId: string;
  title: string;
  date: string;
  sentiment: string;
  positiveScore: number | null;
  negativeScore: number | null;
  neutralScore: number | null;
}

export interface MaSentimentTrends {
  timeline: MaSentimentTimelineEntry[];
  totals: { positive: number; negative: number; neutral: number; mixed: number };
  days: number;
  count: number;
}

// ============================================
// API Response Types
// ============================================

export interface MaApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface MaPaginatedResponse<T> extends MaApiResponse<T[]> {
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
