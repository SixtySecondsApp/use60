/**
 * StakeholderMapPanel
 *
 * Panel in the deal sheet showing the buying committee members.
 * - List view: all stakeholders with role, influence, engagement badges
 * - Org chart view: visual bubble layout
 * - Add stakeholder from deal contacts
 * - Per-stakeholder inline role/influence pickers
 * Part of PRD-121: Stakeholder Mapping (STAKE-002, STAKE-003, STAKE-006)
 */

import React, { useState, useCallback } from 'react';
import {
  Users,
  Plus,
  RefreshCw,
  Loader2,
  LayoutList,
  Network,
  X,
  AlertTriangle,
  Bot,
  Eye,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStakeholders } from '@/lib/hooks/useStakeholders';
import { RolePicker, InfluencePicker } from './StakeholderRolePicker';
import { StakeholderOrgChart } from './StakeholderOrgChart';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import {
  ROLE_LABELS,
  ENGAGEMENT_LABELS,
  ENGAGEMENT_COLORS,
  INFLUENCE_COLORS,
  type DealStakeholderWithContact,
  type StakeholderRole,
  type StakeholderInfluence,
} from '@/lib/types/stakeholder';

interface StakeholderMapPanelProps {
  dealId: string;
  orgId: string;
  className?: string;
}

type ViewMode = 'list' | 'chart';

// ============================================================================
// Contact search for adding new stakeholders
// ============================================================================

interface ContactResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  title: string | null;
  company: string | null;
}

function getContactName(c: ContactResult | DealStakeholderWithContact['contact']): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unknown';
}

function getInitials(c: ContactResult | DealStakeholderWithContact['contact']): string {
  return ((c.first_name?.[0] || '') + (c.last_name?.[0] || '')).toUpperCase() || '?';
}

// ============================================================================
// Engagement status dot
// ============================================================================

const ENGAGEMENT_DOT: Record<string, string> = {
  active: 'bg-emerald-500',
  warming: 'bg-amber-500',
  cold: 'bg-blue-500',
  unknown: 'bg-gray-400',
};

// ============================================================================
// Component
// ============================================================================

