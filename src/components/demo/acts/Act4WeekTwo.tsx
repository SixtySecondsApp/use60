// src/components/demo/acts/Act4WeekTwo.tsx
// Act 4 container: "Week 2 — It's Learning"
// Renders 4 scenes with a day counter sidebar and completeness bar.

import React from 'react';
import { Calendar } from 'lucide-react';
import { motion } from 'framer-motion';
import LearningMontageScene from '../scenes/LearningMontageScene';
import ToneComparisonScene from '../scenes/ToneComparisonScene';
import CompetitiveIntelScene from '../scenes/CompetitiveIntelScene';
import CrossDealPatternsScene from '../scenes/CrossDealPatternsScene';

// ---------------------------------------------------------------------------
// Scene metadata
// ---------------------------------------------------------------------------

const SCENES = [
  { day: 'Days 2–11', label: 'Progressive Learning', Component: LearningMontageScene },
  { day: 'Day 7', label: 'Tone Adaptation', Component: ToneComparisonScene },
  { day: 'Day 10', label: 'Competitive Intelligence', Component: CompetitiveIntelScene },
  { day: 'Day 14', label: 'Cross-Deal Patterns', Component: CrossDealPatternsScene },
] as const;

// Completeness progression through Act 4
const COMPLETENESS = [58, 71, 78, 84];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Act4WeekTwo({ currentScene }: { currentScene: number }) {
  const scene = SCENES[currentScene];
  if (!scene) return null;

  const { Component } = scene;
  const completeness = COMPLETENESS[currentScene] ?? 84;

  return (
    <div className="flex flex-col h-full">
      {/* Scene content */}
      <div className="flex-1 overflow-auto">
        <div className="flex h-full">
          {/* Day counter sidebar */}
          <div className="w-48 shrink-0 border-r border-gray-800 overflow-y-auto hidden lg:block">
            <div className="py-3 px-3 space-y-0.5">
              {SCENES.map((s, idx) => {
                const isActive = idx === currentScene;
                const isPast = idx < currentScene;
                return (
                  <div
                    key={s.day}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                      isActive
                        ? 'bg-violet-600/20 text-violet-300'
                        : isPast
                          ? 'text-gray-500'
                          : 'text-gray-600'
                    }`}
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        isActive
                          ? 'bg-violet-400'
                          : isPast
                            ? 'bg-gray-600'
                            : 'bg-gray-700'
                      }`}
                    />
                    <Calendar className="w-3 h-3 shrink-0" />
                    <span>{s.day}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-auto">
            <div className="p-4 md:p-6 max-w-4xl mx-auto">
              {/* Mobile day indicator */}
              <div className="lg:hidden flex items-center gap-2 mb-3 text-xs text-gray-400">
                <Calendar className="w-3 h-3" />
                <span>{scene.day}</span>
                <span className="text-gray-600">—</span>
                <span>{scene.label}</span>
              </div>
              <Component />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom completeness bar */}
      <div className="shrink-0 border-t border-gray-800 px-4 py-2 flex items-center gap-3">
        <span className="text-xs text-gray-400">Config Completeness</span>
        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{
              backgroundColor: completeness >= 80 ? '#10B981' : completeness >= 60 ? '#8B5CF6' : '#6366F1',
            }}
            initial={false}
            animate={{ width: `${completeness}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
          />
        </div>
        <span className="text-xs font-mono text-gray-300 w-10 text-right">{completeness}%</span>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            completeness >= 80
              ? 'bg-emerald-900/40 text-emerald-400'
              : 'bg-violet-900/40 text-violet-400'
          }`}
        >
          {completeness >= 80 ? 'Optimised' : 'Tuned'}
        </span>
      </div>
    </div>
  );
}

Act4WeekTwo.sceneCount = SCENES.length;
