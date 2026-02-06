/**
 * Chat Message Component
 * Displays individual user/AI messages in the conversation
 *
 * Supports two tool display modes:
 * 1. Legacy toolCall (ToolCallIndicator) - for pattern-matched routing
 * 2. toolCalls array (ToolCallCard) - for autonomous executor tool use
 */

import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PriorityCard } from './PriorityCard';
import { ToolCallIndicator } from './ToolCallIndicator';
import { ToolCallCard } from './ToolCallCard';
import { CopilotResponse } from './CopilotResponse';
import { EntityDisambiguationResponse } from './responses/EntityDisambiguationResponse';
import type { CopilotMessage } from './types';
import type { ToolCall as AutonomousToolCall } from '@/lib/hooks/useCopilotChat';
import { useUser } from '@/lib/hooks/useUser';
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
  // US-009: Track if icon failed to load to show Sparkles fallback
  const [iconError, setIconError] = useState(false);
  // US-009: Use local 60 logo asset for consistent branding
  // Falls back to env override if provided for flexibility
  const botIconUrl = import.meta.env.VITE_COPILOT_BOT_ICON_URL as string | undefined || '/favicon_0_64x64.png';

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
          <div className="w-full relative">
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

            {/* Text Content (Legacy Format) - Fade in after tool call, hide if disambiguation is shown */}
            <AnimatePresence mode="wait">
              {!message.structuredResponse && !message.entityDisambiguation && message.content && (
                <motion.div
                  key="text-content"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="bg-white dark:bg-gray-900/60 backdrop-blur-xl border border-gray-200 dark:border-gray-800/40 rounded-xl px-5 py-4 shadow-lg dark:shadow-none"
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
