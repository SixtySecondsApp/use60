/** DemoConversationalCopilot — Live playground for conversational copilot (CC-018 + CC-019). */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Loader2, Clock, Zap, Database, MessageSquare, Copy, ChevronDown, ChevronUp, Check, Slack } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { BackToPlatform } from '@/components/platform/BackToPlatform';

interface MessageMetadata {
  intent?: string;
  confidence?: number;
  entities_resolved?: Record<string, string>;
  data_sources_used?: string[];
  credits_consumed?: number;
  generation_time_ms?: number;
  model_used?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: MessageMetadata;
  timestamp: Date;
}

interface SessionStats {
  turnCount: number;
  totalCredits: number;
  avgResponseTime: number;
}

const SUGGESTED_QUERIES = [
  "What's happening with my top deal?",
  'Draft a check-in for stale deals',
  "What's my pipeline coverage?",
  'Which deals are at risk?',
  'How many meetings did I have last week?',
  'How should I handle pricing objections?',
];

function MetadataPanel({ metadata }: { metadata: MessageMetadata }) {
  return (
    <div className="mt-2 space-y-1 text-xs text-muted-foreground border-t border-border/50 pt-2">
      {metadata.intent && (
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-foreground/70">Intent:</span>
          <span>{metadata.intent}</span>
          {metadata.confidence !== undefined && (
            <Badge variant="outline" className="h-4 text-[10px] px-1">
              {Math.round(metadata.confidence * 100)}%
            </Badge>
          )}
        </div>
      )}
      {metadata.entities_resolved && Object.keys(metadata.entities_resolved).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground/70">Entities:</span>
          {Object.entries(metadata.entities_resolved).map(([k, v]) => (
            <Badge key={k} variant="secondary" className="h-4 text-[10px] px-1">
              {k}: {v}
            </Badge>
          ))}
        </div>
      )}
      {metadata.data_sources_used && metadata.data_sources_used.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground/70">Sources:</span>
          {metadata.data_sources_used.map((s) => (
            <Badge key={s} variant="outline" className="h-4 text-[10px] px-1">
              {s}
            </Badge>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3">
        {metadata.generation_time_ms !== undefined && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {metadata.generation_time_ms}ms
          </span>
        )}
        {metadata.model_used && (
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {metadata.model_used}
          </span>
        )}
        {metadata.credits_consumed !== undefined && (
          <span className="flex items-center gap-1">
            <Database className="h-3 w-3" />
            {metadata.credits_consumed} credits
          </span>
        )}
      </div>
    </div>
  );
}

function AssistantMessage({ message }: { message: Message }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  const hasMetadata =
    message.metadata &&
    (message.metadata.intent ||
      message.metadata.generation_time_ms !== undefined ||
      message.metadata.model_used ||
      message.metadata.credits_consumed !== undefined);

  return (
    <div className="flex gap-3 max-w-[85%]">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
        <Bot className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1">
        <Card className="border-border/50 shadow-none">
          <CardContent className="p-3">
            {/* Inline quick badges */}
            {message.metadata && (
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                {message.metadata.intent && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                    {message.metadata.intent}
                  </Badge>
                )}
                {message.metadata.generation_time_ms !== undefined && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {message.metadata.generation_time_ms}ms
                  </Badge>
                )}
                {message.metadata.model_used && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                    {message.metadata.model_used}
                  </Badge>
                )}
              </div>
            )}

            {/* Message content */}
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</div>

            {/* Actions */}
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-3 w-3 mr-1 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3 mr-1" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              {hasMetadata && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground ml-auto"
                  onClick={() => setExpanded((p) => !p)}
                >
                  {expanded ? (
                    <ChevronUp className="h-3 w-3 mr-1" />
                  ) : (
                    <ChevronDown className="h-3 w-3 mr-1" />
                  )}
                  Details
                </Button>
              )}
            </div>

            {/* Expanded metadata */}
            {expanded && message.metadata && <MetadataPanel metadata={message.metadata} />}
          </CardContent>
        </Card>
        <p className="text-[10px] text-muted-foreground mt-1 ml-1">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

function UserMessage({ message }: { message: Message }) {
  return (
    <div className="flex gap-3 justify-end max-w-[85%] ml-auto">
      <div className="flex-1">
        <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm">
          {message.content}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 mr-1 text-right">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-secondary flex items-center justify-center mt-0.5">
        <User className="h-4 w-4 text-secondary-foreground" />
      </div>
    </div>
  );
}

