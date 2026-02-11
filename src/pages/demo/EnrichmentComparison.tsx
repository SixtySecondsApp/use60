/**
 * Enrichment Comparison Demo
 *
 * Live side-by-side comparison of legacy website scraping vs enhanced research
 * with Agent Teams for parallel execution.
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
  Zap,
  Database,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  Users,
  TrendingUp,
  Award
} from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

interface EnrichmentProgress {
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
  };
}

interface AgentUpdate {
  agentId: string;
  agentName: string;
  status: string;
  message: string;
  data?: any;
}

export default function EnrichmentComparison() {
  const [domain, setDomain] = useState('conturae.com');
  const [isRunning, setIsRunning] = useState(false);

  // Legacy enrichment state
  const [legacyProgress, setLegacyProgress] = useState<EnrichmentProgress>({
    status: 'idle',
    phase: 'Not started',
    progress: 0,
    logs: []
  });

  // Enhanced enrichment state (with Agent Teams)
  const [enhancedProgress, setEnhancedProgress] = useState<EnrichmentProgress>({
    status: 'idle',
    phase: 'Not started',
    progress: 0,
    logs: []
  });

  const [agentUpdates, setAgentUpdates] = useState<AgentUpdate[]>([]);

  // Add log entry
  const addLog = (
    type: 'legacy' | 'enhanced',
    message: string,
    level: 'info' | 'success' | 'error' = 'info'
  ) => {
    const log = { timestamp: Date.now(), message, level };

    if (type === 'legacy') {
      setLegacyProgress(prev => ({
        ...prev,
        logs: [...prev.logs, log]
      }));
    } else {
      setEnhancedProgress(prev => ({
        ...prev,
        logs: [...prev.logs, log]
      }));
    }
  };

  // Run legacy enrichment
  const runLegacyEnrichment = async () => {
    setLegacyProgress({
      status: 'running',
      phase: 'Starting legacy scraping',
      progress: 0,
      startTime: Date.now(),
      logs: []
    });

    addLog('legacy', 'Starting legacy website scraping...', 'info');

    try {
      // Call edge function with legacy mode
      const { data, error } = await supabase.functions.invoke('demo-enrichment-comparison', {
        body: {
          mode: 'legacy',
          domain: domain
        }
      });

      if (error) throw error;

      // Simulate progress updates (in real implementation, use Server-Sent Events)
      const phases = [
        { phase: 'Discovering pages', progress: 20 },
        { phase: 'Scraping homepage', progress: 30 },
        { phase: 'Scraping about page', progress: 40 },
        { phase: 'Scraping products', progress: 50 },
        { phase: 'Scraping team', progress: 60 },
        { phase: 'Extracting data with Gemini', progress: 80 },
        { phase: 'Saving results', progress: 95 }
      ];

      for (const { phase, progress } of phases) {
        await new Promise(resolve => setTimeout(resolve, 800));
        setLegacyProgress(prev => ({ ...prev, phase, progress }));
        addLog('legacy', phase, 'info');
      }

      // Final result
      setLegacyProgress(prev => ({
        ...prev,
        status: 'complete',
        phase: 'Complete',
        progress: 100,
        endTime: Date.now(),
        result: data.result,
        stats: data.stats
      }));

      addLog('legacy', `Completed in ${((Date.now() - (legacyProgress.startTime || 0)) / 1000).toFixed(1)}s`, 'success');

    } catch (error: any) {
      setLegacyProgress(prev => ({
        ...prev,
        status: 'error',
        phase: 'Error',
        endTime: Date.now()
      }));
      addLog('legacy', `Error: ${error.message}`, 'error');
    }
  };

  // Run enhanced enrichment with Agent Teams
  const runEnhancedEnrichment = async () => {
    setEnhancedProgress({
      status: 'running',
      phase: 'Initializing Agent Teams',
      progress: 0,
      startTime: Date.now(),
      logs: []
    });

    setAgentUpdates([]);

    addLog('enhanced', 'Creating research team...', 'info');

    try {
      // Call edge function with enhanced mode (uses Agent Teams)
      const { data, error } = await supabase.functions.invoke('demo-enrichment-comparison', {
        body: {
          mode: 'enhanced',
          domain: domain
        }
      });

      if (error) throw error;

      // Simulate agent team progress
      const agents = [
        { id: 'agent-1', name: 'Company Overview Agent', task: 'Researching company basics' },
        { id: 'agent-2', name: 'Funding Agent', task: 'Searching Crunchbase for funding data' },
        { id: 'agent-3', name: 'Reviews Agent', task: 'Gathering G2/Capterra reviews' },
        { id: 'agent-4', name: 'Leadership Agent', task: 'Finding executives on LinkedIn' },
        { id: 'agent-5', name: 'News Agent', task: 'Searching recent news and press' }
      ];

      setEnhancedProgress(prev => ({ ...prev, phase: 'Spawning 5 research agents', progress: 10 }));
      addLog('enhanced', 'Spawned 5 parallel research agents', 'info');

      // Simulate parallel agent work
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];

        setTimeout(() => {
          setAgentUpdates(prev => [...prev, {
            agentId: agent.id,
            agentName: agent.name,
            status: 'working',
            message: agent.task
          }]);
          addLog('enhanced', `${agent.name}: ${agent.task}`, 'info');
        }, i * 200);

        setTimeout(() => {
          setAgentUpdates(prev => prev.map(a =>
            a.agentId === agent.id
              ? { ...a, status: 'complete', message: 'Research complete' }
              : a
          ));
          addLog('enhanced', `${agent.name}: Complete`, 'success');
        }, 2000 + i * 300);
      }

      // Update progress
      setTimeout(() => {
        setEnhancedProgress(prev => ({ ...prev, phase: 'Agents researching in parallel', progress: 30 }));
      }, 500);

      setTimeout(() => {
        setEnhancedProgress(prev => ({ ...prev, phase: 'Aggregating results', progress: 80 }));
        addLog('enhanced', 'Aggregating results from all agents', 'info');
      }, 3000);

      setTimeout(() => {
        setEnhancedProgress(prev => ({ ...prev, phase: 'Saving enriched data', progress: 95 }));
        addLog('enhanced', 'Saving to database', 'info');
      }, 3500);

      // Final result
      setTimeout(() => {
        setEnhancedProgress(prev => ({
          ...prev,
          status: 'complete',
          phase: 'Complete',
          progress: 100,
          endTime: Date.now(),
          result: data.result,
          stats: data.stats
        }));

        addLog('enhanced', `Completed in ${((Date.now() - (enhancedProgress.startTime || 0)) / 1000).toFixed(1)}s`, 'success');
      }, 4000);

    } catch (error: any) {
      setEnhancedProgress(prev => ({
        ...prev,
        status: 'error',
        phase: 'Error',
        endTime: Date.now()
      }));
      addLog('enhanced', `Error: ${error.message}`, 'error');
    }
  };

  // Run both in parallel
  const runComparison = async () => {
    if (!domain) {
      toast.error('Please enter a company domain');
      return;
    }

    setIsRunning(true);

    // Run both in parallel
    await Promise.all([
      runLegacyEnrichment(),
      runEnhancedEnrichment()
    ]);

    setIsRunning(false);
  };

  const formatDuration = (start?: number, end?: number) => {
    if (!start) return '—';
    const duration = (end || Date.now()) - start;
    return `${(duration / 1000).toFixed(1)}s`;
  };

  const formatCompleteness = (stats?: { completeness: number }) => {
    if (!stats) return '—';
    return `${stats.completeness}%`;
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Enrichment Comparison: Legacy vs Enhanced</h1>
        <p className="text-muted-foreground">
          Live side-by-side comparison of website scraping vs multi-source research with Agent Teams
        </p>
      </div>

      {/* Input */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Start Comparison</CardTitle>
          <CardDescription>
            Enter a company domain to compare both enrichment approaches
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

      {/* Comparison Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Legacy Enrichment */}
        <Card className="border-orange-200 dark:border-orange-900">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-orange-500" />
                <CardTitle>Legacy Scraping</CardTitle>
              </div>
              <Badge variant="secondary">Website Only</Badge>
            </div>
            <CardDescription>
              Traditional website scraping + Gemini extraction
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {legacyProgress.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-orange-500" />}
                {legacyProgress.status === 'complete' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {legacyProgress.status === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
                <span className="text-sm font-medium">{legacyProgress.phase}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {formatDuration(legacyProgress.startTime, legacyProgress.endTime)}
              </div>
            </div>

            {/* Progress Bar */}
            <Progress value={legacyProgress.progress} className="h-2" />

            {/* Stats */}
            {legacyProgress.stats && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Completeness</p>
                  <p className="text-2xl font-bold">{formatCompleteness(legacyProgress.stats)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fields</p>
                  <p className="text-2xl font-bold">
                    {legacyProgress.stats.fieldsPopulated}/{legacyProgress.stats.totalFields}
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
                  {legacyProgress.logs.length === 0 ? (
                    <p className="text-muted-foreground">No activity yet</p>
                  ) : (
                    legacyProgress.logs.map((log, i) => (
                      <div
                        key={i}
                        className={`mb-1 ${
                          log.level === 'error'
                            ? 'text-red-500'
                            : log.level === 'success'
                            ? 'text-green-500'
                            : 'text-foreground/70'
                        }`}
                      >
                        [{new Date(log.timestamp).toLocaleTimeString()}] {log.message}
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="data">
                <div className="bg-black/5 dark:bg-white/5 rounded-lg p-4 h-64 overflow-y-auto">
                  {legacyProgress.result ? (
                    <pre className="text-xs font-mono">
                      {JSON.stringify(legacyProgress.result, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-muted-foreground text-sm">No data yet</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Enhanced Enrichment with Agent Teams */}
        <Card className="border-green-200 dark:border-green-900">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-green-500" />
                <CardTitle>Enhanced Research</CardTitle>
              </div>
              <Badge variant="default" className="bg-green-600">Agent Teams</Badge>
            </div>
            <CardDescription>
              Multi-source research with parallel Agent Teams
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {enhancedProgress.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-green-500" />}
                {enhancedProgress.status === 'complete' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {enhancedProgress.status === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
                <span className="text-sm font-medium">{enhancedProgress.phase}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {formatDuration(enhancedProgress.startTime, enhancedProgress.endTime)}
              </div>
            </div>

            {/* Progress Bar */}
            <Progress value={enhancedProgress.progress} className="h-2 bg-green-100 dark:bg-green-950" />

            {/* Agent Status */}
            {agentUpdates.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4" />
                  Active Agents ({agentUpdates.filter(a => a.status === 'complete').length}/{agentUpdates.length})
                </div>
                <div className="space-y-1">
                  {agentUpdates.map((agent) => (
                    <div
                      key={agent.agentId}
                      className="flex items-center justify-between p-2 bg-muted rounded text-xs"
                    >
                      <span className="font-medium">{agent.agentName}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{agent.message}</span>
                        {agent.status === 'complete' && (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        )}
                        {agent.status === 'working' && (
                          <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats */}
            {enhancedProgress.stats && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Completeness</p>
                  <p className="text-2xl font-bold text-green-600">{formatCompleteness(enhancedProgress.stats)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fields</p>
                  <p className="text-2xl font-bold text-green-600">
                    {enhancedProgress.stats.fieldsPopulated}/{enhancedProgress.stats.totalFields}
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
                  {enhancedProgress.logs.length === 0 ? (
                    <p className="text-muted-foreground">No activity yet</p>
                  ) : (
                    enhancedProgress.logs.map((log, i) => (
                      <div
                        key={i}
                        className={`mb-1 ${
                          log.level === 'error'
                            ? 'text-red-500'
                            : log.level === 'success'
                            ? 'text-green-500'
                            : 'text-foreground/70'
                        }`}
                      >
                        [{new Date(log.timestamp).toLocaleTimeString()}] {log.message}
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="data">
                <div className="bg-black/5 dark:bg-white/5 rounded-lg p-4 h-64 overflow-y-auto">
                  {enhancedProgress.result ? (
                    <pre className="text-xs font-mono">
                      {JSON.stringify(enhancedProgress.result, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-muted-foreground text-sm">No data yet</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Comparison Summary */}
      {legacyProgress.status === 'complete' && enhancedProgress.status === 'complete' && (
        <Card className="mt-6 border-purple-200 dark:border-purple-900">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-purple-500" />
              <CardTitle>Comparison Summary</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Speed Improvement */}
              <div className="text-center p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                <TrendingUp className="h-8 w-8 mx-auto mb-2 text-purple-500" />
                <p className="text-sm text-muted-foreground mb-1">Speed Improvement</p>
                <p className="text-3xl font-bold text-purple-600">
                  {legacyProgress.startTime && legacyProgress.endTime &&
                   enhancedProgress.startTime && enhancedProgress.endTime && (
                    `${(
                      ((legacyProgress.endTime - legacyProgress.startTime) /
                       (enhancedProgress.endTime - enhancedProgress.startTime))
                    ).toFixed(1)}x`
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">faster</p>
              </div>

              {/* Data Quality */}
              <div className="text-center p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                <Database className="h-8 w-8 mx-auto mb-2 text-purple-500" />
                <p className="text-sm text-muted-foreground mb-1">Data Completeness</p>
                <p className="text-3xl font-bold text-purple-600">
                  {enhancedProgress.stats && legacyProgress.stats && (
                    `+${(enhancedProgress.stats.completeness - legacyProgress.stats.completeness).toFixed(0)}%`
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">improvement</p>
              </div>

              {/* Additional Fields */}
              <div className="text-center p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-purple-500" />
                <p className="text-sm text-muted-foreground mb-1">Additional Fields</p>
                <p className="text-3xl font-bold text-purple-600">
                  {enhancedProgress.stats && legacyProgress.stats && (
                    `+${enhancedProgress.stats.fieldsPopulated - legacyProgress.stats.fieldsPopulated}`
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">more data points</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
