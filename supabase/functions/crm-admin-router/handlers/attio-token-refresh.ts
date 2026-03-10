// Handler: delegates to oauth-token-refresh/providers/attio.ts
import { handleRefresh } from '../../oauth-token-refresh/providers/attio.ts'

export async function handleAttioTokenRefresh(req: Request): Promise<Response> {
  return handleRefresh(req)
}
