/**
 * Gemini Model Comparison Demo
 *
 * Side-by-side comparison of Gemini 2.5 Flash vs Gemini 3.1 Flash Lite
 * across the 5 key AI tasks used in the platform.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  Trophy,
  Zap,
  Mail,
  Users,
  AlertTriangle,
  BarChart3,
  MessageSquare,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelResult {
  model: string;
  ms: number;
  raw: string;
  parsed: Record<string, unknown> | null;
  valid_json: boolean;
  char_count: number;
}

interface ComparisonResult {
  task: string;
  context: string;
  model_a: ModelResult;
  model_b: ModelResult;
}

interface TaskConfig {
  key: string;
  label: string;
  description: string;
  icon: typeof Mail;
  sampleContext: string;
}

// ---------------------------------------------------------------------------
// Task presets
// ---------------------------------------------------------------------------

const TASKS: TaskConfig[] = [
  {
    key: 'email_draft',
    label: 'Email Draft',
    description: 'Draft a follow-up email from meeting context',
    icon: Mail,
    sampleContext: 'Contact: James Bedford, CEO at TechFlow Solutions. Met last Tuesday to discuss their lead generation needs. They\'re spending 40k/month on LinkedIn ads with poor conversion. Interested in our AI-powered outreach but concerned about deliverability. Asked for pricing by end of week.',
  },
  {
    key: 'meeting_summary',
    label: 'Meeting Summary',
    description: 'Structured summary with decisions, actions, risks',
    icon: Users,
    sampleContext: '45-minute call with Sarah Chen (VP Sales, Acme Corp). Discussed migrating from Salesforce to our platform. She wants a pilot with 5 reps starting March 15. Concerns: data migration (50k contacts), SSO with Okta. Agreed to send SOW by Friday. Competitor: Gong (demoed but "too expensive"). Red flag: CFO hasn\'t signed off.',
  },
  {
    key: 'lead_enrichment',
    label: 'Lead Enrichment',
    description: 'Extract structured company intelligence',
    icon: BarChart3,
    sampleContext: 'Conturae is a B2B SaaS company based in London. Founded 2021 by ex-McKinsey consultants. AI-powered proposal automation for professional services. Raised $12M Series A (Balderton Capital). 85 employees. Clients: Deloitte, KPMG, PwC. Competitors: Qwilr, PandaDoc. Tech: React, Node.js, PostgreSQL.',
  },
  {
    key: 'deal_risk_analysis',
    label: 'Deal Risk Analysis',
    description: 'Assess pipeline deal risk from signals',
    icon: AlertTriangle,
    sampleContext: 'Deal: GlobalBank enterprise license. $240k ARR. Negotiation stage, 60 days in. Last activity: 12 days ago (no reply). Champion on leave. Legal review stalled. Competitor Gong demoed. Budget cycle ends March 31. 3 stakeholders absent. Original close date missed (Feb 28).',
  },
  {
    key: 'response_classification',
    label: 'Response Classification',
    description: 'Classify email reply intent and sentiment',
    icon: MessageSquare,
    sampleContext: 'Hi Tom, Thanks for the follow-up. The pricing looks reasonable but we have questions: 1) Can you break out implementation costs? 2) Typical onboarding timeline for 25 reps? 3) Quarterly billing option? We\'re keen to move forward but need these clarified for CFO sign-off. Quick call Thursday afternoon? Best, Sarah',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GeminiModelComparison() {
  const [results, setResults] = useState<Map<string, ComparisonResult>>(new Map());
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [customContexts, setCustomContexts] = useState<Map<string, string>>(new Map());
  const [runAllActive, setRunAllActive] = useState(false);

  const runComparison = async (taskKey: string) => {
    setRunning(prev => new Set(prev).add(taskKey));

    try {
      const customCtx = customContexts.get(taskKey);
      const { data, error } = await supabase.functions.invoke('cc-model-compare', {
        body: {
          task: taskKey,
          ...(customCtx ? { context: customCtx } : {}),
          model_a: 'gemini-2.5-flash',
          model_b: 'gemini-3.1-flash-lite-preview',
        },
      });

      if (error) throw error;

      setResults(prev => {
        const next = new Map(prev);
        next.set(taskKey, data as ComparisonResult);
        return next;
      });
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(prev => {
        const next = new Set(prev);
        next.delete(taskKey);
        return next;
      });
    }
  };

  const runAll = async () => {
    setRunAllActive(true);
    for (const task of TASKS) {
      await runComparison(task.key);
    }
    setRunAllActive(false);
    toast.success('All comparisons complete');
  };

  const getWinner = (result: ComparisonResult): 'a' | 'b' | 'tie' => {
    let scoreA = 0;
    let scoreB = 0;

    // Speed (lower is better)
    if (result.model_a.ms < result.model_b.ms) scoreA++;
    else if (result.model_b.ms < result.model_a.ms) scoreB++;

    // Valid JSON
    if (result.model_a.valid_json && !result.model_b.valid_json) scoreA++;
    else if (result.model_b.valid_json && !result.model_a.valid_json) scoreB++;

    // Field completeness (count non-null fields in parsed)
    if (result.model_a.parsed && result.model_b.parsed) {
      const countFields = (obj: Record<string, unknown>) =>
        Object.values(obj).filter(v => v !== null && v !== '' && v !== undefined).length;
      const fieldsA = countFields(result.model_a.parsed);
      const fieldsB = countFields(result.model_b.parsed);
      if (fieldsA > fieldsB) scoreA++;
      else if (fieldsB > fieldsA) scoreB++;
    }

    if (scoreA > scoreB) return 'a';
    if (scoreB > scoreA) return 'b';
    return 'tie';
  };

  // Aggregate scores
  const allResults = Array.from(results.values());
  const totalA = allResults.filter(r => getWinner(r) === 'a').length;
  const totalB = allResults.filter(r => getWinner(r) === 'b').length;
  const totalTie = allResults.filter(r => getWinner(r) === 'tie').length;
  const avgMsA = allResults.length > 0
    ? Math.round(allResults.reduce((s, r) => s + r.model_a.ms, 0) / allResults.length)
    : 0;
  const avgMsB = allResults.length > 0
    ? Math.round(allResults.reduce((s, r) => s + r.model_b.ms, 0) / allResults.length)
    : 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Gemini Model Comparison
          </h1>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">
            Side-by-side: Gemini 2.5 Flash vs Gemini 3.1 Flash Lite across 5 key platform tasks
          </p>
        </div>
        <Button
          onClick={runAll}
          disabled={runAllActive}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {runAllActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Run All 5 Tests
        </Button>
      </div>

      {/* Scoreboard */}
      {allResults.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card className={cn(totalA > totalB && 'ring-2 ring-blue-500')}>
            <CardContent className="py-4 text-center">
              <p className="text-xs text-slate-500 dark:text-gray-400 uppercase">Gemini 2.5 Flash</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">{totalA} wins</p>
              <p className="text-xs text-slate-400 mt-1">Avg {avgMsA}ms</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-xs text-slate-500 dark:text-gray-400 uppercase">Ties</p>
              <p className="text-3xl font-bold text-slate-400 mt-1">{totalTie}</p>
              <p className="text-xs text-slate-400 mt-1">{allResults.length}/5 tested</p>
            </CardContent>
          </Card>
          <Card className={cn(totalB > totalA && 'ring-2 ring-purple-500')}>
            <CardContent className="py-4 text-center">
              <p className="text-xs text-slate-500 dark:text-gray-400 uppercase">Gemini 3.1 Flash Lite</p>
              <p className="text-3xl font-bold text-purple-600 mt-1">{totalB} wins</p>
              <p className="text-xs text-slate-400 mt-1">Avg {avgMsB}ms</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Task cards */}
      <div className="space-y-6">
        {TASKS.map(task => {
          const result = results.get(task.key);
          const isRunning = running.has(task.key);
          const Icon = task.icon;
          const winner = result ? getWinner(result) : null;

          return (
            <Card key={task.key} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-gray-800">
                      <Icon className="h-5 w-5 text-slate-600 dark:text-gray-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{task.label}</CardTitle>
                      <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">{task.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {winner && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          winner === 'a' && 'border-blue-500 text-blue-600',
                          winner === 'b' && 'border-purple-500 text-purple-600',
                          winner === 'tie' && 'border-slate-300 text-slate-500',
                        )}
                      >
                        <Trophy className="h-3 w-3 mr-1" />
                        {winner === 'a' ? '2.5 Flash' : winner === 'b' ? '3.1 Flash Lite' : 'Tie'}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runComparison(task.key)}
                      disabled={isRunning}
                      className="gap-1.5"
                    >
                      {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      {result ? 'Re-run' : 'Run'}
                    </Button>
                  </div>
                </div>

                {/* Custom context input */}
                <Textarea
                  value={customContexts.get(task.key) ?? ''}
                  onChange={(e) => setCustomContexts(prev => {
                    const next = new Map(prev);
                    if (e.target.value) next.set(task.key, e.target.value);
                    else next.delete(task.key);
                    return next;
                  })}
                  placeholder={task.sampleContext}
                  className="mt-3 text-xs h-16 resize-none"
                />
              </CardHeader>

              {/* Results */}
              {result && (
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Model A */}
                    <ModelResultCard
                      label="Gemini 2.5 Flash"
                      color="blue"
                      result={result.model_a}
                      isWinner={winner === 'a'}
                      taskKey={task.key}
                    />
                    {/* Model B */}
                    <ModelResultCard
                      label="Gemini 3.1 Flash Lite"
                      color="purple"
                      result={result.model_b}
                      isWinner={winner === 'b'}
                      taskKey={task.key}
                    />
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Model Result Card
// ---------------------------------------------------------------------------

function ModelResultCard({
  label,
  color,
  result,
  isWinner,
  taskKey,
}: {
  label: string;
  color: 'blue' | 'purple';
  result: ModelResult;
  isWinner: boolean;
  taskKey: string;
}) {
  const [showJson, setShowJson] = useState(false);
  const colorClasses = color === 'blue'
    ? { border: 'border-blue-200 dark:border-blue-800', bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-600', accent: 'text-blue-700 dark:text-blue-300' }
    : { border: 'border-purple-200 dark:border-purple-800', bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-600', accent: 'text-purple-700 dark:text-purple-300' };

  return (
    <div className={cn('rounded-lg border p-3 space-y-3', colorClasses.border, isWinner && 'ring-2 ring-offset-1', isWinner && color === 'blue' && 'ring-blue-500', isWinner && color === 'purple' && 'ring-purple-500')}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className={cn('text-xs font-semibold', colorClasses.text)}>
          {label}
          {isWinner && <Trophy className="h-3 w-3 inline ml-1" />}
        </span>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] gap-1">
            <Clock className="h-2.5 w-2.5" />
            {result.ms}ms
          </Badge>
          {result.valid_json ? (
            <Badge variant="outline" className="text-[10px] gap-1 border-green-300 text-green-600">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Valid
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] gap-1 border-red-300 text-red-600">
              <XCircle className="h-2.5 w-2.5" />
              Error
            </Badge>
          )}
        </div>
      </div>

      {/* Formatted output */}
      {result.parsed ? (
        <FormattedOutput data={result.parsed} taskKey={taskKey} colorClasses={colorClasses} />
      ) : (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 text-xs">
          {result.raw}
        </div>
      )}

      {/* Toggle raw JSON */}
      <button
        onClick={() => setShowJson(!showJson)}
        className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 underline underline-offset-2"
      >
        {showJson ? 'Hide' : 'Show'} raw JSON
      </button>
      {showJson && (
        <pre className="text-[10px] p-2 rounded bg-slate-100 dark:bg-gray-800 overflow-auto max-h-48 whitespace-pre-wrap font-mono">
          {result.parsed ? JSON.stringify(result.parsed, null, 2) : result.raw}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatted Output — renders parsed JSON in a human-readable way per task
// ---------------------------------------------------------------------------

function FormattedOutput({
  data,
  taskKey,
  colorClasses,
}: {
  data: Record<string, unknown>;
  taskKey: string;
  colorClasses: { bg: string; accent: string };
}) {
  if (taskKey === 'email_draft') {
    return (
      <div className="space-y-2">
        <div className={cn('rounded-lg overflow-hidden border border-slate-200 dark:border-gray-700')}>
          <div className="px-3 py-2 bg-slate-50 dark:bg-gray-800/60 space-y-1 text-xs">
            <div className="flex gap-2">
              <span className="text-slate-400 w-14 shrink-0">To</span>
              <span className="text-slate-700 dark:text-gray-200">{String(data.to || '—')}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-400 w-14 shrink-0">Subject</span>
              <span className="font-medium text-slate-800 dark:text-gray-100">{String(data.subject || '—')}</span>
            </div>
          </div>
          <div
            className="px-3 py-2.5 text-xs text-slate-700 dark:text-gray-300 leading-relaxed bg-white dark:bg-gray-900/60 [&_br]:mb-1"
            dangerouslySetInnerHTML={{ __html: String(data.body_html || data.body || '—') }}
          />
        </div>
        {data.reasoning && (
          <p className="text-[10px] text-slate-400 dark:text-gray-500 italic px-1">{String(data.reasoning)}</p>
        )}
      </div>
    );
  }

  if (taskKey === 'meeting_summary') {
    return (
      <div className="space-y-2.5">
        {data.summary && (
          <p className="text-xs text-slate-700 dark:text-gray-300 leading-relaxed">{String(data.summary)}</p>
        )}
        <FieldList label="Key Decisions" items={data.key_decisions} icon={<CheckCircle2 className="h-3 w-3 text-emerald-500" />} />
        <FieldList label="Action Items" items={data.action_items} icon={<Zap className="h-3 w-3 text-amber-500" />} />
        <FieldList label="Risks" items={data.risks} icon={<AlertTriangle className="h-3 w-3 text-red-500" />} />
        <FieldList label="Next Steps" items={data.next_steps} icon={<Play className="h-3 w-3 text-blue-500" />} />
      </div>
    );
  }

  if (taskKey === 'lead_enrichment') {
    const fields = [
      ['Company', data.company_name],
      ['Industry', data.industry],
      ['Employees', data.employee_count],
      ['Funding', data.funding_stage],
      ['Target Market', data.target_market],
      ['Competitive Position', data.competitive_position],
    ];
    return (
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {fields.filter(([, v]) => v != null && v !== '').map(([label, value]) => (
            <div key={String(label)}>
              <span className="text-[10px] text-slate-400 dark:text-gray-500 uppercase tracking-wide">{String(label)}</span>
              <p className="text-xs text-slate-700 dark:text-gray-300">{String(value)}</p>
            </div>
          ))}
        </div>
        <FieldList label="Key Products" items={data.key_products} icon={<BarChart3 className="h-3 w-3 text-blue-500" />} />
        <FieldList label="Technologies" items={data.technologies} icon={<Zap className="h-3 w-3 text-purple-500" />} />
        <FieldList label="Recent News" items={data.recent_news} icon={<MessageSquare className="h-3 w-3 text-amber-500" />} />
      </div>
    );
  }

  if (taskKey === 'deal_risk_analysis') {
    const riskLevel = String(data.risk_level || 'unknown');
    const riskScore = Number(data.risk_score || 0);
    const confidence = Number(data.confidence || 0);
    const riskColorMap: Record<string, string> = {
      low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };
    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-3">
          <Badge className={cn('text-xs', riskColorMap[riskLevel] || 'bg-slate-100 text-slate-600')}>
            {riskLevel.toUpperCase()}
          </Badge>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Score: <span className="font-semibold text-slate-700 dark:text-gray-200">{riskScore}/100</span></span>
            <span className="mx-1 text-slate-300">|</span>
            <span>Confidence: <span className="font-semibold text-slate-700 dark:text-gray-200">{Math.round(confidence * 100)}%</span></span>
          </div>
          {data.days_until_critical != null && (
            <Badge variant="outline" className="text-[10px]">
              <Clock className="h-2.5 w-2.5 mr-1" />
              {String(data.days_until_critical)}d to critical
            </Badge>
          )}
        </div>
        <FieldList label="Risk Factors" items={data.risk_factors} icon={<AlertTriangle className="h-3 w-3 text-red-500" />} />
        <FieldList label="Recommended Actions" items={data.recommended_actions} icon={<CheckCircle2 className="h-3 w-3 text-emerald-500" />} />
      </div>
    );
  }

  if (taskKey === 'response_classification') {
    const intent = String(data.intent || '—');
    const sentiment = Number(data.sentiment || 0);
    const sentimentLabel = sentiment > 0.3 ? 'Positive' : sentiment < -0.3 ? 'Negative' : 'Neutral';
    const sentimentColor = sentiment > 0.3 ? 'text-emerald-600' : sentiment < -0.3 ? 'text-red-600' : 'text-slate-500';
    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="outline" className="text-xs capitalize">{intent.replace(/_/g, ' ')}</Badge>
          <span className={cn('text-xs font-medium', sentimentColor)}>
            {sentimentLabel} ({sentiment > 0 ? '+' : ''}{sentiment.toFixed(1)})
          </span>
          {data.needs_reply && (
            <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              Needs Reply
            </Badge>
          )}
          {data.urgency && (
            <Badge variant="outline" className="text-[10px] capitalize">{String(data.urgency)} urgency</Badge>
          )}
        </div>
        <FieldList label="Key Phrases" items={data.key_phrases} icon={<MessageSquare className="h-3 w-3 text-blue-500" />} />
        {data.suggested_action && (
          <div>
            <span className="text-[10px] text-slate-400 dark:text-gray-500 uppercase tracking-wide">Suggested Action</span>
            <p className="text-xs text-slate-700 dark:text-gray-300 mt-0.5">{String(data.suggested_action)}</p>
          </div>
        )}
      </div>
    );
  }

  // Fallback: render key-value pairs
  return (
    <div className="space-y-1.5">
      {Object.entries(data).map(([key, value]) => (
        <div key={key}>
          <span className="text-[10px] text-slate-400 dark:text-gray-500 uppercase tracking-wide">{key.replace(/_/g, ' ')}</span>
          <p className="text-xs text-slate-700 dark:text-gray-300">
            {Array.isArray(value) ? value.join(', ') : String(value ?? '—')}
          </p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field List helper — renders an array of strings as a labeled bullet list
// ---------------------------------------------------------------------------

function FieldList({
  label,
  items,
  icon,
}: {
  label: string;
  items: unknown;
  icon: React.ReactNode;
}) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] text-slate-500 dark:text-gray-400 font-medium uppercase tracking-wide">{label}</span>
      </div>
      <ul className="space-y-0.5 pl-5">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-slate-700 dark:text-gray-300 list-disc">
            {String(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}
