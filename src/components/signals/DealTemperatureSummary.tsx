/**
 * DealTemperatureSummary Component (SIG-012)
 *
 * Card showing deal temperature, top signal events, signal counts (24h/7d),
 * and trend description. Used in DealDetailSheet and any deal detail surface.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Clock, Mail, MessageSquare, Phone, TrendingDown, TrendingUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/clientV2';
import { DealTemperatureGauge } from './DealTemperatureGauge';

// =============================================================================
// Types
// =============================================================================

interface DealTemperatureSummaryProps {
  dealId: string;
  orgId: string;
}

interface DealTemperatureRow {
  deal_id: string;
  temperature: number;        // 0.0–1.0 in DB; display as 0–100
  trend: 'rising' | 'falling' | 'stable';
  last_signal: string | null;
  top_signals: Array<{
    type: string;
    description?: string;
    score_delta?: number;
    detected_at?: string;
  }> | null;
  signal_count_24h: number;
  signal_count_7d: number;
  updated_at: string;
}

interface EmailSignalEvent {
  id: string;
  signal_type: string;
  confidence: number | null;
  context: string | null;
  created_at: string;
}

// =============================================================================
// Helpers
// =============================================================================

function signalTypeLabel(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function signalTypeIcon(type: string): React.ElementType {
  if (type.includes('email') || type.includes('reply')) return Mail;
  if (type.includes('call') || type.includes('phone')) return Phone;
  if (type.includes('meeting') || type.includes('message')) return MessageSquare;
  return Activity;
}

function signalBadgeVariant(signalType: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (signalType.includes('positive') || signalType.includes('engaged') || signalType.includes('open')) {
    return 'default';
  }
  if (signalType.includes('negative') || signalType.includes('risk') || signalType.includes('ghost')) {
    return 'destructive';
  }
  return 'secondary';
}

// =============================================================================
// Component
// =============================================================================

export function DealTemperatureSummary({ dealId, orgId: _orgId }: DealTemperatureSummaryProps) {
  // Fetch temperature record
  const { data: tempData, isLoading: tempLoading } = useQuery({
    queryKey: ['deal_temperature', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_signal_temperature')
        .select(
          'deal_id, temperature, trend, last_signal, top_signals, signal_count_24h, signal_count_7d, updated_at'
        )
        .eq('deal_id', dealId)
        .maybeSingle();
      if (error) throw error;
      return data as DealTemperatureRow | null;
    },
    enabled: !!dealId,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch recent signal events
  const { data: signalEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ['deal_signal_events', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_signal_events')
        .select('id, signal_type, confidence, context, created_at')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as EmailSignalEvent[];
    },
    enabled: !!dealId,
    staleTime: 2 * 60 * 1000,
  });

  const isLoading = tempLoading || eventsLoading;

  if (isLoading) {
    return (
      <Card className="bg-white/60 dark:bg-white/[0.03] border-gray-200/80 dark:border-white/[0.06] backdrop-blur-xl">
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-32 rounded bg-gray-200 dark:bg-white/[0.06]" />
            <div className="h-8 w-full rounded bg-gray-200 dark:bg-white/[0.06]" />
            <div className="h-4 w-48 rounded bg-gray-200 dark:bg-white/[0.06]" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!tempData) {
    return (
      <Card className="bg-white/60 dark:bg-white/[0.03] border-gray-200/80 dark:border-white/[0.06] backdrop-blur-xl">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 text-sm">
            <Activity className="w-4 h-4 opacity-50" />
            <span>No temperature data yet — signals will appear once emails are tracked.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/60 dark:bg-white/[0.03] border-gray-200/80 dark:border-white/[0.06] backdrop-blur-xl">
      <CardContent className="p-4 space-y-4">
        {/* Temperature gauge */}
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
            Deal Temperature
          </h4>
          <DealTemperatureGauge
            temperature={Math.round((tempData.temperature ?? 0) * 100)}
            trend={tempData.trend}
            size="md"
          />
        </div>

        {/* Signal count stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.04]">
            <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">
              Last 24h
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[18px] font-bold text-gray-900 dark:text-gray-100 tabular-nums leading-none">
                {tempData.signal_count_24h ?? 0}
              </span>
              <span className="text-[11px] text-gray-400 dark:text-gray-500">signals</span>
            </div>
          </div>
          <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.04]">
            <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">
              Last 7d
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[18px] font-bold text-gray-900 dark:text-gray-100 tabular-nums leading-none">
                {tempData.signal_count_7d ?? 0}
              </span>
              <span className="text-[11px] text-gray-400 dark:text-gray-500">signals</span>
            </div>
          </div>
        </div>

        {/* Hot/cold signal breakdown */}
        <div className="flex items-center gap-3 text-[12px]">
          <div className="flex items-center gap-1 text-red-500 dark:text-red-400">
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="font-semibold tabular-nums">{tempData.signal_count_7d ?? 0}</span>
            <span className="text-gray-400 dark:text-gray-500">this week</span>
          </div>
          <div className="w-px h-3 bg-gray-200 dark:bg-white/[0.08]" />
          <div className="flex items-center gap-1 text-blue-500 dark:text-blue-400">
            <TrendingDown className="w-3.5 h-3.5" />
            <span className="font-semibold tabular-nums">{tempData.signal_count_24h ?? 0}</span>
            <span className="text-gray-400 dark:text-gray-500">today</span>
          </div>
          {tempData.last_signal && (
            <>
              <div className="w-px h-3 bg-gray-200 dark:bg-white/[0.08]" />
              <div className="flex items-center gap-1 text-gray-400 dark:text-gray-500">
                <Clock className="w-3 h-3" />
                <span>
                  {formatDistanceToNow(new Date(tempData.last_signal), { addSuffix: true })}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Recent signal events */}
        {signalEvents && signalEvents.length > 0 && (
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
              Recent Signals
            </h4>
            <div className="space-y-1.5">
              {signalEvents.map((event) => {
                const Icon = signalTypeIcon(event.signal_type);
                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg bg-gray-50/80 dark:bg-white/[0.02] border border-gray-100/80 dark:border-white/[0.03]"
                  >
                    <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant={signalBadgeVariant(event.signal_type)}
                          className="text-[9.5px] px-[5px] py-[1.5px] h-auto font-semibold"
                        >
                          {signalTypeLabel(event.signal_type)}
                        </Badge>
                        {event.confidence != null && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
                            {Math.round(event.confidence * 100)}% confidence
                          </span>
                        )}
                      </div>
                      {event.context && (
                        <p className="mt-0.5 text-[11px] text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed">
                          {event.context}
                        </p>
                      )}
                    </div>
                    <span className="text-[9.5px] text-gray-400 dark:text-gray-500 flex-shrink-0 tabular-nums whitespace-nowrap">
                      {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(!signalEvents || signalEvents.length === 0) && (
          <div className="text-center py-3 text-[11.5px] text-gray-400 dark:text-gray-500">
            No signal events recorded yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

