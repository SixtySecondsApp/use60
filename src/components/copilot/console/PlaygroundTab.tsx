/**
 * PlaygroundTab - Live autonomous copilot testing
 *
 * Uses useCopilotChat hook (NOT legacy InteractivePlayground) to target
 * the live autonomous copilot (Claude Haiku 4.5) via copilot-autonomous edge function.
 *
 * persistSession: false prevents polluting user conversations.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Loader2,
  Trash2,
  StopCircle,
  Wrench,
  Clock,
  Zap,
  User,
  Bot,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useCopilotChat, type ChatMessage } from '@/lib/hooks/useCopilotChat';
import { ToolCallCard } from '@/components/copilot/ToolCallCard';
import { toast } from 'sonner';

const QUICK_QUERIES = [
  { label: 'Meeting Prep', query: 'Prep me for my next meeting' },
  { label: 'Pipeline Check', query: 'Show me my pipeline summary' },
  { label: 'Follow-ups', query: 'What follow-ups do I need to send today?' },
  { label: 'Deal Health', query: 'Which deals need attention this week?' },
  { label: 'Daily Focus', query: 'What should I focus on today?' },
];

interface PlaygroundTabProps {
  organizationId: string;
  userId: string;
  initialQuery?: string;
  onQueryConsumed?: () => void;
}

export function PlaygroundTab({
  organizationId,
  userId,
  initialQuery,
  onQueryConsumed,
}: PlaygroundTabProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [completionMetrics, setCompletionMetrics] = useState<{
    toolCount: number;
    toolsUsed: string[];
    durationMs: number;
  } | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const {
    sendMessage,
    messages,
    isThinking,
    isStreaming,
    currentTool,
    toolsUsed,
    error,
    clearMessages,
    stopGeneration,
  } = useCopilotChat({
    organizationId,
    userId,
    persistSession: false,
    onToolStart: () => {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }
    },
    onComplete: (_response, tools) => {
      const duration = startTimeRef.current
        ? Date.now() - startTimeRef.current
        : 0;
      setCompletionMetrics({
        toolCount: tools.length,
        toolsUsed: tools,
        durationMs: duration,
      });
      startTimeRef.current = null;
    },
    onError: (err) => {
      toast.error(err);
      startTimeRef.current = null;
    },
  });

  // Handle initial query from re-run
  useEffect(() => {
    if (initialQuery) {
      setInput(initialQuery);
      onQueryConsumed?.();
    }
  }, [initialQuery, onQueryConsumed]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentTool]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isThinking || isStreaming) return;

    setInput('');
    setCompletionMetrics(null);
    startTimeRef.current = Date.now();
    await sendMessage(trimmed);
  }, [input, isThinking, isStreaming, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleQuickQuery = useCallback(
    async (query: string) => {
      if (isThinking || isStreaming) return;
      setInput('');
      setCompletionMetrics(null);
      startTimeRef.current = Date.now();
      await sendMessage(query);
    },
    [isThinking, isStreaming, sendMessage]
  );

  const handleClear = useCallback(() => {
    clearMessages();
    setCompletionMetrics(null);
    startTimeRef.current = null;
  }, [clearMessages]);

  const isBusy = isThinking || isStreaming;

  return (
    <div className="space-y-4">
      {/* Quick Query Buttons */}
      <div className="flex flex-wrap gap-2">
        {QUICK_QUERIES.map((q) => (
          <Button
            key={q.label}
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => handleQuickQuery(q.query)}
            className="text-xs"
          >
            <Sparkles className="w-3 h-3 mr-1" />
            {q.label}
          </Button>
        ))}
      </div>

      {/* Messages Area */}
      <Card className="border border-gray-200 dark:border-gray-700">
        <CardContent className="p-0">
          <div className="h-[500px] overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && !isBusy && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Bot className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">Send a message to test the autonomous copilot</p>
                <p className="text-xs mt-1">Using Claude Haiku 4.5 with native tool_use</p>
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Current tool execution indicator */}
            {currentTool && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 pl-10"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Running tool: <code className="font-mono text-xs bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">{currentTool.name}</code></span>
              </motion.div>
            )}

            {/* Thinking indicator */}
            {isThinking && !currentTool && messages.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-sm text-gray-400 pl-10"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Thinking...</span>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </CardContent>
      </Card>

      {/* Completion Metrics */}
      <AnimatePresence>
        {completionMetrics && !isBusy && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap gap-2"
          >
            <Badge variant="outline" className="gap-1">
              <Wrench className="w-3 h-3" />
              {completionMetrics.toolCount} tool{completionMetrics.toolCount !== 1 ? 's' : ''} used
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Clock className="w-3 h-3" />
              {(completionMetrics.durationMs / 1000).toFixed(1)}s
            </Badge>
            {completionMetrics.toolsUsed.map((tool) => (
              <Badge
                key={tool}
                variant="secondary"
                className="text-xs font-mono"
              >
                {tool}
              </Badge>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Input Area */}
      <div className="flex gap-2">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the copilot anything... (Cmd+Enter to send)"
          rows={2}
          className="resize-none flex-1"
          disabled={isBusy}
        />
        <div className="flex flex-col gap-2">
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isBusy}
            className="bg-emerald-600 hover:bg-emerald-700 h-full"
          >
            {isBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {isBusy && (
          <Button variant="outline" size="sm" onClick={stopGeneration}>
            <StopCircle className="w-4 h-4 mr-1" />
            Stop
          </Button>
        )}
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleClear} disabled={isBusy}>
            <Trash2 className="w-4 h-4 mr-1" />
            Clear
          </Button>
        )}
        {toolsUsed.length > 0 && (
          <span className="text-xs text-gray-500 ml-auto">
            Session tools: {toolsUsed.length}
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Message Bubble
// =============================================================================

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex gap-3', isUser && 'justify-end')}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
          <Bot className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>
      )}

      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-2.5 text-sm',
          isUser
            ? 'bg-emerald-600 text-white'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
        )}
      >
        {/* Tool calls (assistant messages) */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-2 mb-3">
            {message.toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} compact />
            ))}
          </div>
        )}

        {/* Message content */}
        <div className="whitespace-pre-wrap break-words">
          {message.content}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 bg-emerald-500 ml-0.5 animate-pulse" />
          )}
        </div>
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
          <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </div>
      )}
    </motion.div>
  );
}
