import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Shuffle, Target, Play, RotateCcw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { type AbilityDefinition, getRequiredEntityType } from '@/lib/agent/abilityRegistry';
import { useOrchestratorJob } from '@/hooks/useOrchestratorJob';
import { LiveStepVisualizer } from '@/components/agent/LiveStepVisualizer';
import { LiveOutputPanel } from '@/components/agent/LiveOutputPanel';
import { V1ResultPreview } from '@/components/agent/V1ResultPreview';

interface AbilityTestPanelProps {
  ability: AbilityDefinition;
}

export function AbilityTestPanel({ ability }: AbilityTestPanelProps) {
  const { user } = useAuth();
  const orgId = useOrgStore(s => s.activeOrgId);

  const [mode, setMode] = useState<'sample' | 'specific'>('sample');
  const [selectedMeetingId, setSelectedMeetingId] = useState('');
  const [selectedDealId, setSelectedDealId] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [v1Result, setV1Result] = useState<Record<string, unknown> | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const entityType = getRequiredEntityType(ability.eventType);

  // Track orchestrator job
  const { stepResults, jobStatus, isRunning: orchestratorRunning, reset: resetJob } = useOrchestratorJob(jobId);

  // Auto-reset when job reaches terminal state
  useEffect(() => {
    if (jobStatus === 'completed') {
      setIsRunning(false);
      toast.success('Test completed', {
        description: `${stepResults.filter(s => s.status === 'completed').length} steps completed`,
      });
    } else if (jobStatus === 'failed') {
      setIsRunning(false);
      toast.error('Test failed');
    }
  }, [jobStatus, stepResults]);

  // Fetch recent meetings when entity type is 'meeting'
  const { data: meetings, isLoading: loadingMeetings } = useQuery({
    queryKey: ['recent-meetings-test', orgId, user?.id],
    queryFn: async () => {
      if (!user?.id || !orgId) return [];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data, error } = await supabase
        .from('meetings')
        .select('id, title, meeting_start, org_id')
        .eq('owner_user_id', user.id)
        .not('transcript_text', 'is', null)
        .gte('meeting_start', thirtyDaysAgo.toISOString())
        .order('meeting_start', { ascending: false })
        .limit(15);
      if (error) throw error;
      return data || [];
    },
    enabled: mode === 'specific' && entityType === 'meeting' && !!user?.id && !!orgId,
  });

  // Fetch recent deals when entity type is 'deal'
  const { data: deals, isLoading: loadingDeals } = useQuery({
    queryKey: ['recent-deals-test', orgId, user?.id],
    queryFn: async () => {
      if (!user?.id || !orgId) return [];
      const { data, error } = await supabase
        .from('deals')
        .select('id, name, stage')
        .eq('owner_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(15);
      if (error) throw error;
      return data || [];
    },
    enabled: mode === 'specific' && entityType === 'deal' && !!user?.id && !!orgId,
  });

  // Determine if run button should be disabled
  const isEntityRequired = mode === 'specific' && entityType !== null;
  const hasRequiredEntity = entityType === 'meeting' ? !!selectedMeetingId : entityType === 'deal' ? !!selectedDealId : true;
  const runDisabled = isRunning || (isEntityRequired && !hasRequiredEntity);

  const handleRunTest = async () => {
    if (!user?.id || !orgId) {
      toast.error('Missing user or organization');
      return;
    }

    setIsRunning(true);
    setV1Result(null);
    setJobId(null);

    try {
      if (ability.backendType === 'v1-simulate') {
        // V1 path: safe dry-run preview, no external delivery
        const { data, error } = await supabase.functions.invoke('proactive-simulate', {
          body: {
            orgId,
            feature: ability.eventType,
            targetUserId: user.id,
            sendSlack: false,
            createInApp: false,
            dryRun: true,
            simulationMode: mode === 'sample',
            entityIds: mode === 'specific' ? {
              ...(selectedMeetingId ? { meetingId: selectedMeetingId } : {}),
              ...(selectedDealId ? { dealId: selectedDealId } : {}),
            } : {},
          },
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Simulation failed');

        setV1Result(data as Record<string, unknown>);
        toast.success('Test completed', { description: 'Dry run — nothing was sent' });
      } else {
        // Orchestrator path: run with in-app channel only (safe)
        const selectedMeeting = meetings?.find(m => m.id === selectedMeetingId);

        const { data, error } = await supabase.functions.invoke('agent-orchestrator', {
          body: {
            type: ability.eventType,
            source: 'manual',
            org_id: selectedMeeting?.org_id || orgId,
            user_id: user.id,
            channels: ['in-app'],
            payload: entityType === 'meeting' && selectedMeetingId
              ? { meeting_id: selectedMeetingId, title: selectedMeeting?.title, transcript_available: true }
              : {},
          },
        });

        if (error) {
          let errorMsg = error.message || 'Unknown error';
          try {
            if (error.context && typeof error.context.json === 'function') {
              const body = await error.context.json();
              errorMsg = body?.error || errorMsg;
            }
          } catch { /* ignore parse errors */ }
          throw new Error(errorMsg);
        }

        if (data?.job_id) {
          setJobId(data.job_id);
          toast.success('Orchestrator started', {
            description: `Job ID: ${data.job_id.slice(0, 8)}...`,
          });
        } else {
          throw new Error('No job ID returned');
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to run test';
      toast.error(msg);
      setIsRunning(false);
    } finally {
      if (ability.backendType === 'v1-simulate') {
        setIsRunning(false);
      }
    }
  };

  const handleReset = () => {
    setV1Result(null);
    setJobId(null);
    setIsRunning(false);
    resetJob();
  };

  return (
    <div className="space-y-4 py-3">
      {/* Mode selector */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={mode === 'sample' ? 'default' : 'outline'}
          className={mode === 'sample'
            ? 'flex-1 gap-2 bg-white/10 hover:bg-white/15 text-gray-200 border-white/20'
            : 'flex-1 gap-2 border-white/10 text-gray-400 hover:bg-white/5'
          }
          onClick={() => setMode('sample')}
        >
          <Shuffle className="w-3.5 h-3.5" />
          Sample Data
        </Button>
        <Button
          size="sm"
          variant={mode === 'specific' ? 'default' : 'outline'}
          className={mode === 'specific'
            ? 'flex-1 gap-2 bg-white/10 hover:bg-white/15 text-gray-200 border-white/20'
            : 'flex-1 gap-2 border-white/10 text-gray-400 hover:bg-white/5'
          }
          onClick={() => setMode('specific')}
        >
          <Target className="w-3.5 h-3.5" />
          Select Specific
        </Button>
      </div>

      {/* Entity picker */}
      {mode === 'specific' && entityType === 'meeting' && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Select Meeting</label>
          <select
            value={selectedMeetingId}
            onChange={(e) => setSelectedMeetingId(e.target.value)}
            disabled={isRunning || loadingMeetings}
            className="w-full px-3 py-2 border border-white/10 rounded-md bg-white/5 text-sm text-gray-300"
          >
            <option value="">Choose a meeting...</option>
            {meetings?.map((meeting) => (
              <option key={meeting.id} value={meeting.id}>
                {meeting.title} ({new Date(meeting.meeting_start).toLocaleDateString()})
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === 'specific' && entityType === 'deal' && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Select Deal</label>
          <select
            value={selectedDealId}
            onChange={(e) => setSelectedDealId(e.target.value)}
            disabled={isRunning || loadingDeals}
            className="w-full px-3 py-2 border border-white/10 rounded-md bg-white/5 text-sm text-gray-300"
          >
            <option value="">Choose a deal...</option>
            {deals?.map((deal) => (
              <option key={deal.id} value={deal.id}>
                {deal.name} ({deal.stage})
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === 'specific' && entityType === null && (
        <p className="text-sm text-gray-500">Uses your org data automatically</p>
      )}

      {/* Orchestrator warning */}
      {ability.backendType === 'orchestrator' && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-xs text-amber-400">Will run the full pipeline (in-app only)</span>
        </div>
      )}

      {/* Run Test button */}
      <Button
        size="sm"
        onClick={handleRunTest}
        disabled={runDisabled}
        className="w-full gap-2"
      >
        {isRunning ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Running...
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            Run Test
          </>
        )}
      </Button>

      {/* Results */}
      {v1Result && ability.backendType === 'v1-simulate' && (
        <V1ResultPreview result={v1Result} v1UseRealData={mode === 'specific'} />
      )}

      {jobId && ability.backendType !== 'v1-simulate' && (
        <div className="space-y-4">
          <LiveStepVisualizer stepResults={stepResults} jobStatus={jobStatus} eventType={ability.eventType} />
          <LiveOutputPanel stepResults={stepResults} jobStatus={jobStatus} jobId={jobId} eventType={ability.eventType} />
        </div>
      )}

      {/* Reset button */}
      {(v1Result || jobId) && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleReset}
          disabled={isRunning}
          className="w-full gap-2 border-white/10 text-gray-400"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </Button>
      )}
    </div>
  );
}
