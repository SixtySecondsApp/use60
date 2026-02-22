// src/components/settings/ManagerAutonomyControls.tsx
// Manager controls for org-wide autonomy policies (PRD-24, GRAD-006)

import React, { useMemo, useState } from 'react';
import {
  Shield,
  Users,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAutonomyCeilings,
  useSetAutonomyCeiling,
  useRepAutonomyLevels,
  useSetRepAutonomyOverride,
  useTeamAutonomyAnalytics,
  type AutonomyLevel,
  type AutonomyCeiling,
} from '@/lib/hooks/useManagerAutonomy';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTION_TYPES = [
  { key: 'crm_stage_change', label: 'CRM Stage Changes', risk: 'high' },
  { key: 'crm_field_update', label: 'CRM Field Updates', risk: 'medium' },
  { key: 'crm_contact_create', label: 'Contact Creation', risk: 'medium' },
  { key: 'send_email', label: 'Email Sending', risk: 'high' },
  { key: 'send_slack', label: 'Slack Messages', risk: 'low' },
  { key: 'create_task', label: 'Task Creation', risk: 'low' },
  { key: 'enrich_contact', label: 'Contact Enrichment', risk: 'low' },
  { key: 'draft_proposal', label: 'Proposal Drafts', risk: 'medium' },
] as const;

const ACTION_LABELS: Record<string, string> = {
  crm_stage_change: 'CRM Stage Changes',
  crm_field_update: 'CRM Field Updates',
  crm_contact_create: 'Contact Creation',
  send_email: 'Email Sending',
  send_slack: 'Slack Messages',
  create_task: 'Task Creation',
  enrich_contact: 'Contact Enrichment',
  draft_proposal: 'Proposal Drafts',
};

const CEILING_LABELS: Record<string, string> = {
  suggest: 'Suggest Only',
  approve: 'Approval Required',
  auto: 'Auto-Execute',
  no_limit: 'No Limit',
  disabled: 'Disabled',
  default: 'Org Default',
};

const POLICY_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  auto: 'default',
  approve: 'secondary',
  suggest: 'outline',
  disabled: 'destructive',
  no_limit: 'default',
  default: 'outline',
};

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ManagerAutonomyControls() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Manager Autonomy Controls
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure org-wide autonomy policies, per-rep overrides, and review team analytics.
        </p>
      </div>

      <Tabs defaultValue="policies" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="policies" className="flex items-center gap-1.5">
            <Shield className="h-4 w-4" />
            Policies
          </TabsTrigger>
          <TabsTrigger value="reps" className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            Per-Rep View
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="mt-4">
          <PolicyCeilingsTab />
        </TabsContent>
        <TabsContent value="reps" className="mt-4">
          <RepAutonomyTab />
        </TabsContent>
        <TabsContent value="analytics" className="mt-4">
          <TeamAnalyticsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Policies Tab
// ---------------------------------------------------------------------------

