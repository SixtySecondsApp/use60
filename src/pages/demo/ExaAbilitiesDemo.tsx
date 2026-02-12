import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, XCircle, Clock3, Loader2, Wand2, Table2, Radar, ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';

type EndpointCase =
  | 'search_company_auto'
  | 'search_people_auto'
  | 'find_similar'
  | 'answer'
  | 'websets_preview'
  | 'websets_create';

interface EndpointResult {
  name: EndpointCase;
  endpoint: string;
  status: number;
  ok: boolean;
  latency_ms: number;
  summary: string;
  sample?: Record<string, unknown>;
  error?: string;
}

interface DemoResponse {
  tested_at: string;
  domain: string;
  similar_url: string;
  trend_topic: string;
  run_webset_create: boolean;
  success_count: number;
  total_count: number;
  results: EndpointResult[];
  scenario_id?: string;
  scenario_panels?: Array<{
    key: 'accountDiscovery' | 'personaDiscovery' | 'intentIntel' | 'websetsPlan';
    title: string;
    status: 'success' | 'partial' | 'fallback' | 'error';
    using_fallback_data: boolean;
    what_happened: string;
    why_this_matters: string;
    what_to_do_next: string[];
  }>;
  next_actions?: string[];
  usable_outputs?: {
    account_targets: Array<{ name: string; url: string; snippet?: string; rank_score: number; why_matched: string }>;
    persona_targets: Array<{ name: string; url: string; role_hint?: string; seniority_hint: string; why_fit: string }>;
    competitive_links: Array<{ title: string; url: string }>;
    intent_signals: Array<{ signal: string; strength: 'high' | 'medium' | 'context'; evidence?: string }>;
    trend_summary: {
      answer: string;
      citation_count: number;
      citations: Array<{ title: string; url: string }>;
    };
    websets_setup: {
      query: string;
      criteria: string[];
      enrichments: string[];
      recommended_columns: string[];
      can_create_webset: boolean;
      webset_id?: string;
    };
  };
  ops_table_blueprints?: Array<{ name: string; purpose: string; columns: string[] }>;
  implementation_recommendations?: string[];
}

interface OpsCapability {
  id: string;
  title: string;
  unlocks: string;
  required: EndpointCase[];
}

interface DemoScenario {
  id: string;
  title: string;
  prompt: string;
  expected: string;
  config: {
    domain: string;
    similarUrl: string;
    trendTopic: string;
    runWebsetCreate: boolean;
  };
  focus: EndpointCase[];
}

const OPS_CAPABILITIES: OpsCapability[] = [
  {
    id: 'ops-account-discovery',
    title: 'Account Discovery Table Builder',
    unlocks: 'Generate target account lists into Ops tables with company metadata.',
    required: ['search_company_auto', 'websets_preview'],
  },
  {
    id: 'ops-people-discovery',
    title: 'Buyer Persona Discovery',
    unlocks: 'Populate contact columns from people search for ICP-based prospecting.',
    required: ['search_people_auto'],
  },
  {
    id: 'ops-competitive-graph',
    title: 'Competitive Similarity Radar',
    unlocks: 'Find lookalike competitors/alternatives to enrich account strategy rows.',
    required: ['find_similar'],
  },
  {
    id: 'ops-research-column',
    title: 'Research Summary Columns',
    unlocks: 'Generate summarized insights with citation counts for each account row.',
    required: ['answer'],
  },
  {
    id: 'ops-webset-pipeline',
    title: 'Webset-to-Ops Pipeline',
    unlocks: 'Preview criteria and launch asynchronous Websets for continuous table ingestion.',
    required: ['websets_preview', 'websets_create'],
  },
];

