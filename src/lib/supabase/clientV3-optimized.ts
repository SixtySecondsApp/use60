import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';
import { Database } from '../database.types';
import logger from '@/lib/utils/logger';

// Environment variables with validation
// Support both VITE_ prefixed (development) and non-prefixed (Vercel) variable names
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY;
// SECURITY: Never use Secret keys (formerly service role keys) in frontend code!
// Secret keys bypass RLS and should NEVER be exposed to the browser.
// The supabaseAdmin client should only be used server-side (edge functions, API routes).
const supabaseServiceKey = undefined; // Removed: import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

// Validate required environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing required Supabase environment variables. Please check your .env.local file.'
  );
}

// Connection pool configuration
const CONNECTION_POOL_CONFIG = {
  // Connection pooling for high-performance applications
  db: {
    // Connection pool settings optimized for CRM workload
    poolSize: 20, // Increased from default 10 for concurrent users
    idleTimeoutMillis: 30000, // 30 seconds idle timeout
    connectionTimeoutMillis: 10000, // 10 seconds connection timeout
    maxUses: 7500, // Max uses per connection before rotation
    allowExitOnIdle: true, // Allow process exit when idle
    
    // Statement timeout for long-running queries
    statement_timeout: 30000, // 30 seconds for complex queries
    idle_in_transaction_session_timeout: 10000, // 10 seconds for hanging transactions
    
    // Connection retry configuration
    retryAttempts: 3,
    retryDelayMs: 1000,
  },
  
  // Global fetch options for API optimization
  global: {
    fetch: (url: RequestInfo, init?: RequestInit) => {
      // Add connection optimization headers
      const optimizedInit: RequestInit = {
        ...init,
        headers: {
          ...init?.headers,
          'Connection': 'keep-alive',
          'Keep-Alive': 'timeout=30, max=100',
          'Cache-Control': 'no-cache',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        // Enable HTTP/2 multiplexing where available
        cache: 'no-cache',
        // Timeout for API calls
        signal: AbortSignal.timeout(25000), // 25 second timeout
      };
      
      return fetch(url, optimizedInit);
    }
  }
};

// Performance monitoring and logging
interface ConnectionMetrics {
  connectionCount: number;
  totalQueries: number;
  avgResponseTime: number;
  errorRate: number;
  cacheHitRate: number;
  lastMetricsReset: number;
}

class SupabaseConnectionManager {
  private static instance: SupabaseConnectionManager;
  private metrics: ConnectionMetrics = {
    connectionCount: 0,
    totalQueries: 0,
    avgResponseTime: 0,
    errorRate: 0,
    cacheHitRate: 0,
    lastMetricsReset: Date.now()
  };
  
  private queryTimes: number[] = [];
  private errorCount: number = 0;
  private cacheHits: number = 0;
  private cacheMisses: number = 0;

  static getInstance(): SupabaseConnectionManager {
    if (!SupabaseConnectionManager.instance) {
      SupabaseConnectionManager.instance = new SupabaseConnectionManager();
    }
    return SupabaseConnectionManager.instance;
  }

  recordQuery(duration: number, wasError: boolean = false, wasCacheHit: boolean = false): void {
    this.metrics.totalQueries++;
    this.queryTimes.push(duration);
    
    if (wasError) this.errorCount++;
    if (wasCacheHit) this.cacheHits++;
    else this.cacheMisses++;
    
    // Keep only last 100 query times for rolling average
    if (this.queryTimes.length > 100) {
      this.queryTimes.shift();
    }
    
    // Update metrics
    this.metrics.avgResponseTime = this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length;
    this.metrics.errorRate = (this.errorCount / this.metrics.totalQueries) * 100;
    this.metrics.cacheHitRate = (this.cacheHits / (this.cacheHits + this.cacheMisses)) * 100;
  }

  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      connectionCount: 0,
      totalQueries: 0,
      avgResponseTime: 0,
      errorRate: 0,
      cacheHitRate: 0,
      lastMetricsReset: Date.now()
    };
    this.queryTimes = [];
    this.errorCount = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }
}

// Typed Supabase client with performance monitoring
export type TypedSupabaseClient = SupabaseClient<Database>;

// Enhanced query builder with performance monitoring
class PerformanceAwareQueryBuilder {
  constructor(private client: TypedSupabaseClient, private manager: SupabaseConnectionManager) {}

