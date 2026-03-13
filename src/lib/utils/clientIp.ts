/**
 * clientIp — Cached client IP lookup for passing to edge functions.
 *
 * Supabase Edge Functions don't reliably forward x-forwarded-for,
 * so we detect the IP client-side and include it in request bodies.
 */

let cachedIp: string | null = null;
let fetchPromise: Promise<string | null> | null = null;

/**
 * Returns the client's public IP address (cached after first call).
 * Returns null if lookup fails — never blocks or throws.
 */
export async function getClientIp(): Promise<string | null> {
  if (cachedIp) return cachedIp;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const res = await fetch('https://api.ipify.org?format=json', {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      cachedIp = data.ip || null;
      return cachedIp;
    } catch {
      return null;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}
