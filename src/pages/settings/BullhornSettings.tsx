/**
 * BullhornSettings Page
 *
 * Team admin page for configuring Bullhorn ATS integration settings.
 * Allows configuration of candidate sync, contact sync, job order sync,
 * placement sync, task sync, and note writeback.
 */

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
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
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Users,
  Briefcase,
  FileText,
  Brain,
  RefreshCw,
  Settings2,
  Zap,
  ExternalLink,
  AlertTriangle,
  Clock,
  ArrowRightLeft,
  CheckSquare,
  Play,
  Download,
  Calendar,
  ChevronDown,
  ChevronUp,
  Building2,
  Send,
  UserCheck,
} from 'lucide-react';

import { PageContainer } from '@/components/layout/PageContainer';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useIsOrgAdmin } from '@/contexts/UserPermissionsContext';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ProcessMapButton } from '@/components/process-maps';

// =============================================================================
// Types
// =============================================================================

interface BullhornIntegration {
  id: string;
  org_id: string;
  bullhorn_corp_id: string | null;
  bullhorn_username: string | null;
  is_active: boolean;
  connected_at: string | null;
  last_token_refresh: string | null;
  settings: BullhornSettings | null;
  metadata: Record<string, unknown> | null;
}

interface BullhornSyncState {
  sync_status: 'idle' | 'syncing' | 'error';
  last_sync_at: string | null;
  error_message: string | null;
  entities_synced: number;
}

interface FeatureSettings {
  enabled: boolean;
  sync_direction?: string;
  create_missing?: boolean;
  field_mappings?: Record<string, string>;
}

interface BullhornSettings {
  candidate_sync?: FeatureSettings;
  contact_sync?: FeatureSettings;
  job_order_sync?: FeatureSettings;
  placement_sync?: FeatureSettings;
  task_sync?: FeatureSettings;
  sendout_sync?: FeatureSettings;
  note_writeback?: {
    enabled: boolean;
    write_meeting_summaries?: boolean;
    write_action_items?: boolean;
    write_call_notes?: boolean;
    target?: 'notes' | 'comments';
    frequency?: 'realtime' | 'batch';
  };
  conflict_resolution?: {
    strategy: 'last_write_wins' | 'bullhorn_wins' | 'use60_wins' | 'manual';
  };
}

// Sync direction options
const SYNC_DIRECTIONS = [
  { value: 'bullhorn_to_sixty', label: 'Bullhorn → Sixty', description: 'Import from Bullhorn' },
  { value: 'sixty_to_bullhorn', label: 'Sixty → Bullhorn', description: 'Export to Bullhorn' },
  { value: 'bidirectional', label: 'Bidirectional', description: 'Two-way sync' },
];

// Time period options for initial sync
const SYNC_TIME_PERIODS = [
  { value: 'last_7_days', label: 'Last 7 Days', description: 'Quick test sync' },
  { value: 'last_30_days', label: 'Last 30 Days', description: 'Recent records' },
  { value: 'last_90_days', label: 'Last 90 Days', description: 'Quarter of data' },
  { value: 'last_year', label: 'Last Year', description: 'Full year' },
  { value: 'all_time', label: 'All Time', description: 'Complete history' },
];

// Conflict resolution strategies
const CONFLICT_STRATEGIES = [
  { value: 'last_write_wins', label: 'Last Write Wins', description: 'Most recent change wins' },
  { value: 'bullhorn_wins', label: 'Bullhorn Wins', description: 'Bullhorn is source of truth' },
  { value: 'use60_wins', label: 'Sixty Wins', description: 'Sixty is source of truth' },
  { value: 'manual', label: 'Manual Resolution', description: 'Review conflicts manually' },
];

// Candidate field mappings
const CANDIDATE_FIELDS = [
  { sixty: 'first_name', label: 'First Name', bullhorn: 'firstName' },
  { sixty: 'last_name', label: 'Last Name', bullhorn: 'lastName' },
  { sixty: 'email', label: 'Email', bullhorn: 'email' },
  { sixty: 'phone', label: 'Phone', bullhorn: 'phone' },
  { sixty: 'mobile_phone', label: 'Mobile', bullhorn: 'mobile' },
  { sixty: 'status', label: 'Status', bullhorn: 'status' },
];

