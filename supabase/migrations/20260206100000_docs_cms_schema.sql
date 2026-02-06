-- Documentation CMS Schema
-- DOC-001: Create docs_articles, docs_versions, docs_feedback, and docs_ai_proposals tables

-- Main articles table
CREATE TABLE docs_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL, -- markdown content
  metadata JSONB DEFAULT '{}'::jsonb,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  published BOOLEAN DEFAULT false,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on slug for fast lookups
CREATE INDEX idx_docs_articles_slug ON docs_articles(slug);
CREATE INDEX idx_docs_articles_category ON docs_articles(category);
CREATE INDEX idx_docs_articles_published ON docs_articles(published);
CREATE INDEX idx_docs_articles_org_id ON docs_articles(org_id);

-- Version history table
CREATE TABLE docs_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES docs_articles(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL, -- snapshot of content at this version
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  diff_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(article_id, version_number)
);

CREATE INDEX idx_docs_versions_article_id ON docs_versions(article_id);
CREATE INDEX idx_docs_versions_created_at ON docs_versions(created_at DESC);

-- User feedback table
CREATE TABLE docs_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES docs_articles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  helpful BOOLEAN NOT NULL,
  comment TEXT,
  section_slug TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(article_id, user_id, section_slug) -- One feedback per user per section
);

CREATE INDEX idx_docs_feedback_article_id ON docs_feedback(article_id);
CREATE INDEX idx_docs_feedback_user_id ON docs_feedback(user_id);

-- AI-proposed updates table
CREATE TABLE docs_ai_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES docs_articles(id) ON DELETE CASCADE,
  proposed_content TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  slack_message_ts TEXT, -- Slack thread timestamp for approval workflow
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_docs_ai_proposals_article_id ON docs_ai_proposals(article_id);
CREATE INDEX idx_docs_ai_proposals_status ON docs_ai_proposals(status);

-- Enable RLS on all tables
ALTER TABLE docs_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE docs_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE docs_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE docs_ai_proposals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for docs_articles

-- All authenticated users can read published articles
CREATE POLICY "Users can read published articles"
  ON docs_articles FOR SELECT
  USING (
    auth.role() = 'authenticated' AND published = true
  );

-- Org admins/owners can read all articles (including drafts)
CREATE POLICY "Admins can read all articles"
  ON docs_articles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.user_id = auth.uid()
      AND organization_memberships.role IN ('admin', 'owner')
    )
  );

-- Org admins/owners can insert articles
CREATE POLICY "Admins can insert articles"
  ON docs_articles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.user_id = auth.uid()
      AND organization_memberships.role IN ('admin', 'owner')
    )
  );

-- Org admins/owners can update articles
CREATE POLICY "Admins can update articles"
  ON docs_articles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.user_id = auth.uid()
      AND organization_memberships.role IN ('admin', 'owner')
    )
  );

-- Org admins/owners can delete articles
CREATE POLICY "Admins can delete articles"
  ON docs_articles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.user_id = auth.uid()
      AND organization_memberships.role IN ('admin', 'owner')
    )
  );

-- RLS Policies for docs_versions

-- Authenticated users can read versions for published articles
CREATE POLICY "Users can read versions for published articles"
  ON docs_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM docs_articles
      WHERE docs_articles.id = docs_versions.article_id
      AND docs_articles.published = true
    )
  );

-- Admins can read all versions
CREATE POLICY "Admins can read all versions"
  ON docs_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.user_id = auth.uid()
      AND organization_memberships.role IN ('admin', 'owner')
    )
  );

-- Admins can insert versions
CREATE POLICY "Admins can insert versions"
  ON docs_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.user_id = auth.uid()
      AND organization_memberships.role IN ('admin', 'owner')
    )
  );

-- RLS Policies for docs_feedback

-- Users can read all feedback (for aggregation)
CREATE POLICY "Users can read feedback"
  ON docs_feedback FOR SELECT
  USING (auth.role() = 'authenticated');

-- Users can insert their own feedback
CREATE POLICY "Users can insert feedback"
  ON docs_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own feedback
CREATE POLICY "Users can update their own feedback"
  ON docs_feedback FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own feedback
CREATE POLICY "Users can delete their own feedback"
  ON docs_feedback FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for docs_ai_proposals

-- Admins can read all proposals
CREATE POLICY "Admins can read proposals"
  ON docs_ai_proposals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.user_id = auth.uid()
      AND organization_memberships.role IN ('admin', 'owner')
    )
  );

-- Service role can insert proposals (from AI)
CREATE POLICY "Service can insert proposals"
  ON docs_ai_proposals FOR INSERT
  WITH CHECK (true); -- Service role bypasses RLS anyway

-- Admins can update proposals (approve/reject)
CREATE POLICY "Admins can update proposals"
  ON docs_ai_proposals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.user_id = auth.uid()
      AND organization_memberships.role IN ('admin', 'owner')
    )
  );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_docs_articles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER docs_articles_updated_at
  BEFORE UPDATE ON docs_articles
  FOR EACH ROW
  EXECUTE FUNCTION update_docs_articles_updated_at();

-- Trigger to create version snapshot on article update
CREATE OR REPLACE FUNCTION create_docs_version_on_update()
RETURNS TRIGGER AS $$
DECLARE
  next_version INTEGER;
BEGIN
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO next_version
  FROM docs_versions
  WHERE article_id = NEW.id;

  -- Create version snapshot if content changed
  IF OLD.content IS DISTINCT FROM NEW.content THEN
    INSERT INTO docs_versions (article_id, version_number, content, changed_by, diff_summary)
    VALUES (
      NEW.id,
      next_version,
      OLD.content, -- Store previous version
      auth.uid(),
      'Content updated'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER docs_articles_version_on_update
  AFTER UPDATE ON docs_articles
  FOR EACH ROW
  EXECUTE FUNCTION create_docs_version_on_update();
