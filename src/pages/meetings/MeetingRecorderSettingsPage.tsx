import React, { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NotetakerSettingsTab } from '@/components/settings/NotetakerSettingsTab'
import { FathomSettingsTab } from '@/components/settings/FathomSettingsTab'
import { FirefliesSettingsTab } from '@/components/settings/FirefliesSettingsTab'

const RECORDER_CONFIG: Record<string, { title: string; component: React.FC }> = {
  notetaker: {
    title: '60 Notetaker Settings',
    component: NotetakerSettingsTab,
  },
  fathom: {
    title: 'Fathom Settings',
    component: FathomSettingsTab,
  },
  fireflies: {
    title: 'Fireflies Settings',
    component: FirefliesSettingsTab,
  },
}

export default function MeetingRecorderSettingsPage() {
  const { recorder } = useParams<{ recorder: string }>()
  const navigate = useNavigate()

  const config = recorder ? RECORDER_CONFIG[recorder] : undefined

  useEffect(() => {
    if (!config) {
      navigate('/meetings/settings', { replace: true })
    }
  }, [config, navigate])

  if (!config) return null

  const SettingsComponent = config.component

  return (
    <div className="min-h-screen">
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Back Button */}
          <Button
            variant="ghost"
            onClick={() => navigate('/meetings/settings')}
            className="group -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Meeting Settings
          </Button>

          {/* Page Header */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-white">
              {config.title}
            </h1>
          </div>

          {/* Settings Content */}
          <SettingsComponent />
        </div>
      </div>
    </div>
  )
}