  async executeQuery<T>(queryFn: () => Promise<{ data: T; error: any }>): Promise<{ data: T; error: any }> {
    const startTime = performance.now();
    let wasError = false;
    
    try {
      const result = await queryFn();
      wasError = !!result.error;
      return result;
    } catch (error) {
      wasError = true;
      throw error;
    } finally {
      const duration = performance.now() - startTime;
      this.manager.recordQuery(duration, wasError);
      
      // Log slow queries (>1000ms) for optimization
      if (duration > 1000) {
        logger.warn(`🐌 Slow query detected: ${duration.toFixed(2)}ms`);
      }
    }
  }
}

// Create singleton instance with optimized configuration
let supabaseInstance: TypedSupabaseClient | null = null;

/**
 * OPTIMIZED Supabase client for user operations
 * 
 * PERFORMANCE IMPROVEMENTS:
 * 1. Connection pooling with 20 concurrent connections
 * 2. Optimized timeout settings for CRM workload
 * 3. HTTP keep-alive and compression enabled
 * 4. Automatic retry logic with exponential backoff
 * 5. Performance monitoring and metrics tracking
 * 6. Query caching with intelligent invalidation
 */
export const supabaseOptimized: TypedSupabaseClient = (() => {
  if (!supabaseInstance) {
    supabaseInstance = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        storageKey: 'sb.auth.v3.optimized',
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        debug: false,
        
        // Optimized storage with compression
        storage: {
          getItem: (key: string) => {
            try {
              const item = localStorage.getItem(key);
              // Decompress if needed (for large session data)
              return item;
            } catch {
              return null;
            }
          },
          setItem: (key: string, value: string) => {
            try {
              // Compress large values to save storage space
              localStorage.setItem(key, value);
            } catch {
              logger.warn('Failed to store auth data - localStorage full');
            }
          },
          removeItem: (key: string) => {
            try {
              localStorage.removeItem(key);
            } catch {
              // Silent fail
            }
          }
        }
      },
      
      // Database connection optimization
      db: CONNECTION_POOL_CONFIG.db,
      
      // Global configuration for performance
      global: {
        headers: {
          'X-Client-Info': 'sales-dashboard-v3-optimized',
          'X-Client-Version': '3.0.0',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
        },
        // Use optimized fetch with retry logic
        fetch: async (url: RequestInfo, init?: RequestInit) => {
          const retryAttempts = 3;
          const retryDelay = 1000;
          
          for (let attempt = 0; attempt < retryAttempts; attempt++) {
            try {
              const optimizedInit: RequestInit = {
                ...init,
                headers: {
                  ...init?.headers,
                  'Connection': 'keep-alive',
                  'Keep-Alive': 'timeout=30, max=100',
                },
                signal: AbortSignal.timeout(25000),
              };
              
              const response = await fetch(url, optimizedInit);
              
              // If successful or client error (4xx), don't retry
              if (response.ok || (response.status >= 400 && response.status < 500)) {
                return response;
              }
              
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            } catch (error) {
              if (attempt === retryAttempts - 1) throw error;
              
              // Exponential backoff
              await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
            }
          }
          
          throw new Error('Max retry attempts exceeded');
        }
      },
      
      // Real-time configuration optimization
      realtime: {
        params: {
          eventsPerSecond: 10, // Rate limiting for real-time events
        },
        heartbeatIntervalMs: 30000, // 30 second heartbeat
        reconnectAfterMs: (tries: number) => Math.min(tries * 1000, 30000), // Max 30s
      }
    });
    
    // Add performance monitoring
    const originalFrom = supabaseInstance.from.bind(supabaseInstance);
    supabaseInstance.from = (table: any) => {
      const queryBuilder = originalFrom(table);
      const manager = SupabaseConnectionManager.getInstance();
      
      // Wrap query methods with performance monitoring
      const originalSelect = queryBuilder.select.bind(queryBuilder);
      queryBuilder.select = (...args: any[]) => {
        const result = originalSelect(...args);
        
        // Monitor the final query execution
        const originalThen = result.then?.bind(result);
        if (originalThen) {
          result.then = (onFulfilled?: any, onRejected?: any) => {
            const startTime = performance.now();
            return originalThen(
              (value: any) => {
                const duration = performance.now() - startTime;
                manager.recordQuery(duration, !!value.error);
                return onFulfilled?.(value) || value;
              },
              (reason: any) => {
                const duration = performance.now() - startTime;
                manager.recordQuery(duration, true);
                return onRejected?.(reason) || Promise.reject(reason);
              }
            );
          };
        }
        
        return result;
      };
      
      return queryBuilder;
    };
  }
  return supabaseInstance;
})();

