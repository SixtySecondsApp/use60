/**
 * Agent Team Settings
 *
 * Platform admin page for managing multi-agent sales team configuration,
 * schedules, and triggers. Wired to live agent-scheduler and agent-trigger
 * edge functions for "Run Now" and "Test" actions.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  BarChart3,
  Mail,
  Search,
  Clock,
  Zap,
  Settings,
  Plus,
  Trash2,
  Play,
  Database,
  Calendar,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';
import {
  getAgentTeamConfig,
  updateAgentTeamConfig,
  getSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  runScheduleNow,
  getTriggers,
  createTrigger,
  updateTrigger,
  deleteTrigger,
  testTrigger,
  type AgentTeamConfig,
  type AgentSchedule,
  type AgentTrigger,
} from '@/lib/services/agentTeamService';

// =============================================================================
// Constants — agent names match backend agentDefinitions registry
// =============================================================================

const AGENTS = [
  { name: 'pipeline', displayName: 'Pipeline Manager', icon: BarChart3, color: 'text-blue-500' },
  { name: 'outreach', displayName: 'Outreach & Follow-up', icon: Mail, color: 'text-purple-500' },
  { name: 'research', displayName: 'Research & Enrichment', icon: Search, color: 'text-emerald-500' },
  { name: 'crm_ops', displayName: 'CRM Operations', icon: Database, color: 'text-orange-500' },
  { name: 'meetings', displayName: 'Meeting Intelligence', icon: Calendar, color: 'text-amber-500' },
  { name: 'prospecting', displayName: 'Prospecting', icon: Target, color: 'text-rose-500' },
];

const MODEL_TIERS = [
  {
    value: 'economy' as const,
    label: 'Economy',
    description: 'Haiku 4.5 -- fastest, lowest cost (~$0.001/request)',
  },
  {
    value: 'balanced' as const,
    label: 'Balanced',
    description: 'Sonnet 4.5 -- good balance of speed and quality (~$0.01/request)',
  },
  {
    value: 'premium' as const,
    label: 'Premium',
    description: 'Opus 4.6 -- highest quality, most capable (~$0.05/request)',
  },
];

const EVENT_TYPES = [
  'deal_created',
  'deal_stage_changed',
  'deal_stalled',
  'meeting_completed',
  'contact_created',
  'task_overdue',
  'email_received',
];

const DELIVERY_CHANNELS = [
  { value: 'in_app', label: 'In-App Notification' },
  { value: 'slack', label: 'Slack' },
];

/** Pre-built schedule templates matching SCHEDULE_TEMPLATES in agent-scheduler edge function */
const SCHEDULE_TEMPLATES = [
  {
    key: 'morning_pipeline_brief',
    label: 'Morning Pipeline Brief',
    description: 'Pipeline agent at 9am EST weekdays',
    agent_name: 'pipeline',
    cron_expression: '0 14 * * 1-5',
    prompt_template:
      'Give me a concise morning pipeline brief: top deals closing this week, any at-risk deals needing attention, and key follow-ups due today. Format as a quick-scan summary I can read in 2 minutes.',
    delivery_channel: 'in_app',
  },
  {
    key: 'afternoon_followup_check',
    label: 'Afternoon Follow-up Check',
    description: 'Outreach agent at 2pm EST weekdays',
    agent_name: 'outreach',
    cron_expression: '0 19 * * 1-5',
    prompt_template:
      'Check for contacts needing follow-up (no contact in 7+ days with active deals). Draft brief follow-up suggestions for the top 3 most urgent.',
    delivery_channel: 'in_app',
  },
  {
    key: 'weekly_pipeline_review',
    label: 'Weekly Pipeline Review',
    description: 'Pipeline agent on Monday 9am EST',
    agent_name: 'pipeline',
    cron_expression: '0 14 * * 1',
    prompt_template:
      'Prepare a weekly pipeline review: pipeline summary with week-over-week changes, forecast update, deals that moved stages, stale deals (14+ days no activity), and recommended actions for the week ahead.',
    delivery_channel: 'in_app',
  },
];

// =============================================================================
// Main Component
// =============================================================================

