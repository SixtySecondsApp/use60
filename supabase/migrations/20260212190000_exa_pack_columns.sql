ALTER TABLE dynamic_table_columns ADD COLUMN IF NOT EXISTS enrichment_schema jsonb DEFAULT NULL;
ALTER TABLE dynamic_table_columns ADD COLUMN IF NOT EXISTS enrichment_pack_id uuid DEFAULT NULL;