const CASE_LABELS: Record<EndpointCase, string> = {
  search_company_auto: 'Search (Company)',
  search_people_auto: 'Search (People)',
  find_similar: 'Find Similar Links',
  answer: 'Answer + Citations',
  websets_preview: 'Websets Preview',
  websets_create: 'Websets Create',
};

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'search-1',
    title: 'Search 1',
    prompt: 'Try this: find account-level companies similar to a known winner.',
    expected: 'You should get healthy results for company search + find similar links.',
    config: {
      domain: 'hubspot.com',
      similarUrl: 'https://www.hubspot.com',
      trendTopic: 'sales engagement platforms in 2026',
      runWebsetCreate: false,
    },
    focus: ['search_company_auto', 'find_similar'],
  },
  {
    id: 'search-2',
    title: 'Search 2',
    prompt: 'Try this: find target buyer personas and summarize a market trend.',
    expected: 'You should get people search + answer endpoint success.',
    config: {
      domain: 'gong.io',
      similarUrl: 'https://www.gong.io',
      trendTopic: 'AI revenue intelligence and sales coaching trends',
      runWebsetCreate: false,
    },
    focus: ['search_people_auto', 'answer'],
  },
  {
    id: 'websets-preview',
    title: 'Set up a Websets table',
    prompt: 'Try this: preview a Websets query before launching an async run.',
    expected: 'You should see Websets preview health and suggested enrichments.',
    config: {
      domain: 'stripe.com',
      similarUrl: 'https://stripe.com',
      trendTopic: 'fintech sales platform trends',
      runWebsetCreate: false,
    },
    focus: ['websets_preview'],
  },
  {
    id: 'websets-create',
    title: 'Set up and create a Websets table',
    prompt: 'Try this: launch a real Webset run (credit-consuming).',
    expected: 'You should get a successful Webset create with webset_id in sample.',
    config: {
      domain: 'ramp.com',
      similarUrl: 'https://ramp.com',
      trendTopic: 'finance ops automation buying signals',
      runWebsetCreate: true,
    },
    focus: ['websets_preview', 'websets_create'],
  },
];

