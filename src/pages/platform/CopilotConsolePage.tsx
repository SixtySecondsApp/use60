/**
 * CopilotConsolePage - Unified Copilot Admin Console
 *
 * Consolidates copilot testing, monitoring, and analytics into one page.
 * Wired to the live autonomous copilot (Claude Haiku 4.5).
 *
 * Tabs: Live Playground | Health & Quality | Execution History | Engagement
 */

import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Bot,
  Play,
  HeartPulse,
  History,
  TrendingUp,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { PlaygroundTab } from '@/components/copilot/console/PlaygroundTab';
import { HealthTab } from '@/components/copilot/console/HealthTab';
import { HistoryTab } from '@/components/copilot/console/HistoryTab';
import { EngagementTab } from '@/components/copilot/console/EngagementTab';

const TABS = [
  { id: 'playground', label: 'Live Playground', icon: Play },
  { id: 'health', label: 'Health & Quality', icon: HeartPulse },
  { id: 'history', label: 'Execution History', icon: History },
  { id: 'engagement', label: 'Engagement', icon: TrendingUp },
] as const;

export default function CopilotConsolePage() {
  const { activeOrgId } = useOrg();
  const { userId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'playground';
  const [playgroundQuery, setPlaygroundQuery] = useState('');

  const setActiveTab = useCallback((tab: string) => {
    setSearchParams({ tab }, { replace: true });
  }, [setSearchParams]);

  const handleReRun = useCallback((message: string) => {
    setPlaygroundQuery(message);
    setActiveTab('playground');
  }, [setActiveTab]);

  if (!activeOrgId || !userId) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <BackToPlatform className="mb-4" />
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
              <Bot className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Copilot Console
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Test, monitor, and analyze your AI copilot
              </p>
            </div>
            <Badge variant="outline" className="ml-2 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
              Autonomous Mode (Claude)
            </Badge>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 p-1 rounded-lg">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-2 data-[state=active]:bg-emerald-50 dark:data-[state=active]:bg-emerald-900/30 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-300"
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="playground">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <PlaygroundTab
                organizationId={activeOrgId}
                userId={userId}
                initialQuery={playgroundQuery}
                onQueryConsumed={() => setPlaygroundQuery('')}
              />
            </motion.div>
          </TabsContent>

          <TabsContent value="health">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <HealthTab organizationId={activeOrgId} />
            </motion.div>
          </TabsContent>

          <TabsContent value="history">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <HistoryTab
                organizationId={activeOrgId}
                onReRun={handleReRun}
              />
            </motion.div>
          </TabsContent>

          <TabsContent value="engagement">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <EngagementTab organizationId={activeOrgId} />
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
