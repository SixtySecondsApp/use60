/**
 * useOnboardingVersion
 *
 * Hook for managing the onboarding version feature flag.
 * Reads from and writes to the app_settings table.
 *
 * Key: 'onboarding_version'
 * Values: 'v1' (legacy) | 'v2' (skills-based) | 'v3' (enhanced enrichment + agent teams)
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

export type OnboardingVersion = 'v1' | 'v2' | 'v3';

interface UseOnboardingVersionResult {
  version: OnboardingVersion;
  loading: boolean;
  error: Error | null;
  updateVersion: (newVersion: OnboardingVersion) => Promise<boolean>;
  refetch: () => Promise<void>;
}

const SETTING_KEY = 'onboarding_version';
const DEFAULT_VERSION: OnboardingVersion = 'v3';

export function useOnboardingVersion(): UseOnboardingVersionResult {
  const [version, setVersion] = useState<OnboardingVersion>(DEFAULT_VERSION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchVersion = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', SETTING_KEY)
        .maybeSingle();

      if (fetchError) {
        throw fetchError;
      }

      if (data?.value) {
        const parsedValue = data.value as OnboardingVersion;
        if (parsedValue === 'v1' || parsedValue === 'v2' || parsedValue === 'v3') {
          setVersion(parsedValue);
        } else {
          // Invalid value in database, use default
          setVersion(DEFAULT_VERSION);
        }
      } else {
        // No setting found, use default
        setVersion(DEFAULT_VERSION);
      }
    } catch (err) {
      console.error('Error fetching onboarding version:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch onboarding version'));
      setVersion(DEFAULT_VERSION);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateVersion = useCallback(async (newVersion: OnboardingVersion): Promise<boolean> => {
    try {
      // Optimistic update
      const previousVersion = version;
      setVersion(newVersion);

      const { error: upsertError } = await supabase
        .from('app_settings')
        .upsert(
          {
            key: SETTING_KEY,
            value: newVersion,
          },
          {
            onConflict: 'key',
          }
        );

      if (upsertError) {
        // Rollback on error
        setVersion(previousVersion);
        throw upsertError;
      }

      toast.success(`Onboarding version set to ${newVersion.toUpperCase()}`);
      return true;
    } catch (err) {
      console.error('Error updating onboarding version:', err);
      toast.error('Failed to update onboarding version');
      return false;
    }
  }, [version]);

  useEffect(() => {
    fetchVersion();
  }, [fetchVersion]);

  return {
    version,
    loading,
    error,
    updateVersion,
    refetch: fetchVersion,
  };
}

/**
 * Lightweight hook that just fetches the version without update capability.
 * Use this in the actual onboarding flow for read-only access.
 */
export function useOnboardingVersionReadOnly(): {
  version: OnboardingVersion;
  loading: boolean;
} {
  const [version, setVersion] = useState<OnboardingVersion>(DEFAULT_VERSION);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchVersion() {
      try {
        // Add a timeout to prevent infinite loading
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 5000)
        );

        const fetchPromise = supabase
          .from('app_settings')
          .select('value')
          .eq('key', SETTING_KEY)
          .maybeSingle();

        const { data, error } = await Promise.race([
          fetchPromise,
          timeoutPromise
        ]);

        if (!error && data?.value) {
          const parsedValue = data.value as OnboardingVersion;
          if (parsedValue === 'v1' || parsedValue === 'v2' || parsedValue === 'v3') {
            setVersion(parsedValue);
          }
        }
      } catch (err) {
        console.warn('Error fetching onboarding version (using default):', err);
        // Default to v1 on error or timeout
        setVersion(DEFAULT_VERSION);
      } finally {
        setLoading(false);
      }
    }

    fetchVersion();
  }, []);

  return { version, loading };
}