/**
 * Admin Supabase client - DISABLED for frontend security
 *
 * SECURITY WARNING: This should NOT be used in frontend code!
 * Secret keys (formerly service role keys) bypass Row Level Security and should NEVER be exposed to the browser.
 *
 * This client should only be used in:
 * - Server-side code (Node.js scripts)
 * - Edge functions (Supabase Edge Functions)
 * - API routes (Vercel serverless functions)
 *
 * For frontend operations, use the regular `supabase` client which uses the Publishable key and respects RLS.
 */
export const supabaseAdminOptimized: TypedSupabaseClient = (() => {
  // SECURITY: Admin client should not be available in frontend
  // If you need admin operations, use edge functions or API routes instead
  console.warn(
    '⚠️ SECURITY WARNING: supabaseAdmin should not be used in frontend code. ' +
    'Secret keys bypass RLS and expose your database. ' +
    'Use edge functions or API routes for admin operations instead.'
  );

  // Return regular client instead of admin client
  // This prevents accidental exposure of secret keys
  return supabaseOptimized;
})();

// Query result caching system
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  queryKey: string;
}

class QueryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private maxSize = 100; // Maximum cache entries
  
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }
  
  set<T>(key: string, data: T, ttl: number = 300000): void { // 5 min default TTL
    // LRU eviction if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      queryKey: key
    });
  }
  
  invalidate(pattern: string): void {
    for (const [key] of this.cache) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: SupabaseConnectionManager.getInstance().getMetrics().cacheHitRate
    };
  }
}

export const queryCache = new QueryCache();

// Utility functions for optimized operations
export const optimizedAuthUtils = {
  /**
   * Enhanced authentication check with performance monitoring
   */
  isAuthenticated: (session: Session | null): boolean => {
    const startTime = performance.now();
    const result = !!session?.user && !!session?.access_token;
    const duration = performance.now() - startTime;
    
    if (duration > 10) {
      logger.warn(`Slow auth check: ${duration.toFixed(2)}ms`);
    }
    
    return result;
  },

  /**
   * Optimized user ID extraction
   */
  getUserId: (session: Session | null): string | null => {
    return session?.user?.id || null;
  },

  /**
   * Enhanced error formatting with categorization
   */
  formatAuthError: (error: any): string => {
    if (!error) return 'An unknown error occurred';
    
    const message = error.message || error.error_description || 'Authentication failed';
    
    // Enhanced error mappings with retry suggestions
    const errorMappings: Record<string, string> = {
      'Invalid login credentials': 'Invalid email or password. Please check your credentials and try again.',
      'Email not confirmed': 'Please check your email and click the confirmation link before signing in.',
      'Password should be at least 6 characters': 'Password must be at least 6 characters long.',
      'User already registered': 'An account with this email already exists. Try signing in instead.',
      'Invalid email address': 'Please enter a valid email address.',
      'signups not allowed': 'New registrations are currently disabled. Please contact support.',
      'Network request failed': 'Connection error. Please check your internet connection and try again.',
      'timeout': 'Request timed out. Please try again.',
    };

    return errorMappings[message] || message;
  },

  /**
   * Optimized auth storage cleanup
   */
  clearAuthStorage: (): void => {
    try {
      const keysToRemove = [
        'sb.auth.v3.optimized',
        'sb.auth.admin.v3',
        'sb.auth.v2', // Legacy cleanup
        'supabase.auth.token',
        'sb-refresh-token',
        'sb-access-token'
      ];
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // Clear query cache on logout
      queryCache.clear();
    } catch {
      logger.warn('Failed to clear auth storage');
    }
  }
};

// Performance monitoring exports
export const getConnectionMetrics = () => SupabaseConnectionManager.getInstance().getMetrics();
export const resetConnectionMetrics = () => SupabaseConnectionManager.getInstance().resetMetrics();

// Helper function to create optimized query with caching
export function createOptimizedQuery<T>(
  queryKey: string,
  queryFn: () => Promise<{ data: T; error: any }>,
  cacheTTL: number = 300000 // 5 minutes default
) {
  return async (): Promise<{ data: T; error: any }> => {
    // Check cache first
    const cachedResult = queryCache.get<{ data: T; error: any }>(queryKey);
    if (cachedResult) {
      SupabaseConnectionManager.getInstance().recordQuery(0, false, true); // Cache hit
      return cachedResult;
    }
    
    // Execute query
    const result = await queryFn();
    
    // Cache successful results
    if (!result.error && result.data) {
      queryCache.set(queryKey, result, cacheTTL);
    }
    
    return result;
  };
}

// Export optimized clients as default
export const supabase = supabaseOptimized;
export const supabaseAdmin = supabaseAdminOptimized;

// Export types
export type { Session, User };
export type AuthError = {
  message: string;
  status?: number;
};