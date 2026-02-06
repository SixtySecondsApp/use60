/**
 * OI-010: AI Insights Banner
 *
 * Displays dismissible insight cards with conversational text,
 * severity-colored borders, and action buttons.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

  // OI-033: Also fetch predictions
  const { data: predictions = [] } = useQuery({
    queryKey: ['ops-predictions', tableId],
    queryFn: () => opsTableService.getActivePredictions(tableId),
    refetchInterval: 120000, // Refresh every 2 minutes
  });

  const dismissMutation = useMutation({
    mutationFn: (insightId: string) => opsTableService.dismissInsight(insightId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-insights', tableId] });
      toast.success('Insight dismissed');
    },
  });

  const dismissPredictionMutation = useMutation({
    mutationFn: (predictionId: string) => opsTableService.dismissPrediction(predictionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-predictions', tableId] });
      toast.success('Prediction dismissed');
    },
  });

  // Combine insights and predictions, sort by confidence/severity
  const allItems = [
    ...insights.map((i: any) => ({ ...i, itemType: 'insight' })),
    ...predictions.map((p: any) => ({ ...p, itemType: 'prediction' })),
  ].sort((a, b) => {
    // Sort predictions by confidence, insights by severity
    if (a.itemType === 'prediction' && b.itemType === 'prediction') {
      return b.confidence - a.confidence;
    }
    return 0;
  });

  if (allItems.length === 0) return null;

  const severityColors = {
    info: 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20',
    warning: 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/20',
    critical: 'border-l-red-500 bg-red-50 dark:bg-red-950/20',
  };

  const visibleItems = expanded ? allItems : allItems.slice(0, 1);

  const getConfidenceColor = (confidence: number) => {
    if (confidence > 0.8) return 'text-green-600';
    if (confidence > 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="mb-4 space-y-2">
      {visibleItems.map((item: any) => (
        <div
          key={item.id}
          className={`border-l-4 p-4 rounded-r-lg ${
            item.itemType === 'prediction'
              ? 'border-l-purple-500 bg-purple-50 dark:bg-purple-950/20'
              : severityColors[item.severity as keyof typeof severityColors]
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">{item.title}</h3>
                {item.itemType === 'prediction' && (
                  <Badge variant="outline" className={getConfidenceColor(item.confidence)}>
                    {Math.round(item.confidence * 100)}% confidence
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {item.body || item.reasoning}
              </p>

              {(item.actions || item.suggested_actions) && (
                <div className="flex flex-wrap gap-2">
                  {(item.actions || item.suggested_actions).map((action: any, idx: number) => (
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
              onClick={() => {
                if (item.itemType === 'prediction') {
                  dismissPredictionMutation.mutate(item.id);
                } else {
                  dismissMutation.mutate(item.id);
                }
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}

      {allItems.length > 1 && (
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
              {allItems.length - 1} more {insights.length > 0 && predictions.length > 0 ? 'insights & predictions' : allItems[0].itemType === 'prediction' ? 'predictions' : 'insights'}
            </>
          )}
        </Button>
      )}
    </div>
  );
}
