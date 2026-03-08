/**
 * Copilot handler — delegates to the exported handler in api-copilot/index.ts
 *
 * The api-copilot function is ~9,300 lines. Rather than duplicating all that code,
 * we import the extracted handler function directly.
 */

import { handleCopilotRequest } from '../../api-copilot/index.ts';

export async function handleCopilot(req: Request): Promise<Response> {
  return handleCopilotRequest(req);
}
