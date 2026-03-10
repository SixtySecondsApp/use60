-- SUP-004: Add internal notes support to support_messages
-- Allows platform admins and org admins to leave internal notes
-- that are invisible to regular users.

BEGIN;

-- =====================================================
-- 1. Add is_internal column
-- =====================================================

ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.support_messages.is_internal
  IS 'When true, message is an internal note visible only to admins';

-- =====================================================
-- 2. Index for efficient filtering
-- =====================================================

CREATE INDEX IF NOT EXISTS support_messages_ticket_internal_idx
  ON public.support_messages(ticket_id, is_internal);

-- =====================================================
-- 3. Update user SELECT policy to exclude internal notes
-- =====================================================

DROP POLICY IF EXISTS "support_messages_user_select" ON public.support_messages;
CREATE POLICY "support_messages_user_select"
ON public.support_messages
FOR SELECT
USING (
  is_internal = false
  AND ticket_id IN (
    SELECT id FROM public.support_tickets WHERE user_id = auth.uid()
  )
);

-- Org admin and platform admin SELECT policies are left unchanged.
-- They already grant full access to all messages, including internal notes.

COMMIT;
