import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders } from '../_shared/corsHelper.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data } = await supabase
    .from('platform_counters')
    .select('value')
    .eq('key', 'founding_members')
    .maybeSingle()

  const claimed = data?.value ?? 47

  // Auto-extend total so there are always ~20+ spots "remaining"
  // This creates perpetual urgency without ever blocking sales
  let total = 100
  if (claimed > 80) total = 150
  if (claimed > 130) total = 200
  if (claimed > 180) total = 250

  return new Response(
    JSON.stringify({ claimed, total, remaining: total - claimed }),
    { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' } }
  )
})
