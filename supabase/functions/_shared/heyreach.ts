export type HeyReachApiError = {
  status: number
  message: string
  retryAfterMs?: number
  responseBody?: any
}

export class HeyReachError extends Error {
  status: number
  retryAfterMs?: number
  responseBody?: any

  constructor(args: HeyReachApiError) {
    super(args.message)
    this.name = 'HeyReachError'
    this.status = args.status
    this.retryAfterMs = args.retryAfterMs
    this.responseBody = args.responseBody
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class HeyReachClient {
  private apiKey: string
  private baseUrl: string
  private minDelayMs: number

  constructor(args: { apiKey: string; baseUrl?: string; minDelayMs?: number }) {
    this.apiKey = args.apiKey
    this.baseUrl = args.baseUrl || 'https://api.heyreach.io'
    // HeyReach allows 300 req/min → ~200ms between requests to be safe
    this.minDelayMs = typeof args.minDelayMs === 'number' ? args.minDelayMs : 200
  }

  async request<T>(args: {
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
    path: string
    query?: Record<string, string | number | boolean | undefined | null>
    body?: any
    retries?: number
  }): Promise<T> {
    const retries = typeof args.retries === 'number' ? args.retries : 3

    let attempt = 0
    let lastError: any = null
    while (attempt <= retries) {
      try {
        if (this.minDelayMs > 0) await sleep(this.minDelayMs)

        const url = new URL(this.baseUrl + args.path)
        if (args.query) {
          for (const [k, v] of Object.entries(args.query)) {
            if (v === undefined || v === null) continue
            url.searchParams.set(k, String(v))
          }
        }

        const resp = await fetch(url.toString(), {
          method: args.method,
          headers: {
            'X-API-KEY': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
        })

        if (resp.status === 429) {
          const waitMs = 2000 * Math.pow(2, attempt)
          console.warn(`[HeyReachClient] Rate limited (429). Retrying in ${waitMs}ms (attempt ${attempt + 1}/${retries})`)
          await sleep(waitMs)
          attempt++
          continue
        }

        if (!resp.ok) {
          let bodyText = ''
          try { bodyText = await resp.text() } catch (_) { /* ignore */ }
          let bodyJson: any
          try { bodyJson = JSON.parse(bodyText) } catch (_) { /* ignore */ }

          throw new HeyReachError({
            status: resp.status,
            message: bodyJson?.message || bodyJson?.error || bodyText || `HTTP ${resp.status}`,
            responseBody: bodyJson || bodyText,
          })
        }

        const text = await resp.text()
        if (!text) return {} as T
        return JSON.parse(text) as T
      } catch (e: any) {
        if (e instanceof HeyReachError) {
          lastError = e
          if (e.status >= 500 && attempt < retries) {
            await sleep(1000 * Math.pow(2, attempt))
            attempt++
            continue
          }
          throw e
        }
        lastError = e
        if (attempt < retries) {
          await sleep(1000 * Math.pow(2, attempt))
          attempt++
          continue
        }
        throw e
      }
    }
    throw lastError || new Error('HeyReach request failed after retries')
  }
}
