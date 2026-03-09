import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { AIProviderService } from '@/lib/services/aiProvider';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { Key, Sparkles, Settings, Save, CheckCircle, AlertCircle, Info, FileText, Download, Upload, Eye, Copy, RotateCcw, HelpCircle, Brain, RefreshCw, Building2, Globe, Package, Users } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import AIProviderSettings from '@/components/settings/AIProviderSettings';
import { 
  getProposalModelSettings, 
  saveProposalModelSettings,
  getProposalTemplates,
  updateProposalTemplate,
  type ProposalTemplate
} from '@/lib/services/proposalService';

// Feature keys for AI model configuration
const FEATURE_KEYS = {
  MEETING_TASK_EXTRACTION: 'meeting_task_extraction',
  MEETING_SENTIMENT: 'meeting_sentiment',
  PROPOSAL_GENERATION: 'proposal_generation',
  MEETING_SUMMARY: 'meeting_summary',
} as const;

const FEATURE_LABELS: Record<string, string> = {
  [FEATURE_KEYS.MEETING_TASK_EXTRACTION]: 'Meeting Task Extraction',
  [FEATURE_KEYS.MEETING_SENTIMENT]: 'Sentiment Analysis',
  [FEATURE_KEYS.PROPOSAL_GENERATION]: 'Proposal Generation',
  [FEATURE_KEYS.MEETING_SUMMARY]: 'Meeting Summary',
};

const PROVIDERS = ['openai', 'anthropic', 'openrouter', 'gemini'] as const;

interface FeatureModelConfig {
  feature_key: string;
  provider: string;
  model: string;
  temperature: number;
  max_tokens: number;
  is_enabled: boolean;
}

interface ModelOption {
  value: string;
  label: string;
}

interface ProposalModelSettings {
  sow_model: string;
  proposal_model: string;
  focus_model: string;
  goals_model: string;
}

