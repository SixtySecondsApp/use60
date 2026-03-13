import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

/**
 * Migration Tracker
 *
 * Platform-admin-only edge function for:
 * - Comparing applied migrations across dev / staging / production
 * - Pre-flight checks for staging → production promotion
 * - Creating PRs, monitoring CI, and merging (which triggers CI auto-apply)
 *
 * Secrets required:
 *   SB_MANAGEMENT_TOKEN  — Supabase personal access token (sbp_...)
 *   GITHUB_PAT           — GitHub personal access token for repo operations
 */

const ENVIRONMENTS: Record<string, string> = {
  development: 'wbgmnyekgqklggilgqag',
  staging: 'caerqjzvuerejfrdtygb',
  production: 'ygdpgliavpxeugaajgrb',
};

const GITHUB_OWNER = 'SixtySecondsApp';
const GITHUB_REPO = 'sixty-sales-dashboard';

// --- Helpers ---

function json(data: unknown, status = 200, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function githubApi(path: string, pat: string, opts?: { method?: string; body?: unknown }) {
  const res = await fetch(`https://api.github.com${path}`, {
    method: opts?.method || 'GET',
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `GitHub API ${res.status}`);
  return data;
}

async function getMigrations(ref: string, token: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/migrations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// --- Serve ---

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'No authorization header' }, 401, corsHeaders);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: 'Invalid authentication token' }, 401, corsHeaders);

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.is_admin) return json({ error: 'Insufficient permissions' }, 403, corsHeaders);

    const accessToken = Deno.env.get('SB_MANAGEMENT_TOKEN');
    const githubPat = Deno.env.get('GITHUB_PAT');

    const body = await req.json().catch(() => ({}));
    const { action = 'compare', ...params } = body;

    switch (action) {
      // ──────────────────────────────────────────
      // Compare migrations across environments
      // ──────────────────────────────────────────
      case 'compare': {
        if (!accessToken) return json({ error: 'SB_MANAGEMENT_TOKEN not configured' }, 500, corsHeaders);

        const results: Record<string, { migrations: Array<{ version: string; name: string }>; error: string | null }> = {};
        await Promise.all(
          Object.entries(ENVIRONMENTS).map(async ([env, ref]) => {
            try {
              const data = await getMigrations(ref, accessToken);
              results[env] = {
                migrations: (Array.isArray(data) ? data : []).map((m: any) => ({
                  version: m.version || '',
                  name: m.name || '',
                })),
                error: null,
              };
            } catch (err) {
              results[env] = { error: err.message, migrations: [] };
            }
          })
        );
        return json({ environments: results }, 200, corsHeaders);
      }

      // ──────────────────────────────────────────
      // Pre-flight checks for staging → production
      // ──────────────────────────────────────────
      case 'preflight': {
        if (!accessToken) return json({ error: 'SB_MANAGEMENT_TOKEN not configured' }, 500, corsHeaders);
        if (!githubPat) return json({ error: 'GITHUB_PAT not configured' }, 500, corsHeaders);

        const checks: Record<string, { status: 'pass' | 'fail' | 'warn'; message: string; data?: any }> = {};

        // 1. Migration diff
        try {
          const [stagingM, prodM] = await Promise.all([
            getMigrations(ENVIRONMENTS.staging, accessToken),
            getMigrations(ENVIRONMENTS.production, accessToken),
          ]);
          const prodVersions = new Set((prodM || []).map((m: any) => m.version));
          const pending = (stagingM || []).filter((m: any) => !prodVersions.has(m.version));
          const stagingVersions = new Set((stagingM || []).map((m: any) => m.version));
          const onlyInProd = (prodM || []).filter((m: any) => !stagingVersions.has(m.version));

          if (pending.length === 0) {
            checks.migrations = { status: 'pass', message: 'Production is up to date with staging', data: { pending: 0 } };
          } else {
            checks.migrations = {
              status: 'warn',
              message: `${pending.length} migration(s) pending in production`,
              data: {
                pending: pending.length,
                migrations: pending.map((m: any) => ({ version: m.version, name: m.name })),
              },
            };
          }

          if (onlyInProd.length > 0) {
            checks.prodOnly = {
              status: 'warn',
              message: `${onlyInProd.length} migration(s) exist only in production (not in staging)`,
              data: { count: onlyInProd.length },
            };
          }
        } catch (err) {
          checks.migrations = { status: 'fail', message: `Failed to compare migrations: ${err.message}` };
        }

        // 2. Branch comparison
        try {
          const cmp = await githubApi(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/compare/main...staging`, githubPat);
          const ahead = cmp.ahead_by || 0;
          const behind = cmp.behind_by || 0;

          if (ahead === 0) {
            checks.branch = { status: 'pass', message: 'Staging is in sync with main', data: { ahead, behind } };
          } else {
            checks.branch = {
              status: 'warn',
              message: `Staging is ${ahead} commit(s) ahead${behind > 0 ? `, ${behind} behind` : ''} main`,
              data: {
                ahead,
                behind,
                commits: (cmp.commits || []).slice(0, 20).map((c: any) => ({
                  sha: c.sha?.slice(0, 8),
                  message: c.commit?.message?.split('\n')[0],
                  date: c.commit?.author?.date,
                })),
              },
            };
          }

          if (behind > 0) {
            checks.diverged = {
              status: 'warn',
              message: `Staging is ${behind} commit(s) behind main — consider rebasing before promotion`,
            };
          }
        } catch (err) {
          checks.branch = { status: 'fail', message: `Failed to compare branches: ${err.message}` };
        }

        // 3. Existing open PR
        try {
          const prs = await githubApi(
            `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls?head=${GITHUB_OWNER}:staging&base=main&state=open`,
            githubPat
          );
          if (prs.length > 0) {
            const pr = prs[0];
            checks.existingPR = {
              status: 'warn',
              message: `Open PR #${pr.number} already exists: "${pr.title}"`,
              data: { number: pr.number, title: pr.title, url: pr.html_url },
            };
          } else {
            checks.existingPR = { status: 'pass', message: 'No open PRs from staging to main' };
          }
        } catch (err) {
          checks.existingPR = { status: 'fail', message: `Failed to check PRs: ${err.message}` };
        }

        const allPassed = Object.values(checks).every(c => c.status !== 'fail');
        return json({ checks, canProceed: allPassed }, 200, corsHeaders);
      }

      // ──────────────────────────────────────────
      // Create PR: staging → main
      // ──────────────────────────────────────────
      case 'create-pr': {
        if (!githubPat) return json({ error: 'GITHUB_PAT not configured' }, 500, corsHeaders);

        // Check for existing PR first
        const existing = await githubApi(
          `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls?head=${GITHUB_OWNER}:staging&base=main&state=open`,
          githubPat
        );
        if (existing.length > 0) {
          const pr = existing[0];
          return json({ existing: true, pr: { number: pr.number, title: pr.title, url: pr.html_url } }, 200, corsHeaders);
        }

        // Build PR body with migration list
        let migrationList = '';
        if (accessToken) {
          try {
            const [sM, pM] = await Promise.all([
              getMigrations(ENVIRONMENTS.staging, accessToken),
              getMigrations(ENVIRONMENTS.production, accessToken),
            ]);
            const prodV = new Set((pM || []).map((m: any) => m.version));
            const pending = (sM || []).filter((m: any) => !prodV.has(m.version));
            if (pending.length > 0) {
              migrationList = `\n\n### Database Migrations (${pending.length})\n\n` +
                pending.map((m: any) => `- \`${m.version}\` — ${(m.name || '').replace(/_/g, ' ')}`).join('\n');
            }
          } catch { /* ignore */ }
        }

        const now = new Date().toISOString().slice(0, 10);
        const pr = await githubApi(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls`, githubPat, {
          method: 'POST',
          body: {
            title: `chore: promote staging to production (${now})`,
            body: `## Staging → Production Promotion\n\nAutomated promotion via Migration Tracker.${migrationList}\n\n---\n_Created by Migration Tracker_`,
            head: 'staging',
            base: 'main',
          },
        });

        return json({ existing: false, pr: { number: pr.number, title: pr.title, url: pr.html_url } }, 200, corsHeaders);
      }

      // ──────────────────────────────────────────
      // Check PR status + CI checks
      // ──────────────────────────────────────────
      case 'pr-status': {
        if (!githubPat) return json({ error: 'GITHUB_PAT not configured' }, 500, corsHeaders);
        const prNumber = params.prNumber;
        if (!prNumber) return json({ error: 'prNumber is required' }, 400, corsHeaders);

        const pr = await githubApi(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${prNumber}`, githubPat);

        let checks: any[] = [];
        try {
          const data = await githubApi(
            `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits/${pr.head.sha}/check-runs`,
            githubPat
          );
          checks = (data.check_runs || []).map((cr: any) => ({
            name: cr.name,
            status: cr.status,
            conclusion: cr.conclusion,
            url: cr.html_url,
          }));
        } catch { /* checks may not exist yet */ }

        const allPassed = checks.length > 0 && checks.every((c: any) => c.conclusion === 'success');
        const someFailed = checks.some((c: any) => c.conclusion === 'failure');
        const inProgress = checks.some((c: any) => c.status === 'in_progress' || c.status === 'queued');

        return json({
          pr: {
            number: pr.number,
            title: pr.title,
            url: pr.html_url,
            state: pr.state,
            merged: pr.merged,
            mergeable: pr.mergeable,
            mergeableState: pr.mergeable_state,
          },
          checks,
          allPassed,
          someFailed,
          inProgress,
          canMerge: pr.mergeable && allPassed && !pr.merged && pr.state === 'open',
        }, 200, corsHeaders);
      }

      // ──────────────────────────────────────────
      // Merge PR (triggers CI → auto-apply to production)
      // ──────────────────────────────────────────
      case 'merge-pr': {
        if (!githubPat) return json({ error: 'GITHUB_PAT not configured' }, 500, corsHeaders);
        const prNumber = params.prNumber;
        if (!prNumber) return json({ error: 'prNumber is required' }, 400, corsHeaders);

        // Safety: verify PR is still open
        const pr = await githubApi(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${prNumber}`, githubPat);
        if (pr.merged) return json({ merged: true, message: 'PR was already merged' }, 200, corsHeaders);
        if (pr.state !== 'open') return json({ error: `PR is ${pr.state}, cannot merge` }, 400, corsHeaders);

        const result = await githubApi(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${prNumber}/merge`, githubPat, {
          method: 'PUT',
          body: {
            merge_method: 'merge',
            commit_title: `chore: promote staging to production (#${prNumber})`,
          },
        });

        return json({ merged: result.merged, sha: result.sha?.slice(0, 8), message: result.message }, 200, corsHeaders);
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400, corsHeaders);
    }
  } catch (error) {
    console.error('[migration-tracker] Error:', error.message);
    return json({ error: error.message || 'Internal server error' }, 500, corsHeaders);
  }
});