export default function AgentTeamSettings() {
  const navigate = useNavigate();
  const { isPlatformAdmin } = useUserPermissions();
  const { activeOrgId } = useOrg();
  const { userId } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState<AgentTeamConfig | null>(null);
  const [schedules, setSchedules] = useState<AgentSchedule[]>([]);
  const [triggers, setTriggers] = useState<AgentTrigger[]>([]);

  // Form state for new schedule
  const [newScheduleAgent, setNewScheduleAgent] = useState('');
  const [newScheduleCron, setNewScheduleCron] = useState('');
  const [newSchedulePrompt, setNewSchedulePrompt] = useState('');
  const [newScheduleChannel, setNewScheduleChannel] = useState('in_app');

  // Form state for new trigger
  const [newTriggerAgent, setNewTriggerAgent] = useState('');
  const [newTriggerEvent, setNewTriggerEvent] = useState('');
  const [newTriggerPrompt, setNewTriggerPrompt] = useState('');

  // Running/testing state
  const [runningScheduleId, setRunningScheduleId] = useState<string | null>(null);
  const [testingTriggerId, setTestingTriggerId] = useState<string | null>(null);

  useEffect(() => {
    if (isPlatformAdmin && activeOrgId) {
      loadData();
    }
  }, [isPlatformAdmin, activeOrgId]);

  const loadData = async () => {
    if (!activeOrgId) return;
    try {
      setIsLoading(true);
      const [configData, schedulesData, triggersData] = await Promise.all([
        getAgentTeamConfig(activeOrgId),
        getSchedules(activeOrgId),
        getTriggers(activeOrgId),
      ]);
      setConfig(configData);
      setSchedules(schedulesData);
      setTriggers(triggersData);
    } catch (error) {
      console.error('Error loading agent team data:', error);
      toast.error('Failed to load agent team configuration');
    } finally {
      setIsLoading(false);
    }
  };

  // =============================================================================
  // Configuration handlers
  // =============================================================================

  const handleModelTierChange = async (tier: 'economy' | 'balanced' | 'premium') => {
    if (!activeOrgId) return;
    try {
      const updated = await updateAgentTeamConfig(activeOrgId, { model_tier: tier });
      setConfig(updated);
      toast.success(`Model tier updated to ${tier}`);
    } catch (error) {
      console.error('Error updating model tier:', error);
      toast.error('Failed to update model tier');
    }
  };

  const handleToggleAgent = async (agentName: string, enabled: boolean) => {
    if (!activeOrgId) return;
    try {
      const currentAgents = config?.enabled_agents || [];
      const updatedAgents = enabled
        ? [...currentAgents, agentName]
        : currentAgents.filter((a) => a !== agentName);
      const updated = await updateAgentTeamConfig(activeOrgId, { enabled_agents: updatedAgents });
      setConfig(updated);
      toast.success(`Agent ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Error toggling agent:', error);
      toast.error('Failed to update agent');
    }
  };

  // =============================================================================
  // Schedule handlers
  // =============================================================================

  const handleAddTemplate = async (templateKey: string) => {
    if (!activeOrgId) return;
    const template = SCHEDULE_TEMPLATES.find((t) => t.key === templateKey);
    if (!template) return;

    // Check if template already exists
    const alreadyExists = schedules.some(
      (s) => s.agent_name === template.agent_name && s.cron_expression === template.cron_expression
    );
    if (alreadyExists) {
      toast.error('This schedule template is already added');
      return;
    }

    try {
      const created = await createSchedule({
        organization_id: activeOrgId,
        agent_name: template.agent_name,
        cron_expression: template.cron_expression,
        prompt_template: template.prompt_template,
        delivery_channel: template.delivery_channel,
      });
      setSchedules((prev) => [created, ...prev]);
      toast.success(`Added "${template.label}" schedule`);
    } catch (error) {
      console.error('Error creating schedule from template:', error);
      toast.error('Failed to add schedule template');
    }
  };

  const handleCreateSchedule = async () => {
    if (!activeOrgId || !newScheduleAgent || !newScheduleCron || !newSchedulePrompt) {
      toast.error('Please fill in all schedule fields');
      return;
    }
    try {
      const created = await createSchedule({
        organization_id: activeOrgId,
        agent_name: newScheduleAgent,
        cron_expression: newScheduleCron,
        prompt_template: newSchedulePrompt,
        delivery_channel: newScheduleChannel,
      });
      setSchedules((prev) => [created, ...prev]);
      setNewScheduleAgent('');
      setNewScheduleCron('');
      setNewSchedulePrompt('');
      setNewScheduleChannel('in_app');
      toast.success('Schedule created');
    } catch (error) {
      console.error('Error creating schedule:', error);
      toast.error('Failed to create schedule');
    }
  };

  const handleToggleSchedule = async (id: string, isActive: boolean) => {
    try {
      const updated = await updateSchedule(id, { is_active: isActive });
      setSchedules((prev) => prev.map((s) => (s.id === id ? updated : s)));
      toast.success(`Schedule ${isActive ? 'activated' : 'paused'}`);
    } catch (error) {
      console.error('Error toggling schedule:', error);
      toast.error('Failed to update schedule');
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    try {
      await deleteSchedule(id);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      toast.success('Schedule deleted');
    } catch (error) {
      console.error('Error deleting schedule:', error);
      toast.error('Failed to delete schedule');
    }
  };

  const handleRunScheduleNow = async (id: string) => {
    try {
      setRunningScheduleId(id);
      const result = await runScheduleNow(id);

      if (result.success && result.results?.length > 0) {
        const firstResult = result.results[0];
        if (firstResult.success) {
          toast.success(`Schedule executed successfully (${firstResult.durationMs}ms)`);
          // Refresh to update last_run_at
          if (activeOrgId) {
            const updated = await getSchedules(activeOrgId);
            setSchedules(updated);
          }
        } else {
          toast.error(`Schedule failed: ${firstResult.error}`);
        }
      } else {
        toast.error(result.error || 'Schedule execution failed');
      }
    } catch (error: any) {
      console.error('Error running schedule:', error);
      toast.error(error.message || 'Failed to run schedule');
    } finally {
      setRunningScheduleId(null);
    }
  };

  // =============================================================================
  // Trigger handlers
  // =============================================================================

  const handleCreateTrigger = async () => {
    if (!activeOrgId || !newTriggerAgent || !newTriggerEvent || !newTriggerPrompt) {
      toast.error('Please fill in all trigger fields');
      return;
    }
    try {
      const created = await createTrigger({
        organization_id: activeOrgId,
        agent_name: newTriggerAgent,
        trigger_event: newTriggerEvent,
        prompt_template: newTriggerPrompt,
      });
      setTriggers((prev) => [created, ...prev]);
      setNewTriggerAgent('');
      setNewTriggerEvent('');
      setNewTriggerPrompt('');
      toast.success('Trigger created');
    } catch (error) {
      console.error('Error creating trigger:', error);
      toast.error('Failed to create trigger');
    }
  };

  const handleToggleTrigger = async (id: string, isActive: boolean) => {
    try {
      const updated = await updateTrigger(id, { is_active: isActive });
      setTriggers((prev) => prev.map((t) => (t.id === id ? updated : t)));
      toast.success(`Trigger ${isActive ? 'activated' : 'paused'}`);
    } catch (error) {
      console.error('Error toggling trigger:', error);
      toast.error('Failed to update trigger');
    }
  };

  const handleDeleteTrigger = async (id: string) => {
    try {
      await deleteTrigger(id);
      setTriggers((prev) => prev.filter((t) => t.id !== id));
      toast.success('Trigger deleted');
    } catch (error) {
      console.error('Error deleting trigger:', error);
      toast.error('Failed to delete trigger');
    }
  };

  const handleTestTrigger = async (id: string) => {
    if (!activeOrgId || !userId) return;
    try {
      setTestingTriggerId(id);
      const result = await testTrigger(id, activeOrgId, userId);

      if (result.success && result.results?.length > 0) {
        const firstResult = result.results[0];
        if (firstResult.success) {
          toast.success(`Trigger test passed (${firstResult.durationMs}ms)`);
        } else {
          toast.error(`Trigger test failed: ${firstResult.error}`);
        }
      } else {
        toast.error(result.error || 'Trigger test failed');
      }
    } catch (error: any) {
      console.error('Error testing trigger:', error);
      toast.error(error.message || 'Failed to test trigger');
    } finally {
      setTestingTriggerId(null);
    }
  };

  // =============================================================================
  // Access control
  // =============================================================================

  if (!isPlatformAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">You don&apos;t have permission to access this page.</p>
        <Button variant="outline" onClick={() => navigate('/platform')}>
          Go Back
        </Button>
      </div>
    );
  }

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <div className="container mx-auto px-6 py-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/platform')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Agent Team Settings</h1>
          <p className="text-muted-foreground">
            Configure multi-agent sales team, schedules, and automation triggers
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="configuration" className="space-y-6">
          <TabsList>
            <TabsTrigger value="configuration">
              <Settings className="h-4 w-4 mr-2" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="schedules">
              <Clock className="h-4 w-4 mr-2" />
              Schedules
            </TabsTrigger>
            <TabsTrigger value="triggers">
              <Zap className="h-4 w-4 mr-2" />
              Triggers
            </TabsTrigger>
          </TabsList>

          {/* Configuration Tab */}
          <TabsContent value="configuration" className="space-y-6">
            {/* Model Tier */}
            <Card>
              <CardHeader>
                <CardTitle>Model Tier</CardTitle>
                <CardDescription>
                  Select the AI model tier for agent execution. Higher tiers produce better results but cost more.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {MODEL_TIERS.map((tier) => {
                    const isSelected = (config?.model_tier || 'balanced') === tier.value;
                    return (
                      <button
                        key={tier.value}
                        onClick={() => handleModelTierChange(tier.value)}
                        className={cn(
                          'border rounded-lg p-4 text-left transition-colors',
                          isSelected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-border hover:border-muted-foreground/50'
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold">{tier.label}</span>
                          {isSelected && (
                            <Badge variant="default" className="text-xs">Active</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{tier.description}</p>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Agent Toggle */}
            <Card>
              <CardHeader>
                <CardTitle>Specialist Agents</CardTitle>
                <CardDescription>
                  Enable or disable individual specialist agents for your organization.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {AGENTS.map((agent) => {
                    const Icon = agent.icon;
                    const isEnabled = config?.enabled_agents?.includes(agent.name) ?? true;
                    return (
                      <div key={agent.name} className="flex items-center justify-between py-3 border-b last:border-b-0">
                        <div className="flex items-center gap-3">
                          <Icon className={cn('h-5 w-5', agent.color)} />
                          <div>
                            <p className="font-medium">{agent.displayName}</p>
                            <p className="text-sm text-muted-foreground">{agent.name}</p>
                          </div>
                        </div>
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(checked) => handleToggleAgent(agent.name, checked)}
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Schedules Tab */}
          <TabsContent value="schedules" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Agent Schedules</CardTitle>
                <CardDescription>
                  Configure recurring agent jobs using cron expressions. Use "Run Now" to execute a schedule immediately.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Quick Add Templates */}
                <div>
                  <p className="text-sm font-medium mb-2">Quick Add</p>
                  <div className="flex flex-wrap gap-2">
                    {SCHEDULE_TEMPLATES.map((template) => {
                      const agentInfo = AGENTS.find((a) => a.name === template.agent_name);
                      const Icon = agentInfo?.icon || Clock;
                      const alreadyAdded = schedules.some(
                        (s) => s.agent_name === template.agent_name && s.cron_expression === template.cron_expression
                      );
                      return (
                        <Button
                          key={template.key}
                          variant="outline"
                          size="sm"
                          disabled={alreadyAdded}
                          onClick={() => handleAddTemplate(template.key)}
                          className="gap-2"
                        >
                          <Icon className={cn('h-3.5 w-3.5', agentInfo?.color)} />
                          <span>{template.label}</span>
                          {alreadyAdded && (
                            <Badge variant="secondary" className="text-[10px] ml-1">Added</Badge>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {/* Add Schedule Form */}
                <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                  <div className="flex items-end gap-3">
                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Agent</label>
                      <Select value={newScheduleAgent} onValueChange={setNewScheduleAgent}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select agent" />
                        </SelectTrigger>
                        <SelectContent>
                          {AGENTS.map((a) => (
                            <SelectItem key={a.name} value={a.name}>{a.displayName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Cron Expression</label>
                      <Input
                        placeholder="0 9 * * 1-5"
                        value={newScheduleCron}
                        onChange={(e) => setNewScheduleCron(e.target.value)}
                      />
                    </div>
                    <div className="w-48 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Delivery</label>
                      <Select value={newScheduleChannel} onValueChange={setNewScheduleChannel}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DELIVERY_CHANNELS.map((ch) => (
                            <SelectItem key={ch.value} value={ch.value}>{ch.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Prompt Template</label>
                    <Textarea
                      placeholder="Give me a morning pipeline brief with top deals closing this week..."
                      value={newSchedulePrompt}
                      onChange={(e) => setNewSchedulePrompt(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleCreateSchedule}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Schedule
                    </Button>
                  </div>
                </div>

                {/* Schedules Table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead>Cron</TableHead>
                      <TableHead className="max-w-[200px]">Prompt</TableHead>
                      <TableHead>Delivery</TableHead>
                      <TableHead>Last Run</TableHead>
                      <TableHead className="text-center">Active</TableHead>
                      <TableHead className="w-[120px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedules.length > 0 ? (
                      schedules.map((schedule) => {
                        const agentInfo = AGENTS.find((a) => a.name === schedule.agent_name);
                        const isRunning = runningScheduleId === schedule.id;
                        return (
                          <TableRow key={schedule.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {agentInfo && <agentInfo.icon className={cn('h-4 w-4', agentInfo.color)} />}
                                <span className="font-medium">{agentInfo?.displayName || schedule.agent_name}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <code className="text-xs bg-muted px-2 py-1 rounded">{schedule.cron_expression}</code>
                            </TableCell>
                            <TableCell className="max-w-[200px]">
                              <p className="text-sm text-muted-foreground truncate" title={schedule.prompt_template}>
                                {schedule.prompt_template}
                              </p>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {schedule.delivery_channel || 'in_app'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {schedule.last_run_at
                                ? new Date(schedule.last_run_at).toLocaleString()
                                : 'Never'}
                            </TableCell>
                            <TableCell className="text-center">
                              <Switch
                                checked={schedule.is_active}
                                onCheckedChange={(checked) => handleToggleSchedule(schedule.id, checked)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRunScheduleNow(schedule.id)}
                                  disabled={isRunning}
                                  title="Run now"
                                >
                                  {isRunning ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Play className="h-4 w-4 text-emerald-500" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteSchedule(schedule.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No schedules configured. Add one above.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Triggers Tab */}
          <TabsContent value="triggers" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Agent Triggers</CardTitle>
                <CardDescription>
                  Configure event-driven agent actions that fire when specific CRM events occur. Use "Test" to run a trigger with sample data.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Add Trigger Form */}
                <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                  <div className="flex items-end gap-3">
                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Agent</label>
                      <Select value={newTriggerAgent} onValueChange={setNewTriggerAgent}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select agent" />
                        </SelectTrigger>
                        <SelectContent>
                          {AGENTS.map((a) => (
                            <SelectItem key={a.name} value={a.name}>{a.displayName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Event Type</label>
                      <Select value={newTriggerEvent} onValueChange={setNewTriggerEvent}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select event" />
                        </SelectTrigger>
                        <SelectContent>
                          {EVENT_TYPES.map((et) => (
                            <SelectItem key={et} value={et}>
                              {et.replace(/_/g, ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Prompt Template</label>
                    <Textarea
                      placeholder="A new deal was just created. Research the associated company and primary contact..."
                      value={newTriggerPrompt}
                      onChange={(e) => setNewTriggerPrompt(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleCreateTrigger}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Trigger
                    </Button>
                  </div>
                </div>

                {/* Triggers Table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead>Event Type</TableHead>
                      <TableHead className="max-w-[250px]">Prompt</TableHead>
                      <TableHead className="text-center">Active</TableHead>
                      <TableHead className="w-[120px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {triggers.length > 0 ? (
                      triggers.map((trigger) => {
                        const agentInfo = AGENTS.find((a) => a.name === trigger.agent_name);
                        const isTesting = testingTriggerId === trigger.id;
                        return (
                          <TableRow key={trigger.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {agentInfo && <agentInfo.icon className={cn('h-4 w-4', agentInfo.color)} />}
                                <span className="font-medium">{agentInfo?.displayName || trigger.agent_name}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{trigger.trigger_event.replace(/_/g, ' ')}</Badge>
                            </TableCell>
                            <TableCell className="max-w-[250px]">
                              <p className="text-sm text-muted-foreground truncate" title={trigger.prompt_template}>
                                {trigger.prompt_template}
                              </p>
                            </TableCell>
                            <TableCell className="text-center">
                              <Switch
                                checked={trigger.is_active}
                                onCheckedChange={(checked) => handleToggleTrigger(trigger.id, checked)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleTestTrigger(trigger.id)}
                                  disabled={isTesting}
                                  title="Test trigger"
                                >
                                  {isTesting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Play className="h-4 w-4 text-blue-500" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteTrigger(trigger.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No triggers configured. Add one above.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
