import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { AIProviderService } from '@/lib/services/aiProvider';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { Sparkles, Save, Info, Shield } from 'lucide-react';
import { useUser } from '@/lib/hooks/useUser';
import { isUserAdmin } from '@/lib/utils/adminUtils';
import { useNavigate } from 'react-router-dom';

// Feature keys for AI model configuration (system-wide defaults)
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

interface SystemModelConfig {
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

export default function AdminModelSettings() {
  const { userData } = useUser();
  const navigate = useNavigate();
  const [featureConfigs, setFeatureConfigs] = useState<Record<string, SystemModelConfig>>({});
  const [availableModels, setAvailableModels] = useState<Record<string, ModelOption[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const aiProviderService = AIProviderService.getInstance();

  useEffect(() => {
    // Check admin access
    if (userData && !isUserAdmin(userData)) {
      toast.error('Admin access required');
      navigate('/');
      return;
    }
    initializeSettings();
  }, [userData, navigate]);

  const initializeSettings = async () => {
    try {
      setLoading(true);
      
      // Load system-wide defaults from system_config
      await loadSystemDefaults();

      // Load available models for each provider
      await loadAvailableModels();
    } catch (error) {
      console.error('Error initializing admin model settings:', error);
      toast.error('Failed to load admin model settings');
    } finally {
      setLoading(false);
    }
  };

  const loadSystemDefaults = async () => {
    try {
      // Load from system_config table
      const { data, error } = await supabase
        .from('system_config')
        .select('*')
        .in('key', [
          'ai_meeting_task_model',
          'ai_meeting_sentiment_model',
          'ai_proposal_model',
          'ai_meeting_summary_model',
        ]);

      if (error) throw error;

      const configs: Record<string, SystemModelConfig> = {};
      
      // Initialize defaults for each feature
      Object.values(FEATURE_KEYS).forEach(featureKey => {
        const configKey = getSystemConfigKey(featureKey);
        const existing = data?.find(c => c.key === configKey);
        
        if (existing) {
          // Parse the model string (format: "provider/model-name")
          const [provider, ...modelParts] = existing.value.split('/');
          const model = modelParts.join('/');
          
          configs[featureKey] = {
            feature_key: featureKey,
            provider: provider || 'anthropic',
            model: model || getDefaultModel(featureKey),
            temperature: 0.7,
            max_tokens: 2048,
            is_enabled: true,
          };
        } else {
          // Set defaults
          configs[featureKey] = {
            feature_key: featureKey,
            provider: 'anthropic',
            model: getDefaultModel(featureKey),
            temperature: 0.7,
            max_tokens: 2048,
            is_enabled: true,
          };
        }
      });

      setFeatureConfigs(configs);
    } catch (error) {
      console.error('Error loading system defaults:', error);
      toast.error('Failed to load system defaults');
    }
  };

  const getSystemConfigKey = (featureKey: string): string => {
    const mapping: Record<string, string> = {
      [FEATURE_KEYS.MEETING_TASK_EXTRACTION]: 'ai_meeting_task_model',
      [FEATURE_KEYS.MEETING_SENTIMENT]: 'ai_meeting_sentiment_model',
      [FEATURE_KEYS.PROPOSAL_GENERATION]: 'ai_proposal_model',
      [FEATURE_KEYS.MEETING_SUMMARY]: 'ai_meeting_summary_model',
    };
    return mapping[featureKey] || `ai_${featureKey}_model`;
  };

  const getDefaultModel = (featureKey: string): string => {
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
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
        { value: 'gemini-1.5-pro-latest', label: 'Gemini 1.5 Pro' },
      ],
    };
    return fallbacks[provider] || [];
  };

  const updateFeatureConfig = (featureKey: string, updates: Partial<SystemModelConfig>) => {
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
    
    const models = availableModels[provider] || [];
    if (models.length > 0) {
      updateFeatureConfig(featureKey, { model: models[0].value });
    }
  };

