/**
 * WatchlistPanel — Smart Listening watchlist management.
 *
 * Shows all watched accounts with per-account frequency/source controls
 * and cost-aware warnings when increasing monitoring intensity.
 */

import { useState } from 'react';
import {
  Eye, EyeOff, Trash2, AlertTriangle, Building2, User, Zap,
  Globe, MessageSquare, ChevronDown, RefreshCw, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  useAccountWatchlist,
  useAccountSignals,
  estimateCostPerWeek,
  type AccountWatchlistEntry,
  type MonitorFrequency,
} from '@/lib/hooks/useAccountWatchlist';
import { AccountSignalTimeline } from './AccountSignalTimeline';
import { supabase } from '@/lib/supabase/clientV2';

// ---------------------------------------------------------------------------
// Cost warning thresholds
// ---------------------------------------------------------------------------

const FREQUENCY_LABELS: Record<MonitorFrequency, string> = {
  weekly: 'Weekly (Mondays)',
  twice_weekly: 'Twice weekly (Mon & Thu)',
  daily: 'Daily',
};

const COST_WARNINGS: Record<MonitorFrequency, string | null> = {
  weekly: null,
  twice_weekly: 'This will use ~2x Apollo credits per account',
  daily: 'This will use ~7x Apollo credits per account. Estimated: ~7 credits/week per account.',
};

// ---------------------------------------------------------------------------
// WatchlistEntryCard
// ---------------------------------------------------------------------------

