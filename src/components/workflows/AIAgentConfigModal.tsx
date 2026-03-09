import React, { useState, useEffect } from 'react';
import { X, Sparkles, Info, FileText, ChevronRight, Code, Brain, Wrench, RefreshCw } from 'lucide-react';
import PromptTemplatesModal from './PromptTemplatesModal';
import type { PromptTemplate } from './PromptTemplatesModal';
import { ToolRegistry } from '../../lib/services/workflowTools';
import VariablePicker from './VariablePicker';
import { AIProviderService } from '../../lib/services/aiProvider';
import { supabase } from '../../lib/supabase/clientV2';

export interface AINodeConfig {
  modelProvider: 'openai' | 'anthropic' | 'openrouter' | 'gemini';
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  outputFormat?: 'text' | 'json' | 'structured';
  jsonSchema?: string;
  fewShotExamples?: Array<{ input: string; output: string }>;
  chainOfThought?: boolean;
  templateId?: string;
  extractionRules?: Array<{
    field: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    path?: string;
    required?: boolean;
  }>;
  retryOnError?: boolean;
  maxRetries?: number;
  enableTools?: boolean;
  selectedTools?: string[];
  autoExecuteTools?: boolean;
  enableMCP?: boolean;
  selectedMCPServers?: string[];
}

interface AIAgentConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config?: AINodeConfig;
  onSave: (config: AINodeConfig) => void;
  availableVariables?: string[];
  formFields?: Array<{ name: string; type: string; label: string }>;
}

