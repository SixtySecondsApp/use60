/**
 * Sentry Error Monitoring Configuration
 *
 * Provides centralized error monitoring and performance tracking.
 * Only initializes in production environment (VITE_ENVIRONMENT=production).
 *
 * Environment Configuration:
 * - Production: Sentry enabled with full monitoring
 * - Staging: Sentry disabled (no data sent)
 * - Development: Sentry disabled (no data sent)
 *
 * Features:
 * - Silent error reporting (no user-facing dialogs)
 * - Performance monitoring with session replay
 * - Distributed tracing support
 * - Rate limiting to prevent flooding
 * - Enhanced error categorization
 */

import * as Sentry from '@sentry/react';
import {
  httpClientIntegration,
  extraErrorDataIntegration,
} from '@sentry/react';

// Get Sentry DSN from environment
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const ENVIRONMENT = (import.meta.env.VITE_ENVIRONMENT || 'development').toLowerCase();
const IS_PRODUCTION = ENVIRONMENT === 'production';
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '2.1.5';

// Rate limiting to prevent error flooding
const ERROR_RATE_LIMIT = {
  maxErrors: 100,
  windowMs: 60000, // 1 minute
};
let errorCount = 0;
let windowStart = Date.now();

function isRateLimited(): boolean {
  const now = Date.now();
  if (now - windowStart > ERROR_RATE_LIMIT.windowMs) {
    // Reset window
    errorCount = 0;
    windowStart = now;
  }
  errorCount++;
  return errorCount > ERROR_RATE_LIMIT.maxErrors;
}

// Patterns for errors to ignore
const IGNORED_ERROR_PATTERNS = [
  // Chunk loading (handled by main.tsx)
  /failed to fetch dynamically imported module/i,
  /loading chunk/i,
  /loading css chunk/i,
  // ResizeObserver noise (browser implementation detail)
  /resizeobserver loop/i,
  /resizeobserver loop completed with undelivered notifications/i,
  // Empty promise rejections
  /^undefined$/,
  /^null$/,
  /^$/,
  // Cancelled/aborted requests
  /aborted/i,
  /cancelled/i,
  /the user aborted a request/i,
  // Expected 404s for optional resources
  /404.*favicon/i,
  /404.*robots\.txt/i,
  // Validation errors (handled by forms)
  /validation failed/i,
];

// Only initialize Sentry if DSN is provided
export function initSentry() {
  if (!SENTRY_DSN) {
    if (IS_PRODUCTION) {
      console.warn('[Sentry] No SENTRY_DSN provided - error monitoring disabled');
    }
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,

    // Release tracking for error grouping
    release: `sixty-sales-dashboard@${APP_VERSION}`,

    // Environment tagging
    environment: ENVIRONMENT,

    // Performance monitoring - sample 10% in production, 100% in dev
    tracesSampleRate: IS_PRODUCTION ? 0.1 : 1.0,

    // Session replay - capture 1% of sessions, 100% with errors
    replaysSessionSampleRate: IS_PRODUCTION ? 0.01 : 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Enable trace propagation for distributed tracing
    // NOTE: Supabase Edge Functions removed from tracePropagationTargets because
    // they don't have sentry-trace/baggage in Access-Control-Allow-Headers,
    // which causes CORS preflight failures and "Failed to send request" errors.
    // TODO: Add sentry-trace,baggage to all edge function CORS headers to re-enable
    tracePropagationTargets: [
      'localhost',
      // Supabase removed - causes CORS issues with edge functions
      // /^https:\/\/.*\.supabase\.co/,
      /^https:\/\/.*\.sixty\.io/,
    ],

    // Integrations
    integrations: [
      // Browser tracing for performance
      Sentry.browserTracingIntegration(),

      // Session replay for debugging
      Sentry.replayIntegration({
        // Mask all text and block all media for privacy
        maskAllText: true,
        blockAllMedia: true,
      }),

      // HTTP client integration - capture failed requests selectively
      httpClientIntegration({
        failedRequestStatusCodes: [
          401, // Unauthorized
          403, // Forbidden
          429, // Rate limited
          [500, 599], // All 5xx server errors
        ],
      }),

      // Extra error data for better debugging
      extraErrorDataIntegration({
        depth: 6, // Deep object inspection
      }),

    ],

    // Filter out noisy errors
    beforeSend(event, hint) {
      // Rate limiting check
      if (isRateLimited()) {
        console.warn('[Sentry] Rate limited - skipping error');
        return null;
      }

      const error = hint.originalException;

      // Handle string errors
      if (typeof error === 'string') {
        if (IGNORED_ERROR_PATTERNS.some(pattern => pattern.test(error))) {
          return null;
        }
      }

      // Handle Error objects
      if (error instanceof Error) {
        const message = error.message;

        // Check against ignored patterns
        if (IGNORED_ERROR_PATTERNS.some(pattern => pattern.test(message))) {
          return null;
        }

        // Ignore network errors during offline scenarios
        if (/network error|fetch failed/i.test(message)) {
          if (!navigator.onLine) {
            return null;
          }
        }
      }

      // Handle empty/null promise rejections
      if (error === undefined || error === null || error === '') {
        return null;
      }

      return event;
    },

    // Filter transactions (performance events)
    beforeSendTransaction(event) {
      // Filter out noisy health check transactions
      if (event.transaction?.includes('/health') ||
          event.transaction?.includes('/api/health')) {
        return null;
      }
      return event;
    },

    // Only send in production (not staging or development)
    enabled: IS_PRODUCTION,

    // Max breadcrumbs to keep
    maxBreadcrumbs: 50,

    // Attach stack traces to messages
    attachStacktrace: true,

    // Normalize depth for large objects
    normalizeDepth: 6,
  });

  console.log('[Sentry] Initialized successfully', {
    environment: ENVIRONMENT,
    release: `sixty-sales-dashboard@${APP_VERSION}`,
  });
}

