/**
 * Outreach Analytics types (OUT-001 through OUT-006)
 */

export type OutreachPeriod = '7d' | '30d' | '90d';

export interface OutreachMetrics {
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  totalReplied: number;
  totalBounced: number;
  campaignCount: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
}

export interface SequencePerformanceRow {
  id: string;
  name: string;
  status: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
  startedAt?: string;
  domain?: string;
}

export interface RepActivityRow {
  userId: string;
  name: string;
  emailsSent: number;
  opens: number;
  replies: number;
  meetings: number;
}

export interface ReplyIntentBucket {
  category: string;
  count: number;
  color: string;
}

export interface DomainHealthRow {
  domain: string;
  sent: number;
  bounced: number;
  bounceRate: number;
  health: 'good' | 'warning' | 'critical';
}

export interface ClassifiedReply {
  id: string;
  intent: string;
  body?: string;
}

export interface OutreachCampaignData {
  campaigns: { id: string; name: string }[];
  sequences: SequencePerformanceRow[];
  metrics: OutreachMetrics;
}

export interface OutreachMonitorData {
  classified_replies: ClassifiedReply[];
}
