/**
 * ActivationChecklist (SETUP-003, SETUP-005)
 *
 * Visible for 7 days after sign-up or until 100% complete.
 * "Complete Setup" button opens the SetupWizardDialog.
 * Dismissable with localStorage. Re-appears if not dismissed and not 100%.
 * Progress driven by setup_wizard_progress steps (integration-aware).
 */

import { useState } from 'react';
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  X,
  Calendar,
  Mic,
  BarChart3,
  Zap,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOnboardingProgress } from '@/lib/hooks/useOnboardingProgress';
import { useSetupWizardStore, SETUP_STEPS } from '@/lib/stores/setupWizardStore';

const DISMISSED_KEY = 'activation_checklist_dismissed';
const SHOW_DAYS = 7;

interface ChecklistItem {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
}

// Maps setup_wizard_progress steps to display items
const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    key: 'calendar',
    label: 'Connect your calendar',
    description: 'So Sixty can prep you for every meeting',
    icon: Calendar,
  },
  {
    key: 'notetaker',
    label: 'Enable meeting recording',
    description: 'So Sixty can join and take notes',
    icon: Mic,
  },
  {
    key: 'crm',
    label: 'Connect your pipeline',
    description: 'So Sixty can monitor your deals',
    icon: BarChart3,
  },
  {
    key: 'followups',
    label: 'Learn your writing style',
    description: 'So follow-up emails sound like you',
    icon: Zap,
  },
  {
    key: 'test',
    label: 'See Sixty in action',
    description: 'Watch AI research and write a cold email',
    icon: Sparkles,
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
  const store = useSetupWizardStore();

  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === 'true'
  );

  if (!user) return null;
  if (onboardingLoading || !store.hasFetched) return null;
  if (dismissed) return null;

  // Show for 7 days after onboarding or if skipped
  const completedAt = onboardingProgress?.onboarding_completed_at;
  const skipped = onboardingProgress?.skipped_onboarding;
  const isRecentlyOnboarded = isWithinDays(completedAt, SHOW_DAYS) || skipped;

  // Also show if any wizard steps exist (user has started setup)
  const hasAnyWizardProgress = SETUP_STEPS.some(s => store.steps[s].completed);

  if (!isRecentlyOnboarded && !hasAnyWizardProgress) return null;

  // Don't show once everything is done
  if (store.allCompleted) return null;

  // Build completed set from setup wizard store
  const completedKeys = new Set<string>(
    SETUP_STEPS.filter(s => store.steps[s].completed)
  );

  const completedCount = completedKeys.size;
  const totalCount = CHECKLIST_ITEMS.length;
  const progressPct = Math.round((completedCount / totalCount) * 100);

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  return (
    <Card className="mb-6 border-indigo-200 dark:border-indigo-800/50 bg-gradient-to-br from-indigo-50/50 to-white dark:from-indigo-950/20 dark:to-gray-900/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/40">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#1E293B] dark:text-white">
                Set up Sixty
              </h3>
              <p className="text-xs text-[#64748B] dark:text-gray-400 mt-0.5">
                {completedCount}/{totalCount} steps complete — {progressPct}%
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* SETUP-003: Complete Setup button opens wizard */}
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
              onClick={() => store.openWizard()}
            >
              Complete Setup
              <ArrowRight className="w-3 h-3 ml-1.5" />
            </Button>
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#1E293B] dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
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
              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#1E293B] dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
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
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
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
                      : 'hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1'
                  }`}
                  onClick={() => !done && store.openWizard()}
                  onKeyDown={(e) => e.key === 'Enter' && !done && store.openWizard()}
                  tabIndex={!done ? 0 : undefined}
                  role={!done ? 'button' : undefined}
                >
                  <div
                    className={`p-1.5 rounded-lg flex-shrink-0 ${
                      done
                        ? 'bg-indigo-100 dark:bg-indigo-900/30'
                        : 'bg-gray-100 dark:bg-gray-800'
                    }`}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 ${
                        done
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-[#64748B] dark:text-gray-400'
                      }`}
                    />
                  </div>

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

                  <div className="flex-shrink-0">
                    {done ? (
                      <CheckCircle2 className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
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
