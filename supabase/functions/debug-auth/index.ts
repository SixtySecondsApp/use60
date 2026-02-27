import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
serve((req) => {
  const auth = req.headers.get('Authorization') || 'none';
  const srvKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'unset';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim().split(/[,\s]+/)[0] : 'no-bearer';
  return new Response(JSON.stringify({
    auth_header_length: auth.length,
    token_length: token.length,
    env_key_length: srvKey.length,
    match: token === srvKey,
    token_start: token.slice(0, 20),
    env_start: srvKey.slice(0, 20),
    token_end: token.slice(-20),
    env_end: srvKey.slice(-20),
  }), { headers: { 'Content-Type': 'application/json' } });
});
