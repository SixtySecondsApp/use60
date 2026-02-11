import React, { useMemo } from 'react';
import {
  Crosshair,
  FlaskConical,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import { useICPProfiles } from '@/lib/hooks/useICPProfilesCRUD';

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sublabel?: string;
  color: string;
}

function StatCard({ icon, label, value, sublabel, color }: StatCardProps) {
  return (
    <div className={`rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-4 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-none backdrop-blur-sm transition-all hover:border-${color}-500/30 dark:hover:border-${color}-500/20`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-medium text-[#64748B] dark:text-gray-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-[#1E293B] dark:text-gray-100">{value}</p>
      {sublabel && (
        <p className="mt-0.5 text-xs text-[#64748B] dark:text-gray-500">{sublabel}</p>
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
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={<Crosshair className="h-4 w-4 text-brand-blue" />}
        label="Total Profiles"
        value={stats.total}
        color="blue"
      />
      <StatCard
        icon={<FlaskConical className="h-4 w-4 text-brand-violet" />}
        label="Testing"
        value={stats.testing}
        color="violet"
      />
      <StatCard
        icon={<CheckCircle2 className="h-4 w-4 text-brand-teal" />}
        label="Approved / Active"
        value={stats.approved}
        color="teal"
      />
      <StatCard
        icon={<Zap className="h-4 w-4 text-amber-500" />}
        label="Tested This Week"
        value={stats.testedThisWeek}
        color="amber"
      />
    </div>
  );
}
