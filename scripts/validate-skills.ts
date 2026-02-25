#!/usr/bin/env node

/**
 * Validate all SKILL.md files
 *
 * Parses every SKILL.md in skills/ and verifies:
 * 1. Valid YAML frontmatter with required fields (name, description)
 * 2. Category is valid
 * 3. Directory name matches skill_key
 * 4. Token budget warnings for body content
 * 5. Sequences have workflow steps
 *
 * Usage:
 *   npx tsx scripts/validate-skills.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkillFile, estimateTokens } from './lib/skillParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VALID_CATEGORIES = [
  'sales-ai',
  'writing',
  'enrichment',
  'workflows',
  'data-access',
  'output-format',
  'agent-sequence',
];

const VALID_AGENT_NAMES = [
  'pipeline',
  'outreach',
  'research',
  'crm_ops',
  'meetings',
  'prospecting',
];

const TOKEN_BUDGET = 5000;

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

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const files = findSkillFiles(rootDir);

  if (files.length === 0) {
    console.error('No SKILL.md files found');
    process.exit(1);
  }

  console.log(`Validating ${files.length} SKILL.md file(s)...\n`);

  let passed = 0;
  let warnings = 0;
  const errors: Array<{ file: string; issues: string[] }> = [];

  for (const file of files) {
    const relPath = path.relative(rootDir, file);
    const issues: string[] = [];
    const warns: string[] = [];

    try {
      const record = await parseSkillFile(file);

      // 1. Validate directory name matches skill_key
      const dirName = path.basename(path.dirname(file));
      if (dirName !== record.skill_key) {
        issues.push(
          `Directory "${dirName}" doesn't match skill_key "${record.skill_key}"`
        );
      }

      // 2. Validate category
      if (!VALID_CATEGORIES.includes(record.category)) {
        warns.push(
          `Category "${record.category}" not in standard list: ${VALID_CATEGORIES.join(', ')}`
        );
      }

      // 3. Token budget
      const bodyTokens = estimateTokens(record.content_template);
      if (bodyTokens > TOKEN_BUDGET) {
        warns.push(
          `Body ~${bodyTokens} tokens exceeds budget of ${TOKEN_BUDGET} — consider extracting to references/`
        );
      }

      // 4. Sequence validation
      const fm = record.frontmatter;
      if (
        fm.skill_type === 'sequence' &&
        !fm.workflow &&
        !fm.sequence_steps
      ) {
        warns.push('Sequence missing workflow/sequence_steps in metadata');
      }

      // 5. agent_affinity validation
      const agentAffinity = fm.agent_affinity;
      if (agentAffinity !== undefined) {
        if (!Array.isArray(agentAffinity)) {
          issues.push('agent_affinity must be an array of agent names');
        } else {
          for (const agent of agentAffinity) {
            if (!VALID_AGENT_NAMES.includes(String(agent))) {
              issues.push(
                `Invalid agent_affinity value "${agent}". Valid: ${VALID_AGENT_NAMES.join(', ')}`
              );
            }
          }
        }
      }

      // 6. Content not empty
      if (!record.content_template || record.content_template.length < 10) {
        warns.push('Content template is very short or empty');
      }

      // 7. command_centre validation
      const commandCentre = fm.command_centre as Record<string, unknown> | undefined;
      if (commandCentre !== undefined) {
        if (typeof commandCentre !== 'object' || commandCentre === null) {
          issues.push('command_centre must be an object');
        } else {
          if (commandCentre.enabled !== undefined && typeof commandCentre.enabled !== 'boolean') {
            issues.push('command_centre.enabled must be a boolean');
          }
          if (commandCentre.label !== undefined && typeof commandCentre.label !== 'string') {
            issues.push('command_centre.label must be a string');
          }
          if (commandCentre.label && typeof commandCentre.label === 'string' && !commandCentre.label.startsWith('/')) {
            warns.push('command_centre.label should start with "/" (e.g. "/email")');
          }
          if (commandCentre.description !== undefined && typeof commandCentre.description !== 'string') {
            issues.push('command_centre.description must be a string');
          }
          if (commandCentre.icon !== undefined && typeof commandCentre.icon !== 'string') {
            issues.push('command_centre.icon must be a string (Lucide icon name)');
          }
        }
      }

      if (issues.length > 0) {
        errors.push({ file: relPath, issues });
        console.log(`  ✗ ${relPath}`);
        for (const i of issues) console.log(`    ERROR: ${i}`);
        for (const w of warns) console.log(`    WARN:  ${w}`);
      } else {
        passed++;
        if (warns.length > 0) {
          warnings += warns.length;
          console.log(`  ⚠ ${relPath} (${warns.length} warning(s))`);
          for (const w of warns) console.log(`    WARN:  ${w}`);
        } else {
          console.log(`  ✓ ${relPath}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ file: relPath, issues: [msg] });
      console.log(`  ✗ ${relPath}`);
      console.log(`    ERROR: ${msg}`);
    }
  }

  // Summary
  console.log('\n─── Summary ───');
  console.log(`  Total:    ${files.length}`);
  console.log(`  Passed:   ${passed}`);
  console.log(`  Warnings: ${warnings}`);
  console.log(`  Errors:   ${errors.length}`);

  if (errors.length > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
