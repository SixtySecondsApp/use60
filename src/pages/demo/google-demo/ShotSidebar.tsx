import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { shots } from './mockData';

interface ShotSidebarProps {
  activeShot: number;
  activeStep: number;
  completedShots: Set<number>;
  onShotClick: (shot: number) => void;
}

export default function ShotSidebar({ activeShot, activeStep, completedShots, onShotClick }: ShotSidebarProps) {
  return (
    <div className="w-[280px] bg-gray-900/80 backdrop-blur-sm border-r border-gray-700/50 flex flex-col overflow-y-auto">
      <div className="p-4 border-b border-gray-700/50">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Demo Script</h2>
        <p className="text-xs text-gray-500 mt-1">7 shots &middot; keyboard nav enabled</p>
      </div>

      <div className="flex-1 py-2">
        {shots.map((shot) => {
          const Icon = shot.icon;
          const isActive = activeShot === shot.id;
          const isCompleted = completedShots.has(shot.id);

          return (
            <button
              key={shot.id}
              onClick={() => onShotClick(shot.id)}
              className={cn(
                'w-full flex items-start gap-3 px-4 py-3 text-left transition-all duration-200',
                'hover:bg-gray-800/60',
                isActive && 'bg-gray-800/80 border-l-2 border-blue-500',
                !isActive && 'border-l-2 border-transparent'
              )}
            >
              <div className={cn(
                'mt-0.5 flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center',
                isActive ? 'bg-blue-500/20 text-blue-400' :
                isCompleted ? 'bg-green-500/20 text-green-400' :
                'bg-gray-700/50 text-gray-500'
              )}>
                {isCompleted && !isActive ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-xs font-medium',
                    isActive ? 'text-blue-400' : 'text-gray-500'
                  )}>
                    {shot.id + 1}
                  </span>
                  <span className={cn(
                    'text-sm font-medium truncate',
                    isActive ? 'text-white' : 'text-gray-300'
                  )}>
                    {shot.title}
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">
                    {shot.steps.length} steps
                  </span>
                  <span className="text-xs text-gray-600">&middot;</span>
                  <span className="text-xs text-gray-500">{shot.duration}</span>
                </div>

                {isActive && (
                  <div className="flex gap-1 mt-2">
                    {shot.steps.map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          'h-1 flex-1 rounded-full transition-colors duration-300',
                          i <= activeStep ? 'bg-blue-500' :
                          'bg-gray-700'
                        )}
                      />
                    ))}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-4 border-t border-gray-700/50">
        <div className="text-xs text-gray-500 space-y-1">
          <div className="flex justify-between">
            <span>Navigate</span>
            <span className="text-gray-600">Arrow keys</span>
          </div>
          <div className="flex justify-between">
            <span>Advance</span>
            <span className="text-gray-600">Space / Right</span>
          </div>
          <div className="flex justify-between">
            <span>Fullscreen</span>
            <span className="text-gray-600">F</span>
          </div>
        </div>
      </div>
    </div>
  );
}
