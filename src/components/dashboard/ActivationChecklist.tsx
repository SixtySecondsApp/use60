import { useState } from 'react';
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
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useOnboardingProgress } from '@/lib/hooks/useOnboardingProgress';
import { useWaitlistOnboardingProgress } from '@/lib/hooks/useWaitlistOnboarding';
import { useAuth } from '@/lib/contexts/AuthContext';

const DISMISSED_KEY = 'activation_checklist_dismissed';
const SHOW_DAYS = 7;

interface ChecklistItem {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
  href: string;
  actionLabel: string;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    key: 'account_created',
    label: 'Account Created',
    description: 'Your account is set up and ready to go',
    icon: Rocket,
    href: '',
    actionLabel: '',
  },
  {
    key: 'profile_completed',
    label: 'Complete Your Profile',
    description: 'Add your details and preferences',
    icon: UserCheck,
    href: '/settings/profile',
    actionLabel: 'Go to Profile',
  },
  {
    key: 'first_meeting_synced',
    label: 'Sync Your First Meeting',
    description: 'Connect your calendar to start capturing insights',
    icon: Calendar,
    href: '/settings/integrations',
    actionLabel: 'Connect Calendar',
  },
  {
    key: 'meeting_intelligence_used',
    label: 'Try Meeting Intelligence',
    description: 'Experience AI-powered meeting search and analysis',
    icon: Brain,
    href: '/meetings',
    actionLabel: 'View Meetings',
  },
  {
    key: 'crm_integrated',
    label: 'Integrate Your CRM',
    description: 'Connect your sales tools for a seamless workflow',
    icon: Plug,
    href: '/settings/integrations',
    actionLabel: 'Connect CRM',
  },
  {
    key: 'team_invited',
    label: 'Invite Your Team',
    description: 'Collaborate with colleagues and share insights',
    icon: Users,
    href: '/settings/team',
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

  if (onboardingLoading || waitlistLoading) return null;
  if (dismissed) return null;

  // Only show for users who completed onboarding within the last 7 days
  // OR who skipped onboarding (they still need activation)
  const completedAt = onboardingProgress?.onboarding_completed_at;
  const skipped = onboardingProgress?.skipped_onboarding;
  const isRecentlyOnboarded = isWithinDays(completedAt, SHOW_DAYS) || skipped;

  if (!isRecentlyOnboarded) return null;

  // Determine which steps are complete
  const completedKeys = new Set<string>();
  // account_created is always done
  completedKeys.add('account_created');
  if (waitlistProgress?.profile_completed_at) completedKeys.add('profile_completed');
  if (waitlistProgress?.first_meeting_synced_at) completedKeys.add('first_meeting_synced');
  if (waitlistProgress?.meeting_intelligence_used_at) completedKeys.add('meeting_intelligence_used');
  if (waitlistProgress?.crm_integrated_at) completedKeys.add('crm_integrated');
  if (waitlistProgress?.team_invited_at) completedKeys.add('team_invited');

  // Also check user_onboarding_progress fields as fallback
  if (onboardingProgress?.fathom_connected || onboardingProgress?.first_meeting_synced) {
    completedKeys.add('first_meeting_synced');
  }

  const completedCount = completedKeys.size;
  const totalCount = CHECKLIST_ITEMS.length;
  const progressPct = Math.round((completedCount / totalCount) * 100);

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  const handleAction = (href: string) => {
    if (href) navigate(href);
  };

  return (
    <Card className="mb-6 border-emerald-200 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50/50 to-white dark:from-emerald-950/20 dark:to-gray-900/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <Rocket className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#1E293B] dark:text-white">
                Get Started with use60
              </h3>
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
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="pt-0">
          <ul className="space-y-1">
            {CHECKLIST_ITEMS.map((item) => {
              const done = completedKeys.has(item.key);
              const Icon = item.icon;

              return (
                <li
                  key={item.key}
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

                  {/* Action button or check icon */}
                  <div className="flex-shrink-0">
                    {done ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
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
                </li>
              );
            })}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
