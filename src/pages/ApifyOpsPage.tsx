import React, { useState } from 'react'
import { Bot, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApifyIntegration } from '@/lib/hooks/useApifyIntegration'
import { ApifyRunBuilder } from '@/components/ops/ApifyRunBuilder'
import { ApifyRunHistory } from '@/components/ops/ApifyRunHistory'
import { ApifyResultsExplorer } from '@/components/ops/ApifyResultsExplorer'
import { ApifyRun } from '@/lib/services/apifyService'

const VALID_TABS = ['builder', 'history', 'results'] as const
type TabValue = (typeof VALID_TABS)[number]

export default function ApifyOpsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isConnected, loading } = useApifyIntegration()
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedRun, setSelectedRun] = useState<ApifyRun | null>(null)

  const tabParam = searchParams.get('tab') as TabValue | null
  const activeTab: TabValue = tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'builder'

  const setTab = (tab: string) => {
    setSearchParams({ tab }, { replace: true })
  }

  const handleRunStarted = () => {
    setRefreshKey((k) => k + 1)
    setTab('history')
  }

  const handleViewResults = (run: ApifyRun) => {
    setSelectedRun(run)
    setTab('results')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <Bot className="w-12 h-12 text-gray-400 mx-auto" />
        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200">
          Connect Apify to get started
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Connect your Apify account in Settings &gt; Integrations to run actors and scrape data.
        </p>
        <Button
          variant="outline"
          onClick={() => navigate('/integrations')}
        >
          Go to Integrations
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/ops')}
          className="gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Ops
        </Button>
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Apify Actors
          </h1>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="builder">Run Builder</TabsTrigger>
          <TabsTrigger value="history">Run History</TabsTrigger>
          <TabsTrigger value="results">Results Explorer</TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="mt-6">
          <ApifyRunBuilder onRunStarted={handleRunStarted} />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <ApifyRunHistory
            key={refreshKey}
            onRerun={() => setTab('builder')}
            onViewResults={handleViewResults}
          />
        </TabsContent>

        <TabsContent value="results" className="mt-6">
          <ApifyResultsExplorer
            runId={selectedRun?.id}
            run={selectedRun}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
