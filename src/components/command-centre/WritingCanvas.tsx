import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bold,
  Italic,
  Link,
  List,
  ListOrdered,
  AtSign,
  Paperclip,
  Image,
  Wand2,
  Loader2,
  FileEdit,
  CornerDownLeft,
} from 'lucide-react';
import { Task } from '@/lib/database/models';
import { Button } from '@/components/ui/button';
import { SlashCommandDropdown, type SlashCommand } from './SlashCommandDropdown';
import { useCommandCentreSkills, type CommandCentreSkill } from '@/lib/hooks/useCommandCentreSkills';
import { useExecuteSkillForTask } from '@/lib/hooks/useExecuteSkillForTask';

/** Map deliverable_type to a default skill key for "Do this" */
const DELIVERABLE_SKILL_MAP: Record<string, string> = {
  email_draft: 'email-send-as-rep',
  research_brief: 'company-research',
  meeting_prep: 'meeting-prep-brief',
  content_draft: 'post-meeting-followup-drafter',
};

interface WritingCanvasProps {
  task: Task;
  organizationId?: string | null;
}

export function WritingCanvas({ task, organizationId }: WritingCanvasProps) {
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [canvasContent, setCanvasContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canvasRef = useRef<HTMLTextAreaElement>(null);

  const { data: skills } = useCommandCentreSkills(organizationId ?? null);
  const executeSkill = useExecuteSkillForTask();

  const isAIDoing = executeSkill.isPending || task.ai_status === 'working';

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
      {/* Canvas toolbar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-gray-700/50 bg-slate-50/50 dark:bg-gray-800/30">
        <div className="flex items-center gap-0.5">
          {[
            { icon: Bold, label: 'Bold' },
            { icon: Italic, label: 'Italic' },
            { icon: Link, label: 'Link' },
            null,
            { icon: List, label: 'Bullet list' },
            { icon: ListOrdered, label: 'Numbered list' },
            null,
            { icon: AtSign, label: 'Mention' },
            { icon: Paperclip, label: 'Attach' },
            { icon: Image, label: 'Image' },
          ].map((item, i) =>
            item === null ? (
              <div key={i} className="w-px h-4 bg-slate-200 dark:bg-gray-700 mx-1" />
            ) : (
              <button
                key={item.label}
                className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-gray-700/50 text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 transition-colors"
                title={item.label}
              >
                <item.icon className="h-3.5 w-3.5" />
              </button>
            )
          )}
        </div>

        {/* "Do this" button */}
        {!isCompleted && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5 border-violet-200 dark:border-violet-500/30 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10"
              onClick={handleDoThis}
              disabled={isAIDoing}
            >
              {isAIDoing ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> AI working...</>
              ) : (
                <><Wand2 className="h-3 w-3" /> Do this</>
              )}
            </Button>
            <span className="text-[10px] text-slate-400 dark:text-gray-500">
              Type <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-gray-800 text-[9px] font-mono">/</kbd> for commands
            </span>
          </div>
        )}
      </div>

      {/* Canvas content */}
      <div className="flex-1 overflow-y-auto">
        {/* AI working overlay */}
        <AnimatePresence>
          {isAIDoing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="sticky top-0 z-10 mx-4 mt-3"
            >
              <div className="flex items-center gap-3 rounded-lg border border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/5 px-4 py-3">
                <Loader2 className="h-4 w-4 text-violet-500 animate-spin" />
                <div>
                  <p className="text-xs font-medium text-violet-700 dark:text-violet-400">AI is drafting content...</p>
                  <p className="text-[11px] text-violet-500 dark:text-violet-400/60">Reading task context, meeting notes, and contact history</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 px-8 py-6 max-w-3xl mx-auto w-full">
          {!isCompleted ? (
            <textarea
              ref={canvasRef}
              value={canvasContent}
              onChange={(e) => setCanvasContent(e.target.value)}
              placeholder="Start writing or type / for AI commands..."
              className="w-full h-full min-h-[200px] resize-none bg-transparent text-sm text-slate-700 dark:text-gray-300 leading-relaxed placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:outline-none"
            />
          ) : hasContent ? (
            <div className="prose prose-sm dark:prose-invert max-w-none
              prose-headings:font-semibold prose-headings:text-slate-800 dark:prose-headings:text-gray-200
              prose-p:text-slate-600 dark:prose-p:text-gray-400 prose-p:leading-relaxed
              prose-strong:text-slate-800 dark:prose-strong:text-gray-200
            ">
              {canvasContent.split('\n').map((line, i) => {
                if (line.startsWith('# ')) return <h1 key={i}>{line.slice(2)}</h1>;
                if (line.startsWith('## ')) return <h2 key={i}>{line.slice(3)}</h2>;
                if (line.startsWith('### ')) return <h3 key={i}>{line.slice(4)}</h3>;
                if (line.trim() === '---') return <hr key={i} />;
                if (line.startsWith('- ')) {
                  return (
                    <div key={i} className="flex items-start gap-2 py-0.5">
                      <span className="text-slate-400 mt-1.5">·</span>
                      <span dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                    </div>
                  );
                }
                if (!line.trim()) return <div key={i} className="h-3" />;
                return (
                  <p key={i} dangerouslySetInnerHTML={{
                    __html: line
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\*(.*?)\*/g, '<em>$1</em>')
                      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
                  }} />
                );
              })}
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
                className="h-8 text-xs gap-1.5 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700"
                onClick={handleDoThis}
                disabled={isAIDoing}
              >
                {isAIDoing ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Working...</>
                ) : (
                  <><Wand2 className="h-3.5 w-3.5" /> Do this for me</>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom input area with slash commands */}
      {!isCompleted && (
        <div className="shrink-0 border-t border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-900/80 px-4 py-3">
          <div className="relative">
            <AnimatePresence>
              {showSlashMenu && (
                <SlashCommandDropdown
                  filter={slashFilter}
                  onSelect={handleSlashSelect}
                  onClose={() => setShowSlashMenu(false)}
                  commands={skills}
                />
              )}
            </AnimatePresence>
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  placeholder="Type / for AI commands, or add notes..."
                  onKeyDown={handleCanvasKeyDown}
                  onChange={handleCanvasInput}
                  className="w-full resize-none rounded-lg border border-slate-200 dark:border-gray-700/50 bg-slate-50/50 dark:bg-gray-800/50 px-3 py-2 text-xs text-slate-700 dark:text-gray-300 placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                />
              </div>
              <Button size="sm" variant="ghost" className="h-8 text-xs text-slate-400">
                <CornerDownLeft className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
