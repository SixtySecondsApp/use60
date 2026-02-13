import { useMemo } from 'react';
import { useOrgStore } from '@/lib/stores/orgStore';
import { useICPProfiles } from '@/lib/hooks/useICPProfilesCRUD';
import type { ICPProfile, ICPCriteria } from '@/lib/types/prospecting';

interface ActiveICPResult {
  activeICP: ICPProfile | null;
  icpDefaults: Record<string, string>;
  isLoading: boolean;
}

function buildTargetAudience(criteria: ICPCriteria): string {
  const parts: string[] = [];

  if (criteria.title_keywords?.length) {
    parts.push(criteria.title_keywords.slice(0, 3).join(' and '));
  }

  if (criteria.industries?.length) {
    parts.push(`in ${criteria.industries.join(', ')}`);
  }

  if (criteria.location_cities?.length) {
    parts.push(`in ${criteria.location_cities.join(', ')}`);
  } else if (criteria.location_countries?.length) {
    parts.push(`in ${criteria.location_countries.join(', ')}`);
  }

  return parts.join(' ');
}

function buildCompanySize(criteria: ICPCriteria): string {
  const range = criteria.employee_ranges?.[0];
  if (!range) return 'Any size';

  if (range.max <= 50) return 'Small (1-50)';
  if (range.max <= 500) return 'Medium (51-500)';
  if (range.max > 500 || range.min >= 500) return 'Large (500+)';

  return 'Any size';
}

function buildSearchType(criteria: ICPCriteria): string {
  if (criteria.title_keywords?.length || criteria.seniority_levels?.length) {
    return 'Contacts (people)';
  }
  return 'Companies';
}

function buildDefaults(criteria: ICPCriteria): Record<string, string> {
  const defaults: Record<string, string> = {};

  const audience = buildTargetAudience(criteria);
  if (audience) defaults.target_audience = audience;

  defaults.company_size = buildCompanySize(criteria);
  defaults.search_type = buildSearchType(criteria);

  return defaults;
}

export function useActiveICP(): ActiveICPResult {
  const orgId = useOrgStore((s) => s.activeOrgId) ?? undefined;
  const { data: profiles, isLoading } = useICPProfiles(orgId);

  return useMemo(() => {
    if (!profiles?.length) {
      return { activeICP: null, icpDefaults: {}, isLoading };
    }

    const activeICP = profiles.find((p) => p.is_active) ?? profiles[0];
    const icpDefaults = buildDefaults(activeICP.criteria);

    return { activeICP, icpDefaults, isLoading };
  }, [profiles, isLoading]);
}
