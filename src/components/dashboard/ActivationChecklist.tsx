import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  X,
  UserCheck,
  Calendar,
  Brain,
  Plug,
  Users,
  Rocket,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useOnboardingProgress } from '@/lib/hooks/useOnboardingProgress';
import { useWaitlistOnboardingProgress } from '@/lib/hooks/useWaitlistOnboarding';
import { useAuth } from '@/lib/contexts/AuthContext';
import { staggerContainer, slideUp } from '@/components/onboarding/animation-variants';

const DISMISSED_KEY = 'activation_checklist_dismissed';
const SHOW_DAYS = 14;

interface ChecklistItem {
  key: string;
  label: string;
  description: string;
  tooltip: string;
  icon: React.ElementType;
  href: string;
  actionLabel: string;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    key: 'account_created',
    label: 'Account Created',
    description: 'Your account is set up and ready to go',
    tooltip: "You're in — let's get you set up",
    icon: Rocket,
    href: '',
    actionLabel: '',
  },
  {
    key: 'profile_completed',
    label: 'Complete Your Profile',
    description: 'Add your details and preferences',
    tooltip: "Helps 60 write in your voice from day one",
    icon: UserCheck,
    href: '/settings/account',
    actionLabel: 'Go to Profile',
  },
  {
    key: 'first_meeting_synced',
    label: 'Sync Your First Meeting',
    description: 'Connect your calendar to start capturing insights',
    tooltip: '60 needs at least one meeting to learn your style',
    icon: Calendar,
    href: '/integrations',
    actionLabel: 'Connect Calendar',
  },
  {
    key: 'notetaker_connected',
    label: 'Connect your notetaker',
    description: 'Auto-join meetings and capture everything automatically',
    tooltip: "Without this, 60 can't process your meetings",
    icon: Plug,
    href: '/integrations',
    actionLabel: 'Connect Notetaker',
  },
  {
    key: 'meeting_intelligence_used',
    label: 'Experience Meeting Intelligence',
    description: 'Explore AI-powered insights from your recorded meetings',
    tooltip: 'See what AI-powered meeting insights look like',
    icon: Brain,
    href: '/meetings',
    actionLabel: 'View Meetings',
  },
  {
    key: 'crm_integrated',
    label: 'Integrate Your CRM',
    description: 'Connect your sales tools for a seamless workflow',
    tooltip: 'Auto-updates your pipeline after every call',
    icon: Plug,
    href: '/integrations',
    actionLabel: 'Connect CRM',
  },
  {
    key: 'team_invited',
    label: 'Invite Your Team',
    description: 'Collaborate with colleagues and share insights',
    tooltip: 'Team insights unlock coaching and competitive intel',
    icon: Users,
    href: '/settings/team-members',
    actionLabel: 'Invite Team',
  },
];

function isWithinDays(dateStr: string | null | undefined, days: number): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date > cutoff;
}

