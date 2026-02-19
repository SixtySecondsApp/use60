import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

serve(async (req) => {
  // Handle CORS preflight requests
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Simple test without any authentication
    const apiKey = req.headers.get('X-API-Key')
    
    return new Response(JSON.stringify({
      message: 'Test function working!',
      method: req.method,
      hasApiKey: !!apiKey,
      apiKeyPreview: apiKey ? `${apiKey.substring(0, 10)}...` : null,
      headers: Object.fromEntries(req.headers.entries())
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})