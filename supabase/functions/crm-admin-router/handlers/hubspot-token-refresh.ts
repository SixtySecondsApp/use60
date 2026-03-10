// Handler: delegates to oauth-token-refresh/providers/hubspot.ts
import { handleRefresh } from '../../oauth-token-refresh/providers/hubspot.ts'

export async function handleHubspotTokenRefresh(req: Request): Promise<Response> {
  return handleRefresh(req)
}
