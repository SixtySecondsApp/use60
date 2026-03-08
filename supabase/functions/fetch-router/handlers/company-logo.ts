import { S3Client } from "https://deno.land/x/s3_lite_client@0.7.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface LogoRequest {
  domain: string
}

/**
 * Fetch Company Logo Handler
 *
 * Fetches company logos from logo.dev API and stores them in S3 for caching.
 * Returns S3 URL if logo exists, otherwise fetches from logo.dev and stores it.
 *
 * Required Environment Variables:
 * - LOGOS_DEV_API_KEY (logo.dev API key)
 * - LOGOS_DEV_SECRET_KEY (logo.dev secret key)
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - LOGOS_BUCKET_NAME (S3 bucket for logo storage)
 * - AWS_REGION (optional, defaults to eu-west-2)
 */
export async function handleCompanyLogo(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { domain }: LogoRequest = await req.json()

    if (!domain) {
      return new Response(
        JSON.stringify({ error: 'Domain is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Normalize domain: remove www, protocol, and trailing slashes
    const normalizedDomain = domain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .toLowerCase()

    if (!normalizedDomain) {
      return new Response(
        JSON.stringify({ error: 'Invalid domain' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // S3 configuration
    const awsAccessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID')
    const awsSecretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY')
    const awsRegion = Deno.env.get('AWS_REGION') || 'eu-west-2'
    const logosBucket = Deno.env.get('LOGOS_BUCKET_NAME')
    const logoDevApiKey = Deno.env.get('LOGOS_DEV_API_KEY')
    const logoDevSecretKey = Deno.env.get('LOGOS_DEV_SECRET_KEY')

    if (!awsAccessKeyId || !awsSecretAccessKey || !logosBucket) {
      return new Response(
        JSON.stringify({ error: 'S3 configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!logoDevApiKey || !logoDevSecretKey) {
      return new Response(
        JSON.stringify({ error: 'Logo.dev credentials missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // S3 file path: logos/{domain}.png (matches bucket policy)
    const s3Key = `logos/${normalizedDomain}.png`
    const s3Client = new S3Client({
      endPoint: `s3.${awsRegion}.amazonaws.com`,
      region: awsRegion,
      accessKey: awsAccessKeyId,
      secretKey: awsSecretAccessKey,
      bucket: logosBucket,
      useSSL: true,
    })

    // Check if logo exists in S3 first
    try {
      const existingObject = await s3Client.getObject(s3Key)
      if (existingObject) {
        // Return direct S3 URL (bucket policy allows public read for logos/*)
        const s3Url = `https://${logosBucket}.s3.${awsRegion}.amazonaws.com/${s3Key}`
        return new Response(
          JSON.stringify({ logo_url: s3Url, cached: true, domain: normalizedDomain }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } catch (error) {
    }
    // Fetch from logo.dev API
    // Try multiple authentication methods:
    // 1. API key as token param + secret in Authorization header
    // 2. Both keys as query parameters
    // 3. API key only (fallback)
    let logoResponse: Response | null = null
    let lastError: string | null = null

    // Method 1: API key in query, secret in header
    try {
      const logoDevUrl = `https://img.logo.dev/${normalizedDomain}?token=${logoDevApiKey}&size=128&format=png&retina=true`
      logoResponse = await fetch(logoDevUrl, {
        headers: {
          'Authorization': `Bearer ${logoDevSecretKey}`,
        },
      })
      if (logoResponse.ok) {
      } else {
        lastError = `Method 1 failed: ${logoResponse.status} ${logoResponse.statusText}`
      }
    } catch (error: any) {
      lastError = `Method 1 exception: ${error?.message || String(error)}`
    }

    // Method 2: Both keys as query parameters
    if (!logoResponse || !logoResponse.ok) {
      try {
        const logoDevUrl = `https://img.logo.dev/${normalizedDomain}?token=${logoDevApiKey}&secret=${logoDevSecretKey}&size=128&format=png&retina=true`
        logoResponse = await fetch(logoDevUrl)
        if (logoResponse.ok) {
        } else {
          lastError = `Method 2 failed: ${logoResponse.status} ${logoResponse.statusText}`
        }
      } catch (error: any) {
        lastError = `Method 2 exception: ${error?.message || String(error)}`
      }
    }

    // Method 3: API key only (fallback)
    if (!logoResponse || !logoResponse.ok) {
      try {
        const logoDevUrl = `https://img.logo.dev/${normalizedDomain}?token=${logoDevApiKey}&size=128&format=png&retina=true`
        logoResponse = await fetch(logoDevUrl)
        if (logoResponse.ok) {
        } else {
          lastError = `Method 3 failed: ${logoResponse.status} ${logoResponse.statusText}`
        }
      } catch (error: any) {
        lastError = `Method 3 exception: ${error?.message || String(error)}`
      }
    }

    if (!logoResponse || !logoResponse.ok) {
      const errorText = await logoResponse?.text().catch(() => 'Unable to read error response')
      return new Response(
        JSON.stringify({
          error: `Failed to fetch logo from logo.dev: ${lastError || 'All authentication methods failed'}`,
          logo_url: null,
          details: errorText.substring(0, 200)
        }),
        { status: logoResponse?.status || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const logoBuffer = await logoResponse.arrayBuffer()

    if (logoBuffer.byteLength === 0) {
      return new Response(
        JSON.stringify({ error: 'Empty logo response', logo_url: null }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Upload to S3
    await s3Client.putObject(s3Key, new Uint8Array(logoBuffer), {
      metadata: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
    // Return direct S3 URL (bucket policy allows public read for logos/*)
    const s3Url = `https://${logosBucket}.s3.${awsRegion}.amazonaws.com/${s3Key}`

    return new Response(
      JSON.stringify({ logo_url: s3Url, cached: false, domain: normalizedDomain }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error', logo_url: null }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}