export default function ExaAbilitiesDemo() {
  const [domain, setDomain] = useState('use60.com');
  const [similarUrl, setSimilarUrl] = useState('https://www.hubspot.com');
  const [trendTopic, setTrendTopic] = useState('sales engagement platforms in 2026');
  const [runWebsetCreate, setRunWebsetCreate] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DemoResponse | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [activeScenario, setActiveScenario] = useState<string | null>(DEMO_SCENARIOS[0].id);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const resultMap = useMemo(() => {
    const map = new Map<EndpointCase, EndpointResult>();
    (result?.results || []).forEach((r) => map.set(r.name, r));
    return map;
  }, [result]);

  const readiness = useMemo(
    () =>
      OPS_CAPABILITIES.map((cap) => {
        const missing = cap.required.filter((req) => !resultMap.get(req)?.ok);
        return { ...cap, ready: missing.length === 0, missing };
      }),
    [resultMap]
  );

  const runDemo = async (override?: Partial<DemoScenario['config']>) => {
    const resolvedDomain = override?.domain ?? domain;
    const resolvedSimilarUrl = override?.similarUrl ?? similarUrl;
    const resolvedTrendTopic = override?.trendTopic ?? trendTopic;
    const resolvedRunWebsetCreate = override?.runWebsetCreate ?? runWebsetCreate;

    setLoading(true);
    setLastError(null);
    try {
      const { data, error } = await supabase.functions.invoke('exa-abilities-demo', {
        body: {
          scenarioId: activeScenario ?? DEMO_SCENARIOS[0].id,
          domain: resolvedDomain,
          similarUrl: resolvedSimilarUrl,
          trendTopic: resolvedTrendTopic,
          runWebsetCreate: resolvedRunWebsetCreate,
        },
      });

      if (error) throw error;
      setResult(data as DemoResponse);
      toast.success('Exa ability probe completed');
    } catch (err) {
      console.error('[ExaAbilitiesDemo] run failed', err);
      const message = err instanceof Error ? err.message : 'Failed to run Exa ability probe';
      setLastError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const runScenario = async (scenario: DemoScenario) => {
    setActiveScenario(scenario.id);
    setDomain(scenario.config.domain);
    setSimilarUrl(scenario.config.similarUrl);
    setTrendTopic(scenario.config.trendTopic);
    setRunWebsetCreate(scenario.config.runWebsetCreate);
    await runDemo(scenario.config);
  };

  const currentScenario = DEMO_SCENARIOS[currentStepIndex];

  const goToStep = (index: number) => {
    const bounded = Math.max(0, Math.min(DEMO_SCENARIOS.length - 1, index));
    const scenario = DEMO_SCENARIOS[bounded];
    setCurrentStepIndex(bounded);
    setActiveScenario(scenario.id);
    setDomain(scenario.config.domain);
    setSimilarUrl(scenario.config.similarUrl);
    setTrendTopic(scenario.config.trendTopic);
    setRunWebsetCreate(scenario.config.runWebsetCreate);
  };

  const scenarioFocus = useMemo(() => {
    const selected = DEMO_SCENARIOS.find((s) => s.id === activeScenario);
    return selected?.focus || [];
  }, [activeScenario]);

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">Exa Abilities Demo</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Guided showcase for prospecting and outreach: discover target accounts, decision-makers, and intent signals.
        </p>
      </div>

      <Card className="mb-6 border-blue-200 dark:border-blue-900">
        <CardHeader>
          <CardTitle>Guided walkthrough</CardTitle>
          <CardDescription>
            Run these in order: Search 1, Search 2, Websets preview, then Websets create.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {DEMO_SCENARIOS.map((scenario, idx) => (
              <Button
                key={scenario.id}
                variant={idx === currentStepIndex ? 'default' : 'outline'}
                size="sm"
                onClick={() => goToStep(idx)}
                disabled={loading}
              >
                Step {idx + 1}: {scenario.title}
              </Button>
            ))}
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium text-gray-900 dark:text-gray-100">
                Step {currentStepIndex + 1} of {DEMO_SCENARIOS.length}: {currentScenario.title}
              </h3>
              <Badge>Active</Badge>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300">{currentScenario.prompt}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{currentScenario.expected}</p>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Focus endpoints: {currentScenario.focus.map((f) => CASE_LABELS[f]).join(', ')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" disabled={loading || currentStepIndex === 0} onClick={() => goToStep(currentStepIndex - 1)}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <Button disabled={loading} onClick={() => runScenario(currentScenario)}>
                {loading && activeScenario === currentScenario.id ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running step...
                  </>
                ) : (
                  'Run this step'
                )}
              </Button>
              <Button variant="outline" disabled={loading || currentStepIndex === DEMO_SCENARIOS.length - 1} onClick={() => goToStep(currentStepIndex + 1)}>
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-blue-500" />Advanced configuration</CardTitle>
          <CardDescription>
            Optional: tune inputs manually. Most users should use the step buttons above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" size="sm" onClick={() => setShowAdvancedConfig((v) => !v)}>
            {showAdvancedConfig ? 'Hide advanced settings' : 'Show advanced settings'}
          </Button>
          {showAdvancedConfig && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Target domain (e.g. use60.com)" />
                <Input value={similarUrl} onChange={(e) => setSimilarUrl(e.target.value)} placeholder="Reference URL for findSimilar" />
                <Input value={trendTopic} onChange={(e) => setTrendTopic(e.target.value)} placeholder="Topic for answer endpoint" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={runWebsetCreate}
                  onChange={(e) => setRunWebsetCreate(e.target.checked)}
                  className="h-4 w-4"
                />
                Also run Websets create (may consume credits)
              </label>
              <Button onClick={runDemo} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running probes...
                  </>
                ) : (
                  'Run custom probe'
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {lastError && (
        <Card className="mb-6 border-red-300 dark:border-red-800">
          <CardHeader>
            <CardTitle className="text-red-700 dark:text-red-300">Request failed</CardTitle>
            <CardDescription>{lastError}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <p><strong>Likely cause:</strong> Edge Function preflight blocked before your JWT is evaluated.</p>
            <p><strong>Verify:</strong> `exa-abilities-demo` has `verify_jwt = false` in Supabase config and the function is deployed to the same project your app uses.</p>
            <p><strong>Then:</strong> Re-run this probe; function code still validates user auth internally via `supabase.auth.getUser()`.</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <>
          <Card className="mb-6 border-indigo-200 dark:border-indigo-900">
            <CardHeader>
              <CardTitle>What happened in this step</CardTitle>
              <CardDescription>Story-first summary for the active scenario.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {(result.scenario_panels || []).map((panel) => (
                <div key={panel.key} className="rounded-lg border border-gray-200 dark:border-gray-700/50 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <p className="text-sm font-medium">{panel.title}</p>
                    <Badge variant={panel.status === 'success' ? 'default' : panel.status === 'fallback' ? 'secondary' : 'destructive'}>
                      {panel.status}
                    </Badge>
                    {panel.using_fallback_data && <Badge variant="outline">using fallback data</Badge>}
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300">{panel.what_happened}</p>
                  <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{panel.why_this_matters}</p>
                  <div className="mt-2 space-y-1 text-xs">
                    {panel.what_to_do_next.map((n, idx) => (
                      <p key={idx}>- {n}</p>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="mb-6 border-emerald-200 dark:border-emerald-900">
            <CardHeader>
              <CardTitle>Most usable outputs from this run</CardTitle>
              <CardDescription>
                This section is designed to be directly actionable for building Ops tables and workflows.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 p-3">
                  <p className="text-sm font-medium">Account targets</p>
                  <div className="mt-2 space-y-2 text-xs">
                    {(result.usable_outputs?.account_targets || []).slice(0, 5).map((row, idx) => (
                      <div key={`${row.url}-${idx}`} className="rounded bg-black/5 dark:bg-white/5 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{row.name}</p>
                          <Badge variant="outline">Score {row.rank_score}</Badge>
                        </div>
                        <p className="text-gray-500 dark:text-gray-400 break-all">{row.url}</p>
                        {row.snippet && <p className="mt-1 text-gray-600 dark:text-gray-300">{row.snippet}</p>}
                        <p className="mt-1 text-gray-600 dark:text-gray-300">Why matched: {row.why_matched}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 p-3">
                  <p className="text-sm font-medium">Persona targets</p>
                  <div className="mt-2 space-y-2 text-xs">
                    {(result.usable_outputs?.persona_targets || []).slice(0, 5).map((row, idx) => (
                      <div key={`${row.url}-${idx}`} className="rounded bg-black/5 dark:bg-white/5 p-2">
                        <p className="font-medium">{row.name}</p>
                        <p className="text-gray-500 dark:text-gray-400 break-all">{row.url}</p>
                        <p className="mt-1 text-gray-600 dark:text-gray-300">Seniority: {row.seniority_hint}</p>
                        <p className="text-gray-600 dark:text-gray-300">{row.why_fit}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 p-3">
                  <p className="text-sm font-medium">Trend summary for research column</p>
                  <p className="mt-2 text-xs text-gray-700 dark:text-gray-300">
                    {result.usable_outputs?.trend_summary?.answer || 'No trend summary returned.'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Citations: {result.usable_outputs?.trend_summary?.citation_count ?? 0}
                  </p>
                  <div className="mt-2 space-y-1 text-xs">
                    {(result.usable_outputs?.trend_summary?.citations || []).map((c, idx) => (
                      <a key={idx} href={c.url} target="_blank" rel="noreferrer" className="block text-blue-600 dark:text-blue-400 hover:underline">
                        {c.title}
                      </a>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 p-3">
                  <p className="text-sm font-medium">Websets setup draft</p>
                  <p className="mt-2 text-xs text-gray-700 dark:text-gray-300">
                    Query: {result.usable_outputs?.websets_setup?.query || '—'}
                  </p>
                  <p className="mt-2 text-xs font-medium">Recommended columns</p>
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    {(result.usable_outputs?.websets_setup?.recommended_columns || []).join(', ')}
                  </p>
                  {result.usable_outputs?.websets_setup?.webset_id && (
                    <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                      Webset ID: {result.usable_outputs.websets_setup.webset_id}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 p-3">
                <p className="text-sm font-medium">Intent signals</p>
                <div className="mt-2 space-y-2 text-xs">
                  {(result.usable_outputs?.intent_signals || []).map((signal, idx) => (
                    <div key={idx} className="rounded bg-black/5 dark:bg-white/5 p-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={signal.strength === 'high' ? 'default' : 'secondary'}>{signal.strength}</Badge>
                        <p className="font-medium">{signal.signal}</p>
                      </div>
                      {signal.evidence && <p className="mt-1 text-gray-600 dark:text-gray-300">{signal.evidence}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Build this in Ops now</CardTitle>
              <CardDescription>
                Proposed table blueprints and immediate implementation recommendations from this run.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {(result.ops_table_blueprints || []).map((bp) => (
                  <div key={bp.name} className="rounded-lg border border-gray-200 dark:border-gray-700/50 p-3">
                    <p className="text-sm font-medium">{bp.name}</p>
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{bp.purpose}</p>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{bp.columns.join(', ')}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-1 text-sm">
                {(result.implementation_recommendations || []).map((item, idx) => (
                  <p key={idx}>- {item}</p>
                ))}
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 p-3">
                <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  What to do next
                </p>
                <div className="space-y-1 text-sm">
                  {(result.next_actions || []).map((item, idx) => (
                    <p key={idx}>- {item}</p>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Endpoint Health</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {result.success_count}/{result.total_count}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">successful endpoint checks</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Tested At</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium">{new Date(result.tested_at).toLocaleString()}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">latest probe execution</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Websets Create</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant={result.run_webset_create ? 'default' : 'secondary'}>
                  {result.run_webset_create ? 'Enabled' : 'Disabled'}
                </Badge>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">toggle this only when validating run creation</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Radar className="h-5 w-5 text-indigo-500" />
                Advanced diagnostics
              </CardTitle>
              <CardDescription>
                Optional technical details for endpoint behavior and capability readiness.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" size="sm" onClick={() => setShowDiagnostics((v) => !v)}>
                {showDiagnostics ? 'Hide diagnostics' : 'Show diagnostics'}
              </Button>
              {showDiagnostics && (
                <Tabs defaultValue="endpoints" className="w-full">
                  <TabsList className="mb-4">
                    <TabsTrigger value="endpoints">Endpoint Results</TabsTrigger>
                    <TabsTrigger value="ops">Ops Feature Readiness</TabsTrigger>
                  </TabsList>

                  <TabsContent value="endpoints">
                    <div className="space-y-3">
                      {result.results.map((entry) => (
                        <div
                          key={entry.name}
                          className={`rounded-lg border bg-gray-50 dark:bg-gray-900 p-4 ${
                            scenarioFocus.includes(entry.name)
                              ? 'border-blue-500 dark:border-blue-500'
                              : 'border-gray-200 dark:border-gray-700/50'
                          }`}
                        >
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            {entry.ok ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                            <span className="font-medium text-gray-900 dark:text-gray-100">{CASE_LABELS[entry.name]}</span>
                            <Badge variant={entry.ok ? 'default' : 'destructive'}>{entry.status || 'ERR'}</Badge>
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                              <Clock3 className="h-3 w-3" />
                              {entry.latency_ms}ms
                            </span>
                          </div>
                          <p className="mb-2 text-sm text-gray-700 dark:text-gray-300">{entry.summary}</p>
                          {entry.sample && (
                            <pre className="overflow-x-auto rounded bg-black/5 p-2 text-xs dark:bg-white/5">
                              {JSON.stringify(entry.sample, null, 2)}
                            </pre>
                          )}
                          {entry.error && (
                            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{entry.error}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="ops">
                    <div className="space-y-3">
                      {readiness.map((cap) => (
                        <div
                          key={cap.id}
                          className="rounded-lg border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-4"
                        >
                          <div className="mb-2 flex items-center gap-2">
                            {cap.ready ? (
                              <Badge className="bg-green-600 hover:bg-green-600">Ready</Badge>
                            ) : (
                              <Badge variant="secondary">Blocked</Badge>
                            )}
                            <span className="font-medium text-gray-900 dark:text-gray-100">{cap.title}</span>
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300">{cap.unlocks}</p>
                          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            Requires: {cap.required.map((req) => CASE_LABELS[req]).join(', ')}
                          </p>
                          {!cap.ready && (
                            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                              Missing endpoint health: {cap.missing.map((m) => CASE_LABELS[m]).join(', ')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
