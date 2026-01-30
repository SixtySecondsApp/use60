/**
 * PlatformSkillViewPage
 *
 * Full-page view for previewing, testing, and editing a platform skill.
 * URL: /platform/skills/:category/:skillKey
 *
 * Features:
 * - Preview tab: View compiled skill content
 * - Test tab: Test skill with sample inputs
 * - Folders tab: Edit skill with folder structure (SkillDetailView)
 */

import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Edit2,
  Eye,
  Play,
  Sparkles,
  FileText,
  Database,
  Server,
  LayoutTemplate,
  Workflow,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  FolderTree,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SkillPreview } from '@/components/platform/SkillPreview';
import { SkillTestConsole } from '@/components/platform/SkillTestConsole';
import {
  type PlatformSkill,
  type SkillCategory,
  usePlatformSkillOperations,
} from '@/lib/hooks/usePlatformSkills';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/clientV2';
import { SkillDetailView } from '@/components/platform/SkillDetailView';

const CATEGORY_ICONS: Record<SkillCategory | 'agent-sequence', React.ElementType> = {
  'sales-ai': Sparkles,
  writing: FileText,
  enrichment: Database,
  workflows: Workflow,
  'data-access': Server,
  'output-format': LayoutTemplate,
  'agent-sequence': Workflow,
};

const CATEGORY_COLORS: Record<SkillCategory, string> = {
  'sales-ai': 'from-indigo-500 to-purple-600',
  writing: 'from-emerald-500 to-teal-600',
  enrichment: 'from-blue-500 to-cyan-600',
  workflows: 'from-orange-500 to-amber-600',
  'data-access': 'from-slate-500 to-gray-600',
  'output-format': 'from-pink-500 to-rose-600',
};

async function fetchSkillByKey(skillKey: string): Promise<PlatformSkill | null> {
  const { data, error } = await supabase
    .from('platform_skills')
    .select('*')
    .eq('skill_key', skillKey)
    .maybeSingle();

  if (error) {
    console.error('Error fetching skill:', error);
    throw error;
  }

  return data as PlatformSkill | null;
}

export default function PlatformSkillViewPage() {
  const { category, skillKey } = useParams<{ category: string; skillKey: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'preview' | 'test' | 'folders'>('preview');

  const operations = usePlatformSkillOperations(user?.id || '');

  const {
    data: skill,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['platform-skill', skillKey],
    queryFn: () => fetchSkillByKey(skillKey!),
    enabled: !!skillKey,
  });

  const handleToggleActive = async () => {
    if (skill) {
      await operations.toggle(skill.id, !skill.is_active);
      refetch();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
            <div className="h-12 w-3/4 bg-gray-200 dark:bg-gray-800 rounded" />
            <div className="h-[500px] bg-gray-200 dark:bg-gray-800 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !skill) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <FileText className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Skill not found
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            The skill "{skillKey}" could not be found.
          </p>
          <Button onClick={() => navigate(`/platform/skills/${category || 'sales-ai'}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Skills
          </Button>
        </div>
      </div>
    );
  }

  const skillCategory = skill.category as SkillCategory;
  const CategoryIcon = CATEGORY_ICONS[skillCategory] || FileText;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700/50">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            {/* Back & Title */}
            <div className="flex items-center gap-4">
              <Link
                to={`/platform/skills/${category || skill.category}`}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </Link>
              <div
                className={cn(
                  'p-3 rounded-xl bg-gradient-to-br text-white shadow-lg',
                  CATEGORY_COLORS[skillCategory] || 'from-gray-500 to-gray-600'
                )}
              >
                <CategoryIcon className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {skill.frontmatter.name}
                  </h1>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs',
                      skill.is_active
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                    )}
                  >
                    {skill.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 font-mono">
                  {skill.skill_key}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleActive}
                disabled={operations.isProcessing}
              >
                {skill.is_active ? (
                  <ToggleRight className="w-4 h-4 text-green-600" />
                ) : (
                  <ToggleLeft className="w-4 h-4 text-gray-400" />
                )}
              </Button>
              <Link to={`/platform/skills/${category || skill.category}/${skillKey}/edit`}>
                <Button className="gap-2">
                  <Edit2 className="w-4 h-4" />
                  Edit Skill
                </Button>
              </Link>
            </div>
          </div>

          {/* Description */}
          {skill.frontmatter.description && (
            <p className="text-gray-600 dark:text-gray-300 mt-4 max-w-3xl">
              {skill.frontmatter.description}
            </p>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="border-b border-gray-200 dark:border-gray-700/50">
        <div className="max-w-6xl mx-auto px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('preview')}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2',
                  activeTab === 'preview'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
              <button
                onClick={() => setActiveTab('test')}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2',
                  activeTab === 'test'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                <Play className="w-4 h-4" />
                Test
              </button>
              <button
                onClick={() => setActiveTab('folders')}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2',
                  activeTab === 'folders'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                <FolderTree className="w-4 h-4" />
                Folders
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'folders' ? (
        // Full-height folders view with split pane
        <div className="flex-1 h-[calc(100vh-260px)]">
          <SkillDetailView
            skillId={skill.id}
            onBack={() => setActiveTab('preview')}
          />
        </div>
      ) : (
        <div className="max-w-6xl mx-auto px-6 py-6">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="min-h-[600px]"
          >
            {activeTab === 'preview' ? (
              <SkillPreview skill={skill} />
            ) : (
              <SkillTestConsole skillKey={skill.skill_key} />
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
