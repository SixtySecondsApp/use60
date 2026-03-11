/**
 * useContextualQuestions — Contextual Learning Moments
 *
 * Monitors the current page context and user actions to surface
 * relevant config questions from `agent_config_questions` at the
 * right moment. Questions appear as non-blocking toasts, max 1 at
 * a time, with a 30-minute cooldown between prompts.
 *
 * Trigger rules map page navigation patterns to trigger_event values
 * stored in the question templates. When a match fires and the
 * question hasn't been answered yet, it is surfaced.
 */

import { useMemo, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrg } from '@/lib/contexts/OrgContext';
import { supabase } from '@/lib/supabase/clientV2';
import type { ConfigQuestion } from '@/lib/services/configQuestionService';

// ============================================================================
// Constants
// ============================================================================

const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
const SNOOZE_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_KEY = 'sixty_contextual_q_last_shown';
const SNOOZE_KEY = 'sixty_contextual_q_snoozed';
const VISITED_KEY = 'sixty_visited_features';

// ============================================================================
// Trigger rules — maps page patterns to trigger_event values
// ============================================================================

interface TriggerRule {
  /** Regex or prefix to test against location.pathname */
  pathMatch: RegExp;
  /** The trigger_event value stored on agent_config_questions rows */
  triggerEvent: string;
  /** Optional: only fire on first visit to this path family */
  firstVisitOnly?: boolean;
}

const TRIGGER_RULES: TriggerRule[] = [
  // After navigating to a deal page (could be a won deal)
  {
    pathMatch: /^\/pipeline/,
    triggerEvent: 'morning_briefing_delivered',
    firstVisitOnly: true,
  },
  // After viewing a meeting detail page — follow-up timing questions
  {
    pathMatch: /^\/meetings\/.+/,
    triggerEvent: 'meeting_processed',
  },
  // After viewing pipeline overview — stage progression questions
  {
    pathMatch: /^\/pipeline$/,
    triggerEvent: 'morning_briefing_delivered',
  },
  // After visiting the CRM / Ops section for the first time
  {
    pathMatch: /^\/ops/,
    triggerEvent: 'crm_update_approved',
    firstVisitOnly: true,
  },
  // After visiting insights / analytics
  {
    pathMatch: /^\/insights/,
    triggerEvent: 'coaching_digest_generated',
    firstVisitOnly: true,
  },
  // After visiting settings
  {
    pathMatch: /^\/settings/,
    triggerEvent: 'morning_briefing_delivered',
    firstVisitOnly: true,
  },
  // After visiting integrations
  {
    pathMatch: /^\/integrations/,
    triggerEvent: 'risk_alert_fired',
    firstVisitOnly: true,
  },
  // After viewing a contact or company detail
  {
    pathMatch: /^\/contacts\/.+|^\/companies\/.+/,
    triggerEvent: 'meeting_processed',
    firstVisitOnly: true,
  },
];

// ============================================================================
// Helpers
// ============================================================================

function getCooldownTimestamp(): number {
  try {
    const val = sessionStorage.getItem(SESSION_KEY);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

function setCooldownTimestamp(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable — silently continue
  }
}

function isSnoozed(questionId: string): boolean {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return false;
    const map: Record<string, number> = JSON.parse(raw);
    const snoozedUntil = map[questionId];
    if (!snoozedUntil) return false;
    return Date.now() < snoozedUntil;
  } catch {
    return false;
  }
}

export function snoozeQuestion(questionId: string): void {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    map[questionId] = Date.now() + SNOOZE_MS;
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(map));
  } catch {
    // silently continue
  }
}

