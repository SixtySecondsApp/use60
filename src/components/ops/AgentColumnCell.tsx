import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle, Play, ChevronDown, ExternalLink, Sparkles, Copy, CheckCheck, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase/clientV2';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentRunStatus = 'queued' | 'in_progress' | 'complete' | 'failed';
type DepthLevel = 'low' | 'medium' | 'high';
type Confidence = 'high' | 'medium' | 'low';

interface Source {
  url: string;
  title: string;
  provider: string;
}

interface ChainStep {
  step: number;
  provider: string;
  query?: string;
  results_count?: number;
  timestamp?: string;
  result?: string;
}

interface AgentRun {
  id: string;
  agent_column_id: string;
  row_id: string;
  status: AgentRunStatus;
  depth_level_used: DepthLevel;
  result_text: string | null;
  result_structured: Record<string, unknown> | null;
  sources: Source[] | null;
  providers_used: string[] | null;
  confidence: Confidence | null;
  token_cost: number | null;
  credit_cost: number | null;
  error_message: string | null;
  chain_log: ChainStep[] | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface AgentColumnCellProps {
  agentColumnId: string;
  rowId: string;
  onRun?: () => void;
  onRetry?: (depth?: DepthLevel) => void;
}

// ---------------------------------------------------------------------------
// Helper: Confidence Indicator
// ---------------------------------------------------------------------------

function ConfidenceDot({ confidence }: { confidence: Confidence | null }) {
  if (!confidence) return null;

  const colorClass = confidence === 'high'
    ? 'bg-green-500'
    : confidence === 'medium'
    ? 'bg-yellow-500'
    : 'bg-red-500';

  return (
    <div
      className={`w-2 h-2 rounded-full ${colorClass}`}
      title={`${confidence} confidence`}
    />
  );
}

// ---------------------------------------------------------------------------
// Expandable View Dialog
// ---------------------------------------------------------------------------

function AgentRunExpandedView({
  agentRun,
  onClose,
}: {
  agentRun: AgentRun;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (agentRun.result_text) {
      navigator.clipboard.writeText(agentRun.result_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-2xl mx-4 rounded-xl border border-gray-700/80 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-medium text-gray-200">Research Result</span>
            <ConfidenceDot confidence={agentRun.confidence} />
            {agentRun.confidence && (
              <span className="text-xs text-gray-500">
                {agentRun.confidence} confidence
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
              title="Copy to clipboard"
            >
              {copied ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-4 max-h-[70vh] overflow-y-auto">
          {/* Result Text */}
          <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
            {agentRun.result_text}
          </p>

          {/* Metadata */}
          <div className="mt-4 pt-3 border-t border-gray-800 space-y-2">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="font-medium text-gray-500">Depth:</span>
              <span className="px-2 py-0.5 rounded bg-violet-500/20 text-violet-300">
                {agentRun.depth_level_used}
              </span>
            </div>
            {agentRun.providers_used && agentRun.providers_used.length > 0 && (
              <div className="flex items-start gap-3 text-xs text-gray-400">
                <span className="font-medium text-gray-500 shrink-0">Providers:</span>
                <div className="flex flex-wrap gap-1">
                  {agentRun.providers_used.map((provider, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300"
                    >
                      {provider}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Chain Log (for High depth) */}
          {agentRun.chain_log && agentRun.chain_log.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-800">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">
                Research Steps ({agentRun.chain_log.length})
              </p>
              <div className="space-y-2">
                {agentRun.chain_log.map((step, i) => (
                  <div key={i} className="rounded-md border border-gray-800 p-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-violet-500/20 text-violet-400">
                        {step.step}
                      </span>
                      <span className="text-xs text-blue-300">{step.provider}</span>
                      {step.results_count !== undefined && (
                        <span className="text-[10px] text-gray-500">
                          {step.results_count} results
                        </span>
                      )}
                    </div>
                    {step.query && (
                      <p className="text-xs text-gray-400 mt-1">
                        <span className="text-gray-500">Query:</span> {step.query}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sources */}
          {agentRun.sources && agentRun.sources.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-800">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">
                Sources ({agentRun.sources.length})
              </p>
              <ul className="space-y-1.5">
                {agentRun.sources.map((src, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-gray-400">
                    <ExternalLink className="w-3 h-3 mt-0.5 shrink-0 text-gray-500" />
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-violet-300 transition-colors underline underline-offset-2 break-all"
                    >
                      {src.title || src.url}
                    </a>
                    <span className="text-[10px] text-gray-600 ml-auto shrink-0">
                      {src.provider}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Main Cell Component
// ---------------------------------------------------------------------------

export function AgentColumnCell({
  agentColumnId,
  rowId,
  onRun,
  onRetry,
}: AgentColumnCellProps) {
  const [expanded, setExpanded] = useState(false);
  const [showRetryMenu, setShowRetryMenu] = useState(false);

  // Fetch agent run data
  // Note: Realtime subscriptions are handled at the table level (OpsTable.tsx)
  // This query will be automatically invalidated when the run status changes
  const { data: agentRun, isLoading } = useQuery<AgentRun | null>({
    queryKey: ['agent_run', agentColumnId, rowId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_runs')
        .select('*')
        .eq('agent_column_id', agentColumnId)
        .eq('row_id', rowId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    // No polling needed - realtime subscriptions handle updates
    refetchInterval: false,
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center">
        <Loader2 className="w-3 h-3 animate-spin text-gray-500" />
      </div>
    );
  }

  // Empty state (not yet run)
  if (!agentRun) {
    return (
      <div className="w-full h-full flex items-center group/agent-empty">
        <span className="text-gray-600 text-xs italic">Not run</span>
        {onRun && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRun();
            }}
            className="ml-auto opacity-0 group-hover/agent-empty:opacity-100 transition-opacity p-0.5 rounded hover:bg-violet-500/20"
            title="Run research"
          >
            <Play className="w-3.5 h-3.5 text-violet-400" />
          </button>
        )}
      </div>
    );
  }

  // Queued state
  if (agentRun.status === 'queued') {
    return (
      <div className="w-full h-full flex items-center gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin text-yellow-400" />
        <span className="text-xs text-yellow-400">Queued</span>
      </div>
    );
  }

  // In progress state
  if (agentRun.status === 'in_progress') {
    const isHighDepth = agentRun.depth_level_used === 'high';
    const stepProgress = isHighDepth && agentRun.chain_log
      ? `${agentRun.chain_log.length}/${isHighDepth ? 3 : 1}`
      : null;

    return (
      <div className="w-full h-full flex items-center gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
        <span className="text-xs text-violet-400">
          {stepProgress ? `Researching ${stepProgress}` : 'Researching'}
        </span>
      </div>
    );
  }

  // Failed state
  if (agentRun.status === 'failed') {
    return (
      <div className="w-full h-full flex items-center gap-1.5 group/agent-fail">
        <AlertCircle className="w-3 h-3 text-red-400" />
        <span
          className="text-xs text-red-400 truncate cursor-pointer"
          title={agentRun.error_message ?? 'Failed'}
        >
          Failed
        </span>
        {onRetry && (
          <div className="ml-auto relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowRetryMenu(!showRetryMenu);
              }}
              className="opacity-0 group-hover/agent-fail:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-500/20 flex items-center gap-0.5"
              title="Retry"
            >
              <Play className="w-3 h-3 text-red-400" />
              <ChevronDown className="w-2.5 h-2.5 text-red-400" />
            </button>
            {showRetryMenu && (
              <div className="absolute top-full right-0 mt-1 z-20 min-w-[100px] rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry();
                    setShowRetryMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
                >
                  Same depth
                </button>
                <div className="my-1 border-t border-gray-700/60" />
                {(['low', 'medium', 'high'] as DepthLevel[])
                  .filter(d => d !== agentRun.depth_level_used)
                  .map((depth) => (
                    <button
                      key={depth}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRetry(depth);
                        setShowRetryMenu(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 capitalize"
                    >
                      Retry at {depth}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Complete state
  const displayText = agentRun.result_text
    ? agentRun.result_text.length > 100
      ? `${agentRun.result_text.slice(0, 100)}...`
      : agentRun.result_text
    : '—';

  return (
    <>
      <div
        className="w-full h-full flex items-center gap-1.5 cursor-pointer group/agent-complete"
        onClick={() => setExpanded(true)}
        title={agentRun.result_text ?? undefined}
      >
        <ConfidenceDot confidence={agentRun.confidence} />
        <span className="truncate text-sm text-gray-200 group-hover/agent-complete:text-violet-300 transition-colors">
          {displayText}
        </span>
        <ChevronDown className="w-3 h-3 text-gray-500 ml-auto shrink-0 opacity-0 group-hover/agent-complete:opacity-100 transition-opacity" />
      </div>
      {expanded && (
        <AgentRunExpandedView
          agentRun={agentRun}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  );
}

export default AgentColumnCell;
