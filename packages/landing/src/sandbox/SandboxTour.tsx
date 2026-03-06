/**
 * SandboxTour
 *
 * Lightweight guided tour overlay that highlights sandbox features
 * with pulsing hotspots and tooltip callouts.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';

interface TourStep {
  id: string;
  title: string;
  description: string;
  /** CSS position for the callout */
  position: { top?: string; bottom?: string; left?: string; right?: string };
  /** Which sidebar nav to highlight */
  highlightView?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'dashboard',
    title: 'Your Command Center',
    description: 'KPIs, upcoming meetings, and activity feed — all personalized to your pipeline.',
    position: { top: '120px', left: '260px' },
    highlightView: 'dashboard',
  },
  {
    id: 'pipeline',
    title: 'Visual Pipeline',
    description: "Your company's deal is in the pipeline. Health scores and risk signals update in real-time.",
    position: { top: '200px', left: '400px' },
    highlightView: 'pipeline',
  },
  {
    id: 'meetings',
    title: 'AI Meeting Prep',
    description: 'Talking points, risk signals, and questions to ask — generated from your deal context.',
    position: { top: '160px', left: '300px' },
    highlightView: 'meetings',
  },
  {
    id: 'email',
    title: 'AI Follow-up Drafts',
    description: 'Personalized emails drafted with full awareness of your deal, ready to send.',
    position: { top: '180px', left: '350px' },
    highlightView: 'email',
  },
  {
    id: 'copilot',
    title: '60 Copilot',
    description: 'Ask anything about your deals, contacts, or meetings. AI with full context.',
    position: { top: '160px', left: '300px' },
    highlightView: 'copilot',
  },
];

interface SandboxTourProps {
  /** Called when user dismisses tour */
  onDismiss: () => void;
  /** Called when user clicks on a step to navigate */
  onNavigate?: (view: string) => void;
  /** Current active view — used to auto-advance tour when user navigates externally */
  activeView?: string;
}

export function SandboxTour({ onDismiss, onNavigate, activeView }: SandboxTourProps) {
  const [step, setStep] = useState(0);
  const current = TOUR_STEPS[step];

  // Auto-advance: if user navigates to a view that matches a later step, jump to it
  useEffect(() => {
    if (!activeView) return;
    const matchIdx = TOUR_STEPS.findIndex((s) => s.highlightView === activeView);
    if (matchIdx !== -1 && matchIdx !== step) {
      setStep(matchIdx);
    }
  }, [activeView]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = useCallback(() => {
    if (step < TOUR_STEPS.length - 1) {
      const nextStep = step + 1;
      setStep(nextStep);
      if (onNavigate && TOUR_STEPS[nextStep].highlightView) {
        onNavigate(TOUR_STEPS[nextStep].highlightView!);
      }
    } else {
      onDismiss();
    }
  }, [step, onDismiss, onNavigate]);

  const prev = useCallback(() => {
    if (step > 0) {
      const prevStep = step - 1;
      setStep(prevStep);
      if (onNavigate && TOUR_STEPS[prevStep].highlightView) {
        onNavigate(TOUR_STEPS[prevStep].highlightView!);
      }
    }
  }, [step, onNavigate]);

  // Navigate to first step's view on mount
  useEffect(() => {
    if (onNavigate && current.highlightView) {
      onNavigate(current.highlightView);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 z-40 pointer-events-auto"
        onClick={onDismiss}
      />

      {/* Tooltip callout */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.95 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="absolute z-50 w-72 pointer-events-auto"
          style={current.position}
        >
          <div className="bg-zinc-900/95 backdrop-blur-md border border-violet-500/20 rounded-xl p-4 shadow-xl shadow-violet-500/10">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-[10px] text-violet-400 font-mono uppercase tracking-wider">
                  {step + 1}/{TOUR_STEPS.length}
                </span>
              </div>
              <button
                onClick={onDismiss}
                className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <h3 className="text-sm font-semibold text-white mb-1">{current.title}</h3>
            <p className="text-xs text-zinc-400 leading-relaxed mb-3">{current.description}</p>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={prev}
                disabled={step === 0}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-3 h-3" />
                Back
              </button>

              <button
                onClick={next}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-500/15 text-xs text-violet-300 hover:bg-violet-500/25 transition-colors"
              >
                {step === TOUR_STEPS.length - 1 ? 'Got it' : 'Next'}
                {step < TOUR_STEPS.length - 1 && <ChevronRight className="w-3 h-3" />}
              </button>
            </div>

            {/* Step dots */}
            <div className="flex items-center justify-center gap-1.5 mt-3">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i === step ? 'bg-violet-400' : i < step ? 'bg-violet-400/40' : 'bg-zinc-700'
                  }`}
                />
              ))}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
