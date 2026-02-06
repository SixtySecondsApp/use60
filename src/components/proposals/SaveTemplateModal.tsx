import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, BookTemplate } from 'lucide-react';
import { saveAsTemplate } from '@/lib/services/proposalService';
import { toast } from 'sonner';

interface SaveTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string;
  orgId: string;
  defaultName?: string;
}

export default function SaveTemplateModal({
  open,
  onOpenChange,
  proposalId,
  orgId,
  defaultName,
}: SaveTemplateModalProps) {
  const [name, setName] = useState(defaultName || '');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Template name is required');
      return;
    }

    setSaving(true);
    try {
      await saveAsTemplate(proposalId, name.trim(), description.trim(), orgId);
      toast.success('Template saved successfully');
      onOpenChange(false);
      setName('');
      setDescription('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save template';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookTemplate className="w-5 h-5" />
            Save as Template
          </DialogTitle>
          <DialogDescription>
            Save this proposal structure as a reusable template for future proposals.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <Label htmlFor="template-name" className="text-sm font-medium">
              Template Name
            </Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Consulting Engagement"
              className="mt-1"
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="template-desc" className="text-sm font-medium">
              Description (optional)
            </Label>
            <Textarea
              id="template-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of when to use this template..."
              className="mt-1 h-20 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !name.trim()}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Template
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