/**
 * Set user context for Sentry
 * Call this after user authentication
 */
export function setSentryUser(user: {
  id: string;
  email?: string;
  name?: string;
  orgId?: string;
  orgName?: string;
  isAdmin?: boolean;
}) {
  if (!SENTRY_DSN) return;
  
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.name,
  });
  
  // Set organization context
  if (user.orgId) {
    Sentry.setTag('org_id', user.orgId);
    Sentry.setTag('org_name', user.orgName || 'Unknown');
  }
  
  if (user.isAdmin !== undefined) {
    Sentry.setTag('is_admin', String(user.isAdmin));
  }
}

/**
 * Clear user context (call on logout)
 */
export function clearSentryUser() {
  if (!SENTRY_DSN) return;
  Sentry.setUser(null);
}

/**
 * Capture a custom error with additional context
 */
export function captureError(
  error: Error | string,
  context?: Record<string, any>
) {
  if (!SENTRY_DSN) {
    console.error('[Error]', error, context);
    return;
  }
  
  if (typeof error === 'string') {
    Sentry.captureMessage(error, {
      level: 'error',
      extra: context,
    });
  } else {
    Sentry.captureException(error, {
      extra: context,
    });
  }
}

/**
 * Capture a breadcrumb for debugging
 */
export function captureBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, any>
) {
  if (!SENTRY_DSN) return;
  
  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: 'info',
  });
}

/**
 * Start a performance transaction
 */
export function startTransaction(
  name: string,
  op: string,
  data?: Record<string, any>
) {
  if (!SENTRY_DSN) return null;
  
  return Sentry.startInactiveSpan({
    name,
    op,
    attributes: data,
  });
}

// Export Sentry for advanced usage
export { Sentry };

// Export error boundary component
export const SentryErrorBoundary = Sentry.ErrorBoundary;

/**
 * Test function to send a high-priority fatal error
 * Call from console: window.testSentryFatal()
 */
export function testSentryFatal(message?: string) {
  const uniqueId = Date.now();
  const errorMessage = message || `FATAL_WEBHOOK_TEST_${uniqueId}`;

  Sentry.withScope(scope => {
    // Set as FATAL level - highest priority
    scope.setLevel('fatal');

    // Add context that increases priority
    scope.setUser({ id: 'test-user', email: 'test@test.com' });
    scope.setTag('severity', 'critical');
    scope.setTag('test_type', 'webhook_verification');
    scope.setTag('priority', 'high');

    // Force unique fingerprint for new issue
    scope.setFingerprint(['fatal-webhook-test', String(uniqueId)]);

    // Capture as fatal error
    const eventId = Sentry.captureException(new Error(errorMessage));
    console.log('[Sentry Test] Sent FATAL error:', { eventId, uniqueId, message: errorMessage });
  });

  return uniqueId;
}

// Expose test function globally for console access
if (typeof window !== 'undefined') {
  (window as any).testSentryFatal = testSentryFatal;
  (window as any).Sentry = Sentry;
}
