import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Database,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Copy,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Terminal,
  Clock,
  Filter,
  Rocket,
  GitPullRequest,
  ExternalLink,
  ShieldCheck,
  GitMerge,
  CircleDot,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// --- Types ---

interface MigrationEntry {
  version: string;
  name: string;
}

interface EnvironmentResult {
  migrations: MigrationEntry[];
  error: string | null;
}

interface UnifiedMigration {
  version: string;
  name: string;
  development: boolean;
  staging: boolean;
  production: boolean;
  isOutOfOrder: boolean;
  isMissing: boolean; // present in some but not all
}

type EnvKey = 'development' | 'staging' | 'production';
type SortField = 'version' | 'name' | 'status';
type FilterStatus = 'all' | 'synced' | 'out-of-sync' | 'missing';

const ENV_LABELS: Record<EnvKey, string> = {
  development: 'Development',
  staging: 'Staging',
  production: 'Production',
};

const ENV_REFS: Record<EnvKey, string> = {
  development: 'wbgmnyekgqklggilgqag',
  staging: 'caerqjzvuerejfrdtygb',
  production: 'ygdpgliavpxeugaajgrb',
};

// --- Helpers ---

function formatVersion(version: string): string {
  if (version.length !== 14) return version;
  const y = version.slice(0, 4);
  const m = version.slice(4, 6);
  const d = version.slice(6, 8);
  const h = version.slice(8, 10);
  const min = version.slice(10, 12);
  const s = version.slice(12, 14);
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

function formatName(name: string): string {
  return name.replace(/_/g, ' ').replace(/^\d{14}\s*/, '');
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
  toast.success('Copied to clipboard');
}

// --- Promotion Types ---

interface PreflightCheck {
  status: 'pass' | 'fail' | 'warn';
  message: string;
  data?: any;
}

interface PRInfo {
  number: number;
  title: string;
  url: string;
}

interface CICheck {
  name: string;
  status: string;
  conclusion: string | null;
  url: string;
}

// --- Promotion Panel ---

function PromotionPanel() {
  const [step, setStep] = useState<'idle' | 'preflight' | 'pr-created' | 'merging' | 'done'>('idle');
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [checks, setChecks] = useState<Record<string, PreflightCheck> | null>(null);
  const [canProceed, setCanProceed] = useState(false);
  const [pr, setPR] = useState<PRInfo | null>(null);
  const [prLoading, setPRLoading] = useState(false);
  const [ciChecks, setCIChecks] = useState<CICheck[]>([]);
  const [canMerge, setCanMerge] = useState(false);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [pollActive, setPollActive] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [prMerged, setPRMerged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const invoke = async (action: string, params?: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke('migration-tracker', {
      body: { action, ...params },
    });
    if (error) {
      let msg = error.message;
      try {
        const ctx = (error as any).context;
        if (ctx?.json) {
          const body = await ctx.json();
          if (body?.error) msg = body.error;
        }
      } catch { /* ignore */ }
      throw new Error(msg);
    }
    return data;
  };

  const runPreflight = async () => {
    setPreflightLoading(true);
    setError(null);
    setChecks(null);
    setPR(null);
    setCIChecks([]);
    setCanMerge(false);
    setPRMerged(false);
    try {
      const data = await invoke('preflight');
      setChecks(data.checks);
      setCanProceed(data.canProceed);

      // If there's already an open PR, jump to monitoring
      if (data.checks?.existingPR?.data?.number) {
        setPR(data.checks.existingPR.data);
        setStep('pr-created');
        startPolling(data.checks.existingPR.data.number);
      } else {
        setStep('preflight');
      }
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setPreflightLoading(false);
    }
  };

  const createPR = async () => {
    setPRLoading(true);
    setError(null);
    try {
      const data = await invoke('create-pr');
      setPR(data.pr);
      setStep('pr-created');
      toast.success(data.existing ? `Using existing PR #${data.pr.number}` : `PR #${data.pr.number} created`);
      startPolling(data.pr.number);
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setPRLoading(false);
    }
  };

  const startPolling = (prNumber: number) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setPollActive(true);

    const poll = async () => {
      try {
        const data = await invoke('pr-status', { prNumber });
        setCIChecks(data.checks || []);
        setCanMerge(data.canMerge);

        if (data.pr?.merged) {
          setPRMerged(true);
          setStep('done');
          stopPolling();
          toast.success('PR merged! CI will auto-apply migrations to production.');
        }

        // Stop polling when all checks are done (no in_progress)
        if (!data.inProgress && data.checks?.length > 0) {
          stopPolling();
        }
      } catch {
        // Silently retry on poll errors
      }
    };

    poll(); // Run immediately
    pollRef.current = setInterval(poll, 10000); // Then every 10s
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPollActive(false);
  };

  const mergePR = async () => {
    if (!pr) return;
    setMergeLoading(true);
    setError(null);
    try {
      const data = await invoke('merge-pr', { prNumber: pr.number });
      if (data.merged) {
        setPRMerged(true);
        setStep('done');
        stopPolling();
        toast.success('PR merged! CI will auto-apply migrations to production.');
      } else {
        toast.error(data.message || 'Merge failed');
      }
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setMergeLoading(false);
    }
  };

  const reset = () => {
    stopPolling();
    setStep('idle');
    setChecks(null);
    setPR(null);
    setCIChecks([]);
    setCanMerge(false);
    setCanProceed(false);
    setPRMerged(false);
    setError(null);
  };

  const checkIcon = (status: 'pass' | 'fail' | 'warn') => {
    if (status === 'pass') return <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />;
    if (status === 'fail') return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
    return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
  };

  return (
    <Card className="border-[#37bd7e]/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium text-white flex items-center gap-2">
          <Rocket className="w-5 h-5 text-[#37bd7e]" />
          Promote Staging to Production
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">
          Create a PR from staging → main. CI validates migrations, then merge to auto-deploy.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <StepDot active={step === 'idle'} done={step !== 'idle'} label="1. Pre-flight" />
          <div className="flex-1 h-px bg-gray-800" />
          <StepDot active={step === 'preflight'} done={step === 'pr-created' || step === 'merging' || step === 'done'} label="2. Create PR" />
          <div className="flex-1 h-px bg-gray-800" />
          <StepDot active={step === 'pr-created'} done={step === 'merging' || step === 'done'} label="3. CI Checks" />
          <div className="flex-1 h-px bg-gray-800" />
          <StepDot active={step === 'merging'} done={step === 'done'} label="4. Merge" />
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Step 1: Idle — run pre-flight */}
        {step === 'idle' && (
          <Button onClick={runPreflight} disabled={preflightLoading} className="gap-2 bg-[#37bd7e] hover:bg-[#2da76c]">
            {preflightLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Run Pre-flight Checks
          </Button>
        )}

        {/* Pre-flight results */}
        {checks && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-300">Pre-flight Checks</h4>
            {Object.entries(checks).map(([key, check]) => (
              <div key={key} className="flex items-start gap-2 p-2 rounded-lg bg-gray-900/50 text-sm">
                {checkIcon(check.status)}
                <div className="flex-1 min-w-0">
                  <span className="text-gray-200">{check.message}</span>
                  {/* Show pending migrations list */}
                  {check.data?.migrations && (
                    <div className="mt-1.5 space-y-0.5">
                      {check.data.migrations.slice(0, 10).map((m: any) => (
                        <div key={m.version} className="text-xs text-gray-500 font-mono">
                          {m.version} — {(m.name || '').replace(/_/g, ' ')}
                        </div>
                      ))}
                      {check.data.migrations.length > 10 && (
                        <div className="text-xs text-gray-600">...and {check.data.migrations.length - 10} more</div>
                      )}
                    </div>
                  )}
                  {/* Show commits */}
                  {check.data?.commits && (
                    <div className="mt-1.5 space-y-0.5">
                      {check.data.commits.slice(0, 5).map((c: any) => (
                        <div key={c.sha} className="text-xs text-gray-500 font-mono">
                          {c.sha} {c.message}
                        </div>
                      ))}
                      {check.data.commits.length > 5 && (
                        <div className="text-xs text-gray-600">...and {check.data.commits.length - 5} more</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 2: Pre-flight done — create PR */}
        {step === 'preflight' && canProceed && (
          <div className="flex items-center gap-3">
            <Button onClick={createPR} disabled={prLoading} className="gap-2 bg-[#37bd7e] hover:bg-[#2da76c]">
              {prLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitPullRequest className="w-4 h-4" />}
              Create Pull Request
            </Button>
            <Button variant="outline" size="sm" onClick={reset}>Cancel</Button>
          </div>
        )}

        {step === 'preflight' && !canProceed && checks && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-red-400">Pre-flight checks failed. Fix issues before promoting.</span>
            <Button variant="outline" size="sm" onClick={reset}>Retry</Button>
          </div>
        )}

        {/* Step 3: PR created — show CI status */}
        {(step === 'pr-created' || step === 'merging') && pr && (
          <div className="space-y-3">
            {/* PR link */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-900/50">
              <GitPullRequest className="w-5 h-5 text-[#37bd7e] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white font-medium">PR #{pr.number}: {pr.title}</div>
              </div>
              <a
                href={pr.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            {/* CI Checks */}
            {ciChecks.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                  CI Checks
                  {pollActive && <Loader2 className="w-3 h-3 animate-spin text-gray-500" />}
                </h4>
                {ciChecks.map((check, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-900/50 text-sm">
                    {check.conclusion === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                    ) : check.conclusion === 'failure' ? (
                      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    ) : (
                      <Loader2 className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
                    )}
                    <span className="text-gray-200 flex-1">{check.name}</span>
                    <Badge variant="outline" className={cn(
                      'text-[10px]',
                      check.conclusion === 'success' && 'text-green-400 border-green-500/30',
                      check.conclusion === 'failure' && 'text-red-400 border-red-500/30',
                      !check.conclusion && 'text-amber-400 border-amber-500/30'
                    )}>
                      {check.conclusion || check.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {ciChecks.length === 0 && !pollActive && (
              <div className="text-sm text-gray-500 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Waiting for CI checks to start...
                <Button variant="outline" size="sm" onClick={() => pr && startPolling(pr.number)} className="ml-2">
                  Refresh
                </Button>
              </div>
            )}

            {/* Merge button */}
            {canMerge && !prMerged && (
              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={mergePR}
                  disabled={mergeLoading}
                  className="gap-2 bg-[#37bd7e] hover:bg-[#2da76c]"
                >
                  {mergeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
                  Merge & Deploy to Production
                </Button>
                <Button variant="outline" size="sm" onClick={reset}>Cancel</Button>
              </div>
            )}

            {!canMerge && !prMerged && ciChecks.some(c => c.conclusion === 'failure') && (
              <div className="text-sm text-red-400 flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                CI checks failed. Fix issues before merging.
                <Button variant="outline" size="sm" onClick={reset} className="ml-2">Start Over</Button>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Done */}
        {step === 'done' && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <div className="flex-1">
              <div className="text-sm font-medium text-green-400">PR merged successfully</div>
              <div className="text-xs text-gray-400">CI will auto-apply migrations to production. Refresh the migration table to verify.</div>
            </div>
            <Button variant="outline" size="sm" onClick={reset}>New Promotion</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {done ? (
        <CheckCircle2 className="w-4 h-4 text-[#37bd7e]" />
      ) : active ? (
        <CircleDot className="w-4 h-4 text-[#37bd7e]" />
      ) : (
        <CircleDot className="w-4 h-4 text-gray-700" />
      )}
      <span className={cn('text-xs', active || done ? 'text-gray-300' : 'text-gray-600')}>{label}</span>
    </div>
  );
}

// --- Component ---

export default function MigrationTracker() {
  const [environments, setEnvironments] = useState<Record<EnvKey, EnvironmentResult> | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('version');
  const [sortDesc, setSortDesc] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchMigrations = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('migration-tracker', {
        body: { action: 'compare' },
      });

      if (error) {
        let msg = error.message;
        try {
          const ctx = (error as any).context;
          if (ctx?.json) {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          }
        } catch { /* ignore */ }
        toast.error(msg || 'Failed to fetch migration data');
        return;
      }

      if (data?.environments) {
        setEnvironments(data.environments);
        setLastFetched(new Date());
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch migration data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMigrations();
  }, [fetchMigrations]);

  // Build unified migration list
  const unified = useMemo((): UnifiedMigration[] => {
    if (!environments) return [];

    const envKeys: EnvKey[] = ['development', 'staging', 'production'];
    const migrationMap = new Map<string, UnifiedMigration>();

    for (const env of envKeys) {
      const result = environments[env];
      if (!result || result.error) continue;

      for (const m of result.migrations) {
        const existing = migrationMap.get(m.version);
        if (existing) {
          existing[env] = true;
          // Use name from whichever env has it
          if (!existing.name && m.name) existing.name = m.name;
        } else {
          migrationMap.set(m.version, {
            version: m.version,
            name: m.name || '',
            development: env === 'development',
            staging: env === 'staging',
            production: env === 'production',
            isOutOfOrder: false,
            isMissing: false,
          });
        }
      }
    }

    // Convert to array and sort by version
    const sorted = Array.from(migrationMap.values()).sort((a, b) =>
      a.version.localeCompare(b.version)
    );

    // Detect out-of-order: a migration is out of order if it has a lower version
    // but is missing from an environment where a higher-versioned migration exists
    for (const env of envKeys) {
      const envResult = environments[env];
      if (!envResult || envResult.error) continue;

      const appliedVersions = new Set(envResult.migrations.map(m => m.version));
      let maxApplied = '';

      for (const m of sorted) {
        if (appliedVersions.has(m.version)) {
          if (m.version > maxApplied) maxApplied = m.version;
        } else if (maxApplied && m.version < maxApplied) {
          m.isOutOfOrder = true;
        }
      }
    }

    // Mark missing: present in some envs but not all
    for (const m of sorted) {
      const presentCount = [m.development, m.staging, m.production].filter(Boolean).length;
      const envWithData = envKeys.filter(env => environments[env] && !environments[env].error).length;
      m.isMissing = presentCount > 0 && presentCount < envWithData;
    }

    return sorted;
  }, [environments]);

  // Filter and sort
  const filtered = useMemo(() => {
    let result = [...unified];

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.version.includes(q) ||
        m.name.toLowerCase().includes(q) ||
        formatName(m.name).toLowerCase().includes(q)
      );
    }

    // Status filter
    if (filterStatus === 'synced') {
      result = result.filter(m => !m.isMissing && !m.isOutOfOrder);
    } else if (filterStatus === 'out-of-sync') {
      result = result.filter(m => m.isMissing || m.isOutOfOrder);
    } else if (filterStatus === 'missing') {
      result = result.filter(m => m.isMissing);
    }

    // Sort
    if (sortField === 'version') {
      result.sort((a, b) => sortDesc
        ? b.version.localeCompare(a.version)
        : a.version.localeCompare(b.version)
      );
    } else if (sortField === 'name') {
      result.sort((a, b) => sortDesc
        ? b.name.localeCompare(a.name)
        : a.name.localeCompare(b.name)
      );
    } else if (sortField === 'status') {
      result.sort((a, b) => {
        const scoreA = (a.isMissing ? 2 : 0) + (a.isOutOfOrder ? 1 : 0);
        const scoreB = (b.isMissing ? 2 : 0) + (b.isOutOfOrder ? 1 : 0);
        return sortDesc ? scoreB - scoreA : scoreA - scoreB;
      });
    }

    return result;
  }, [unified, searchQuery, filterStatus, sortField, sortDesc]);

  // Stats
  const stats = useMemo(() => {
    const envKeys: EnvKey[] = ['development', 'staging', 'production'];
    const total = unified.length;
    const synced = unified.filter(m => !m.isMissing && !m.isOutOfOrder).length;
    const outOfSync = unified.filter(m => m.isMissing).length;
    const outOfOrder = unified.filter(m => m.isOutOfOrder).length;

    const perEnv: Record<EnvKey, { count: number; error: string | null }> = {} as any;
    for (const env of envKeys) {
      const result = environments?.[env];
      perEnv[env] = {
        count: result?.migrations?.length || 0,
        error: result?.error || null,
      };
    }

    const allInSync = outOfSync === 0 && outOfOrder === 0;

    return { total, synced, outOfSync, outOfOrder, perEnv, allInSync };
  }, [unified, environments]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortField(field);
      setSortDesc(true);
    }
  };

  const getPendingMigrations = (env: EnvKey): UnifiedMigration[] => {
    return unified.filter(m => !m[env] && m.isMissing);
  };

  const getDeployCommand = (env: EnvKey) => {
    const ref = ENV_REFS[env];
    const pending = getPendingMigrations(env);
    const needsIncludeAll = pending.some(m => m.isOutOfOrder);
    return `npx supabase db push --linked --project-ref ${ref}${needsIncludeAll ? ' --include-all' : ''}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Database className="w-6 h-6 text-[#37bd7e]" />
            Migration Tracker
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Compare applied database migrations across environments
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastFetched && (
            <span className="text-xs text-gray-500">
              Updated {lastFetched.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMigrations}
            disabled={loading}
            className="gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Sync Status */}
        <Card className={cn(
          'border',
          stats.allInSync ? 'border-green-500/30 bg-green-500/5' : 'border-amber-500/30 bg-amber-500/5'
        )}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Sync Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {stats.allInSync ? (
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              )}
              <span className={cn('text-lg font-bold', stats.allInSync ? 'text-green-400' : 'text-amber-400')}>
                {stats.allInSync ? 'All Synced' : `${stats.outOfSync} Pending`}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Total */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Total Migrations</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-white">{stats.total}</span>
          </CardContent>
        </Card>

        {/* Per-environment cards */}
        {(['development', 'staging', 'production'] as EnvKey[]).map(env => (
          <Card key={env} className={cn(
            'border',
            stats.perEnv[env]?.error ? 'border-red-500/30' : 'border-gray-800'
          )}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">{ENV_LABELS[env]}</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.perEnv[env]?.error ? (
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span className="text-sm text-red-400 truncate">{stats.perEnv[env].error}</span>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-white">{stats.perEnv[env]?.count || 0}</span>
                  {getPendingMigrations(env).length > 0 && (
                    <Badge variant="outline" className="text-amber-400 border-amber-500/30">
                      {getPendingMigrations(env).length} pending
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Deploy Commands (if out of sync) */}
      {!stats.allInSync && environments && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-amber-400 flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              Deploy Commands
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(['development', 'staging', 'production'] as EnvKey[]).map(env => {
              const pending = getPendingMigrations(env);
              if (pending.length === 0) return null;
              const cmd = getDeployCommand(env);
              return (
                <div key={env} className="flex items-center gap-3 p-2 rounded-lg bg-gray-900/50">
                  <Badge variant="outline" className="text-xs min-w-[90px] justify-center">
                    {ENV_LABELS[env]}
                  </Badge>
                  <code className="text-sm text-gray-300 flex-1 font-mono truncate">{cmd}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(cmd)}
                    className="h-7 w-7 p-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Promotion Panel */}
      <PromotionPanel />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search migrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-gray-900/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          {(['all', 'synced', 'out-of-sync', 'missing'] as FilterStatus[]).map(status => (
            <Button
              key={status}
              variant={filterStatus === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus(status)}
              className="text-xs capitalize"
            >
              {status === 'out-of-sync' ? 'Out of Sync' : status}
              {status === 'out-of-sync' && stats.outOfSync > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                  {stats.outOfSync}
                </Badge>
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* Migration Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left p-3 w-8"></th>
                  <th
                    className="text-left p-3 text-gray-400 font-medium cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleSort('version')}
                  >
                    <span className="flex items-center gap-1">
                      Version
                      <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    className="text-left p-3 text-gray-400 font-medium cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleSort('name')}
                  >
                    <span className="flex items-center gap-1">
                      Name
                      <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  {(['development', 'staging', 'production'] as EnvKey[]).map(env => (
                    <th key={env} className="text-center p-3 text-gray-400 font-medium w-28">
                      {ENV_LABELS[env]}
                    </th>
                  ))}
                  <th
                    className="text-center p-3 text-gray-400 font-medium cursor-pointer hover:text-white transition-colors w-24"
                    onClick={() => handleSort('status')}
                  >
                    <span className="flex items-center justify-center gap-1">
                      Status
                      <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && !environments ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        <span className="text-gray-500">Fetching migrations from all environments...</span>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-500">
                      {searchQuery || filterStatus !== 'all'
                        ? 'No migrations match your filters'
                        : 'No migration data available'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((m) => {
                    const isExpanded = expandedRow === m.version;
                    return (
                      <React.Fragment key={m.version}>
                        <tr
                          className={cn(
                            'border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors cursor-pointer',
                            m.isMissing && 'bg-amber-500/5',
                            m.isOutOfOrder && 'bg-red-500/5'
                          )}
                          onClick={() => setExpandedRow(isExpanded ? null : m.version)}
                        >
                          <td className="p-3 text-gray-500">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </td>
                          <td className="p-3 font-mono text-xs text-gray-300">
                            {formatVersion(m.version)}
                          </td>
                          <td className="p-3 text-gray-200 max-w-[300px] truncate">
                            {formatName(m.name)}
                          </td>
                          {(['development', 'staging', 'production'] as EnvKey[]).map(env => (
                            <td key={env} className="p-3 text-center">
                              {m[env] ? (
                                <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-400/60 mx-auto" />
                              )}
                            </td>
                          ))}
                          <td className="p-3 text-center">
                            {m.isOutOfOrder ? (
                              <Badge variant="outline" className="text-red-400 border-red-500/30 text-[10px]">
                                Out of Order
                              </Badge>
                            ) : m.isMissing ? (
                              <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-[10px]">
                                Pending
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-green-400 border-green-500/30 text-[10px]">
                                Synced
                              </Badge>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-gray-800/50 bg-gray-900/30">
                            <td colSpan={7} className="p-4">
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-4 text-xs">
                                  <div>
                                    <span className="text-gray-500">Full Version:</span>
                                    <span className="ml-2 text-gray-300 font-mono">{m.version}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Filename:</span>
                                    <span className="ml-2 text-gray-300 font-mono">{m.version}_{m.name}.sql</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500">File path:</span>
                                  <code className="text-xs text-gray-400 font-mono">
                                    supabase/migrations/{m.version}_{m.name}.sql
                                  </code>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyToClipboard(`supabase/migrations/${m.version}_${m.name}.sql`);
                                    }}
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </div>
                                {m.isMissing && (
                                  <div className="flex flex-wrap gap-2 pt-1">
                                    <span className="text-xs text-gray-500">Missing from:</span>
                                    {(['development', 'staging', 'production'] as EnvKey[]).map(env =>
                                      !m[env] ? (
                                        <Badge key={env} variant="outline" className="text-red-400 border-red-500/30 text-[10px]">
                                          {ENV_LABELS[env]}
                                        </Badge>
                                      ) : null
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer with count */}
          {filtered.length > 0 && (
            <div className="p-3 border-t border-gray-800 flex items-center justify-between text-xs text-gray-500">
              <span>
                Showing {filtered.length} of {unified.length} migrations
              </span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-green-400" /> Synced: {stats.synced}
                </span>
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-400" /> Pending: {stats.outOfSync}
                </span>
                {stats.outOfOrder > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-red-400" /> Out of Order: {stats.outOfOrder}
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
