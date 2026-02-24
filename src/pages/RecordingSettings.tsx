import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useRecordingSettings, useRecordingRules, useRecordingUsage } from '@/lib/hooks/useRecordings'
import { useCalendarList } from '@/lib/hooks/useGoogleIntegration'
import { useNotetakerIntegration } from '@/lib/hooks/useNotetakerIntegration'
import { useMeetingBaaSCalendar } from '@/lib/hooks/useMeetingBaaSCalendar'
import { useRecordingSetupStatus } from '@/lib/hooks/useRecordingSetupStatus'
import { recordingService } from '@/lib/services/recordingService'
import { useOrg } from '@/lib/contexts/OrgContext'
import { toast } from 'sonner'
import { RecordingSetupWizard } from '@/components/recording/RecordingSetupWizard'
import { ConnectionStatusCard } from '@/components/recording/ConnectionStatusCard'
import { EnableAutoRecordingPrompt } from '@/components/recording/EnableAutoRecordingPrompt'
import type { ConnectionStatus } from '@/components/recording/ConnectionStatusCard'
import { cn } from '@/lib/utils'
import { DEFAULT_BOT_PROFILE_IMAGE, DEFAULT_SIXTY_ICON_URL } from '@/lib/utils/sixtyBranding'
import {
  ArrowLeft,
  Settings,
  Bot,
  Video,
  Calendar,
  Globe,
  Users,
  Shield,
  Sparkles,
  Save,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Info,
  ExternalLink,
  Loader2,
  Link2,
  Unlink,
  Pencil,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'
import type { RecordingSettings as RecordingSettingsType, RecordingRule, DomainMode, RecordingRuleInsert } from '@/lib/types/meetingBaaS'

// Domain mode labels
const domainModeLabels: Record<DomainMode, string> = {
  external_only: 'External participants only',
  internal_only: 'Internal participants only',
  specific_domains: 'Specific domains',
  all: 'All meetings',
}

// Settings Skeleton
const SettingsSkeleton: React.FC = () => (
  <div className="p-6 space-y-6">
    <div className="flex items-center gap-4">
      <Skeleton className="h-10 w-10 rounded-lg" />
      <div>
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
    </div>
    <div className="grid gap-6">
      {[...Array(3)].map((_, i) => (
        <Skeleton key={i} className="h-48 rounded-xl" />
      ))}
    </div>
  </div>
)

// Rule Card Component
const RuleCard: React.FC<{
  rule: RecordingRule
  onDelete: (id: string) => void
  onToggle: (id: string, isActive: boolean) => void
  onEdit: (rule: RecordingRule) => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  isFirst?: boolean
  isLast?: boolean
}> = ({ rule, onDelete, onToggle, onEdit, onMoveUp, onMoveDown, isFirst, isLast }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    layout
    className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/30"
  >
    <div className="flex items-start justify-between">
      {/* Priority reorder buttons */}
      <div className="flex flex-col mr-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMoveUp}
          disabled={isFirst}
          className="h-6 w-6 text-gray-400 hover:text-gray-600 disabled:opacity-30"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onMoveDown}
          disabled={isLast}
          className="h-6 w-6 text-gray-400 hover:text-gray-600 disabled:opacity-30"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <h4 className="font-medium text-gray-900 dark:text-gray-100">
            {rule.name}
          </h4>
          <Badge variant={rule.is_active ? 'default' : 'secondary'}>
            {rule.is_active ? 'Active' : 'Inactive'}
          </Badge>
          {rule.priority > 0 && (
            <Badge variant="outline" className="text-xs">
              Priority: {rule.priority}
            </Badge>
          )}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
          <p className="flex items-center gap-2">
            <Globe className="h-3 w-3" />
            {domainModeLabels[rule.domain_mode]}
            {rule.domain_mode === 'specific_domains' && rule.specific_domains && (
              <span className="text-gray-500">({rule.specific_domains.join(', ')})</span>
            )}
          </p>
          <p className="flex items-center gap-2">
            <Users className="h-3 w-3" />
            {rule.min_attendee_count} - {rule.max_attendee_count || '∞'} attendees
          </p>
          {rule.title_keywords && rule.title_keywords.length > 0 && (
            <p className="flex items-center gap-2">
              <Calendar className="h-3 w-3" />
              Keywords: {rule.title_keywords.join(', ')}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={rule.is_active}
          onCheckedChange={(checked) => onToggle(rule.id, checked)}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onEdit(rule)}
          className="text-gray-500 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(rule.id)}
          className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  </motion.div>
)

export const RecordingSettings: React.FC = () => {
  const navigate = useNavigate()
  const { activeOrgId } = useOrg()

  // Setup status check
  const { hasCompletedSetup, isLoading: setupStatusLoading, refetch: refetchSetupStatus } = useRecordingSetupStatus()

  // Fetch settings and rules
  const { settings, isLoading: settingsLoading, refetch: refetchSettings } = useRecordingSettings()
  const { rules, isLoading: rulesLoading, refetch: refetchRules } = useRecordingRules()
  const { usage, remainingRecordings, usagePercent } = useRecordingUsage()

  // Notetaker integration (check Google connection first)
  const { userSettings, updateSettings, isUpdating, googleConnected, googleEmail, googleLoading } = useNotetakerIntegration()

  // Calendar list - only fetch when Google is connected
  const { data: calendarsData, isLoading: calendarsLoading, refetch: refetchCalendars } = useCalendarList(googleConnected)

  // MeetingBaaS calendar connection
  const {
    hasConnectedCalendar: hasMeetingBaaSCalendar,
    primaryCalendar: meetingBaaSCalendar,
    isLoading: meetingBaaSLoading,
    isConnecting: meetingBaaSConnecting,
    connect: connectMeetingBaaSCalendar,
    refetch: refetchMeetingBaaSCalendar,
  } = useMeetingBaaSCalendar()

  // Debug: Log calendar data when it changes
  React.useEffect(() => {
    if (calendarsData) {
      console.log('[RecordingSettings] Calendar data received:', calendarsData)
      console.log('[RecordingSettings] Calendars count:', calendarsData?.calendars?.length ?? 0)
    }
  }, [calendarsData])

  // Local state for settings form
  const [botName, setBotName] = useState('')
  const [entryMessage, setEntryMessage] = useState('')
  const [entryMessageEnabled, setEntryMessageEnabled] = useState(true)
  const [autoRecord, setAutoRecord] = useState(false)
  const [autoRecordLeadTime, setAutoRecordLeadTime] = useState(2)
  const [autoRecordExternalOnly, setAutoRecordExternalOnly] = useState(true)
  const [joinAllMeetings, setJoinAllMeetings] = useState(true)
  const [selectedCalendarId, setSelectedCalendarId] = useState('primary')
  const [saving, setSaving] = useState(false)

  // Rule Modal state (shared between add and edit)
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [editingRule, setEditingRule] = useState<RecordingRule | null>(null)
  const [ruleName, setRuleName] = useState('')
  const [ruleDomainMode, setRuleDomainMode] = useState<DomainMode>('external_only')
  const [ruleSpecificDomains, setRuleSpecificDomains] = useState('')
  const [ruleMinAttendees, setRuleMinAttendees] = useState('1')
  const [ruleMaxAttendees, setRuleMaxAttendees] = useState('')
  const [ruleTitleKeywords, setRuleTitleKeywords] = useState('')
  const [ruleExcludeKeywords, setRuleExcludeKeywords] = useState('')
  const [savingRule, setSavingRule] = useState(false)

  // Legacy alias for backward compatibility
  const showAddRuleModal = showRuleModal && !editingRule
  const setShowAddRuleModal = (open: boolean) => {
    if (open) {
      setEditingRule(null)
      resetRuleForm()
    }
    setShowRuleModal(open)
  }

  // Enable Auto-Recording Prompt state
  const [showAutoRecordPrompt, setShowAutoRecordPrompt] = useState(false)
  const [previousGoogleConnected, setPreviousGoogleConnected] = useState(googleConnected)

  // Detect when Google Calendar gets connected and show prompt
  React.useEffect(() => {
    // Important: `googleConnected` can flip from false -> true simply because we ran a background
    // connection check (even if the user connected days ago). Avoid popping an onboarding prompt
    // in that scenario, especially if auto-recording is already enabled.
    if (
      !settingsLoading &&
      !previousGoogleConnected &&
      googleConnected &&
      hasCompletedSetup &&
      !hasMeetingBaaSCalendar &&
      !(settings?.auto_record_enabled ?? false)
    ) {
      setShowAutoRecordPrompt(true)
    }
    setPreviousGoogleConnected(googleConnected)
  }, [
    googleConnected,
    previousGoogleConnected,
    hasCompletedSetup,
    hasMeetingBaaSCalendar,
    settingsLoading,
    settings?.auto_record_enabled,
  ])

  // Initialize form when settings load
  React.useEffect(() => {
    if (settings) {
      setBotName(settings.bot_name || '')
      setEntryMessage(settings.entry_message || '')
      setEntryMessageEnabled(settings.entry_message_enabled ?? true)
      setAutoRecord(settings.auto_record_enabled ?? false)
      setAutoRecordLeadTime(settings.auto_record_lead_time_minutes ?? 2)
      setAutoRecordExternalOnly(settings.auto_record_external_only ?? true)
      setJoinAllMeetings(settings.join_all_meetings ?? true)
    }
  }, [settings])

  // Initialize selected calendar from user settings, with fallback to primary
  React.useEffect(() => {
    if (userSettings?.selected_calendar_id) {
      setSelectedCalendarId(userSettings.selected_calendar_id)
    } else if (calendarsData?.calendars?.length) {
      // If no saved preference, default to the primary calendar
      const primaryCalendar = calendarsData.calendars.find((c: { primary?: boolean }) => c.primary)
      if (primaryCalendar) {
        setSelectedCalendarId(primaryCalendar.id)
      }
    }
  }, [userSettings, calendarsData])

  // Save calendar selection
  const handleSaveCalendarSelection = async () => {
    try {
      await updateSettings({ selected_calendar_id: selectedCalendarId })
    } catch (error) {
      console.error('Failed to save calendar selection:', error)
      toast.error('Failed to save calendar selection')
    }
  }

  // Save settings
  const handleSaveSettings = async () => {
    if (!activeOrgId) {
      toast.error('No organization selected')
      return
    }
    setSaving(true)
    try {
      await recordingService.updateRecordingSettings(activeOrgId, {
        bot_name: botName || undefined,
        entry_message: entryMessage || undefined,
        entry_message_enabled: entryMessageEnabled,
        auto_record_enabled: autoRecord,
        auto_record_lead_time_minutes: autoRecordLeadTime,
        auto_record_external_only: autoRecordExternalOnly,
        join_all_meetings: joinAllMeetings,
      })
      toast.success('Settings saved successfully')
      refetchSettings()
    } catch (error) {
      console.error('Failed to save settings:', error)
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  // Delete rule
  const handleDeleteRule = async (ruleId: string) => {
    try {
      await recordingService.deleteRecordingRule(ruleId)
      toast.success('Rule deleted')
      refetchRules()
    } catch (error) {
      console.error('Failed to delete rule:', error)
      toast.error('Failed to delete rule')
    }
  }

  // Toggle rule active state
  const handleToggleRule = async (ruleId: string, isActive: boolean) => {
    try {
      await recordingService.updateRecordingRule(ruleId, { is_active: isActive })
      toast.success(`Rule ${isActive ? 'enabled' : 'disabled'}`)
      refetchRules()
    } catch (error) {
      console.error('Failed to toggle rule:', error)
      toast.error('Failed to update rule')
    }
  }

  // Reset rule form
  const resetRuleForm = () => {
    setRuleName('')
    setRuleDomainMode('external_only')
    setRuleSpecificDomains('')
    setRuleMinAttendees('1')
    setRuleMaxAttendees('')
    setRuleTitleKeywords('')
    setRuleExcludeKeywords('')
    setEditingRule(null)
  }

  // Open edit modal with rule data
  const handleEditRule = (rule: RecordingRule) => {
    setEditingRule(rule)
    setRuleName(rule.name)
    setRuleDomainMode(rule.domain_mode)
    setRuleSpecificDomains(rule.specific_domains?.join(', ') || '')
    setRuleMinAttendees(rule.min_attendee_count?.toString() || '1')
    setRuleMaxAttendees(rule.max_attendee_count?.toString() || '')
    setRuleTitleKeywords(rule.title_keywords?.join(', ') || '')
    setRuleExcludeKeywords(rule.title_keywords_exclude?.join(', ') || '')
    setShowRuleModal(true)
  }

  // Handle enabling auto-recording from prompt
  const handleEnableAutoRecordingFromPrompt = async () => {
    await connectMeetingBaaSCalendar(selectedCalendarId)
  }

  // Handle wizard completion
  const handleWizardComplete = () => {
    refetchSettings()
    refetchSetupStatus()
    refetchMeetingBaaSCalendar()
  }

  // Create new rule
  const handleCreateRule = async () => {
    if (!activeOrgId) {
      toast.error('No organization selected')
      return
    }
    if (!ruleName.trim()) {
      toast.error('Please enter a rule name')
      return
    }

    setSavingRule(true)
    try {
      const rule: RecordingRuleInsert = {
        org_id: activeOrgId,
        name: ruleName.trim(),
        is_active: true,
        priority: (rules?.length || 0) + 1,
        domain_mode: ruleDomainMode,
        specific_domains: ruleDomainMode === 'specific_domains' && ruleSpecificDomains
          ? ruleSpecificDomains.split(',').map(d => d.trim()).filter(Boolean)
          : null,
        min_attendee_count: parseInt(ruleMinAttendees) || 1,
        max_attendee_count: ruleMaxAttendees ? parseInt(ruleMaxAttendees) : null,
        title_keywords: ruleTitleKeywords
          ? ruleTitleKeywords.split(',').map(k => k.trim()).filter(Boolean)
          : null,
        title_keywords_exclude: ruleExcludeKeywords
          ? ruleExcludeKeywords.split(',').map(k => k.trim()).filter(Boolean)
          : null,
      }

      await recordingService.createRecordingRule(rule)
      toast.success('Recording rule created')
      resetRuleForm()
      setShowRuleModal(false)
      refetchRules()
    } catch (error) {
      console.error('Failed to create rule:', error)
      toast.error('Failed to create rule')
    } finally {
      setSavingRule(false)
    }
  }

  // Update existing rule
  const handleUpdateRule = async () => {
    if (!editingRule) return
    if (!ruleName.trim()) {
      toast.error('Please enter a rule name')
      return
    }

    setSavingRule(true)
    try {
      const updates: Partial<RecordingRule> = {
        name: ruleName.trim(),
        domain_mode: ruleDomainMode,
        specific_domains: ruleDomainMode === 'specific_domains' && ruleSpecificDomains
          ? ruleSpecificDomains.split(',').map(d => d.trim()).filter(Boolean)
          : null,
        min_attendee_count: parseInt(ruleMinAttendees) || 1,
        max_attendee_count: ruleMaxAttendees ? parseInt(ruleMaxAttendees) : null,
        title_keywords: ruleTitleKeywords
          ? ruleTitleKeywords.split(',').map(k => k.trim()).filter(Boolean)
          : null,
        title_keywords_exclude: ruleExcludeKeywords
          ? ruleExcludeKeywords.split(',').map(k => k.trim()).filter(Boolean)
          : null,
      }

      await recordingService.updateRecordingRule(editingRule.id, updates)
      toast.success('Recording rule updated')
      resetRuleForm()
      setShowRuleModal(false)
      refetchRules()
    } catch (error) {
      console.error('Failed to update rule:', error)
      toast.error('Failed to update rule')
    } finally {
      setSavingRule(false)
    }
  }

  // Save rule (create or update)
  const handleSaveRule = async () => {
    if (editingRule) {
      await handleUpdateRule()
    } else {
      await handleCreateRule()
    }
  }

  // Move rule up in priority (swap with rule above)
  const handleMoveRuleUp = async (index: number) => {
    if (!rules || index <= 0) return

    const currentRule = rules[index]
    const aboveRule = rules[index - 1]

    try {
      // Swap priorities
      await Promise.all([
        recordingService.updateRecordingRule(currentRule.id, { priority: aboveRule.priority }),
        recordingService.updateRecordingRule(aboveRule.id, { priority: currentRule.priority }),
      ])
      refetchRules()
    } catch (error) {
      console.error('Failed to reorder rules:', error)
      toast.error('Failed to reorder rules')
    }
  }

  // Move rule down in priority (swap with rule below)
  const handleMoveRuleDown = async (index: number) => {
    if (!rules || index >= rules.length - 1) return

    const currentRule = rules[index]
    const belowRule = rules[index + 1]

    try {
      // Swap priorities
      await Promise.all([
        recordingService.updateRecordingRule(currentRule.id, { priority: belowRule.priority }),
        recordingService.updateRecordingRule(belowRule.id, { priority: currentRule.priority }),
      ])
      refetchRules()
    } catch (error) {
      console.error('Failed to reorder rules:', error)
      toast.error('Failed to reorder rules')
    }
  }

  // Show wizard for first-time users
  if (setupStatusLoading) {
    return <SettingsSkeleton />
  }

  if (!hasCompletedSetup) {
    return <RecordingSetupWizard onComplete={handleWizardComplete} />
  }

  if (settingsLoading || rulesLoading) {
    return <SettingsSkeleton />
  }

  // Prepare connection status for ConnectionStatusCard
  const connectionStatus: ConnectionStatus = {
    googleCalendar: {
      connected: googleConnected,
      accountEmail: googleEmail ?? undefined,
    },
    calendarSelected: {
      selected: !!selectedCalendarId,
      calendarName: calendarsData?.calendars?.find((c: { id: string }) => c.id === selectedCalendarId)?.summary,
    },
    botCalendarSync: {
      connected: hasMeetingBaaSCalendar,
      platform: meetingBaaSCalendar?.platform,
      calendarEmail: meetingBaaSCalendar?.email ?? undefined,
    },
    autoRecordingRules: {
      enabled: autoRecord,
    },
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigate('/meetings')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            60 Notetaker Settings
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Configure your 60 Notetaker bot and automation rules
          </p>
        </div>
      </motion.div>

      {/* Connection Status Card */}
      <ConnectionStatusCard
        status={connectionStatus}
        onConnectGoogle={() => navigate('/integrations')}
        onSelectCalendar={() => {
          // Scroll to calendar selection section
          const calendarSection = document.getElementById('calendar-selection')
          calendarSection?.scrollIntoView({ behavior: 'smooth' })
        }}
        onConnectBotCalendarSync={() => {
          const botCalendarSection = document.getElementById('bot-calendar-sync')
          if (botCalendarSection) {
            botCalendarSection.scrollIntoView({ behavior: 'smooth' })
            return
          }
          setShowAutoRecordPrompt(true)
        }}
        isLoading={meetingBaaSLoading || meetingBaaSConnecting}
      />

      {/* Usage Card */}
      {usage && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5 text-emerald-600" />
                Usage This Month
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                    {usage.recordings_count} / {usage.recordings_limit}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    recordings used
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {remainingRecordings}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    remaining
                  </p>
                </div>
              </div>
              <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    usagePercent > 90 ? 'bg-red-500' :
                    usagePercent > 70 ? 'bg-amber-500' :
                    'bg-emerald-500'
                  )}
                  style={{ width: `${Math.min(100, usagePercent)}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Bot Settings */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-emerald-600" />
              Bot Appearance
            </CardTitle>
            <CardDescription>
              Customize how your recording bot appears in meetings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Bot Preview */}
            <div className="flex items-center gap-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/30">
              <img
                src={DEFAULT_SIXTY_ICON_URL}
                alt="Bot Avatar"
                className="h-12 w-12 rounded-lg shadow-sm"
              />
              <div className="flex-1">
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {botName || '60 Notetaker'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  This is how your bot will appear in meetings
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="botName">Bot Name</Label>
              <Input
                id="botName"
                placeholder="60 Notetaker"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                This name will appear in the meeting participant list
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="entryMessage">Entry Message</Label>
                <Switch
                  id="entryMessageEnabled"
                  checked={entryMessageEnabled}
                  onCheckedChange={setEntryMessageEnabled}
                />
              </div>
              <Input
                id="entryMessage"
                placeholder="Hi! I'm here to take notes for {rep_name}."
                value={entryMessage}
                onChange={(e) => setEntryMessage(e.target.value)}
                disabled={!entryMessageEnabled}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Use {'{rep_name}'}, {'{company_name}'}, or {'{meeting_title}'} as placeholders
              </p>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-200/50 dark:border-gray-700/30">
              <div>
                <Label htmlFor="autoRecord">Auto-Record Matching Meetings</Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Automatically start recording when a meeting matches your rules
                </p>
              </div>
              <Switch
                id="autoRecord"
                checked={autoRecord}
                onCheckedChange={setAutoRecord}
              />
            </div>

            {/* Auto-record advanced settings - only show when enabled */}
            {autoRecord && (
              <div className="space-y-4 pl-4 border-l-2 border-emerald-200 dark:border-emerald-800 ml-2">
                {/* Lead time setting */}
                <div className="space-y-2">
                  <Label htmlFor="leadTime" className="text-sm">Join Before Meeting Starts</Label>
                  <div className="flex items-center gap-3">
                    <Select
                      value={autoRecordLeadTime.toString()}
                      onValueChange={(value) => setAutoRecordLeadTime(parseInt(value))}
                    >
                      <SelectTrigger id="leadTime" className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">At start</SelectItem>
                        <SelectItem value="1">1 minute</SelectItem>
                        <SelectItem value="2">2 minutes</SelectItem>
                        <SelectItem value="3">3 minutes</SelectItem>
                        <SelectItem value="5">5 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-gray-500 dark:text-gray-400">before meeting starts</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    The bot will join the meeting this many minutes early to ensure it's ready
                  </p>
                </div>

                {/* External-only setting */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="externalOnly" className="text-sm">External Meetings Only</Label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Only auto-record meetings with external attendees (outside your company)
                    </p>
                  </div>
                  <Switch
                    id="externalOnly"
                    checked={autoRecordExternalOnly}
                    onCheckedChange={setAutoRecordExternalOnly}
                  />
                </div>
              </div>
            )}

            <Button
              onClick={handleSaveSettings}
              disabled={saving}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Settings
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Recording Mode */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-emerald-600" />
              Recording Mode
            </CardTitle>
            <CardDescription>
              Choose how the 60 Notetaker decides which meetings to record
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Join All Meetings Toggle */}
            <div className="flex items-start justify-between p-4 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/20 border border-emerald-200/50 dark:border-emerald-700/30">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="joinAll" className="text-base font-medium">
                    Record All Meetings
                  </Label>
                  {joinAllMeetings && (
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {joinAllMeetings
                    ? "The 60 Notetaker will automatically join and record all meetings on your calendar."
                    : "Use custom rules below to control which meetings are recorded."}
                </p>
              </div>
              <Switch
                id="joinAll"
                checked={joinAllMeetings}
                onCheckedChange={setJoinAllMeetings}
              />
            </div>

            {/* Custom Rules Section - Only show when joinAllMeetings is OFF */}
            {!joinAllMeetings && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <Shield className="h-4 w-4 text-gray-500" />
                      Custom Recording Rules
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Only meetings matching these rules will be recorded
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setShowAddRuleModal(true)}
                  >
                    <Plus className="h-4 w-4" />
                    Add Rule
                  </Button>
                </div>

                {rules && rules.length > 0 ? (
                  <div className="space-y-3">
                    {rules.map((rule, index) => (
                      <RuleCard
                        key={rule.id}
                        rule={rule}
                        onDelete={handleDeleteRule}
                        onToggle={handleToggleRule}
                        onEdit={handleEditRule}
                        onMoveUp={() => handleMoveRuleUp(index)}
                        onMoveDown={() => handleMoveRuleDown(index)}
                        isFirst={index === 0}
                        isLast={index === rules.length - 1}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
                    <Shield className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 mb-3 text-sm">
                      No recording rules configured yet.
                      <br />
                      Without rules, no meetings will be recorded.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setShowAddRuleModal(true)}
                    >
                      <Plus className="h-4 w-4" />
                      Create First Rule
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Info when Join All is ON */}
            {joinAllMeetings && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-700/30">
                <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  <p className="font-medium mb-1">Recording all meetings</p>
                  <p className="text-blue-600/80 dark:text-blue-400/80">
                    To selectively record meetings based on specific criteria (like external participants only,
                    or meetings with certain keywords), turn off "Record All Meetings" and configure custom rules.
                  </p>
                </div>
              </div>
            )}

            <Button
              onClick={handleSaveSettings}
              disabled={saving}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Recording Mode
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Calendar Selection */}
      {googleConnected && (
        <motion.div
          id="calendar-selection"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-emerald-600" />
                Calendar Selection
              </CardTitle>
              <CardDescription>
                Choose which calendar the 60 Notetaker should watch for meetings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="calendarSelect">Active Calendar</Label>
                {calendarsLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : calendarsData?.calendars && calendarsData.calendars.length > 0 ? (
                  <Select
                    value={selectedCalendarId}
                    onValueChange={setSelectedCalendarId}
                  >
                    <SelectTrigger id="calendarSelect">
                      <SelectValue placeholder="Select a calendar" />
                    </SelectTrigger>
                    <SelectContent>
                      {calendarsData.calendars.map((calendar: { id: string; summary: string; backgroundColor?: string; primary?: boolean }) => (
                        <SelectItem key={calendar.id} value={calendar.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: calendar.backgroundColor || '#4285f4' }}
                            />
                            {calendar.summary}
                            {calendar.primary && (
                              <span className="text-xs text-gray-500 ml-1">(Primary)</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Select
                      value={selectedCalendarId}
                      onValueChange={setSelectedCalendarId}
                    >
                      <SelectTrigger id="calendarSelect">
                        <SelectValue placeholder="Select a calendar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="primary">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-blue-500" />
                            Primary Calendar
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Unable to load calendars. Using default primary calendar.
                    </p>
                  </div>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Only meetings from the selected calendar will be recorded
                </p>
              </div>

              <Button
                onClick={handleSaveCalendarSelection}
                disabled={isUpdating || selectedCalendarId === userSettings?.selected_calendar_id}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                {isUpdating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Calendar Selection
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* MeetingBaaS Calendar Connection */}
      <motion.div
        id="bot-calendar-sync"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-emerald-600" />
              Bot Calendar Sync
            </CardTitle>
            <CardDescription>
              Connect your calendar to enable automatic bot deployment for meetings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {googleLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : !googleConnected ? (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-gray-50/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/30">
                <AlertCircle className="h-5 w-5 text-gray-400 mt-0.5 shrink-0" />
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <p className="font-medium mb-1">Google Calendar required</p>
                  <p>
                    Please connect your Google Calendar in the{' '}
                    <Button
                      variant="link"
                      className="h-auto p-0 text-emerald-600"
                      onClick={() => navigate('/integrations')}
                    >
                      Integrations page
                    </Button>{' '}
                    first to enable bot calendar sync.
                  </p>
                </div>
              </div>
            ) : meetingBaaSLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : hasMeetingBaaSCalendar ? (
              <div className="flex items-center justify-between p-4 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/20 border border-emerald-200/50 dark:border-emerald-700/30">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-medium text-emerald-700 dark:text-emerald-300">
                      Calendar Connected
                    </p>
                    <p className="text-sm text-emerald-600/80 dark:text-emerald-400/80">
                      {meetingBaaSCalendar?.email || 'Primary Calendar'} •
                      {meetingBaaSCalendar?.platform === 'google' ? ' Google Calendar' : ' Microsoft Calendar'}
                    </p>
                  </div>
                </div>
                <Badge variant="default" className="bg-emerald-600">
                  Active
                </Badge>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50/50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-700/30">
                  <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-sm text-amber-700 dark:text-amber-300">
                    <p className="font-medium mb-1">
                      {autoRecord ? 'Auto-recording is on, but bot calendar sync isn’t connected' : 'Bot calendar sync not connected'}
                    </p>
                    <p className="text-amber-600/80 dark:text-amber-400/80">
                      Connect once to allow the 60 Notetaker to automatically join meetings from your selected calendar.
                      This uses your existing Google Calendar connection.
                    </p>
                  </div>
                </div>

                <Button
                  onClick={() => connectMeetingBaaSCalendar(selectedCalendarId)}
                  disabled={meetingBaaSConnecting}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  {meetingBaaSConnecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting Calendar...
                    </>
                  ) : (
                    <>
                      <Link2 className="mr-2 h-4 w-4" />
                      Connect Calendar for Bot Deployment
                    </>
                  )}
                </Button>
              </div>
            )}

            {hasMeetingBaaSCalendar && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-700/30">
                <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  <p className="font-medium mb-1">How it works</p>
                  <p className="text-blue-600/80 dark:text-blue-400/80">
                    When a meeting is scheduled on your calendar, the 60 Notetaker bot will automatically
                    join at the meeting start time to record and transcribe your conversation.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Help Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <Accordion type="single" collapsible className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl border border-gray-200/50 dark:border-gray-700/30">
          <AccordionItem value="how-it-works">
            <AccordionTrigger className="px-4">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-emerald-600" />
                How Recording Works
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                <p>
                  <strong>1. Rules Engine:</strong> When a calendar event is detected, it's evaluated against your recording rules. If it matches, a recording bot is scheduled.
                </p>
                <p>
                  <strong>2. Bot Joins:</strong> At the meeting start time, the bot joins the meeting and begins recording. Participants will see the bot in the meeting.
                </p>
                <p>
                  <strong>3. Processing:</strong> After the meeting ends, the recording is processed. Transcripts are generated and AI analysis extracts key insights.
                </p>
                <p>
                  <strong>4. CRM Sync:</strong> The recording is automatically linked to relevant CRM contacts and deals based on participant emails.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="platforms">
            <AccordionTrigger className="px-4">
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-emerald-600" />
                Supported Platforms
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Zoom</span>
                </div>
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">Google Meet</span>
                </div>
                <div className="flex items-center gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <CheckCircle2 className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-700 dark:text-purple-300">MS Teams</span>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </motion.div>

      {/* Enable Auto-Recording Prompt */}
      <EnableAutoRecordingPrompt
        open={showAutoRecordPrompt}
        onOpenChange={setShowAutoRecordPrompt}
        onEnableAutoRecording={handleEnableAutoRecordingFromPrompt}
        onSkip={() => setShowAutoRecordPrompt(false)}
        selectedCalendarName={calendarsData?.calendars?.find((c: { id: string }) => c.id === selectedCalendarId)?.summary}
      />

      {/* Rule Modal (Create/Edit) */}
      <Dialog open={showRuleModal} onOpenChange={(open) => {
        if (!open) resetRuleForm()
        setShowRuleModal(open)
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-emerald-600" />
              {editingRule ? 'Edit Recording Rule' : 'Create Recording Rule'}
            </DialogTitle>
            <DialogDescription>
              {editingRule
                ? 'Update the criteria for when the 60 Notetaker should record meetings'
                : 'Define which meetings the 60 Notetaker should automatically record'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Rule Name */}
            <div className="space-y-2">
              <Label htmlFor="ruleName">Rule Name *</Label>
              <Input
                id="ruleName"
                placeholder="e.g., External Sales Calls"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
              />
            </div>

            {/* Domain Mode */}
            <div className="space-y-2">
              <Label htmlFor="domainMode">Who to Record</Label>
              <Select
                value={ruleDomainMode}
                onValueChange={(value) => setRuleDomainMode(value as DomainMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="external_only">External participants only</SelectItem>
                  <SelectItem value="internal_only">Internal participants only</SelectItem>
                  <SelectItem value="specific_domains">Specific domains</SelectItem>
                  <SelectItem value="all">All meetings</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {ruleDomainMode === 'external_only' && 'Only record when attendees are from outside your company'}
                {ruleDomainMode === 'internal_only' && 'Only record internal team meetings'}
                {ruleDomainMode === 'specific_domains' && 'Only record meetings with specific email domains'}
                {ruleDomainMode === 'all' && 'Record all meetings matching other criteria'}
              </p>
            </div>

            {/* Specific Domains (conditional) */}
            {ruleDomainMode === 'specific_domains' && (
              <div className="space-y-2">
                <Label htmlFor="specificDomains">Domains (comma-separated)</Label>
                <Input
                  id="specificDomains"
                  placeholder="e.g., acme.com, bigco.com"
                  value={ruleSpecificDomains}
                  onChange={(e) => setRuleSpecificDomains(e.target.value)}
                />
              </div>
            )}

            {/* Attendee Count */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="minAttendees">Min Attendees</Label>
                <Input
                  id="minAttendees"
                  type="number"
                  min="1"
                  placeholder="1"
                  value={ruleMinAttendees}
                  onChange={(e) => setRuleMinAttendees(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxAttendees">Max Attendees</Label>
                <Input
                  id="maxAttendees"
                  type="number"
                  min="1"
                  placeholder="No limit"
                  value={ruleMaxAttendees}
                  onChange={(e) => setRuleMaxAttendees(e.target.value)}
                />
              </div>
            </div>

            {/* Title Keywords */}
            <div className="space-y-2">
              <Label htmlFor="titleKeywords">Title Keywords (optional)</Label>
              <Input
                id="titleKeywords"
                placeholder="e.g., demo, discovery, sales"
                value={ruleTitleKeywords}
                onChange={(e) => setRuleTitleKeywords(e.target.value)}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Only record if meeting title contains these keywords (comma-separated)
              </p>
            </div>

            {/* Exclude Keywords */}
            <div className="space-y-2">
              <Label htmlFor="excludeKeywords">Exclude Keywords (optional)</Label>
              <Input
                id="excludeKeywords"
                placeholder="e.g., internal, 1:1, standup"
                value={ruleExcludeKeywords}
                onChange={(e) => setRuleExcludeKeywords(e.target.value)}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Skip recording if meeting title contains these keywords (comma-separated)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                resetRuleForm()
                setShowRuleModal(false)
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveRule}
              disabled={savingRule || !ruleName.trim()}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {savingRule ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : editingRule ? (
                <Save className="mr-2 h-4 w-4" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {editingRule ? 'Save Changes' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default RecordingSettings
