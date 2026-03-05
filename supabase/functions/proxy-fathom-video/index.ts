import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { authenticateRequest } from '../_shared/edgeAuth.ts'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

/**
 * Proxy Fathom video content to bypass iframe restrictions
 * This allows Browserless to screenshot the content
 */
serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;
  const corsHeaders = {
    ...getCorsHeaders(req),
    'X-Frame-Options': 'ALLOWALL', // Allow embedding
  };

  try {
    // Authenticate request
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    await authenticateRequest(req, supabase, serviceRoleKey);

    const url = new URL(req.url)
    const targetUrl = url.searchParams.get('url')

    if (!targetUrl) {
      return new Response('Missing url parameter', { status: 400, headers: corsHeaders })
    }
    // Fetch the Fathom page
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    })

    if (!response.ok) {
      return new Response(`Failed to fetch: ${response.status}`, {
        status: response.status,
        headers: corsHeaders
      })
    }

    let html = await response.text()

    // Remove or modify restrictive headers in meta tags
    html = html.replace(/<meta[^>]*http-equiv=["']?X-Frame-Options["']?[^>]*>/gi, '')
    html = html.replace(/<meta[^>]*name=["']?referrer["']?[^>]*content=["']?no-referrer["']?[^>]*>/gi,
                        '<meta name="referrer" content="origin">')

    // Inject a base tag to ensure resources load correctly
    const baseUrl = new URL(targetUrl).origin
    if (!html.includes('<base')) {
      html = html.replace('<head>', `<head><base href="${baseUrl}/">`)
    }

    // Enhanced script to make video fullscreen and hide UI chrome
    const timestamp = url.searchParams.get('timestamp') || '30'
    const fullscreenScript = `
      <script>
        window.addEventListener('load', () => {
          setTimeout(() => {
            const video = document.querySelector('video');
            if (video) {
              // Seek to timestamp
              video.currentTime = ${timestamp};

              // Make video fullscreen
              video.style.position = 'fixed';
              video.style.top = '0';
              video.style.left = '0';
              video.style.width = '100vw';
              video.style.height = '100vh';
              video.style.objectFit = 'cover';
              video.style.zIndex = '999999';
              video.style.background = '#000';

              // Hide Fathom UI chrome
              const hideSelectors = [
                '.fathom-toolbar',
                '.fathom-controls',
                '[class*="toolbar"]',
                '[class*="controls"]',
                '[class*="overlay"]',
                '[class*="header"]',
                '[class*="tabs"]',
                'header',
                'nav',
                '.tabs',
                '[role="tablist"]',
                '.summary',
                '.transcript'
              ];

              hideSelectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                  el.style.display = 'none';
                });
              });

              // Hide all non-video elements
              document.querySelectorAll('body > *').forEach(el => {
                if (el !== video && !el.contains(video)) {
                  el.style.display = 'none';
                }
              });

              // Try to play
              video.play().catch(() => {
                console.log('Autoplay blocked, but video should still be visible');
              });
            }
          }, 2000);
        });
      </script>
      <style>
        /* CSS to ensure fullscreen video */
        video {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          object-fit: cover !important;
          z-index: 999999 !important;
        }

        /* Hide Fathom UI elements */
        .fathom-toolbar,
        .fathom-controls,
        [class*="toolbar"],
        [class*="controls"],
        [class*="overlay"],
        header,
        nav,
        .tabs,
        [role="tablist"] {
          display: none !important;
        }
      </style>
    `
    html = html.replace('</body>', `${fullscreenScript}</body>`)

    return new Response(html, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
      }
    })
  } catch (error) {
    const isAuthError = error.message?.includes('Unauthorized') || error.message?.includes('invalid session');
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: isAuthError ? 401 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})