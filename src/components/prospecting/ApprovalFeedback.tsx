import React, { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useUpdateICPProfile } from '@/lib/hooks/useICPProfilesCRUD';
import type { ICPProfile } from '@/lib/types/prospecting';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ApprovalFeedbackProps {
  profile: ICPProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApprovalFeedback({ profile, open, onOpenChange }: ApprovalFeedbackProps) {
  const [feedback, setFeedback] = useState('');
  const updateProfile = useUpdateICPProfile();

  const handleSubmit = () => {
    if (!profile || !feedback.trim()) return;

    updateProfile.mutate(
      {
        id: profile.id,
        payload: { status: 'testing' },
      },
      {
        onSuccess: () => {
          toast.success(`Changes requested for "${profile.name}". Profile moved back to Testing.`);
          setFeedback('');
          onOpenChange(false);
        },
      }
    );
  };

  const handleClose = () => {
    setFeedback('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-amber-500" />
            Request Changes
          </DialogTitle>
          <DialogDescription>
            Provide feedback for &quot;{profile?.name}&quot;. The profile will be moved back to
            Testing status so the team can make adjustments.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Describe what changes are needed..."
            rows={4}
            className="resize-none"
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!feedback.trim() || updateProfile.isPending}
            className="gap-2"
          >
            <MessageSquare className="h-4 w-4" />
            Submit Feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
