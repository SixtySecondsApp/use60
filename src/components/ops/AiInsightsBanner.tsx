/**
 * OI-010: AI Insights Banner
 *
 * Displays dismissible insight cards with conversational text,
 * severity-colored borders, and action buttons.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useServices } from '@/lib/services/ServiceLocator';

interface AiInsightsBannerProps {
  tableId: string;
  onActionClick: (action: any) => void;
}

export function AiInsightsBanner({ tableId, onActionClick }: AiInsightsBannerProps) {
  const { opsTableService } = useServices();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);

  const { data: insights = [] } = useQuery({
    queryKey: ['ops-insights', tableId],
    queryFn: () => opsTableService.getActiveInsights(tableId),
    refetchInterval: 60000, // Refresh every minute
  });

  const dismissMutation = useMutation({
    mutationFn: (insightId: string) => opsTableService.dismissInsight(insightId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-insights', tableId] });
      toast.success('Insight dismissed');
    },
  });

  if (insights.length === 0) return null;

  const severityColors = {
    info: 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20',
    warning: 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/20',
    critical: 'border-l-red-500 bg-red-50 dark:bg-red-950/20',
  };

  const visibleInsights = expanded ? insights : insights.slice(0, 1);

  return (
    <div className="mb-4 space-y-2">
      {visibleInsights.map((insight: any) => (
        <div
          key={insight.id}
          className={`border-l-4 p-4 rounded-r-lg ${
            severityColors[insight.severity as keyof typeof severityColors]
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <h3 className="font-semibold text-sm">{insight.title}</h3>
              <p className="text-sm text-muted-foreground">{insight.body}</p>

              {insight.actions && insight.actions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {insight.actions.map((action: any, idx: number) => (
                    <Button
                      key={idx}
                      size="sm"
                      variant="outline"
                      onClick={() => onActionClick(action)}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => dismissMutation.mutate(insight.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}

      {insights.length > 1 && (
        <Button
          size="sm"
          variant="ghost"
          className="w-full"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-4 w-4 mr-2" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4 mr-2" />
              {insights.length - 1} more insights
            </>
          )}
        </Button>
      )}
    </div>
  );
}
