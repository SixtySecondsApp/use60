import React, { useState } from 'react';
import { X, Loader2, List } from 'lucide-react';

interface SaveAsHubSpotListModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableName: string;
  totalRows: number;
  selectedCount: number;
  onSave: (config: {
    listName: string;
    scope: 'all' | 'selected';
    linkList: boolean;
  }) => void;
  isSaving?: boolean;
}

export function SaveAsHubSpotListModal({
  isOpen,
  onClose,
  tableName,
  totalRows,
  selectedCount,
  onSave,
  isSaving,
}: SaveAsHubSpotListModalProps) {
  const [listName, setListName] = useState(tableName);
  const [scope, setScope] = useState<'all' | 'selected'>(selectedCount > 0 ? 'selected' : 'all');
  const [linkList, setLinkList] = useState(false);

  if (!isOpen) return null;

  const rowCount = scope === 'selected' ? selectedCount : totalRows;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700/60 px-6 py-4">
          <div className="flex items-center gap-2">
            <List className="h-5 w-5 text-orange-400" />
            <h2 className="text-lg font-semibold text-gray-100">Save as HubSpot List</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* List Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">List Name</label>
            <input
              type="text"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              placeholder="Enter list name..."
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-orange-500"
              autoFocus
            />
          </div>

          {/* Scope */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">Contacts to Include</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  scope === 'all'
                    ? 'border-orange-500 bg-orange-500/15 text-orange-300'
                    : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                }`}
              >
                <p className="text-sm font-medium">All rows</p>
                <p className="mt-0.5 text-xs opacity-70">{totalRows} contacts</p>
              </button>
              <button
                type="button"
                onClick={() => setScope('selected')}
                disabled={selectedCount === 0}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  scope === 'selected'
                    ? 'border-orange-500 bg-orange-500/15 text-orange-300'
                    : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                } disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                <p className="text-sm font-medium">Selected only</p>
                <p className="mt-0.5 text-xs opacity-70">{selectedCount} selected</p>
              </button>
            </div>
          </div>

          {/* Link List */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={linkList}
              onChange={(e) => setLinkList(e.target.checked)}
              className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-orange-500 focus:ring-orange-500 focus:ring-offset-0"
            />
            <div>
              <p className="text-sm text-gray-300">Link this list for future sync</p>
              <p className="text-xs text-gray-500">Table syncs will use this list going forward</p>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-700/60 px-6 py-4">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ listName: listName.trim(), scope, linkList })}
            disabled={isSaving || !listName.trim()}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40 flex items-center gap-2"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <List className="h-4 w-4" />}
            Create List ({rowCount} contacts)
          </button>
        </div>
      </div>
    </div>
  );
}

export default SaveAsHubSpotListModal;
