const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method === 'POST') {
    const authHeader = req.headers.get('Authorization');
    return new Response(
      JSON.stringify({
        success: true,
        hasAuthHeader: !!authHeader,
        authHeaderPreview: authHeader ? authHeader.substring(0, 50) + '...' : null,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  return new Response('Method not allowed', { status: 405 });
});
