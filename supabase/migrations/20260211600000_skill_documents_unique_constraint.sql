-- Add unique constraint on (skill_id, title) for skill_documents
-- Required for the sync-skills.ts upsert with onConflict: 'skill_id,title'
-- Documents are unique per skill + title (references can't have duplicate names)

CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_documents_unique_skill_title
  ON skill_documents(skill_id, title);
