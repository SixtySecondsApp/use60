import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coins, X, ArrowRight, Zap, Mail, FileText, Search, Bot } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface CreditSystemExplainerProps {
  userId: string;
  balance: number;
  planName: string;
  monthlyCredits: number;
  onDismiss?: () => void;
}

const SAMPLE_COSTS = [
  { icon: Mail, label: 'Follow-up emails', cost: '1–2 credits' },
  { icon: FileText, label: 'Meeting summaries', cost: '1–2 credits' },
  { icon: Search, label: 'Enrichment', cost: '0.5–1 credit' },
  { icon: Bot, label: 'Copilot queries', cost: '0.3–1 credit' },
];

export function CreditSystemExplainer({
  userId,
  balance,
  planName,
  monthlyCredits,
  onDismiss,
}: CreditSystemExplainerProps) {
  const dismissedKey = `sixty_credit_explainer_dismissed_${userId}`;
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(dismissedKey) === 'true'
  );
  const navigate = useNavigate();

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(dismissedKey, 'true');
    setDismissed(true);
    onDismiss?.();
  };

  const handleViewPricing = () => {
    navigate('/settings/credits');
  };

  return (
    <Card className="mb-6 border-blue-200 dark:border-blue-800/50 bg-gradient-to-br from-blue-50/50 to-white dark:from-blue-950/20 dark:to-gray-900/80">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40">
              <Coins className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#1E293B] dark:text-white">
                How Credits Work
              </h3>
              <p className="text-xs text-[#64748B] dark:text-gray-400 mt-0.5">
                Credits power your AI features
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-[#64748B] dark:text-gray-400 hover:text-[#1E293B] dark:hover:text-white transition-colors p-1 rounded"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Explanation */}
        <p className="text-sm text-[#64748B] dark:text-gray-400">
          Every AI action in 60 uses a small number of credits. Credits reset each month with your plan
          and can be topped up anytime.
        </p>

        {/* Sample costs */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-medium text-[#1E293B] dark:text-gray-200 uppercase tracking-wide">
              Sample costs
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SAMPLE_COSTS.map(({ icon: Icon, label, cost }) => (
              <div
                key={label}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-gray-800/50 border border-[#E2E8F0] dark:border-gray-700/50"
              >
                <Icon className="w-3.5 h-3.5 text-[#64748B] dark:text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#1E293B] dark:text-gray-200 truncate">
                    {label}
                  </p>
                  <p className="text-xs text-[#64748B] dark:text-gray-400">{cost}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Balance and plan */}
        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40">
          <div>
            <p className="text-xs text-[#64748B] dark:text-gray-400">Current balance</p>
            <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
              {balance.toLocaleString()} credits
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#64748B] dark:text-gray-400">Your {planName} plan</p>
            <p className="text-sm font-medium text-[#1E293B] dark:text-gray-200">
              {monthlyCredits.toLocaleString()} / month
            </p>
          </div>
        </div>

        {/* Top-up note */}
        <p className="text-xs text-[#64748B] dark:text-gray-400">
          Need more? Top up anytime from Settings.
        </p>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={handleDismiss}>
            Got It
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleViewPricing}
            className="gap-1"
          >
            View Pricing
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
