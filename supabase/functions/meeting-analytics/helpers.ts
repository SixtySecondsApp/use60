/**
 * Shared response helpers for meeting-analytics edge function handlers.
 */

import { getCorsHeaders } from '../_shared/corsHelper.ts';

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
