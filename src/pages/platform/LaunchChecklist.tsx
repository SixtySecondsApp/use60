/**
 * LaunchChecklist - Platform Admin Launch Readiness Tracker
 * 
 * Visual checklist for tracking progress on MVP launch tasks.
 * Persists to database so all admins can see and update progress.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Rocket,
  Target,
  Zap,
  RefreshCw,
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  ArrowLeft,
  Loader2,
  Calendar,
  User,
  MessageSquare,
} from 'lucide-react';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

interface ChecklistItem {
  id: string;
  task_id: string;
  category: 'p0' | 'p1' | 'p2' | 'completed';
  title: string;
  description: string | null;
  effort_hours: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  subtasks: Subtask[];
  order_index: number;
  created_at: string;
  updated_at: string;
}

const categoryConfig = {
  p0: {
    label: 'P0 - Critical',
    description: 'Must complete before launch',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10 border-red-500/20',
    icon: AlertTriangle,
  },
  p1: {
    label: 'P1 - Important',
    description: 'Should complete in launch week',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10 border-yellow-500/20',
    icon: Clock,
  },
  p2: {
    label: 'P2 - Nice to Have',
    description: 'Can add after launch',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10 border-blue-500/20',
    icon: Target,
  },
  completed: {
    label: 'Completed',
    description: 'Done!',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10 border-emerald-500/20',
    icon: CheckCircle2,
  },
};

const statusConfig: Record<string, { label: string; color: string; textColor: string }> = {
  pending: { label: 'To Do', color: 'bg-gray-500', textColor: 'text-gray-400' },
  in_progress: { label: 'In Progress', color: 'bg-blue-500', textColor: 'text-blue-400' },
  completed: { label: 'Done', color: 'bg-emerald-500', textColor: 'text-emerald-400' },
  blocked: { label: 'Blocked', color: 'bg-red-500', textColor: 'text-red-400' },
};

// Fallback for unknown status values
const defaultStatusConfig = { label: 'Unknown', color: 'bg-gray-500', textColor: 'text-gray-400' };
const getStatusConfig = (status: string | null | undefined) => 
  statusConfig[status ?? ''] ?? defaultStatusConfig;

export default function LaunchChecklist() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesText, setNotesText] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // Load checklist items
  const loadItems = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('launch_checklist_items')
        .select('*')
        .order('category')
        .order('order_index');

      if (error) throw error;

      // Parse subtasks from JSONB
      const parsedItems = (data || []).map(item => ({
        ...item,
        subtasks: Array.isArray(item.subtasks) ? item.subtasks : JSON.parse(item.subtasks || '[]'),
      })) as ChecklistItem[];

      setItems(parsedItems);
    } catch (error) {
      console.error('Error loading checklist:', error);
      toast.error('Failed to load checklist');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Toggle item status
  const toggleItemStatus = async (item: ChecklistItem) => {
    const newStatus = item.status === 'completed' ? 'pending' : 'completed';
    const newCategory = newStatus === 'completed' ? 'completed' : item.category === 'completed' ? 'p0' : item.category;

    try {
      const { error } = await supabase
        .from('launch_checklist_items')
        .update({
          status: newStatus,
          category: newCategory,
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
          completed_by: newStatus === 'completed' ? (await supabase.auth.getUser()).data.user?.id : null,
        })
        .eq('id', item.id);

      if (error) throw error;

      // Update local state
      setItems(prev => prev.map(i => 
        i.id === item.id 
          ? { ...i, status: newStatus, category: newCategory, completed_at: newStatus === 'completed' ? new Date().toISOString() : null }
          : i
      ));

      toast.success(newStatus === 'completed' ? '✅ Task completed!' : 'Task reopened');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  // Toggle subtask
  const toggleSubtask = async (item: ChecklistItem, subtaskId: string) => {
    const updatedSubtasks = item.subtasks.map(st =>
      st.id === subtaskId ? { ...st, completed: !st.completed } : st
    );

    // Check if all subtasks are now completed
    const allCompleted = updatedSubtasks.every(st => st.completed);
    const newStatus = allCompleted ? 'completed' : item.status === 'completed' ? 'in_progress' : item.status;
    const newCategory = allCompleted ? 'completed' : item.category === 'completed' ? 'p0' : item.category;

    try {
      const { error } = await supabase
        .from('launch_checklist_items')
        .update({
          subtasks: updatedSubtasks,
          status: newStatus,
          category: newCategory,
          completed_at: allCompleted ? new Date().toISOString() : null,
        })
        .eq('id', item.id);

      if (error) throw error;

      setItems(prev => prev.map(i =>
        i.id === item.id
          ? { ...i, subtasks: updatedSubtasks, status: newStatus, category: newCategory }
          : i
      ));

      if (allCompleted) {
        toast.success('🎉 All subtasks complete! Task marked as done.');
      }
    } catch (error) {
      console.error('Error updating subtask:', error);
      toast.error('Failed to update subtask');
    }
  };

  // Save notes
  const saveNotes = async (itemId: string) => {
    setSavingNotes(true);
    try {
      const { error } = await supabase
        .from('launch_checklist_items')
        .update({ notes: notesText })
        .eq('id', itemId);

      if (error) throw error;

      setItems(prev => prev.map(i =>
        i.id === itemId ? { ...i, notes: notesText } : i
      ));
      setEditingNotes(null);
      toast.success('Notes saved');
    } catch (error) {
      console.error('Error saving notes:', error);
      toast.error('Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  // Set item status
  const setItemStatus = async (item: ChecklistItem, status: ChecklistItem['status']) => {
    try {
      const { error } = await supabase
        .from('launch_checklist_items')
        .update({ status })
        .eq('id', item.id);

      if (error) throw error;

      setItems(prev => prev.map(i =>
        i.id === item.id ? { ...i, status } : i
      ));
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  // Calculate progress
  const calculateProgress = (category: string) => {
    const categoryItems = items.filter(i => i.category === category || (category === 'all' ? true : false));
    if (categoryItems.length === 0) return 0;
    const completed = categoryItems.filter(i => i.status === 'completed').length;
    return Math.round((completed / categoryItems.length) * 100);
  };

  const totalProgress = () => {
    const nonCompleted = items.filter(i => i.category !== 'completed');
    if (nonCompleted.length === 0) return 100;
    const done = nonCompleted.filter(i => i.status === 'completed').length;
    return Math.round((done / nonCompleted.length) * 100);
  };

  // Group items by category
  const groupedItems = {
    p0: items.filter(i => i.category === 'p0'),
    p1: items.filter(i => i.category === 'p1'),
    p2: items.filter(i => i.category === 'p2'),
    completed: items.filter(i => i.category === 'completed'),
  };

  // Calculate hours
  const parseHours = (effort: string | null): number => {
    if (!effort) return 0;
    const match = effort.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  };

  const totalHoursRemaining = items
    .filter(i => i.status !== 'completed' && i.category !== 'completed')
    .reduce((sum, i) => sum + parseHours(i.effort_hours), 0);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <BackToPlatform />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/platform')}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Platform Admin
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadItems}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>

          <div className="mt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-purple-500">
                <Rocket className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  MVP Launch Checklist
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Track progress on launch-critical tasks
                </p>
              </div>
            </div>

            {/* Progress Overview */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-emerald-500/10 to-purple-500/10 border-emerald-500/20">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Overall Progress</p>
                      <p className="text-3xl font-bold text-emerald-500">{totalProgress()}%</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <Target className="h-6 w-6 text-emerald-500" />
                    </div>
                  </div>
                  <Progress value={totalProgress()} className="mt-3 h-2" />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">P0 Critical</p>
                      <p className="text-2xl font-bold text-red-500">
                        {groupedItems.p0.filter(i => i.status === 'completed').length}/{groupedItems.p0.length}
                      </p>
                    </div>
                    <AlertTriangle className="h-8 w-8 text-red-500/50" />
                  </div>
                  <Progress value={calculateProgress('p0')} className="mt-3 h-2 [&>div]:bg-red-500" />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">P1 Important</p>
                      <p className="text-2xl font-bold text-yellow-500">
                        {groupedItems.p1.filter(i => i.status === 'completed').length}/{groupedItems.p1.length}
                      </p>
                    </div>
                    <Clock className="h-8 w-8 text-yellow-500/50" />
                  </div>
                  <Progress value={calculateProgress('p1')} className="mt-3 h-2 [&>div]:bg-yellow-500" />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Hours Remaining</p>
                      <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                        ~{totalHoursRemaining}h
                      </p>
                    </div>
                    <Zap className="h-8 w-8 text-purple-500/50" />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Estimated effort for remaining tasks
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Checklist Content */}
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {(['p0', 'p1', 'p2', 'completed'] as const).map((category) => {
          const config = categoryConfig[category];
          const categoryItems = groupedItems[category];
          
          if (categoryItems.length === 0 && category !== 'completed') return null;

          return (
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Category Header */}
              <div className={cn('flex items-center gap-3 p-4 rounded-lg border', config.bgColor)}>
                <config.icon className={cn('h-5 w-5', config.color)} />
                <div className="flex-1">
                  <h2 className={cn('font-semibold', config.color)}>{config.label}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{config.description}</p>
                </div>
                <Badge variant="outline" className={config.color}>
                  {categoryItems.filter(i => i.status === 'completed').length}/{categoryItems.length}
                </Badge>
              </div>

              {/* Items */}
              <div className="space-y-3">
                <AnimatePresence>
                  {categoryItems.map((item) => {
                    const isExpanded = expandedItems.has(item.id);
                    const completedSubtasks = item.subtasks.filter(st => st.completed).length;
                    const subtaskProgress = item.subtasks.length > 0
                      ? Math.round((completedSubtasks / item.subtasks.length) * 100)
                      : 0;

                    return (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                      >
                        <Card className={cn(
                          'transition-all duration-200',
                          item.status === 'completed' && 'opacity-75'
                        )}>
                          <CardContent className="p-4">
                            {/* Main Item Row */}
                            <div className="flex items-start gap-4">
                              {/* Checkbox */}
                              <button
                                onClick={() => toggleItemStatus(item)}
                                className="mt-1 flex-shrink-0"
                              >
                                {item.status === 'completed' ? (
                                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                                ) : (
                                  <Circle className="h-6 w-6 text-gray-400 hover:text-emerald-500 transition-colors" />
                                )}
                              </button>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <h3 className={cn(
                                      'font-medium',
                                      item.status === 'completed'
                                        ? 'text-gray-500 line-through'
                                        : 'text-gray-900 dark:text-white'
                                    )}>
                                      {item.title}
                                    </h3>
                                    {item.description && (
                                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        {item.description}
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {item.effort_hours && (
                                      <Badge variant="outline" className="text-xs">
                                        {item.effort_hours}
                                      </Badge>
                                    )}
                                    <Badge
                                      variant="outline"
                                      className={cn('text-xs', getStatusConfig(item.status).textColor)}
                                    >
                                      {getStatusConfig(item.status).label}
                                    </Badge>
                                  </div>
                                </div>

                                {/* Subtasks Progress Bar */}
                                {item.subtasks.length > 0 && (
                                  <div className="mt-3">
                                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                                      <span>Subtasks: {completedSubtasks}/{item.subtasks.length}</span>
                                      <span>{subtaskProgress}%</span>
                                    </div>
                                    <Progress value={subtaskProgress} className="h-1.5" />
                                  </div>
                                )}

                                {/* Completed Info */}
                                {item.completed_at && (
                                  <div className="mt-2 flex items-center gap-2 text-xs text-emerald-500">
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span>Completed {format(new Date(item.completed_at), 'MMM d, yyyy h:mm a')}</span>
                                  </div>
                                )}
                              </div>

                              {/* Expand Button */}
                              <button
                                onClick={() => {
                                  const newExpanded = new Set(expandedItems);
                                  if (isExpanded) {
                                    newExpanded.delete(item.id);
                                  } else {
                                    newExpanded.add(item.id);
                                  }
                                  setExpandedItems(newExpanded);
                                }}
                                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-5 w-5" />
                                ) : (
                                  <ChevronRight className="h-5 w-5" />
                                )}
                              </button>
                            </div>

                            {/* Expanded Content */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="mt-4 ml-10 space-y-4">
                                    {/* Status Selector */}
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-gray-500">Status:</span>
                                      {(['pending', 'in_progress', 'completed', 'blocked'] as const).map((status) => (
                                        <button
                                          key={status}
                                          onClick={() => setItemStatus(item, status)}
                                          className={cn(
                                            'px-2 py-1 text-xs rounded-full transition-colors',
                                            item.status === status
                                              ? cn(getStatusConfig(status).color, 'text-white')
                                              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                          )}
                                        >
                                          {getStatusConfig(status).label}
                                        </button>
                                      ))}
                                    </div>

                                    {/* Subtasks */}
                                    {item.subtasks.length > 0 && (
                                      <div className="space-y-2">
                                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                          Subtasks
                                        </h4>
                                        <div className="space-y-1">
                                          {item.subtasks.map((subtask) => (
                                            <button
                                              key={subtask.id}
                                              onClick={() => toggleSubtask(item, subtask.id)}
                                              className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                                            >
                                              {subtask.completed ? (
                                                <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                                              ) : (
                                                <Circle className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                              )}
                                              <span className={cn(
                                                'text-sm',
                                                subtask.completed
                                                  ? 'text-gray-500 line-through'
                                                  : 'text-gray-700 dark:text-gray-300'
                                              )}>
                                                {subtask.title}
                                              </span>
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Notes */}
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                          <MessageSquare className="h-4 w-4" />
                                          Notes
                                        </h4>
                                        {editingNotes !== item.id && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                              setEditingNotes(item.id);
                                              setNotesText(item.notes || '');
                                            }}
                                            className="h-7 px-2 text-xs"
                                          >
                                            <Edit2 className="h-3 w-3 mr-1" />
                                            Edit
                                          </Button>
                                        )}
                                      </div>
                                      
                                      {editingNotes === item.id ? (
                                        <div className="space-y-2">
                                          <Textarea
                                            value={notesText}
                                            onChange={(e) => setNotesText(e.target.value)}
                                            placeholder="Add notes about this task..."
                                            className="min-h-[80px]"
                                          />
                                          <div className="flex gap-2">
                                            <Button
                                              size="sm"
                                              onClick={() => saveNotes(item.id)}
                                              disabled={savingNotes}
                                            >
                                              {savingNotes ? (
                                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                              ) : (
                                                <Save className="h-4 w-4 mr-1" />
                                              )}
                                              Save
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => setEditingNotes(null)}
                                            >
                                              Cancel
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
                                          {item.notes || 'No notes yet. Click Edit to add notes.'}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}

        {/* Launch Ready Banner */}
        {totalProgress() === 100 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center p-8 rounded-xl bg-gradient-to-r from-emerald-500 to-purple-500"
          >
            <Rocket className="h-12 w-12 text-white mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">
              🎉 Launch Ready!
            </h2>
            <p className="text-emerald-100">
              All critical tasks completed. You're ready to onboard your first users!
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
