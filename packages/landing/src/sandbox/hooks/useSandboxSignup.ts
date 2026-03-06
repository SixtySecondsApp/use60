/**
 * useSandboxSignup
 *
 * Handles the signup flow from within the sandbox.
 * Captures visitor email, links to campaign data, and creates
 * a lead in the pipeline.
 */

import { useState, useCallback } from 'react';

/** Build the signup redirect URL with all available demo context */
function buildSignupUrl(data: Pick<SignupData, 'email' | 'name' | 'company' | 'domain' | 'campaignCode'>): string {
  const url = new URL('https://app.use60.com/signup');
  if (data.email) url.searchParams.set('email', data.email);
  if (data.name) url.searchParams.set('demo_name', data.name);
  if (data.company) url.searchParams.set('demo_company', data.company);
  if (data.domain) url.searchParams.set('demo_domain', data.domain);
  if (data.campaignCode) url.searchParams.set('campaign_code', data.campaignCode);
  return url.toString();
}

interface SignupData {
  email: string;
  name?: string;
  company?: string;
  domain?: string;
  campaignCode?: string;
  campaignLinkId?: string;
  sessionId?: string;
  engagementScore?: number;
}

interface UseSandboxSignupReturn {
  isSubmitting: boolean;
  isSuccess: boolean;
  error: string | null;
  submit: (data: SignupData) => Promise<void>;
}

export function useSandboxSignup(): UseSandboxSignupReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (data: SignupData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

      if (!supabaseUrl || !anonKey) {
        // Fallback: redirect to signup with available context
        window.location.href = buildSignupUrl(data);
        return;
      }

      // 1. If from a campaign, update the visitor record with signup email
      if (data.campaignLinkId && data.sessionId) {
        await fetch(`${supabaseUrl}/rest/v1/campaign_visitors`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            campaign_link_id: data.campaignLinkId,
            session_id: data.sessionId,
            signup_email: data.email,
            converted_at: new Date().toISOString(),
            engagement_score: data.engagementScore || 0,
          }),
        }).catch(() => {});
      }

      // 2. Create a waitlist/lead entry
      await fetch(`${supabaseUrl}/rest/v1/waitlist_signups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          email: data.email,
          name: data.name || null,
          company: data.company || null,
          source: data.campaignLinkId ? 'campaign_sandbox' : 'homepage_sandbox',
          metadata: {
            engagement_score: data.engagementScore,
            campaign_link_id: data.campaignLinkId,
          },
        }),
      });

      setIsSuccess(true);

      // Redirect to app signup after brief pause
      setTimeout(() => {
        window.location.href = buildSignupUrl(data);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return { isSubmitting, isSuccess, error, submit };
}
