import { useState, useMemo } from 'react'
import { Helmet } from 'react-helmet-async'
import {
  Eye,
  Image,
  Video,
  Film,
  FileText,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  Trophy,
  TrendingUp,
  LayoutGrid,
  Clock,
  Star,
  Loader2,
  ExternalLink,
  ChevronDown,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { useAdLibrary } from '@/lib/hooks/useAdLibrary'
import type { AdLibraryAd, WatchlistEntry, AdCluster, AdTrend } from '@/lib/services/adLibraryService'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MEDIA_TYPE_ICONS: Record<string, typeof Image> = {
  image: Image,
  video: Video,
  carousel: Film,
  text: FileText,
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function truncate(text: string | null, maxLen: number): string {
  if (!text) return ''
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
}

// ---------------------------------------------------------------------------
// Ad Card
// ---------------------------------------------------------------------------

function AdCard({ ad, onClick }: { ad: AdLibraryAd; onClick: () => void }) {
  const MediaIcon = MEDIA_TYPE_ICONS[ad.media_type] ?? FileText

  return (
    <Card
      className="group cursor-pointer border-zinc-800/60 bg-zinc-900/60 hover:border-zinc-700 transition-colors"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold text-zinc-100 truncate">
            {ad.advertiser_name}
          </CardTitle>
          <MediaIcon className="h-4 w-4 shrink-0 text-zinc-500" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {ad.headline && (
          <p className="text-sm font-medium text-zinc-200 leading-snug">
            {truncate(ad.headline, 80)}
          </p>
        )}
        {ad.body_text && (
          <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">
            {ad.body_text}
          </p>
        )}

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {ad.cta_text && (
            <Badge variant="secondary" className="text-[10px] font-medium bg-blue-500/10 text-blue-400 border-blue-500/20">
              {ad.cta_text}
            </Badge>
          )}
          {ad.classification?.angle && (
            <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">
              {ad.classification.angle}
            </Badge>
          )}
          {ad.classification?.target_persona && (
            <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">
              {ad.classification.target_persona}
            </Badge>
          )}
          {ad.is_likely_winner && (
            <Badge className="text-[10px] font-medium bg-amber-500/10 text-amber-400 border-amber-500/20">
              <Trophy className="h-3 w-3 mr-0.5" />
              Likely Winner
            </Badge>
          )}
        </div>

        {/* Dates */}
        <div className="flex items-center gap-3 pt-1 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            First: {formatDate(ad.first_seen_at)}
          </span>
          <span>Last: {formatDate(ad.last_seen_at)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Ad Detail Sheet
// ---------------------------------------------------------------------------

function AdDetailSheet({
  ad,
  open,
  onClose,
}: {
  ad: AdLibraryAd | null
  open: boolean
  onClose: () => void
}) {
  if (!ad) return null

  const MediaIcon = MEDIA_TYPE_ICONS[ad.media_type] ?? FileText
  const signals = ad.winner_signals ?? []

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="!top-16 !h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-zinc-100">{ad.advertiser_name}</SheetTitle>
          <SheetDescription className="text-zinc-500">
            Ad detail — {ad.media_type} — {ad.capture_source}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Headline */}
          {ad.headline && (
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-1">Headline</p>
              <p className="text-sm text-zinc-200">{ad.headline}</p>
            </div>
          )}

          {/* Body */}
          {ad.body_text && (
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-1">Body</p>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{ad.body_text}</p>
            </div>
          )}

          {/* CTA + Destination */}
          <div className="flex items-center gap-3">
            {ad.cta_text && (
              <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">{ad.cta_text}</Badge>
            )}
            {ad.destination_url && (
              <a
                href={ad.destination_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                {truncate(ad.destination_url, 40)}
              </a>
            )}
          </div>

          {/* Classification */}
          {ad.classification && (
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-2">Classification</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {ad.classification.angle && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                    <span className="text-zinc-500">Angle</span>
                    <p className="text-zinc-200 font-medium">{ad.classification.angle}</p>
                  </div>
                )}
                {ad.classification.target_persona && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                    <span className="text-zinc-500">Persona</span>
                    <p className="text-zinc-200 font-medium">{ad.classification.target_persona}</p>
                  </div>
                )}
                {ad.classification.offer_type && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                    <span className="text-zinc-500">Offer</span>
                    <p className="text-zinc-200 font-medium">{ad.classification.offer_type}</p>
                  </div>
                )}
                {ad.classification.cta_type && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                    <span className="text-zinc-500">CTA Type</span>
                    <p className="text-zinc-200 font-medium">{ad.classification.cta_type}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Winner signals */}
          {ad.is_likely_winner && signals.length > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-2">Winner Signals</p>
              <div className="flex flex-wrap gap-1.5">
                {signals.map((s: any, i: number) => (
                  <Badge key={i} variant="outline" className="text-[10px] text-amber-400 border-amber-500/30">
                    <Star className="h-3 w-3 mr-0.5" />
                    {typeof s === 'string' ? s : s.label || s.signal || JSON.stringify(s)}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center gap-4 pt-2 text-xs text-zinc-500 border-t border-zinc-800">
            <span>Media: {ad.media_type}</span>
            {ad.geography && <span>Geo: {ad.geography}</span>}
            <span>First seen: {formatDate(ad.first_seen_at)}</span>
            <span>Last seen: {formatDate(ad.last_seen_at)}</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Manual Ad Submission Sheet
// ---------------------------------------------------------------------------

function ManualAdSheet({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (ad: {
    advertiser: string
    headline?: string
    body_text?: string
    cta_text?: string
    destination_url?: string
    media_type?: string
  }) => Promise<void>
}) {
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    advertiser: '',
    headline: '',
    body_text: '',
    cta_text: '',
    destination_url: '',
    media_type: 'image',
  })

  const handleSubmit = async () => {
    if (!form.advertiser.trim()) {
      toast.error('Advertiser name is required')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        advertiser: form.advertiser.trim(),
        headline: form.headline.trim() || undefined,
        body_text: form.body_text.trim() || undefined,
        cta_text: form.cta_text.trim() || undefined,
        destination_url: form.destination_url.trim() || undefined,
        media_type: form.media_type,
      })
      setForm({ advertiser: '', headline: '', body_text: '', cta_text: '', destination_url: '', media_type: 'image' })
      onClose()
    } catch {
      // toast handled by hook
    } finally {
      setSubmitting(false)
    }
  }

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }))

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="!top-16 !h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-zinc-100">Submit Ad Manually</SheetTitle>
          <SheetDescription className="text-zinc-500">
            Paste ad details you found on LinkedIn
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1 block">Advertiser Name *</label>
            <Input
              value={form.advertiser}
              onChange={(e) => update('advertiser', e.target.value)}
              placeholder="e.g. Salesforce"
              className="bg-zinc-900 border-zinc-800"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1 block">Headline</label>
            <Input
              value={form.headline}
              onChange={(e) => update('headline', e.target.value)}
              placeholder="Ad headline"
              className="bg-zinc-900 border-zinc-800"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1 block">Body Text</label>
            <textarea
              value={form.body_text}
              onChange={(e) => update('body_text', e.target.value)}
              placeholder="Ad body copy"
              rows={4}
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1 block">CTA Text</label>
            <Input
              value={form.cta_text}
              onChange={(e) => update('cta_text', e.target.value)}
              placeholder="e.g. Learn More"
              className="bg-zinc-900 border-zinc-800"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1 block">Destination URL</label>
            <Input
              value={form.destination_url}
              onChange={(e) => update('destination_url', e.target.value)}
              placeholder="https://..."
              className="bg-zinc-900 border-zinc-800"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1 block">Media Type</label>
            <Select value={form.media_type} onValueChange={(v) => update('media_type', v)}>
              <SelectTrigger className="bg-zinc-900 border-zinc-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="carousel">Carousel</SelectItem>
                <SelectItem value="text">Text</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleSubmit} disabled={submitting} className="w-full mt-2">
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Ad
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Gallery Tab
// ---------------------------------------------------------------------------

function GalleryTab({
  ads,
  totalAds,
  loading,
  onSearch,
  onLoadMore,
  onSelectAd,
  onOpenManual,
}: {
  ads: AdLibraryAd[]
  totalAds: number
  loading: boolean
  onSearch: (params: any) => void
  onLoadMore: () => void
  onSelectAd: (ad: AdLibraryAd) => void
  onOpenManual: () => void
}) {
  const [query, setQuery] = useState('')
  const [advertiser, setAdvertiser] = useState('')
  const [mediaType, setMediaType] = useState('all')
  const [angle, setAngle] = useState('')
  const [persona, setPersona] = useState('')

  const handleSearch = () => {
    onSearch({
      query: query.trim() || undefined,
      advertiser_name: advertiser.trim() || undefined,
      media_type: mediaType !== 'all' ? mediaType : undefined,
      angle: angle.trim() || undefined,
      persona: persona.trim() || undefined,
      page: 0,
      page_size: 20,
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const clearFilters = () => {
    setQuery('')
    setAdvertiser('')
    setMediaType('all')
    setAngle('')
    setPersona('')
    onSearch({ page: 0, page_size: 20 })
  }

  const hasFilters = query || advertiser || mediaType !== 'all' || angle || persona

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search ads by keyword..."
            className="pl-9 bg-zinc-900 border-zinc-800"
          />
        </div>
        <Button onClick={handleSearch} size="sm">
          <Search className="h-4 w-4 mr-1.5" />
          Search
        </Button>
        <Button variant="outline" size="sm" onClick={onOpenManual}>
          <Plus className="h-4 w-4 mr-1.5" />
          Submit Ad
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={advertiser}
          onChange={(e) => setAdvertiser(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Advertiser"
          className="w-40 bg-zinc-900 border-zinc-800 text-xs h-8"
        />
        <Select value={mediaType} onValueChange={setMediaType}>
          <SelectTrigger className="w-32 bg-zinc-900 border-zinc-800 text-xs h-8">
            <SelectValue placeholder="Media type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All media</SelectItem>
            <SelectItem value="image">Image</SelectItem>
            <SelectItem value="video">Video</SelectItem>
            <SelectItem value="carousel">Carousel</SelectItem>
            <SelectItem value="text">Text</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={angle}
          onChange={(e) => setAngle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Angle"
          className="w-32 bg-zinc-900 border-zinc-800 text-xs h-8"
        />
        <Input
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Persona"
          className="w-32 bg-zinc-900 border-zinc-800 text-xs h-8"
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs text-zinc-500 hover:text-zinc-300">
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
        <span className="ml-auto text-xs text-zinc-500">{totalAds} ads found</span>
      </div>

      {/* Grid */}
      {loading && ads.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="border-zinc-800/60 bg-zinc-900/60">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-2/3" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
                <div className="flex gap-1.5 pt-1">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : ads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-700/50 bg-gradient-to-br from-blue-500/10 to-purple-500/10 mb-4">
            <Eye className="h-6 w-6 text-zinc-500" />
          </div>
          <h3 className="text-base font-semibold text-zinc-200 mb-1">No ads yet</h3>
          <p className="text-sm text-zinc-500 max-w-sm">
            Add competitors to your watchlist to start capturing their LinkedIn ads, or submit an ad manually.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {ads.map((ad) => (
              <AdCard key={ad.id} ad={ad} onClick={() => onSelectAd(ad)} />
            ))}
          </div>

          {/* Load more */}
          {ads.length < totalAds && (
            <div className="flex justify-center pt-4">
              <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ChevronDown className="h-4 w-4 mr-2" />
                )}
                Load more ({ads.length} of {totalAds})
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Watchlist Tab
// ---------------------------------------------------------------------------

function WatchlistTab({
  watchlist,
  loading,
  onAdd,
  onRemove,
  onCapture,
}: {
  watchlist: WatchlistEntry[]
  loading: boolean
  onAdd: (entry: { competitor_name: string; competitor_linkedin_url?: string; competitor_website?: string; capture_frequency?: string }) => Promise<any>
  onRemove: (id: string) => Promise<void>
  onCapture: (name: string, url?: string) => Promise<any>
}) {
  const [name, setName] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [website, setWebsite] = useState('')
  const [frequency, setFrequency] = useState('daily')
  const [adding, setAdding] = useState(false)
  const [capturingId, setCapturingId] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!name.trim()) {
      toast.error('Competitor name is required')
      return
    }
    setAdding(true)
    try {
      await onAdd({
        competitor_name: name.trim(),
        competitor_linkedin_url: linkedinUrl.trim() || undefined,
        competitor_website: website.trim() || undefined,
        capture_frequency: frequency,
      })
      setName('')
      setLinkedinUrl('')
      setWebsite('')
    } catch {
      // handled by hook
    } finally {
      setAdding(false)
    }
  }

  const handleCapture = async (entry: WatchlistEntry) => {
    setCapturingId(entry.id)
    try {
      await onCapture(entry.competitor_name, entry.competitor_linkedin_url ?? undefined)
    } catch {
      // handled by hook
    } finally {
      setCapturingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Add form */}
      <Card className="border-zinc-800/60 bg-zinc-900/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-zinc-100">Add Competitor</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs text-zinc-500 mb-1 block">Name *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Competitor name"
                className="bg-zinc-950 border-zinc-800"
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs text-zinc-500 mb-1 block">LinkedIn URL</label>
              <Input
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://linkedin.com/company/..."
                className="bg-zinc-950 border-zinc-800"
              />
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="text-xs text-zinc-500 mb-1 block">Website</label>
              <Input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://..."
                className="bg-zinc-950 border-zinc-800"
              />
            </div>
            <div className="w-28">
              <label className="text-xs text-zinc-500 mb-1 block">Frequency</label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAdd} disabled={adding} size="sm">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Watchlist entries */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : watchlist.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Eye className="h-8 w-8 text-zinc-600 mb-3" />
          <p className="text-sm text-zinc-400">No competitors on your watchlist yet</p>
          <p className="text-xs text-zinc-500 mt-1">Add a competitor above to start tracking their ads</p>
        </div>
      ) : (
        <div className="space-y-2">
          {watchlist.map((entry) => (
            <Card key={entry.id} className="border-zinc-800/60 bg-zinc-900/60">
              <CardContent className="flex items-center gap-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-100 truncate">{entry.competitor_name}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-zinc-500">
                    {entry.competitor_linkedin_url && (
                      <a
                        href={entry.competitor_linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-blue-400 flex items-center gap-0.5"
                      >
                        <ExternalLink className="h-3 w-3" /> LinkedIn
                      </a>
                    )}
                    {entry.competitor_website && (
                      <a
                        href={entry.competitor_website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-blue-400 flex items-center gap-0.5"
                      >
                        <ExternalLink className="h-3 w-3" /> Website
                      </a>
                    )}
                    <span>Freq: {entry.capture_frequency}</span>
                    <span>{entry.total_ads_captured} ads</span>
                    {entry.last_captured_at && (
                      <span>Last: {formatDate(entry.last_captured_at)}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    variant={entry.is_active ? 'default' : 'secondary'}
                    className={entry.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'text-zinc-500'}
                  >
                    {entry.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCapture(entry)}
                    disabled={capturingId === entry.id}
                  >
                    {capturingId === entry.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    )}
                    Capture Now
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(entry.id)}
                    className="text-zinc-500 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Clusters Tab
// ---------------------------------------------------------------------------

function ClustersTab({
  clusters,
  loading,
  onFetch,
  onFilterGallery,
}: {
  clusters: AdCluster[]
  loading: boolean
  onFetch: (dimension?: string) => void
  onFilterGallery: (dimension: string, value: string) => void
}) {
  const [dimension, setDimension] = useState('angle')

  const handleDimensionChange = (d: string) => {
    setDimension(d)
    onFetch(d)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-sm text-zinc-400">Group by:</p>
        <Select value={dimension} onValueChange={handleDimensionChange}>
          <SelectTrigger className="w-44 bg-zinc-900 border-zinc-800">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="angle">Angle</SelectItem>
            <SelectItem value="target_persona">Persona</SelectItem>
            <SelectItem value="offer_type">Offer Type</SelectItem>
            <SelectItem value="cta_type">CTA Type</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : clusters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <LayoutGrid className="h-8 w-8 text-zinc-600 mb-3" />
          <p className="text-sm text-zinc-400">No clusters found</p>
          <p className="text-xs text-zinc-500 mt-1">Ads need to be classified before clustering works</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clusters.map((cluster) => (
            <Card
              key={`${cluster.dimension}-${cluster.value}`}
              className="border-zinc-800/60 bg-zinc-900/60 cursor-pointer hover:border-zinc-700 transition-colors"
              onClick={() => onFilterGallery(cluster.dimension, cluster.value)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-zinc-100">{cluster.value || 'Unclassified'}</CardTitle>
                  <Badge variant="secondary" className="text-[10px]">{cluster.count} ads</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {cluster.sample_ads.length > 0 ? (
                  <div className="space-y-1.5">
                    {cluster.sample_ads.slice(0, 3).map((ad) => (
                      <p key={ad.id} className="text-xs text-zinc-400 truncate">
                        {ad.advertiser_name}: {ad.headline || ad.body_text?.slice(0, 60) || 'No text'}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 italic">No sample ads</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trends Tab
// ---------------------------------------------------------------------------

function TrendsTab({
  trends,
  loading,
  onFetch,
}: {
  trends: AdTrend[]
  loading: boolean
  onFetch: (dimension?: string) => void
}) {
  const [dimension, setDimension] = useState('angle')

  const handleDimensionChange = (d: string) => {
    setDimension(d)
    onFetch(d)
  }

  // Aggregate trends by value across weeks to show growth
  const aggregated = useMemo(() => {
    if (trends.length === 0) return []

    const byValue = new Map<string, { weeks: Map<string, number>; total: number }>()
    for (const t of trends) {
      if (!byValue.has(t.value)) byValue.set(t.value, { weeks: new Map(), total: 0 })
      const entry = byValue.get(t.value)!
      entry.weeks.set(t.week, t.count)
      entry.total += t.count
    }

    const weeks = [...new Set(trends.map((t) => t.week))].sort()
    const currentWeek = weeks[weeks.length - 1]
    const prevWeek = weeks.length >= 2 ? weeks[weeks.length - 2] : null

    return [...byValue.entries()]
      .map(([value, data]) => {
        const current = data.weeks.get(currentWeek!) ?? 0
        const previous = prevWeek ? (data.weeks.get(prevWeek) ?? 0) : 0
        const growth = previous > 0 ? Math.round(((current - previous) / previous) * 100) : current > 0 ? 100 : 0
        return { value, current, previous, growth, total: data.total }
      })
      .sort((a, b) => b.growth - a.growth)
  }, [trends])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-sm text-zinc-400">Trend dimension:</p>
        <Select value={dimension} onValueChange={handleDimensionChange}>
          <SelectTrigger className="w-44 bg-zinc-900 border-zinc-800">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="angle">Angle</SelectItem>
            <SelectItem value="target_persona">Persona</SelectItem>
            <SelectItem value="offer_type">Offer Type</SelectItem>
            <SelectItem value="cta_type">CTA Type</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : aggregated.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <TrendingUp className="h-8 w-8 text-zinc-600 mb-3" />
          <p className="text-sm text-zinc-400">No trend data yet</p>
          <p className="text-xs text-zinc-500 mt-1">Trends appear as ads are captured and classified over time</p>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-800/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800/60 bg-zinc-900/40">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-500">Value</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-zinc-500">This Week</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-zinc-500">Last Week</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-zinc-500">Growth</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-zinc-500">Total</th>
              </tr>
            </thead>
            <tbody>
              {aggregated.map((row) => (
                <tr key={row.value} className="border-b border-zinc-800/30 hover:bg-zinc-900/40">
                  <td className="px-4 py-2.5 text-zinc-200 font-medium">{row.value || 'Unclassified'}</td>
                  <td className="px-4 py-2.5 text-right text-zinc-300">{row.current}</td>
                  <td className="px-4 py-2.5 text-right text-zinc-400">{row.previous}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className={
                        row.growth > 0
                          ? 'text-emerald-400'
                          : row.growth < 0
                          ? 'text-red-400'
                          : 'text-zinc-500'
                      }
                    >
                      {row.growth > 0 ? '+' : ''}
                      {row.growth}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-400">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Winners Tab
// ---------------------------------------------------------------------------

function WinnersTab({
  winners,
  loading,
  onSelectAd,
}: {
  winners: AdLibraryAd[]
  loading: boolean
  onSelectAd: (ad: AdLibraryAd) => void
}) {
  const SIGNAL_LABELS: Record<string, string> = {
    'long-running': 'Long-running',
    'many-variants': 'Many variants',
    'recurring': 'Recurring',
    'high-creative-investment': 'High creative investment',
  }

  return (
    <div>
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-zinc-800/60 bg-zinc-900/60">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-2/3" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <div className="flex gap-1.5 pt-1">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : winners.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Trophy className="h-8 w-8 text-zinc-600 mb-3" />
          <p className="text-sm text-zinc-400">No likely winners detected yet</p>
          <p className="text-xs text-zinc-500 mt-1">
            Winners are identified from ads that run longest, have many variants, or show recurring patterns
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {winners.map((ad) => {
            const signals = ad.winner_signals ?? []
            return (
              <Card
                key={ad.id}
                className="group cursor-pointer border-amber-500/20 bg-zinc-900/60 hover:border-amber-500/40 transition-colors"
                onClick={() => onSelectAd(ad)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold text-zinc-100 truncate">
                      {ad.advertiser_name}
                    </CardTitle>
                    <Trophy className="h-4 w-4 shrink-0 text-amber-400" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {ad.headline && (
                    <p className="text-sm font-medium text-zinc-200 leading-snug">
                      {truncate(ad.headline, 80)}
                    </p>
                  )}
                  {ad.body_text && (
                    <p className="text-xs text-zinc-400 line-clamp-2">{ad.body_text}</p>
                  )}

                  {/* Winner signal badges */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {signals.map((s: any, i: number) => {
                      const label = typeof s === 'string'
                        ? (SIGNAL_LABELS[s] || s)
                        : (s.label || s.signal || JSON.stringify(s))
                      return (
                        <Badge key={i} className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">
                          <Star className="h-3 w-3 mr-0.5" />
                          {label}
                        </Badge>
                      )
                    })}
                  </div>

                  {/* Dates */}
                  <div className="flex items-center gap-3 pt-1 text-[10px] text-zinc-500">
                    <span>First: {formatDate(ad.first_seen_at)}</span>
                    <span>Last: {formatDate(ad.last_seen_at)}</span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AdLibrary() {
  const {
    ads,
    loading,
    totalAds,
    searchAds,
    loadMore,
    watchlist,
    watchlistLoading,
    addCompetitor,
    removeCompetitor,
    captureCompetitor,
    submitManualAd,
    clusters,
    clustersLoading,
    fetchClusters,
    trends,
    trendsLoading,
    fetchTrends,
    likelyWinners,
    winnersLoading,
  } = useAdLibrary()

  const [selectedAd, setSelectedAd] = useState<AdLibraryAd | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('gallery')

  const handleSelectAd = (ad: AdLibraryAd) => {
    setSelectedAd(ad)
    setDetailOpen(true)
  }

  const handleClusterFilter = (dimension: string, value: string) => {
    // Switch to gallery tab with the cluster filter applied
    const params: Record<string, string | undefined> = { page: '0', page_size: '20' }
    if (dimension === 'angle') params.angle = value
    else if (dimension === 'target_persona') params.persona = value
    else if (dimension === 'offer_type') params.offer_type = value

    setActiveTab('gallery')
    searchAds({
      angle: params.angle,
      persona: params.persona,
      offer_type: params.offer_type,
      page: 0,
      page_size: 20,
    })
  }

  const handleManualSubmit = async (ad: {
    advertiser: string
    headline?: string
    body_text?: string
    cta_text?: string
    destination_url?: string
    media_type?: string
  }) => {
    await submitManualAd(ad)
  }

  return (
    <>
      <Helmet>
        <title>Ad Intelligence | 60</title>
      </Helmet>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-800/60 bg-gradient-to-br from-violet-500/20 to-pink-500/20">
            <Eye className="h-6 w-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">Ad Intelligence</h1>
            <p className="text-sm text-zinc-500">
              Track competitor LinkedIn ads, spot winning patterns, and steal what works
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="gallery" className="gap-1.5">
              <LayoutGrid className="h-3.5 w-3.5" />
              Gallery
            </TabsTrigger>
            <TabsTrigger value="watchlist" className="gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              Watchlist
            </TabsTrigger>
            <TabsTrigger value="clusters" className="gap-1.5">
              <LayoutGrid className="h-3.5 w-3.5" />
              Clusters
            </TabsTrigger>
            <TabsTrigger value="trends" className="gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Trends
            </TabsTrigger>
            <TabsTrigger value="winners" className="gap-1.5">
              <Trophy className="h-3.5 w-3.5" />
              Winners
            </TabsTrigger>
          </TabsList>

          <TabsContent value="gallery">
            <GalleryTab
              ads={ads}
              totalAds={totalAds}
              loading={loading}
              onSearch={searchAds}
              onLoadMore={loadMore}
              onSelectAd={handleSelectAd}
              onOpenManual={() => setManualOpen(true)}
            />
          </TabsContent>

          <TabsContent value="watchlist">
            <WatchlistTab
              watchlist={watchlist}
              loading={watchlistLoading}
              onAdd={addCompetitor}
              onRemove={removeCompetitor}
              onCapture={captureCompetitor}
            />
          </TabsContent>

          <TabsContent value="clusters">
            <ClustersTab
              clusters={clusters}
              loading={clustersLoading}
              onFetch={fetchClusters}
              onFilterGallery={handleClusterFilter}
            />
          </TabsContent>

          <TabsContent value="trends">
            <TrendsTab
              trends={trends}
              loading={trendsLoading}
              onFetch={fetchTrends}
            />
          </TabsContent>

          <TabsContent value="winners">
            <WinnersTab
              winners={likelyWinners}
              loading={winnersLoading}
              onSelectAd={handleSelectAd}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Detail sheet */}
      <AdDetailSheet ad={selectedAd} open={detailOpen} onClose={() => setDetailOpen(false)} />

      {/* Manual submission sheet */}
      <ManualAdSheet open={manualOpen} onClose={() => setManualOpen(false)} onSubmit={handleManualSubmit} />
    </>
  )
}
