import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' })
    return
  }

  const cronSecret = process.env.CRON_SECRET
  const provided = (req.headers['x-cron-secret'] as string) || (req.query.cron_secret as string) || ''
  if (cronSecret && provided !== cronSecret) {
    const cronHeader = req.headers['x-vercel-cron']
    if (!cronHeader) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    res.status(500).json({ success: false, error: 'Missing Supabase env vars' })
    return
  }

  const edgeUrl = `${supabaseUrl}/functions/v1/attio-process-queue`
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 25

  const response = await fetch(edgeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseServiceKey}`,
    },
    body: JSON.stringify({ limit }),
  })

  const text = await response.text()
  res.status(response.ok ? 200 : 500).send(text)
}
