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

import { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { useCopilotChat, type ChatMessage } from '@/lib/hooks/useCopilotChat';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { supabase } from '@/lib/supabase/clientV2';
import { CopilotSessionService } from '@/lib/services/copilotSessionService';
import { askMeeting } from '@/lib/services/meetingAnalyticsService';
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
  parts.push(`Deal ID: ${deal.id}`);
  parts.push(`Deal: ${deal.name}`);
  parts.push(`Company: ${deal.company || 'Unknown'}`);
  parts.push(`Value: ${formatCurrency(deal.value)}`);
  parts.push(`Stage: ${deal.stage_name || 'Unknown'}`);
  if (deal.close_date) parts.push(`Expected close: ${deal.close_date}`);
  if (deal.primary_contact_id) parts.push(`Primary Contact ID: ${deal.primary_contact_id}`);
  if (deal.contact_name) parts.push(`Contact Name: ${deal.contact_name}`);
  if (deal.contact_email) parts.push(`Contact Email: ${deal.contact_email}`);

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

    if (enrichment.overdueTasks && enrichment.overdueTasks.length > 0) {
      parts.push('');
      parts.push(`Overdue Tasks (${enrichment.overdueTasks.length}):`);
      for (const t of enrichment.overdueTasks) {
        parts.push(`  - ${t.title} (due: ${t.due_date}${t.priority ? `, ${t.priority}` : ''})`);
      }
    }

    if (enrichment.temperature) {
      const pct = Math.round(enrichment.temperature.temperature * 100);
      parts.push(`Signal Temperature: ${pct}%${enrichment.temperature.trend ? ` (${enrichment.temperature.trend})` : ''}`);
    }

    if (enrichment.emailSignals && enrichment.emailSignals.length > 0) {
      parts.push('');
      parts.push(`Recent Email Signals (${enrichment.emailSignals.length}):`);
      for (const s of enrichment.emailSignals) {
        const date = s.created_at
          ? new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          : '';
        parts.push(`  - ${date}: ${s.signal_type.replace(/_/g, ' ')} (confidence: ${Math.round(s.confidence * 100)}%)`);
      }
    }

    if (enrichment.meetingIntelligence) {
      parts.push('');
      parts.push(`Meeting Intelligence: ${enrichment.meetingIntelligence}`);
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

interface OverdueTaskRow {
  title: string;
  due_date: string;
  priority: string | null;
}

interface TemperatureRow {
  temperature: number;
  trend: string | null;
}

interface EmailSignalRow {
  signal_type: string;
  context: unknown;
  confidence: number;
  created_at: string;
}

interface EnrichmentData {
  meetings: MeetingRow[];
  activities: ActivityRow[];
  meetingIntelligence?: string | null;
  overdueTasks?: OverdueTaskRow[];
  temperature?: TemperatureRow | null;
  emailSignals?: EmailSignalRow[];
}

export interface DealSuggestion {
  label: string;
  prompt: string;
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
  /** Whether the session is loading from persistence */
  isLoadingSession: boolean;
  /** Stop current generation */
  stopGeneration: () => void;
  /** Reset chat state */
  reset: () => void;
  /** Context-aware suggested actions */
  suggestions: DealSuggestion[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDealCopilotChat(deal: PipelineDeal | null): UseDealCopilotChatReturn {
  const { userId } = useAuth();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  const [enrichment, setEnrichment] = useState<EnrichmentData | null>(null);
  const [enrichmentReady, setEnrichmentReady] = useState(false);
  const hasInjectedContextRef = useRef(false);
  const activeDealIdRef = useRef<string | null>(null);
  // Track whether activate() was called so we can re-inject greeting when enrichment arrives
  const pendingGreetingRef = useRef(false);
  const sessionServiceRef = useRef(new CopilotSessionService(supabase));

  const chat = useCopilotChat({
    organizationId: activeOrgId || '',
    userId: userId || '',
    persistSession: true,
    dealId: deal?.id || undefined,
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
      setEnrichment(null);
      setEnrichmentReady(false);
      return;
    }

    // Skip if we already enriched this deal
    if (activeDealIdRef.current === deal.id && enrichmentReady) return;
    activeDealIdRef.current = deal.id;
    setEnrichmentReady(false);

    let cancelled = false;

    async function fetchEnrichmentData() {
      if (!deal) return;
      try {
        const companyName = deal.company || deal.name;

        // Phase 1: Fetch meeting IDs for this deal (needed to scope RAG search)
        const { data: dealMeetingRows } = await supabase
          .from('meetings')
          .select('id')
          .eq('deal_id', deal.id)
          .limit(50);
        const dealMeetingIds = (dealMeetingRows || []).map((m: { id: string }) => m.id);

        if (cancelled) return;

        // Phase 2: Run all enrichment queries in parallel, scoping RAG by deal meeting IDs
        const [meetingsRes, activitiesRes, overdueRes, tempRes, signalsRes, meetingIntelRes] = await Promise.all([
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
          // Overdue tasks
          supabase
            .from('tasks')
            .select('title, due_date, priority')
            .eq('deal_id', deal.id)
            .eq('completed', false)
            .lt('due_date', new Date().toISOString())
            .order('due_date', { ascending: true })
            .limit(3),
          // Deal signal temperature
          supabase
            .from('deal_signal_temperature')
            .select('temperature, trend')
            .eq('deal_id', deal.id)
            .maybeSingle(),
          // Email signal events
          supabase
            .from('email_signal_events')
            .select('signal_type, context, confidence, created_at')
            .eq('deal_id', deal.id)
            .order('created_at', { ascending: false })
            .limit(3),
          // Meeting intelligence — scoped to this deal's meetings only
          dealMeetingIds.length > 0
            ? askMeeting({
                question: `What was last discussed with ${companyName}? One sentence.`,
                meetingIds: dealMeetingIds,
                maxMeetings: 3,
              }).catch(() => null)
            : Promise.resolve(null),
        ]);

        if (cancelled) return;

        const data: EnrichmentData = {
          meetings: (meetingsRes.data || []) as MeetingRow[],
          activities: (activitiesRes.data || []) as ActivityRow[],
          overdueTasks: (overdueRes.data || []) as OverdueTaskRow[],
          temperature: tempRes.data as TemperatureRow | null,
          emailSignals: (signalsRes.data || []) as EmailSignalRow[],
          meetingIntelligence: meetingIntelRes?.answer || null,
        };
        setEnrichment(data);
        setEnrichmentReady(true);
      } catch {
        // Non-blocking — mark ready even on failure so greeting isn't stuck
        setEnrichmentReady(true);
      }
    }

    fetchEnrichmentData();
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
  // Build greeting from deal + enrichment
  // -----------------------------------------------------------------------
  const buildGreeting = useCallback(
    (deal: PipelineDeal, enrichData: EnrichmentData | null): string => {
      const companyName = deal.company || deal.name;
      let greeting = `How can I help with the **${companyName}** deal?`;

      // Add a quick status line based on health
      if (deal.health_score !== null) {
        const status = deal.health_status || 'unknown';
        greeting += ` Health is **${deal.health_score}/100** (${status}).`;
      }
      if (deal.ghost_probability !== null && deal.ghost_probability > 30) {
        greeting += ` Ghost risk is elevated at **${deal.ghost_probability}%**.`;
      }

      // Proactive alerts from enrichment
      const alerts: string[] = [];

      if (enrichData?.overdueTasks && enrichData.overdueTasks.length > 0) {
        const count = enrichData.overdueTasks.length;
        alerts.push(`${count} overdue task${count > 1 ? 's' : ''} need${count === 1 ? 's' : ''} attention`);
      }

      if (enrichData?.temperature) {
        const temp = enrichData.temperature;
        const pct = Math.round(temp.temperature * 100);
        if (pct < 30) {
          alerts.push(`Signal temperature is cold (${pct}%)${temp.trend ? ` — ${temp.trend}` : ''}`);
        } else if (temp.trend === 'declining') {
          alerts.push(`Signal temperature is declining (${pct}%)`);
        }
      }

      if (enrichData?.emailSignals && enrichData.emailSignals.length > 0) {
        const top = enrichData.emailSignals[0];
        const signalLabel = (top.signal_type || '').replace(/_/g, ' ');
        alerts.push(`Recent signal: ${signalLabel}`);
      }

      if (alerts.length > 0) {
        greeting += '\n\n';
        for (const alert of alerts) {
          greeting += `- ${alert}\n`;
        }
      }

      // Meeting intelligence one-liner
      if (enrichData?.meetingIntelligence) {
        greeting += `\n*${enrichData.meetingIntelligence}*`;
      }

      return greeting;
    },
    [],
  );

  // -----------------------------------------------------------------------
  // activate() — inject instant greeting, no API call
  // -----------------------------------------------------------------------
  const activate = useCallback(() => {
    if (!deal) return;

    // Always start fresh
    chat.clearMessages();
    hasInjectedContextRef.current = false;

    const greeting = buildGreeting(deal, enrichment);

    const greetingMsg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: greeting,
      timestamp: new Date(),
    };

    chat.injectMessages([greetingMsg]);

    // If enrichment hasn't loaded yet, flag for re-injection when it arrives
    pendingGreetingRef.current = !enrichmentReady;
  }, [deal, chat, enrichment, enrichmentReady, buildGreeting]);

  // -----------------------------------------------------------------------
  // Re-inject greeting when enrichment arrives after activate() was called
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!enrichmentReady || !pendingGreetingRef.current || !deal) return;

    // Enrichment just arrived and we have a pending greeting to upgrade
    pendingGreetingRef.current = false;

    // Only upgrade if the user hasn't sent a message yet (chat is still just the greeting)
    const hasOnlyGreeting = chat.messages.length === 1 && chat.messages[0].role === 'assistant';
    if (!hasOnlyGreeting) return;

    const richGreeting = buildGreeting(deal, enrichment);

    // Replace the bare greeting with the enriched one
    chat.clearMessages();
    chat.injectMessages([{
      id: generateId(),
      role: 'assistant',
      content: richGreeting,
      timestamp: new Date(),
    }]);
  }, [enrichmentReady, deal, enrichment, chat, buildGreeting]);

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

      // Persist the clean user text (not the enriched API message)
      if (chat.conversationId) {
        sessionServiceRef.current.addMessage({
          conversation_id: chat.conversationId,
          role: 'user',
          content: text,
        }).catch(() => {});
      }

      // Build the actual API message — prepend deal context on first message
      let apiMessage = text;
      if (!hasInjectedContextRef.current) {
        const contextBlock = buildDealContextBlock(deal, enrichment);
        apiMessage = `${contextBlock}\n\n${text}`;
        hasInjectedContextRef.current = true;
      }

      // Send silently — no duplicate user bubble, no duplicate persistence
      chat.sendMessage(apiMessage, { silent: true });
    },
    [deal, chat, enrichment],
  );

  // -----------------------------------------------------------------------
  // reset()
  // -----------------------------------------------------------------------
  const reset = useCallback(() => {
    chat.clearMessages();
    hasInjectedContextRef.current = false;
  }, [chat]);

  // -----------------------------------------------------------------------
  // suggestions — context-aware quick actions based on deal state
  // -----------------------------------------------------------------------
  const suggestions = useMemo<DealSuggestion[]>(() => {
    if (!deal) return [];

    const items: DealSuggestion[] = [];

    // Always-useful actions
    items.push({ label: 'Summarize deal', prompt: 'Give me a full summary of this deal' });
    items.push({ label: 'Write follow-up', prompt: 'Draft a follow-up email for this deal' });
    items.push({ label: 'Next best actions', prompt: 'What should I do next to advance this deal?' });

    // Contextual actions based on deal state
    if (deal.ghost_probability !== null && deal.ghost_probability > 30) {
      items.push({ label: 'Re-engage', prompt: 'This deal has gone quiet. Help me re-engage the prospect.' });
    }

    if (deal.health_status === 'critical' || deal.risk_level === 'critical' || deal.risk_level === 'high') {
      items.push({ label: 'Rescue plan', prompt: 'This deal is at risk. Create a rescue plan.' });
    }

    items.push({ label: 'Prep for meeting', prompt: 'Prep me for my next meeting on this deal' });
    items.push({ label: 'Research company', prompt: `Research ${deal.company || deal.name} and give me key insights` });

    // Cap at 5 suggestions
    return items.slice(0, 5);
  }, [deal]);

  return {
    activate,
    sendMessage,
    messages: chat.messages,
    isLoading: chat.isThinking || chat.isStreaming,
    isLoadingSession: chat.isLoadingSession,
    stopGeneration: chat.stopGeneration,
    reset,
    suggestions,
  };
}
