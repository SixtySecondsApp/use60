import { useState, useEffect, useRef } from 'react';
import { Send, ThumbsUp, ThumbsDown, ExternalLink, Loader2, Bot, Ticket, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useSupportChat } from '@/lib/hooks/useSupportChat';
import { useUser } from '@/lib/hooks/useUser';
import { cn } from '@/lib/utils';

const botIconUrl = (import.meta.env.VITE_COPILOT_BOT_ICON_URL as string | undefined) || '/favicon_0_64x64.png';

interface SupportAIChatProps {
  initialQuery?: string;
  onEscalate: () => void;
}

export function SupportAIChat({ initialQuery, onEscalate }: SupportAIChatProps) {
  const [inputValue, setInputValue] = useState('');
  const [initialQuerySent, setInitialQuerySent] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, isLoading, isSearching, feedbackGiven, sendMessage, giveFeedback } = useSupportChat();
  const { userData } = useUser();
  const avatarUrl = userData?.avatar_url;
  const userInitial = userData?.first_name?.[0]?.toUpperCase() || 'U';
  const [botIconError, setBotIconError] = useState(false);

  // Send initial query from search hero
  useEffect(() => {
    if (initialQuery && !initialQuerySent) {
      setInitialQuerySent(true);
      sendMessage(initialQuery);
    }
  }, [initialQuery, initialQuerySent, sendMessage]);

  // Scroll to bottom only when a new message is added (not on tab switch or re-render)
  const prevMessageCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCount.current || isSearching) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCount.current = messages.length;
  }, [messages.length, isSearching]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    sendMessage(inputValue.trim());
    setInputValue('');
  };

  const handleSuggestedFollowUp = (question: string) => {
    if (question === 'Try asking again') {
      // Find the last user message and retry it
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
      if (lastUserMsg) {
        sendMessage(lastUserMsg.content);
        return;
      }
    }
    sendMessage(question);
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
      {/* Chat messages area */}
      <div className="h-[480px] overflow-y-auto scrollbar-custom p-4 space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 overflow-hidden flex items-center justify-center">
              {!botIconError && botIconUrl ? (
                <img src={botIconUrl} alt="60" className="w-full h-full object-cover" onError={() => setBotIconError(true)} />
              ) : (
                <Bot className="w-8 h-8 text-blue-500 dark:text-blue-400" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">AI Documentation Assistant</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Ask me anything about 60's features and I'll search our docs to help
              </p>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn('flex gap-3', message.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            {message.role === 'assistant' && (
              <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 mt-0.5 shrink-0 overflow-hidden flex items-center justify-center">
                {!botIconError && botIconUrl ? (
                  <img src={botIconUrl} alt="60" className="w-full h-full object-cover" onError={() => setBotIconError(true)} />
                ) : (
                  <Bot className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                )}
              </div>
            )}

            <div className={cn('max-w-[80%] space-y-2', message.role === 'user' ? 'items-end' : 'items-start')}>
              <div
                className={cn(
                  'px-4 py-3 rounded-2xl text-sm',
                  message.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-sm'
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>

              {/* Source articles */}
              {message.role === 'assistant' && message.sourceArticles && message.sourceArticles.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium px-1">Sources</p>
                  {message.sourceArticles.map((article) => (
                    <a
                      key={article.id}
                      href={`/docs?article=${article.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-blue-600 dark:text-blue-400 group"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate">{article.title}</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0 ml-auto">
                        {article.category}
                      </Badge>
                    </a>
                  ))}
                </div>
              )}

              {/* Suggested follow-ups */}
              {message.role === 'assistant' && message.suggestedFollowUps && message.suggestedFollowUps.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {message.suggestedFollowUps.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSuggestedFollowUp(q)}
                      disabled={isLoading}
                      className="text-xs px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Feedback */}
              {message.role === 'assistant' && feedbackGiven[message.id] === undefined && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-gray-400">Was this helpful?</span>
                  <button
                    onClick={() => giveFeedback(message.id, true)}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-emerald-500 transition-colors"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => giveFeedback(message.id, false)}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {message.role === 'assistant' && feedbackGiven[message.id] !== undefined && (
                <p className="text-xs text-gray-400 px-1">
                  {feedbackGiven[message.id] ? 'Glad that helped!' : 'Sorry about that — consider opening a ticket.'}
                </p>
              )}
            </div>

            {message.role === 'user' && (
              avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-7 h-7 rounded-lg object-cover mt-0.5 shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white text-xs font-medium flex items-center justify-center mt-0.5 shrink-0">
                  {userInitial}
                </div>
              )
            )}
          </div>
        ))}

        {/* Searching indicator — shown while agent is calling tools */}
        {isSearching && (
          <div className="flex gap-3 justify-start">
            <div className="w-[28px] shrink-0" /> {/* Align with bot icon above */}
            <div className="px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 flex items-center gap-2 animate-pulse">
              <Search className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Searching documentation...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 dark:border-gray-800 p-4 space-y-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask a question..."
            disabled={isLoading}
            className="flex-1 rounded-xl"
          />
          <Button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            size="icon"
            className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>

        {/* Escalate to human */}
        <div className="flex items-center justify-center">
          <button
            onClick={onEscalate}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <Ticket className="w-3.5 h-3.5" />
            Talk to a human — open a support ticket
          </button>
        </div>
      </div>
    </div>
  );
}
