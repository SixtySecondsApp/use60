// src/components/TrialCountdownBadge.tsx
// Small badge shown in the top nav for org admins when trial has 4 or fewer days remaining.

import { Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useTrialProgress, useOrgSubscription } from '@/lib/hooks/useSubscription';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';

export function TrialCountdownBadge() {
  const { activeOrgId } = useOrg();
  const { isOrgAdmin } = useUserPermissions();
  const { data: subscription } = useOrgSubscription(activeOrgId);
  const { data: trialProgress } = useTrialProgress(activeOrgId);
  const navigate = useNavigate();

  // Only show for org admins
  if (!isOrgAdmin) return null;

  // Only show when trialing
  if (subscription?.status !== 'trialing') return null;

  // Only show from day 10 onwards (4 or fewer days remaining in a 14-day trial)
  const daysRemaining = trialProgress?.daysRemaining ?? null;
  if (daysRemaining === null || daysRemaining > 4) return null;

  // Color coding based on urgency
  const colorClass = cn(
    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors select-none',
    daysRemaining >= 3
      ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50'
      : daysRemaining >= 1
        ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50'
        : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
  );

  const label =
    daysRemaining === 0
      ? 'Trial ends today'
      : daysRemaining === 1
        ? '1 day left'
        : `${daysRemaining} days left`;

  return (
    <button
      onClick={() => navigate('/settings/billing')}
      className={colorClass}
      title="Your trial is ending soon — click to upgrade"
    >
      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
      <span>{label}</span>
    </button>
  );
}

export default TrialCountdownBadge;
