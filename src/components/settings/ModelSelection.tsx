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
import { Save, Info } from 'lucide-react';

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

export default function ModelSelection() {
  const [userId, setUserId] = useState<string | null>(null);
  const [featureConfigs, setFeatureConfigs] = useState<Record<string, FeatureModelConfig>>({});
  const [availableModels, setAvailableModels] = useState<Record<string, ModelOption[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const aiProviderService = AIProviderService.getInstance();

  useEffect(() => {
    initializeSettings();
  }, []);

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
    } catch (error) {
      console.error('Error initializing AI settings:', error);
      toast.error('Failed to load AI settings');
    } finally {
      setLoading(false);
    }
  };

  const loadFeatureSettings = async (userId: string) => {
    try {
      const { data, error } = await (supabase
        .from('user_ai_feature_settings') as any)
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      const configs: Record<string, FeatureModelConfig> = {};

      // Initialize defaults for each feature
      Object.values(FEATURE_KEYS).forEach(featureKey => {
        const existing = data?.find((c: any) => c.feature_key === featureKey);
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
      console.error('Error loading feature settings:', error);
      toast.error('Failed to load feature settings');
    }
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
        { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (Recommended)' },
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
        { value: 'gemini-1.5-pro-latest', label: 'Gemini 1.5 Pro' },
      ],
    };
    return fallbacks[provider] || [];
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
        const { error } = await (supabase
          .from('user_ai_feature_settings') as any)
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

      toast.success('AI model settings saved successfully');
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#37bd7e]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Per-Feature Model Selection</CardTitle>
          <CardDescription>
            Configure which AI model to use for each feature. Settings cascade: User settings → System config → Defaults
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
                        Configure the AI model used for {FEATURE_LABELS[featureKey].toLowerCase()}
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
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Controls randomness (0 = deterministic, 2 = creative)
                      </p>
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
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Maximum tokens in response
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-800">
            <Button
              onClick={saveFeatureSettings}
              disabled={saving}
              className="bg-[#37bd7e] hover:bg-[#2da066] dark:bg-[#37bd7e] dark:hover:bg-[#2da066]"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Model Settings
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
              <h3 className="font-medium text-blue-900 dark:text-blue-100">How Model Resolution Works</h3>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                The system resolves models in this order:
              </p>
              <ol className="text-sm text-blue-700 dark:text-blue-300 list-decimal list-inside space-y-1 ml-2">
                <li>Your custom settings (configured above)</li>
                <li>System-wide defaults (configured by admin)</li>
                <li>Hardcoded fallback models</li>
              </ol>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                If you disable a feature above, it will use system defaults instead.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
