// src/components/settings/ManagerAutonomyControls.tsx
// Manager controls for org-wide autonomy ceilings, promotion eligibility, and team analytics (PRD-24, GRAD-006)

import React, { useMemo } from 'react';
import { Shield, TrendingUp, TrendingDown, Users, Lock, Unlock, ArrowUpDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  usePolicyCeilings,
  useUpdatePolicyCeiling,
  useTeamAutonomyStats,
  useUserAutonomyOverrides,
} from '@/lib/hooks/useManagerAutonomy';
import { useOrgMembers } from '@/lib/hooks/useOrgMembers';
import { toast } from 'sonner';

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

const POLICY_LEVELS = [
  { value: 'auto', label: 'Auto' },
  { value: 'approve', label: 'Approval Required' },
  { value: 'suggest', label: 'Suggest Only' },
  { value: 'disabled', label: 'Disabled' },
] as const;

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export function ManagerAutonomyControls() {
  const { data: ceilings, isLoading: ceilingsLoading } = usePolicyCeilings();
  const { data: teamStats, isLoading: statsLoading } = useTeamAutonomyStats(30);
  const { data: userOverrides } = useUserAutonomyOverrides();
  const { data: orgMembers } = useOrgMembers();
  const updateCeiling = useUpdatePolicyCeiling();

  const ceilingMap = useMemo(() => {
    const map: Record<string, { maxCeiling: string; autoPromotionEligible: boolean }> = {};
    for (const c of ceilings || []) {
      map[c.action_type] = {
        maxCeiling: c.max_ceiling,
        autoPromotionEligible: c.auto_promotion_eligible,
      };
    }
    return map;
  }, [ceilings]);

  const memberMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of orgMembers || []) {
      map[m.user_id] = m.name || m.email;
    }
    return map;
  }, [orgMembers]);

  const overridesByUser = useMemo(() => {
    const map: Record<string, Array<{ action_type: string; policy: string }>> = {};
    for (const o of userOverrides || []) {
      if (!map[o.user_id]) map[o.user_id] = [];
      map[o.user_id].push({ action_type: o.action_type, policy: o.policy });
    }
    return map;
  }, [userOverrides]);

  const handleCeilingChange = async (actionType: string, maxCeiling: string) => {
    try {
      await updateCeiling.mutateAsync({ actionType, maxCeiling });
      toast.success(`Max ceiling updated for ${actionType}`);
    } catch {
      toast.error('Failed to update ceiling');
    }
  };

  const handlePromotionToggle = async (actionType: string, eligible: boolean) => {
    try {
      await updateCeiling.mutateAsync({ actionType, autoPromotionEligible: eligible });
      toast.success(eligible ? 'Auto-promotion enabled' : 'Auto-promotion disabled');
    } catch {
      toast.error('Failed to update promotion eligibility');
    }
  };

  return (
    <div className="space-y-6">
      {/* Org-Level Team Analytics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Team Autonomy Overview
          </CardTitle>
          <CardDescription>Org-wide approval rates and promotion velocity (30 days)</CardDescription>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-4 bg-muted rounded w-1/2" />
            </div>
          ) : teamStats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <div className="text-2xl font-bold">{teamStats.total_actions}</div>
                  <p className="text-sm text-muted-foreground">Total Actions</p>
                </div>
                <div>
                  <div className="text-2xl font-bold">{teamStats.approval_rate}%</div>
                  <p className="text-sm text-muted-foreground">Approval Rate</p>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{teamStats.promotions_count}</div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> Promotions
                  </p>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">{teamStats.demotions_count}</div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <TrendingDown className="h-3 w-3" /> Demotions
                  </p>
                </div>
              </div>

              {/* Per-user stats */}
              {teamStats.per_user && teamStats.per_user.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Per-Rep Breakdown</h4>
                  {teamStats.per_user.map((user) => (
                    <div key={user.user_id} className="flex items-center justify-between p-2 border rounded-lg">
                      <div className="flex-1">
                        <span className="text-sm font-medium">
                          {memberMap[user.user_id] || user.user_id.slice(0, 8)}
                        </span>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>{user.total_actions} actions</span>
                          <span className="text-green-600">{user.approved} approved</span>
                          <span className="text-red-600">{user.rejected} rejected</span>
                          <span>{user.auto_approved} auto</span>
                        </div>
                      </div>
                      <div className="w-24">
                        <div className="text-sm text-right mb-1">{user.approval_rate}%</div>
                        <Progress value={user.approval_rate} className="h-1.5" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No team analytics data yet. Data appears as the agent processes actions.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Auto-Promotion Eligibility & Ceilings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" /> Promotion Ceilings & Eligibility
          </CardTitle>
          <CardDescription>
            Control which actions can be auto-promoted and the maximum autonomy level they can reach
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ceilingsLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-4 bg-muted rounded w-1/2" />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Header */}
              <div className="grid grid-cols-[1fr_140px_100px] gap-4 pb-2 border-b text-sm font-medium text-muted-foreground">
                <span>Action Type</span>
                <span className="text-center">Max Ceiling</span>
                <span className="text-center">Auto-Promote</span>
              </div>

              {ACTION_TYPES.map((action) => {
                const ceiling = ceilingMap[action.key];
                const currentCeiling = ceiling?.maxCeiling || 'approve';
                const isEligible = ceiling?.autoPromotionEligible ?? false;

                return (
                  <div
                    key={action.key}
                    className="grid grid-cols-[1fr_140px_100px] gap-4 items-center py-2 border-b last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{action.label}</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${RISK_COLORS[action.risk]}`}>
                        {action.risk}
                      </span>
                    </div>
                    <Select
                      value={currentCeiling}
                      onValueChange={(value) => handleCeilingChange(action.key, value)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {POLICY_LEVELS.map((level) => (
                          <SelectItem key={level.value} value={level.value}>
                            {level.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex justify-center">
                      <Switch
                        checked={isEligible}
                        onCheckedChange={(checked) => handlePromotionToggle(action.key, checked)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-Rep Autonomy Overrides */}
      {Object.keys(overridesByUser).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpDown className="h-5 w-5" /> Per-Rep Overrides
            </CardTitle>
            <CardDescription>
              Users who have set personal autonomy overrides
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(overridesByUser).map(([userId, overrides]) => (
              <div key={userId} className="p-3 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium">
                    {memberMap[userId] || userId.slice(0, 8)}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {overrides.length} override{overrides.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {overrides.map((o) => {
                    const actionDef = ACTION_TYPES.find((a) => a.key === o.action_type);
                    return (
                      <Badge key={o.action_type} variant="outline" className="text-xs">
                        {actionDef?.label || o.action_type}: {o.policy}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
