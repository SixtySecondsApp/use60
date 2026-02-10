/**
 * SKILL.md Parser
 *
 * Parses Agent Skills Standard SKILL.md files (YAML frontmatter + markdown body)
 * and maps them to the platform_skills DB format.
 *
 * Usage:
 *   import { parseSkillFile, parseSkillContent } from './lib/skillParser';
 *   const record = await parseSkillFile('skills/atomic/meeting-prep/SKILL.md');
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** DB-ready record produced by the parser */
export interface ParsedSkillRecord {
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
 * Parse a SKILL.md file from disk and return a DB-ready record.
 */
export async function parseSkillFile(filePath: string): Promise<ParsedSkillRecord> {
  const absolutePath = path.resolve(filePath);
  const raw = await fs.promises.readFile(absolutePath, 'utf-8');

  // Compute relative path from project root (skills/...)
  const projectRoot = path.resolve(__dirname, '..', '..');
  const relativePath = path.relative(projectRoot, absolutePath);

  return parseSkillContent(raw, relativePath);
}

/**
 * Parse raw SKILL.md content string and return a DB-ready record.
 *
 * @param content  Full file content (YAML frontmatter + markdown body)
 * @param sourcePath  Relative path for provenance tracking (e.g. skills/atomic/foo/SKILL.md)
 */
export function parseSkillContent(content: string, sourcePath: string): ParsedSkillRecord {
  const { data: frontmatter, content: body } = matter(content);

  // ── Validate required fields ──────────────────────────────────
  if (!frontmatter.name || typeof frontmatter.name !== 'string') {
    throw new Error(`[${sourcePath}] Missing required field: name`);
  }
  if (!frontmatter.description || typeof frontmatter.description !== 'string') {
    throw new Error(`[${sourcePath}] Missing required field: description`);
  }

  const metadata = (frontmatter.metadata ?? {}) as Record<string, unknown>;
  const category = (metadata.category as string) ?? 'sales-ai';
  const skillType = (metadata.skill_type as string) ?? 'atomic';
  const isActive = metadata.is_active !== false; // default true

  // ── Build the DB frontmatter blob ─────────────────────────────
  // Flatten V3 into the shape the runtime already consumes:
  //   { name, description, category, version, skill_type, triggers, ... }
  const dbFrontmatter: Record<string, unknown> = {
    name: frontmatter.name,
    description: frontmatter.description,
    category,
    version: Number(metadata.version ?? 2),
    skill_type: skillType,
  };

  // Copy known metadata fields
  const copyFields = [
    'triggers', 'intent_patterns', 'keywords',
    'required_context', 'optional_context',
    'inputs', 'outputs',
    'dependencies', 'child_skills',
    'workflow', 'linked_skills',
    'execution_mode', 'timeout_ms', 'retry_count',
    'tags', 'author', 'agent_affinity',
  ] as const;

  for (const field of copyFields) {
    if (metadata[field] !== undefined) {
      dbFrontmatter[field] = metadata[field];
    }
  }

  // ── Derive skill_key from directory name in source path ────────
  // e.g. "skills/atomic/meeting-prep-brief/SKILL.md" → "meeting-prep-brief"
  const pathParts = sourcePath.replace(/\\/g, '/').split('/');
  const skillDirIndex = pathParts.lastIndexOf('SKILL.md') - 1;
  const skillKey = skillDirIndex >= 0 ? pathParts[skillDirIndex] : (frontmatter.name as string);

  // ── Content template = markdown body (trimmed) ────────────────
  const contentTemplate = body.trim();

  // ── Source hash for change detection ──────────────────────────
  const sourceHash = createHash('sha256').update(content).digest('hex');

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
 * Estimate token count for a string (rough: tokens ≈ words × 1.3).
 */
export function estimateTokens(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}
