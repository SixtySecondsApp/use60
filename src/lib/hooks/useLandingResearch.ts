/**
 * useLandingResearch
 *
 * React hook that manages auto-research state for the Landing Page Builder.
 * Calls the landing-research edge function, saves results to workspace.
 * Research runs in parallel with the Strategist — never blocks the user.
 */

import { useState, useCallback, useRef } from 'react';
import { runLandingResearch, type ResearchRequest } from '@/lib/services/landingResearchService';
import { landingBuilderWorkspaceService } from '@/lib/services/landingBuilderWorkspaceService';
import type { LandingResearchData } from '@/components/landing-builder/types';
import logger from '@/lib/utils/logger';

interface UseLandingResearchParams {
  conversationId: string | undefined;
}

export function useLandingResearch({ conversationId }: UseLandingResearchParams) {
  const [research, setResearch] = useState<LandingResearchData | null>(null);
  const [isResearching, setIsResearching] = useState(false);
  const abortRef = useRef(false);

  const startResearch = useCallback(
    async (request: ResearchRequest) => {
      if (isResearching || abortRef.current) return;

      setIsResearching(true);
      setResearch({ status: 'running' } as LandingResearchData);

      try {
        const result = await runLandingResearch(request);
        if (abortRef.current) return;

        setResearch(result);

        // Persist to workspace (non-blocking)
        if (conversationId) {
          landingBuilderWorkspaceService
            .updateResearch(conversationId, result)
            .catch((err) => logger.error('[useLandingResearch] Failed to persist research:', err));
        }
      } catch (err) {
        if (abortRef.current) return;
        logger.error('[useLandingResearch] Research failed:', err);
        setResearch({
          status: 'failed',
          company: null,
          competitors: [],
          market_context: {
            messaging_patterns: [],
            social_proof_examples: [],
            pricing_signals: [],
            audience_language: [],
            market_trends: [],
            buying_triggers: [],
            review_ratings: [],
            notable_customers: [],
          },
          sources: [],
          cost_credits: 0,
          duration_ms: 0,
        });
      } finally {
        if (!abortRef.current) {
          setIsResearching(false);
        }
      }
    },
    [conversationId, isResearching],
  );

  const reset = useCallback(() => {
    abortRef.current = true;
    setResearch(null);
    setIsResearching(false);
    // Allow future calls after reset
    setTimeout(() => { abortRef.current = false; }, 0);
  }, []);

  return { research, isResearching, startResearch, reset };
}
