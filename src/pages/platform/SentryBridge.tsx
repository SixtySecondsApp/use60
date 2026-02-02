/**
 * Sentry Bridge Admin UI
 *
 * Admin interface for managing the Sentry → AI Dev Hub integration:
 * - Configuration (enable/disable, rate limits, triage mode)
 * - Routing rules management
 * - Triage queue (pending items for manual approval)
 * - Dead letter queue (failed items)
 * - Metrics and monitoring
 */

import { useState, useEffect } from 'react';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase/clientV2';
import {
  Settings,
  GitBranch,
  AlertTriangle,
  Inbox,
  BarChart3,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Play,
  Pause,
  Trash2,
  RotateCcw,
  ExternalLink,
  Plus,
  Edit2,
  Save,
} from 'lucide-react';

interface BridgeConfig {
  id: string;
  org_id: string;
  enabled: boolean;
  sentry_org_slug: string | null;
  sentry_project_slugs: string[] | null;
  triage_mode_enabled: boolean;
  auto_create_devhub_tickets: boolean;
  default_dev_hub_project_id: string | null;
  default_owner_user_id: string | null;
  default_priority: 'low' | 'medium' | 'high' | 'urgent';
  max_tickets_per_hour: number;
  max_tickets_per_day: number;
  cooldown_same_issue_minutes: number;
  spike_threshold_count: number;
  spike_threshold_minutes: number;
  allowlisted_tags: string[];
  circuit_breaker_tripped_at: string | null;
}

interface RoutingRule {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  enabled: boolean;
  test_mode: boolean;
  match_sentry_project: string | null;
  match_error_type: string | null;
  match_error_message: string | null;
  match_environment: string | null;
  target_dev_hub_project_id: string;
  target_owner_user_id: string | null;
  target_priority: string;
}

interface TriageItem {
  id: string;
  sentry_issue_id: string;
  sentry_project_slug: string;
  error_title: string;
  error_type: string | null;
  environment: string | null;
  event_count: number;
  first_seen: string | null;
  status: string;
  suggested_priority: string | null;
  created_at: string;
}

interface DLQItem {
  id: string;
  sentry_issue_id: string;
  event_type: string;
  failure_reason: string;
  attempt_count: number;
  status: string;
  created_at: string;
}

interface BridgeMetrics {
  tickets_created: number;
  tickets_updated: number;
  webhooks_failed: number;
  avg_processing_time_ms: number;
}

