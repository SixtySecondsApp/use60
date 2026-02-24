/**
 * useDealCopilotChat Hook
 *
 * Dedicated copilot chat scoped to a single deal inside the DealIntelligenceSheet.
 * Wraps useCopilotChat with:
 *   - Instant synthetic greeting (no API round-trip)
 *   - Hidden deal context injection on first user message
 *   - Background enrichment (meetings + activities)
 *   - Ephemeral session (no persistence)
 */

import { useCallback, useRef, useEffect } from 'react';
import { useCopilotChat, type ChatMessage } from '@/lib/hooks/useCopilotChat';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { supabase } from '@/lib/supabase/clientV2';
import type { PipelineDeal } from './usePipelineData';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function buildDealContextBlock(
  deal: PipelineDeal,
  enrichment: EnrichmentData | null,
): string {
  const parts: string[] = [];
  parts.push('[DEAL_CONTEXT]');
  parts.push(`Deal: ${deal.name}`);
  parts.push(`Company: ${deal.company || 'Unknown'}`);
  parts.push(`Value: ${formatCurrency(deal.value)}`);
  parts.push(`Stage: ${deal.stage_name || 'Unknown'}`);
  if (deal.close_date) parts.push(`Expected close: ${deal.close_date}`);

  if (deal.health_score !== null) {
    parts.push(`Deal Health: ${deal.health_score}/100 (${deal.health_status || 'unknown'})`);
  }
  if (deal.relationship_health_score !== null) {
    parts.push(`Relationship Health: ${deal.relationship_health_score}/100 (${deal.relationship_health_status || 'unknown'})`);
  }
  if (deal.ghost_probability !== null && deal.ghost_probability > 0) {
    parts.push(`Ghost Risk: ${deal.ghost_probability}%`);
  }

  const allRiskFactors = [...(deal.risk_factors || []), ...(deal.relationship_risk_factors || [])];
  if (allRiskFactors.length > 0) {
    parts.push(`Risk Signals: ${allRiskFactors.join(', ')}`);
  }
  if (deal.days_in_current_stage !== null) {
    parts.push(`Days in current stage: ${deal.days_in_current_stage}`);
  }
  if (deal.sentiment_trend) {
    parts.push(`Sentiment trend: ${deal.sentiment_trend}`);
  }
  if (deal.predicted_close_probability !== null) {
    parts.push(`Predicted win probability: ${deal.predicted_close_probability}%`);
  }

  // Enrichment data
  if (enrichment) {
    if (enrichment.meetings.length > 0) {
      parts.push('');
      parts.push(`Recent Meetings (${enrichment.meetings.length}):`);
      for (const m of enrichment.meetings) {
        const date = m.start_time
          ? new Date(m.start_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          : '';
        const summary = m.summary_oneliner ? ` — ${m.summary_oneliner}` : '';
        parts.push(`  - ${date}: ${m.title || 'Untitled'}${summary}`);
      }
    }

    if (enrichment.activities.length > 0) {
      parts.push('');
      parts.push(`Recent Activity (${enrichment.activities.length}):`);
      for (const a of enrichment.activities) {
        const date = a.created_at
          ? new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          : '';
        const subject = a.subject || (a.notes as string)?.slice(0, 60) || a.type;
        parts.push(`  - ${date}: [${a.type}] ${subject}`);
      }
    }
  }

  parts.push('[/DEAL_CONTEXT]');
  return parts.join('\n');
}

const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MeetingRow {
  title: string | null;
  start_time: string | null;
  summary_oneliner: string | null;
}

interface ActivityRow {
  type: string;
  subject: string | null;
  created_at: string | null;
  notes: unknown;
}

interface EnrichmentData {
  meetings: MeetingRow[];
  activities: ActivityRow[];
}

export interface UseDealCopilotChatReturn {
  /** Activate the deal chat — shows instant greeting */
  activate: () => void;
  /** Send a user message (context is injected automatically) */
  sendMessage: (text: string) => void;
  /** All messages in the conversation */
  messages: ChatMessage[];
  /** Whether the copilot is streaming / thinking */
  isLoading: boolean;
  /** Stop current generation */
  stopGeneration: () => void;
  /** Reset chat state */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDealCopilotChat(deal: PipelineDeal | null): UseDealCopilotChatReturn {
  const { userId } = useAuth();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  const enrichmentRef = useRef<EnrichmentData | null>(null);
  const hasInjectedContextRef = useRef(false);
  const activeDealIdRef = useRef<string | null>(null);

  const chat = useCopilotChat({
    organizationId: activeOrgId || '',
    userId: userId || '',
    persistSession: false,
    initialContext: {
      currentView: 'pipeline',
      dealIds: deal ? [deal.id] : [],
    },
  });

  // -----------------------------------------------------------------------
  // Background enrichment — fetch meetings + activities when deal changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!deal) {
      enrichmentRef.current = null;
      return;
    }

    // Skip if we already enriched this deal
    if (activeDealIdRef.current === deal.id && enrichmentRef.current) return;
    activeDealIdRef.current = deal.id;

    let cancelled = false;

    async function fetchEnrichment() {
      if (!deal) return;
      try {
        const [meetingsRes, activitiesRes] = await Promise.all([
          supabase
            .from('meetings')
            .select('title, start_time, summary_oneliner')
            .or(
              `deal_id.eq.${deal.id}${deal.primary_contact_id ? `,contact_id.eq.${deal.primary_contact_id}` : ''}`,
            )
            .order('start_time', { ascending: false })
            .limit(5),
          supabase
            .from('activities')
            .select('type, subject, created_at, notes')
            .eq('deal_id', deal.id)
            .order('created_at', { ascending: false })
            .limit(8),
        ]);

        if (cancelled) return;

        enrichmentRef.current = {
          meetings: (meetingsRes.data || []) as MeetingRow[],
          activities: (activitiesRes.data || []) as ActivityRow[],
        };
      } catch {
        // Non-blocking — context will still work without enrichment
      }
    }

    fetchEnrichment();
    return () => { cancelled = true; };
  }, [deal]);

  // -----------------------------------------------------------------------
  // Reset context-injected flag when messages are cleared
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (chat.messages.length === 0) {
      hasInjectedContextRef.current = false;
    }
  }, [chat.messages.length]);

  // -----------------------------------------------------------------------
  // activate() — inject instant greeting, no API call
  // -----------------------------------------------------------------------
  const activate = useCallback(() => {
    if (!deal) return;

    // Reset previous state
    chat.clearMessages();
    hasInjectedContextRef.current = false;

    const companyName = deal.company || deal.name;
    let greeting = `I've loaded the **${companyName}** deal context.`;

    // Add a quick status line based on health
    if (deal.health_score !== null) {
      const status = deal.health_status || 'unknown';
      greeting += ` Health is **${deal.health_score}/100** (${status}).`;
    }
    if (deal.ghost_probability !== null && deal.ghost_probability > 30) {
      greeting += ` Ghost risk is elevated at **${deal.ghost_probability}%**.`;
    }

    greeting += '\n\nWhat would you like to know? I can help with risk analysis, next steps, relationship health, or anything else about this deal.';

    const greetingMsg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: greeting,
      timestamp: new Date(),
    };

    chat.injectMessages([greetingMsg]);
  }, [deal, chat]);

  // -----------------------------------------------------------------------
  // sendMessage() — inject user bubble + send enriched message silently
  // -----------------------------------------------------------------------
  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || !deal) return;

      // Inject the visible user message
      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: text,
        timestamp: new Date(),
      };
      chat.injectMessages([userMsg]);

      // Build the actual API message — prepend deal context on first message
      let apiMessage = text;
      if (!hasInjectedContextRef.current) {
        const contextBlock = buildDealContextBlock(deal, enrichmentRef.current);
        apiMessage = `${contextBlock}\n\n${text}`;
        hasInjectedContextRef.current = true;
      }

      // Send silently — no duplicate user bubble
      chat.sendMessage(apiMessage, { silent: true });
    },
    [deal, chat],
  );

  // -----------------------------------------------------------------------
  // reset()
  // -----------------------------------------------------------------------
  const reset = useCallback(() => {
    chat.clearMessages();
    hasInjectedContextRef.current = false;
  }, [chat]);

  return {
    activate,
    sendMessage,
    messages: chat.messages,
    isLoading: chat.isThinking || chat.isStreaming,
    stopGeneration: chat.stopGeneration,
    reset,
  };
}
