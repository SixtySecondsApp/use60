/**
 * CustomSOPBuilderPage
 * SOP-005: SOP library with CRUD, platform defaults, and the test harness.
 * Org admin only.
 */

import { useState, useMemo } from 'react';
import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  Workflow,
  Edit2,
  Trash2,
  Copy,
  Loader2,
  Shield,
  MessageSquare,
  Database,
  Mail,
  Clock,
  Hand,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FlaskConical,
} from 'lucide-react';
import TriggerConditionSelector, {
  type TriggerType,
  type TriggerConfig,
} from '@/components/agent/TriggerConditionSelector';
import SOPStepBuilder, { type SOPStep } from '@/components/agent/SOPStepBuilder';
import SOPTestHarness from '@/components/agent/SOPTestHarness';
import {
  useCustomSOPs,
  useCreateSOP,
  useUpdateSOP,
  useDeleteSOP,
  useToggleSOPActive,
  type CustomSOP,
  type CreateSOPInput,
} from '@/lib/hooks/useCustomSOPs';

// ============================================================
// Helpers
// ============================================================

const TRIGGER_LABELS: Record<TriggerType, string> = {
  transcript_phrase: 'Transcript Phrase',
  crm_field_change: 'CRM Field Change',
  email_pattern: 'Email Pattern',
  time_based: 'Time-Based',
  manual: 'Manual',
};

const TRIGGER_ICONS: Record<TriggerType, React.ElementType> = {
  transcript_phrase: MessageSquare,
  crm_field_change: Database,
  email_pattern: Mail,
  time_based: Clock,
  manual: Hand,
};

function triggerBadgeColor(type: TriggerType): string {
  const map: Record<TriggerType, string> = {
    transcript_phrase: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    crm_field_change: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    email_pattern: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    time_based: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    manual: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  };
  return map[type] ?? 'bg-gray-100 text-gray-600';
}

function sopStepsToBuilderSteps(sop: CustomSOP): SOPStep[] {
  return (sop.steps ?? []).map((s) => ({
    id: s.id,
    step_order: s.step_order,
    action_type: s.action_type,
    action_config: s.action_config,
    requires_approval: s.requires_approval,
  }));
}

function calculateCreditEstimate(steps: SOPStep[]): number {
  const COSTS: Record<string, number> = {
    crm_action: 0.5,
    draft_email: 1.0,
    alert_rep: 0.2,
    alert_manager: 0.2,
    enrich_contact: 2.0,
    create_task: 0.3,
    custom: 1.0,
  };
  return steps.reduce((sum, s) => sum + (COSTS[s.action_type] ?? 0), 0);
}

// ============================================================
// SOPCard
// ============================================================

