import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';

export interface CommandCentreSkill {
  id: string;
  skillKey: string;
  label: string;
  description: string;
  icon: string;
  color: string;
}

/** Color map by icon name for visual variety in the dropdown */
const ICON_COLORS: Record<string, string> = {
  mail: 'text-blue-500',
  'file-text': 'text-amber-500',
  'file-search': 'text-cyan-500',
  'refresh-cw': 'text-purple-500',
  phone: 'text-green-500',
  'file-edit': 'text-indigo-500',
};

/**
 * Fetches organization skills that have command_centre.enabled === true
 * and shapes them for the SlashCommandDropdown component.
 */
export function useCommandCentreSkills(organizationId: string | null) {
  return useQuery({
    queryKey: ['command-centre-skills', organizationId],
    queryFn: async (): Promise<CommandCentreSkill[]> => {
      if (!organizationId) return [];

      const { data, error } = await supabase.rpc(
        'get_organization_skills_for_agent',
        { p_org_id: organizationId }
      ) as {
        data: Array<{
          skill_key: string;
          category: string;
          frontmatter: Record<string, unknown>;
          content: string;
          is_enabled: boolean;
        }> | null;
        error: { message: string } | null;
      };

      if (error) {
        console.error('[useCommandCentreSkills] RPC error:', error);
        return [];
      }

      if (!data) return [];

      return data
        .filter((skill) => {
          const cc = skill.frontmatter?.command_centre as Record<string, unknown> | undefined;
          return cc?.enabled === true && skill.is_enabled;
        })
        .map((skill) => {
          const cc = skill.frontmatter.command_centre as Record<string, unknown>;
          const icon = (cc.icon as string) || 'wand-2';
          return {
            id: skill.skill_key,
            skillKey: skill.skill_key,
            label: (cc.label as string) || `/${skill.skill_key}`,
            description: (cc.description as string) || (skill.frontmatter.description as string) || '',
            icon,
            color: ICON_COLORS[icon] || 'text-slate-500',
          };
        });
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
