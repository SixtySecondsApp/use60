/**
 * useBrainInsights — Cross-referenced actionable insights from Brain data
 *
 * Produces 2-3 insight objects by cross-referencing:
 *   - Overdue commitments (deal_memory_events)
 *   - Decaying contact relationships (contact_memory)
 *   - At-risk deals via meeting sentiment (meetings)
 *
 * Each insight is a complete sentence with a recommendation, not a metric.
 *
 * NL-001a
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';

// ============================================================================
// Types
// ============================================================================

export interface BrainInsight {
  id: string;
  title: string;
  body: string;
  urgency: 'high' | 'medium' | 'low';
  icon: 'alert' | 'clock' | 'trending-down' | 'handshake';
  actionUrl?: string;
  contactName?: string;
  dealName?: string;
}

// ============================================================================
// Internal row types (explicit column selection per project rules)
// ============================================================================

interface CommitmentRow {
  id: string;
  deal_id: string;
  event_type: string;
  summary: string;
  detail: Record<string, unknown>;
  contact_ids: string[];
  source_timestamp: string;
}

interface ContactMemoryRow {
  id: string;
  contact_id: string;
  relationship_strength: number;
  last_interaction_at: string | null;
}

interface MeetingRow {
  id: string;
  title: string;
  sentiment_score: number;
  meeting_start: string;
  company_id: string | null;
  deal_id: string | null;
}

interface DealRow {
  id: string;
  name: string;
  company: string | null;
  company_id: string | null;
}

interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_id: string | null;
}

interface CompanyRow {
  id: string;
  name: string;
}

// ============================================================================
// Cache key
// ============================================================================

export const BRAIN_INSIGHTS_KEY = 'brain-insights' as const;

// ============================================================================
// Helpers
// ============================================================================

function contactDisplayName(c: ContactRow): string {
  const parts = [c.first_name, c.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unknown Contact';
}

function getDeadline(detail: Record<string, unknown>): Date | null {
  const deadline = detail?.deadline;
  if (!deadline || typeof deadline !== 'string') return null;
  const d = new Date(deadline);
  return isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Fetch and cross-reference Brain data to produce 2-3 actionable insights.
 * Sorted by urgency (high first), capped at 3.
 */