function WatchlistEntryCard({
  entry,
  onUpdate,
  onRemove,
  onRefresh,
}: {
  entry: AccountWatchlistEntry;
  onUpdate: (params: { watchlistId: string; monitorFrequency?: MonitorFrequency; enabledSources?: string[]; customResearchPrompt?: string | null }) => void;
  onRemove: (id: string) => void;
  onRefresh: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pendingFrequency, setPendingFrequency] = useState<MonitorFrequency | null>(null);
  const { data: signals, isLoading: signalsLoading } = useAccountSignals(expanded ? entry.id : undefined);

  const name = entry.account_type === 'company'
    ? entry.companies?.name ?? 'Unknown Company'
    : `${entry.contacts?.first_name ?? ''} ${entry.contacts?.last_name ?? ''}`.trim() || 'Unknown Contact';

  const Icon = entry.account_type === 'company' ? Building2 : User;
  const cost = estimateCostPerWeek(entry.monitor_frequency as MonitorFrequency, entry.enabled_sources);

  const handleFrequencyChange = (freq: MonitorFrequency) => {
    const warning = COST_WARNINGS[freq];
    if (warning && freq !== entry.monitor_frequency) {
      setPendingFrequency(freq);
    } else {
      onUpdate({ watchlistId: entry.id, monitorFrequency: freq });
    }
  };

  const confirmFrequencyChange = () => {
    if (pendingFrequency) {
      onUpdate({ watchlistId: entry.id, monitorFrequency: pendingFrequency });
      setPendingFrequency(null);
    }
  };

  const toggleSource = (source: string, enabled: boolean) => {
    const sources = enabled
      ? [...entry.enabled_sources, source]
      : entry.enabled_sources.filter(s => s !== source);
    onUpdate({ watchlistId: entry.id, enabledSources: sources });
  };

  return (
    <Card className="mb-2">
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{name}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{FREQUENCY_LABELS[entry.monitor_frequency as MonitorFrequency] ?? entry.monitor_frequency}</span>
            {entry.source === 'deal_auto' && entry.deals && (
              <Badge variant="secondary" className="text-[9px]">
                from deal: {entry.deals.name}
              </Badge>
            )}
            {entry.last_checked_at && (
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                Last: {new Date(entry.last_checked_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={(e) => { e.stopPropagation(); onRefresh(entry.id); }}
            title="Refresh now"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {expanded && (
        <CardContent className="pt-0 pb-3 px-3 border-t">
          <div className="space-y-3 mt-3">
            {/* Frequency */}
            <div className="flex items-center justify-between">
              <Label className="text-xs">Check frequency</Label>
              <Select
                value={entry.monitor_frequency}
                onValueChange={(v) => handleFrequencyChange(v as MonitorFrequency)}
              >
                <SelectTrigger className="w-[180px] h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly (Mondays)</SelectItem>
                  <SelectItem value="twice_weekly">Twice weekly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sources */}
            <div className="space-y-2">
              <Label className="text-xs">Signal sources</Label>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs">Apollo (contacts & companies)</span>
                </div>
                <Switch
                  checked={entry.enabled_sources.includes('apollo')}
                  onCheckedChange={(v) => toggleSource('apollo', v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-xs">Web intelligence</span>
                  <span className="text-[10px] text-muted-foreground">~$0.05/check</span>
                </div>
                <Switch
                  checked={entry.enabled_sources.includes('web_intel')}
                  onCheckedChange={(v) => toggleSource('web_intel', v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-indigo-500" />
                  <span className="text-xs">Custom research prompt</span>
                  <span className="text-[10px] text-muted-foreground">~$0.05/check</span>
                </div>
                <Switch
                  checked={entry.enabled_sources.includes('custom_prompt')}
                  onCheckedChange={(v) => toggleSource('custom_prompt', v)}
                />
              </div>

              {entry.enabled_sources.includes('custom_prompt') && (
                <Textarea
                  className="text-xs h-16 mt-1"
                  placeholder="e.g. Alert me if they post new engineering job openings"
                  value={entry.custom_research_prompt ?? ''}
                  onChange={(e) => onUpdate({
                    watchlistId: entry.id,
                    customResearchPrompt: e.target.value || null,
                  })}
                />
              )}
            </div>

            {/* Cost summary */}
            <div className="bg-muted/50 rounded-md p-2 text-xs text-muted-foreground">
              Est. weekly: {cost.apolloCreditsPerWeek} Apollo credit{cost.apolloCreditsPerWeek !== 1 ? 's' : ''}
              {cost.totalCostPerWeek > 0 && ` + $${cost.totalCostPerWeek.toFixed(2)} AI`}
            </div>

            {/* Signals timeline */}
            <div>
              <Label className="text-xs mb-1 block">Recent signals</Label>
              <AccountSignalTimeline
                signals={signals ?? []}
                isLoading={signalsLoading}
                compact
                maxItems={3}
                nextCheckAt={entry.next_check_at}
              />
            </div>

            {/* Remove */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs text-destructive w-full">
                  <Trash2 className="h-3 w-3 mr-1" /> Remove from watchlist
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove from watchlist?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will stop monitoring {name}. Existing signals will be preserved.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onRemove(entry.id)}>Remove</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Cost increase confirmation dialog */}
          {pendingFrequency && (
            <AlertDialog open={!!pendingFrequency} onOpenChange={() => setPendingFrequency(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Increase monitoring frequency?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {COST_WARNINGS[pendingFrequency]}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setPendingFrequency(null)}>Keep {FREQUENCY_LABELS[entry.monitor_frequency as MonitorFrequency]}</AlertDialogCancel>
                  <AlertDialogAction onClick={confirmFrequencyChange}>
                    Confirm {FREQUENCY_LABELS[pendingFrequency]}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main WatchlistPanel
// ---------------------------------------------------------------------------

export function WatchlistPanel() {
  const {
    watchlist,
    isLoadingWatchlist,
    aggregateCost,
    updateWatchlistEntry,
    removeFromWatchlist,
    unreadSignalCount,
  } = useAccountWatchlist();

  const handleRefresh = async (watchlistId: string) => {
    const { error } = await supabase.functions.invoke('account-monitor', {
      body: { watchlist_id: watchlistId },
    });
    if (error) {
      const { toast } = await import('sonner');
      toast.error('Failed to refresh account');
    } else {
      const { toast } = await import('sonner');
      toast.success('Account refreshed — checking for signals');
    }
  };

  return (
    <div className="space-y-4">
      {/* Overview stats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Smart Listening
            {unreadSignalCount > 0 && (
              <Badge variant="destructive" className="text-xs">{unreadSignalCount} new</Badge>
            )}
          </CardTitle>
          <CardDescription className="text-xs">
            Monitors your key accounts weekly for job changes, funding, news, and custom research.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{watchlist.length}</p>
              <p className="text-xs text-muted-foreground">Accounts watched</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{unreadSignalCount}</p>
              <p className="text-xs text-muted-foreground">Unread signals</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {aggregateCost.apolloCreditsPerWeek}
                {aggregateCost.totalCostPerWeek > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">
                    +${aggregateCost.totalCostPerWeek.toFixed(0)}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">Credits/week</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Watchlist entries */}
      {isLoadingWatchlist ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <Card key={i} className="p-3">
              <div className="flex gap-3 animate-pulse">
                <div className="h-4 w-4 rounded bg-muted" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-1/3 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : watchlist.length === 0 ? (
        <Card className="p-6 text-center">
          <EyeOff className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No accounts being watched yet. Add accounts from your Ops tables or deals.
          </p>
        </Card>
      ) : (
        <div>
          {watchlist.map(entry => (
            <WatchlistEntryCard
              key={entry.id}
              entry={entry}
              onUpdate={updateWatchlistEntry}
              onRemove={removeFromWatchlist}
              onRefresh={handleRefresh}
            />
          ))}
        </div>
      )}

      {/* Aggregate cost warning */}
      {aggregateCost.apolloCreditsPerWeek > 50 && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs">
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">High credit usage</p>
            <p className="text-amber-700 mt-0.5">
              Your watchlist uses ~{aggregateCost.apolloCreditsPerWeek} Apollo credits/week.
              Consider switching some accounts to weekly monitoring.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
