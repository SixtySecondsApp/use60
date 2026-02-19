/**
 * Call Type Settings Page
 * 
 * Admin-only page for managing organization-level call types.
 * Features:
 * - List all call types with drag-and-drop reordering
 * - Create, edit, and delete call types
 * - Configure keywords, colors, and icons
 * - Toggle active/inactive status
 * - Seed default call types on first load
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Edit2,
  Trash2,
  GripVertical,
  X,
  Save,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
  Info,
  Phone,
  Search,
  Presentation,
  CheckCircle,
  Users,
  Users2,
  Calendar,
  Palette,
  Tag,
  Settings,
} from 'lucide-react';
import { CallTypeService, type OrgCallType, type CreateCallTypeInput, type UpdateCallTypeInput } from '@/lib/services/callTypeService';
import { useOrgId, useOrgPermissions } from '@/lib/contexts/OrgContext';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CallTypeWorkflowEditor } from '@/components/admin/CallTypeWorkflowEditor';
import { useOrgCallTypes } from '@/lib/hooks/useWorkflowResults';

// Icon options for call types
const ICON_OPTIONS = [
  { value: 'phone', label: 'Phone', icon: Phone },
  { value: 'search', label: 'Search', icon: Search },
  { value: 'presentation', label: 'Presentation', icon: Presentation },
  { value: 'check-circle', label: 'Check Circle', icon: CheckCircle },
  { value: 'users', label: 'Users', icon: Users },
  { value: 'users-2', label: 'Users 2', icon: Users2 },
  { value: 'calendar', label: 'Calendar', icon: Calendar },
  { value: 'tag', label: 'Tag', icon: Tag },
];

// Default color options
const COLOR_OPTIONS = [
  '#6366f1', // indigo
  '#8b5cf6', // purple
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#14b8a6', // teal
];

export default function CallTypeSettings() {
  const orgId = useOrgId();
  const permissions = useOrgPermissions();
  const { isPlatformAdmin } = useUserPermissions();
  const [callTypes, setCallTypes] = useState<OrgCallType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [workflowEditorCallTypeId, setWorkflowEditorCallTypeId] = useState<string | null>(null);

  // Use the workflow results hook for workflow config updates
  const { updateWorkflowConfig, updateCoachingEnabled } = useOrgCallTypes();

  useEffect(() => {
    if (orgId) {
      loadCallTypes();
    }
  }, [orgId]);

  const loadCallTypes = async () => {
    if (!orgId) return;

    try {
      setLoading(true);
      const types = await CallTypeService.getCallTypes(orgId);
      
      // If no call types exist, seed defaults
      if (types.length === 0) {
        await CallTypeService.seedDefaultCallTypes(orgId);
        const seeded = await CallTypeService.getCallTypes(orgId);
        setCallTypes(seeded);
      } else {
        setCallTypes(types);
      }
    } catch (error) {
      console.error('Error loading call types:', error);
      toast.error('Failed to load call types');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (input: CreateCallTypeInput) => {
    if (!orgId) return;

    try {
      setSaving(true);
      await CallTypeService.createCallType(orgId, input);
      toast.success('Call type created');
      setShowNewForm(false);
      loadCallTypes();
    } catch (error) {
      console.error('Error creating call type:', error);
      toast.error('Failed to create call type');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (callTypeId: string, input: UpdateCallTypeInput) => {
    if (!orgId) return;

    try {
      setSaving(true);
      await CallTypeService.updateCallType(orgId, callTypeId, input);
      toast.success('Call type updated');
      setEditingId(null);
      loadCallTypes();
    } catch (error) {
      console.error('Error updating call type:', error);
      toast.error('Failed to update call type');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (callTypeId: string) => {
    if (!orgId) return;

    if (!confirm('Are you sure you want to delete this call type? This will remove the classification from all meetings using it.')) {
      return;
    }

    try {
      setDeletingId(callTypeId);
      await CallTypeService.deleteCallType(orgId, callTypeId);
      toast.success('Call type deleted');
      loadCallTypes();
    } catch (error) {
      console.error('Error deleting call type:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete call type');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (callType: OrgCallType) => {
    await handleUpdate(callType.id, { is_active: !callType.is_active });
  };

  if (!permissions.canManageSettings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
              <p className="text-gray-600 dark:text-gray-400">
                You need admin or owner permissions to manage call types.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500 dark:text-gray-400">Loading call types...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-gray-900 dark:text-gray-100">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                Call Type Settings
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Configure call types that AI uses to automatically classify your meetings
              </p>
            </div>
            <Button onClick={() => setShowNewForm(true)} disabled={saving}>
              <Plus className="w-4 h-4 mr-2" />
              New Call Type
            </Button>
          </div>

          {/* Info Card */}
          <Card className="mt-6 bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <Sparkles className="w-6 h-6 text-gray-700 dark:text-gray-300" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                    <Info className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                    How It Works
                  </h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                    When meetings are synced from Fathom, AI analyzes the transcript and automatically classifies
                    the call type based on keywords and content. You can configure custom call types and keywords
                    to match your team's terminology.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">AI Classification</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Meetings are automatically classified using Claude AI
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Workflow Triggers</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Trigger workflows based on call type classification
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* New Call Type Form */}
        <AnimatePresence>
          {showNewForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6"
            >
              <CallTypeForm
                onSave={handleCreate}
                onCancel={() => setShowNewForm(false)}
                saving={saving}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Call Types List */}
        {callTypes.length === 0 && !showNewForm ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-500 dark:text-gray-400 mb-4">No call types configured</p>
              <Button onClick={() => setShowNewForm(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Call Type
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {callTypes.map((callType) => (
              <CallTypeCard
                key={callType.id}
                callType={callType}
                isEditing={editingId === callType.id}
                isDeleting={deletingId === callType.id}
                onEdit={() => setEditingId(callType.id)}
                onCancel={() => setEditingId(null)}
                onSave={(input) => handleUpdate(callType.id, input)}
                onDelete={() => handleDelete(callType.id)}
                onToggleActive={() => handleToggleActive(callType)}
                onConfigureWorkflow={() => setWorkflowEditorCallTypeId(callType.id)}
                showWorkflowCog={isPlatformAdmin}
                saving={saving}
              />
            ))}
          </div>
        )}

        {/* Workflow Editor Dialog */}
        {workflowEditorCallTypeId && (() => {
          const selectedCallType = callTypes.find(ct => ct.id === workflowEditorCallTypeId);
          if (!selectedCallType) return null;

          return (
            <CallTypeWorkflowEditor
              callTypeId={workflowEditorCallTypeId}
              callTypeName={selectedCallType.name}
              currentConfig={selectedCallType.workflow_config}
              enableCoaching={selectedCallType.enable_coaching ?? true}
              open={!!workflowEditorCallTypeId}
              onOpenChange={(open) => {
                if (!open) setWorkflowEditorCallTypeId(null);
              }}
              onSave={async (config, enableCoaching) => {
                try {
                  await updateWorkflowConfig(workflowEditorCallTypeId, config);
                  await updateCoachingEnabled(workflowEditorCallTypeId, enableCoaching);
                  loadCallTypes(); // Refresh the list
                } catch (error) {
                  // Error toast is handled by the hook
                }
              }}
            />
          );
        })()}
      </div>
    </div>
  );
}

