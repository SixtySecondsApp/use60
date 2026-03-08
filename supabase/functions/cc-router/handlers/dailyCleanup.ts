/**
 * Handler placeholder for cc-daily-cleanup
 *
 * The original cc-daily-cleanup edge function does not exist yet.
 * This handler returns a 501 Not Implemented response as a placeholder
 * so the router action key is reserved and ready for implementation.
 */

import {
  jsonResponse,
} from '../../_shared/corsHelper.ts';

export async function handleDailyCleanup(req: Request): Promise<Response> {
  console.log('[cc-daily-cleanup] Handler not yet implemented');
  return jsonResponse(
    { error: 'daily_cleanup handler is not yet implemented', status: 'not_implemented' },
    req,
    501,
  );
}
