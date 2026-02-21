import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { SidebarTaskItem } from './SidebarTaskItem';

interface TaskChainGroupProps {
  parentTask: any;
  childTasks: any[];
  selectedTaskId?: string | null;
  onSelectTask: (task: any) => void;
  nextInChainId?: string | null;
}

export function TaskChainGroup({ parentTask, childTasks, selectedTaskId, onSelectTask, nextInChainId }: TaskChainGroupProps) {
  const [expanded, setExpanded] = useState(true);

  const completedCount = childTasks.filter(t => t.status === 'completed' || t.status === 'approved').length;
  const totalCount = childTasks.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="border-l-2 border-violet-200 dark:border-violet-800 ml-2 mb-1">
      {/* Chain header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-muted/50 rounded-r-md"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-medium truncate flex-1 text-slate-700 dark:text-gray-300">
          {parentTask.title}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">
          {completedCount}/{totalCount}
        </span>
      </button>

      {/* Mini progress bar */}
      <div className="px-3 pb-1">
        <Progress value={progressPercent} className="h-1" />
      </div>

      {/* Child tasks */}
      {expanded && (
        <div className="pl-2">
          {childTasks.map(task => (
            <SidebarTaskItem
              key={task.id}
              task={task}
              isSelected={task.id === selectedTaskId}
              onClick={() => onSelectTask(task.id)}
              isNextInChain={task.id === nextInChainId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
