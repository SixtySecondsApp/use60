/**
 * SmartListeningSettings — Settings page for Smart Listening / Account Intelligence.
 *
 * Displays the WatchlistPanel (account management, frequency controls, cost projections)
 * within the standard settings page layout.
 */

import { PageContainer } from '@/components/layout/PageContainer';
import { WatchlistPanel } from '@/components/ops/WatchlistPanel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, Zap, Globe, MessageSquare } from 'lucide-react';
import { useAccountWatchlist } from '@/lib/hooks/useAccountWatchlist';
import { useIsOrgAdmin } from '@/contexts/UserPermissionsContext';

export default function SmartListeningSettings() {
  const isAdmin = useIsOrgAdmin();
  const { watchlist, aggregateCost } = useAccountWatchlist();

  return (
    <PageContainer maxWidth="4xl" className="py-8">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Smart Listening</h1>
            <Badge variant="secondary" className="text-xs">Beta</Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Monitor key accounts for job changes, funding events, news, and custom research signals.
            Signals are delivered to your Ops tables and Slack.
          </p>
        </div>

        {/* Cost Overview (admin only) */}
        {isAdmin && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Usage Overview</CardTitle>
              <CardDescription className="text-xs">
                Weekly credit consumption across all watched accounts in your organization.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground">Accounts Watched</p>
                  <p className="text-2xl font-bold">{watchlist.length}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Apollo Credits/Week</p>
                  <p className="text-2xl font-bold">{aggregateCost.apolloCreditsPerWeek}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">AI Cost/Week</p>
                  <p className="text-2xl font-bold">
                    {aggregateCost.totalCostPerWeek > 0
                      ? `$${aggregateCost.totalCostPerWeek.toFixed(2)}`
                      : '$0.00'}
                  </p>
                </div>
              </div>
              {aggregateCost.apolloCreditsPerWeek > 50 && (
                <div className="flex items-start gap-2 mt-4 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs dark:bg-amber-950/30 dark:border-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-300">High credit usage</p>
                    <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                      Your watchlist uses ~{aggregateCost.apolloCreditsPerWeek} Apollo credits/week.
                      Consider switching some accounts to weekly monitoring to reduce costs.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* How It Works */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <Zap className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Apollo Re-enrichment</p>
                  <p className="text-xs text-muted-foreground">
                    Re-enriches contacts and companies via Apollo to detect job changes, title changes, and company moves.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Globe className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Web Intelligence</p>
                  <p className="text-xs text-muted-foreground">
                    Scans the web for funding events, hiring surges, company news, and competitive mentions.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-lg">
                  <MessageSquare className="h-4 w-4 text-indigo-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Custom Research</p>
                  <p className="text-xs text-muted-foreground">
                    Run custom AI research prompts per account to track specific topics relevant to your deals.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* Watchlist Management */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Your Watchlist</h2>
          <WatchlistPanel />
        </div>
      </div>
    </PageContainer>
  );
}
