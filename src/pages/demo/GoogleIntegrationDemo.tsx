import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Play, Pause, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { shots } from './google-demo/mockData';
import ShotSidebar from './google-demo/ShotSidebar';
import ShotOAuthFlow from './google-demo/ShotOAuthFlow';
import ShotCalendarSync from './google-demo/ShotCalendarSync';
import ShotEmailSync from './google-demo/ShotEmailSync';
import ShotEmailTriage from './google-demo/ShotEmailTriage';
import ShotEmailSending from './google-demo/ShotEmailSending';
import ShotDraftCreation from './google-demo/ShotDraftCreation';
import ShotDisconnect from './google-demo/ShotDisconnect';

const shotComponents = [
  ShotOAuthFlow,
  ShotCalendarSync,
  ShotEmailSync,
  ShotEmailTriage,
  ShotEmailSending,
  ShotDraftCreation,
  ShotDisconnect,
];

// Total step count for progress bar
const totalSteps = shots.reduce((acc, s) => acc + s.steps.length, 0);

function getGlobalStepIndex(shotIdx: number, stepIdx: number): number {
  let count = 0;
  for (let i = 0; i < shotIdx; i++) count += shots[i].steps.length;
  return count + stepIdx;
}

export default function GoogleIntegrationDemo() {
  const [activeShot, setActiveShot] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(true); // default fullscreen for recording
  const [isPlaying, setIsPlaying] = useState(false);
  const [completedShots, setCompletedShots] = useState<Set<number>>(new Set());
  const [isDone, setIsDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentShotConfig = shots[activeShot];
  const maxStep = currentShotConfig.steps.length - 1;
  const globalProgress = ((getGlobalStepIndex(activeShot, activeStep) + 1) / totalSteps) * 100;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const advanceStep = useCallback(() => {
    if (activeStep < maxStep) {
      setActiveStep((s) => s + 1);
    } else if (activeShot < shots.length - 1) {
      setCompletedShots((prev) => new Set([...prev, activeShot]));
      setActiveShot((s) => s + 1);
      setActiveStep(0);
    } else {
      // Demo complete
      setCompletedShots((prev) => new Set([...prev, activeShot]));
      setIsPlaying(false);
      setIsDone(true);
    }
  }, [activeStep, activeShot, maxStep]);

  const goBackStep = useCallback(() => {
    if (activeStep > 0) {
      setActiveStep((s) => s - 1);
    } else if (activeShot > 0) {
      const prevShot = activeShot - 1;
      setActiveShot(prevShot);
      setActiveStep(shots[prevShot].steps.length - 1);
    }
  }, [activeStep, activeShot]);

  const goToShot = useCallback((shot: number) => {
    clearTimer();
    setActiveShot(shot);
    setActiveStep(0);
    setIsDone(false);
  }, [clearTimer]);

  const restart = useCallback(() => {
    clearTimer();
    setActiveShot(0);
    setActiveStep(0);
    setCompletedShots(new Set());
    setIsDone(false);
    setIsPlaying(true);
  }, [clearTimer]);

  // Auto-play timer
  useEffect(() => {
    if (!isPlaying || isDone) {
      clearTimer();
      return;
    }

    const timing = shots[activeShot].stepTimings[activeStep] ?? 4000;
    timerRef.current = setTimeout(() => {
      advanceStep();
    }, timing);

    return clearTimer;
  }, [isPlaying, isDone, activeShot, activeStep, advanceStep, clearTimer]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          e.preventDefault();
          clearTimer();
          advanceStep();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          clearTimer();
          goBackStep();
          break;
        case 'ArrowDown':
          e.preventDefault();
          clearTimer();
          if (activeShot < shots.length - 1) {
            setCompletedShots((prev) => new Set([...prev, activeShot]));
            setActiveShot((s) => s + 1);
            setActiveStep(0);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          clearTimer();
          if (activeShot > 0) {
            setActiveShot((s) => s - 1);
            setActiveStep(0);
          }
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          setIsFullscreen((f) => !f);
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          if (isDone) {
            restart();
          } else {
            setIsPlaying((p) => !p);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [advanceStep, goBackStep, activeShot, clearTimer, isPlaying, isDone, restart]);

  const ActiveShotComponent = shotComponents[activeShot];

  return (
    <div className={cn(
      'flex bg-gray-950 text-white overflow-hidden',
      isFullscreen ? 'fixed inset-0 z-50' : 'h-screen'
    )}>
      {/* Sidebar — hidden in fullscreen */}
      {!isFullscreen && (
        <ShotSidebar
          activeShot={activeShot}
          activeStep={activeStep}
          completedShots={completedShots}
          onShotClick={goToShot}
        />
      )}

      {/* Main stage */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800/50 bg-gray-950/90 backdrop-blur-sm">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeShot}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-3"
            >
              <Badge variant="outline" className="border-blue-500/40 text-blue-400 font-mono">
                {activeShot + 1}/{shots.length}
              </Badge>
              <span className="text-sm font-medium text-white">{currentShotConfig.title}</span>
              <Badge variant="outline" className="border-gray-600 text-gray-500 text-xs">
                Step {activeStep + 1} of {currentShotConfig.steps.length}
              </Badge>
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center gap-2">
            {/* Auto-play controls */}
            {isDone ? (
              <Button size="sm" variant="outline" className="border-green-500/40 text-green-400 gap-1.5 h-8" onClick={restart}>
                <RotateCcw className="w-3.5 h-3.5" />
                Replay
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className={cn(
                  'gap-1.5 h-8',
                  isPlaying ? 'border-amber-500/40 text-amber-400' : 'border-green-500/40 text-green-400'
                )}
                onClick={() => setIsPlaying((p) => !p)}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isPlaying ? 'Pause' : 'Auto-play'}
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              className="text-gray-400 h-8 w-8 p-0"
              onClick={() => setIsFullscreen((f) => !f)}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-6">
          <Progress value={globalProgress} className="h-0.5 bg-gray-800 [&>div]:bg-blue-500 [&>div]:transition-all [&>div]:duration-500" />
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeShot}-${activeStep}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {isDone ? (
                <div className="flex flex-col items-center justify-center h-full gap-6 py-20">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center"
                  >
                    <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </motion.div>
                  <div className="text-center">
                    <h2 className="text-2xl font-semibold text-white">Demo Complete</h2>
                    <p className="text-gray-400 mt-2">All 7 shots recorded successfully</p>
                  </div>
                  <Button onClick={restart} className="bg-blue-600 hover:bg-blue-700 gap-2">
                    <RotateCcw className="w-4 h-4" />
                    Replay Demo
                  </Button>
                </div>
              ) : (
                <ActiveShotComponent
                  activeStep={activeStep}
                  onStepChange={setActiveStep}
                  isActive={true}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom navigation */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-800/50 bg-gray-950/90 backdrop-blur-sm">
          <Button
            size="sm"
            variant="ghost"
            className="text-gray-400 gap-1"
            onClick={() => { clearTimer(); goBackStep(); }}
            disabled={activeShot === 0 && activeStep === 0}
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>

          {/* Step dots */}
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              {currentShotConfig.steps.map((stepName, i) => (
                <button
                  key={i}
                  onClick={() => { clearTimer(); setActiveStep(i); }}
                  className={cn(
                    'h-2 rounded-full transition-all duration-300',
                    i === activeStep ? 'bg-blue-500 w-6' :
                    i < activeStep ? 'bg-blue-500/50 w-2' :
                    'bg-gray-700 w-2'
                  )}
                  title={stepName}
                />
              ))}
            </div>
            <span className="text-xs text-gray-600">{currentShotConfig.steps[activeStep]}</span>
          </div>

          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 gap-1"
            onClick={() => { clearTimer(); advanceStep(); }}
          >
            {activeShot === shots.length - 1 && activeStep === maxStep ? 'Done' : 'Next'}
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
