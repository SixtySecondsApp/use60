/**
 * Response Caching Utility for Edge Functions
 * 
 * Based on Phase 3 audit findings:
 * - "Cache Hit Rate: 67% (client-side)" - improve to server-side caching
 * - "Edge Function Cold Starts: 200-400ms initial latency"
 * - "Average Response Time: 240ms (Edge Functions)"
 * 
 * Target: Reduce response times by 30-50% through server-side caching
 */

interface CacheEntry {
  data: any;
  timestamp: number;
  etag: string;
  ttl: number; // Time to live in milliseconds
  staleWhileRevalidate?: number; // Serve stale data while refreshing
  headers?: Record<string, string>;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  staleWhileRevalidate?: number; // Serve stale data while refreshing
  cacheKey?: string; // Custom cache key
  skipCache?: boolean; // Skip caching for this request
  varyHeaders?: string[]; // Headers that affect caching
}

class EdgeFunctionCache {
  private cache = new Map<string, CacheEntry>();
  public readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 1000; // Prevent memory leaks

  async generateCacheKey(req: Request, customKey?: string): Promise<string> {
    if (customKey) return customKey;

    const url = new URL(req.url);
    const method = req.method;
    const pathname = url.pathname;
    const searchParams = url.searchParams.toString();

    // Include user ID in cache key for user-specific data
    // Uses SHA-256 to prevent cross-user cache collisions
    const authHeader = req.headers.get('Authorization');
    const userHash = authHeader ? await this.hashStringSHA256(authHeader) : 'anonymous';

    return `${method}:${pathname}:${searchParams}:${userHash}`;
  }

  /**
   * SHA-256 hash using Web Crypto API, truncated to 16 hex chars (64 bits).
   * Provides collision resistance far beyond the old 32-bit hash.
   */
  private async hashStringSHA256(str: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    const hashHex = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
    // Truncate to 16 hex chars (64 bits) — sufficient for cache keys
    return hashHex.substring(0, 16);
  }

  /**
   * Synchronous weak hash for ETags only (not security-sensitive).
   */
  private hashStringSync(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  generateETag(data: any): string {
    const content = JSON.stringify(data);
    return this.hashStringSync(content);
  }

  get(key: string, options: CacheOptions = {}): CacheEntry | null {
    // Honor skipCache option
    if (options.skipCache) {
      return null;
    }

    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    const age = now - entry.timestamp;
    
    // Check vary headers if specified
    if (options.varyHeaders && entry.headers) {
      // Simple header matching - in real implementation would compare actual request headers
      const hasVaryMismatch = options.varyHeaders.some(header => 
        entry.headers?.[header] !== undefined && 
        entry.headers[header] !== this.getCurrentHeaderValue(header)
      );
      if (hasVaryMismatch) {
        return null;
      }
    }
    
    // Return fresh data using stored TTL
    if (age < entry.ttl) {
      return entry;
    }

    // Check stale-while-revalidate
    if (entry.staleWhileRevalidate && age < (entry.ttl + entry.staleWhileRevalidate)) {
      // Return stale data but mark for revalidation
      return { ...entry, stale: true } as CacheEntry & { stale: boolean };
    }

    // Clean up expired entry
    this.cache.delete(key);
    return null;
  }

  private getCurrentHeaderValue(headerName: string): string | undefined {
    // Placeholder - in real implementation would get from current request
    return undefined;
  }

  set(key: string, data: any, options: CacheOptions = {}): void {
    // Don't store if skipCache is set
    if (options.skipCache) {
      return;
    }

    // Prevent cache from growing too large
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      etag: this.generateETag(data),
      ttl: options.ttl ?? this.DEFAULT_TTL, // Use provided TTL or default
      staleWhileRevalidate: options.staleWhileRevalidate,
      headers: options.varyHeaders ? this.extractHeaders(data, options.varyHeaders) : undefined
    };

    this.cache.set(key, entry);
  }

  private extractHeaders(data: any, headerNames: string[]): Record<string, string> {
    const headers: Record<string, string> = {};
    // This would extract relevant headers if needed
    return headers;
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; hitRate: number } {
    // This would track hit rates in a real implementation
    return {
      size: this.cache.size,
      hitRate: 0 // Placeholder
    };
  }
}

