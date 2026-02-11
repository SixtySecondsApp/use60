import React from 'react';
import { X, Upload, FileSpreadsheet, Table2, Search, Wand2 } from 'lucide-react';

interface CreateTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCSV: () => void;
  onSelectHubSpot: () => void;
  onSelectAttio: () => void;
  onSelectApollo: () => void;
  onSelectOpsTable: () => void;
  onSelectBlank: () => void;
  onSelectWorkflow?: () => void;
}

// HubSpot logo as inline SVG
const HubSpotIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
    <path d="M18.164 7.93V5.084a2.198 2.198 0 001.267-1.984 2.21 2.21 0 00-2.212-2.212 2.21 2.21 0 00-2.212 2.212c0 .856.49 1.596 1.205 1.96v2.87a5.908 5.908 0 00-2.903 1.229L6.126 3.676a2.553 2.553 0 00.097-.684A2.555 2.555 0 003.668.437 2.555 2.555 0 001.113 2.99a2.555 2.555 0 002.555 2.555c.463 0 .896-.124 1.27-.34l7.137 5.39a5.907 5.907 0 00-.625 2.652c0 .94.22 1.83.612 2.623l-2.136 2.136a2.004 2.004 0 00-.56-.084 2.022 2.022 0 00-2.023 2.023 2.022 2.022 0 002.023 2.023 2.022 2.022 0 002.023-2.023c0-.204-.032-.4-.088-.586l2.086-2.086a5.923 5.923 0 003.831 1.406 5.934 5.934 0 005.934-5.934 5.934 5.934 0 00-5.988-5.815zm-.014 9.167a3.352 3.352 0 01-3.353-3.353 3.352 3.352 0 013.353-3.352 3.352 3.352 0 013.352 3.352 3.352 3.352 0 01-3.352 3.353z" />
  </svg>
);

const SOURCE_OPTIONS = [
  {
    id: 'csv',
    title: 'Upload CSV',
    description: 'Import contacts from a CSV or Excel file',
    icon: Upload,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    hoverBorder: 'hover:border-blue-500/60',
  },
  {
    id: 'apollo',
    title: 'Apollo Search',
    description: 'Find leads by title, seniority, company, and more',
    icon: Search,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    hoverBorder: 'hover:border-blue-500/60',
  },
  {
    id: 'hubspot',
    title: 'HubSpot',
    description: 'Import contacts from a HubSpot list or filter',
    icon: HubSpotIcon,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    hoverBorder: 'hover:border-orange-500/60',
  },
  {
    id: 'attio',
    title: 'Attio',
    description: 'Import people, companies, or deals from Attio',
    icon: Upload,
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10',
    borderColor: 'border-violet-500/30',
    hoverBorder: 'hover:border-violet-500/60',
  },
  {
    id: 'ops_table',
    title: 'Use Ops Table',
    description: 'Copy or reference data from another table',
    icon: FileSpreadsheet,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-500/30',
    hoverBorder: 'hover:border-indigo-500/60',
  },
  {
    id: 'workflow',
    title: 'Describe Workflow',
    description: 'Describe your outreach in plain English and let AI build it',
    icon: Wand2,
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10',
    borderColor: 'border-violet-500/30',
    hoverBorder: 'hover:border-violet-500/60',
  },
  {
    id: 'blank',
    title: 'Blank Table',
    description: 'Start with an empty table and add rows manually',
    icon: Table2,
    color: 'text-zinc-400',
    bgColor: 'bg-zinc-500/10',
    borderColor: 'border-zinc-500/30',
    hoverBorder: 'hover:border-zinc-500/60',
  },
];

export function CreateTableModal({
  isOpen,
  onClose,
  onSelectCSV,
  onSelectHubSpot,
  onSelectAttio,
  onSelectApollo,
  onSelectOpsTable,
  onSelectBlank,
  onSelectWorkflow,
}: CreateTableModalProps) {
  if (!isOpen) return null;

  const handleSelect = (id: string) => {
    onClose();
    switch (id) {
      case 'csv':
        onSelectCSV();
        break;
      case 'apollo':
        onSelectApollo();
        break;
      case 'hubspot':
        onSelectHubSpot();
        break;
      case 'attio':
        onSelectAttio();
        break;
      case 'ops_table':
        onSelectOpsTable();
        break;
      case 'workflow':
        onSelectWorkflow?.();
        break;
      case 'blank':
        onSelectBlank();
        break;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-700/60 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Create New Table</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Options Grid */}
        <div className="grid grid-cols-2 gap-3 p-6">
          {SOURCE_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.id}
                onClick={() => handleSelect(option.id)}
                className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${option.borderColor} ${option.hoverBorder} hover:bg-zinc-800/50`}
              >
                <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${option.bgColor} ${option.color}`}>
                  <Icon />
                </div>
                <h3 className="text-sm font-medium text-white">{option.title}</h3>
                <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                  {option.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
