#!/usr/bin/env node

/**
 * Sync SKILL.md files → platform_skills table
 *
 * Reads all skills/\*\*\/SKILL.md files, parses them via the skill parser,
 * and upserts into platform_skills. Then compiles to organization_skills
 * for all orgs.
 *
 * Usage:
 *   npx tsx scripts/sync-skills.ts              # Full sync
 *   npx tsx scripts/sync-skills.ts --dry-run    # Preview only
 *   npx tsx scripts/sync-skills.ts --skill meeting-prep-brief  # Single skill
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { parseSkillFile, estimateTokens } from './lib/skillParser.js';
import { generateSkillEmbeddings } from './lib/generateEmbeddings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// ── CLI args ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const singleSkill = (() => {
  const idx = args.indexOf('--skill');
  return idx !== -1 ? args[idx + 1] : null;
})();

// ── Supabase client ─────────────────────────────────────────────
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    'Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Glob SKILL.md files ─────────────────────────────────────────
function findSkillFiles(rootDir: string): string[] {
  const results: string[] = [];
  const skillsDir = path.join(rootDir, 'skills');

  if (!fs.existsSync(skillsDir)) {
    console.error(`skills/ directory not found at ${skillsDir}`);
    process.exit(1);
  }

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === 'SKILL.md') {
        results.push(full);
      }
    }
  }

  walk(skillsDir);
  return results.sort();
}

// ── Sync to .claude/skills/ ─────────────────────────────────────
function syncClaudeSkills(rootDir: string): number {
  const skillsDir = path.join(rootDir, 'skills', 'atomic');
  const claudeDir = path.join(rootDir, '.claude', 'skills');

  let synced = 0;

  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === '_platform-references') continue;

    const srcDir = path.join(skillsDir, entry.name);
    const destDir = path.join(claudeDir, entry.name);

    const skillMd = path.join(srcDir, 'SKILL.md');
    if (fs.existsSync(skillMd)) {
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(skillMd, path.join(destDir, 'SKILL.md'));

      // Copy references/*.md if exists
      const refsDir = path.join(srcDir, 'references');
      if (fs.existsSync(refsDir)) {
        const destRefsDir = path.join(destDir, 'references');
        fs.mkdirSync(destRefsDir, { recursive: true });

        for (const refFile of fs.readdirSync(refsDir)) {
          if (refFile.endsWith('.md')) {
            fs.copyFileSync(
              path.join(refsDir, refFile),
              path.join(destRefsDir, refFile)
            );
          }
        }
      }

      synced++;
    }
  }

  return synced;
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const allFiles = findSkillFiles(rootDir);

  // Filter to single skill if requested
  const files = singleSkill
    ? allFiles.filter((f) => f.includes(`/${singleSkill}/`))
    : allFiles;

  if (files.length === 0) {
    console.error(
      singleSkill
        ? `No SKILL.md found for skill: ${singleSkill}`
        : 'No SKILL.md files found in skills/'
    );
    process.exit(1);
  }

  console.log(`Found ${files.length} SKILL.md file(s)`);
  if (dryRun) console.log('DRY RUN — no database writes\n');

  const stats = { synced: 0, skipped: 0, errors: 0, warnings: 0 };
  const errors: Array<{ file: string; error: string }> = [];

  for (const file of files) {
    const relPath = path.relative(rootDir, file);
    try {
      const record = await parseSkillFile(file);

      // Token budget warning
      const bodyTokens = estimateTokens(record.content_template);
      if (bodyTokens > 5000) {
        console.warn(
          `  ⚠ ${record.skill_key}: body ~${bodyTokens} tokens (budget: 5000)`
        );
        stats.warnings++;
      }

      if (dryRun) {
        console.log(
          `  [dry-run] ${record.skill_key} (${record.category}) — ${bodyTokens} tokens`
        );
        stats.synced++;
        continue;
      }

      // Debug: log frontmatter before upsert
      if (record.skill_key === 'company-research') {
        console.log('  [DEBUG] company-research frontmatter keys:', Object.keys(record.frontmatter));
        console.log('  [DEBUG] has requires_capabilities:', !!record.frontmatter.requires_capabilities);
      }

      // Upsert
      const { error: upsertError } = await supabase
        .from('platform_skills')
        .upsert(
          {
            skill_key: record.skill_key,
            category: record.category,
            frontmatter: record.frontmatter,
            content_template: record.content_template,
            is_active: record.is_active,
          },
          { onConflict: 'skill_key' }
        );

      if (upsertError) {
        throw new Error(`Upsert failed: ${upsertError.message}`);
      }

      console.log(`  ✓ ${record.skill_key} (synced)`);
      stats.synced++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${relPath}: ${msg}`);
      errors.push({ file: relPath, error: msg });
      stats.errors++;
    }
  }

  // ── Sync references/ documents ──────────────────────────────
  if (!dryRun) {
    console.log('\nSyncing references/ documents...');
    let refsSynced = 0;

    for (const file of files) {
      const skillDir = path.dirname(file);
      const refsDir = path.join(skillDir, 'references');

      if (!fs.existsSync(refsDir)) continue;

      // Get the skill_key from directory name
      const skillKey = path.basename(skillDir);

      // Get platform_skills ID for this skill
      const { data: platformSkill } = await supabase
        .from('platform_skills')
        .select('id')
        .eq('skill_key', skillKey)
        .maybeSingle();

      if (!platformSkill) continue;

      // Get or create the "references" folder for this skill
      let { data: refsFolder } = await supabase
        .from('skill_folders')
        .select('id')
        .eq('skill_id', platformSkill.id)
        .eq('name', 'references')
        .maybeSingle();

      if (!refsFolder) {
        const { data: newFolder } = await supabase
          .from('skill_folders')
          .insert({
            skill_id: platformSkill.id,
            name: 'references',
            description: 'Reference documents and supplementary materials',
            sort_order: 0,
          })
          .select('id')
          .single();
        refsFolder = newFolder;
      }

      // Read all .md files in references/
      const refFiles = fs.readdirSync(refsDir).filter((f: string) => f.endsWith('.md'));

      for (const refFile of refFiles) {
        const refPath = path.join(refsDir, refFile);
        const refContent = await fs.promises.readFile(refPath, 'utf-8');
        const title = refFile.replace(/\.md$/, '');

        const { error: refError } = await supabase
          .from('skill_documents')
          .upsert(
            {
              skill_id: platformSkill.id,
              folder_id: refsFolder?.id ?? null,
              title,
              doc_type: 'reference',
              content: refContent,
            },
            { onConflict: 'skill_id,title' }
          );

        if (refError) {
          console.error(`  ✗ ${skillKey}/references/${refFile}: ${refError.message}`);
        } else {
          refsSynced++;
        }
      }
    }

    if (refsSynced > 0) {
      console.log(`  ✓ Synced ${refsSynced} reference document(s)`);
    } else {
      console.log('  No reference documents found');
    }
  }

  // ── Sync to .claude/skills/ ──────────────────────────────────
  console.log('\nSyncing to .claude/skills/...');
  const claudeSynced = syncClaudeSkills(rootDir);
  console.log(`  ✓ Synced ${claudeSynced} skills to .claude/skills/`);

  // ── Compile to organization_skills ────────────────────────────
  if (!dryRun && stats.synced > 0) {
    console.log('\nCompiling to organization_skills...');
    try {
      // Get all orgs
      const { data: orgs, error: orgsError } = await supabase
        .from('organizations')
        .select('id');

      if (orgsError) throw new Error(orgsError.message);

      for (const org of orgs || []) {
        const { data, error } = await supabase.functions.invoke(
          'compile-organization-skills',
          { body: { action: 'compile_all', organization_id: org.id } }
        );

        if (error) {
          console.error(`  ✗ org ${org.id}: ${error.message}`);
        } else {
          console.log(
            `  ✓ org ${org.id}: compiled ${data?.compiled ?? '?'} skill(s)`
          );
        }
      }
    } catch (err) {
      console.error(
        `  Compilation error: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  // ── Generate embeddings for changed skills ──────────────────
  if (!dryRun && stats.synced > 0 && process.env.OPENAI_API_KEY) {
    console.log('\nGenerating embeddings for changed skills...');
    try {
      // Collect skill keys that were synced (changed)
      const syncedKeys: string[] = [];
      for (const file of files) {
        const dirName = path.basename(path.dirname(file));
        syncedKeys.push(dirName);
      }

      const embeddingResults = await generateSkillEmbeddings(
        supabase,
        singleSkill ? [singleSkill] : undefined,
        { force: false } // Only generate for skills missing embeddings
      );

      const generated = embeddingResults.filter((r) => r.status === 'generated').length;
      const skipped = embeddingResults.filter((r) => r.status === 'skipped').length;
      const errored = embeddingResults.filter((r) => r.status === 'error').length;

      console.log(`  ✓ Embeddings: ${generated} generated, ${skipped} skipped, ${errored} errors`);

      if (errored > 0) {
        for (const r of embeddingResults.filter((r) => r.status === 'error')) {
          console.error(`    ✗ ${r.skillKey}: ${r.error}`);
        }
      }
    } catch (err) {
      console.warn(
        `  ⚠ Embedding generation failed: ${err instanceof Error ? err.message : err}`
      );
      console.warn('  Sync completed successfully — embeddings can be generated later');
    }
  } else if (!dryRun && stats.synced > 0 && !process.env.OPENAI_API_KEY) {
    console.log('\n⚠ OPENAI_API_KEY not set — skipping embedding generation');
  }

  // ── Summary ───────────────────────────────────────────────────
  console.log('\n─── Summary ───');
  console.log(`  Synced:   ${stats.synced}`);
  console.log(`  Skipped:  ${stats.skipped}`);
  console.log(`  Warnings: ${stats.warnings}`);
  console.log(`  Errors:   ${stats.errors}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const e of errors) {
      console.log(`  ${e.file}: ${e.error}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
