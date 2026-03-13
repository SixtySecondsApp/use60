/**
 * GoldenEyeAdmin — Real-time token flow visualization for platform admins
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

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Eye,
  Loader2,
  Shield,
  AlertTriangle,
  FlaskConical,
  Zap,
  Trophy,
  X,
  Settings,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { useGoldenEyeData } from '@/lib/hooks/useGoldenEyeData';
import type { ActiveUser, LLMEndpoint, RecentEvent } from '@/lib/hooks/useGoldenEyeData';
import { ParticleFlowCanvas, DEFAULT_SANKEY_COLORS } from '@/components/goldeneye/ParticleFlowCanvas';
import { FlaggingRulesPanel } from '@/components/goldeneye/FlaggingRulesPanel';
import { ModelRoutingPanel } from '@/components/goldeneye/ModelRoutingPanel';
import { UsageTotalsBar } from '@/components/goldeneye/UsageTotalsBar';
import { ActivityLogTerminal } from '@/components/goldeneye/ActivityLogTerminal';
import { ModelRatioChart } from '@/components/goldeneye/ModelRatioChart';
import {
  generateFullSeedData,
  startSeedEventStream,
  type SeedDataSet,
} from '@/components/goldeneye/seedData';
import { formatTokens } from '@/lib/types/aiModels';

export default function GoldenEyeAdmin() {
  const navigate = useNavigate();
  const { isPlatformAdmin } = useUserPermissions();
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 600 });
  const [isPaused, setIsPaused] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ActiveUser | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'rules' | 'colours' | 'models'>('rules');
  const [sankeyColors, setSankeyColors] = useState<string[]>([...DEFAULT_SANKEY_COLORS]);

  // Seed data state
  const [flowSpeed, setFlowSpeed] = useState(10);
  const [useSeedData, setUseSeedData] = useState(false);
  const [seedData, setSeedData] = useState<SeedDataSet | null>(null);
  const [seedEvents, setSeedEvents] = useState<RecentEvent[]>([]);
  const [seedUsers, setSeedUsers] = useState<ActiveUser[]>([]);
  const seedCleanupRef = useRef<(() => void) | null>(null);

  // Live data from hook
  const liveData = useGoldenEyeData(isPaused || useSeedData ? 0 : 3_000); // 3s event poll, 18s full refresh

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
      client_ip: null,
    };

    setTestEvents(prev => [testEvent, ...prev].slice(0, 10));
  }, [useSeedData, seedUsers, seedData, liveData.activeUsers, liveData.llmEndpoints]);

  // Merged data: seed or live
  const activeUsers = useSeedData ? seedUsers : liveData.activeUsers;
  const baseEvents = useSeedData ? seedEvents : liveData.recentEvents;
  const recentEvents = useMemo(() => {
    if (testEvents.length === 0) return baseEvents;
    // Merge test events into base events sorted by timestamp (newest first)
    return [...testEvents, ...baseEvents]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 200);
  }, [testEvents, baseEvents]);
  const llmEndpointsRaw = useSeedData && seedData ? seedData.llmEndpoints : liveData.llmEndpoints;
  const anomalyRules = useSeedData && seedData ? seedData.anomalyRules : liveData.anomalyRules;
  const usageTotals = useSeedData && seedData ? seedData.usageTotals : liveData.usageTotals;
  const modelBreakdown = liveData.modelBreakdown;
  // Recompute active_request_count from merged recentEvents (includes test events)
  // so the canvas shows the correct endpoints as visible nodes
  const llmEndpoints = useMemo(() => {
    if (recentEvents.length === 0) return llmEndpointsRaw;
    const countByModel = new Map<string, number>();
    for (const e of recentEvents) {
      countByModel.set(e.model, (countByModel.get(e.model) || 0) + 1);
    }
    return llmEndpointsRaw.map(ep => ({
      ...ep,
      active_request_count: countByModel.get(ep.model_id) ?? ep.active_request_count,
    }));
  }, [llmEndpointsRaw, recentEvents]);

  // Leaderboard: top 15 users sorted by total tokens (in + out) all time
  // Pad with test users if fewer than 15 real users
  const leaderboardUsers = useMemo(() => {
    const real = [...activeUsers]
      .sort((a, b) => (b.total_input_tokens + b.total_output_tokens) - (a.total_input_tokens + a.total_output_tokens))
      .slice(0, 15);

    if (real.length >= 15) return real;

    const testUsers: ActiveUser[] = [];
    for (let i = real.length + 1; testUsers.length + real.length < 15; i++) {
      testUsers.push({
        user_id: `test-user-${i}`,
        user_email: `testuser${i}@example.com`,
        user_name: `Test User ${i}`,
        org_name: 'Demo Org',
        request_count: Math.max(1, 50 - i * 3),
        total_input_tokens: Math.max(100, 15000 - i * 900),
        total_output_tokens: Math.max(50, 8000 - i * 500),
        last_request_at: new Date().toISOString(),
        is_active: false,
        total_cost_gbp: Math.max(0.01, (5.0 - i * 0.3)),
        credits_bought: 0,
      });
    }
    return [...real, ...testUsers];
  }, [activeUsers]);

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
    setShowSettings(true);
    setSettingsTab('models');
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
            <h1 className="text-base font-semibold text-slate-100">GoldenEye</h1>
          </div>
        </div>

        <div className="flex items-center gap-2 min-w-0 flex-wrap justify-end">
          {flaggedCount > 0 && (
            <Badge variant="outline" className="border-orange-500/30 text-orange-300 text-xs animate-pulse">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {flaggedCount} flagged
            </Badge>
          )}

          {/* Controls */}
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(true)}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-800 h-7 w-7 p-0"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
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
      <div className="flex-1 flex min-h-0 min-w-0 pb-[50px]">
        {/* Left panel + Canvas — fixed height driven by left panel content */}
        <div className="flex-1 flex min-w-0 self-start p-2 gap-2">
        {/* Left panel — Leaderboard + Model Ratio */}
        <div className="w-[520px] shrink-0 flex flex-col gap-2">
          <div className="shrink-0 rounded-lg border border-slate-700/50 bg-slate-900/60 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/50">
              <Trophy className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Leaderboard — Top 15 All Time</span>
            </div>
            <div>
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-slate-900/90 backdrop-blur">
                  <tr className="text-slate-500 border-b border-slate-700/50">
                    <th className="text-left px-2 py-1 font-medium">#</th>
                    <th className="text-left px-2 py-1 font-medium">User</th>
                    <th className="text-left px-2 py-1 font-medium">Org</th>
                    <th className="text-right px-2 py-1 font-medium">In</th>
                    <th className="text-right px-2 py-1 font-medium">Out</th>
                    <th className="text-right px-2 py-1 font-medium">GBP</th>
                    <th className="text-right px-2 py-1 font-medium">Credits</th>
                    <th className="text-right px-2 py-1 font-medium">Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardUsers.map((user, i) => (
                    <tr
                      key={user.user_id}
                      className="border-b border-slate-800/30 hover:bg-slate-800/40 cursor-pointer transition-colors"
                      onClick={() => handleUserClick(user)}
                    >
                      <td className="px-2 py-1 text-slate-600 font-mono">{i + 1}</td>
                      <td className="px-2 py-1">
                        <div className="truncate max-w-[90px]">
                          <span className={`font-medium ${user.is_active ? 'text-emerald-300' : 'text-slate-300'}`}>
                            {user.user_name || user.user_email || 'Unknown'}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        <div className="truncate max-w-[70px] text-slate-500">{user.org_name || '—'}</div>
                      </td>
                      <td className="px-2 py-1 text-right text-indigo-300 font-mono">{formatTokens(user.total_input_tokens)}</td>
                      <td className="px-2 py-1 text-right text-emerald-300 font-mono">{formatTokens(user.total_output_tokens)}</td>
                      <td className="px-2 py-1 text-right text-amber-300 font-mono">£{user.total_cost_gbp.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right text-cyan-300 font-mono">{user.credits_bought}</td>
                      <td className="px-2 py-1 text-right text-slate-600 font-mono">—</td>
                    </tr>
                  ))}
                  {leaderboardUsers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-slate-600">No usage data</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Model Ratio donut chart */}
          <div className="shrink-0">
            <ModelRatioChart modelBreakdown={modelBreakdown} />
          </div>

          {/* Usage totals */}
          <div className="shrink-0">
            <UsageTotalsBar usageTotals={usageTotals} />
          </div>

        </div>

        {/* Canvas area — constrained to prevent pushing siblings off-screen */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col rounded-lg border border-slate-700/50 bg-slate-900/60 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/50 shrink-0">
            <Workflow className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Gateway Flow</span>
          </div>
          <div ref={containerRef} className="flex-1 min-h-0 relative overflow-hidden">
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
              colors={sankeyColors}
              onUserClick={handleUserClick}
              onEndpointClick={handleEndpointClick}
            />
          )}
          </div>
        </div>
        </div>{/* end Left panel + Canvas wrapper */}

        {/* Activity log terminal — right side, stretchy height */}
        <div className="w-[340px] shrink-0 min-h-0 h-full">
          <ActivityLogTerminal
            events={recentEvents}
            llmEndpoints={llmEndpoints}
            isPaused={isPaused}
          />
        </div>
      </div>

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

      {/* Settings popup */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          />
          {/* Panel */}
          <div className="relative bg-[#1e293b] border border-slate-700 rounded-xl shadow-2xl w-[1350px] max-w-[95vw] h-[60vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60 shrink-0">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-100">Settings</h2>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-slate-700/60 shrink-0">
              {(['rules', 'colours', 'models'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSettingsTab(tab)}
                  className={`px-5 py-2.5 text-xs font-medium capitalize transition-colors ${
                    settingsTab === tab
                      ? 'text-emerald-400 border-b-2 border-emerald-400'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab content — fills remaining height, no scroll */}
            <div className="flex-1 min-h-0 p-5">
              {settingsTab === 'rules' && (
                <div className="h-full flex flex-col">
                  <p className="text-[11px] text-slate-500 mb-4 shrink-0">
                    Configure thresholds that flag suspicious token usage in the flow.
                  </p>
                  <FlaggingRulesPanel rules={anomalyRules} onRulesChanged={handleRefetch} />
                </div>
              )}

              {settingsTab === 'colours' && (
                <div className="h-full">
                  <p className="text-[11px] text-slate-500 mb-4">
                    Each colour is assigned to users in the Sankey flow diagram. Click a swatch to change it.
                  </p>
                  <div className="grid grid-cols-4 gap-3">
                    {sankeyColors.map((color, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <label
                          className="relative flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer border border-slate-600/50 hover:border-slate-400 transition-colors group"
                          style={{ backgroundColor: color }}
                        >
                          <input
                            type="color"
                            value={color}
                            onChange={(e) => {
                              const next = [...sankeyColors];
                              next[idx] = e.target.value;
                              setSankeyColors(next);
                            }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          />
                          <span className="absolute inset-0 rounded-lg ring-1 ring-white/10 group-hover:ring-white/30 transition-all" />
                        </label>
                        <span className="text-xs text-slate-300 w-14">User {idx + 1}</span>
                        <span className="text-[10px] text-slate-500 font-mono uppercase">{color}</span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-4 mt-4 border-t border-slate-700/40">
                    <button
                      onClick={() => setSankeyColors([...DEFAULT_SANKEY_COLORS])}
                      className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      Reset to defaults
                    </button>
                  </div>
                </div>
              )}

              {settingsTab === 'models' && (
                <div className="h-full flex flex-col">
                  <p className="text-[11px] text-slate-500 mb-4 shrink-0">
                    Configure which models handle requests and set pricing.
                  </p>
                  <ModelRoutingPanel llmEndpoints={llmEndpoints} onConfigChanged={handleRefetch} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
