import { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, Loader2, Sparkles, FileText, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useMaAsk } from '@/lib/hooks/useMeetingAnalytics';
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

function getSimilarityVariant(similarity: number) {
  if (similarity >= 0.8) return 'success';
  if (similarity >= 0.6) return 'warning';
  return 'destructive';
}

export function AskAnythingPanel({ transcriptId, compact }: AskAnythingPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4 min-h-[200px]">
        {messages.length === 0 && !askMutation.isPending && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-primary/10 p-3 mb-4">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm font-medium mb-1">Ask Anything</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              {transcriptId
                ? 'Ask questions about this meeting transcript'
                : 'Ask questions across all your meeting transcripts'}
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] space-y-2 ${
                msg.role === 'user' ? 'order-1' : 'order-2'
              }`}
            >
              {/* Message bubble */}
              <div className="flex items-start gap-2">
                {msg.role === 'assistant' && (
                  <div className="rounded-full bg-muted p-1.5 mt-0.5 shrink-0">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
                <div
                  className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
                {msg.role === 'user' && (
                  <div className="rounded-full bg-primary/10 p-1.5 mt-0.5 shrink-0">
                    <User className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
              </div>

              {/* Sources */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="ml-8 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Sources</p>
                  {msg.sources.map((source, si) => (
                    <Card key={si} className="p-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium truncate">
                          {source.transcriptTitle || 'Untitled'}
                        </span>
                        <Badge
                          variant={getSimilarityVariant(source.similarity)}
                          className="ml-auto text-[10px] px-1.5 py-0 shrink-0"
                        >
                          {Math.round(source.similarity * 100)}%
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {source.text}
                      </p>
                    </Card>
                  ))}
                </div>
              )}

              {/* Metadata */}
              {msg.metadata && (
                <p className="ml-8 text-[11px] text-muted-foreground">
                  Analyzed {msg.metadata.meetingsAnalyzed} meeting
                  {msg.metadata.meetingsAnalyzed !== 1 ? 's' : ''}, searched{' '}
                  {msg.metadata.segmentsSearched} segment
                  {msg.metadata.segmentsSearched !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        ))}

        {/* Loading state */}
        {askMutation.isPending && (
          <div className="flex justify-start">
            <div className="flex items-start gap-2">
              <div className="rounded-full bg-muted p-1.5 mt-0.5 shrink-0">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="rounded-lg bg-muted px-3 py-2 text-sm flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="text-muted-foreground">Thinking...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Starter question chips */}
      {showStarters && (
        <div className="flex flex-wrap gap-2 pb-3">
          {STARTER_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => handleSubmit(q)}
              className="text-xs border rounded-full px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 border-t pt-3">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleTextareaInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          rows={1}
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={askMutation.isPending}
        />
        <Button
          size="icon"
          onClick={() => handleSubmit(input)}
          disabled={!input.trim() || askMutation.isPending}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
