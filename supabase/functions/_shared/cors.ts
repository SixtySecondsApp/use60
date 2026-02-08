// supabase/functions/_shared/cors.ts
//
// MIGRATION BRIDGE: Re-exports from corsHelper.ts.
//
// The static `corsHeaders` object is kept for backwards compatibility with 90+ functions.
// NEW functions should use getCorsHeaders(req) from corsHelper.ts for origin-validated CORS.
//
// Migration plan:
// 1. [DONE] corsHelper.ts has allowlist-based getCorsHeaders(req)
// 2. [DONE] New functions (65+) already use corsHelper.ts directly
// 3. [TODO] Gradually migrate remaining 90 functions from static corsHeaders to getCorsHeaders(req)
//
// For new code, import directly from corsHelper.ts:
//   import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

export {
  corsHeaders,
  getCorsHeaders,
  handleCorsPreflightRequest,
  handleCorsPreflightWithResponse,
  jsonResponse,
  errorResponse,
  isOriginAllowed,
} from './corsHelper.ts';
