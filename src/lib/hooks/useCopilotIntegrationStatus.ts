/**
 * useCopilotIntegrationStatus
 *
 * Lightweight hook that aggregates connection status for all integrations
 * shown in the Copilot sidebar's Connected section. Queries DB tables directly
 * to avoid triggering heavy hooks (edge function calls, realtime subscriptions).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrg } from '@/lib/contexts/OrgContext';
import type { Integration } from '@/components/copilot/CopilotRightPanel';

export function useCopilotIntegrationStatus(): {
  integrations: Integration[];
  isLoading: boolean;
} {
  const { user } = useAuth();
  const { activeOrgId } = useOrg();

  const { data, isLoading } = useQuery({
    queryKey: ['copilot', 'integration-status', user?.id, activeOrgId],
    queryFn: async (): Promise<Integration[]> => {
      if (!user?.id) return buildDefaults();

      // Run all status checks in parallel
      const [hubspot, fathom, slack, google] = await Promise.all([
        // HubSpot: org-level integration
        activeOrgId
          ? supabase
              .from('hubspot_integrations')
              .select('id, is_connected')
              .eq('org_id', activeOrgId)
              .eq('is_active', true)
              .maybeSingle()
              .then((r) => {
                if (r.error) {
                  console.warn('[CopilotIntegrations] HubSpot status check failed:', r.error.message);
                  return false;
                }
                return Boolean(r.data?.is_connected);
              })
          : Promise.resolve(false),

        // Fathom: per-user integration
        supabase
          .from('fathom_integrations')
          .select('id, is_active')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle()
          .then((r) => {
            if (r.error) {
              console.warn('[CopilotIntegrations] Fathom status check failed:', r.error.message);
              return false;
            }
            return Boolean(r.data);
          }),

        // Slack: org-level via RPC (safe subset, no token exposure)
        activeOrgId
          ? supabase
              .rpc('get_slack_org_settings_public', { p_org_id: activeOrgId })
              .then((r) => {
                if (r.error) {
                  console.warn('[CopilotIntegrations] Slack RPC failed, trying direct query:', r.error.message);
                  // Fallback: direct query for safe columns
                  return supabase
                    .from('slack_org_settings')
                    .select('is_connected')
                    .eq('org_id', activeOrgId)
                    .maybeSingle()
                    .then((r2) => {
                      if (r2.error) {
                        console.warn('[CopilotIntegrations] Slack fallback query failed:', r2.error.message);
                        return false;
                      }
                      return Boolean(r2.data?.is_connected);
                    });
                }
                return Boolean((r.data as Record<string, unknown>)?.is_connected);
              })
          : Promise.resolve(false),

        // Google Calendar: per-user integration
        supabase
          .from('google_integrations')
          .select('id, is_active')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle()
          .then((r) => {
            if (r.error) {
              console.warn('[CopilotIntegrations] Google Calendar status check failed:', r.error.message);
              return false;
            }
            return Boolean(r.data);
          }),
      ]);

      return [
        { id: 'hubspot', name: 'HubSpot', connected: hubspot, settingsUrl: '/settings/integrations/hubspot' },
        { id: 'fathom', name: 'Fathom', connected: fathom, settingsUrl: '/settings/integrations/fathom' },
        { id: 'slack', name: 'Slack', connected: slack, settingsUrl: '/settings/integrations/slack' },
        { id: 'calendar', name: 'Calendar', connected: google, settingsUrl: '/settings/integrations/calendar' },
      ];
    },
    enabled: !!user?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    integrations: data ?? buildDefaults(),
    isLoading,
  };
}

function buildDefaults(): Integration[] {
  return [
    { id: 'hubspot', name: 'HubSpot', connected: false, settingsUrl: '/settings/integrations/hubspot' },
    { id: 'fathom', name: 'Fathom', connected: false, settingsUrl: '/settings/integrations/fathom' },
    { id: 'slack', name: 'Slack', connected: false, settingsUrl: '/settings/integrations/slack' },
    { id: 'calendar', name: 'Calendar', connected: false, settingsUrl: '/settings/integrations/calendar' },
  ];
}
