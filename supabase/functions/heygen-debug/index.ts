/**
 * heygen-debug — Debug HeyGen API (avatars, voices, etc.)
 * Temporary. Deploy with --no-verify-jwt.
 *
 * POST { mode: "voices" }       — list all voices
 * POST { mode: "voices", q: "andrew" } — search voices by name
 * POST { mode: "avatars" }      — list avatars (default)
 */

import { jsonResponse, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { HeyGenClient } from '../_shared/heygen.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req);

  const apiKey = Deno.env.get('HEYGEN_API_KEY');
  if (!apiKey) return jsonResponse({ error: 'No API key' }, req, 500);

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const mode = body.mode || 'avatars';
  const query = (body.q || '').toLowerCase();
  const results: Record<string, unknown> = {};

  if (mode === 'voices') {
    // List voices from HeyGen v2
    try {
      const res = await fetch('https://api.heygen.com/v2/voices', {
        headers: { 'x-api-key': apiKey, 'Accept': 'application/json' },
      });
      const json = await res.json();
      const voices = json.data?.voices || json.voices || [];
      results.total_voices = voices.length;

      // Filter by query if provided
      const filtered = query
        ? voices.filter((v: any) =>
            v.voice_id?.toLowerCase().includes(query) ||
            v.name?.toLowerCase().includes(query) ||
            v.display_name?.toLowerCase().includes(query) ||
            v.language?.toLowerCase().includes(query)
          )
        : voices;

      results.matched = filtered.length;
      results.voices = filtered.map((v: any) => ({
        voice_id: v.voice_id,
        name: v.name || v.display_name,
        language: v.language,
        gender: v.gender,
        preview_audio: v.preview_audio?.substring(0, 120),
        support_pause: v.support_pause,
        emotion_support: v.emotion_support,
      }));
    } catch (err: any) {
      results.error = err.message || String(err);
    }

    // Also try v1 voices endpoint
    try {
      const res = await fetch('https://api.heygen.com/v1/voice.list', {
        headers: { 'x-api-key': apiKey, 'Accept': 'application/json' },
      });
      const json = await res.json();
      const voices = json.data?.voices || [];
      const filtered = query
        ? voices.filter((v: any) =>
            v.voice_id?.toLowerCase().includes(query) ||
            v.name?.toLowerCase().includes(query) ||
            v.display_name?.toLowerCase().includes(query)
          )
        : voices;
      results.v1_total = voices.length;
      results.v1_matched = filtered.length;
      results.v1_voices = filtered.map((v: any) => ({
        voice_id: v.voice_id,
        name: v.name || v.display_name,
        language: v.language,
        gender: v.gender,
      }));
    } catch (err: any) {
      results.v1_error = err.message || String(err);
    }

    return jsonResponse(results, req);
  }

  if (mode === 'test_v4') {
    // Test Avatar IV generation with a short script
    const avatarId = body.avatar_id || '2f3832e1f6814cdf928b423bc3590b0e';
    const voiceId = body.voice_id || '4baa4f2c333544668adfbcad97f71093';
    const testText = body.text || 'This is a quick test of Avatar IV quality.';

    try {
      const res = await fetch('https://api.heygen.com/v2/video/generate', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_inputs: [{
            character: {
              type: 'avatar',
              avatar_id: avatarId,
              avatar_style: 'normal',
              avatar_version: 'v4',
            },
            voice: {
              type: 'text',
              voice_id: voiceId,
              input_text: testText,
              speed: 1,
            },
          }],
          dimension: { width: 1920, height: 1080 },
        }),
      });
      const json = await res.json();
      results.v4_test = json;
    } catch (err: any) {
      results.v4_error = err.message || String(err);
    }

    return jsonResponse(results, req);
  }

  // Default: avatars mode — check multiple endpoints to find all avatar types

  // 1. v2/avatars (photo avatars)
  try {
    const res = await fetch('https://api.heygen.com/v2/avatars', {
      headers: { 'x-api-key': apiKey },
    });
    const json = await res.json();
    const allAvatars = json.data?.avatars || [];
    results.v2_total = allAvatars.length;
    const andrewAvatars = allAvatars.filter((a: any) =>
      a.avatar_name?.toLowerCase().includes('andrew')
    );
    results.v2_andrew = andrewAvatars;
  } catch (err: any) {
    results.v2_error = err.message || String(err);
  }

  // 2. v2/avatar_group.list (avatar groups — includes digital twins)
  try {
    const res = await fetch('https://api.heygen.com/v2/avatar_group.list', {
      headers: { 'x-api-key': apiKey },
    });
    const json = await res.json();
    results.groups = json.data?.avatar_group_list || json.data;
  } catch (err: any) {
    results.groups_error = err.message || String(err);
  }

  // If a group_id is specified, list its looks
  if (body.group_id) {
    try {
      const res = await fetch(`https://api.heygen.com/v2/avatar_group/${body.group_id}/avatars`, {
        headers: { 'x-api-key': apiKey },
      });
      const json = await res.json();
      results.group_looks = json.data || json;
    } catch (err: any) {
      results.group_looks_error = err.message || String(err);
    }
    return jsonResponse(results, req);
  }

  // 3. Check for instant/video avatars in the full v2 list
  try {
    const res = await fetch('https://api.heygen.com/v2/avatars', {
      headers: { 'x-api-key': apiKey },
    });
    const json = await res.json();
    const all = json.data?.avatars || [];
    // Find recently created ones (last 24h) or non-null type
    const now = Date.now() / 1000;
    const recent = all.filter((a: any) => {
      const created = a.created_at || 0;
      return (now - created < 86400) || a.type;
    });
    results.recent_avatars = recent.slice(0, 20);

    // Also count by type
    const typeCounts: Record<string, number> = {};
    for (const a of all) {
      const t = a.type || 'null';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    results.type_counts = typeCounts;
  } catch (err: any) {
    results.recent_error = err.message || String(err);
  }

  // 4. Check video_avatar.list endpoint (POST)
  try {
    const res = await fetch('https://api.heygen.com/v2/video_avatar.list', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    results.video_avatar_list = { status: res.status, data: json.data || json };
  } catch (err: any) {
    results.video_avatar_list_error = err.message || String(err);
  }

  // 5. v1/avatar.list (legacy — sometimes has more)
  try {
    const res = await fetch('https://api.heygen.com/v1/avatar.list', {
      headers: { 'x-api-key': apiKey },
    });
    const json = await res.json();
    const avatars = json.data?.avatars || [];
    // Filter for custom/instant types
    const custom = avatars.filter((a: any) =>
      a.avatar_name?.toLowerCase().includes('andrew') ||
      a.type === 'instant' ||
      a.type === 'custom' ||
      a.type === 'digital_twin'
    );
    results.v1_custom = custom.map((a: any) => ({
      avatar_id: a.avatar_id,
      avatar_name: a.avatar_name,
      type: a.type,
      gender: a.gender,
      preview_image_url: a.preview_image_url?.substring(0, 120),
    }));
    // Show all unique types
    results.v1_types = [...new Set(avatars.map((a: any) => a.type))];
    results.v1_total = avatars.length;
  } catch (err: any) {
    results.v1_error = err.message || String(err);
  }

  return jsonResponse(results, req);
});
