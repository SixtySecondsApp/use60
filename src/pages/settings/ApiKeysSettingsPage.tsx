/**
 * ApiKeysSettingsPage -- BYOK (Bring Your Own Key) management for AI providers.
 *
 * Users can add their own Anthropic or OpenAI API key to use AI features
 * without consuming platform credits. Keys are validated before saving.
 */

import { useState, useEffect } from 'react';
import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { supabase } from '@/lib/supabase/clientV2';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Key,
  CheckCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Provider = 'anthropic' | 'openai';

interface ProviderConfig {
  id: Provider;
  label: string;
  description: string;
  helpUrl: string;
  helpText: string;
  costEstimate: string;
  placeholder: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    description: 'Powers meeting prep, follow-ups, coaching, and research features.',
    helpUrl: 'https://console.anthropic.com',
    helpText: 'Add your Anthropic API key to use AI features without credits. Get your key at console.anthropic.com',
    costEstimate: 'Typical cost: $5-20/month for a solo founder',
    placeholder: 'sk-ant-...',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'Used for embeddings, transcription, and select AI operations.',
    helpUrl: 'https://platform.openai.com/api-keys',
    helpText: 'Add your OpenAI API key for embedding and transcription features. Get your key at platform.openai.com',
    costEstimate: 'Typical cost: $2-10/month for a solo founder',
    placeholder: 'sk-...',
  },
];

interface ProviderState {
  hasSavedKey: boolean;
  lastFour: string;
  newKey: string;
  isReplacing: boolean;
  isValidating: boolean;
  isSaving: boolean;
  validationResult?: 'valid' | 'invalid';
  validationError?: string;
}

type ProviderStates = Record<Provider, ProviderState>;

const defaultProviderState: ProviderState = {
  hasSavedKey: false,
  lastFour: '',
  newKey: '',
  isReplacing: false,
  isValidating: false,
  isSaving: false,
};

