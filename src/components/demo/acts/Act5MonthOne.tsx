// src/components/demo/acts/Act5MonthOne.tsx
// Act 5 container: "Month 1 — Full Autopilot"
// Renders 6 showcase scenes with feature category tabs.

import React from 'react';
import { ArrowLeftRight, Network, Activity, GraduationCap, MessageCircle, Award } from 'lucide-react';
import BeforeAfterRevealScene from '../scenes/BeforeAfterRevealScene';
import RelationshipGraphScene from '../scenes/RelationshipGraphScene';
import HeartbeatDashboardScene from '../scenes/HeartbeatDashboardScene';
import CoachingDigestScene from '../scenes/CoachingDigestScene';
import ConversationalSlackScene from '../scenes/ConversationalSlackScene';
import FinalLearningBeatScene from '../scenes/FinalLearningBeatScene';

// ---------------------------------------------------------------------------
// Scene metadata
// ---------------------------------------------------------------------------

const SCENES = [
  { label: 'Before / After', icon: ArrowLeftRight, Component: BeforeAfterRevealScene },
  { label: 'Relationship Graph', icon: Network, Component: RelationshipGraphScene },
  { label: 'Agent Status', icon: Activity, Component: HeartbeatDashboardScene },
  { label: 'Coaching Digest', icon: GraduationCap, Component: CoachingDigestScene },
  { label: 'Conversational AI', icon: MessageCircle, Component: ConversationalSlackScene },
  { label: 'Graduated Autonomy', icon: Award, Component: FinalLearningBeatScene },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Act5MonthOne({ currentScene }: { currentScene: number }) {
  const scene = SCENES[currentScene];
  if (!scene) return null;

  const { Component } = scene;

  return (
    <div className="flex flex-col h-full">
      {/* Feature category tabs (horizontal) */}
      <div className="shrink-0 border-b border-gray-800 overflow-x-auto">
        <div className="flex items-center gap-1 px-4 py-2">
          {SCENES.map((s, idx) => {
            const isActive = idx === currentScene;
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-violet-600/20 text-violet-300'
                    : 'text-gray-500'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {s.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scene content */}
      <div className="flex-1 overflow-auto">
        <div className="p-4 md:p-6 max-w-5xl mx-auto">
          <Component />
        </div>
      </div>
    </div>
  );
}

Act5MonthOne.sceneCount = SCENES.length;
