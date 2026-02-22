/**
 * ContactRelationshipCard Component (KNW-004)
 *
 * Shows a contact's known connections from the contact_graph table.
 * Displays relationship type badges, strength bars, and last interaction date.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Briefcase, ArrowRightLeft, UserPlus, Link } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrgId } from '@/lib/stores/orgStore';

interface ContactRelationshipCardProps {
  contactId: string;
  limit?: number;
}

interface ConnectionEdge {
  edge_id: string;
  connected_contact_id: string;
  relationship_type: string;
  shared_company: string | null;
  interaction_count: number;
  relationship_strength: number;
  last_interaction_at: string | null;
  discovery_source: string;
}

interface ContactInfo {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company_name: string | null;
  title: string | null;
}

function relationshipLabel(type: string): string {
  const labels: Record<string, string> = {
    colleague: 'Colleague',
    former_colleague: 'Former Colleague',
    manager: 'Manager',
    report: 'Report',
    partner: 'Partner',
    referral: 'Referral',
    unknown: 'Connection',
  };
  return labels[type] || 'Connection';
}

function relationshipBadgeVariant(type: string): 'default' | 'secondary' | 'outline' {
  if (type === 'colleague' || type === 'former_colleague') return 'default';
  if (type === 'referral' || type === 'partner') return 'secondary';
  return 'outline';
}

function strengthColor(strength: number): string {
  if (strength >= 70) return 'bg-emerald-500';
  if (strength >= 40) return 'bg-amber-500';
  return 'bg-gray-400';
}

export function ContactRelationshipCard({ contactId, limit = 10 }: ContactRelationshipCardProps) {
  const orgId = useActiveOrgId();

  const { data: connections, isLoading } = useQuery({
    queryKey: ['contact-connections', contactId, orgId],
    queryFn: async () => {
      if (!orgId) return [];

      const { data, error } = await supabase.rpc('get_contact_connections', {
        p_org_id: orgId,
        p_contact_id: contactId,
        p_limit: limit,
      });

      if (error) throw error;
      const edges = (data || []) as ConnectionEdge[];

      // Batch-fetch contact details
      const contactIds = edges.map(e => e.connected_contact_id).filter(Boolean);
      if (contactIds.length === 0) return [];

      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, company_name, title')
        .in('id', contactIds);

      const contactMap = new Map((contacts || []).map(c => [c.id, c as ContactInfo]));

      return edges.map(e => ({
        ...e,
        contact: contactMap.get(e.connected_contact_id) || null,
      }));
    },
    enabled: !!contactId && !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !connections?.length) return null;

  return (
    <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl border-white/20 dark:border-white/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          Relationships ({connections.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {connections.map((conn) => {
          const contact = conn.contact;
          const name = contact
            ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email || 'Unknown'
            : 'Unknown contact';

          return (
            <div key={conn.edge_id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-medium shrink-0">
                {name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{name}</span>
                  <Badge variant={relationshipBadgeVariant(conn.relationship_type)} className="text-[10px] px-1.5 py-0">
                    {relationshipLabel(conn.relationship_type)}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {contact?.title && (
                    <span className="text-xs text-muted-foreground truncate">{contact.title}</span>
                  )}
                  {conn.shared_company && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Briefcase className="h-3 w-3" />
                      {conn.shared_company}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  {/* Strength bar */}
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-16 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${strengthColor(conn.relationship_strength)}`}
                        style={{ width: `${Math.min(100, conn.relationship_strength)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{Math.round(conn.relationship_strength)}</span>
                  </div>
                  {conn.interaction_count > 0 && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <ArrowRightLeft className="h-3 w-3" />
                      {conn.interaction_count} interactions
                    </span>
                  )}
                  {conn.last_interaction_at && (
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(conn.last_interaction_at), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