export function StakeholderMapPanel({ dealId, orgId, className }: StakeholderMapPanelProps) {
  const {
    stakeholders,
    loading,
    error,
    addStakeholder,
    updateStakeholder,
    removeStakeholder,
    recalculateEngagement,
    committeeSize,
  } = useStakeholders(dealId);

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedStakeholderId, setSelectedStakeholderId] = useState<string | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<ContactResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // Search for contacts to add
  const handleContactSearch = useCallback(
    async (query: string) => {
      setContactSearch(query);
      if (query.trim().length < 2) {
        setContactResults([]);
        return;
      }

      setSearching(true);
      try {
        const { data } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, email, title, company')
          .eq('owner_id', orgId)
          .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
          .limit(8);

        // Filter out already-added contacts
        const existingIds = new Set(stakeholders.map((s) => s.contact_id));
        setContactResults((data || []).filter((c: ContactResult) => !existingIds.has(c.id)));
      } catch {
        // Swallow search errors silently
      } finally {
        setSearching(false);
      }
    },
    [orgId, stakeholders],
  );

  const handleAddContact = useCallback(
    async (contact: ContactResult) => {
      setShowAddContact(false);
      setContactSearch('');
      setContactResults([]);
      await addStakeholder(contact.id);
    },
    [addStakeholder],
  );

  const handleRecalculate = useCallback(async () => {
    setRecalculating(true);
    await recalculateEngagement();
    setRecalculating(false);
  }, [recalculateEngagement]);

  const handleRoleChange = useCallback(
    async (stakeholderId: string, role: StakeholderRole) => {
      await updateStakeholder(stakeholderId, { role });
    },
    [updateStakeholder],
  );

  const handleInfluenceChange = useCallback(
    async (stakeholderId: string, influence: StakeholderInfluence) => {
      await updateStakeholder(stakeholderId, { influence });
    },
    [updateStakeholder],
  );

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Buying Committee</h3>
          {committeeSize > 0 && (
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
              {committeeSize}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* View toggle */}
          <div className="flex items-center rounded-md border divide-x overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={cn(
                'p-1.5 transition-colors',
                viewMode === 'list' ? 'bg-muted' : 'hover:bg-muted/50',
              )}
              title="List view"
            >
              <LayoutList className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('chart')}
              className={cn(
                'p-1.5 transition-colors',
                viewMode === 'chart' ? 'bg-muted' : 'hover:bg-muted/50',
              )}
              title="Org chart view"
            >
              <Network className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Recalculate engagement */}
          <button
            type="button"
            onClick={handleRecalculate}
            disabled={recalculating}
            className="p-1.5 hover:bg-muted/70 rounded-md transition-colors"
            title="Recalculate engagement"
          >
            {recalculating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Add stakeholder */}
          <button
            type="button"
            onClick={() => setShowAddContact((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
      </div>

      {/* Add contact search */}
      {showAddContact && (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={contactSearch}
              onChange={(e) => handleContactSearch(e.target.value)}
              placeholder="Search contacts by name or email..."
              className="flex-1 text-sm border rounded px-2 py-1.5 bg-background"
              autoFocus
            />
            <button
              type="button"
              onClick={() => {
                setShowAddContact(false);
                setContactSearch('');
                setContactResults([]);
              }}
              className="p-1 hover:bg-muted rounded"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {searching && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Searching...
            </div>
          )}

          {contactResults.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {contactResults.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => handleAddContact(contact)}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded hover:bg-muted/70 transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium flex-shrink-0">
                    {getInitials(contact)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{getContactName(contact)}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {contact.title || contact.email || ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {contactSearch.length >= 2 && !searching && contactResults.length === 0 && (
            <p className="text-xs text-muted-foreground px-1">No contacts found</p>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Empty state */}
      {stakeholders.length === 0 && !showAddContact && (
        <div className="text-center py-8 border border-dashed rounded-lg">
          <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium text-muted-foreground">No stakeholders mapped yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1 max-w-[240px] mx-auto">
            Add contacts to track your buying committee — economic buyers, champions, evaluators, and more.
          </p>
          <button
            type="button"
            onClick={() => setShowAddContact(true)}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add first stakeholder
          </button>
        </div>
      )}

      {/* Org chart view */}
      {viewMode === 'chart' && stakeholders.length > 0 && (
        <StakeholderOrgChart
          stakeholders={stakeholders}
          onSelectStakeholder={(s) =>
            setSelectedStakeholderId((prev) => (prev === s.id ? null : s.id))
          }
          selectedId={selectedStakeholderId}
        />
      )}

      {/* List view */}
      {viewMode === 'list' && stakeholders.length > 0 && (
        <div className="space-y-2">
          {stakeholders.map((stakeholder) => (
            <StakeholderRow
              key={stakeholder.id}
              stakeholder={stakeholder}
              isSelected={selectedStakeholderId === stakeholder.id}
              onSelect={() =>
                setSelectedStakeholderId((prev) => (prev === stakeholder.id ? null : stakeholder.id))
              }
              onRoleChange={(role) => handleRoleChange(stakeholder.id, role)}
              onInfluenceChange={(influence) => handleInfluenceChange(stakeholder.id, influence)}
              onRemove={() => removeStakeholder(stakeholder.id)}
            />
          ))}
        </div>
      )}

      {/* Needs review banner */}
      {stakeholders.some((s) => s.needs_review) && (
        <div className="flex items-start gap-2 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-lg p-3">
          <Eye className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>
            {stakeholders.filter((s) => s.needs_review).length} stakeholder(s) were auto-detected with
            low confidence and need role review.
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// StakeholderRow
// ============================================================================

interface StakeholderRowProps {
  stakeholder: DealStakeholderWithContact;
  isSelected: boolean;
  onSelect: () => void;
  onRoleChange: (role: StakeholderRole) => void;
  onInfluenceChange: (influence: StakeholderInfluence) => void;
  onRemove: () => void;
}

function StakeholderRow({
  stakeholder,
  isSelected,
  onSelect,
  onRoleChange,
  onInfluenceChange,
  onRemove,
}: StakeholderRowProps) {
  const name = getContactName(stakeholder.contact);
  const initials = getInitials(stakeholder.contact);
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        isSelected ? 'border-primary/40 bg-primary/5' : 'hover:bg-muted/40',
      )}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <button type="button" onClick={onSelect} className="flex-shrink-0">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold relative">
            {initials}
            {/* Engagement dot */}
            <span
              className={cn(
                'absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background',
                ENGAGEMENT_DOT[stakeholder.engagement_status],
              )}
            />
          </div>
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium truncate">{name}</p>
            {stakeholder.auto_detected && (
              <span title="Auto-detected by AI">
                <Bot className="h-3 w-3 text-muted-foreground/60" />
              </span>
            )}
            {stakeholder.needs_review && (
              <span title="Low confidence — needs review">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
              </span>
            )}
          </div>
          {stakeholder.contact.title && (
            <p className="text-xs text-muted-foreground truncate">{stakeholder.contact.title}</p>
          )}

          {/* Pickers */}
          <div className="flex items-center flex-wrap gap-2 mt-2">
            <RolePicker value={stakeholder.role} onChange={onRoleChange} />
            <InfluencePicker value={stakeholder.influence} onChange={onInfluenceChange} />
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                ENGAGEMENT_COLORS[stakeholder.engagement_status],
              )}
            >
              {ENGAGEMENT_LABELS[stakeholder.engagement_status]}
            </span>
          </div>

          {/* Engagement details */}
          {isSelected && (
            <div className="mt-2 pt-2 border-t grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              <div>
                <p className="font-medium">Last contact</p>
                <p>
                  {stakeholder.days_since_last_contact !== null
                    ? `${stakeholder.days_since_last_contact}d ago`
                    : 'Never'}
                </p>
              </div>
              <div>
                <p className="font-medium">Meetings</p>
                <p>{stakeholder.meeting_count}</p>
              </div>
              <div>
                <p className="font-medium">Emails</p>
                <p>{stakeholder.email_count}</p>
              </div>
              {stakeholder.notes && (
                <div className="col-span-3">
                  <p className="font-medium">Notes</p>
                  <p className="text-foreground/80">{stakeholder.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Remove */}
        <div className="flex-shrink-0">
          {confirmRemove ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onRemove}
                className="text-xs text-destructive hover:underline"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                className="text-xs text-muted-foreground hover:underline ml-1"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="p-1 hover:bg-muted rounded text-muted-foreground/60 hover:text-destructive transition-colors"
              title="Remove stakeholder"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
