// src/components/settings/AutonomyProgressionDashboard.tsx
// Visual dashboard showing autonomy progression per action type (PRD-24, GRAD-005)

import React from 'react';
import { Shield, TrendingUp, TrendingDown, Clock, CheckCircle2, XCircle, Edit3 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAutonomyAnalytics, usePromotionSuggestions, useAutonomyAuditLog, useApprovePromotion } from '@/lib/hooks/useAutonomyAnalytics';
import { toast } from 'sonner';

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

const POLICY_BADGES: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  auto: { label: 'Auto', variant: 'default' },
  approve: { label: 'Approval Required', variant: 'secondary' },
  suggest: { label: 'Suggest Only', variant: 'outline' },
  disabled: { label: 'Disabled', variant: 'destructive' },
};

export function AutonomyProgressionDashboard() {
  const { data: analytics, isLoading: analyticsLoading } = useAutonomyAnalytics(30);
  const { data: promotions } = usePromotionSuggestions();
  const { data: auditLog } = useAutonomyAuditLog(10);
  const approvePromotion = useApprovePromotion();

  const totalActions = analytics?.reduce((sum, a) => sum + a.total_count, 0) || 0;
  const totalAutoApproved = analytics?.reduce((sum, a) => sum + a.auto_approved_count, 0) || 0;
  const avgApprovalRate = analytics && analytics.length > 0
    ? analytics.reduce((sum, a) => sum + a.approval_rate, 0) / analytics.length
    : 0;

  const handlePromotionAction = async (promotionId: string, action: 'approve' | 'reject' | 'snooze') => {
    try {
      await approvePromotion.mutateAsync({ promotionId, action });
      const messages = { approve: 'Promotion applied', reject: 'Promotion rejected', snooze: 'Snoozed for 30 days' };
      toast.success(messages[action]);
    } catch {
      toast.error('Failed to process promotion');
    }
  };

  if (analyticsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Agent Autonomy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalActions}</div>
            <p className="text-sm text-muted-foreground">Total Actions (30d)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalAutoApproved}</div>
            <p className="text-sm text-muted-foreground">Auto-Approved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{avgApprovalRate.toFixed(0)}%</div>
            <p className="text-sm text-muted-foreground">Avg Approval Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Promotion Suggestions */}
      {promotions && promotions.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <TrendingUp className="h-5 w-5" /> Promotion Suggestions
            </CardTitle>
            <CardDescription>These action types meet the criteria for increased autonomy</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {promotions.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                <div>
                  <div className="font-medium">{ACTION_LABELS[p.action_type] || p.action_type}</div>
                  <div className="text-sm text-muted-foreground">
                    {p.evidence.approvalCount} approved, {p.evidence.rejectionCount} corrections ({p.evidence.approvalRate}%)
                  </div>
                  <div className="text-sm">
                    {p.current_policy} <span className="mx-1">&rarr;</span> <span className="font-medium">{p.proposed_policy}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handlePromotionAction(p.id, 'approve')}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => handlePromotionAction(p.id, 'snooze')}>Snooze</Button>
                  <Button size="sm" variant="ghost" onClick={() => handlePromotionAction(p.id, 'reject')}>Reject</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Per-Action Analytics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Action Autonomy Levels</CardTitle>
          <CardDescription>Current autonomy policy and approval rates per action type</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {analytics?.map((a) => {
            const policyBadge = POLICY_BADGES[a.auto_approved_count > 0 ? 'auto' : 'approve'] || POLICY_BADGES.approve;
            return (
              <div key={a.action_type} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{ACTION_LABELS[a.action_type] || a.action_type}</span>
                    <Badge variant={policyBadge.variant}>{policyBadge.label}</Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> {a.approval_count}</span>
                    <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-500" /> {a.rejection_count}</span>
                    <span className="flex items-center gap-1"><Edit3 className="h-3 w-3 text-yellow-500" /> {a.edit_count}</span>
                  </div>
                </div>
                <div className="w-32">
                  <div className="text-sm text-right mb-1">{a.approval_rate}%</div>
                  <Progress value={a.approval_rate} className="h-2" />
                </div>
              </div>
            );
          })}
          {(!analytics || analytics.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No approval data yet. Analytics will appear as the agent processes actions.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Audit Log */}
      {auditLog && auditLog.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Autonomy History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {auditLog.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 text-sm py-2 border-b last:border-0">
                  {entry.change_type === 'promotion' ? (
                    <TrendingUp className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : entry.change_type === 'demotion' ? (
                    <TrendingDown className="h-4 w-4 text-red-500 flex-shrink-0" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <span className="font-medium">{ACTION_LABELS[entry.action_type] || entry.action_type}</span>
                    {entry.previous_policy && entry.new_policy && (
                      <span className="text-muted-foreground"> {entry.previous_policy} &rarr; {entry.new_policy}</span>
                    )}
                    {entry.trigger_reason && (
                      <div className="text-muted-foreground text-xs">{entry.trigger_reason}</div>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
