// Handler: delegates to oauth-initiate/providers/bullhorn.ts
import { handleInitiate } from '../../oauth-initiate/providers/bullhorn.ts'

export async function handleBullhornOauthInitiate(req: Request): Promise<Response> {
  return handleInitiate(req)
}
