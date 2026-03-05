/**
 * SandboxDataProvider
 *
 * React context that provides the complete sandbox dataset to all sandbox components.
 * Can be initialized with default mock data or personalized data from research.
 */

import { createContext, useContext, useMemo, useState, useCallback } from 'react';
import type { SandboxData, SandboxView } from './sandboxTypes';
import { getDefaultSandboxData } from './defaultMockData';

/** Total number of sandbox views in the guided flow */
export const TOTAL_VIEWS = 5;

/** Guided flow order: dashboard → pipeline → meetings → email → copilot */
const FLOW_ORDER: SandboxView[] = ['dashboard', 'pipeline', 'meetings', 'email', 'copilot'];

interface SandboxContextValue {
  data: SandboxData;
  /** Current active view in the sandbox */
  activeView: SandboxView;
  /** Switch the sandbox view */
  setActiveView: (view: SandboxView) => void;
  /** Whether sandbox has been personalized with real research data */
  isPersonalized: boolean;
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
}

export function SandboxDataProvider({
  children,
  data: customData,
  initialView = 'dashboard',
  visitorName,
  visitorEmail,
}: SandboxDataProviderProps) {
  const [activeView, setActiveViewRaw] = useState<SandboxView>(initialView);
  const [visitedViews, setVisitedViews] = useState<Set<SandboxView>>(new Set([initialView]));

  const data = useMemo(() => customData ?? getDefaultSandboxData(), [customData]);

  const isPersonalized = !!customData;

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
      visitorName,
      visitorEmail,
      visitedViews,
      suggestedNextView,
      visitedCount,
      completionPercentage,
    }),
    [data, activeView, handleSetActiveView, isPersonalized, visitorName, visitorEmail, visitedViews, suggestedNextView, visitedCount, completionPercentage]
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
