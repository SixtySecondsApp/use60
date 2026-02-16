/**
 * Railway PostgreSQL connection for Meeting Analytics.
 * Uses deno-postgres (native Deno driver) for Supabase Edge Runtime compatibility.
 */

import { Pool } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const url = Deno.env.get('RAILWAY_DATABASE_URL');
    if (!url) {
      throw new Error('RAILWAY_DATABASE_URL is required for meeting-analytics');
    }
    pool = new Pool(url, 5, true);
  }
  return pool;
}

/**
 * Wrapper that mimics postgresjs `sql.unsafe(query, params)` API.
 * Returns an array of row objects from deno-postgres queryObject.
 */
export function getRailwayDb() {
  const p = getPool();
  return {
    /**
     * Execute a parameterized query. Matches postgresjs unsafe() signature.
     */
    async unsafe<T = Record<string, unknown>>(
      query: string,
      params: unknown[] = []
    ): Promise<T[]> {
      const client = await p.connect();
      try {
        const result = await client.queryObject<T>({ text: query, args: params });
        return result.rows;
      } finally {
        client.release();
      }
    },
  };
}

export async function checkRailwayConnection(): Promise<boolean> {
  try {
    const db = getRailwayDb();
    const result = await db.unsafe<{ connected: number }>('SELECT 1 as connected');
    return result[0]?.connected === 1;
  } catch (err) {
    console.error('Railway DB connection check failed:', err);
    return false;
  }
}
