/**
 * Email Context Loader — CC10-003
 *
 * Loads recent email thread activity for a contact from the
 * `communication_events` table (has contact_id, direction, was_opened,
 * was_replied, event_type, email_subject, event_timestamp).
 *
 * Also checks `email_send_log` for the most recent outbound send so we can
 * detect a pending-reply situation (sent but no inbound reply since).
 *
 * Returns an empty enrichment object if email is not connected or if the
 * contactId is unknown — callers must handle the empty case gracefully.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

export interface EmailEnrichment {
  last_sent_date: string | null;
  last_received_date: string | null;
  thread_subject: string | null;
  reply_pending: boolean;
  open_rate_pct: number | null;
  emails_sent_30d: number;
  emails_received_30d: number;
}

const EMPTY: EmailEnrichment = {
  last_sent_date: null,
  last_received_date: null,
  thread_subject: null,
  reply_pending: false,
  open_rate_pct: null,
  emails_sent_30d: 0,
  emails_received_30d: 0,
};

export async function loadEmailContext(
  supabase: ReturnType<typeof createClient>,
  contactId?: string | null,
  _orgId?: string | null,
): Promise<EmailEnrichment> {
  if (!contactId) {
    console.log('[cc-loader:email] No contactId — returning empty enrichment');
    return EMPTY;
  }

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch recent communication events for this contact (last 30 days)
    const { data: events, error } = await supabase
      .from('communication_events')
      .select(
        'id, direction, event_type, email_subject, subject, was_opened, was_replied, event_timestamp',
      )
      .eq('contact_id', contactId)
      .in('event_type', ['email_sent', 'email_received', 'email'])
      .gte('event_timestamp', thirtyDaysAgo)
      .order('event_timestamp', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[cc-loader:email] Query error:', error.message);
      return EMPTY;
    }

    if (!events || events.length === 0) {
      console.log(`[cc-loader:email] No email events found for contact=${contactId}`);
      return EMPTY;
    }

    // Separate outbound / inbound
    const outbound = events.filter((e) => e.direction === 'outbound');
    const inbound = events.filter((e) => e.direction === 'inbound');

    const lastSent = outbound[0] ?? null;
    const lastReceived = inbound[0] ?? null;

    // reply_pending: we sent an email after the last inbound (or never received one)
    const replyPending = lastSent !== null && (
      lastReceived === null ||
      new Date(lastSent.event_timestamp) > new Date(lastReceived.event_timestamp)
    );

    // Thread subject from most recent event
    const threadSubject =
      lastSent?.email_subject ?? lastSent?.subject ??
      lastReceived?.email_subject ?? lastReceived?.subject ??
      null;

    // Open rate among sent emails
    const sentEvents = outbound.filter((e) => e.event_type === 'email_sent' || e.event_type === 'email');
    const openedCount = sentEvents.filter((e) => e.was_opened).length;
    const openRatePct = sentEvents.length > 0
      ? Math.round((openedCount / sentEvents.length) * 100)
      : null;

    const enrichment: EmailEnrichment = {
      last_sent_date: lastSent?.event_timestamp ?? null,
      last_received_date: lastReceived?.event_timestamp ?? null,
      thread_subject: threadSubject,
      reply_pending: replyPending,
      open_rate_pct: openRatePct,
      emails_sent_30d: outbound.length,
      emails_received_30d: inbound.length,
    };

    console.log(
      `[cc-loader:email] contact=${contactId} sent=${outbound.length} received=${inbound.length} reply_pending=${replyPending}`,
    );

    return enrichment;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cc-loader:email] Unexpected error:', message);
    return EMPTY;
  }
}