// Contact field mappings
const CONTACT_FIELDS = [
  { sixty: 'first_name', label: 'First Name', bullhorn: 'firstName' },
  { sixty: 'last_name', label: 'Last Name', bullhorn: 'lastName' },
  { sixty: 'email', label: 'Email', bullhorn: 'email' },
  { sixty: 'phone', label: 'Phone', bullhorn: 'phone' },
  { sixty: 'title', label: 'Job Title', bullhorn: 'title' },
];

// Job Order field mappings
const JOB_ORDER_FIELDS = [
  { sixty: 'name', label: 'Title', bullhorn: 'title' },
  { sixty: 'description', label: 'Description', bullhorn: 'description' },
  { sixty: 'stage', label: 'Status', bullhorn: 'status' },
  { sixty: 'positions_open', label: 'Openings', bullhorn: 'numOpenings' },
];

// =============================================================================
// Hook: useBullhornIntegration
// =============================================================================

function useBullhornIntegration(orgId: string | null) {
  const queryClient = useQueryClient();

  // Fetch integration data
  const { data: integration, isLoading: integrationLoading, refetch: refetchIntegration } = useQuery({
    queryKey: ['bullhorn-integration', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('bullhorn_integrations')
        .select('*')
        .eq('org_id', orgId)
        .maybeSingle();

      if (error) throw error;
      return data as BullhornIntegration | null;
    },
    enabled: !!orgId,
  });

  // Fetch sync state
  const { data: syncState, isLoading: syncStateLoading } = useQuery({
    queryKey: ['bullhorn-sync-state', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('bullhorn_sync_state')
        .select('*')
        .eq('org_id', orgId)
        .order('last_sync_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data as BullhornSyncState | null;
    },
    enabled: !!orgId,
  });

  // Get sync metrics
  const { data: syncMetrics } = useQuery({
    queryKey: ['bullhorn-sync-metrics', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('bullhorn_object_mappings')
        .select('bullhorn_entity_type')
        .eq('org_id', orgId);

      if (error) throw error;

      const counts: Record<string, number> = {};
      for (const mapping of data || []) {
        const type = mapping.bullhorn_entity_type;
        counts[type] = (counts[type] || 0) + 1;
      }

      return {
        candidates: counts['Candidate'] || 0,
        contacts: counts['ClientContact'] || 0,
        companies: counts['ClientCorporation'] || 0,
        jobs: counts['JobOrder'] || 0,
        placements: counts['Placement'] || 0,
        tasks: counts['Task'] || 0,
        sendouts: counts['Sendout'] || 0,
        total: data?.length || 0,
      };
    },
    enabled: !!orgId && !!integration?.is_active,
  });

  // Save settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (settings: BullhornSettings) => {
      if (!integration?.id) throw new Error('No integration found');

      const { error } = await supabase
        .from('bullhorn_integrations')
        .update({ settings })
        .eq('id', integration.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Settings saved');
      queryClient.invalidateQueries({ queryKey: ['bullhorn-integration', orgId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save settings');
    },
  });

  // Trigger sync mutation
  const triggerSyncMutation = useMutation({
    mutationFn: async (params: { sync_type: string; time_period: string }) => {
      const response = await supabase.functions.invoke('bullhorn-sync', {
        body: { action: 'initial_sync', ...params },
      });
      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Sync started');
      queryClient.invalidateQueries({ queryKey: ['bullhorn-sync-state', orgId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start sync');
    },
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!integration?.id) throw new Error('No integration found');

      const { error } = await supabase
        .from('bullhorn_integrations')
        .update({
          is_active: false,
          access_token: null,
          refresh_token: null,
          bh_rest_token: null,
        })
        .eq('id', integration.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Bullhorn disconnected');
      queryClient.invalidateQueries({ queryKey: ['bullhorn-integration', orgId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to disconnect');
    },
  });

  return {
    integration,
    syncState,
    syncMetrics,
    settings: integration?.settings || {},
    isConnected: !!integration?.is_active,
    loading: integrationLoading || syncStateLoading,
    saving: saveSettingsMutation.isPending,
    disconnecting: disconnectMutation.isPending,
    saveSettings: saveSettingsMutation.mutateAsync,
    triggerSync: triggerSyncMutation.mutateAsync,
    disconnect: disconnectMutation.mutateAsync,
    refreshStatus: refetchIntegration,
  };
}

// =============================================================================
// Sub-Components
// =============================================================================

function ConnectionStatusCard({
  integration,
  syncState,
  syncMetrics,
  onDisconnect,
  onRefresh,
  isDisconnecting,
  isRefreshing,
}: {
  integration: BullhornIntegration | null;
  syncState: BullhornSyncState | null;
  syncMetrics: { total: number } | null;
  onDisconnect: () => void;
  onRefresh: () => void;
  isDisconnecting: boolean;
  isRefreshing: boolean;
}) {
  const isConnected = Boolean(integration?.is_active);
  const corpId = integration?.bullhorn_corp_id;
  const username = integration?.bullhorn_username;
  const connectedAt = integration?.connected_at;
  const lastSync = syncState?.last_sync_at;
  const syncStatus = syncState?.sync_status || 'idle';

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isConnected ? 'bg-green-500/10' : 'bg-destructive/10'}`}>
              {isConnected ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
            </div>
            <div>
              <CardTitle className="text-base">
                {isConnected ? 'Bullhorn Connected' : 'Bullhorn Not Connected'}
              </CardTitle>
              <CardDescription>
                {isConnected
                  ? `Corp ID: ${corpId}${username ? ` • ${username}` : ''}`
                  : 'Connect your Bullhorn account to enable sync features'}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConnected && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                >
                  {isRefreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onDisconnect}
                  disabled={isDisconnecting}
                >
                  {isDisconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Disconnect'}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>

      {isConnected && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <Label className="text-muted-foreground text-xs">Status</Label>
              <div className="flex items-center gap-1.5 mt-1">
                <div
                  className={`h-2 w-2 rounded-full ${
                    syncStatus === 'syncing'
                      ? 'bg-amber-500 animate-pulse'
                      : syncStatus === 'error'
                      ? 'bg-destructive'
                      : 'bg-green-500'
                  }`}
                />
                <span className="capitalize">{syncStatus}</span>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Entities Synced</Label>
              <p className="mt-1">{syncMetrics?.total || 0}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Connected</Label>
              <p className="mt-1">
                {connectedAt ? new Date(connectedAt).toLocaleDateString() : 'Unknown'}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Last Sync</Label>
              <p className="mt-1">
                {lastSync ? new Date(lastSync).toLocaleString() : 'Never'}
              </p>
            </div>
          </div>

          {syncState?.error_message && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{syncState.error_message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  enabled,
  onToggle,
  isUpdating,
  children,
}: {
  icon: any;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  isUpdating: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="text-sm">{description}</CardDescription>
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={onToggle} disabled={isUpdating} />
        </div>
      </CardHeader>
      {enabled && children && <CardContent className="space-y-4">{children}</CardContent>}
    </Card>
  );
}

function EntitySyncCard({
  icon,
  title,
  description,
  settings,
  onUpdate,
  isUpdating,
  fieldMappings,
}: {
  icon: any;
  title: string;
  description: string;
  settings: FeatureSettings | undefined;
  onUpdate: (settings: Partial<FeatureSettings>) => void;
  isUpdating: boolean;
  fieldMappings: Array<{ sixty: string; label: string; bullhorn: string }>;
}) {
  const enabled = settings?.enabled ?? false;
  const syncDirection = settings?.sync_direction || 'bidirectional';
  const createMissing = settings?.create_missing ?? true;

  return (
    <FeatureCard
      icon={icon}
      title={title}
      description={description}
      enabled={enabled}
      onToggle={(checked) => onUpdate({ enabled: checked })}
      isUpdating={isUpdating}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Sync Direction</Label>
          <RadioGroup
            value={syncDirection}
            onValueChange={(value) => onUpdate({ sync_direction: value })}
            className="grid grid-cols-3 gap-2"
          >
            {SYNC_DIRECTIONS.map((dir) => (
              <div key={dir.value}>
                <RadioGroupItem value={dir.value} id={`${title}-${dir.value}`} className="peer sr-only" />
                <Label
                  htmlFor={`${title}-${dir.value}`}
                  className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer text-center"
                >
                  <span className="text-xs font-medium">{dir.label}</span>
                  <span className="text-[10px] text-muted-foreground">{dir.description}</span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>Create Missing Records</Label>
            <p className="text-xs text-muted-foreground">
              Automatically create records that don't exist in the target system
            </p>
          </div>
          <Switch
            checked={createMissing}
            onCheckedChange={(checked) => onUpdate({ create_missing: checked })}
            disabled={isUpdating}
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <Label className="text-sm">Field Mappings</Label>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-2 text-left font-medium">Sixty Field</th>
                  <th className="p-2 text-center font-medium">→</th>
                  <th className="p-2 text-left font-medium">Bullhorn Property</th>
                </tr>
              </thead>
              <tbody>
                {fieldMappings.map((field) => (
                  <tr key={field.sixty} className="border-b last:border-0">
                    <td className="p-2">{field.label}</td>
                    <td className="p-2 text-center text-muted-foreground">↔</td>
                    <td className="p-2">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{field.bullhorn}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </FeatureCard>
  );
}

function NoteWritebackCard({
  settings,
  onUpdate,
  isUpdating,
}: {
  settings: BullhornSettings['note_writeback'];
  onUpdate: (settings: Partial<BullhornSettings['note_writeback']>) => void;
  isUpdating: boolean;
}) {
  const enabled = settings?.enabled ?? false;
  const writeMeetingSummaries = settings?.write_meeting_summaries ?? true;
  const writeActionItems = settings?.write_action_items ?? true;
  const writeCallNotes = settings?.write_call_notes ?? false;
  const target = settings?.target || 'notes';
  const frequency = settings?.frequency || 'realtime';

  return (
    <FeatureCard
      icon={Brain}
      title="AI Note Writeback"
      description="Automatically write AI-generated notes to Bullhorn"
      enabled={enabled}
      onToggle={(checked) => onUpdate({ enabled: checked })}
      isUpdating={isUpdating}
    >
      <div className="space-y-4">
        <div className="space-y-3">
          <Label>What to Write</Label>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <span className="text-sm">Meeting Summaries</span>
              </div>
              <Switch
                checked={writeMeetingSummaries}
                onCheckedChange={(checked) => onUpdate({ write_meeting_summaries: checked })}
                disabled={isUpdating}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm">Action Items</span>
              </div>
              <Switch
                checked={writeActionItems}
                onCheckedChange={(checked) => onUpdate({ write_action_items: checked })}
                disabled={isUpdating}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-purple-500" />
                <span className="text-sm">Call Notes</span>
              </div>
              <Switch
                checked={writeCallNotes}
                onCheckedChange={(checked) => onUpdate({ write_call_notes: checked })}
                disabled={isUpdating}
              />
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label>Write Target</Label>
          <RadioGroup
            value={target}
            onValueChange={(value) => onUpdate({ target: value as 'notes' | 'comments' })}
            className="grid grid-cols-2 gap-2"
          >
            <div>
              <RadioGroupItem value="notes" id="target-notes" className="peer sr-only" />
              <Label
                htmlFor="target-notes"
                className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer text-center"
              >
                <FileText className="mb-1 h-4 w-4" />
                <span className="text-xs font-medium">Notes</span>
                <span className="text-[10px] text-muted-foreground">Bullhorn Notes entity</span>
              </Label>
            </div>
            <div>
              <RadioGroupItem value="comments" id="target-comments" className="peer sr-only" />
              <Label
                htmlFor="target-comments"
                className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer text-center"
              >
                <Zap className="mb-1 h-4 w-4" />
                <span className="text-xs font-medium">Comments</span>
                <span className="text-[10px] text-muted-foreground">Entity comments</span>
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label>Frequency</Label>
          <RadioGroup
            value={frequency}
            onValueChange={(value) => onUpdate({ frequency: value as 'realtime' | 'batch' })}
            className="grid grid-cols-2 gap-2"
          >
            <div>
              <RadioGroupItem value="realtime" id="freq-realtime" className="peer sr-only" />
              <Label
                htmlFor="freq-realtime"
                className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer text-center"
              >
                <Zap className="mb-1 h-4 w-4" />
                <span className="text-xs font-medium">Real-time</span>
                <span className="text-[10px] text-muted-foreground">Write immediately</span>
              </Label>
            </div>
            <div>
              <RadioGroupItem value="batch" id="freq-batch" className="peer sr-only" />
              <Label
                htmlFor="freq-batch"
                className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer text-center"
              >
                <Clock className="mb-1 h-4 w-4" />
                <span className="text-xs font-medium">Daily Batch</span>
                <span className="text-[10px] text-muted-foreground">Write once per day</span>
              </Label>
            </div>
          </RadioGroup>
        </div>
      </div>
    </FeatureCard>
  );
}

function ConflictResolutionCard({
  settings,
  onUpdate,
  isUpdating,
}: {
  settings: BullhornSettings['conflict_resolution'];
  onUpdate: (settings: Partial<BullhornSettings['conflict_resolution']>) => void;
  isUpdating: boolean;
}) {
  const strategy = settings?.strategy || 'last_write_wins';

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <ArrowRightLeft className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <CardTitle className="text-base">Conflict Resolution</CardTitle>
            <CardDescription className="text-sm">
              How to handle conflicts when records are modified in both systems
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup
          value={strategy}
          onValueChange={(value) => onUpdate({ strategy: value as any })}
          className="grid grid-cols-2 gap-2"
        >
          {CONFLICT_STRATEGIES.map((strat) => (
            <div key={strat.value}>
              <RadioGroupItem value={strat.value} id={`conflict-${strat.value}`} className="peer sr-only" />
              <Label
                htmlFor={`conflict-${strat.value}`}
                className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer text-center"
              >
                <span className="text-xs font-medium">{strat.label}</span>
                <span className="text-[10px] text-muted-foreground">{strat.description}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Manual resolution will queue conflicts for review. You can review them in the Sync Monitor.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

function InitialSyncCard({
  onTriggerSync,
  isLoading,
}: {
  onTriggerSync: (syncType: string, timePeriod: string) => void;
  isLoading: boolean;
}) {
  const [selectedSyncType, setSelectedSyncType] = useState<string>('candidates');
  const [selectedTimePeriod, setSelectedTimePeriod] = useState('last_30_days');

  const syncTypes = [
    { value: 'candidates', label: 'Candidates', icon: Users },
    { value: 'contacts', label: 'Contacts', icon: UserCheck },
    { value: 'companies', label: 'Companies', icon: Building2 },
    { value: 'jobs', label: 'Job Orders', icon: Briefcase },
    { value: 'placements', label: 'Placements', icon: FileText },
    { value: 'tasks', label: 'Tasks', icon: CheckSquare },
    { value: 'sendouts', label: 'Sendouts', icon: Send },
  ];

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Download className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <CardTitle className="text-base">Initial Sync</CardTitle>
            <CardDescription className="text-sm">
              Import existing records from Bullhorn to Sixty
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>What to Sync</Label>
            <Select value={selectedSyncType} onValueChange={setSelectedSyncType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {syncTypes.map((type) => {
                  const Icon = type.icon;
                  return (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {type.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Time Period</Label>
            <Select value={selectedTimePeriod} onValueChange={setSelectedTimePeriod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SYNC_TIME_PERIODS.map((period) => (
                  <SelectItem key={period.value} value={period.value}>
                    <div className="flex flex-col">
                      <span>{period.label}</span>
                      <span className="text-xs text-muted-foreground">{period.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-sm text-muted-foreground">
            <Calendar className="h-4 w-4 inline mr-1.5" />
            {selectedTimePeriod === 'all_time'
              ? 'Will sync all records from Bullhorn'
              : `Will sync ${selectedSyncType} modified in the ${SYNC_TIME_PERIODS.find((p) => p.value === selectedTimePeriod)?.label.toLowerCase()}`}
          </div>
          <Button
            onClick={() => onTriggerSync(selectedSyncType, selectedTimePeriod)}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Run Sync
          </Button>
        </div>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            For large datasets (All Time), the sync will be processed in batches and may take several minutes.
            You can check progress in the sync status above.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function BullhornSettings() {
  const navigate = useNavigate();
  const { activeOrg } = useOrg();
  const isAdmin = useIsOrgAdmin();
  const orgId = activeOrg?.id || null;

  const {
    integration,
    syncState,
    syncMetrics,
    settings: rawSettings,
    isConnected,
    loading,
    saving,
    disconnecting,
    saveSettings,
    triggerSync,
    disconnect,
    refreshStatus,
  } = useBullhornIntegration(orgId);

  const [localSettings, setLocalSettings] = useState<BullhornSettings>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitializedRef = useRef(false);

  // Initialize local settings from server
  useEffect(() => {
    if (rawSettings && Object.keys(rawSettings).length > 0 && !hasInitializedRef.current) {
      setLocalSettings(rawSettings as BullhornSettings);
      hasInitializedRef.current = true;
    }
  }, [rawSettings]);

  const updateSettings = useCallback(
    (section: keyof BullhornSettings, updates: any) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      setLocalSettings((prev) => {
        const newSettings = {
          ...prev,
          [section]: { ...(prev[section] || {}), ...updates },
        };

        saveTimeoutRef.current = setTimeout(async () => {
          try {
            await saveSettings(newSettings);
          } catch (e: any) {
            toast.error(e.message || 'Failed to save settings');
          }
        }, 1000);

        return newSettings;
      });
    },
    [saveSettings]
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect();
    } catch (e: any) {
      toast.error(e.message || 'Failed to disconnect Bullhorn');
    }
  }, [disconnect]);

  const handleConnect = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast.error('No active session. Please log in again.');
        return;
      }

      const resp = await supabase.functions.invoke('oauth-initiate/bullhorn', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ org_id: orgId, redirect_path: '/settings/integrations/bullhorn' }),
      });

      if (resp.error) {
        throw new Error(resp.error.message || 'Failed to initiate Bullhorn OAuth');
      }
      if (!resp.data?.success) {
        const errorMsg = resp.data?.message || resp.data?.error || 'Failed to initiate Bullhorn OAuth';
        throw new Error(errorMsg);
      }

      const url = resp.data?.authorization_url;
      if (!url) throw new Error('Missing authorization_url from response');
      window.location.href = url;
    } catch (e: any) {
      toast.error(e.message || 'Failed to connect Bullhorn');
    }
  }, [orgId]);

  const handleTriggerSync = useCallback(
    async (syncType: string, timePeriod: string) => {
      setIsSyncing(true);
      try {
        await triggerSync({ sync_type: syncType, time_period: timePeriod });
      } catch (e: any) {
        toast.error(e.message || 'Failed to trigger sync');
      } finally {
        setIsSyncing(false);
      }
    },
    [triggerSync]
  );

  if (!isAdmin) {
    return (
      <PageContainer>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You need to be an organization admin to configure Bullhorn settings.
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Bullhorn Integration</h1>
            <p className="text-muted-foreground">
              Configure sync settings for candidates, contacts, jobs, placements, and tasks
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isConnected && (
              <>
                <ProcessMapButton
                  processType="integration"
                  processName="bullhorn"
                  variant="outline"
                  size="default"
                  label="Process Map"
                />
                <Button variant="outline" asChild>
                  <a
                    href="https://www.bullhornstaffing.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Bullhorn
                  </a>
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Connection Status */}
        <ConnectionStatusCard
          integration={integration}
          syncState={syncState}
          syncMetrics={syncMetrics}
          onDisconnect={handleDisconnect}
          onRefresh={() => refreshStatus()}
          isDisconnecting={disconnecting}
          isRefreshing={loading}
        />

        {!isConnected ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Connect Bullhorn to Get Started</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Connect your Bullhorn ATS account to enable candidate sync, placement sync,
                job order sync, and AI note writeback.
              </p>
              <Button onClick={handleConnect}>
                <Zap className="h-4 w-4 mr-2" />
                Connect Bullhorn
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Sync Metrics Summary */}
            {syncMetrics && syncMetrics.total > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Synced Entities</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
                    <div className="text-center p-2 rounded-lg bg-muted">
                      <p className="text-lg font-semibold">{syncMetrics.candidates}</p>
                      <p className="text-xs text-muted-foreground">Candidates</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted">
                      <p className="text-lg font-semibold">{syncMetrics.contacts}</p>
                      <p className="text-xs text-muted-foreground">Contacts</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted">
                      <p className="text-lg font-semibold">{syncMetrics.companies}</p>
                      <p className="text-xs text-muted-foreground">Companies</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted">
                      <p className="text-lg font-semibold">{syncMetrics.jobs}</p>
                      <p className="text-xs text-muted-foreground">Jobs</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted">
                      <p className="text-lg font-semibold">{syncMetrics.placements}</p>
                      <p className="text-xs text-muted-foreground">Placements</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted">
                      <p className="text-lg font-semibold">{syncMetrics.tasks}</p>
                      <p className="text-xs text-muted-foreground">Tasks</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted">
                      <p className="text-lg font-semibold">{syncMetrics.sendouts}</p>
                      <p className="text-xs text-muted-foreground">Sendouts</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Entity Sync Cards */}
            <EntitySyncCard
              icon={Users}
              title="Candidate Sync"
              description="Synchronize candidates between Sixty and Bullhorn"
              settings={localSettings.candidate_sync}
              onUpdate={(updates) => updateSettings('candidate_sync', updates)}
              isUpdating={saving}
              fieldMappings={CANDIDATE_FIELDS}
            />

            <EntitySyncCard
              icon={UserCheck}
              title="Contact Sync"
              description="Synchronize client contacts between Sixty and Bullhorn"
              settings={localSettings.contact_sync}
              onUpdate={(updates) => updateSettings('contact_sync', updates)}
              isUpdating={saving}
              fieldMappings={CONTACT_FIELDS}
            />

            <EntitySyncCard
              icon={Briefcase}
              title="Job Order Sync"
              description="Synchronize job orders and opportunities"
              settings={localSettings.job_order_sync}
              onUpdate={(updates) => updateSettings('job_order_sync', updates)}
              isUpdating={saving}
              fieldMappings={JOB_ORDER_FIELDS}
            />

            <FeatureCard
              icon={FileText}
              title="Placement Sync"
              description="Synchronize placements and create deals from successful placements"
              enabled={localSettings.placement_sync?.enabled ?? false}
              onToggle={(checked) => updateSettings('placement_sync', { enabled: checked })}
              isUpdating={saving}
            >
              <Alert>
                <FileText className="h-4 w-4" />
                <AlertDescription>
                  Placements will automatically create or update deals in Sixty when synced from Bullhorn.
                </AlertDescription>
              </Alert>
            </FeatureCard>

            <FeatureCard
              icon={CheckSquare}
              title="Task Sync"
              description="Synchronize tasks between Sixty and Bullhorn"
              enabled={localSettings.task_sync?.enabled ?? false}
              onToggle={(checked) => updateSettings('task_sync', { enabled: checked })}
              isUpdating={saving}
            >
              <Alert>
                <CheckSquare className="h-4 w-4" />
                <AlertDescription>
                  Tasks are linked to candidates, contacts, and job orders based on associations.
                </AlertDescription>
              </Alert>
            </FeatureCard>

            <FeatureCard
              icon={Send}
              title="Sendout Sync"
              description="Synchronize sendouts (candidate submissions) from Bullhorn"
              enabled={localSettings.sendout_sync?.enabled ?? false}
              onToggle={(checked) => updateSettings('sendout_sync', { enabled: checked })}
              isUpdating={saving}
            >
              <Alert>
                <Send className="h-4 w-4" />
                <AlertDescription>
                  Sendouts will be logged as activities in Sixty for pipeline tracking.
                </AlertDescription>
              </Alert>
            </FeatureCard>

            <NoteWritebackCard
              settings={localSettings.note_writeback}
              onUpdate={(updates) => updateSettings('note_writeback', updates)}
              isUpdating={saving}
            />

            <ConflictResolutionCard
              settings={localSettings.conflict_resolution}
              onUpdate={(updates) => updateSettings('conflict_resolution', updates)}
              isUpdating={saving}
            />

            {/* Initial Sync */}
            <InitialSyncCard onTriggerSync={handleTriggerSync} isLoading={isSyncing} />
          </div>
        )}
      </div>
    </PageContainer>
  );
}
