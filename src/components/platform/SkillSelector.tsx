/**
 * SkillSelector Component
 *
 * Dropdown component for selecting skills when building agent sequences.
 * Groups skills by category and shows their inputs/outputs.
 */

import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAvailableSkillsForSequence } from '@/lib/hooks/useAgentSequences';
import { SKILL_CATEGORIES } from '@/lib/services/platformSkillService';
import { cn } from '@/lib/utils';
import { Sparkles, FileText, Database, Workflow, Server, LayoutTemplate } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

interface SkillSelectorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  excludeSkillKeys?: string[];
  className?: string;
}

interface SkillOption {
  id: string;
  skill_key: string;
  category: string;
  frontmatter: {
    name?: string;
    description?: string;
    requires_context?: string[];
    outputs?: string[];
  };
  is_active: boolean;
}

// =============================================================================
// Category Icons
// =============================================================================

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'sales-ai': Sparkles,
  writing: FileText,
  enrichment: Database,
  workflows: Workflow,
  'data-access': Server,
  'output-format': LayoutTemplate,
};

// =============================================================================
// Component
// =============================================================================

export function SkillSelector({
  value,
  onChange,
  placeholder = 'Select a skill...',
  disabled = false,
  excludeSkillKeys = [],
  className,
}: SkillSelectorProps) {
  const { data: skills, isLoading } = useAvailableSkillsForSequence();

  // Group skills by category
  const groupedSkills = useMemo(() => {
    if (!skills) return {};

    const filtered = skills.filter(
      (skill: SkillOption) => !excludeSkillKeys.includes(skill.skill_key)
    );

    return filtered.reduce(
      (acc, skill: SkillOption) => {
        const category = skill.category;
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(skill);
        return acc;
      },
      {} as Record<string, SkillOption[]>
    );
  }, [skills, excludeSkillKeys]);

  // Find selected skill for display
  const selectedSkill = useMemo(() => {
    if (!skills || !value) return null;
    return skills.find((skill: SkillOption) => skill.skill_key === value);
  }, [skills, value]);

  // Get category label
  const getCategoryLabel = (category: string) => {
    const cat = SKILL_CATEGORIES.find((c) => c.value === category);
    return cat?.label || category;
  };

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || isLoading}>
      <SelectTrigger className={cn('w-full', className)}>
        <SelectValue placeholder={isLoading ? 'Loading skills...' : placeholder}>
          {selectedSkill && (
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {selectedSkill.frontmatter?.name || selectedSkill.skill_key}
              </span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[400px]">
        {Object.entries(groupedSkills).map(([category, categorySkills]) => {
          const Icon = CATEGORY_ICONS[category] || Sparkles;
          return (
            <SelectGroup key={category}>
              <SelectLabel className="flex items-center gap-2 text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {getCategoryLabel(category)}
              </SelectLabel>
              {categorySkills.map((skill: SkillOption) => (
                <SelectItem
                  key={skill.skill_key}
                  value={skill.skill_key}
                  className="py-2 cursor-pointer"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {skill.frontmatter?.name || skill.skill_key}
                      </span>
                    </div>
                    {skill.frontmatter?.description && (
                      <span className="text-xs text-muted-foreground line-clamp-1">
                        {skill.frontmatter.description}
                      </span>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {skill.frontmatter?.requires_context &&
                        skill.frontmatter.requires_context.length > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            Needs: {skill.frontmatter.requires_context.slice(0, 2).join(', ')}
                            {skill.frontmatter.requires_context.length > 2 && '...'}
                          </Badge>
                        )}
                      {skill.frontmatter?.outputs && skill.frontmatter.outputs.length > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          Outputs: {skill.frontmatter.outputs.slice(0, 2).join(', ')}
                          {skill.frontmatter.outputs.length > 2 && '...'}
                        </Badge>
                      )}
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
        {Object.keys(groupedSkills).length === 0 && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No skills available
          </div>
        )}
      </SelectContent>
    </Select>
  );
}

// =============================================================================
// Skill Info Display
// =============================================================================

interface SkillInfoProps {
  skillKey: string;
  className?: string;
}

export function SkillInfo({ skillKey, className }: SkillInfoProps) {
  const { data: skills } = useAvailableSkillsForSequence();

  const skill = useMemo(() => {
    if (!skills) return null;
    return skills.find((s: SkillOption) => s.skill_key === skillKey);
  }, [skills, skillKey]);

  if (!skill) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        Skill not found: {skillKey}
      </div>
    );
  }

  const Icon = CATEGORY_ICONS[skill.category] || Sparkles;

  return (
    <div className={cn('rounded-lg border bg-card p-3', className)}>
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm">{skill.frontmatter?.name || skill.skill_key}</h4>
          <code className="text-xs text-muted-foreground">{skill.skill_key}</code>
          {skill.frontmatter?.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {skill.frontmatter.description}
            </p>
          )}
          <div className="flex flex-wrap gap-1 mt-2">
            {Array.isArray(skill.frontmatter?.requires_context) && skill.frontmatter.requires_context.map((ctx: string) => (
              <Badge key={ctx} variant="outline" className="text-[10px]">
                Needs: {ctx}
              </Badge>
            ))}
            {Array.isArray(skill.frontmatter?.outputs) && skill.frontmatter.outputs.map((out: string) => (
              <Badge key={out} variant="secondary" className="text-[10px]">
                → {out}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SkillSelector;
