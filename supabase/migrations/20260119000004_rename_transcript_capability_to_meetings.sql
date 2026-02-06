-- Migration: Rename 'transcript' capability to 'meetings' in platform_skills
-- This ensures all skills use the correct capability name

-- Update any skills that have 'transcript' in their requires_capabilities
UPDATE platform_skills
SET frontmatter = jsonb_set(
  frontmatter,
  '{requires_capabilities}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN elem::text = '"transcript"' THEN '"meetings"'::jsonb
        ELSE elem
      END
    )
    FROM jsonb_array_elements(frontmatter->'requires_capabilities') AS elem
  )
)
WHERE frontmatter->'requires_capabilities' @> '["transcript"]'::jsonb;

-- Also handle any lowercase variations
UPDATE platform_skills
SET frontmatter = jsonb_set(
  frontmatter,
  '{requires_capabilities}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN elem::text = '"Transcript"' THEN '"meetings"'::jsonb
        ELSE elem
      END
    )
    FROM jsonb_array_elements(frontmatter->'requires_capabilities') AS elem
  )
)
WHERE frontmatter->'requires_capabilities' @> '["Transcript"]'::jsonb;
