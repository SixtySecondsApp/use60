/**
 * useAbilityPrerequisites Hook
 *
 * Checks if all required integrations for an ability are connected.
 * Returns the readiness status and lists any missing integrations.
 */

import { useMemo } from 'react';
import { getAbilityById, type IntegrationRequirement } from '@/lib/agent/abilityRegistry';
import { useSlackIntegration } from '@/lib/hooks/useSlackIntegration';
import { useIntegrationStore } from '@/lib/stores/integrationStore';
import { useFathomIntegration } from '@/lib/hooks/useFathomIntegration';
import { useInstantlyIntegration } from '@/lib/hooks/useInstantlyIntegration';

// =============================================================================
// Types
// =============================================================================

export interface IntegrationCheck {
  integration: IntegrationRequirement;
  isConnected: boolean;
}

export interface AbilityPrerequisites {
  isReady: boolean;
  missingIntegrations: IntegrationRequirement[];
  checks: IntegrationCheck[];
  isLoading: boolean;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Check if all required integrations for an ability are connected.
 *
 * @param abilityId - The ID of the ability to check
 * @returns Prerequisite status with ready flag and missing integrations list
 *
 * @example
 * ```tsx
 * const { isReady, missingIntegrations, isLoading } = useAbilityPrerequisites('pre-meeting-briefing');
 *
 * if (isLoading) return <Spinner />;
 * if (!isReady) {
 *   return <IntegrationPrompt missing={missingIntegrations} />;
 * }
 * ```
 */
export function useAbilityPrerequisites(abilityId: string): AbilityPrerequisites {
  // Get the ability definition
  const ability = getAbilityById(abilityId);

  // Hook calls MUST be unconditional (React rules of hooks)
  // We call all integration hooks at the top level, then use their results in the memo
  const slackIntegration = useSlackIntegration();
  const googleConnected = useIntegrationStore((state) => state.google.isConnected);
  const googleLoading = useIntegrationStore((state) => state.google.isLoading);
  const fathomIntegration = useFathomIntegration();
  const instantlyIntegration = useInstantlyIntegration();

  // Memoize the result to prevent unnecessary re-renders
  return useMemo(() => {
    // If ability not found or has no required integrations, return ready state
    if (!ability?.requiredIntegrations?.length) {
      return {
        isReady: true,
        missingIntegrations: [],
        checks: [],
        isLoading: false,
      };
    }

    // Check each required integration
    const checks: IntegrationCheck[] = ability.requiredIntegrations.map((req) => {
      let isConnected = false;

      switch (req.integrationId) {
        case 'slack':
          isConnected = slackIntegration.isConnected;
          break;

        case 'google-workspace':
          isConnected = googleConnected;
          break;

        case 'fathom':
          isConnected = fathomIntegration.isConnected;
          break;

        case 'instantly':
          isConnected = instantlyIntegration.isConnected;
          break;

        default:
          // Unknown integration type - treat as not connected
          console.warn(`[useAbilityPrerequisites] Unknown integration type: ${req.integrationId}`);
          isConnected = false;
      }

      return {
        integration: req,
        isConnected,
      };
    });

    // Find any missing integrations
    const missingIntegrations = checks
      .filter((c) => !c.isConnected)
      .map((c) => c.integration);

    // Determine if any integration is still loading
    const isLoading =
      slackIntegration.loading ||
      googleLoading ||
      fathomIntegration.loading ||
      instantlyIntegration.loading;

    return {
      isReady: missingIntegrations.length === 0,
      missingIntegrations,
      checks,
      isLoading,
    };
  }, [
    ability,
    slackIntegration.isConnected,
    slackIntegration.loading,
    googleConnected,
    googleLoading,
    fathomIntegration.isConnected,
    fathomIntegration.loading,
    instantlyIntegration.isConnected,
    instantlyIntegration.loading,
  ]);
}
