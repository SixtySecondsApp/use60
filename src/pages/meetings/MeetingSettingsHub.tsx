import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Video, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useFathomIntegration } from '@/lib/hooks/useFathomIntegration'
import { useFirefliesIntegration } from '@/lib/hooks/useFirefliesIntegration'
import { useNotetakerIntegration } from '@/lib/hooks/useNotetakerIntegration'
import { useIntegrationLogo } from '@/lib/hooks/useIntegrationLogo'
import { DEFAULT_SIXTY_ICON_URL } from '@/lib/utils/sixtyBranding'

interface RecorderCardProps {
  name: string
  description: string
  logoUrl: string | null
  fallbackIcon: React.ReactNode
  iconBgColor: string
  iconBorderColor: string
  isConnected: boolean
  isLoading: boolean
  recorder: string
  onClick: () => void
}

function RecorderCard({ name, description, logoUrl, fallbackIcon, iconBgColor, iconBorderColor, isConnected, isLoading, onClick }: RecorderCardProps) {
  const [logoLoaded, setLogoLoaded] = useState(false)
  const [logoErrored, setLogoErrored] = useState(false)

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm animate-pulse">
        <div className="flex justify-between items-start mb-5">
          <div className="w-12 h-12 rounded-xl bg-gray-200 dark:bg-gray-700" />
          <div className="w-16 h-6 rounded-full bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="h-4 w-48 bg-gray-100 dark:bg-gray-800 rounded" />
      </div>
    )
  }

  const showFallback = !logoUrl || logoErrored

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm transition-all hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
      )}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-5">
        <div className={cn(
          'relative w-12 h-12 rounded-xl flex items-center justify-center border overflow-hidden',
          iconBgColor,
          iconBorderColor,
        )}>
          {logoUrl && !logoErrored && (
            <img
              src={logoUrl}
              alt={`${name} logo`}
              className={cn(
                'w-full h-full object-cover transition-opacity duration-150',
                logoLoaded ? 'opacity-100' : 'opacity-0'
              )}
              decoding="async"
              loading="eager"
              onLoad={() => setLogoLoaded(true)}
              onError={() => { setLogoErrored(true); setLogoLoaded(false) }}
            />
          )}
          {showFallback && (
            <div className="w-6 h-6 text-gray-400 dark:text-gray-500">
              {fallbackIcon}
            </div>
          )}
        </div>
        <span
          className={cn(
            'px-2.5 py-1 border rounded-full text-xs font-semibold flex items-center gap-1.5',
            isConnected
              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
          )}
        >
          {isConnected && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          )}
          {isConnected ? 'Connected' : 'Not connected'}
        </span>
      </div>

      {/* Title and description */}
      <h3 className="text-lg font-semibold mb-1 text-gray-900 dark:text-white">{name}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
    </button>
  )
}

export default function MeetingSettingsHub() {
  const navigate = useNavigate()

  const { isConnected: fathomConnected, loading: fathomLoading } = useFathomIntegration()
  const { isConnected: firefliesConnected, loading: firefliesLoading } = useFirefliesIntegration()
  const { isConnected: notetakerConnected, isLoading: notetakerLoading } = useNotetakerIntegration()

  const { logoUrl: fathomLogoUrl } = useIntegrationLogo('fathom', { enableFetch: true })
  const { logoUrl: firefliesLogoUrl } = useIntegrationLogo('fireflies', { enableFetch: true })

  const isLoading = fathomLoading || firefliesLoading || notetakerLoading

  const recorders = [
    {
      key: 'notetaker',
      name: '60 Notetaker',
      description: 'Auto-record & transcribe your meetings.',
      logoUrl: DEFAULT_SIXTY_ICON_URL,
      fallbackIcon: <img src={DEFAULT_SIXTY_ICON_URL} alt="60" className="w-6 h-6 rounded" />,
      iconBgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
      iconBorderColor: 'border-emerald-100 dark:border-emerald-800/40',
      isConnected: notetakerConnected,
      isLoading: notetakerLoading,
    },
    {
      key: 'fathom',
      name: 'Fathom',
      description: 'Sync meeting recordings & insights.',
      logoUrl: fathomLogoUrl,
      fallbackIcon: (
        <div className="flex items-center space-x-1">
          <span className="text-white font-bold text-sm">F</span>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
            <path d="M4 16C4 14 4 12 6 10C8 8 10 8 12 6C14 4 16 4 18 6C20 8 20 10 20 12" stroke="#00BEFF" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>
      ),
      iconBgColor: 'bg-gray-900 dark:bg-[#1a1a1a]',
      iconBorderColor: 'border-gray-800 dark:border-gray-700',
      isConnected: fathomConnected,
      isLoading: fathomLoading,
    },
    {
      key: 'fireflies',
      name: 'Fireflies.ai',
      description: 'AI meeting notes & transcription.',
      logoUrl: firefliesLogoUrl,
      fallbackIcon: <Video className="w-6 h-6 text-yellow-500" />,
      iconBgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
      iconBorderColor: 'border-yellow-100 dark:border-yellow-800/40',
      isConnected: firefliesConnected,
      isLoading: firefliesLoading,
    },
  ]

  const connectedRecorders = recorders.filter((r) => r.isConnected)
  const hasConnectedRecorders = connectedRecorders.length > 0

  return (
    <div className="min-h-screen">
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Back Button */}
          <Button
            variant="ghost"
            onClick={() => navigate('/meetings')}
            className="group -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Meetings
          </Button>

          {/* Page Header */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-white">
              Meeting Settings
            </h1>
            <p className="text-[#64748B] dark:text-gray-400 mt-2">
              Configure your connected meeting recorders and integrations.
            </p>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recorders.map((r) => (
                <RecorderCard
                  key={r.key}
                  name={r.name}
                  description={r.description}
                  logoUrl={r.logoUrl}
                  fallbackIcon={r.fallbackIcon}
                  iconBgColor={r.iconBgColor}
                  iconBorderColor={r.iconBorderColor}
                  isConnected={false}
                  isLoading={true}
                  recorder={r.key}
                  onClick={() => {}}
                />
              ))}
            </div>
          ) : hasConnectedRecorders ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {connectedRecorders.map((r) => (
                <RecorderCard
                  key={r.key}
                  name={r.name}
                  description={r.description}
                  logoUrl={r.logoUrl}
                  fallbackIcon={r.fallbackIcon}
                  iconBgColor={r.iconBgColor}
                  iconBorderColor={r.iconBorderColor}
                  isConnected={r.isConnected}
                  isLoading={r.isLoading}
                  recorder={r.key}
                  onClick={() => navigate(`/meetings/settings/${r.key}`)}
                />
              ))}
            </div>
          ) : (
            /* Empty state */
            <div className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800/50 rounded-xl p-12 backdrop-blur-xl flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mb-4">
                <Video className="w-8 h-8 text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                No recorders connected
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-sm">
                Connect a meeting recorder to start capturing and analysing your calls in 60.
              </p>
              <Link to="/integrations">
                <Button variant="default" className="gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Go to Integrations
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
