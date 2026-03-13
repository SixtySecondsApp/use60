-- Migration: linkedin_ad_library_tables
-- Date: 20260309220115
--
-- What this migration does:
--   Creates tables for LinkedIn Ad Library Intelligence feature:
--   - linkedin_ad_library_watchlist: competitor tracking list
--   - linkedin_ad_library_ads: captured ad creative data
--   - linkedin_ad_library_classifications: AI-generated ad classifications
--
-- Rollback strategy:
--   DROP TABLE linkedin_ad_library_classifications;
--   DROP TABLE linkedin_ad_library_ads;
--   DROP TABLE linkedin_ad_library_watchlist;
--   DROP TYPE IF EXISTS linkedin_ad_media_type;

-- Media type enum
DO $$ BEGIN
  CREATE TYPE linkedin_ad_media_type AS ENUM ('image', 'video', 'carousel', 'text');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- Watchlist: competitors the org is tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS linkedin_ad_library_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  competitor_name text NOT NULL,
  competitor_linkedin_url text,
  competitor_website text,
  capture_frequency text NOT NULL DEFAULT 'weekly',
  is_active boolean NOT NULL DEFAULT true,
  last_captured_at timestamptz,
  total_ads_captured integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_watchlist_entry UNIQUE (org_id, competitor_name)
);

-- =====================================================
-- Ads: captured LinkedIn ad creative data
-- =====================================================
CREATE TABLE IF NOT EXISTS linkedin_ad_library_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  watchlist_id uuid REFERENCES linkedin_ad_library_watchlist(id) ON DELETE SET NULL,
  advertiser_name text NOT NULL,
  advertiser_linkedin_url text,
  headline text,
  body_text text,
  cta_text text,
  destination_url text,
  media_type linkedin_ad_media_type NOT NULL DEFAULT 'text',
  media_urls jsonb DEFAULT '[]'::jsonb,
  cached_media_paths jsonb DEFAULT '[]'::jsonb,
  ad_format text,
  geography text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  capture_source text NOT NULL DEFAULT 'manual',
  capture_run_id text,
  raw_data jsonb DEFAULT '{}'::jsonb,
  is_likely_winner boolean NOT NULL DEFAULT false,
  winner_signals jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- Classifications: AI-generated ad classifications
-- =====================================================
CREATE TABLE IF NOT EXISTS linkedin_ad_library_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid NOT NULL REFERENCES linkedin_ad_library_ads(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  angle text,
  target_persona text,
  offer_type text,
  cta_type text,
  creative_format text,
  industry_vertical text,
  messaging_theme text,
  confidence numeric(3,2) NOT NULL DEFAULT 0.00,
  classified_by text NOT NULL DEFAULT 'ai',
  classified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_classification_per_ad UNIQUE (ad_id)
);

