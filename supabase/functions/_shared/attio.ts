// supabase/functions/_shared/attio.ts
// Shared Attio API client with rate limiting, retry, and value adapter
// Mirrors the HubSpot client pattern from _shared/hubspot.ts

// ─── Types ───────────────────────────────────────────────────────────────────

export type AttioApiError = {
  status: number
  message: string
  retryAfterMs?: number
  responseBody?: any
}

export class AttioError extends Error {
  status: number
  retryAfterMs?: number
  responseBody?: any

  constructor(args: AttioApiError) {
    super(args.message)
    this.name = 'AttioError'
    this.status = args.status
    this.retryAfterMs = args.retryAfterMs
    this.responseBody = args.responseBody
  }
}

/** A single Attio attribute value (values are always arrays in Attio) */
export interface AttioValue {
  [key: string]: any
}

/** An Attio record as returned by the API */
export interface AttioRecord {
  id: { object_id: string; record_id: string }
  values: Record<string, AttioValue[]>
  created_at?: string
}

/** An Attio list entry as returned by the API */
export interface AttioListEntry {
  entry_id: string
  list_id: string
  parent_object: string
  parent_record_id: string
  entry_values: Record<string, AttioValue[]>
  created_at?: string
}

/** Filter operators for Attio queries */
export type AttioFilterOperator =
  | '$eq'
  | '$neq'
  | '$contains'
  | '$not_contains'
  | '$gt'
  | '$gte'
  | '$lt'
  | '$lte'
  | '$is_empty'
  | '$is_not_empty'

export interface AttioFilter {
  $and?: AttioFilterClause[]
  $or?: AttioFilterClause[]
  $not?: AttioFilterClause
}

export interface AttioFilterClause {
  [attribute: string]: {
    [nested: string]: {
      [operator: string]: any
    }
  } | AttioFilter
}

export interface AttioSort {
  attribute: string
  field?: string
  direction: 'asc' | 'desc'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Value Adapter ───────────────────────────────────────────────────────────

/**
 * Convert a flat key-value object to Attio's array-wrapped value format.
 *
 * Attio requires values like:
 *   { name: [{ value: "Acme" }] }
 *   { email_addresses: [{ email_address: "a@b.com" }] }
 *
 * This helper handles common attribute types:
 * - Simple text/number/boolean → [{ value: x }]
 * - Email → [{ email_address: x }]
 * - Phone → [{ phone_number: x }]
 * - Domain → [{ domain: x }]
 * - Arrays are passed through as-is (already Attio format)
 */
export function toAttioValues(
  flatObj: Record<string, any>,
  fieldTypeMap?: Record<string, string>
): Record<string, AttioValue[]> {
  const result: Record<string, AttioValue[]> = {}

  for (const [key, val] of Object.entries(flatObj)) {
    if (val === undefined || val === null) continue

    // Already in Attio array format
    if (Array.isArray(val)) {
      result[key] = val
      continue
    }

    const fieldType = fieldTypeMap?.[key]

    switch (fieldType) {
      case 'email':
        result[key] = [{ email_address: String(val) }]
        break
      case 'phone':
        result[key] = [{ phone_number: String(val) }]
        break
      case 'domain':
        result[key] = [{ domain: String(val) }]
        break
      case 'location':
        result[key] = [typeof val === 'object' ? val : { line_1: String(val) }]
        break
      case 'record_reference':
        result[key] = [{ target_record_id: String(val) }]
        break
      default:
        // Default: simple value wrapper
        result[key] = [{ value: val }]
        break
    }
  }

  return result
}

/**
 * Flatten an Attio record's nested array values to simple key-value pairs.
 *
 * Takes Attio's format:
 *   { name: [{ first_name: "John", last_name: "Doe", full_name: "John Doe" }] }
 *   { email_addresses: [{ email_address: "john@acme.com" }] }
 *
 * Returns:
 *   { name: "John Doe", email_addresses: "john@acme.com", ... }
 *
 * Extraction priority for each value object:
 *   1. full_name / value (common wrappers)
 *   2. email_address / phone_number / domain (typed fields)
 *   3. First string/number/boolean property found
 */
export function fromAttioValues(values: Record<string, AttioValue[]>): Record<string, any> {
  const result: Record<string, any> = {}

  for (const [key, valArray] of Object.entries(values)) {
    if (!Array.isArray(valArray) || valArray.length === 0) {
      result[key] = null
      continue
    }

    const first = valArray[0]
    if (!first || typeof first !== 'object') {
      result[key] = first ?? null
      continue
    }

    // Try known extraction keys in priority order
    const extractionKeys = [
      'full_name', 'value',
      'email_address', 'phone_number', 'domain',
      'target_record_id', 'first_name',
      'line_1', 'currency_value',
    ]

    let extracted: any = undefined
    for (const ek of extractionKeys) {
      if (ek in first && first[ek] !== undefined && first[ek] !== null) {
        extracted = first[ek]
        break
      }
    }

    if (extracted !== undefined) {
      result[key] = extracted
    } else {
      // Fallback: return first primitive value found
      for (const v of Object.values(first)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          result[key] = v
          break
        }
      }
      if (!(key in result)) {
        // Return the whole first object if no primitive found
        result[key] = first
      }
    }
  }

