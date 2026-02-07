import React, { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Search, Zap, ChevronRight, Check, ArrowLeft } from 'lucide-react'
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

export function InstantlyCampaignPickerModal({ open, onOpenChange, tableId, orgId, columns, onLinked }: Props) {
  const [step, setStep] = useState<Step>('pick_campaign')
  const [search, setSearch] = useState('')
  const [selectedCampaign, setSelectedCampaign] = useState<InstantlyCampaign | null>(null)
  const [mapping, setMapping] = useState<InstantlyFieldMapping>({ email: '' })
  const [isLinking, setIsLinking] = useState(false)

  // Fetch campaigns
  const { data: campaignsData, isLoading } = useQuery({
    queryKey: ['instantly-campaigns', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('instantly-admin', {
        body: { action: 'list_campaigns', org_id: orgId, limit: 100 },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data?.campaigns ?? []
    },
    enabled: open && !!orgId,
  })

  const campaigns = useMemo(() => {
    const list = campaignsData ?? []
    if (!search) return list
    const q = search.toLowerCase()
    return list.filter((c: InstantlyCampaign) => c.name?.toLowerCase().includes(q))
  }, [campaignsData, search])

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
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search campaigns..."
                className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-9 pr-3 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
              />
            </div>

            {/* Campaign list */}
            <div className="max-h-[320px] overflow-y-auto space-y-1">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : campaigns.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  {search ? 'No campaigns match your search' : 'No campaigns found in Instantly'}
                </p>
              ) : (
                campaigns.map((campaign: InstantlyCampaign) => (
                  <button
                    key={campaign.id}
                    onClick={() => handleSelectCampaign(campaign)}
                    className="flex w-full items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2.5 text-left transition-colors hover:border-blue-500/40 hover:bg-blue-500/5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{campaign.name}</p>
                      <span className={`mt-0.5 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${campaignStatusColor(campaign.status)}`}>
                        {campaignStatusLabel(campaign.status)}
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-600" />
                  </button>
                ))
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
