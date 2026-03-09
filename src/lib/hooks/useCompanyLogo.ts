import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/clientV2';

interface LogoResponse {
  logo_url: string | null;
  cached: boolean;
  error?: string;
}

/**
 * Hook to fetch company logo from S3 or logo.dev API
 * @param domain - Company domain (will be normalized)
 * @returns Logo URL or null if not available
 */
export function useCompanyLogo(domain: string | null | undefined) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!domain) {
      setLogoUrl(null);
      return;
    }

    // Normalize domain
    const normalizedDomain = domain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .toLowerCase();

    if (!normalizedDomain) {
      setLogoUrl(null);
      return;
    }

    setIsLoading(true);
    setLogoUrl(null); // Reset logo URL when domain changes

    // Fetch logo via edge function
    supabase.functions
      .invoke<LogoResponse>('fetch-router', {
        method: 'POST',
        body: { action: 'company_logo', domain: normalizedDomain },
      })
      .then(({ data, error }) => {
        if (error) {
          setLogoUrl(null);
        } else if (data?.logo_url) {
          setLogoUrl(data.logo_url);
        } else {
          setLogoUrl(null);
        }
      })
      .catch((error) => {
        setLogoUrl(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [domain]);

  return { logoUrl, isLoading };
}

