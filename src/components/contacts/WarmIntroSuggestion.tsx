/**
 * WarmIntroSuggestion Component (KNW-004)
 *
 * Shows warm introduction suggestions when contacts share company history
 * with a target prospect's domain. Used in prospecting and pre-meeting context.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserPlus, Building2, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrgId } from '@/lib/stores/orgStore';

interface WarmIntroSuggestionProps {
  targetDomain: string;
  limit?: number;
}

interface WarmIntro {
  contact_id: string;
  contact_company: string | null;
  contact_title: string | null;
  target_company: string | null;
  overlap_period: string;
  relationship_strength: number;
}

export function WarmIntroSuggestion({ targetDomain, limit = 5 }: WarmIntroSuggestionProps) {
  const orgId = useActiveOrgId();

  const { data: intros, isLoading } = useQuery({
    queryKey: ['warm-intros', targetDomain, orgId],
    queryFn: async () => {
      if (!orgId || !targetDomain) return [];

      const { data, error } = await supabase.rpc('find_warm_intros', {
        p_org_id: orgId,
        p_target_domain: targetDomain,
        p_limit: limit,
      });

      if (error) throw error;

      // Enrich with contact names
      const introsData = (data || []) as WarmIntro[];
      const contactIds = introsData.map(i => i.contact_id);
      if (contactIds.length === 0) return [];

      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email')
        .in('id', contactIds);

      const contactMap = new Map((contacts || []).map(c => [c.id, c]));

      return introsData.map(intro => ({
        ...intro,
        contact: contactMap.get(intro.contact_id),
      }));
    },
    enabled: !!orgId && !!targetDomain,
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading || !intros?.length) return null;

  return (
    <Card className="bg-gradient-to-br from-blue-50/80 to-purple-50/80 dark:from-blue-950/30 dark:to-purple-950/30 border-blue-200/50 dark:border-blue-800/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-blue-500" />
          Warm Introduction Paths
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {intros.map((intro) => {
          const contact = intro.contact;
          const name = contact
            ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email
            : 'Unknown';

          return (
            <div key={intro.contact_id} className="flex items-center gap-2 p-2 rounded-lg bg-white/60 dark:bg-gray-900/40">
              <div className="h-7 w-7 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-700 dark:text-blue-300 text-xs font-medium shrink-0">
                {(name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="font-medium truncate">{name}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground truncate">{intro.target_company || targetDomain}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {intro.contact_title && (
                    <span className="text-[10px] text-muted-foreground">{intro.contact_title}</span>
                  )}
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    <Building2 className="h-2.5 w-2.5 mr-0.5" />
                    {intro.overlap_period}
                  </Badge>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