  return result
}

/**
 * Extract a specific nested field from an Attio record's values.
 * Supports dot-notation paths like "email_addresses.email_address"
 */
export function extractAttioField(
  values: Record<string, AttioValue[]>,
  fieldPath: string
): any {
  const parts = fieldPath.split('.')
  const attrName = parts[0]
  const valArray = values[attrName]

  if (!Array.isArray(valArray) || valArray.length === 0) return null

  const first = valArray[0]
  if (parts.length === 1) {
    // Use fromAttioValues logic for single field
    const flat = fromAttioValues({ [attrName]: valArray })
    return flat[attrName]
  }

  // Nested path: walk the object
  let current: any = first
  for (let i = 1; i < parts.length; i++) {
    if (current == null || typeof current !== 'object') return null
    current = current[parts[i]]
  }
  return current ?? null
}

// ─── Filter Builder ──────────────────────────────────────────────────────────

/**
 * Build an Attio filter object from a simple conditions array.
 *
 * Usage:
 *   buildFilter([
 *     { attribute: 'email_addresses', field: 'email_address', op: '$eq', value: 'john@acme.com' },
 *     { attribute: 'name', field: 'full_name', op: '$contains', value: 'John' }
 *   ])
 *
 * Returns:
 *   { $and: [
 *     { email_addresses: { email_address: { $eq: "john@acme.com" } } },
 *     { name: { full_name: { $contains: "John" } } }
 *   ]}
 */
