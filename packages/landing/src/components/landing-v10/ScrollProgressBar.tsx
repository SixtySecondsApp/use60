import { useScrollProgress } from './hooks/useScrollProgress';

export function ScrollProgressBar() {
  const progress = useScrollProgress();

  return (
    <div
      className="fixed top-0 left-0 right-0 h-0.5 z-[60] pointer-events-none"
      aria-hidden="true"
    >
      <div
        className="h-full bg-blue-600 dark:bg-emerald-500 origin-left transition-none"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}
