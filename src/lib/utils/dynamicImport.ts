// Utility for handling dynamic import failures with cache clearing and retry
import React from 'react';
import { clearCacheAndReload } from '@/lib/config/version';

interface RetryOptions {
  maxRetries?: number;
  clearCacheOnFailure?: boolean;
  showUserPrompt?: boolean;
}

// Enhanced error detection for chunk loading failures
function isChunkLoadingError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  
  const errorMessage = error.message.toLowerCase();
  const errorString = String(error);
  
  // Check for various chunk loading error patterns
  return (
    errorMessage.includes('loading chunk') ||
    errorMessage.includes('failed to fetch dynamically imported module') ||
    errorMessage.includes('loading css chunk') ||
    errorMessage.includes('failed to fetch') ||
    errorMessage.includes('networkerror') ||
    errorMessage.includes('network error') ||
    errorString.includes('Failed to fetch') ||
    errorString.includes('TypeError') ||
    // Check for 404-like errors in the message
    (errorMessage.includes('404') && errorMessage.includes('js')) ||
    // Check for CORS or network issues
    errorMessage.includes('cors') ||
    errorMessage.includes('network request failed')
  );
}

// Check if the error is likely due to a missing file (404)
function isMissingFileError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  
  const errorMessage = error.message.toLowerCase();
  return (
    errorMessage.includes('404') ||
    errorMessage.includes('not found') ||
    errorMessage.includes('failed to fetch') ||
    // Network errors often indicate missing files
    (errorMessage.includes('networkerror') && !errorMessage.includes('timeout'))
  );
}

export async function retryableImport<T>(
  importFn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3, // Increased from 2 to 3
    clearCacheOnFailure = true,
    showUserPrompt = false // Changed default to false for better UX
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const module = await importFn();
      // Reset one-time dev reload guard after successful load.
      if (import.meta.env.DEV) {
        try {
          sessionStorage.removeItem(`lazy-reload-attempted:${window.location.pathname}`);
        } catch {
          // Ignore storage issues.
        }
      }
      return module;
    } catch (error) {
      lastError = error as Error;
      
      const isChunkError = isChunkLoadingError(error);
      const isMissingFile = isMissingFileError(error);
      
      // If it's a chunk error or missing file, handle it
      if ((isChunkError || isMissingFile) && attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // For missing file errors, try to reload the page after first retry
        if (isMissingFile && attempt === 1) {
          // Check if we can fetch the current HTML to see if it's a version mismatch
          try {
            const response = await fetch(window.location.href, { 
              method: 'HEAD',
              cache: 'no-store' 
            });
            if (!response.ok) {
              // If we can't even fetch the HTML, likely a deployment issue
            }
          } catch (fetchError) {
            // Ignore fetch errors during check
          }
        }
        
        continue;
      }

      // If it's the last attempt and a chunk/missing file error, clear cache and reload
      if ((isChunkError || isMissingFile) && clearCacheOnFailure) {
        // For production, auto-reload without prompt for better UX
        // In development, we might want to see the error
        if (showUserPrompt && import.meta.env.DEV) {
          const userWantsRefresh = confirm(
            'Unable to load the requested page. This may be due to cached assets from a previous version.\n\n' +
            'Would you like to clear your cache and reload the page to fix this issue?'
          );
          
          if (userWantsRefresh) {
            clearCacheAndReload();
            return Promise.reject(new Error('Reloading page to clear cache'));
          }
        } else {
          // In dev, don't clear storage; it can wipe sessions during iteration.
          // But do attempt a one-time hard reload to recover from stale HMR graphs.
          if (import.meta.env.DEV) {
            try {
              const reloadKey = `lazy-reload-attempted:${window.location.pathname}`;
              const alreadyReloaded = sessionStorage.getItem(reloadKey) === '1';
              if (!alreadyReloaded) {
                sessionStorage.setItem(reloadKey, '1');
                setTimeout(() => {
                  window.location.reload();
                }, 50);
                return Promise.reject(new Error('Reloading page to recover dynamic import'));
              }
            } catch {
              // If sessionStorage is unavailable, fall through to original error.
            }

            return Promise.reject(lastError);
          }

          // Auto-clear cache and reload (better UX for production)
          // Small delay to allow error logging
          setTimeout(() => {
            clearCacheAndReload();
          }, 100);
          return Promise.reject(new Error('Reloading page to clear cache'));
        }
      }
    }
  }

  throw lastError!;
}

// Enhanced lazy loading with automatic retry and cache clearing
export function lazyWithRetry<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  options?: RetryOptions
) {
  return React.lazy(() => retryableImport(importFn, options));
}

// For non-React dynamic imports
export function dynamicImportWithRetry<T>(
  importFn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  return retryableImport(importFn, options);
}