export default function DemoConversationalCopilot() {
  const sessionId = useRef(crypto.randomUUID());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<SessionStats>({
    turnCount: 0,
    totalCredits: 0,
    avgResponseTime: 0,
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);

      const start = performance.now();

      try {
        const { data, error } = await supabase.functions.invoke('conversational-copilot', {
          body: { message: text.trim(), session_id: sessionId.current },
        });

        if (error) throw error;

        const elapsed = Math.round(performance.now() - start);
        const metadata: MessageMetadata = {
          intent: data?.intent,
          confidence: data?.confidence,
          entities_resolved: data?.entities_resolved,
          data_sources_used: data?.data_sources_used,
          credits_consumed: data?.credits_consumed,
          generation_time_ms: data?.generation_time_ms ?? elapsed,
          model_used: data?.model_used,
        };

        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data?.response ?? data?.message ?? 'No response received.',
          metadata,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMsg]);

        setStats((prev) => {
          const newTurnCount = prev.turnCount + 1;
          const newTotalCredits = prev.totalCredits + (metadata.credits_consumed ?? 0);
          const newAvg = Math.round(
            (prev.avgResponseTime * prev.turnCount + elapsed) / newTurnCount
          );
          return {
            turnCount: newTurnCount,
            totalCredits: newTotalCredits,
            avgResponseTime: newAvg,
          };
        });
      } catch (err) {
        toast.error('Failed to get a response. Check that the edge function is deployed.');
        console.error('[DemoConversationalCopilot] error:', err);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [loading]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      sendMessage(input);
    },
    [input, sendMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input);
      }
    },
    [input, sendMessage]
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Page header */}
      <div className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
        <BackToPlatform />
        <div className="mt-3 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Conversational Copilot</h1>
              <Badge variant="secondary">Live Demo</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Chat with 60 in real time. Every response shows intent, sources, and latency.
            </p>
          </div>
        </div>
      </div>

      {/* Body: chat + metrics */}
      <div className="flex flex-1 min-h-0 gap-0">
        {/* Chat column */}
        <div className="flex flex-col flex-1 min-h-0 min-w-0">
          {/* Suggested queries */}
          {messages.length === 0 && (
            <div className="px-6 py-4 flex-shrink-0">
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                Try asking
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_QUERIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border bg-background hover:bg-muted transition-colors text-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Start a conversation</p>
                  <p className="text-sm text-muted-foreground">
                    Pick a suggestion above or type anything below.
                  </p>
                </div>
              </div>
            )}

            {messages.map((msg) =>
              msg.role === 'user' ? (
                <UserMessage key={msg.id} message={msg} />
              ) : (
                <AssistantMessage key={msg.id} message={msg} />
              )
            )}

            {loading && (
              <div className="flex gap-3 max-w-[85%]">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <Card className="border-border/50 shadow-none">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Thinking...
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="px-6 py-4 border-t border-border flex-shrink-0">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask 60 anything about your pipeline..."
                disabled={loading}
                className="flex-1"
                autoFocus
              />
              <Button type="submit" disabled={loading || !input.trim()} size="icon">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>

            {/* Slack CTA */}
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>Session ID: {sessionId.current.slice(0, 8)}...</span>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" asChild>
                <a href="/settings/integrations/slack">
                  <Slack className="h-3.5 w-3.5" />
                  Connect to Slack
                </a>
              </Button>
            </div>
          </div>
        </div>

        {/* Session metrics sidebar */}
        <div className="w-64 flex-shrink-0 border-l border-border p-4 space-y-4 overflow-y-auto hidden lg:block">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Session Metrics
            </h2>
            <div className="space-y-3">
              <MetricRow
                icon={<MessageSquare className="h-4 w-4 text-blue-500" />}
                label="Turns"
                value={String(stats.turnCount)}
              />
              <MetricRow
                icon={<Zap className="h-4 w-4 text-yellow-500" />}
                label="Credits Used"
                value={stats.totalCredits.toFixed(1)}
              />
              <MetricRow
                icon={<Clock className="h-4 w-4 text-green-500" />}
                label="Avg Response"
                value={stats.turnCount > 0 ? `${stats.avgResponseTime}ms` : '—'}
              />
            </div>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Data Sources
            </h2>
            <div className="space-y-2">
              <DataSourceRow label="Supabase" />
              <DataSourceRow label="RAG" />
              <DataSourceRow label="Writing Style" />
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Metadata per message shows intent classification, resolved entities, sources hit,
              latency, and credits consumed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function DataSourceRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" /><span>{label}</span>
    </div>
  );
}
