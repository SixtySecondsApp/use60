/**
 * PipelineInsightsCard Component (KNW-012)
 *
 * Shows active pipeline patterns as cards with severity badge, title,
 * description, affected deal count, and dismiss button.
 */

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Brain, AlertTriangle, AlertCircle, Info, X, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { toast } from 'sonner';

interface PipelineInsightsCardProps {
  limit?: number;
  onDealClick?: (dealId: string) => void;
}

interface PipelinePattern {
  id: string;
  pattern_type: string;
  title: string;
  description: string;
  confidence: number;
  severity: 'info' | 'warning' | 'critical';
  affected_deal_count: number | null;
  actionable_deals: Array<{ deal_id: string; name: string; recommended_action: string }>;
  supporting_evidence: Record<string, unknown>;
  created_at: string;
}

function severityConfig(severity: string) {
  switch (severity) {
    case 'critical':
      return { icon: AlertCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', badge: 'destructive' as const };
    case 'warning':
      return { icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30', badge: 'secondary' as const };
    default:
      return { icon: Info, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30', badge: 'outline' as const };
  }
}

function patternTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    stage_bottleneck: 'Bottleneck',
    velocity_anomaly: 'Velocity',
    engagement_correlation: 'Engagement',
    win_loss_factor: 'Win/Loss',
    rep_behavior: 'Behavior',
    objection_cluster: 'Objections',
  };
  return labels[type] || type.replace(/_/g, ' ');
}

export function PipelineInsightsCard({ limit = 5, onDealClick }: PipelineInsightsCardProps) {
  const orgId = useActiveOrgId();
  const queryClient = useQueryClient();

  const { data: patterns, isLoading } = useQuery({
    queryKey: ['pipeline-patterns', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.rpc('get_active_pipeline_patterns', {
        p_org_id: orgId,
        p_limit: limit,
      });
      if (error) throw error;
      return (data || []) as PipelinePattern[];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  const dismissMutation = useMutation({
    mutationFn: async (patternId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('dismiss_pipeline_pattern', {
        p_pattern_id: patternId,
        p_user_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-patterns'] });
      toast.success('Pattern dismissed');
    },
    onError: () => {
      toast.error('Failed to dismiss pattern');
    },
  });

  if (isLoading || !patterns?.length) return null;

  return (
    <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl border-white/20 dark:border-white/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Brain className="h-4 w-4 text-purple-500" />
          Pipeline Insights
          <Badge variant="secondary" className="text-[10px]">
            {patterns.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {patterns.map((pattern) => {
          const config = severityConfig(pattern.severity);
          const SeverityIcon = config.icon;

          return (
            <div key={pattern.id} className={`p-3 rounded-lg ${config.bg} border border-white/10`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <SeverityIcon className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{pattern.title}</span>
                      <Badge variant={config.badge} className="text-[10px] px-1 py-0">
                        {patternTypeLabel(pattern.pattern_type)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {pattern.description}
                    </p>

                    {/* Actionable deals */}
                    {pattern.actionable_deals?.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {pattern.actionable_deals.slice(0, 3).map((deal) => (
                          <button
                            key={deal.deal_id}
                            className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            onClick={() => onDealClick?.(deal.deal_id)}
                          >
                            <ChevronRight className="h-3 w-3" />
                            <span className="font-medium">{deal.name}</span>
                            <span className="text-muted-foreground">— {deal.recommended_action}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissMutation.mutate(pattern.id);
                  }}
                  disabled={dismissMutation.isPending}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                <span>Confidence: {Math.round(pattern.confidence * 100)}%</span>
                {pattern.affected_deal_count != null && (
                  <span>{pattern.affected_deal_count} deal{pattern.affected_deal_count !== 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
