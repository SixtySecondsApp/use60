/**
 * Agent Team Settings
 *
 * Platform admin page for managing multi-agent sales team configuration,
 * schedules, and triggers.
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
  Pencil,
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
import { toast } from 'sonner';
import {
  getAgentTeamConfig,
  updateAgentTeamConfig,
  getSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getTriggers,
  createTrigger,
  updateTrigger,
  deleteTrigger,
  type AgentTeamConfig,
  type AgentSchedule,
  type AgentTrigger,
} from '@/lib/services/agentTeamService';

// =============================================================================
// Constants
// =============================================================================

const AGENTS = [
  { name: 'pipeline_manager', displayName: 'Pipeline Manager', icon: BarChart3, color: 'text-blue-500' },
  { name: 'outreach_agent', displayName: 'Outreach & Follow-up', icon: Mail, color: 'text-purple-500' },
  { name: 'research_agent', displayName: 'Research & Enrichment', icon: Search, color: 'text-emerald-500' },
  { name: 'crm_ops_agent', displayName: 'CRM Operations', icon: Database, color: 'text-orange-500' },
  { name: 'meetings_agent', displayName: 'Meeting Intelligence', icon: Calendar, color: 'text-amber-500' },
  { name: 'prospecting_agent', displayName: 'Prospecting', icon: Target, color: 'text-rose-500' },
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
  'deal_stage_changed',
  'deal_created',
  'deal_stalled',
  'meeting_completed',
  'task_overdue',
  'email_received',
  'contact_created',
];

// =============================================================================
// Main Component
// =============================================================================

export default function AgentTeamSettings() {
  const navigate = useNavigate();
  const { isPlatformAdmin } = useUserPermissions();
  const { activeOrgId } = useOrg();

  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState<AgentTeamConfig | null>(null);
  const [schedules, setSchedules] = useState<AgentSchedule[]>([]);
  const [triggers, setTriggers] = useState<AgentTrigger[]>([]);

  // Form state for new schedule
  const [newScheduleAgent, setNewScheduleAgent] = useState('');
  const [newScheduleCron, setNewScheduleCron] = useState('');
  const [newScheduleAction, setNewScheduleAction] = useState('');

  // Form state for new trigger
  const [newTriggerAgent, setNewTriggerAgent] = useState('');
  const [newTriggerEvent, setNewTriggerEvent] = useState('');
  const [newTriggerAction, setNewTriggerAction] = useState('');

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

  const handleCreateSchedule = async () => {
    if (!activeOrgId || !newScheduleAgent || !newScheduleCron || !newScheduleAction) {
      toast.error('Please fill in all schedule fields');
      return;
    }
    try {
      const created = await createSchedule({
        organization_id: activeOrgId,
        agent_name: newScheduleAgent,
        cron_expression: newScheduleCron,
        action: newScheduleAction,
      });
      setSchedules((prev) => [created, ...prev]);
      setNewScheduleAgent('');
      setNewScheduleCron('');
      setNewScheduleAction('');
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

  // =============================================================================
  // Trigger handlers
  // =============================================================================

  const handleCreateTrigger = async () => {
    if (!activeOrgId || !newTriggerAgent || !newTriggerEvent || !newTriggerAction) {
      toast.error('Please fill in all trigger fields');
      return;
    }
    try {
      const created = await createTrigger({
        organization_id: activeOrgId,
        agent_name: newTriggerAgent,
        event_type: newTriggerEvent,
        action: newTriggerAction,
      });
      setTriggers((prev) => [created, ...prev]);
      setNewTriggerAgent('');
      setNewTriggerEvent('');
      setNewTriggerAction('');
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
                  Configure recurring agent jobs using cron expressions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Add Schedule Form */}
                <div className="flex items-end gap-3 p-4 bg-muted/50 rounded-lg">
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
                  <div className="flex-1 space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Action</label>
                    <Input
                      placeholder="daily_pipeline_review"
                      value={newScheduleAction}
                      onChange={(e) => setNewScheduleAction(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleCreateSchedule}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>

                {/* Schedules Table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead>Cron</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Last Run</TableHead>
                      <TableHead className="text-center">Active</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedules.length > 0 ? (
                      schedules.map((schedule) => {
                        const agentInfo = AGENTS.find((a) => a.name === schedule.agent_name);
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
                            <TableCell>{schedule.action}</TableCell>
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
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteSchedule(schedule.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
                  Configure event-driven agent actions that fire when specific CRM events occur.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Add Trigger Form */}
                <div className="flex items-end gap-3 p-4 bg-muted/50 rounded-lg">
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
                  <div className="flex-1 space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Action</label>
                    <Input
                      placeholder="notify_team"
                      value={newTriggerAction}
                      onChange={(e) => setNewTriggerAction(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleCreateTrigger}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>

                {/* Triggers Table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead>Event Type</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead className="text-center">Active</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {triggers.length > 0 ? (
                      triggers.map((trigger) => {
                        const agentInfo = AGENTS.find((a) => a.name === trigger.agent_name);
                        return (
                          <TableRow key={trigger.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {agentInfo && <agentInfo.icon className={cn('h-4 w-4', agentInfo.color)} />}
                                <span className="font-medium">{agentInfo?.displayName || trigger.agent_name}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{trigger.event_type.replace(/_/g, ' ')}</Badge>
                            </TableCell>
                            <TableCell>{trigger.action}</TableCell>
                            <TableCell className="text-center">
                              <Switch
                                checked={trigger.is_active}
                                onCheckedChange={(checked) => handleToggleTrigger(trigger.id, checked)}
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteTrigger(trigger.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
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
