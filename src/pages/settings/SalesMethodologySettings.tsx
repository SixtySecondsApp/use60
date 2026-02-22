/**
 * SalesMethodologySettings
 *
 * Org-admin page to select, preview, and apply a sales methodology.
 * Also hosts the stage mapping editor, qualification criteria editor,
 * and custom methodology wizard.
 */

import { useState } from 'react';
import { ChevronRight, Eye, Loader2, Lock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import {
  useMethodologies,
  useAgentConfig,
  useApplyMethodology,
} from '@/lib/hooks/useAgentConfig';
import { MethodologySelector } from '@/components/agent/MethodologySelector';
import { StageMappingEditor } from '@/components/agent/StageMappingEditor';
import { QualificationCriteriaEditor } from '@/components/agent/QualificationCriteriaEditor';
import { CustomMethodologyWizard } from '@/components/agent/CustomMethodologyWizard';

export default function SalesMethodologySettings() {
  const orgId = useActiveOrgId();
  const { permissions } = useOrg();
  const { isPlatformAdmin } = useUserPermissions();
  const isAdmin = permissions.canManageSettings || permissions.canManageTeam || isPlatformAdmin;

  const { data: methodologies } = useMethodologies();
  const { data: config } = useAgentConfig(orgId ?? '', 'global');

  const applyMethodology = useApplyMethodology();

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showCustomWizard, setShowCustomWizard] = useState(false);

  // Determine current methodology from config
  const currentMethodologyKey =
    (config?.entries?.['methodology']?.config_value as string) ?? null;

  const selectedTemplate = methodologies?.find((m) => m.methodology_key === selectedKey);
  const currentTemplate = methodologies?.find((m) => m.methodology_key === currentMethodologyKey);

  function handleSelect(key: string) {
    setSelectedKey(key);
  }

  function handlePreview() {
    if (!selectedKey) return;
    setShowPreviewDialog(true);
  }

  async function handleApply() {
    if (!selectedKey || !orgId) return;
    setShowPreviewDialog(false);
    try {
      await applyMethodology.mutateAsync({ orgId, methodologyKey: selectedKey });
      setSelectedKey(null);
    } catch {
      // error toast handled by mutation
    }
  }

  // Build diff of config keys that will change
  function buildDiff() {
    if (!selectedTemplate || !config) return [];
    const entries = config.entries ?? {};
    const newCriteria = selectedTemplate.qualification_criteria ?? {};
    const newStageRules = selectedTemplate.stage_rules ?? {};
    const changes: Array<{ key: string; oldValue: unknown; newValue: unknown }> = [];

    for (const [k, v] of Object.entries(newCriteria)) {
      changes.push({ key: `qualification.${k}`, oldValue: entries[`qualification.${k}`]?.config_value, newValue: v });
    }
    for (const [k, v] of Object.entries(newStageRules)) {
      changes.push({ key: `stage.${k}`, oldValue: entries[`stage.${k}`]?.config_value, newValue: v });
    }
    return changes.slice(0, 8);
  }

  const diff = buildDiff();
  const hasSelection = selectedKey !== null && selectedKey !== currentMethodologyKey;

  return (
    <SettingsPageWrapper
      title="Sales Methodology"
      description="Configure the sales framework your AI agent uses to qualify deals and coach reps"
    >
      <Tabs defaultValue="methodology" className="space-y-6">
        <TabsList className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl border border-gray-200 dark:border-gray-800/60">
          <TabsTrigger value="methodology">Methodology</TabsTrigger>
          <TabsTrigger value="stages">Stage Mapping</TabsTrigger>
          <TabsTrigger value="criteria">Qualification Criteria</TabsTrigger>
        </TabsList>

        {/* Methodology tab */}
        <TabsContent value="methodology" className="space-y-6">
          {/* Current methodology banner */}
          {currentTemplate && (
            <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl border-gray-200 dark:border-gray-800/60">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Current Methodology
                  </CardTitle>
                  <Badge className="bg-emerald-500 text-white">{currentTemplate.name}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {currentTemplate.description}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Read-only notice for non-admins */}
          {!isAdmin && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl text-sm text-amber-700 dark:text-amber-400">
              <Lock className="w-4 h-4 flex-shrink-0" />
              You need org admin permissions to change the sales methodology.
            </div>
          )}

          {/* Selector grid */}
          <MethodologySelector
            selected={selectedKey ?? currentMethodologyKey}
            current={currentMethodologyKey}
            onSelect={isAdmin ? handleSelect : () => {}}
            disabled={!isAdmin}
          />

          {/* Custom methodology option */}
          {isAdmin && (
            <button
              onClick={() => setShowCustomWizard(true)}
              className="w-full flex items-center justify-between p-4 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-white/50 dark:bg-gray-900/20 hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-all text-left"
            >
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Create Custom Methodology</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Fork an existing framework and tailor it to your sales process</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
          )}

          {/* Action bar */}
          {isAdmin && hasSelection && (
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setSelectedKey(null)}>
                Cancel
              </Button>
              <Button variant="outline" onClick={handlePreview}>
                <Eye className="w-4 h-4 mr-2" />
                Preview Changes
              </Button>
              <Button
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
                onClick={handleApply}
                disabled={applyMethodology.isPending}
              >
                {applyMethodology.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Apply Methodology
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Stage Mapping tab */}
        <TabsContent value="stages">
          {orgId && (
            <StageMappingEditor orgId={orgId} disabled={!isAdmin} />
          )}
        </TabsContent>

        {/* Qualification Criteria tab */}
        <TabsContent value="criteria">
          {orgId && (
            <QualificationCriteriaEditor
              orgId={orgId}
              methodologyKey={currentMethodologyKey ?? 'generic'}
              disabled={!isAdmin}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Preview dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Preview: Switch to {selectedTemplate?.name}</DialogTitle>
            <DialogDescription>
              The following config keys will be updated for your organisation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-72 overflow-y-auto">
            {diff.length === 0 ? (
              <p className="text-sm text-gray-500">No config key changes detected.</p>
            ) : (
              diff.map((item) => (
                <div
                  key={item.key}
                  className="flex items-start gap-2 text-xs bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2"
                >
                  <span className="font-mono text-gray-700 dark:text-gray-300 flex-1 truncate">{item.key}</span>
                  {item.oldValue !== undefined && (
                    <span className="text-red-500 line-through truncate max-w-[80px]">
                      {String(item.oldValue).slice(0, 20)}
                    </span>
                  )}
                  <span className="text-emerald-600 dark:text-emerald-400 truncate max-w-[80px]">
                    {String(item.newValue ?? '').slice(0, 20)}
                  </span>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreviewDialog(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
              onClick={handleApply}
              disabled={applyMethodology.isPending}
            >
              {applyMethodology.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm &amp; Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom methodology wizard */}
      {showCustomWizard && orgId && (
        <CustomMethodologyWizard
          orgId={orgId}
          onClose={() => setShowCustomWizard(false)}
        />
      )}
    </SettingsPageWrapper>
  );
}
