/**
 * useSandboxTracking
 *
 * Tracks visitor interactions within the sandbox for engagement scoring.
 * Sends periodic batches to the campaign_visitors table.
 *
 * LDI-001: Weighted engagement scoring model
 * LDI-003: Feature interest tracking (time per panel)
 */

import { useEffect, useRef, useCallback } from 'react';
import type { SandboxView } from '../data/sandboxTypes';

// ---------------------------------------------------------------------------
// LDI-001 — Weighted event model
// ---------------------------------------------------------------------------

const EVENT_WEIGHTS = {
  page_visit: 1,
  scroll_50: 2,
  demo_step: 5,
  url_input: 10,
  panel_view: 3,
  signup_start: 15,
  signup_complete: 25,
  return_visit: 10,
} as const;

type EventType = keyof typeof EVENT_WEIGHTS;
type EngagementTier = 'low' | 'medium' | 'high' | 'hot';

interface TrackingEvent {
  type: EventType;
  timestamp: number;
  view?: string;
}

// ---------------------------------------------------------------------------
// LDI-003 — Feature interest mapping
// ---------------------------------------------------------------------------

const FEATURE_NAMES: Record<string, string> = {
  dashboard: 'KPI Dashboard',
  pipeline: 'Deal Pipeline',
  meetings: 'Meeting Prep',
  email: 'Email Drafts',
  copilot: 'AI Copilot',
};

