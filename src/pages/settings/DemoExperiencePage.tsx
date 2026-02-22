// src/pages/settings/DemoExperiencePage.tsx
// Main demo experience page at /settings/demo.
// Wires all 5 acts into DemoShell with scene-level routing.

import React, { useState, useCallback } from 'react';
import { DemoShell } from '@/components/demo/DemoShell';
import type { DemoAct } from '@/components/demo/DemoShell';
import Act1BeforeSixty from '@/components/demo/acts/Act1BeforeSixty';
import Act2Onboarding from '@/components/demo/acts/Act2Onboarding';
import Act3DayOne from '@/components/demo/acts/Act3DayOne';
import Act4WeekTwo from '@/components/demo/acts/Act4WeekTwo';
import Act5MonthOne from '@/components/demo/acts/Act5MonthOne';

// ---------------------------------------------------------------------------
// Act definitions matching the narrative structure
// ---------------------------------------------------------------------------

const ACTS: DemoAct[] = [
  { title: 'Before 60', subtitle: 'The Pain — Manual CRM, missed follow-ups, no meeting prep', sceneCount: 1 },
  { title: 'Onboarding', subtitle: 'Setup in 90 Seconds — Enrichment + AI Bootstrap', sceneCount: 1 },
  { title: 'Day 1', subtitle: 'Your AI Teammate Wakes Up — Morning to Evening', sceneCount: 10 },
  { title: 'Week 2', subtitle: "It's Learning — Progressive Questions + Intelligence", sceneCount: 4 },
  { title: 'Month 1', subtitle: 'Full Autopilot — Transformation + Wow Moments', sceneCount: 6 },
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function DemoExperiencePage() {
  const [currentAct, setCurrentAct] = useState(0);
  const [currentScene, setCurrentScene] = useState(0);

  const handleActChange = useCallback((act: number) => {
    setCurrentAct(act);
    setCurrentScene(0);
  }, []);

  const handleSceneChange = useCallback((scene: number) => {
    setCurrentScene(scene);
  }, []);

  return (
    <div className="h-[calc(100vh-4rem)]">
      <DemoShell
        acts={ACTS}
        currentAct={currentAct}
        currentScene={currentScene}
        onActChange={handleActChange}
        onSceneChange={handleSceneChange}
      >
        {currentAct === 0 && <Act1BeforeSixty />}
        {currentAct === 1 && <Act2Onboarding />}
        {currentAct === 2 && <Act3DayOne currentScene={currentScene} />}
        {currentAct === 3 && <Act4WeekTwo currentScene={currentScene} />}
        {currentAct === 4 && <Act5MonthOne currentScene={currentScene} />}
      </DemoShell>
    </div>
  );
}
