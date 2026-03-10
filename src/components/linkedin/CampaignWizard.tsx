import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  Target, Image, Users, DollarSign, CalendarDays, ClipboardCheck,
  ChevronDown, Shield, Plus, Loader2, X, RefreshCw, Check,
  Megaphone, MousePointerClick, Eye, Video, LayoutGrid, Type, Zap,
  ArrowLeft, ArrowRight, Upload, FileImage, FileVideo, Link2, Pencil,
  Globe, ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import type { MatchedAudience, AudienceEstimate } from '@/lib/services/linkedinAdManagerService'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEP_LABELS = [
  { key: 'objective', label: 'Objective', icon: Target },
  { key: 'format', label: 'Format', icon: Image },
  { key: 'creative', label: 'Creative', icon: Pencil },
  { key: 'targeting', label: 'Targeting', icon: Users },
  { key: 'budget', label: 'Budget', icon: DollarSign },
  { key: 'schedule', label: 'Schedule', icon: CalendarDays },
  { key: 'review', label: 'Review', icon: ClipboardCheck },
] as const

const TOTAL_STEPS = STEP_LABELS.length

const OBJECTIVES = [
  { value: 'LEAD_GEN', label: 'Lead Generation', description: 'Collect leads via LinkedIn forms', icon: Users },
  { value: 'WEBSITE_VISITS', label: 'Website Visits', description: 'Drive traffic to your website', icon: MousePointerClick },
  { value: 'CONVERSIONS', label: 'Conversions', description: 'Drive specific actions on your website', icon: Target },
  { value: 'ENGAGEMENT', label: 'Engagement', description: 'Get more likes, comments, and shares', icon: Megaphone },
  { value: 'BRAND_AWARENESS', label: 'Brand Awareness', description: 'Reach a broad audience', icon: Eye },
  { value: 'VIDEO_VIEWS', label: 'Video Views', description: 'Promote video content', icon: Video },
]

const FORMATS = [
  { value: 'SINGLE_IMAGE', label: 'Single Image', icon: Image, objectives: ['LEAD_GEN', 'WEBSITE_VISITS', 'CONVERSIONS', 'ENGAGEMENT', 'BRAND_AWARENESS'] },
  { value: 'CAROUSEL', label: 'Carousel', icon: LayoutGrid, objectives: ['LEAD_GEN', 'WEBSITE_VISITS', 'CONVERSIONS', 'ENGAGEMENT', 'BRAND_AWARENESS'] },
  { value: 'VIDEO', label: 'Video', icon: Video, objectives: ['LEAD_GEN', 'WEBSITE_VISITS', 'CONVERSIONS', 'ENGAGEMENT', 'BRAND_AWARENESS', 'VIDEO_VIEWS'] },
  { value: 'TEXT_AD', label: 'Text Ad', icon: Type, objectives: ['WEBSITE_VISITS', 'CONVERSIONS'] },
  { value: 'DYNAMIC_AD', label: 'Dynamic Ad', icon: Zap, objectives: ['WEBSITE_VISITS', 'CONVERSIONS', 'ENGAGEMENT', 'BRAND_AWARENESS'] },
]

const BID_STRATEGIES = [
  { value: 'MANUAL_CPC', label: 'Manual CPC', description: 'Pay per click — you set the max bid' },
  { value: 'MANUAL_CPM', label: 'Manual CPM', description: 'Pay per 1,000 impressions' },
  { value: 'TARGET_COST', label: 'Target Cost', description: 'LinkedIn optimizes to your target cost' },
]

const CTA_OPTIONS = [
  { value: 'FOLLOW', label: 'Follow' },
  { value: 'LEARN_MORE', label: 'Learn More' },
  { value: 'SIGN_UP', label: 'Sign Up' },
  { value: 'SUBSCRIBE', label: 'Subscribe' },
  { value: 'REGISTER', label: 'Register' },
  { value: 'DOWNLOAD', label: 'Download' },
  { value: 'APPLY', label: 'Apply' },
  { value: 'GET_QUOTE', label: 'Get Quote' },
  { value: 'REQUEST_DEMO', label: 'Request Demo' },
]

const FORMAT_MEDIA_CONFIG: Record<string, { accept: string; fileTypes: string; recommendation: string }> = {
  SINGLE_IMAGE: {
    accept: 'image/jpeg,image/png,image/gif',
    fileTypes: 'JPG, PNG, or GIF',
    recommendation: '1200 x 628px recommended. Max 5MB.',
  },
  CAROUSEL: {
    accept: 'image/jpeg,image/png,image/gif',
    fileTypes: 'JPG, PNG, or GIF',
    recommendation: '1080 x 1080px per card. Max 5MB each.',
  },
  VIDEO: {
    accept: 'video/mp4',
    fileTypes: 'MP4',
    recommendation: '16:9 or 1:1 aspect ratio. 3s-30min. Max 200MB.',
  },
  TEXT_AD: {
    accept: 'image/jpeg,image/png',
    fileTypes: 'JPG or PNG',
    recommendation: '100 x 100px logo. Max 2MB.',
  },
  DYNAMIC_AD: {
    accept: 'image/jpeg,image/png',
    fileTypes: 'JPG or PNG',
    recommendation: '100 x 100px logo. Max 2MB.',
  },
}

const HEADLINE_MAX = 200
const BODY_MAX = 600

// ---------------------------------------------------------------------------
// LinkedIn Targeting Taxonomy
// ---------------------------------------------------------------------------

const SENIORITIES = [
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'TRAINING', label: 'Training' },
  { value: 'ENTRY', label: 'Entry' },
  { value: 'SENIOR', label: 'Senior' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'DIRECTOR', label: 'Director' },
  { value: 'VP', label: 'VP' },
  { value: 'CXO', label: 'CXO' },
  { value: 'PARTNER', label: 'Partner' },
  { value: 'OWNER', label: 'Owner' },
]