function getVisitedFeatures(): Set<string> {
  try {
    const raw = sessionStorage.getItem(VISITED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markFeatureVisited(featureKey: string): void {
  try {
    const visited = getVisitedFeatures();
    visited.add(featureKey);
    sessionStorage.setItem(VISITED_KEY, JSON.stringify(Array.from(visited)));
  } catch {
    // silently continue
  }
}

// ============================================================================
// Row mapper (mirrors configQuestionService)
// ============================================================================

function mapRow(row: Record<string, unknown>): ConfigQuestion {
  return {
    id: row.id as string,
    org_id: row.org_id as string,
    user_id: (row.user_id as string) ?? null,
    template_id: (row.template_id as string) ?? null,
    config_key: row.config_key as string,
    category: row.category as ConfigQuestion['category'],
    question: row.question_text as string,
    question_text: row.question_text as string,
    scope: row.scope as 'org' | 'user',
    options: row.options as ConfigQuestion['options'],
    priority: row.priority as number,
    status: row.status as ConfigQuestion['status'],
    answer_value: row.answer_value ?? null,
    answered_at: (row.answered_at as string) ?? null,
    created_at: row.created_at as string,
  };
}

// ============================================================================
// Types for auto-detected suggestions
// ============================================================================

export interface AutoDetectedSuggestion {
  questionId: string;
  question: ConfigQuestion;
  detectedValue: unknown;
  description: string;
  confidence: number;
}

// ============================================================================
// Hook
// ============================================================================

export interface ContextualQuestionResult {
  /** The question to show, or null if none should be surfaced */
  currentQuestion: ConfigQuestion | null;
  /** If non-null, this question comes with a pre-detected suggestion */
  autoSuggestion: AutoDetectedSuggestion | null;
  /** Call after the user answers or dismisses, to start the cooldown */
  markShown: () => void;
  /** Call when user clicks "Remind me later" */
  snooze: (questionId: string) => void;
}

export function useContextualQuestions(
  autoSuggestions: AutoDetectedSuggestion[] = []
): ContextualQuestionResult {
  const { user } = useAuth();
  const { activeOrgId } = useOrg();
  const location = useLocation();
  const matchedTriggerRef = useRef<string | null>(null);

  // -------------------------------------------------------------------
  // Determine which trigger_event matches the current page
  // -------------------------------------------------------------------
  const activeTriggerEvent = useMemo(() => {
    const visited = getVisitedFeatures();

    for (const rule of TRIGGER_RULES) {
      if (!rule.pathMatch.test(location.pathname)) continue;

      const featureKey = rule.triggerEvent + ':' + rule.pathMatch.source;

      if (rule.firstVisitOnly && visited.has(featureKey)) continue;

      // Mark visited
      markFeatureVisited(featureKey);

      return rule.triggerEvent;
    }
    return null;
  }, [location.pathname]);

  // Store the latest matched trigger so we keep it stable across renders
  useEffect(() => {
    if (activeTriggerEvent) {
      matchedTriggerRef.current = activeTriggerEvent;
    }
  }, [activeTriggerEvent]);

  const triggerToQuery = activeTriggerEvent ?? matchedTriggerRef.current;

  // -------------------------------------------------------------------
  // Fetch the best matching pending question for this trigger
  // -------------------------------------------------------------------
  const { data: matchingQuestion } = useQuery<ConfigQuestion | null>({
    queryKey: [
      'contextual-question',
      activeOrgId,
      user?.id,
      triggerToQuery,
    ],
    queryFn: async () => {
      if (!activeOrgId || !triggerToQuery) return null;

      let query = supabase
        .from('agent_config_questions')
        .select(
          'id, org_id, user_id, template_id, config_key, question_text, category, scope, options, priority, status, answer_value, answered_at, created_at'
        )
        .eq('org_id', activeOrgId)
        .eq('status', 'pending')
        .eq('trigger_event', triggerToQuery)
        .order('priority', { ascending: true })
        .limit(5);

      if (user?.id) {
        query = query.or(`user_id.eq.${user.id},user_id.is.null`);
      } else {
        query = query.is('user_id', null);
      }

      const { data, error } = await query;
      if (error || !data || data.length === 0) return null;

      // Find the first question that isn't snoozed
      for (const row of data) {
        const q = mapRow(row as Record<string, unknown>);
        if (!isSnoozed(q.id)) {
          return q;
        }
      }

      return null;
    },
    enabled: !!activeOrgId && !!triggerToQuery,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // -------------------------------------------------------------------
  // Determine the current question, applying cooldown logic
  // -------------------------------------------------------------------
  const isOnCooldown = Date.now() - getCooldownTimestamp() < COOLDOWN_MS;

  // Auto-detected suggestions take priority
  const topSuggestion = autoSuggestions.length > 0 ? autoSuggestions[0] : null;

  const currentQuestion = useMemo(() => {
    if (isOnCooldown) return null;

    // Auto-detected suggestions surface first (higher priority)
    if (topSuggestion && !isSnoozed(topSuggestion.questionId)) {
      return topSuggestion.question;
    }

    return matchingQuestion ?? null;
  }, [isOnCooldown, topSuggestion, matchingQuestion]);

  const autoSuggestion = useMemo(() => {
    if (isOnCooldown) return null;
    if (topSuggestion && currentQuestion?.id === topSuggestion.questionId) {
      return topSuggestion;
    }
    return null;
  }, [isOnCooldown, topSuggestion, currentQuestion]);

  // -------------------------------------------------------------------
  // Callbacks
  // -------------------------------------------------------------------
  const markShown = useCallback(() => {
    setCooldownTimestamp();
  }, []);

  const snooze = useCallback((questionId: string) => {
    snoozeQuestion(questionId);
    setCooldownTimestamp();
  }, []);

  return {
    currentQuestion,
    autoSuggestion,
    markShown,
    snooze,
  };
}

export default useContextualQuestions;
