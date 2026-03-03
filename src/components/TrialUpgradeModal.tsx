// src/components/TrialUpgradeModal.tsx
// One-time modal shown on day 12 (2 days remaining) to prompt upgrade.
// Persisted via localStorage so it only shows once per org.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useOrgSubscription, useTrialProgress } from '@/lib/hooks/useSubscription';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';

// Show modal when exactly 2 days remain (day 12 of a 14-day trial)
const MODAL_TRIGGER_DAYS = 2;

function getStorageKey(orgId: string): string {
  return `sixty_trial_modal_shown_${orgId}`;
}

export function TrialUpgradeModal() {
  const { activeOrgId } = useOrg();
  const { isOrgAdmin } = useUserPermissions();
  const { data: subscription } = useOrgSubscription(activeOrgId);
  const { data: trialProgress } = useTrialProgress(activeOrgId);
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!activeOrgId || !isOrgAdmin) return;
    if (subscription?.status !== 'trialing') return;

    const daysRemaining = trialProgress?.daysRemaining ?? null;
    if (daysRemaining === null || daysRemaining > MODAL_TRIGGER_DAYS) return;

    // Check if already shown for this org
    const key = getStorageKey(activeOrgId);
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      // If storage unavailable, don't show to avoid repeat annoyance
      return;
    }

    setOpen(true);
  }, [activeOrgId, isOrgAdmin, subscription?.status, trialProgress?.daysRemaining]);

  const handleDismiss = () => {
    setOpen(false);
    if (activeOrgId) {
      try {
        localStorage.setItem(getStorageKey(activeOrgId), '1');
      } catch {
        // Ignore storage errors
      }
    }
  };

  const handleUpgrade = () => {
    handleDismiss();
    navigate('/settings/billing');
  };

  if (!open) return null;

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleDismiss(); }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <AlertDialogTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Your trial ends in 2 days
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-sm text-gray-600 dark:text-gray-400 space-y-3">
            <p>
              When your trial ends you will lose access to:
            </p>
            <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                AI-generated follow-ups and meeting prep
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                Automatic deal tracking and pipeline updates
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                Smart contact enrichment and lead intel
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                Calendar and email integrations
              </li>
            </ul>
            <p className="text-gray-500 dark:text-gray-500 text-xs">
              Upgrade now to keep your data and workflows intact.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex gap-2 sm:flex-row-reverse">
          <Button
            onClick={handleUpgrade}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            Upgrade Now
          </Button>
          <Button
            variant="outline"
            onClick={handleDismiss}
          >
            Remind Me Later
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default TrialUpgradeModal;
