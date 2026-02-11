/**
 * Research Provider Comparison Demo
 *
 * Head-to-head comparison of Gemini 3 Flash (with Google Search grounding)
 * vs Exa (semantic search) for company research enrichment.
 *
 * Measures cost, quality (field completeness), and speed.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Clock,
  DollarSign,
  Database,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  Trophy,
  Zap,
  Globe
} from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

interface ComparisonProgress {
  status: 'idle' | 'running' | 'complete' | 'error';
  phase: string;
  progress: number;
  startTime?: number;
  endTime?: number;
  logs: Array<{ timestamp: number; message: string; level: 'info' | 'success' | 'error' }>;
  result?: any;
  stats?: {
    fieldsPopulated: number;
    totalFields: number;
    completeness: number;
    cost: number;
    duration: number;
  };
}

export default function ResearchComparison() {
  const [domain, setDomain] = useState('conturae.com');
  const [isRunning, setIsRunning] = useState(false);

  const [gemini, setGemini] = useState<ComparisonProgress>({
    status: 'idle',
    phase: 'Ready',
    progress: 0,
    logs: []
  });

  const [exa, setExa] = useState<ComparisonProgress>({
    status: 'idle',
    phase: 'Ready',
    progress: 0,
    logs: []
  });

  const [winner, setWinner] = useState<string | null>(null);
  const [comparisonData, setComparisonData] = useState<any>(null);

  const addLog = (
    type: 'gemini' | 'exa',
    message: string,
    level: 'info' | 'success' | 'error' = 'info'
  ) => {
    const log = { timestamp: Date.now(), message, level };

    if (type === 'gemini') {
      setGemini(prev => ({
        ...prev,
        logs: [...prev.logs, log]
      }));
    } else {
      setExa(prev => ({
        ...prev,
        logs: [...prev.logs, log]
      }));
    }
  };

  const runComparison = async () => {
    if (!domain) {
      toast.error('Please enter a company domain');
      return;
    }

    setIsRunning(true);
    setWinner(null);
    setComparisonData(null);

    // Reset state
    setGemini({
      status: 'running',
      phase: 'Initializing...',
      progress: 10,
      logs: [],
      startTime: Date.now()
    });

    setExa({
      status: 'running',
      phase: 'Initializing...',
      progress: 10,
      logs: [],
      startTime: Date.now()
    });

    addLog('gemini', 'Starting Gemini 3 Flash research...', 'info');
    addLog('exa', 'Starting Exa semantic search...', 'info');

    // Simulate progress updates
    setTimeout(() => {
      setGemini(prev => ({ ...prev, phase: 'Querying with search grounding...', progress: 30 }));
      addLog('gemini', 'Activating Google Search grounding...', 'info');
    }, 500);

    setTimeout(() => {
      setExa(prev => ({ ...prev, phase: 'Running neural search query...', progress: 30 }));
      addLog('exa', 'Executing semantic search with auto-prompt...', 'info');
    }, 500);

    setTimeout(() => {
      setGemini(prev => ({ ...prev, phase: 'Extracting structured data...', progress: 60 }));
      addLog('gemini', 'Parsing company profile fields...', 'info');
    }, 2000);

    setTimeout(() => {
      setExa(prev => ({ ...prev, phase: 'Parsing search results...', progress: 60 }));
      addLog('exa', 'Extracting data from 10 neural results...', 'info');
    }, 2000);

    try {
      const { data, error } = await supabase.functions.invoke('research-comparison', {
        body: { domain }
      });

      if (error) throw error;

      setComparisonData(data);

      // Update Gemini results
      const geminiEndTime = Date.now();
      setGemini({
        status: data.gemini_error ? 'error' : 'complete',
        phase: data.gemini_error ? 'Failed' : 'Complete',
        progress: 100,
        logs: [
          ...gemini.logs,
          {
            timestamp: geminiEndTime,
            message: data.gemini_error || 'Research complete!',
            level: data.gemini_error ? 'error' : 'success'
          }
        ],
        startTime: gemini.startTime,
        endTime: geminiEndTime,
        result: data.gemini_result,
        stats: {
          fieldsPopulated: data.gemini_fields_populated || 0,
          totalFields: 19,
          completeness: data.gemini_completeness || 0,
          cost: data.gemini_cost || 0,
          duration: data.gemini_duration_ms || 0
        }
      });

      // Update Exa results
      const exaEndTime = Date.now();
      setExa({
        status: data.exa_error ? 'error' : 'complete',
        phase: data.exa_error ? 'Failed' : 'Complete',
        progress: 100,
        logs: [
          ...exa.logs,
          {
            timestamp: exaEndTime,
            message: data.exa_error || 'Search complete!',
            level: data.exa_error ? 'error' : 'success'
          }
        ],
        startTime: exa.startTime,
        endTime: exaEndTime,
        result: data.exa_result,
        stats: {
          fieldsPopulated: data.exa_fields_populated || 0,
          totalFields: 19,
          completeness: data.exa_completeness || 0,
          cost: data.exa_cost || 0,
          duration: data.exa_duration_ms || 0
        }
      });

      setWinner(data.winner);

      if (data.winner === 'both_failed') {
        toast.error('Both providers failed - check API keys');
      } else {
        toast.success('Comparison complete!');
      }

    } catch (error: any) {
      toast.error(error.message);
      setGemini(prev => ({ ...prev, status: 'error', phase: 'Error', progress: 100 }));
      setExa(prev => ({ ...prev, status: 'error', phase: 'Error', progress: 100 }));
      addLog('gemini', `Error: ${error.message}`, 'error');
      addLog('exa', `Error: ${error.message}`, 'error');
    } finally {
      setIsRunning(false);
    }
  };

  const enableProvider = async (provider: 'gemini' | 'exa') => {
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: 'research_provider',
          value: JSON.stringify(provider)
        }, { onConflict: 'key' });

      if (error) throw error;
      toast.success(`${provider === 'gemini' ? 'Gemini 3 Flash' : 'Exa'} enabled as research provider!`);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '—';
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatCost = (cost?: number) => {
    if (cost === undefined || cost === null) return '—';
    return `$${cost.toFixed(6)}`;
  };

  const formatCompleteness = (completeness?: number) => {
    if (!completeness) return '—';
    return `${completeness.toFixed(1)}%`;
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Research Provider Comparison</h1>
        <p className="text-muted-foreground">
          Test Gemini 3 Flash (Google Search) vs Exa (Neural Search) head-to-head for company research enrichment
        </p>
      </div>

      {/* Input Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Start Comparison</CardTitle>
          <CardDescription>
            Enter a company domain to compare both research providers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              disabled={isRunning}
              className="max-w-md"
            />
            <Button
              onClick={runComparison}
              disabled={isRunning || !domain}
              size="lg"
            >
              {isRunning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Run Comparison
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Side-by-Side Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Gemini Panel */}
        <Card className="border-blue-200 dark:border-blue-900">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-blue-500" />
                <CardTitle>Gemini 3 Flash</CardTitle>
              </div>
              <Badge variant="secondary">Google Search</Badge>
            </div>
            <CardDescription>
              AI with real-time web search grounding
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {gemini.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                {gemini.status === 'complete' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {gemini.status === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
                <span className="text-sm font-medium">{gemini.phase}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {formatDuration(gemini.stats?.duration)}
              </div>
            </div>

            {/* Progress Bar */}
            <Progress value={gemini.progress} className="h-2" />

            {/* Stats */}
            {gemini.stats && (
              <div className="grid grid-cols-3 gap-2 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">Quality</p>
                  <p className="text-lg font-bold">{formatCompleteness(gemini.stats.completeness)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cost</p>
                  <p className="text-lg font-bold">{formatCost(gemini.stats.cost)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fields</p>
                  <p className="text-lg font-bold">
                    {gemini.stats.fieldsPopulated}/{gemini.stats.totalFields}
                  </p>
                </div>
              </div>
            )}

            {/* Logs */}
            <Tabs defaultValue="logs" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="logs" className="flex-1">Activity Log</TabsTrigger>
                <TabsTrigger value="data" className="flex-1">Output Data</TabsTrigger>
              </TabsList>

              <TabsContent value="logs" className="space-y-2">
                <div className="bg-black/5 dark:bg-white/5 rounded-lg p-4 h-64 overflow-y-auto font-mono text-xs">
                  {gemini.logs.length === 0 ? (
                    <p className="text-muted-foreground">No activity yet</p>
                  ) : (
                    gemini.logs.map((log, idx) => (
                      <div
                        key={idx}
                        className={`mb-1 ${
                          log.level === 'error'
                            ? 'text-red-500'
                            : log.level === 'success'
                            ? 'text-green-500'
                            : 'text-muted-foreground'
                        }`}
                      >
                        [{new Date(log.timestamp).toLocaleTimeString()}] {log.message}
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="data">
                <div className="bg-black/5 dark:bg-white/5 rounded-lg p-4 h-64 overflow-y-auto font-mono text-xs">
                  {gemini.result ? (
                    <pre>{JSON.stringify(gemini.result, null, 2)}</pre>
                  ) : (
                    <p className="text-muted-foreground">No data yet</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Exa Panel */}
        <Card className="border-purple-200 dark:border-purple-900">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-purple-500" />
                <CardTitle>Exa</CardTitle>
              </div>
              <Badge variant="secondary">Neural Search</Badge>
            </div>
            <CardDescription>
              Semantic search with AI query expansion
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {exa.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-purple-500" />}
                {exa.status === 'complete' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {exa.status === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
                <span className="text-sm font-medium">{exa.phase}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {formatDuration(exa.stats?.duration)}
              </div>
            </div>

            {/* Progress Bar */}
            <Progress value={exa.progress} className="h-2" />

            {/* Stats */}
            {exa.stats && (
              <div className="grid grid-cols-3 gap-2 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">Quality</p>
                  <p className="text-lg font-bold">{formatCompleteness(exa.stats.completeness)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cost</p>
                  <p className="text-lg font-bold">{formatCost(exa.stats.cost)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fields</p>
                  <p className="text-lg font-bold">
                    {exa.stats.fieldsPopulated}/{exa.stats.totalFields}
                  </p>
                </div>
              </div>
            )}

            {/* Logs */}
            <Tabs defaultValue="logs" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="logs" className="flex-1">Activity Log</TabsTrigger>
                <TabsTrigger value="data" className="flex-1">Output Data</TabsTrigger>
              </TabsList>

              <TabsContent value="logs" className="space-y-2">
                <div className="bg-black/5 dark:bg-white/5 rounded-lg p-4 h-64 overflow-y-auto font-mono text-xs">
                  {exa.logs.length === 0 ? (
                    <p className="text-muted-foreground">No activity yet</p>
                  ) : (
                    exa.logs.map((log, idx) => (
                      <div
                        key={idx}
                        className={`mb-1 ${
                          log.level === 'error'
                            ? 'text-red-500'
                            : log.level === 'success'
                            ? 'text-green-500'
                            : 'text-muted-foreground'
                        }`}
                      >
                        [{new Date(log.timestamp).toLocaleTimeString()}] {log.message}
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="data">
                <div className="bg-black/5 dark:bg-white/5 rounded-lg p-4 h-64 overflow-y-auto font-mono text-xs">
                  {exa.result ? (
                    <pre>{JSON.stringify(exa.result, null, 2)}</pre>
                  ) : (
                    <p className="text-muted-foreground">No data yet</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Winner Panel */}
      {winner && winner !== 'both_failed' && (
        <Card className="mb-6 border-2 border-yellow-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Trophy className="h-8 w-8 text-yellow-500" />
                <div>
                  <h3 className="text-xl font-semibold">
                    Winner: {winner === 'gemini' ? 'Gemini 3 Flash' : winner === 'exa' ? 'Exa' : 'Tie!'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Based on quality ({formatCompleteness(gemini.stats?.completeness)} vs {formatCompleteness(exa.stats?.completeness)}),
                    speed ({formatDuration(gemini.stats?.duration)} vs {formatDuration(exa.stats?.duration)}),
                    and cost ({formatCost(gemini.stats?.cost)} vs {formatCost(exa.stats?.cost)})
                  </p>
                </div>
              </div>
              {winner !== 'tie' && (
                <Button onClick={() => enableProvider(winner as 'gemini' | 'exa')}>
                  Enable {winner === 'gemini' ? 'Gemini' : 'Exa'} as Default
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Comparison Table */}
      {comparisonData && gemini.result && exa.result && (
        <Card>
          <CardHeader>
            <CardTitle>Field-by-Field Comparison</CardTitle>
            <CardDescription>
              Detailed breakdown of enrichment data quality
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">Field</th>
                    <th className="text-left py-2 px-3 font-medium">Gemini Result</th>
                    <th className="text-left py-2 px-3 font-medium">Exa Result</th>
                    <th className="text-center py-2 px-3 font-medium">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(gemini.result).map((field) => {
                    const geminiValue = gemini.result[field];
                    const exaValue = exa.result[field];
                    const match = JSON.stringify(geminiValue) === JSON.stringify(exaValue);

                    return (
                      <tr key={field} className="border-b">
                        <td className="py-2 px-3 font-mono text-xs">{field}</td>
                        <td className="py-2 px-3 text-xs">
                          {geminiValue ? (
                            typeof geminiValue === 'object' ? (
                              <span className="text-blue-600 dark:text-blue-400">
                                {Array.isArray(geminiValue) ? `[${geminiValue.length} items]` : '{object}'}
                              </span>
                            ) : (
                              String(geminiValue)
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-xs">
                          {exaValue ? (
                            typeof exaValue === 'object' ? (
                              <span className="text-purple-600 dark:text-purple-400">
                                {Array.isArray(exaValue) ? `[${exaValue.length} items]` : '{object}'}
                              </span>
                            ) : (
                              String(exaValue)
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {match ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 inline" />
                          ) : (
                            <XCircle className="h-4 w-4 text-orange-500 inline" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