-- =====================================================
-- Indexes
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_ad_library_watchlist_org ON linkedin_ad_library_watchlist(org_id);
CREATE INDEX IF NOT EXISTS idx_ad_library_watchlist_active ON linkedin_ad_library_watchlist(org_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_ad_library_ads_org ON linkedin_ad_library_ads(org_id);
CREATE INDEX IF NOT EXISTS idx_ad_library_ads_advertiser ON linkedin_ad_library_ads(org_id, advertiser_name);
CREATE INDEX IF NOT EXISTS idx_ad_library_ads_first_seen ON linkedin_ad_library_ads(org_id, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_library_ads_watchlist ON linkedin_ad_library_ads(watchlist_id) WHERE watchlist_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ad_library_ads_capture_source ON linkedin_ad_library_ads(org_id, capture_source);
CREATE INDEX IF NOT EXISTS idx_ad_library_ads_likely_winner ON linkedin_ad_library_ads(org_id, is_likely_winner) WHERE is_likely_winner = true;

CREATE INDEX IF NOT EXISTS idx_ad_library_classifications_ad ON linkedin_ad_library_classifications(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_library_classifications_org ON linkedin_ad_library_classifications(org_id);
CREATE INDEX IF NOT EXISTS idx_ad_library_classifications_angle ON linkedin_ad_library_classifications(org_id, angle);
CREATE INDEX IF NOT EXISTS idx_ad_library_classifications_persona ON linkedin_ad_library_classifications(org_id, target_persona);

-- =====================================================
-- Full-text search on ad copy
-- =====================================================
ALTER TABLE linkedin_ad_library_ads
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(headline, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body_text, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(advertiser_name, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_ad_library_ads_search ON linkedin_ad_library_ads USING gin(search_vector);

-- =====================================================
-- RLS Policies
-- =====================================================
ALTER TABLE linkedin_ad_library_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_ad_library_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_ad_library_classifications ENABLE ROW LEVEL SECURITY;

-- Watchlist policies
DROP POLICY IF EXISTS "watchlist_select_org" ON linkedin_ad_library_watchlist;
CREATE POLICY "watchlist_select_org" ON linkedin_ad_library_watchlist
  FOR SELECT USING (
    org_id IN (SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "watchlist_insert_org" ON linkedin_ad_library_watchlist;
CREATE POLICY "watchlist_insert_org" ON linkedin_ad_library_watchlist
  FOR INSERT WITH CHECK (
    org_id IN (SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "watchlist_update_org" ON linkedin_ad_library_watchlist;
CREATE POLICY "watchlist_update_org" ON linkedin_ad_library_watchlist
  FOR UPDATE USING (
    org_id IN (SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "watchlist_delete_org" ON linkedin_ad_library_watchlist;
CREATE POLICY "watchlist_delete_org" ON linkedin_ad_library_watchlist
  FOR DELETE USING (
    org_id IN (SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid())
  );

-- Ads policies
DROP POLICY IF EXISTS "ads_select_org" ON linkedin_ad_library_ads;
CREATE POLICY "ads_select_org" ON linkedin_ad_library_ads
  FOR SELECT USING (
    org_id IN (SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "ads_insert_org" ON linkedin_ad_library_ads;
CREATE POLICY "ads_insert_org" ON linkedin_ad_library_ads
  FOR INSERT WITH CHECK (
    org_id IN (SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "ads_update_org" ON linkedin_ad_library_ads;
CREATE POLICY "ads_update_org" ON linkedin_ad_library_ads
  FOR UPDATE USING (
    org_id IN (SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "ads_delete_org" ON linkedin_ad_library_ads;
CREATE POLICY "ads_delete_org" ON linkedin_ad_library_ads
  FOR DELETE USING (
    org_id IN (SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid())
  );

-- Classifications policies
DROP POLICY IF EXISTS "classifications_select_org" ON linkedin_ad_library_classifications;
CREATE POLICY "classifications_select_org" ON linkedin_ad_library_classifications
  FOR SELECT USING (
    org_id IN (SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "classifications_insert_org" ON linkedin_ad_library_classifications;
CREATE POLICY "classifications_insert_org" ON linkedin_ad_library_classifications
  FOR INSERT WITH CHECK (
    org_id IN (SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "classifications_update_org" ON linkedin_ad_library_classifications;
CREATE POLICY "classifications_update_org" ON linkedin_ad_library_classifications
  FOR UPDATE USING (
    org_id IN (SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "classifications_delete_org" ON linkedin_ad_library_classifications;
CREATE POLICY "classifications_delete_org" ON linkedin_ad_library_classifications
  FOR DELETE USING (
    org_id IN (SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid())
  );

-- Service role bypass for edge functions
DROP POLICY IF EXISTS "watchlist_service_role" ON linkedin_ad_library_watchlist;
CREATE POLICY "watchlist_service_role" ON linkedin_ad_library_watchlist
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "ads_service_role" ON linkedin_ad_library_ads;
CREATE POLICY "ads_service_role" ON linkedin_ad_library_ads
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "classifications_service_role" ON linkedin_ad_library_classifications;
CREATE POLICY "classifications_service_role" ON linkedin_ad_library_classifications
  FOR ALL USING (auth.role() = 'service_role');

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_linkedin_ad_library_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_watchlist_updated_at ON linkedin_ad_library_watchlist;
CREATE TRIGGER trg_watchlist_updated_at
  BEFORE UPDATE ON linkedin_ad_library_watchlist
  FOR EACH ROW EXECUTE FUNCTION update_linkedin_ad_library_updated_at();

DROP TRIGGER IF EXISTS trg_ads_updated_at ON linkedin_ad_library_ads;
CREATE TRIGGER trg_ads_updated_at
  BEFORE UPDATE ON linkedin_ad_library_ads
  FOR EACH ROW EXECUTE FUNCTION update_linkedin_ad_library_updated_at();

DROP TRIGGER IF EXISTS trg_classifications_updated_at ON linkedin_ad_library_classifications;
CREATE TRIGGER trg_classifications_updated_at
  BEFORE UPDATE ON linkedin_ad_library_classifications
  FOR EACH ROW EXECUTE FUNCTION update_linkedin_ad_library_updated_at();