export default function AISettings() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [featureConfigs, setFeatureConfigs] = useState<Record<string, FeatureModelConfig>>({});
  const [availableModels, setAvailableModels] = useState<Record<string, ModelOption[]>>({});
  const [proposalModelSettings, setProposalModelSettings] = useState<ProposalModelSettings>({
    sow_model: 'anthropic/claude-3-5-sonnet-20241022',
    proposal_model: 'anthropic/claude-3-5-sonnet-20241022',
    focus_model: 'anthropic/claude-haiku-4.5',
    goals_model: 'anthropic/claude-3-5-sonnet-20241022',
  });
  const [openRouterModels, setOpenRouterModels] = useState<ModelOption[]>([]);
  const [proposalTemplates, setProposalTemplates] = useState<Record<string, ProposalTemplate>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingProposalModels, setSavingProposalModels] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('api-keys');
  const [expandedTemplates, setExpandedTemplates] = useState<Record<string, boolean>>({
    sow: true,
    proposal: false,
    design_system: false,
  });

  // Sales Assistant tab state
  const activeOrgId = useActiveOrgId();
  const [enrichmentData, setEnrichmentData] = useState<{
    id: string;
    domain: string;
    status: string;
    company_name: string | null;
    industry: string | null;
    products: string[] | null;
    competitors: string[] | null;
    updated_at: string;
  } | null>(null);
  const [loadingEnrichment, setLoadingEnrichment] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeProgress, setReanalyzeProgress] = useState<string>('');

  const aiProviderService = AIProviderService.getInstance();

  useEffect(() => {
    initializeSettings();
  }, []);

  // Fetch enrichment data when Sales Assistant tab is selected
  useEffect(() => {
    if (activeTab === 'sales-assistant' && activeOrgId) {
      fetchEnrichmentData();
    }
  }, [activeTab, activeOrgId]);

  const fetchEnrichmentData = async () => {
    if (!activeOrgId) return;

    setLoadingEnrichment(true);
    try {
      const { data, error } = await supabase
        .from('organization_enrichment')
        .select('id, domain, status, company_name, industry, products, competitors, updated_at')
        .eq('organization_id', activeOrgId)
        .maybeSingle();

      if (error) throw error;
      setEnrichmentData(data);
    } catch (error) {
      console.error('Error fetching enrichment data:', error);
    } finally {
      setLoadingEnrichment(false);
    }
  };

  const handleReanalyze = async () => {
    if (!activeOrgId || !enrichmentData?.domain) {
      toast.error('No company data to re-analyze');
      return;
    }

    setReanalyzing(true);
    setReanalyzeProgress('Starting re-analysis...');

    try {
      // Call the edge function with force flag
      const response = await supabase.functions.invoke('deep-enrich-organization', {
        body: {
          action: 'start',
          organization_id: activeOrgId,
          domain: enrichmentData.domain,
          force: true,
        },
      });

      if (response.error) throw response.error;
      if (!response.data?.success) throw new Error(response.data?.error || 'Failed to start re-analysis');

      // Start polling for status
      pollReanalyzeStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to re-analyze';
      toast.error(message);
      setReanalyzing(false);
      setReanalyzeProgress('');
    }
  };

  const pollReanalyzeStatus = async () => {
    const poll = async () => {
      if (!activeOrgId) return;

      try {
        const response = await supabase.functions.invoke('deep-enrich-organization', {
          body: {
            action: 'status',
            organization_id: activeOrgId,
          },
        });

        if (response.error) throw response.error;

        const { status, enrichment } = response.data;

        if (status === 'scraping') {
          setReanalyzeProgress('Scraping website data...');
          setTimeout(poll, 2000);
        } else if (status === 'analyzing') {
          setReanalyzeProgress('Analyzing company data...');
          setTimeout(poll, 2000);
        } else if (status === 'completed' && enrichment) {
          setEnrichmentData({
            id: enrichment.id,
            domain: enrichment.domain,
            status: enrichment.status,
            company_name: enrichment.company_name,
            industry: enrichment.industry,
            products: enrichment.products,
            competitors: enrichment.competitors,
            updated_at: enrichment.updated_at,
          });
          setReanalyzing(false);
          setReanalyzeProgress('');
          toast.success('Company data re-analyzed successfully!');
        } else if (status === 'failed') {
          throw new Error(enrichment?.error_message || 'Re-analysis failed');
        } else {
          setTimeout(poll, 2000);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to check status';
        toast.error(message);
        setReanalyzing(false);
        setReanalyzeProgress('');
      }
    };

    poll();
  };

  const initializeSettings = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to access AI settings');
        return;
      }

      setUserId(user.id);
      await aiProviderService.initialize(user.id);

      // Load user's feature settings
      await loadFeatureSettings(user.id);

      // Load available models for each provider
      await loadAvailableModels();

      // Load proposal model settings
      await loadProposalModelSettings();

      // Load proposal templates
      await loadProposalTemplates();
    } catch (error) {
      console.error('Error initializing AI settings:', error);
      toast.error('Failed to load AI settings');
    } finally {
      setLoading(false);
    }
  };

  const loadFeatureSettings = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_ai_feature_settings')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      const configs: Record<string, FeatureModelConfig> = {};
      
      // Initialize defaults for each feature
      Object.values(FEATURE_KEYS).forEach(featureKey => {
        const existing = data?.find(c => c.feature_key === featureKey);
        if (existing) {
          configs[featureKey] = {
            feature_key: existing.feature_key,
            provider: existing.provider,
            model: existing.model,
            temperature: existing.temperature,
            max_tokens: existing.max_tokens,
            is_enabled: existing.is_enabled,
          };
        } else {
          // Set defaults based on system config or hardcoded defaults
          configs[featureKey] = {
            feature_key: featureKey,
            provider: 'anthropic', // Default provider
            model: getDefaultModel(featureKey),
            temperature: 0.7,
            max_tokens: 2048,
            is_enabled: true,
          };
        }
      });

      setFeatureConfigs(configs);
    } catch (error) {
      console.error('Error loading feature settings:', error);
      toast.error('Failed to load feature settings');
    }
  };

  const getDefaultModel = (featureKey: string): string => {
    // Default models based on feature
    const defaults: Record<string, string> = {
      [FEATURE_KEYS.MEETING_TASK_EXTRACTION]: 'claude-haiku-4-5-20250514',
      [FEATURE_KEYS.MEETING_SENTIMENT]: 'claude-haiku-4-5-20250514',
      [FEATURE_KEYS.PROPOSAL_GENERATION]: 'claude-3-5-sonnet-20241022',
      [FEATURE_KEYS.MEETING_SUMMARY]: 'claude-haiku-4-5-20250514',
    };
    return defaults[featureKey] || 'claude-haiku-4-5-20250514';
  };

  const loadAvailableModels = async () => {
    try {
      const models: Record<string, ModelOption[]> = {};
      
      for (const provider of PROVIDERS) {
        try {
          const providerModels = await aiProviderService.fetchModelsForProvider(provider);
          models[provider] = providerModels;
        } catch (error) {
          console.warn(`Failed to load models for ${provider}:`, error);
          // Set fallback models
          models[provider] = getFallbackModels(provider);
        }
      }

      setAvailableModels(models);
    } catch (error) {
      console.error('Error loading available models:', error);
    }
  };

  const getFallbackModels = (provider: string): ModelOption[] => {
    const fallbacks: Record<string, ModelOption[]> = {
      openai: [
        { value: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo' },
        { value: 'gpt-4', label: 'GPT-4' },
        { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
      ],
      anthropic: [
        { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
        { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
        { value: 'claude-haiku-4-5-20250514', label: 'Claude Haiku 4.5' },
      ],
      openrouter: [
        { value: 'anthropic/claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (via OpenRouter)' },
        { value: 'openai/gpt-4-turbo-preview', label: 'GPT-4 Turbo (via OpenRouter)' },
      ],
      gemini: [
        { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (Recommended)' },
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
        { value: 'gemini-1.5-pro-latest', label: 'Gemini 1.5 Pro' },
      ],
    };
    return fallbacks[provider] || [];
  };

  const loadProposalModelSettings = async () => {
    try {
      const settings = await getProposalModelSettings();
      setProposalModelSettings(settings);

      // Load OpenRouter models for proposal settings
      try {
        const models = await aiProviderService.fetchOpenRouterModels(true);
        setOpenRouterModels(models);
      } catch (error) {
        console.warn('Failed to load OpenRouter models:', error);
        setOpenRouterModels([
          { value: 'anthropic/claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
          { value: 'anthropic/claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
          { value: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5' },
          { value: 'openai/gpt-4o', label: 'GPT-4o' },
          { value: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo' },
        ]);
      }
    } catch (error) {
      console.error('Error loading proposal model settings:', error);
      toast.error('Failed to load proposal model settings');
    }
  };

  const loadProposalTemplates = async () => {
    try {
      const templates = await getProposalTemplates();
      const templatesMap: Record<string, ProposalTemplate> = {};
      templates.forEach(template => {
        templatesMap[template.type] = template;
      });
      setProposalTemplates(templatesMap);
    } catch (error) {
      console.error('Error loading proposal templates:', error);
      toast.error('Failed to load proposal templates');
    }
  };

  const saveProposalSettings = async () => {
    setSavingProposalModels(true);
    try {
      const success = await saveProposalModelSettings(proposalModelSettings);
      if (success) {
        toast.success('Proposal model settings saved successfully');
      } else {
        toast.error('Failed to save proposal model settings');
      }
    } catch (error) {
      console.error('Error saving proposal model settings:', error);
      toast.error('Failed to save proposal model settings');
    } finally {
      setSavingProposalModels(false);
    }
  };

  const handleTemplateChange = (type: string, content: string) => {
    setProposalTemplates(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        content,
      } as ProposalTemplate,
    }));
  };

  const saveTemplate = async (type: string) => {
    const template = proposalTemplates[type];
    if (!template) return;

    setSavingTemplate(type);
    try {
      const success = await updateProposalTemplate(template.id, {
        name: template.name,
        content: template.content,
        is_default: template.is_default,
      });

      if (success) {
        toast.success(`${getTemplateLabel(type)} saved successfully`);
      } else {
        toast.error(`Failed to save ${getTemplateLabel(type)}`);
      }
    } catch (error) {
      console.error(`Error saving template ${type}:`, error);
      toast.error(`Failed to save ${getTemplateLabel(type)}`);
    } finally {
      setSavingTemplate(null);
    }
  };

  const getTemplateLabel = (type: string): string => {
    const labels: Record<string, string> = {
      sow: 'SOW Example',
      proposal: 'HTML Example',
      design_system: 'Style Prompt',
    };
    return labels[type] || type;
  };

  const getTemplateDescription = (type: string): string => {
    const descriptions: Record<string, string> = {
      sow: 'This template shows the AI how to format a professional Statement of Work in Markdown format.',
      proposal: 'This HTML example serves as a reference for generating interactive HTML proposal presentations.',
      design_system: 'Design system guidelines that define brand colors, typography, and component styles for proposals.',
    };
    return descriptions[type] || '';
  };

  // Starter templates (simplified versions users can load)
  const getStarterTemplate = (type: string): string => {
    const starters: Record<string, string> = {
      sow: `# Statement of Work

## Introduction
This Statement of Work outlines the scope, deliverables, and terms for [Project Name] between [Your Company] and [Client Company].

## Project Objectives
- Primary objective description
- Secondary objectives

## Scope of Work

### Phase 1: Discovery & Planning
**Duration**: 2 weeks
**Deliverables**:
- Requirements documentation
- Project roadmap
- Technical specifications

### Phase 2: Development
**Duration**: 6 weeks
**Deliverables**:
- [List deliverables]

## Timeline
- **Start Date**: [Date]
- **Completion Date**: [Date]

## Pricing
- **Total Project Cost**: $XX,XXX
- **Payment Terms**: [Terms]

## Terms & Conditions
[Your standard terms]`,
      proposal: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proposal - [Client Name]</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      font-family: 'Inter', sans-serif;
    }
    .glass-card {
      background: rgba(30, 41, 59, 0.8);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(148, 163, 184, 0.1);
    }
    .slide {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  </style>
</head>
<body class="text-gray-100">
  <section class="slide">
    <div class="glass-card rounded-2xl p-12 max-w-4xl mx-auto text-center">
      <h1 class="text-5xl font-bold mb-4">Your Proposal Title</h1>
      <p class="text-xl text-gray-400">Prepared for [Client Name]</p>
    </div>
  </section>
  
  <section class="slide">
    <div class="glass-card rounded-2xl p-12 max-w-4xl mx-auto">
      <h2 class="text-3xl font-bold mb-6">The Opportunity</h2>
      <p class="text-lg text-gray-300">Description of the client's situation...</p>
    </div>
  </section>
</body>
</html>`,
      design_system: `# Design System Guidelines

## Brand Colors
- **Primary**: #3DA8F4 (Blue)
- **Success**: #10B981 (Emerald)
- **Background**: #030712 (Dark)
- **Surface**: #111827 (Card background)

## Typography
- **Font**: Inter, system-ui, sans-serif
- **H1**: 2.25rem (36px) - Main titles
- **H2**: 1.5rem (24px) - Section headers
- **Body**: 1rem (16px) - Main content

## Components
- **Glass Cards**: rgba(17, 24, 39, 0.8) with backdrop-filter: blur(12px)
- **Buttons**: Rounded-lg with smooth transitions
- **Spacing**: 4px base unit (p-4 = 16px)`,
    };
    return starters[type] || '';
  };

  const loadStarterTemplate = (type: string) => {
    const starter = getStarterTemplate(type);
    if (starter) {
      handleTemplateChange(type, starter);
      toast.success(`${getTemplateLabel(type)} starter template loaded`);
    }
  };

  const exportTemplate = (type: string) => {
    const template = proposalTemplates[type];
    if (!template) return;

    const dataStr = JSON.stringify({ type, content: template.content, name: template.name }, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${type}-template.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`${getTemplateLabel(type)} exported`);
  };

  const importTemplate = async (type: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (data.content) {
        handleTemplateChange(type, data.content);
        toast.success(`${getTemplateLabel(type)} imported successfully`);
      } else {
        toast.error('Invalid template file format');
      }
    } catch (error) {
      console.error('Error importing template:', error);
      toast.error('Failed to import template');
    }
    
    // Reset input
    event.target.value = '';
  };

  const copyTemplate = (type: string) => {
    const template = proposalTemplates[type];
    if (template?.content) {
      navigator.clipboard.writeText(template.content);
      toast.success(`${getTemplateLabel(type)} copied to clipboard`);
    }
  };

  const toggleTemplateExpanded = (type: string) => {
    setExpandedTemplates(prev => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  const updateFeatureConfig = (featureKey: string, updates: Partial<FeatureModelConfig>) => {
    setFeatureConfigs(prev => ({
      ...prev,
      [featureKey]: {
        ...prev[featureKey],
        ...updates,
      },
    }));
  };

  const handleProviderChange = async (featureKey: string, provider: string) => {
    updateFeatureConfig(featureKey, { provider });
    
    // Update model to first available model for the provider
    const models = availableModels[provider] || [];
    if (models.length > 0) {
      updateFeatureConfig(featureKey, { model: models[0].value });
    }
  };

  const saveFeatureSettings = async () => {
    if (!userId) {
      toast.error('Please sign in to save settings');
      return;
    }

    setSaving(true);
    try {
      const configsToSave = Object.values(featureConfigs);

      for (const config of configsToSave) {
        const { error } = await supabase
          .from('user_ai_feature_settings')
          .upsert({
            user_id: userId,
            feature_key: config.feature_key,
            provider: config.provider,
            model: config.model,
            temperature: config.temperature,
            max_tokens: config.max_tokens,
            is_enabled: config.is_enabled,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,feature_key',
          });

        if (error) throw error;
      }

      toast.success('AI settings saved successfully');
    } catch (error) {
      console.error('Error saving feature settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-purple-500/20 rounded-lg">
          <Sparkles className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">AI Settings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure AI providers, models, and feature-specific settings
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white border border-transparent shadow-sm dark:bg-gray-900/50 dark:backdrop-blur-xl dark:border-gray-800/50">
          <TabsTrigger value="api-keys" className="flex items-center gap-2">
            <Key className="w-4 h-4" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="proposals" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Proposal Generation
          </TabsTrigger>
          <TabsTrigger value="task-sync" className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Task Auto-Sync
          </TabsTrigger>
          <TabsTrigger value="sales-assistant" className="flex items-center gap-2">
            <Brain className="w-4 h-4" />
            Sales Assistant
          </TabsTrigger>
        </TabsList>

        <TabsContent value="api-keys" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>API Key Management</CardTitle>
              <CardDescription>
                Configure API keys for AI providers. Keys are encrypted and stored securely.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AIProviderSettings />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="proposals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Proposal Generation Models</CardTitle>
              <CardDescription>
                Configure AI models for different proposal generation steps. These models are used when generating proposals from meeting transcripts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="proposal-sow-model">SOW Generation Model</Label>
                  <Select
                    value={proposalModelSettings.sow_model}
                    onValueChange={(value) => setProposalModelSettings(prev => ({ ...prev, sow_model: value }))}
                  >
                    <SelectTrigger id="proposal-sow-model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {openRouterModels.map(model => (
                        <SelectItem key={model.value} value={model.value}>
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">Used for generating Statement of Work documents</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="proposal-proposal-model">Proposal Model</Label>
                  <Select
                    value={proposalModelSettings.proposal_model}
                    onValueChange={(value) => setProposalModelSettings(prev => ({ ...prev, proposal_model: value }))}
                  >
                    <SelectTrigger id="proposal-proposal-model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {openRouterModels.map(model => (
                        <SelectItem key={model.value} value={model.value}>
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">Used for generating final proposal documents</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="proposal-focus-model">Focus Areas Model</Label>
                  <Select
                    value={proposalModelSettings.focus_model}
                    onValueChange={(value) => setProposalModelSettings(prev => ({ ...prev, focus_model: value }))}
                  >
                    <SelectTrigger id="proposal-focus-model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {openRouterModels.map(model => (
                        <SelectItem key={model.value} value={model.value}>
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">Used for analyzing focus areas from transcripts (faster model recommended)</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="proposal-goals-model">Goals Model</Label>
                  <Select
                    value={proposalModelSettings.goals_model}
                    onValueChange={(value) => setProposalModelSettings(prev => ({ ...prev, goals_model: value }))}
                  >
                    <SelectTrigger id="proposal-goals-model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {openRouterModels.map(model => (
                        <SelectItem key={model.value} value={model.value}>
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">Used for extracting goals and objectives from meetings</p>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button
                  onClick={saveProposalSettings}
                  disabled={savingProposalModels}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {savingProposalModels ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Proposal Settings
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Template Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Proposal Templates & Examples</CardTitle>
              <CardDescription>
                Configure templates and examples that guide the AI in generating proposals. These serve as references for structure, formatting, and styling.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Quick Start Guide */}
              <Card className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border-purple-200 dark:border-purple-800">
                <CardContent className="pt-6">
                  <div className="flex gap-3">
                    <Info className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                    <div className="space-y-2">
                      <h3 className="font-medium text-purple-800 dark:text-purple-100">Quick Start Guide</h3>
                      <p className="text-sm text-purple-700 dark:text-purple-300">
                        New to templates? Here's the easiest way to get started:
                      </p>
                      <ol className="text-sm text-purple-700 dark:text-purple-300 list-decimal list-inside space-y-1 ml-2">
                        <li><strong>Click "Starter"</strong> to load a basic template for each type</li>
                        <li><strong>Customize</strong> the template with your own content and examples</li>
                        <li><strong>Use "Preview"</strong> to see how it will look (HTML templates open in a new window)</li>
                        <li><strong>Save</strong> when you're happy with your template</li>
                      </ol>
                      <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
                        💡 Tip: You can also <strong>Import</strong> templates from files or <strong>Export</strong> to share with your team
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {/* SOW Template */}
              {proposalTemplates.sow && (
                <div className="space-y-3 border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleTemplateExpanded('sow')}
                        className="text-sm font-semibold hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                      >
                        SOW Example
                      </button>
                      <Dialog>
                        <DialogTrigger asChild>
                          <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                            <HelpCircle className="w-4 h-4 text-gray-400" />
                          </button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>SOW Template Guide</DialogTitle>
                            <DialogDescription>
                              {getTemplateDescription('sow')}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 mt-4">
                            <div>
                              <h4 className="font-semibold mb-2">Tips:</h4>
                              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                <li>Use clear section headers (Introduction, Scope, Deliverables, Timeline, Pricing)</li>
                                <li>Include example pricing structures and payment terms</li>
                                <li>Show how to format project phases and milestones</li>
                                <li>Demonstrate professional legal/terms language</li>
                              </ul>
                            </div>
                            <div>
                              <h4 className="font-semibold mb-2">Example Structure:</h4>
                              <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs overflow-x-auto">
{`# Statement of Work
## Introduction
## Project Objectives
## Scope of Work
  ### Phase 1: Discovery
  ### Phase 2: Development
## Timeline
## Pricing
## Terms & Conditions`}
                              </pre>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => loadStarterTemplate('sow')}
                        variant="outline"
                        size="sm"
                        title="Load starter template"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Starter
                      </Button>
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept=".json"
                          className="hidden"
                          onChange={(e) => importTemplate('sow', e)}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          title="Import template"
                        >
                          <span>
                            <Upload className="w-3 h-3 mr-1" />
                            Import
                          </span>
                        </Button>
                      </label>
                      <Button
                        onClick={() => exportTemplate('sow')}
                        variant="outline"
                        size="sm"
                        title="Export template"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        Export
                      </Button>
                      <Button
                        onClick={() => copyTemplate('sow')}
                        variant="outline"
                        size="sm"
                        title="Copy to clipboard"
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copy
                      </Button>
                      {proposalTemplates.sow.content && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              title="Preview template"
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              Preview
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>SOW Template Preview</DialogTitle>
                              <DialogDescription>
                                This is how your SOW template will look when rendered
                              </DialogDescription>
                            </DialogHeader>
                            <div className="mt-4 prose prose-invert max-w-none bg-gray-900/50 rounded-lg p-6 border border-gray-800">
                              <pre className="whitespace-pre-wrap font-sans text-gray-300 text-sm">
                                {proposalTemplates.sow.content}
                              </pre>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                      <Button
                        onClick={() => saveTemplate('sow')}
                        disabled={savingTemplate === 'sow'}
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        {savingTemplate === 'sow' ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-3 h-3 mr-2" />
                            Save
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500">{getTemplateDescription('sow')}</p>
                  {expandedTemplates.sow && (
                    <Textarea
                      id="sow-template"
                      value={proposalTemplates.sow.content || ''}
                      onChange={(e) => handleTemplateChange('sow', e.target.value)}
                      className="font-mono text-sm min-h-[300px]"
                      placeholder="Enter SOW template example..."
                    />
                  )}
                </div>
              )}

              {/* HTML Proposal Template */}
              {proposalTemplates.proposal && (
                <div className="space-y-3 border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleTemplateExpanded('proposal')}
                        className="text-sm font-semibold hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                      >
                        HTML Example
                      </button>
                      <Dialog>
                        <DialogTrigger asChild>
                          <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                            <HelpCircle className="w-4 h-4 text-gray-400" />
                          </button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>HTML Proposal Template Guide</DialogTitle>
                            <DialogDescription>
                              {getTemplateDescription('proposal')}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 mt-4">
                            <div>
                              <h4 className="font-semibold mb-2">Tips:</h4>
                              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                <li>Include complete HTML with embedded CSS and JavaScript</li>
                                <li>Use dark glassmorphic design (or your preferred style)</li>
                                <li>Include navigation, animations, and interactive elements</li>
                                <li>Show your company branding and color scheme</li>
                              </ul>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => loadStarterTemplate('proposal')}
                        variant="outline"
                        size="sm"
                        title="Load starter template"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Starter
                      </Button>
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept=".json"
                          className="hidden"
                          onChange={(e) => importTemplate('proposal', e)}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          title="Import template"
                        >
                          <span>
                            <Upload className="w-3 h-3 mr-1" />
                            Import
                          </span>
                        </Button>
                      </label>
                      <Button
                        onClick={() => exportTemplate('proposal')}
                        variant="outline"
                        size="sm"
                        title="Export template"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        Export
                      </Button>
                      <Button
                        onClick={() => copyTemplate('proposal')}
                        variant="outline"
                        size="sm"
                        title="Copy to clipboard"
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copy
                      </Button>
                      {proposalTemplates.proposal.content && (
                        <Button
                          onClick={() => {
                            const content = proposalTemplates.proposal.content;
                            const previewWindow = window.open('', '_blank');
                            if (previewWindow) {
                              previewWindow.document.write(content);
                              previewWindow.document.close();
                            }
                          }}
                          variant="outline"
                          size="sm"
                          title="Preview HTML in new window"
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          Preview
                        </Button>
                      )}
                      <Button
                        onClick={() => saveTemplate('proposal')}
                        disabled={savingTemplate === 'proposal'}
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        {savingTemplate === 'proposal' ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-3 h-3 mr-2" />
                            Save
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500">{getTemplateDescription('proposal')}</p>
                  {expandedTemplates.proposal && (
                    <Textarea
                      id="proposal-template"
                      value={proposalTemplates.proposal.content || ''}
                      onChange={(e) => handleTemplateChange('proposal', e.target.value)}
                      className="font-mono text-sm min-h-[400px]"
                      placeholder="Enter HTML proposal example..."
                    />
                  )}
                </div>
              )}

              {/* Design System Template */}
              {proposalTemplates.design_system && (
                <div className="space-y-3 border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleTemplateExpanded('design_system')}
                        className="text-sm font-semibold hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                      >
                        Style Prompt
                      </button>
                      <Dialog>
                        <DialogTrigger asChild>
                          <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                            <HelpCircle className="w-4 h-4 text-gray-400" />
                          </button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Design System Template Guide</DialogTitle>
                            <DialogDescription>
                              {getTemplateDescription('design_system')}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 mt-4">
                            <div>
                              <h4 className="font-semibold mb-2">Tips:</h4>
                              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                <li>Define your color palette (primary, secondary, accent colors)</li>
                                <li>Specify typography choices (fonts, sizes, weights)</li>
                                <li>Describe component styles (cards, buttons, navigation)</li>
                                <li>Include CSS class patterns or design tokens</li>
                              </ul>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => loadStarterTemplate('design_system')}
                        variant="outline"
                        size="sm"
                        title="Load starter template"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Starter
                      </Button>
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept=".json"
                          className="hidden"
                          onChange={(e) => importTemplate('design_system', e)}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          title="Import template"
                        >
                          <span>
                            <Upload className="w-3 h-3 mr-1" />
                            Import
                          </span>
                        </Button>
                      </label>
                      <Button
                        onClick={() => exportTemplate('design_system')}
                        variant="outline"
                        size="sm"
                        title="Export template"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        Export
                      </Button>
                      <Button
                        onClick={() => copyTemplate('design_system')}
                        variant="outline"
                        size="sm"
                        title="Copy to clipboard"
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copy
                      </Button>
                      <Button
                        onClick={() => saveTemplate('design_system')}
                        disabled={savingTemplate === 'design_system'}
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        {savingTemplate === 'design_system' ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-3 h-3 mr-2" />
                            Save
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500">{getTemplateDescription('design_system')}</p>
                  {expandedTemplates.design_system && (
                    <Textarea
                      id="design-system-template"
                      value={proposalTemplates.design_system.content || ''}
                      onChange={(e) => handleTemplateChange('design_system', e.target.value)}
                      className="font-mono text-sm min-h-[300px]"
                      placeholder="Enter design system guidelines..."
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <h3 className="font-medium text-blue-900 dark:text-blue-100">About Proposal Generation</h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Proposal generation uses multiple AI models in a workflow:
                  </p>
                  <ol className="text-sm text-blue-700 dark:text-blue-300 list-decimal list-inside space-y-1 ml-2">
                    <li><strong>Focus Areas Model:</strong> Analyzes transcripts to identify key focus areas (use faster model)</li>
                    <li><strong>Goals Model:</strong> Extracts goals and objectives from meeting discussions</li>
                    <li><strong>SOW Model:</strong> Generates Statement of Work documents (uses SOW Example template)</li>
                    <li><strong>Proposal Model:</strong> Creates the final proposal document (uses HTML Example and Style Prompt)</li>
                  </ol>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                    Templates serve as examples that guide the AI's output. The SOW Example shows formatting, the HTML Example demonstrates structure, and the Style Prompt defines visual design.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="task-sync" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Task Auto-Sync</CardTitle>
              <CardDescription>
                Configure automatic task creation from action items based on importance levels and confidence thresholds.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Sparkles className="w-12 h-12 mx-auto mb-4 text-purple-500" />
                <p className="text-lg font-medium mb-2">Manage Task Auto-Sync Settings</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  Control which action items automatically create tasks based on importance classification (Critical, High, Medium, Low).
                </p>
                <Button onClick={() => navigate('/settings/task-sync')}>
                  Go to Task Auto-Sync Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales-assistant" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sales Assistant Training</CardTitle>
              <CardDescription>
                Your Sales Assistant is trained on your company's website data. Re-analyze to update the AI with your latest company information.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingEnrichment ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-purple-500" />
                  <span className="ml-2 text-gray-500">Loading company data...</span>
                </div>
              ) : !activeOrgId ? (
                <div className="text-center py-12">
                  <Building2 className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium mb-2">No Organization Selected</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Please select an organization to manage Sales Assistant training.
                  </p>
                </div>
              ) : !enrichmentData ? (
                <div className="text-center py-12">
                  <Brain className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium mb-2">No Training Data Found</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Complete the onboarding process to train your Sales Assistant on your company data.
                  </p>
                  <Button onClick={() => navigate('/onboarding')}>
                    Start Onboarding
                  </Button>
                </div>
              ) : reanalyzing ? (
                <div className="text-center py-12">
                  <RefreshCw className="w-12 h-12 mx-auto mb-4 text-purple-500 animate-spin" />
                  <p className="text-lg font-medium mb-2">Re-analyzing Company Data</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {reanalyzeProgress || 'Processing...'}
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Current Training Data */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
                        <Globe className="w-4 h-4" />
                        Domain
                      </div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {enrichmentData.domain || 'Not set'}
                      </p>
                    </div>

                    <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
                        <Building2 className="w-4 h-4" />
                        Company Name
                      </div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {enrichmentData.company_name || 'Unknown'}
                      </p>
                    </div>

                    <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
                        <Package className="w-4 h-4" />
                        Industry
                      </div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {enrichmentData.industry || 'Unknown'}
                      </p>
                    </div>

                    <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
                        <CheckCircle className="w-4 h-4" />
                        Last Updated
                      </div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {enrichmentData.updated_at
                          ? new Date(enrichmentData.updated_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Unknown'}
                      </p>
                    </div>
                  </div>

                  {/* Products */}
                  {enrichmentData.products && enrichmentData.products.length > 0 && (
                    <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
                        <Package className="w-4 h-4" />
                        Products & Services
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {enrichmentData.products.slice(0, 10).map((product, i) => (
                          <span
                            key={i}
                            className="px-2 py-1 text-sm rounded-md bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                          >
                            {product}
                          </span>
                        ))}
                        {enrichmentData.products.length > 10 && (
                          <span className="px-2 py-1 text-sm text-gray-500">
                            +{enrichmentData.products.length - 10} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Competitors */}
                  {enrichmentData.competitors && enrichmentData.competitors.length > 0 && (
                    <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
                        <Users className="w-4 h-4" />
                        Competitors
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {enrichmentData.competitors.slice(0, 10).map((competitor, i) => (
                          <span
                            key={i}
                            className="px-2 py-1 text-sm rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                          >
                            {competitor}
                          </span>
                        ))}
                        {enrichmentData.competitors.length > 10 && (
                          <span className="px-2 py-1 text-sm text-gray-500">
                            +{enrichmentData.competitors.length - 10} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Re-analyze Button */}
                  <div className="pt-4 border-t dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">Re-analyze Company Data</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Re-scrape your website and update the AI training with latest company information.
                        </p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" className="flex items-center gap-2">
                            <RefreshCw className="w-4 h-4" />
                            Re-analyze
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Re-analyze Company Data?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will re-scrape your website ({enrichmentData.domain}) and update your Sales Assistant's training data. This process typically takes 30-60 seconds.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleReanalyze}>
                              Continue
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

