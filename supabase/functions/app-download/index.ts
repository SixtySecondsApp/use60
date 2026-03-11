// supabase/functions/app-download/index.ts
// Proxies GitHub Release assets for private repo downloads + auto-updater
//
// Routes:
//   GET /app-download/latest.yml        → serves update manifest (Windows)
//   GET /app-download/latest-mac.yml    → serves update manifest (macOS)
//   GET /app-download/<filename>        → 302 redirect to temp GitHub download URL
//
// Requires GITHUB_PAT secret (repo scope) set in Supabase dashboard

import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

const OWNER = 'SixtySecondsApp';
const REPO = 'sixty-support-app';
const GITHUB_API = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const cors = getCorsHeaders(req);
  const url = new URL(req.url);

  // Extract filename from path: /app-download/latest.yml → latest.yml
  const pathParts = url.pathname.split('/');
  const filename = pathParts[pathParts.length - 1];

  if (!filename || filename === 'app-download') {
    return new Response(JSON.stringify({ error: 'Filename required' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const githubToken = Deno.env.get('GITHUB_PAT');
  if (!githubToken) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Fetch latest release metadata
    const releaseRes = await fetch(GITHUB_API, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'sixty-support-updater',
      },
    });

    if (!releaseRes.ok) {
      const text = await releaseRes.text();
      return new Response(JSON.stringify({ error: 'Failed to fetch release', detail: text }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const release = await releaseRes.json();
    const asset = release.assets?.find((a: { name: string }) => a.name === filename);

    if (!asset) {
      return new Response(JSON.stringify({ error: `Asset not found: ${filename}` }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // For YAML manifests (latest.yml, latest-mac.yml) — serve the content directly
    // so electron-updater can parse it
    if (filename.endsWith('.yml')) {
      const yamlRes = await fetch(asset.url, {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/octet-stream',
          'User-Agent': 'sixty-support-updater',
        },
        redirect: 'follow',
      });

      const yamlContent = await yamlRes.text();
      return new Response(yamlContent, {
        status: 200,
        headers: {
          ...cors,
          'Content-Type': 'text/yaml',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // For binaries — get a temporary download URL and redirect
    const downloadRes = await fetch(asset.url, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/octet-stream',
        'User-Agent': 'sixty-support-updater',
      },
      redirect: 'manual', // Don't follow — we want the redirect URL
    });

    const redirectUrl = downloadRes.headers.get('Location');
    if (!redirectUrl) {
      return new Response(JSON.stringify({ error: 'No redirect URL from GitHub' }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // 302 redirect to the temporary S3 URL (works without auth)
    return new Response(null, {
      status: 302,
      headers: {
        ...cors,
        Location: redirectUrl,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal error', detail: String(err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