const JOB_FUNCTIONS = [
  { value: 'ACCOUNTING', label: 'Accounting' },
  { value: 'ADMINISTRATIVE', label: 'Administrative' },
  { value: 'ARTS_AND_DESIGN', label: 'Arts & Design' },
  { value: 'BUSINESS_DEVELOPMENT', label: 'Business Development' },
  { value: 'COMMUNITY_AND_SOCIAL_SERVICES', label: 'Community & Social Services' },
  { value: 'CONSULTING', label: 'Consulting' },
  { value: 'EDUCATION', label: 'Education' },
  { value: 'ENGINEERING', label: 'Engineering' },
  { value: 'ENTREPRENEURSHIP', label: 'Entrepreneurship' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'HEALTHCARE_SERVICES', label: 'Healthcare Services' },
  { value: 'HUMAN_RESOURCES', label: 'Human Resources' },
  { value: 'INFORMATION_TECHNOLOGY', label: 'Information Technology' },
  { value: 'LEGAL', label: 'Legal' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'MEDIA_AND_COMMUNICATION', label: 'Media & Communication' },
  { value: 'MILITARY_AND_PROTECTIVE_SERVICES', label: 'Military & Protective Services' },
  { value: 'OPERATIONS', label: 'Operations' },
  { value: 'PRODUCT_MANAGEMENT', label: 'Product Management' },
  { value: 'PROGRAM_AND_PROJECT_MANAGEMENT', label: 'Program & Project Management' },
  { value: 'PURCHASING', label: 'Purchasing' },
  { value: 'QUALITY_ASSURANCE', label: 'Quality Assurance' },
  { value: 'REAL_ESTATE', label: 'Real Estate' },
  { value: 'RESEARCH', label: 'Research' },
  { value: 'SALES', label: 'Sales' },
  { value: 'SUPPORT', label: 'Support' },
]

const TARGETING_INDUSTRIES = [
  { value: 'COMPUTER_SOFTWARE', label: 'Computer Software' },
  { value: 'INFORMATION_TECHNOLOGY', label: 'Information Technology & Services' },
  { value: 'FINANCIAL_SERVICES', label: 'Financial Services' },
  { value: 'BANKING', label: 'Banking' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'HOSPITAL_AND_HEALTH_CARE', label: 'Hospital & Health Care' },
  { value: 'PHARMACEUTICALS', label: 'Pharmaceuticals' },
  { value: 'BIOTECHNOLOGY', label: 'Biotechnology' },
  { value: 'MARKETING_AND_ADVERTISING', label: 'Marketing & Advertising' },
  { value: 'MANAGEMENT_CONSULTING', label: 'Management Consulting' },
  { value: 'RETAIL', label: 'Retail' },
  { value: 'CONSUMER_GOODS', label: 'Consumer Goods' },
  { value: 'REAL_ESTATE', label: 'Real Estate' },
  { value: 'CONSTRUCTION', label: 'Construction' },
  { value: 'EDUCATION_MANAGEMENT', label: 'Education Management' },
  { value: 'HIGHER_EDUCATION', label: 'Higher Education' },
  { value: 'TELECOMMUNICATIONS', label: 'Telecommunications' },
  { value: 'MEDIA_AND_ENTERTAINMENT', label: 'Media & Entertainment' },
  { value: 'AUTOMOTIVE', label: 'Automotive' },
  { value: 'MANUFACTURING', label: 'Manufacturing' },
  { value: 'FOOD_AND_BEVERAGES', label: 'Food & Beverages' },
  { value: 'TRANSPORTATION', label: 'Transportation' },
  { value: 'LOGISTICS_AND_SUPPLY_CHAIN', label: 'Logistics & Supply Chain' },
  { value: 'GOVERNMENT', label: 'Government Administration' },
  { value: 'NONPROFIT', label: 'Nonprofit Organization Management' },
  { value: 'LEGAL_SERVICES', label: 'Legal Services' },
  { value: 'ENERGY', label: 'Oil & Energy' },
  { value: 'STAFFING_AND_RECRUITING', label: 'Staffing & Recruiting' },
  { value: 'DESIGN', label: 'Design' },
]

const COMPANY_SIZES = [
  { value: 'SIZE_1', label: 'Myself only (1)' },
  { value: 'SIZE_2_10', label: '2-10 employees' },
  { value: 'SIZE_11_50', label: '11-50 employees' },
  { value: 'SIZE_51_200', label: '51-200 employees' },
  { value: 'SIZE_201_500', label: '201-500 employees' },
  { value: 'SIZE_501_1000', label: '501-1,000 employees' },
  { value: 'SIZE_1001_5000', label: '1,001-5,000 employees' },
  { value: 'SIZE_5001_10000', label: '5,001-10,000 employees' },
  { value: 'SIZE_10001_PLUS', label: '10,001+ employees' },
]

const TARGETING_GEOGRAPHIES = [
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'NL', label: 'Netherlands' },
  { value: 'IE', label: 'Ireland' },
  { value: 'SE', label: 'Sweden' },
  { value: 'DK', label: 'Denmark' },
  { value: 'FI', label: 'Finland' },
  { value: 'CH', label: 'Switzerland' },
  { value: 'AT', label: 'Austria' },
  { value: 'BE', label: 'Belgium' },
  { value: 'ES', label: 'Spain' },
  { value: 'IT', label: 'Italy' },
  { value: 'PT', label: 'Portugal' },
  { value: 'PL', label: 'Poland' },
  { value: 'IN', label: 'India' },
  { value: 'SG', label: 'Singapore' },
  { value: 'JP', label: 'Japan' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'SA', label: 'Saudi Arabia' },
  { value: 'IL', label: 'Israel' },
  { value: 'BR', label: 'Brazil' },
  { value: 'MX', label: 'Mexico' },
  { value: 'ZA', label: 'South Africa' },
  { value: 'NZ', label: 'New Zealand' },
  { value: 'HK', label: 'Hong Kong' },
  { value: 'MY', label: 'Malaysia' },
  { value: 'PH', label: 'Philippines' },
  { value: 'ID', label: 'Indonesia' },
  { value: 'TH', label: 'Thailand' },
]

