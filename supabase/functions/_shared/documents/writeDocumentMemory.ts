/**
 * DOC-005: Write a deal_memory_events entry when a document is sent.
 *
 * Non-blocking — errors are logged but never thrown.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

export async function writeDocumentMemory(
  orgId: string,
  dealId: string | null,
  contactId: string | null,
  documentType: string,
  sectionCount: number,
  recipientName: string | null,
  supabase: SupabaseClient
): Promise<void> {
  try {
    if (!dealId) {
      console.warn('[writeDocumentMemory] No dealId provided, skipping memory write');
      return;
    }

    const recipient = recipientName || 'prospect';
    const summary = `${documentType} sent to ${recipient} (${sectionCount} sections)`;

    const { error } = await supabase
      .from('deal_memory_events')
      .insert({
        org_id: orgId,
        deal_id: dealId,
        event_type: 'document_sent',
        event_category: 'timeline',
        source_type: 'agent_inference',
        source_timestamp: new Date().toISOString(),
        summary,
        detail: {
          document_type: documentType,
          section_count: sectionCount,
          recipient,
          sent_at: new Date().toISOString(),
        },
        confidence: 0.95,
        salience: 'high',
        is_active: true,
        contact_ids: contactId ? [contactId] : [],
        extracted_by: 'document-intelligence',
        credit_cost: 0,
      });

    if (error) {
      console.error('[writeDocumentMemory] Failed to insert deal_memory_events:', error.message);
    } else {
      console.log(`[writeDocumentMemory] Recorded ${documentType} sent to ${recipient}`);
    }
  } catch (err) {
    console.error('[writeDocumentMemory] Unexpected error:', (err as Error).message);
  }
}