export function buildFilter(
  conditions: Array<{
    attribute: string
    field: string
    op: string
    value?: any
  }>,
  logic: '$and' | '$or' = '$and'
): AttioFilter {
  const clauses: AttioFilterClause[] = conditions.map((c) => ({
    [c.attribute]: {
      [c.field]: c.value !== undefined ? { [c.op]: c.value } : { [c.op]: true },
    },
  }))
  return { [logic]: clauses }
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class AttioClient {
  private accessToken: string
  private baseUrl: string
  private readDelayMs: number
  private writeDelayMs: number

  constructor(args: {
    accessToken: string
    baseUrl?: string
    readDelayMs?: number
    writeDelayMs?: number
  }) {
    this.accessToken = args.accessToken
    this.baseUrl = args.baseUrl || 'https://api.attio.com'
    // Attio limits: 100 reads/s, 25 writes/s
    // 10ms spacing for reads (100/s), 40ms for writes (25/s)
    this.readDelayMs = typeof args.readDelayMs === 'number' ? args.readDelayMs : 10
    this.writeDelayMs = typeof args.writeDelayMs === 'number' ? args.writeDelayMs : 40
  }

  async request<T>(args: {
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
    path: string
    query?: Record<string, string | number | boolean | undefined | null>
    body?: any
    retries?: number
  }): Promise<T> {
    const retries = typeof args.retries === 'number' ? args.retries : 3
    const isWrite = args.method !== 'GET'
    const delayMs = isWrite ? this.writeDelayMs : this.readDelayMs

    let attempt = 0
    let lastError: any = null
    while (attempt <= retries) {
      try {
        if (delayMs > 0) await sleep(delayMs)

        const url = new URL(this.baseUrl + args.path)
        if (args.query) {
          for (const [k, v] of Object.entries(args.query)) {
            if (v === undefined || v === null) continue
            url.searchParams.set(k, String(v))
          }
        }

        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        }

        const resp = await fetch(url.toString(), {
          method: args.method,
          headers,
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
          console.error('[AttioClient] JSON parse error:', {
            error: parseError.message,
            responseText: text.substring(0, 500),
            status: resp.status,
            url: url.toString(),
          })
          json = text ? { message: text } : null
        }

        if (!resp.ok) {
          const msg =
            json?.message ||
            json?.error?.message ||
            json?.error ||
            `Attio API error (${resp.status})`
          throw new AttioError({
            status: resp.status,
            message: msg,
            retryAfterMs,
            responseBody: json,
          })
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
        console.warn(`[AttioClient] Retrying (${attempt + 1}/${retries}) after ${waitMs}ms for ${args.method} ${args.path}`)
        await sleep(waitMs)
        attempt++
      }
    }

    throw lastError || new Error('Attio request failed')
  }

  // ─── Convenience Methods ─────────────────────────────────────────────────

  /** Query records for an object (people, companies, deals, etc.) */
  async queryRecords(
    object: string,
    opts?: {
      filter?: AttioFilter
      sorts?: AttioSort[]
      limit?: number
      offset?: number
    }
  ): Promise<{ data: AttioRecord[]; next_offset?: number }> {
    const body: any = {}
    if (opts?.filter) body.filter = opts.filter
    if (opts?.sorts) body.sorts = opts.sorts
    if (opts?.limit) body.limit = Math.min(opts.limit, 500)
    if (opts?.offset) body.offset = opts.offset

    return this.request<{ data: AttioRecord[]; next_offset?: number }>({
      method: 'POST',
      path: `/v2/objects/${encodeURIComponent(object)}/records/query`,
      body,
    })
  }

  /** Get a single record by ID */
  async getRecord(object: string, recordId: string): Promise<AttioRecord> {
    return this.request<AttioRecord>({
      method: 'GET',
      path: `/v2/objects/${encodeURIComponent(object)}/records/${encodeURIComponent(recordId)}`,
    })
  }

  /** Create a new record */
  async createRecord(
    object: string,
    values: Record<string, AttioValue[]>
  ): Promise<AttioRecord> {
    return this.request<AttioRecord>({
      method: 'POST',
      path: `/v2/objects/${encodeURIComponent(object)}/records`,
      body: { data: { values } },
    })
  }

  /** Assert (upsert) a record using a matching attribute */
  async assertRecord(
    object: string,
    values: Record<string, AttioValue[]>,
    matchingAttribute: string
  ): Promise<AttioRecord> {
    return this.request<AttioRecord>({
      method: 'PUT',
      path: `/v2/objects/${encodeURIComponent(object)}/records`,
      query: { matching_attribute: matchingAttribute },
      body: { data: { values } },
    })
  }

  /** Update an existing record by ID */
  async updateRecord(
    object: string,
    recordId: string,
    values: Record<string, AttioValue[]>
  ): Promise<AttioRecord> {
    return this.request<AttioRecord>({
      method: 'PATCH',
      path: `/v2/objects/${encodeURIComponent(object)}/records/${encodeURIComponent(recordId)}`,
      body: { data: { values } },
    })
  }

  /** Delete a record by ID */
  async deleteRecord(object: string, recordId: string): Promise<void> {
    await this.request<void>({
      method: 'DELETE',
      path: `/v2/objects/${encodeURIComponent(object)}/records/${encodeURIComponent(recordId)}`,
    })
  }

  /** List all objects in the workspace */
  async listObjects(): Promise<{ data: any[] }> {
    return this.request<{ data: any[] }>({
      method: 'GET',
      path: '/v2/objects',
    })
  }

  /** List attributes for an object */
  async listAttributes(object: string): Promise<{ data: any[] }> {
    return this.request<{ data: any[] }>({
      method: 'GET',
      path: `/v2/objects/${encodeURIComponent(object)}/attributes`,
    })
  }

  /** List all lists (including deal pipelines) */
  async listLists(): Promise<{ data: any[] }> {
    return this.request<{ data: any[] }>({
      method: 'GET',
      path: '/v2/lists',
    })
  }

  /** Query list entries */
  async queryListEntries(
    listId: string,
    opts?: {
      filter?: AttioFilter
      sorts?: AttioSort[]
      limit?: number
      offset?: number
    }
  ): Promise<{ data: AttioListEntry[]; next_offset?: number }> {
    const body: any = {}
    if (opts?.filter) body.filter = opts.filter
    if (opts?.sorts) body.sorts = opts.sorts
    if (opts?.limit) body.limit = Math.min(opts.limit, 500)
    if (opts?.offset) body.offset = opts.offset

    return this.request<{ data: AttioListEntry[]; next_offset?: number }>({
      method: 'POST',
      path: `/v2/lists/${encodeURIComponent(listId)}/entries/query`,
      body,
    })
  }

  /** Add a record to a list */
  async addToList(
    listId: string,
    parentObject: string,
    parentRecordId: string,
    entryValues?: Record<string, AttioValue[]>
  ): Promise<AttioListEntry> {
    return this.request<AttioListEntry>({
      method: 'POST',
      path: `/v2/lists/${encodeURIComponent(listId)}/entries`,
      body: {
        data: {
          parent_object: parentObject,
          parent_record_id: parentRecordId,
          ...(entryValues ? { entry_values: entryValues } : {}),
        },
      },
    })
  }

  /** Remove an entry from a list */
  async removeFromList(listId: string, entryId: string): Promise<void> {
    await this.request<void>({
      method: 'DELETE',
      path: `/v2/lists/${encodeURIComponent(listId)}/entries/${encodeURIComponent(entryId)}`,
    })
  }

  /** List notes (optionally filtered by parent) */
  async listNotes(opts?: {
    parent_object?: string
    parent_record_id?: string
    limit?: number
    offset?: number
  }): Promise<{ data: any[] }> {
    const query: Record<string, string | number | boolean | undefined> = {}
    if (opts?.parent_object) query.parent_object = opts.parent_object
    if (opts?.parent_record_id) query.parent_record_id = opts.parent_record_id
    if (opts?.limit) query.limit = opts.limit
    if (opts?.offset) query.offset = opts.offset

    return this.request<{ data: any[] }>({
      method: 'GET',
      path: '/v2/notes',
      query,
    })
  }

  /** Create a note */
  async createNote(data: {
    parent_object: string
    parent_record_id: string
    title: string
    content_plaintext?: string
    format?: 'plaintext'
  }): Promise<any> {
    return this.request<any>({
      method: 'POST',
      path: '/v2/notes',
      body: { data },
    })
  }

  /** List tasks */
  async listTasks(opts?: {
    limit?: number
    offset?: number
  }): Promise<{ data: any[] }> {
    return this.request<{ data: any[] }>({
      method: 'GET',
      path: '/v2/tasks',
      query: opts,
    })
  }

  /** Create a task */
  async createTask(data: {
    content: string
    deadline_at?: string
    is_completed?: boolean
    assignees?: Array<{ referenced_actor_type: string; referenced_actor_id: string }>
    linked_records?: Array<{ target_object: string; target_record_id: string }>
  }): Promise<any> {
    return this.request<any>({
      method: 'POST',
      path: '/v2/tasks',
      body: { data },
    })
  }

  /** List webhooks */
  async listWebhooks(): Promise<{ data: any[] }> {
    return this.request<{ data: any[] }>({
      method: 'GET',
      path: '/v2/webhooks',
    })
  }

  /** Create a webhook subscription */
  async createWebhook(data: {
    target_url: string
    subscriptions: Array<{ event_type: string; filter?: any }>
  }): Promise<any> {
    return this.request<any>({
      method: 'POST',
      path: '/v2/webhooks',
      body: { data },
    })
  }

  /** Delete a webhook */
  async deleteWebhook(webhookId: string): Promise<void> {
    await this.request<void>({
      method: 'DELETE',
      path: `/v2/webhooks/${encodeURIComponent(webhookId)}`,
    })
  }

  /** Get workspace info */
  async getWorkspace(): Promise<any> {
    return this.request<any>({
      method: 'GET',
      path: '/v2/self',
    })
  }
}
