import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wand2,
  FileEdit,
  XCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  MessageSquare,
} from 'lucide-react';
import { ActivityTimeline } from './ActivityTimeline';
import { CommentSection } from './CommentSection';
import { Task } from '@/lib/database/models';
import { Button } from '@/components/ui/button';
import { SlashCommandDropdown, type SlashCommand } from './SlashCommandDropdown';
import { CanvasConversation, type ConversationMessage } from './CanvasConversation';
import { useCommandCentreSkills, type CommandCentreSkill } from '@/lib/hooks/useCommandCentreSkills';
import { useExecuteSkillForTask } from '@/lib/hooks/useExecuteSkillForTask';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

/** Map deliverable_type to a default skill key for "Do this" */
const DELIVERABLE_SKILL_MAP: Record<string, string> = {
  email_draft: 'email-send-as-rep',
  research_brief: 'company-research',
  meeting_prep: 'meeting-prep-brief',
  content_draft: 'post-meeting-followup-drafter',
  proposal: 'proposal-generator',
  follow_up: 'post-meeting-followup-drafter',
};

interface WritingCanvasProps {
  task: Task;
  organizationId?: string | null;
  onSaveContent?: (content: string) => void;
  onSaveMetadata?: (metadata: Record<string, unknown>) => void;
}

