// Profile Version History Types

import type { FactProfileResearchData, ResearchSource } from './factProfile';
import type { ProductProfileResearchData } from './productProfile';
import type { ICPCriteria } from './prospecting';

// ---------------------------------------------------------------------------
// Profile type union + table config
// ---------------------------------------------------------------------------

export type ProfileType = 'fact_profile' | 'product_profile' | 'icp_profile';

export const VERSION_TABLE_CONFIG: Record<
  ProfileType,
  { table: string; fkColumn: string; parentTable: string }
> = {
  fact_profile: {
    table: 'fact_profile_versions',
    fkColumn: 'fact_profile_id',
    parentTable: 'client_fact_profiles',
  },
  product_profile: {
    table: 'product_profile_versions',
    fkColumn: 'product_profile_id',
    parentTable: 'product_profiles',
  },
  icp_profile: {
    table: 'icp_profile_versions',
    fkColumn: 'icp_profile_id',
    parentTable: 'icp_profiles',
  },
};

// ---------------------------------------------------------------------------
// Version row interfaces
// ---------------------------------------------------------------------------

export interface FactProfileVersion {
  id: string;
  fact_profile_id: string;
  version_number: number;
  snapshot: FactProfileResearchData;
  research_sources: ResearchSource[] | null;
  changed_by: string | null;
  change_summary: string | null;
  created_at: string;
}

export interface ProductProfileVersion {
  id: string;
  product_profile_id: string;
  version_number: number;
  snapshot: ProductProfileResearchData;
  research_sources: ResearchSource[] | null;
  changed_by: string | null;
  change_summary: string | null;
  created_at: string;
}

export interface ICPProfileVersion {
  id: string;
  icp_profile_id: string;
  version_number: number;
  snapshot: ICPCriteria;
  name_snapshot: string | null;
  description_snapshot: string | null;
  changed_by: string | null;
  change_summary: string | null;
  created_at: string;
}

/** Union type for any profile version row */
export type ProfileVersion = FactProfileVersion | ProductProfileVersion | ICPProfileVersion;