interface FeatureInterest {
  panel: string;
  label: string;
  time_ms: number;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface TrackingState {
  sessionId: string;
  campaignLinkId?: string;
  startTime: number;
  viewsNavigated: Set<string>;
  events: TrackingEvent[];
  lastFlush: number;
  // LDI-003: time tracking per view
  viewTimeMap: Record<string, number>; // view -> ms spent
  currentViewStart: number;
  currentView: string | null;
}

const FLUSH_INTERVAL_MS = 10000; // Send tracking data every 10s
const STORAGE_KEY = 'sbx_prev_session';

function generateSessionId(): string {
  return `sbx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Tier helper (exported for external use too)
// ---------------------------------------------------------------------------

export function getEngagementTier(score: number): EngagementTier {
  if (score >= 51) return 'hot';
  if (score >= 31) return 'high';
  if (score >= 11) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseSandboxTrackingOptions {
  /** Campaign link ID if from /t/{code} */
  campaignLinkId?: string;
  /** Whether tracking is enabled */
  enabled?: boolean;
}

export function useSandboxTracking(options: UseSandboxTrackingOptions = {}) {
  const { campaignLinkId, enabled = true } = options;

  const stateRef = useRef<TrackingState>({
    sessionId: generateSessionId(),
    campaignLinkId,
    startTime: Date.now(),
    viewsNavigated: new Set<string>(),
    events: [],
    lastFlush: Date.now(),
    viewTimeMap: {},
    currentViewStart: Date.now(),
    currentView: null,
  });

  // --------------------------------------------------
  // LDI-001: Return visit detection on mount
  // --------------------------------------------------
  useEffect(() => {
    if (!enabled) return;
    try {
      const prev = localStorage.getItem(STORAGE_KEY);
      if (prev) {
        stateRef.current.events.push({
          type: 'return_visit',
          timestamp: Date.now(),
        });
      }
    } catch {
      // localStorage unavailable — ignore
    }
    // Add initial page_visit event
    stateRef.current.events.push({
      type: 'page_visit',
      timestamp: Date.now(),
    });
  }, [enabled]);

  // --------------------------------------------------
  // LDI-003: Finalize time on current view
  // --------------------------------------------------
  const finalizeCurrentViewTime = useCallback(() => {
    const state = stateRef.current;
    if (state.currentView) {
      const elapsed = Date.now() - state.currentViewStart;
      state.viewTimeMap[state.currentView] =
        (state.viewTimeMap[state.currentView] || 0) + elapsed;
    }
  }, []);

  // --------------------------------------------------
  // LDI-003: Get top 2 feature interests
  // --------------------------------------------------
  const getFeatureInterests = useCallback((): FeatureInterest[] => {
    // Finalize current view time before computing
    finalizeCurrentViewTime();
    // Re-set start so we don't double-count
    stateRef.current.currentViewStart = Date.now();

    const map = stateRef.current.viewTimeMap;
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([panel, time_ms]) => ({
        panel,
        label: FEATURE_NAMES[panel] || panel,
        time_ms,
      }));
  }, [finalizeCurrentViewTime]);

  // --------------------------------------------------
  // LDI-001: Track a weighted event
  // --------------------------------------------------
  const trackEvent = useCallback((type: EventType, view?: string) => {
    stateRef.current.events.push({
      type,
      timestamp: Date.now(),
      view,
    });
  }, []);

  // --------------------------------------------------
  // LDI-001: Weighted engagement score (0-100, capped)
  // (Placed before trackViewChange/trackCtaClick which reference it)
  // --------------------------------------------------
  const getEngagementScore = useCallback(() => {
    const events = stateRef.current.events;
    let raw = 0;
    for (const ev of events) {
      raw += EVENT_WEIGHTS[ev.type];
    }
    return Math.min(100, raw);
  }, []);

  // --------------------------------------------------
  // Track view navigation (backward-compatible + LDI-003 time tracking)
  // --------------------------------------------------
  const trackViewChange = useCallback(
    (view: SandboxView) => {
      const state = stateRef.current;

      // LDI-003: Record time on previous view
      const timeInPreviousView = state.currentView
        ? Date.now() - state.currentViewStart
        : 0;
      finalizeCurrentViewTime();

      // Update current view
      state.currentView = view;
      state.currentViewStart = Date.now();

      // Existing behavior
      state.viewsNavigated.add(view);

      // LDI-001: Add panel_view event
      state.events.push({
        type: 'panel_view',
        timestamp: Date.now(),
        view,
      });

      // FNL-008: Dispatch sandbox_view_enter CustomEvent
      const score = getEngagementScore();
      window.dispatchEvent(
        new CustomEvent('sandbox_view_enter', {
          detail: {
            view,
            timeInPreviousView,
            viewsVisitedSoFar: state.viewsNavigated.size,
            engagementScore: score,
          },
        }),
      );
    },
    [finalizeCurrentViewTime, getEngagementScore],
  );

  // --------------------------------------------------
  // Track generic interaction (backward-compatible)
  // Adds a panel_view event to keep weight-based scoring
  // --------------------------------------------------
  const trackInteraction = useCallback(() => {
    stateRef.current.events.push({
      type: 'panel_view',
      timestamp: Date.now(),
      view: stateRef.current.currentView || undefined,
    });
  }, []);

  // --------------------------------------------------
  // FNL-008: Track CTA click with engagement context
  // --------------------------------------------------
  const trackCtaClick = useCallback(
    (view: string) => {
      const state = stateRef.current;
      const score = getEngagementScore();
      const timeInSandbox = Date.now() - state.startTime;

      window.dispatchEvent(
        new CustomEvent('sandbox_cta_click', {
          detail: {
            view,
            engagementScore: score,
            timeInSandbox,
          },
        }),
      );
    },
    [getEngagementScore],
  );

  // --------------------------------------------------
  // Flush tracking data to backend
  // --------------------------------------------------
  const flush = useCallback(async () => {
    if (!enabled) return;

    const state = stateRef.current;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

    if (!supabaseUrl || !anonKey) return;

    const timeSpent = Math.floor((Date.now() - state.startTime) / 1000);
    const score = getEngagementScore();
    const featureInterests = getFeatureInterests();

    const payload = {
      session_id: state.sessionId,
      campaign_link_id: state.campaignLinkId || null,
      sandbox_interactions: state.events.length,
      time_spent_seconds: timeSpent,
      views_navigated: Array.from(state.viewsNavigated),
      engagement_score: score,
      feature_interests: featureInterests,
      event_log: state.events.slice(-50), // Last 50 events
    };

    try {
      // If we have a campaign link, upsert to campaign_visitors
      if (state.campaignLinkId) {
        await fetch(`${supabaseUrl}/rest/v1/campaign_visitors`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify(payload),
        });
      }

      // Also fire a custom event for the page view tracker
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('sandbox-engagement', { detail: payload }),
        );
      }

      // LDI-001: Persist session to localStorage for return visit detection
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            sessionId: state.sessionId,
            score,
            timestamp: Date.now(),
          }),
        );
      } catch {
        // localStorage unavailable — ignore
      }
    } catch {
      // Silent fail — tracking is non-critical
    }

    state.lastFlush = Date.now();
  }, [enabled, getEngagementScore, getFeatureInterests]);

  // --------------------------------------------------
  // Periodic flush + lifecycle handlers
  // --------------------------------------------------
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(flush, FLUSH_INTERVAL_MS);

    // Flush on page visibility change (user leaving)
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Flush on unload
    function handleBeforeUnload() {
      flush();
    }
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flush(); // Final flush on unmount
    };
  }, [enabled, flush]);

  return {
    trackViewChange,
    trackInteraction,
    trackEvent,
    trackCtaClick,
    getEngagementScore,
    getEngagementTier: useCallback(() => getEngagementTier(getEngagementScore()), [getEngagementScore]),
    getFeatureInterests,
    sessionId: stateRef.current.sessionId,
    /** Elapsed ms since sandbox session started */
    getElapsedMs: useCallback(() => Date.now() - stateRef.current.startTime, []),
    /** Number of unique views visited */
    getViewCount: useCallback(() => stateRef.current.viewsNavigated.size, []),
  };
}
