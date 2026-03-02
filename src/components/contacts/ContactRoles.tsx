/**
 * ContactRoles Component (REL-011)
 *
 * Shows a contact's role in each open deal they are linked to via deal_contacts.
 * Lets the rep manually override the inferred role using an inline dropdown.
 * On save: upserts deal_contacts with inferred_from='manual', confidence=1.0.
 * On remove: deletes the deal_contacts row for that deal.
 *
 * Manual overrides (inferred_from='manual') are never overwritten by the
 * inference pipeline (REL-003/REL-004) because those agents skip rows where
 * inferred_from='manual'.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Briefcase, ChevronDown, Loader2, ShieldCheck, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DealRole =
  | 'champion'
  | 'blocker'
  | 'economic_buyer'
  | 'influencer'
  | 'end_user'
  | 'technical_evaluator';

const ROLE_OPTIONS: Array<{ value: DealRole; label: string }> = [
  { value: 'champion',            label: 'Champion' },
  { value: 'blocker',             label: 'Blocker' },
  { value: 'economic_buyer',      label: 'Economic Buyer' },
  { value: 'influencer',          label: 'Influencer' },
  { value: 'end_user',            label: 'End User' },
  { value: 'technical_evaluator', label: 'Technical Evaluator' },
];

interface DealRoleEntry {
  deal_id: string;
  deal_name: string;
  role: DealRole;
  confidence: number;
  inferred_from: 'transcript' | 'email_pattern' | 'manual' | 'enrichment';
  last_active: string;
}

interface ContactRolesProps {
  contactId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roleLabel(role: DealRole): string {
  return ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}

function roleBadgeClass(role: DealRole): string {
  switch (role) {
    case 'champion':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'blocker':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'economic_buyer':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'influencer':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'end_user':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'technical_evaluator':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
}

function confidenceLabel(confidence: number, inferred_from: string): string {
  if (inferred_from === 'manual') return 'Manual';
  const pct = Math.round(confidence * 100);
  return `${pct}% confidence`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContactRoles({ contactId }: ContactRolesProps) {
  const queryClient = useQueryClient();

  // Track which deal row is currently open for editing
  const [editingDealId, setEditingDealId] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // Query: fetch deal roles for this contact via the existing RPC
  // ------------------------------------------------------------------
  const {
    data: roleEntries = [],
    isLoading,
    error,
  } = useQuery<DealRoleEntry[]>({
    queryKey: ['contact-deal-roles', contactId],
    queryFn: async () => {
      const { data, error: rpcError } = await supabase.rpc(
        'get_cross_deal_stakeholders',
        { p_contact_id: contactId }
      );

      if (rpcError) throw rpcError;

      // RPC returns [{ contact_id, contact_name, deals: [...] }]
      if (!data || data.length === 0) return [];

      const row = data[0] as {
        contact_id: string;
        contact_name: string;
        deals: DealRoleEntry[];
      };

      return Array.isArray(row.deals) ? row.deals : [];
    },
    enabled: !!contactId,
    staleTime: 30_000,
  });

  // ------------------------------------------------------------------
  // Mutation: upsert role (manual override)
  // ------------------------------------------------------------------
  const upsertRole = useMutation({
    mutationFn: async ({
      dealId,
      role,
    }: {
      dealId: string;
      role: DealRole;
    }) => {
      const { error: rpcError } = await supabase.rpc(
        'upsert_deal_contact_manual',
        {
          p_deal_id:    dealId,
          p_contact_id: contactId,
          p_role:       role,
        }
      );
      if (rpcError) throw rpcError;
    },
    onMutate: async ({ dealId, role }) => {
      // Optimistic update
      await queryClient.cancelQueries({
        queryKey: ['contact-deal-roles', contactId],
      });
      const previous = queryClient.getQueryData<DealRoleEntry[]>([
        'contact-deal-roles',
        contactId,
      ]);
      queryClient.setQueryData<DealRoleEntry[]>(
        ['contact-deal-roles', contactId],
        (old = []) =>
          old.map((entry) =>
            entry.deal_id === dealId
              ? { ...entry, role, confidence: 1.0, inferred_from: 'manual' }
              : entry
          )
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ['contact-deal-roles', contactId],
          context.previous
        );
      }
      toast.error(
        `Failed to update role: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    },
    onSuccess: (_data, { role }) => {
      toast.success(`Role updated to ${roleLabel(role)}`);
      setEditingDealId(null);
      queryClient.invalidateQueries({
        queryKey: ['contact-deal-roles', contactId],
      });
    },
  });

  // ------------------------------------------------------------------
  // Mutation: remove role (delete deal_contacts row)
  // ------------------------------------------------------------------
  const removeRole = useMutation({
    mutationFn: async ({ dealId }: { dealId: string }) => {
      const { error: rpcError } = await supabase.rpc(
        'delete_deal_contact_manual',
        {
          p_deal_id:    dealId,
          p_contact_id: contactId,
        }
      );
      if (rpcError) throw rpcError;
    },
    onMutate: async ({ dealId }) => {
      await queryClient.cancelQueries({
        queryKey: ['contact-deal-roles', contactId],
      });
      const previous = queryClient.getQueryData<DealRoleEntry[]>([
        'contact-deal-roles',
        contactId,
      ]);
      queryClient.setQueryData<DealRoleEntry[]>(
        ['contact-deal-roles', contactId],
        (old = []) => old.filter((entry) => entry.deal_id !== dealId)
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ['contact-deal-roles', contactId],
          context.previous
        );
      }
      toast.error(
        `Failed to remove role: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    },
    onSuccess: () => {
      toast.success('Role removed from deal');
      setEditingDealId(null);
      queryClient.invalidateQueries({
        queryKey: ['contact-deal-roles', contactId],
      });
    },
  });

  // ------------------------------------------------------------------
  // Handle dropdown value change (role or "remove")
  // ------------------------------------------------------------------
  function handleRoleChange(dealId: string, value: string) {
    if (value === '__remove__') {
      removeRole.mutate({ dealId });
    } else {
      upsertRole.mutate({ dealId, role: value as DealRole });
    }
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (isLoading) {
    return (
      <Card className="section-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-blue-400" />
            Role in Deals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm theme-text-tertiary py-4 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading deal roles…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="section-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-blue-400" />
            Role in Deals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-400 py-2">
            Failed to load deal roles.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (roleEntries.length === 0) {
    return (
      <Card className="section-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-blue-400" />
            Role in Deals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 theme-text-tertiary">
            <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No deal roles assigned</p>
            <p className="text-xs mt-1">
              Roles are inferred from transcripts or set manually.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="section-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-blue-400" />
          Role in Deals
          <Badge
            variant="outline"
            className="ml-auto font-mono text-xs bg-gray-700 text-gray-200 border-gray-600"
          >
            {roleEntries.length}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {roleEntries.map((entry) => {
          const isBusy =
            (upsertRole.isPending &&
              (upsertRole.variables as any)?.dealId === entry.deal_id) ||
            (removeRole.isPending &&
              (removeRole.variables as any)?.dealId === entry.deal_id);

          const isEditing = editingDealId === entry.deal_id;

          return (
            <div
              key={entry.deal_id}
              className="p-3 rounded-lg bg-gray-100/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 space-y-2"
            >
              {/* Deal name */}
              <p className="text-sm font-medium theme-text-primary truncate">
                {entry.deal_name}
              </p>

              {/* Role badge + confidence + edit toggle */}
              <div className="flex items-center gap-2 flex-wrap">
                {isEditing ? (
                  /* Inline dropdown */
                  <Select
                    defaultValue={entry.role}
                    onValueChange={(value) => {
                      handleRoleChange(entry.deal_id, value);
                    }}
                    disabled={isBusy}
                  >
                    <SelectTrigger className="h-7 text-xs w-auto min-w-[160px] bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600">
                      {isBusy ? (
                        <span className="flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Saving…
                        </span>
                      ) : (
                        <SelectValue />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                      {/* Separator + remove option */}
                      <div className="my-1 h-px bg-gray-200 dark:bg-gray-700" />
                      <SelectItem
                        value="__remove__"
                        className="text-red-500 focus:text-red-500 focus:bg-red-500/10"
                      >
                        <span className="flex items-center gap-1">
                          <X className="w-3 h-3" />
                          Remove from deal
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  /* Role badge (clickable to open dropdown) */
                  <button
                    type="button"
                    onClick={() => setEditingDealId(entry.deal_id)}
                    className="group flex items-center gap-1"
                    title="Click to change role"
                  >
                    <Badge
                      className={`${roleBadgeClass(entry.role)} text-xs cursor-pointer group-hover:ring-1 group-hover:ring-white/30 transition-all`}
                    >
                      {roleLabel(entry.role)}
                      <ChevronDown className="w-3 h-3 ml-1 opacity-60 group-hover:opacity-100" />
                    </Badge>
                  </button>
                )}

                {/* Confidence / source badge */}
                <span className="text-xs theme-text-tertiary flex items-center gap-1">
                  {entry.inferred_from === 'manual' && (
                    <ShieldCheck className="w-3 h-3 text-blue-400" />
                  )}
                  {confidenceLabel(entry.confidence, entry.inferred_from)}
                </span>

                {/* Cancel edit button */}
                {isEditing && !isBusy && (
                  <button
                    type="button"
                    onClick={() => setEditingDealId(null)}
                    className="ml-auto text-xs theme-text-tertiary hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
