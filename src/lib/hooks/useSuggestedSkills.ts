/**
 * useSuggestedSkills — Brain state → skill recommendations (SBI-006)
 *
 * Maps current Brain state to actionable skill suggestions:
 *   - Overdue commitments    → "Draft Follow-Up"
 *   - Decaying contacts      → "Re-Engage Contact"
 *   - Recent objections      → "Handle Objection"
 *   - Stale deals (no activity 14+ days) → "Next Best Actions"
 *   - New deals (no events)  → "Build Deal Map"
 *
 * Returns max 3 suggestions sorted by urgency (high first).
 * React Query with 5-min stale.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';

// ============================================================================
// Types
// ============================================================================

export interface SkillSuggestion {
  skillKey: string;
  skillName: string;
  reason: string;
  urgency: 'high' | 'medium' | 'low';
  entityId?: string;
  entityType?: 'deal' | 'contact';
  entityName?: string;
}

// ============================================================================
// Internal row types (explicit column selection per project rules)
// ============================================================================

interface CommitmentRow {
  id: string;
  deal_id: string;
  summary: string;
  detail: Record<string, unknown>;
  contact_ids: string[];
  source_timestamp: string;
}

interface ObjectionRow {
  id: string;
  deal_id: string;
  summary: string;
  contact_ids: string[];
  source_timestamp: string;
}

interface ContactMemoryRow {
  id: string;
  contact_id: string;
  relationship_strength: number;
}

interface DealRow {
  id: string;
  name: string;
}

interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface MeetingRow {
  deal_id: string;
  meeting_start: string;
}

interface DealEventCountRow {
  deal_id: string;
}

// ============================================================================
// Cache key
// ============================================================================

export const SUGGESTED_SKILLS_KEY = 'suggested-skills' as const;

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

const URGENCY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

// ============================================================================
// Hook
// ============================================================================

/**
 * Query Brain state and map it to actionable skill recommendations.
 * Returns max 3 suggestions sorted by urgency (high first).
 */
