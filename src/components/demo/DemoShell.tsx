// src/components/demo/DemoShell.tsx
// Layout wrapper for the interactive demo experience.
// Provides act/scene navigation, keyboard shortcuts, and animated transitions.

import React, { createContext, useContext, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DemoAct {
  title: string;
  subtitle: string;
  sceneCount: number;
}

interface DemoContextValue {
  currentAct: number;
  currentScene: number;
  setAct: (act: number) => void;
  setScene: (scene: number) => void;
  nextScene: () => void;
  prevScene: () => void;
  totalScenes: number;
  acts: DemoAct[];
}

interface DemoShellProps {
  children: React.ReactNode;
  acts: DemoAct[];
  currentAct: number;
  currentScene: number;
  onActChange: (act: number) => void;
  onSceneChange: (scene: number) => void;
}

// ---------------------------------------------------------------------------
// Context + hook
// ---------------------------------------------------------------------------

const DemoContext = createContext<DemoContextValue | null>(null);

export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemo must be used inside <DemoShell>');
  return ctx;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACCENT = '#6C5CE7';

const sceneVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
  }),
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DemoShell({
  children,
  acts,
  currentAct,
  currentScene,
  onActChange,
  onSceneChange,
}: DemoShellProps) {
  const totalScenes = acts[currentAct]?.sceneCount ?? 0;

  // Track transition direction for AnimatePresence
  const [direction, setDirection] = React.useState(1);

  // ---- Navigation helpers ------------------------------------------------

  const setAct = useCallback(
    (act: number) => {
      if (act < 0 || act >= acts.length) return;
      setDirection(act > currentAct ? 1 : -1);
      onActChange(act);
      onSceneChange(0);
    },
    [acts.length, currentAct, onActChange, onSceneChange],
  );

  const setScene = useCallback(
    (scene: number) => {
      const max = acts[currentAct]?.sceneCount ?? 0;
      if (scene < 0 || scene >= max) return;
      setDirection(scene > currentScene ? 1 : -1);
      onSceneChange(scene);
    },
    [acts, currentAct, currentScene, onSceneChange],
  );

  const nextScene = useCallback(() => {
    const max = acts[currentAct]?.sceneCount ?? 0;
    if (currentScene < max - 1) {
      setDirection(1);
      onSceneChange(currentScene + 1);
    } else if (currentAct < acts.length - 1) {
      // Advance to next act
      setDirection(1);
      onActChange(currentAct + 1);
      onSceneChange(0);
    }
  }, [acts, currentAct, currentScene, onActChange, onSceneChange]);

  const prevScene = useCallback(() => {
    if (currentScene > 0) {
      setDirection(-1);
      onSceneChange(currentScene - 1);
    } else if (currentAct > 0) {
      // Go back to last scene of previous act
      setDirection(-1);
      const prevActScenes = acts[currentAct - 1]?.sceneCount ?? 1;
      onActChange(currentAct - 1);
      onSceneChange(prevActScenes - 1);
    }
  }, [acts, currentAct, currentScene, onActChange, onSceneChange]);

  // ---- Keyboard shortcuts ------------------------------------------------

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextScene();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevScene();
      } else if (e.key >= '1' && e.key <= '5') {
        const actIdx = Number(e.key) - 1;
        if (actIdx < acts.length) {
          setAct(actIdx);
        }
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [nextScene, prevScene, setAct, acts.length]);

  // ---- Context value -----------------------------------------------------

  const ctxValue = useMemo<DemoContextValue>(
    () => ({
      currentAct,
      currentScene,
      setAct,
      setScene,
      nextScene,
      prevScene,
      totalScenes,
      acts,
    }),
    [currentAct, currentScene, setAct, setScene, nextScene, prevScene, totalScenes, acts],
  );

  // ---- Progress calculation ----------------------------------------------

  const globalSceneIdx = useMemo(() => {
    let idx = 0;
    for (let a = 0; a < currentAct; a++) {
      idx += acts[a]?.sceneCount ?? 0;
    }
    return idx + currentScene;
  }, [acts, currentAct, currentScene]);

  const globalTotalScenes = useMemo(
    () => acts.reduce((sum, a) => sum + a.sceneCount, 0),
    [acts],
  );

  const progressPct = globalTotalScenes > 0 ? ((globalSceneIdx + 1) / globalTotalScenes) * 100 : 0;

  // ---- Determine if nav buttons are disabled -----------------------------

  const isFirst = currentAct === 0 && currentScene === 0;
  const isLast = currentAct === acts.length - 1 && currentScene === totalScenes - 1;

  // ---- Render ------------------------------------------------------------

  return (
    <DemoContext.Provider value={ctxValue}>
      <div className="flex flex-col h-full bg-gray-950 text-white overflow-hidden">
        {/* ---- Top progress bar ---- */}
        <div className="h-1 w-full bg-gray-800 shrink-0">
          <motion.div
            className="h-full rounded-r-full"
            style={{ backgroundColor: ACCENT }}
            initial={false}
            animate={{ width: `${progressPct}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
        </div>

        {/* ---- Act tabs + info badge ---- */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 shrink-0">
          <div className="flex gap-1">
            {acts.map((act, idx) => {
              const isActive = idx === currentAct;
              return (
                <button
                  key={act.title}
                  onClick={() => setAct(idx)}
                  className={`
                    px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                    ${isActive
                      ? 'text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                    }
                  `}
                  style={isActive ? { backgroundColor: ACCENT } : undefined}
                >
                  {act.title}
                </button>
              );
            })}
          </div>

          {/* Info badge */}
          <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-800/60 px-3 py-1 rounded-full">
            <Info className="w-3 h-3" />
            <span>Internal Demo &mdash; Meridian AI / Sarah Chen</span>
          </div>
        </div>

        {/* ---- Act subtitle ---- */}
        <div className="px-4 py-1.5 text-xs text-gray-500 shrink-0">
          {acts[currentAct]?.subtitle}
        </div>

        {/* ---- Scene content area ---- */}
        <div className="flex-1 overflow-auto relative">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={`${currentAct}-${currentScene}`}
              custom={direction}
              variants={sceneVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ---- Bottom navigation bar ---- */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800 shrink-0">
          <button
            onClick={prevScene}
            disabled={isFirst}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 hover:bg-gray-800"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          <span className="text-sm text-gray-400">
            Scene {currentScene + 1} of {totalScenes}
          </span>

          <button
            onClick={nextScene}
            disabled={isLast}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 hover:bg-gray-800"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </DemoContext.Provider>
  );
}
