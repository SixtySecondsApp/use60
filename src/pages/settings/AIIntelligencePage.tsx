/**
 * AI Intelligence Settings Page
 *
 * Consolidated page for all AI context and configuration:
 * - Company Context (bio, products, competitors, industry)
 * - AI Skills (qualification, discovery, voice, objections, ICP)
 * - Writing Styles (email voice training)
 * - AI Behavior (copilot personality, coaching, call types)
 *
 * All settings are organization-level and derived from onboarding enrichment.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Building2,
  Sparkles,
  MessageSquare,
  Target,
  Users,
  Package,
  Shield,
  GitBranch,
  Database,
  PenTool,
  RefreshCw,
  Save,
  Loader2,
  ChevronDown,
  ChevronRight,
  Check,
  AlertCircle,
  Trash2,
  Plus,
  Brain,
  Zap,
  Phone,
  GraduationCap,
} from 'lucide-react';
import { useOrg } from '@/lib/contexts/OrgContext';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Types
interface EnrichmentData {
  id: string;
  company_name: string;
  description: string;
  tagline: string;
  industry: string;
  products: Array<{ name: string; description: string }>;
  competitors: Array<{ name: string; domain?: string }>;
  target_market: string;
  ideal_customer_profile: {
    companyProfile?: string;
    buyerPersona?: string;
    buyingSignals?: string[];
  };
  value_propositions: string[];
  generated_skills: Record<string, any>;
  status: string;
  updated_at: string;
}

interface OrganizationSkill {
  id: string;
  skill_id: string;
  skill_name: string;
  config: Record<string, any>;
  ai_generated: boolean;
  user_modified: boolean;
  version: number;
}

interface WritingStyle {
  id: string;
  name: string;
  tone_description: string;
  examples: string[];
  is_default: boolean;
}

// Skill definitions
const SKILL_DEFINITIONS = [
  {
    id: 'lead_qualification',
    name: 'Lead Qualification',
    icon: Target,
    description: 'Criteria for qualifying and disqualifying leads',
    fields: ['criteria', 'disqualifiers'],
  },
  {
    id: 'lead_enrichment',
    name: 'Discovery Questions',
    icon: Database,
    description: 'Questions to ask during discovery calls',
    fields: ['questions'],
  },
  {
    id: 'brand_voice',
    name: 'Writing Style',
    icon: MessageSquare,
    description: 'Tone and style for AI-generated content',
    fields: ['tone', 'avoid'],
  },
  {
    id: 'objection_handling',
    name: 'Objection Playbook',
    icon: GitBranch,
    description: 'Responses to common objections',
    fields: ['objections'],
  },
  {
    id: 'icp',
    name: 'Ideal Customer Profile',
    icon: Users,
    description: 'Target company and buyer characteristics',
    fields: ['companyProfile', 'buyerPersona', 'buyingSignals'],
  },
];

const MAX_ITEMS = 10;

export default function AIIntelligencePage() {
  const { activeOrgId, activeOrg, permissions, refreshOrgs } = useOrg();

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [enrichmentData, setEnrichmentData] = useState<EnrichmentData | null>(null);
  const [skills, setSkills] = useState<OrganizationSkill[]>([]);
  const [writingStyles, setWritingStyles] = useState<WritingStyle[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    company: true,
    skills: true,
    writing: false,
    behavior: false,
  });

  // Editable state
  const [editedBio, setEditedBio] = useState('');
  const [editedSkills, setEditedSkills] = useState<Record<string, any>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Load all data
  useEffect(() => {
    if (activeOrgId) {
      loadAllData();
    }
  }, [activeOrgId]);

  const loadAllData = async () => {
    if (!activeOrgId) return;

    setIsLoading(true);
    try {
      // Load enrichment data
      const { data: enrichment, error: enrichmentError } = await supabase
        .from('organization_enrichment')
        .select('*')
        .eq('organization_id', activeOrgId)
        .maybeSingle();

      if (enrichmentError) throw enrichmentError;
      setEnrichmentData(enrichment);
      setEditedBio(activeOrg?.company_bio || enrichment?.description || '');

      // Load skills
      const { data: skillsData, error: skillsError } = await supabase
        .from('organization_skills')
        .select('*')
        .eq('organization_id', activeOrgId)
        .eq('is_active', true);

      if (skillsError) throw skillsError;
      setSkills(skillsData || []);

      // Initialize edited skills from loaded data
      const skillConfigs: Record<string, any> = {};
      (skillsData || []).forEach((skill: OrganizationSkill) => {
        skillConfigs[skill.skill_id] = skill.config;
      });
      // Also load from enrichment if not in skills table yet
      if (enrichment?.generated_skills) {
        SKILL_DEFINITIONS.forEach(def => {
          if (!skillConfigs[def.id] && enrichment.generated_skills[def.id]) {
            skillConfigs[def.id] = enrichment.generated_skills[def.id];
          }
        });
      }
      setEditedSkills(skillConfigs);

      // Load writing styles
      const { data: stylesData, error: stylesError } = await supabase
        .from('user_writing_styles')
        .select('*')
        .order('created_at', { ascending: false });

      if (stylesError) throw stylesError;
      setWritingStyles(stylesData || []);

    } catch (error) {
      console.error('Error loading AI intelligence data:', error);
      toast.error('Failed to load AI settings');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSkillChange = (skillId: string, field: string, value: any) => {
    setEditedSkills(prev => ({
      ...prev,
      [skillId]: {
        ...prev[skillId],
        [field]: value,
      },
    }));
    setHasChanges(true);
  };

  const handleSaveAll = async () => {
    if (!activeOrgId || !permissions.canManageSettings) return;

    setIsSaving(true);
    try {
      // Save company bio to organizations table
      const { error: orgError } = await supabase
        .from('organizations')
        .update({
          company_bio: editedBio,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeOrgId);

      if (orgError) throw orgError;

      // Save each skill
      for (const [skillId, config] of Object.entries(editedSkills)) {
        const skillDef = SKILL_DEFINITIONS.find(s => s.id === skillId);
        if (!skillDef) continue;

        const { error: skillError } = await supabase.functions.invoke('save-organization-skills', {
          body: {
            action: 'save',
            organization_id: activeOrgId,
            skill: {
              skill_id: skillId,
              skill_name: skillDef.name,
              config,
            },
          },
        });

        if (skillError) throw skillError;
      }

      toast.success('AI settings saved');
      setHasChanges(false);
      await refreshOrgs();
      await loadAllData();

    } catch (error) {
      console.error('Error saving AI settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (!activeOrgId || !permissions.canManageSettings) return;

    const domain = activeOrg?.company_domain || enrichmentData?.domain;
    if (!domain) {
      toast.error('No company domain configured');
      return;
    }

    setIsRegenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('deep-enrich-organization', {
        body: {
          organizationId: activeOrgId,
          domain,
          force: true,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Enrichment failed');

      toast.success('AI regeneration complete');
      await loadAllData();

    } catch (error) {
      console.error('Error regenerating AI:', error);
      toast.error('Failed to regenerate AI settings');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleResetSkill = async (skillId: string) => {
    if (!activeOrgId || !permissions.canManageSettings) return;

    try {
      const { error } = await supabase.functions.invoke('save-organization-skills', {
        body: {
          action: 'reset',
          organization_id: activeOrgId,
          skill_id: skillId,
        },
      });

      if (error) throw error;

      toast.success('Skill reset to AI default');
      await loadAllData();

    } catch (error) {
      console.error('Error resetting skill:', error);
      toast.error('Failed to reset skill');
    }
  };

  // Render section header
  const SectionHeader = ({
    id,
    title,
    icon: Icon,
    badge
  }: {
    id: string;
    title: string;
    icon: any;
    badge?: string;
  }) => (
    <button
      onClick={() => toggleSection(id)}
      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-[#37bd7e]/10">
          <Icon className="w-5 h-5 text-[#37bd7e]" />
        </div>
        <div className="text-left">
          <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
          {badge && (
            <Badge variant="outline" className="mt-1 text-xs">
              {badge}
            </Badge>
          )}
        </div>
      </div>
      {expandedSections[id] ? (
        <ChevronDown className="w-5 h-5 text-gray-400" />
      ) : (
        <ChevronRight className="w-5 h-5 text-gray-400" />
      )}
    </button>
  );

  if (isLoading) {
    return (
      <SettingsPageWrapper
        title="AI Intelligence"
        description="Configure how AI understands and represents your business"
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-[#37bd7e]" />
        </div>
      </SettingsPageWrapper>
    );
  }

  return (
    <SettingsPageWrapper
      title="AI Intelligence"
      description="Configure how AI understands and represents your business"
    >
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {enrichmentData?.status === 'completed' && (
              <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                <Check className="w-3 h-3 mr-1" />
                AI Configured
              </Badge>
            )}
            {enrichmentData?.updated_at && (
              <span className="text-sm text-gray-500">
                Last updated: {new Date(enrichmentData.updated_at).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleRegenerate}
              disabled={isRegenerating || !permissions.canManageSettings}
            >
              {isRegenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Re-analyze Company
            </Button>
            {hasChanges && (
              <Button
                onClick={handleSaveAll}
                disabled={isSaving || !permissions.canManageSettings}
                className="bg-[#37bd7e] hover:bg-[#2da76c]"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            )}
          </div>
        </div>

        {/* Company Context Section */}
        <Card className="border border-gray-200 dark:border-gray-800 overflow-hidden">
          <SectionHeader
            id="company"
            title="Company Context"
            icon={Building2}
            badge={enrichmentData?.industry}
          />
          <AnimatePresence>
            {expandedSections.company && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-gray-200 dark:border-gray-800"
              >
                <CardContent className="p-6 space-y-6">
                  {/* Company Bio */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      About Your Company (AI Context)
                    </label>
                    <Textarea
                      value={editedBio}
                      onChange={(e) => {
                        setEditedBio(e.target.value);
                        setHasChanges(true);
                      }}
                      placeholder="Describe your company, what you do, and your value proposition..."
                      rows={4}
                      disabled={!permissions.canManageSettings}
                      className="resize-none"
                    />
                    <p className="text-xs text-gray-500">
                      This description helps AI understand your business and personalize responses.
                    </p>
                  </div>

                  {/* Products & Services */}
                  {enrichmentData?.products && enrichmentData.products.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        Products & Services
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {enrichmentData.products.map((product, i) => (
                          <Badge key={i} variant="outline" className="py-1">
                            {product.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Competitors */}
                  {enrichmentData?.competitors && enrichmentData.competitors.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        Competitors
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {enrichmentData.competitors.map((competitor, i) => (
                          <Badge key={i} variant="outline" className="py-1">
                            {competitor.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Target Market */}
                  {enrichmentData?.target_market && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Target Market
                      </label>
                      <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                        {enrichmentData.target_market}
                      </p>
                    </div>
                  )}
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* AI Skills Section */}
        <Card className="border border-gray-200 dark:border-gray-800 overflow-hidden">
          <SectionHeader
            id="skills"
            title="AI Skills"
            icon={Sparkles}
            badge={`${skills.length} configured`}
          />
          <AnimatePresence>
            {expandedSections.skills && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-gray-200 dark:border-gray-800"
              >
                <CardContent className="p-6 space-y-6">
                  {SKILL_DEFINITIONS.map((skillDef) => {
                    const skillData = editedSkills[skillDef.id] || {};
                    const savedSkill = skills.find(s => s.skill_id === skillDef.id);
                    const Icon = skillDef.icon;

                    return (
                      <div key={skillDef.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50">
                          <div className="flex items-center gap-3">
                            <Icon className="w-5 h-5 text-[#37bd7e]" />
                            <div>
                              <h4 className="font-medium text-gray-900 dark:text-white">
                                {skillDef.name}
                              </h4>
                              <p className="text-xs text-gray-500">{skillDef.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {savedSkill?.user_modified && (
                              <Badge variant="outline" className="text-xs">
                                Customized
                              </Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleResetSkill(skillDef.id)}
                              disabled={!permissions.canManageSettings}
                              className="text-gray-500 hover:text-gray-700"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="p-4 space-y-4">
                          {/* Render skill-specific fields */}
                          {skillDef.id === 'lead_qualification' && (
                            <>
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Qualifying Signals</label>
                                {(skillData.criteria || []).map((item: string, i: number) => (
                                  <div key={i} className="flex gap-2">
                                    <Textarea
                                      value={item}
                                      onChange={(e) => {
                                        const newCriteria = [...(skillData.criteria || [])];
                                        newCriteria[i] = e.target.value;
                                        handleSkillChange(skillDef.id, 'criteria', newCriteria);
                                      }}
                                      rows={2}
                                      className="flex-1 resize-none"
                                      disabled={!permissions.canManageSettings}
                                    />
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        const newCriteria = (skillData.criteria || []).filter((_: any, idx: number) => idx !== i);
                                        handleSkillChange(skillDef.id, 'criteria', newCriteria);
                                      }}
                                      disabled={!permissions.canManageSettings}
                                    >
                                      <Trash2 className="w-4 h-4 text-red-500" />
                                    </Button>
                                  </div>
                                ))}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const newCriteria = [...(skillData.criteria || []), ''];
                                    handleSkillChange(skillDef.id, 'criteria', newCriteria);
                                  }}
                                  disabled={!permissions.canManageSettings || (skillData.criteria || []).length >= MAX_ITEMS}
                                >
                                  <Plus className="w-4 h-4 mr-1" />
                                  Add Criteria
                                </Button>
                                {(skillData.criteria || []).length >= MAX_ITEMS && (
                                  <p className="text-xs text-amber-400 mt-1">Maximum {MAX_ITEMS} items</p>
                                )}
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Disqualifying Signals</label>
                                {(skillData.disqualifiers || []).map((item: string, i: number) => (
                                  <div key={i} className="flex gap-2">
                                    <Textarea
                                      value={item}
                                      onChange={(e) => {
                                        const newDisqualifiers = [...(skillData.disqualifiers || [])];
                                        newDisqualifiers[i] = e.target.value;
                                        handleSkillChange(skillDef.id, 'disqualifiers', newDisqualifiers);
                                      }}
                                      rows={2}
                                      className="flex-1 resize-none"
                                      disabled={!permissions.canManageSettings}
                                    />
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        const newDisqualifiers = (skillData.disqualifiers || []).filter((_: any, idx: number) => idx !== i);
                                        handleSkillChange(skillDef.id, 'disqualifiers', newDisqualifiers);
                                      }}
                                      disabled={!permissions.canManageSettings}
                                    >
                                      <Trash2 className="w-4 h-4 text-red-500" />
                                    </Button>
                                  </div>
                                ))}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const newDisqualifiers = [...(skillData.disqualifiers || []), ''];
                                    handleSkillChange(skillDef.id, 'disqualifiers', newDisqualifiers);
                                  }}
                                  disabled={!permissions.canManageSettings || (skillData.disqualifiers || []).length >= MAX_ITEMS}
                                >
                                  <Plus className="w-4 h-4 mr-1" />
                                  Add Disqualifier
                                </Button>
                                {(skillData.disqualifiers || []).length >= MAX_ITEMS && (
                                  <p className="text-xs text-amber-400 mt-1">Maximum {MAX_ITEMS} items</p>
                                )}
                              </div>
                            </>
                          )}

                          {skillDef.id === 'lead_enrichment' && (
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Discovery Questions</label>
                              {(skillData.questions || []).map((item: string, i: number) => (
                                <div key={i} className="flex gap-2">
                                  <Textarea
                                    value={item}
                                    onChange={(e) => {
                                      const newQuestions = [...(skillData.questions || [])];
                                      newQuestions[i] = e.target.value;
                                      handleSkillChange(skillDef.id, 'questions', newQuestions);
                                    }}
                                    rows={2}
                                    className="flex-1 resize-none"
                                    disabled={!permissions.canManageSettings}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const newQuestions = (skillData.questions || []).filter((_: any, idx: number) => idx !== i);
                                      handleSkillChange(skillDef.id, 'questions', newQuestions);
                                    }}
                                    disabled={!permissions.canManageSettings}
                                  >
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                  </Button>
                                </div>
                              ))}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const newQuestions = [...(skillData.questions || []), ''];
                                  handleSkillChange(skillDef.id, 'questions', newQuestions);
                                }}
                                disabled={!permissions.canManageSettings || (skillData.questions || []).length >= MAX_ITEMS}
                              >
                                <Plus className="w-4 h-4 mr-1" />
                                Add Question
                              </Button>
                              {(skillData.questions || []).length >= MAX_ITEMS && (
                                <p className="text-xs text-amber-400 mt-1">Maximum {MAX_ITEMS} items</p>
                              )}
                            </div>
                          )}

                          {skillDef.id === 'brand_voice' && (
                            <>
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Tone & Style</label>
                                <Textarea
                                  value={skillData.tone || ''}
                                  onChange={(e) => handleSkillChange(skillDef.id, 'tone', e.target.value)}
                                  rows={4}
                                  className="resize-none"
                                  placeholder="Describe how AI should communicate..."
                                  disabled={!permissions.canManageSettings}
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Words/Phrases to Avoid</label>
                                <div className="flex flex-wrap gap-2">
                                  {(skillData.avoid || []).map((word: string, i: number) => (
                                    <Badge key={i} variant="outline" className="py-1 pr-1">
                                      {word}
                                      <button
                                        onClick={() => {
                                          const newAvoid = (skillData.avoid || []).filter((_: any, idx: number) => idx !== i);
                                          handleSkillChange(skillDef.id, 'avoid', newAvoid);
                                        }}
                                        disabled={!permissions.canManageSettings}
                                        className="ml-1 hover:text-red-500"
                                      >
                                        ×
                                      </button>
                                    </Badge>
                                  ))}
                                  <Input
                                    placeholder="Add word..."
                                    className="w-32 h-7 text-sm"
                                    disabled={!permissions.canManageSettings || (skillData.avoid || []).length >= MAX_ITEMS}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && e.currentTarget.value) {
                                        if ((skillData.avoid || []).length >= MAX_ITEMS) return;
                                        const newAvoid = [...(skillData.avoid || []), e.currentTarget.value];
                                        handleSkillChange(skillDef.id, 'avoid', newAvoid);
                                        e.currentTarget.value = '';
                                      }
                                    }}
                                  />
                                </div>
                                {(skillData.avoid || []).length >= MAX_ITEMS && (
                                  <p className="text-xs text-amber-400 mt-1">Maximum {MAX_ITEMS} items</p>
                                )}
                              </div>
                            </>
                          )}

                          {skillDef.id === 'objection_handling' && (
                            <div className="space-y-4">
                              {(skillData.objections || []).map((obj: any, i: number) => (
                                <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium">Objection {i + 1}</label>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        const newObjections = (skillData.objections || []).filter((_: any, idx: number) => idx !== i);
                                        handleSkillChange(skillDef.id, 'objections', newObjections);
                                      }}
                                      disabled={!permissions.canManageSettings}
                                    >
                                      <Trash2 className="w-4 h-4 text-red-500" />
                                    </Button>
                                  </div>
                                  <Input
                                    value={obj.trigger || ''}
                                    onChange={(e) => {
                                      const newObjections = [...(skillData.objections || [])];
                                      newObjections[i] = { ...newObjections[i], trigger: e.target.value };
                                      handleSkillChange(skillDef.id, 'objections', newObjections);
                                    }}
                                    placeholder="When prospect says..."
                                    disabled={!permissions.canManageSettings}
                                  />
                                  <Textarea
                                    value={obj.response || ''}
                                    onChange={(e) => {
                                      const newObjections = [...(skillData.objections || [])];
                                      newObjections[i] = { ...newObjections[i], response: e.target.value };
                                      handleSkillChange(skillDef.id, 'objections', newObjections);
                                    }}
                                    rows={3}
                                    placeholder="Respond with..."
                                    className="resize-none"
                                    disabled={!permissions.canManageSettings}
                                  />
                                </div>
                              ))}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const newObjections = [...(skillData.objections || []), { trigger: '', response: '' }];
                                  handleSkillChange(skillDef.id, 'objections', newObjections);
                                }}
                                disabled={!permissions.canManageSettings || (skillData.objections || []).length >= MAX_ITEMS}
                              >
                                <Plus className="w-4 h-4 mr-1" />
                                Add Objection
                              </Button>
                              {(skillData.objections || []).length >= MAX_ITEMS && (
                                <p className="text-xs text-amber-400 mt-1">Maximum {MAX_ITEMS} items</p>
                              )}
                            </div>
                          )}

                          {skillDef.id === 'icp' && (
                            <>
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Ideal Company Profile</label>
                                <Textarea
                                  value={skillData.companyProfile || ''}
                                  onChange={(e) => handleSkillChange(skillDef.id, 'companyProfile', e.target.value)}
                                  rows={3}
                                  className="resize-none"
                                  placeholder="Describe your ideal target company..."
                                  disabled={!permissions.canManageSettings}
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Buyer Persona</label>
                                <Textarea
                                  value={skillData.buyerPersona || ''}
                                  onChange={(e) => handleSkillChange(skillDef.id, 'buyerPersona', e.target.value)}
                                  rows={3}
                                  className="resize-none"
                                  placeholder="Describe your ideal buyer..."
                                  disabled={!permissions.canManageSettings}
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Buying Signals</label>
                                <div className="flex flex-wrap gap-2">
                                  {(skillData.buyingSignals || []).map((signal: string, i: number) => (
                                    <Badge key={i} variant="outline" className="py-1 pr-1">
                                      {signal}
                                      <button
                                        onClick={() => {
                                          const newSignals = (skillData.buyingSignals || []).filter((_: any, idx: number) => idx !== i);
                                          handleSkillChange(skillDef.id, 'buyingSignals', newSignals);
                                        }}
                                        disabled={!permissions.canManageSettings}
                                        className="ml-1 hover:text-red-500"
                                      >
                                        ×
                                      </button>
                                    </Badge>
                                  ))}
                                  <Input
                                    placeholder="Add signal..."
                                    className="w-40 h-7 text-sm"
                                    disabled={!permissions.canManageSettings || (skillData.buyingSignals || []).length >= MAX_ITEMS}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && e.currentTarget.value) {
                                        if ((skillData.buyingSignals || []).length >= MAX_ITEMS) return;
                                        const newSignals = [...(skillData.buyingSignals || []), e.currentTarget.value];
                                        handleSkillChange(skillDef.id, 'buyingSignals', newSignals);
                                        e.currentTarget.value = '';
                                      }
                                    }}
                                  />
                                </div>
                                {(skillData.buyingSignals || []).length >= MAX_ITEMS && (
                                  <p className="text-xs text-amber-400 mt-1">Maximum {MAX_ITEMS} items</p>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* Writing Styles Section */}
        <Card className="border border-gray-200 dark:border-gray-800 overflow-hidden">
          <SectionHeader
            id="writing"
            title="Writing Styles"
            icon={PenTool}
            badge={`${writingStyles.length} styles`}
          />
          <AnimatePresence>
            {expandedSections.writing && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-gray-200 dark:border-gray-800"
              >
                <CardContent className="p-6">
                  {writingStyles.length > 0 ? (
                    <div className="space-y-4">
                      {writingStyles.map((style) => (
                        <div key={style.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-gray-900 dark:text-white">
                              {style.name}
                            </h4>
                            {style.is_default && (
                              <Badge className="bg-blue-500/10 text-blue-600">Default</Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                            {style.tone_description}
                          </p>
                          <p className="text-xs text-gray-500">
                            {style.examples.length} training examples
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <PenTool className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 mb-4">No writing styles configured yet</p>
                      <Button variant="outline" onClick={() => window.location.href = '/settings/ai-personalization'}>
                        Train Writing Style
                      </Button>
                    </div>
                  )}
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* AI Behavior Section */}
        <Card className="border border-gray-200 dark:border-gray-800 overflow-hidden">
          <SectionHeader
            id="behavior"
            title="AI Behavior"
            icon={Brain}
          />
          <AnimatePresence>
            {expandedSections.behavior && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-gray-200 dark:border-gray-800"
              >
                <CardContent className="p-6 space-y-4">
                  {/* Quick links to other AI settings */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <a
                      href="/settings/sales-coaching"
                      className="flex items-center gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-[#37bd7e]/50 transition-colors"
                    >
                      <GraduationCap className="w-5 h-5 text-[#37bd7e]" />
                      <div>
                        <h4 className="font-medium">Sales Coaching</h4>
                        <p className="text-xs text-gray-500">Configure coaching framework</p>
                      </div>
                    </a>
                    <a
                      href="/settings/call-types"
                      className="flex items-center gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-[#37bd7e]/50 transition-colors"
                    >
                      <Phone className="w-5 h-5 text-[#37bd7e]" />
                      <div>
                        <h4 className="font-medium">Call Types</h4>
                        <p className="text-xs text-gray-500">Manage meeting categories</p>
                      </div>
                    </a>
                    <a
                      href="/settings/follow-ups"
                      className="flex items-center gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-[#37bd7e]/50 transition-colors"
                    >
                      <Zap className="w-5 h-5 text-[#37bd7e]" />
                      <div>
                        <h4 className="font-medium">Follow-ups</h4>
                        <p className="text-xs text-gray-500">Configure AI follow-up workflows</p>
                      </div>
                    </a>
                  </div>
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* Info Section */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                How AI Intelligence Works
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                These settings are automatically generated when you complete onboarding by analyzing your company website.
                You can customize any setting to better match your sales process. Click &quot;Re-analyze Company&quot; to regenerate
                AI settings from your website.
              </p>
            </div>
          </div>
        </div>
      </div>
    </SettingsPageWrapper>
  );
}
