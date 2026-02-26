/**
 * Follow-Up Email Demo Page
 *
 * Generates follow-up emails from real meetings with side-by-side comparison.
 * Connects to the generate-follow-up edge function via SSE streaming.
 *
 * Route: /platform/follow-up-demo
 * Guard: PlatformAdminRouteGuard
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Sparkles, Mail, Copy, Columns, CheckCircle2,
  Loader2, MinusCircle, XCircle, Circle, Calendar,
  RefreshCw, Pencil, Eye, Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/clientV2';

// ============================================================
// TYPES
// ============================================================

interface Meeting {
  id: string;
  title: string;
  date: string;
  durationMinutes: number | null;
  attendees: Array<{ name: string | null; email: string | null }>;
  companyName: string | null;
  meetingNumber: number;
  hasTranscript: boolean;
}

interface Step {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'complete' | 'skipped' | 'failed';
  detail?: string;
  durationMs?: number;
}

interface FollowUpResult {
  isRegeneration?: boolean;
  slackSent?: boolean;
  cachedRagContext?: {
    hasHistory: boolean;
    meetingNumber: number;
    sections: Record<string, { chunks: unknown[] }>;
    queryCredits: number;
  };
  email: {
    to: string;
    subject: string;
    body: string;
    bodyWithoutHistory: string | null;
    subjectWithoutHistory: string | null;
    contextUsed: {
      transcript: boolean;
      priorMeetings: number;
      commitmentsFound: number;
      concernsFound: number;
      commercialSignals: boolean;
      stakeholderChanges: boolean;
      writingStyle: boolean;
      ragSummary?: Record<string, string[]>;
    };
    metadata: {
      meetingNumber: number;
      ragQueriesRun: number;
      ragQueriesReturned: number;
      wordCount: number;
      creditsConsumed: number;
      modelUsed: string;
    };
  };
}

// ============================================================
// RENDERING HELPERS
// ============================================================

function renderInlineFormatting(text: string): React.ReactNode {
  // Handle **bold** markers
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderEmailBody(body: string): React.ReactNode {
  if (!body) return null;

  // Split into paragraphs
  const paragraphs = body.split(/\n\n+/);

  return paragraphs.map((para, i) => {
    const trimmed = para.trim();
    if (!trimmed) return null;

    // Check if this is a bullet list (lines starting with - or * or •)
    const lines = trimmed.split('\n');
    const isList = lines.every(l => /^\s*[-*•]/.test(l.trim()) || l.trim() === '');

    if (isList) {
      return (
        <ul key={i} className="list-disc pl-5 space-y-1 my-2">
          {lines.filter(l => l.trim()).map((line, j) => (
            <li key={j} className="text-sm leading-relaxed">
              {renderInlineFormatting(line.replace(/^\s*[-*•]\s*/, ''))}
            </li>
          ))}
        </ul>
      );
    }

    return (
      <p key={i} className="text-sm leading-relaxed mb-3">
        {renderInlineFormatting(trimmed.replace(/\n/g, ' '))}
      </p>
    );
  });
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function MeetingRow({
  meeting,
  selected,
  onClick,
}: {
  meeting: Meeting;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-colors',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50'
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">{meeting.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(meeting.date).toLocaleDateString()} —{' '}
            {meeting.attendees[0]?.name || 'Unknown'}
            {meeting.companyName ? `, ${meeting.companyName}` : ''}
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-muted-foreground">
            {meeting.durationMinutes ? `${meeting.durationMinutes} min` : ''} · Meeting #{meeting.meetingNumber}
          </span>
        </div>
      </div>
    </button>
  );
}

