import { useState } from 'react';
import { Database, ArrowRight, Loader2, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';

interface CrmUpdatePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: any;
  onConfirmed: () => void;
}

interface FieldChange {
  field: string;
  label: string;
  currentValue: string;
  proposedValue: string;
}

export function CrmUpdatePreview({ open, onOpenChange, task, onConfirmed }: CrmUpdatePreviewProps) {
  const deliverable = task?.deliverable_data;
  const [confirming, setConfirming] = useState(false);

  // Extract field changes from deliverable data
  const changes: FieldChange[] = (deliverable?.changes || deliverable?.fields || []).map((change: any) => ({
    field: change.field || change.key,
    label: change.label || change.field || change.key,
    currentValue: change.current_value || change.from || 'Not set',
    proposedValue: change.proposed_value || change.to || change.value,
  }));

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const table = task.deal_id ? 'deals' : task.contact_id ? 'contacts' : null;
      const entityId = task.deal_id || task.contact_id;

      if (table && entityId && changes.length > 0) {
        const updates: Record<string, any> = {};
        changes.forEach(c => {
          updates[c.field] = c.proposedValue;
        });

        const { error } = await supabase
          .from(table)
          .update(updates)
          .eq('id', entityId);

        if (error) throw error;
      }

      toast.success(`Updated ${changes.length} field${changes.length !== 1 ? 's' : ''} in ${task.deal_id ? 'deal' : 'contact'}`);
      onConfirmed();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update CRM');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Confirm CRM Update
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {changes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No changes to apply</p>
          ) : (
            changes.map((change, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {change.label}
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground line-through">{change.currentValue}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium text-foreground">{change.proposedValue}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirming}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={confirming || changes.length === 0}>
            {confirming ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
            Confirm Updates
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
