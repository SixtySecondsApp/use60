// src/pages/admin/ControlRoom.tsx
// Admin Control Room — fleet-level AI operations dashboard skeleton

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { toast } from 'sonner';
import {
  Activity,
  Bot,
  CreditCard,
  Inbox,
  BarChart3,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FleetPulse } from '@/components/control-room/FleetPulse';
import CreditHealth from '@/components/control-room/CreditHealth';
import AutonomyMatrix from '@/components/control-room/AutonomyMatrix';
import ActionFeed from '@/components/control-room/ActionFeed';
import { ROISummary } from '@/components/control-room/ROISummary';

// ============================================================================
// Widget zone definitions
// ============================================================================

interface WidgetZone {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  /** Tailwind col-span class (12-col grid) */
  colSpan: string;
}

const WIDGET_ZONES: WidgetZone[] = [
  {
    id: 'fleet-pulse',
    label: 'Fleet Pulse',
    description: 'Real-time status of all active agents across the team',
    icon: Bot,
    colSpan: 'col-span-12 md:col-span-6',
  },
  {
    id: 'autonomy-matrix',
    label: 'Autonomy Matrix',
    description: 'Per-user autonomy levels and policy overrides',
    icon: Activity,
    colSpan: 'col-span-12 md:col-span-6',
  },
  {
    id: 'credit-health',
    label: 'Credit Health',
    description: 'AI credit consumption, burn rate, and budget alerts',
    icon: CreditCard,
    colSpan: 'col-span-12 md:col-span-4',
  },
  {
    id: 'action-feed',
    label: 'Action Feed',
    description: 'Live feed of agent-initiated actions pending review or completed',
    icon: Inbox,
    colSpan: 'col-span-12 md:col-span-8',
  },
  {
    id: 'roi-summary',
    label: 'ROI Summary',
    description: 'Time saved, deals touched, and value delivered by AI today',
    icon: BarChart3,
    colSpan: 'col-span-12',
  },
];

// ============================================================================
// Component
// ============================================================================

export default function ControlRoom() {
  const navigate = useNavigate();
  const {
    isLoading: isPermissionsLoading,
    isOrgAdmin,
    isPlatformAdmin,
  } = useUserPermissions();
  const activeOrgId = useActiveOrgId();

  // Admin gate: org owners/admins and platform admins only
  useEffect(() => {
    if (isPermissionsLoading) return;

    const hasAccess = isOrgAdmin || isPlatformAdmin;
    if (!hasAccess) {
      toast.error('Access restricted to admins');
      navigate('/dashboard', { replace: true });
    }
  }, [isPermissionsLoading, isOrgAdmin, isPlatformAdmin, navigate]);

  // Show loading spinner while permissions are resolving
  if (isPermissionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
        <Loader2 className="w-8 h-8 text-[#37bd7e] animate-spin" />
      </div>
    );
  }

  // Don't render content while redirecting non-admins
  if (!isOrgAdmin && !isPlatformAdmin) {
    return null;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-white dark:bg-gray-950">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Control Room
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            What 60 did for your team today
          </p>
        </div>

        {/* 12-column responsive widget grid */}
        <div className="grid grid-cols-12 gap-4">
          {WIDGET_ZONES.map((zone) => {
            const Icon = zone.icon;
            return (
              <div key={zone.id} className={zone.colSpan}>
                <Card className="h-full min-h-[160px]">
                  <CardHeader className="flex flex-row items-center gap-2 pb-2">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <CardTitle className="text-sm font-semibold">
                      {zone.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {zone.id === 'fleet-pulse' ? (
                      <FleetPulse />
                    ) : zone.id === 'credit-health' ? (
                      <CreditHealth />
                    ) : zone.id === 'autonomy-matrix' && activeOrgId ? (
                      <AutonomyMatrix orgId={activeOrgId} />
                    ) : zone.id === 'action-feed' ? (
                      <ActionFeed />
                    ) : zone.id === 'roi-summary' ? (
                      <ROISummary />
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground mb-4">
                          {zone.description}
                        </p>
                        <div className="flex items-center justify-center h-16 rounded-md border border-dashed border-muted-foreground/25 bg-muted/30">
                          <span className="text-xs text-muted-foreground">
                            Coming soon
                          </span>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
