import { useState, useEffect, useRef, useCallback } from 'react'
import { Image, Wand2, Eye, AlertTriangle, Loader2, Plus, X, Upload } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { useLinkedInAdManager } from '@/lib/hooks/useLinkedInAdManager'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreativeBuilderProps {
  campaignId: string
  campaignObjective: string
  onCreativeCreated?: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEADLINE_MAX = 70
const BODY_MAX = 300
const MAX_CREATIVES_PER_CAMPAIGN = 15

const CTA_OPTIONS = [
  'Apply Now',
  'Download',
  'Get Quote',
  'Learn More',
  'Sign Up',
  'Subscribe',
  'Register',
  'Join',
  'Attend',
  'Request Demo',
]

/** Placeholder copy keyed by objective — will be replaced by real AI later. */
const AI_COPY: Record<string, { headline: string; body: string }> = {
  LEAD_GEN: {
    headline: 'Unlock Growth — Get Your Free Strategy Guide',
    body: 'Discover the playbook top-performing teams use to fill their pipeline. Download our step-by-step guide and start converting more leads into revenue today.',
  },
  WEBSITE_VISITS: {
    headline: 'See How Top Teams Win More Deals',
    body: 'Your competitors are already using smarter outreach. Visit our site to see the framework that helped 500+ teams double their response rates in 60 days.',
  },
  CONVERSIONS: {
    headline: 'Turn Clicks Into Customers',
    body: 'Every click is an opportunity. Our conversion-optimized approach helps you capture demand at the moment of intent. See the results for yourself.',
  },
  ENGAGEMENT: {
    headline: 'Join the Conversation on Modern Sales',
    body: 'The way buyers purchase is changing. We are sharing the insights, data, and stories that sales leaders actually care about. Follow along and join the discussion.',
  },
  BRAND_AWARENESS: {
    headline: 'Meet the Platform Behind the Pipeline',
    body: 'Great sales teams deserve great tools. We are building the AI command center that handles everything before and after the call so you can focus on closing.',
  },
  VIDEO_VIEWS: {
    headline: 'Watch: The 60-Second Sales Advantage',
    body: 'In under a minute, see how leading sales teams automate follow-ups, prep for meetings, and keep deals moving — all from one place.',
  },
}

const DEFAULT_COPY: { headline: string; body: string } = {
  headline: 'Drive Results With Smarter Outreach',
  body: 'Reach your ideal audience where they spend their professional time. Our proven approach helps teams generate more pipeline with less effort.',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CreativeBuilder({
  campaignId,
  campaignObjective,
  onCreativeCreated,
}: CreativeBuilderProps) {
  const { createCreative, creatives, creativesLoading, loadCreatives } = useLinkedInAdManager()

  // Form state
  const [headline, setHeadline] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [ctaText, setCtaText] = useState('Learn More')
  const [destinationUrl, setDestinationUrl] = useState('')
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load creatives for this campaign on mount
  useEffect(() => {
    loadCreatives(campaignId)
  }, [campaignId, loadCreatives])

  // Cleanup object URL on unmount or file change
  useEffect(() => {
    return () => {
      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl)
    }
  }, [mediaPreviewUrl])

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const headlineOverLimit = headline.length > HEADLINE_MAX
  const bodyOverLimit = bodyText.length > BODY_MAX
  const activeCreativeCount = creatives.filter((c) => c.status === 'ACTIVE' || c.status === 'DRAFT').length
  const atCreativeLimit = activeCreativeCount >= MAX_CREATIVES_PER_CAMPAIGN

  const canSubmit =
    headline.trim().length > 0 &&
    destinationUrl.trim().length > 0 &&
    !headlineOverLimit &&
    !bodyOverLimit &&
    !atCreativeLimit &&
    !submitting

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl)
    setMediaFile(file)
    setMediaPreviewUrl(file ? URL.createObjectURL(file) : null)
  }, [mediaPreviewUrl])

  const clearMedia = useCallback(() => {
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl)
    setMediaFile(null)
    setMediaPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [mediaPreviewUrl])

  const handleAiGenerate = useCallback(() => {
    const copy = AI_COPY[campaignObjective] ?? DEFAULT_COPY
    setHeadline(copy.headline)
    setBodyText(copy.body)
  }, [campaignObjective])

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const result = await createCreative({
        campaign_id: campaignId,
        headline: headline.trim(),
        body_text: bodyText.trim() || undefined,
        cta_text: ctaText || undefined,
        destination_url: destinationUrl.trim(),
        media_type: mediaFile?.type.startsWith('video/') ? 'VIDEO' : 'IMAGE',
      })
      if (result) {
        // Reset form
        setHeadline('')
        setBodyText('')
        setCtaText('Learn More')
        setDestinationUrl('')
        clearMedia()
        setShowPreview(false)
        onCreativeCreated?.()
      }
    } finally {
      setSubmitting(false)
    }
  }, [canSubmit, createCreative, campaignId, headline, bodyText, ctaText, destinationUrl, mediaFile, clearMedia, onCreativeCreated])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Active creative count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-zinc-700 text-zinc-300">
            {creativesLoading ? '...' : activeCreativeCount} / {MAX_CREATIVES_PER_CAMPAIGN} creatives
          </Badge>
          {atCreativeLimit && (
            <span className="flex items-center gap-1 text-xs text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              Limit reached
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          onClick={() => setShowPreview(!showPreview)}
        >
          <Eye className="h-4 w-4 mr-1" />
          {showPreview ? 'Hide Preview' : 'Preview'}
        </Button>
      </div>

      <div className={`grid gap-4 ${showPreview ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
        {/* ---- Form ---- */}
        <Card className="bg-zinc-900/60 border-zinc-800/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-200 flex items-center gap-2">
              <Image className="h-4 w-4 text-blue-400" />
              New Creative
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Media upload */}
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Media</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleFileChange}
                className="hidden"
              />
              {mediaPreviewUrl ? (
                <div className="relative group">
                  {mediaFile?.type.startsWith('video/') ? (
                    <video
                      src={mediaPreviewUrl}
                      className="w-full h-40 object-cover rounded-md border border-zinc-700"
                      muted
                    />
                  ) : (
                    <img
                      src={mediaPreviewUrl}
                      alt="Creative media"
                      className="w-full h-40 object-cover rounded-md border border-zinc-700"
                    />
                  )}
                  <button
                    type="button"
                    onClick={clearMedia}
                    className="absolute top-2 right-2 p-1 rounded-full bg-zinc-900/80 text-zinc-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-28 flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-400 transition-colors"
                >
                  <Upload className="h-5 w-5" />
                  <span className="text-xs">Upload image or video</span>
                </button>
              )}
            </div>

            {/* Headline */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="cb-headline" className="text-xs text-zinc-400">
                  Headline
                </Label>
                <span
                  className={`text-xs ${headlineOverLimit ? 'text-red-400' : 'text-zinc-500'}`}
                >
                  {headline.length}/{HEADLINE_MAX}
                </span>
              </div>
              <Input
                id="cb-headline"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="Enter headline..."
                className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              />
              {headlineOverLimit && (
                <p className="flex items-center gap-1 text-xs text-red-400">
                  <AlertTriangle className="h-3 w-3" />
                  Headline exceeds {HEADLINE_MAX} character limit
                </p>
              )}
            </div>

            {/* Body text */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="cb-body" className="text-xs text-zinc-400">
                  Body Text
                </Label>
                <span
                  className={`text-xs ${bodyOverLimit ? 'text-red-400' : 'text-zinc-500'}`}
                >
                  {bodyText.length}/{BODY_MAX}
                </span>
              </div>
              <Textarea
                id="cb-body"
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Describe your offer or message..."
                rows={4}
                className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 resize-none"
              />
              {bodyOverLimit && (
                <p className="flex items-center gap-1 text-xs text-red-400">
                  <AlertTriangle className="h-3 w-3" />
                  Body text exceeds {BODY_MAX} character limit
                </p>
              )}
            </div>

            {/* CTA */}
            <div className="space-y-2">
              <Label htmlFor="cb-cta" className="text-xs text-zinc-400">
                Call to Action
              </Label>
              <select
                id="cb-cta"
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-800/50 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                {CTA_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* Destination URL */}
            <div className="space-y-2">
              <Label htmlFor="cb-url" className="text-xs text-zinc-400">
                Destination URL
              </Label>
              <Input
                id="cb-url"
                value={destinationUrl}
                onChange={(e) => setDestinationUrl(e.target.value)}
                placeholder="https://..."
                type="url"
                className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                onClick={handleAiGenerate}
              >
                <Wand2 className="h-4 w-4 mr-1" />
                AI Generate
              </Button>
              <Button
                size="sm"
                disabled={!canSubmit}
                onClick={handleSubmit}
                className="ml-auto"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                Create Creative
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ---- Preview ---- */}
        {showPreview && (
          <Card className="bg-zinc-900/60 border-zinc-800/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-zinc-200 flex items-center gap-2">
                <Eye className="h-4 w-4 text-purple-400" />
                Desktop Feed Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-zinc-700 bg-zinc-950 overflow-hidden">
                {/* Sponsor header */}
                <div className="flex items-center gap-2 px-4 pt-3 pb-2">
                  <div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 text-xs font-semibold">
                    60
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">Your Company</p>
                    <p className="text-xs text-zinc-500">Promoted</p>
                  </div>
                </div>

                {/* Body text */}
                <div className="px-4 pb-3">
                  <p className="text-sm text-zinc-300 whitespace-pre-wrap line-clamp-4">
                    {bodyText || (
                      <span className="text-zinc-600 italic">Body text will appear here...</span>
                    )}
                  </p>
                </div>

                {/* Media area */}
                <div className="w-full aspect-[1.91/1] bg-zinc-800 flex items-center justify-center relative overflow-hidden">
                  {mediaPreviewUrl ? (
                    mediaFile?.type.startsWith('video/') ? (
                      <video
                        src={mediaPreviewUrl}
                        className="w-full h-full object-cover"
                        muted
                      />
                    ) : (
                      <img
                        src={mediaPreviewUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    )
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-zinc-600">
                      <Image className="h-8 w-8" />
                      <span className="text-xs">Image preview</span>
                    </div>
                  )}
                </div>

                {/* Headline + CTA row */}
                <div className="px-4 py-3 flex items-start justify-between gap-3 border-t border-zinc-800">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">
                      {headline || (
                        <span className="text-zinc-600 italic">Headline...</span>
                      )}
                    </p>
                    {destinationUrl && (
                      <p className="text-xs text-zinc-500 truncate mt-0.5">{destinationUrl}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 px-4 py-1.5 rounded-full border border-blue-500 text-blue-400 text-xs font-semibold hover:bg-blue-500/10 transition-colors"
                    tabIndex={-1}
                  >
                    {ctaText || 'Learn More'}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
