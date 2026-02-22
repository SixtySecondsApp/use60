/**
 * SkillOutputCard
 *
 * Structured response card for /skill command outputs.
 * Shows a header (skill name + entity chips), body (markdown content),
 * and footer with action buttons (Copy, Send Email, Create Task, Regenerate).
 */

import React, { useState, useCallback } from 'react';
import { Copy, Mail, CheckSquare, RefreshCw, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

interface SkillOutputCardProps {
  skillCommand: string;
  skillName: string;
  entities?: Array<{ name: string; type: string }>;
  content: string;
  /** Tabbed sections for multi-part outputs (e.g., /research) */
  sections?: Array<{ title: string; content: string }>;
  onActionClick?: (action: { action: string; params?: Record<string, unknown> }) => void;
}

export function SkillOutputCard({
  skillCommand,
  skillName,
  entities = [],
  content,
  sections,
  onActionClick,
}: SkillOutputCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const textToCopy = sections ? sections[activeTab]?.content || content : content;
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }, [content, sections, activeTab]);

  const handleSendEmail = useCallback(() => {
    onActionClick?.({ action: 'draft_email', params: { content, skillCommand } });
  }, [content, skillCommand, onActionClick]);

  const handleCreateTask = useCallback(() => {
    onActionClick?.({ action: 'quickadd_task', params: { description: content } });
  }, [content, onActionClick]);

  const handleRegenerate = useCallback(() => {
    const prompt = `Regenerate /${skillCommand}${entities.map((e) => ` @${e.name}`).join('')}`;
    onActionClick?.({ action: 'send_message', params: { prompt } });
  }, [skillCommand, entities, onActionClick]);

  const displayContent = sections ? sections[activeTab]?.content || content : content;

  return (
    <div className="rounded-xl border border-gray-700/50 bg-gray-800/40 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/60 hover:bg-gray-800/80 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-violet-400">/{skillCommand}</span>
          <span className="text-sm text-gray-300">{skillName}</span>
          {entities.map((e) => (
            <span
              key={e.name}
              className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border',
                e.type === 'contact' && 'bg-blue-500/15 text-blue-300 border-blue-500/25',
                e.type === 'company' && 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
                e.type === 'deal' && 'bg-amber-500/15 text-amber-300 border-amber-500/25',
              )}
            >
              {e.name}
            </span>
          ))}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <>
          {/* Tabs (if multi-section) */}
          {sections && sections.length > 1 && (
            <div className="flex border-b border-gray-700/40 px-4">
              {sections.map((section, idx) => (
                <button
                  key={section.title}
                  type="button"
                  onClick={() => setActiveTab(idx)}
                  className={cn(
                    'px-3 py-2 text-xs font-medium transition-colors border-b-2',
                    idx === activeTab
                      ? 'text-violet-300 border-violet-500'
                      : 'text-gray-500 border-transparent hover:text-gray-300',
                  )}
                >
                  {section.title}
                </button>
              ))}
            </div>
          )}

          {/* Body */}
          <div className="px-4 py-3 max-h-96 overflow-y-auto">
            <div className="prose prose-sm prose-invert max-w-none text-gray-200">
              <ReactMarkdown>{displayContent}</ReactMarkdown>
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-700/40 bg-gray-800/30">
            <ActionButton
              icon={copied ? Check : Copy}
              label={copied ? 'Copied' : 'Copy'}
              onClick={handleCopy}
            />
            <ActionButton icon={Mail} label="Send Email" onClick={handleSendEmail} />
            <ActionButton icon={CheckSquare} label="Create Task" onClick={handleCreateTask} />
            <ActionButton icon={RefreshCw} label="Regenerate" onClick={handleRegenerate} />
          </div>
        </>
      )}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 transition-colors"
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
