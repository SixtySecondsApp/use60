-- Support Centre Schema
-- Creates support_tickets and support_messages tables with RLS

-- =====================================================
-- Enums
-- =====================================================

DO $$ BEGIN CREATE TYPE support_ticket_category AS ENUM ('bug','feature_request','billing','how_to','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE support_ticket_priority AS ENUM ('low','medium','high','urgent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE support_ticket_status AS ENUM ('open','in_progress','waiting_on_customer','resolved','closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE support_message_sender_type AS ENUM ('user','agent','system'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================
-- Tables
-- =====================================================

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category support_ticket_category NOT NULL DEFAULT 'other',
  priority support_ticket_priority NOT NULL DEFAULT 'medium',
  status support_ticket_status NOT NULL DEFAULT 'open',
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_type support_message_sender_type NOT NULL DEFAULT 'user',
  content TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS support_tickets_org_id_idx ON public.support_tickets(org_id);
CREATE INDEX IF NOT EXISTS support_tickets_user_id_idx ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS support_tickets_created_at_idx ON public.support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS support_messages_ticket_id_idx ON public.support_messages(ticket_id);

-- =====================================================
-- Auto-update updated_at trigger
-- =====================================================

CREATE OR REPLACE FUNCTION public.set_support_ticket_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_support_ticket_updated_at();

-- =====================================================
-- Row Level Security
-- =====================================================

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Support tickets policies

-- Users can see their own tickets
DROP POLICY IF EXISTS "support_tickets_user_select" ON public.support_tickets;
CREATE POLICY "support_tickets_user_select"
  ON public.support_tickets
  FOR SELECT
  USING (user_id = auth.uid());

-- Org admins can see all tickets in their org
DROP POLICY IF EXISTS "support_tickets_org_admin_select" ON public.support_tickets;
CREATE POLICY "support_tickets_org_admin_select"
  ON public.support_tickets
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Users can insert their own tickets
DROP POLICY IF EXISTS "support_tickets_user_insert" ON public.support_tickets;
CREATE POLICY "support_tickets_user_insert"
  ON public.support_tickets
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own open tickets
DROP POLICY IF EXISTS "support_tickets_user_update" ON public.support_tickets;
CREATE POLICY "support_tickets_user_update"
  ON public.support_tickets
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Org admins can update any ticket in their org
DROP POLICY IF EXISTS "support_tickets_org_admin_update" ON public.support_tickets;
CREATE POLICY "support_tickets_org_admin_update"
  ON public.support_tickets
  FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Support messages policies

-- Users can see messages on their tickets
DROP POLICY IF EXISTS "support_messages_user_select" ON public.support_messages;
CREATE POLICY "support_messages_user_select"
  ON public.support_messages
  FOR SELECT
  USING (
    ticket_id IN (
      SELECT id FROM public.support_tickets WHERE user_id = auth.uid()
    )
  );

-- Org admins can see all messages in their org's tickets
DROP POLICY IF EXISTS "support_messages_org_admin_select" ON public.support_messages;
CREATE POLICY "support_messages_org_admin_select"
  ON public.support_messages
  FOR SELECT
  USING (
    ticket_id IN (
      SELECT st.id FROM public.support_tickets st
      JOIN public.organization_memberships om ON om.org_id = st.org_id
      WHERE om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- Users can insert messages on their tickets
DROP POLICY IF EXISTS "support_messages_user_insert" ON public.support_messages;
CREATE POLICY "support_messages_user_insert"
  ON public.support_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND ticket_id IN (
      SELECT id FROM public.support_tickets WHERE user_id = auth.uid()
    )
  );

-- Org admins can insert messages on any org ticket (as agent)
DROP POLICY IF EXISTS "support_messages_org_admin_insert" ON public.support_messages;
CREATE POLICY "support_messages_org_admin_insert"
  ON public.support_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND ticket_id IN (
      SELECT st.id FROM public.support_tickets st
      JOIN public.organization_memberships om ON om.org_id = st.org_id
      WHERE om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );
