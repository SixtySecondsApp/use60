/**
 * DemoPrepBriefing
 *
 * Demo page for the pre-meeting prep briefing feature.
 * Loads recent meetings via the demo-recent-meetings edge function,
 * streams a real-time briefing from demo-prep-briefing via SSE,
 * and renders the Slack blocks as a visual preview.
 */

import { useState, useEffect, useRef } from 'react';
import {
  Users,
  Send,
  Copy,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  SkipForward,
  Play,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase/clientV2';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// =============================================================================
// Types
// =============================================================================

interface RecentMeeting {
  id: string;
  title: string;
  start_time: string;
  attendee_count: number;
  company?: string;
}

type StepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';

interface BriefingStep {
  id: string;
  label: string;
  status: StepStatus;
  duration_ms?: number;
  detail?: string;
}

interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  elements?: SlackBlock[];
  fields?: Array<{ type: string; text: string }>;
  accessory?: SlackBlock;
  image_url?: string;
  alt_text?: string;
}

interface GenerationMeta {
  total_ms: number;
  credits_used: number;
  rag_chunks: number;
  rag_total: number;
  model: string;
  prior_meetings: number;
}

type DeliveryMode = 'preview' | 'slack';

// =============================================================================
// Helpers
// =============================================================================

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Convert Slack mrkdwn text to a React-renderable string.
 * Handles *bold*, _italic_, `code`, and bullet points.
 */
function renderMrkdwn(text: string): React.ReactNode[] {
  // Split on lines so we can handle bullet lists
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const key = i;
    // Bullet line: starts with • or -
    if (line.match(/^[•\-]\s/)) {
      return (
        <li key={key} className="ml-4 text-sm text-foreground">
          {parseInline(line.replace(/^[•\-]\s/, ''))}
        </li>
      );
    }
    // Empty line → spacer
    if (line.trim() === '') {
      return <div key={key} className="h-1" />;
    }
    return (
      <p key={key} className="text-sm text-foreground">
        {parseInline(line)}
      </p>
    );
  });
}

