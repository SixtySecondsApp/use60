/**
 * ProactiveAgentSettings Page
 *
 * Combined settings for the proactive agent:
 * - Org-level: master toggle, sequence enable/disable, delivery channels
 * - User-level: agent persona (name, tone, schedule, quiet hours)
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Video,
  Clock,
  AlertTriangle,
  RefreshCw,
  GraduationCap,
  Mail,
  Inbox,
  FileText,
  Calendar,
  Info,
  Sparkles,
  ArrowRight,
  Zap,
  Bot,
  Save,
} from 'lucide-react';

import { PageContainer } from '@/components/layout/PageContainer';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { ProactiveAgentSetup } from '@/components/agent/ProactiveAgentSetup';
import { cn } from '@/lib/utils';

// Sequence configuration with display info
const SEQUENCES = [
  // Core (Recommended)
  {
    type: 'meeting_ended',
    name: 'Post-Meeting Debrief',
    description: 'Summarizes meetings with action items, coaching insights, and follow-up emails',
    icon: Video,
    category: 'core',
  },
  {
    type: 'pre_meeting_90min',
    name: 'Pre-Meeting Briefing',
    description: 'Delivers meeting prep briefings 90 min before scheduled calls',
    icon: Clock,
    category: 'core',
  },
  {
    type: 'deal_risk_scan',
    name: 'Deal Risk Scanner',
    description: 'Scans active deals for risk signals and delivers risk digests',
    icon: AlertTriangle,
    category: 'core',
  },
  // Advanced
  {
    type: 'stale_deal_revival',
    name: 'Stale Deal Revival',
    description: 'Identifies dormant deals and suggests re-engagement strategies',
    icon: RefreshCw,
    category: 'advanced',
  },
  {
    type: 'coaching_weekly',
    name: 'Weekly Coaching',
    description: 'Aggregates coaching insights across meetings for weekly digests',
    icon: GraduationCap,
    category: 'advanced',
  },
  {
    type: 'campaign_daily_check',
    name: 'Campaign Monitor',
    description: 'Monitors email campaign performance and classifies replies',
    icon: Mail,
    category: 'advanced',
  },
  {
    type: 'email_received',
    name: 'Email Handler',
    description: 'Processes incoming emails and suggests responses',
    icon: Inbox,
    category: 'advanced',
  },
  {
    type: 'proposal_generation',
    name: 'Proposal Generator',
    description: 'Generates proposals from meeting transcripts',
    icon: FileText,
    category: 'advanced',
  },
  {
    type: 'calendar_find_times',
    name: 'Calendar Scheduler',
    description: 'Finds mutual availability for scheduling meetings',
    icon: Calendar,
    category: 'advanced',
  },
] as const;

type SequenceType = typeof SEQUENCES[number]['type'];
type DeliveryChannel = 'slack' | 'in_app' | 'both';

interface ProactiveAgentConfig {
  org_id: string;
  is_enabled: boolean;
  enabled_sequences: Record<SequenceType, { enabled: boolean; delivery_channel: DeliveryChannel }>;
  default_delivery: DeliveryChannel;
}

// Persona configuration constants
const TONE_OPTIONS = [
  { value: 'concise', label: 'Concise', description: 'Brief and bullet-pointed. No fluff.' },
  { value: 'conversational', label: 'Conversational', description: 'Warm and friendly, like a helpful colleague.' },
  { value: 'direct', label: 'Direct', description: 'Assertive and action-oriented. Leads with the most important item.' },
  { value: 'custom', label: 'Custom', description: 'Define your own tone with custom instructions.' },
];

const FREQUENCY_OPTIONS = [
  { value: 'aggressive', label: 'Aggressive', description: 'Maximum proactive outreach — perfect for high-volume pipelines.' },
  { value: 'balanced', label: 'Balanced', description: 'Smart batching with immediate alerts for high-priority items.' },
  { value: 'quiet', label: 'Quiet', description: 'Minimal interruptions — only critical alerts reach you in real-time.' },
];

const FOCUS_OPTIONS = [
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'meetings', label: 'Meetings' },
  { value: 'outreach', label: 'Outreach' },
  { value: 'admin', label: 'Admin' },
];

const TONE_SAMPLES: Record<string, string> = {
  concise: 'You have 3 meetings today. Deal with Acme ($50K) hasn\'t been updated in 8 days. 2 overdue tasks need attention.',
  conversational: 'Good morning! Looks like a busy day ahead with 3 meetings lined up. Quick heads up — your Acme deal ($50K) could use some love, it\'s been quiet for over a week. Also, you\'ve got a couple tasks that slipped past their due dates.',
  direct: 'Priority: Update the Acme deal immediately — 8 days stale, $50K at risk. Clear your 2 overdue tasks before your first meeting at 10am.',
  custom: 'Your agent will use your custom instructions to shape its communication style.',
};

interface PersonaFormData {
  agent_name: string;
  tone: string;
  custom_instructions: string;
  proactive_frequency: string;
  focus_areas: string[];
  quiet_hours_start: string;
  quiet_hours_end: string;
  timezone: string;
  morning_briefing_time: string;
  morning_briefing_enabled: boolean;
}

function SequenceCard({
  sequence,
  config,
  onUpdate,
  isUpdating,
}: {
  sequence: typeof SEQUENCES[number];
  config: ProactiveAgentConfig['enabled_sequences'][SequenceType] | undefined;
  onUpdate: (enabled: boolean, deliveryChannel: DeliveryChannel) => void;
  isUpdating: boolean;
}) {
  const Icon = sequence.icon;
  const isEnabled = config?.enabled ?? false;
  const deliveryChannel = config?.delivery_channel || 'slack';

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{sequence.name}</CardTitle>
                {sequence.category === 'core' && (
                  <Badge variant="default" className="text-xs">
                    Recommended
                  </Badge>
                )}
                {sequence.category === 'advanced' && (
                  <Badge variant="secondary" className="text-xs">
                    Advanced
                  </Badge>
                )}
              </div>
              <CardDescription className="text-sm mt-1">{sequence.description}</CardDescription>
            </div>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) => onUpdate(checked, deliveryChannel)}
            disabled={isUpdating}
          />
        </div>
      </CardHeader>

      {isEnabled && (
        <CardContent>
          <div className="space-y-2">
            <Label>Delivery Channel</Label>
            <Select
              value={deliveryChannel}
              onValueChange={(value) => onUpdate(true, value as DeliveryChannel)}
              disabled={isUpdating}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="slack">Slack DM</SelectItem>
                <SelectItem value="in_app">In-App Feed</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function ProactiveAgentSettings() {
  const activeOrgId = useActiveOrgId();
  const { permissions } = useOrg();
  const { isPlatformAdmin } = useUserPermissions();
  const queryClient = useQueryClient();
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  const { user } = useAuth();

  const isAdmin = permissions.canManageSettings || permissions.canManageTeam || isPlatformAdmin;

  // Persona form state
  const [personaForm, setPersonaForm] = useState<PersonaFormData>({
    agent_name: 'Sixty',
    tone: 'concise',
    custom_instructions: '',
    proactive_frequency: 'balanced',
    focus_areas: ['pipeline', 'meetings'],
    quiet_hours_start: '20:00',
    quiet_hours_end: '08:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    morning_briefing_time: '08:00',
    morning_briefing_enabled: true,
  });

  // Fetch existing persona (user-level)
  const { data: persona, isLoading: isPersonaLoading } = useQuery({
    queryKey: ['agent-persona', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('agent_persona')
        .select('agent_name, tone, custom_instructions, proactive_frequency, focus_areas, quiet_hours_start, quiet_hours_end, timezone, morning_briefing_time, morning_briefing_enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Populate persona form when data loads
  useEffect(() => {
    if (persona) {
      setPersonaForm({
        agent_name: persona.agent_name || 'Sixty',
        tone: persona.tone || 'concise',
        custom_instructions: persona.custom_instructions || '',
        proactive_frequency: persona.proactive_frequency || 'balanced',
        focus_areas: Array.isArray(persona.focus_areas) ? persona.focus_areas : ['pipeline', 'meetings'],
        quiet_hours_start: persona.quiet_hours_start || '20:00',
        quiet_hours_end: persona.quiet_hours_end || '08:00',
        timezone: persona.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        morning_briefing_time: persona.morning_briefing_time || '08:00',
        morning_briefing_enabled: persona.morning_briefing_enabled ?? true,
      });
    }
  }, [persona]);

  // Save persona mutation
  const savePersona = useMutation({
    mutationFn: async (data: PersonaFormData) => {
      if (!user?.id || !activeOrgId) throw new Error('Missing user or org');
      const { error } = await supabase.rpc('upsert_agent_persona', {
        p_user_id: user.id,
        p_org_id: activeOrgId,
        p_agent_name: data.agent_name,
        p_tone: data.tone,
        p_custom_instructions: data.custom_instructions || null,
        p_proactive_frequency: data.proactive_frequency,
        p_focus_areas: data.focus_areas,
        p_quiet_hours_start: data.quiet_hours_start,
        p_quiet_hours_end: data.quiet_hours_end,
        p_timezone: data.timezone,
        p_morning_briefing_time: data.morning_briefing_time,
        p_morning_briefing_enabled: data.morning_briefing_enabled,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-persona'] });
      toast.success('Agent persona saved');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to save persona');
    },
  });

  const toggleFocusArea = (area: string) => {
    setPersonaForm((prev) => ({
      ...prev,
      focus_areas: prev.focus_areas.includes(area)
        ? prev.focus_areas.filter((a) => a !== area)
        : [...prev.focus_areas, area],
    }));
  };

  // Fetch current config
  const { data: config, isLoading } = useQuery({
    queryKey: ['proactive-agent-config', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return null;

      const { data, error } = await supabase.rpc('get_proactive_agent_config', {
        p_org_id: activeOrgId,
      });

      if (error) throw error;
      return data?.[0] as ProactiveAgentConfig | null;
    },
    enabled: !!activeOrgId && isAdmin,
  });

  // Update config mutation
  const updateConfig = useMutation({
    mutationFn: async (updates: {
      is_enabled?: boolean;
      enabled_sequences?: ProactiveAgentConfig['enabled_sequences'];
      default_delivery?: DeliveryChannel;
    }) => {
      if (!activeOrgId) throw new Error('No active organization');

      const currentEnabledSequences = config?.enabled_sequences || {};
      const currentIsEnabled = config?.is_enabled ?? false;
      const currentDefaultDelivery = config?.default_delivery || 'slack';

      const { error } = await supabase.rpc('upsert_proactive_agent_config', {
        p_org_id: activeOrgId,
        p_is_enabled: updates.is_enabled ?? currentIsEnabled,
        p_enabled_sequences: updates.enabled_sequences || currentEnabledSequences,
        p_default_delivery: updates.default_delivery || currentDefaultDelivery,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proactive-agent-config'] });
      toast.success('Settings saved');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to save settings');
    },
  });

  // Handle master toggle
  const handleMasterToggle = (enabled: boolean) => {
    // If enabling for the first time (no config exists or was previously disabled), show wizard
    if (enabled && (!config || !config.is_enabled)) {
      setShowSetupWizard(true);
    } else {
      // Otherwise just toggle off
      updateConfig.mutate({ is_enabled: enabled });
    }
  };

  // Handle wizard completion
  const handleSetupComplete = () => {
    setShowSetupWizard(false);
    queryClient.invalidateQueries({ queryKey: ['proactive-agent-config'] });
  };

  // Handle wizard close without completing
  const handleSetupClose = () => {
    setShowSetupWizard(false);
  };

  // Handle sequence toggle/update
  const handleSequenceUpdate = (
    sequenceType: SequenceType,
    enabled: boolean,
    deliveryChannel: DeliveryChannel
  ) => {
    const currentSequences = config?.enabled_sequences || {};
    updateConfig.mutate({
      enabled_sequences: {
        ...currentSequences,
        [sequenceType]: { enabled, delivery_channel: deliveryChannel },
      },
    });
  };

  // Loading state
  if (isLoading || isPersonaLoading) {
    return (
      <PageContainer maxWidth="4xl" className="py-8">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageContainer>
    );
  }

  // Non-admin users shouldn't see this page
  if (!isAdmin) {
    return (
      <PageContainer maxWidth="4xl" className="py-8">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Only organization administrators can access this page.
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  const isMasterEnabled = config?.is_enabled ?? false;
  const coreSequences = SEQUENCES.filter((s) => s.category === 'core');
  const advancedSequences = SEQUENCES.filter((s) => s.category === 'advanced');

  return (
    <>
      <ProactiveAgentSetup
        open={showSetupWizard}
        onClose={handleSetupClose}
        onComplete={handleSetupComplete}
      />

      <PageContainer maxWidth="4xl" className="py-8">
        <div className="space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold">Proactive Agent</h1>
            <p className="text-muted-foreground mt-1">
              Configure autonomous AI workflows that monitor your pipeline and take action.
            </p>
          </div>

        {/* Master Toggle */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Enable Proactive Agent</CardTitle>
                  <CardDescription>
                    Turn on AI-powered automation for this organization
                  </CardDescription>
                </div>
              </div>
              <Switch
                checked={isMasterEnabled}
                onCheckedChange={handleMasterToggle}
                disabled={updateConfig.isPending}
              />
            </div>
          </CardHeader>
        </Card>

        {isMasterEnabled && (
          <>
            {/* Marketplace CTA */}
            <Card className="border-indigo-200 dark:border-indigo-800/30 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg">
                      <Zap className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Abilities Marketplace</CardTitle>
                      <CardDescription>
                        Discover and configure all available AI abilities organized by sales lifecycle
                      </CardDescription>
                    </div>
                  </div>
                  <Button asChild className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    <Link to="/agent/marketplace">
                      Explore Marketplace
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardHeader>
            </Card>

            {/* Core Sequences */}
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Core Sequences</h2>
                <p className="text-sm text-muted-foreground">
                  Recommended workflows for most organizations
                </p>
              </div>
              <div className="grid gap-4">
                {coreSequences.map((sequence) => (
                  <SequenceCard
                    key={sequence.type}
                    sequence={sequence}
                    config={config?.enabled_sequences?.[sequence.type]}
                    onUpdate={(enabled, deliveryChannel) =>
                      handleSequenceUpdate(sequence.type, enabled, deliveryChannel)
                    }
                    isUpdating={updateConfig.isPending}
                  />
                ))}
              </div>
            </div>

            {/* Advanced Sequences */}
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Advanced Sequences</h2>
                <p className="text-sm text-muted-foreground">
                  Additional workflows for specific use cases
                </p>
              </div>
              <div className="grid gap-4">
                {advancedSequences.map((sequence) => (
                  <SequenceCard
                    key={sequence.type}
                    sequence={sequence}
                    config={config?.enabled_sequences?.[sequence.type]}
                    onUpdate={(enabled, deliveryChannel) =>
                      handleSequenceUpdate(sequence.type, enabled, deliveryChannel)
                    }
                    isUpdating={updateConfig.isPending}
                  />
                ))}
              </div>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Sequences run automatically based on triggers like meeting completions, time-based
                schedules, or pipeline events. You can monitor activity in the Agent Dashboard.
              </AlertDescription>
            </Alert>

            {/* Your Agent Persona (user-level) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Your Agent Persona</h2>
                  <p className="text-sm text-muted-foreground">
                    Customize how your agent communicates and when it reaches out.
                  </p>
                </div>
                <Button
                  onClick={() => savePersona.mutate(personaForm)}
                  disabled={savePersona.isPending}
                  size="sm"
                >
                  {savePersona.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save Persona
                </Button>
              </div>

              {/* Identity */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="w-5 h-5" />
                    Identity
                  </CardTitle>
                  <CardDescription>Give your agent a name and communication style.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="agent-name">Agent Name</Label>
                    <Input
                      id="agent-name"
                      value={personaForm.agent_name}
                      onChange={(e) => setPersonaForm({ ...personaForm, agent_name: e.target.value })}
                      placeholder="Sixty"
                      maxLength={30}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Tone</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {TONE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setPersonaForm({ ...personaForm, tone: option.value })}
                          className={cn(
                            'p-3 rounded-lg border text-left transition-all',
                            personaForm.tone === option.value
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-muted-foreground/30'
                          )}
                        >
                          <p className="text-sm font-medium">{option.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {personaForm.tone === 'custom' && (
                    <div className="space-y-2">
                      <Label htmlFor="custom-instructions">Custom Instructions</Label>
                      <Textarea
                        id="custom-instructions"
                        value={personaForm.custom_instructions}
                        onChange={(e) => setPersonaForm({ ...personaForm, custom_instructions: e.target.value })}
                        placeholder="Describe how your agent should communicate..."
                        maxLength={3072}
                        rows={4}
                      />
                      <p className="text-xs text-muted-foreground">
                        {personaForm.custom_instructions.length}/3072 characters
                      </p>
                    </div>
                  )}

                  {/* Tone Preview */}
                  <div className="p-4 rounded-lg bg-muted/50 border">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Preview: How {personaForm.agent_name || 'your agent'} will sound
                    </p>
                    <p className="text-sm text-muted-foreground italic">
                      &ldquo;{TONE_SAMPLES[personaForm.tone] || TONE_SAMPLES.concise}&rdquo;
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Proactive Behavior */}
              <Card>
                <CardHeader>
                  <CardTitle>Proactive Behavior</CardTitle>
                  <CardDescription>Control how often your agent reaches out and what it focuses on.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Notification Frequency</Label>
                    <Select
                      value={personaForm.proactive_frequency}
                      onValueChange={(v) => setPersonaForm({ ...personaForm, proactive_frequency: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {FREQUENCY_OPTIONS.find((o) => o.value === personaForm.proactive_frequency)?.description}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Focus Areas</Label>
                    <div className="flex flex-wrap gap-2">
                      {FOCUS_OPTIONS.map((area) => (
                        <button
                          key={area.value}
                          onClick={() => toggleFocusArea(area.value)}
                          className={cn(
                            'px-3 py-1.5 rounded-full text-sm font-medium transition-colors border',
                            personaForm.focus_areas.includes(area.value)
                              ? 'bg-primary text-primary-foreground border-transparent'
                              : 'text-muted-foreground border-border hover:border-muted-foreground/30'
                          )}
                        >
                          {area.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Schedule */}
              <Card>
                <CardHeader>
                  <CardTitle>Schedule</CardTitle>
                  <CardDescription>Set your quiet hours and morning briefing time.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Morning Briefing</Label>
                      <p className="text-xs text-muted-foreground">Daily summary delivered via Slack DM</p>
                    </div>
                    <Switch
                      checked={personaForm.morning_briefing_enabled}
                      onCheckedChange={(v) => setPersonaForm({ ...personaForm, morning_briefing_enabled: v })}
                    />
                  </div>

                  {personaForm.morning_briefing_enabled && (
                    <div className="space-y-2">
                      <Label htmlFor="briefing-time">Briefing Time</Label>
                      <Input
                        id="briefing-time"
                        type="time"
                        value={personaForm.morning_briefing_time}
                        onChange={(e) => setPersonaForm({ ...personaForm, morning_briefing_time: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="quiet-start">Quiet Hours Start</Label>
                      <Input
                        id="quiet-start"
                        type="time"
                        value={personaForm.quiet_hours_start}
                        onChange={(e) => setPersonaForm({ ...personaForm, quiet_hours_start: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="quiet-end">Quiet Hours End</Label>
                      <Input
                        id="quiet-end"
                        type="time"
                        value={personaForm.quiet_hours_end}
                        onChange={(e) => setPersonaForm({ ...personaForm, quiet_hours_end: e.target.value })}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    During quiet hours, notifications are batched into your next morning briefing.
                  </p>
                </CardContent>
              </Card>
            </div>
          </>
        )}
        </div>
      </PageContainer>
    </>
  );
}
