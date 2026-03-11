// supabase/functions/app-config/index.ts
// Returns Supabase connection config for the desktop support app.
// Keys are NOT secret (anon keys are public, used in every browser).
// This just avoids baking them into the binary.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=3600',
};

const CONFIGS: Record<string, { url: string; anonKey: string }> = {
  production: {
    url: 'https://ygdpgliavpxeugaajgrb.supabase.co',
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlnZHBnbGlhdnB4ZXVnYWFqZ3JiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxODk0NjEsImV4cCI6MjA4MDc2NTQ2MX0.JbwNkaXOy8fzb2MNmIJU-KXV4U0QojdurGuSIIVJ3UE',
  },
  staging: {
    url: 'https://caerqjzvuerejfrdtygb.supabase.co',
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZXJxanp2dWVyZWpmcmR0eWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDkyMjcsImV4cCI6MjA4MzUyNTIyN30.a_6b9Ojfm32MAprq_spkN7kQkdy1XCcPsv19psYMahg',
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const env = url.searchParams.get('env') || 'production';
  const config = CONFIGS[env];

  if (!config) {
    return new Response(JSON.stringify({ error: `Unknown environment: ${env}` }), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  return new Response(JSON.stringify(config), { headers: CORS_HEADERS });
});