const cache = new EdgeFunctionCache();

/**
 * Cache middleware for Edge Functions
 */
export async function cacheMiddleware(
  req: Request,
  handler: () => Promise<Response>,
  options: CacheOptions = {}
): Promise<Response> {
  
  // Skip caching for non-GET requests or when explicitly disabled
  if (req.method !== 'GET' || options.skipCache) {
    return await handler();
  }

  const cacheKey = await cache.generateCacheKey(req, options.cacheKey);
  
  // Check for cached response
  const cachedEntry = cache.get(cacheKey, options);
  
  // Handle conditional requests (ETag)
  const ifNoneMatch = req.headers.get('If-None-Match');
  if (cachedEntry && ifNoneMatch === cachedEntry.etag) {
    const maxAge = Math.floor(cachedEntry.ttl / 1000);
    const staleWhileRevalidate = cachedEntry.staleWhileRevalidate 
      ? `, stale-while-revalidate=${Math.floor(cachedEntry.staleWhileRevalidate / 1000)}` 
      : '';
    
    return new Response(null, {
      status: 304,
      headers: {
        'ETag': cachedEntry.etag,
        'Cache-Control': `max-age=${maxAge}${staleWhileRevalidate}`
      }
    });
  }

  // Return cached response if available
  if (cachedEntry) {
    const maxAge = Math.floor(cachedEntry.ttl / 1000);
    const staleWhileRevalidate = cachedEntry.staleWhileRevalidate 
      ? `, stale-while-revalidate=${Math.floor(cachedEntry.staleWhileRevalidate / 1000)}` 
      : '';
    
    // Check if entry is stale
    const isStale = (cachedEntry as any).stale;
    const cacheStatus = isStale ? 'STALE' : 'HIT';
    
    const response = new Response(JSON.stringify(cachedEntry.data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'ETag': cachedEntry.etag,
        'Cache-Control': `max-age=${maxAge}${staleWhileRevalidate}`,
        'X-Cache': cacheStatus,
        'X-Cache-Age': Math.floor((Date.now() - cachedEntry.timestamp) / 1000).toString()
      }
    });
    return response;
  }

  // Execute handler and cache response
  try {
    const response = await handler();
    
    // Only cache successful responses
    if (response.status === 200) {
      const responseData = await response.clone().json();
      cache.set(cacheKey, responseData, options);
      
      const etag = cache.generateETag(responseData);
      
      const ttl = options.ttl ?? cache.DEFAULT_TTL;
      const maxAge = Math.floor(ttl / 1000);
      const staleWhileRevalidate = options.staleWhileRevalidate 
        ? `, stale-while-revalidate=${Math.floor(options.staleWhileRevalidate / 1000)}` 
        : '';
      
      // Return response with cache headers
      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'ETag': etag,
          'Cache-Control': `max-age=${maxAge}${staleWhileRevalidate}`,
          'X-Cache': 'MISS'
        }
      });
    }

    return response;
  } catch (error) {
    return await handler(); // Fallback to uncached response
  }
}

/**
 * Invalidate cache entries by pattern
 */
export function invalidateCache(pattern?: string): void {
  if (!pattern) {
    cache.clear();
    return;
  }

  // Remove entries matching pattern
  const keysToDelete: string[] = [];
  for (const key of cache.cache.keys()) {
    if (key.includes(pattern)) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach(key => cache.cache.delete(key));
}

/**
 * Warm up cache with commonly accessed data
 */
export async function warmupCache(
  supabaseClient: any,
  commonQueries: Array<{ key: string; query: () => Promise<any> }>
): Promise<void> {
  try {
    const warmupPromises = commonQueries.map(async ({ key, query }) => {
      try {
        const data = await query();
        cache.set(key, data);
      } catch (error) {
      }
    });

    await Promise.all(warmupPromises);
  } catch (error) {
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return cache.getStats();
}

export default {
  cacheMiddleware,
  invalidateCache,
  warmupCache,
  getCacheStats
};