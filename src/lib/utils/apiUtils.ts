import { toast } from 'sonner';
import logger from '@/lib/utils/logger';
import { getTraceHeaders } from '@/lib/sentry/tracing';

interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  backoff?: boolean;
  showToast?: boolean;
}

const defaultOptions: RetryOptions = {
  maxRetries: 3,
  retryDelay: 1000,
  backoff: true,
  showToast: true
};

export async function getSupabaseHeaders(): Promise<HeadersInit> {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL);
  const supabaseKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY);
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration is missing');
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'apikey': supabaseKey,
  };

  // Try to get the current user's token using the existing client
  try {
    // Import the existing supabase client instead of creating a new one
    const { supabase } = await import('@/lib/supabase/clientV2');
    
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      logger.warn('Error getting auth session:', error);
    } else if (session?.access_token) {
      // Use the user's access token for authenticated requests
      headers['Authorization'] = `Bearer ${session.access_token}`;
      logger.log('✅ Using authenticated session for API calls');
    } else {
      // No session - this will trigger 401 errors for protected endpoints
      logger.warn('No active session found. Some features may require authentication.');
      // Still include the anon key as authorization fallback
      headers['Authorization'] = `Bearer ${supabaseKey}`;
    }
  } catch (error) {
    logger.warn('Failed to get auth session:', error);
    // Continue with just the anon key
    headers['Authorization'] = `Bearer ${supabaseKey}`;
  }

  return headers;
}

/**
 * Enhanced fetch with automatic retry logic for connection resilience
 */
export async function fetchWithRetry(
  url: string, 
  options: RequestInit = {}, 
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const config = { ...defaultOptions, ...retryOptions };
  let lastError: Error;
  
  for (let attempt = 0; attempt <= config.maxRetries!; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Handle 401 specifically
      if (response.status === 401) {
        const error = new Error(`Authentication required. Please log in.`);
        error.name = 'AuthenticationError';
        throw error;
      }
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      // If successful, return the response
      if (response.ok) {
        // If we had previous failures, show success message
        if (attempt > 0 && config.showToast) {
          toast.success('Connection restored!');
        }
        return response;
      }
      
      // If it's a 4xx error, don't retry (client error)
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Client error: ${response.status} ${response.statusText}`);
      }
      
      // For 5xx errors, treat as retry-able
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
      
    } catch (error: any) {
      lastError = error;
      
      // Handle authentication errors specially
      if (error instanceof Error && error.name === 'AuthenticationError') {
        logger.error('Authentication error:', error.message);
        if (config.showToast) {
          toast.error('Please log in to access this feature');
        }
        throw error;
      }
      
      // Handle connection errors - but fail fast for known missing endpoints
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        // Check if this is a known endpoint that might not exist yet
        const knownOptionalEndpoints = ['/clients', '/payments', '/subscriptions'];
        const isOptionalEndpoint = knownOptionalEndpoints.some(endpoint => 
          url.includes(endpoint) || url.endsWith(endpoint)
        );
        
        if (isOptionalEndpoint) {
          logger.warn(`⚠️ Optional endpoint not available (${url}), failing fast instead of retrying`);
          throw new Error(`Endpoint not available: ${url.split('/').pop()}`);
        }
        
        logger.warn(`API request failed (attempt ${attempt + 1}/${config.maxRetries! + 1}), retrying in ${config.retryDelay! * Math.pow(2, attempt)}ms:`, error.message);
        
        if (attempt < config.maxRetries!) {
          await new Promise(resolve => setTimeout(resolve, config.retryDelay! * Math.pow(2, attempt)));
          continue;
        }
      }
      
      // Show retry message on first failure
      if (attempt === 0 && config.showToast) {
        toast.warning('🔄 Connection issue detected. Retrying...');
      }
      
      // Calculate delay with optional exponential backoff
      const delay = config.backoff 
        ? config.retryDelay! * Math.pow(2, attempt)
        : config.retryDelay!;
      
      logger.warn(`API request failed (attempt ${attempt + 1}/${config.maxRetries! + 1}), retrying in ${delay}ms:`, error.message);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

/**
 * Enhanced API call wrapper with JSON handling and error management
 * Includes distributed tracing headers for Sentry correlation
 */
export async function apiCall<T>(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<T> {
  const supabaseHeaders = await getSupabaseHeaders();

  // Get trace headers for distributed tracing (sentry-trace, baggage)
  const traceHeaders = getTraceHeaders();

  const response = await fetchWithRetry(url, {
    headers: {
      ...supabaseHeaders,
      ...traceHeaders,
      ...options.headers,
    },
    ...options,
  }, retryOptions);
  
  const result = await response.json();
  
  if (result.error) {
    throw new Error(result.error);
  }
  
  return result.data || result;
}

/**
 * Check API health and connection status
 */
export async function checkApiHealth(baseUrl: string): Promise<boolean> {
  // Skip health check for local API endpoints in development
  // since they require a separate server to execute the API files
  if (baseUrl === '/api') {
    logger.log('Skipping health check for local API endpoints in development mode');
    return true; // Assume healthy to avoid errors
  }
  
  try {
    const response = await fetchWithRetry(`${baseUrl}/health`, {
      headers: await getSupabaseHeaders()
    }, { 
      maxRetries: 1, 
      showToast: false 
    });
    
    if (response.ok) {
      const health = await response.json();
      return health.status === 'healthy';
    }
    
    return false;
  } catch (error) {
    logger.warn('API health check failed:', error);
    return false;
  }
}

/**
 * Monitor API connection and show status updates
 */
export function createApiMonitor(baseUrl: string, intervalMs: number = 30000) {
  let isHealthy = true;
  let checkInterval: NodeJS.Timeout;
  
  const checkHealth = async () => {
    const currentHealth = await checkApiHealth(baseUrl);
    
    if (currentHealth !== isHealthy) {
      isHealthy = currentHealth;
      
      if (currentHealth) {
        toast.success('🟢 API connection restored');
      } else {
        toast.error('🔴 API connection lost - Please check Supabase status');
      }
    }
  };
  
  // Start monitoring
  const start = () => {
    checkInterval = setInterval(checkHealth, intervalMs);
    checkHealth(); // Initial check
  };
  
  // Stop monitoring
  const stop = () => {
    if (checkInterval) {
      clearInterval(checkInterval);
    }
  };
  
  return { start, stop, checkHealth };
} 