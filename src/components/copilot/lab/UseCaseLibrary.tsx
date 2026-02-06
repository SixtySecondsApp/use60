/**
 * UseCaseLibrary Component
 *
 * Displays curated use cases and example prompts organized by category.
 * Helps users discover what the copilot can do.
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Target,
  Mail,
  TrendingUp,
  Users,
  AlertTriangle,
  Lightbulb,
  Play,
  ChevronRight,
  Sparkles,
  Clock,
  MessageSquare,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PlatformSkill } from '@/lib/services/platformSkillService';

interface UseCaseLibraryProps {
  skills: PlatformSkill[];
  isLoading?: boolean;
  onTryPrompt?: (prompt: string) => void;
  onSkillClick?: (skill: PlatformSkill) => void;
}

interface UseCase {
  id: string;
  category: string;
  title: string;
  icon: React.ElementType;
  description: string;
  prompts: string[];
  skills?: string[];
  isPopular?: boolean;
}

const USE_CASES: UseCase[] = [
  {
    id: 'meeting-prep',
    category: 'Meeting Intelligence',
    title: 'Before Meetings',
    icon: Calendar,
    description: 'Get prepared with company research, contact history, and talking points',
    prompts: [
      'Prep me for my next meeting',
      'What should I know about [Company]?',
      'Brief me on [Contact Name]',
      'Show me past interactions with [Company]',
    ],
    skills: ['meeting-prep-brief', 'company-research', 'contact-lookup'],
    isPopular: true,
  },
  {
    id: 'meeting-followup',
    category: 'Meeting Intelligence',
    title: 'After Meetings',
    icon: MessageSquare,
    description: 'Create follow-ups, recap emails, and action items from your calls',
    prompts: [
      'What follow-ups came from today\'s meetings?',
      'Draft a recap email for [Meeting]',
      'Create tasks from my last call',
      'Summarize key points from [Meeting]',
    ],
    skills: ['post-meeting-followup', 'meeting-summary', 'task-extractor'],
  },
  {
    id: 'pipeline-health',
    category: 'Deal Analysis',
    title: 'Pipeline Health',
    icon: TrendingUp,
    description: 'Monitor your pipeline and identify deals that need attention',
    prompts: [
      'What deals are at risk?',
      'Show me deals that need attention',
      'Which deals will close this month?',
      'What\'s my pipeline looking like?',
    ],
    skills: ['pipeline-analysis', 'deal-risk-score', 'forecast'],
    isPopular: true,
  },
  {
    id: 'deal-rescue',
    category: 'Deal Analysis',
    title: 'Deal Rescue',
    icon: AlertTriangle,
    description: 'Get help reviving stalled deals and re-engaging prospects',
    prompts: [
      'Help me rescue [Deal Name]',
      'Why is [Deal] slipping?',
      'Create a re-engagement plan for [Company]',
      'What deals have gone dark?',
    ],
    skills: ['deal-rescue-pack', 're-engagement-strategy'],
  },
  {
    id: 'follow-ups',
    category: 'Follow-ups',
    title: 'Smart Follow-ups',
    icon: Mail,
    description: 'Draft follow-up emails and manage your outreach',
    prompts: [
      'Draft a follow-up email to [Contact]',
      'What follow-ups am I missing?',
      'Help me write a check-in message',
      'Who should I follow up with today?',
    ],
    skills: ['email-draft', 'followup-reminder', 'outreach-assistant'],
    isPopular: true,
  },
  {
    id: 'contacts',
    category: 'Contacts',
    title: 'Contact Intelligence',
    icon: Users,
    description: 'Learn about your contacts and their organizations',
    prompts: [
      'Who is [Contact Name]?',
      'What\'s the org chart at [Company]?',
      'Who else should I talk to at [Company]?',
      'Show me decision makers at [Company]',
    ],
    skills: ['contact-lookup', 'org-chart', 'stakeholder-map'],
  },
  {
    id: 'daily-focus',
    category: 'Productivity',
    title: 'Daily Focus',
    icon: Target,
    description: 'Start your day with a clear focus on what matters most',
    prompts: [
      'What should I focus on today?',
      'Run my daily focus workflow',
      'What\'s most important this week?',
      'Help me plan my day',
    ],
    skills: ['daily-focus-plan', 'priority-planner'],
    isPopular: true,
  },
  {
    id: 'insights',
    category: 'Analytics',
    title: 'Sales Insights',
    icon: Lightbulb,
    description: 'Get insights and analytics about your sales performance',
    prompts: [
      'How am I performing this quarter?',
      'What patterns do you see in my wins?',
      'Compare my pipeline to last month',
      'What\'s my win rate trending?',
    ],
    skills: ['performance-analytics', 'win-analysis', 'trend-report'],
  },
];

const CATEGORIES = [
  { id: 'all', label: 'All', icon: Sparkles },
  { id: 'Meeting Intelligence', label: 'Meeting Prep', icon: Calendar },
  { id: 'Deal Analysis', label: 'Deal Intel', icon: Target },
  { id: 'Follow-ups', label: 'Follow-ups', icon: Mail },
  { id: 'Productivity', label: 'Productivity', icon: Clock },
];

export function UseCaseLibrary({
  skills,
  isLoading,
  onTryPrompt,
  onSkillClick,
}: UseCaseLibraryProps) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter use cases by category and search
  const filteredUseCases = useMemo(() => {
    return USE_CASES.filter((useCase) => {
      const matchesCategory =
        selectedCategory === 'all' || useCase.category === selectedCategory;
      const matchesSearch =
        !searchQuery ||
        useCase.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        useCase.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        useCase.prompts.some((p) =>
          p.toLowerCase().includes(searchQuery.toLowerCase())
        );
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  // Get popular prompts
  const popularPrompts = useMemo(() => {
    return USE_CASES.filter((u) => u.isPopular).flatMap((u) => u.prompts.slice(0, 1));
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-12 bg-gray-100 dark:bg-gray-800/50 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-48 bg-gray-100 dark:bg-gray-800/50 rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            What Can Your Copilot Do?
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Discover capabilities and try example prompts
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search prompts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {CATEGORIES.map((category) => {
          const Icon = category.icon;
          const isActive = selectedCategory === category.id;
          return (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                isActive
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
            >
              <Icon className="w-4 h-4" />
              {category.label}
            </button>
          );
        })}
      </div>

      {/* Popular Quick Actions */}
      {selectedCategory === 'all' && !searchQuery && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Popular Prompts
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {popularPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => onTryPrompt?.(prompt)}
                className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 rounded-full text-sm text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Use Case Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AnimatePresence mode="popLayout">
          {filteredUseCases.map((useCase, index) => {
            const Icon = useCase.icon;
            return (
              <motion.div
                key={useCase.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
                className="bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700/50 rounded-xl p-5 hover:shadow-md transition-shadow"
              >
                {/* Header */}
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">
                        {useCase.title}
                      </h3>
                      {useCase.isPopular && (
                        <Badge
                          variant="secondary"
                          className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                        >
                          Popular
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      {useCase.description}
                    </p>
                  </div>
                </div>

                {/* Prompts */}
                <div className="space-y-2">
                  {useCase.prompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => onTryPrompt?.(prompt)}
                      className={cn(
                        'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors',
                        'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800',
                        'text-gray-700 dark:text-gray-300'
                      )}
                    >
                      <span className="truncate">{prompt}</span>
                      <Play className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    </button>
                  ))}
                </div>

                {/* Skills link */}
                {useCase.skills && useCase.skills.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        Powered by {useCase.skills.length} skill
                        {useCase.skills.length > 1 ? 's' : ''}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Empty State */}
      {filteredUseCases.length === 0 && (
        <div className="text-center py-12">
          <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            No matching prompts
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Try a different search term or category
          </p>
        </div>
      )}

      {/* Suggestion CTA */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-xl p-4 text-center">
        <Lightbulb className="w-6 h-6 text-amber-500 mx-auto mb-2" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Have an idea for a new capability?
        </p>
        <Button variant="outline" size="sm" className="mt-2">
          Suggest Feature
        </Button>
      </div>
    </div>
  );
}

export default UseCaseLibrary;
