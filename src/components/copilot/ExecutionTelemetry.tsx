/**
 * Execution Telemetry Component
 * Displays real-time telemetry from copilot tool executions
 * 
 * Story: POL-005
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  Database,
  Cpu,
  Zap,
  Server,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface TelemetryEvent {
  id: string;
  toolName: string;
  action?: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  capability?: string;
  provider?: string;
  metadata?: Record<string, unknown>;
}

interface ExecutionTelemetryProps {
  events: TelemetryEvent[];
  compact?: boolean;
  className?: string;
}

function getProviderIcon(provider?: string) {
  switch (provider) {
    case 'hubspot':
    case 'salesforce':
      return Database;
    case 'google':
    case 'gmail':
      return Server;
    case 'gemini':
      return Cpu;
    default:
      return Zap;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function TelemetryEventItem({ event, index }: { event: TelemetryEvent; index: number }) {
  const ProviderIcon = getProviderIcon(event.provider);
  
  const statusConfig = {
    pending: { color: 'text-gray-400', bgColor: 'bg-gray-500/10', icon: Clock },
    running: { color: 'text-blue-400', bgColor: 'bg-blue-500/10', icon: Activity },
    success: { color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', icon: CheckCircle2 },
    failed: { color: 'text-red-400', bgColor: 'bg-red-500/10', icon: XCircle },
  };
  
  const config = statusConfig[event.status];
  const StatusIcon = config.icon;
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        'flex items-center gap-3 p-2 rounded-lg',
        config.bgColor
      )}
    >
      <div className={cn('w-6 h-6 rounded-full flex items-center justify-center', config.bgColor)}>
        <StatusIcon className={cn('w-3.5 h-3.5', config.color)} />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200 truncate">
            {event.action || event.toolName}
          </span>
          {event.capability && (
            <Badge variant="outline" className="text-xs h-4 px-1">
              {event.capability}
            </Badge>
          )}
        </div>
        {event.provider && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <ProviderIcon className="w-3 h-3" />
            <span>{event.provider}</span>
          </div>
        )}
      </div>
      
      {event.durationMs !== undefined && (
        <div className="text-xs text-gray-500 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDuration(event.durationMs)}
        </div>
      )}
      
      {event.status === 'running' && (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Activity className="w-4 h-4 text-blue-400" />
        </motion.div>
      )}
    </motion.div>
  );
}

export function ExecutionTelemetry({ events, compact = false, className }: ExecutionTelemetryProps) {
  const successCount = events.filter(e => e.status === 'success').length;
  const failedCount = events.filter(e => e.status === 'failed').length;
  const totalDuration = events.reduce((sum, e) => sum + (e.durationMs || 0), 0);
  
  if (compact) {
    return (
      <div className={cn('flex items-center gap-2 text-xs', className)}>
        <Activity className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-gray-400">{events.length} tools</span>
        {successCount > 0 && (
          <span className="text-emerald-400">{successCount} ok</span>
        )}
        {failedCount > 0 && (
          <span className="text-red-400">{failedCount} failed</span>
        )}
        {totalDuration > 0 && (
          <span className="text-gray-500">{formatDuration(totalDuration)}</span>
        )}
      </div>
    );
  }
  
  return (
    <div className={cn('space-y-3', className)}>
      {/* Summary Header */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-gray-400">
          <Activity className="w-4 h-4" />
          <span>Execution Telemetry</span>
        </div>
        <div className="flex items-center gap-3">
          {successCount > 0 && (
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              {successCount}
            </span>
          )}
          {failedCount > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <XCircle className="w-3 h-3" />
              {failedCount}
            </span>
          )}
          {totalDuration > 0 && (
            <span className="flex items-center gap-1 text-gray-500">
              <Clock className="w-3 h-3" />
              {formatDuration(totalDuration)}
            </span>
          )}
        </div>
      </div>
      
      {/* Events List */}
      <div className="space-y-1">
        <AnimatePresence mode="popLayout">
          {events.map((event, index) => (
            <TelemetryEventItem key={event.id} event={event} index={index} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default ExecutionTelemetry;
