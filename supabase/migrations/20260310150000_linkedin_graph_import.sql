-- Migration: linkedin_graph_import
-- Date: 20260310150000
--
-- What this migration does:
--   Creates user-scoped tables for LinkedIn archive import (Phase 5):
--   linkedin_archive_imports, linkedin_import_contacts, linkedin_import_messages,
--   linkedin_import_relationship_scores. RLS is user-scoped, not org-wide.
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS public.linkedin_import_relationship_scores;
--   DROP TABLE IF EXISTS public.linkedin_import_messages;
--   DROP TABLE IF EXISTS public.linkedin_import_contacts;
--   DROP TABLE IF EXISTS public.linkedin_archive_imports;

-- Import run tracking
CREATE TABLE IF NOT EXISTS public.linkedin_archive_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  file_name text,
  file_type text, -- 'connections_csv', 'messages_csv', 'full_archive'
  status text NOT NULL DEFAULT 'processing', -- 'processing', 'completed', 'failed'
  total_records integer DEFAULT 0,
  imported_records integer DEFAULT 0,
  matched_records integer DEFAULT 0,
  errors jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Imported LinkedIn connections
CREATE TABLE IF NOT EXISTS public.linkedin_import_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.linkedin_archive_imports(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  first_name text,
  last_name text,
  email text,
  company text,
  position text,
  linkedin_url text,
  connected_on date,
  matched_contact_id uuid, -- FK to contacts if matched
  match_confidence text, -- 'exact', 'high', 'medium', 'low', 'unmatched'
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(import_id, linkedin_url)
);

-- Imported LinkedIn messages
CREATE TABLE IF NOT EXISTS public.linkedin_import_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.linkedin_archive_imports(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  contact_id uuid REFERENCES public.linkedin_import_contacts(id),
  sender_name text,
  recipient_name text,
  message_date timestamptz,
  subject text,
  content text,
  direction text, -- 'inbound', 'outbound'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Relationship trust scores
CREATE TABLE IF NOT EXISTS public.linkedin_import_relationship_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  contact_id uuid NOT NULL REFERENCES public.linkedin_import_contacts(id),
  trust_tier text NOT NULL DEFAULT 'cold', -- 'cold', 'known', 'trusted', 'strong'
  total_messages integer DEFAULT 0,
  inbound_messages integer DEFAULT 0,
  outbound_messages integer DEFAULT 0,
  last_message_date timestamptz,
  connection_date date,
  recency_score numeric, -- 0-1 based on how recent last interaction was
  frequency_score numeric, -- 0-1 based on message frequency
  reciprocity_score numeric, -- 0-1 based on bidirectional messaging ratio
  composite_score numeric, -- weighted combination
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, contact_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_linkedin_archive_imports_user ON public.linkedin_archive_imports (user_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_import_contacts_import ON public.linkedin_import_contacts (import_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_import_contacts_user ON public.linkedin_import_contacts (user_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_import_contacts_matched ON public.linkedin_import_contacts (matched_contact_id) WHERE matched_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_linkedin_import_messages_contact ON public.linkedin_import_messages (contact_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_import_relationship_scores_user ON public.linkedin_import_relationship_scores (user_id, trust_tier);
CREATE INDEX IF NOT EXISTS idx_linkedin_import_relationship_scores_org ON public.linkedin_import_relationship_scores (org_id, trust_tier);

-- Enable RLS (user-scoped, not org-wide)
ALTER TABLE public.linkedin_archive_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linkedin_import_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linkedin_import_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linkedin_import_relationship_scores ENABLE ROW LEVEL SECURITY;

-- RLS: users can only see their own imports
DROP POLICY IF EXISTS "users_own_archive_imports" ON public.linkedin_archive_imports;
CREATE POLICY "users_own_archive_imports" ON public.linkedin_archive_imports
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_own_import_contacts" ON public.linkedin_import_contacts;
CREATE POLICY "users_own_import_contacts" ON public.linkedin_import_contacts
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_own_import_messages" ON public.linkedin_import_messages;
CREATE POLICY "users_own_import_messages" ON public.linkedin_import_messages
  FOR ALL USING (user_id = auth.uid());

-- Relationship scores: user can see their own, org members can see within org
DROP POLICY IF EXISTS "users_own_relationship_scores" ON public.linkedin_import_relationship_scores;
CREATE POLICY "users_own_relationship_scores" ON public.linkedin_import_relationship_scores
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "org_members_read_relationship_scores" ON public.linkedin_import_relationship_scores;
CREATE POLICY "org_members_read_relationship_scores" ON public.linkedin_import_relationship_scores
  FOR SELECT USING (org_id IN (
    SELECT om.org_id FROM public.organization_memberships om WHERE om.user_id = auth.uid()
  ));
