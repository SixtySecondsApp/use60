/**
 * Google OAuth Initiate — delegates to oauth-initiate/providers/google.ts
 */

import { handleInitiate as googleInitiate } from '../../oauth-initiate/providers/google.ts';

export async function handleOauthInitiate(req: Request): Promise<Response> {
  return googleInitiate(req);
}
