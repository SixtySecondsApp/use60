import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';

/**
 * Hook to check if a user has an inactive Fathom integration that needs reconnection.
 * This is separate from useFathomIntegration which only returns active integrations.
 *
 * An integration needs reconnection when:
 * - It exists but is_active = false (token was revoked or refresh failed)
 */
export interface InactiveIntegration {
  id: string;
  type: 'fathom';
  fathom_user_email: string | null;
  updated_at: string;
}

export function useIntegrationReconnectNeeded() {
  const { user } = useAuth();
  const [needsReconnect, setNeedsReconnect] = useState<InactiveIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) {
      setNeedsReconnect(null);
      setLoading(false);
      return;
    }

    const checkInactiveIntegrations = async () => {
      try {
        setLoading(true);
        const supabaseAny = supabase as any;

        // Check for inactive Fathom integration (token revoked)
        const { data: inactiveFathom, error } = await supabaseAny
          .from('fathom_integrations')
          .select('id, fathom_user_email, updated_at')
          .eq('user_id', user.id)
          .eq('is_active', false)
          .maybeSingle();

        if (error) {
          console.error('[useIntegrationReconnectNeeded] Error checking inactive integrations:', error);
          setNeedsReconnect(null);
          return;
        }

        if (inactiveFathom) {
          // Check if this was dismissed recently (stored per integration ID)
          const dismissKey = `integration-reconnect-dismissed-${inactiveFathom.id}`;
          const dismissedAt = localStorage.getItem(dismissKey);
          if (dismissedAt) {
            // Don't show banner for 24 hours after dismissal
            const dismissedTime = parseInt(dismissedAt, 10);
            if (Date.now() - dismissedTime < 24 * 60 * 60 * 1000) {
              setDismissed(true);
              setNeedsReconnect(null);
              return;
            }
          }

          setNeedsReconnect({
            id: inactiveFathom.id,
            type: 'fathom',
            fathom_user_email: inactiveFathom.fathom_user_email,
            updated_at: inactiveFathom.updated_at,
          });
        } else {
          setNeedsReconnect(null);
        }
      } catch (err) {
        console.error('[useIntegrationReconnectNeeded] Error:', err);
        setNeedsReconnect(null);
      } finally {
        setLoading(false);
      }
    };

    checkInactiveIntegrations();

    // Set up real-time subscription to detect when integration becomes inactive
    const supabaseAny = supabase as any;
    const subscription = supabaseAny
      .channel(`fathom_integrations_inactive_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'fathom_integrations',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Re-check when integration changes
          checkInactiveIntegrations();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  const dismiss = () => {
    if (needsReconnect) {
      const dismissKey = `integration-reconnect-dismissed-${needsReconnect.id}`;
      localStorage.setItem(dismissKey, Date.now().toString());
      setDismissed(true);
      setNeedsReconnect(null);
    }
  };

  return {
    needsReconnect,
    loading,
    dismissed,
    dismiss,
  };
}
