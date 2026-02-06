/**
 * PlatformSkillEditPage
 *
 * Full-page editor for creating or editing a platform skill.
 * URL: /platform/skills/:category/:skillKey/edit (edit existing)
 * URL: /platform/skills/:category/new (create new)
 */

import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Sparkles,
  FileText,
  Database,
  Server,
  LayoutTemplate,
  Workflow,
  GitBranch,
  FileCode,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { SkillDocumentEditor } from '@/components/platform/SkillDocumentEditor';
import {
  type PlatformSkill,
  type SkillCategory,
  type CreatePlatformSkillInput,
  type UpdatePlatformSkillInput,
  usePlatformSkillOperations,
  SKILL_CATEGORIES,
} from '@/lib/hooks/usePlatformSkills';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/clientV2';
import { Button } from '@/components/ui/button';

const CATEGORY_ICONS: Record<SkillCategory, React.ElementType> = {
  'sales-ai': Sparkles,
  writing: FileText,
  enrichment: Database,
  workflows: Workflow,
  'data-access': Server,
  'output-format': LayoutTemplate,
  'agent-sequence': GitBranch,
};

const CATEGORY_COLORS: Record<SkillCategory, string> = {
  'sales-ai': 'from-indigo-500 to-purple-600',
  writing: 'from-emerald-500 to-teal-600',
  enrichment: 'from-blue-500 to-cyan-600',
  workflows: 'from-orange-500 to-amber-600',
  'data-access': 'from-slate-500 to-gray-600',
  'output-format': 'from-pink-500 to-rose-600',
  'agent-sequence': 'from-violet-500 to-indigo-600',
};

const VALID_CATEGORIES = SKILL_CATEGORIES.map(c => c.value);

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

export default function PlatformSkillEditPage() {
  const { category, skillKey } = useParams<{ category: string; skillKey: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const isNewSkill = skillKey === 'new';
  const validCategory: SkillCategory = VALID_CATEGORIES.includes(category as SkillCategory)
    ? (category as SkillCategory)
    : 'sales-ai';

  const operations = usePlatformSkillOperations(user?.id || '');

  const {
    data: skill,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['platform-skill', skillKey],
    queryFn: () => fetchSkillByKey(skillKey!),
    enabled: !isNewSkill && !!skillKey,
  });

  const handleSave = async (input: CreatePlatformSkillInput | UpdatePlatformSkillInput) => {
    try {
      if (isNewSkill) {
        await operations.create(input as CreatePlatformSkillInput);
        // Navigate to the new skill's view page
        const newSkillKey = (input as CreatePlatformSkillInput).skill_key;
        navigate(`/platform/skills/${validCategory}/${newSkillKey}`);
      } else if (skill) {
        await operations.update(skill.id, input as UpdatePlatformSkillInput);
        navigate(`/platform/skills/${category}/${skillKey}`);
      }
    } catch (error) {
      // Error handling is done in the hook
    }
  };

  const handleCancel = () => {
    if (isNewSkill) {
      navigate(`/platform/skills/${validCategory}`);
    } else {
      navigate(`/platform/skills/${category}/${skillKey}`);
    }
  };

  if (!isNewSkill && isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
            <div className="h-12 w-3/4 bg-gray-200 dark:bg-gray-800 rounded" />
            <div className="h-[600px] bg-gray-200 dark:bg-gray-800 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!isNewSkill && (error || !skill)) {
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

  const skillCategory = (skill?.category || validCategory) as SkillCategory;
  const CategoryIcon = CATEGORY_ICONS[skillCategory] || FileCode;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col">
      <BackToPlatform />
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700/50 shrink-0">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              to={isNewSkill ? `/platform/skills/${validCategory}` : `/platform/skills/${category}/${skillKey}`}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </Link>
            <div
              className={cn(
                'p-2.5 rounded-xl bg-gradient-to-br text-white shadow-lg',
                CATEGORY_COLORS[skillCategory] || 'from-gray-500 to-gray-600'
              )}
            >
              <CategoryIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {isNewSkill ? 'Create New Skill' : `Edit: ${skill?.frontmatter.name}`}
              </h1>
              {!isNewSkill && skill && (
                <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                  {skill.skill_key}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <div className="max-w-6xl mx-auto px-6 py-6 h-full">
          <SkillDocumentEditor
            skill={isNewSkill ? undefined : skill!}
            category={skillCategory}
            onSave={handleSave}
            onCancel={handleCancel}
            isLoading={operations.isCreating || operations.isUpdating}
          />
        </div>
      </div>
    </div>
  );
}