export function WritingCanvas({ task, organizationId, onSaveContent, onSaveMetadata }: WritingCanvasProps) {
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [canvasContent, setCanvasContent] = useState('');
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const [canvasVersions, setCanvasVersions] = useState<string[]>([]);
  const [showUndoButton, setShowUndoButton] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const canvasRef = useRef<HTMLTextAreaElement>(null);

  const { data: skills } = useCommandCentreSkills(organizationId ?? null);
  const executeSkill = useExecuteSkillForTask();
  const queryClient = useQueryClient();

  const isAIDoing = executeSkill.isPending || task.ai_status === 'working';
  const isFailed = task.ai_status === 'failed';

  const handleCancelAI = async () => {
    const { error } = await supabase
      .from('tasks')
      .update({ ai_status: 'none', updated_at: new Date().toISOString() })
      .eq('id', task.id);
    if (error) {
      toast.error('Failed to cancel AI task');
    } else {
      toast.success('AI task cancelled');
      queryClient.invalidateQueries({ queryKey: ['command-centre-tasks'] });
    }
  };

  const handleRetry = () => {
    const skillKey =
      DELIVERABLE_SKILL_MAP[task.deliverable_type || ''] ||
      'post-meeting-followup-drafter';
    executeSkill.mutate({ taskId: task.id, skillKey });
  };

  // Sync canvas content from task when task changes
  useEffect(() => {
    const getContent = (): string => {
      if (task.deliverable_type === 'email_draft' && task.deliverable_data) {
        return (task.deliverable_data as any)?.body || '';
      }
      if (task.metadata?.deliverable_content) {
        return task.metadata.deliverable_content as string;
      }
      // Show content_draft markdown content
      if (task.deliverable_data && (task.deliverable_data as any)?.content) {
        return (task.deliverable_data as any).content;
      }
      return task.description || '';
    };
    setCanvasContent(getContent());
  }, [task.id, task.deliverable_type, task.deliverable_data, task.metadata, task.description]);

  // Debounced auto-save canvas content to task deliverable_data
  useEffect(() => {
    if (!canvasContent || !task?.id) return;
    const timer = setTimeout(() => {
      onSaveContent?.(canvasContent);
    }, 1500);
    return () => clearTimeout(timer);
  }, [canvasContent, task?.id, onSaveContent]);

  // Load conversation from task metadata when task changes
  useEffect(() => {
    if (task.metadata?.canvas_conversation) {
      setConversationMessages(task.metadata.canvas_conversation as ConversationMessage[]);
    } else {
      setConversationMessages([]);
    }
    setCanvasVersions(task.metadata?.canvas_versions as string[] || []);
    setShowUndoButton(false);
  }, [task.id]);

  // Debounced persist conversation to task metadata
  useEffect(() => {
    if (conversationMessages.length === 0 || !task?.id) return;
    const timer = setTimeout(() => {
      onSaveMetadata?.({ canvas_conversation: conversationMessages });
    }, 2000);
    return () => clearTimeout(timer);
  }, [conversationMessages, task?.id, onSaveMetadata]);

  // Debounced persist canvas versions to task metadata
  useEffect(() => {
    if (!task?.id || canvasVersions.length === 0) return;
    const timer = setTimeout(() => {
      onSaveMetadata?.({ canvas_versions: canvasVersions });
    }, 2000);
    return () => clearTimeout(timer);
  }, [canvasVersions, task?.id, onSaveMetadata]);

  const simulateStreaming = async (finalContent: string) => {
    const words = finalContent.split(' ');
    let accumulated = '';

    for (let i = 0; i < words.length; i++) {
      accumulated += (i > 0 ? ' ' : '') + words[i];
      setCanvasContent(accumulated);
      await new Promise((r) => setTimeout(r, Math.max(10, 30 - Math.floor(i / 10))));
    }

    setCanvasContent(finalContent);
  };

  const handleUndo = useCallback(() => {
    if (canvasVersions.length === 0) return;

    const previousContent = canvasVersions[canvasVersions.length - 1];
    setCanvasContent(previousContent);
    setCanvasVersions(prev => prev.slice(0, -1));

    setConversationMessages(prev => {
      const lastAiIndex = prev.findLastIndex(m => m.role === 'assistant');
      if (lastAiIndex >= 0) {
        return prev.slice(0, lastAiIndex);
      }
      return prev;
    });

    if (onSaveContent) {
      onSaveContent(previousContent);
    }

    toast.info('Reverted to previous version');

    if (canvasVersions.length <= 1) {
      setShowUndoButton(false);
    }
  }, [canvasVersions, onSaveContent]);

  // Cmd+Z / Ctrl+Z undo when canvas is focused
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && showUndoButton) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showUndoButton, handleUndo]);

  const handleSendMessage = async (message: string) => {
    const userMsg: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    setConversationMessages((prev) => [...prev, userMsg]);
    setIsConversationLoading(true);

    // Snapshot current content before AI modifies canvas
    setCanvasVersions(prev => {
      const updated = [...prev, canvasContent];
      return updated.slice(-10);
    });

    try {
      const { data, error } = await supabase.functions.invoke('unified-task-ai-worker', {
        body: {
          action: 'refine_canvas',
          task_id: task.id,
          current_content: canvasContent,
          conversation_history: conversationMessages,
          user_instruction: message,
        },
      });

      if (error) throw error;

      const newContent = data?.content || data?.refined_content || canvasContent;
      await simulateStreaming(newContent);
      setShowUndoButton(true);

      const aiMsg: ConversationMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Canvas updated.',
        timestamp: new Date().toISOString(),
      };
      setConversationMessages((prev) => [...prev, aiMsg]);

      if (onSaveContent) {
        onSaveContent(newContent);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update canvas');
      const errMsg: ConversationMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: "Sorry, I couldn't update the canvas. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setConversationMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsConversationLoading(false);
    }
  };

  const handleCanvasKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === '/' && !showSlashMenu) {
      setShowSlashMenu(true);
      setSlashFilter('');
    } else if (showSlashMenu) {
      if (e.key === 'Escape') {
        setShowSlashMenu(false);
      }
    }
  };

  const handleCanvasInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const lastSlashIdx = val.lastIndexOf('/');
    if (showSlashMenu && lastSlashIdx >= 0) {
      setSlashFilter(val.slice(lastSlashIdx));
    }
  };

  const handleSlashSelect = (cmd: SlashCommand) => {
    setShowSlashMenu(false);
    executeSkill.mutate({ taskId: task.id, skillKey: cmd.skillKey });
  };

  const handleDoThis = () => {
    // Pick the best skill based on deliverable_type or fall back to content draft skill
    const skillKey =
      DELIVERABLE_SKILL_MAP[task.deliverable_type || ''] ||
      'post-meeting-followup-drafter';

    executeSkill.mutate({ taskId: task.id, skillKey });
  };

  // Determine if task is completed
  const isCompleted = task.status === 'completed';
  const hasContent = !!canvasContent;

  return (
    <div className="flex flex-col h-full">
      {/* Canvas toolbar — minimal */}
      <div className="shrink-0 flex items-center justify-end px-4 py-1.5 border-b border-slate-100 dark:border-gray-700/30">
        {!isCompleted && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={handleDoThis}
              disabled={isAIDoing}
            >
              {isAIDoing ? (
                <>AI working...</>
              ) : (
                <><Wand2 className="h-3 w-3" /> Do this</>
              )}
            </Button>
            <span className="text-[10px] text-slate-300 dark:text-gray-600">
              Type <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-gray-800 text-[9px] font-mono">/</kbd> for commands
            </span>
          </div>
        )}
      </div>

      {/* Undo banner */}
      {showUndoButton && canvasVersions.length > 0 && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
          <span className="text-xs text-amber-700 dark:text-amber-300">AI edited this draft</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1 text-amber-700 hover:text-amber-900"
            onClick={handleUndo}
          >
            <RotateCcw className="h-3 w-3" />
            Undo
          </Button>
        </div>
      )}

      {/* Canvas content */}
      <div className="flex-1 overflow-y-auto">
        {/* AI working overlay */}
        <AnimatePresence>
          {isFailed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="sticky top-0 z-10 mx-4 mt-3"
            >
              <div className="flex items-center justify-between rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5 px-4 py-3">
                <div className="flex items-center gap-3">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <div>
                    <p className="text-xs font-medium text-red-700 dark:text-red-400">AI draft failed</p>
                    <p className="text-[11px] text-red-500 dark:text-red-400/60">Something went wrong. You can retry or write manually.</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-500/10 gap-1"
                  onClick={handleRetry}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Retry
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {isAIDoing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="sticky top-0 z-10 mx-4 mt-3"
            >
              <div className="flex items-center justify-between rounded-md border border-slate-200 dark:border-gray-700/50 bg-slate-50 dark:bg-gray-800/30 px-3 py-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  <p className="text-xs text-slate-500 dark:text-gray-400">AI is drafting content...</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-violet-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 gap-1"
                  onClick={handleCancelAI}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 px-8 py-6 max-w-3xl mx-auto w-full">
          {!isCompleted ? (
            <div className="relative">
              {isConversationLoading && (
                <div className="absolute top-0 right-0 flex items-center gap-1.5 text-[10px] text-slate-400 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded px-2 py-0.5 z-10">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  Editing...
                </div>
              )}
              <textarea
                ref={canvasRef}
                value={canvasContent}
                onChange={(e) => setCanvasContent(e.target.value)}
                placeholder="Start writing or type / for AI commands..."
                className={`w-full h-full min-h-[200px] resize-none bg-transparent text-sm text-slate-700 dark:text-gray-300 leading-relaxed placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:outline-none transition-all duration-200 ${isConversationLoading ? 'ring-1 ring-violet-300 dark:ring-violet-500/30 rounded' : ''}`}
              />
            </div>
          ) : hasContent ? (
            <div className="prose prose-sm dark:prose-invert max-w-none
              prose-headings:font-semibold prose-headings:text-slate-800 dark:prose-headings:text-gray-200
              prose-p:text-slate-600 dark:prose-p:text-gray-400 prose-p:leading-relaxed
              prose-strong:text-slate-800 dark:prose-strong:text-gray-200
            ">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{canvasContent}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                <FileEdit className="h-6 w-6 text-slate-300 dark:text-gray-600" />
              </div>
              <p className="text-sm font-medium text-slate-500 dark:text-gray-400 mb-1">No content yet</p>
              <p className="text-xs text-slate-400 dark:text-gray-500 mb-4">
                Start writing or let AI generate a draft
              </p>
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={handleDoThis}
                disabled={isAIDoing}
              >
                {isAIDoing ? (
                  <>Working...</>
                ) : (
                  <><Wand2 className="h-3.5 w-3.5" /> Do this for me</>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Activity & Comments - collapsible */}
      {(() => {
        const activityLog = (task.metadata?.activity_log as any[]) || [];
        const comments = (task.metadata?.comments as any[]) || [];
        const hasActivityOrComments = activityLog.length > 0 || comments.length > 0;
        if (!hasActivityOrComments) return null;
        return (
          <div className="shrink-0 border-t border-slate-100 dark:border-gray-700/30">
            <button
              onClick={() => setShowActivity(!showActivity)}
              className="flex items-center gap-2 w-full px-4 py-2 text-xs text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800/30 transition-colors"
            >
              <MessageSquare className="h-3 w-3" />
              Activity & Notes
              {comments.length > 0 && (
                <span className="text-[10px] bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-full px-1.5">
                  {comments.length}
                </span>
              )}
              <span className="ml-auto">
                {showActivity ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
              </span>
            </button>
            {showActivity && (
              <div className="px-4 pb-3 space-y-4 max-h-48 overflow-y-auto">
                {activityLog.length > 0 && <ActivityTimeline activities={activityLog} />}
                <CommentSection taskId={task.id} comments={comments} />
              </div>
            )}
          </div>
        );
      })()}

      {/* Bottom conversation area */}
      {!isCompleted && (
        <div className="shrink-0 bg-white dark:bg-gray-900/80 relative">
          <AnimatePresence>
            {showSlashMenu && (
              <div className="absolute bottom-full left-0 right-0 px-3 pb-1 z-20">
                <SlashCommandDropdown
                  filter={slashFilter}
                  onSelect={handleSlashSelect}
                  onClose={() => setShowSlashMenu(false)}
                  commands={skills}
                />
              </div>
            )}
          </AnimatePresence>
          <CanvasConversation
            messages={conversationMessages}
            onSendMessage={handleSendMessage}
            isLoading={isConversationLoading}
          />
        </div>
      )}
    </div>
  );
}
