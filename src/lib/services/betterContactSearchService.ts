import { supabase } from '@/lib/supabase/clientV2';

export interface BetterContactSearchFilters {
  company_name?: string;
  company_domain?: string;
  job_title?: string;
  location?: string;
  limit?: number;
}

export class BetterContactSearchService {
  /**
   * Submit a lead search to BetterContact Lead Finder
   */
  static async submitSearch(filters: BetterContactSearchFilters) {
    const response = await supabase.functions.invoke('bettercontact-lead-finder', {
      body: { action: 'submit', filters },
    });

    if (response.error) throw new Error(response.error.message || 'Failed to submit search');
    return response.data as { request_id: string; message: string };
  }

  /**
   * Poll for lead search results
   */
  static async pollResults(requestId: string, autoCreateTable = true) {
    const response = await supabase.functions.invoke('bettercontact-lead-finder', {
      body: { action: 'poll', request_id: requestId, auto_create_table: autoCreateTable },
    });

    if (response.error) throw new Error(response.error.message || 'Failed to poll results');
    return response.data;
  }

  /**
   * Submit search and poll with exponential backoff until results are ready.
   * Returns the created table info.
   */
  static async searchAndCreateTable(
    filters: BetterContactSearchFilters,
    onStatusUpdate?: (status: string) => void
  ): Promise<{ table_id: string; table_name: string; row_count: number }> {
    // Submit
    const { request_id } = await this.submitSearch(filters);
    onStatusUpdate?.('Search submitted, waiting for results...');

    // Poll with exponential backoff: 2s, 5s, 10s, 20s, 30s (max)
    const delays = [2000, 5000, 10000, 20000, 30000];
    const maxAttempts = 20; // ~5 minutes total max

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const delay = delays[Math.min(attempt, delays.length - 1)];
      await new Promise(resolve => setTimeout(resolve, delay));

      const result = await this.pollResults(request_id);

      if (result.status === 'terminated') {
        return {
          table_id: result.table_id,
          table_name: result.table_name,
          row_count: result.row_count,
        };
      }

      onStatusUpdate?.(`Still processing (attempt ${attempt + 1})...`);
    }

    throw new Error('Lead search timed out. Check back later — results may still appear.');
  }
}