  const saveSystemDefaults = async () => {
    if (!isUserAdmin(userData)) {
      toast.error('Admin access required');
      return;
    }

    setSaving(true);
    try {
      const configsToSave = Object.values(featureConfigs);

      // Use an edge function or RPC call to update system_config
      // Since RLS restricts system_config updates to service_role,
      // we'll use an RPC function that checks admin status
      for (const config of configsToSave) {
        const configKey = getSystemConfigKey(config.feature_key);
        const modelValue = `${config.provider}/${config.model}`;
        
        // Call admin RPC function to update system config
        const { error } = await (supabase.rpc as any)('admin_set_system_config', {
          p_key: configKey,
          p_value: modelValue,
          p_description: `System default model for ${FEATURE_LABELS[config.feature_key]}`,
        });

        if (error) {
          console.error(`Error saving ${configKey}:`, error);
          toast.error(`Failed to save ${FEATURE_LABELS[config.feature_key]}: ${error.message}`);
          continue;
        }
      }

      toast.success('System model defaults saved successfully');
    } catch (error) {
      console.error('Error saving system defaults:', error);
      toast.error('Failed to save system defaults');
    } finally {
      setSaving(false);
    }
  };

  if (!isUserAdmin(userData)) {
    return null;
  }

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
          <Shield className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin Model Settings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure system-wide default AI models. These defaults apply to all users unless they override them.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>System-Wide Model Defaults</CardTitle>
          <CardDescription>
            These settings serve as defaults for all users. Users can override these in their personal AI settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {Object.values(FEATURE_KEYS).map(featureKey => {
            const config = featureConfigs[featureKey];
            if (!config) return null;

            return (
              <Card key={featureKey} className="border-gray-200 dark:border-gray-800">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{FEATURE_LABELS[featureKey]}</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        System default model for {FEATURE_LABELS[featureKey].toLowerCase()}
                      </CardDescription>
                    </div>
                    <Switch
                      checked={config.is_enabled}
                      onCheckedChange={(enabled) => updateFeatureConfig(featureKey, { is_enabled: enabled })}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`${featureKey}-provider`}>Provider</Label>
                      <Select
                        value={config.provider}
                        onValueChange={(value) => handleProviderChange(featureKey, value)}
                        disabled={!config.is_enabled}
                      >
                        <SelectTrigger id={`${featureKey}-provider`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PROVIDERS.map(provider => (
                            <SelectItem key={provider} value={provider}>
                              {provider.charAt(0).toUpperCase() + provider.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`${featureKey}-model`}>Model</Label>
                      <Select
                        value={config.model}
                        onValueChange={(model) => updateFeatureConfig(featureKey, { model })}
                        disabled={!config.is_enabled}
                      >
                        <SelectTrigger id={`${featureKey}-model`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(availableModels[config.provider] || []).map(model => (
                            <SelectItem key={model.value} value={model.value}>
                              {model.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`${featureKey}-temperature`}>
                        Temperature: {config.temperature}
                      </Label>
                      <Input
                        id={`${featureKey}-temperature`}
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        value={config.temperature}
                        onChange={(e) => updateFeatureConfig(featureKey, { temperature: parseFloat(e.target.value) })}
                        disabled={!config.is_enabled}
                      />
                      <p className="text-xs text-gray-500">Controls randomness (0 = deterministic, 2 = creative)</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`${featureKey}-max-tokens`}>Max Tokens</Label>
                      <Input
                        id={`${featureKey}-max-tokens`}
                        type="number"
                        min="1"
                        value={config.max_tokens}
                        onChange={(e) => updateFeatureConfig(featureKey, { max_tokens: parseInt(e.target.value) })}
                        disabled={!config.is_enabled}
                      />
                      <p className="text-xs text-gray-500">Maximum tokens in response</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <div className="flex justify-end pt-4 border-t">
            <Button
              onClick={saveSystemDefaults}
              disabled={saving}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save System Defaults
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="font-medium text-blue-900 dark:text-blue-100">How System Defaults Work</h3>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                The system resolves models in this order:
              </p>
              <ol className="text-sm text-blue-700 dark:text-blue-300 list-decimal list-inside space-y-1 ml-2">
                <li>User's custom settings (configured in their personal AI settings)</li>
                <li>System-wide defaults (configured here by admin)</li>
                <li>Hardcoded fallback models</li>
              </ol>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                Changes to system defaults will affect all users who haven't configured their own settings.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

