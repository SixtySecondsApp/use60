import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, XCircle, Clock3, Loader2, Wand2, Table2, Radar } from 'lucide-react';
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
}

interface OpsCapability {
  id: string;
  title: string;
  unlocks: string;
  required: EndpointCase[];
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

export default function ExaAbilitiesDemo() {
  const [domain, setDomain] = useState('use60.com');
  const [similarUrl, setSimilarUrl] = useState('https://www.hubspot.com');
  const [trendTopic, setTrendTopic] = useState('sales engagement platforms in 2026');
  const [runWebsetCreate, setRunWebsetCreate] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DemoResponse | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

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

  const runDemo = async () => {
    setLoading(true);
    setLastError(null);
    try {
      const { data, error } = await supabase.functions.invoke('exa-abilities-demo', {
        body: {
          domain,
          similarUrl,
          trendTopic,
          runWebsetCreate,
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

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">Exa Abilities Demo</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Validate Exa endpoint readiness and map each capability to the Ops table features we should implement first.
        </p>
      </div>

      <Card className="mb-6 bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm border-gray-200 dark:border-gray-700/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-blue-500" />
            Probe Configuration
          </CardTitle>
          <CardDescription>
            Run representative Exa queries for account search, people search, similar links, answer generation, and Websets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
              'Run Exa Probe'
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>How to use this demo</CardTitle>
          <CardDescription>
            This page is designed to guide implementation decisions for Exa-powered Ops tables.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p><strong>Step 1:</strong> Run with Websets create disabled to validate low-risk endpoint health.</p>
          <p><strong>Step 2:</strong> Review "Endpoint Results" for status, latency, and sample payload shape.</p>
          <p><strong>Step 3:</strong> Open "Ops Feature Readiness" to see what can ship immediately.</p>
          <p><strong>Step 4:</strong> Enable Websets create only when you are ready to test async run creation and credit usage.</p>
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

          <Tabs defaultValue="endpoints" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="endpoints">Endpoint Results</TabsTrigger>
              <TabsTrigger value="ops">Ops Feature Readiness</TabsTrigger>
            </TabsList>

            <TabsContent value="endpoints">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Radar className="h-5 w-5 text-indigo-500" />
                    Exa Endpoint Matrix
                  </CardTitle>
                  <CardDescription>
                    Use this matrix to decide which Exa-backed ops capabilities can ship immediately.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {result.results.map((entry) => (
                    <div
                      key={entry.name}
                      className="rounded-lg border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900 p-4"
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
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ops">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Table2 className="h-5 w-5 text-purple-500" />
                    Proposed Ops Table Functionality
                  </CardTitle>
                  <CardDescription>
                    This translates Exa endpoint readiness directly into what we can implement next in Ops tables.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
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
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
