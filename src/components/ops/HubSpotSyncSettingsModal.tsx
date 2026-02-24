import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowDownToLine, ArrowLeftRight } from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

interface HubSpotSyncSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string;
  currentSourceQuery: Record<string, unknown> | null;
  onUpdated?: () => void;
}

export function HubSpotSyncSettingsModal({
  open,
  onOpenChange,
  tableId,
  currentSourceQuery,
  onUpdated,
}: HubSpotSyncSettingsModalProps) {
  const currentDirection = (currentSourceQuery?.sync_direction as string) || 'pull_only';
  const [syncDirection, setSyncDirection] = useState<'pull_only' | 'bidirectional'>(
    currentDirection === 'bidirectional' ? 'bidirectional' : 'pull_only',
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const dir = (currentSourceQuery?.sync_direction as string) || 'pull_only';
      setSyncDirection(dir === 'bidirectional' ? 'bidirectional' : 'pull_only');
    }
  }, [open, currentSourceQuery]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedSourceQuery = {
        ...(currentSourceQuery ?? {}),
        sync_direction: syncDirection,
      };

      const { error } = await supabase
        .from('dynamic_tables')
        .update({ source_query: updatedSourceQuery })
        .eq('id', tableId);

      if (error) throw error;

      toast.success(
        syncDirection === 'bidirectional'
          ? 'Bi-directional sync enabled — edits will write back to HubSpot'
          : 'Sync set to pull-only — edits stay local',
      );
      onUpdated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update sync settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>HubSpot Sync Settings</DialogTitle>
          <DialogDescription>
            Control how data flows between this table and HubSpot.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <button
            onClick={() => setSyncDirection('pull_only')}
            className={`w-full flex items-start gap-3 rounded-lg px-4 py-3 text-left transition-colors border ${
              syncDirection === 'pull_only'
                ? 'bg-orange-500/10 border-orange-500/30'
                : 'bg-gray-800/50 border-gray-700 hover:bg-gray-800'
            }`}
          >
            <ArrowDownToLine className={`w-5 h-5 mt-0.5 shrink-0 ${
              syncDirection === 'pull_only' ? 'text-orange-400' : 'text-gray-500'
            }`} />
            <div>
              <p className={`text-sm font-medium ${
                syncDirection === 'pull_only' ? 'text-orange-300' : 'text-gray-300'
              }`}>Pull only</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Sync pulls updates from HubSpot. Edits you make here stay local and don't write back.
              </p>
            </div>
          </button>

          <button
            onClick={() => setSyncDirection('bidirectional')}
            className={`w-full flex items-start gap-3 rounded-lg px-4 py-3 text-left transition-colors border ${
              syncDirection === 'bidirectional'
                ? 'bg-orange-500/10 border-orange-500/30'
                : 'bg-gray-800/50 border-gray-700 hover:bg-gray-800'
            }`}
          >
            <ArrowLeftRight className={`w-5 h-5 mt-0.5 shrink-0 ${
              syncDirection === 'bidirectional' ? 'text-orange-400' : 'text-gray-500'
            }`} />
            <div>
              <p className={`text-sm font-medium ${
                syncDirection === 'bidirectional' ? 'text-orange-300' : 'text-gray-300'
              }`}>Bi-directional</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Edits to HubSpot-linked columns write back to HubSpot instantly. Sync still pulls new data.
              </p>
            </div>
          </button>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || syncDirection === currentDirection}
            className="bg-orange-600 hover:bg-orange-500"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
