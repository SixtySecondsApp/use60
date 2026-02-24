/**
 * KnowledgeMemorySettings (KNW-013)
 *
 * Org admin page for configuring Knowledge & Memory features:
 * - Relationship Graph: toggle, strength weights, batch frequency
 * - Competitive Intelligence: toggle, auto-battlecard threshold, sentiment filter
 * - Pipeline Patterns: toggle, min deals, confidence threshold, expiry days
 *
 * Reads/writes via agent_config_org_overrides for 3 agent types.
 */

import { useState, useEffect } from 'react';
import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import {
  Loader2,
  Save,
  AlertCircle,
  Users,
  Swords,
  TrendingUp,
  Shield,
} from 'lucide-react';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

type BatchFrequency = 'daily' | 'weekly' | 'monthly';

interface RelationshipGraphSettings {
  enabled: boolean;
  batch_frequency: BatchFrequency;
  interaction_weight: number;
  recency_weight: number;
  sentiment_weight: number;
  deal_value_weight: number;
}

interface CompetitiveIntelSettings {
  enabled: boolean;
  auto_battlecard_threshold: number;
  extract_from_emails: boolean;
  slack_alerts: boolean;
}

interface PipelinePatternSettings {
  enabled: boolean;
  min_deals: number;
  confidence_threshold: number;
  expiry_days: number;
  include_in_briefings: boolean;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_RELATIONSHIP: RelationshipGraphSettings = {
  enabled: true,
  batch_frequency: 'weekly',
  interaction_weight: 40,
  recency_weight: 30,
  sentiment_weight: 20,
  deal_value_weight: 10,
};

const DEFAULT_COMPETITIVE: CompetitiveIntelSettings = {
  enabled: true,
  auto_battlecard_threshold: 5,
  extract_from_emails: true,
  slack_alerts: true,
};

const DEFAULT_PIPELINE: PipelinePatternSettings = {
  enabled: true,
  min_deals: 5,
  confidence_threshold: 60,
  expiry_days: 14,
  include_in_briefings: true,
};

const AGENT_TYPES = {
  relationship: 'relationship_graph',
  competitive: 'competitive_intelligence',
  pipeline: 'pipeline_patterns',
} as const;

// ============================================================================
// Component
// ============================================================================

export default function KnowledgeMemorySettings() {
  const orgId = useActiveOrgId();
  const { permissions } = useOrg();
  const { isPlatformAdmin } = useUserPermissions();
  const isAdmin = permissions.canManageSettings || permissions.canManageTeam || isPlatformAdmin;

  const [relationship, setRelationship] = useState<RelationshipGraphSettings>({ ...DEFAULT_RELATIONSHIP });
  const [competitive, setCompetitive] = useState<CompetitiveIntelSettings>({ ...DEFAULT_COMPETITIVE });
  const [pipeline, setPipeline] = useState<PipelinePatternSettings>({ ...DEFAULT_PIPELINE });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load existing org-level config from agent_config_org_overrides
  useEffect(() => {
    if (!orgId) return;

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('agent_config_org_overrides')
          .select('agent_type, config_key, config_value')
          .eq('org_id', orgId)
          .in('agent_type', [AGENT_TYPES.relationship, AGENT_TYPES.competitive, AGENT_TYPES.pipeline]);

        if (error) throw error;

        if (data && data.length > 0) {
          const relLoaded: Partial<RelationshipGraphSettings> = {};
          const compLoaded: Partial<CompetitiveIntelSettings> = {};
          const pipLoaded: Partial<PipelinePatternSettings> = {};

          for (const row of data) {
            if (row.agent_type === AGENT_TYPES.relationship) {
              (relLoaded as Record<string, unknown>)[row.config_key] = row.config_value;
            } else if (row.agent_type === AGENT_TYPES.competitive) {
              (compLoaded as Record<string, unknown>)[row.config_key] = row.config_value;
            } else if (row.agent_type === AGENT_TYPES.pipeline) {
              (pipLoaded as Record<string, unknown>)[row.config_key] = row.config_value;
            }
          }

          setRelationship((prev) => ({ ...prev, ...relLoaded }));
          setCompetitive((prev) => ({ ...prev, ...compLoaded }));
          setPipeline((prev) => ({ ...prev, ...pipLoaded }));
        }
      } catch (err) {
        console.error('[KnowledgeMemorySettings] load error:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [orgId]);

  const handleSave = async () => {
    if (!orgId || !isAdmin) return;
    setSaving(true);
    try {
      const buildRows = (agentType: string, settings: Record<string, unknown>) =>
        Object.entries(settings).map(([key, value]) => ({
          org_id: orgId,
          agent_type: agentType,
          config_key: key,
          config_value: value,
        }));

      const rows = [
        ...buildRows(AGENT_TYPES.relationship, relationship as unknown as Record<string, unknown>),
        ...buildRows(AGENT_TYPES.competitive, competitive as unknown as Record<string, unknown>),
        ...buildRows(AGENT_TYPES.pipeline, pipeline as unknown as Record<string, unknown>),
      ];

      const { error } = await supabase
        .from('agent_config_org_overrides')
        .upsert(rows, { onConflict: 'org_id,agent_type,config_key', ignoreDuplicates: false });

      if (error) throw error;
      toast.success('Knowledge & Memory settings saved');
    } catch (err) {
      console.error('[KnowledgeMemorySettings] save error:', err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <SettingsPageWrapper
        title="Knowledge & Memory"
        description="Configure relationship mapping, competitive intelligence, and pipeline pattern detection."
      >
        <div className="flex items-center gap-3 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">You need org admin permissions to manage Knowledge & Memory settings.</p>
        </div>
      </SettingsPageWrapper>
    );
  }

  return (
    <SettingsPageWrapper
      title="Knowledge & Memory"
      description="Configure relationship mapping, competitive intelligence, and pipeline pattern detection."
    >
      <div className="space-y-8">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* ============================================================ */}
            {/* Relationship Graph */}
            {/* ============================================================ */}
            <section>
              <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/40">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'h-10 w-10 rounded-xl flex items-center justify-center',
                        relationship.enabled
                          ? 'bg-purple-600 dark:bg-purple-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                      )}>
                        <Users className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Relationship Graph</CardTitle>
                        <CardDescription>
                          Map contact relationships, detect warm intro paths, and track connection strength
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {relationship.enabled && (
                        <Badge className="text-xs px-2 py-0.5 h-5 bg-purple-600 text-white dark:bg-purple-500">
                          Active
                        </Badge>
                      )}
                      <Switch
                        checked={relationship.enabled}
                        onCheckedChange={(checked) => setRelationship((prev) => ({ ...prev, enabled: checked }))}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Batch Frequency */}
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex-1">
                      <Label className="text-sm font-medium text-gray-900 dark:text-white">
                        Batch Recalculation
                      </Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        How often to recalculate all relationship strength scores
                      </p>
                    </div>
                    <Select
                      value={relationship.batch_frequency}
                      onValueChange={(v) => setRelationship((prev) => ({ ...prev, batch_frequency: v as BatchFrequency }))}
                    >
                      <SelectTrigger className="h-9 w-[160px] text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="border-t border-gray-100 dark:border-gray-800" />

                  {/* Strength Weights */}
                  <div>
                    <Label className="text-sm font-medium text-gray-900 dark:text-white">
                      Strength Weights
                    </Label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-4">
                      Adjust how different factors contribute to relationship strength scoring (must total 100)
                    </p>
                    <div className="space-y-4">
                      {([
                        { key: 'interaction_weight' as const, label: 'Interactions', color: 'text-blue-500' },
                        { key: 'recency_weight' as const, label: 'Recency', color: 'text-green-500' },
                        { key: 'sentiment_weight' as const, label: 'Sentiment', color: 'text-amber-500' },
                        { key: 'deal_value_weight' as const, label: 'Deal Value', color: 'text-purple-500' },
                      ]).map(({ key, label, color }) => (
                        <div key={key} className="flex items-center gap-4">
                          <span className={`text-sm w-24 ${color}`}>{label}</span>
                          <Slider
                            value={[relationship[key]]}
                            onValueChange={([v]) => setRelationship((prev) => ({ ...prev, [key]: v }))}
                            min={0}
                            max={100}
                            step={5}
                            className="flex-1"
                          />
                          <span className="text-sm font-semibold tabular-nums w-10 text-right">
                            {relationship[key]}%
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* Weight total indicator */}
                    {(() => {
                      const total = relationship.interaction_weight + relationship.recency_weight + relationship.sentiment_weight + relationship.deal_value_weight;
                      return (
                        <div className={cn(
                          'flex items-center gap-2 mt-3 p-2 rounded-lg text-xs',
                          total === 100
                            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                        )}>
                          <span>Total: {total}%</span>
                          {total !== 100 && <span>(must equal 100%)</span>}
                        </div>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* ============================================================ */}
            {/* Competitive Intelligence */}
            {/* ============================================================ */}
            <section>
              <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/40">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'h-10 w-10 rounded-xl flex items-center justify-center',
                        competitive.enabled
                          ? 'bg-red-600 dark:bg-red-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                      )}>
                        <Swords className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Competitive Intelligence</CardTitle>
                        <CardDescription>
                          Extract competitor mentions from meetings, track win/loss rates, and generate battlecards
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {competitive.enabled && (
                        <Badge className="text-xs px-2 py-0.5 h-5 bg-red-600 text-white dark:bg-red-500">
                          Active
                        </Badge>
                      )}
                      <Switch
                        checked={competitive.enabled}
                        onCheckedChange={(checked) => setCompetitive((prev) => ({ ...prev, enabled: checked }))}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Auto-Battlecard Threshold */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium text-gray-900 dark:text-white">
                          Auto-Battlecard Threshold
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Minimum mentions before AI generates a battlecard for a competitor
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums min-w-[3rem] text-right">
                          {competitive.auto_battlecard_threshold}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          <Shield className="h-3 w-3 mr-0.5" />
                          mentions
                        </Badge>
                      </div>
                    </div>
                    <Slider
                      value={[competitive.auto_battlecard_threshold]}
                      onValueChange={([v]) => setCompetitive((prev) => ({ ...prev, auto_battlecard_threshold: v }))}
                      min={3}
                      max={25}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>3 (aggressive)</span>
                      <span>25 (conservative)</span>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 dark:border-gray-800" />

                  {/* Extract from Emails */}
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex-1">
                      <Label className="text-sm font-medium text-gray-900 dark:text-white">
                        Extract from Emails
                      </Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Also detect competitor mentions in email signals (in addition to meetings)
                      </p>
                    </div>
                    <Switch
                      checked={competitive.extract_from_emails}
                      onCheckedChange={(checked) => setCompetitive((prev) => ({ ...prev, extract_from_emails: checked }))}
                    />
                  </div>

                  <div className="border-t border-gray-100 dark:border-gray-800" />

                  {/* Slack Alerts */}
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex-1">
                      <Label className="text-sm font-medium text-gray-900 dark:text-white">
                        Slack Alerts
                      </Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Send Slack notifications when competitors are mentioned in deals
                      </p>
                    </div>
                    <Switch
                      checked={competitive.slack_alerts}
                      onCheckedChange={(checked) => setCompetitive((prev) => ({ ...prev, slack_alerts: checked }))}
                    />
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* ============================================================ */}
            {/* Pipeline Pattern Detection */}
            {/* ============================================================ */}
            <section>
              <Card className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/40">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'h-10 w-10 rounded-xl flex items-center justify-center',
                        pipeline.enabled
                          ? 'bg-blue-600 dark:bg-blue-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                      )}>
                        <TrendingUp className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Pipeline Pattern Detection</CardTitle>
                        <CardDescription>
                          Detect bottlenecks, velocity anomalies, and engagement correlations across your pipeline
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {pipeline.enabled && (
                        <Badge className="text-xs px-2 py-0.5 h-5 bg-blue-600 text-white dark:bg-blue-500">
                          Active
                        </Badge>
                      )}
                      <Switch
                        checked={pipeline.enabled}
                        onCheckedChange={(checked) => setPipeline((prev) => ({ ...prev, enabled: checked }))}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Min Deals */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium text-gray-900 dark:text-white">
                          Minimum Deals for Pattern
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Require at least this many deals in a stage before detecting patterns
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">
                        {pipeline.min_deals}
                      </span>
                    </div>
                    <Slider
                      value={[pipeline.min_deals]}
                      onValueChange={([v]) => setPipeline((prev) => ({ ...prev, min_deals: v }))}
                      min={3}
                      max={20}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  <div className="border-t border-gray-100 dark:border-gray-800" />

                  {/* Confidence Threshold */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium text-gray-900 dark:text-white">
                          Confidence Threshold
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Only surface patterns with confidence above this percentage
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">
                        {pipeline.confidence_threshold}%
                      </span>
                    </div>
                    <Slider
                      value={[pipeline.confidence_threshold]}
                      onValueChange={([v]) => setPipeline((prev) => ({ ...prev, confidence_threshold: v }))}
                      min={30}
                      max={95}
                      step={5}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>30% (more patterns)</span>
                      <span>95% (fewer, high confidence)</span>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 dark:border-gray-800" />

                  {/* Expiry Days */}
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex-1">
                      <Label className="text-sm font-medium text-gray-900 dark:text-white">
                        Pattern Expiry
                      </Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Auto-expire patterns older than this many days
                      </p>
                    </div>
                    <Select
                      value={String(pipeline.expiry_days)}
                      onValueChange={(v) => setPipeline((prev) => ({ ...prev, expiry_days: Number(v) }))}
                    >
                      <SelectTrigger className="h-9 w-[140px] text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="14">14 days</SelectItem>
                        <SelectItem value="21">21 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="border-t border-gray-100 dark:border-gray-800" />

                  {/* Include in Briefings */}
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex-1">
                      <Label className="text-sm font-medium text-gray-900 dark:text-white">
                        Include in Briefings
                      </Label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Surface pipeline pattern insights in daily morning briefings
                      </p>
                    </div>
                    <Switch
                      checked={pipeline.include_in_briefings}
                      onCheckedChange={(checked) => setPipeline((prev) => ({ ...prev, include_in_briefings: checked }))}
                    />
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Save Button */}
            <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-gray-800">
              <Button onClick={handleSave} disabled={saving || !isAdmin}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Settings
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </SettingsPageWrapper>
  );
}
