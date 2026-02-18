import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useRecording, useRecordingRealtime } from '@/lib/hooks/useRecordings'
import { recordingService } from '@/lib/services/recordingService'
import { supabase } from '@/lib/supabase/clientV2'
import { ProposalWizard } from '@/components/proposals/ProposalWizard'
import { CreateTaskModal } from '@/components/meetings/CreateTaskModal'
import { useTasks } from '@/lib/hooks/useTasks'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Video,
  Clock,
  Calendar,
  Users,
  FileText,
  Sparkles,
  CheckCircle2,
  XCircle,
  Loader2,
  Bot,
  Mic,
  Download,
  Share2,
  AlertCircle,
  ExternalLink,
  ClipboardList,
  BarChart3,
  TrendingUp,
  ListTodo,
  X,
  Play,
  Pencil,
  Check,
  RefreshCw
} from 'lucide-react'
import type { RecordingStatus, MeetingPlatform } from '@/lib/types/meetingBaaS'

// Status badge configuration
const statusConfig: Record<RecordingStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  pending: { label: 'Pending', variant: 'outline', icon: <Clock className="h-3 w-3" /> },
  bot_joining: { label: 'Joining', variant: 'secondary', icon: <Bot className="h-3 w-3 animate-pulse" /> },
  recording: { label: 'Recording', variant: 'default', icon: <Mic className="h-3 w-3 animate-pulse text-red-500" /> },
  processing: { label: 'Processing', variant: 'secondary', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  ready: { label: 'Ready', variant: 'default', icon: <CheckCircle2 className="h-3 w-3 text-emerald-500" /> },
  failed: { label: 'Failed', variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
}

// Platform badge configuration
const platformConfig: Record<MeetingPlatform, { label: string; color: string }> = {
  zoom: { label: 'Zoom', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
  google_meet: { label: 'Google Meet', color: 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400' },
  microsoft_teams: { label: 'Teams', color: 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400' },
}

// Format duration
const formatDuration = (seconds: number | null | undefined): string => {
  if (!seconds || seconds <= 0) return '—'
  const minutes = Math.floor(seconds / 60)
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  }
  return `${minutes}m`
}

// Sentiment helpers
const getSentimentLabel = (score: number): string => {
  if (score >= 0.3) return 'Positive'
  if (score >= -0.3) return 'Neutral'
  return 'Needs Review'
}

const getSentimentColor = (score: number): string => {
  if (score >= 0.3) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
  if (score >= -0.3) return 'bg-gray-100 text-gray-700 dark:bg-gray-500/10 dark:text-gray-400'
  return 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400'
}

const getCoachColor = (rating: number): string => {
  if (rating >= 70) return 'text-emerald-600 dark:text-emerald-400'
  if (rating >= 40) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

const getTalkTimeColor = (judgement: string | null | undefined): string => {
  if (judgement === 'good') return 'text-emerald-600 dark:text-emerald-400'
  if (judgement === 'high' || judgement === 'low') return 'text-amber-600 dark:text-amber-400'
  return 'text-gray-600 dark:text-gray-400'
}

// Timestamp helpers
function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

function parseTimestampToSeconds(ts: string): number | null {
  const parts = ts.split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return null
}

// Skeleton for loading state
const RecordingDetailSkeleton: React.FC = () => (
  <div className="p-6 space-y-6">
    <div className="flex items-center gap-4">
      <Skeleton className="h-10 w-10 rounded-lg" />
      <div>
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-40" />
      </div>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8">
        <Skeleton className="h-96 rounded-xl" />
      </div>
      <div className="lg:col-span-4 space-y-4">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  </div>
)

export const RecordingDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [resolvedThumbnailUrl, setResolvedThumbnailUrl] = useState<string | null>(null)
  const [isLoadingVideo, setIsLoadingVideo] = useState(false)
  const [showProposalWizard, setShowProposalWizard] = useState(false)
  const [linkedMeetingId, setLinkedMeetingId] = useState<string | null>(null)
  const [linkedMeetingTitle, setLinkedMeetingTitle] = useState<string>('')
  const [meetingActionItems, setMeetingActionItems] = useState<any[]>([])
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false)
  const [addingToTasksId, setAddingToTasksId] = useState<string | null>(null)
  const [removingFromTasksId, setRemovingFromTasksId] = useState<string | null>(null)
  const [animatingActionItemId, setAnimatingActionItemId] = useState<string | null>(null)
  const [newlyAddedTaskId, setNewlyAddedTaskId] = useState<string | null>(null)
  const [editingSpeakers, setEditingSpeakers] = useState(false)
  const [speakerEdits, setSpeakerEdits] = useState<Record<number, string>>({})
  const [isSavingSpeakers, setIsSavingSpeakers] = useState(false)
  const [isPollingStatus, setIsPollingStatus] = useState(false)

  // Fetch recording data
  const { recording, isLoading, error } = useRecording(id || '')

  // Subscribe to real-time updates
  useRecordingRealtime(id || '')

  // Tasks for the linked meeting
  const taskFilters = useMemo(() => (
    linkedMeetingId ? { meeting_id: linkedMeetingId } : undefined
  ), [linkedMeetingId])
  const {
    tasks,
    isLoading: tasksLoading,
    completeTask,
    uncompleteTask,
    fetchTasks: refetchTasks,
  } = useTasks(taskFilters, { autoFetch: !!linkedMeetingId })

  // Fetch meeting_action_items when linked meeting is available
  const fetchActionItems = useCallback(async () => {
    if (!linkedMeetingId) return
    const { data } = await supabase
      .from('meeting_action_items')
      .select('*')
      .eq('meeting_id', linkedMeetingId)
      .order('deadline_at', { ascending: true })
    setMeetingActionItems(data || [])
  }, [linkedMeetingId])

  useEffect(() => {
    fetchActionItems()
  }, [fetchActionItems])

  // Clear newly added task highlight after animation
  useEffect(() => {
    if (newlyAddedTaskId) {
      const timer = setTimeout(() => setNewlyAddedTaskId(null), 1500)
      return () => clearTimeout(timer)
    }
  }, [newlyAddedTaskId])

  // Helper: map action item priority to task priority
  const mapPriorityToTaskPriority = (priority: string | null): 'low' | 'medium' | 'high' | 'urgent' => {
    if (!priority) return 'medium'
    const prio = priority.toLowerCase().trim()
    if (['low', 'medium', 'high', 'urgent'].includes(prio)) return prio as any
    if (prio.includes('urgent') || prio.includes('critical')) return 'urgent'
    if (prio.includes('high') || prio.includes('important')) return 'high'
    if (prio.includes('low') || prio.includes('minor')) return 'low'
    return 'medium'
  }

  // Helper: map category to task type
  const mapCategoryToTaskType = (category: string | null): string => {
    if (!category) return 'general'
    const cat = category.toLowerCase().trim()
    if (['call', 'email', 'meeting', 'follow_up', 'proposal', 'demo', 'general'].includes(cat)) return cat
    if (cat.includes('call') || cat.includes('phone')) return 'call'
    if (cat.includes('email') || cat.includes('message')) return 'email'
    if (cat.includes('follow')) return 'follow_up'
    if (cat.includes('proposal') || cat.includes('quote')) return 'proposal'
    return 'general'
  }

  // Toggle action item completed status (for meeting_action_items)
  const toggleActionItem = useCallback(async (id: string, completed: boolean) => {
    try {
      setMeetingActionItems(prev => prev.map(ai => ai.id === id ? { ...ai, completed: !completed } : ai))
      const { error } = await (supabase.from('meeting_action_items') as any)
        .update({ completed: !completed, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) {
        setMeetingActionItems(prev => prev.map(ai => ai.id === id ? { ...ai, completed } : ai))
        throw error
      }
    } catch (e) {
      toast.error('Failed to update action item')
    }
  }, [])

  // Add action item to tasks
  const handleAddToTasks = useCallback(async (actionItem: any) => {
    const meetingId = linkedMeetingId
    if (!meetingId) return

    try {
      setAddingToTasksId(actionItem.id)
      setAnimatingActionItemId(actionItem.id)
      await new Promise(resolve => setTimeout(resolve, 300))

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Authentication required')
        setAnimatingActionItemId(null)
        return
      }

      const taskData: any = {
        title: actionItem.title,
        description: `Action item from meeting: ${linkedMeetingTitle || recording?.meeting_title || 'Recording'}`,
        due_date: actionItem.deadline_at || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        priority: mapPriorityToTaskPriority(actionItem.priority),
        status: actionItem.completed ? 'completed' : 'pending',
        task_type: mapCategoryToTaskType(actionItem.category),
        assigned_to: user.id,
        created_by: user.id,
        meeting_id: meetingId,
        meeting_action_item_id: actionItem.id,
        completed: actionItem.completed || false,
      }

      // Use contact_email fallback to satisfy tasks constraint
      taskData.contact_email = actionItem.assignee_email || user.email

      const { data: newTask, error: taskError } = await (supabase.from('tasks') as any)
        .insert(taskData)
        .select()
        .single() as { data: { id: string } | null; error: any }

      if (taskError) throw taskError
      if (!newTask) throw new Error('Failed to create task')

      // Link action item to the new task
      const { error: updateError } = await (supabase.from('meeting_action_items') as any)
        .update({
          task_id: newTask.id,
          synced_to_task: true,
          sync_status: 'synced',
          synced_at: new Date().toISOString()
        })
        .eq('id', actionItem.id)

      if (updateError) throw updateError

      setMeetingActionItems(prev => prev.map(item =>
        item.id === actionItem.id
          ? { ...item, task_id: newTask.id, synced_to_task: true, sync_status: 'synced' }
          : item
      ))

      await refetchTasks()
      setNewlyAddedTaskId(newTask.id)
      toast.success('Action item added to tasks')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add to tasks')
      setAnimatingActionItemId(null)
    } finally {
      setAddingToTasksId(null)
      setTimeout(() => setAnimatingActionItemId(null), 100)
    }
  }, [linkedMeetingId, linkedMeetingTitle, recording?.meeting_title, refetchTasks])

  // Remove action item from tasks
  const handleRemoveFromTasks = useCallback(async (actionItem: any) => {
    if (!actionItem.task_id) return

    try {
      setRemovingFromTasksId(actionItem.id)

      const { error: deleteError } = await supabase.from('tasks').delete().eq('id', actionItem.task_id)
      if (deleteError) throw deleteError

      const { error: updateError } = await (supabase.from('meeting_action_items') as any)
        .update({ task_id: null, synced_to_task: false, sync_status: null, synced_at: null })
        .eq('id', actionItem.id)
      if (updateError) throw updateError

      setMeetingActionItems(prev => prev.map(item =>
        item.id === actionItem.id
          ? { ...item, task_id: null, synced_to_task: false, sync_status: null }
          : item
      ))
      refetchTasks()
      toast.success('Task removed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove task')
    } finally {
      setRemovingFromTasksId(null)
    }
  }, [refetchTasks])

  // Add JSONB action item directly to tasks (no meeting_action_items row)
  const handleAddJsonbToTasks = useCallback(async (item: { text: string; assignee?: string; due_date?: string }, index: number) => {
    const meetingId = linkedMeetingId
    if (!meetingId) {
      toast.error('No linked meeting found — cannot create task')
      return
    }

    try {
      setAddingToTasksId(`jsonb-${index}`)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Authentication required')
        return
      }

      const taskData: any = {
        title: item.text,
        description: `Action item from recording: ${recording?.meeting_title || 'Recording'}`,
        due_date: item.due_date || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        priority: 'medium',
        status: 'pending',
        task_type: 'general',
        assigned_to: user.id,
        created_by: user.id,
        meeting_id: meetingId,
        contact_email: user.email,
      }

      const { data: newTask, error: taskError } = await (supabase.from('tasks') as any)
        .insert(taskData)
        .select()
        .single() as { data: { id: string } | null; error: any }

      if (taskError) throw taskError
      if (!newTask) throw new Error('Failed to create task')

      await refetchTasks()
      setNewlyAddedTaskId(newTask.id)
      toast.success('Task created from action item')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create task')
    } finally {
      setAddingToTasksId(null)
    }
  }, [linkedMeetingId, recording?.meeting_title, refetchTasks])

  // Start editing speaker names
  const handleStartEditSpeakers = useCallback(() => {
    const edits: Record<number, string> = {}
    recording?.speakers?.forEach(s => {
      edits[s.speaker_id] = s.name || s.email || ''
    })
    setSpeakerEdits(edits)
    setEditingSpeakers(true)
  }, [recording?.speakers])

  // Save edited speaker names
  const handleSaveSpeakers = useCallback(async () => {
    if (!id || !recording?.speakers) return
    setIsSavingSpeakers(true)
    try {
      const updatedSpeakers = recording.speakers.map(s => ({
        ...s,
        name: speakerEdits[s.speaker_id]?.trim() || s.name,
        identification_method: speakerEdits[s.speaker_id]?.trim() ? 'manual' : s.identification_method,
      }))

      const { error } = await supabase
        .from('recordings')
        .update({
          speakers: updatedSpeakers,
          speaker_identification_method: 'manual',
          ...(recording.hitl_type === 'speaker_confirmation' ? {
            hitl_required: false,
            hitl_resolved_at: new Date().toISOString(),
          } : {}),
        })
        .eq('id', id)

      if (error) throw error

      // Also update linked meeting speakers if available
      if (linkedMeetingId) {
        await supabase
          .from('meetings')
          .update({ speakers: updatedSpeakers })
          .eq('id', linkedMeetingId)
      }

      toast.success('Speaker names updated')
      setEditingSpeakers(false)
      // Force page reload to refresh recording data
      window.location.reload()
    } catch (e) {
      toast.error('Failed to save speaker names')
    } finally {
      setIsSavingSpeakers(false)
    }
  }, [id, recording?.speakers, recording?.hitl_type, speakerEdits, linkedMeetingId])

  // Build speaker name map from recording.speakers and transcript_json.speakers
  const speakerMap = useMemo(() => {
    const map: Record<number, { name: string; email?: string; is_internal?: boolean }> = {}
    // Priority 1: recording.speakers (most reliable, from process-recording)
    if (recording?.speakers) {
      for (const s of recording.speakers) {
        const displayName = s.name || s.email || `Speaker ${s.speaker_id + 1}`
        map[s.speaker_id] = { name: displayName, email: s.email, is_internal: s.is_internal }
      }
    }
    // Priority 2: transcript_json.speakers (supplement if missing from above)
    if (recording?.transcript_json?.speakers) {
      for (const s of recording.transcript_json.speakers) {
        if (!map[s.id]) {
          map[s.id] = { name: s.name || s.email || `Speaker ${s.id + 1}`, email: s.email, is_internal: s.is_internal }
        }
      }
    }
    return map
  }, [recording?.speakers, recording?.transcript_json?.speakers])

  // Get speaker display name for an utterance
  // Note: process-recording saves utterances with "speaker" field (number),
  // but the TypeScript type expects "speaker_id". Handle both for compatibility.
  const getSpeakerName = useCallback((utterance: Record<string, unknown>) => {
    const speakerId = (utterance.speaker_id ?? utterance.speaker) as number | undefined
    // 1. Check our speakerMap (built from recording.speakers)
    if (speakerId != null && speakerMap[speakerId]) {
      return speakerMap[speakerId].name
    }
    // 2. Utterance-level speaker_name
    if (utterance.speaker_name) return utterance.speaker_name as string
    // 3. Utterance-level email
    if (utterance.speaker_email) return utterance.speaker_email as string
    // 4. Fallback (1-indexed for display)
    return `Speaker ${(speakerId ?? 0) + 1}`
  }, [speakerMap])

  // Handle timestamp click: scroll to video + seek
  const handleTimestampJump = useCallback((seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds
      videoRef.current.play().catch(() => { /* autoplay may be blocked */ })
      videoRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])

  // Fetch signed video URL and resolved thumbnail URL when recording is ready
  const hasVideo = !!(recording?.recording_s3_key || recording?.recording_s3_url)
  useEffect(() => {
    if (!id || !hasVideo || recording?.status !== 'ready') {
      setVideoUrl(null)
      setResolvedThumbnailUrl(null)
      return
    }

    let cancelled = false
    setIsLoadingVideo(true)

    if (recording.recording_s3_key) {
      // Video is in S3 — fetch signed URL
      recordingService.getRecordingUrl(id).then((result) => {
        if (cancelled) return
        if (result.success && result.url) {
          setVideoUrl(result.url)
        }
        setIsLoadingVideo(false)
      })

      // Fetch fresh thumbnail URL via batch endpoint
      recordingService.getBatchSignedUrls([id]).then((urls) => {
        if (cancelled) return
        const entry = urls[id]
        if (entry?.thumbnail_url) {
          setResolvedThumbnailUrl(entry.thumbnail_url)
        }
      })
    } else if (recording.recording_s3_url) {
      // No S3 key but URL available (e.g., MeetingBaaS URL) — use directly
      setVideoUrl(recording.recording_s3_url)
      setIsLoadingVideo(false)
    }

    return () => { cancelled = true }
  }, [id, hasVideo, recording?.recording_s3_key, recording?.recording_s3_url, recording?.status])

  // Look up the linked meeting for proposal generation
  useEffect(() => {
    if (!id || !recording || recording.status !== 'ready') return

    let cancelled = false

    supabase
      .from('meetings')
      .select('id, title')
      .eq('recording_id', id)
      .eq('source_type', '60_notetaker')
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) {
          setLinkedMeetingId(data.id)
          setLinkedMeetingTitle(data.title || '')
        }
      })

    return () => { cancelled = true }
  }, [id, recording?.status])

  // Handle polling a stuck bot to refresh its status, or retry processing
  const handlePollStatus = async () => {
    setIsPollingStatus(true)
    try {
      // If recording is stuck in "processing", directly retry process-recording
      if (recording?.status === 'processing' && id) {
        const result = await recordingService.retryProcessing(id)
        if (result.success) {
          toast.success('Processing re-triggered. The page will update automatically.')
        } else {
          toast.error(result.error || 'Failed to retry processing')
        }
        return
      }

      // Otherwise, poll the bot status via MeetingBaaS
      if (!recording?.bot_id) {
        toast.error('No bot ID associated with this recording')
        return
      }

      const result = await recordingService.pollStuckBot(recording.bot_id)

      if (!result.success) {
        toast.error(result.error || 'Failed to check status')
        return
      }

      if (result.action === 'processing_triggered' || result.action === 'processing_triggered_with_error') {
        toast.success('Bot completed! Processing has been triggered. The page will update automatically.')
      } else if (result.action === 'marked_failed') {
        toast.error('The bot encountered an error during the meeting.')
      } else if (result.action === 'still_active') {
        toast.info('The bot is still active. Check again later.')
      } else if (result.action === 'no_change') {
        toast.info('No stuck bots found for this recording.')
      } else {
        toast.info(`Status checked: ${result.action}`)
      }
    } catch (err) {
      toast.error('Failed to check bot status')
    } finally {
      setIsPollingStatus(false)
    }
  }

  // Handle download
  const handleDownload = async () => {
    if (!id) return

    setIsDownloading(true)
    try {
      const result = await recordingService.getRecordingUrl(id)

      if (!result.success || !result.url) {
        toast.error(result.error || 'Failed to get download URL')
        return
      }

      const link = document.createElement('a')
      link.href = result.url
      link.download = `${recording?.meeting_title || 'recording'}.mp4`
      link.target = '_blank'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast.success('Download started')
    } catch (err) {
      toast.error('Failed to download recording')
    } finally {
      setIsDownloading(false)
    }
  }

  if (isLoading) {
    return <RecordingDetailSkeleton />
  }

  if (error || !recording) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Recording Not Found
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            The recording you're looking for doesn't exist or you don't have access to it.
          </p>
          <Button onClick={() => navigate('/meetings')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Meetings
          </Button>
        </div>
      </div>
    )
  }

  const status = statusConfig[recording.status]
  const platform = platformConfig[recording.meeting_platform]
  const hasAiInsights = recording.sentiment_score != null || recording.coach_rating != null || recording.talk_time_rep_pct != null

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between"
      >
        <div className="flex items-start gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate('/meetings')}
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {recording.meeting_title || 'Untitled Recording'}
              </h1>
              <Badge variant={status.variant} className="gap-1">
                {status.icon}
                {status.label}
              </Badge>
              {['pending', 'bot_joining', 'recording', 'processing'].includes(recording.status) && (recording.bot_id || recording.status === 'processing') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePollStatus}
                  disabled={isPollingStatus}
                  className="h-7 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 gap-1"
                  title={recording.status === 'processing' ? 'Retry processing' : 'Check bot status with MeetingBaaS'}
                >
                  <RefreshCw className={cn("h-3 w-3", isPollingStatus && "animate-spin")} />
                  {isPollingStatus ? 'Checking...' : recording.status === 'processing' ? 'Retry' : 'Refresh'}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              <Badge variant="outline" className={cn("text-xs", platform?.color)}>
                {platform?.label || recording.meeting_platform}
              </Badge>
              {recording.meeting_start_time && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(recording.meeting_start_time), 'PPp')}
                </span>
              )}
              {recording.meeting_duration_seconds && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(recording.meeting_duration_seconds)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {linkedMeetingId && recording.status === 'ready' && (
            <Button
              size="sm"
              onClick={() => setShowProposalWizard(true)}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <FileText className="h-4 w-4" />
              Generate Proposal
            </Button>
          )}
          {(recording.recording_s3_key || recording.recording_s3_url) && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleDownload}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {isDownloading ? 'Downloading...' : 'Download'}
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-2">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        </div>
      </motion.div>

      {/* HITL Alert */}
      {recording.hitl_required && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Review Required
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {recording.hitl_type === 'speaker_confirmation'
                  ? 'Please confirm the speaker identifications for accurate CRM sync.'
                  : recording.hitl_type === 'deal_selection'
                  ? 'Please select which deal this recording should be linked to.'
                  : 'This recording needs your attention.'}
              </p>
            </div>
            <Button variant="outline" size="sm" className="border-amber-500/50 text-amber-700 dark:text-amber-300">
              Review Now
            </Button>
          </div>
        </motion.div>
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 min-w-0">
        {/* Left Column - Video & Content */}
        <div className="lg:col-span-8 space-y-4 min-w-0">
          {/* Video Player */}
          {recording.status === 'ready' && (recording.recording_s3_key || recording.recording_s3_url) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="bg-black rounded-xl overflow-hidden aspect-video">
                {isLoadingVideo ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="h-8 w-8 text-white animate-spin" />
                  </div>
                ) : videoUrl ? (
                  <video
                    ref={videoRef}
                    controls
                    className="w-full h-full"
                    src={videoUrl}
                    poster={resolvedThumbnailUrl || recording.thumbnail_url || undefined}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                    <Video className="h-12 w-12" />
                    <p className="text-sm">Video unavailable</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* AI Insights Cards (inline, above tabs) */}
          {hasAiInsights && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Sentiment Analysis */}
              {recording.sentiment_score != null && (
                <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">Sentiment Analysis</div>
                    <Badge className={getSentimentColor(recording.sentiment_score)}>
                      {getSentimentLabel(recording.sentiment_score)} ({(recording.sentiment_score * 100).toFixed(0)}%)
                    </Badge>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={cn(
                        "h-2 rounded-full transition-all",
                        recording.sentiment_score >= 0.3 ? 'bg-emerald-500' :
                        recording.sentiment_score >= -0.3 ? 'bg-gray-400' : 'bg-red-500'
                      )}
                      style={{ width: `${Math.max(5, ((recording.sentiment_score + 1) / 2) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Talk Time */}
              {recording.talk_time_rep_pct != null && recording.talk_time_customer_pct != null && (
                <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
                  <div className="flex items-center justify-between mb-4">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">Talk Time Balance</div>
                    {recording.talk_time_judgement && (
                      <Badge variant="outline" className={getTalkTimeColor(recording.talk_time_judgement)}>
                        {recording.talk_time_judgement === 'good' ? 'Balanced' :
                         recording.talk_time_judgement === 'high' ? 'Rep Dominant' : 'Low Rep Talk'}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-600 dark:text-gray-400">Rep</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">{Math.round(recording.talk_time_rep_pct)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div className="h-2 rounded-full bg-blue-500" style={{ width: `${recording.talk_time_rep_pct}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-600 dark:text-gray-400">Customer</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">{Math.round(recording.talk_time_customer_pct)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${recording.talk_time_customer_pct}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Coaching Score */}
              {recording.coach_rating != null && (
                <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">Coaching Score</div>
                    <span className={cn("text-2xl font-bold", getCoachColor(recording.coach_rating))}>
                      {Math.round(recording.coach_rating)}/100
                    </span>
                  </div>
                  {recording.coach_summary && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                      {recording.coach_summary}
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* Tabs: Summary & Transcript */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl border border-gray-200/50 dark:border-gray-700/30">
              <Tabs defaultValue="summary" className="w-full">
                <TabsList className="w-full grid grid-cols-2 m-2" style={{ width: 'calc(100% - 1rem)' }}>
                  <TabsTrigger value="summary">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Summary
                  </TabsTrigger>
                  <TabsTrigger value="transcript">
                    <FileText className="h-4 w-4 mr-2" />
                    Transcript
                  </TabsTrigger>
                </TabsList>

                {/* Summary Tab */}
                <TabsContent value="summary" className="px-4 sm:px-6 pb-4 sm:pb-6 mt-0">
                  {recording.summary ? (
                    <div className="prose dark:prose-invert max-w-none">
                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                        {recording.summary}
                      </p>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Sparkles className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-500 dark:text-gray-400">
                        {recording.status === 'processing'
                          ? 'Summary is being generated...'
                          : 'No summary available for this recording.'}
                      </p>
                    </div>
                  )}

                  {/* Highlights */}
                  {recording.highlights && recording.highlights.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-gray-200/50 dark:border-gray-700/30">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                        Key Highlights
                      </h3>
                      <div className="space-y-3">
                        {recording.highlights.map((highlight, index) => (
                          <div
                            key={index}
                            className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                          >
                            <Badge variant="outline" className="capitalize shrink-0">
                              {highlight.type.replace('_', ' ')}
                            </Badge>
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              {highlight.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Transcript Tab */}
                <TabsContent value="transcript" className="px-4 sm:px-6 pb-4 sm:pb-6 mt-0">
                  {recording.transcript_json?.utterances ? (
                    <div className="max-h-[600px] overflow-y-auto">
                      <div className="text-sm leading-relaxed space-y-3">
                        {recording.transcript_json.utterances.map((utterance, index) => {
                          const speakerName = getSpeakerName(utterance as unknown as Record<string, unknown>)
                          const seconds = utterance.start
                          return (
                            <div key={index} className="flex gap-3 group">
                              <button
                                onClick={() => handleTimestampJump(seconds)}
                                className="text-xs text-zinc-500 hover:text-blue-400 font-mono shrink-0 w-[62px] text-right cursor-pointer transition-colors pt-0.5"
                                title={`Jump to ${formatTimestamp(seconds)}`}
                              >
                                {formatTimestamp(seconds)}
                              </button>
                              <div className="font-semibold text-blue-400 shrink-0">
                                {speakerName}:
                              </div>
                              <div className="text-muted-foreground flex-1">
                                {utterance.text}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : recording.transcript_text ? (
                    <div className="max-h-[600px] overflow-y-auto">
                      <div className="text-sm leading-relaxed space-y-3">
                        {recording.transcript_text.split('\n').map((line, idx) => {
                          // New format: [HH:MM:SS] Speaker: text
                          const tsMatch = line.match(/^\[(\d{2}:\d{2}:\d{2})\]\s+([^:]+):\s*(.*)$/)
                          if (tsMatch) {
                            const [, ts, speaker, text] = tsMatch
                            const secs = parseTimestampToSeconds(ts)
                            return (
                              <div key={idx} className="flex gap-3 group">
                                {secs !== null ? (
                                  <button
                                    onClick={() => handleTimestampJump(secs)}
                                    className="text-xs text-zinc-500 hover:text-blue-400 font-mono shrink-0 w-[62px] text-right cursor-pointer transition-colors"
                                    title={`Jump to ${ts}`}
                                  >
                                    {ts}
                                  </button>
                                ) : (
                                  <span className="text-xs text-zinc-600 font-mono shrink-0 w-[62px] text-right">{ts}</span>
                                )}
                                <div className="font-semibold text-blue-400 shrink-0">{speaker}:</div>
                                <div className="text-muted-foreground flex-1">{text}</div>
                              </div>
                            )
                          }
                          // Legacy format: Speaker: text
                          const speakerMatch = line.match(/^([^:]+):\s*(.*)$/)
                          if (speakerMatch) {
                            const [, speaker, text] = speakerMatch
                            return (
                              <div key={idx} className="flex gap-3">
                                <div className="font-semibold text-blue-400 min-w-[120px] shrink-0">{speaker}:</div>
                                <div className="text-muted-foreground flex-1">{text}</div>
                              </div>
                            )
                          }
                          // Plain text
                          return line.trim() ? (
                            <div key={idx} className="text-muted-foreground">{line}</div>
                          ) : null
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <FileText className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-500 dark:text-gray-400">
                        {recording.status === 'processing'
                          ? 'Transcript is being processed...'
                          : 'No transcript available for this recording.'}
                      </p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </motion.div>
        </div>
        {/* End Left Column */}

        {/* Right Column - Sidebar */}
        <div className="lg:col-span-4 space-y-3 sm:space-y-4 min-w-0">
          {/* Attendees / Speakers */}
          <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                Attendees ({recording.speakers?.length || 0})
              </div>
              {recording.speakers && recording.speakers.length > 0 && !editingSpeakers && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleStartEditSpeakers}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              )}
              {editingSpeakers && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingSpeakers(false)}
                    disabled={isSavingSpeakers}
                    className="h-7 px-2 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleSaveSpeakers}
                    disabled={isSavingSpeakers}
                    className="h-7 px-2 text-xs"
                  >
                    {isSavingSpeakers ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <><Check className="h-3 w-3 mr-1" />Save</>
                    )}
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              {recording.speakers && recording.speakers.length > 0 ? (
                recording.speakers.map((speaker) => {
                  const displayName = speaker.name || speaker.email || `Speaker ${speaker.speaker_id + 1}`
                  const isExternal = !speaker.is_internal

                  return (
                    <div
                      key={speaker.speaker_id}
                      className="flex items-center justify-between text-sm hover:bg-gray-100 dark:hover:bg-zinc-900/40 rounded-lg px-2 -mx-2 py-1.5 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0",
                          speaker.is_internal ? 'bg-emerald-500' : 'bg-blue-500'
                        )}>
                          {(editingSpeakers ? speakerEdits[speaker.speaker_id]?.[0] : displayName.charAt(0))?.toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          {editingSpeakers ? (
                            <Input
                              value={speakerEdits[speaker.speaker_id] || ''}
                              onChange={(e) => setSpeakerEdits(prev => ({
                                ...prev,
                                [speaker.speaker_id]: e.target.value
                              }))}
                              placeholder={`Speaker ${speaker.speaker_id + 1}`}
                              className="h-7 text-sm"
                            />
                          ) : (
                            <>
                              <div className="font-medium truncate">{displayName}</div>
                              {speaker.email && speaker.name && (
                                <div className="text-xs text-muted-foreground truncate">{speaker.email}</div>
                              )}
                            </>
                          )}
                          {speaker.talk_time_percent != null && (
                            <div className="text-xs text-muted-foreground">
                              {Math.round(speaker.talk_time_percent)}% talk time
                            </div>
                          )}
                        </div>
                      </div>
                      {!editingSpeakers && (
                        isExternal ? (
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300 shrink-0 ml-2">
                            External
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="shrink-0 ml-2">
                            Internal
                          </Badge>
                        )
                      )}
                    </div>
                  )
                })
              ) : (
                <p className="text-sm text-muted-foreground">No attendees recorded</p>
              )}
            </div>
          </div>

          {/* Tasks Section (requires linked meeting) */}
          {linkedMeetingId && (
            <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-gray-900 dark:text-gray-100">
                  Tasks ({tasks.length})
                </div>
                <Button
                  onClick={() => setCreateTaskModalOpen(true)}
                  variant="default"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <ListTodo className="w-4 h-4" />
                  Add Task
                </Button>
              </div>

              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {tasksLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : tasks.length > 0 ? (
                  tasks.map((task) => {
                    const isNewlyAdded = task.id === newlyAddedTaskId
                    return (
                    <motion.div
                      key={task.id}
                      className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800/70 transition-colors"
                      initial={isNewlyAdded ? { opacity: 0, x: 100, scale: 0.9 } : { opacity: 0, scale: 0.95 }}
                      animate={isNewlyAdded ? {
                        opacity: 1, x: 0, scale: 1,
                        boxShadow: ['0 0 0 0 rgba(34,197,94,0)', '0 0 0 4px rgba(34,197,94,0.3)', '0 0 0 0 rgba(34,197,94,0)']
                      } : { opacity: 1, scale: 1 }}
                      transition={isNewlyAdded ? { duration: 0.4, ease: 'easeOut', boxShadow: { duration: 1, times: [0, 0.5, 1] } } : {}}
                      layout
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <input
                          type="checkbox"
                          checked={task.status === 'completed'}
                          onChange={async () => {
                            try {
                              if (task.status === 'completed') {
                                await uncompleteTask(task.id)
                                toast.success('Task marked as incomplete')
                              } else {
                                await completeTask(task.id)
                                toast.success('Task marked as complete')
                              }
                              await refetchTasks()
                            } catch (err) {
                              toast.error('Failed to update task')
                            }
                          }}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 bg-white text-emerald-600 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-emerald-500"
                        />
                        <div className="flex-1">
                          <div className={cn(
                            "font-medium text-sm",
                            task.status === 'completed' ? 'line-through text-muted-foreground' : 'text-gray-900 dark:text-gray-100'
                          )}>
                            {task.title}
                          </div>
                          {task.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {task.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={task.priority === 'urgent' || task.priority === 'high' ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {task.priority}
                        </Badge>
                        {task.status === 'completed' && (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/60 dark:text-green-300 text-xs">
                            Complete
                          </Badge>
                        )}
                        {task.task_type && (
                          <span className="text-xs text-muted-foreground capitalize">
                            {task.task_type.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                    </motion.div>
                    )
                  })
                ) : (
                  <div className="text-center py-6">
                    <p className="text-sm text-muted-foreground mb-2">No tasks yet</p>
                    <p className="text-xs text-muted-foreground">
                      Convert action items to tasks below
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Items */}
          <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                Action Items ({linkedMeetingId && meetingActionItems.length > 0 ? meetingActionItems.length : (recording.action_items?.length || 0)})
              </div>
            </div>

            {linkedMeetingId && meetingActionItems.length > 0 ? (
              /* meeting_action_items table — full features like MeetingDetail */
              <div className="space-y-2 max-h-[700px] overflow-y-auto">
                <AnimatePresence mode="popLayout">
                  {meetingActionItems
                    .filter(item => item.id !== animatingActionItemId)
                    .map((item) => (
                      <motion.div
                        key={item.id}
                        className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800/70 transition-colors"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8, y: 20, transition: { duration: 0.3, ease: 'easeIn' } }}
                        layout
                      >
                        {/* Title with Checkbox */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-start gap-2 flex-1">
                            <input
                              type="checkbox"
                              checked={item.completed}
                              onChange={() => toggleActionItem(item.id, item.completed)}
                              className="mt-0.5 h-4 w-4 rounded border-gray-300 bg-white text-emerald-600 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-emerald-500"
                            />
                            <div className="flex-1">
                              <div className={cn("font-medium text-sm", item.completed && 'line-through text-muted-foreground')}>
                                {item.title}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Badge Row */}
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <Badge
                            variant={item.priority === 'urgent' || item.priority === 'high' ? 'destructive' : 'secondary'}
                            className="text-xs"
                          >
                            {item.priority || 'medium'}
                          </Badge>
                          {item.completed && (
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/60 dark:text-green-300 text-xs">
                              Complete
                            </Badge>
                          )}
                          {item.ai_generated && (
                            <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300 text-xs">
                              AI
                            </Badge>
                          )}
                          {item.category && (
                            <span className="text-xs text-muted-foreground capitalize">
                              {item.category.replace('_', ' ')}
                            </span>
                          )}
                          {item.synced_to_task && (
                            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 text-xs">
                              In Tasks
                            </Badge>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                          {!item.synced_to_task ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAddToTasks(item)}
                              disabled={addingToTasksId === item.id}
                              className="text-xs"
                            >
                              {addingToTasksId === item.id ? (
                                <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Adding...</>
                              ) : (
                                <><ListTodo className="h-3 w-3 mr-1" />Add to Tasks</>
                              )}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRemoveFromTasks(item)}
                              disabled={removingFromTasksId === item.id}
                              className="text-xs"
                            >
                              {removingFromTasksId === item.id ? (
                                <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Removing...</>
                              ) : (
                                <><X className="h-3 w-3 mr-1" />Remove from Tasks</>
                              )}
                            </Button>
                          )}
                          {item.timestamp_seconds && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleTimestampJump(item.timestamp_seconds)}
                              className="text-xs"
                            >
                              <Play className="h-3 w-3 mr-1" />
                              {formatTimestamp(item.timestamp_seconds)}
                            </Button>
                          )}
                        </div>
                      </motion.div>
                    ))}
                </AnimatePresence>
              </div>
            ) : (
              /* Fallback: recording.action_items JSONB — card style with Add to Tasks */
              <div className="space-y-2 max-h-[700px] overflow-y-auto">
                {recording.action_items && recording.action_items.length > 0 ? (
                  recording.action_items.map((item, index) => (
                    <motion.div
                      key={index}
                      className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800/70 transition-colors"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      layout
                    >
                      {/* Title */}
                      <div className="flex items-start gap-2 mb-2">
                        <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                            {index + 1}
                          </span>
                        </div>
                        <div className="font-medium text-sm text-gray-900 dark:text-gray-100 flex-1">
                          {item.text}
                        </div>
                      </div>

                      {/* Badges */}
                      <div className="flex items-center gap-2 flex-wrap mb-2 ml-7">
                        <Badge variant="secondary" className="text-xs">medium</Badge>
                        {item.assignee && (
                          <Badge variant="outline" className="text-xs">
                            <Users className="h-3 w-3 mr-1" />
                            {item.assignee}
                          </Badge>
                        )}
                        {item.due_date && (
                          <Badge variant="outline" className="text-xs">
                            <Calendar className="h-3 w-3 mr-1" />
                            {format(new Date(item.due_date), 'MMM d')}
                          </Badge>
                        )}
                      </div>

                      {/* Add to Tasks button */}
                      {linkedMeetingId && (
                        <div className="flex items-center gap-2 ml-7">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAddJsonbToTasks(item, index)}
                            disabled={addingToTasksId === `jsonb-${index}`}
                            className="text-xs"
                          >
                            {addingToTasksId === `jsonb-${index}` ? (
                              <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Adding...</>
                            ) : (
                              <><ListTodo className="h-3 w-3 mr-1" />Add to Tasks</>
                            )}
                          </Button>
                        </div>
                      )}
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <ClipboardList className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No action items identified
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Meeting Info */}
          <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
            <div className="font-semibold mb-3 text-gray-900 dark:text-gray-100">Meeting Info</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span>{formatDuration(recording.meeting_duration_seconds)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Platform</span>
                <span>{platform?.label || recording.meeting_platform}</span>
              </div>
              {recording.meeting_start_time && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Start</span>
                  <span>{new Date(recording.meeting_start_time).toLocaleTimeString()}</span>
                </div>
              )}
              {recording.meeting_end_time && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">End</span>
                  <span>{new Date(recording.meeting_end_time).toLocaleTimeString()}</span>
                </div>
              )}
              {recording.meeting_url && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Meeting Link</span>
                  <a
                    href={recording.meeting_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-600 flex items-center gap-1"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Stats Summary (compact) */}
          <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30">
            <div className="font-semibold mb-3 text-gray-900 dark:text-gray-100">Quick Stats</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {recording.speakers?.length || 0}
                </div>
                <div className="text-xs text-muted-foreground">Speakers</div>
              </div>
              <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {recording.action_items?.length || 0}
                </div>
                <div className="text-xs text-muted-foreground">Actions</div>
              </div>
              {recording.sentiment_score != null && (
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <Badge className={cn("text-xs", getSentimentColor(recording.sentiment_score))}>
                    {getSentimentLabel(recording.sentiment_score)}
                  </Badge>
                  <div className="text-xs text-muted-foreground mt-1">Sentiment</div>
                </div>
              )}
              {recording.coach_rating != null && (
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className={cn("text-lg font-bold", getCoachColor(recording.coach_rating))}>
                    {Math.round(recording.coach_rating)}
                  </div>
                  <div className="text-xs text-muted-foreground">Coach</div>
                </div>
              )}
              {recording.highlights && recording.highlights.length > 0 && !recording.sentiment_score && (
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {recording.highlights.length}
                  </div>
                  <div className="text-xs text-muted-foreground">Highlights</div>
                </div>
              )}
              {recording.crm_contacts && recording.crm_contacts.length > 0 && !recording.coach_rating && (
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {recording.crm_contacts.length}
                  </div>
                  <div className="text-xs text-muted-foreground">CRM Links</div>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* End Right Column */}
      </div>

      {/* Create Task Modal */}
      {linkedMeetingId && (
        <CreateTaskModal
          meetingId={linkedMeetingId}
          meetingTitle={linkedMeetingTitle || recording.meeting_title || 'Recording'}
          open={createTaskModalOpen}
          onOpenChange={setCreateTaskModalOpen}
          onTaskCreated={refetchTasks}
        />
      )}

      {/* Proposal Wizard */}
      {linkedMeetingId && (
        <ProposalWizard
          open={showProposalWizard}
          onOpenChange={setShowProposalWizard}
          meetingIds={[linkedMeetingId]}
        />
      )}
    </div>
  )
}

export default RecordingDetail
