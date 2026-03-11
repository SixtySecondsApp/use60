-- Campaign links for personalized /t/{code} demo URLs
-- Each link maps a short code to a pre-enriched prospect, allowing
-- instant-load personalized sandbox demos from outbound campaigns.

CREATE TABLE IF NOT EXISTS campaign_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Short code for URL: /t/{code} (6-char base62)
  code TEXT NOT NULL UNIQUE,

  -- Campaign context
  campaign_name TEXT,
  campaign_source TEXT,  -- e.g. 'linkedin', 'email', 'event'

  -- Visitor info (pre-filled from outreach list)
  visitor_first_name TEXT,
  visitor_last_name TEXT,
  visitor_email TEXT,
  visitor_title TEXT,
  visitor_company TEXT NOT NULL,
  visitor_domain TEXT,

  -- Pre-enriched research data (cached from enrichment pipeline)
  research_data JSONB,
  ai_content JSONB,  -- Pre-generated email drafts, meeting prep

  -- Tracking
  view_count INT DEFAULT 0,
  first_viewed_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,

  -- Owner (the rep who created the link)
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'archived')),
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast code lookups
CREATE INDEX IF NOT EXISTS idx_campaign_links_code ON campaign_links(code);

-- Index for campaign filtering
CREATE INDEX IF NOT EXISTS idx_campaign_links_campaign ON campaign_links(campaign_name, status);

-- Index for owner queries
CREATE INDEX IF NOT EXISTS idx_campaign_links_created_by ON campaign_links(created_by);

-- RLS: Public read for active links (visitors need to resolve codes without auth)
ALTER TABLE campaign_links ENABLE ROW LEVEL SECURITY;

-- Anyone can read active, non-expired links (needed for /t/{code} resolution)
DROP POLICY IF EXISTS "Public can read active campaign links" ON campaign_links;
CREATE POLICY "Public can read active campaign links"
  ON campaign_links FOR SELECT
  USING (
    status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW())
  );

-- Authenticated users can create links
DROP POLICY IF EXISTS "Authenticated users can create campaign links" ON campaign_links;
CREATE POLICY "Authenticated users can create campaign links"
  ON campaign_links FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Owners can update their own links
DROP POLICY IF EXISTS "Owners can update their campaign links" ON campaign_links;
CREATE POLICY "Owners can update their campaign links"
  ON campaign_links FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

-- Campaign visitors table for tracking engagement
CREATE TABLE IF NOT EXISTS campaign_visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  campaign_link_id UUID REFERENCES campaign_links(id) ON DELETE CASCADE,

  -- Session info
  session_id TEXT,
  visitor_ip TEXT,
  user_agent TEXT,
  referrer TEXT,

  -- Engagement tracking
  views INT DEFAULT 1,
  sandbox_interactions INT DEFAULT 0,
  time_spent_seconds INT DEFAULT 0,
  views_navigated TEXT[] DEFAULT '{}',  -- Which sandbox views they visited

  -- Conversion
  signup_email TEXT,
  converted_at TIMESTAMPTZ,

  -- Engagement score (computed)
  engagement_score INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for link lookups
CREATE INDEX IF NOT EXISTS idx_campaign_visitors_link ON campaign_visitors(campaign_link_id);

-- RLS: Public insert (visitors tracking), owner read
ALTER TABLE campaign_visitors ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts for visitor tracking
DROP POLICY IF EXISTS "Public can insert campaign visitors" ON campaign_visitors;
CREATE POLICY "Public can insert campaign visitors"
  ON campaign_visitors FOR INSERT
  WITH CHECK (true);

-- Link owners can read visitor data
DROP POLICY IF EXISTS "Link owners can read visitor data" ON campaign_visitors;
CREATE POLICY "Link owners can read visitor data"
  ON campaign_visitors FOR SELECT
  TO authenticated
  USING (
    campaign_link_id IN (
      SELECT id FROM campaign_links WHERE created_by = auth.uid()
    )
  );

-- ============================================================
-- Additional columns for campaign_visitors
-- ============================================================

-- Detailed event log for visitor interactions (click sequences, timing, etc.)
ALTER TABLE campaign_visitors ADD COLUMN IF NOT EXISTS event_log JSONB DEFAULT '[]';

-- Features/views the visitor showed interest in
ALTER TABLE campaign_visitors ADD COLUMN IF NOT EXISTS feature_interests TEXT[] DEFAULT '{}';

-- ============================================================
-- RPC: Atomically increment view count on a campaign link
-- ============================================================

CREATE OR REPLACE FUNCTION increment_campaign_view(link_code TEXT)
RETURNS void AS $$
BEGIN
  UPDATE campaign_links
  SET view_count = view_count + 1,
      first_viewed_at = COALESCE(first_viewed_at, NOW()),
      last_viewed_at = NOW()
  WHERE code = link_code AND status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow anonymous and authenticated callers to increment views
GRANT EXECUTE ON FUNCTION increment_campaign_view(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION increment_campaign_view(TEXT) TO authenticated;
