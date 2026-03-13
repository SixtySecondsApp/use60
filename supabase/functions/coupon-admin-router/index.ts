// supabase/functions/coupon-admin-router/index.ts
// Router for Stripe coupon admin management actions

import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { captureException } from '../_shared/sentryEdge.ts'
import { handleListCoupons } from './handlers/list-coupons.ts'
import { handleCreateCoupon } from './handlers/create-coupon.ts'
import { handleUpdateCoupon } from './handlers/update-coupon.ts'
import { handleDeleteCoupon } from './handlers/delete-coupon.ts'
import { handleListPromotionCodes } from './handlers/list-promotion-codes.ts'
import { handleCreatePromotionCode } from './handlers/create-promotion-code.ts'
import { handleUpdatePromotionCode } from './handlers/update-promotion-code.ts'
import { handleApplyToSubscription } from './handlers/apply-to-subscription.ts'

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  list_coupons: handleListCoupons,
  create_coupon: handleCreateCoupon,
  update_coupon: handleUpdateCoupon,
  delete_coupon: handleDeleteCoupon,
  list_promotion_codes: handleListPromotionCodes,
  create_promotion_code: handleCreatePromotionCode,
  update_promotion_code: handleUpdatePromotionCode,
  apply_to_subscription: handleApplyToSubscription,
}

// Rate-limited actions (create/update only)
const RATE_LIMITED_ACTIONS = new Set([
  'create_coupon',
  'update_coupon',
  'delete_coupon',
  'create_promotion_code',
  'update_promotion_code',
  'apply_to_subscription',
])

// In-memory rate limiter: 20 req/min per IP for create/update actions
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_MS = 60_000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false
  }

  entry.count++
  return true
}

// Periodic cleanup of stale entries (every 5 minutes)
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(ip)
    }
  }
}, 300_000)

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const bodyText = await req.text()
    let body: Record<string, unknown>
    try { body = JSON.parse(bodyText) } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const action = body.action as string
    if (!action || !HANDLERS[action]) {
      return new Response(JSON.stringify({ error: `Invalid or missing action. Must be one of: ${Object.keys(HANDLERS).join(', ')}`, received: action ?? null }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // Rate limit create/update/delete actions
    if (RATE_LIMITED_ACTIONS.has(action)) {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('cf-connecting-ip')
        || 'unknown'
      if (!checkRateLimit(ip)) {
        console.warn(`[coupon-admin-router] Rate limited IP: ${ip}, action: ${action}`)
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 20 requests per minute.' }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } })
      }
    }

    const handlerReq = new Request(req.url, { method: req.method, headers: req.headers, body: bodyText })
    return await HANDLERS[action](handlerReq)
  } catch (error: unknown) {
    console.error('[coupon-admin-router] Router error:', error)
    await captureException(error, {
      tags: { function: 'coupon-admin-router', integration: 'stripe' },
    })
    return new Response(JSON.stringify({ error: (error as Error).message ?? 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
