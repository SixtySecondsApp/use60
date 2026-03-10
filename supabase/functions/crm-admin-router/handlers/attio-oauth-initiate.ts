// Handler: delegates to oauth-initiate/providers/attio.ts
import { handleInitiate } from '../../oauth-initiate/providers/attio.ts'

export async function handleAttioOauthInitiate(req: Request): Promise<Response> {
  return handleInitiate(req)
}
