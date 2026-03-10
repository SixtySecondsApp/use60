// src/components/GracePeriodBanner.tsx
// Persistent amber/red banner shown during the 14-day grace period after trial expiry.
// Not dismissible — stays visible until the user upgrades or grace period ends.
// Escalates in urgency: informational (14-8 days), urgent (7-3 days), final warning (2-0 days).

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ArrowRight, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useSubscriptionGate } from '@/lib/hooks/useSubscriptionGate';

type Urgency = 'informational' | 'urgent' | 'final';

function getUrgency(days: number): Urgency {
  if (days <= 2) return 'final';
  if (days <= 7) return 'urgent';
  return 'informational';
}

function getMessage(days: number, urgency: Urgency): string {
  const dayLabel = days === 1 ? 'day' : 'days';
  if (urgency === 'final') {
    if (days === 0) return 'Your read-only access expires today. Upgrade now to keep your data.';
    return `Your read-only access ends in ${days} ${dayLabel}. Upgrade to keep your data.`;
  }
  if (urgency === 'urgent') {
    return `Your trial has ended. ${days} ${dayLabel} of read-only access remaining — upgrade before you lose access.`;
  }
  return `Your trial has ended. You have ${days} ${dayLabel} of read-only access remaining.`;
}

const STYLES: Record<Urgency, {
  wrapper: string;
  icon: string;
  text: string;
  btn: string;
}> = {
  informational: {
    wrapper: 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/40',
    icon: 'text-amber-500',
    text: 'text-amber-700 dark:text-amber-400',
    btn: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  urgent: {
    wrapper: 'bg-orange-50 border-orange-300 dark:bg-orange-950/20 dark:border-orange-800/40',
    icon: 'text-orange-500',
    text: 'text-orange-700 dark:text-orange-400',
    btn: 'bg-orange-600 hover:bg-orange-700 text-white',
  },
  final: {
    wrapper: 'bg-red-50 border-red-300 dark:bg-red-950/20 dark:border-red-800/40',
    icon: 'text-red-500',
    text: 'text-red-700 dark:text-red-400',
    btn: 'bg-red-600 hover:bg-red-700 text-white',
  },
};

export function GracePeriodBanner() {
  const { activeOrgId } = useOrg();
  const gate = useSubscriptionGate(activeOrgId);
  const navigate = useNavigate();

  // Only render when status is 'grace_period'
  if (gate.isLoading || gate.status !== 'grace_period') return null;

  const days = gate.graceDaysRemaining ?? 0;
  const urgency = getUrgency(days);
  const message = getMessage(days, urgency);
  const styles = STYLES[urgency];
  const Icon = urgency === 'informational' ? Clock : AlertTriangle;

  const handleUpgrade = () => {
    navigate('/trial-expired');
  };

  return (
    <AnimatePresence>
      <motion.div
        key="grace-period-banner"
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -60, opacity: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className={`fixed top-[65px] left-0 right-0 z-30 lg:top-[65px] lg:left-[256px] border-b backdrop-blur-sm ${styles.wrapper}`}
      >
        <div className="px-3 py-2 sm:px-4 sm:py-2.5 lg:px-6 lg:py-2.5">
          <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
            {/* Left: Status info */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Icon className={`w-4 h-4 flex-shrink-0 ${styles.icon}`} />
              <span className={`truncate font-medium ${styles.text}`}>
                {message}
              </span>
            </div>

            {/* Right: Upgrade action */}
            <div className="flex items-center flex-shrink-0">
              <button
                onClick={handleUpgrade}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${styles.btn}`}
              >
                Upgrade Now
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default GracePeriodBanner;
