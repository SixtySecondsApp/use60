// supabase/functions/visitor-snippet-serve/index.ts
// Serves the visitor tracking JavaScript snippet for a given token.
// Public endpoint — verify_jwt = false.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SNIPPET_TEMPLATE = (trackUrl: string, token: string) => `
(function(){
  if(window.__60vi)return;window.__60vi=1;
  var t='${token}',u='${trackUrl}';
  var sid=function(){
    var k='_60sid',s=null;
    try{s=localStorage.getItem(k);
      var ts=localStorage.getItem(k+'_t');
      if(s&&ts&&Date.now()-parseInt(ts)<1800000)return s;
    }catch(e){}
    s=Math.random().toString(36).substr(2,12)+Date.now().toString(36);
    try{localStorage.setItem(k,s);localStorage.setItem(k+'_t',''+Date.now());}catch(e){}
    return s;
  }();
  function send(){
    var d={token:t,page_url:location.href,page_title:document.title,
      referrer:document.referrer||'',session_id:sid,user_agent:navigator.userAgent};
    if(navigator.sendBeacon){navigator.sendBeacon(u,JSON.stringify(d));}
    else{var x=new XMLHttpRequest();x.open('POST',u,true);x.setRequestHeader('Content-Type','application/json');x.send(JSON.stringify(d));}
  }
  if(document.readyState==='complete')send();
  else window.addEventListener('load',send);
})();
`.trim();

serve(async (req) => {
  // Allow from any origin — this serves JS to customer websites
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Cache-Control': 'public, max-age=3600',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers });
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('t') || url.searchParams.get('token');

    if (!token) {
      return new Response('// Missing token parameter', {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/javascript' },
      });
    }

    // Build the tracking endpoint URL
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const trackUrl = `${supabaseUrl}/functions/v1/visitor-track`;

    const snippet = SNIPPET_TEMPLATE(trackUrl, token);

    return new Response(snippet, {
      status: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/javascript; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('[visitor-snippet-serve] Error:', error);
    return new Response('// Error generating snippet', {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/javascript' },
    });
  }
});
