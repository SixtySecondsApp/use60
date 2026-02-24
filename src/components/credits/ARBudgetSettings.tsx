/**
 * ARBudgetSettings
 *
 * Controls the monthly creditsedit cap and pause/resume toggle for autonomous research
 * (AR) / proactive agent runs. Admin-only.
 *
 * Data source: org_credit_balance.ar_monthly_cap, ar_paused
 * Budget check: check_ar_budget() RPC
 */

import { useState, useEffect, useCallback } from 'react';
import { PauseCircle, PlayCircle, AlertTriangle, Infinity, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { useUser } from '@/lib/hooks/useUser';
import { isUserAdmin } from '@/lib/utils/adminUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ARBudgetData {
  arMonthlyCap: number | null;
  arPaused: boolean;
  usedThisMonth: number;
}

interface ARFeatureUsage {
  featureKey: string;
  label: string;
  usedThisMonth: number;
}

const AR_FEATURE_LABELS: Record<string, string> = {
  ar_meeting_prep: 'Meeting Preparation',
  ar_deal_research: 'Deal Research',
  ar_contact_enrich: 'Contact Enrichment',
  ar_pipeline_monitor: 'Pipeline Monitoring',
  ar_follow_up: 'Follow-up Suggestions',
  ar_news_alerts: 'News & Alerts',
};

