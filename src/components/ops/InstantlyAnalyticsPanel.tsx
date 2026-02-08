import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/clientV2'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Loader2, BarChart3, RefreshCw, Send, Eye, MessageSquare, AlertTriangle, UserX } from 'lucide-react'
import type { InstantlyAnalytics } from '@/lib/types/instantly'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgId: string
  campaignId: string | null
  campaignName: string | null
}

function StatCard({ label, value, icon: Icon, color, percent }: {
  label: string
  value: number | string
  icon: React.ElementType
  color: string
  percent?: string
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-semibold text-white">{value}</span>
        {percent && <span className="text-xs text-gray-500">{percent}</span>}
      </div>
    </div>
  )
}

export function InstantlyAnalyticsPanel({ open, onOpenChange, orgId, campaignId, campaignName }: Props) {
  const { data: analytics, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['instantly-analytics', orgId, campaignId],
    queryFn: async () => {
      if (!campaignId) return null
      const { data, error } = await supabase.functions.invoke('instantly-admin', {
        body: { action: 'campaign_analytics', org_id: orgId, campaign_id: campaignId },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data?.analytics as InstantlyAnalytics
    },
    enabled: open && !!orgId && !!campaignId,
  })

  const safeDiv = (a: number | undefined, b: number | undefined) => {
    if (!a || !b || b === 0) return '0%'
    return `${((a / b) * 100).toFixed(1)}%`
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="!top-16 !h-[calc(100vh-4rem)] w-[400px]">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              Campaign Analytics
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </SheetTitle>
        </SheetHeader>

        {campaignName && (
          <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
            <p className="text-xs text-gray-500">Campaign</p>
            <p className="text-sm font-medium text-white truncate">{campaignName}</p>
          </div>
        )}

        <div className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : !analytics ? (
            <p className="text-sm text-gray-500 py-8 text-center">No analytics available</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                label="Leads"
                value={analytics.leads_count ?? 0}
                icon={BarChart3}
                color="text-blue-400"
              />
              <StatCard
                label="Contacted"
                value={analytics.contacted_count ?? 0}
                icon={Send}
                color="text-emerald-400"
                percent={safeDiv(analytics.contacted_count, analytics.leads_count)}
              />
              <StatCard
                label="Emails Sent"
                value={analytics.emails_sent_count ?? 0}
                icon={Send}
                color="text-violet-400"
              />
              <StatCard
                label="Unique Opens"
                value={analytics.open_count_unique ?? 0}
                icon={Eye}
                color="text-amber-400"
                percent={safeDiv(analytics.open_count_unique, analytics.contacted_count)}
              />
              <StatCard
                label="Unique Replies"
                value={analytics.reply_count_unique ?? 0}
                icon={MessageSquare}
                color="text-emerald-400"
                percent={safeDiv(analytics.reply_count_unique, analytics.contacted_count)}
              />
              <StatCard
                label="Bounced"
                value={analytics.bounced_count ?? 0}
                icon={AlertTriangle}
                color="text-red-400"
                percent={safeDiv(analytics.bounced_count, analytics.emails_sent_count)}
              />
              <StatCard
                label="Unsubscribed"
                value={analytics.unsubscribed_count ?? 0}
                icon={UserX}
                color="text-orange-400"
              />
              <StatCard
                label="Interested"
                value={analytics.total_interested ?? 0}
                icon={MessageSquare}
                color="text-emerald-400"
              />
              <StatCard
                label="Meetings Booked"
                value={analytics.total_meeting_booked ?? 0}
                icon={BarChart3}
                color="text-blue-400"
              />
              <StatCard
                label="Completed"
                value={analytics.completed_count ?? 0}
                icon={BarChart3}
                color="text-gray-400"
                percent={safeDiv(analytics.completed_count, analytics.leads_count)}
              />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