const EU_COUNTRIES = ['DE', 'FR', 'NL', 'IE', 'SE', 'DK', 'FI', 'CH', 'AT', 'BE', 'ES', 'IT', 'PT', 'PL']

const OBJECTIVE_LABELS: Record<string, string> = {
  LEAD_GEN: 'Lead Generation',
  WEBSITE_VISITS: 'Website Visits',
  CONVERSIONS: 'Conversions',
  ENGAGEMENT: 'Engagement',
  BRAND_AWARENESS: 'Brand Awareness',
  VIDEO_VIEWS: 'Video Views',
}

const FORMAT_LABELS: Record<string, string> = {
  SINGLE_IMAGE: 'Single Image',
  CAROUSEL: 'Carousel',
  VIDEO: 'Video',
  TEXT_AD: 'Text Ad',
  DYNAMIC_AD: 'Dynamic Ad',
}

const CTA_LABELS: Record<string, string> = Object.fromEntries(CTA_OPTIONS.map((c) => [c.value, c.label]))

function formatNumber(val: number | null | undefined): string {
  if (val == null) return '--'
  return new Intl.NumberFormat('en-US').format(val)
}

// ---------------------------------------------------------------------------
// Character Counter
// ---------------------------------------------------------------------------

function CharCounter({ current, max }: { current: number; max: number }) {
  const ratio = current / max
  const color =
    ratio >= 1 ? 'text-red-400' :
    ratio >= 0.8 ? 'text-amber-400' :
    'text-zinc-500'
  return (
    <span className={`text-[10px] tabular-nums ${color}`}>
      {current}/{max}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Multi-Select Component
// ---------------------------------------------------------------------------

function TargetingMultiSelect({
  label,
  options,
  selected,
  onChange,
  searchable = false,
}: {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (values: string[]) => void
  searchable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const filtered = searchable && search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    )
  }

  const selectedLabels = selected
    .map((v) => options.find((o) => o.value === v)?.label)
    .filter(Boolean)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <Label className="text-xs text-zinc-400 mb-1 block">{label}</Label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-left min-h-[36px] hover:border-zinc-600 transition-colors"
      >
        <span className="flex-1 truncate text-sm">
          {selected.length === 0 ? (
            <span className="text-zinc-500">Select {label.toLowerCase()}...</span>
          ) : (
            <span className="text-zinc-200">{selected.length} selected</span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 text-zinc-500 shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-md shadow-lg">
          {searchable && (
            <div className="p-2 border-b border-zinc-700">
              <Input
                placeholder={`Search ${label.toLowerCase()}...`}
                className="bg-zinc-800 border-zinc-700 h-8 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          )}
          <div className="max-h-[200px] overflow-y-auto overscroll-contain p-2 space-y-0.5">
            {filtered.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800 cursor-pointer"
              >
                <Checkbox
                  checked={selected.includes(option.value)}
                  onCheckedChange={() => toggle(option.value)}
                  className="border-zinc-600"
                />
                <span className="text-sm text-zinc-300">{option.label}</span>
              </label>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-zinc-500 text-center py-4">No results</p>
            )}
          </div>
          {selected.length > 0 && (
            <div className="p-2 border-t border-zinc-700">
              <button
                type="button"
                className="w-full text-xs text-zinc-400 hover:text-zinc-300 py-1"
                onClick={() => onChange([])}
              >
                Clear all ({selected.length})
              </button>
            </div>
          )}
        </div>
      )}
      {selectedLabels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selectedLabels.slice(0, 5).map((lbl) => (
            <Badge key={lbl} variant="outline" className="text-[10px] bg-zinc-800 border-zinc-700 text-zinc-300">
              {lbl}
            </Badge>
          ))}
          {selectedLabels.length > 5 && (
            <Badge variant="outline" className="text-[10px] bg-zinc-800 border-zinc-700 text-zinc-400">
              +{selectedLabels.length - 5} more
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// LinkedIn Ad Preview
// ---------------------------------------------------------------------------

function LinkedInAdPreview({
  headline,
  bodyText,
  ctaText,
  destinationUrl,
  creativeFile,
  format,
}: {
  headline: string
  bodyText: string
  ctaText: string
  destinationUrl: string
  creativeFile: File | null
  format: string
}) {
  const previewUrl = useMemo(() => {
    if (!creativeFile) return null
    return URL.createObjectURL(creativeFile)
  }, [creativeFile])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const isVideo = format === 'VIDEO'
  const ctaLabel = CTA_LABELS[ctaText] || ctaText || 'Learn More'

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 flex items-center gap-2.5">
        <div className="h-10 w-10 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
          <Globe className="h-5 w-5 text-zinc-400" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-200 truncate">Your Company</div>
          <div className="text-[11px] text-zinc-500">Promoted</div>
        </div>
      </div>

      {/* Body text */}
      <div className="px-3 pb-2">
        <p className="text-[13px] text-zinc-300 leading-relaxed whitespace-pre-wrap break-words line-clamp-3">
          {bodyText || 'Your introductory text will appear here...'}
        </p>
      </div>

      {/* Creative area */}
      <div className="relative bg-zinc-800 aspect-[1.91/1] flex items-center justify-center">
        {previewUrl ? (
          isVideo ? (
            <video
              src={previewUrl}
              className="w-full h-full object-cover"
              muted
              playsInline
            />
          ) : (
            <img
              src={previewUrl}
              alt="Ad creative preview"
              className="w-full h-full object-cover"
            />
          )
        ) : (
          <div className="flex flex-col items-center gap-2 text-zinc-600">
            {isVideo ? (
              <FileVideo className="h-10 w-10" />
            ) : (
              <FileImage className="h-10 w-10" />
            )}
            <span className="text-xs">Creative preview</span>
          </div>
        )}
      </div>

      {/* Headline + CTA row */}
      <div className="px-3 py-2.5 flex items-center justify-between gap-3 bg-zinc-850 border-t border-zinc-700/50">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-200 truncate">
            {headline || 'Your headline here'}
          </p>
          {destinationUrl && (
            <p className="text-[11px] text-zinc-500 truncate flex items-center gap-1">
              <ExternalLink className="h-3 w-3 shrink-0" />
              {destinationUrl.replace(/^https?:\/\//, '').split('/')[0]}
            </p>
          )}
        </div>
        <div className="shrink-0">
          <div className="px-3 py-1.5 rounded-full border border-blue-400 text-blue-400 text-xs font-semibold whitespace-nowrap">
            {ctaLabel}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const CURRENCY_OPTIONS = [
  { value: 'GBP', label: 'GBP (£)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'CAD', label: 'CAD (C$)' },
  { value: 'AUD', label: 'AUD (A$)' },
  { value: 'CHF', label: 'CHF' },
  { value: 'SEK', label: 'SEK' },
  { value: 'DKK', label: 'DKK' },
  { value: 'NOK', label: 'NOK' },
  { value: 'SGD', label: 'SGD' },
  { value: 'INR', label: 'INR (₹)' },
  { value: 'JPY', label: 'JPY (¥)' },
  { value: 'AED', label: 'AED' },
  { value: 'BRL', label: 'BRL (R$)' },
]

function wizardFormatCurrency(amount: string | number, currency: string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return String(amount)
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(num)
}

export interface CampaignWizardProps {
  onComplete: (params: {
    ad_account_id: string
    name: string
    objective_type: string
    format?: string
    targeting_criteria?: Record<string, any>
    daily_budget_amount?: number
    total_budget_amount?: number
    currency_code?: string
    cost_type?: string
    unit_cost_amount?: number
    run_schedule_start?: string
    run_schedule_end?: string
    pacing_strategy?: string
    headline?: string
    body_text?: string
    cta_text?: string
    destination_url?: string
    creative_file?: File | null
  }) => Promise<void>
  onCancel: () => void
  creating?: boolean
  audiences?: MatchedAudience[]
  audienceEstimate?: AudienceEstimate | null
  estimateLoading?: boolean
  onEstimateAudience?: (criteria: Record<string, any>) => void
  orgCurrency?: string
}

// ---------------------------------------------------------------------------
// Wizard Component
// ---------------------------------------------------------------------------

export default function CampaignWizard({
  onComplete,
  onCancel,
  creating = false,
  audiences = [],
  audienceEstimate,
  estimateLoading,
  onEstimateAudience,
  orgCurrency = 'GBP',
}: CampaignWizardProps) {
  const [step, setStep] = useState(1)

  // Step 1: Objective
  const [objective, setObjective] = useState('')

  // Step 2: Format
  const [format, setFormat] = useState('')

  // Step 3: Creative
  const [headline, setHeadline] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [ctaText, setCtaText] = useState('')
  const [destinationUrl, setDestinationUrl] = useState('')
  const [creativeFile, setCreativeFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step 4: Targeting
  const [jobTitles, setJobTitles] = useState('')
  const [jobFunctions, setJobFunctions] = useState<string[]>([])
  const [selectedSeniorities, setSelectedSeniorities] = useState<string[]>([])
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([])
  const [companySizes, setCompanySizes] = useState<string[]>([])
  const [selectedGeographies, setSelectedGeographies] = useState<string[]>([])
  const [selectedAudiences, setSelectedAudiences] = useState<string[]>([])

  // Step 5: Budget
  const [name, setName] = useState('')
  const [budgetType, setBudgetType] = useState<'daily' | 'lifetime'>('daily')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [currencyCode, setCurrencyCode] = useState(orgCurrency)
  const [costType, setCostType] = useState('MANUAL_CPC')
  const [bidAmount, setBidAmount] = useState('')

  // Step 6: Schedule
  const [scheduleStart, setScheduleStart] = useState('')
  const [scheduleEnd, setScheduleEnd] = useState('')

  // Derived
  const availableFormats = useMemo(() => {
    return FORMATS.filter((f) => f.objectives.includes(objective))
  }, [objective])

  const mediaConfig = FORMAT_MEDIA_CONFIG[format] ?? FORMAT_MEDIA_CONFIG.SINGLE_IMAGE

  const hasEuTargeting = selectedGeographies.some((g) => EU_COUNTRIES.includes(g))

  const hasTargeting =
    jobTitles.trim().length > 0 ||
    jobFunctions.length > 0 ||
    selectedSeniorities.length > 0 ||
    selectedIndustries.length > 0 ||
    companySizes.length > 0 ||
    selectedGeographies.length > 0 ||
    selectedAudiences.length > 0

  const buildTargetingCriteria = useCallback(() => {
    const criteria: Record<string, any> = {}
    const titles = jobTitles.split(',').map((t) => t.trim()).filter(Boolean)
    if (titles.length) criteria.job_titles = titles
    if (jobFunctions.length) criteria.job_functions = jobFunctions
    if (selectedSeniorities.length) criteria.seniorities = selectedSeniorities
    if (selectedIndustries.length) criteria.industries = selectedIndustries
    if (companySizes.length) criteria.company_sizes = companySizes
    if (selectedGeographies.length) criteria.geographies = selectedGeographies
    if (selectedAudiences.length) criteria.matched_audiences = selectedAudiences
    return criteria
  }, [jobTitles, jobFunctions, selectedSeniorities, selectedIndustries, companySizes, selectedGeographies, selectedAudiences])

  const canAdvance = (): boolean => {
    switch (step) {
      case 1: return !!objective
      case 2: return !!format
      case 3: return true // creative is optional
      case 4: return true // targeting is optional
      case 5: return !!name.trim() && !!budgetAmount && parseFloat(budgetAmount) > 0
      case 6: return true // schedule is optional
      case 7: return true // review
      default: return false
    }
  }

  const handleCreate = async () => {
    const targeting = buildTargetingCriteria()

    await onComplete({
      ad_account_id: '', // Resolved by the hook from org integration
      name: name.trim(),
      objective_type: objective,
      format,
      targeting_criteria: Object.keys(targeting).length > 0 ? targeting : undefined,
      daily_budget_amount: budgetType === 'daily' ? parseFloat(budgetAmount) : undefined,
      total_budget_amount: budgetType === 'lifetime' ? parseFloat(budgetAmount) : undefined,
      currency_code: currencyCode,
      cost_type: costType,
      unit_cost_amount: bidAmount ? parseFloat(bidAmount) : undefined,
      run_schedule_start: scheduleStart || undefined,
      run_schedule_end: scheduleEnd || undefined,
      pacing_strategy: budgetType === 'daily' ? 'DAILY' : 'LIFETIME',
      headline: headline.trim() || undefined,
      body_text: bodyText.trim() || undefined,
      cta_text: ctaText || undefined,
      destination_url: destinationUrl.trim() || undefined,
      creative_file: creativeFile,
    })
  }

  // Reset format when objective changes and current format is no longer valid
  useEffect(() => {
    if (format && objective) {
      const stillValid = FORMATS.some((f) => f.value === format && f.objectives.includes(objective))
      if (!stillValid) setFormat('')
    }
  }, [objective, format])

  // File handling
  const handleFileSelect = (file: File) => {
    const accepted = mediaConfig.accept.split(',')
    if (!accepted.some((type) => file.type === type || file.type.startsWith(type.replace('*', '')))) {
      return // Invalid file type — silently reject
    }
    setCreativeFile(file)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileSelect(file)
  }, [mediaConfig])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Step Indicator — compact numbered pills */}
      <div className="flex items-center gap-0">
        {STEP_LABELS.map((s, idx) => {
          const stepNum = idx + 1
          const isActive = stepNum === step
          const isCompleted = stepNum < step
          return (
            <div key={s.key} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                onClick={() => { if (isCompleted) setStep(stepNum) }}
                disabled={!isCompleted}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-blue-500/15 text-blue-400'
                    : isCompleted
                      ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer'
                      : 'text-zinc-600 cursor-default'
                }`}
              >
                <span className={`flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold shrink-0 ${
                  isActive
                    ? 'bg-blue-500 text-white'
                    : isCompleted
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                }`}>
                  {isCompleted ? <Check className="h-3 w-3" /> : stepNum}
                </span>
                <span className={isActive ? '' : 'hidden sm:inline'}>{s.label}</span>
              </button>
              {idx < STEP_LABELS.length - 1 && (
                <div className={`h-px flex-1 min-w-2 ${isCompleted ? 'bg-green-500/30' : 'bg-zinc-800'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* ================================================================= */}
      {/* Step 1: Objective                                                 */}
      {/* ================================================================= */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-zinc-100">What is your campaign objective?</h3>
            <p className="text-xs text-zinc-500 mt-1">This determines how LinkedIn optimizes delivery.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {OBJECTIVES.map((obj) => {
              const Icon = obj.icon
              return (
                <Card
                  key={obj.value}
                  className={`cursor-pointer transition-all ${
                    objective === obj.value
                      ? '!bg-blue-500/10 !border-blue-500/40 ring-1 ring-blue-500/30'
                      : '!bg-zinc-900/60 !border-zinc-800/60 hover:!border-zinc-600'
                  }`}
                  onClick={() => setObjective(obj.value)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 shrink-0 ${objective === obj.value ? 'text-blue-400' : 'text-zinc-500'}`} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-zinc-200">{obj.label}</div>
                        <div className="text-xs text-zinc-400 mt-0.5">{obj.description}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* Step 2: Format                                                    */}
      {/* ================================================================= */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-zinc-100">Choose your ad format</h3>
            <p className="text-xs text-zinc-500 mt-1">Format cannot be changed after creation. Showing formats compatible with {OBJECTIVE_LABELS[objective]}.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {availableFormats.map((fmt) => {
              const Icon = fmt.icon
              return (
                <Card
                  key={fmt.value}
                  className={`cursor-pointer transition-all ${
                    format === fmt.value
                      ? '!bg-blue-500/10 !border-blue-500/40 ring-1 ring-blue-500/30'
                      : '!bg-zinc-900/60 !border-zinc-800/60 hover:!border-zinc-600'
                  }`}
                  onClick={() => setFormat(fmt.value)}
                >
                  <CardContent className="p-4 flex flex-col items-center gap-2">
                    <Icon className={`h-6 w-6 ${format === fmt.value ? 'text-blue-400' : 'text-zinc-500'}`} />
                    <span className="text-sm font-medium text-zinc-200">{fmt.label}</span>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          {availableFormats.length === 0 && (
            <p className="text-xs text-zinc-500 text-center py-6">No formats available. Go back and select an objective first.</p>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* Step 3: Creative                                                  */}
      {/* ================================================================= */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-zinc-100">Build your ad creative</h3>
            <p className="text-xs text-zinc-500 mt-1">Write compelling copy and upload your creative asset. All fields are optional at this stage.</p>
          </div>

          <div className="grid grid-cols-5 gap-4">
            {/* Left column: form fields */}
            <div className="col-span-3 space-y-3">
              {/* Headline */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs text-zinc-400">Headline</Label>
                  <CharCounter current={headline.length} max={HEADLINE_MAX} />
                </div>
                <Input
                  placeholder="e.g. Transform Your Sales Pipeline Today"
                  className="bg-zinc-800 border-zinc-700"
                  value={headline}
                  maxLength={HEADLINE_MAX}
                  onChange={(e) => setHeadline(e.target.value)}
                />
              </div>

              {/* Body / Introductory text */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs text-zinc-400">Introductory Text</Label>
                  <CharCounter current={bodyText.length} max={BODY_MAX} />
                </div>
                <Textarea
                  placeholder="Write the introductory text for your ad. This appears above the creative..."
                  className="bg-zinc-800 border-zinc-700 min-h-[80px] resize-none"
                  value={bodyText}
                  maxLength={BODY_MAX}
                  rows={3}
                  onChange={(e) => setBodyText(e.target.value)}
                />
              </div>

              {/* CTA and Destination URL */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-zinc-400 mb-1 block">Call to Action</Label>
                  <Select value={ctaText} onValueChange={setCtaText}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue placeholder="Select CTA..." />
                    </SelectTrigger>
                    <SelectContent>
                      {CTA_OPTIONS.map((cta) => (
                        <SelectItem key={cta.value} value={cta.value}>
                          {cta.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-zinc-400 mb-1 block">Destination URL</Label>
                  <div className="relative">
                    <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                    <Input
                      placeholder="https://..."
                      className="bg-zinc-800 border-zinc-700 pl-8"
                      value={destinationUrl}
                      onChange={(e) => setDestinationUrl(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Upload zone */}
              <div>
                <Label className="text-xs text-zinc-400 mb-1 block">Creative Asset</Label>
                {creativeFile ? (
                  <div className="flex items-center gap-3 bg-zinc-800 border border-zinc-700 rounded-lg p-3">
                    {/* Thumbnail */}
                    <div className="h-12 w-12 rounded bg-zinc-700 flex items-center justify-center shrink-0 overflow-hidden">
                      {creativeFile.type.startsWith('image/') ? (
                        <img
                          src={URL.createObjectURL(creativeFile)}
                          alt="Thumbnail"
                          className="h-full w-full object-cover"
                          onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                        />
                      ) : (
                        <FileVideo className="h-5 w-5 text-zinc-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-zinc-200 truncate">{creativeFile.name}</p>
                      <p className="text-[10px] text-zinc-500">{(creativeFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-zinc-400 hover:text-red-400 shrink-0 h-8 w-8 p-0"
                      onClick={() => setCreativeFile(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                      dragOver
                        ? 'border-blue-500/50 bg-blue-500/5'
                        : 'border-zinc-700 hover:border-zinc-600 bg-zinc-800/30'
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept={mediaConfig.accept}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleFileSelect(file)
                        e.target.value = ''
                      }}
                    />
                    <Upload className={`h-6 w-6 mx-auto mb-2 ${dragOver ? 'text-blue-400' : 'text-zinc-500'}`} />
                    <p className="text-sm text-zinc-300">
                      Drop your file here or <span className="text-blue-400">browse</span>
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      {mediaConfig.fileTypes} accepted. {mediaConfig.recommendation}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right column: live preview */}
            <div className="col-span-2">
              <Label className="text-xs text-zinc-400 mb-1 block">Ad Preview</Label>
              <LinkedInAdPreview
                headline={headline}
                bodyText={bodyText}
                ctaText={ctaText}
                destinationUrl={destinationUrl}
                creativeFile={creativeFile}
                format={format}
              />
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* Step 4: Targeting                                                 */}
      {/* ================================================================= */}
      {step === 4 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-zinc-100">Define your audience</h3>
            <p className="text-xs text-zinc-500 mt-1">All fields are optional. Add criteria to narrow your reach.</p>
          </div>

          {/* Job Titles (free-form comma-separated) */}
          <div>
            <Label className="text-xs text-zinc-400 mb-1 block">Job Titles (comma-separated)</Label>
            <Input
              placeholder="e.g. CTO, VP Engineering, Head of Product"
              className="bg-zinc-800 border-zinc-700"
              value={jobTitles}
              onChange={(e) => setJobTitles(e.target.value)}
            />
            {jobTitles.trim() && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {jobTitles.split(',').map((t) => t.trim()).filter(Boolean).map((title) => (
                  <Badge key={title} variant="outline" className="text-[10px] bg-zinc-800 border-zinc-700 text-zinc-300">
                    {title}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TargetingMultiSelect
              label="Job Functions"
              options={JOB_FUNCTIONS}
              selected={jobFunctions}
              onChange={setJobFunctions}
              searchable
            />
            <TargetingMultiSelect
              label="Seniority Levels"
              options={SENIORITIES}
              selected={selectedSeniorities}
              onChange={setSelectedSeniorities}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TargetingMultiSelect
              label="Industries"
              options={TARGETING_INDUSTRIES}
              selected={selectedIndustries}
              onChange={setSelectedIndustries}
              searchable
            />
            <TargetingMultiSelect
              label="Company Sizes"
              options={COMPANY_SIZES}
              selected={companySizes}
              onChange={setCompanySizes}
            />
          </div>
          <TargetingMultiSelect
            label="Geographies"
            options={TARGETING_GEOGRAPHIES}
            selected={selectedGeographies}
            onChange={setSelectedGeographies}
            searchable
          />

          {hasEuTargeting && (
            <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <Shield className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-300">
                EU-targeted campaigns may be subject to political advertising regulations.
              </p>
            </div>
          )}

          {/* Matched Audiences */}
          {audiences.length > 0 && (
            <div className="border-t border-zinc-700 pt-3">
              <Label className="text-xs text-zinc-400 mb-1.5 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Matched Audiences
              </Label>
              <Select
                value=""
                onValueChange={(id) => {
                  if (!selectedAudiences.includes(id)) {
                    setSelectedAudiences((prev) => [...prev, id])
                  }
                }}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue placeholder="Add a matched audience..." />
                </SelectTrigger>
                <SelectContent>
                  {audiences
                    .filter((a) => !selectedAudiences.includes(a.id))
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({a.audience_type === 'CONTACT_LIST' ? 'Contacts' : 'Companies'})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {selectedAudiences.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedAudiences.map((id) => {
                    const aud = audiences.find((a) => a.id === id)
                    return (
                      <Badge key={id} variant="secondary" className="bg-blue-500/10 text-blue-400 border-blue-500/20 pr-1">
                        {aud?.name ?? id.slice(0, 8)}
                        <button
                          type="button"
                          className="ml-1 hover:text-blue-200"
                          onClick={() => setSelectedAudiences((prev) => prev.filter((a) => a !== id))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Audience Size Estimate */}
          {hasTargeting && (
            <div className="border-t border-zinc-700 pt-3">
              {estimateLoading ? (
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Estimating audience size...
                </div>
              ) : audienceEstimate?.estimated_count != null ? (
                <div className="flex items-center gap-2 text-xs text-zinc-300">
                  <Users className="h-3.5 w-3.5 text-blue-400" />
                  ~{formatNumber(audienceEstimate.estimated_count)} members match
                  <button
                    type="button"
                    className="ml-auto text-zinc-500 hover:text-zinc-300"
                    onClick={() => onEstimateAudience?.(buildTargetingCriteria())}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                </div>
              ) : audienceEstimate?.error ? (
                <div className="space-y-1">
                  <div className="text-xs text-zinc-500">{audienceEstimate.error}</div>
                  <button
                    type="button"
                    className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300"
                    onClick={() => onEstimateAudience?.(buildTargetingCriteria())}
                  >
                    <RefreshCw className="h-3 w-3" /> Retry estimate
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300"
                  onClick={() => onEstimateAudience?.(buildTargetingCriteria())}
                >
                  <Users className="h-3.5 w-3.5" /> Estimate audience size
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* Step 5: Budget                                                    */}
      {/* ================================================================= */}
      {step === 5 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-zinc-100">Set your budget and bid</h3>
            <p className="text-xs text-zinc-500 mt-1">Name your campaign and configure spend controls.</p>
          </div>

          <div>
            <Label className="text-xs text-zinc-400 mb-1 block">Campaign Name</Label>
            <Input
              placeholder="e.g. Q2 ABM — Enterprise SaaS Leaders"
              className="bg-zinc-800 border-zinc-700"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Budget Type</Label>
              <Select value={budgetType} onValueChange={(v) => setBudgetType(v as 'daily' | 'lifetime')}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily Budget</SelectItem>
                  <SelectItem value="lifetime">Lifetime Budget</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Amount</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="50"
                  className="bg-zinc-800 border-zinc-700 flex-1"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                />
                <Select value={currencyCode} onValueChange={setCurrencyCode}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Bidding Strategy</Label>
              <Select value={costType} onValueChange={setCostType}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BID_STRATEGIES.map((bs) => (
                    <SelectItem key={bs.value} value={bs.value}>
                      {bs.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-zinc-500 mt-1">
                {BID_STRATEGIES.find((b) => b.value === costType)?.description}
              </p>
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Bid Amount (optional)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="5.00"
                className="bg-zinc-800 border-zinc-700"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* Step 6: Schedule                                                  */}
      {/* ================================================================= */}
      {step === 6 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-zinc-100">Set your campaign schedule</h3>
            <p className="text-xs text-zinc-500 mt-1">Choose when your campaign runs. Leave blank to start manually.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Start Date</Label>
              <Input
                type="date"
                className="bg-zinc-800 border-zinc-700"
                value={scheduleStart}
                onChange={(e) => setScheduleStart(e.target.value)}
              />
              <p className="text-[10px] text-zinc-500 mt-1">When the campaign should begin delivering</p>
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">End Date (optional)</Label>
              <Input
                type="date"
                className="bg-zinc-800 border-zinc-700"
                min={scheduleStart || undefined}
                value={scheduleEnd}
                onChange={(e) => setScheduleEnd(e.target.value)}
              />
              <p className="text-[10px] text-zinc-500 mt-1">Leave empty for an ongoing campaign</p>
            </div>
          </div>

          {scheduleStart && scheduleEnd && new Date(scheduleEnd) < new Date(scheduleStart) && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              End date must be after start date.
            </div>
          )}

          {!scheduleStart && !scheduleEnd && (
            <Card className="!bg-zinc-900/60 !border-zinc-800/60">
              <CardContent className="p-4 flex items-center gap-3">
                <CalendarDays className="h-5 w-5 text-zinc-500 shrink-0" />
                <div>
                  <p className="text-sm text-zinc-300">No schedule set</p>
                  <p className="text-xs text-zinc-500">Campaign will be created as a draft. You can schedule it later or activate it manually.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {scheduleStart && (
            <Card className="!bg-blue-500/5 !border-blue-500/20">
              <CardContent className="p-4 flex items-center gap-3">
                <CalendarDays className="h-5 w-5 text-blue-400 shrink-0" />
                <div>
                  <p className="text-sm text-zinc-200">
                    Starts {new Date(scheduleStart).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                  {scheduleEnd ? (
                    <p className="text-xs text-zinc-400">
                      Ends {new Date(scheduleEnd).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                      {' '}({Math.ceil((new Date(scheduleEnd).getTime() - new Date(scheduleStart).getTime()) / (1000 * 60 * 60 * 24))} days)
                    </p>
                  ) : (
                    <p className="text-xs text-zinc-400">Runs indefinitely until paused</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* Step 7: Review                                                    */}
      {/* ================================================================= */}
      {step === 7 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-zinc-100">Review your campaign</h3>
            <p className="text-xs text-zinc-500 mt-1">Confirm the details below. The campaign will be created as a draft.</p>
          </div>

          <div className="grid grid-cols-5 gap-4">
            {/* Left: summary table */}
            <div className="col-span-3 bg-zinc-900/60 border border-zinc-800/60 rounded-lg divide-y divide-zinc-800/60">
              {/* Name */}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-zinc-500">Campaign Name</span>
                <span className="text-sm text-zinc-100 font-medium">{name}</span>
              </div>

              {/* Objective */}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-zinc-500">Objective</span>
                <span className="text-sm text-zinc-200">{OBJECTIVE_LABELS[objective]}</span>
              </div>

              {/* Format */}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-zinc-500">Format</span>
                <span className="text-sm text-zinc-200">{FORMAT_LABELS[format]}</span>
              </div>

              {/* Creative headline */}
              {headline.trim() && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500">Headline</span>
                  <span className="text-sm text-zinc-200 text-right max-w-[60%] truncate">{headline}</span>
                </div>
              )}

              {/* CTA */}
              {ctaText && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500">Call to Action</span>
                  <span className="text-sm text-zinc-200">{CTA_LABELS[ctaText]}</span>
                </div>
              )}

              {/* Destination URL */}
              {destinationUrl.trim() && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500">Destination URL</span>
                  <span className="text-sm text-blue-400 text-right max-w-[60%] truncate">{destinationUrl}</span>
                </div>
              )}

              {/* Creative file */}
              {creativeFile && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500">Creative Asset</span>
                  <span className="text-sm text-zinc-200 truncate max-w-[60%]">{creativeFile.name}</span>
                </div>
              )}

              {/* Budget */}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-zinc-500">Budget</span>
                <span className="text-sm text-zinc-200">{wizardFormatCurrency(budgetAmount, currencyCode)} {budgetType === 'daily' ? '/ day' : 'lifetime'}</span>
              </div>

              {/* Bid Strategy */}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-zinc-500">Bid Strategy</span>
                <span className="text-sm text-zinc-200">
                  {BID_STRATEGIES.find((b) => b.value === costType)?.label}
                  {bidAmount ? ` (${wizardFormatCurrency(bidAmount, currencyCode)})` : ''}
                </span>
              </div>

              {/* Targeting - Job Titles */}
              {jobTitles.trim() && (
                <div className="flex items-start justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500 pt-0.5">Job Titles</span>
                  <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                    {jobTitles.split(',').map((t) => t.trim()).filter(Boolean).map((title) => (
                      <Badge key={title} variant="outline" className="text-[10px] bg-zinc-800 border-zinc-700 text-zinc-300">
                        {title}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Targeting - Job Functions */}
              {jobFunctions.length > 0 && (
                <div className="flex items-start justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500 pt-0.5">Job Functions</span>
                  <span className="text-sm text-zinc-200 text-right max-w-[60%]">
                    {jobFunctions.map((v) => JOB_FUNCTIONS.find((o) => o.value === v)?.label ?? v).join(', ')}
                  </span>
                </div>
              )}

              {/* Targeting - Seniorities */}
              {selectedSeniorities.length > 0 && (
                <div className="flex items-start justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500 pt-0.5">Seniority Levels</span>
                  <span className="text-sm text-zinc-200 text-right max-w-[60%]">
                    {selectedSeniorities.map((v) => SENIORITIES.find((o) => o.value === v)?.label ?? v).join(', ')}
                  </span>
                </div>
              )}

              {/* Targeting - Industries */}
              {selectedIndustries.length > 0 && (
                <div className="flex items-start justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500 pt-0.5">Industries</span>
                  <span className="text-sm text-zinc-200 text-right max-w-[60%]">
                    {selectedIndustries.map((v) => TARGETING_INDUSTRIES.find((o) => o.value === v)?.label ?? v).join(', ')}
                  </span>
                </div>
              )}

              {/* Targeting - Company Sizes */}
              {companySizes.length > 0 && (
                <div className="flex items-start justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500 pt-0.5">Company Sizes</span>
                  <span className="text-sm text-zinc-200 text-right max-w-[60%]">
                    {companySizes.map((v) => COMPANY_SIZES.find((o) => o.value === v)?.label ?? v).join(', ')}
                  </span>
                </div>
              )}

              {/* Targeting - Geographies */}
              {selectedGeographies.length > 0 && (
                <div className="flex items-start justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500 pt-0.5">Geographies</span>
                  <span className="text-sm text-zinc-200 text-right max-w-[60%]">
                    {selectedGeographies.map((v) => TARGETING_GEOGRAPHIES.find((o) => o.value === v)?.label ?? v).join(', ')}
                  </span>
                </div>
              )}

              {/* Matched Audiences */}
              {selectedAudiences.length > 0 && (
                <div className="flex items-start justify-between px-4 py-3">
                  <span className="text-xs text-zinc-500 pt-0.5">Audiences</span>
                  <span className="text-sm text-zinc-200 text-right max-w-[60%]">
                    {selectedAudiences.map((id) => audiences.find((a) => a.id === id)?.name ?? id.slice(0, 8)).join(', ')}
                  </span>
                </div>
              )}

              {/* Schedule */}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-zinc-500">Schedule</span>
                <span className="text-sm text-zinc-200">
                  {scheduleStart
                    ? `${new Date(scheduleStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — ${scheduleEnd ? new Date(scheduleEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No end date'}`
                    : 'Not scheduled'}
                </span>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-zinc-500">Status</span>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">DRAFT</Badge>
              </div>
            </div>

            {/* Right: creative preview */}
            <div className="col-span-2">
              <Label className="text-xs text-zinc-400 mb-1 block">Ad Preview</Label>
              <LinkedInAdPreview
                headline={headline}
                bodyText={bodyText}
                ctaText={ctaText}
                destinationUrl={destinationUrl}
                creativeFile={creativeFile}
                format={format}
              />
            </div>
          </div>

          <p className="text-xs text-zinc-500">
            Campaign will be created as a draft. Activation requires approval.
          </p>
        </div>
      )}

      {/* ================================================================= */}
      {/* Navigation                                                        */}
      {/* ================================================================= */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60">
        <Button
          variant="ghost"
          size="sm"
          className="text-zinc-400 hover:text-zinc-200"
          onClick={step === 1 ? onCancel : () => setStep(step - 1)}
          disabled={creating}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          {step === 1 ? 'Cancel' : 'Back'}
        </Button>

        <span className="text-xs text-zinc-500">
          Step {step} of {TOTAL_STEPS}
        </span>

        {step < TOTAL_STEPS ? (
          <Button
            size="sm"
            disabled={!canAdvance()}
            onClick={() => setStep(step + 1)}
          >
            Next
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={creating}
            onClick={handleCreate}
          >
            {creating ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-1" />
            )}
            Create Campaign
          </Button>
        )}
      </div>
    </div>
  )
}