export function ActivationChecklist() {
  const { user } = useAuth();
  const { progress: onboardingProgress, loading: onboardingLoading } = useOnboardingProgress();
  const { data: waitlistProgress, isLoading: waitlistLoading } = useWaitlistOnboardingProgress(
    user?.id ?? null
  );

  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === 'true'
  );
  const navigate = useNavigate();

  // Determine which steps are complete (computed before hooks to keep hook order stable)
  const completedAt = onboardingProgress?.onboarding_completed_at;
  const skipped = onboardingProgress?.skipped_onboarding;
  const isRecentlyOnboarded = isWithinDays(completedAt, SHOW_DAYS) || skipped;

  const completedKeys = new Set<string>();
  completedKeys.add('account_created');
  if (waitlistProgress?.profile_completed_at) completedKeys.add('profile_completed');
  if (waitlistProgress?.first_meeting_synced_at) completedKeys.add('first_meeting_synced');
  if (waitlistProgress?.meeting_intelligence_used_at) completedKeys.add('meeting_intelligence_used');
  if (waitlistProgress?.crm_integrated_at) completedKeys.add('crm_integrated');
  if (waitlistProgress?.team_invited_at) completedKeys.add('team_invited');
  if (onboardingProgress?.fathom_connected || onboardingProgress?.first_meeting_synced) {
    completedKeys.add('first_meeting_synced');
  }
  if (
    onboardingProgress?.fathom_connected ||
    (onboardingProgress as Record<string, unknown>)?.fireflies_connected ||
    (onboardingProgress as Record<string, unknown>)?.notetaker_connected
  ) {
    completedKeys.add('notetaker_connected');
  }

  const completedCount = completedKeys.size;
  const totalCount = CHECKLIST_ITEMS.length;
  const progressPct = Math.round((completedCount / totalCount) * 100);

  // Milestone celebrations — fire only once per user
  // Must be called unconditionally (React Rules of Hooks)
  const shouldShow = !onboardingLoading && !waitlistLoading && !dismissed && isRecentlyOnboarded;
  useEffect(() => {
    if (!shouldShow || !user?.id) return;

    const key50 = `activation_celebration_50_${user.id}`;
    const key100 = `activation_celebration_100_${user.id}`;

    if (completedCount >= Math.ceil(totalCount / 2) && !localStorage.getItem(key50)) {
      localStorage.setItem(key50, 'true');
      toast.success('Halfway there! 60 is getting smarter with every step.');
    }

    if (completedCount === totalCount && !localStorage.getItem(key100)) {
      localStorage.setItem(key100, 'true');
      toast.success('All set! 60 is fully activated and working for you.');
    }
  }, [completedCount, totalCount, user?.id, shouldShow]);

  // Early returns AFTER all hooks
  if (!shouldShow) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  const handleAction = (href: string) => {
    if (href) navigate(href);
  };

  const isFullyActivated = completedCount === totalCount;

  return (
    <Card
      data-tour="activation-checklist"
      className={`mb-6 transition-shadow duration-700 ${
        isFullyActivated
          ? 'border-emerald-400 dark:border-emerald-500 shadow-[0_0_20px_4px_rgba(52,211,153,0.25)] bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/40 dark:to-gray-900/80'
          : 'border-emerald-200 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50/50 to-white dark:from-emerald-950/20 dark:to-gray-900/80'
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <Rocket className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <AnimatePresence mode="wait">
                {isFullyActivated ? (
                  <motion.h3
                    key="activated"
                    className="text-base font-semibold text-emerald-600 dark:text-emerald-400"
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  >
                    60 is fully activated!
                  </motion.h3>
                ) : (
                  <motion.h3
                    key="get-started"
                    className="text-base font-semibold text-[#1E293B] dark:text-white"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    Get Started with use60
                  </motion.h3>
                )}
              </AnimatePresence>
              <p className="text-xs text-[#64748B] dark:text-gray-400 mt-0.5">
                {completedCount}/{totalCount} steps complete
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#1E293B] dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label={collapsed ? 'Expand checklist' : 'Collapse checklist'}
            >
              {collapsed ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={handleDismiss}
              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#1E293B] dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Dismiss checklist"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-[800ms] ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </CardHeader>

      <AnimatePresence>
        {!collapsed && (
          <CardContent className="pt-0">
            <TooltipProvider>
              <motion.ul
                className="space-y-1"
                variants={staggerContainer}
                initial="hidden"
                animate="show"
              >
                {CHECKLIST_ITEMS.map((item) => {
                  const done = completedKeys.has(item.key);
                  const Icon = item.icon;

                  return (
                    <motion.li
                      key={item.key}
                      variants={slideUp}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                        done
                          ? 'opacity-60'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer'
                      }`}
                      onClick={() => !done && handleAction(item.href)}
                      role={!done && item.href ? 'button' : undefined}
                    >
                      {/* Step icon */}
                      <div
                        className={`p-1.5 rounded-lg flex-shrink-0 ${
                          done
                            ? 'bg-emerald-100 dark:bg-emerald-900/30'
                            : 'bg-gray-100 dark:bg-gray-800'
                        }`}
                      >
                        <Icon
                          className={`w-3.5 h-3.5 ${
                            done
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-[#64748B] dark:text-gray-400'
                          }`}
                        />
                      </div>

                      {/* Label + description */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm font-medium leading-tight ${
                                done
                                  ? 'line-through text-[#94A3B8] dark:text-gray-500'
                                  : 'text-[#1E293B] dark:text-white'
                              }`}
                            >
                              {item.label}
                            </p>
                            <p className="text-xs text-[#64748B] dark:text-gray-400 mt-0.5 truncate">
                              {item.description}
                            </p>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top">{item.tooltip}</TooltipContent>
                      </Tooltip>

                      {/* Action button or check icon */}
                      <div className="flex-shrink-0">
                        {done ? (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                          >
                            <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
                          </motion.div>
                        ) : item.href ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAction(item.href);
                            }}
                            className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 whitespace-nowrap px-2 py-1 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                          >
                            {item.actionLabel}
                          </button>
                        ) : (
                          <Circle className="w-5 h-5 text-gray-300 dark:text-gray-600" />
                        )}
                      </div>
                    </motion.li>
                  );
                })}
              </motion.ul>
            </TooltipProvider>
          </CardContent>
        )}
      </AnimatePresence>
    </Card>
  );
}
