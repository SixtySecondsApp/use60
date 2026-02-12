import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { useActiveOrgId } from '@/lib/stores/orgStore';

interface ProgressEvent {
  type: 'actor_started' | 'actor_progress' | 'actor_completed' | 'actor_failed';
  actor: string;
  percent?: number;
  current?: number;
  total?: number;
  result_count?: number;
  duration_ms?: number;
  error?: string;
}

interface ProgressIndicatorProps {
  isActive: boolean;
  onComplete?: () => void;
}

export function ProgressIndicator({ isActive, onComplete }: ProgressIndicatorProps) {
  const orgId = useActiveOrgId();
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Subscribe to Realtime progress
  useEffect(() => {
    if (!isActive || !orgId) return;

    const channel = supabase.channel(`apify_progress_${orgId}`);

    channel
      .on('broadcast', { event: 'progress_update' }, ({ payload }) => {
        setEvents(prev => [...prev, payload]);

        if (payload.type === 'actor_started' && !startTime) {
          setStartTime(Date.now());
        }

        if (payload.type === 'actor_completed') {
          // Check if all actors done
          const allCompleted = events.every(e =>
            e.type === 'actor_completed' || e.type === 'actor_failed'
          );
          if (allCompleted) {
            onComplete?.();
          }
        }
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [isActive, orgId, startTime, events, onComplete]);

  // Update elapsed time
  useEffect(() => {
    if (!startTime) return;

    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  // Calculate overall progress
  const activeActors = events.filter(e => e.type === 'actor_started').length;
  const completedActors = events.filter(e => e.type === 'actor_completed').length;
  const overallProgress = activeActors > 0
    ? (completedActors / activeActors) * 100
    : 0;

  // Get current actor and its progress
  const currentEvent = events[events.length - 1];
  const currentActor = currentEvent?.actor;
  const currentProgress = currentEvent?.percent || 0;

  // Stepper steps
  const steps = [
    { label: 'Parse Query', complete: true },
    { label: currentActor || 'Searching...', complete: completedActors > 0 },
    { label: 'Merge Results', complete: completedActors === activeActors },
  ];

  if (!isActive) return null;

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
      {/* Overall Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {completedActors === activeActors ? 'Complete!' : 'Searching...'}
          </span>
          <span className="text-muted-foreground">
            {Math.round(overallProgress)}%
          </span>
        </div>
        <Progress value={overallProgress} />
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-between">
        {steps.map((step, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            {step.complete ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : i === steps.findIndex(s => !s.complete) ? (
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground max-w-[80px] text-center">
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* Current Actor Progress */}
      {currentActor && currentEvent?.type === 'actor_progress' && (
        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Searching {currentActor}...
            </span>
            <span>{currentEvent.current || 0}/{currentEvent.total || 0}</span>
          </div>
          <Progress value={currentProgress} className="h-2" />
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{completedActors}/{activeActors} actors complete</span>
        <span>{elapsedSeconds}s elapsed</span>
      </div>
    </div>
  );
}
