// src/components/control-room/CreditHealth.tsx
// Credit Health widget for the Control Room admin dashboard.
// Shows: today's burn gauge, per-agent breakdown, 30-day sparkline, projection.

import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { AlertTriangle, TrendingDown, Zap } from 'lucide-react';
import { useCreditHealth } from '@/lib/hooks/useCreditHealth';
import type { AgentBreakdown } from '@/lib/hooks/useCreditHealth';

// ============================================================================
// Helpers
// ============================================================================

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

/** Return a Tailwind colour class based on burn percentage */
function gaugeColor(pct: number): { bar: string; text: string } {
  if (pct >= 90) return { bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400' };
  if (pct >= 70) return { bar: 'bg-amber-400', text: 'text-amber-600 dark:text-amber-400' };
  return { bar: 'bg-[#37bd7e]', text: 'text-[#37bd7e]' };
}

/** Human-readable agent_type label */
function agentLabel(key: string): string {
  const MAP: Record<string, string> = {
    copilot_autonomous: 'Autonomous',
    workflow_ai_node: 'Workflow AI',
    api_copilot: 'Copilot (API)',
    email_generation: 'Email Gen',
    demo_research: 'Research',
    sequence_step: 'Sequences',
    unknown: 'Other',
  };
  return MAP[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
}

// ============================================================================
// Sub-components
// ============================================================================

/** Horizontal bar for a single agent type */
function AgentBar({ item, max }: { item: AgentBreakdown; max: number }) {
  const widthPct = max > 0 ? (item.credits / max) * 100 : 0;

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600 dark:text-gray-300 truncate max-w-[120px]">
          {agentLabel(item.agent_type)}
        </span>
        <span className="text-gray-500 dark:text-gray-400 tabular-nums ml-2">
          {fmt(item.credits)} <span className="text-gray-400">({item.pct}%)</span>
        </span>
      </div>
      <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-[#37bd7e] transition-all duration-500"
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}

/** Empty state when no credit data exists yet */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <Zap className="h-8 w-8 text-muted-foreground/30" />
      <p className="text-xs text-muted-foreground">No credit activity yet</p>
      <p className="text-xs text-muted-foreground/60">
        Data will appear once the AI starts running actions.
      </p>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function CreditHealth() {
  const { data, isLoading, isError } = useCreditHealth();

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-3 bg-muted rounded w-1/2" />
        <div className="h-2 bg-muted rounded w-full" />
        <div className="h-16 bg-muted rounded" />
        <div className="h-2 bg-muted rounded w-3/4" />
        <div className="h-2 bg-muted rounded w-2/3" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-xs text-red-500">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        Failed to load credit data
      </div>
    );
  }

  if (!data) return null;

  const { trend, agentBreakdown, budgetCap, todayBurn, sevenDayAvg, projectedDaysRemaining } =
    data;

  const hasData = trend.some((d) => d.credits > 0) || agentBreakdown.length > 0;

  if (!hasData) return <EmptyState />;

  // ---- Burn gauge ----
  let burnPct = 0;
  let gaugeLabel = '';

  if (budgetCap.cap_type !== 'unlimited' && budgetCap.cap_amount != null && budgetCap.cap_amount > 0) {
    burnPct = Math.min(100, (budgetCap.current_period_spent / budgetCap.cap_amount) * 100);
    gaugeLabel = `${fmt(budgetCap.current_period_spent)} / ${fmt(budgetCap.cap_amount)} cr`;
  } else if (todayBurn > 0) {
    // No budget set — just show today's raw burn without a cap gauge
    burnPct = 0;
    gaugeLabel = `${fmt(todayBurn)} cr today (no budget set)`;
  }

  const { bar: barColor, text: textColor } = gaugeColor(burnPct);

  // ---- Sparkline data — use last 30 days ----
  const sparkData = trend.map((d) => ({
    date: d.date.slice(5), // MM-DD
    credits: d.credits,
  }));

  // ---- Per-agent breakdown ----
  const maxAgentCredits = agentBreakdown.length > 0 ? agentBreakdown[0].credits : 0;

  return (
    <div className="space-y-4">
      {/* ── Section 1: Today's burn gauge ─────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
            {budgetCap.cap_type !== 'unlimited' ? 'Period Spend' : "Today's Burn"}
          </span>
          <span className={`text-xs font-semibold tabular-nums ${textColor}`}>
            {gaugeLabel || `${fmt(todayBurn)} cr`}
          </span>
        </div>

        {budgetCap.cap_type !== 'unlimited' && (
          <>
            <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                style={{ width: `${burnPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0</span>
              <span className={burnPct >= 90 ? 'text-red-500 font-medium' : ''}>
                {Math.round(burnPct)}% of {budgetCap.cap_type} cap
              </span>
              <span>{fmt(budgetCap.cap_amount ?? 0)}</span>
            </div>
          </>
        )}
      </div>

      {/* ── Section 2: Per-agent breakdown ────────────────────────────────── */}
      {agentBreakdown.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Today by agent
          </p>
          <div className="space-y-2">
            {agentBreakdown.slice(0, 5).map((item) => (
              <AgentBar key={item.agent_type} item={item} max={maxAgentCredits} />
            ))}
          </div>
        </div>
      )}

      {/* ── Section 3: 30-day sparkline ───────────────────────────────────── */}
      {trend.some((d) => d.credits > 0) && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            30-day trend
          </p>
          <div className="h-14">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
                <defs>
                  <linearGradient id="creditGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#37bd7e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#37bd7e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <Tooltip
                  contentStyle={{
                    fontSize: '11px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(0,0,0,0.08)',
                    background: 'var(--background, #fff)',
                  }}
                  formatter={(val: number) => [`${fmt(val)} cr`, 'Credits']}
                  labelFormatter={(label: string) => label}
                />
                <Area
                  type="monotone"
                  dataKey="credits"
                  stroke="#37bd7e"
                  strokeWidth={1.5}
                  fill="url(#creditGrad)"
                  dot={false}
                  activeDot={{ r: 3, fill: '#37bd7e' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{trend[0]?.date.slice(5)}</span>
            <span className="text-center">7d avg: {fmt(sevenDayAvg)} cr/day</span>
            <span>{trend[trend.length - 1]?.date.slice(5)}</span>
          </div>
        </div>
      )}

      {/* ── Section 4: Projected exhaustion ──────────────────────────────── */}
      {projectedDaysRemaining !== null && sevenDayAvg > 0 && (
        <div
          className={`flex items-start gap-2 rounded-md p-2 text-xs ${
            projectedDaysRemaining <= 7
              ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'
              : projectedDaysRemaining <= 14
              ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
              : 'bg-gray-50 dark:bg-gray-800/50 text-muted-foreground'
          }`}
        >
          <TrendingDown className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            {projectedDaysRemaining === 0
              ? 'Budget exhausted — usage is blocked.'
              : `At current burn rate, budget exhausts in ~${projectedDaysRemaining} day${
                  projectedDaysRemaining === 1 ? '' : 's'
                }.`}
          </span>
        </div>
      )}
    </div>
  );
}
