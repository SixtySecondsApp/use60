import React, { useState, useEffect } from 'react';
import { Save, CheckCircle, AlertCircle, Sparkles, Key, RotateCcw } from 'lucide-react';
import { AIProviderService } from '../../lib/services/aiProvider';
import { supabase } from '../../lib/supabase/clientV2';

interface APIKeyConfig {
  provider: string;
  // newKey is what the user is typing when replacing a saved key
  newKey: string;
  // hasSavedKey indicates a key is already stored server-side
  hasSavedKey: boolean;
  // lastFour is the masked suffix shown after saving
  lastFour: string;
  // isReplacing indicates the user clicked "Replace" to enter a new key
  isReplacing: boolean;
  isValid?: boolean;
}

export default function AIProviderSettings() {
  const [apiKeys, setApiKeys] = useState<APIKeyConfig[]>([
    { provider: 'openai', newKey: '', hasSavedKey: false, lastFour: '', isReplacing: false },
    { provider: 'anthropic', newKey: '', hasSavedKey: false, lastFour: '', isReplacing: false },
    { provider: 'openrouter', newKey: '', hasSavedKey: false, lastFour: '', isReplacing: false },
    { provider: 'gemini', newKey: '', hasSavedKey: false, lastFour: '', isReplacing: false },
  ]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [userId, setUserId] = useState<string | null>(null);

  const aiProviderService = AIProviderService.getInstance();

  useEffect(() => {
    loadExistingKeys();
  }, []);

  const loadExistingKeys = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);

      const { data } = await supabase
        .from('user_settings')
        .select('ai_provider_keys')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data?.ai_provider_keys) {
        const existingKeys = data.ai_provider_keys as Record<string, string>;
        setApiKeys(keys => keys.map(key => {
          const savedKey = existingKeys[key.provider] || '';
          return {
            ...key,
            hasSavedKey: !!savedKey,
            lastFour: savedKey ? savedKey.slice(-4) : '',
            isValid: savedKey ? true : undefined,
          };
        }));
      }
    } catch (error) {
    }
  };

  const handleNewKeyChange = (provider: string, value: string) => {
    setApiKeys(keys => keys.map(key =>
      key.provider === provider
        ? { ...key, newKey: value, isValid: undefined }
        : key
    ));
  };

  const startReplacing = (provider: string) => {
    setApiKeys(keys => keys.map(key =>
      key.provider === provider
        ? { ...key, isReplacing: true, newKey: '', isValid: undefined }
        : key
    ));
  };

  const cancelReplacing = (provider: string) => {
    setApiKeys(keys => keys.map(key =>
      key.provider === provider
        ? { ...key, isReplacing: false, newKey: '' }
        : key
    ));
  };

  const testApiKey = async (provider: string) => {
    setTesting(provider);
    try {
      const keyConfig = apiKeys.find(k => k.provider === provider);
      const keyToTest = keyConfig?.newKey;
      if (!keyToTest) {
        setApiKeys(keys => keys.map(key =>
          key.provider === provider
            ? { ...key, isValid: false }
            : key
        ));
        return;
      }

      const isValid = await aiProviderService.testApiKey(provider, keyToTest);

      setApiKeys(keys => keys.map(key =>
        key.provider === provider
          ? { ...key, isValid }
          : key
      ));

      if (!isValid) {
        console.warn(`[AI Settings] API key validation failed for ${provider}.`);
      }
    } catch (error: any) {
      console.error(`[AI Settings] Error testing ${provider} API key:`, error);
      setApiKeys(keys => keys.map(key =>
        key.provider === provider
          ? { ...key, isValid: false }
          : key
      ));
    } finally {
      setTesting(null);
    }
  };

  const saveAllKeys = async () => {
    if (!userId) return;

    setLoading(true);
    setSaveStatus('saving');

    try {
      for (const keyConfig of apiKeys) {
        // Only save if the user entered a new key (either fresh or replacement)
        if (keyConfig.newKey) {
          await aiProviderService.saveApiKey(userId, keyConfig.provider, keyConfig.newKey);
        }
      }

      setSaveStatus('saved');
      // After saving, update state: move newKey → lastFour, clear isReplacing
      setApiKeys(keys => keys.map(key => {
        if (key.newKey) {
          return {
            ...key,
            hasSavedKey: true,
            lastFour: key.newKey.slice(-4),
            newKey: '',
            isReplacing: false,
            isValid: undefined,
          };
        }
        return key;
      }));
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setLoading(false);
    }
  };

  const getProviderLabel = (provider: string) => {
    switch (provider) {
      case 'openai':
        return 'OpenAI';
      case 'anthropic':
        return 'Anthropic (Claude)';
      case 'openrouter':
        return 'OpenRouter';
      case 'gemini':
        return 'Google Gemini';
      default:
        return provider;
    }
  };

  const getProviderHelp = (provider: string) => {
    switch (provider) {
      case 'openai':
        return 'Get your API key from platform.openai.com';
      case 'anthropic':
        return 'Get your API key from console.anthropic.com';
      case 'openrouter':
        return 'Get your API key from openrouter.ai';
      case 'gemini':
        return 'Get your API key from aistudio.google.com/app/apikey (enable Generative AI API in Google Cloud Console)';
      default:
        return '';
    }
  };

  const hasUnsavedKeys = apiKeys.some(k => k.newKey);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-6 space-y-6 border border-gray-200 dark:border-gray-800 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-purple-100 dark:bg-purple-500/20 rounded-lg">
          <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">AI Provider Settings</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Configure API keys for AI models in your workflows
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {apiKeys.map((keyConfig) => (
          <div key={keyConfig.provider} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-gray-900 dark:text-white font-medium">{getProviderLabel(keyConfig.provider)}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{getProviderHelp(keyConfig.provider)}</p>
              </div>
              {keyConfig.isValid !== undefined && (
                <div className="flex items-center gap-2">
                  {keyConfig.isValid ? (
                    <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
                  )}
                  <span className={`text-xs ${keyConfig.isValid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {keyConfig.isValid ? 'Valid' : 'Invalid'}
                  </span>
                </div>
              )}
            </div>

            {keyConfig.hasSavedKey && !keyConfig.isReplacing ? (
              // Saved state — show masked key, no eye icon
              <div className="flex gap-2 items-center">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg">
                  <Key className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                  <span className="text-gray-500 dark:text-gray-400 font-mono text-sm">
                    sk-...{keyConfig.lastFour}
                  </span>
                  <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400 ml-auto shrink-0" />
                </div>
                <button
                  onClick={() => startReplacing(keyConfig.provider)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-white rounded-lg transition-colors text-sm"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Replace
                </button>
              </div>
            ) : (
              // Input state — new key entry or replacement
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="password"
                    value={keyConfig.newKey}
                    onChange={(e) => handleNewKeyChange(keyConfig.provider, e.target.value)}
                    placeholder={keyConfig.isReplacing ? 'Enter new API key' : `Enter ${getProviderLabel(keyConfig.provider)} API key`}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    autoFocus={keyConfig.isReplacing}
                  />
                </div>

                <button
                  onClick={() => testApiKey(keyConfig.provider)}
                  disabled={!keyConfig.newKey || testing === keyConfig.provider}
                  className="px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-700/50 disabled:text-gray-400 disabled:cursor-not-allowed text-gray-700 dark:text-white rounded-lg transition-colors text-sm"
                >
                  {testing === keyConfig.provider ? (
                    <span className="flex items-center gap-1">
                      <div className="w-3 h-3 border-2 border-gray-400 dark:border-white/30 border-t-gray-700 dark:border-t-white rounded-full animate-spin" />
                      Testing
                    </span>
                  ) : (
                    'Test'
                  )}
                </button>

                {keyConfig.isReplacing && (
                  <button
                    onClick={() => cancelReplacing(keyConfig.provider)}
                    className="px-3 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg transition-colors text-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-800">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          <Key className="w-4 h-4 inline mr-1" />
          API keys are encrypted and stored securely
        </div>

        <button
          onClick={saveAllKeys}
          disabled={loading || !hasUnsavedKeys}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 dark:disabled:bg-purple-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {saveStatus === 'saving' ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving...
            </>
          ) : saveStatus === 'saved' ? (
            <>
              <CheckCircle className="w-4 h-4" />
              Saved!
            </>
          ) : saveStatus === 'error' ? (
            <>
              <AlertCircle className="w-4 h-4" />
              Error
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save API Keys
            </>
          )}
        </button>
      </div>
    </div>
  );
}