function parseInline(text: string): React.ReactNode {
  // Simple regex-based inline parser: bold, italic, code
  const parts: React.ReactNode[] = [];
  const regex = /(\*[^*]+\*|_[^_]+_|`[^`]+`)/g;
  let last = 0;
  let match;
  let idx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(<strong key={idx++}>{token.slice(1, -1)}</strong>);
    } else if (token.startsWith('_') && token.endsWith('_')) {
      parts.push(<em key={idx++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code key={idx++} className="bg-muted px-1 rounded text-xs font-mono">
          {token.slice(1, -1)}
        </code>
      );
    }
    last = regex.lastIndex;
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// =============================================================================
// Sub-components
// =============================================================================

function StepIndicator({ step }: { step: BriefingStep }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      {/* Status icon */}
      <div className="w-5 flex-shrink-0 flex items-center justify-center">
        {step.status === 'done' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        {step.status === 'running' && <Loader2 className="h-4 w-4 text-primary animate-spin" />}
        {step.status === 'pending' && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />}
        {step.status === 'skipped' && <SkipForward className="h-4 w-4 text-muted-foreground" />}
        {step.status === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
      </div>

      {/* Label */}
      <span
        className={cn(
          'text-sm flex-1',
          step.status === 'pending' && 'text-muted-foreground',
          step.status === 'running' && 'text-foreground font-medium',
          step.status === 'done' && 'text-foreground',
          step.status === 'skipped' && 'text-muted-foreground line-through',
          step.status === 'error' && 'text-destructive'
        )}
      >
        {step.label}
        {step.status === 'running' && '...'}
      </span>

      {/* Duration + detail */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {step.duration_ms !== undefined && (
          <span>{formatDuration(step.duration_ms)}</span>
        )}
        {step.detail && (
          <span className="text-muted-foreground/70">{step.detail}</span>
        )}
      </div>
    </div>
  );
}

function BriefingRenderer({ blocks }: { blocks: SlackBlock[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        if (block.type === 'header' && block.text) {
          return (
            <h3 key={i} className="text-sm font-semibold uppercase tracking-wider text-muted-foreground pt-2 first:pt-0">
              {block.text.text}
            </h3>
          );
        }

        if (block.type === 'section' && block.text) {
          const content = block.text.text;
          // Detect if content contains bullet lines
          const hasBullets = content.includes('\n•') || content.includes('\n-') || content.startsWith('•') || content.startsWith('-');
          if (hasBullets) {
            return (
              <ul key={i} className="space-y-1 list-none">
                {renderMrkdwn(content)}
              </ul>
            );
          }
          return (
            <div key={i} className="space-y-1">
              {renderMrkdwn(content)}
            </div>
          );
        }

        if (block.type === 'divider') {
          return <hr key={i} className="border-border" />;
        }

        if (block.type === 'context' && block.elements) {
          return (
            <div key={i} className="flex flex-wrap gap-2">
              {block.elements.map((el, j) => (
                <span key={j} className="text-xs text-muted-foreground">
                  {el.text?.text ?? ''}
                </span>
              ))}
            </div>
          );
        }

        if (block.type === 'rich_text') {
          // Fallback for rich_text blocks — just skip rendering if we can't parse them
          return null;
        }

        return null;
      })}
    </div>
  );
}

function GenerationMetaPanel({ meta }: { meta: GenerationMeta }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs text-muted-foreground">
      <div>
        <span className="font-medium text-foreground">Total time:</span>{' '}
        {formatDuration(meta.total_ms)}
      </div>
      <div>
        <span className="font-medium text-foreground">Credits:</span>{' '}
        {meta.credits_used.toFixed(1)}
      </div>
      <div>
        <span className="font-medium text-foreground">RAG:</span>{' '}
        {meta.rag_chunks}/{meta.rag_total}
      </div>
      <div>
        <span className="font-medium text-foreground">Model:</span>{' '}
        {meta.model}
      </div>
      <div>
        <span className="font-medium text-foreground">Prior meetings:</span>{' '}
        {meta.prior_meetings}
      </div>
    </div>
  );
}

// =============================================================================
// Main component
// =============================================================================

const INITIAL_STEPS: BriefingStep[] = [
  { id: 'context', label: 'Loading context', status: 'pending' },
  { id: 'history', label: 'Checking history', status: 'pending' },
  { id: 'transcripts', label: 'Querying transcripts', status: 'pending' },
  { id: 'compose', label: 'Composing briefing', status: 'pending' },
];

export default function DemoPrepBriefing() {
  const navigate = useNavigate();
  const { isPlatformAdmin } = useUserPermissions();

  // --- Meetings ---
  const [meetings, setMeetings] = useState<RecentMeeting[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [selectedMeeting, setSelectedMeeting] = useState<string>('');

  // --- Delivery ---
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('preview');

  // --- Generation state ---
  const [isGenerating, setIsGenerating] = useState(false);
  const [steps, setSteps] = useState<BriefingStep[]>(INITIAL_STEPS);
  const [blocks, setBlocks] = useState<SlackBlock[] | null>(null);
  const [rawMarkdown, setRawMarkdown] = useState<string | null>(null);
  const [meta, setMeta] = useState<GenerationMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // --- Load meetings ---
  useEffect(() => {
    async function loadMeetings() {
      setMeetingsLoading(true);
      try {
        const { data, error: fnError } = await supabase.functions.invoke('demo-recent-meetings', {
          method: 'GET',
        });
        if (fnError) throw fnError;
        setMeetings(data?.meetings ?? []);
      } catch (err) {
        console.error('Failed to load recent meetings:', err);
        toast.error('Failed to load recent meetings');
      } finally {
        setMeetingsLoading(false);
      }
    }
    loadMeetings();
  }, []);

  // --- Access guard ---
  if (!isPlatformAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">You don&apos;t have permission to access this page.</p>
        <Button variant="outline" onClick={() => navigate('/platform')}>
          Go Back
        </Button>
      </div>
    );
  }

  // --- Generate ---
  async function handleGenerate() {
    if (!selectedMeeting) return;

    // Reset state
    setError(null);
    setBlocks(null);
    setRawMarkdown(null);
    setMeta(null);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: 'pending' })));
    setIsGenerating(true);

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/demo-prep-briefing`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ meeting_id: selectedMeeting, delivery: deliveryMode }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          const eventType = event.type as string;

          if (eventType === 'step') {
            const stepId = event.step_id as string;
            const status = event.status as StepStatus;
            const durationMs = event.duration_ms as number | undefined;
            const detail = event.detail as string | undefined;

            setSteps((prev) =>
              prev.map((s) =>
                s.id === stepId
                  ? { ...s, status, duration_ms: durationMs, detail }
                  : s
              )
            );
          } else if (eventType === 'complete') {
            const payload = event as {
              type: string;
              blocks?: SlackBlock[];
              markdown?: string;
              meta?: GenerationMeta;
              sent_to_slack?: boolean;
            };
            if (payload.blocks) setBlocks(payload.blocks);
            if (payload.markdown) setRawMarkdown(payload.markdown);
            if (payload.meta) setMeta(payload.meta);

            if (deliveryMode === 'slack' && payload.sent_to_slack) {
              toast.success('Briefing sent to your Slack DM');
            }
          } else if (eventType === 'error') {
            throw new Error((event.message as string) ?? 'Generation failed');
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Generation failed';
      setError(message);
      toast.error(message);
      setSteps((prev) =>
        prev.map((s) => (s.status === 'running' ? { ...s, status: 'error' } : s))
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function handleCopyMarkdown() {
    if (!rawMarkdown) return;
    navigator.clipboard.writeText(rawMarkdown).then(() => {
      toast.success('Copied to clipboard');
    });
  }

  async function handleSendToSlack() {
    if (!selectedMeeting) return;
    toast.info('Sending to Slack...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/demo-prep-briefing`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ meeting_id: selectedMeeting, delivery: 'slack' }),
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      toast.success('Briefing sent to your Slack DM');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send to Slack';
      toast.error(message);
    }
  }

  const anyStepStarted = steps.some((s) => s.status !== 'pending');
  const hasBriefing = blocks !== null;

  return (
    <div className="container mx-auto px-6 py-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="space-y-2">
        <BackToPlatform />
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            Pre-Meeting Prep Demo
            <Badge variant="outline" className="text-xs font-normal">
              Demo
            </Badge>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Generate a real briefing from any of your recent meetings to see what your team gets before every call.
          </p>
        </div>
      </div>

      {/* Main card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Generate Briefing</CardTitle>
          <CardDescription>
            Select a meeting, choose how to receive the briefing, then generate.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Meeting selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Meeting</label>
            {meetingsLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select
                value={selectedMeeting}
                onValueChange={setSelectedMeeting}
                disabled={isGenerating}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a recent meeting..." />
                </SelectTrigger>
                <SelectContent>
                  {meetings.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No recent meetings found
                    </SelectItem>
                  ) : (
                    meetings.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="flex items-center gap-2">
                          <span className="text-muted-foreground text-xs">{formatDate(m.start_time)}</span>
                          <span>{m.title}</span>
                          {m.company && (
                            <span className="text-muted-foreground text-xs">· {m.company}</span>
                          )}
                          <span className="text-muted-foreground text-xs flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {m.attendee_count}
                          </span>
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Delivery toggle + Generate button */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-1">
              <span className="text-sm text-muted-foreground">Delivery:</span>
              <button
                type="button"
                onClick={() => setDeliveryMode('preview')}
                className={cn(
                  'text-sm px-3 py-1.5 rounded-md transition-colors',
                  deliveryMode === 'preview'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
                disabled={isGenerating}
              >
                <FileText className="h-3.5 w-3.5 inline mr-1.5" />
                Preview here
              </button>
              <button
                type="button"
                onClick={() => setDeliveryMode('slack')}
                className={cn(
                  'text-sm px-3 py-1.5 rounded-md transition-colors',
                  deliveryMode === 'slack'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
                disabled={isGenerating}
              >
                <Send className="h-3.5 w-3.5 inline mr-1.5" />
                Slack DM
              </button>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={!selectedMeeting || isGenerating || meetingsLoading}
              className="min-w-[140px]"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Generate Briefing
                </>
              )}
            </Button>
          </div>

          {/* Step progress */}
          {anyStepStarted && (
            <div className="space-y-1 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Progress
              </p>
              {steps.map((step) => (
                <StepIndicator key={step.id} step={step} />
              ))}
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Generated briefing */}
          {hasBriefing && blocks && (
            <div className="space-y-3 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Generated Briefing
              </p>

              <div className="rounded-lg border bg-card p-4 space-y-3">
                <BriefingRenderer blocks={blocks} />
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSendToSlack}
                  className="gap-2"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send to Slack
                </Button>
                {rawMarkdown && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyMarkdown}
                    className="gap-2"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy Markdown
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Generation metadata */}
          {meta && (
            <div className="space-y-2 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Generation Details
              </p>
              <GenerationMetaPanel meta={meta} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