// Default model options (used as fallback)
const DEFAULT_MODEL_OPTIONS = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o (Latest)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  ],
  anthropic: [
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
    { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
    { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
  ],
  openrouter: [
    { value: 'openai/gpt-4-turbo-preview', label: 'GPT-4 Turbo (via OpenRouter)' },
    { value: 'anthropic/claude-3-opus', label: 'Claude 3 Opus (via OpenRouter)' },
    { value: 'meta-llama/llama-3-70b', label: 'Llama 3 70B' },
  ],
  gemini: [
    { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (Recommended)' },
    { value: 'gemini-3-flash', label: 'Gemini 3 Flash' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
    { value: 'gemini-2.5-pro-preview-03-25', label: 'Gemini 2.5 Pro Preview' },
    { value: 'gemini-1.5-pro-latest', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash-latest', label: 'Gemini 1.5 Flash' },
    { value: 'gemini-pro', label: 'Gemini Pro (Legacy)' },
  ],
};

export default function AIAgentConfigModal({
  isOpen,
  onClose,
  config,
  onSave,
  availableVariables = [],
  formFields = [],
}: AIAgentConfigModalProps) {
  const [modelOptions, setModelOptions] = useState(DEFAULT_MODEL_OPTIONS);
  const [loadingModels, setLoadingModels] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const aiProviderService = AIProviderService.getInstance();
  
  const [formData, setFormData] = useState<AINodeConfig>({
    modelProvider: config?.modelProvider || 'openai',
    model: config?.model || 'gpt-3.5-turbo',
    systemPrompt: config?.systemPrompt || `You are a helpful AI assistant for a CRM system with full access to CRM tools including user assignment capabilities.

IMPORTANT: When creating any CRM records (deals, contacts, companies, tasks, activities), always consider user assignment:
- Use search_users tool to find available users for assignment
- Assign records to appropriate users based on context (deal owner, task assignee, contact manager)
- Include user assignment in all creation operations to ensure proper workflow distribution
- You can assign multiple users when appropriate

Available tools include:
- search_users: Find available users for assignment
- create_contact: Create contacts with assignedTo parameter  
- create_deal: Create deals with ownerId parameter
- create_company: Create companies with ownerId parameter
- create_task: Create tasks with assignedTo parameter
- create_activity: Log activities with assignedTo parameter
- assign_owner: Reassign ownership of existing records

Always provide helpful, accurate information and take appropriate actions using the available CRM tools.`,
    userPrompt: config?.userPrompt || '',
    temperature: config?.temperature || 0.7,
    maxTokens: config?.maxTokens || 1000,
    outputFormat: config?.outputFormat || 'text',
    chainOfThought: config?.chainOfThought || false,
    enableTools: config?.enableTools || false,
    selectedTools: config?.selectedTools || [],
    autoExecuteTools: config?.autoExecuteTools || false,
  });
  const [showTemplates, setShowTemplates] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'advanced' | 'tools'>('config');
  
  const toolRegistry = ToolRegistry.getInstance();
  const availableTools = toolRegistry.getAllTools();

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
    loadUserAndModels();
  }, [config]);

  const loadUserAndModels = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        await aiProviderService.initialize(user.id);
        // Load models for current provider
        await fetchModelsForProvider(formData.modelProvider);
      }
    } catch (error) {
    }
  };

  const fetchModelsForProvider = async (provider: AINodeConfig['modelProvider'], forceRefresh = false) => {
    setLoadingModels(true);
    try {
      const models = await aiProviderService.fetchModelsForProvider(provider, forceRefresh);
      if (models.length > 0) {
        setModelOptions(prev => ({
          ...prev,
          [provider]: models
        }));
      }
    } catch (error) {
    } finally {
      setLoadingModels(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  const handleProviderChange = async (provider: AINodeConfig['modelProvider']) => {
    await fetchModelsForProvider(provider);
    const defaultModel = modelOptions[provider]?.[0]?.value || DEFAULT_MODEL_OPTIONS[provider]?.[0]?.value || '';
    setFormData({ ...formData, modelProvider: provider, model: defaultModel });
  };

  const handleTemplateSelect = (template: PromptTemplate) => {
    setFormData({
      ...formData,
      systemPrompt: template.systemPrompt,
      userPrompt: template.userPrompt,
      modelProvider: template.modelProvider as AINodeConfig['modelProvider'],
      model: template.model,
      temperature: template.temperature,
      maxTokens: template.maxTokens,
      outputFormat: template.outputFormat || 'text',
      chainOfThought: template.chainOfThought || false,
      templateId: template.id,
    });
    setShowTemplates(false);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Sparkles className="w-5 h-5 text-purple-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">Configure AI Agent</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-140px)]">
            {/* Template Selection Bar */}
            <div className="px-6 py-3 bg-gray-800/50 border-b border-gray-800">
              <button
                type="button"
                onClick={() => setShowTemplates(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600/40 rounded-lg text-purple-400 text-sm transition-colors"
              >
                <FileText className="w-4 h-4" />
                Browse Templates
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-800">
              <div className="flex px-6">
                <button
                  type="button"
                  onClick={() => setActiveTab('config')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'config'
                      ? 'text-purple-400 border-purple-400'
                      : 'text-gray-400 border-transparent hover:text-gray-300'
                  }`}
                >
                  Configuration
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('advanced')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'advanced'
                      ? 'text-purple-400 border-purple-400'
                      : 'text-gray-400 border-transparent hover:text-gray-300'
                  }`}
                >
                  Advanced
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('tools')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'tools'
                      ? 'text-purple-400 border-purple-400'
                      : 'text-gray-400 border-transparent hover:text-gray-300'
                  }`}
                >
                  Tools
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {activeTab === 'config' ? (
                <>
                  {/* Model Provider */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Model Provider
                    </label>
                    <select
                      value={formData.modelProvider}
                      onChange={(e) => handleProviderChange(e.target.value as AINodeConfig['modelProvider'])}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="openrouter">OpenRouter</option>
                      <option value="gemini">Google Gemini</option>
                    </select>
                  </div>

                  {/* Model Selection */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-300">
                        Model
                      </label>
                      <button
                        type="button"
                        onClick={() => fetchModelsForProvider(formData.modelProvider, true)}
                        disabled={loadingModels}
                        className="p-1 hover:bg-gray-800 rounded transition-colors"
                        title="Refresh model list"
                      >
                        <RefreshCw className={`w-4 h-4 text-gray-400 ${loadingModels ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                    <select
                      value={formData.model}
                      onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      disabled={loadingModels}
                    >
                      {(modelOptions[formData.modelProvider] || DEFAULT_MODEL_OPTIONS[formData.modelProvider] || []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {loadingModels && (
                      <p className="text-xs text-gray-500 mt-1">Loading available models...</p>
                    )}
                  </div>

                  {/* System Prompt */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-300">
                        System Prompt
                      </label>
                      <VariablePicker
                        onInsert={(variable) => {
                          const newValue = formData.systemPrompt + variable;
                          setFormData({ ...formData, systemPrompt: newValue });
                        }}
                        buttonText="Insert Variable"
                        formFields={formFields}
                      />
                    </div>
                    <textarea
                      value={formData.systemPrompt}
                      onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm"
                      placeholder="Define the AI's role and behavior..."
                    />
                  </div>

                  {/* User Prompt */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-300">
                        User Prompt Template
                      </label>
                      <VariablePicker
                        onInsert={(variable) => {
                          const newValue = formData.userPrompt + variable;
                          setFormData({ ...formData, userPrompt: newValue });
                        }}
                        buttonText="Insert Variable"
                        formFields={formFields}
                      />
                    </div>
                    <div className="mb-2 p-3 bg-blue-900/20 border border-blue-800/50 rounded-lg">
                      <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 text-blue-400 mt-0.5" />
                        <div className="text-xs text-blue-300">
                          <p>Use variables from workflow data with {'{{variableName}}'} syntax.</p>
                          <p className="mt-1">Click "Insert Variable" to see available form fields and workflow variables.</p>
                        </div>
                      </div>
                    </div>
                    <textarea
                      value={formData.userPrompt}
                      onChange={(e) => setFormData({ ...formData, userPrompt: e.target.value })}
                      rows={4}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm"
                      placeholder="Process the following form submission: {{formData.fields.name}} submitted {{formData.fields.email}}..."
                    />
                  </div>

                  {/* Basic Settings */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Temperature
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        value={formData.temperature}
                        onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">0 = Focused, 2 = Creative</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Max Tokens
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="4000"
                        value={formData.maxTokens}
                        onChange={(e) => setFormData({ ...formData, maxTokens: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">Maximum response length</p>
                    </div>
                  </div>
                </>
              ) : activeTab === 'advanced' ? (
                <>
                  {/* Advanced Tab */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Output Format
                    </label>
                    <select
                      value={formData.outputFormat}
                      onChange={(e) => setFormData({ ...formData, outputFormat: e.target.value as any })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="text">Plain Text</option>
                      <option value="json">JSON</option>
                      <option value="structured">Structured Output</option>
                    </select>
                  </div>

                  {formData.outputFormat === 'json' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        <Code className="w-4 h-4 inline mr-1" />
                        JSON Schema (Optional)
                      </label>
                      <textarea
                        value={formData.jsonSchema ? JSON.stringify(formData.jsonSchema, null, 2) : ''}
                        onChange={(e) => {
                          try {
                            setFormData({ ...formData, jsonSchema: JSON.parse(e.target.value) });
                          } catch {
                            // Invalid JSON, just store as string for now
                            setFormData({ ...formData, jsonSchema: e.target.value });
                          }
                        }}
                        rows={4}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-xs"
                        placeholder='{\n  "type": "object",\n  "properties": {\n    "decision": { "type": "string" }\n  }\n}'
                      />
                    </div>
                  )}

                  <div className="space-y-3">
                    <label className="flex items-center gap-3 text-gray-300">
                      <input
                        type="checkbox"
                        checked={formData.chainOfThought || false}
                        onChange={(e) => setFormData({ ...formData, chainOfThought: e.target.checked })}
                        className="rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <Brain className="w-4 h-4 text-purple-400" />
                          <span className="text-sm font-medium">Enable Chain of Thought</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          AI will explain its reasoning step-by-step
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Examples Section */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Few-Shot Examples (Optional)
                    </label>
                    <div className="space-y-2">
                      {(formData.fewShotExamples || []).map((example, index) => (
                        <div key={index} className="p-3 bg-gray-800 rounded-lg space-y-2">
                          <input
                            type="text"
                            value={example.input}
                            onChange={(e) => {
                              const newExamples = [...(formData.fewShotExamples || [])];
                              newExamples[index].input = e.target.value;
                              setFormData({ ...formData, fewShotExamples: newExamples });
                            }}
                            placeholder="Example input"
                            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                          />
                          <input
                            type="text"
                            value={example.output}
                            onChange={(e) => {
                              const newExamples = [...(formData.fewShotExamples || [])];
                              newExamples[index].output = e.target.value;
                              setFormData({ ...formData, fewShotExamples: newExamples });
                            }}
                            placeholder="Expected output"
                            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const newExamples = [...(formData.fewShotExamples || [])];
                              newExamples.splice(index, 1);
                              setFormData({ ...formData, fewShotExamples: newExamples });
                            }}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            fewShotExamples: [...(formData.fewShotExamples || []), { input: '', output: '' }],
                          });
                        }}
                        className="text-sm text-purple-400 hover:text-purple-300"
                      >
                        + Add Example
                      </button>
                    </div>
                  </div>

                  {/* Field Extraction Rules */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Field Extraction Rules (Optional)
                    </label>
                    <div className="space-y-2">
                      {(formData.extractionRules || []).map((rule, index) => (
                        <div key={index} className="p-3 bg-gray-800 rounded-lg space-y-2">
                          <div className="grid grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={rule.field}
                              onChange={(e) => {
                                const newRules = [...(formData.extractionRules || [])];
                                newRules[index].field = e.target.value;
                                setFormData({ ...formData, extractionRules: newRules });
                              }}
                              placeholder="Field name"
                              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                            />
                            <select
                              value={rule.type}
                              onChange={(e) => {
                                const newRules = [...(formData.extractionRules || [])];
                                newRules[index].type = e.target.value as any;
                                setFormData({ ...formData, extractionRules: newRules });
                              }}
                              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                            >
                              <option value="string">String</option>
                              <option value="number">Number</option>
                              <option value="boolean">Boolean</option>
                              <option value="array">Array</option>
                              <option value="object">Object</option>
                            </select>
                            <input
                              type="text"
                              value={rule.path || ''}
                              onChange={(e) => {
                                const newRules = [...(formData.extractionRules || [])];
                                newRules[index].path = e.target.value;
                                setFormData({ ...formData, extractionRules: newRules });
                              }}
                              placeholder="Path (optional)"
                              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 text-sm text-gray-300">
                              <input
                                type="checkbox"
                                checked={rule.required || false}
                                onChange={(e) => {
                                  const newRules = [...(formData.extractionRules || [])];
                                  newRules[index].required = e.target.checked;
                                  setFormData({ ...formData, extractionRules: newRules });
                                }}
                                className="rounded border-gray-600 bg-gray-800 text-purple-600"
                              />
                              Required
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                const newRules = [...(formData.extractionRules || [])];
                                newRules.splice(index, 1);
                                setFormData({ ...formData, extractionRules: newRules });
                              }}
                              className="text-xs text-red-400 hover:text-red-300"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            extractionRules: [...(formData.extractionRules || []), { field: '', type: 'string', required: false }],
                          });
                        }}
                        className="text-sm text-purple-400 hover:text-purple-300"
                      >
                        + Add Extraction Rule
                      </button>
                    </div>
                  </div>

                  {/* Retry Settings */}
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 text-gray-300">
                      <input
                        type="checkbox"
                        checked={formData.retryOnError || false}
                        onChange={(e) => setFormData({ ...formData, retryOnError: e.target.checked })}
                        className="rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500"
                      />
                      <div>
                        <span className="text-sm font-medium">Enable Retry on Error</span>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Automatically retry failed API calls
                        </p>
                      </div>
                    </label>
                    
                    {formData.retryOnError && (
                      <div className="ml-6">
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                          Max Retries
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="5"
                          value={formData.maxRetries || 3}
                          onChange={(e) => setFormData({ ...formData, maxRetries: parseInt(e.target.value) })}
                          className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white"
                        />
                      </div>
                    )}
                  </div>
                </>
              ) : activeTab === 'tools' ? (
                <>
                  {/* Tools Tab */}
                  <div>
                    <label className="flex items-center gap-3 text-gray-300 mb-4">
                      <input
                        type="checkbox"
                        checked={formData.enableTools || false}
                        onChange={(e) => setFormData({ ...formData, enableTools: e.target.checked })}
                        className="rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-purple-400" />
                          <span className="text-sm font-medium">Enable CRM Tools</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Allow AI to query and interact with CRM data
                        </p>
                      </div>
                    </label>

                    {formData.enableTools && (
                      <>
                        <div className="mb-4">
                          <label className="flex items-center gap-3 text-gray-300">
                            <input
                              type="checkbox"
                              checked={formData.autoExecuteTools || false}
                              onChange={(e) => setFormData({ ...formData, autoExecuteTools: e.target.checked })}
                              className="rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500"
                            />
                            <div>
                              <span className="text-sm font-medium">Auto-execute Tools</span>
                              <p className="text-xs text-gray-500 mt-0.5">
                                Automatically execute tools when AI requests them
                              </p>
                            </div>
                          </label>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-3">
                            Available Tools
                          </label>
                          <div className="space-y-3">
                            {/* Group tools by category */}
                            {Object.entries(
                              availableTools.reduce((acc, tool) => {
                                if (!acc[tool.category]) acc[tool.category] = [];
                                acc[tool.category].push(tool);
                                return acc;
                              }, {} as Record<string, typeof availableTools>)
                            ).map(([category, tools]) => (
                              <div key={category} className="p-3 bg-gray-800 rounded-lg">
                                <h4 className="text-sm font-medium text-purple-400 mb-2 capitalize">
                                  {category}
                                </h4>
                                <div className="space-y-2">
                                  {tools.map((tool) => (
                                    <label
                                      key={tool.name}
                                      className="flex items-start gap-3 text-gray-300 hover:bg-gray-700/50 p-2 rounded transition-colors"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={(formData.selectedTools || []).includes(tool.name)}
                                        onChange={(e) => {
                                          const selectedTools = formData.selectedTools || [];
                                          if (e.target.checked) {
                                            setFormData({
                                              ...formData,
                                              selectedTools: [...selectedTools, tool.name],
                                            });
                                          } else {
                                            setFormData({
                                              ...formData,
                                              selectedTools: selectedTools.filter(t => t !== tool.name),
                                            });
                                          }
                                        }}
                                        className="rounded border-gray-600 bg-gray-700 text-purple-600 focus:ring-purple-500 mt-0.5"
                                      />
                                      <div className="flex-1">
                                        <div className="text-sm font-medium">{tool.displayName}</div>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                          {tool.description}
                                        </p>
                                      </div>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {formData.selectedTools && formData.selectedTools.length > 0 && (
                          <div className="mt-4 p-3 bg-blue-900/20 border border-blue-800/50 rounded-lg">
                            <div className="flex items-start gap-2">
                              <Info className="w-4 h-4 text-blue-400 mt-0.5" />
                              <div className="text-xs text-blue-300">
                                <p>Selected tools will be available to the AI during execution.</p>
                                <p className="mt-1">The AI will be instructed on how to use these tools properly.</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              ) : null}

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                >
                  Save Configuration
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Prompt Templates Modal */}
      {showTemplates && (
        <PromptTemplatesModal
          isOpen={showTemplates}
          onClose={() => setShowTemplates(false)}
          onSelectTemplate={handleTemplateSelect}
          currentConfig={formData}
        />
      )}
    </>
  );
}