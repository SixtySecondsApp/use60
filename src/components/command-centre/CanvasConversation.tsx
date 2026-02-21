import { useState, useRef, useEffect } from 'react';
import { Send, User, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface CanvasConversationProps {
  messages: ConversationMessage[];
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export function CanvasConversation({ messages, onSendMessage, isLoading, placeholder }: CanvasConversationProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col border-t border-slate-200 dark:border-gray-700/50">
      {/* Message thread */}
      {messages.length > 0 && (
        <div className="max-h-48 overflow-y-auto px-4 py-2 space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex gap-2 text-sm',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {msg.role === 'assistant' && (
                <div className="h-6 w-6 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                </div>
              )}
              <div
                className={cn(
                  'rounded-lg px-3 py-1.5 max-w-[80%]',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                )}
              >
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <User className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-2 text-sm">
              <div className="h-6 w-6 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-3.5 w-3.5 text-violet-600" />
              </div>
              <div className="bg-muted rounded-lg px-3 py-1.5 text-xs text-slate-500 dark:text-gray-400">
                Updating canvas...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Refine this draft... (e.g., 'make it more casual')"}
          className="flex-1 resize-none rounded-lg border border-slate-200 dark:border-gray-700/50 bg-slate-50/50 dark:bg-gray-800/50 px-3 py-2 text-xs text-slate-700 dark:text-gray-300 placeholder:text-slate-400 dark:placeholder:text-gray-500 min-h-[36px] max-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
          rows={1}
        />
        <Button
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
