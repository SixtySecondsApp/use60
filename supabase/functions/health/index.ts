import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

serve(async (req) => {
  // Handle CORS preflight requests
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    if (req.method === 'GET') {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'Sales Dashboard API',
        version: '1.0.0',
        uptime: 'Edge Function runtime',
        endpoints: {
          health: 'working',
          deals: 'available', 
          stages: 'available',
          contacts: 'available',
          companies: 'available',
          owners: 'available'
        }
      }

      return new Response(JSON.stringify(health), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ 
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}) 