export function useBrainInsights() {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  return useQuery<BrainInsight[]>({
    queryKey: [BRAIN_INSIGHTS_KEY, activeOrgId],
    queryFn: async (): Promise<BrainInsight[]> => {
      if (!activeOrgId) return [];

      const now = new Date();

      // ---------------------------------------------------------------
      // 1. Fetch overdue commitments
      //    event_type = 'commitment_made', is_active = true,
      //    detail->>'status' = 'pending' (or no status = still pending)
      // ---------------------------------------------------------------
      const { data: commitmentRows, error: commitErr } = await supabase
        .from('deal_memory_events')
        .select(
          'id, deal_id, event_type, summary, detail, contact_ids, source_timestamp'
        )
        .eq('org_id', activeOrgId)
        .eq('event_type', 'commitment_made')
        .eq('is_active', true)
        .order('source_timestamp', { ascending: false })
        .limit(200);

      if (commitErr) throw commitErr;

      // Filter to overdue: detail.status = 'pending' AND deadline is past
      const overdueCommitments = ((commitmentRows ?? []) as CommitmentRow[]).filter(
        (c) => {
          const status = c.detail?.status;
          if (status && status !== 'pending') return false;
          const deadline = getDeadline(c.detail);
          return deadline !== null && deadline < now;
        }
      );

      // ---------------------------------------------------------------
      // 2. Fetch decaying contacts (relationship_strength < 0.4)
      // ---------------------------------------------------------------
      const { data: decayingRows, error: decayErr } = await supabase
        .from('contact_memory')
        .select(
          'id, contact_id, relationship_strength, last_interaction_at'
        )
        .eq('org_id', activeOrgId)
        .lt('relationship_strength', 0.4)
        .order('relationship_strength', { ascending: true })
        .limit(100);

      if (decayErr) throw decayErr;

      const decayingContacts = (decayingRows ?? []) as ContactMemoryRow[];

      // ---------------------------------------------------------------
      // 3. Fetch strong contacts with no recent meeting (>14 days)
      // ---------------------------------------------------------------
      const { data: strongRows, error: strongErr } = await supabase
        .from('contact_memory')
        .select(
          'id, contact_id, relationship_strength, last_interaction_at'
        )
        .eq('org_id', activeOrgId)
        .gte('relationship_strength', 0.7)
        .order('relationship_strength', { ascending: false })
        .limit(100);

      if (strongErr) throw strongErr;

      const strongContacts = ((strongRows ?? []) as ContactMemoryRow[]).filter(
        (c) => {
          if (!c.last_interaction_at) return true; // no interaction at all
          const lastDate = new Date(c.last_interaction_at);
          return daysBetween(now, lastDate) > 14;
        }
      );

      // ---------------------------------------------------------------
      // 4. Fetch recent meetings with low sentiment (< 0.5)
      // ---------------------------------------------------------------
      const thirtyDaysAgo = new Date(
        now.getTime() - 30 * 24 * 60 * 60 * 1000
      ).toISOString();

      const { data: meetingRows, error: meetErr } = await supabase
        .from('meetings')
        .select('id, title, sentiment_score, meeting_start, company_id, deal_id')
        .eq('org_id', activeOrgId)
        .not('sentiment_score', 'is', null)
        .lt('sentiment_score', 0.5)
        .gte('meeting_start', thirtyDaysAgo)
        .order('meeting_start', { ascending: false })
        .limit(100);

      if (meetErr) throw meetErr;

      const lowSentimentMeetings = (meetingRows ?? []) as MeetingRow[];

      // ---------------------------------------------------------------
      // 5. Gather unique IDs to resolve names
      // ---------------------------------------------------------------
      const allDealIds = new Set<string>();
      const allContactIds = new Set<string>();
      const allCompanyIds = new Set<string>();

      for (const c of overdueCommitments) {
        allDealIds.add(c.deal_id);
        for (const cid of c.contact_ids ?? []) {
          allContactIds.add(cid);
        }
      }
      for (const cm of [...decayingContacts, ...strongContacts]) {
        allContactIds.add(cm.contact_id);
      }
      for (const m of lowSentimentMeetings) {
        if (m.deal_id) allDealIds.add(m.deal_id);
        if (m.company_id) allCompanyIds.add(m.company_id);
      }

      // Fetch deal names
      const dealMap = new Map<string, DealRow>();
      if (allDealIds.size > 0) {
        const { data: deals, error: dealsErr } = await supabase
          .from('deals')
          .select('id, name, company, company_id')
          .eq('clerk_org_id', activeOrgId)
          .in('id', [...allDealIds]);

        if (!dealsErr && deals) {
          for (const d of deals as DealRow[]) {
            dealMap.set(d.id, d);
            if (d.company_id) allCompanyIds.add(d.company_id);
          }
        }
      }

      // Fetch contact names
      const contactMap = new Map<string, ContactRow>();
      if (allContactIds.size > 0) {
        const { data: contacts, error: contactsErr } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, company_id')
          .in('id', [...allContactIds]);

        if (!contactsErr && contacts) {
          for (const c of contacts as ContactRow[]) {
            contactMap.set(c.id, c);
            if (c.company_id) allCompanyIds.add(c.company_id);
          }
        }
      }

      // Fetch company names
      const companyMap = new Map<string, string>();
      if (allCompanyIds.size > 0) {
        const { data: companies, error: companiesErr } = await supabase
          .from('companies')
          .select('id, name')
          .in('id', [...allCompanyIds]);

        if (!companiesErr && companies) {
          for (const co of companies as CompanyRow[]) {
            companyMap.set(co.id, co.name);
          }
        }
      }

      // ---------------------------------------------------------------
      // 6. Build lookup sets for cross-referencing
      // ---------------------------------------------------------------
      const decayingContactIds = new Set(decayingContacts.map((c) => c.contact_id));
      const overdueCommitmentByDeal = new Map<string, CommitmentRow>();
      for (const c of overdueCommitments) {
        // Keep the first (most recent) per deal
        if (!overdueCommitmentByDeal.has(c.deal_id)) {
          overdueCommitmentByDeal.set(c.deal_id, c);
        }
      }

      // Map deal_id -> low sentiment meeting
      const lowSentimentByDeal = new Map<string, MeetingRow>();
      for (const m of lowSentimentMeetings) {
        if (m.deal_id && !lowSentimentByDeal.has(m.deal_id)) {
          lowSentimentByDeal.set(m.deal_id, m);
        }
      }

      // ---------------------------------------------------------------
      // 7. Generate cross-referenced insights
      // ---------------------------------------------------------------
      const insights: BrainInsight[] = [];

      // --- HIGH: Decaying contact + overdue commitment ---
      for (const commitment of overdueCommitments) {
        for (const cid of commitment.contact_ids ?? []) {
          if (decayingContactIds.has(cid)) {
            const contact = contactMap.get(cid);
            const deal = dealMap.get(commitment.deal_id);
            const name = contact ? contactDisplayName(contact) : 'A contact';
            const company =
              (contact?.company_id && companyMap.get(contact.company_id)) ||
              deal?.company ||
              'their company';

            insights.push({
              id: `decay-commit-${commitment.id}-${cid}`,
              title: `${name} needs attention`,
              body: `${name} at ${company} — relationship decaying AND you have an overdue commitment. Chase now.`,
              urgency: 'high',
              icon: 'alert',
              actionUrl: contact ? `/contacts/${cid}` : undefined,
              contactName: name,
              dealName: deal?.name,
            });
            break; // one insight per commitment
          }
        }
      }

      // --- HIGH: Declining sentiment + overdue commitment ---
      for (const [dealId, commitment] of overdueCommitmentByDeal) {
        const meeting = lowSentimentByDeal.get(dealId);
        if (!meeting) continue;
        // Avoid duplicate if already covered by decay+commit above
        if (
          insights.some(
            (i) =>
              i.id.startsWith('decay-commit-') && i.id.includes(commitment.id)
          )
        ) {
          continue;
        }

        const deal = dealMap.get(dealId);
        const dealName = deal?.name ?? 'A deal';

        insights.push({
          id: `sentiment-commit-${commitment.id}`,
          title: `${dealName} is at risk`,
          body: `${dealName} is at risk — sentiment dropped and you promised "${commitment.summary}". Deliver before they go cold.`,
          urgency: 'high',
          icon: 'trending-down',
          actionUrl: `/deals/${dealId}`,
          dealName,
        });
      }

      // --- MEDIUM: Strong relationship but no recent meeting ---
      for (const cm of strongContacts) {
        const contact = contactMap.get(cm.contact_id);
        if (!contact) continue;

        const name = contactDisplayName(contact);
        const strengthPct = Math.round(cm.relationship_strength * 100);
        const lastDate = cm.last_interaction_at
          ? new Date(cm.last_interaction_at)
          : null;
        const gapDays = lastDate ? daysBetween(now, lastDate) : null;

        insights.push({
          id: `strong-no-meeting-${cm.contact_id}`,
          title: `Check in with ${name}`,
          body: gapDays !== null
            ? `${name} relationship is strong (${strengthPct}%) but you haven't met in ${gapDays} days. Book a check-in.`
            : `${name} relationship is strong (${strengthPct}%) but has no recent interaction on record. Book a check-in.`,
          urgency: 'medium',
          icon: 'handshake',
          actionUrl: `/contacts/${cm.contact_id}`,
          contactName: name,
        });
      }

      // --- MEDIUM: Multiple overdue commitments summary ---
      if (overdueCommitments.length > 1) {
        const uniqueDeals = new Set(overdueCommitments.map((c) => c.deal_id));

        // Find oldest overdue
        let oldestDays = 0;
        for (const c of overdueCommitments) {
          const deadline = getDeadline(c.detail);
          if (deadline) {
            const gap = daysBetween(now, deadline);
            if (gap > oldestDays) oldestDays = gap;
          }
        }

        insights.push({
          id: `multiple-overdue-${activeOrgId}`,
          title: `${overdueCommitments.length} overdue commitments`,
          body: `You have ${overdueCommitments.length} overdue commitments across ${uniqueDeals.size} deal${uniqueDeals.size === 1 ? '' : 's'}. The oldest is ${oldestDays} day${oldestDays === 1 ? '' : 's'} late.`,
          urgency: 'medium',
          icon: 'clock',
        });
      }

      // ---------------------------------------------------------------
      // 8. Sort by urgency (high first) and cap at 3
      // ---------------------------------------------------------------
      const urgencyOrder: Record<string, number> = {
        high: 0,
        medium: 1,
        low: 2,
      };

      insights.sort(
        (a, b) => (urgencyOrder[a.urgency] ?? 2) - (urgencyOrder[b.urgency] ?? 2)
      );

      return insights.slice(0, 3);
    },
    enabled: !!activeOrgId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