function SOPCard({
  sop,
  isAdmin,
  onEdit,
  onDelete,
  onDuplicate,
  onToggle,
  onTest,
}: {
  sop: CustomSOP;
  isAdmin: boolean;
  onEdit: (sop: CustomSOP) => void;
  onDelete: (sop: CustomSOP) => void;
  onDuplicate: (sop: CustomSOP) => void;
  onToggle: (id: string, active: boolean) => void;
  onTest: (sop: CustomSOP) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const TriggerIcon = TRIGGER_ICONS[sop.trigger_type] ?? Hand;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl overflow-hidden">
      {/* Main row */}
      <div className="flex items-center gap-3 p-4">
        {/* Trigger icon */}
        <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 flex-shrink-0">
          <TriggerIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </div>

        {/* Name + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
              {sop.name}
            </p>
            {sop.is_platform_default && (
              <Badge variant="secondary" className="text-[10px] gap-1 py-0">
                <Shield className="w-2.5 h-2.5" />
                Platform Default
              </Badge>
            )}
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${triggerBadgeColor(sop.trigger_type)}`}>
              {TRIGGER_LABELS[sop.trigger_type]}
            </span>
          </div>
          {sop.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{sop.description}</p>
          )}
          <p className="text-[10px] text-gray-400 mt-0.5">
            {(sop.steps ?? []).length} step{(sop.steps ?? []).length !== 1 ? 's' : ''} · {sop.credit_cost_estimate.toFixed(1)} credits / run
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isAdmin && !sop.is_platform_default && (
            <Switch
              checked={sop.is_active}
              onCheckedChange={(checked) => onToggle(sop.id, checked)}
            />
          )}

          <button
            type="button"
            onClick={() => onTest(sop)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-[#37bd7e] hover:bg-[#37bd7e]/10 transition-colors"
            title="Test with example"
          >
            <FlaskConical className="w-4 h-4" />
          </button>

          {isAdmin && (
            <>
              {!sop.is_platform_default && (
                <button
                  type="button"
                  onClick={() => onEdit(sop)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onDuplicate(sop)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Duplicate & Customize"
              >
                <Copy className="w-4 h-4" />
              </button>
              {!sop.is_platform_default && (
                <button
                  type="button"
                  onClick={() => onDelete(sop)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded step preview */}
      {expanded && (sop.steps ?? []).length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-1.5">
          {(sop.steps ?? []).map((step, i) => (
            <div key={step.id} className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[10px] font-semibold text-gray-600 dark:text-gray-300 flex-shrink-0">
                {i + 1}
              </span>
              <span className="capitalize">{step.action_type.replace(/_/g, ' ')}</span>
              {step.requires_approval && (
                <Badge variant="outline" className="text-[9px] py-0 px-1 border-amber-400/50 text-amber-600">requires approval</Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SOP Dialog (Create / Edit)
// ============================================================

interface SOPDialogState {
  open: boolean;
  mode: 'create' | 'edit';
  sop?: CustomSOP;
}

interface SOPFormState {
  name: string;
  description: string;
  triggerType: TriggerType;
  triggerConfig: TriggerConfig;
  steps: SOPStep[];
}

function defaultFormState(): SOPFormState {
  return {
    name: '',
    description: '',
    triggerType: 'transcript_phrase',
    triggerConfig: { phrases: [], match_mode: 'any', case_sensitive: false, use_regex: false },
    steps: [],
  };
}

function sopToFormState(sop: CustomSOP): SOPFormState {
  return {
    name: sop.is_platform_default ? `${sop.name} (copy)` : sop.name,
    description: sop.description ?? '',
    triggerType: sop.trigger_type,
    triggerConfig: sop.trigger_config,
    steps: sopStepsToBuilderSteps(sop),
  };
}

// ============================================================
// Main page
// ============================================================

export default function CustomSOPBuilderPage() {
  const orgId = useActiveOrgId();
  const { permissions } = useOrg();
  const { isPlatformAdmin } = useUserPermissions();
  const isAdmin = permissions.canManageSettings || permissions.canManageTeam || isPlatformAdmin;

  const { data: sops, isLoading, error } = useCustomSOPs(orgId ?? '');
  const createSOP = useCreateSOP(orgId ?? '');
  const updateSOP = useUpdateSOP(orgId ?? '');
  const deleteSOP = useDeleteSOP(orgId ?? '');
  const toggleSOP = useToggleSOPActive(orgId ?? '');

  const [dialog, setDialog] = useState<SOPDialogState>({ open: false, mode: 'create' });
  const [formState, setFormState] = useState<SOPFormState>(defaultFormState());
  const [deleteTarget, setDeleteTarget] = useState<CustomSOP | null>(null);
  const [testTarget, setTestTarget] = useState<CustomSOP | null>(null);
  const [step, setStep] = useState<'trigger' | 'steps'>('trigger');

  // Separate platform defaults from org-specific
  const platformSops = useMemo(() => (sops ?? []).filter((s) => s.is_platform_default), [sops]);
  const orgSops = useMemo(() => (sops ?? []).filter((s) => !s.is_platform_default), [sops]);

  function openCreate() {
    setFormState(defaultFormState());
    setStep('trigger');
    setDialog({ open: true, mode: 'create' });
  }

  function openEdit(sop: CustomSOP) {
    setFormState(sopToFormState(sop));
    setStep('trigger');
    setDialog({ open: true, mode: 'edit', sop });
  }

  function openDuplicate(sop: CustomSOP) {
    setFormState(sopToFormState(sop));
    setStep('trigger');
    setDialog({ open: true, mode: 'create' });
  }

  async function handleSave() {
    if (!formState.name.trim()) {
      toast.error('SOP name is required');
      return;
    }
    if (!orgId) return;

    const creditEstimate = calculateCreditEstimate(formState.steps);
    const stepsPayload = formState.steps.map((s) => ({
      step_order: s.step_order,
      action_type: s.action_type,
      action_config: s.action_config,
      requires_approval: s.requires_approval,
    }));

    if (dialog.mode === 'create') {
      const input: CreateSOPInput = {
        name: formState.name.trim(),
        description: formState.description.trim() || undefined,
        trigger_type: formState.triggerType,
        trigger_config: formState.triggerConfig,
        is_active: true,
        credit_cost_estimate: creditEstimate,
        steps: stepsPayload,
      };
      await createSOP.mutateAsync(input);
    } else if (dialog.sop) {
      await updateSOP.mutateAsync({
        id: dialog.sop.id,
        name: formState.name.trim(),
        description: formState.description.trim() || undefined,
        trigger_type: formState.triggerType,
        trigger_config: formState.triggerConfig,
        credit_cost_estimate: creditEstimate,
        steps: stepsPayload,
      });
    }
    setDialog({ open: false, mode: 'create' });
  }

  const isSaving = createSOP.isPending || updateSOP.isPending;

  return (
    <SettingsPageWrapper
      title="Custom Playbooks (SOPs)"
      description="Define automated playbooks that fire when specific events occur — transcript phrases, CRM changes, email patterns, or on a schedule."
    >
      <div className="space-y-6 max-w-4xl">
        {/* Header actions */}
        {isAdmin && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {(orgSops ?? []).length} custom SOP{orgSops.length !== 1 ? 's' : ''}
            </p>
            <Button onClick={openCreate} size="sm" className="gap-1.5 bg-[#37bd7e] hover:bg-[#2da06a]">
              <Plus className="w-4 h-4" />
              Create SOP
            </Button>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading playbooks...</span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <Card className="border-red-200 dark:border-red-800/50">
            <CardContent className="pt-4 flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p className="text-sm">Failed to load SOPs. Please refresh.</p>
            </CardContent>
          </Card>
        )}

        {/* Platform defaults */}
        {!isLoading && platformSops.length > 0 && (
          <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border-gray-200 dark:border-gray-700/50">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#37bd7e]" />
                <CardTitle className="text-base">Platform Defaults</CardTitle>
              </div>
              <CardDescription>
                Built-in playbooks provided by the platform. Use "Duplicate & Customize" to create your own version.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {platformSops.map((sop) => (
                <SOPCard
                  key={sop.id}
                  sop={sop}
                  isAdmin={isAdmin}
                  onEdit={openEdit}
                  onDelete={(s) => setDeleteTarget(s)}
                  onDuplicate={openDuplicate}
                  onToggle={(id, active) => toggleSOP.mutate({ id, is_active: active })}
                  onTest={(s) => setTestTarget(s)}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Org-specific SOPs */}
        {!isLoading && (
          <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border-gray-200 dark:border-gray-700/50">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Workflow className="w-4 h-4 text-[#37bd7e]" />
                <CardTitle className="text-base">Custom Playbooks</CardTitle>
              </div>
              <CardDescription>
                Playbooks created and customized for your organization.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {orgSops.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                  <Workflow className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">No custom playbooks yet</p>
                  {isAdmin && (
                    <Button variant="outline" size="sm" className="mt-3" onClick={openCreate}>
                      <Plus className="w-4 h-4 mr-1.5" />
                      Create your first SOP
                    </Button>
                  )}
                </div>
              ) : (
                orgSops.map((sop) => (
                  <SOPCard
                    key={sop.id}
                    sop={sop}
                    isAdmin={isAdmin}
                    onEdit={openEdit}
                    onDelete={(s) => setDeleteTarget(s)}
                    onDuplicate={openDuplicate}
                    onToggle={(id, active) => toggleSOP.mutate({ id, is_active: active })}
                    onTest={(s) => setTestTarget(s)}
                  />
                ))
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialog.open} onOpenChange={(open) => !open && setDialog({ open: false, mode: 'create' })}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialog.mode === 'create' ? 'Create Playbook (SOP)' : 'Edit Playbook'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Name + description */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="e.g. No-Show Handling"
                  value={formState.name}
                  onChange={(e) => setFormState((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Textarea
                  placeholder="What does this playbook do?"
                  value={formState.description}
                  onChange={(e) => setFormState((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                />
              </div>
            </div>

            {/* Step tabs */}
            <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
              {(['trigger', 'steps'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStep(s)}
                  className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    step === s
                      ? 'border-[#37bd7e] text-[#37bd7e]'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {s === 'trigger' ? '1. Trigger' : '2. Steps'}
                </button>
              ))}
            </div>

            {step === 'trigger' && (
              <TriggerConditionSelector
                triggerType={formState.triggerType}
                triggerConfig={formState.triggerConfig}
                onTriggerTypeChange={(type) => setFormState((f) => ({ ...f, triggerType: type }))}
                onTriggerConfigChange={(config) => setFormState((f) => ({ ...f, triggerConfig: config }))}
              />
            )}

            {step === 'steps' && (
              <SOPStepBuilder
                steps={formState.steps}
                onChange={(steps) => setFormState((f) => ({ ...f, steps }))}
              />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false, mode: 'create' })}>
              Cancel
            </Button>
            {step === 'trigger' ? (
              <Button onClick={() => setStep('steps')} className="bg-[#37bd7e] hover:bg-[#2da06a]">
                Next: Steps
              </Button>
            ) : (
              <Button
                onClick={handleSave}
                disabled={isSaving || !formState.name.trim()}
                className="bg-[#37bd7e] hover:bg-[#2da06a]"
              >
                {isSaving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                {dialog.mode === 'create' ? 'Create Playbook' : 'Save Changes'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Playbook</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                if (deleteTarget) {
                  await deleteSOP.mutateAsync(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Test harness dialog */}
      {testTarget && (
        <SOPTestHarness
          sop={testTarget}
          open={!!testTarget}
          onClose={() => setTestTarget(null)}
        />
      )}
    </SettingsPageWrapper>
  );
}
