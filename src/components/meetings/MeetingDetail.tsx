import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase/clientV2'
import { useAuth } from '@/lib/contexts/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { 
  ArrowLeft, 
  Copy, 
  ExternalLink, 
  FileText, 
  Play,
  CheckCircle,
  Circle,
  User,
  Users,
  Building,
  Calendar,
  Clock,
  MessageSquare,
  TrendingUp,
  Award,
  CheckSquare,
  Link2,
  Video,
  Sparkles,
  BarChart3,
  Target
} from 'lucide-react'
import { toast } from 'sonner'
import { ProposalWizard } from '@/components/proposals/ProposalWizard'
import { TalkTimeChart } from '@/components/meetings/analytics/TalkTimeChart'
import { TalkTimeTrend } from '@/components/meetings/analytics/TalkTimeTrend'
import { CoachingInsights } from '@/components/meetings/analytics/CoachingInsights'
import { MeetingSummaryDisplay } from '@/components/shared/MeetingSummaryDisplay'
import { analyzeTalkTime, type TalkTimeMetrics } from '@/lib/services/coachingService'
import { useOrg } from '@/lib/contexts/OrgContext'
import { ActionItemsList } from '@/components/meetings/ActionItemsList'

interface Meeting {
  id: string
  fathom_recording_id: string
  title: string
  share_url: string
  calls_url: string
  meeting_start: string
  meeting_end: string
  duration_minutes: number
  owner_user_id: string
  owner_email: string
  team_name: string
  company_id: string | null
  primary_contact_id: string | null
  summary: string
  transcript_doc_url: string | null
  thumbnail_url?: string | null
  sentiment_score: number | null
  coach_rating: number | null
  coach_summary: string | null
  talk_time_rep_pct: number | null
  talk_time_customer_pct: number | null
  talk_time_judgement: string | null
  company?: {
    id: string
    name: string
    domain: string
  }
  contact?: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string
  }
}

interface Attendee {
  id: string
  meeting_id: string
  name: string
  email: string
  is_external: boolean
  role: string | null
}

interface ActionItem {
  id: string
  meeting_id: string
  title: string
  assignee_name: string
  assignee_email: string
  priority: string | null
  category: string | null
  deadline_at: string | null
  completed: boolean
  ai_generated: boolean
  timestamp_seconds: number | null
  playback_url: string | null
  linked_task_id: string | null  // Changed from task_id to match new column name
  is_sales_rep_task: boolean | null  // New field to identify sales rep tasks
}

function sentimentLabel(score: number | null): string {
  if (score === null) return 'Unknown'
  if (score <= -0.25) return 'Challenging'
  if (score < 0.25) return 'Neutral'
  return 'Positive'
}

function sentimentTone(score: number | null): 'destructive' | 'default' | 'success' {
  if (score === null) return 'default'
  if (score <= -0.25) return 'destructive'
  if (score < 0.25) return 'default'
  return 'success'
}

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

function getPriorityColor(priority: string | null): string {
  switch (priority) {
    case 'urgent': return 'text-red-400 bg-red-500/10 border-red-500/20'
    case 'high': return 'text-orange-400 bg-orange-500/10 border-orange-500/20'
    case 'medium': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
    case 'low': return 'text-blue-400 bg-blue-500/10 border-blue-500/20'
    default: return 'text-gray-400 bg-gray-500/10 border-gray-500/20'
  }
}

const MeetingDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { activeOrgId } = useOrg()
  const playerRef = useRef<any>(null)
  
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [actionItems, setActionItems] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [startSeconds, setStartSeconds] = useState(0)
  const [thumbnailEnsured, setThumbnailEnsured] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [showProposalWizard, setShowProposalWizard] = useState(false)

  useEffect(() => {
    if (id) {
      fetchMeetingDetails()
    }
  }, [id])

  const fetchMeetingDetails = async () => {
    if (!id || !user) return
    
    setLoading(true)
    try {
      // Fetch meeting details - using left joins for optional relationships
      let detailQuery = supabase
        .from('meetings')
        .select('*')
        .eq('id', id)
      
      // If we have an active org, enforce it. Otherwise, restrict to user's own meeting.
      if (activeOrgId) {
        detailQuery = detailQuery.eq('org_id', activeOrgId)
      } else {
        detailQuery = detailQuery.or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email}`)
      }

      const { data: meetingData, error: meetingError } = await detailQuery.single()

      if (meetingError) {
        throw meetingError
      }
      
      if (!meetingData) {
        return
      }
      
      // Fetch company if exists
      if (meetingData.company_id) {
        const { data: companyData } = await supabase
          .from('companies')
          .select('id, name, domain')
          .eq('id', meetingData.company_id)
          .single()
        
        if (companyData) {
          meetingData.company = companyData
        }
      }
      
      // Fetch contact if exists
      if (meetingData.primary_contact_id) {
        const { data: contactData } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, email')
          .eq('id', meetingData.primary_contact_id)
          .single()
        
        if (contactData) {
          meetingData.contact = contactData
        }
      }
      
      // Fetch meeting metrics
      const { data: metricsData } = await supabase
        .from('meeting_metrics')
        .select('*')
        .eq('meeting_id', id)
        .single()
      
      if (metricsData) {
        meetingData.sentiment_score = metricsData.sentiment_score
        meetingData.coach_rating = metricsData.coach_rating
        meetingData.coach_summary = metricsData.coach_summary
        meetingData.talk_time_rep_pct = metricsData.talk_time_rep_pct
        meetingData.talk_time_customer_pct = metricsData.talk_time_customer_pct
        meetingData.talk_time_judgement = metricsData.talk_time_judgement
      }
      
      setMeeting(meetingData)

      // Fetch attendees
      const { data: attendeesData, error: attendeesError } = await supabase
        .from('meeting_attendees')
        .select('*')
        .eq('meeting_id', id)

      if (attendeesError) throw attendeesError
      setAttendees(attendeesData || [])

      // Fetch action items
      const { data: actionItemsData, error: actionItemsError } = await supabase
        .from('meeting_action_items')
        .select('*')
        .eq('meeting_id', id)
        .order('deadline_at', { ascending: true })

      if (actionItemsError) throw actionItemsError
      setActionItems(actionItemsData || [])
    } catch (error) {
    } finally {
      setLoading(false)
    }
  }

  // Ensure a thumbnail exists for this meeting (Fathom only — other providers have no embeddable video)
  useEffect(() => {
    const ensureThumbnail = async () => {
      if (!meeting || thumbnailEnsured) return
      if (meeting.thumbnail_url) {
        setThumbnailEnsured(true)
        return
      }
      // Skip non-Fathom meetings (no embeddable video for thumbnail generation)
      if (meeting.provider && meeting.provider !== 'fathom') {
        setThumbnailEnsured(true)
        return
      }

      try {
        // Build embed URL from share_url or recording id
        let embedUrl: string | null = null
        if (meeting.share_url) {
          try {
            const u = new URL(meeting.share_url)
            const token = u.pathname.split('/').filter(Boolean).pop()
            if (token) embedUrl = `https://fathom.video/embed/${token}`
          } catch {
            // ignore
          }
        }
        if (!embedUrl && meeting.fathom_recording_id) {
          embedUrl = `https://app.fathom.video/recording/${meeting.fathom_recording_id}`
        }

        let thumbnailUrl: string | null = null

        if (embedUrl) {
          // Choose a representative timestamp: midpoint, clamped to >=5s
          const midpointSeconds = Math.max(5, Math.floor((meeting.duration_minutes || 0) * 60 / 2))
          const { data, error } = await supabase.functions.invoke('generate-video-thumbnail-v2', {
            body: {
              recording_id: meeting.fathom_recording_id,
              share_url: meeting.share_url,
              fathom_embed_url: embedUrl,
              timestamp_seconds: midpointSeconds,
              meeting_id: meeting.id,
            },
          })

          if (!error && (data as any)?.success && (data as any)?.thumbnail_url) {
            thumbnailUrl = (data as any).thumbnail_url as string
          }
        }

        // Fallback: placeholder
        if (!thumbnailUrl) {
          const firstLetter = (meeting.title || 'M')[0].toUpperCase()
          thumbnailUrl = `https://dummyimage.com/640x360/1a1a1a/10b981&text=${encodeURIComponent(firstLetter)}`
        }

        // Persist only if service function didn't already write it
        if (!(data as any)?.db_updated) {
          try {
            await supabase
              .from('meetings')
              .update({ thumbnail_url: thumbnailUrl })
              .eq('id', meeting.id)
          } catch {}
        }

        // Update local state so UI shows the thumbnail immediately
        setMeeting({ ...meeting, thumbnail_url: thumbnailUrl })
      } finally {
        setThumbnailEnsured(true)
      }
    }

    ensureThumbnail()
  }, [meeting, thumbnailEnsured])

  const toggleActionItemComplete = async (itemId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('meeting_action_items')
        .update({ completed: !currentStatus })
        .eq('id', itemId)

      if (error) throw error

      // Update local state
      setActionItems(prev => 
        prev.map(item => 
          item.id === itemId ? { ...item, completed: !currentStatus } : item
        )
      )
    } catch (error) {
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    // You could add a toast notification here
  }

  const seekToTimestamp = (seconds: number) => {
    setStartSeconds(seconds)
    // If we have a ref to the player, we could also call a method
    if (playerRef.current?.seekToTimestamp) {
      playerRef.current.seekToTimestamp(seconds)
    }
  }

  const handleGetActionItems = async () => {
    if (!meeting) return
    setIsExtracting(true)
    try {
      const { data, error } = await supabase.functions.invoke('extract-action-items', {
        body: { meetingId: meeting.id }
      })
      if (error) throw error

      const { data: actionItemsData } = await supabase
        .from('meeting_action_items')
        .select('*')
        .eq('meeting_id', meeting.id)
        .order('deadline_at', { ascending: true })
      setActionItems(actionItemsData || [])

      const created = Number((data as any)?.itemsCreated || 0)
      if (created === 0) toast.info('No Action Items From Meeting')
      else toast.success(`Added ${created} action item${created === 1 ? '' : 's'}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to extract action items')
    } finally {
      setIsExtracting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 dark:border-emerald-400"></div>
      </div>
    )
  }

  if (!meeting) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6"
      >
        <div className="bg-white/85 dark:bg-gray-900/60 backdrop-blur-sm rounded-2xl p-12 border border-gray-200 dark:border-gray-800/50 text-center shadow-sm dark:shadow-xl">
          <Video className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-700 dark:text-gray-400 text-lg mb-6">Meeting not found</p>
          <Button
            onClick={() => navigate('/meetings')}
            variant="secondary"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Meetings
          </Button>
        </div>
      </motion.div>
    )
  }

  const talkTimeIdeal = meeting.summary?.toLowerCase().includes('demo') 
    ? { min: 60, max: 70 } 
    : { min: 45, max: 55 }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <Button
          variant="ghost"
          onClick={() => navigate('/meetings')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Meetings
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-2 flex-1 min-w-0">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {meeting.title || 'Untitled Meeting'}
            </h1>
            <div className="text-sm text-gray-600 dark:text-gray-400 flex flex-wrap items-center gap-4">
              {meeting.company && (
                <span className="flex items-center gap-1">
                  <Building className="h-4 w-4 text-gray-500" />
                  {meeting.company.name}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4 text-gray-500" />
                {meeting.meeting_start
                  ? format(new Date(meeting.meeting_start), 'dd MMM yyyy, HH:mm')
                  : 'No date'}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4 text-gray-500" />
                {meeting.duration_minutes}m
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:flex-shrink-0">
            <Badge
              variant={sentimentTone(meeting.sentiment_score) as any}
              className="backdrop-blur-sm"
            >
              {sentimentLabel(meeting.sentiment_score)}
            </Badge>
            {actionItems.length === 0 && (
              <Button
                size="sm"
                variant="success"
                onClick={handleGetActionItems}
                disabled={isExtracting}
              >
                {isExtracting ? 'Getting Action Items…' : 'Get Action Items'}
              </Button>
            )}
            <Button
              size="sm"
              variant="default"
              onClick={() => setShowProposalWizard(true)}
              className="whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white border-0"
            >
              <FileText className="h-4 w-4 mr-2" />
              Generate Proposal
            </Button>
            {meeting.coach_rating !== null && (
              <Badge variant="secondary" className="backdrop-blur-sm">
                Coach {meeting.coach_rating}/10
              </Badge>
            )}
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-12 gap-6">
        {/* Main Content */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          {/* Fathom Recording Card - Opens in new tab due to X-Frame-Options restriction */}
          {(meeting.share_url || meeting.fathom_recording_id) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="relative overflow-hidden bg-white/85 dark:bg-gray-900/60 backdrop-blur-sm rounded-2xl border border-gray-200 dark:border-gray-800/50 shadow-sm dark:shadow-2xl p-8"
            >
              <div className="relative text-center space-y-6">
                {/* Fathom Logo/Icon */}
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-emerald-600/10 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                    <Video className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>

                {/* Title */}
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    Meeting Recording Available
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    Watch the full recording and review AI-generated insights in Fathom
                  </p>
                </div>

                {/* Open Button */}
                <Button
                  onClick={() => {
                    const url = meeting.fathom_recording_id
                      ? `https://app.fathom.video/recording/${meeting.fathom_recording_id}`
                      : meeting.share_url
                    window.open(url, '_blank', 'noopener,noreferrer')
                  }}
                  variant="success"
                  size="lg"
                  className="px-8 py-6 text-lg"
                >
                  <ExternalLink className="h-5 w-5 mr-3" />
                  Open Recording in Fathom
                </Button>

                {/* Info Text */}
                <p className="text-xs text-gray-500">
                  Opens in a new tab • Includes transcript, summary, and highlights
                </p>
              </div>
            </motion.div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* AI Summary Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              whileHover={{ scale: 1.02, y: -4 }}
              className="bg-white dark:bg-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none hover:border-gray-300 dark:hover:border-gray-600/50 transition-all duration-200"
            >
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-blue-600/10 dark:bg-blue-500/20 backdrop-blur-sm rounded-xl border border-blue-600/20 dark:border-blue-500/20">
                    <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">AI Summary</h3>
                </div>

                <div className="prose prose-sm max-w-none">
                  <MeetingSummaryDisplay 
                    summary={meeting.summary} 
                    className="text-gray-700 dark:text-gray-300 leading-relaxed text-sm"
                  />
                </div>

                <div className="mt-4 flex gap-2">
                  {meeting.transcript_doc_url && (
                    <Button
                      size="sm"
                      variant="tertiary"
                      asChild
                    >
                      <a href={meeting.transcript_doc_url} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-4 w-4 mr-2" />
                        View Transcript
                      </a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="tertiary"
                    onClick={() => copyToClipboard(meeting.summary || '')}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                </div>
              </div>
            </motion.div>

            {/* Analytics Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
              whileHover={{ scale: 1.02, y: -4 }}
              className="bg-white dark:bg-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none hover:border-gray-300 dark:hover:border-gray-600/50 transition-all duration-200"
            >
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-600/10 dark:bg-emerald-500/20 backdrop-blur-sm rounded-xl border border-emerald-600/20 dark:border-emerald-500/20">
                    <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Meeting Analytics</h3>
                </div>

                {/* Sentiment Visualization */}
                <div className="p-3 bg-gray-100 dark:bg-gray-800/30 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">Sentiment</span>
                    <Badge
                      variant={sentimentTone(meeting.sentiment_score) as any}
                      className="backdrop-blur-sm text-xs"
                    >
                      {meeting.sentiment_score?.toFixed(2) || 'N/A'}
                    </Badge>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700/50 rounded-full h-2">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${((meeting.sentiment_score || 0) + 1) * 50}%` }}
                      transition={{ duration: 1, delay: 0.5 }}
                      className={cn(
                        "h-2 rounded-full transition-all duration-300",
                        sentimentTone(meeting.sentiment_score) === 'success' ? 'bg-emerald-600 dark:bg-emerald-400' :
                        sentimentTone(meeting.sentiment_score) === 'destructive' ? 'bg-red-600 dark:bg-red-400' :
                        'bg-gray-500 dark:bg-gray-400'
                      )}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Challenging</span>
                    <span>Neutral</span>
                    <span>Positive</span>
                  </div>
                </div>

                {/* Coach Rating */}
                {meeting.coach_rating !== null && (
                  <div className="p-3 bg-gray-100 dark:bg-gray-800/30 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">Coach Score</span>
                      <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{meeting.coach_rating}/10</div>
                    </div>
                    <Progress
                      value={meeting.coach_rating * 10}
                      className="h-2 bg-gray-200 dark:bg-gray-700/50"
                    />
                    {meeting.coach_summary && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 italic">"{meeting.coach_summary}"</p>
                    )}
                  </div>
                )}

                {/* Talk Time Distribution */}
                {(meeting.talk_time_rep_pct !== null || meeting.talk_time_customer_pct !== null) && (
                  <div className="p-3 bg-gray-100 dark:bg-gray-800/30 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">Talk Time</span>
                      {meeting.talk_time_judgement && (
                        <Badge variant="secondary" className="backdrop-blur-sm text-xs">
                          {meeting.talk_time_judgement}
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-600 dark:text-gray-400">Sales Rep</span>
                          <span className="font-medium text-gray-900 dark:text-gray-300">{Math.round(meeting.talk_time_rep_pct || 0)}%</span>
                        </div>
                        <Progress
                          value={meeting.talk_time_rep_pct || 0}
                          className="h-1.5 bg-gray-200 dark:bg-gray-700/50"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-600 dark:text-gray-400">Customer</span>
                          <span className="font-medium text-gray-900 dark:text-gray-300">{Math.round(meeting.talk_time_customer_pct || 0)}%</span>
                        </div>
                        <Progress
                          value={meeting.talk_time_customer_pct || 0}
                          className="h-1.5 bg-gray-200 dark:bg-gray-700/50"
                        />
                      </div>
                    </div>

                    <div className="text-xs text-gray-500 mt-2 p-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg flex items-center gap-1">
                      <Target className="h-3 w-3" />
                      Ideal: {talkTimeIdeal.min}-{talkTimeIdeal.max}% rep talk time
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Enhanced Analytics Section - Phase 3 */}
            {meeting.talk_time_rep_pct !== null && meeting.talk_time_customer_pct !== null && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.5 }}
                className="col-span-12 space-y-6"
              >
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="h-5 w-5 text-purple-500" />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    Analytics & Coaching
                  </h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Talk Time Chart */}
                  <TalkTimeChart
                    repPct={meeting.talk_time_rep_pct}
                    customerPct={meeting.talk_time_customer_pct}
                    meetingDate={meeting.meeting_start}
                  />

                  {/* Coaching Insights */}
                  <CoachingInsights
                    metrics={{
                      repPct: meeting.talk_time_rep_pct,
                      customerPct: meeting.talk_time_customer_pct,
                      sentimentScore: meeting.sentiment_score || undefined,
                      meetingId: meeting.id,
                      meetingDate: meeting.meeting_start,
                    }}
                  />
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          {/* Action Items - New Unified System */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.4 }}
            className="bg-white dark:bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none hover:border-gray-300 dark:hover:border-gray-600/50 transition-all duration-200"
          >
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-amber-600/10 dark:bg-amber-500/20 backdrop-blur-sm rounded-xl border border-amber-600/20 dark:border-amber-500/20">
                  <CheckSquare className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Action Items</h3>
              </div>

              <ActionItemsList
                actionItems={actionItems}
                meetingId={meeting?.id || ''}
                onTasksCreated={async () => {
                  // Reload action items to show updated sync status
                  const { data } = await supabase
                    .from('meeting_action_items')
                    .select('*')
                    .eq('meeting_id', meeting?.id)
                    .order('deadline_at', { ascending: true })

                  if (data) {
                    setActionItems(data)
                  }
                }}
              />
            </div>
          </motion.div>

          {/* Attendees */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.5 }}
            className="bg-white dark:bg-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none hover:border-gray-300 dark:hover:border-gray-600/50 transition-all duration-200"
          >
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-purple-600/10 dark:bg-purple-500/20 backdrop-blur-sm rounded-xl border border-purple-600/20 dark:border-purple-500/20">
                  <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Attendees</h3>
              </div>

              <div className="space-y-3">
                {attendees.map((attendee, index) => (
                  <motion.div
                    key={attendee.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/30 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-200 dark:bg-gray-600 rounded-full flex items-center justify-center">
                        <User className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-200">{attendee.name}</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">{attendee.email}</div>
                      </div>
                    </div>
                    <Badge
                      variant={attendee.is_external ? 'outline' : 'secondary'}
                      className="backdrop-blur-sm text-xs"
                    >
                      {attendee.is_external ? 'External' : 'Internal'}
                    </Badge>
                  </motion.div>
                ))}
                {attendees.length === 0 && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 text-center py-4">No attendees recorded</p>
                )}
              </div>
            </div>
          </motion.div>

          {/* CRM Links */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.6 }}
            className="bg-white dark:bg-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-200 dark:border-gray-700/50 shadow-sm dark:shadow-none hover:border-gray-300 dark:hover:border-gray-600/50 transition-all duration-200"
          >
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-indigo-600/10 dark:bg-indigo-500/20 backdrop-blur-sm rounded-xl border border-indigo-600/20 dark:border-indigo-500/20">
                  <Link2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">CRM Links</h3>
              </div>

              <div className="space-y-3">
                {meeting.company && (
                  <Link
                    to={`/companies/${meeting.company.id}`}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/30 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700/30 transition-all group/link"
                  >
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-gray-600 dark:text-gray-400 group-hover/link:text-indigo-600 dark:group-hover/link:text-indigo-400 transition-colors" />
                      <span className="text-sm text-gray-700 dark:text-gray-300 group-hover/link:text-gray-900 dark:group-hover/link:text-gray-100 transition-colors">
                        {meeting.company.name}
                      </span>
                    </div>
                    <ExternalLink className="h-4 w-4 text-gray-400 dark:text-gray-500 group-hover/link:text-gray-600 dark:group-hover/link:text-gray-400 transition-colors" />
                  </Link>
                )}
                {meeting.contact && (
                  <Link
                    to={`/crm/contacts/${meeting.contact.id}`}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/30 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700/30 transition-all group/link"
                  >
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-600 dark:text-gray-400 group-hover/link:text-indigo-600 dark:group-hover/link:text-indigo-400 transition-colors" />
                      <span className="text-sm text-gray-700 dark:text-gray-300 group-hover/link:text-gray-900 dark:group-hover/link:text-gray-100 transition-colors">
                        {[meeting.contact.first_name, meeting.contact.last_name].filter(Boolean).join(' ') || meeting.contact.email}
                      </span>
                    </div>
                    <ExternalLink className="h-4 w-4 text-gray-400 dark:text-gray-500 group-hover/link:text-gray-600 dark:group-hover/link:text-gray-400 transition-colors" />
                  </Link>
                )}
                {meeting.share_url && (
                  <a
                    href={meeting.share_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/30 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700/30 transition-all group/link"
                  >
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4 text-gray-600 dark:text-gray-400 group-hover/link:text-indigo-600 dark:group-hover/link:text-indigo-400 transition-colors" />
                      <span className="text-sm text-gray-700 dark:text-gray-300 group-hover/link:text-gray-900 dark:group-hover/link:text-gray-100 transition-colors">
                        Open in Fathom
                      </span>
                    </div>
                    <ExternalLink className="h-4 w-4 text-gray-400 dark:text-gray-500 group-hover/link:text-gray-600 dark:group-hover/link:text-gray-400 transition-colors" />
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Proposal Wizard */}
      <ProposalWizard
        open={showProposalWizard}
        onOpenChange={setShowProposalWizard}
        meetingIds={[meeting.id]}
        contactName={meeting.contact ? `${meeting.contact.first_name || ''} ${meeting.contact.last_name || ''}`.trim() || meeting.contact.email : undefined}
        companyName={meeting.company?.name}
      />
    </div>
  )
}

export default MeetingDetail