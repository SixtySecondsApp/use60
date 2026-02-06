/**
 * CopilotLabPage
 *
 * Admin hub for testing, discovering, and improving copilot capabilities.
 * Inspired by Claude Cowork - makes AI capabilities visible and actionable.
 *
 * Features:
 * - Capabilities: View available skills and integrations
 * - Playground: Test queries interactively
 * - Quality: Monitor skill health and performance
 * - Ideas: Query analytics, skill gaps, and AI-powered skill builder
 */

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Zap,
  FlaskConical,
  BarChart3,
  Lightbulb,
  Hammer,
  Settings,
  RefreshCw,
  History,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { usePlatformSkills } from '@/lib/hooks/usePlatformSkills';
import { useOrgCapabilities } from '@/lib/hooks/useOrgCapabilities';
import { useQueryAnalytics, type QueryIntent } from '@/lib/hooks/useQueryAnalytics';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

// Lab Components
import { CapabilityOverview } from '@/components/copilot/lab/CapabilityOverview';
import { InteractivePlayground } from '@/components/copilot/lab/InteractivePlayground';
import { QualityDashboard } from '@/components/copilot/lab/QualityDashboard';
import { UseCaseLibrary } from '@/components/copilot/lab/UseCaseLibrary';
import { SkillCard } from '@/components/copilot/lab/SkillCard';
import { PopularQueriesPanel } from '@/components/copilot/lab/PopularQueriesPanel';
import { SkillCoverageChart } from '@/components/copilot/lab/SkillCoverageChart';
import { SkillBuilderWizard } from '@/components/copilot/lab/SkillBuilderWizard';
import { ExecutionHistoryList } from '@/components/copilot/lab/ExecutionHistoryList';
import type { PlatformSkill } from '@/lib/services/platformSkillService';

const TABS = [
  { id: 'capabilities', label: 'Capabilities', icon: Zap },
  { id: 'playground', label: 'Playground', icon: FlaskConical },
  { id: 'quality', label: 'Quality', icon: BarChart3 },
  { id: 'history', label: 'History', icon: History },
  { id: 'ideas', label: 'Ideas', icon: Lightbulb },
];

