import React, { useMemo } from 'react';
import {
  Crosshair,
  FlaskConical,
  CheckCircle2,
  BarChart3,
  Zap,
} from 'lucide-react';
import { useICPProfiles } from '@/lib/hooks/useICPProfilesCRUD';
import type { ICPStatus } from '@/lib/types/prospecting';

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sublabel?: string;
}

function StatCard({ icon, label, value, sublabel }: StatCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-gray-900 dark:text-zinc-100">{value}</p>
      {sublabel && (
        <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-500">{sublabel}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProspectingDashboardProps {
  orgId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProspectingDashboard({ orgId }: ProspectingDashboardProps) {
  const { data: profiles } = useICPProfiles(orgId);

  const stats = useMemo(() => {
    if (!profiles || profiles.length === 0) {
      return { total: 0, draft: 0, testing: 0, approved: 0, active: 0, testedThisWeek: 0 };
    }

    const byStatus: Record<string, number> = {};
    for (const p of profiles) {
      byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    }

    // Profiles tested within last 7 days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const testedThisWeek = profiles.filter(
      (p) => p.last_tested_at && new Date(p.last_tested_at) >= weekAgo
    ).length;

    return {
      total: profiles.length,
      draft: byStatus['draft'] || 0,
      testing: byStatus['testing'] || 0,
      approved: (byStatus['approved'] || 0) + (byStatus['active'] || 0),
      active: byStatus['active'] || 0,
      testedThisWeek,
    };
  }, [profiles]);

  if (stats.total === 0) return null;

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
      <StatCard
        icon={<Crosshair className="h-4 w-4 text-blue-500" />}
        label="Total Profiles"
        value={stats.total}
      />
      <StatCard
        icon={<div className="h-2.5 w-2.5 rounded-full bg-gray-400" />}
        label="Draft"
        value={stats.draft}
      />
      <StatCard
        icon={<FlaskConical className="h-4 w-4 text-blue-400" />}
        label="Testing"
        value={stats.testing}
      />
      <StatCard
        icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
        label="Approved / Active"
        value={stats.approved}
      />
      <StatCard
        icon={<Zap className="h-4 w-4 text-amber-500" />}
        label="Tested This Week"
        value={stats.testedThisWeek}
      />
    </div>
  );
}
