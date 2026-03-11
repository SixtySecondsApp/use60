-- NOTIF-001: Remove duplicate in-app notification triggers for support tickets
--
-- Problem: Two sets of triggers fire on the same support_messages INSERT and
-- support_tickets UPDATE events:
--   1. 20260307000002 — notify_on_support_message / notify_on_support_status_change
--      These INSERT directly into the notifications table.
--   2. 20260307000003 — trigger_support_notification_on_message / trigger_support_notification_on_status_change
--      These call the support-ticket-notification edge function via pg_net HTTP POST,
--      which handles in-app notifications, email, and Slack.
--
-- Both firing causes DUPLICATE in-app notifications. We remove the direct-insert
-- triggers (set 1) and keep the edge function triggers (set 2) as the single
-- notification path.

-- Drop triggers first (before dropping the functions they reference)
DROP TRIGGER IF EXISTS trg_notify_on_support_message ON public.support_messages;
DROP TRIGGER IF EXISTS trg_notify_on_support_status_change ON public.support_tickets;

-- Drop the now-unused trigger functions
DROP FUNCTION IF EXISTS public.notify_on_support_message();
DROP FUNCTION IF EXISTS public.notify_on_support_status_change();