// Call Type Form Component
function CallTypeForm({
  callType,
  onSave,
  onCancel,
  saving,
}: {
  callType?: OrgCallType;
  onSave: (input: CreateCallTypeInput | UpdateCallTypeInput) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(callType?.name || '');
  const [description, setDescription] = useState(callType?.description || '');
  const [keywords, setKeywords] = useState<string[]>(callType?.keywords || ['']);
  const [color, setColor] = useState(callType?.color || COLOR_OPTIONS[0]);
  const [icon, setIcon] = useState(callType?.icon || 'phone');
  const [isActive, setIsActive] = useState(callType?.is_active ?? true);

  const addKeyword = () => {
    setKeywords([...keywords, '']);
  };

  const removeKeyword = (index: number) => {
    setKeywords(keywords.filter((_, i) => i !== index));
  };

  const updateKeyword = (index: number, value: string) => {
    const updated = [...keywords];
    updated[index] = value;
    setKeywords(updated);
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Please enter a call type name');
      return;
    }

    const validKeywords = keywords.filter(k => k.trim()).map(k => k.trim().toLowerCase());
    if (validKeywords.length === 0) {
      toast.error('Please add at least one keyword');
      return;
    }

    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      keywords: validKeywords,
      color,
      icon,
      is_active: isActive,
    });
  };

  const selectedIcon = ICON_OPTIONS.find(opt => opt.value === icon);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{callType ? 'Edit Call Type' : 'New Call Type'}</CardTitle>
        <CardDescription>
          Configure the call type name, keywords, and display settings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Discovery, Demo, Close"
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this call type"
            />
          </div>
        </div>

        <div>
          <Label>Keywords *</Label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Keywords that help AI identify this call type in transcripts
          </p>
          <div className="space-y-2">
            {keywords.map((keyword, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={keyword}
                  onChange={(e) => updateKeyword(index, e.target.value)}
                  placeholder="e.g., pain points, challenges"
                />
                {keywords.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeKeyword(index)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addKeyword}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Keyword
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Color</Label>
            <div className="flex gap-2 mt-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "w-8 h-8 rounded-full border-2 transition-all",
                    color === c ? "border-gray-900 dark:border-gray-100 scale-110" : "border-gray-300 dark:border-gray-600"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <Label>Icon</Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {ICON_OPTIONS.map((opt) => {
                const IconComponent = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setIcon(opt.value)}
                    className={cn(
                      "p-2 rounded-lg border-2 transition-all",
                      icon === opt.value
                        ? "border-gray-900 dark:border-gray-100 bg-gray-100 dark:bg-gray-800"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                    )}
                    title={opt.label}
                  >
                    <IconComponent className="w-5 h-5" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {callType && (
          <div className="flex items-center gap-2">
            <Switch
              id="is_active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <Label htmlFor="is_active">Active</Label>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Call Type Card Component
function CallTypeCard({
  callType,
  isEditing,
  isDeleting,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onToggleActive,
  onConfigureWorkflow,
  showWorkflowCog,
  saving,
}: {
  callType: OrgCallType;
  isEditing: boolean;
  isDeleting: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (input: UpdateCallTypeInput) => void;
  onDelete: () => void;
  onToggleActive: () => void;
  onConfigureWorkflow: () => void;
  showWorkflowCog: boolean;
  saving: boolean;
}) {
  const iconOption = ICON_OPTIONS.find(opt => opt.value === callType.icon);
  const IconComponent = iconOption?.icon || Phone;

  if (isEditing) {
    return (
      <CallTypeForm
        callType={callType}
        onSave={onSave}
        onCancel={onCancel}
        saving={saving}
      />
    );
  }

  return (
    <Card className={cn(!callType.is_active && "opacity-60")}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4 flex-1">
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: `${callType.color}20` }}
            >
              <IconComponent
                className="w-6 h-6"
                style={{ color: callType.color }}
              />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-semibold text-lg">{callType.name}</h3>
                {callType.is_system && (
                  <Badge variant="secondary" className="text-xs">System</Badge>
                )}
                {!callType.is_active && (
                  <Badge variant="outline" className="text-xs">Inactive</Badge>
                )}
                {callType.enable_coaching === false && (
                  <Badge variant="outline" className="text-xs text-orange-600 dark:text-orange-400 border-orange-300">
                    Coaching Off
                  </Badge>
                )}
                {callType.workflow_config?.checklist_items?.length > 0 && (
                  <Badge variant="outline" className="text-xs text-green-600 dark:text-green-400 border-green-300">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {callType.workflow_config.checklist_items.length} checklist items
                  </Badge>
                )}
              </div>
              {callType.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {callType.description}
                </p>
              )}
              <div className="flex flex-wrap gap-1 mt-2">
                {callType.keywords.slice(0, 5).map((keyword, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {keyword}
                  </Badge>
                ))}
                {callType.keywords.length > 5 && (
                  <Badge variant="outline" className="text-xs">
                    +{callType.keywords.length - 5} more
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={callType.is_active}
              onCheckedChange={onToggleActive}
              disabled={saving}
            />
            {showWorkflowCog && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onConfigureWorkflow}
                disabled={saving}
                title="Configure Workflow"
              >
                <Settings className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              disabled={saving}
              title="Edit Call Type"
            >
              <Edit2 className="w-4 h-4" />
            </Button>
            {!callType.is_system && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                disabled={saving || isDeleting}
                title="Delete Call Type"
              >
                {isDeleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

