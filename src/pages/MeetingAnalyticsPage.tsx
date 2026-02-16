import React, { useState } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BarChart3, FileText, Search, Wand2, ClipboardList } from 'lucide-react';

import { OverviewTab } from '@/components/meeting-analytics/OverviewTab';
import { TranscriptsTab } from '@/components/meeting-analytics/TranscriptsTab';
import { SearchTab } from '@/components/meeting-analytics/SearchTab';
import { InsightsTab } from '@/components/meeting-analytics/InsightsTab';
import { ReportsTab } from '@/components/meeting-analytics/ReportsTab';
import { TranscriptDetailSheet } from '@/components/meeting-analytics/TranscriptDetailSheet';

const tabs = [
  { value: 'overview', label: 'Overview', icon: BarChart3 },
  { value: 'transcripts', label: 'Transcripts', icon: FileText },
  { value: 'search', label: 'Search', icon: Search },
  { value: 'insights', label: 'Insights', icon: Wand2 },
  { value: 'reports', label: 'Reports', icon: ClipboardList },
] as const;

const timeRangeOptions = [
  { value: 'all', label: 'All Time' },
  { value: '7', label: 'Last 7 Days' },
  { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 90 Days' },
];

export default function MeetingAnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { transcriptId } = useParams<{ transcriptId?: string }>();
  const navigate = useNavigate();

  const activeTab = searchParams.get('tab') || 'overview';
  const [timeRange, setTimeRange] = useState<string>('all');

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  const handleTranscriptDetailClose = () => {
    navigate('/meeting-analytics');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Meeting Analytics
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              AI-powered insights from your meeting transcripts
            </p>
          </div>

          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[160px] bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              {timeRangeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="mb-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex items-center gap-1.5"
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab timeRange={timeRange} />
          </TabsContent>

          <TabsContent value="transcripts">
            <TranscriptsTab timeRange={timeRange} />
          </TabsContent>

          <TabsContent value="search">
            <SearchTab />
          </TabsContent>

          <TabsContent value="insights">
            <InsightsTab timeRange={timeRange} />
          </TabsContent>

          <TabsContent value="reports">
            <ReportsTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Transcript Detail Sheet */}
      {transcriptId && (
        <TranscriptDetailSheet
          transcriptId={transcriptId}
          open={true}
          onClose={handleTranscriptDetailClose}
        />
      )}
    </motion.div>
  );
}
