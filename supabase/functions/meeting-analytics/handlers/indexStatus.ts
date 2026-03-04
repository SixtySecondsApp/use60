/**
 * Index status handler: returns count of Railway-indexed transcripts for an org,
 * including shared demo transcripts.
 */

import { getRailwayDb } from '../db.ts';
import { successResponse, errorResponse } from '../helpers.ts';
import { SHARED_DEMO_ORG_ID } from '../constants.ts';

export async function handleGetIndexStatus(req: Request, orgId: string): Promise<Response> {
  try {
    const db = getRailwayDb();

    const result = await db.unsafe(
      `SELECT
         COUNT(*) FILTER (WHERE processed_at IS NOT NULL)::int as indexed_count,
         COUNT(*)::int as total_count
       FROM transcripts
       WHERE org_id = $1 OR org_id = $2`,
      [orgId, SHARED_DEMO_ORG_ID]
    );

    const row = result[0] as Record<string, unknown>;
    return successResponse({
      railway_indexed: Number(row?.indexed_count) || 0,
      railway_total: Number(row?.total_count) || 0,
    }, req);
  } catch (error) {
    console.error('Error fetching index status:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to fetch index status',
      500,
      req
    );
  }
}
