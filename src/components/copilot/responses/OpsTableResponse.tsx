import React from 'react';
import { Table2, Sparkles, ExternalLink, Rows3, Send } from 'lucide-react';

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
  onActionClick: (action: string, payload?: Record<string, unknown>) => void;
}

export const OpsTableResponse: React.FC<OpsTableResponseProps> = ({ data, onActionClick }) => {
  const {
    table_id,
    table_name,
    row_count,
    column_count,
    source_type,
    enriched_count,
    preview_rows,
    preview_columns,
    query_description,
  } = data;

  const displayRows = preview_rows.slice(0, 5);

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

      {/* Preview Table */}
      {displayRows.length > 0 && preview_columns.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800">
                {preview_columns.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2 text-left text-gray-400 font-medium whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-b border-gray-800/50 last:border-b-0 hover:bg-gray-800/30"
                >
                  {preview_columns.map((col) => (
                    <td
                      key={col}
                      className="px-3 py-2 text-gray-300 whitespace-nowrap max-w-[200px] truncate"
                    >
                      {row[col] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {row_count > 5 && (
            <div className="px-3 py-1.5 text-xs text-gray-500 text-center border-t border-gray-800/50">
              Showing 5 of {row_count} rows
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="px-4 py-3 border-t border-gray-800 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onActionClick('open_dynamic_table', { table_id })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/30 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open Table
        </button>
        <button
          onClick={() => onActionClick('add_enrichment', { table_id })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 text-xs font-medium hover:bg-purple-500/30 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Add Enrichment
        </button>
        <button
          onClick={() => onActionClick('push_to_instantly', { table_id })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700/60 text-gray-300 text-xs font-medium hover:bg-gray-700/80 transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
          Push to Instantly
        </button>
      </div>
    </div>
  );
};

export default OpsTableResponse;