function StepsDisplay({ steps }: { steps: Step[] }) {
  const allDone = steps.length > 0 && steps.every(s => s.status === 'complete' || s.status === 'skipped');
  const totalMs = steps.reduce((sum, s) => sum + (s.durationMs || 0), 0);

  return (
    <Card>
      <CardContent className="pt-4 space-y-2">
        {steps.map(step => (
          <div key={step.id} className="flex items-center gap-3 text-sm">
            {step.status === 'complete' && (
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            )}
            {step.status === 'running' && (
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
            )}
            {step.status === 'skipped' && (
              <MinusCircle className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
            {step.status === 'failed' && (
              <XCircle className="w-4 h-4 text-destructive shrink-0" />
            )}
            {step.status === 'pending' && (
              <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
            <span
              className={cn(
                'flex-1',
                step.status === 'skipped' && 'text-muted-foreground'
              )}
            >
              {step.label}
            </span>
            {step.durationMs != null && (
              <span className="text-xs text-muted-foreground ml-1">
                ({(step.durationMs / 1000).toFixed(1)}s)
              </span>
            )}
            {step.detail && (
              <span className="text-xs text-muted-foreground">{step.detail}</span>
            )}
          </div>
        ))}
        {allDone && (
          <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
            Total: {(totalMs / 1000).toFixed(1)}s
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmailPreview({
  result,
  editedSubject,
  editedBody,
  isEditing,
  onEdit,
  onPreview,
  onCancel,
  onSubjectChange,
  onBodyChange,
}: {
  result: FollowUpResult;
  editedSubject: string;
  editedBody: string;
  isEditing: boolean;
  onEdit: () => void;
  onPreview: () => void;
  onCancel: () => void;
  onSubjectChange: (val: string) => void;
  onBodyChange: (val: string) => void;
}) {
  const { email } = result;
  const displaySubject = isEditing ? editedSubject : (editedSubject || email.subject);
  const displayBody = isEditing ? editedBody : (editedBody || email.body);
  const wordCount = displayBody.trim().split(/\s+/).filter(Boolean).length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Mail className="w-5 h-5" /> Generated Follow-Up
          {result.isRegeneration && (
            <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              Regenerated
            </span>
          )}
        </CardTitle>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={onPreview}>
                <Eye className="w-3.5 h-3.5 mr-1.5" /> Preview
              </Button>
              <Button variant="ghost" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Email header */}
        <div className="border-b bg-muted/30 px-5 py-3 space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">To:</span>
            <span>{email.to}</span>
          </div>
          {isEditing ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Subject:</span>
              <input
                className="flex-1 text-sm font-semibold bg-background border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
                value={editedSubject}
                onChange={(e) => onSubjectChange(e.target.value)}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Subject:</span>
              <span className="text-sm font-semibold">{displaySubject}</span>
            </div>
          )}
        </div>
        {/* Email body */}
        {isEditing ? (
          <div className="px-5 py-4">
            <textarea
              className="w-full min-h-[300px] text-sm leading-relaxed bg-background border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              value={editedBody}
              onChange={(e) => onBodyChange(e.target.value)}
            />
          </div>
        ) : (
          <div className="px-5 py-4">
            {renderEmailBody(displayBody)}
          </div>
        )}
        {/* Signature */}
        <div className="border-t px-5 py-3">
          <p className="text-xs text-muted-foreground italic">
            Sent on your behalf
          </p>
        </div>
        {/* Word count */}
        <div className="border-t bg-muted/20 px-5 py-2">
          <p className="text-xs text-muted-foreground">
            {wordCount} words
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ContextBreakdown({ result }: { result: FollowUpResult }) {
  const { contextUsed, metadata } = result.email;

  const ragLabels: Record<string, string> = {
    prior_commitments: 'Prior Commitments',
    prospect_concerns: 'Prospect Concerns',
    their_words: 'Their Language',
    deal_trajectory: 'Deal Trajectory',
    commercial_history: 'Commercial History',
    stakeholder_context: 'Stakeholder Changes',
  };

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-sm space-y-1">
          <p className="font-medium mb-2">Context Used</p>
          <div className="space-y-1 text-muted-foreground">
            <p>{"Today's transcript"} {contextUsed.transcript ? '- yes' : '- no'}</p>
            {contextUsed.priorMeetings > 0 && (
              <p>{contextUsed.priorMeetings} prior meetings queried via RAG</p>
            )}
            {contextUsed.commitmentsFound > 0 && (
              <p>{contextUsed.commitmentsFound} commitments found</p>
            )}
            {contextUsed.concernsFound > 0 && (
              <p>{contextUsed.concernsFound} prospect concerns found</p>
            )}
            {contextUsed.commercialSignals && <p>Commercial signals found</p>}
            {contextUsed.stakeholderChanges && <p>Stakeholder changes detected</p>}
            <p>Writing style {contextUsed.writingStyle ? 'applied' : 'not applied'}</p>
          </div>

          {/* RAG Findings Detail */}
          {contextUsed.ragSummary && Object.keys(contextUsed.ragSummary).length > 0 && (
            <div className="mt-3 pt-3 border-t space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">What RAG Found</p>
              {Object.entries(contextUsed.ragSummary).map(([key, snippets]) => (
                <div key={key} className="text-xs">
                  <p className="font-medium text-foreground">{ragLabels[key] || key}</p>
                  {snippets.map((s, i) => (
                    <p key={i} className="text-muted-foreground ml-3 mt-0.5 line-clamp-2">{s}</p>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-4 mt-3 pt-3 border-t text-xs text-muted-foreground">
            <span>{metadata.wordCount} words</span>
            <span>
              {metadata.ragQueriesReturned}/{metadata.ragQueriesRun} RAG queries returned
            </span>
            <span>{metadata.creditsConsumed.toFixed(1)} credits</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionButtons({
  result,
  onCopy,
  onShowComparison,
  onRegenerate,
  onSendToSlack,
  isGenerating,
  isSendingSlack,
  slackConnected,
}: {
  result: FollowUpResult;
  onCopy: () => void;
  onShowComparison: () => void;
  onRegenerate: () => void;
  onSendToSlack: () => void;
  isGenerating: boolean;
  isSendingSlack: boolean;
  slackConnected: boolean | null;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" size="sm" onClick={onCopy}>
        <Copy className="w-4 h-4 mr-2" /> Copy Email
      </Button>
      <Button variant="outline" size="sm" onClick={onRegenerate} disabled={isGenerating}>
        <RefreshCw className="w-4 h-4 mr-2" /> Regenerate
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onSendToSlack}
        disabled={!slackConnected || isSendingSlack || isGenerating}
        title={slackConnected === false ? 'Connect Slack in Settings to enable' : undefined}
      >
        {isSendingSlack ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Send className="w-4 h-4 mr-2" />
        )}
        Send to Slack
      </Button>
      {result.email.bodyWithoutHistory && (
        <Button variant="outline" size="sm" onClick={onShowComparison}>
          <Columns className="w-4 h-4 mr-2" /> Show Without History
        </Button>
      )}
    </div>
  );
}

function ComparisonView({ result }: { result: FollowUpResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Comparison</CardTitle>
        <CardDescription>
          The same meeting — with and without relationship context
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Without History */}
          <div className="rounded-lg border overflow-hidden space-y-0">
            <div className="bg-muted/30 px-4 py-2.5 border-b">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Without History
              </p>
              <p className="text-sm font-semibold mt-0.5">{result.email.subjectWithoutHistory}</p>
            </div>
            <div className="px-4 py-3 text-muted-foreground">
              {renderEmailBody(result.email.bodyWithoutHistory ?? '')}
            </div>
          </div>
          {/* With History (RAG-enhanced) */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 overflow-hidden space-y-0">
            <div className="bg-primary/10 px-4 py-2.5 border-b border-primary/20">
              <p className="text-xs font-medium text-primary uppercase tracking-wider">
                With Relationship Context
              </p>
              <p className="text-sm font-semibold mt-0.5">{result.email.subject}</p>
            </div>
            <div className="px-4 py-3">
              {renderEmailBody(result.email.body)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function FollowUpDemoPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<FollowUpResult | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGuidanceInput, setShowGuidanceInput] = useState(false);
  const [guidanceText, setGuidanceText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');
  const [slackConnected, setSlackConnected] = useState<boolean | null>(null);
  const [isSendingSlack, setIsSendingSlack] = useState(false);

  useEffect(() => {
    loadMeetings();
    checkSlackConnection();
  }, []);

  async function loadMeetings() {
    setIsLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-follow-up`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const data = await response.json();
      setMeetings(data.meetings || []);
    } catch (err) {
      console.error('Failed to load meetings:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function checkSlackConnection() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: mapping } = await supabase
        .from('slack_user_mappings')
        .select('slack_user_id')
        .eq('sixty_user_id', user.id)
        .maybeSingle();
      setSlackConnected(!!mapping?.slack_user_id);
    } catch {
      setSlackConnected(false);
    }
  }

  async function sendToSlack() {
    if (!selectedMeetingId || !result) return;
    setIsSendingSlack(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-follow-up`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            meeting_id: selectedMeetingId,
            delivery: 'slack',
            cached_rag_context: result.cachedRagContext,
          }),
        }
      );

      console.log('[sendToSlack] Response status:', response.status, response.headers.get('content-type'));

      // If the response is not SSE (e.g. auth error, bad request), read as JSON
      if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
        const errorBody = await response.text();
        console.error('[sendToSlack] Non-SSE response:', errorBody);
        toast.error(`Slack failed: ${response.status} ${errorBody.slice(0, 100)}`);
        setIsSendingSlack(false);
        return;
      }

      // Read SSE stream for the slack delivery result
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sent = false;
      let slackError = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log('[sendToSlack] SSE data:', data);
              // Check result event
              if (data.slackSent === true) sent = true;
              if (data.email && data.slackSent) sent = true;
              // Capture Slack step failures
              if (data.id === 'slack_delivery' && data.status === 'failed') {
                slackError = data.label || 'Slack delivery failed';
              }
              // Capture stream errors
              if (data.message && !data.id) {
                slackError = data.message;
              }
            } catch {
              // skip malformed lines
            }
          }
        }
      }

      if (sent) {
        toast.success('Sent to Slack for approval');
      } else {
        console.warn('[sendToSlack] Slack not sent. Error:', slackError);
        toast.error(slackError || 'Failed to send to Slack');
      }
    } catch (err) {
      console.error('[sendToSlack] Exception:', err);
      toast.error('Failed to send to Slack');
    } finally {
      setIsSendingSlack(false);
    }
  }

  async function generate(opts?: { guidance?: string; cachedRagContext?: FollowUpResult['cachedRagContext'] }) {
    if (!selectedMeetingId) return;
    setIsGenerating(true);
    setSteps([]);
    setResult(null);
    setError(null);
    setShowComparison(false);
    setShowGuidanceInput(false);
    setIsEditing(false);
    setEditedSubject('');
    setEditedBody('');

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const requestBody: Record<string, unknown> = {
        meeting_id: selectedMeetingId,
        include_comparison: !opts?.guidance, // Skip comparison on regeneration
      };
      if (opts?.guidance) {
        requestBody.regenerate_guidance = opts.guidance;
      }
      if (opts?.cachedRagContext) {
        requestBody.cached_rag_context = opts.cachedRagContext;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-follow-up`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      );

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            // Event type header — next line will be data
            continue;
          }
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            try {
              const data = JSON.parse(jsonStr);
              if (data.id && data.status) {
                // Step update
                setSteps(prev => {
                  const existing = prev.find(s => s.id === data.id);
                  if (existing) {
                    return prev.map(s => s.id === data.id ? { ...s, ...data } : s);
                  }
                  return [...prev, data];
                });
              } else if (data.email) {
                // Final result
                setResult(data);
              } else if (data.message) {
                // Error from server
                setError(data.message);
                reader?.cancel();
                return;
              }
            } catch {
              // Ignore malformed SSE data lines
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    const subject = editedSubject || result.email.subject;
    const body = editedBody || result.email.body;
    try {
      await navigator.clipboard.writeText(
        `Subject: ${subject}\n\n${body}`
      );
    } catch {
      // Clipboard API unavailable — silent fallback
    }
  }

  return (
    <div className="container mx-auto max-w-5xl py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Follow-Up Email Demo</h1>
        <p className="text-muted-foreground mt-1">
          Generate the follow-up email your buyer would receive after any of your recent meetings.
        </p>
      </div>

      {/* Meeting Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5" /> Select a Meeting
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading meetings...
            </div>
          )}
          {meetings.map(meeting => (
            <MeetingRow
              key={meeting.id}
              meeting={meeting}
              selected={selectedMeetingId === meeting.id}
              onClick={() => setSelectedMeetingId(meeting.id)}
            />
          ))}
          {meetings.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground">
              No meetings with transcripts found.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Generate Button */}
      <Button
        onClick={generate}
        disabled={!selectedMeetingId || isGenerating}
        className="w-full"
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 mr-2" /> Generate Follow-Up Email
          </>
        )}
      </Button>

      {/* Progress Steps */}
      {steps.length > 0 && <StepsDisplay steps={steps} />}

      {/* Error */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Guidance Input Modal */}
      {showGuidanceInput && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-medium">How should the email be different?</p>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. Make it shorter, more casual, emphasise the pricing discussion, remove the action items..."
              value={guidanceText}
              onChange={(e) => setGuidanceText(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  if (guidanceText.trim()) {
                    generate({
                      guidance: guidanceText.trim(),
                      cachedRagContext: result?.cachedRagContext,
                    });
                    setGuidanceText('');
                  }
                }}
                disabled={!guidanceText.trim() || isGenerating}
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Regenerate with Guidance
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowGuidanceInput(false);
                  setGuidanceText('');
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result && (
        <>
          <EmailPreview
            result={result}
            editedSubject={editedSubject || result.email.subject}
            editedBody={editedBody || result.email.body}
            isEditing={isEditing}
            onEdit={() => {
              if (!editedSubject) setEditedSubject(result.email.subject);
              if (!editedBody) setEditedBody(result.email.body);
              setIsEditing(true);
            }}
            onPreview={() => setIsEditing(false)}
            onCancel={() => {
              setIsEditing(false);
              setEditedSubject('');
              setEditedBody('');
            }}
            onSubjectChange={setEditedSubject}
            onBodyChange={setEditedBody}
          />
          <ContextBreakdown result={result} />
          <ActionButtons
            result={result}
            onCopy={handleCopy}
            onShowComparison={() => setShowComparison(true)}
            onRegenerate={() => setShowGuidanceInput(true)}
            onSendToSlack={sendToSlack}
            isGenerating={isGenerating}
            isSendingSlack={isSendingSlack}
            slackConnected={slackConnected}
          />
          {showComparison && result.email.bodyWithoutHistory && (
            <ComparisonView result={result} />
          )}
        </>
      )}
    </div>
  );
}
