-- Fix support RLS policies to use is_admin_optimized() instead of inline SELECT
-- from profiles table. The inline EXISTS subquery causes infinite recursion when
-- profiles itself has RLS policies that reference other tables.
-- is_admin_optimized() is a SECURITY DEFINER function that safely bypasses RLS.

BEGIN;

-- =====================================================
-- support_tickets — platform admin policies
-- =====================================================

-- SELECT: platform admins can see all tickets
DROP POLICY IF EXISTS "support_tickets_platform_admin_select" ON public.support_tickets;
CREATE POLICY "support_tickets_platform_admin_select"
ON public.support_tickets
FOR SELECT
USING (is_admin_optimized());

-- UPDATE: platform admins can update any ticket (assign, change status, etc.)
DROP POLICY IF EXISTS "support_tickets_platform_admin_update" ON public.support_tickets;
CREATE POLICY "support_tickets_platform_admin_update"
ON public.support_tickets
FOR UPDATE
USING (is_admin_optimized());

-- =====================================================
-- support_messages — platform admin policies
-- =====================================================

-- SELECT: platform admins can read all messages
DROP POLICY IF EXISTS "support_messages_platform_admin_select" ON public.support_messages;
CREATE POLICY "support_messages_platform_admin_select"
ON public.support_messages
FOR SELECT
USING (is_admin_optimized());

-- INSERT: platform admins can reply to any ticket (as agent)
-- Keep sender_id = auth.uid() to ensure admins can only insert messages as themselves
DROP POLICY IF EXISTS "support_messages_platform_admin_insert" ON public.support_messages;
CREATE POLICY "support_messages_platform_admin_insert"
ON public.support_messages
FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND is_admin_optimized()
);

COMMIT;
