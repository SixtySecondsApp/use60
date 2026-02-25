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
} from 'lucide-react';
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
}

interface FollowUpResult {
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
            {step.detail && (
              <span className="text-xs text-muted-foreground">{step.detail}</span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EmailPreview({ result }: { result: FollowUpResult }) {
  const { email } = result;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Mail className="w-5 h-5" /> Generated Follow-Up
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="text-sm">
            <span className="font-medium">To:</span> {email.to}
          </div>
          <div className="text-sm">
            <span className="font-medium">Subject:</span> {email.subject}
          </div>
          <hr />
          <div className="text-sm whitespace-pre-wrap leading-relaxed">
            {email.body}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ContextBreakdown({ result }: { result: FollowUpResult }) {
  const { contextUsed, metadata } = result.email;
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-sm space-y-1">
          <p className="font-medium mb-2">Context Used</p>
          <div className="space-y-1 text-muted-foreground">
            <p>Today's transcript {contextUsed.transcript ? '- yes' : '- no'}</p>
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
}: {
  result: FollowUpResult;
  onCopy: () => void;
  onShowComparison: () => void;
}) {
  return (
    <div className="flex gap-3">
      <Button variant="outline" size="sm" onClick={onCopy}>
        <Copy className="w-4 h-4 mr-2" /> Copy Email
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
          <div className="rounded-lg border p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Without History
            </p>
            <p className="text-sm font-medium">{result.email.subjectWithoutHistory}</p>
            <hr />
            <p className="text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground">
              {result.email.bodyWithoutHistory}
            </p>
          </div>
          {/* With History (RAG-enhanced) */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
            <p className="text-xs font-medium text-primary uppercase tracking-wider">
              With Relationship Context
            </p>
            <p className="text-sm font-medium">{result.email.subject}</p>
            <hr />
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {result.email.body}
            </p>
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

  useEffect(() => {
    loadMeetings();
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

  async function generate() {
    if (!selectedMeetingId) return;
    setIsGenerating(true);
    setSteps([]);
    setResult(null);
    setError(null);
    setShowComparison(false);

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
            include_comparison: true,
          }),
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
    try {
      await navigator.clipboard.writeText(
        `Subject: ${result.email.subject}\n\n${result.email.body}`
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

      {/* Result */}
      {result && (
        <>
          <EmailPreview result={result} />
          <ContextBreakdown result={result} />
          <ActionButtons
            result={result}
            onCopy={handleCopy}
            onShowComparison={() => setShowComparison(true)}
          />
          {showComparison && result.email.bodyWithoutHistory && (
            <ComparisonView result={result} />
          )}
        </>
      )}
    </div>
  );
}
