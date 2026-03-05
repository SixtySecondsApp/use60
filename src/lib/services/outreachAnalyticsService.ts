/**
 * outreachAnalyticsService — OUT-001 through OUT-006
 *
 * Hooks and helpers for the Outreach Analytics page.
 * Fetches campaign data from Instantly integration tables.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import type {
  OutreachCampaignData,
  OutreachMonitorData,
  OutreachPeriod,
  RepActivityRow,
  ReplyIntentBucket,
  DomainHealthRow,
  SequencePerformanceRow,
  ClassifiedReply,
} from '@/lib/types/outreachAnalytics';

/**
 * Fetch campaign-level outreach data (sequences, metrics)
 */
export function useOutreachCampaignData(orgId: string) {
  return useQuery<OutreachCampaignData | null>({
    queryKey: ['outreach-campaigns', orgId],
    queryFn: async () => {
      if (!orgId) return null;

      const { data: campaigns, error } = await supabase
        .from('instantly_campaigns')
        .select('id, name, status, total_leads_contacted, leads_who_opened, leads_who_replied, leads_who_clicked, leads_who_bounced, started_at')
        .eq('org_id', orgId);

      if (error) throw error;
      if (!campaigns || campaigns.length === 0) {
        return { campaigns: [], sequences: [], metrics: emptyMetrics() };
      }

      const sequences: SequencePerformanceRow[] = campaigns.map((c: any) => {
        const sent = c.total_leads_contacted ?? 0;
        const opened = c.leads_who_opened ?? 0;
        const clicked = c.leads_who_clicked ?? 0;
        const replied = c.leads_who_replied ?? 0;
        const bounced = c.leads_who_bounced ?? 0;
        return {
          id: c.id,
          name: c.name ?? 'Untitled',
          status: c.status ?? 'unknown',
          sent,
          opened,
          clicked,
          replied,
          bounced,
          openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
          clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
          replyRate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
          bounceRate: sent > 0 ? Math.round((bounced / sent) * 100) : 0,
          startedAt: c.started_at,
        };
      });

      const totalSent = sequences.reduce((s, r) => s + r.sent, 0);
      const totalOpened = sequences.reduce((s, r) => s + r.opened, 0);
      const totalClicked = sequences.reduce((s, r) => s + r.clicked, 0);
      const totalReplied = sequences.reduce((s, r) => s + r.replied, 0);
      const totalBounced = sequences.reduce((s, r) => s + r.bounced, 0);

      return {
        campaigns: campaigns.map((c: any) => ({ id: c.id, name: c.name })),
        sequences,
        metrics: {
          totalSent,
          totalOpened,
          totalClicked,
          totalReplied,
          totalBounced,
          campaignCount: campaigns.length,
          openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
          clickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0,
          replyRate: totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0,
          bounceRate: totalSent > 0 ? Math.round((totalBounced / totalSent) * 100) : 0,
        },
      };
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch monitor data (classified replies)
 */
export function useOutreachMonitorData(orgId: string, userId: string) {
  return useQuery<OutreachMonitorData | null>({
    queryKey: ['outreach-monitor', orgId, userId],
    queryFn: async () => {
      if (!orgId) return null;

      const { data, error } = await supabase
        .from('instantly_reply_classifications')
        .select('id, intent, body')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      return {
        classified_replies: (data ?? []) as ClassifiedReply[],
      };
    },
    enabled: !!orgId && !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch rep activity leaderboard
 */
export function useOutreachRepActivity(orgId: string, period: OutreachPeriod) {
  return useQuery<RepActivityRow[]>({
    queryKey: ['outreach-rep-activity', orgId, period],
    queryFn: async () => {
      if (!orgId) return [];

      const daysMap: Record<OutreachPeriod, number> = { '7d': 7, '30d': 30, '90d': 90 };
      const since = new Date();
      since.setDate(since.getDate() - daysMap[period]);

      const { data, error } = await supabase
        .from('activities')
        .select('user_id, type')
        .eq('org_id', orgId)
        .in('type', ['email_sent', 'email_opened', 'email_replied', 'meeting_booked'])
        .gte('created_at', since.toISOString());

      if (error) throw error;
      if (!data || data.length === 0) return [];

      const byUser: Record<string, RepActivityRow> = {};
      for (const a of data) {
        if (!a.user_id) continue;
        if (!byUser[a.user_id]) {
          byUser[a.user_id] = {
            userId: a.user_id,
            name: a.user_id.slice(0, 8),
            emailsSent: 0,
            opens: 0,
            replies: 0,
            meetings: 0,
          };
        }
        const row = byUser[a.user_id];
        if (a.type === 'email_sent') row.emailsSent++;
        else if (a.type === 'email_opened') row.opens++;
        else if (a.type === 'email_replied') row.replies++;
        else if (a.type === 'meeting_booked') row.meetings++;
      }

      return Object.values(byUser).sort((a, b) => b.emailsSent - a.emailsSent);
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Build reply intent buckets from classified replies
 */
export function buildReplyIntentBuckets(replies: ClassifiedReply[]): ReplyIntentBucket[] {
  const counts: Record<string, number> = {};
  for (const r of replies) {
    const intent = r.intent || 'unknown';
    counts[intent] = (counts[intent] ?? 0) + 1;
  }

  const colors: Record<string, string> = {
    interested: '#10b981',
    not_interested: '#ef4444',
    out_of_office: '#f59e0b',
    wrong_person: '#8b5cf6',
    unsubscribe: '#6b7280',
    unknown: '#94a3b8',
  };

  return Object.entries(counts)
    .map(([category, count]) => ({
      category,
      count,
      color: colors[category] ?? '#94a3b8',
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Build domain health rows from sequence data
 */
export function buildDomainHealthFromSequences(sequences: SequencePerformanceRow[]): DomainHealthRow[] {
  const byDomain: Record<string, { sent: number; bounced: number }> = {};

  for (const seq of sequences) {
    const domain = seq.domain || extractDomain(seq.name);
    if (!byDomain[domain]) byDomain[domain] = { sent: 0, bounced: 0 };
    byDomain[domain].sent += seq.sent;
    byDomain[domain].bounced += seq.bounced;
  }

  return Object.entries(byDomain)
    .map(([domain, { sent, bounced }]) => {
      const bounceRate = sent > 0 ? Math.round((bounced / sent) * 100) : 0;
      return {
        domain,
        sent,
        bounced,
        bounceRate,
        health: bounceRate > 5 ? 'critical' as const : bounceRate > 2 ? 'warning' as const : 'good' as const,
      };
    })
    .sort((a, b) => b.bounceRate - a.bounceRate);
}

function extractDomain(name: string): string {
  const match = name.match(/@([\w.-]+)/);
  return match ? match[1] : 'unknown';
}

function emptyMetrics() {
  return {
    totalSent: 0,
    totalOpened: 0,
    totalClicked: 0,
    totalReplied: 0,
    totalBounced: 0,
    campaignCount: 0,
    openRate: 0,
    clickRate: 0,
    replyRate: 0,
    bounceRate: 0,
  };
}
