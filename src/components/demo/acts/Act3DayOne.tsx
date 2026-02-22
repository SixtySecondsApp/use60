// src/components/demo/acts/Act3DayOne.tsx
// Act 3 container: "Day 1 — Your AI Teammate Wakes Up"
// Renders 10 scenes with a timeline sidebar showing time progression.

import React from 'react';
import { Clock } from 'lucide-react';
import MorningBriefScene from '../scenes/MorningBriefScene';
import PipelineMathScene from '../scenes/PipelineMathScene';
import MeetingPrepScene from '../scenes/MeetingPrepScene';
import PostMeetingDebriefScene from '../scenes/PostMeetingDebriefScene';
import CRMUpdateScene from '../scenes/CRMUpdateScene';
import ProposalScene from '../scenes/ProposalScene';
import InternalMeetingPrepScene from '../scenes/InternalMeetingPrepScene';
import DealRiskScene from '../scenes/DealRiskScene';
import ReengagementScene from '../scenes/ReengagementScene';
import EODSynthesisScene from '../scenes/EODSynthesisScene';

// ---------------------------------------------------------------------------
// Scene metadata (time of day + component)
// ---------------------------------------------------------------------------

const SCENES = [
  { time: '7:45 AM', label: 'Morning Briefing', Component: MorningBriefScene },
  { time: '8:00 AM', label: 'Pipeline Mathematics', Component: PipelineMathScene },
  { time: '1:30 PM', label: 'Meeting Prep', Component: MeetingPrepScene },
  { time: '3:15 PM', label: 'Post-Meeting Debrief', Component: PostMeetingDebriefScene },
  { time: '3:20 PM', label: 'CRM Auto-Update', Component: CRMUpdateScene },
  { time: '3:30 PM', label: 'Proposal Generation', Component: ProposalScene },
  { time: '3:45 PM', label: 'Internal Meeting Prep', Component: InternalMeetingPrepScene },
  { time: '4:45 PM', label: 'Deal Risk Alert', Component: DealRiskScene },
  { time: '5:00 PM', label: 'Re-engagement', Component: ReengagementScene },
  { time: '6:00 PM', label: 'EOD Synthesis', Component: EODSynthesisScene },
] as const;

// ---------------------------------------------------------------------------
// Time-of-day ambient color (subtle gradient)
// ---------------------------------------------------------------------------

function getAmbientGradient(sceneIndex: number): string {
  if (sceneIndex <= 1) return 'from-amber-950/10 to-transparent'; // Morning
  if (sceneIndex <= 5) return 'from-sky-950/10 to-transparent'; // Afternoon
  if (sceneIndex <= 7) return 'from-orange-950/10 to-transparent'; // Late afternoon
  return 'from-indigo-950/10 to-transparent'; // Evening
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Act3DayOne({ currentScene }: { currentScene: number }) {
  const scene = SCENES[currentScene];
  if (!scene) return null;

  const { Component } = scene;

  return (
    <div className="flex h-full">
      {/* Timeline sidebar */}
      <div className="w-48 shrink-0 border-r border-gray-800 overflow-y-auto hidden lg:block">
        <div className="py-3 px-3 space-y-0.5">
          {SCENES.map((s, idx) => {
            const isActive = idx === currentScene;
            const isPast = idx < currentScene;
            return (
              <div
                key={s.time}
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
                <Clock className="w-3 h-3 shrink-0" />
                <span className="font-mono">{s.time}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scene content */}
      <div className={`flex-1 overflow-auto bg-gradient-to-b ${getAmbientGradient(currentScene)}`}>
        <div className="p-4 md:p-6 max-w-4xl mx-auto">
          {/* Mobile time indicator */}
          <div className="lg:hidden flex items-center gap-2 mb-3 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            <span className="font-mono">{scene.time}</span>
            <span className="text-gray-600">—</span>
            <span>{scene.label}</span>
          </div>
          <Component />
        </div>
      </div>
    </div>
  );
}

Act3DayOne.sceneCount = SCENES.length;
