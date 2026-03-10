import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';
import { toast } from 'sonner';

interface EnrichResult {
  total_processed: number;
  companies_linked: number;
  companies_created: number;
  categories_updated: number;
  personal_emails_skipped: number;
}

export function useContactEnrich() {
  const activeOrgId = useOrgStore((state) => state.activeOrgId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<EnrichResult> => {
      if (!activeOrgId) throw new Error('No active org');

      const { data, error } = await supabase.functions.invoke('contact-enrich-backfill', {
        body: { org_id: activeOrgId },
      });

      if (error) throw error;
      return data as EnrichResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['graph-data'] });

      const parts: string[] = [];
      if (result.companies_linked > 0) parts.push(`${result.companies_linked} companies linked`);
      if (result.companies_created > 0) parts.push(`${result.companies_created} new`);
      if (result.categories_updated > 0) parts.push(`${result.categories_updated} categories updated`);

      if (parts.length > 0) {
        toast.success(`Enriched contacts: ${parts.join(', ')}`);
      } else if (result.personal_emails_skipped > 0) {
        toast.info(`${result.personal_emails_skipped} contacts use personal emails (Gmail, etc.) — no company to infer`);
      } else {
        toast.info('All contacts already enriched');
      }
    },
    onError: (err) => {
      toast.error(`Enrichment failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
  });
}
