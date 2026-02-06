/**
 * OI-027: AI Chat Thread
 *
 * Expandable mini chat panel showing conversation history
 */

import { useState } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, RotateCcw, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface AiChatThreadProps {
  tableId: string;
  sessionId: string | null;
  messages: Array<{ role: string; content: string; timestamp: string; action_result?: any }>;
  onNewSession: () => void;
}

export function AiChatThread({ tableId, sessionId, messages, onNewSession }: AiChatThreadProps) {
  const [expanded, setExpanded] = useState(false);

  if (!sessionId || messages.length === 0) return null;

  return (
    <div className="border-t bg-muted/30">
      {/* Header with expand/collapse */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2"
        >
          <MessageSquare className="h-4 w-4" />
          <span className="text-sm">
            Conversation: {messages.length} message{messages.length !== 1 ? 's' : ''}
          </span>
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onNewSession}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          New Session
        </Button>

        <a
          href="/docs#ops-conversations"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 hover:bg-slate-700/50 rounded transition-colors"
          title="Learn more about Conversations"
        >
          <HelpCircle className="w-4 h-4 text-slate-400 hover:text-blue-400" />
        </a>
      </div>

      {/* Chat history */}
      {expanded && (
        <ScrollArea className="h-[400px] p-4">
          <div className="space-y-4">
            {messages.map((message, idx) => (
              <div
                key={idx}
                className={cn(
                  'flex gap-3',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'rounded-lg px-4 py-2 max-w-[80%]',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <p className="text-sm">{message.content}</p>
                  {message.action_result && (
                    <div className="mt-2 pt-2 border-t border-current/10 text-xs opacity-80">
                      Result: {message.action_result.summary || 'Completed'}
                    </div>
                  )}
                  <div className="text-xs opacity-60 mt-1">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
