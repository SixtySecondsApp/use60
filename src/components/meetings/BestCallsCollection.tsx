/**
 * BestCallsCollection
 *
 * LIB-006: "Best Calls" collection with manager curation.
 * - Collections: create named collections of recordings
 * - Add to collection from recording card menu
 * - Collection page with ordered recordings
 * - Manager-only create, team-visible browse
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Star,
  Plus,
  Folder,
  FolderOpen,
  Trash2,
  ChevronRight,
  Loader2,
  GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import type { UnifiedMeeting } from '@/lib/types/unifiedMeeting';

// ============================================================================
// Types
// ============================================================================

interface CallCollection {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  meeting_count?: number;
}

// ============================================================================
// Hook: useCallCollections
// ============================================================================

function useCallCollections() {
  const { activeOrgId } = useOrg();

  return useQuery<CallCollection[]>({
    queryKey: ['call-collections', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return [];
      const { data, error } = await supabase
        .from('call_collections')
        .select('id, org_id, name, description, created_by, created_at')
        .eq('org_id', activeOrgId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!activeOrgId,
    staleTime: 2 * 60 * 1000,
  });
}

// ============================================================================
// CreateCollectionDialog
// ============================================================================

interface CreateCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (collection: CallCollection) => void;
}

function CreateCollectionDialog({ open, onOpenChange, onCreated }: CreateCollectionDialogProps) {
  const { activeOrgId } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { mutate: create, isPending } = useMutation({
    mutationFn: async () => {
      if (!activeOrgId || !user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('call_collections')
        .insert({
          org_id: activeOrgId,
          name: name.trim(),
          description: description.trim() || null,
          created_by: user.id,
        })
        .select('id, org_id, name, description, created_by, created_at')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['call-collections', activeOrgId] });
      toast.success(`Collection "${data.name}" created`);
      onCreated?.(data);
      onOpenChange(false);
      setName('');
      setDescription('');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to create collection');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Star className="h-4 w-4 text-amber-500" />
            New collection
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Collection name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Best discovery calls"
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What makes these calls special?"
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!name.trim() || isPending}
            onClick={() => create()}
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// AddToCollectionMenu — shown from RecordingCard context menu
// ============================================================================

interface AddToCollectionMenuProps {
  meeting: UnifiedMeeting;
  children: React.ReactNode;
}

export function AddToCollectionMenu({ meeting, children }: AddToCollectionMenuProps) {
  const { activeOrgId } = useOrg();
  const qc = useQueryClient();
  const { data: collections = [] } = useCallCollections();
  const [showCreate, setShowCreate] = useState(false);

  async function addToCollection(collectionId: string, collectionName: string) {
    if (!activeOrgId) return;
    const { error } = await supabase
      .from('call_collection_items')
      .upsert(
        {
          collection_id: collectionId,
          meeting_id: meeting.sourceTable === 'meetings' ? meeting.id : null,
          recording_id: meeting.sourceTable === 'recordings' ? meeting.id : null,
          position: 999,
        },
        { onConflict: 'collection_id,meeting_id' },
      );

    if (error) {
      toast.error('Failed to add to collection');
    } else {
      toast.success(`Added to "${collectionName}"`);
      qc.invalidateQueries({ queryKey: ['call-collections', activeOrgId] });
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {collections.length === 0 ? (
            <DropdownMenuItem disabled className="text-xs text-gray-400">
              No collections yet
            </DropdownMenuItem>
          ) : (
            collections.map((col) => (
              <DropdownMenuItem
                key={col.id}
                className="text-xs"
                onClick={() => addToCollection(col.id, col.name)}
              >
                <Star className="h-3.5 w-3.5 mr-2 text-amber-500" />
                {col.name}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuItem className="text-xs text-blue-600 dark:text-blue-400" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5 mr-2" />
            New collection…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateCollectionDialog
        open={showCreate}
        onOpenChange={setShowCreate}
      />
    </>
  );
}

// ============================================================================
// BestCallsPanel — browseable panel for the library page sidebar
// ============================================================================

interface BestCallsPanelProps {
  onSelectCollection?: (id: string, name: string) => void;
  className?: string;
}

export function BestCallsPanel({ onSelectCollection, className }: BestCallsPanelProps) {
  const { activeOrgId } = useOrg();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { data: collections = [], isLoading } = useCallCollections();

  function handleSelect(col: CallCollection) {
    setActiveId(col.id);
    onSelectCollection?.(col.id, col.name);
  }

  async function deleteCollection(id: string, name: string) {
    const { error } = await supabase
      .from('call_collections')
      .delete()
      .eq('id', id);
    if (error) {
      toast.error('Failed to delete collection');
    } else {
      toast.success(`Deleted "${name}"`);
      if (activeId === id) setActiveId(null);
      qc.invalidateQueries({ queryKey: ['call-collections', activeOrgId] });
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <Star className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Best Calls</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setShowCreate(true)}
          title="New collection"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        </div>
      ) : collections.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-600 text-center py-3">
          No collections yet.<br />
          <button
            onClick={() => setShowCreate(true)}
            className="text-blue-500 hover:text-blue-600 mt-0.5"
          >
            Create one
          </button>
        </p>
      ) : (
        <ul className="space-y-0.5">
          {collections.map((col) => (
            <li key={col.id}>
              <div
                className={cn(
                  'group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors',
                  activeId === col.id
                    ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800/60 text-gray-700 dark:text-gray-300',
                )}
                onClick={() => handleSelect(col)}
              >
                {activeId === col.id
                  ? <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
                  : <Folder className="h-3.5 w-3.5 flex-shrink-0" />
                }
                <span className="text-xs flex-1 truncate">{col.name}</span>
                <ChevronRight className="h-3 w-3 opacity-40 group-hover:opacity-100 transition-opacity" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCollection(col.id, col.name);
                  }}
                  className="hidden group-hover:flex items-center justify-center h-5 w-5 rounded hover:bg-red-100 dark:hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateCollectionDialog
        open={showCreate}
        onOpenChange={setShowCreate}
      />
    </div>
  );
}
