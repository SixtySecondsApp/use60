/**
 * ProactiveAgentSetup Component
 *
 * Multi-step onboarding wizard for the proactive agent.
 * Shows when an admin enables the proactive agent for the first time.
 *
 * Steps:
 * 1. Prerequisites checklist with pass/fail/warning badges
 * 2. Choose which sequences to enable (recommended defaults pre-selected)
 * 3. Review and activate
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  Check,
  X,
  AlertTriangle,
  ArrowRight,
  Shield,
  Slack,
  Calendar,
  Mail,
  Zap,
  Video,
  Clock,
  RefreshCw,
  GraduationCap,
  Inbox,
  FileText,
  Sparkles,
} from 'lucide-react';

import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

interface PrerequisiteCheck {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  fixUrl?: string;
}

type DeliveryChannel = 'slack' | 'in_app' | 'both';

interface SequenceConfig {
  type: string;
  name: string;
  description: string;
  icon: any;
  category: 'core' | 'advanced';
  recommended: boolean;
  enabled: boolean;
  deliveryChannel: DeliveryChannel;
}

// =============================================================================
// Sequence Definitions
// =============================================================================

const SEQUENCES: SequenceConfig[] = [
  // Core (Recommended ON)
  {
    type: 'meeting_ended',
    name: 'Post-Meeting Debrief',
    description: 'Summarizes meetings with action items, coaching insights, and follow-up emails',
    icon: Video,
    category: 'core',
    recommended: true,
    enabled: true,
    deliveryChannel: 'slack',
  },
  {
    type: 'pre_meeting_90min',
    name: 'Pre-Meeting Briefing',
    description: 'Delivers meeting prep briefings 90 min before scheduled calls',
    icon: Clock,
    category: 'core',
    recommended: true,
    enabled: true,
    deliveryChannel: 'slack',
  },
  {
    type: 'deal_risk_scan',
    name: 'Deal Risk Scanner',
    description: 'Scans active deals for risk signals and delivers risk digests',
    icon: AlertTriangle,
    category: 'core',
    recommended: true,
    enabled: true,
    deliveryChannel: 'slack',
  },
  // Advanced (Recommended OFF)
  {
    type: 'stale_deal_revival',
    name: 'Stale Deal Revival',
    description: 'Identifies dormant deals and suggests re-engagement strategies',
    icon: RefreshCw,
    category: 'advanced',
    recommended: false,
    enabled: false,
    deliveryChannel: 'slack',
  },
  {
    type: 'coaching_weekly',
    name: 'Weekly Coaching',
    description: 'Aggregates coaching insights across meetings for weekly digests',
    icon: GraduationCap,
    category: 'advanced',
    recommended: false,
    enabled: false,
    deliveryChannel: 'slack',
  },
  {
    type: 'campaign_daily_check',
    name: 'Campaign Monitor',
    description: 'Monitors email campaign performance and classifies replies',
    icon: Mail,
    category: 'advanced',
    recommended: false,
    enabled: false,
    deliveryChannel: 'slack',
  },
  {
    type: 'email_received',
    name: 'Email Handler',
    description: 'Processes incoming emails and suggests responses',
    icon: Inbox,
    category: 'advanced',
    recommended: false,
    enabled: false,
    deliveryChannel: 'slack',
  },
  {
    type: 'proposal_generation',
    name: 'Proposal Generator',
    description: 'Generates proposals from meeting transcripts',
    icon: FileText,
    category: 'advanced',
    recommended: false,
    enabled: false,
    deliveryChannel: 'slack',
  },
  {
    type: 'calendar_find_times',
    name: 'Calendar Scheduler',
    description: 'Finds mutual availability for scheduling meetings',
    icon: Calendar,
    category: 'advanced',
    recommended: false,
    enabled: false,
    deliveryChannel: 'slack',
  },
];

// =============================================================================
// Component
// =============================================================================

interface ProactiveAgentSetupProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function ProactiveAgentSetup({ open, onClose, onComplete }: ProactiveAgentSetupProps) {
  const { user } = useAuth();
  const activeOrgId = useActiveOrgId();

  const [currentStep, setCurrentStep] = useState(1);
  const [sequences, setSequences] = useState<SequenceConfig[]>(SEQUENCES);

  // Check prerequisites
  const { data: prerequisites, isLoading: isLoadingPrereqs } = useQuery({
    queryKey: ['proactive-prerequisites', activeOrgId, user?.id],
    queryFn: async () => {
      if (!activeOrgId || !user?.id) return null;
      return await checkPrerequisites(activeOrgId, user.id);
    },
    enabled: !!activeOrgId && !!user?.id && open,
  });

  // Save configuration mutation
  const saveConfig = useMutation({
    mutationFn: async () => {
      if (!activeOrgId) throw new Error('No active organization');

      // Build enabled_sequences object
      const enabledSequences = sequences.reduce((acc, seq) => {
        acc[seq.type] = {
          enabled: seq.enabled,
          delivery_channel: seq.deliveryChannel,
        };
        return acc;
      }, {} as Record<string, { enabled: boolean; delivery_channel: DeliveryChannel }>);

      const { error } = await supabase.rpc('upsert_proactive_agent_config', {
        p_org_id: activeOrgId,
        p_is_enabled: true,
        p_enabled_sequences: enabledSequences,
        p_default_delivery: 'slack',
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Proactive agent configured successfully');
      onComplete();
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to save configuration');
    },
  });

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    } else {
      // Final step - save config
      saveConfig.mutate();
    }
  };

  const handleSkip = () => {
    onClose();
  };

  const handleToggleSequence = (type: string) => {
    setSequences((prev) =>
      prev.map((seq) => (seq.type === type ? { ...seq, enabled: !seq.enabled } : seq))
    );
  };

  const criticalFailures = prerequisites?.filter((p) => p.status === 'fail') || [];
  const warnings = prerequisites?.filter((p) => p.status === 'warning') || [];
  const canProceed = criticalFailures.length === 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle>Setup Proactive Agent</DialogTitle>
              <DialogDescription>
                Configure AI-powered automation for your organization
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Progress Indicator */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map((step) => (
            <div key={step} className="flex items-center flex-1">
              <div
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full font-medium text-sm',
                  step === currentStep
                    ? 'bg-primary text-primary-foreground'
                    : step < currentStep
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {step < currentStep ? <Check className="h-4 w-4" /> : step}
              </div>
              {step < 3 && (
                <div
                  className={cn(
                    'flex-1 h-1 mx-2',
                    step < currentStep ? 'bg-primary/20' : 'bg-muted'
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        {currentStep === 1 && (
          <Step1Prerequisites
            prerequisites={prerequisites || []}
            isLoading={isLoadingPrereqs}
            canProceed={canProceed}
            criticalFailures={criticalFailures}
            warnings={warnings}
          />
        )}

        {currentStep === 2 && <Step2ChooseSequences sequences={sequences} onToggle={handleToggleSequence} />}

        {currentStep === 3 && <Step3Review sequences={sequences} />}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="ghost" onClick={handleSkip}>
            Skip and configure later
          </Button>
          <div className="flex items-center gap-2">
            {currentStep > 1 && (
              <Button variant="outline" onClick={() => setCurrentStep(currentStep - 1)}>
                Back
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={!canProceed || saveConfig.isPending}
            >
              {saveConfig.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Activating...
                </>
              ) : currentStep === 3 ? (
                'Activate'
              ) : (
                <>
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Step Components
// =============================================================================

function Step1Prerequisites({
  prerequisites,
  isLoading,
  canProceed,
  criticalFailures,
  warnings,
}: {
  prerequisites: PrerequisiteCheck[];
  isLoading: boolean;
  canProceed: boolean;
  criticalFailures: PrerequisiteCheck[];
  warnings: PrerequisiteCheck[];
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-lg mb-2">Prerequisites Check</h3>
        <p className="text-sm text-muted-foreground">
          Make sure your organization meets the requirements for the proactive agent.
        </p>
      </div>

      {!canProceed && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Please fix the critical issues below before proceeding.
          </AlertDescription>
        </Alert>
      )}

      {canProceed && warnings.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Some optional features are not configured. You can still proceed.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        {prerequisites.map((prereq, index) => (
          <PrerequisiteRow key={index} check={prereq} />
        ))}
      </div>
    </div>
  );
}

function PrerequisiteRow({ check }: { check: PrerequisiteCheck }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className="mt-0.5">
              {check.status === 'pass' && (
                <div className="p-1 bg-green-100 dark:bg-green-900/20 rounded-full">
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
              )}
              {check.status === 'fail' && (
                <div className="p-1 bg-red-100 dark:bg-red-900/20 rounded-full">
                  <X className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
              )}
              {check.status === 'warning' && (
                <div className="p-1 bg-yellow-100 dark:bg-yellow-900/20 rounded-full">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium">{check.name}</span>
                <Badge
                  variant={
                    check.status === 'pass'
                      ? 'default'
                      : check.status === 'fail'
                      ? 'destructive'
                      : 'secondary'
                  }
                  className="text-xs"
                >
                  {check.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{check.message}</p>
            </div>
          </div>
          {check.fixUrl && check.status !== 'pass' && (
            <Button variant="outline" size="sm" asChild>
              <a href={check.fixUrl}>Fix</a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Step2ChooseSequences({
  sequences,
  onToggle,
}: {
  sequences: SequenceConfig[];
  onToggle: (type: string) => void;
}) {
  const coreSequences = sequences.filter((s) => s.category === 'core');
  const advancedSequences = sequences.filter((s) => s.category === 'advanced');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-lg mb-2">Choose Sequences</h3>
        <p className="text-sm text-muted-foreground">
          Select which workflows to enable. You can change these later.
        </p>
      </div>

      {/* Core Sequences */}
      <div className="space-y-3">
        <div>
          <h4 className="font-medium mb-2">Core Sequences (Recommended)</h4>
          <p className="text-xs text-muted-foreground mb-3">
            Essential workflows for most organizations
          </p>
        </div>
        {coreSequences.map((seq) => (
          <SequenceToggleCard key={seq.type} sequence={seq} onToggle={onToggle} />
        ))}
      </div>

      <Separator />

      {/* Advanced Sequences */}
      <div className="space-y-3">
        <div>
          <h4 className="font-medium mb-2">Advanced Sequences</h4>
          <p className="text-xs text-muted-foreground mb-3">
            Additional workflows for specific use cases
          </p>
        </div>
        {advancedSequences.map((seq) => (
          <SequenceToggleCard key={seq.type} sequence={seq} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

function SequenceToggleCard({
  sequence,
  onToggle,
}: {
  sequence: SequenceConfig;
  onToggle: (type: string) => void;
}) {
  const Icon = sequence.icon;

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className="p-2 bg-primary/10 rounded-lg mt-0.5">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium">{sequence.name}</span>
                {sequence.recommended && (
                  <Badge variant="default" className="text-xs">
                    Recommended
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{sequence.description}</p>
            </div>
          </div>
          <Switch
            checked={sequence.enabled}
            onCheckedChange={() => onToggle(sequence.type)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Step3Review({ sequences }: { sequences: SequenceConfig[] }) {
  const enabledSequences = sequences.filter((s) => s.enabled);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-lg mb-2">Review & Activate</h3>
        <p className="text-sm text-muted-foreground">
          You're about to enable the following workflows.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enabled Sequences ({enabledSequences.length})</CardTitle>
          <CardDescription>
            These workflows will start running automatically based on their triggers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {enabledSequences.map((seq) => {
              const Icon = seq.icon;
              return (
                <div key={seq.type} className="flex items-center gap-3 py-2">
                  <div className="p-1.5 bg-primary/10 rounded">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{seq.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Delivery: {seq.deliveryChannel === 'slack' ? 'Slack DM' : seq.deliveryChannel === 'in_app' ? 'In-App Feed' : 'Both'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          All sequences respect your organization's data privacy settings and require explicit approval for actions.
        </AlertDescription>
      </Alert>
    </div>
  );
}

// =============================================================================
// Prerequisites Check Functions
// =============================================================================

async function checkPrerequisites(
  orgId: string,
  userId: string
): Promise<PrerequisiteCheck[]> {
  const checks: PrerequisiteCheck[] = [];

  // Run checks in parallel
  const [slackOrg, slackUser, googleCalendar] = await Promise.all([
    checkSlackOrgConnected(orgId),
    checkSlackUserMapped(orgId, userId),
    checkGoogleCalendar(orgId, userId),
  ]);

  checks.push(slackOrg);
  checks.push(slackUser);

  // Add optional checks (warnings)
  if (googleCalendar.status !== 'pass') {
    checks.push({
      ...googleCalendar,
      status: 'warning', // Downgrade to warning since it's optional
    });
  }

  return checks;
}

async function checkSlackOrgConnected(orgId: string): Promise<PrerequisiteCheck> {
  try {
    const { data, error } = await supabase
      .from('slack_org_settings')
      .select('is_connected')
      .eq('org_id', orgId)
      .eq('is_connected', true)
      .maybeSingle();

    if (error || !data) {
      return {
        name: 'Slack Workspace',
        status: 'fail',
        message: 'Slack workspace is not connected. Connect Slack to enable notifications.',
        fixUrl: '/settings/integrations/slack',
      };
    }

    return {
      name: 'Slack Workspace',
      status: 'pass',
      message: 'Slack workspace is connected',
    };
  } catch {
    return {
      name: 'Slack Workspace',
      status: 'fail',
      message: 'Error checking Slack connection',
      fixUrl: '/settings/integrations/slack',
    };
  }
}

async function checkSlackUserMapped(orgId: string, userId: string): Promise<PrerequisiteCheck> {
  try {
    const { data, error } = await supabase
      .from('slack_user_mappings')
      .select('slack_user_id')
      .eq('org_id', orgId)
      .eq('sixty_user_id', userId)
      .maybeSingle();

    if (error || !data || !data.slack_user_id) {
      return {
        name: 'Slack User Mapping',
        status: 'fail',
        message: 'Your Slack account is not mapped. Link your Slack user to receive notifications.',
        fixUrl: '/settings/integrations/slack',
      };
    }

    return {
      name: 'Slack User Mapping',
      status: 'pass',
      message: 'Slack user is mapped',
    };
  } catch {
    return {
      name: 'Slack User Mapping',
      status: 'fail',
      message: 'Error checking Slack user mapping',
      fixUrl: '/settings/integrations/slack',
    };
  }
}

async function checkGoogleCalendar(orgId: string, userId: string): Promise<PrerequisiteCheck> {
  try {
    const { data, error } = await supabase
      .from('google_integrations')
      .select('scopes, is_active')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) {
      return {
        name: 'Google Calendar (Optional)',
        status: 'fail',
        message: 'Google Calendar is not connected (required for pre-meeting briefings)',
        fixUrl: '/settings/integrations/google-workspace',
      };
    }

    // Check if calendar scope is present
    const scopes = data.scopes;
    const scopeArray = typeof scopes === 'string' ? scopes.split(' ') : Array.isArray(scopes) ? scopes : [];
    const hasCalendarScope = scopeArray.some(
      (s: string) => s.includes('calendar') || s.includes('https://www.googleapis.com/auth/calendar')
    );

    if (!hasCalendarScope) {
      return {
        name: 'Google Calendar (Optional)',
        status: 'fail',
        message: 'Google Calendar scope is missing',
        fixUrl: '/settings/integrations/google-workspace',
      };
    }

    return {
      name: 'Google Calendar (Optional)',
      status: 'pass',
      message: 'Google Calendar is connected',
    };
  } catch {
    return {
      name: 'Google Calendar (Optional)',
      status: 'fail',
      message: 'Error checking Google Calendar connection',
      fixUrl: '/settings/integrations/google-workspace',
    };
  }
}
