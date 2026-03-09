import { useState } from 'react';
import { Clock, Check, Zap, Shield, RefreshCw, LogOut } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useOrganizationContext } from '@/lib/hooks/useOrganizationContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useSubscriptionGate } from '@/lib/hooks/useSubscriptionGate';
import { useCreateCheckoutSession } from '@/lib/hooks/useSubscription';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { logger } from '@/lib/utils/logger';

const BASIC_FEATURES = [
  '100 credits/month',
  'Meeting prep & follow-up',
  'AI-powered summaries',
  'Contact enrichment',
  'Email integration',
];

const PRO_FEATURES = [
  '250 credits/month',
  'Everything in Basic',
  'Team analytics & insights',
  'Priority support',
  'Advanced coaching digests',
  'Custom workflows',
];

export default function TrialExpiredPage() {
  const { activeOrg } = useOrganizationContext();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [checkingOutPlan, setCheckingOutPlan] = useState<'basic' | 'pro' | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const gate = useSubscriptionGate(activeOrg?.id ?? null);
  const createCheckoutSession = useCreateCheckoutSession();

  const isInGracePeriod = gate.status === 'grace_period';
  const graceDaysRemaining = gate.graceDaysRemaining ?? 0;

  const handleSubscribe = async (planSlug: 'basic' | 'pro') => {
    if (!activeOrg?.id) {
      toast.error('Organization not found', {
        description: 'Please refresh the page and try again.',
      });
      return;
    }

    setCheckingOutPlan(planSlug);
    try {
      await createCheckoutSession.mutateAsync({
        org_id: activeOrg.id,
        plan_slug: planSlug,
        billing_cycle: 'monthly',
      });
      // Redirect happens inside the mutation onSuccess (window.location.href)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start checkout';
      toast.error(message);
    } finally {
      setCheckingOutPlan(null);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      navigate('/auth/login', { replace: true });
    } catch (err) {
      logger.error('[TrialExpiredPage] Sign out error:', err);
      toast.error('Failed to sign out', { description: 'Please try again.' });
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(55,189,126,0.08),transparent)] pointer-events-none" />

      <div className="w-full max-w-3xl space-y-6 relative">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center">
            <Clock className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-3xl font-bold text-white">Your trial has ended</h1>
          <p className="text-gray-400 max-w-md mx-auto">
            Your 14-day free trial has expired. Choose a plan below to keep access to your data
            and continue closing deals with 60.
          </p>
        </div>

        {/* Grace period notice */}
        {isInGracePeriod && graceDaysRemaining > 0 && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3 flex items-start gap-3">
            <Shield className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-300">
                Read-only access for {graceDaysRemaining} more {graceDaysRemaining === 1 ? 'day' : 'days'}
              </p>
              <p className="text-xs text-blue-400/80 mt-0.5">
                Your data is safe. Subscribe before the grace period ends to restore full access.
              </p>
            </div>
          </div>
        )}

        {/* Plan comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Basic Plan */}
          <Card className="bg-gray-900 border-gray-700">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-lg">Basic</CardTitle>
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-bold text-white">£29</span>
                <span className="text-gray-400 text-sm">/mo</span>
              </div>
              <CardDescription className="text-gray-400 text-sm">
                Everything you need to manage your pipeline solo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {BASIC_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-gray-300">
                    <Check className="w-4 h-4 text-[#37bd7e] shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => handleSubscribe('basic')}
                disabled={checkingOutPlan !== null}
                variant="outline"
                className="w-full border-gray-600 text-white hover:bg-gray-800"
                size="lg"
              >
                {checkingOutPlan === 'basic' ? (
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Subscribe to Basic
              </Button>
            </CardContent>
          </Card>

          {/* Pro Plan */}
          <Card className="bg-gray-900 border-[#37bd7e]/50 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-[#37bd7e] text-white border-0 text-xs px-3 py-1">
                Most Popular
              </Badge>
            </div>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-lg">Pro</CardTitle>
                <Zap className="w-4 h-4 text-[#37bd7e]" />
              </div>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-bold text-white">£99</span>
                <span className="text-gray-400 text-sm">/mo</span>
              </div>
              <CardDescription className="text-gray-400 text-sm">
                Built for teams that want full AI leverage across the whole pipeline.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {PRO_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-gray-300">
                    <Check className="w-4 h-4 text-[#37bd7e] shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => handleSubscribe('pro')}
                disabled={checkingOutPlan !== null}
                className="w-full bg-[#37bd7e] hover:bg-[#2da86e] text-white"
                size="lg"
              >
                {checkingOutPlan === 'pro' ? (
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Subscribe to Pro
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Footer actions */}
        <div className="flex flex-col items-center gap-3 pt-2">
          <Button
            onClick={handleSignOut}
            disabled={isSigningOut}
            variant="ghost"
            className="text-gray-500 hover:text-gray-300 text-sm"
            size="sm"
          >
            {isSigningOut ? (
              <RefreshCw className="w-3 h-3 animate-spin mr-2" />
            ) : (
              <LogOut className="w-3 h-3 mr-2" />
            )}
            Sign out
          </Button>
          <p className="text-center text-sm text-gray-500">
            Need help?{' '}
            <a
              href="mailto:support@use60.com"
              className="text-[#37bd7e] hover:underline"
            >
              Contact us
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
