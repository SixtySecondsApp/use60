import { supabase } from '@/lib/supabase/clientV2';

export class BetterContactService {
  /**
   * Submit contacts for BetterContact enrichment (fire-and-forget)
   */
  static async submitEnrichment({
    tableId,
    columnId,
    rowIds,
    enrichEmail = true,
    enrichPhone = false,
    forceRefresh = false,
    skipCompleted = true,
  }: {
    tableId: string;
    columnId: string;
    rowIds?: string[];
    enrichEmail?: boolean;
    enrichPhone?: boolean;
    forceRefresh?: boolean;
    skipCompleted?: boolean;
  }) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await supabase.functions.invoke('bettercontact-enrich', {
      body: {
        action: 'submit',
        table_id: tableId,
        column_id: columnId,
        row_ids: rowIds,
        enrich_email_address: enrichEmail,
        enrich_phone_number: enrichPhone,
        force_refresh: forceRefresh,
        skip_completed: skipCompleted,
      },
    });

    if (response.error) throw new Error(response.error.message || 'Failed to submit enrichment');
    return response.data;
  }

  /**
   * Check enrichment status by request_id
   */
  static async checkStatus(requestId: string) {
    const response = await supabase.functions.invoke('bettercontact-enrich', {
      body: {
        action: 'status',
        request_id: requestId,
      },
    });

    if (response.error) throw new Error(response.error.message || 'Failed to check status');
    return response.data;
  }

  /**
   * Check BetterContact credit balance
   */
  static async checkCredits() {
    const response = await supabase.functions.invoke('bettercontact-enrich', {
      body: { action: 'credits' },
    });

    if (response.error) throw new Error(response.error.message || 'Failed to check credits');
    return response.data;
  }

  /**
   * Check if BetterContact is connected for the current org
   */
  static async isConnected(orgId: string): Promise<boolean> {
    const { data } = await (supabase as any)
      .from('integration_credentials')
      .select('id')
      .eq('organization_id', orgId)
      .eq('provider', 'bettercontact')
      .maybeSingle();

    return !!data;
  }
}
