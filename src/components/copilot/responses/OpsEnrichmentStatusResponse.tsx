import React from 'react';
import { Sparkles, CheckCircle2, AlertCircle, Clock, Loader2 } from 'lucide-react';
import type { QuickActionResponse } from '../types';

interface EnrichmentJob {
  id: string;
  column_id: string;
  column_name?: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  total_rows: number;
  processed_rows: number;
  failed_rows: number;
}

export interface OpsEnrichmentStatusResponseData {
  jobs: EnrichmentJob[];
  count: number;
  active_count: number;
}

interface OpsEnrichmentStatusResponseProps {
  data: OpsEnrichmentStatusResponseData;
  onActionClick?: (action: QuickActionResponse) => void;
}

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; bgColor: string; label: string }> = {
  queued: { icon: Clock, color: 'text-yellow-400', bgColor: 'bg-yellow-500/20', label: 'Queued' },
  running: { icon: Loader2, color: 'text-blue-400', bgColor: 'bg-blue-500/20', label: 'Running' },
  complete: { icon: CheckCircle2, color: 'text-green-400', bgColor: 'bg-green-500/20', label: 'Complete' },
  failed: { icon: AlertCircle, color: 'text-red-400', bgColor: 'bg-red-500/20', label: 'Failed' },
};

export const OpsEnrichmentStatusResponse: React.FC<OpsEnrichmentStatusResponseProps> = ({ data, onActionClick }) => {
  const { jobs } = data;

  if (!jobs || jobs.length === 0) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-3 text-gray-400">
          <Sparkles className="w-5 h-5" />
          <p className="text-sm">No enrichment jobs found for this table.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-white">
            Enrichment Status
          </h3>
          {data.active_count > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-xs text-blue-300">
              <Loader2 className="w-3 h-3 animate-spin" />
              {data.active_count} active
            </span>
          )}
        </div>
      </div>

      <div className="divide-y divide-gray-800/50">
        {jobs.map((job) => {
          const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.queued;
          const Icon = config.icon;
          const progress = job.total_rows > 0 ? Math.round((job.processed_rows / job.total_rows) * 100) : 0;

          return (
            <div key={job.id} className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`p-1 rounded ${config.bgColor}`}>
                    <Icon className={`w-3.5 h-3.5 ${config.color} ${job.status === 'running' ? 'animate-spin' : ''}`} />
                  </div>
                  <span className="text-sm text-white font-medium">
                    {job.column_name || `Column ${job.column_id.slice(0, 8)}`}
                  </span>
                  <span className={`text-xs ${config.color}`}>{config.label}</span>
                </div>
                <span className="text-xs text-gray-400">
                  {job.processed_rows}/{job.total_rows} rows
                  {job.failed_rows > 0 && (
                    <span className="text-red-400 ml-1">({job.failed_rows} failed)</span>
                  )}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    job.status === 'failed'
                      ? 'bg-red-500'
                      : job.status === 'complete'
                      ? 'bg-green-500'
                      : 'bg-blue-500'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OpsEnrichmentStatusResponse;
