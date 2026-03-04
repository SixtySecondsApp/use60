/**
 * Campaign types — wrapping Instantly API responses and monitor-campaigns classification
 */

// Instantly campaign status codes
// 0 = draft, 1 = active, 2 = paused, 3 = completed
export type CampaignStatus = 0 | 1 | 2 | 3;

// All filter values including "all" sentinel
export type StatusFilter = CampaignStatus | 'all';

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  timestamp?: string;
  created_at?: string;
}

export interface CampaignAnalytics {
  campaign_id: string;
  campaign_name?: string;
  leads_count?: number;
  contacted_count?: number;
  emails_sent_count?: number;
  open_count_unique?: number;
  link_click_count_unique?: number;
  reply_count_unique?: number;
  bounced_count?: number;
  total_interested?: number;
  open_rate?: number;
  reply_rate?: number;
  bounce_rate?: number;
}

export interface DailyAnalyticsEntry {
  date: string;
  sent?: number;
  opened?: number;
  clicked?: number;
  replied?: number;
}

export type ReplyCategory =
  | 'interested'
  | 'not_interested'
  | 'question'
  | 'out_of_office'
  | 'forwarded'
  | 'unsubscribe';

export interface ClassifiedReply {
  contact_name?: string;
  contact_email: string;
  subject?: string;
  category: ReplyCategory;
  confidence: number;
  summary?: string;
  suggested_action?: string;
}

export interface CampaignMetrics {
  campaign_id: string;
  campaign_name: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
  bounce_rate: number;
}

export interface CampaignRecommendation {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'positive';
  action?: string;
}

export interface MonitorData {
  metrics?: CampaignMetrics[];
  classified_replies: ClassifiedReply[];
  recommendations: CampaignRecommendation[];
}
