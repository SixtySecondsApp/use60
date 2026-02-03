/**
 * Chat Message Component
 * Displays individual user/AI messages in the conversation
 *
 * Supports two tool display modes:
 * 1. Legacy toolCall (ToolCallIndicator) - for pattern-matched routing
 * 2. toolCalls array (ToolCallCard) - for autonomous executor tool use
 */

import React from 'react';
import { Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PriorityCard } from './PriorityCard';
import { ToolCallIndicator } from './ToolCallIndicator';
import { ToolCallCard } from './ToolCallCard';
import { CopilotResponse } from './CopilotResponse';
import type { CopilotMessage } from './types';
import type { ToolCall as AutonomousToolCall } from '@/lib/hooks/useCopilotChat';
import { useUser } from '@/lib/hooks/useUser';

interface ChatMessageProps {
  message: CopilotMessage;
  /** Autonomous tool calls from useCopilotChat (new format) */
  toolCalls?: AutonomousToolCall[];
  onActionClick?: (action: any) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = React.memo(({ message, toolCalls, onActionClick }) => {
  const isUser = message.role === 'user';
  const { userData } = useUser();
  // Avoid hardcoding a Supabase project ref here (projects can move).
  // Prefer an explicit env override, else fall back to the currently configured Supabase URL.
  const botIconUrl = (() => {
    const override = import.meta.env.VITE_COPILOT_BOT_ICON_URL as string | undefined;
    if (override) return override;

    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL) as string | undefined;
    if (!supabaseUrl) return undefined;

    // Keep the same storage path; only derive the host from the configured project.
    const base = supabaseUrl.replace(/\/$/, '');
    return `${base}/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png`;
  })();

  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-gray-800 border border-gray-700 flex items-center justify-center">
          {botIconUrl ? (
            <img
              src={botIconUrl}
              alt="60"
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback to sparkle avatar if the icon can’t load
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : null}
          <Sparkles className="w-4 h-4 text-white" />
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

            {/* Text Content (Legacy Format) - Fade in after tool call */}
            <AnimatePresence mode="wait">
              {!message.structuredResponse && message.content && (
                <motion.div
                  key="text-content"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="bg-white dark:bg-gray-900/60 backdrop-blur-xl border border-gray-200 dark:border-gray-800/40 rounded-xl px-5 py-4 shadow-lg dark:shadow-none"
                >
                  <p className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed whitespace-pre-wrap">{message.content}</p>
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
              className="w-full h-full object-cover"
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
