/**
 * Sentry Debug Panel (Development Only)
 *
 * A floating, collapsible panel for developers to monitor:
 * - Recent errors captured by Sentry
 * - Web Vitals metrics
 * - Recent API calls
 * - Memory usage
 * - Sentry connection status
 *
 * Toggle with Ctrl+Shift+S (works on Mac and Windows)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as Sentry from '@sentry/react';

// Only render in development or preview environments
const isDev = import.meta.env.DEV ||
  import.meta.env.VITE_VERCEL_ENV === 'preview' ||
  import.meta.env.VITE_SENTRY_DEBUG === 'true';

interface ErrorEntry {
  id: string;
  message: string;
  category?: string;
  timestamp: Date;
  eventId?: string;
}

interface ApiCallEntry {
  id: string;
  method: string;
  url: string;
  status?: number;
  duration?: number;
  timestamp: Date;
}

interface WebVitals {
  LCP?: number;
  FID?: number;
  CLS?: number;
  FCP?: number;
  TTFB?: number;
}

// Buffer for storing recent errors
const errorBuffer: ErrorEntry[] = [];
const MAX_ERRORS = 10;

// Buffer for recent API calls
const apiCallBuffer: ApiCallEntry[] = [];
const MAX_API_CALLS = 20;

// Web vitals storage
const webVitals: WebVitals = {};

// Register error listener using Sentry's event processor (ES module safe)
if (isDev) {
  // Use addEventProcessor to intercept events without monkey-patching
  Sentry.addEventProcessor((event) => {
    if (event.exception?.values?.length) {
      const errorMessage = event.exception.values[0]?.value || 'Unknown error';
      const errorType = event.exception.values[0]?.type || 'Error';

      errorBuffer.unshift({
        id: event.event_id || crypto.randomUUID(),
        message: `${errorType}: ${errorMessage}`,
        category: event.tags?.['error.category'] as string,
        timestamp: new Date(),
        eventId: event.event_id,
      });

      if (errorBuffer.length > MAX_ERRORS) {
        errorBuffer.pop();
      }
    }

    // Return the event unchanged to continue processing
    return event;
  });
}

// Track API calls via fetch interception
if (isDev && typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method || 'GET';
    const startTime = performance.now();
    const id = crypto.randomUUID();

    try {
      const response = await originalFetch(input, init);
      const duration = performance.now() - startTime;

      apiCallBuffer.unshift({
        id,
        method,
        url,
        status: response.status,
        duration,
        timestamp: new Date(),
      });

      if (apiCallBuffer.length > MAX_API_CALLS) {
        apiCallBuffer.pop();
      }

      return response;
    } catch (error) {
      const duration = performance.now() - startTime;

      apiCallBuffer.unshift({
        id,
        method,
        url,
        status: 0,
        duration,
        timestamp: new Date(),
      });

      if (apiCallBuffer.length > MAX_API_CALLS) {
        apiCallBuffer.pop();
      }

      throw error;
    }
  };
}

export function SentryDebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'errors' | 'vitals' | 'api' | 'memory'>('errors');
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [apiCalls, setApiCalls] = useState<ApiCallEntry[]>([]);
  const [vitals, setVitals] = useState<WebVitals>({});
  const [memory, setMemory] = useState<{ used: number; total: number } | null>(null);
  const [sentryStatus, setSentryStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown');
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval>>();

  // Don't render in production
  if (!isDev) {
    return null;
  }

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === 'S') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Refresh data when panel is open
  useEffect(() => {
    if (isOpen) {
      refreshData();
      refreshIntervalRef.current = setInterval(refreshData, 2000);
    } else {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [isOpen]);

  const refreshData = useCallback(() => {
    // Update errors
    setErrors([...errorBuffer]);

    // Update API calls
    setApiCalls([...apiCallBuffer]);

    // Update vitals
    setVitals({ ...webVitals });

    // Update memory
    if ('memory' in performance) {
      const mem = (performance as any).memory;
      setMemory({
        used: Math.round(mem.usedJSHeapSize / 1024 / 1024),
        total: Math.round(mem.totalJSHeapSize / 1024 / 1024),
      });
    }

    // Check Sentry status
    const client = Sentry.getClient();
    setSentryStatus(client ? 'connected' : 'disconnected');
  }, []);

  const triggerTestError = () => {
    try {
      throw new Error('Test error from Sentry Debug Panel');
    } catch (e) {
      Sentry.captureException(e);
    }
  };

  const clearBuffers = () => {
    errorBuffer.length = 0;
    apiCallBuffer.length = 0;
    refreshData();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed bottom-20 right-4 z-50 w-96 max-h-[500px] bg-gray-900 text-gray-100 rounded-lg shadow-2xl border border-gray-700 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            sentryStatus === 'connected' ? 'bg-green-500' :
            sentryStatus === 'disconnected' ? 'bg-red-500' : 'bg-yellow-500'
          }`} />
          <span className="text-sm font-semibold">Sentry Debug</span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-white"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {(['errors', 'vitals', 'api', 'memory'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-3 py-2 text-xs font-medium capitalize ${
              activeTab === tab
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {tab}
            {tab === 'errors' && errors.length > 0 && (
              <span className="ml-1 bg-red-500 text-white rounded-full px-1.5 text-xs">
                {errors.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {activeTab === 'errors' && (
          <div className="space-y-2">
            {errors.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">No errors captured</p>
            ) : (
              errors.map(error => (
                <div key={error.id} className="bg-gray-800 rounded p-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-red-400 font-mono break-all">{error.message}</span>
                    {error.category && (
                      <span className="bg-gray-700 px-1.5 py-0.5 rounded text-gray-300 whitespace-nowrap">
                        {error.category}
                      </span>
                    )}
                  </div>
                  <div className="text-gray-500 mt-1">
                    {error.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'vitals' && (
          <div className="space-y-3">
            <VitalRow label="LCP" value={vitals.LCP} unit="ms" threshold={2500} />
            <VitalRow label="FID" value={vitals.FID} unit="ms" threshold={100} />
            <VitalRow label="CLS" value={vitals.CLS} unit="" threshold={0.1} decimals={3} />
            <VitalRow label="FCP" value={vitals.FCP} unit="ms" threshold={1800} />
            <VitalRow label="TTFB" value={vitals.TTFB} unit="ms" threshold={800} />
          </div>
        )}

        {activeTab === 'api' && (
          <div className="space-y-2">
            {apiCalls.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">No API calls recorded</p>
            ) : (
              apiCalls.slice(0, 10).map(call => (
                <div key={call.id} className="bg-gray-800 rounded p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${
                      call.status && call.status >= 400 ? 'text-red-400' : 'text-green-400'
                    }`}>
                      {call.method}
                    </span>
                    <span className="text-gray-300 truncate flex-1" title={call.url}>
                      {call.url.replace(/^https?:\/\/[^/]+/, '')}
                    </span>
                    {call.status && (
                      <span className={`${
                        call.status >= 400 ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {call.status}
                      </span>
                    )}
                  </div>
                  <div className="text-gray-500 mt-1 flex justify-between">
                    <span>{call.timestamp.toLocaleTimeString()}</span>
                    {call.duration && (
                      <span className={call.duration > 500 ? 'text-yellow-400' : ''}>
                        {call.duration.toFixed(0)}ms
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'memory' && (
          <div className="space-y-4">
            {memory ? (
              <>
                <div className="bg-gray-800 rounded p-3">
                  <div className="flex justify-between text-sm mb-2">
                    <span>JS Heap Usage</span>
                    <span>{memory.used} / {memory.total} MB</span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded overflow-hidden">
                    <div
                      className={`h-full ${
                        memory.used / memory.total > 0.8 ? 'bg-red-500' :
                        memory.used / memory.total > 0.6 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${(memory.used / memory.total) * 100}%` }}
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Memory info is only available in Chromium browsers
                </p>
              </>
            ) : (
              <p className="text-gray-500 text-sm text-center py-4">
                Memory info not available in this browser
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-700 px-3 py-2 flex gap-2">
        <button
          onClick={triggerTestError}
          className="flex-1 text-xs bg-red-600 hover:bg-red-700 text-white py-1.5 rounded"
        >
          Test Error
        </button>
        <button
          onClick={clearBuffers}
          className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 text-white py-1.5 rounded"
        >
          Clear
        </button>
        <button
          onClick={refreshData}
          className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 text-white py-1.5 rounded"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

function VitalRow({
  label,
  value,
  unit,
  threshold,
  decimals = 0
}: {
  label: string;
  value?: number;
  unit: string;
  threshold: number;
  decimals?: number;
}) {
  const isGood = value !== undefined && value <= threshold;

  return (
    <div className="bg-gray-800 rounded p-3">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium">{label}</span>
        {value !== undefined ? (
          <span className={isGood ? 'text-green-400' : 'text-red-400'}>
            {value.toFixed(decimals)}{unit}
          </span>
        ) : (
          <span className="text-gray-500">-</span>
        )}
      </div>
      {value !== undefined && (
        <div className="mt-2 h-1.5 bg-gray-700 rounded overflow-hidden">
          <div
            className={isGood ? 'bg-green-500' : 'bg-red-500'}
            style={{ width: `${Math.min((value / threshold) * 100, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default SentryDebugPanel;
