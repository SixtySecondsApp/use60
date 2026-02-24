export type HubSpotApiError = {
  status: number
  message: string
  retryAfterMs?: number
  responseBody?: any
}

export class HubSpotError extends Error {
  status: number
  retryAfterMs?: number
  responseBody?: any

  constructor(args: HubSpotApiError) {
    super(args.message)
    this.name = 'HubSpotError'
    this.status = args.status
    this.retryAfterMs = args.retryAfterMs
    this.responseBody = args.responseBody
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseRetryAfterMs(headers: Headers): number | undefined {
  const ra = headers.get('retry-after')
  if (!ra) return undefined
  const n = Number(ra)
  if (Number.isFinite(n) && n > 0) return Math.floor(n * 1000)
  const t = Date.parse(ra)
  if (Number.isFinite(t)) {
    const ms = t - Date.now()
    return ms > 0 ? ms : undefined
  }
  return undefined
}

export class HubSpotClient {
  private accessToken: string
  private baseUrl: string
  private minDelayMs: number

  constructor(args: { accessToken: string; baseUrl?: string; minDelayMs?: number }) {
    this.accessToken = args.accessToken
    this.baseUrl = args.baseUrl || 'https://api.hubapi.com'
    // HubSpot limit: 100 requests / 10s => 10 req/s. 120ms spacing is conservative.
    this.minDelayMs = typeof args.minDelayMs === 'number' ? args.minDelayMs : 120
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
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
        })

        const retryAfterMs = parseRetryAfterMs(resp.headers)

        if (resp.status === 204) return undefined as T

        const text = await resp.text()
        let json: any = null
        try {
          const trimmed = text.trim()
          json = trimmed ? JSON.parse(trimmed) : null
        } catch (parseError: any) {
          console.error('[HubSpotClient] JSON parse error:', {
            error: parseError.message,
            responseText: text.substring(0, 500), // First 500 chars
            status: resp.status,
            url: url.toString(),
          })
          json = text ? { message: text } : null
        }

        if (!resp.ok) {
          const msg = json?.message || json?.error || `HubSpot API error (${resp.status})`
          throw new HubSpotError({ status: resp.status, message: msg, retryAfterMs, responseBody: json })
        }

        return json as T
      } catch (err: any) {
        lastError = err
        const status = err?.status

        // Retry on 429 and transient 5xx
        const isRetryable = status === 429 || (typeof status === 'number' && status >= 500)
        if (!isRetryable || attempt === retries) throw err

        const backoffBase = 1000
        const exp = backoffBase * Math.pow(2, attempt)
        const waitMs = Math.min(30_000, err?.retryAfterMs ?? exp)
        await sleep(waitMs)
        attempt++
      }
    }

    throw lastError || new Error('HubSpot request failed')
  }
}


