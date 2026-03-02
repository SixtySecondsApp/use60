import React, { useState } from 'react';
import { Upload, FileSpreadsheet, Table2, Search, Wand2, LayoutTemplate, Cable, Building2, Database } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StandardTablesGallery } from './StandardTablesGallery';

interface CreateTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCSV: () => void;
  onSelectHubSpot: () => void;
  onSelectAttio: () => void;
  onSelectApollo: () => void;
  onSelectAiArk: () => void;
  onSelectExplorium: () => void;
  onSelectOpsTable: () => void;
  onSelectBlank: () => void;
  onSelectWorkflow?: () => void;
  existingTables?: Array<{ id: string; name: string; row_count: number; is_standard?: boolean }>;
  onTableClick?: (tableId: string) => void;
}

// HubSpot logo as inline SVG
const HubSpotIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
    <path d="M18.164 7.93V5.084a2.198 2.198 0 001.267-1.984 2.21 2.21 0 00-2.212-2.212 2.21 2.21 0 00-2.212 2.212c0 .856.49 1.596 1.205 1.96v2.87a5.908 5.908 0 00-2.903 1.229L6.126 3.676a2.553 2.553 0 00.097-.684A2.555 2.555 0 003.668.437 2.555 2.555 0 001.113 2.99a2.555 2.555 0 002.555 2.555c.463 0 .896-.124 1.27-.34l7.137 5.39a5.907 5.907 0 00-.625 2.652c0 .94.22 1.83.612 2.623l-2.136 2.136a2.004 2.004 0 00-.56-.084 2.022 2.022 0 00-2.023 2.023 2.022 2.022 0 002.023 2.023 2.022 2.022 0 002.023-2.023c0-.204-.032-.4-.088-.586l2.086-2.086a5.923 5.923 0 003.831 1.406 5.934 5.934 0 005.934-5.934 5.934 5.934 0 00-5.988-5.815zm-.014 9.167a3.352 3.352 0 01-3.353-3.353 3.352 3.352 0 013.353-3.352 3.352 3.352 0 013.352 3.352 3.352 3.352 0 01-3.352 3.353z" />
  </svg>
);

const SOURCE_OPTIONS = [
  {
    id: 'csv',
    title: 'Upload CSV',
    description: 'Import from a CSV or Excel file',
    icon: Upload,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  {
    id: 'apollo',
    title: 'Apollo Search',
    description: 'Find leads by title, company, and more',
    icon: Search,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  {
    id: 'ai_ark',
    title: 'AI Ark Search',
    description: 'Premium company & people data with tech stack filters',
    icon: Building2,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
  },
  {
    id: 'explorium',
    title: 'Explorium',
    description: 'Search 80M+ companies and prospects with intent signals',
    icon: Database,
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/10',
  },
  {
    id: 'hubspot',
    title: 'HubSpot',
    description: 'Import from a HubSpot list or filter',
    icon: HubSpotIcon,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
  {
    id: 'attio',
    title: 'Attio',
    description: 'Import people, companies, or deals',
    icon: Upload,
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10',
  },
  {
    id: 'ops_table',
    title: 'From Ops Table',
    description: 'Copy or reference another table',
    icon: FileSpreadsheet,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
  },
  {
    id: 'workflow',
    title: 'AI Workflow',
    description: 'Describe your workflow in plain English',
    icon: Wand2,
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10',
  },
  {
    id: 'blank',
    title: 'Blank Table',
    description: 'Start empty and add rows manually',
    icon: Table2,
    color: 'text-zinc-400',
    bgColor: 'bg-zinc-500/10',
  },
];

export function CreateTableModal({
  isOpen,
  onClose,
  onSelectCSV,
  onSelectHubSpot,
  onSelectAttio,
  onSelectApollo,
  onSelectAiArk,
  onSelectExplorium,
  onSelectOpsTable,
  onSelectBlank,
  onSelectWorkflow,
  existingTables = [],
  onTableClick,
}: CreateTableModalProps) {
  const [activeTab, setActiveTab] = useState('sources');

  const handleSelect = (id: string) => {
    onClose();
    switch (id) {
      case 'csv':
        onSelectCSV();
        break;
      case 'apollo':
        onSelectApollo();
        break;
      case 'ai_ark':
        onSelectAiArk();
        break;
      case 'explorium':
        onSelectExplorium();
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

  const handleTableClick = (tableId: string) => {
    onClose();
    onTableClick?.(tableId);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl gap-0 p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col">
          {/* Header */}
          <DialogHeader className="space-y-0 border-b border-gray-200 dark:border-gray-700/50 px-6 py-4">
            <div className="flex items-center gap-4">
              <DialogTitle>New Table</DialogTitle>
              <TabsList className="h-8 !bg-gray-100 dark:!bg-gray-800/80 p-0.5">
                <TabsTrigger
                  value="sources"
                  className="gap-1.5 px-3 py-1 text-xs data-[state=active]:!bg-white dark:data-[state=active]:!bg-gray-700 data-[state=active]:!text-gray-900 dark:data-[state=active]:!text-white"
                >
                  <Cable className="h-3.5 w-3.5" />
                  Sources
                </TabsTrigger>
                <TabsTrigger
                  value="templates"
                  className="gap-1.5 px-3 py-1 text-xs data-[state=active]:!bg-white dark:data-[state=active]:!bg-gray-700 data-[state=active]:!text-gray-900 dark:data-[state=active]:!text-white"
                >
                  <LayoutTemplate className="h-3.5 w-3.5" />
                  Templates
                </TabsTrigger>
              </TabsList>
            </div>
            <DialogDescription className="sr-only">
              Choose a pre-built template or import from a data source
            </DialogDescription>
          </DialogHeader>

          {/* Content */}
          <TabsContent value="templates" className="m-0 p-5">
            <StandardTablesGallery
              onTableClick={handleTableClick}
              existingTables={existingTables}
            />
          </TabsContent>

          <TabsContent value="sources" className="m-0 p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {SOURCE_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    onClick={() => handleSelect(option.id)}
                    className="group flex flex-col items-start rounded-lg border border-gray-200 dark:border-gray-700/50 p-4 text-left transition-all hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <div className={`mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg ${option.bgColor} ${option.color}`}>
                      <Icon />
                    </div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">{option.title}</h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
