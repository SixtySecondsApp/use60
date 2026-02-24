import React from 'react';
import { Table2, Sparkles, ExternalLink, Rows3, Send, Download, ChevronRight } from 'lucide-react';
import type { QuickActionResponse } from '../types';

export interface OpsTableResponseData {
  table_id: string;
  table_name: string;
  row_count: number;
  column_count: number;
  source_type: string;
  enriched_count: number;
  preview_rows: Array<Record<string, string>>;
  preview_columns: string[];
  query_description?: string;
}

interface OpsTableResponseProps {
  data: OpsTableResponseData;
  onActionClick: (action: QuickActionResponse) => void;
}

export const OpsTableResponse: React.FC<OpsTableResponseProps> = ({ data, onActionClick }) => {
  const {
    table_id,
    table_name,
    row_count,
    enriched_count,
    query_description,
  } = data;

  /** Emit a canonical action */
  const emitAction = (callback: string, label: string, params?: Record<string, any>) => {
    onActionClick({
      id: `ops-${callback}-${table_id}`,
      label,
      type: 'primary',
      callback,
      params,
    });
  };

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <Table2 className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-white truncate">{table_name}</h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-700/60 text-xs text-gray-300">
                <Rows3 className="w-3 h-3" />
                {row_count} row{row_count !== 1 ? 's' : ''}
              </span>
              {enriched_count > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/20 text-xs text-purple-300">
                  <Sparkles className="w-3 h-3" />
                  {enriched_count} enriched
                </span>
              )}
            </div>
            {query_description && (
              <p className="text-xs text-gray-400 mt-1 truncate">{query_description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Keep table layout in the Ops table page (not inline in chat card). */}
      <div className="px-4 py-3 border-b border-gray-800/60">
        <p className="text-xs text-gray-400">
          Table preview and layout editing are available in Ops Table.
        </p>
      </div>

      {/* What's Next? Pipeline */}
      <div className="px-4 py-3 border-t border-gray-800">
        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">What's next?</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => emitAction('open_dynamic_table', 'Open Table', { table_id })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/30 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Table
          </button>
          <button
            onClick={() => emitAction('add_enrichment', 'Enrich All', { table_id })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 text-xs font-medium hover:bg-purple-500/30 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Enrich All
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-gray-600 shrink-0" />
          <button
            onClick={enriched_count > 0 ? () => emitAction('start_campaign', 'Create Campaign', { table_id }) : undefined}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-medium transition-colors ${
              enriched_count === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-500/30'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            Create Campaign
          </button>
          <button
            onClick={() => emitAction('export_table_csv', 'Export CSV', { table_id })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700/60 text-gray-300 text-xs font-medium hover:bg-gray-700/80 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
};

export default OpsTableResponse;
