import React, { useState, useEffect, useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Search, Zap, ChevronRight, Check, ArrowLeft, ArrowUpDown, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase/clientV2'
import { toast } from 'sonner'
import type { InstantlyCampaign, InstantlyFieldMapping } from '@/lib/types/instantly'
import type { OpsTableColumn } from '@/lib/services/opsTableService'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tableId: string
  orgId: string
  columns: OpsTableColumn[]
  onLinked?: () => void
}

type Step = 'pick_campaign' | 'map_fields'
type StatusFilter = 'all' | 0 | 1 | 2 | 3
type SortOption = 'name_asc' | 'name_desc' | 'newest' | 'oldest'

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 0, label: 'Draft' },
  { value: 1, label: 'Active' },
  { value: 2, label: 'Paused' },
  { value: 3, label: 'Completed' },
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'name_asc', label: 'A → Z' },
  { value: 'name_desc', label: 'Z → A' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
]

const PAGE_SIZE = 100

export function InstantlyCampaignPickerModal({ open, onOpenChange, tableId, orgId, columns, onLinked }: Props) {
  const [step, setStep] = useState<Step>('pick_campaign')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<SortOption>('name_asc')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<InstantlyCampaign | null>(null)
  const [mapping, setMapping] = useState<InstantlyFieldMapping>({ email: '' })
  const [isLinking, setIsLinking] = useState(false)

  // Fetch all campaigns with pagination
  const {
    data: campaignPages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['instantly-campaigns', orgId],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      const { data, error } = await supabase.functions.invoke('instantly-admin', {
        body: {
          action: 'list_campaigns',
          org_id: orgId,
          limit: PAGE_SIZE,
          ...(pageParam ? { starting_after: pageParam } : {}),
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return {
        campaigns: (data?.campaigns ?? []) as InstantlyCampaign[],
        nextCursor: data?.next_starting_after ?? null,
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    enabled: open && !!orgId,
  })

  // Auto-fetch all pages so newly created campaigns aren't hidden behind "Load more"
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, isLoading, fetchNextPage])

  // Flatten all pages into one list
  const allCampaigns = useMemo(() => {
    return campaignPages?.pages.flatMap((p) => p.campaigns) ?? []
  }, [campaignPages])

  // Filter + sort
  const campaigns = useMemo(() => {
    let list = allCampaigns

    // Status filter
    if (statusFilter !== 'all') {
      list = list.filter((c) => c.status === statusFilter)
    }

    // Text search
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((c) => c.name?.toLowerCase().includes(q))
    }

    // Sort
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'name_asc':
          return (a.name || '').localeCompare(b.name || '')
        case 'name_desc':
          return (b.name || '').localeCompare(a.name || '')
        case 'newest': {
          const da = a.timestamp || a.created_at || ''
          const db = b.timestamp || b.created_at || ''
          return db.localeCompare(da)
        }
        case 'oldest': {
          const da = a.timestamp || a.created_at || ''
          const db = b.timestamp || b.created_at || ''
          return da.localeCompare(db)
        }
        default:
          return 0
      }
    })

    return list
  }, [allCampaigns, statusFilter, search, sort])

  // Status counts for tabs
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allCampaigns.length }
    for (const c of allCampaigns) {
      counts[c.status] = (counts[c.status] || 0) + 1
    }
    return counts
  }, [allCampaigns])

  // Auto-detect column mapping
  useEffect(() => {
    if (step !== 'map_fields' || columns.length === 0) return

    const autoMap: InstantlyFieldMapping = { email: '' }
    for (const col of columns) {
      const k = col.key.toLowerCase()
      const l = col.label.toLowerCase()
      if (col.column_type === 'email' || k === 'email' || l === 'email') {
        autoMap.email = col.key
      } else if (k === 'first_name' || k === 'firstname' || l === 'first name') {
        autoMap.first_name = col.key
      } else if (k === 'last_name' || k === 'lastname' || l === 'last name') {
        autoMap.last_name = col.key
      } else if (k === 'company' || k === 'company_name' || l === 'company' || l === 'company name') {
        autoMap.company_name = col.key
      }
    }
    setMapping(autoMap)
  }, [step, columns])

  const handleSelectCampaign = (campaign: InstantlyCampaign) => {
    setSelectedCampaign(campaign)
    setStep('map_fields')
  }

  const handleLink = async () => {
    if (!selectedCampaign || !mapping.email) return
    setIsLinking(true)

    try {
      const { data, error } = await supabase.functions.invoke('instantly-admin', {
        body: {
          action: 'link_campaign',
          org_id: orgId,
          table_id: tableId,
          campaign_id: selectedCampaign.id,
          campaign_name: selectedCampaign.name,
          field_mapping: mapping,
        },
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      toast.success(`Linked to "${selectedCampaign.name}"`)
      onLinked?.()
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e.message || 'Failed to link campaign')
    } finally {
      setIsLinking(false)
    }
  }

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep('pick_campaign')
      setSearch('')
      setStatusFilter('all')
      setSort('name_asc')
      setShowSortMenu(false)
      setSelectedCampaign(null)
      setMapping({ email: '' })
    }
  }, [open])

  const campaignStatusLabel = (status: number) => {
    switch (status) {
      case 0: return 'Draft'
      case 1: return 'Active'
      case 2: return 'Paused'
      case 3: return 'Completed'
      default: return 'Unknown'
    }
  }

  const campaignStatusColor = (status: number) => {
    switch (status) {
      case 1: return 'text-emerald-400 bg-emerald-400/10'
      case 2: return 'text-amber-400 bg-amber-400/10'
      case 3: return 'text-blue-400 bg-blue-400/10'
      default: return 'text-gray-400 bg-gray-400/10'
    }
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 'map_fields' && (
              <button onClick={() => setStep('pick_campaign')} className="text-gray-400 hover:text-white">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <Zap className="h-4 w-4 text-blue-400" />
            {step === 'pick_campaign' ? 'Connect to Instantly Campaign' : 'Map Columns'}
          </DialogTitle>
        </DialogHeader>

        {step === 'pick_campaign' && (
          <div className="space-y-3">
            {/* Search + Sort */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search campaigns..."
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-9 pr-3 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
                />
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-2 text-sm text-gray-300 hover:border-gray-600 hover:text-white"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{SORT_OPTIONS.find((o) => o.value === sort)?.label}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showSortMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
                    <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-lg">
                      {SORT_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => { setSort(opt.value); setShowSortMenu(false) }}
                          className={`flex w-full items-center px-3 py-1.5 text-left text-sm ${
                            sort === opt.value ? 'text-blue-400' : 'text-gray-300 hover:text-white'
                          } hover:bg-gray-700/50`}
                        >
                          {opt.label}
                          {sort === opt.value && <Check className="ml-auto h-3 w-3" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Status filter tabs */}
            <div className="flex gap-1 overflow-x-auto">
              {STATUS_TABS.map((tab) => {
                const count = statusCounts[tab.value === 'all' ? 'all' : tab.value] || 0
                const isActive = statusFilter === tab.value
                return (
                  <button
                    key={String(tab.value)}
                    onClick={() => setStatusFilter(tab.value)}
                    className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                        : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800 border border-transparent'
                    }`}
                  >
                    {tab.label}
                    {!isLoading && (
                      <span className={`ml-1 ${isActive ? 'text-blue-400/70' : 'text-gray-600'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Campaign list */}
            <div className="max-h-[320px] overflow-y-auto space-y-1">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : campaigns.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  {search || statusFilter !== 'all'
                    ? 'No campaigns match your filters'
                    : 'No campaigns found in Instantly'}
                </p>
              ) : (
                <>
                  {campaigns.map((campaign: InstantlyCampaign) => {
                    const date = formatDate(campaign.timestamp || campaign.created_at)
                    return (
                      <button
                        key={campaign.id}
                        onClick={() => handleSelectCampaign(campaign)}
                        className="flex w-full items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2.5 text-left transition-colors hover:border-blue-500/40 hover:bg-blue-500/5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate">{campaign.name}</p>
                          <div className="mt-0.5 flex items-center gap-2">
                            <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${campaignStatusColor(campaign.status)}`}>
                              {campaignStatusLabel(campaign.status)}
                            </span>
                            {date && (
                              <span className="text-[10px] text-gray-600">{date}</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-600" />
                      </button>
                    )
                  })}

                  {/* Load more */}
                  {hasNextPage && (
                    <button
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-700 py-2 text-sm text-gray-400 hover:border-gray-600 hover:text-gray-300"
                    >
                      {isFetchingNextPage ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      {isFetchingNextPage ? 'Loading more...' : 'Load more campaigns'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {step === 'map_fields' && selectedCampaign && (
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
              <p className="text-xs text-gray-400">Campaign</p>
              <p className="text-sm font-medium text-white">{selectedCampaign.name}</p>
            </div>

            <div className="space-y-3">
              <FieldMapRow
                label="Email"
                required
                value={mapping.email}
                onChange={(v) => setMapping({ ...mapping, email: v })}
                columns={columns}
              />
              <FieldMapRow
                label="First Name"
                value={mapping.first_name || ''}
                onChange={(v) => setMapping({ ...mapping, first_name: v || undefined })}
                columns={columns}
              />
              <FieldMapRow
                label="Last Name"
                value={mapping.last_name || ''}
                onChange={(v) => setMapping({ ...mapping, last_name: v || undefined })}
                columns={columns}
              />
              <FieldMapRow
                label="Company"
                value={mapping.company_name || ''}
                onChange={(v) => setMapping({ ...mapping, company_name: v || undefined })}
                columns={columns}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleLink}
                disabled={!mapping.email || isLinking}
              >
                {isLinking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Check className="mr-1.5 h-4 w-4" />
                Link Campaign
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function FieldMapRow({
  label,
  required,
  value,
  onChange,
  columns,
}: {
  label: string
  required?: boolean
  value: string
  onChange: (v: string) => void
  columns: OpsTableColumn[]
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-sm text-gray-400">
        {label}
        {required && <span className="text-red-400">*</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-white outline-none focus:border-blue-500"
      >
        <option value="">— Not mapped —</option>
        {columns.map((col) => (
          <option key={col.key} value={col.key}>
            {col.label}
          </option>
        ))}
      </select>
    </div>
  )
}