function PolicyCeilingsTab() {
  const { data: ceilings, isLoading } = useAutonomyCeilings();
  const setCeiling = useSetAutonomyCeiling();

  const ceilingMap = useMemo(() => {
    const map = new Map<string, AutonomyCeiling>();
    for (const c of ceilings ?? []) {
      map.set(c.action_type, c);
    }
    return map;
  }, [ceilings]);

  const handleToggleEligible = (actionType: string, currentEligible: boolean) => {
    setCeiling.mutate({
      actionType,
      autoPromotionEligible: !currentEligible,
    });
  };

  const handleCeilingChange = (actionType: string, value: AutonomyLevel) => {
    setCeiling.mutate({
      actionType,
      maxCeiling: value,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Action Type Policies</CardTitle>
        <CardDescription>
          Control which actions are eligible for auto-promotion and set maximum autonomy ceilings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[220px]">Action</TableHead>
              <TableHead className="w-[160px] text-center">
                Eligible for Auto-Promotion
              </TableHead>
              <TableHead className="w-[180px]">Max Autonomy Ceiling</TableHead>
              <TableHead>Current Policy</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ACTION_TYPES.map((action) => {
              const ceiling = ceilingMap.get(action.key);
              const isEligible = ceiling?.auto_promotion_eligible ?? true;
              const maxCeiling = ceiling?.max_ceiling ?? 'no_limit';

              return (
                <TableRow key={action.key}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{action.label}</span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${RISK_COLORS[action.risk]}`}
                      >
                        {action.risk}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={isEligible}
                      onCheckedChange={() => handleToggleEligible(action.key, isEligible)}
                      disabled={setCeiling.isPending}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={maxCeiling}
                      onValueChange={(v) => handleCeilingChange(action.key, v as AutonomyLevel)}
                      disabled={setCeiling.isPending}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="suggest">Suggest Only</SelectItem>
                        <SelectItem value="approve">Approval Required</SelectItem>
                        <SelectItem value="auto">Auto-Execute</SelectItem>
                        <SelectItem value="no_limit">No Limit</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={POLICY_BADGE_VARIANT[maxCeiling] ?? 'outline'}>
                      {CEILING_LABELS[maxCeiling] ?? maxCeiling}
                    </Badge>
                    {!isEligible && (
                      <Badge variant="destructive" className="ml-2">
                        Locked
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Per-Rep View Tab
// ---------------------------------------------------------------------------

function RepAutonomyTab() {
  const { data: reps, isLoading } = useRepAutonomyLevels();
  const setOverride = useSetRepAutonomyOverride();

  // Group reps by user
  const repsByUser = useMemo(() => {
    const map = new Map<
      string,
      { user_id: string; email: string; full_name: string | null; policies: Map<string, string> }
    >();

    for (const rep of reps ?? []) {
      if (!map.has(rep.user_id)) {
        map.set(rep.user_id, {
          user_id: rep.user_id,
          email: rep.email,
          full_name: rep.full_name,
          policies: new Map(),
        });
      }
      if (rep.action_type !== '_none') {
        map.get(rep.user_id)!.policies.set(rep.action_type, rep.policy);
      }
    }

    return Array.from(map.values());
  }, [reps]);

  const handleOverrideChange = (userId: string, actionType: string, policy: string) => {
    setOverride.mutate({ userId, actionType, policy });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (repsByUser.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            No team members found. Autonomy levels will appear once your team starts using the AI
            agent.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {repsByUser.map((rep) => (
        <Card key={rep.user_id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {rep.full_name || rep.email || rep.user_id.slice(0, 8)}
            </CardTitle>
            {rep.full_name && <CardDescription>{rep.email}</CardDescription>}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Action</TableHead>
                  <TableHead className="w-[180px]">Autonomy Level</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ACTION_TYPES.map((action) => {
                  const currentPolicy = rep.policies.get(action.key) ?? 'default';
                  return (
                    <TableRow key={action.key}>
                      <TableCell className="font-medium">{action.label}</TableCell>
                      <TableCell>
                        <Select
                          value={currentPolicy}
                          onValueChange={(v) =>
                            handleOverrideChange(rep.user_id, action.key, v)
                          }
                          disabled={setOverride.isPending}
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">Org Default</SelectItem>
                            <SelectItem value="suggest">Suggest Only</SelectItem>
                            <SelectItem value="approve">Approval Required</SelectItem>
                            <SelectItem value="auto">Auto-Execute</SelectItem>
                            <SelectItem value="disabled">Disabled</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Badge variant={POLICY_BADGE_VARIANT[currentPolicy] ?? 'outline'}>
                          {CEILING_LABELS[currentPolicy] ?? currentPolicy}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team Analytics Tab
// ---------------------------------------------------------------------------

function TeamAnalyticsTab() {
  const [windowDays, setWindowDays] = useState(30);
  const { data, isLoading } = useTeamAutonomyAnalytics(windowDays);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const summary = data?.summary;
  const analytics = data?.analytics ?? [];

  return (
    <div className="space-y-4">
      {/* Window selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Team Autonomy Analytics</h3>
        <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v))}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{summary?.total_actions ?? 0}</div>
            <p className="text-sm text-muted-foreground">Total Actions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {summary?.approval_rate != null
                ? `${Number(summary.approval_rate).toFixed(0)}%`
                : '--'}
            </div>
            <p className="text-sm text-muted-foreground">Approval Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-green-500" />
              {summary?.promotions_count ?? 0}
            </div>
            <p className="text-sm text-muted-foreground">Promotions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-red-500" />
              {summary?.demotions_count ?? 0}
            </div>
            <p className="text-sm text-muted-foreground">Demotions</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-Action Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Per-Action Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          {analytics.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                No analytics data yet. Data will appear as the team processes actions.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {analytics.map((row) => (
                <div
                  key={row.action_type}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">
                      {ACTION_LABELS[row.action_type] ?? row.action_type}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span>{row.approved} approved</span>
                      <span>{row.rejected} rejected</span>
                      <span>{row.auto_approved} auto</span>
                    </div>
                  </div>
                  <div className="w-32 flex-shrink-0">
                    <div className="text-sm text-right mb-1">
                      {Number(row.approval_rate).toFixed(0)}%
                    </div>
                    <Progress value={Number(row.approval_rate)} className="h-2" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
