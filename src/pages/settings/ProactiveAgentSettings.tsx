/**
 * ProactiveAgentSettings Page
 *
 * Admin settings page for configuring the proactive agent at the org level.
 * Allows enabling/disabling the proactive agent and configuring individual sequences.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
} from 'lucide-react';

import { PageContainer } from '@/components/layout/PageContainer';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { ProactiveAgentSetup } from '@/components/agent/ProactiveAgentSetup';

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

  const isAdmin = permissions.canManageSettings || permissions.canManageTeam || isPlatformAdmin;

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
  if (isLoading) {
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
          </>
        )}
        </div>
      </PageContainer>
    </>
  );
}
