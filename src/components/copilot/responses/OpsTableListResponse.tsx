import React from 'react';
import { Table2, Rows3, Database, ExternalLink } from 'lucide-react';
import type { QuickActionResponse } from '../types';

export interface OpsTableListResponseData {
  tables: Array<{
    id: string;
    name: string;
    description?: string;
    source_type: string;
    row_count: number;
    created_at: string;
  }>;
}

interface OpsTableListResponseProps {
  data: OpsTableListResponseData;
  onActionClick?: (action: QuickActionResponse) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  apollo: 'Apollo',
  csv: 'CSV',
  hubspot: 'HubSpot',
  copilot: 'Copilot',
  manual: 'Manual',
  ops_table: 'Cross-Ops',
};

export const OpsTableListResponse: React.FC<OpsTableListResponseProps> = ({ data, onActionClick }) => {
  const { tables } = data;

  const emitAction = (callback: string, label: string, params?: Record<string, any>) => {
    onActionClick?.({
      id: `ops-${callback}-${Date.now()}`,
      label,
      type: 'primary',
      callback,
      params,
    });
  };

  if (!tables || tables.length === 0) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-3 text-gray-400">
          <Database className="w-5 h-5" />
          <p className="text-sm">No ops tables found. Create one to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">
            {tables.length} Ops Table{tables.length !== 1 ? 's' : ''}
          </h3>
        </div>
      </div>

      <div className="divide-y divide-gray-800/50">
        {tables.map((table) => (
          <button
            key={table.id}
            onClick={() => emitAction('open_dynamic_table', table.name, { table_id: table.id })}
            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-800/30 transition-colors text-left"
          >
            <div className="p-1.5 bg-blue-500/20 rounded-lg shrink-0">
              <Table2 className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white truncate">{table.name}</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-700/60 text-[10px] text-gray-400">
                  {SOURCE_LABELS[table.source_type] || table.source_type}
                </span>
              </div>
              {table.description && (
                <p className="text-xs text-gray-500 truncate mt-0.5">{table.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400 shrink-0">
              <Rows3 className="w-3 h-3" />
              {table.row_count}
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-gray-600 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default OpsTableListResponse;
