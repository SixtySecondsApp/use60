import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase/clientV2';

/**
 * Fathom OAuth Callback Page
 *
 * Handles the OAuth callback from Fathom and forwards to Edge Function
 * Flow: Fathom → This page → Edge Function → Integrations page
 * 
 * Note: This page must be public (no auth required) as Fathom redirects here
 * without an authenticated session. The edge function handles authentication.
 */
export default function FathomCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      console.log('[FathomCallback] Component loaded');
      console.log('[FathomCallback] URL search params:', window.location.search);
      console.log('[FathomCallback] Has window.opener:', !!window.opener);
      console.log('[FathomCallback] Window name:', window.name);

      try {
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const errorParam = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        console.log('[FathomCallback] Parsed params:', {
          hasCode: !!code,
          hasState: !!state,
          hasError: !!errorParam,
          codeLength: code?.length,
          stateLength: state?.length,
        });

        // Check for OAuth errors from Fathom
        if (errorParam) {
          setError(`OAuth error: ${errorParam} - ${errorDescription || 'Unknown error'}`);
          setStatus('error');

          // Redirect back to integrations after 5 seconds
          setTimeout(() => {
            navigate('/integrations?error=fathom-oauth-failed');
          }, 5000);
          return;
        }

        if (!code || !state) {
          console.error('Fathom OAuth callback missing parameters:', { code: !!code, state: !!state });
          throw new Error('Missing authorization code or state parameter');
        }

        // RELAY MODE: If opened as popup from localhost/different origin, relay code+state back
        // instead of exchanging tokens ourselves (allows localhost to use staging's registered callback)
        if (window.opener) {
          console.log('[FathomCallback] RELAY MODE: Detected popup opener');
          console.log('[FathomCallback] Relaying code:', code?.substring(0, 10) + '...');
          console.log('[FathomCallback] Relaying state:', state?.substring(0, 10) + '...');
          console.log('[FathomCallback] Opener origin:', window.opener.location?.origin || 'cross-origin');

          setStatus('success');

          try {
            // Send code and state to opener (any origin - validated by popup reference check)
            const message = {
              type: 'fathom-oauth-code',
              code,
              state,
            };
            console.log('[FathomCallback] Sending postMessage:', message);
            window.opener.postMessage(message, '*');
            console.log('[FathomCallback] postMessage sent successfully');
          } catch (err) {
            console.error('[FathomCallback] Error sending postMessage:', err);
            throw err;
          }

          // Close popup after brief delay
          setTimeout(() => {
            console.log('[FathomCallback] Closing popup window');
            window.close();
          }, 500);
          return;
        }

        console.log('[FathomCallback] DIRECT MODE: No window.opener detected, handling locally');

        // DIRECT MODE: No opener, so we handle token exchange ourselves
        // Call the Edge Function to handle token exchange
        // Edge function validates state parameter (contains user_id) - doesn't require client auth
        const { data, error: functionError } = await supabase.functions.invoke(
          'fathom-oauth-callback',
          {
            body: { code, state }
          }
        );
        
        // Log full response for debugging
        console.log('Fathom OAuth response:', { data, functionError });

        if (functionError) {
          console.error('Fathom OAuth edge function error:', functionError);
          console.error('Fathom OAuth error data:', data);
          // Extract detailed error info if available
          const errorDetail = (data as any)?.error || functionError.message;
          const debugInfo = (data as any)?.debug ? JSON.stringify((data as any).debug, null, 2) : '';
          console.error('Fathom OAuth debug info:', debugInfo);
          throw new Error(errorDetail || `Failed to complete OAuth flow: ${JSON.stringify(functionError)}`);
        }

        // Also check for error in data (in case non-2xx response)
        if ((data as any)?.success === false || (data as any)?.error) {
          console.error('Fathom OAuth returned error in data:', data);
          const errorDetail = (data as any)?.error || 'Unknown error from edge function';
          const debugStep = (data as any)?.debugStep || 'unknown';
          const debugInfo = (data as any)?.debug ? JSON.stringify((data as any).debug, null, 2) : '';
          console.error('Fathom OAuth FAILED at step:', debugStep);
          console.error('Fathom OAuth debug info:', debugInfo);
          throw new Error(`[${debugStep}] ${errorDetail}`);
        }

        setStatus('success');

        // Check if we're in a popup window (multiple detection methods)
        const isPopup = !!(window.opener || window.name === 'Fathom OAuth' || window.outerWidth < 700);
        if (isPopup && window.opener) {
          // Restrict message delivery to our own origin
          window.opener.postMessage(
            {
              type: 'fathom-oauth-success',
              integrationId: (data as any)?.integration_id,
              userId: (data as any)?.user_id,
            },
            window.location.origin
          );

          // Close popup after 1 second
          setTimeout(() => {
            window.close();
          }, 1000);
        } else if (isPopup && !window.opener) {
          // Popup but no opener (security restriction) - try to close anyway
          setTimeout(() => {
            window.close();
          }, 1000);
        } else {
          // If not in popup, redirect to dashboard with success notification
          setTimeout(() => {
            navigate('/dashboard?fathom=connected', { replace: true });
          }, 1500);
        }

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
        console.error('Fathom OAuth callback error:', err);
        setError(errorMessage);
        setStatus('error');

        // Redirect back to integrations after 5 seconds
        setTimeout(() => {
          navigate(`/integrations?error=fathom-connection-failed&message=${encodeURIComponent(errorMessage)}`);
        }, 5000);
      }
    };

    handleCallback().catch((err) => {
      console.error('🔴 FathomCallback handleCallback promise rejection:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setStatus('error');
    });
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a1a1a]">
      <div className="bg-[#2a2a2a] rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl border border-[#00BEFF]/20">
        {status === 'processing' && (
          <div className="text-center">
            <div className="inline-flex items-center space-x-2 bg-[#1a1a1a] px-4 py-3 rounded-lg mb-6">
              <span className="text-white font-bold text-2xl tracking-wide">FATHOM</span>
              <svg className="w-8 h-8 animate-pulse" viewBox="0 0 24 24" fill="none">
                <path d="M4 16C4 14 4 12 6 10C8 8 10 8 12 6C14 4 16 4 18 6C20 8 20 10 20 12" stroke="#00BEFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4 20C4 18 4 16 6 14C8 12 10 12 12 10C14 8 16 8 18 10C20 12 20 14 20 16" stroke="#00BEFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Connecting to Fathom</h1>
            <p className="text-gray-400">Please wait while we complete the connection.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <div className="inline-flex items-center space-x-2 bg-[#1a1a1a] px-4 py-3 rounded-lg mb-6">
              <span className="text-white font-bold text-2xl tracking-wide">FATHOM</span>
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
                <path d="M4 16C4 14 4 12 6 10C8 8 10 8 12 6C14 4 16 4 18 6C20 8 20 10 20 12" stroke="#00BEFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4 20C4 18 4 16 6 14C8 12 10 12 12 10C14 8 16 8 18 10C20 12 20 14 20 16" stroke="#00BEFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500 rounded-full mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Successfully Connected!</h1>
            <p className="text-gray-400">Your Fathom account has been successfully connected.</p>
            <p className="text-[#00BEFF] text-sm mt-2">Redirecting...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="inline-flex items-center space-x-2 bg-[#1a1a1a] px-4 py-3 rounded-lg mb-6">
              <span className="text-white font-bold text-2xl tracking-wide">FATHOM</span>
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
                <path d="M4 16C4 14 4 12 6 10C8 8 10 8 12 6C14 4 16 4 18 6C20 8 20 10 20 12" stroke="#00BEFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4 20C4 18 4 16 6 14C8 12 10 12 12 10C14 8 16 8 18 10C20 12 20 14 20 16" stroke="#00BEFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/20 border-2 border-red-500 rounded-lg mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Connection Failed</h1>
            <p className="text-gray-400 mb-6">{error}</p>
            <button
              onClick={() => navigate('/integrations')}
              className="bg-[#00BEFF] hover:bg-[#00BEFF]/80 text-white px-6 py-2 rounded-lg transition-colors font-medium"
            >
              Return to Integrations
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
