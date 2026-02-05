/**
 * sync-skills-from-github Edge Function
 *
 * Pulls SKILL.md files from a GitHub repo and syncs to platform_skills.
 * Designed to be called on deploy or via webhook.
 *
 * POST /sync-skills-from-github
 * Body: { repo?, branch?, github_token?, dry_run? }
 *
 * Required secrets: GITHUB_TOKEN, GITHUB_REPO (e.g. "org/repo")
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { parse as parseYaml } from 'https://esm.sh/yaml@2.3.4';
import { crypto } from 'https://deno.land/std@0.208.0/crypto/mod.ts';
import { encodeHex } from 'https://deno.land/std@0.208.0/encoding/hex.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SkillFile {
  path: string;
  content: string;
}

interface ParsedSkill {
  skill_key: string;
  category: string;
  frontmatter: Record<string, unknown>;
  content_template: string;
  is_active: boolean;
  source_format: 'skill_md';
  source_path: string;
  source_hash: string;
}

/**
 * Parse YAML frontmatter from a SKILL.md content string.
 * Handles the --- delimited frontmatter block.
 */
function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('No YAML frontmatter found');
  }
  const data = parseYaml(match[1]) as Record<string, unknown>;
  return { data, body: match[2] };
}

/**
 * Parse a SKILL.md content string into a DB-ready record.
 */
function parseSkillContent(content: string, sourcePath: string): ParsedSkill {
  const { data: frontmatter, body } = parseFrontmatter(content);

  if (!frontmatter.name || typeof frontmatter.name !== 'string') {
    throw new Error(`[${sourcePath}] Missing required field: name`);
  }
  if (!frontmatter.description || typeof frontmatter.description !== 'string') {
    throw new Error(`[${sourcePath}] Missing required field: description`);
  }

  const metadata = (frontmatter.metadata ?? {}) as Record<string, unknown>;
  const category = (metadata.category as string) ?? 'sales-ai';
  const skillType = (metadata.skill_type as string) ?? 'atomic';
  const isActive = metadata.is_active !== false;

  // Build the DB frontmatter blob (flattened for runtime consumption)
  const dbFrontmatter: Record<string, unknown> = {
    name: frontmatter.name,
    description: frontmatter.description,
    category,
    version: Number(metadata.version ?? 2),
    skill_type: skillType,
  };

  const copyFields = [
    'triggers', 'intent_patterns', 'keywords',
    'required_context', 'optional_context',
    'inputs', 'outputs',
    'dependencies', 'child_skills',
    'workflow', 'linked_skills',
    'execution_mode', 'timeout_ms', 'retry_count',
    'tags', 'author',
    'requires_capabilities', 'priority', 'structured_response_type',
    'sequence_steps',
  ];

  for (const field of copyFields) {
    if (metadata[field] !== undefined) {
      dbFrontmatter[field] = metadata[field];
    }
  }

  const skillKey = frontmatter.name as string;
  const contentTemplate = body.trim();

  // SHA-256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = new Uint8Array(
    // deno-lint-ignore no-explicit-any
    (crypto.subtle as any).digestSync('SHA-256', data)
  );
  const sourceHash = encodeHex(hashBuffer);

  return {
    skill_key: skillKey,
    category,
    frontmatter: dbFrontmatter,
    content_template: contentTemplate,
    is_active: isActive,
    source_format: 'skill_md',
    source_path: sourcePath,
    source_hash: sourceHash,
  };
}

/**
 * Fetch the file tree from GitHub using the Trees API.
 */
async function fetchSkillFilePaths(
  repo: string,
  branch: string,
  token: string
): Promise<string[]> {
  const url = `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub Trees API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return (data.tree as Array<{ path: string; type: string }>)
    .filter((item) => item.type === 'blob' && item.path.match(/^skills\/.*\/SKILL\.md$/))
    .map((item) => item.path);
}

/**
 * Fetch reference document paths from GitHub using the Trees API.
 */
async function fetchReferencePaths(
  repo: string,
  branch: string,
  token: string
): Promise<string[]> {
  const url = `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) return []; // Non-fatal

  const data = await res.json();
  return (data.tree as Array<{ path: string; type: string }>)
    .filter((item) => item.type === 'blob' && item.path.match(/^skills\/.*\/references\/.*\.md$/))
    .map((item) => item.path);
}

