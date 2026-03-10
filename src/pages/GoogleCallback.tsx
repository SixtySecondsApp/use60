import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase/clientV2';
import { calendarService } from '@/lib/services/calendarService';
import { googleCalendarWebhookService } from '@/lib/services/googleCalendarWebhookService';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import logger from '@/lib/utils/logger';

export default function GoogleCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing Google authentication...');

  // Guard against double execution (React StrictMode can cause useEffect to run twice)
  const isProcessingRef = useRef(false);

  useEffect(() => {
    const handleCallback = async () => {
      // Prevent double execution
      if (isProcessingRef.current) {
        logger.log('[GoogleCallback] Already processing, skipping duplicate call');
        return;
      }
      isProcessingRef.current = true;

      try {
        // Ensure auth session is available before calling Edge Function
        let sessionAvailable = false;
        for (let attempt = 0; attempt < 10; attempt++) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            sessionAvailable = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 200));
        }

        if (!sessionAvailable) {
          setStatus('error');
          setMessage('Authentication required. Please sign in and try again.');
          setTimeout(() => {
            navigate('/auth/login?next=/integrations');
          }, 1500);
          return;
        }

        // Get the authorization code and state from URL
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        // Check for OAuth errors from Google
        if (error) {
          setStatus('error');
          setMessage(errorDescription || error || 'Authentication failed');
          
          // Redirect with error
          setTimeout(() => {
            navigate(`/integrations?error=${error}&error_description=${encodeURIComponent(errorDescription || '')}`);
          }, 2000);
          return;
        }

        // Validate we have required parameters
        if (!code || !state) {
          logger.error('[GoogleCallback] Missing URL parameters:', { hasCode: !!code, hasState: !!state });
          setStatus('error');
          setMessage('Invalid authentication response');

          setTimeout(() => {
            navigate('/integrations?error=invalid_response');
          }, 2000);
          return;
        }

        logger.log('[GoogleCallback] Exchanging code for tokens:', {
          codeLength: code.length,
          stateLength: state.length,
          codePreview: code.slice(0, 10) + '...',
          statePreview: state.slice(0, 8) + '...',
        });

        setMessage('Exchanging authorization code...');

        // Call the Edge Function to exchange the code for tokens
        // This is an authenticated call - the user must be logged in
        const requestBody = { code, state };
        logger.log('[GoogleCallback] Request body size:', JSON.stringify(requestBody).length, 'bytes');

        const { data, error: exchangeError } = await supabase.functions.invoke('google-services-router', {
          body: { action: 'oauth_exchange', ...requestBody }
        });

        if (exchangeError) {
          // Try to surface deeper context if provided by supabase-js
          // @ts-expect-error context may exist on the error
          const context = (exchangeError as any)?.context;
          logger.error('[GoogleCallback] Exchange error:', {
            message: exchangeError.message,
            context,
            fullError: JSON.stringify(exchangeError),
          });
          setStatus('error');
          setMessage(
            (context && (context.error || context.message)) ||
            exchangeError.message ||
            'Failed to complete authentication'
          );

          setTimeout(() => {
            navigate(`/integrations?error=exchange_failed&error_description=${encodeURIComponent(exchangeError.message || '')}`);
          }, 2000);
          return;
        }

        if (!data || !data.success) {
          logger.error('[GoogleCallback] Exchange returned error:', data);
          setStatus('error');
          setMessage(data?.error || 'Failed to complete authentication');
          
          setTimeout(() => {
            navigate(`/integrations?error=exchange_failed&error_description=${encodeURIComponent(data?.error || 'Unknown error')}`);
          }, 2000);
          return;
        }

        // Success!
        setStatus('success');
        setMessage(`Successfully connected to Google as ${data.email}! Redirecting...`);

        // Redirect immediately (don't block on sync)
        navigate('/dashboard', { replace: true });

        toast.success('Google connected — syncing calendar in the background');

        // Fire-and-forget: initial calendar sync + webhook subscription
        void (async () => {
          // Automatically sync calendar events
          try {
            const syncResult = await calendarService.syncCalendarEvents('sync-incremental');

            if (syncResult.error) {
              logger.error('Calendar sync error:', syncResult.error);
              toast.warning(`Google connected, but calendar sync failed: ${syncResult.error}`);
            } else {
              const eventCount = (syncResult.eventsCreated || 0) + (syncResult.eventsUpdated || 0);
              logger.log(`Synced ${eventCount} calendar events`);
              toast.success(`Calendar synced (${eventCount} events)`);
            }
          } catch (syncError: unknown) {
            logger.error('Calendar sync exception:', syncError);
            toast.warning('Google connected, but calendar sync encountered an error');
          }

          // Subscribe to real-time push notifications (webhooks)
          try {
            const channel = await googleCalendarWebhookService.subscribe();

            if (channel) {
              logger.log('Successfully subscribed to calendar push notifications');
              toast.success('Real-time calendar sync enabled');
            } else {
              logger.warn('Webhook subscription skipped (no org or already subscribed)');
            }
          } catch (webhookError: unknown) {
            logger.error('Webhook subscription error:', webhookError);
            toast.error('Webhook setup failed');
          }
        })();

      } catch (error: any) {
        setStatus('error');
        setMessage(error.message || 'An unexpected error occurred');
        
        setTimeout(() => {
          navigate(`/integrations?error=unexpected&error_description=${encodeURIComponent(error.message || '')}`);
        }, 2000);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-slate-800 rounded-lg p-8 max-w-md w-full mx-4">
        <div className="flex flex-col items-center space-y-4">
          {status === 'processing' && (
            <>
              <Loader2 className="w-12 h-12 animate-spin text-emerald-500" />
              <h2 className="text-xl font-semibold text-white">Connecting to Google</h2>
            </>
          )}
          
          {status === 'success' && (
            <>
              <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-white">Success!</h2>
            </>
          )}
          
          {status === 'error' && (
            <>
              <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-white">Connection Failed</h2>
            </>
          )}
          
          <p className="text-gray-400 text-center">{message}</p>
          
          {status !== 'processing' && (
            <p className="text-sm text-gray-500">Redirecting...</p>
          )}
        </div>
      </div>
    </div>
  );
}