export function useSuggestedSkills() {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  return useQuery<SkillSuggestion[]>({
    queryKey: [SUGGESTED_SKILLS_KEY, activeOrgId],
    queryFn: async (): Promise<SkillSuggestion[]> => {
      if (!activeOrgId) return [];

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

      // ---------------------------------------------------------------
      // 1. Overdue commitments
      //    commitment_made, is_active, detail->>'status' = 'pending',
      //    deadline is past
      // ---------------------------------------------------------------
      const { data: commitmentRows, error: commitErr } = await supabase
        .from('deal_memory_events')
        .select('id, deal_id, summary, detail, contact_ids, source_timestamp')
        .eq('org_id', activeOrgId)
        .eq('event_type', 'commitment_made')
        .eq('is_active', true)
        .order('source_timestamp', { ascending: false })
        .limit(200);

      if (commitErr) throw commitErr;

      const overdueCommitments = ((commitmentRows ?? []) as CommitmentRow[]).filter((c) => {
        const status = c.detail?.status;
        if (status && status !== 'pending') return false;
        const deadline = getDeadline(c.detail);
        return deadline !== null && deadline < now;
      });

      // ---------------------------------------------------------------
      // 2. Decaying contacts (relationship_strength < 0.4)
      // ---------------------------------------------------------------
      const { data: decayingRows, error: decayErr } = await supabase
        .from('contact_memory')
        .select('id, contact_id, relationship_strength')
        .eq('org_id', activeOrgId)
        .lt('relationship_strength', 0.4)
        .order('relationship_strength', { ascending: true })
        .limit(50);

      if (decayErr) throw decayErr;

      const decayingContacts = (decayingRows ?? []) as ContactMemoryRow[];

      // ---------------------------------------------------------------
      // 3. Recent objections (last 7 days)
      // ---------------------------------------------------------------
      const { data: objectionRows, error: objErr } = await supabase
        .from('deal_memory_events')
        .select('id, deal_id, summary, contact_ids, source_timestamp')
        .eq('org_id', activeOrgId)
        .eq('event_type', 'objection_raised')
        .eq('is_active', true)
        .gte('source_timestamp', sevenDaysAgo)
        .order('source_timestamp', { ascending: false })
        .limit(50);

      if (objErr) throw objErr;

      const recentObjections = (objectionRows ?? []) as ObjectionRow[];

      // ---------------------------------------------------------------
      // 4. Active deals for stale/new detection
      // ---------------------------------------------------------------
      const { data: dealRows, error: dealErr } = await supabase
        .from('deals')
        .select('id, name')
        .eq('clerk_org_id', activeOrgId)
        .eq('status', 'active');

      if (dealErr) throw dealErr;

      const activeDeals = (dealRows ?? []) as DealRow[];

      if (activeDeals.length === 0 && overdueCommitments.length === 0 && decayingContacts.length === 0 && recentObjections.length === 0) {
        return [];
      }

      // ---------------------------------------------------------------
      // 4b. Recent meetings per deal (last 14 days) — for stale deal detection
      // ---------------------------------------------------------------
      const dealIds = activeDeals.map((d) => d.id);
      let meetingsByDeal = new Map<string, MeetingRow[]>();

      if (dealIds.length > 0) {
        const { data: meetingRows, error: meetErr } = await supabase
          .from('meetings')
          .select('deal_id, meeting_start')
          .eq('org_id', activeOrgId)
          .in('deal_id', dealIds)
          .gte('meeting_start', fourteenDaysAgo);

        if (!meetErr && meetingRows) {
          for (const m of meetingRows as MeetingRow[]) {
            if (!m.deal_id) continue;
            const existing = meetingsByDeal.get(m.deal_id) ?? [];
            existing.push(m);
            meetingsByDeal.set(m.deal_id, existing);
          }
        }
      }

      // ---------------------------------------------------------------
      // 4c. Deal memory event counts — for new deal detection
      //     A deal with zero events is "new"
      // ---------------------------------------------------------------
      let dealsWithEvents = new Set<string>();

      if (dealIds.length > 0) {
        const { data: eventCountRows, error: eventCountErr } = await supabase
          .from('deal_memory_events')
          .select('deal_id')
          .eq('org_id', activeOrgId)
          .eq('is_active', true)
          .in('deal_id', dealIds)
          .limit(1000);

        if (!eventCountErr && eventCountRows) {
          for (const row of eventCountRows as DealEventCountRow[]) {
            dealsWithEvents.add(row.deal_id);
          }
        }
      }

      // ---------------------------------------------------------------
      // 5. Resolve names for entities we'll reference
      // ---------------------------------------------------------------
      const allContactIds = new Set<string>();
      const allDealIds = new Set<string>();

      // From overdue commitments
      for (const c of overdueCommitments) {
        allDealIds.add(c.deal_id);
      }

      // From decaying contacts
      for (const cm of decayingContacts) {
        allContactIds.add(cm.contact_id);
      }

      // From recent objections
      for (const obj of recentObjections) {
        allDealIds.add(obj.deal_id);
        for (const cid of obj.contact_ids ?? []) {
          allContactIds.add(cid);
        }
      }

      // Deal names — we already have activeDeals, build a map
      const dealMap = new Map<string, DealRow>();
      for (const d of activeDeals) {
        dealMap.set(d.id, d);
      }

      // For deals from commitments/objections not in active deals, fetch separately
      const missingDealIds = [...allDealIds].filter((id) => !dealMap.has(id));
      if (missingDealIds.length > 0) {
        const { data: extraDeals, error: extraDealsErr } = await supabase
          .from('deals')
          .select('id, name')
          .eq('clerk_org_id', activeOrgId)
          .in('id', missingDealIds);

        if (!extraDealsErr && extraDeals) {
          for (const d of extraDeals as DealRow[]) {
            dealMap.set(d.id, d);
          }
        }
      }

      // Contact names
      const contactMap = new Map<string, ContactRow>();
      if (allContactIds.size > 0) {
        const { data: contacts, error: contactsErr } = await supabase
          .from('contacts')
          .select('id, first_name, last_name')
          .in('id', [...allContactIds]);

        if (!contactsErr && contacts) {
          for (const c of contacts as ContactRow[]) {
            contactMap.set(c.id, c);
          }
        }
      }

      // ---------------------------------------------------------------
      // 6. Build skill suggestions
      // ---------------------------------------------------------------
      const suggestions: SkillSuggestion[] = [];

      // --- HIGH: Overdue commitments → "Draft Follow-Up" ---
      for (const commitment of overdueCommitments) {
        const deadline = getDeadline(commitment.detail);
        if (!deadline) continue;

        const daysOverdue = daysBetween(now, deadline);
        const deal = dealMap.get(commitment.deal_id);
        const dealName = deal?.name ?? 'a deal';

        suggestions.push({
          skillKey: 'copilot-followup',
          skillName: 'Draft Follow-Up',
          reason: `You promised ${commitment.summary} — ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue`,
          urgency: 'high',
          entityId: commitment.deal_id,
          entityType: 'deal',
          entityName: dealName,
        });

        // One suggestion per overdue commitment is enough — we'll cap at 3 total
        break;
      }

      // --- HIGH: Recent objections → "Handle Objection" ---
      for (const objection of recentObjections) {
        // Resolve the first contact name
        const firstContactId = (objection.contact_ids ?? [])[0];
        const contact = firstContactId ? contactMap.get(firstContactId) : undefined;
        const contactName = contact ? contactDisplayName(contact) : 'a contact';

        suggestions.push({
          skillKey: 'copilot-objection',
          skillName: 'Handle Objection',
          reason: `Objection from ${contactName}: ${objection.summary}. Get a response framework`,
          urgency: 'high',
          entityId: objection.deal_id,
          entityType: 'deal',
          entityName: dealMap.get(objection.deal_id)?.name,
        });

        break;
      }

      // --- MEDIUM: Decaying contacts → "Re-Engage Contact" ---
      for (const cm of decayingContacts) {
        const contact = contactMap.get(cm.contact_id);
        const name = contact ? contactDisplayName(contact) : 'A contact';
        const strengthPct = Math.round(cm.relationship_strength * 100);

        suggestions.push({
          skillKey: 'deal-reengagement-intervention',
          skillName: 'Re-Engage Contact',
          reason: `${name} relationship dropping (${strengthPct}%). Re-engage before they go cold`,
          urgency: 'medium',
          entityId: cm.contact_id,
          entityType: 'contact',
          entityName: name,
        });

        break;
      }

      // --- MEDIUM: Stale deals (no recent meeting in 14+ days) → "Next Best Actions" ---
      for (const deal of activeDeals) {
        // Skip if the deal has a recent meeting
        if (meetingsByDeal.has(deal.id)) continue;
        // Skip if it's a new deal (no events) — that gets its own suggestion
        if (!dealsWithEvents.has(deal.id)) continue;

        // Find how many days since the deal's last activity
        // We don't have the exact last meeting date from the 14-day window query,
        // so we just know it's been >14 days
        suggestions.push({
          skillKey: 'deal-next-best-actions',
          skillName: 'Next Best Actions',
          reason: `${deal.name} has no activity in 14+ days. Get recommended next steps`,
          urgency: 'medium',
          entityId: deal.id,
          entityType: 'deal',
          entityName: deal.name,
        });

        break;
      }

      // --- LOW: New deals (no events at all) → "Build Deal Map" ---
      for (const deal of activeDeals) {
        if (dealsWithEvents.has(deal.id)) continue;

        suggestions.push({
          skillKey: 'deal-map-builder',
          skillName: 'Build Deal Map',
          reason: `${deal.name} is new — create a mutual action plan`,
          urgency: 'low',
          entityId: deal.id,
          entityType: 'deal',
          entityName: deal.name,
        });

        break;
      }

      // ---------------------------------------------------------------
      // 7. Sort by urgency (high first) and cap at 3
      // ---------------------------------------------------------------
      suggestions.sort(
        (a, b) => (URGENCY_ORDER[a.urgency] ?? 2) - (URGENCY_ORDER[b.urgency] ?? 2)
      );

      return suggestions.slice(0, 3);
    },
    enabled: !!activeOrgId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
