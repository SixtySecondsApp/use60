/**
 * ProposalPanel — Copilot response type for generated proposals (generate-proposal-v2).
 * Shows PDF thumbnail, proposal details, status indicator, and quick actions.
 *
 * Actions emit via onActionClick — never direct navigation or window.open.
 */

import React from 'react';
import {
  FileText,
  Download,
  Pencil,
  RefreshCw,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MailCheck,
  Building2,
  Coins,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProposalPanelResponse as ProposalPanelResponseType, QuickActionResponse } from '../types';

interface Props {
  data: ProposalPanelResponseType;
  onActionClick?: (action: QuickActionResponse) => void;
}

// ---------------------------------------------------------------------------
// Status configuration
// ---------------------------------------------------------------------------

type ProposalStatus = 'generating' | 'assembling' | 'composing' | 'rendering' | 'ready' | 'sent' | 'failed';

const STATUS_CONFIG: Record<
  ProposalStatus,
  { label: string; icon: React.ElementType; badgeClass: string; iconClass: string; isGenerating: boolean }
> = {
  generating: {
    label: 'Generating...',
    icon: Loader2,
    badgeClass: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    iconClass: 'text-blue-400 animate-spin',
    isGenerating: true,
  },
  assembling: {
    label: 'Assembling...',
    icon: Loader2,
    badgeClass: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    iconClass: 'text-blue-400 animate-spin',
    isGenerating: true,
  },
  composing: {
    label: 'Writing...',
    icon: Loader2,
    badgeClass: 'bg-violet-500/15 text-violet-400 border border-violet-500/30',
    iconClass: 'text-violet-400 animate-spin',
    isGenerating: true,
  },
  rendering: {
    label: 'Rendering PDF...',
    icon: Loader2,
    badgeClass: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    iconClass: 'text-amber-400 animate-spin',
    isGenerating: true,
  },
  ready: {
    label: 'Ready',
    icon: CheckCircle2,
    badgeClass: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    iconClass: 'text-emerald-400',
    isGenerating: false,
  },
  sent: {
    label: 'Sent',
    icon: MailCheck,
    badgeClass: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
    iconClass: 'text-purple-400',
    isGenerating: false,
  },
  failed: {
    label: 'Failed',
    icon: AlertCircle,
    badgeClass: 'bg-red-500/15 text-red-400 border border-red-500/30',
    iconClass: 'text-red-400',
    isGenerating: false,
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProposalPanel({ data, onActionClick }: Props) {
  const responseData = data.data;

  const status: ProposalStatus = responseData.status ?? 'assembling';
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.ready;
  const StatusIcon = config.icon;
  const { isGenerating } = config;

  const pdfUrl = responseData.pdf_url ?? null;
  const thumbnailUrl = responseData.thumbnail_url ?? null;
  const proposalId = responseData.proposal_id;

  const handleAction = (callback: string, params?: Record<string, unknown>) => {
    onActionClick?.({
      id: `proposal-${callback}-${proposalId}`,
      label: callback,
      type: 'primary',
      callback,
      params,
    });
  };

  const formatDate = (dateString: string): string =>
    new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  return (
    <div className="rounded-xl border border-gray-800/60 bg-gray-900/60 overflow-hidden">
      {/* Card body: thumbnail + content */}
      <div className="flex">
        {/* Left: PDF thumbnail or placeholder */}
        <div className="w-24 flex-shrink-0 bg-gray-800/50 border-r border-gray-800/60 flex items-center justify-center min-h-[120px]">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt="Proposal preview"
              className="w-full h-full object-cover object-top"
            />
          ) : (
            <div className="flex flex-col items-center gap-1.5 p-3 text-gray-500">
              {isGenerating ? (
                <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
              ) : (
                <FileText className="w-7 h-7" />
              )}
              <span className="text-[10px] text-center leading-tight">
                {isGenerating ? 'Generating...' : 'No preview'}
              </span>
            </div>
          )}
        </div>

        {/* Right: content */}
        <div className="flex-1 min-w-0 p-4">
          {/* Status badge + credits */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                config.badgeClass,
              )}
            >
              <StatusIcon className={cn('w-3 h-3', config.iconClass)} />
              {config.label}
            </span>

            {typeof responseData.credits_used === 'number' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-800/80 text-gray-400 border border-gray-700/50">
                <Coins className="w-3 h-3" />
                {responseData.credits_used} cr
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="text-sm font-semibold text-gray-100 leading-tight mb-1 truncate">
            {responseData.title || 'Untitled Proposal'}
          </h3>

          {/* Client info */}
          {(responseData.client_name || responseData.client_company) && (
            <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
              <Building2 className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">
                {responseData.client_name}
                {responseData.client_company && ` · ${responseData.client_company}`}
              </span>
            </div>
          )}

          {/* Date */}
          {responseData.created_at && (
            <p className="text-xs text-gray-500 mt-1">
              {formatDate(responseData.created_at)}
            </p>
          )}
        </div>
      </div>

      {/* Inline progress bar for generating states */}
      {isGenerating && (
        <div className="px-4 pb-3">
          <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full animate-pulse',
                (status === 'generating' || status === 'assembling') && 'w-1/3 bg-blue-500',
                status === 'composing' && 'w-2/3 bg-violet-500',
                status === 'rendering' && 'w-5/6 bg-amber-500',
              )}
            />
          </div>
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-800/60 bg-gray-900/30 flex-wrap">
        {/* Download PDF — only when pdf_url exists */}
        {pdfUrl && (
          <button
            onClick={() => handleAction('open_external_url', { url: pdfUrl })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download PDF
          </button>
        )}

        {/* Edit in 60 */}
        <button
          onClick={() => handleAction('open_proposal_edit', { proposalId })}
          disabled={isGenerating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 text-xs font-medium transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit in 60
        </button>

        {/* Regenerate */}
        <button
          onClick={() => handleAction('regenerate_proposal', { proposalId })}
          disabled={isGenerating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 text-xs font-medium transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Regenerate
        </button>

        {/* Send to Client — when ready or sent */}
        {(status === 'ready' || status === 'sent') && (
          <button
            onClick={() => handleAction('send_proposal', { proposalId })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            Send to Client
          </button>
        )}
      </div>
    </div>
  );
}
