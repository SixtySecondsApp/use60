/**
 * MetricsComparison
 *
 * Post-race stats card comparing single-agent vs multi-agent performance.
 * Appears after both panels complete with a slide-up animation.
 */

import { motion } from 'framer-motion';
import { Zap, Wrench, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PanelMetrics } from './types';

interface MetricsComparisonProps {
  singleMetrics: PanelMetrics;
  multiMetrics: PanelMetrics;
}

export function MetricsComparison({ singleMetrics, multiMetrics }: MetricsComparisonProps) {
  const singleSec = singleMetrics.durationMs / 1000;
  const multiSec = multiMetrics.durationMs / 1000;
  const speedup = singleSec / multiSec;
  const faster = speedup > 1 ? 'multi' : 'single';
  const maxDuration = Math.max(singleSec, multiSec);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Race Results
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Speed comparison bars */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Execution Time
            </p>

            {/* Single agent bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Single Agent</span>
                <span className="tabular-nums font-medium">{singleSec.toFixed(1)}s</span>
              </div>
              <div className="h-6 bg-muted/50 rounded-sm overflow-hidden">
                <motion.div
                  className={`h-full rounded-sm ${faster === 'single' ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${(singleSec / maxDuration) * 100}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </div>
            </div>

            {/* Multi agent bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Multi-Agent</span>
                <span className="tabular-nums font-medium">{multiSec.toFixed(1)}s</span>
              </div>
              <div className="h-6 bg-muted/50 rounded-sm overflow-hidden">
                <motion.div
                  className={`h-full rounded-sm ${faster === 'multi' ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${(multiSec / maxDuration) * 100}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
                />
              </div>
            </div>
          </div>

          {/* Speedup callout */}
          {speedup > 1 && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.3 }}
              className="text-center py-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20"
            >
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {speedup.toFixed(1)}x faster
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Multi-agent completed {(singleSec - multiSec).toFixed(1)}s sooner
              </p>
            </motion.div>
          )}

          {/* Tool count comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wrench className="h-3 w-3" />
                Tools Used
              </div>
              <div className="flex gap-3">
                <div className="text-center">
                  <p className="text-lg font-bold">{singleMetrics.toolCount}</p>
                  <p className="text-[10px] text-muted-foreground">Single</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold">{multiMetrics.toolCount}</p>
                  <p className="text-[10px] text-muted-foreground">Multi</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                Agents Delegated
              </div>
              <div className="flex flex-wrap gap-1">
                {multiMetrics.agentsUsed.length > 0 ? (
                  multiMetrics.agentsUsed.map((agent) => (
                    <Badge key={agent} variant="outline" className="text-[10px]">
                      {agent}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">None</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
