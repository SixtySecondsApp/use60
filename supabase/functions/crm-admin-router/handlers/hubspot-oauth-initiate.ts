// Handler: delegates to oauth-initiate/providers/hubspot.ts
import { handleInitiate } from '../../oauth-initiate/providers/hubspot.ts'

export async function handleHubspotOauthInitiate(req: Request): Promise<Response> {
  return handleInitiate(req)
}