export default function SentryBridge() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('config');

  // State
  const [config, setConfig] = useState<BridgeConfig | null>(null);
  const [routingRules, setRoutingRules] = useState<RoutingRule[]>([]);
  const [triageQueue, setTriageQueue] = useState<TriageItem[]>([]);
  const [dlqItems, setDLQItems] = useState<DLQItem[]>([]);
  const [metrics, setMetrics] = useState<BridgeMetrics | null>(null);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        loadConfig(),
        loadRoutingRules(),
        loadTriageQueue(),
        loadDLQ(),
        loadMetrics(),
      ]);
    } catch (error) {
      console.error('Error loading Sentry Bridge data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load Sentry Bridge data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadConfig = async () => {
    const { data, error } = await supabase
      .from('sentry_bridge_config')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    setConfig(data);
  };

  const loadRoutingRules = async () => {
    const { data, error } = await supabase
      .from('sentry_routing_rules')
      .select('*')
      .order('priority', { ascending: true });

    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    setRoutingRules(data || []);
  };

  const loadTriageQueue = async () => {
    const { data, error } = await supabase
      .from('sentry_triage_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    setTriageQueue(data || []);
  };

  const loadDLQ = async () => {
    const { data, error } = await supabase
      .from('sentry_dead_letter_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    setDLQItems(data || []);
  };

  const loadMetrics = async () => {
    const { data, error } = await supabase
      .from('sentry_bridge_metrics')
      .select('*')
      .gte('bucket_start', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('bucket_start', { ascending: false });

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // Aggregate metrics
    if (data && data.length > 0) {
      const aggregated = data.reduce(
        (acc, m) => ({
          tickets_created: acc.tickets_created + (m.tickets_created || 0),
          tickets_updated: acc.tickets_updated + (m.tickets_updated || 0),
          webhooks_failed: acc.webhooks_failed + (m.webhooks_failed || 0),
          avg_processing_time_ms:
            acc.avg_processing_time_ms + (m.avg_processing_time_ms || 0) / data.length,
        }),
        { tickets_created: 0, tickets_updated: 0, webhooks_failed: 0, avg_processing_time_ms: 0 }
      );
      setMetrics(aggregated);
    }
  };

  const toggleBridge = async () => {
    if (!config) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('sentry_bridge_config')
        .update({ enabled: !config.enabled })
        .eq('id', config.id);

      if (error) throw error;

      setConfig({ ...config, enabled: !config.enabled });
      toast({
        title: 'Success',
        description: `Sentry Bridge ${!config.enabled ? 'enabled' : 'disabled'}`,
      });
    } catch (error) {
      console.error('Error toggling bridge:', error);
      toast({
        title: 'Error',
        description: 'Failed to toggle Sentry Bridge',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTriageMode = async () => {
    if (!config) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('sentry_bridge_config')
        .update({ triage_mode_enabled: !config.triage_mode_enabled })
        .eq('id', config.id);

      if (error) throw error;

      setConfig({ ...config, triage_mode_enabled: !config.triage_mode_enabled });
      toast({
        title: 'Success',
        description: `Triage mode ${!config.triage_mode_enabled ? 'enabled' : 'disabled'}`,
      });
    } catch (error) {
      console.error('Error toggling triage mode:', error);
      toast({
        title: 'Error',
        description: 'Failed to toggle triage mode',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleAutoCreateDevHubTickets = async () => {
    if (!config) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('sentry_bridge_config')
        .update({ auto_create_devhub_tickets: !config.auto_create_devhub_tickets })
        .eq('id', config.id);

      if (error) throw error;

      setConfig({ ...config, auto_create_devhub_tickets: !config.auto_create_devhub_tickets });
      toast({
        title: 'Success',
        description: `Auto-create Dev Hub tickets ${!config.auto_create_devhub_tickets ? 'enabled' : 'disabled'}`,
      });
    } catch (error) {
      console.error('Error toggling auto-create Dev Hub tickets:', error);
      toast({
        title: 'Error',
        description: 'Failed to toggle auto-create Dev Hub tickets',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const approveTriageItem = async (item: TriageItem) => {
    try {
      // Move to bridge queue for processing
      const { error } = await supabase
        .from('sentry_triage_queue')
        .update({ status: 'approved' })
        .eq('id', item.id);

      if (error) throw error;

      setTriageQueue(triageQueue.filter((t) => t.id !== item.id));
      toast({
        title: 'Success',
        description: 'Issue approved for ticket creation',
      });
    } catch (error) {
      console.error('Error approving triage item:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve item',
        variant: 'destructive',
      });
    }
  };

  const rejectTriageItem = async (item: TriageItem) => {
    try {
      const { error } = await supabase
        .from('sentry_triage_queue')
        .update({ status: 'rejected' })
        .eq('id', item.id);

      if (error) throw error;

      setTriageQueue(triageQueue.filter((t) => t.id !== item.id));
      toast({
        title: 'Success',
        description: 'Issue rejected',
      });
    } catch (error) {
      console.error('Error rejecting triage item:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject item',
        variant: 'destructive',
      });
    }
  };

  const replayDLQItem = async (item: DLQItem) => {
    try {
      const { error } = await supabase
        .from('sentry_dead_letter_queue')
        .update({ status: 'replayed' })
        .eq('id', item.id);

      if (error) throw error;

      setDLQItems(dlqItems.filter((d) => d.id !== item.id));
      toast({
        title: 'Success',
        description: 'Item queued for replay',
      });
    } catch (error) {
      console.error('Error replaying DLQ item:', error);
      toast({
        title: 'Error',
        description: 'Failed to replay item',
        variant: 'destructive',
      });
    }
  };

  const discardDLQItem = async (item: DLQItem) => {
    try {
      const { error } = await supabase
        .from('sentry_dead_letter_queue')
        .update({ status: 'discarded' })
        .eq('id', item.id);

      if (error) throw error;

      setDLQItems(dlqItems.filter((d) => d.id !== item.id));
      toast({
        title: 'Success',
        description: 'Item discarded',
      });
    } catch (error) {
      console.error('Error discarding DLQ item:', error);
      toast({
        title: 'Error',
        description: 'Failed to discard item',
        variant: 'destructive',
      });
    }
  };

  const resetCircuitBreaker = async () => {
    if (!config) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('sentry_bridge_config')
        .update({ circuit_breaker_tripped_at: null })
        .eq('id', config.id);

      if (error) throw error;

      setConfig({ ...config, circuit_breaker_tripped_at: null });
      toast({
        title: 'Success',
        description: 'Circuit breaker reset',
      });
    } catch (error) {
      console.error('Error resetting circuit breaker:', error);
      toast({
        title: 'Error',
        description: 'Failed to reset circuit breaker',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      low: 'outline',
      medium: 'secondary',
      high: 'default',
      urgent: 'destructive',
    };
    return <Badge variant={variants[priority] || 'outline'}>{priority}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <BackToPlatform />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sentry Bridge</h1>
          <p className="text-gray-400">Sentry → AI Dev Hub auto-ticketing integration</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Bridge Status</p>
                <p className="text-2xl font-bold text-white">
                  {config?.enabled ? 'Active' : 'Inactive'}
                </p>
              </div>
              {config?.enabled ? (
                <CheckCircle className="h-8 w-8 text-green-500" />
              ) : (
                <Pause className="h-8 w-8 text-gray-500" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Tickets Created (24h)</p>
                <p className="text-2xl font-bold text-white">{metrics?.tickets_created || 0}</p>
              </div>
              <GitBranch className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Triage Queue</p>
                <p className="text-2xl font-bold text-white">{triageQueue.length}</p>
              </div>
              <Inbox className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Failed (DLQ)</p>
                <p className="text-2xl font-bold text-white">{dlqItems.length}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Circuit Breaker Warning */}
      {config?.circuit_breaker_tripped_at && (
        <Card className="bg-red-900/20 border-red-800">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-red-500" />
                <div>
                  <p className="text-white font-medium">Circuit Breaker Tripped</p>
                  <p className="text-sm text-gray-400">
                    Processing paused due to repeated failures at{' '}
                    {new Date(config.circuit_breaker_tripped_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <Button variant="destructive" size="sm" onClick={resetCircuitBreaker}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-gray-800">
          <TabsTrigger value="config" className="data-[state=active]:bg-gray-700">
            <Settings className="h-4 w-4 mr-2" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="rules" className="data-[state=active]:bg-gray-700">
            <GitBranch className="h-4 w-4 mr-2" />
            Routing Rules
          </TabsTrigger>
          <TabsTrigger value="triage" className="data-[state=active]:bg-gray-700">
            <Inbox className="h-4 w-4 mr-2" />
            Triage Queue
            {triageQueue.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {triageQueue.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="dlq" className="data-[state=active]:bg-gray-700">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Dead Letter Queue
            {dlqItems.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {dlqItems.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="metrics" className="data-[state=active]:bg-gray-700">
            <BarChart3 className="h-4 w-4 mr-2" />
            Metrics
          </TabsTrigger>
        </TabsList>

        {/* Configuration Tab */}
        <TabsContent value="config" className="space-y-6">
          {config ? (
            <>
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white">Bridge Settings</CardTitle>
                  <CardDescription>Core configuration for the Sentry Bridge</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable Bridge</Label>
                      <p className="text-sm text-gray-400">
                        Process Sentry webhooks and create Dev Hub tickets
                      </p>
                    </div>
                    <Switch
                      checked={config.enabled}
                      onCheckedChange={toggleBridge}
                      disabled={isSaving}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Triage Mode</Label>
                      <p className="text-sm text-gray-400">
                        Require manual approval before creating tickets
                      </p>
                    </div>
                    <Switch
                      checked={config.triage_mode_enabled}
                      onCheckedChange={toggleTriageMode}
                      disabled={isSaving}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Auto-Create Dev Hub Tickets</Label>
                      <p className="text-sm text-gray-400">
                        Automatically post tickets to AI Dev Hub via MCP
                      </p>
                    </div>
                    <Switch
                      checked={config.auto_create_devhub_tickets}
                      onCheckedChange={toggleAutoCreateDevHubTickets}
                      disabled={isSaving}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Max Tickets/Hour</Label>
                      <Input
                        type="number"
                        value={config.max_tickets_per_hour}
                        className="bg-gray-800 border-gray-700"
                        disabled
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Tickets/Day</Label>
                      <Input
                        type="number"
                        value={config.max_tickets_per_day}
                        className="bg-gray-800 border-gray-700"
                        disabled
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Default Priority</Label>
                    <Select value={config.default_priority} disabled>
                      <SelectTrigger className="bg-gray-800 border-gray-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Allowlisted Tags</Label>
                    <div className="flex flex-wrap gap-2">
                      {config.allowlisted_tags?.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="py-8 text-center">
                <p className="text-gray-400">No configuration found. Create one to get started.</p>
                <Button className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Configuration
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Routing Rules Tab */}
        <TabsContent value="rules" className="space-y-6">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white">Routing Rules</CardTitle>
                  <CardDescription>
                    Define how Sentry issues are routed to Dev Hub projects
                  </CardDescription>
                </div>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Rule
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {routingRules.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800">
                      <TableHead className="text-gray-400">Priority</TableHead>
                      <TableHead className="text-gray-400">Name</TableHead>
                      <TableHead className="text-gray-400">Match</TableHead>
                      <TableHead className="text-gray-400">Target</TableHead>
                      <TableHead className="text-gray-400">Status</TableHead>
                      <TableHead className="text-gray-400">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {routingRules.map((rule) => (
                      <TableRow key={rule.id} className="border-gray-800">
                        <TableCell className="text-white">{rule.priority}</TableCell>
                        <TableCell className="text-white">{rule.name}</TableCell>
                        <TableCell className="text-gray-400">
                          {rule.match_sentry_project && (
                            <Badge variant="outline" className="mr-1">
                              {rule.match_sentry_project}
                            </Badge>
                          )}
                          {rule.match_environment && (
                            <Badge variant="outline">{rule.match_environment}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-white text-sm">
                              {rule.target_dev_hub_project_id}
                            </span>
                            {getPriorityBadge(rule.target_priority)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={rule.enabled ? 'default' : 'secondary'}>
                            {rule.enabled ? 'Active' : 'Disabled'}
                          </Badge>
                          {rule.test_mode && (
                            <Badge variant="outline" className="ml-1">
                              Test
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  No routing rules configured. Issues will use default routing.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Triage Queue Tab */}
        <TabsContent value="triage" className="space-y-6">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Triage Queue</CardTitle>
              <CardDescription>Issues awaiting manual approval before ticket creation</CardDescription>
            </CardHeader>
            <CardContent>
              {triageQueue.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800">
                      <TableHead className="text-gray-400">Issue</TableHead>
                      <TableHead className="text-gray-400">Project</TableHead>
                      <TableHead className="text-gray-400">Environment</TableHead>
                      <TableHead className="text-gray-400">Events</TableHead>
                      <TableHead className="text-gray-400">Priority</TableHead>
                      <TableHead className="text-gray-400">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {triageQueue.map((item) => (
                      <TableRow key={item.id} className="border-gray-800">
                        <TableCell>
                          <div className="max-w-xs">
                            <p className="text-white font-medium truncate">{item.error_title}</p>
                            <p className="text-sm text-gray-400 truncate">{item.error_type}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-white">{item.sentry_project_slug}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.environment || 'unknown'}</Badge>
                        </TableCell>
                        <TableCell className="text-white">{item.event_count}</TableCell>
                        <TableCell>
                          {item.suggested_priority
                            ? getPriorityBadge(item.suggested_priority)
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-500"
                              onClick={() => approveTriageItem(item)}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500"
                              onClick={() => rejectTriageItem(item)}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                window.open(
                                  `https://sentry.io/issues/${item.sentry_issue_id}/`,
                                  '_blank'
                                )
                              }
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <Inbox className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                  <p>No items in triage queue</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Dead Letter Queue Tab */}
        <TabsContent value="dlq" className="space-y-6">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Dead Letter Queue</CardTitle>
              <CardDescription>Failed items that exceeded max retry attempts</CardDescription>
            </CardHeader>
            <CardContent>
              {dlqItems.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800">
                      <TableHead className="text-gray-400">Issue ID</TableHead>
                      <TableHead className="text-gray-400">Event Type</TableHead>
                      <TableHead className="text-gray-400">Failure Reason</TableHead>
                      <TableHead className="text-gray-400">Attempts</TableHead>
                      <TableHead className="text-gray-400">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dlqItems.map((item) => (
                      <TableRow key={item.id} className="border-gray-800">
                        <TableCell className="text-white font-mono text-sm">
                          {item.sentry_issue_id}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.event_type}</Badge>
                        </TableCell>
                        <TableCell className="text-red-400 max-w-xs truncate">
                          {item.failure_reason}
                        </TableCell>
                        <TableCell className="text-white">{item.attempt_count}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-blue-500"
                              onClick={() => replayDLQItem(item)}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500"
                              onClick={() => discardDLQItem(item)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-600" />
                  <p>No failed items - all processing successful!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Metrics Tab */}
        <TabsContent value="metrics" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-gray-400">Tickets Created (24h)</p>
                  <p className="text-3xl font-bold text-white">{metrics?.tickets_created || 0}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-gray-400">Tickets Updated (24h)</p>
                  <p className="text-3xl font-bold text-white">{metrics?.tickets_updated || 0}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-gray-400">Failed (24h)</p>
                  <p className="text-3xl font-bold text-red-400">{metrics?.webhooks_failed || 0}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-gray-400">Avg Processing Time</p>
                  <p className="text-3xl font-bold text-white">
                    {Math.round(metrics?.avg_processing_time_ms || 0)}ms
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Processing Health</CardTitle>
              <CardDescription>Last 24 hours of Sentry Bridge activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-400">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                <p>Detailed metrics visualization coming soon</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
