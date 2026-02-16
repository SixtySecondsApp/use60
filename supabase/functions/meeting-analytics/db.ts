/**
 * Railway PostgreSQL connection for Meeting Analytics.
 * Uses postgres.js with prepare: false for serverless/transaction pooler compatibility.
 */

import postgres from 'https://esm.sh/postgres@3.4.3';

let sql: ReturnType<typeof postgres> | null = null;

export function getRailwayDb() {
  if (!sql) {
    const url = Deno.env.get('RAILWAY_DATABASE_URL');
    if (!url) {
      throw new Error('RAILWAY_DATABASE_URL is required for meeting-analytics');
    }
    sql = postgres(url, {
      prepare: false,
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
}

export async function checkRailwayConnection(): Promise<boolean> {
  try {
    const db = getRailwayDb();
    const result = await db`SELECT 1 as connected`;
    return result[0]?.connected === 1;
  } catch (err) {
    console.error('Railway DB connection check failed:', err);
    return false;
  }
}
