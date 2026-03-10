/**
 * GodsEyeAdmin — Real-time token flow visualization for platform admins
 *
 * Full-screen dark-themed admin page showing:
 * - Active users on the left
 * - Animated particle flow (red = requests, blue = responses)
 * - Anomaly checkpoint in the middle
 * - LLM endpoints on the right
 * - Usage totals bar at the bottom
 * - Configurable flagging rules and model routing
 * - Seed data toggle for demo/testing
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Eye,
  RefreshCw,
  Loader2,
  Settings2,
  Shield,
  Cpu,
  AlertTriangle,
  Users,
  Activity,
  Pause,
  Play,
  FlaskConical,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { useGodsEyeData } from '@/lib/hooks/useGodsEyeData';
import type { ActiveUser, LLMEndpoint, RecentEvent } from '@/lib/hooks/useGodsEyeData';
import { ParticleFlowCanvas } from '@/components/godseye/ParticleFlowCanvas';
import { FlaggingRulesPanel } from '@/components/godseye/FlaggingRulesPanel';
import { ModelRoutingPanel } from '@/components/godseye/ModelRoutingPanel';
import { UsageTotalsBar } from '@/components/godseye/UsageTotalsBar';
import { ActivityLogTerminal } from '@/components/godseye/ActivityLogTerminal';
import {
  generateFullSeedData,
  startSeedEventStream,
  type SeedDataSet,
} from '@/components/godseye/seedData';
import { formatTokens } from '@/lib/types/aiModels';

export default function GodsEyeAdmin() {
  const navigate = useNavigate();
  const { isPlatformAdmin } = useUserPermissions();
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 600 });
  const [isPaused, setIsPaused] = useState(false);
  const [showRulesPanel, setShowRulesPanel] = useState(false);
  const [showModelPanel, setShowModelPanel] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ActiveUser | null>(null);

  // Seed data state
  const [flowSpeed, setFlowSpeed] = useState(10);
  const [useSeedData, setUseSeedData] = useState(false);
  const [seedData, setSeedData] = useState<SeedDataSet | null>(null);
  const [seedEvents, setSeedEvents] = useState<RecentEvent[]>([]);
  const [seedUsers, setSeedUsers] = useState<ActiveUser[]>([]);
  const seedCleanupRef = useRef<(() => void) | null>(null);

  // Live data from hook
  const liveData = useGodsEyeData(isPaused || useSeedData ? 0 : 5_000); // 5s event poll, 30s full refresh

  // Initialize seed data
  useEffect(() => {
    if (useSeedData) {
      const initial = generateFullSeedData();
      setSeedData(initial);
      setSeedEvents(initial.recentEvents);
      setSeedUsers(initial.activeUsers);

      // Start streaming new seed events
      if (!isPaused) {
        seedCleanupRef.current = startSeedEventStream((newEvents, users) => {
          setSeedEvents(prev => [...newEvents, ...prev].slice(0, 200));
          setSeedUsers(users);
        }, 2500);
      }
    } else {
      // Clean up seed stream
      if (seedCleanupRef.current) {
        seedCleanupRef.current();
        seedCleanupRef.current = null;
      }
      setSeedData(null);
      setSeedEvents([]);
      setSeedUsers([]);
    }

    return () => {
      if (seedCleanupRef.current) {
        seedCleanupRef.current();
        seedCleanupRef.current = null;
      }
    };
  }, [useSeedData, isPaused]);

  // Test burst injection
  const [testEvents, setTestEvents] = useState<RecentEvent[]>([]);
  const triggerTestBurst = useCallback(() => {
    const users = useSeedData ? seedUsers : liveData.activeUsers;
    const endpoints = useSeedData && seedData ? seedData.llmEndpoints : liveData.llmEndpoints;
    if (users.length === 0 || endpoints.length === 0) return;

    const user = users[Math.floor(Math.random() * users.length)];
    const ep = endpoints[Math.floor(Math.random() * endpoints.length)];

    const testEvent: RecentEvent = {
      id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: user.user_id,
      user_email: user.user_email,
      user_name: user.user_name,
      provider: ep.provider,
      model: ep.model_id,
      feature: 'test_burst',
      input_tokens: Math.floor(Math.random() * 5000) + 500,
      output_tokens: Math.floor(Math.random() * 2000) + 200,
      estimated_cost: 0,
      created_at: new Date().toISOString(),
    };

    setTestEvents(prev => [testEvent, ...prev].slice(0, 10));
  }, [useSeedData, seedUsers, seedData, liveData.activeUsers, liveData.llmEndpoints]);

  // Merged data: seed or live
  const activeUsers = useSeedData ? seedUsers : liveData.activeUsers;
  const baseEvents = useSeedData ? seedEvents : liveData.recentEvents;
  const recentEvents = testEvents.length > 0 ? [...testEvents, ...baseEvents].slice(0, 200) : baseEvents;
  const llmEndpoints = useSeedData && seedData ? seedData.llmEndpoints : liveData.llmEndpoints;
  const anomalyRules = useSeedData && seedData ? seedData.anomalyRules : liveData.anomalyRules;
  const usageTotals = useSeedData && seedData ? seedData.usageTotals : liveData.usageTotals;
  const isLoading = !useSeedData && liveData.isLoading;
  const error = !useSeedData ? liveData.error : null;
  const lastUpdated = useSeedData ? new Date() : liveData.lastUpdated;

  // Resize observer — responds to sidebar collapse/expand
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({
          width: Math.floor(width),
          height: Math.floor(height),
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleUserClick = useCallback((user: ActiveUser) => {
    setSelectedUser(user);
  }, []);

  const handleEndpointClick = useCallback((_endpoint: LLMEndpoint) => {
    setShowModelPanel(true);
  }, []);

  const handleRefetch = useCallback(async () => {
    if (useSeedData) {
      const fresh = generateFullSeedData();
      setSeedData(fresh);
      setSeedEvents(fresh.recentEvents);
      setSeedUsers(fresh.activeUsers);
    } else {
      await liveData.refetch();
    }
  }, [useSeedData, liveData]);

  // Access control
  if (!isPlatformAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Shield className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Platform admin access required</p>
      </div>
    );
  }

  const flaggedCount = recentEvents.filter(e => e.is_flagged).length;
  const activeNowCount = activeUsers.filter(u => u.is_active).length;
  const hasLiveData = liveData.activeUsers.length > 0 || liveData.recentEvents.length > 0;

  return (
    <div
      className="bg-[#0f172a] text-slate-200 flex flex-col overflow-hidden w-full h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0f172a]/80 backdrop-blur border-b border-slate-800/50 z-10 shrink-0 min-w-0 gap-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/platform')}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-emerald-400" />
            <h1 className="text-base font-semibold text-slate-100">God&apos;s Eye</h1>
          </div>
          <Badge variant="outline" className="border-slate-700 text-slate-400 text-xs">
            <Activity className="h-3 w-3 mr-1" />
            {isPaused ? 'Paused' : useSeedData ? 'Demo' : 'Live'}
          </Badge>
          <div className="flex items-center gap-1.5 ml-1">
            <span className="text-[10px] text-slate-500">Speed</span>
            <input
              type="range"
              min="0.2"
              max="10"
              step="0.1"
              value={flowSpeed}
              onChange={(e) => setFlowSpeed(parseFloat(e.target.value))}
              className="w-16 h-1 accent-indigo-500 cursor-pointer"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={triggerTestBurst}
              className="text-slate-400 hover:text-amber-300 hover:bg-slate-800 h-6 px-1.5"
              title="Trigger a test animation burst"
            >
              <Zap className="h-3.5 w-3.5" />
              <span className="text-[10px] ml-0.5">Test</span>
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 min-w-0 flex-wrap justify-end">
          {/* Stats badges */}
          <Badge variant="outline" className="border-indigo-500/30 text-indigo-300 text-xs">
            <Users className="h-3 w-3 mr-1" />
            {activeNowCount} active / {activeUsers.length} users
          </Badge>
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-300 text-xs">
            <Cpu className="h-3 w-3 mr-1" />
            {llmEndpoints.filter(e => e.active_request_count > 0).length} endpoints
          </Badge>
          {flaggedCount > 0 && (
            <Badge variant="outline" className="border-orange-500/30 text-orange-300 text-xs animate-pulse">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {flaggedCount} flagged
            </Badge>
          )}

          <div className="w-px h-5 bg-slate-700 mx-1" />

          {/* Seed data toggle */}
          <div className="flex items-center gap-1.5">
            <FlaskConical className={`h-3.5 w-3.5 ${useSeedData ? 'text-amber-400' : 'text-slate-600'}`} />
            <span className="text-[10px] text-slate-500">Demo</span>
            <Switch
              checked={useSeedData}
              onCheckedChange={setUseSeedData}
              className="data-[state=checked]:bg-amber-600 scale-75"
            />
          </div>

          <div className="w-px h-5 bg-slate-700 mx-1" />

          {/* Controls */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsPaused(!isPaused)}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefetch}
            disabled={isLoading}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRulesPanel(true)}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <Shield className="h-4 w-4 mr-1" />
            Rules
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowModelPanel(true)}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <Settings2 className="h-4 w-4 mr-1" />
            Models
          </Button>

          {lastUpdated && (
            <span className="text-[10px] text-slate-600 ml-2">
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Seed data banner */}
      {useSeedData && (
        <div className="bg-amber-900/20 border-b border-amber-500/20 px-4 py-1.5 flex items-center justify-between shrink-0">
          <p className="text-xs text-amber-300/80">
            <FlaskConical className="h-3 w-3 inline mr-1" />
            Showing demo data — toggle off to see live production data
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUseSeedData(false)}
            className="text-amber-400 hover:text-amber-300 hover:bg-amber-900/30 h-6 text-xs"
          >
            Switch to Live
          </Button>
        </div>
      )}

      {/* No data prompt */}
      {!useSeedData && !isLoading && !hasLiveData && !error && (
        <div className="bg-slate-800/30 border-b border-slate-700/50 px-4 py-1.5 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-400">
            No live AI usage data found. Enable demo mode to preview the visualization.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUseSeedData(true)}
            className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/30 h-6 text-xs"
          >
            Enable Demo
          </Button>
        </div>
      )}

      {/* Main visualization + activity log side by side */}
      <div className="flex-1 flex min-h-0">
        {/* Canvas area */}
        <div ref={containerRef} className="flex-1 relative min-h-0">
          {isLoading && recentEvents.length === 0 && !useSeedData ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
            </div>
          ) : error && !useSeedData ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <AlertTriangle className="h-8 w-8 text-orange-400" />
              <p className="text-slate-400 text-sm">{error}</p>
              <Button variant="ghost" size="sm" onClick={handleRefetch} className="text-slate-400">
                Retry
              </Button>
            </div>
          ) : (
            <ParticleFlowCanvas
              activeUsers={activeUsers}
              recentEvents={isPaused ? [] : recentEvents}
              llmEndpoints={llmEndpoints}
              width={canvasSize.width}
              height={canvasSize.height}
              flowSpeed={flowSpeed}
              onUserClick={handleUserClick}
              onEndpointClick={handleEndpointClick}
            />
          )}
        </div>

        {/* Activity log terminal — right side */}
        <div className="w-[400px] shrink-0">
          <ActivityLogTerminal
            events={recentEvents}
            llmEndpoints={llmEndpoints}
            isPaused={isPaused}
            onOpenModelSettings={() => setShowModelPanel(true)}
          />
        </div>
      </div>

      {/* Bottom usage totals bar */}
      <UsageTotalsBar usageTotals={usageTotals} />

      {/* Flagging Rules Panel */}
      <Sheet open={showRulesPanel} onOpenChange={setShowRulesPanel}>
        <SheetContent className="!top-16 !h-[calc(100vh-4rem)] bg-[#1e293b] border-slate-700 text-slate-200 w-[440px]">
          <SheetHeader>
            <SheetTitle className="text-slate-100">Anomaly Flagging Rules</SheetTitle>
            <SheetDescription className="text-slate-400">
              Configure thresholds that flag suspicious token usage in the flow.
            </SheetDescription>
          </SheetHeader>
          <FlaggingRulesPanel rules={anomalyRules} onRulesChanged={handleRefetch} />
        </SheetContent>
      </Sheet>

      {/* Model Routing Panel */}
      <Sheet open={showModelPanel} onOpenChange={setShowModelPanel}>
        <SheetContent className="!top-16 !h-[calc(100vh-4rem)] bg-[#1e293b] border-slate-700 text-slate-200 w-[540px]">
          <SheetHeader>
            <SheetTitle className="text-slate-100">LLM Model Configuration</SheetTitle>
            <SheetDescription className="text-slate-400">
              Configure which models handle requests and set pricing.
            </SheetDescription>
          </SheetHeader>
          <ModelRoutingPanel llmEndpoints={llmEndpoints} onConfigChanged={handleRefetch} />
        </SheetContent>
      </Sheet>

      {/* Selected User Detail */}
      <Sheet open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <SheetContent className="!top-16 !h-[calc(100vh-4rem)] bg-[#1e293b] border-slate-700 text-slate-200 w-[400px]">
          <SheetHeader>
            <SheetTitle className="text-slate-100">
              {selectedUser?.user_name || selectedUser?.user_email || 'User Detail'}
            </SheetTitle>
            <SheetDescription className="text-slate-400">
              {selectedUser?.is_active ? 'Active now' : `Last seen ${new Date(selectedUser?.last_request_at || '').toLocaleDateString()}`}
            </SheetDescription>
          </SheetHeader>
          {selectedUser && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Requests</p>
                  <p className="text-lg font-semibold text-slate-200">{selectedUser.request_count}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Input Tokens</p>
                  <p className="text-lg font-semibold text-indigo-300">{formatTokens(selectedUser.total_input_tokens)}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Output Tokens</p>
                  <p className="text-lg font-semibold text-emerald-300">{formatTokens(selectedUser.total_output_tokens)}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Last Request</p>
                  <p className="text-sm font-medium text-slate-300">
                    {selectedUser.is_active
                      ? new Date(selectedUser.last_request_at).toLocaleTimeString()
                      : new Date(selectedUser.last_request_at).toLocaleString()}
                  </p>
                </div>
              </div>
              {selectedUser.user_email && (
                <p className="text-xs text-slate-500">{selectedUser.user_email}</p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
