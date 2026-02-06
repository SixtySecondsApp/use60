-- Move all existing skill links to the references folder
-- Linked skills should always be in the references/ folder of their parent skill

-- Update skill_links to point to the references folder for each parent skill
UPDATE skill_links sl
SET folder_id = sf.id
FROM skill_folders sf
WHERE sf.skill_id = sl.parent_skill_id
  AND sf.name = 'references'
  AND sf.parent_folder_id IS NULL
  AND (sl.folder_id IS NULL OR sl.folder_id != sf.id);

-- Log how many were updated
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Moved % skill links to references folders', updated_count;
END $$;
