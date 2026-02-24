/**
 * Chat Message Component
 * Displays individual user/AI messages in the conversation
 *
 * Supports two tool display modes:
 * 1. Legacy toolCall (ToolCallIndicator) - for pattern-matched routing
 * 2. toolCalls array (ToolCallCard) - for autonomous executor tool use
 */

import React, { useState, useCallback } from 'react';
import { Sparkles, RotateCcw, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PriorityCard } from './PriorityCard';
import { ToolCallIndicator } from './ToolCallIndicator';
import { ToolCallCard } from './ToolCallCard';
import { CopilotResponse } from './CopilotResponse';
import { EntityDisambiguationResponse } from './responses/EntityDisambiguationResponse';
import { ProspectingClarificationResponse } from './responses/ProspectingClarificationResponse';
import type { ProspectingClarificationData } from './responses/ProspectingClarificationResponse';
import { CampaignWorkflowResponse } from './responses/CampaignWorkflowResponse';
import type { CopilotMessage, CampaignWorkflowData } from './types';
import type { ToolCall as AutonomousToolCall } from '@/lib/hooks/useCopilotChat';
import { useUser } from '@/lib/hooks/useUser';
import { useCopilot } from '@/lib/contexts/CopilotContext';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

interface ChatMessageProps {
  message: CopilotMessage;
  /** Autonomous tool calls from useCopilotChat (new format) */
  toolCalls?: AutonomousToolCall[];
  onActionClick?: (action: any) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = React.memo(({ message, toolCalls, onActionClick }) => {
  const isUser = message.role === 'user';
  const { userData } = useUser();
  const { messages, sendMessage } = useCopilot();
  // US-009: Track if icon failed to load to show Sparkles fallback
  const [iconError, setIconError] = useState(false);
  // UX-002: Track copy feedback state
  const [copied, setCopied] = useState(false);
  // US-009: Use local 60 logo asset for consistent branding
  // Falls back to env override if provided for flexibility
  const botIconUrl = import.meta.env.VITE_COPILOT_BOT_ICON_URL as string | undefined || '/favicon_0_64x64.png';

  // UX-001: Find the original user query that triggered this error message
  const originalQuery = useCallback(() => {
    if (!message.isError || message.role !== 'assistant') return null;
    const msgIndex = messages.findIndex(m => m.id === message.id);
    if (msgIndex <= 0) return null;
    // Walk backwards to find the user message that triggered this assistant response
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i].content;
      }
    }
    return null;
  }, [message.id, message.isError, message.role, messages]);

  // UX-001: Handle retry click
  const handleRetry = useCallback(() => {
    const query = originalQuery();
    if (query) {
      sendMessage(query);
    }
  }, [originalQuery, sendMessage]);

  // UX-002: Handle copy to clipboard
  const handleCopy = useCallback(async () => {
    // Extract text content: prefer structured response summary, then plain content
    let textToCopy = '';
    if (message.structuredResponse) {
      textToCopy = message.structuredResponse.summary || message.content || '';
    } else {
      textToCopy = message.content || '';
    }

    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }, [message.content, message.structuredResponse]);

  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-gray-800 border border-gray-700 flex items-center justify-center">
          {!iconError && botIconUrl ? (
            <img
              src={botIconUrl}
              alt="60"
              className="w-full h-full object-cover"
              onError={() => setIconError(true)}
            />
          ) : (
            <Sparkles className="w-4 h-4 text-white" />
          )}
        </div>
      )}
      <div className={cn('max-w-3xl', isUser ? '' : 'w-full')}>
        {isUser ? (
          <div className="bg-blue-50 dark:bg-blue-500/10 backdrop-blur-sm border border-blue-200 dark:border-blue-500/20 rounded-xl px-4 py-3 inline-block">
            <p className="text-sm text-gray-900 dark:text-gray-100">{message.content}</p>
          </div>
        ) : (
          <div className="w-full relative group/assistant">
            {/* UX-002: Copy button - appears on hover over assistant messages */}
            {!isUser && (message.content || message.structuredResponse) && !message.isError && (
              <button
                type="button"
                onClick={handleCopy}
                className={cn(
                  'absolute top-2 right-2 z-10 p-1.5 rounded-md transition-all duration-200',
                  'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
                  'hover:bg-gray-200 dark:hover:bg-gray-700',
                  'opacity-0 group-hover/assistant:opacity-100',
                  copied && 'opacity-100'
                )}
                aria-label={copied ? 'Copied' : 'Copy message'}
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                )}
              </button>
            )}

            {/* Legacy Tool Call Indicator - Show until response is ready */}
            <AnimatePresence mode="wait">
              {message.toolCall && !message.structuredResponse && !message.content && (
                <motion.div
                  key="tool-call-loader"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                  className="mb-4"
                >
                  <ToolCallIndicator toolCall={message.toolCall} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Autonomous Tool Calls - Show when using useCopilotChat */}
            <AnimatePresence>
              {toolCalls && toolCalls.length > 0 && (
                <motion.div
                  key="autonomous-tool-calls"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-2 mb-4"
                >
                  {toolCalls.map((tc) => (
                    <ToolCallCard
                      key={tc.id}
                      toolCall={tc}
                      isSequence={tc.name.includes('sequence')}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Structured Response (New Format) - Fade in after tool call */}
            <AnimatePresence mode="wait">
              {message.structuredResponse && (
                <motion.div
                  key="structured-response"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="bg-white dark:bg-gray-900/60 backdrop-blur-xl border border-gray-200 dark:border-gray-800/40 rounded-xl px-5 py-4 shadow-lg dark:shadow-none w-full"
                >
                  <CopilotResponse 
                    response={message.structuredResponse} 
                    onActionClick={onActionClick}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Entity Disambiguation - Interactive contact selection */}
            <AnimatePresence mode="wait">
              {message.entityDisambiguation && message.entityDisambiguation.candidates?.length > 0 && (
                <motion.div
                  key="entity-disambiguation"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="bg-white dark:bg-gray-900/60 backdrop-blur-xl border border-gray-200 dark:border-gray-800/40 rounded-xl px-5 py-4 shadow-lg dark:shadow-none"
                >
                  <EntityDisambiguationResponse data={message.entityDisambiguation} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Prospecting Clarification - Chip-select questions before workflow */}
            <AnimatePresence mode="wait">
              {message.preflightQuestions && (message.preflightQuestions as ProspectingClarificationData).questions?.length > 0 && (
                <motion.div
                  key="prospecting-clarification"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="bg-white dark:bg-gray-900/60 backdrop-blur-xl border border-gray-200 dark:border-gray-800/40 rounded-xl px-5 py-4 shadow-lg dark:shadow-none"
                >
                  <ProspectingClarificationResponse data={message.preflightQuestions as ProspectingClarificationData} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Campaign Workflow - Interactive campaign setup with questions */}
            <AnimatePresence mode="wait">
              {message.campaignWorkflow && (message.campaignWorkflow as CampaignWorkflowData).questions?.length > 0 && (
                <motion.div
                  key="campaign-workflow"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="bg-white dark:bg-gray-900/60 backdrop-blur-xl border border-gray-200 dark:border-gray-800/40 rounded-xl px-5 py-4 shadow-lg dark:shadow-none"
                >
                  <CampaignWorkflowResponse data={message.campaignWorkflow as CampaignWorkflowData} onActionClick={onActionClick} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Text Content (Legacy Format) - Fade in after tool call, hide if disambiguation is shown */}
            <AnimatePresence mode="wait">
              {!message.structuredResponse && !message.entityDisambiguation && message.content && (
                <motion.div
                  key="text-content"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className={cn(
                    "bg-white dark:bg-gray-900/60 backdrop-blur-xl border rounded-xl px-5 py-4 shadow-lg dark:shadow-none",
                    message.isError
                      ? "border-red-200 dark:border-red-500/20"
                      : "border-gray-200 dark:border-gray-800/40"
                  )}
                >
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:underline">
                    <ReactMarkdown
                      components={{
                        a: ({ node, ...props }) => (
                          <a
                            {...props}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-2"
                          />
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                  {/* UX-001: Retry button for error messages */}
                  {message.isError && originalQuery() && (
                    <div className="mt-3 pt-3 border-t border-red-100 dark:border-red-500/10">
                      <button
                        type="button"
                        onClick={handleRetry}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all',
                          'text-red-600 dark:text-red-400',
                          'bg-red-50 dark:bg-red-500/10',
                          'border border-red-200 dark:border-red-500/20',
                          'hover:bg-red-100 dark:hover:bg-red-500/20',
                          'hover:border-red-300 dark:hover:border-red-500/30',
                          'active:scale-[0.98]'
                        )}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Retry
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Recommendations */}
            {message.recommendations && message.recommendations.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className="space-y-3 mt-4"
              >
                {message.recommendations.map(rec => (
                  <PriorityCard key={rec.id} recommendation={rec} onActionClick={onActionClick} />
                ))}
              </motion.div>
            )}
          </div>
        )}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
          {userData?.avatar_url ? (
            <img
              src={userData.avatar_url}
              alt={userData.first_name || 'User'}
              className="w-full h-full object-cover aspect-square"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <span className="text-xs font-bold text-white">
                {userData?.first_name?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

ChatMessage.displayName = 'ChatMessage';

export default ChatMessage;
