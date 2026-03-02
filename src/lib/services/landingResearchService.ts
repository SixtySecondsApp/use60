/**
 * Landing Research Service
 *
 * Thin wrapper around the landing-research edge function.
 * Called from useLandingResearch hook to trigger auto-research
 * when the Landing Page Builder starts.
 */

import { supabase } from '@/lib/supabase/clientV2';
import type { LandingResearchData } from '@/components/landing-builder/types';
import logger from '@/lib/utils/logger';

export interface ResearchRequest {
  brief: Record<string, string>;
  company_domain?: string;
  company_name?: string;
  org_id?: string;
}

export async function runLandingResearch(request: ResearchRequest): Promise<LandingResearchData> {
  const { data, error } = await supabase.functions.invoke('landing-research', {
    body: request,
  });

  if (error) {
    logger.error('[landingResearch] Edge function error:', error);
    throw error;
  }

  return data as LandingResearchData;
}
