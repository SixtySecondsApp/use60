/**
 * ActionPolicyGrid
 *
 * Displays a grid of action types with per-row radio buttons for policy selection.
 * Rows = action types, Columns = Auto / Approve / Suggest / Disabled
 */

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Zap, CheckCircle, Lightbulb, XCircle } from 'lucide-react';

export type PolicyValue = 'auto' | 'approve' | 'suggest' | 'disabled';

export interface ActionType {
  key: string;
  label: string;
  description: string;
  risk_level: 'low' | 'medium' | 'high';
}

export interface ActionPolicyGridProps {
  actionTypes: ActionType[];
  policies: Record<string, PolicyValue>;
  onChange: (actionKey: string, policy: PolicyValue) => void;
  disabled?: boolean;
}

const POLICY_OPTIONS: { value: PolicyValue; label: string; icon: React.ElementType; description: string }[] = [
  {
    value: 'auto',
    label: 'Auto',
    icon: Zap,
    description: 'Execute automatically without approval',
  },
  {
    value: 'approve',
    label: 'Approve',
    icon: CheckCircle,
    description: 'Require explicit approval before executing',
  },
  {
    value: 'suggest',
    label: 'Suggest',
    icon: Lightbulb,
    description: 'Show as a suggestion only, no execution',
  },
  {
    value: 'disabled',
    label: 'Off',
    icon: XCircle,
    description: 'Disable this action type entirely',
  },
];

const RISK_BADGE: Record<string, { label: string; className: string }> = {
  low: { label: 'Low Risk', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  medium: { label: 'Medium Risk', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  high: { label: 'High Risk', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export function ActionPolicyGrid({ actionTypes, policies, onChange, disabled }: ActionPolicyGridProps) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="pb-3 pr-4 text-left text-sm font-medium text-gray-500 dark:text-gray-400 w-1/3">
              Action Type
            </th>
            {POLICY_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <th
                  key={opt.value}
                  className="pb-3 px-2 text-center text-sm font-medium text-gray-500 dark:text-gray-400"
                >
                  <div className="flex flex-col items-center gap-1">
                    <Icon className="h-4 w-4" />
                    <span>{opt.label}</span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {actionTypes.map((action) => {
            const currentPolicy = policies[action.key] ?? 'approve';
            const riskBadge = RISK_BADGE[action.risk_level];
            return (
              <tr key={action.key} className="group hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                <td className="py-3 pr-4">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {action.label}
                      </span>
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', riskBadge.className)}>
                        {riskBadge.label}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {action.description}
                    </span>
                  </div>
                </td>
                {POLICY_OPTIONS.map((opt) => (
                  <td key={opt.value} className="py-3 px-2 text-center">
                    <label className="cursor-pointer inline-flex items-center justify-center">
                      <input
                        type="radio"
                        name={`policy-${action.key}`}
                        value={opt.value}
                        checked={currentPolicy === opt.value}
                        onChange={() => onChange(action.key, opt.value)}
                        disabled={disabled}
                        className="sr-only"
                      />
                      <span
                        className={cn(
                          'h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all',
                          currentPolicy === opt.value
                            ? 'border-blue-600 bg-blue-600 dark:border-blue-400 dark:bg-blue-400'
                            : 'border-gray-300 dark:border-gray-600 bg-transparent',
                          disabled && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {currentPolicy === opt.value && (
                          <span className="h-2 w-2 rounded-full bg-white" />
                        )}
                      </span>
                    </label>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