/**
 * Fetch a single file's content from GitHub.
 */
async function fetchFileContent(
  repo: string,
  branch: string,
  filePath: string,
  token: string
): Promise<string> {
  const url = `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub Contents API error for ${filePath}: ${res.status}`);
  }

  const data = await res.json();
  // Content is base64 encoded
  return atob(data.content.replace(/\n/g, ''));
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const repo = body.repo || Deno.env.get('GITHUB_REPO');
    const branch = body.branch || 'main';
    const githubToken = body.github_token || Deno.env.get('GITHUB_TOKEN');
    const dryRun = body.dry_run === true;

    if (!repo || !githubToken) {
      return new Response(
        JSON.stringify({ error: 'Missing repo or github_token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Get file list
    const skillPaths = await fetchSkillFilePaths(repo, branch, githubToken);
    console.log(`Found ${skillPaths.length} SKILL.md files in ${repo}@${branch}`);

    if (skillPaths.length === 0) {
      return new Response(
        JSON.stringify({ success: true, synced: 0, skipped: 0, message: 'No SKILL.md files found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Fetch and parse each file
    const results: Array<{ skill_key: string; status: string; error?: string }> = [];
    const records: ParsedSkill[] = [];

    for (const filePath of skillPaths) {
      try {
        const content = await fetchFileContent(repo, branch, filePath, githubToken);
        const record = parseSkillContent(content, filePath);
        records.push(record);
      } catch (err) {
        results.push({
          skill_key: filePath,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          would_sync: records.map((r) => ({
            skill_key: r.skill_key,
            category: r.category,
            source_path: r.source_path,
          })),
          errors: results.filter((r) => r.status === 'error'),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Upsert to platform_skills
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let synced = 0;
    let skipped = 0;

    for (const record of records) {
      try {
        // Check hash
        const { data: existing } = await supabase
          .from('platform_skills')
          .select('source_hash')
          .eq('skill_key', record.skill_key)
          .maybeSingle();

        if (existing?.source_hash === record.source_hash) {
          results.push({ skill_key: record.skill_key, status: 'skipped' });
          skipped++;
          continue;
        }

        const { error: upsertError } = await supabase
          .from('platform_skills')
          .upsert(
            {
              skill_key: record.skill_key,
              category: record.category,
              frontmatter: record.frontmatter,
              content_template: record.content_template,
              is_active: record.is_active,
              source_format: record.source_format,
              source_path: record.source_path,
              source_hash: record.source_hash,
            },
            { onConflict: 'skill_key' }
          );

        if (upsertError) throw upsertError;

        results.push({ skill_key: record.skill_key, status: 'synced' });
        synced++;
      } catch (err) {
        results.push({
          skill_key: record.skill_key,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 4. Sync references/ documents
    const refPaths = await fetchReferencePaths(repo, branch, githubToken);
    let refsSynced = 0;

    for (const refPath of refPaths) {
      try {
        const refContent = await fetchFileContent(repo, branch, refPath, githubToken);
        // Extract skill_key and title from path: skills/.../references/foo.md
        const parts = refPath.replace(/\\/g, '/').split('/');
        const refsIdx = parts.indexOf('references');
        if (refsIdx < 1) continue;
        const skillKey = parts[refsIdx - 1];
        const title = parts[parts.length - 1].replace(/\.md$/, '');

        // Get platform_skills ID
        const { data: platformSkill } = await supabase
          .from('platform_skills')
          .select('id')
          .eq('skill_key', skillKey)
          .maybeSingle();

        if (!platformSkill) continue;

        const { error: refError } = await supabase
          .from('skill_documents')
          .upsert(
            {
              skill_id: platformSkill.id,
              title,
              doc_type: 'reference',
              content: refContent,
            },
            { onConflict: 'skill_id,title' }
          );

        if (!refError) refsSynced++;
      } catch {
        // Non-fatal: reference sync errors don't block skill sync
      }
    }

    // 5. Compile to org skills
    if (synced > 0) {
      const { data: orgs } = await supabase.from('organizations').select('id');
      for (const org of orgs || []) {
        await supabase.functions.invoke('compile-organization-skills', {
          body: { action: 'compile_all', organization_id: org.id },
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, synced, skipped, refs_synced: refsSynced, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('sync-skills-from-github error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