export function CopilotLabPage() {
  const navigate = useNavigate();
  const { activeOrgId } = useOrg();
  const [activeTab, setActiveTab] = useState('capabilities');
  const [playgroundQuery, setPlaygroundQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<PlatformSkill | null>(null);

  // Skill Builder state
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [prefillIntent, setPrefillIntent] = useState<QueryIntent | null>(null);

  // Analytics time range
  const [analyticsTimeRange, setAnalyticsTimeRange] = useState<'7d' | '30d' | '90d'>('7d');

  // Fetch all skills and capabilities
  const { data: skills = [], isLoading: skillsLoading, refetch: refetchSkills } = usePlatformSkills();
  const { data: capabilities = [], isLoading: capabilitiesLoading, refetch: refetchCapabilities } = useOrgCapabilities(activeOrgId);

  // Fetch query analytics
  const {
    coverage: coverageStats,
    gaps,
    trending,
    isLoading: analyticsLoading,
    refetch: refetchAnalytics,
  } = useQueryAnalytics({ timeRange: analyticsTimeRange });

  const isLoading = skillsLoading || capabilitiesLoading || analyticsLoading;

  // Handle trying a prompt from use case library or skill card
  const handleTryPrompt = useCallback((prompt: string) => {
    setPlaygroundQuery(prompt);
    setActiveTab('playground');
  }, []);

  // Handle skill click from quality dashboard
  const handleSkillClick = useCallback((skill: PlatformSkill) => {
    setSelectedSkill(skill);
    // Could open a detail modal or navigate
    navigate(`/platform/skills/${skill.id}`);
  }, [navigate]);

  // Handle building a skill from a gap
  const handleBuildSkill = useCallback((intent: QueryIntent) => {
    setPrefillIntent(intent);
    setIsBuilderOpen(true);
  }, []);

  // Handle closing the builder
  const handleBuilderClose = useCallback(() => {
    setIsBuilderOpen(false);
    setPrefillIntent(null);
  }, []);

  // Handle successful skill deployment
  const handleSkillDeployed = useCallback((skillKey: string) => {
    setIsBuilderOpen(false);
    setPrefillIntent(null);
    refetchSkills();
    refetchAnalytics();
    toast.success(`Skill "${skillKey}" deployed successfully!`);
  }, [refetchSkills, refetchAnalytics]);

  // Refresh all data
  const handleRefresh = useCallback(() => {
    refetchSkills();
    refetchCapabilities();
    refetchAnalytics();
  }, [refetchSkills, refetchCapabilities, refetchAnalytics]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
                <FlaskConical className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Copilot Lab
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Test, discover, and improve your AI sales assistant
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/platform/skills')}
              >
                <Settings className="w-4 h-4 mr-2" />
                Manage Skills
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Tab Navigation */}
          <TabsList className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700/50 p-1 rounded-xl">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-900/30 dark:data-[state=active]:text-blue-300 rounded-lg transition-colors"
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Capabilities Tab */}
          <TabsContent value="capabilities" className="mt-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CapabilityOverview
                capabilities={capabilities}
                skills={skills}
                isLoading={isLoading}
                onCapabilityClick={(cap) => {
                  // Filter to skills requiring this capability
                  console.log('Clicked capability:', cap);
                }}
              />
            </motion.div>
          </TabsContent>

          {/* Playground Tab */}
          <TabsContent value="playground" className="mt-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <InteractivePlayground
                skills={skills}
                capabilities={capabilities}
                isLoading={isLoading}
                initialQuery={playgroundQuery}
              />
            </motion.div>
          </TabsContent>

          {/* Quality Tab */}
          <TabsContent value="quality" className="mt-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <QualityDashboard
                skills={skills}
                capabilities={capabilities}
                isLoading={isLoading}
                onSkillClick={handleSkillClick}
              />
            </motion.div>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="mt-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <ExecutionHistoryList
                orgId={activeOrgId || undefined}
                onReRun={(message) => {
                  setPlaygroundQuery(message);
                  setActiveTab('playground');
                }}
              />
            </motion.div>
          </TabsContent>

          {/* Ideas Tab */}
          <TabsContent value="ideas" className="mt-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              {/* Analytics Overview Row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Coverage Chart */}
                <div className="bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700/50 rounded-xl p-5">
                  <SkillCoverageChart
                    stats={coverageStats}
                    isLoading={analyticsLoading}
                  />
                </div>

                {/* Popular Queries Panel - spans 2 columns */}
                <div className="lg:col-span-2 bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700/50 rounded-xl p-5">
                  <PopularQueriesPanel
                    gaps={gaps}
                    trending={trending}
                    isLoading={analyticsLoading}
                    timeRange={analyticsTimeRange}
                    onTimeRangeChange={setAnalyticsTimeRange}
                    onBuildSkill={handleBuildSkill}
                    onTryPrompt={handleTryPrompt}
                    onRefresh={refetchAnalytics}
                  />
                </div>
              </div>

              {/* Build New Skill CTA */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
                      <Hammer className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Build a New Skill with AI
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Describe what you want and let Claude generate the skill template
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => setIsBuilderOpen(true)}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                  >
                    <Hammer className="w-4 h-4 mr-2" />
                    Start Building
                  </Button>
                </div>
              </div>

              {/* Curated Use Cases */}
              <UseCaseLibrary
                skills={skills}
                isLoading={isLoading}
                onTryPrompt={handleTryPrompt}
                onSkillClick={handleSkillClick}
              />
            </motion.div>
          </TabsContent>
        </Tabs>

        {/* Skill Builder Wizard Dialog */}
        <SkillBuilderWizard
          isOpen={isBuilderOpen}
          onClose={handleBuilderClose}
          onSkillDeployed={handleSkillDeployed}
          prefillIntent={prefillIntent}
        />

        {/* Skills Grid (shown on capabilities tab) */}
        {activeTab === 'capabilities' && skills.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.1 }}
            className="mt-8"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                All Skills & Sequences
              </h3>
              <span className="text-sm text-gray-500">
                {skills.length} total
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {skills
                .filter((s) => s.is_active)
                .slice(0, 9)
                .map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    capabilities={capabilities}
                    variant="default"
                    onTry={(prompt) => {
                      // Navigate to skill's test page with query pre-filled
                      const encodedQuery = encodeURIComponent(prompt);
                      navigate(`/platform/skills/${skill.category}/${skill.skill_key}?try=${encodedQuery}`);
                    }}
                    onViewDetails={() => handleSkillClick(skill)}
                  />
                ))}
            </div>
            {skills.filter((s) => s.is_active).length > 9 && (
              <div className="mt-4 text-center">
                <Button
                  variant="outline"
                  onClick={() => navigate('/platform/skills')}
                >
                  View All {skills.filter((s) => s.is_active).length} Skills
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default CopilotLabPage;
