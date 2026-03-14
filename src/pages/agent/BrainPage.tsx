/**
 * BrainPage — Agent Memory & Knowledge Centre
 *
 * Scaffold page with 5 tabs: Memory Feed, Deal Memory, Contact Memory, Agent Log, Settings.
 * Each tab renders a placeholder empty state while the feature is being built out.
 *
 * TRINITY-004
 */

import { lazy, Suspense } from 'react';
import { Brain, Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import BrainMemoryFeed from '@/components/brain/BrainMemoryFeed';

const BrainDealMemory = lazy(() => import('@/components/brain/BrainDealMemory'));

// ============================================================================
// Tab definitions
// ============================================================================

const BRAIN_TABS = [
  { id: 'memory-feed', label: 'Memory Feed' },
  { id: 'deal-memory', label: 'Deal Memory' },
  { id: 'contact-memory', label: 'Contact Memory' },
  { id: 'agent-log', label: 'Agent Log' },
  { id: 'settings', label: 'Settings' },
] as const;

type BrainTab = (typeof BRAIN_TABS)[number]['id'];

// ============================================================================
// Placeholder empty state
// ============================================================================

function TabPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-gray-800/50 flex items-center justify-center mb-4">
        <Brain className="h-7 w-7 text-slate-400 dark:text-gray-500" />
      </div>
      <p className="text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">
        {label}
      </p>
      <p className="text-xs text-slate-400 dark:text-gray-500">
        Coming soon
      </p>
    </div>
  );
}

// ============================================================================
// Main page
// ============================================================================

export default function BrainPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-50 dark:bg-gray-950">
      {/* ====== PAGE HEADER ====== */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 dark:border-gray-800/60 bg-white dark:bg-gray-900/80">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-gray-800/50 flex items-center justify-center">
            <Brain className="h-5 w-5 text-slate-600 dark:text-gray-300" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800 dark:text-gray-100">
              Brain
            </h1>
            <p className="text-sm text-slate-400 dark:text-gray-500">
              Agent memory, knowledge, and learning
            </p>
          </div>
        </div>
      </div>

      {/* ====== TABS ====== */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 pt-4">
          <Tabs defaultValue={'memory-feed' satisfies BrainTab}>
            <TabsList>
              {BRAIN_TABS.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={'memory-feed' satisfies BrainTab}>
              <BrainMemoryFeed />
            </TabsContent>
            <TabsContent value={'deal-memory' satisfies BrainTab}>
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                }
              >
                <BrainDealMemory />
              </Suspense>
            </TabsContent>
            {BRAIN_TABS.filter((tab) => tab.id !== 'memory-feed' && tab.id !== 'deal-memory').map((tab) => (
              <TabsContent key={tab.id} value={tab.id}>
                <TabPlaceholder label={tab.label} />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
