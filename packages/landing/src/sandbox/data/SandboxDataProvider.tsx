/**
 * SandboxDataProvider
 *
 * React context that provides the complete sandbox dataset to all sandbox components.
 * Can be initialized with default mock data or personalized data from research.
 */

import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import type { SandboxData, SandboxView } from './sandboxTypes';
import { getDefaultSandboxData } from './defaultMockData';

/** Total number of sandbox views in the guided flow */
export const TOTAL_VIEWS = 8;

/** Guided flow order: dashboard → pipeline → meetings → relationships → email → proposals → ops → copilot */
const FLOW_ORDER: SandboxView[] = ['dashboard', 'pipeline', 'meetings', 'relationships', 'email', 'proposals', 'ops', 'copilot'];

interface SandboxContextValue {
  data: SandboxData;
  /** Current active view in the sandbox */
  activeView: SandboxView;
  /** Switch the sandbox view */
  setActiveView: (view: SandboxView) => void;
  /** Whether sandbox has been personalized with real research data */
  isPersonalized: boolean;
  /** Whether deep product research has loaded (phase 2) */
  isDeepResearchReady: boolean;
  /** Visitor info (from /t/{code} or research) */
  visitorName?: string;
  visitorEmail?: string;
  /** Views the user has visited (for guided flow hints) */
  visitedViews: Set<SandboxView>;
  /** Suggested next view to guide the user */
  suggestedNextView: SandboxView | null;
  /** Number of views visited so far */
  visitedCount: number;
  /** Completion percentage (0–100) */
  completionPercentage: number;
}

const SandboxContext = createContext<SandboxContextValue | null>(null);

interface SandboxDataProviderProps {
  children: React.ReactNode;
  /** Override data with personalized research results */
  data?: SandboxData;
  /** Initial view to display */
  initialView?: SandboxView;
  /** Visitor info for personalized greeting */
  visitorName?: string;
  visitorEmail?: string;
  /** Deep research data that arrives async (phase 2 — updates email/copilot) */
  deepResearchData?: Partial<SandboxData> | null;
}

export function SandboxDataProvider({
  children,
  data: customData,
  initialView = 'dashboard',
  visitorName,
  visitorEmail,
  deepResearchData,
}: SandboxDataProviderProps) {
  const [activeView, setActiveViewRaw] = useState<SandboxView>(initialView);
  const [visitedViews, setVisitedViews] = useState<Set<SandboxView>>(new Set([initialView]));
  const [mergedDeepData, setMergedDeepData] = useState<Partial<SandboxData> | null>(null);

  // When deep research arrives, merge it in
  useEffect(() => {
    if (deepResearchData) {
      setMergedDeepData(deepResearchData);
    }
  }, [deepResearchData]);

  const baseData = useMemo(() => customData ?? getDefaultSandboxData(), [customData]);

  // Merge deep research into base data (only overrides emailDraft + meetings for now)
  const data = useMemo(() => {
    if (!mergedDeepData) return baseData;
    return {
      ...baseData,
      ...(mergedDeepData.emailDraft ? { emailDraft: mergedDeepData.emailDraft } : {}),
      ...(mergedDeepData.meetings ? { meetings: mergedDeepData.meetings } : {}),
    };
  }, [baseData, mergedDeepData]);

  const isPersonalized = !!customData;
  const isDeepResearchReady = !!mergedDeepData;

  const suggestedNextView = useMemo(() => {
    for (const view of FLOW_ORDER) {
      if (!visitedViews.has(view)) return view;
    }
    return null;
  }, [visitedViews]);

  const handleSetActiveView = useCallback((view: SandboxView) => {
    setActiveViewRaw(view);
    setVisitedViews(prev => {
      const next = new Set(prev);
      next.add(view);
      return next;
    });
  }, []);

  const visitedCount = visitedViews.size;
  const completionPercentage = Math.round((visitedCount / TOTAL_VIEWS) * 100);

  const value = useMemo<SandboxContextValue>(
    () => ({
      data,
      activeView: activeView,
      setActiveView: handleSetActiveView,
      isPersonalized,
      isDeepResearchReady,
      visitorName,
      visitorEmail,
      visitedViews,
      suggestedNextView,
      visitedCount,
      completionPercentage,
    }),
    [data, activeView, handleSetActiveView, isPersonalized, isDeepResearchReady, visitorName, visitorEmail, visitedViews, suggestedNextView, visitedCount, completionPercentage]
  );

  return (
    <SandboxContext.Provider value={value}>
      {children}
    </SandboxContext.Provider>
  );
}

export function useSandboxData(): SandboxContextValue {
  const context = useContext(SandboxContext);
  if (!context) {
    throw new Error('useSandboxData must be used within a SandboxDataProvider');
  }
  return context;
}
