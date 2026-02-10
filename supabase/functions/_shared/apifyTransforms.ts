/**
 * Shared transform functions for Apify mapping pipeline.
 *
 * Each transform: (value: unknown) => unknown | null
 * All transforms handle null/undefined input gracefully (return null).
 */

// Personal email domains for GDPR flagging
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com',
  'gmx.com', 'live.com', 'msn.com', 'me.com', 'fastmail.com',
  'tutanota.com', 'hey.com', 'pm.me',
])

// ---------------------------------------------------------------------------
// String transforms
// ---------------------------------------------------------------------------

export function lowercase(value: unknown): string | null {
  if (value == null) return null
  return String(value).toLowerCase()
}

export function uppercase(value: unknown): string | null {
  if (value == null) return null
  return String(value).toUpperCase()
}

export function trim(value: unknown): string | null {
  if (value == null) return null
  return String(value).trim()
}

export function stringify(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

// ---------------------------------------------------------------------------
// Phone transforms
// ---------------------------------------------------------------------------

/**
 * Normalise phone to E.164 format.
 * Handles UK (+44), US (+1), and generic international formats.
 */
export function normalise_phone(value: unknown): string | null {
  if (value == null) return null
  let phone = String(value).replace(/[\s\-().]/g, '').trim()

  if (!phone) return null

  // Already E.164
  if (/^\+\d{7,15}$/.test(phone)) return phone

  // US/CA: 10 digits starting with area code
  if (/^1?\d{10}$/.test(phone)) {
    const digits = phone.replace(/^1/, '')
    return `+1${digits}`
  }

  // UK: starts with 0, replace with +44
  if (/^0\d{9,10}$/.test(phone)) {
    return `+44${phone.slice(1)}`
  }

  // Has country code without +
  if (/^\d{11,15}$/.test(phone)) {
    return `+${phone}`
  }

  // Return as-is if we can't normalize
  return phone
}

// ---------------------------------------------------------------------------
// URL / Domain transforms
// ---------------------------------------------------------------------------

export function extract_domain(value: unknown): string | null {
  if (value == null) return null
  const str = String(value).trim()
  if (!str) return null

  try {
    // Try as URL first
    if (str.includes('://') || str.includes('www.')) {
      const url = new URL(str.startsWith('http') ? str : `https://${str}`)
      return url.hostname.replace(/^www\./, '')
    }
    // Might already be a domain
    if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(str)) {
      return str.replace(/^www\./, '')
    }
    return str
  } catch {
    return str
  }
}

// ---------------------------------------------------------------------------
// Date transforms
// ---------------------------------------------------------------------------

export function parse_date(value: unknown): string | null {
  if (value == null) return null
  const str = String(value).trim()
  if (!str) return null

  const date = new Date(str)
  if (isNaN(date.getTime())) return null
  return date.toISOString()
}

// ---------------------------------------------------------------------------
// Number transforms
// ---------------------------------------------------------------------------

export function to_integer(value: unknown): number | null {
  if (value == null) return null
  const num = parseInt(String(value), 10)
  return isNaN(num) ? null : num
}

export function to_float(value: unknown): number | null {
  if (value == null) return null
  const num = parseFloat(String(value))
  return isNaN(num) ? null : num
}

export function to_boolean(value: unknown): boolean | null {
  if (value == null) return null
  if (typeof value === 'boolean') return value
  const str = String(value).toLowerCase().trim()
  if (['true', '1', 'yes', 'on'].includes(str)) return true
  if (['false', '0', 'no', 'off'].includes(str)) return false
  return null
}

// ---------------------------------------------------------------------------
// Array transforms
// ---------------------------------------------------------------------------

export function join_array(value: unknown, separator = ', '): string | null {
  if (value == null) return null
  if (Array.isArray(value)) return value.join(separator)
  return String(value)
}

export function first(value: unknown): unknown | null {
  if (value == null) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

// ---------------------------------------------------------------------------
// GDPR transforms
// ---------------------------------------------------------------------------

export function detect_personal_email(email: unknown): boolean {
  if (email == null) return false
  const str = String(email).toLowerCase().trim()
  const domain = str.split('@')[1]
  return domain ? PERSONAL_EMAIL_DOMAINS.has(domain) : false
}

export function gdpr_check_record(record: Record<string, unknown>): string[] {
  const flags: string[] = []

  // Check all email-like fields
  for (const [key, value] of Object.entries(record)) {
    if (!value || typeof value !== 'string') continue
    const lk = key.toLowerCase()
    if (lk.includes('email') && detect_personal_email(value)) {
      flags.push(`personal_email:${key}`)
    }
  }

  return flags
}

// ---------------------------------------------------------------------------
// Transform registry
// ---------------------------------------------------------------------------

const TRANSFORMS: Record<string, (value: unknown) => unknown> = {
  lowercase,
  uppercase,
  trim,
  stringify,
  normalise_phone,
  normalize_phone: normalise_phone, // alias
  extract_domain,
  parse_date,
  to_integer,
  to_float,
  to_boolean,
  join_array: (v) => join_array(v),
  first,
}

/**
 * Apply a named transform to a value.
 * Returns the original value if transform is unknown.
 */
export function applyTransform(transformName: string, value: unknown): unknown {
  const fn = TRANSFORMS[transformName]
  return fn ? fn(value) : value
}

/**
 * Resolve a nested path from an object (e.g. "location.lat", "experiences[0].company.name")
 */
export function resolvePath(obj: unknown, path: string): unknown {
  if (obj == null || !path) return undefined

  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }

  return current
}