function getProgressColor(pct: number): string {
  if (pct >= 100) return 'bg-red-500';
  if (pct >= 80) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function getProgressTextColor(pct: number): string {
  if (pct >= 100) return 'text-red-600 dark:text-red-400';
  if (pct >= 80) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

export function ARBudgetSettings() {
  const orgId = useOrgId();
  const { userData } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<ARBudgetData | null>(null);
  const [featureUsage, setFeatureUsage] = useState<ARFeatureUsage[]>([]);
  const [capInput, setCapInput] = useState<string>('');
  const [unlimited, setUnlimited] = useState(false);

  if (!isUserAdmin(userData)) {
    return null;
  }

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      // Fetch AR budget settings from org_credit_balance
      const { data: balanceRow, error: balanceErr } = await supabase
        .from('org_credit_balance')
        .select('ar_monthly_cap, ar_paused')
        .eq('org_id', orgId)
        .maybeSingle();

      if (balanceErr) {
        console.error('[ARBudgetSettings] Balance fetch error:', balanceErr);
      }

      // Use check_ar_budget RPC for current usage
      const { data: budgetCheck } = await supabase.rpc('check_ar_budget', { p_org_id: orgId });

      const cap = balanceRow?.ar_monthly_cap ?? null;
      const paused = balanceRow?.ar_paused ?? false;
      const used = (budgetCheck as { used_this_month?: number } | null)?.used_this_month ?? 0;

      setData({ arMonthlyCap: cap, arPaused: paused, usedThisMonth: used });
      setUnlimited(cap === null);
      setCapInput(cap !== null ? String(cap) : '');

      // Fetch AR feature usage breakdown for this month
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const { data: txData } = await supabase
        .from('credit_transactions')
        .select('feature_key, amount')
        .eq('org_id', orgId)
        .eq('type', 'deduction')
        .like('feature_key', 'ar_%')
        .gte('created_at', monthStart.toISOString());

      // Aggregate by feature
      const featureMap = new Map<string, number>();
      for (const tx of txData ?? []) {
        const key = tx.feature_key ?? 'ar_unknown';
        featureMap.set(key, (featureMap.get(key) ?? 0) + Math.abs(tx.amount ?? 0));
      }

      setFeatureUsage(
        Array.from(featureMap.entries())
          .map(([key, amount]) => ({
            featureKey: key,
            label: AR_FEATURE_LABELS[key] ?? key,
            usedThisMonth: Math.round(amount * 100) / 100,
          }))
          .sort((a, b) => b.usedThisMonth - a.usedThisMonth)
      );
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveCap = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const newCap = unlimited ? null : (capInput ? parseInt(capInput, 10) : null);
      const { error } = await supabase
        .from('org_credit_balance')
        .update({ ar_monthly_cap: newCap })
        .eq('org_id', orgId);

      if (error) throw error;
      toast.success('AR budget cap updated');
      await fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePause = async () => {
    if (!orgId || !data) return;
    setSaving(true);
    try {
      const newPaused = !data.arPaused;
      const { error } = await supabase
        .from('org_credit_balance')
        .update({ ar_paused: newPaused })
        .eq('org_id', orgId);

      if (error) throw error;
      toast.success(newPaused ? 'Proactive agents paused' : 'Proactive agents resumed');
      setData((prev) => prev ? { ...prev, arPaused: newPaused } : null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No AR budget data available for this organization.
      </p>
    );
  }

  const { arMonthlyCap, arPaused, usedThisMonth } = data;
  const pct = arMonthlyCap ? Math.min((usedThisMonth / arMonthlyCap) * 100, 100) : 0;
  const approachingCap = pct >= 80;
  const atCap = pct >= 100;

  return (
    <div className="space-y-6">
      {/* Pause / Resume */}
      <div className="flex items-start justify-between gap-4 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
        <div>
          <p className="text-sm font-medium text-[#1E293B] dark:text-white">
            Proactive Agents
          </p>
          <p className="text-xs text-[#64748B] dark:text-gray-400 mt-0.5">
            {arPaused
              ? 'Autonomous research agents are currently paused and will not run.'
              : 'Autonomous research agents are running normally.'}
          </p>
        </div>
        <Button
          variant={arPaused ? 'default' : 'outline'}
          size="sm"
          onClick={handleTogglePause}
          disabled={saving}
          className="flex-shrink-0"
        >
          {arPaused ? (
            <>
              <PlayCircle className="mr-1.5 h-4 w-4" />
              Resume
            </>
          ) : (
            <>
              <PauseCircle className="mr-1.5 h-4 w-4" />
              Pause
            </>
          )}
        </Button>
      </div>

      {/* Monthly Cap */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-[#1E293B] dark:text-white">Monthly AR Credit Cap</p>
          <p className="text-xs text-[#64748B] dark:text-gray-400 mt-0.5">
            Limit how many creditsedits proactive agents can consume per month. Set to unlimited for no restriction.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { setUnlimited(true); setCapInput(''); }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors',
              unlimited
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
            )}
          >
            <Infinity className="h-3.5 w-3.5" />
            Unlimited
          </button>
          <button
            type="button"
            onClick={() => setUnlimited(false)}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md border transition-colors',
              !unlimited
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
            )}
          >
            Set limit
          </button>
        </div>

        {!unlimited && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={10000}
              step={10}
              value={capInput}
              onChange={(e) => setCapInput(e.target.value)}
              placeholder="e.g. 150"
              className="w-32"
            />
            <span className="text-sm text-[#64748B] dark:text-gray-400">credits / month</span>
            <Button size="sm" onClick={handleSaveCap} disabled={saving || !capInput}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="ml-1.5">Save</span>
            </Button>
          </div>
        )}

        {unlimited && (
          <Button size="sm" onClick={handleSaveCap} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="ml-1.5">Save (unlimited)</span>
          </Button>
        )}
      </div>

      {/* Usage this month */}
      {arMonthlyCap !== null && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[#1E293B] dark:text-white">AR Usage This Month</p>
            <span className={cn('text-sm font-medium tabular-nums', getProgressTextColor(pct))}>
              {usedThisMonth.toFixed(1)} / {arMonthlyCap} credits ({Math.round(pct)}%)
            </span>
          </div>

          <div className="h-2 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', getProgressColor(pct))}
              style={{ width: `${Math.max(pct, 0)}%` }}
            />
          </div>

          {atCap && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              Monthly AR creditsedit cap reached. Proactive agents are blocked until next month or cap is raised.
            </div>
          )}
          {!atCap && approachingCap && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              Approaching monthly AR cap ({Math.round(pct)}% used).
            </div>
          )}
        </div>
      )}

      {/* Feature breakdown */}
      {featureUsage.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-[#1E293B] dark:text-white">Usage by Agent Type</p>
          <div className="space-y-1.5">
            {featureUsage.map(({ featureKey, label, usedThisMonth: used }) => (
              <div key={featureKey} className="flex items-center justify-between text-sm">
                <span className="text-[#64748B] dark:text-gray-400">{label}</span>
                <span className="font-medium tabular-nums text-[#1E293B] dark:text-gray-200">
                  {used.toFixed(1)} credits
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {featureUsage.length === 0 && arMonthlyCap !== null && usedThisMonth === 0 && (
        <p className="text-xs text-[#64748B] dark:text-gray-400">
          No autonomous research activity this month.
        </p>
      )}
    </div>
  );
}
