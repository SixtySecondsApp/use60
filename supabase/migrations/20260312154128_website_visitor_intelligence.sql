-- Migration: website_visitor_intelligence
-- Creates website_visitors, visitor_snippet_configs, and ip_resolution_cache tables

CREATE TABLE IF NOT EXISTS visitor_snippet_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snippet_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  allowed_domains TEXT[] DEFAULT '{}',
  exclude_paths TEXT[] DEFAULT '{}',
  auto_enrich BOOLEAN NOT NULL DEFAULT true,
  auto_create_lead BOOLEAN NOT NULL DEFAULT true,
  rb2b_api_key TEXT,
  rb2b_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT visitor_snippet_configs_org_id_key UNIQUE (org_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_visitor_snippet_configs_token
  ON visitor_snippet_configs (snippet_token);

ALTER TABLE visitor_snippet_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visitor_snippet_configs_select_org" ON visitor_snippet_configs;
CREATE POLICY "visitor_snippet_configs_select_org" ON visitor_snippet_configs
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM organization_memberships WHERE user_id = auth.uid())
    OR public.is_service_role()
  );

DROP POLICY IF EXISTS "visitor_snippet_configs_insert_org" ON visitor_snippet_configs;
CREATE POLICY "visitor_snippet_configs_insert_org" ON visitor_snippet_configs
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM organization_memberships WHERE user_id = auth.uid())
    OR public.is_service_role()
  );

DROP POLICY IF EXISTS "visitor_snippet_configs_update_org" ON visitor_snippet_configs;
CREATE POLICY "visitor_snippet_configs_update_org" ON visitor_snippet_configs
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM organization_memberships WHERE user_id = auth.uid())
    OR public.is_service_role()
  );

DROP POLICY IF EXISTS "visitor_snippet_configs_delete_org" ON visitor_snippet_configs;
CREATE POLICY "visitor_snippet_configs_delete_org" ON visitor_snippet_configs
  FOR DELETE USING (
    org_id IN (SELECT org_id FROM organization_memberships WHERE user_id = auth.uid())
    OR public.is_service_role()
  );

CREATE TABLE IF NOT EXISTS website_visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  visitor_ip TEXT NOT NULL,
  user_agent TEXT,
  session_id TEXT,
  referrer TEXT,
  page_url TEXT,
  page_title TEXT,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_company_name TEXT,
  resolved_company_domain TEXT,
  resolved_company_data JSONB,
  resolution_provider TEXT,
  resolution_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (resolution_status IN ('pending', 'resolved', 'unresolvable', 'residential')),
  matched_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  enrichment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (enrichment_status IN ('pending', 'enriched', 'skipped')),
  rb2b_person_data JSONB,
  rb2b_identified BOOLEAN NOT NULL DEFAULT false,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_visitors_org_id ON website_visitors (org_id);
CREATE INDEX IF NOT EXISTS idx_website_visitors_visitor_ip ON website_visitors (visitor_ip);
CREATE INDEX IF NOT EXISTS idx_website_visitors_session_id ON website_visitors (session_id);
CREATE INDEX IF NOT EXISTS idx_website_visitors_resolution_status ON website_visitors (resolution_status);
CREATE INDEX IF NOT EXISTS idx_website_visitors_visited_at ON website_visitors (visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_website_visitors_org_visited ON website_visitors (org_id, visited_at DESC);

ALTER TABLE website_visitors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "website_visitors_select_org" ON website_visitors;
CREATE POLICY "website_visitors_select_org" ON website_visitors
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM organization_memberships WHERE user_id = auth.uid())
    OR public.is_service_role()
  );

DROP POLICY IF EXISTS "website_visitors_insert_service" ON website_visitors;
CREATE POLICY "website_visitors_insert_service" ON website_visitors
  FOR INSERT WITH CHECK (public.is_service_role());

DROP POLICY IF EXISTS "website_visitors_update_service" ON website_visitors;
CREATE POLICY "website_visitors_update_service" ON website_visitors
  FOR UPDATE USING (public.is_service_role());

DROP POLICY IF EXISTS "website_visitors_delete_org" ON website_visitors;
CREATE POLICY "website_visitors_delete_org" ON website_visitors
  FOR DELETE USING (
    org_id IN (SELECT org_id FROM organization_memberships WHERE user_id = auth.uid())
    OR public.is_service_role()
  );

CREATE TABLE IF NOT EXISTS ip_resolution_cache (
  ip_address TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  company_name TEXT,
  company_domain TEXT,
  company_data JSONB,
  resolution_status TEXT NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_ip_resolution_cache_expires ON ip_resolution_cache (expires_at);

ALTER TABLE ip_resolution_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ip_resolution_cache_service_only" ON ip_resolution_cache;
CREATE POLICY "ip_resolution_cache_service_only" ON ip_resolution_cache
  USING (public.is_service_role());

CREATE OR REPLACE FUNCTION update_website_visitor_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_website_visitors_updated_at ON website_visitors;
CREATE TRIGGER trg_website_visitors_updated_at
  BEFORE UPDATE ON website_visitors
  FOR EACH ROW EXECUTE FUNCTION update_website_visitor_timestamp();

DROP TRIGGER IF EXISTS trg_visitor_snippet_configs_updated_at ON visitor_snippet_configs;
CREATE TRIGGER trg_visitor_snippet_configs_updated_at
  BEFORE UPDATE ON visitor_snippet_configs
  FOR EACH ROW EXECUTE FUNCTION update_website_visitor_timestamp();
