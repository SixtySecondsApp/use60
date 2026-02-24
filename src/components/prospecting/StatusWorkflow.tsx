import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useUpdateICPProfile } from '@/lib/hooks/useICPProfilesCRUD';
import type { ICPStatus } from '@/lib/types/prospecting';

// ---------------------------------------------------------------------------
// Allowed Transitions
// ---------------------------------------------------------------------------

const TRANSITIONS: Record<ICPStatus, { label: string; target: ICPStatus }[]> = {
  draft: [
    { label: 'Start Testing', target: 'testing' },
  ],
  testing: [
    { label: 'Submit for Approval', target: 'pending_approval' },
    { label: 'Back to Draft', target: 'draft' },
  ],
  pending_approval: [
    { label: 'Approve', target: 'approved' },
    { label: 'Send Back to Testing', target: 'testing' },
  ],
  approved: [
    { label: 'Activate', target: 'active' },
    { label: 'Retest', target: 'testing' },
  ],
  active: [
    { label: 'Archive', target: 'archived' },
    { label: 'Retest', target: 'testing' },
  ],
  archived: [
    { label: 'Reactivate to Draft', target: 'draft' },
  ],
};

// ---------------------------------------------------------------------------
// Status Badge Config
// ---------------------------------------------------------------------------

const STATUS_DISPLAY: Record<ICPStatus, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  testing: { label: 'Testing', variant: 'default' },
  pending_approval: { label: 'Pending Approval', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  active: { label: 'Active', variant: 'success' },
  archived: { label: 'Archived', variant: 'outline' },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StatusWorkflowProps {
  profileId: string;
  currentStatus: ICPStatus;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatusWorkflow({ profileId, currentStatus }: StatusWorkflowProps) {
  const updateProfile = useUpdateICPProfile();
  const transitions = TRANSITIONS[currentStatus] ?? [];
  const display = STATUS_DISPLAY[currentStatus] ?? STATUS_DISPLAY.draft;

  const handleTransition = (target: ICPStatus) => {
    updateProfile.mutate({
      id: profileId,
      payload: { status: target },
    });
  };

  if (transitions.length === 0) {
    return <Badge variant={display.variant}>{display.label}</Badge>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto p-0 hover:bg-transparent">
          <Badge variant={display.variant} className="cursor-pointer">
            {display.label}
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {transitions.map((t) => (
          <DropdownMenuItem
            key={t.target}
            onClick={() => handleTransition(t.target)}
            disabled={updateProfile.isPending}
          >
            <ArrowRight className="mr-2 h-3.5 w-3.5" />
            {t.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
