-- Seed: Test Skills + Test Sequence (manual / dev-only)
-- Date: 2026-01-13
--
-- Purpose:
-- - Create 2 deterministic "test" skills and 1 "agent-sequence" so Copilot can be tested end-to-end.
-- - Safe to re-run (UPSERT by unique skill_key).
--
-- How to use (high level):
-- 1) Run this SQL in your Supabase SQL editor (dev/staging environment).
-- 2) Compile into an org via the `compile-organization-skills` edge function (action=compile_all).
-- 3) In Copilot chat: list skills/sequences, then run the sequence via execute_action: run_sequence.
--
-- NOTE:
-- - These are platform-level templates (`platform_skills`). They won't appear for an org until compiled
--   into `organization_skills` (and are enabled there).
-- - Category for the sequence MUST be `agent-sequence` (this is how Copilot distinguishes sequences).

BEGIN;

-- -----------------------------------------------------------------------------
-- Skill 1: Test Echo (deterministic)
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'test-echo',
  'output-format',
  '{
    "name": "Test: Echo",
    "description": "Diagnostic skill for end-to-end Copilot tests. Echoes inputs and computes simple metrics deterministically.",
    "tags": ["test", "diagnostic"],
    "input_schema": {
      "text": { "type": "string", "required": true, "description": "Any input text" },
      "note": { "type": "string", "required": false, "description": "Optional note" }
    },
    "output_schema": {
      "text": { "type": "string" },
      "note": { "type": "string" },
      "text_upper": { "type": "string" },
      "char_count": { "type": "number" }
    }
  }'::jsonb,
  E'# Test Skill: Echo\n\n## Goal\nReturn a deterministic transformation of the runtime context.\n\n## Inputs\n- `context.text` (string, required)\n- `context.note` (string, optional)\n\n## Required behavior (deterministic)\n- If `context.text` is missing or empty: return status `failed` with an error.\n- Otherwise:\n  - `data.text` = exactly the input text\n  - `data.note` = the note string if provided, else empty string\n  - `data.text_upper` = uppercase of `data.text`\n  - `data.char_count` = character count of `data.text` (including spaces)\n\n## Output\nReturn ONLY the JSON contract required by the executor.\n',
  true
)
ON CONFLICT (skill_key)
DO UPDATE SET
  category = EXCLUDED.category,
  frontmatter = EXCLUDED.frontmatter,
  content_template = EXCLUDED.content_template,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Skill 2: Test First 3 Sentences (deterministic)
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'test-first-3-sentences',
  'output-format',
  '{
    "name": "Test: First 3 Sentences",
    "description": "Deterministic parsing skill for tests. Splits text on \".\" and returns up to the first 3 non-empty sentences.",
    "tags": ["test", "diagnostic"],
    "input_schema": {
      "text": { "type": "string", "required": true, "description": "Text to split into sentences" }
    },
    "output_schema": {
      "sentences": { "type": "array" },
      "sentence_count": { "type": "number" }
    }
  }'::jsonb,
  E'# Test Skill: First 3 Sentences\n\n## Goal\nReturn deterministic sentence extraction.\n\n## Inputs\n- `context.text` (string, required)\n\n## Required behavior (deterministic)\n- If `context.text` is missing or empty: return status `failed` with an error.\n- Otherwise:\n  - Split the text on the period character `.`\n  - Trim whitespace from each segment\n  - Keep only non-empty segments\n  - Return up to the first 3 segments as `data.sentences`\n  - Return `data.sentence_count` = number of returned sentences\n\n## Output\nReturn ONLY the JSON contract required by the executor.\n',
  true
)
ON CONFLICT (skill_key)
DO UPDATE SET
  category = EXCLUDED.category,
  frontmatter = EXCLUDED.frontmatter,
  content_template = EXCLUDED.content_template,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Sequence: Test Demo Sequence (2 steps)
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'seq-test-demo',
  'agent-sequence',
  '{
    "name": "Test: Demo Sequence",
    "description": "2-step sequence for Copilot E2E tests. Runs test-echo then test-first-3-sentences.",
    "tags": ["test", "diagnostic", "sequence"],
    "input_schema": {
      "text": { "type": "string", "required": true, "description": "Text to pass through the sequence" },
      "note": { "type": "string", "required": false, "description": "Optional note (passed to echo step)" }
    },
    "output_schema": {
      "echo": { "type": "object" },
      "sentences": { "type": "object" }
    },
    "sequence_steps": [
      {
        "order": 1,
        "skill_key": "test-echo",
        "input_mapping": {
          "text": "${trigger.params.text}",
          "note": "${trigger.params.note}"
        },
        "output_key": "echo",
        "on_failure": "stop"
      },
      {
        "order": 2,
        "skill_key": "test-first-3-sentences",
        "input_mapping": {
          "text": "${outputs.echo.text}"
        },
        "output_key": "sentences",
        "on_failure": "stop"
      }
    ]
  }'::jsonb,
  E'# Test Sequence: Demo\n\nThis is a multi-step sequence (category `agent-sequence`).\n\nRuntime execution is orchestrated by the edge function `api-sequence-execute`.\nThe canonical step configuration lives in frontmatter under `sequence_steps`.\n',
  true
)
ON CONFLICT (skill_key)
DO UPDATE SET
  category = EXCLUDED.category,
  frontmatter = EXCLUDED.frontmatter,
  content_template = EXCLUDED.content_template,
  is_active = EXCLUDED.is_active,
  updated_at = now();

COMMIT;

