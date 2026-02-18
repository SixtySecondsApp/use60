import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Bot, Loader2, Sparkles, FileText, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMaAsk } from '@/lib/hooks/useMeetingAnalytics';
import { useUser } from '@/lib/hooks/useUser';
import type { MaAskResponse, MaAskSource } from '@/lib/types/meetingAnalytics';

interface AskAnythingPanelProps {
  transcriptId?: string;
  compact?: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: MaAskSource[];
  metadata?: { segmentsSearched: number; meetingsAnalyzed: number; totalMeetings: number };
}

const STARTER_QUESTIONS = [
  'What objections came up this week?',
  'Summarize key decisions',
  'Which deals are progressing?',
  'What promises were made?',
];

function getSimilarityColors(similarity: number) {
  if (similarity >= 0.8) {
    return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
  }
  if (similarity >= 0.6) {
    return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400';
  }
  return 'bg-gray-100 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400';
}

const markdownComponents = {
  p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: any) => <em className="italic">{children}</em>,
  ul: ({ children }: any) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }: any) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
  li: ({ children }: any) => <li className="text-sm pl-0.5">{children}</li>,
  h1: ({ children }: any) => <h1 className="text-base font-bold mb-2">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-sm font-bold mb-1.5">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
  code: ({ children, className }: any) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <pre className="bg-gray-100 dark:bg-gray-900/60 rounded-lg p-3 my-2 overflow-x-auto">
          <code className="text-xs font-mono">{children}</code>
        </pre>
      );
    }
    return (
      <code className="bg-gray-100 dark:bg-gray-800/60 rounded px-1.5 py-0.5 text-xs font-mono">
        {children}
      </code>
    );
  },
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-2 border-emerald-300 dark:border-emerald-600 pl-3 my-2 text-gray-600 dark:text-gray-400 italic">
      {children}
    </blockquote>
  ),
};

function CollapsibleSources({ sources }: { sources: MaAskSource[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="ml-10">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors py-1"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        {sources.length} source{sources.length !== 1 ? 's' : ''}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 pt-1">
              {sources.map((source, si) => (
                <div
                  key={si}
                  className="bg-white/60 dark:bg-gray-800/40 rounded-xl p-3 border border-gray-200/50 dark:border-gray-700/30 hover:border-emerald-300/50 dark:hover:border-emerald-500/30 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="shrink-0 flex items-center justify-center w-5 h-5 rounded-md bg-emerald-50 dark:bg-emerald-500/10">
                      <FileText className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate flex-1">
                      {source.transcriptTitle || 'Untitled'}
                    </span>
                    <span
                      className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getSimilarityColors(source.similarity)}`}
                    >
                      {Math.round(source.similarity * 100)}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                    {source.text}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AskAnythingPanel({ transcriptId, compact }: AskAnythingPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { userData } = useUser();

  const askMutation = useMaAsk();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, askMutation.isPending]);

  function handleSubmit(question: string) {
    const trimmed = question.trim();
    if (!trimmed || askMutation.isPending) return;

    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setInput('');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    askMutation.mutate(
      { question: trimmed, transcriptId },
      {
        onSuccess: (data: MaAskResponse) => {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: data.answer,
              sources: data.sources,
              metadata: {
                segmentsSearched: data.segmentsSearched,
                meetingsAnalyzed: data.meetingsAnalyzed,
                totalMeetings: data.totalMeetings,
              },
            },
          ]);
        },
        onError: () => {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' },
          ]);
        },
      }
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(input);
    }
  }

  function handleTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  const showStarters = !compact && messages.length === 0;
  const avatarUrl = userData?.avatar_url;
  const userInitial = userData?.first_name?.[0]?.toUpperCase() || 'U';

  return (
    <div className="bg-white/60 dark:bg-gray-900/30 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 overflow-hidden flex flex-col h-[480px]">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 p-4 sm:p-5">
        {messages.length === 0 && !askMutation.isPending && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 mb-4">
              <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Ask Anything</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 max-w-sm">
              {transcriptId
                ? 'Ask questions about this meeting transcript'
                : 'Ask questions across all your meeting transcripts'}
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[85%] space-y-2 ${msg.role === 'user' ? 'order-1' : 'order-2'}`}>
                {/* Message bubble */}
                <div className="flex items-start gap-2">
                  {msg.role === 'assistant' && (
                    <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 mt-0.5">
                      <Bot className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  )}
                  <div
                    className={`text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-emerald-600 text-white rounded-2xl rounded-br-md px-4 py-3 shadow-sm'
                        : 'bg-white/80 dark:bg-gray-800/60 backdrop-blur-xl rounded-2xl rounded-bl-md px-4 py-3 border border-gray-200/50 dark:border-gray-700/30 shadow-sm text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt=""
                        className="shrink-0 w-8 h-8 rounded-xl object-cover mt-0.5"
                      />
                    ) : (
                      <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-600 text-white text-xs font-medium mt-0.5">
                        {userInitial}
                      </div>
                    )
                  )}
                </div>

                {/* Collapsible Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <CollapsibleSources sources={msg.sources} />
                )}

                {/* Metadata */}
                {msg.metadata && (
                  <p className="ml-10 text-xs text-gray-400 dark:text-gray-500">
                    Analyzed {msg.metadata.meetingsAnalyzed} meeting
                    {msg.metadata.meetingsAnalyzed !== 1 ? 's' : ''}, searched{' '}
                    {msg.metadata.segmentsSearched} segment
                    {msg.metadata.segmentsSearched !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Loading state */}
        {askMutation.isPending && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="flex items-start gap-2">
              <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="bg-white/80 dark:bg-gray-800/60 backdrop-blur-xl rounded-2xl rounded-bl-md px-4 py-3 border border-gray-200/50 dark:border-gray-700/30 shadow-sm flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
                <span className="text-sm text-gray-400 dark:text-gray-500">Thinking...</span>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Starter question chips */}
      {showStarters && (
        <div className="flex flex-wrap justify-center gap-2 px-4 sm:px-5 pb-4">
          {STARTER_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => handleSubmit(q)}
              className="bg-white/80 dark:bg-gray-800/40 backdrop-blur-xl rounded-xl px-4 py-2.5 border border-gray-200/50 dark:border-gray-700/30 hover:border-emerald-300 dark:hover:border-emerald-500/30 hover:bg-emerald-50/50 dark:hover:bg-emerald-500/5 transition-all cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:text-emerald-700 dark:hover:text-emerald-300"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl border-t border-gray-200/50 dark:border-gray-700/30 p-3 sm:p-4 flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleTextareaInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          rows={1}
          disabled={askMutation.isPending}
          className="flex-1 resize-none rounded-xl bg-gray-50/80 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/30 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
        />
        <button
          onClick={() => handleSubmit(input)}
          disabled={!input.trim() || askMutation.isPending}
          className="shrink-0 flex items-center justify-center w-9 h-9 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl p-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
