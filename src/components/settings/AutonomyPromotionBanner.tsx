// src/components/settings/AutonomyPromotionBanner.tsx
// Inline banner cards for pending autonomy promotion suggestions (PRD-24, GRAD-003)
// Displays in the Autonomy settings page with approve/dismiss actions.

import React from 'react';
import { TrendingUp, Check, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePromotionSuggestions, useApprovePromotion } from '@/lib/hooks/useAutonomyAnalytics';
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

export function AutonomyPromotionBanner() {
  const { data: promotions, isLoading } = usePromotionSuggestions();
  const approvePromotion = useApprovePromotion();

  const handleApprove = async (promotionId: string) => {
    try {
      await approvePromotion.mutateAsync({ promotionId, action: 'approve' });
      toast.success('Promotion applied. The agent will now auto-execute this action.');
    } catch {
      toast.error('Failed to apply promotion');
    }
  };

  const handleDismiss = async (promotionId: string) => {
    try {
      await approvePromotion.mutateAsync({ promotionId, action: 'reject' });
      toast.success('Promotion dismissed');
    } catch {
      toast.error('Failed to dismiss promotion');
    }
  };

  if (isLoading || !promotions || promotions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {promotions.map((promotion) => {
        const label = ACTION_LABELS[promotion.action_type] || promotion.action_type.replace(/_/g, ' ');
        const { approvalCount = 0, rejectionCount = 0, approvalRate = 0, windowDays = 30 } = promotion.evidence || {};

        return (
          <Card
            key={promotion.id}
            className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20"
          >
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-start gap-3">
                <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium text-sm">
                    {label}
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {approvalCount} approved, {rejectionCount} corrections in {windowDays} days ({approvalRate}% approval rate)
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {promotion.current_policy}
                    </Badge>
                    <span className="text-xs text-muted-foreground">&rarr;</span>
                    <Badge variant="default" className="text-xs">
                      {promotion.proposed_policy}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                <Button
                  size="sm"
                  onClick={() => handleApprove(promotion.id)}
                  disabled={approvePromotion.isPending}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDismiss(promotion.id)}
                  disabled={approvePromotion.isPending}
                >
                  <X className="h-4 w-4 mr-1" />
                  Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
