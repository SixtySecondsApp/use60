/**
 * PlatformSkillConfigStep
 *
 * Phase 7: Platform skills configuration during onboarding.
 * Shows compiled skill previews from platform templates.
 * Allows users to enable/disable skills with expandable previews.
 *
 * Follows Sixty Design System with glassmorphic dark mode.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Zap,
  FileText,
  Target,
  Mail,
  Database,
  LayoutTemplate,
  RefreshCw,
} from 'lucide-react';
import { useOnboardingV2Store, type CompiledSkill } from '@/lib/stores/onboardingV2Store';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

// ============================================================================
// Category Configuration
// ============================================================================

const CATEGORY_CONFIG: Record<
  CompiledSkill['category'],
  { label: string; icon: typeof Zap; color: string }
> = {
  'sales-ai': {
    label: 'Sales AI',
    icon: Target,
    color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  },
  writing: {
    label: 'Writing',
    icon: Mail,
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  enrichment: {
    label: 'Enrichment',
    icon: Zap,
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  workflows: {
    label: 'Workflows',
    icon: FileText,
    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  'data-access': {
    label: 'Data Access',
    icon: Database,
    color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  },
  'output-format': {
    label: 'Output Format',
    icon: LayoutTemplate,
    color: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
  },
};

// ============================================================================
// Skill Card Component
// ============================================================================

interface SkillCardProps {
  skill: CompiledSkill;
  onToggle: (enabled: boolean) => void;
}

function SkillCard({ skill, onToggle }: SkillCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const categoryConfig = CATEGORY_CONFIG[skill.category] || CATEGORY_CONFIG['sales-ai'];
  const CategoryIcon = categoryConfig.icon;

  return (
    <div
      className={cn(
        'bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm',
        'border border-gray-200 dark:border-gray-700/50',
        'rounded-xl overflow-hidden transition-all duration-200',
        'hover:border-gray-300 dark:hover:border-gray-600/50',
        !skill.is_enabled && 'opacity-60'
      )}
    >
      {/* Header */}
      <div className="p-4 flex items-start gap-4">
        {/* Icon */}
        <div
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
            skill.is_enabled
              ? 'bg-violet-100 dark:bg-violet-900/30'
              : 'bg-gray-100 dark:bg-gray-800'
          )}
        >
          <CategoryIcon
            className={cn(
              'w-5 h-5',
              skill.is_enabled
                ? 'text-violet-600 dark:text-violet-400'
                : 'text-gray-400 dark:text-gray-500'
            )}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate">
              {skill.frontmatter.name || skill.skill_key}
            </h4>
            <span
              className={cn(
                'px-2 py-0.5 text-xs font-medium rounded-full shrink-0',
                categoryConfig.color
              )}
            >
              {categoryConfig.label}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
            {skill.frontmatter.description || 'No description available'}
          </p>
        </div>

        {/* Toggle */}
        <div className="shrink-0">
          <Switch
            checked={skill.is_enabled}
            onCheckedChange={onToggle}
            aria-label={`Enable ${skill.frontmatter.name}`}
          />
        </div>
      </div>

      {/* Preview Toggle */}
      <div className="border-t border-gray-200 dark:border-gray-700/50">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'w-full px-4 py-2.5 text-sm transition-colors',
            'flex items-center justify-between',
            'text-gray-600 dark:text-gray-400',
            'hover:bg-gray-50 dark:hover:bg-gray-800/30'
          )}
        >
          <span className="font-medium">Preview skill</span>
          <ChevronDown
            className={cn(
              'w-4 h-4 transition-transform duration-200',
              isExpanded && 'rotate-180'
            )}
          />
        </button>

        {/* Expanded Preview */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4">
                <div
                  className={cn(
                    'bg-gray-50 dark:bg-gray-800/50',
                    'border border-gray-200 dark:border-gray-700/50',
                    'rounded-lg p-4',
                    'prose prose-sm dark:prose-invert max-w-none',
                    'max-h-64 overflow-y-auto'
                  )}
                >
                  {/* Frontmatter Info */}
                  {skill.frontmatter.triggers && skill.frontmatter.triggers.length > 0 && (
                    <div className="mb-3 not-prose">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                        Triggers
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {skill.frontmatter.triggers.map((trigger, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                          >
                            {trigger}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Compiled Content Preview */}
                  <div className="not-prose">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                      Content Preview
                    </p>
                    <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono bg-white dark:bg-gray-900/50 p-3 rounded border border-gray-200 dark:border-gray-700/50">
                      {skill.compiled_content.slice(0, 500)}
                      {skill.compiled_content.length > 500 && '...'}
                    </pre>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function PlatformSkillConfigStep() {
  const {
    organizationId,
    compiledSkills,
    isCompiledSkillsLoading,
    compiledSkillsError,
    isSaving,
    fetchCompiledSkills,
    toggleCompiledSkillEnabled,
    saveCompiledSkillPreferences,
    setStep,
  } = useOnboardingV2Store();

  // Fetch skills on mount
  useEffect(() => {
    if (organizationId && compiledSkills.length === 0) {
      fetchCompiledSkills(organizationId);
    }
  }, [organizationId, compiledSkills.length, fetchCompiledSkills]);

  // Group skills by category
  const skillsByCategory = compiledSkills.reduce(
    (acc, skill) => {
      const category = skill.category || 'sales-ai';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(skill);
      return acc;
    },
    {} as Record<string, CompiledSkill[]>
  );

  const handleToggleSkill = useCallback(
    (skillKey: string, enabled: boolean) => {
      toggleCompiledSkillEnabled(skillKey, enabled);
    },
    [toggleCompiledSkillEnabled]
  );

  const handleSave = useCallback(async () => {
    if (organizationId) {
      await saveCompiledSkillPreferences(organizationId);
    }
  }, [organizationId, saveCompiledSkillPreferences]);

  const handleRefresh = useCallback(async () => {
    if (organizationId) {
      await fetchCompiledSkills(organizationId);
    }
  }, [organizationId, fetchCompiledSkills]);

  const enabledCount = compiledSkills.filter((s) => s.is_enabled).length;

  // Loading state
  if (isCompiledSkillsLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="w-full max-w-2xl mx-auto px-4"
      >
        <div className="bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-2xl p-8 shadow-sm dark:shadow-none">
          <div className="flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-8 h-8 text-violet-600 dark:text-violet-400 animate-spin" />
            <div className="text-center">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                Preparing your AI skills
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Customizing skills based on your company profile...
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Error state
  if (compiledSkillsError) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="w-full max-w-2xl mx-auto px-4"
      >
        <div className="bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-2xl p-8 shadow-sm dark:shadow-none">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="text-center">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                Failed to load skills
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {compiledSkillsError}
              </p>
            </div>
            <button
              onClick={handleRefresh}
              className="mt-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-2xl mx-auto px-4"
    >
      <div className="bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-2xl overflow-hidden shadow-sm dark:shadow-none">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-violet-700 px-6 py-5">
          <h2 className="text-xl font-bold text-white">Configure AI Skills</h2>
          <p className="text-violet-100 text-sm mt-1">
            Choose which AI capabilities to enable for your team
          </p>
        </div>

        {/* Skills List */}
        <div className="p-4 sm:p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          {Object.entries(skillsByCategory).map(([category, skills]) => {
            const config = CATEGORY_CONFIG[category as CompiledSkill['category']];
            return (
              <div key={category}>
                {/* Category Header */}
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className={cn(
                      'w-6 h-6 rounded flex items-center justify-center',
                      config?.color || 'bg-gray-100 dark:bg-gray-800'
                    )}
                  >
                    {config?.icon && <config.icon className="w-3.5 h-3.5" />}
                  </div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {config?.label || category}
                  </h3>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ({skills.length})
                  </span>
                </div>

                {/* Skills Grid */}
                <div className="space-y-3">
                  {skills.map((skill) => (
                    <SkillCard
                      key={skill.id}
                      skill={skill}
                      onToggle={(enabled) => handleToggleSkill(skill.skill_key, enabled)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Empty State */}
          {compiledSkills.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                No skills available for configuration
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700/50 px-6 py-4 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {enabledCount} of {compiledSkills.length} skills enabled
          </p>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              'px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium transition-all',
              'flex items-center gap-2',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                Complete Setup
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
