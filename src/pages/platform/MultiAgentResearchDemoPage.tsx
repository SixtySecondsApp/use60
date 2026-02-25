/**
 * MultiAgentResearchDemoPage
 *
 * Side-by-side race page for research scenarios: single-agent (sequential)
 * vs multi-agent (parallel). Research tasks complete fast (~3-4s multi-agent)
 * to show the dramatic speedup of parallel agent execution.
 */

import { useState, useCallback, useEffect } from 'react';
import { Play, RotateCcw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { useNavigate } from 'react-router-dom';
import { ScenarioSelector, RESEARCH_SCENARIOS } from '@/components/platform/demo/ScenarioSelector';
import { RacePanel } from '@/components/platform/demo/RacePanel';
import { MetricsComparison } from '@/components/platform/demo/MetricsComparison';
import type { Scenario, PanelMetrics } from '@/components/platform/demo/types';

// =============================================================================
// Main Component
// =============================================================================

export default function MultiAgentResearchDemoPage() {
  const navigate = useNavigate();
  const { isPlatformAdmin } = useUserPermissions();

  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [raceState, setRaceState] = useState<'idle' | 'running' | 'complete'>('idle');
  const [startSignal, setStartSignal] = useState(0);
  const [singleMetrics, setSingleMetrics] = useState<PanelMetrics | null>(null);
  const [multiMetrics, setMultiMetrics] = useState<PanelMetrics | null>(null);

  const handleSingleMetrics = useCallback((metrics: PanelMetrics) => {
    setSingleMetrics(metrics);
  }, []);

  const handleMultiMetrics = useCallback((metrics: PanelMetrics) => {
    setMultiMetrics(metrics);
  }, []);

  const bothDone = singleMetrics && multiMetrics;
  useEffect(() => {
    if (bothDone && raceState === 'running') {
      setRaceState('complete');
    }
  }, [bothDone, raceState]);

  const handleRun = () => {
    if (!selectedScenario) return;
    setSingleMetrics(null);
    setMultiMetrics(null);
    setRaceState('running');
    setStartSignal(Date.now());
  };

  const handleReset = () => {
    setSingleMetrics(null);
    setMultiMetrics(null);
    setRaceState('idle');
    setStartSignal(0);
  };

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

  return (
    <div className="container mx-auto px-6 py-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="space-y-2">
        <BackToPlatform />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              Multi-Agent Research Demo
              <Badge variant="outline" className="text-xs font-normal">
                Demo Mode
              </Badge>
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              See the speed difference: run the same research task through single-agent (sequential) and multi-agent (parallel) paths side by side.
            </p>
          </div>
        </div>
      </div>

      {/* Scenario Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Choose a Research Scenario</CardTitle>
          <CardDescription>
            Select a research task to race single-agent (sequential) vs multi-agent (parallel) execution.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScenarioSelector
            scenarios={RESEARCH_SCENARIOS}
            selectedId={selectedScenario?.id ?? null}
            onSelect={setSelectedScenario}
            disabled={raceState === 'running'}
          />

          {/* Prompt preview + Run button */}
          {selectedScenario && (
            <div className="mt-4 flex items-center gap-3">
              <div className="flex-1 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2 font-mono truncate">
                &quot;{selectedScenario.prompt}&quot;
              </div>
              {raceState === 'idle' || raceState === 'complete' ? (
                <div className="flex gap-2">
                  {raceState === 'complete' && (
                    <Button variant="outline" size="sm" onClick={handleReset}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      Reset
                    </Button>
                  )}
                  <Button size="sm" onClick={handleRun}>
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                    {raceState === 'complete' ? 'Run Again' : 'Run Race'}
                  </Button>
                </div>
              ) : (
                <Badge variant="secondary" className="animate-pulse">
                  Racing...
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Side-by-side Race Panels */}
      {startSignal > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: 480 }}>
          <RacePanel
            mode="single"
            scenarioId={selectedScenario?.id ?? null}
            startSignal={startSignal}
            onMetricsReady={handleSingleMetrics}
          />
          <RacePanel
            mode="multi"
            scenarioId={selectedScenario?.id ?? null}
            startSignal={startSignal}
            onMetricsReady={handleMultiMetrics}
          />
        </div>
      )}

      {/* Metrics Comparison — appears when both panels finish */}
      {singleMetrics && multiMetrics && (
        <MetricsComparison
          singleMetrics={singleMetrics}
          multiMetrics={multiMetrics}
        />
      )}
    </div>
  );
}
