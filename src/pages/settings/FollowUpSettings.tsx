/**
 * Follow Up Settings Page
 *
 * Unified settings page for proposal/follow-up workflows:
 * - Workflows: Configure which output types to include in each workflow
 * - Templates: Train the AI with example documents
 * - AI Models: Select which AI models to use for generation
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Edit2,
  Trash2,
  MoreVertical,
  Star,
  Loader2,
  FileText,
  Mail,
  FileCode,
  Target,
  ScrollText,
  Copy,
  AlertCircle,
  Palette,
  Upload,
  Save,
  Workflow,
  Type,
} from 'lucide-react';
import {
  OrgProposalWorkflowService,
  type OrgProposalWorkflow,
  type CreateProposalWorkflowInput,
  getWorkflowOutputTypes,
} from '@/lib/services/orgProposalWorkflowService';
import {
  getProposalTemplates,
  updateProposalTemplate,
  createProposalTemplate,
  type ProposalTemplate,
} from '@/lib/services/proposalService';
import { useOrgId, useOrgPermissions } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Output type configuration for workflows
const OUTPUT_TYPES = [
  { key: 'include_goals', label: 'Goals & Objectives', icon: Target, description: 'Extracted goals from meetings' },
  { key: 'include_sow', label: 'Statement of Work', icon: ScrollText, description: 'Formal SOW document' },
  { key: 'include_html', label: 'HTML Proposal', icon: FileCode, description: 'Interactive HTML presentation' },
  { key: 'include_email', label: 'Email', icon: Mail, description: 'Email-ready text' },
  { key: 'include_formatted', label: 'Formatted Text', icon: Type, description: 'Beautifully rendered document' },
  { key: 'include_markdown', label: 'Markdown', icon: FileText, description: 'Raw markdown for developers' },
] as const;

// Template type descriptions and guidance
const TEMPLATE_GUIDANCE = {
  goals: {
    title: 'Goals & Objectives',
    icon: Target,
    description: 'Upload one example of how you structure goals. Sixty will match this format for every meeting.',
    guidance: [
      'Include example categories (Marketing Goals, Operations Goals, Revenue Goals)',
      'Show formatting for bullet points and sub-items',
      'Demonstrate timeline and metric formatting',
    ],
  },
  sow: {
    title: 'Statement of Work',
    icon: FileText,
    description: 'Upload one example SOW. Sixty will generate SOWs in this style for each deal.',
    guidance: [
      'Use clear section headers (Introduction, Scope, Deliverables, Timeline, Pricing)',
      'Include example pricing structures and payment terms',
      'Show project phases and milestones',
    ],
  },
  proposal: {
    title: 'HTML Proposal',
    icon: FileCode,
    description: 'Upload one example proposal. Sixty will create proposals matching your branding and layout.',
    guidance: [
      'Include complete HTML with embedded CSS',
      'Use dark glassmorphic design (or your preferred style)',
      'Include navigation and interactive elements',
    ],
  },
  design_system: {
    title: 'Design System',
    icon: Palette,
    description: 'Define your brand style once. Sixty applies it to all generated content.',
    guidance: [
      'Define your color palette (primary, secondary, accent)',
      'Specify typography choices (fonts, sizes)',
      'Describe component styles (cards, buttons)',
    ],
  },
};

interface WorkflowFormData {
  name: string;
  description: string;
  include_goals: boolean;
  include_sow: boolean;
  include_html: boolean;
  include_email: boolean;
  include_formatted: boolean;
  include_markdown: boolean;
  is_default: boolean;
}

const emptyFormData: WorkflowFormData = {
  name: '',
  description: '',
  include_goals: false,
  include_sow: false,
  include_html: false,
  include_email: false,
  include_formatted: false,
  include_markdown: false,
  is_default: false,
};

export default function FollowUpSettings() {
  const orgId = useOrgId();
  const { user } = useAuth();
  const permissions = useOrgPermissions();
  const canEdit = permissions.isAdmin || permissions.isOwner;

  // Workflows state
  const [workflows, setWorkflows] = useState<OrgProposalWorkflow[]>([]);
  const [workflowsLoading, setWorkflowsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<OrgProposalWorkflow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<WorkflowFormData>(emptyFormData);

  // Templates state
  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [savingTemplate, setSavingTemplate] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ProposalTemplate | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load data on mount
  useEffect(() => {
    if (orgId) {
      loadWorkflows();
    } else {
      // orgId not yet available - stop spinner so we don't show infinite loading
      setWorkflowsLoading(false);
    }
    loadTemplates();
  }, [orgId]);

  // Workflow functions
  const loadWorkflows = async () => {
    if (!orgId) return;
    try {
      setWorkflowsLoading(true);
      const data = await OrgProposalWorkflowService.getWorkflows(orgId);
      setWorkflows(data);
    } catch (error) {
      console.error('Error loading workflows:', error);
      toast.error('Failed to load workflows');
    } finally {
      setWorkflowsLoading(false);
    }
  };

  const handleSeedDefaults = async () => {
    if (!orgId) return;
    try {
      setSaving(true);
      const defaults: CreateProposalWorkflowInput[] = [
        {
          name: 'Full Proposal',
          description: 'Complete proposal package with goals, SOW, and formatted document',
          include_goals: true,
          include_sow: true,
          include_formatted: true,
          include_email: false,
          include_html: false,
          include_markdown: false,
          is_default: true,
        },
        {
          name: 'Quick Followup Email',
          description: 'Fast email for post-meeting follow-up',
          include_email: true,
          include_goals: false,
          include_sow: false,
          include_formatted: false,
          include_html: false,
          include_markdown: false,
          is_default: false,
        },
        {
          name: 'Client Summary',
          description: 'Clean markdown summary to share with clients',
          include_markdown: true,
          include_goals: true,
          include_email: false,
          include_sow: false,
          include_formatted: false,
          include_html: false,
          is_default: false,
        },
      ];
      for (const workflow of defaults) {
        await OrgProposalWorkflowService.createWorkflow(orgId, workflow, user?.id);
      }
      toast.success('Default workflows created');
      loadWorkflows();
    } catch (error) {
      console.error('Error creating default workflows:', error);
      toast.error('Failed to create default workflows');
    } finally {
      setSaving(false);
    }
  };

  const openCreateModal = () => {
    setEditingWorkflow(null);
    setFormData(emptyFormData);
    setShowModal(true);
  };

  const openEditModal = (workflow: OrgProposalWorkflow) => {
    setEditingWorkflow(workflow);
    setFormData({
      name: workflow.name,
      description: workflow.description || '',
      include_goals: workflow.include_goals,
      include_sow: workflow.include_sow,
      include_html: workflow.include_html,
      include_email: workflow.include_email,
      include_formatted: workflow.include_formatted,
      include_markdown: workflow.include_markdown,
      is_default: workflow.is_default,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingWorkflow(null);
    setFormData(emptyFormData);
  };

  const handleSaveWorkflow = async () => {
    if (!orgId) return;

    if (!formData.name.trim()) {
      toast.error('Workflow name is required');
      return;
    }

    const hasOutput = formData.include_goals || formData.include_sow ||
                      formData.include_html || formData.include_email ||
                      formData.include_formatted || formData.include_markdown;
    if (!hasOutput) {
      toast.error('At least one output type must be selected');
      return;
    }

    try {
      setSaving(true);

      if (editingWorkflow) {
        await OrgProposalWorkflowService.updateWorkflow(orgId, editingWorkflow.id, {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          include_goals: formData.include_goals,
          include_sow: formData.include_sow,
          include_html: formData.include_html,
          include_email: formData.include_email,
          include_formatted: formData.include_formatted,
          include_markdown: formData.include_markdown,
          is_default: formData.is_default,
        });
        toast.success('Workflow updated');
      } else {
        await OrgProposalWorkflowService.createWorkflow(
          orgId,
          {
            name: formData.name.trim(),
            description: formData.description.trim() || undefined,
            include_goals: formData.include_goals,
            include_sow: formData.include_sow,
            include_html: formData.include_html,
            include_email: formData.include_email,
            include_formatted: formData.include_formatted,
            include_markdown: formData.include_markdown,
            is_default: formData.is_default,
          },
          user?.id
        );
        toast.success('Workflow created');
      }

      closeModal();
      loadWorkflows();
    } catch (error) {
      console.error('Error saving workflow:', error);
      toast.error('Failed to save workflow');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWorkflow = async (workflowId: string) => {
    if (!orgId) return;
    try {
      setDeletingId(workflowId);
      await OrgProposalWorkflowService.deleteWorkflow(orgId, workflowId);
      toast.success('Workflow deleted');
      loadWorkflows();
    } catch (error) {
      console.error('Error deleting workflow:', error);
      toast.error('Failed to delete workflow');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDuplicate = async (workflow: OrgProposalWorkflow) => {
    if (!orgId) return;
    try {
      setSaving(true);
      await OrgProposalWorkflowService.duplicateWorkflow(
        orgId,
        workflow.id,
        `${workflow.name} (Copy)`,
        user?.id
      );
      toast.success('Workflow duplicated');
      loadWorkflows();
    } catch (error) {
      console.error('Error duplicating workflow:', error);
      toast.error('Failed to duplicate workflow');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (workflow: OrgProposalWorkflow) => {
    if (!orgId) return;
    try {
      setSaving(true);
      await OrgProposalWorkflowService.updateWorkflow(orgId, workflow.id, {
        is_default: true,
      });
      toast.success('Default workflow updated');
      loadWorkflows();
    } catch (error) {
      console.error('Error setting default workflow:', error);
      toast.error('Failed to set default workflow');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (workflow: OrgProposalWorkflow) => {
    if (!orgId) return;
    try {
      await OrgProposalWorkflowService.updateWorkflow(orgId, workflow.id, {
        is_active: !workflow.is_active,
      });
      toast.success(workflow.is_active ? 'Workflow deactivated' : 'Workflow activated');
      loadWorkflows();
    } catch (error) {
      console.error('Error toggling workflow:', error);
      toast.error('Failed to update workflow');
    }
  };

  // Template functions
  const loadTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const data = await getProposalTemplates();
      setTemplates(data);
    } catch (error) {
      toast.error('Failed to load templates');
    } finally {
      setTemplatesLoading(false);
    }
  };

  const handleSaveTemplate = async (template: ProposalTemplate) => {
    setSavingTemplate(template.id);
    try {
      const success = await updateProposalTemplate(template.id, {
        name: template.name,
        content: template.content,
        is_default: template.is_default,
      });

      if (success) {
        toast.success('Template saved');
        await loadTemplates();
        setEditingTemplate(null);
      } else {
        toast.error('Failed to save template');
      }
    } catch (error) {
      toast.error('Error saving template');
    } finally {
      setSavingTemplate(null);
    }
  };

  const handleCreateTemplate = async (type: 'goals' | 'sow' | 'proposal' | 'design_system') => {
    const guidance = TEMPLATE_GUIDANCE[type];
    const newTemplate: Omit<ProposalTemplate, 'id' | 'created_at' | 'updated_at' | 'user_id'> = {
      name: `Custom ${guidance.title}`,
      type,
      content: '',
      is_default: false,
    };

    const created = await createProposalTemplate(newTemplate);
    if (created) {
      toast.success('Template created');
      await loadTemplates();
      setEditingTemplate(created);
    } else {
      toast.error('Failed to create template');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, templateId: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const template = templates.find(t => t.id === templateId);
      if (template) {
        setEditingTemplate({ ...template, content });
        toast.success(`Imported ${file.name} - click Save to apply`);
      }
    } catch (error) {
      toast.error('Failed to read file');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const groupedTemplates = {
    goals: templates.filter(t => t.type === 'goals'),
    sow: templates.filter(t => t.type === 'sow'),
    proposal: templates.filter(t => t.type === 'proposal'),
    design_system: templates.filter(t => t.type === 'design_system'),
  };

  const renderTemplateSection = (type: 'goals' | 'sow' | 'proposal' | 'design_system') => {
    const guidance = TEMPLATE_GUIDANCE[type];
    const Icon = guidance.icon;
    const templatesOfType = groupedTemplates[type];

    return (
      <div key={type} className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
            <h4 className="font-medium">{guidance.title}</h4>
          </div>
          {templatesOfType.length === 0 && (
            <Button onClick={() => handleCreateTemplate(type)} size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              Add Template
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{guidance.description}</p>

        {templatesOfType.length > 0 ? (
          templatesOfType.map((template) => (
            <Card key={template.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{template.name}</CardTitle>
                    {template.is_default && (
                      <Badge variant="secondary" className="text-xs">Active</Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {editingTemplate?.id === template.id ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleSaveTemplate(editingTemplate)}
                          disabled={savingTemplate === template.id}
                        >
                          <Save className="h-4 w-4 mr-1" />
                          {savingTemplate === template.id ? 'Saving...' : 'Save'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingTemplate(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setEditingTemplate(template)}>
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {editingTemplate?.id === template.id ? (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={(e) => handleFileUpload(e, template.id)}
                        accept={type === 'proposal' ? '.html,.htm' : '.md,.txt'}
                        className="hidden"
                        id={`file-upload-${template.id}`}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => document.getElementById(`file-upload-${template.id}`)?.click()}
                      >
                        <Upload className="h-3 w-3 mr-1" />
                        Import File
                      </Button>
                    </div>
                    <Textarea
                      value={editingTemplate.content}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, content: e.target.value })}
                      rows={12}
                      className="font-mono text-sm"
                      placeholder={`Paste your ${type.replace('_', ' ')} template here...`}
                    />
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`default-${template.id}`}
                        checked={editingTemplate.is_default}
                        onCheckedChange={(checked) =>
                          setEditingTemplate({ ...editingTemplate, is_default: checked as boolean })
                        }
                      />
                      <Label htmlFor={`default-${template.id}`} className="cursor-pointer text-sm">
                        Set as active template
                      </Label>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {template.content.length > 100
                      ? `${template.content.length.toLocaleString()} characters`
                      : 'Click Edit to add content'}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center text-muted-foreground">
              <p className="text-sm">No template configured yet</p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-8">
      <div>
        <h2 className="text-2xl font-bold">Follow Up Configuration</h2>
        <p className="text-muted-foreground">
          Configure workflows and templates for follow-up generation
        </p>
      </div>

      <Tabs defaultValue="workflows" className="space-y-6">
        <TabsList>
          <TabsTrigger value="workflows" className="flex items-center gap-2">
            <Workflow className="h-4 w-4" />
            Workflows
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Templates
          </TabsTrigger>
        </TabsList>

        {/* Workflows Tab */}
        <TabsContent value="workflows" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Proposal Workflows</h3>
              <p className="text-sm text-muted-foreground">
                Create custom workflows that combine different output types
              </p>
            </div>
            {canEdit && (
              <Button onClick={openCreateModal}>
                <Plus className="mr-2 h-4 w-4" />
                Add Workflow
              </Button>
            )}
          </div>

          {workflowsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : workflows.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No workflows yet</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Start with our recommended defaults or create your own
                </p>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button onClick={handleSeedDefaults} disabled={saving}>
                      {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="mr-2 h-4 w-4" />
                      )}
                      Add Default Workflows
                    </Button>
                    <Button variant="outline" onClick={openCreateModal}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Custom
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {workflows.map((workflow) => (
                <Card
                  key={workflow.id}
                  className={cn(
                    'transition-opacity',
                    !workflow.is_active && 'opacity-60'
                  )}
                >
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {workflow.is_default && (
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        )}
                        <h3 className="font-medium">{workflow.name}</h3>
                        {!workflow.is_active && (
                          <Badge variant="secondary" className="text-xs">Inactive</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        {getWorkflowOutputTypes(workflow).map((type, index) => (
                          <React.Fragment key={type}>
                            {index > 0 && <span>+</span>}
                            <span>{type}</span>
                          </React.Fragment>
                        ))}
                      </div>
                      {workflow.description && (
                        <p className="text-sm text-muted-foreground">
                          {workflow.description}
                        </p>
                      )}
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={workflow.is_active}
                          onCheckedChange={() => handleToggleActive(workflow)}
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="z-50">
                            <DropdownMenuItem onClick={() => openEditModal(workflow)}>
                              <Edit2 className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDuplicate(workflow)}>
                              <Copy className="mr-2 h-4 w-4" />
                              Duplicate
                            </DropdownMenuItem>
                            {!workflow.is_default && (
                              <DropdownMenuItem onClick={() => handleSetDefault(workflow)}>
                                <Star className="mr-2 h-4 w-4" />
                                Set as Default
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleDeleteWorkflow(workflow.id)}
                              className="text-destructive"
                              disabled={deletingId === workflow.id}
                            >
                              {deletingId === workflow.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="mr-2 h-4 w-4" />
                              )}
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold">Example Templates</h3>
            <p className="text-sm text-muted-foreground">
              Upload just one example of each type. Sixty learns your style and generates tailored follow-ups for every meeting automatically.
            </p>
          </div>

          {templatesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-8">
              {renderTemplateSection('design_system')}
              {renderTemplateSection('proposal')}
              {renderTemplateSection('goals')}
              {renderTemplateSection('sow')}
            </div>
          )}
        </TabsContent>

      </Tabs>

      {/* Create/Edit Workflow Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingWorkflow ? 'Edit Workflow' : 'Create Workflow'}
            </DialogTitle>
            <DialogDescription>
              Configure which output types this workflow should generate
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Workflow Name</Label>
              <Input
                id="name"
                placeholder="e.g., Quick Follow-up Email"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="e.g., Fast email for post-meeting follow-up"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-3">
              <Label>Output Types</Label>
              <p className="text-sm text-muted-foreground">
                Select which outputs this workflow should generate
              </p>
              <div className="space-y-2">
                {OUTPUT_TYPES.map((type) => {
                  const Icon = type.icon;
                  const isChecked = formData[type.key as keyof WorkflowFormData] as boolean;
                  return (
                    <div
                      key={type.key}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                        isChecked ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                      )}
                      onClick={() => setFormData({ ...formData, [type.key]: !isChecked })}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, [type.key]: checked as boolean })
                        }
                      />
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{type.label}</p>
                        <p className="text-xs text-muted-foreground">{type.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Checkbox
                id="is_default"
                checked={formData.is_default}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_default: checked as boolean })
                }
              />
              <Label htmlFor="is_default" className="cursor-pointer">
                Set as default workflow
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveWorkflow} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : editingWorkflow ? (
                'Save Changes'
              ) : (
                'Create Workflow'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
