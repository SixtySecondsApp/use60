import { useState, useCallback } from 'react'
import { useLinkedInIntegration } from '@/lib/hooks/useLinkedInIntegration'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Linkedin,
  ArrowRight,
  CheckCircle2,
  X,
  Loader2,
  Zap,
  BarChart3,
  Search,
  Settings2,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Onboarding Wizard — shown when LinkedIn is not connected
// ---------------------------------------------------------------------------

const DISMISSED_KEY = 'linkedin_onboarding_dismissed'

interface Props {
  onNavigate?: (tab: string) => void
}

export function LinkedInOnboardingWizard({ onNavigate }: Props) {
  const {
    isConnected,
    loading,
    integration,
    connectLinkedIn,
    connecting,
    canManage,
  } = useLinkedInIntegration()

  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === 'true'
  )
  const [step, setStep] = useState<number>(isConnected ? 2 : 1)

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, 'true')
    setDismissed(true)
  }, [])

  // Don't show if dismissed, loading, or already connected with ad account configured
  if (dismissed || loading) return null
  if (isConnected && integration?.linkedin_ad_account_id) return null

  const handleConnect = async () => {
    try {
      await connectLinkedIn()
    } catch {
      // Error toast handled by hook
    }
  }

  const steps = [
    { num: 1, label: 'Connect', done: isConnected },
    { num: 2, label: 'Configure', done: isConnected && !!integration?.linkedin_ad_account_id },
    { num: 3, label: 'Get Started', done: false },
  ]

  return (
    <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-blue-600/5">
      <CardContent className="py-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20">
              <Linkedin className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-100">
                Set Up LinkedIn Integration
              </h3>
              <p className="text-xs text-zinc-500">
                Connect your account to unlock campaigns, leads, and analytics
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-zinc-600 hover:text-zinc-400 transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-6">
          {steps.map((s, i) => (
            <div key={s.num} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium transition-colors ${
                  s.done
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : step === s.num
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-zinc-800 text-zinc-600 border border-zinc-700/30'
                }`}
              >
                {s.done ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.num}
              </div>
              <span
                className={`text-xs ${
                  s.done ? 'text-green-400' : step === s.num ? 'text-zinc-200' : 'text-zinc-600'
                }`}
              >
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <div className="w-8 h-px bg-zinc-700/50 mx-1" />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        {!isConnected && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Connect your LinkedIn account to start managing campaigns, capturing leads,
              and monitoring ad performance.
            </p>
            <div className="flex gap-3">
              <Button
                onClick={handleConnect}
                disabled={connecting || !canManage}
                className="gap-2"
              >
                {connecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Linkedin className="w-4 h-4" />
                )}
                {connecting ? 'Connecting...' : 'Connect LinkedIn'}
              </Button>
              {!canManage && (
                <p className="text-xs text-zinc-600 self-center">
                  Only org admins can connect integrations
                </p>
              )}
            </div>
          </div>
        )}

        {isConnected && !integration?.linkedin_ad_account_id && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Your LinkedIn account is connected. Configure your ad account
              and lead gen form sync to get the most out of the integration.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate?.('leads')}
                className="gap-2"
              >
                <Settings2 className="w-4 h-4" />
                Configure Lead Forms
              </Button>
            </div>
          </div>
        )}

        {isConnected && integration?.linkedin_ad_account_id && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              You're all set! Here are some quick actions to get started:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <QuickActionCard
                icon={<Zap className="w-4 h-4 text-purple-400" />}
                label="Create Campaign"
                onClick={() => onNavigate?.('campaigns')}
              />
              <QuickActionCard
                icon={<Search className="w-4 h-4 text-amber-400" />}
                label="Explore Ad Library"
                onClick={() => onNavigate?.('ad_library')}
              />
              <QuickActionCard
                icon={<BarChart3 className="w-4 h-4 text-emerald-400" />}
                label="View Analytics"
                onClick={() => onNavigate?.('analytics')}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="text-xs text-zinc-600 hover:text-zinc-400"
            >
              Don't show this again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Quick action card
// ---------------------------------------------------------------------------

function QuickActionCard({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg border border-zinc-700/30 bg-zinc-800/40 px-4 py-3 text-left transition-colors hover:border-zinc-600/50 hover:bg-zinc-800/60"
    >
      {icon}
      <span className="text-sm text-zinc-200">{label}</span>
      <ArrowRight className="w-3.5 h-3.5 text-zinc-600 ml-auto" />
    </button>
  )
}
