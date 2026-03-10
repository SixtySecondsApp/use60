/**
 * InstantReplayPanel — WOW-008
 *
 * Orchestrates the 4-act walkthrough that demonstrates 60's value
 * using personalized demo data from the user's enrichment.
 *
 * States:
 *   offer       — Offer to run the walkthrough
 *   walkthrough — 4 acts: meeting-detected → prep → post-meeting → payoff
 *   complete    — handled via onComplete callback
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap } from 'lucide-react';
import { useOnboardingV2Store } from '@/lib/stores/onboardingV2Store';
import { getWalkthroughData } from './walkthrough-data';
import { WalkthroughTimeline } from './WalkthroughTimeline';
import { MeetingDetectedScene } from './scenes/MeetingDetectedScene';
import { MeetingPrepScene } from './scenes/MeetingPrepScene';
import { PostMeetingScene } from './scenes/PostMeetingScene';
import { PayoffScene } from './scenes/PayoffScene';

// ── Types ─────────────────────────────────────────────────────────────────────

type PanelState = 'offer' | 'walkthrough' | 'complete';
type WalkthroughAct = 0 | 1 | 2 | 3;

// ── Main component ─────────────────────────────────────────────────────────────

interface InstantReplayPanelProps {
  connectedId: 'fathom' | 'fireflies' | 'sixty';
  onSkip: () => void;
  onComplete: () => void;
}

export function InstantReplayPanel({
  onSkip,
  onComplete,
}: InstantReplayPanelProps) {
  const { enrichment, manualData, completeOnboarding } = useOnboardingV2Store();

  const [panelState, setPanelState] = useState<PanelState>('offer');
  const [currentAct, setCurrentAct] = useState<WalkthroughAct>(0);

  // Build personalized demo data
  const companyName =
    enrichment?.company_name || manualData?.company_name || 'your company';
  const products = enrichment?.products
    ? enrichment.products.map((p) => p.name)
    : manualData?.main_products
    ? [manualData.main_products]
    : [];
  const industry = enrichment?.industry || manualData?.industry || '';
  const userName = 'there';

  const data = getWalkthroughData(companyName, products, industry, userName);

  const handleStart = useCallback(() => {
    setPanelState('walkthrough');
    setCurrentAct(0);
  }, []);

  const advanceAct = useCallback(() => {
    setCurrentAct((prev) => {
      const next = prev + 1;
      if (next > 3) return prev;
      return next as WalkthroughAct;
    });
  }, []);

  const handlePayoffFinish = useCallback(async () => {
    try {
      await completeOnboarding();
    } catch {
      // completeOnboarding shows its own toast
    }
    onComplete();
  }, [completeOnboarding, onComplete]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-xl border border-violet-700 bg-violet-900/10 overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-violet-800/60 flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-violet-700/40 flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-violet-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm">Instant Replay</p>
          <p className="text-violet-200/70 text-xs">
            See 60 in action on your most recent meeting
          </p>
        </div>
      </div>

      <div className="p-4">
        <AnimatePresence mode="wait">

          {/* ── Offer state ────────────────────────────────────────────────── */}
          {panelState === 'offer' && (
            <motion.div
              key="offer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <p className="text-sm text-gray-300 leading-relaxed">
                See what 60 does before, during, and after every sales meeting
                — personalized for{' '}
                <span className="text-white font-medium">{companyName}</span>.
              </p>

              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-700/40">
                <Zap className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <p className="text-xs text-gray-300">
                  <span className="font-semibold text-emerald-300">Free</span>{' '}
                  — included with your onboarding
                </p>
              </div>

              <button
                onClick={handleStart}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
              >
                <Zap className="w-4 h-4" />
                See 60 in Action
              </button>

              <button
                onClick={onSkip}
                className="w-full text-xs text-gray-500 hover:text-gray-400 transition-colors py-1"
              >
                Skip — I'll explore this later
              </button>
            </motion.div>
          )}

          {/* ── Walkthrough state ──────────────────────────────────────────── */}
          {panelState === 'walkthrough' && (
            <motion.div
              key="walkthrough"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Progress timeline */}
              <WalkthroughTimeline currentAct={currentAct} />

              {/* Scene switcher */}
              <AnimatePresence mode="wait">
                {currentAct === 0 && (
                  <motion.div key="act-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <MeetingDetectedScene
                      data={data.meetingCard}
                      onComplete={advanceAct}
                    />
                  </motion.div>
                )}

                {currentAct === 1 && (
                  <motion.div key="act-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <MeetingPrepScene
                      data={{ ...data.prep, ...data.meetingCard }}
                      onComplete={advanceAct}
                    />
                  </motion.div>
                )}

                {currentAct === 2 && (
                  <motion.div key="act-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <PostMeetingScene
                      data={data.postMeeting}
                      onComplete={advanceAct}
                    />
                  </motion.div>
                )}

                {currentAct === 3 && (
                  <motion.div key="act-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <PayoffScene
                      data={data.payoff}
                      companyName={companyName}
                      onFinish={handlePayoffFinish}
                      onSkip={onSkip}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </motion.div>
  );
}
