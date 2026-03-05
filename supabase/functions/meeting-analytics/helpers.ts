/**
 * Shared response helpers for meeting-analytics edge function handlers.
 */

import { getCorsHeaders } from '../_shared/corsHelper.ts';
import { SHARED_DEMO_ORG_ID } from './constants.ts';

/**
 * Returns a SQL fragment that matches both the user's org and the shared demo org.
 * Use paramIndex to specify which $N placeholder holds the orgId.
 */
export function buildOrgFilter(paramIndex: number, alias = 't'): string {
  return `(${alias}.org_id = $${paramIndex} OR ${alias}.org_id = '${SHARED_DEMO_ORG_ID}')`;
}

export function jsonResponse(data: unknown, status = 200, req: Request): Response {
  const headers = { 'Content-Type': 'application/json', ...getCorsHeaders(req) };
  return new Response(JSON.stringify(data), { status, headers });
}

export function successResponse(data: unknown, req: Request): Response {
  return jsonResponse({ success: true, data }, 200, req);
}

export function errorResponse(message: string, status: number, req: Request): Response {
  return jsonResponse({ success: false, error: message }, status, req);
}

export function getApiPath(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\/meeting-analytics\/?(.*)$/);
    const suffix = match ? match[1] || '' : pathname.replace(/^\/+/, '');
    return suffix.startsWith('api') ? suffix : pathname.replace(/^\/+/, '');
  } catch {
    return url;
  }
}
