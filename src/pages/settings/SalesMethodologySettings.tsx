/**
 * SalesMethodologySettings
 *
 * Org-admin page to select, preview, and apply a sales methodology.
 * Also hosts the stage mapping editor, qualification criteria editor,
 * and custom methodology wizard.
 */

import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Eye, Loader2, Lock, Target, MessageSquare, BarChart3 } from 'lucide-react';
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
import { useAuth } from '@/lib/contexts/AuthContext';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import {
  useMethodologies,
  useAgentConfig,
  useApplyMethodology,
} from '@/lib/hooks/useAgentConfig';
import { usePendingConfigQuestions } from '@/lib/services/configQuestionService';
import { MethodologySelector } from '@/components/agent/MethodologySelector';
import { StageMappingEditor } from '@/components/agent/StageMappingEditor';
import { QualificationCriteriaEditor } from '@/components/agent/QualificationCriteriaEditor';
import { CustomMethodologyWizard } from '@/components/agent/CustomMethodologyWizard';
import { InAppQuestionCard } from '@/components/learning/InAppQuestionCard';
import { ConfigCompletenessWidget } from '@/components/learning/ConfigCompletenessWidget';

function TechnicalDiffToggle({ diff }: { diff: Array<{ key: string; oldValue: unknown; newValue: unknown }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 transition-colors"
      >
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        {open ? 'Hide' : 'Show'} technical details
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {diff.map((item) => (
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
          ))}
        </div>
      )}
    </div>
  );
}

export default function SalesMethodologySettings() {
  const orgId = useActiveOrgId();
  const { permissions } = useOrg();
  const { isPlatformAdmin } = useUserPermissions();
  const isAdmin = permissions.canManageSettings || permissions.canManageTeam || isPlatformAdmin;

  const { data: methodologies } = useMethodologies();
  const { data: config } = useAgentConfig(orgId ?? '', 'global');

  const applyMethodology = useApplyMethodology();

  const { user } = useAuth();

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showCustomWizard, setShowCustomWizard] = useState(false);

  // Methodology-category config questions
  const { data: pendingQuestions } = usePendingConfigQuestions(orgId ?? '', user?.id);
  const methodologyQuestions = (pendingQuestions ?? []).filter((q) => q.category === 'methodology');

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
      description="Tell 60 how you sell, and it'll coach you in your language."
    >
      {/* Impact cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {[
          { icon: Target, title: 'Deal Scoring', desc: '60 flags deals missing your key qualification criteria' },
          { icon: MessageSquare, title: 'Meeting Coaching', desc: 'Post-call feedback aligned to your chosen framework' },
          { icon: BarChart3, title: 'Pipeline Health', desc: 'Risk alerts weighted to what matters in your process' },
        ].map(({ icon: Icon, title, desc }) => (
          <Card key={title} className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl border-gray-200 dark:border-gray-800/60">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 shrink-0">
                <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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

          {/* Refine Your Setup — inline methodology questions */}
          {orgId && (
            <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl border-gray-200 dark:border-gray-800/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Refine Your Setup
                </CardTitle>
                <CardDescription>
                  Answer these questions to help 60 understand your sales process better.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ConfigCompletenessWidget
                  orgId={orgId}
                  userId={user?.id}
                  showCategories={false}
                  showCTA={false}
                />

                {methodologyQuestions.length > 0 ? (
                  <div className="space-y-3">
                    {methodologyQuestions.slice(0, 3).map((q) => (
                      <InAppQuestionCard key={q.id} question={q} />
                    ))}
                    {methodologyQuestions.length > 3 && (
                      <p className="text-xs text-gray-400 text-center">
                        +{methodologyQuestions.length - 3} more questions
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 py-3 px-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30 rounded-xl">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">
                      Fully configured — 60 has everything it needs for methodology coaching.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
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
            <DialogTitle>What changes when you switch to {selectedTemplate?.name}?</DialogTitle>
            <DialogDescription>
              60 will adjust how it scores deals, coaches conversations, and flags risks based on the {selectedTemplate?.name} framework.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-80 overflow-y-auto">
            {/* Qualification changes */}
            {selectedTemplate?.qualification_criteria && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl space-y-1.5">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-emerald-500" />
                  Qualification Criteria
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {Object.keys(selectedTemplate.qualification_criteria).length} criteria will be used:{' '}
                  {Object.keys(selectedTemplate.qualification_criteria)
                    .map((k) => k.replace(/_/g, ' '))
                    .map((k) => k.charAt(0).toUpperCase() + k.slice(1))
                    .join(', ')}
                </p>
              </div>
            )}

            {/* Coaching changes */}
            {selectedTemplate?.coaching_focus && Object.keys(selectedTemplate.coaching_focus).length > 0 && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl space-y-1.5">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                  Meeting Coaching
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Post-call feedback will focus on:{' '}
                  {Object.keys(selectedTemplate.coaching_focus)
                    .map((k) => k.replace(/_/g, ' '))
                    .map((k) => k.charAt(0).toUpperCase() + k.slice(1))
                    .join(', ')}
                </p>
              </div>
            )}

            {/* Stage rules */}
            {selectedTemplate?.stage_rules && Object.keys(selectedTemplate.stage_rules).length > 0 && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl space-y-1.5">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-emerald-500" />
                  Risk Scoring
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Deal progression rules will update for {Object.keys(selectedTemplate.stage_rules).length} stages
                </p>
              </div>
            )}

            {/* Technical details toggle */}
            {diff.length > 0 && (
              <TechnicalDiffToggle diff={diff} />
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