export default function ApiKeysSettingsPage() {
  const [states, setStates] = useState<ProviderStates>({
    anthropic: { ...defaultProviderState },
    openai: { ...defaultProviderState },
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExistingKeys();
  }, []);

  const loadExistingKeys = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('user_settings')
        .select('ai_provider_keys')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data?.ai_provider_keys) {
        const existingKeys = data.ai_provider_keys as Record<string, string>;
        setStates(prev => {
          const next = { ...prev };
          for (const provider of Object.keys(next) as Provider[]) {
            const savedKey = existingKeys[provider] || '';
            next[provider] = {
              ...next[provider],
              hasSavedKey: !!savedKey,
              lastFour: savedKey ? savedKey.slice(-4) : '',
            };
          }
          return next;
        });
      }
    } catch (err) {
      console.error('[ApiKeysSettingsPage] Failed to load keys:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateState = (provider: Provider, patch: Partial<ProviderState>) => {
    setStates(prev => ({
      ...prev,
      [provider]: { ...prev[provider], ...patch },
    }));
  };

  const handleValidate = async (provider: Provider) => {
    const key = states[provider].newKey;
    if (!key) {
      toast.error('Please enter an API key first');
      return;
    }

    updateState(provider, { isValidating: true, validationResult: undefined, validationError: undefined });

    try {
      const { data, error } = await supabase.functions.invoke('validate-api-key', {
        body: { provider, key },
      });

      if (error) {
        updateState(provider, { isValidating: false, validationResult: 'invalid', validationError: error.message });
        toast.error(`Validation failed: ${error.message}`);
        return;
      }

      if (data?.valid) {
        updateState(provider, { isValidating: false, validationResult: 'valid' });
        toast.success(`${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key is valid`);
      } else {
        updateState(provider, {
          isValidating: false,
          validationResult: 'invalid',
          validationError: data?.error || 'Invalid API key',
        });
        toast.error(data?.error || 'Invalid API key');
      }
    } catch (err: any) {
      updateState(provider, { isValidating: false, validationResult: 'invalid', validationError: err.message });
      toast.error(`Validation error: ${err.message}`);
    }
  };

  const handleSave = async (provider: Provider) => {
    const key = states[provider].newKey;
    if (!key) {
      toast.error('Please enter an API key first');
      return;
    }

    updateState(provider, { isSaving: true });

    try {
      const { data, error } = await supabase.functions.invoke('save-api-key', {
        body: { provider, key },
      });

      if (error) {
        toast.error(`Failed to save: ${error.message}`);
        updateState(provider, { isSaving: false });
        return;
      }

      if (data?.success) {
        updateState(provider, {
          isSaving: false,
          hasSavedKey: true,
          lastFour: key.slice(-4),
          newKey: '',
          isReplacing: false,
          validationResult: undefined,
          validationError: undefined,
        });
        toast.success(`${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key saved`);
      } else {
        toast.error('Failed to save API key');
        updateState(provider, { isSaving: false });
      }
    } catch (err: any) {
      toast.error(`Save error: ${err.message}`);
      updateState(provider, { isSaving: false });
    }
  };

  const startReplacing = (provider: Provider) => {
    updateState(provider, { isReplacing: true, newKey: '', validationResult: undefined, validationError: undefined });
  };

  const cancelReplacing = (provider: Provider) => {
    updateState(provider, { isReplacing: false, newKey: '', validationResult: undefined, validationError: undefined });
  };

  return (
    <SettingsPageWrapper
      title="API Keys"
      description="Bring your own AI provider keys to skip credit usage"
      icon={Key}
      iconClassName="h-7 w-7 text-purple-500 dark:text-purple-400"
      iconContainerClassName="bg-purple-500/10 dark:bg-purple-500/20 border-purple-500/20 dark:border-purple-500/30"
      accentGradient="from-purple-600 via-violet-500 to-indigo-500"
      dotClassName="bg-purple-500"
    >
      <div className="space-y-6">
        {/* Explainer */}
        <div className="flex items-start gap-3 p-4 bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 rounded-xl">
          <ShieldCheck className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5 shrink-0" />
          <div className="text-sm text-purple-900 dark:text-purple-200">
            <p className="font-medium mb-1">Bring Your Own Key (BYOK)</p>
            <p className="text-purple-700 dark:text-purple-300">
              Add your own API keys to use AI features without consuming platform credits.
              Keys are encrypted and stored securely. When a BYOK key is configured,
              AI operations use your key directly -- no credit deductions.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4">
            {PROVIDERS.map((config) => {
              const state = states[config.id];
              return (
                <Card key={config.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                          <Sparkles className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{config.label}</CardTitle>
                          <CardDescription className="text-xs mt-0.5">
                            {config.description}
                          </CardDescription>
                        </div>
                      </div>
                      {/* Status indicator */}
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'w-2 h-2 rounded-full',
                            state.hasSavedKey ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                          )}
                        />
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                          {state.hasSavedKey ? 'Connected' : 'Not configured'}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {state.hasSavedKey && !state.isReplacing ? (
                        /* Saved key display */
                        <div className="flex gap-2 items-center">
                          <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                            <Key className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                            <span className="text-gray-500 dark:text-gray-400 font-mono text-sm">
                              ...{state.lastFour}
                            </span>
                            <CheckCircle className="w-4 h-4 text-emerald-500 ml-auto shrink-0" />
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startReplacing(config.id)}
                            className="gap-1.5"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Replace
                          </Button>
                        </div>
                      ) : (
                        /* Key input */
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <div className="flex-1 relative">
                              <input
                                type="password"
                                value={state.newKey}
                                onChange={(e) => updateState(config.id, {
                                  newKey: e.target.value,
                                  validationResult: undefined,
                                  validationError: undefined,
                                })}
                                placeholder={config.placeholder}
                                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm font-mono"
                                autoFocus={state.isReplacing}
                              />
                            </div>
                          </div>

                          {/* Validation feedback */}
                          {state.validationResult && (
                            <div className={cn(
                              'flex items-center gap-2 text-xs px-3 py-2 rounded-lg',
                              state.validationResult === 'valid'
                                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400'
                            )}>
                              {state.validationResult === 'valid' ? (
                                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <span>
                                {state.validationResult === 'valid'
                                  ? 'API key is valid'
                                  : state.validationError || 'Invalid API key'}
                              </span>
                            </div>
                          )}

                          {/* Action buttons */}
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleValidate(config.id)}
                              disabled={!state.newKey || state.isValidating}
                              className="gap-1.5"
                            >
                              {state.isValidating ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ShieldCheck className="w-3.5 h-3.5" />
                              )}
                              {state.isValidating ? 'Validating...' : 'Validate'}
                            </Button>

                            <Button
                              size="sm"
                              onClick={() => handleSave(config.id)}
                              disabled={!state.newKey || state.isSaving}
                              className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
                            >
                              {state.isSaving ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Key className="w-3.5 h-3.5" />
                              )}
                              {state.isSaving ? 'Saving...' : 'Save'}
                            </Button>

                            {state.isReplacing && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => cancelReplacing(config.id)}
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Help text and cost estimate */}
                      <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-1">
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1.5">
                          <ExternalLink className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>
                            {config.helpText.split(config.helpUrl.replace('https://', ''))[0]}
                            <a
                              href={config.helpUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-purple-600 dark:text-purple-400 hover:underline"
                            >
                              {config.helpUrl.replace('https://', '')}
                            </a>
                          </span>
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 pl-[18px]">
                          {config.costEstimate}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Security note */}
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 px-1">
          <Key className="w-3.5 h-3.5 shrink-0" />
          <span>API keys are encrypted at rest and never exposed in API responses.</span>
        </div>
      </div>
    </SettingsPageWrapper>
  );
}
