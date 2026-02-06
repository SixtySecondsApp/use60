/**
 * MAPRenderer - Beautiful renderer for Mutual Action Plan skill output
 *
 * Parses markdown MAP output and renders with custom styling:
 * - Deal status cards with health indicators
 * - Milestone timeline/roadmap
 * - Task queue with priorities
 * - Risk/assumption callouts
 * - Action buttons to create tasks
 */

import { useMemo, useState, useRef, useEffect } from 'react';
import {
  Target,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  Clock,
  Users,
  Building2,
  ArrowRight,
  Calendar,
  Flag,
  Milestone,
  ListTodo,
  Zap,
  Loader2,
  Plus,
  Check,
  Sparkles,
  Pencil,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export interface MAPTask {
  title: string;
  dueDate: string;
  priority: string;
  owner: string;
  description?: string[];
}

interface MAPRendererProps {
  content: string;
  dealId?: string;
  onCreateTask?: (task: MAPTask) => Promise<void>;
  onCreateAllTasks?: (tasks: MAPTask[]) => Promise<void>;
  onAcceptPlan?: () => Promise<void>;
}

interface ParsedMAP {
  title: string;
  dealStatus: {
    name: string;
    value: string;
    probability: string;
    health: string;
    healthScore: number;
    status: string;
    daysInStage: number;
    lastActivity: string;
    risk: string;
    recommendation: string;
  } | null;
  northStar: string | null;
  risks: string[];
  assumptions: string[];
  milestones: Array<{
    title: string;
    owner: string;
    dueDate: string;
    exitCriteria: string;
  }>;
  topTask: {
    title: string;
    dueDate: string;
    priority: string;
    description: string[];
    status: string;
  } | null;
  taskQueue: Array<{
    title: string;
    dueDate: string;
    priority: string;
    owner: string;
  }>;
  criticalPath: string | null;
  nextAction: string | null;
}

function parseMAP(content: string): ParsedMAP {
  const lines = content.split('\n');

  const result: ParsedMAP = {
    title: '',
    dealStatus: null,
    northStar: null,
    risks: [],
    assumptions: [],
    milestones: [],
    topTask: null,
    taskQueue: [],
    criticalPath: null,
    nextAction: null,
  };

  let currentSection = '';
  let inMilestoneTable = false;
  let inTaskQueue = false;
  let topTaskLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Extract title
    if (line.startsWith('## ') && line.includes('Mutual Action Plan')) {
      result.title = line.replace('## ', '').replace(' - Mutual Action Plan', '').trim();
      continue;
    }

    // Detect sections
    if (line.startsWith('### Deal Status') || line.startsWith('## Deal Status')) {
      currentSection = 'dealStatus';
      continue;
    }
    if (line.startsWith('### North Star') || line.includes('North Star Goal')) {
      currentSection = 'northStar';
      continue;
    }
    if (line.startsWith('### Key Risks') || line.includes('Key Risks')) {
      currentSection = 'risks';
      continue;
    }
    if (line.startsWith('### Critical Assumptions') || line.includes('Critical Assumptions')) {
      currentSection = 'assumptions';
      continue;
    }
    if (line.includes('Milestone Roadmap') || line.includes('Milestone') && line.startsWith('##')) {
      currentSection = 'milestones';
      inMilestoneTable = false;
      continue;
    }
    if (line.includes('Top Task Created') || line.includes('Top Task')) {
      currentSection = 'topTask';
      topTaskLines = [];
      continue;
    }
    if (line.includes('Full Task Que') || line.includes('Task Queue') || line.includes('Full Task')) {
      currentSection = 'taskQueue';
      inTaskQueue = true;
      continue;
    }
    if (line.includes('Critical Path Summary') || line.includes('Critical Path')) {
      currentSection = 'criticalPath';
      continue;
    }

    // Skip separators
    if (line === '---' || line === '') continue;

    // Parse deal status
    if (currentSection === 'dealStatus') {
      // Parse first line: **Name** | $Value | Probability | Health
      if (line.startsWith('**') && line.includes('|')) {
        const parts = line.split('|').map(p => p.trim());
        const namePart = parts[0]?.replace(/\*\*/g, '').trim() || '';
        const valuePart = parts[1]?.trim() || '';
        const probPart = parts[2]?.trim() || '';
        const healthPart = parts[3]?.trim() || '';

        const healthMatch = healthPart.match(/(\d+)\/100/);

        result.dealStatus = {
          name: namePart,
          value: valuePart,
          probability: probPart,
          health: healthPart.replace(/\(\d+\/100\)/, '').trim(),
          healthScore: healthMatch ? parseInt(healthMatch[1]) : 0,
          status: '',
          daysInStage: 0,
          lastActivity: '',
          risk: '',
          recommendation: '',
        };
      }
      // Parse bullet points
      if (line.startsWith('-') && result.dealStatus) {
        const bulletContent = line.replace(/^-\s*/, '');
        if (bulletContent.toLowerCase().includes('status:')) {
          result.dealStatus.status = bulletContent.replace(/status:\s*/i, '').split('|')[0].trim();
        }
        if (bulletContent.toLowerCase().includes('days in stage')) {
          const daysMatch = bulletContent.match(/days in stage:\s*(\d+)/i);
          if (daysMatch) result.dealStatus.daysInStage = parseInt(daysMatch[1]);
          const activityMatch = bulletContent.match(/last activity:\s*([^|]+)/i);
          if (activityMatch) result.dealStatus.lastActivity = activityMatch[1].trim();
        }
        if (bulletContent.toLowerCase().includes('risk:')) {
          result.dealStatus.risk = bulletContent.match(/risk:\s*(\w+)/i)?.[1] || '';
          const recMatch = bulletContent.match(/recommendation:\s*(.+)/i);
          if (recMatch) result.dealStatus.recommendation = recMatch[1].trim();
        }
      }
    }

    // Parse North Star
    if (currentSection === 'northStar' && line.startsWith('**')) {
      result.northStar = line.replace(/\*\*/g, '').trim();
    }

    // Parse Risks
    if (currentSection === 'risks' && line.startsWith('-')) {
      result.risks.push(line.replace(/^-\s*/, '').trim());
    }

    // Parse Assumptions
    if (currentSection === 'assumptions' && line.startsWith('-')) {
      result.assumptions.push(line.replace(/^-\s*/, '').trim());
    }

    // Parse Milestone table
    if (currentSection === 'milestones') {
      if (line.startsWith('|') && line.includes('Milestone')) {
        inMilestoneTable = true;
        continue;
      }
      if (line.startsWith('|---') || line.startsWith('| ---')) {
        continue;
      }
      if (inMilestoneTable && line.startsWith('|')) {
        const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
        if (cells.length >= 4) {
          result.milestones.push({
            title: cells[0].replace(/\*\*/g, ''),
            owner: cells[1],
            dueDate: cells[2],
            exitCriteria: cells[3],
          });
        }
      }
    }

    // Parse Top Task
    if (currentSection === 'topTask') {
      if (line.startsWith('**') && line.includes('|')) {
        const parts = line.split('|').map(p => p.trim());
        const titlePart = parts[0]?.replace(/\*\*/g, '').trim() || '';
        const duePart = parts[1]?.match(/Due:\s*([^\|]+)/i)?.[1]?.trim() || '';
        const priorityPart = parts[2]?.match(/Priority:\s*(\w+)/i)?.[1] || '';

        result.topTask = {
          title: titlePart,
          dueDate: duePart,
          priority: priorityPart,
          description: [],
          status: '',
        };
      }
      if (line.startsWith('-') && result.topTask) {
        if (line.toLowerCase().includes('status:')) {
          result.topTask.status = line.match(/status:\s*(.+)/i)?.[1]?.trim() || '';
        } else {
          result.topTask.description.push(line.replace(/^-\s*/, '').trim());
        }
      }
    }

    // Parse Task Queue
    if (currentSection === 'taskQueue' && /^\d+\./.test(line)) {
      // Format: 1. **Task Title** (Date) - PRIORITY - Owner
      const match = line.match(/^\d+\.\s*\*\*([^*]+)\*\*\s*\(([^)]+)\)\s*-\s*(\w+)\s*-\s*(.+)/);
      if (match) {
        result.taskQueue.push({
          title: match[1].trim(),
          dueDate: match[2].trim(),
          priority: match[3].trim(),
          owner: match[4].trim(),
        });
      }
    }

    // Parse Critical Path
    if (currentSection === 'criticalPath') {
      if (line.includes('→') || line.includes('->')) {
        result.criticalPath = line;
      }
      if (line.startsWith('**Next Action')) {
        result.nextAction = line.replace(/\*\*/g, '').replace('Next Action:', '').trim();
      }
    }
  }

  return result;
}

function getHealthColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function getHealthBg(score: number): string {
  if (score >= 80) return 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800';
  if (score >= 60) return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
  return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
}

function getRiskColor(risk: string): string {
  const r = risk.toLowerCase();
  if (r === 'low') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
  if (r === 'medium') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
}

function getPriorityColor(priority: string): string {
  const p = priority.toLowerCase();
  if (p === 'high' || p === 'urgent') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (p === 'medium') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
}

function getOwnerIcon(owner: string) {
  const o = owner.toLowerCase();
  if (o === 'us' || o === 'sales') return <Building2 className="w-3 h-3" />;
  if (o === 'customer' || o === 'prospect') return <Users className="w-3 h-3" />;
  return <Users className="w-3 h-3" />;
}

export function MAPRenderer({ content, dealId, onCreateTask, onCreateAllTasks, onAcceptPlan }: MAPRendererProps) {
  const map = useMemo(() => parseMAP(content), [content]);

  // Action state
  const [isAccepting, setIsAccepting] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [isCreatingAll, setIsCreatingAll] = useState(false);
  const [planAccepted, setPlanAccepted] = useState(false);
  const [createdTaskIndices, setCreatedTaskIndices] = useState<Set<number>>(new Set());
  const [topTaskCreated, setTopTaskCreated] = useState(false);
  const [acceptedMilestones, setAcceptedMilestones] = useState<Set<number>>(new Set());

  // Editing state
  const [editingTitle, setEditingTitle] = useState(false);
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [editingMilestoneDate, setEditingMilestoneDate] = useState<number | null>(null);
  const [customMilestoneDates, setCustomMilestoneDates] = useState<Record<number, string>>({});
  const [editingTaskDate, setEditingTaskDate] = useState<number | null>(null);
  const [customTaskDates, setCustomTaskDates] = useState<Record<number, string>>({});
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Focus title input when editing
  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  // If parsing failed or no title, fall back to markdown
  if (!map.title && !map.dealStatus && map.milestones.length === 0) {
    return null; // Signal to use fallback renderer
  }

  // Convert parsed tasks to MAPTask format
  const allTasks: MAPTask[] = useMemo(() => {
    const tasks: MAPTask[] = [];

    if (map.topTask) {
      tasks.push({
        title: map.topTask.title,
        dueDate: map.topTask.dueDate,
        priority: map.topTask.priority,
        owner: 'Us',
        description: map.topTask.description,
      });
    }

    map.taskQueue.forEach(task => {
      tasks.push({
        title: task.title,
        dueDate: task.dueDate,
        priority: task.priority,
        owner: task.owner,
      });
    });

    return tasks;
  }, [map]);

  const handleAcceptPlan = async () => {
    // Accept all milestones when accepting the plan
    const allMilestoneIndices = new Set(map.milestones.map((_, idx) => idx));
    setAcceptedMilestones(allMilestoneIndices);

    if (!onAcceptPlan) {
      toast.success('Plan accepted! All milestones confirmed.');
      setPlanAccepted(true);
      return;
    }

    setIsAccepting(true);
    try {
      await onAcceptPlan();
      setPlanAccepted(true);
      toast.success('Plan accepted! All milestones confirmed.');
    } catch (error) {
      toast.error('Failed to accept plan');
    } finally {
      setIsAccepting(false);
    }
  };

  // Handle title editing
  const handleTitleClick = () => {
    if (!planAccepted) {
      setEditingTitle(true);
      setCustomTitle(customTitle || map.title || 'Mutual Action Plan');
    }
  };

  const handleTitleSave = () => {
    setEditingTitle(false);
    if (customTitle?.trim()) {
      toast.success('Title updated');
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setEditingTitle(false);
      setCustomTitle(null);
    }
  };

  // Handle milestone date editing
  const handleMilestoneDateClick = (idx: number) => {
    if (!acceptedMilestones.has(idx)) {
      setEditingMilestoneDate(idx);
    }
  };

  const handleMilestoneDateSave = (idx: number, newDate: string) => {
    setCustomMilestoneDates(prev => ({ ...prev, [idx]: newDate }));
    setEditingMilestoneDate(null);
    toast.success('Date updated');
  };

  // Handle task date editing
  const handleTaskDateClick = (idx: number) => {
    if (!createdTaskIndices.has(idx)) {
      setEditingTaskDate(idx);
    }
  };

  const handleTaskDateSave = (idx: number, newDate: string) => {
    setCustomTaskDates(prev => ({ ...prev, [idx]: newDate }));
    setEditingTaskDate(null);
    toast.success('Date updated');
  };

  const handleAcceptMilestone = (index: number) => {
    setAcceptedMilestones(prev => new Set([...prev, index]));
    toast.success(`Milestone accepted: ${map.milestones[index]?.title}`);
  };

  const handleAcceptAllMilestones = () => {
    const allIndices = new Set(map.milestones.map((_, idx) => idx));
    setAcceptedMilestones(allIndices);
    setPlanAccepted(true);
    toast.success('All milestones accepted!');
  };

  const handleCreateTopTask = async () => {
    if (!map.topTask) return;

    const task: MAPTask = {
      title: map.topTask.title,
      dueDate: map.topTask.dueDate,
      priority: map.topTask.priority,
      owner: 'Us',
      description: map.topTask.description,
    };

    if (!onCreateTask) {
      toast.success(`Task created: ${task.title}`);
      setTopTaskCreated(true);
      return;
    }

    setIsCreatingTask(true);
    try {
      await onCreateTask(task);
      setTopTaskCreated(true);
      toast.success(`Task created: ${task.title}`);
    } catch (error) {
      toast.error('Failed to create task');
    } finally {
      setIsCreatingTask(false);
    }
  };

  const handleCreateAllTasks = async () => {
    if (allTasks.length === 0) return;

    if (!onCreateAllTasks) {
      toast.success(`${allTasks.length} tasks created!`);
      setTopTaskCreated(true);
      setCreatedTaskIndices(new Set(allTasks.map((_, i) => i)));
      return;
    }

    setIsCreatingAll(true);
    try {
      await onCreateAllTasks(allTasks);
      setTopTaskCreated(true);
      setCreatedTaskIndices(new Set(allTasks.map((_, i) => i)));
      toast.success(`${allTasks.length} tasks created successfully!`);
    } catch (error) {
      toast.error('Failed to create tasks');
    } finally {
      setIsCreatingAll(false);
    }
  };

  const handleCreateSingleTask = async (task: MAPTask, index: number) => {
    if (!onCreateTask) {
      toast.success(`Task created: ${task.title}`);
      setCreatedTaskIndices(prev => new Set([...prev, index]));
      return;
    }

    try {
      await onCreateTask(task);
      setCreatedTaskIndices(prev => new Set([...prev, index]));
      toast.success(`Task created: ${task.title}`);
    } catch (error) {
      toast.error('Failed to create task');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Accept Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg">
            <Target className="w-5 h-5" />
          </div>
          <div>
            {editingTitle ? (
              <Input
                ref={titleInputRef}
                value={customTitle || ''}
                onChange={(e) => setCustomTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                className="text-lg font-semibold h-auto py-0.5 px-1 -ml-1 border-violet-300 focus:border-violet-500"
              />
            ) : (
              <h2
                className={cn(
                  "text-lg font-semibold text-gray-900 dark:text-gray-100 inline-flex items-center gap-2 group",
                  !planAccepted && "cursor-pointer hover:text-violet-600 dark:hover:text-violet-400"
                )}
                onClick={handleTitleClick}
              >
                {customTitle || map.title || 'Mutual Action Plan'}
                {!planAccepted && (
                  <Pencil className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </h2>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400">Strategic roadmap to close</p>
          </div>
        </div>

        {!planAccepted ? (
          <Button
            onClick={handleAcceptPlan}
            disabled={isAccepting}
            className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white"
          >
            {isAccepting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Accept Plan
          </Button>
        ) : (
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-3 py-1.5">
            <Check className="w-3 h-3 mr-1.5" />
            Plan Accepted
          </Badge>
        )}
      </div>

      {/* Deal Status Card */}
      {map.dealStatus && (
        <div className={cn(
          'rounded-xl border p-4',
          getHealthBg(map.dealStatus.healthScore)
        )}>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {map.dealStatus.name}
                </span>
                <Badge variant="outline" className={getRiskColor(map.dealStatus.risk)}>
                  {map.dealStatus.risk} Risk
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
                <span className="font-medium text-gray-900 dark:text-gray-100">{map.dealStatus.value}</span>
                <span>{map.dealStatus.probability}</span>
              </div>
            </div>
            <div className="text-right">
              <div className={cn('text-2xl font-bold', getHealthColor(map.dealStatus.healthScore))}>
                {map.dealStatus.healthScore}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Health Score</div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-200/50 dark:border-gray-700/50 grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-gray-500 dark:text-gray-400">Days in Stage</div>
              <div className="font-medium text-gray-900 dark:text-gray-100">{map.dealStatus.daysInStage}</div>
            </div>
            <div>
              <div className="text-gray-500 dark:text-gray-400">Last Activity</div>
              <div className="font-medium text-gray-900 dark:text-gray-100">{map.dealStatus.lastActivity || 'N/A'}</div>
            </div>
            <div>
              <div className="text-gray-500 dark:text-gray-400">Status</div>
              <div className="font-medium text-gray-900 dark:text-gray-100">{map.dealStatus.status || 'Active'}</div>
            </div>
          </div>

          {map.dealStatus.recommendation && (
            <div className="mt-3 pt-3 border-t border-gray-200/50 dark:border-gray-700/50 flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300">{map.dealStatus.recommendation}</span>
            </div>
          )}
        </div>
      )}

      {/* North Star */}
      {map.northStar && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 p-4">
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-800/50">
              <Target className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mb-1">
                North Star Goal
              </div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {map.northStar}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Risks & Assumptions */}
      {(map.risks.length > 0 || map.assumptions.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {map.risks.length > 0 && (
            <div className="rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10 p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium text-red-700 dark:text-red-400">Key Risks</span>
              </div>
              <ul className="space-y-2">
                {map.risks.map((risk, idx) => (
                  <li key={idx} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {map.assumptions.length > 0 && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-900/10 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium text-blue-700 dark:text-blue-400">Critical Assumptions</span>
              </div>
              <ul className="space-y-2">
                {map.assumptions.map((assumption, idx) => (
                  <li key={idx} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                    {assumption}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Milestone Roadmap */}
      {map.milestones.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Milestone className="w-4 h-4 text-violet-500" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Milestone Roadmap</span>
                <Badge variant="outline">{map.milestones.length} milestones</Badge>
              </div>
              {acceptedMilestones.size < map.milestones.length ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAcceptAllMilestones}
                  className="text-violet-600 border-violet-300 hover:bg-violet-50 dark:text-violet-400 dark:border-violet-700 dark:hover:bg-violet-900/20"
                >
                  <Check className="w-3 h-3 mr-1.5" />
                  Accept All
                </Button>
              ) : (
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <Check className="w-3 h-3 mr-1" />
                  All Accepted
                </Badge>
              )}
            </div>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {map.milestones.map((milestone, idx) => {
              const isAccepted = acceptedMilestones.has(idx);
              return (
                <div key={idx} className={cn(
                  "p-4 flex items-start gap-4 transition-colors",
                  isAccepted && "bg-emerald-50/50 dark:bg-emerald-900/10"
                )}>
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold',
                      isAccepted
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
                    )}>
                      {isAccepted ? <Check className="w-4 h-4" /> : idx + 1}
                    </div>
                    {idx < map.milestones.length - 1 && (
                      <div className={cn(
                        "w-0.5 h-full mt-2",
                        isAccepted ? "bg-emerald-200 dark:bg-emerald-700" : "bg-gray-200 dark:bg-gray-700"
                      )} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className={cn(
                          "font-medium",
                          isAccepted
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-gray-900 dark:text-gray-100"
                        )}>
                          {milestone.title}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            {getOwnerIcon(milestone.owner)}
                            {milestone.owner}
                          </span>
                          {editingMilestoneDate === idx ? (
                            <Input
                              type="date"
                              autoFocus
                              defaultValue={customMilestoneDates[idx] || milestone.dueDate}
                              className="h-6 w-32 text-xs py-0 px-1"
                              onBlur={(e) => handleMilestoneDateSave(idx, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleMilestoneDateSave(idx, (e.target as HTMLInputElement).value);
                                } else if (e.key === 'Escape') {
                                  setEditingMilestoneDate(null);
                                }
                              }}
                            />
                          ) : (
                            <span
                              className={cn(
                                "flex items-center gap-1 group",
                                !isAccepted && "cursor-pointer hover:text-violet-600 dark:hover:text-violet-400"
                              )}
                              onClick={() => handleMilestoneDateClick(idx)}
                            >
                              <Calendar className="w-3 h-3" />
                              {customMilestoneDates[idx] || milestone.dueDate}
                              {!isAccepted && (
                                <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      {!isAccepted && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleAcceptMilestone(idx)}
                          className="text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-900/20"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Accept
                        </Button>
                      )}
                    </div>
                    {milestone.exitCriteria && (
                      <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-500 uppercase">Exit Criteria:</span>
                        <span className="ml-2">{milestone.exitCriteria}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Task */}
      {map.topTask && (
        <div className="rounded-xl border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <span className="font-medium text-emerald-700 dark:text-emerald-400">Priority Task</span>
              <Badge className={getPriorityColor(map.topTask.priority)}>
                {map.topTask.priority}
              </Badge>
            </div>
            {!topTaskCreated ? (
              <Button
                size="sm"
                onClick={handleCreateTopTask}
                disabled={isCreatingTask || !planAccepted}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isCreatingTask ? (
                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                ) : (
                  <Plus className="w-3 h-3 mr-1.5" />
                )}
                Create Task
              </Button>
            ) : (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <Check className="w-3 h-3 mr-1" />
                Created
              </Badge>
            )}
          </div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{map.topTask.title}</div>
          <div className="flex items-center gap-2 mt-1 text-sm text-gray-600 dark:text-gray-400">
            <Clock className="w-3.5 h-3.5" />
            Due: {map.topTask.dueDate}
          </div>
          {map.topTask.description.length > 0 && (
            <ul className="mt-3 space-y-1">
              {map.topTask.description.map((desc, idx) => (
                <li key={idx} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                  {desc}
                </li>
              ))}
            </ul>
          )}
          {!planAccepted && (
            <div className="mt-3 pt-3 border-t border-emerald-200 dark:border-emerald-700/50">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 italic">
                Accept the plan above to enable task creation
              </p>
            </div>
          )}
        </div>
      )}

      {/* Task Queue */}
      {map.taskQueue.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListTodo className="w-4 h-4 text-blue-500" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Full Task Queue</span>
                <Badge variant="outline">{map.taskQueue.length} tasks</Badge>
              </div>
              {createdTaskIndices.size < map.taskQueue.length ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCreateAllTasks}
                  disabled={isCreatingAll || !planAccepted}
                >
                  {isCreatingAll ? (
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                  ) : (
                    <Plus className="w-3 h-3 mr-1.5" />
                  )}
                  Create All
                </Button>
              ) : (
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <Check className="w-3 h-3 mr-1" />
                  All Created
                </Badge>
              )}
            </div>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {map.taskQueue.map((task, idx) => {
              const isCreated = createdTaskIndices.has(idx + 1); // +1 because top task is index 0
              const mapTask: MAPTask = {
                title: task.title,
                dueDate: customTaskDates[idx] || task.dueDate,
                priority: task.priority,
                owner: task.owner,
              };

              return (
                <div key={idx} className="px-4 py-3 flex items-center gap-4">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                    isCreated
                      ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                  )}>
                    {isCreated ? <Check className="w-3 h-3" /> : idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={cn(
                      "font-medium truncate",
                      isCreated
                        ? "text-gray-500 dark:text-gray-500 line-through"
                        : "text-gray-900 dark:text-gray-100"
                    )}>
                      {task.title}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {editingTaskDate === idx ? (
                        <Input
                          type="date"
                          autoFocus
                          defaultValue={customTaskDates[idx] || task.dueDate}
                          className="h-5 w-28 text-xs py-0 px-1"
                          onBlur={(e) => handleTaskDateSave(idx, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleTaskDateSave(idx, (e.target as HTMLInputElement).value);
                            } else if (e.key === 'Escape') {
                              setEditingTaskDate(null);
                            }
                          }}
                        />
                      ) : (
                        <span
                          className={cn(
                            "flex items-center gap-1 group",
                            !isCreated && "cursor-pointer hover:text-violet-600 dark:hover:text-violet-400"
                          )}
                          onClick={() => handleTaskDateClick(idx)}
                        >
                          {customTaskDates[idx] || task.dueDate}
                          {!isCreated && (
                            <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        {getOwnerIcon(task.owner)}
                        {task.owner}
                      </span>
                    </div>
                  </div>
                  <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>
                  {!isCreated && planAccepted && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => handleCreateSingleTask(mapTask, idx + 1)}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          {!planAccepted && (
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                Accept the plan to enable task creation
              </p>
            </div>
          )}
        </div>
      )}

      {/* Critical Path */}
      {(map.criticalPath || map.nextAction) && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-amber-500" />
            <span className="font-medium text-amber-700 dark:text-amber-400">Critical Path</span>
          </div>
          {map.criticalPath && (
            <div className="text-sm text-gray-700 dark:text-gray-300 mb-3 flex flex-wrap items-center gap-1">
              {map.criticalPath.split(/→|->/).map((step, idx, arr) => (
                <span key={idx} className="flex items-center gap-1">
                  <span className="px-2 py-0.5 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 text-xs">
                    {step.trim()}
                  </span>
                  {idx < arr.length - 1 && <ArrowRight className="w-3 h-3 text-amber-500" />}
                </span>
              ))}
            </div>
          )}
          {map.nextAction && (
            <div className="flex items-start gap-2 pt-3 border-t border-amber-200 dark:border-amber-700/50">
              <Flag className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{map.nextAction}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Check if content looks like a MAP output
 */
export function isMAPContent(content: string): boolean {
  return content.includes('Mutual Action Plan') ||
         (content.includes('Milestone') && content.includes('Owner') && content.includes('Due Date'));
}
