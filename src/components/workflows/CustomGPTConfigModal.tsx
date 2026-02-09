import React, { useState, useEffect } from 'react';
import { X, Bot, Info, MessageSquare, ChevronRight, RefreshCw, Image, Link, Settings, FileText, Code, AlertCircle } from 'lucide-react';
import VariablePicker from './VariablePicker';
import { openaiAssistantService } from '../../lib/services/openaiAssistantService';
import { supabase } from '../../lib/supabase/clientV2';
import { AIProviderService } from '../../lib/services/aiProvider';

export interface CustomGPTNodeConfig {
  assistantId: string;
  assistantName?: string;
  threadId?: string;
  createNewThread: boolean;
  message: string;
  imageFiles?: string[];
  imageUrls?: string[];
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  temperature?: number;
  maxPromptTokens?: number;
  maxCompletionTokens?: number;
  responseFormat?: 'text' | 'json_object';
  truncationStrategy?: {
    type: 'auto' | 'last_messages';
    lastMessages?: number;
  };
  additionalInstructions?: string;
  metadata?: Record<string, string>;
  modelOverride?: string; // Optional model override for the assistant
}

interface CustomGPTConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config?: CustomGPTNodeConfig;
  onSave: (config: CustomGPTNodeConfig) => void;
  availableVariables?: string[];
  formFields?: Array<{ name: string; type: string; label: string }>;
}

interface Assistant {
  id: string;
  name: string;
  description?: string;
  model: string;
  tools?: Array<{ type: string }>;
  file_ids?: string[];
}

export default function CustomGPTConfigModal({
  isOpen,
  onClose,
  config,
  onSave,
  availableVariables = [],
  formFields = [],
}: CustomGPTConfigModalProps) {
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loadingAssistants, setLoadingAssistants] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'advanced' | 'files'>('config');
  const [error, setError] = useState<string | null>(null);
  const [openAIModels, setOpenAIModels] = useState<Array<{ value: string; label: string }>>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const aiProviderService = AIProviderService.getInstance();
  
  const [formData, setFormData] = useState<CustomGPTNodeConfig>({
    assistantId: config?.assistantId || '',
    assistantName: config?.assistantName || '',
    threadId: config?.threadId || '',
    createNewThread: config?.createNewThread !== false,
    message: config?.message || '',
    imageFiles: config?.imageFiles || [],
    imageUrls: config?.imageUrls || [],
    toolChoice: config?.toolChoice || 'auto',
    temperature: config?.temperature,
    maxPromptTokens: config?.maxPromptTokens || 20000,
    maxCompletionTokens: config?.maxCompletionTokens || 4000,
    responseFormat: config?.responseFormat || 'text',
    truncationStrategy: config?.truncationStrategy || { type: 'auto' },
    additionalInstructions: config?.additionalInstructions || '',
    metadata: config?.metadata || {},
    modelOverride: config?.modelOverride || '',
  });

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
    if (isOpen) {
      loadAssistants();
      loadOpenAIModels();
    }
  }, [config, isOpen]);

  const loadAssistants = async () => {
    setLoadingAssistants(true);
    setError(null);
    try {
      // Initialize the OpenAI service with user's API key
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await openaiAssistantService.initialize(user.id);
      } else {
        // Try to initialize without user ID (will use environment variable)
        await openaiAssistantService.initialize();
      }
      
      const assistantsList = await openaiAssistantService.listAssistants();
      setAssistants(assistantsList);
      
      // If no assistant is selected and we have assistants, select the first one
      if (!formData.assistantId && assistantsList.length > 0) {
        setFormData(prev => ({
          ...prev,
          assistantId: assistantsList[0].id,
          assistantName: assistantsList[0].name,
        }));
      }
    } catch (error) {
      setError('Failed to load assistants. Please add your OpenAI API key in Settings > AI Provider Settings.');
      setAssistants([]);
    } finally {
      setLoadingAssistants(false);
    }
  };

  const loadOpenAIModels = async () => {
    setLoadingModels(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await aiProviderService.initialize(user.id);
      }
      const models = await aiProviderService.fetchModelsForProvider('openai');
      if (models.length > 0) {
        setOpenAIModels(models);
      } else {
        // Fallback to default models
        setOpenAIModels([
          { value: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo' },
          { value: 'gpt-4', label: 'GPT-4' },
          { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
        ]);
      }
    } catch (error) {
      // Fallback to default models
      setOpenAIModels([
        { value: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo' },
        { value: 'gpt-4', label: 'GPT-4' },
        { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
      ]);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleAssistantChange = (assistantId: string) => {
    const assistant = assistants.find(a => a.id === assistantId);
    if (assistant) {
      setFormData(prev => ({
        ...prev,
        assistantId: assistant.id,
        assistantName: assistant.name,
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.assistantId) {
      setError('Please select an assistant');
      return;
    }
    if (!formData.message.trim()) {
      setError('Please enter a message template');
      return;
    }
    onSave(formData);
    onClose();
  };

  const handleAddImageUrl = () => {
    const url = prompt('Enter image URL:');
    if (url) {
      setFormData(prev => ({
        ...prev,
        imageUrls: [...(prev.imageUrls || []), url],
      }));
    }
  };

  const removeImageUrl = (index: number) => {
    setFormData(prev => ({
      ...prev,
      imageUrls: prev.imageUrls?.filter((_, i) => i !== index) || [],
    }));
  };

  if (!isOpen) return null;

  const selectedAssistant = assistants.find(a => a.id === formData.assistantId);
  const hasCodeInterpreter = selectedAssistant?.tools?.some(t => t.type === 'code_interpreter');
  const hasFileSearch = selectedAssistant?.tools?.some(t => t.type === 'file_search');
  const hasFunctions = selectedAssistant?.tools?.some(t => t.type === 'function');

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-lg">
              <Bot className="w-5 h-5 text-emerald-400" />
            </div>
            <h2 className="text-xl font-semibold text-white">Configure Custom GPT</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Error Display */}
          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-900/20 border border-red-800/50 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="border-b border-gray-800">
            <div className="flex px-6">
              <button
                type="button"
                onClick={() => setActiveTab('config')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'config'
                    ? 'text-emerald-400 border-emerald-400'
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
                    ? 'text-emerald-400 border-emerald-400'
                    : 'text-gray-400 border-transparent hover:text-gray-300'
                }`}
              >
                Advanced
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('files')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'files'
                    ? 'text-emerald-400 border-emerald-400'
                    : 'text-gray-400 border-transparent hover:text-gray-300'
                }`}
              >
                Files & Images
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {activeTab === 'config' ? (
              <>
                {/* Assistant Selection */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-300">
                      Select Assistant
                    </label>
                    <button
                      type="button"
                      onClick={loadAssistants}
                      disabled={loadingAssistants}
                      className="p-1 hover:bg-gray-800 rounded transition-colors"
                      title="Refresh assistants list"
                    >
                      <RefreshCw className={`w-4 h-4 text-gray-400 ${loadingAssistants ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  
                  {loadingAssistants ? (
                    <div className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400">
                      Loading assistants...
                    </div>
                  ) : assistants.length > 0 ? (
                    <select
                      value={formData.assistantId}
                      onChange={(e) => handleAssistantChange(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    >
                      <option value="">Select an assistant...</option>
                      {assistants.map((assistant) => (
                        <option key={assistant.id} value={assistant.id}>
                          {assistant.name} ({assistant.model})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400">
                      No assistants found. Please create an assistant in the OpenAI dashboard first.
                    </div>
                  )}
                  
                  {selectedAssistant && (
                    <div className="mt-2 p-2 bg-gray-800/50 rounded-lg">
                      <p className="text-xs text-gray-400">
                        {selectedAssistant.description || 'No description available'}
                      </p>
                      <div className="flex gap-2 mt-1">
                        {hasCodeInterpreter && (
                          <span className="px-2 py-0.5 bg-blue-900/30 text-blue-400 text-xs rounded">
                            <Code className="w-3 h-3 inline mr-1" />
                            Code Interpreter
                          </span>
                        )}
                        {hasFileSearch && (
                          <span className="px-2 py-0.5 bg-green-900/30 text-green-400 text-xs rounded">
                            <FileText className="w-3 h-3 inline mr-1" />
                            File Search
                          </span>
                        )}
                        {hasFunctions && (
                          <span className="px-2 py-0.5 bg-purple-900/30 text-purple-400 text-xs rounded">
                            Functions
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Thread Management */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Thread Management
                  </label>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 text-gray-300">
                      <input
                        type="checkbox"
                        checked={formData.createNewThread}
                        onChange={(e) => setFormData({ ...formData, createNewThread: e.target.checked })}
                        className="rounded border-gray-600 bg-gray-800 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <span className="text-sm font-medium">Create New Thread</span>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Start a fresh conversation for each execution
                        </p>
                      </div>
                    </label>
                    
                    {!formData.createNewThread && (
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">
                          Thread ID (Optional)
                        </label>
                        <input
                          type="text"
                          value={formData.threadId || ''}
                          onChange={(e) => setFormData({ ...formData, threadId: e.target.value })}
                          placeholder="thread_abc123... (leave empty to auto-create)"
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Reuse an existing thread to maintain conversation context
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Message Template */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-300">
                      Message Template
                    </label>
                    <VariablePicker
                      onInsert={(variable) => {
                        const newValue = formData.message + variable;
                        setFormData({ ...formData, message: newValue });
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
                        <p className="mt-1">This message will be sent to your Custom GPT assistant.</p>
                      </div>
                    </div>
                  </div>
                  <textarea
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm"
                    placeholder="Process the following data: {{formData.fields.name}} - {{formData.fields.email}}..."
                    required
                  />
                </div>
              </>
            ) : activeTab === 'advanced' ? (
              <>
                {/* Tool Choice */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Tool Choice
                  </label>
                  <select
                    value={typeof formData.toolChoice === 'object' ? 'function' : formData.toolChoice}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFormData({ 
                        ...formData, 
                        toolChoice: value as 'auto' | 'none' | 'required'
                      });
                    }}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="auto">Auto (Let assistant decide)</option>
                    <option value="none">None (No tools)</option>
                    <option value="required">Required (Must use a tool)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Controls which (if any) tool is called by the model
                  </p>
                </div>

                {/* Model Override */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-300">
                      Model Override (Optional)
                    </label>
                    <button
                      type="button"
                      onClick={() => loadOpenAIModels()}
                      disabled={loadingModels}
                      className="p-1 hover:bg-gray-800 rounded transition-colors"
                      title="Refresh model list"
                    >
                      <RefreshCw className={`w-4 h-4 text-gray-400 ${loadingModels ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  <select
                    value={formData.modelOverride || ''}
                    onChange={(e) => setFormData({ ...formData, modelOverride: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    disabled={loadingModels}
                  >
                    <option value="">Use assistant's default model</option>
                    {openAIModels.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Override the assistant's model for this execution only
                  </p>
                </div>

                {/* Temperature */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Temperature (Optional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={formData.temperature || ''}
                    onChange={(e) => setFormData({ ...formData, temperature: e.target.value ? parseFloat(e.target.value) : undefined })}
                    placeholder="Default: 1.0"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">0 = Focused, 2 = Creative</p>
                </div>

                {/* Token Limits */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Max Prompt Tokens
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="128000"
                      value={formData.maxPromptTokens}
                      onChange={(e) => setFormData({ ...formData, maxPromptTokens: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Max context tokens</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Max Completion Tokens
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="4096"
                      value={formData.maxCompletionTokens}
                      onChange={(e) => setFormData({ ...formData, maxCompletionTokens: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Max response tokens</p>
                  </div>
                </div>

                {/* Response Format */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Response Format
                  </label>
                  <select
                    value={formData.responseFormat}
                    onChange={(e) => setFormData({ ...formData, responseFormat: e.target.value as 'text' | 'json_object' })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="text">Text</option>
                    <option value="json_object">JSON Object</option>
                  </select>
                  {formData.responseFormat === 'json_object' && (
                    <p className="text-xs text-amber-500 mt-1">
                      ⚠️ Ensure your assistant's instructions mention JSON output
                    </p>
                  )}
                </div>

                {/* Truncation Strategy */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Truncation Strategy
                  </label>
                  <select
                    value={formData.truncationStrategy?.type || 'auto'}
                    onChange={(e) => {
                      const type = e.target.value as 'auto' | 'last_messages';
                      setFormData({ 
                        ...formData, 
                        truncationStrategy: {
                          type,
                          ...(type === 'last_messages' ? { lastMessages: 20 } : {})
                        }
                      });
                    }}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="auto">Auto</option>
                    <option value="last_messages">Last Messages</option>
                  </select>
                  
                  {formData.truncationStrategy?.type === 'last_messages' && (
                    <div className="mt-2">
                      <label className="block text-xs font-medium text-gray-400 mb-1">
                        Number of Last Messages
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={formData.truncationStrategy.lastMessages || 20}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          truncationStrategy: {
                            ...formData.truncationStrategy!,
                            lastMessages: parseInt(e.target.value)
                          }
                        })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  )}
                </div>

                {/* Additional Instructions */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-300">
                      Additional Instructions (Optional)
                    </label>
                    <VariablePicker
                      onInsert={(variable) => {
                        const newValue = (formData.additionalInstructions || '') + variable;
                        setFormData({ ...formData, additionalInstructions: newValue });
                      }}
                      buttonText="Insert Variable"
                      formFields={formFields}
                    />
                  </div>
                  <textarea
                    value={formData.additionalInstructions || ''}
                    onChange={(e) => setFormData({ ...formData, additionalInstructions: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm"
                    placeholder="Additional context or instructions for this specific run..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Appended to the assistant's instructions for this run only
                  </p>
                </div>
              </>
            ) : activeTab === 'files' ? (
              <>
                {/* Image URLs */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <Image className="w-4 h-4 inline mr-1" />
                    Image URLs
                  </label>
                  {formData.imageUrls && formData.imageUrls.length > 0 ? (
                    <div className="space-y-2 mb-2">
                      {formData.imageUrls.map((url, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={url}
                            readOnly
                            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => removeImageUrl(index)}
                            className="p-2 text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 mb-2">No image URLs added</p>
                  )}
                  <button
                    type="button"
                    onClick={handleAddImageUrl}
                    className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/40 rounded-lg text-emerald-400 text-sm transition-colors"
                  >
                    <Link className="w-4 h-4 inline mr-1" />
                    Add Image URL
                  </button>
                  <p className="text-xs text-gray-500 mt-2">
                    Only supported for vision-compatible models
                  </p>
                </div>

                {/* File Upload Info */}
                <div className="p-4 bg-blue-900/20 border border-blue-800/50 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-400 mt-0.5" />
                    <div className="text-xs text-blue-300">
                      <p className="font-medium mb-1">File Upload Support</p>
                      <p>File uploads can be configured if your assistant has:</p>
                      <ul className="list-disc list-inside mt-1 space-y-0.5">
                        <li>Code Interpreter enabled for code/data files</li>
                        <li>File Search enabled for document search</li>
                      </ul>
                      <p className="mt-2">Files should be uploaded to the assistant beforehand via the OpenAI dashboard.</p>
                    </div>
                  </div>
                </div>

                {/* Metadata */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <Settings className="w-4 h-4 inline mr-1" />
                    Metadata (Optional)
                  </label>
                  <div className="space-y-2">
                    {Object.entries(formData.metadata || {}).map(([key, value], index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={key}
                          onChange={(e) => {
                            const newMetadata = { ...formData.metadata };
                            delete newMetadata[key];
                            newMetadata[e.target.value] = value;
                            setFormData({ ...formData, metadata: newMetadata });
                          }}
                          placeholder="Key"
                          className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white"
                        />
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => {
                            setFormData({ 
                              ...formData, 
                              metadata: { ...formData.metadata, [key]: e.target.value }
                            });
                          }}
                          placeholder="Value"
                          className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newMetadata = { ...formData.metadata };
                            delete newMetadata[key];
                            setFormData({ ...formData, metadata: newMetadata });
                          }}
                          className="p-1 text-red-400 hover:bg-red-900/20 rounded transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ 
                          ...formData, 
                          metadata: { ...formData.metadata, [`key_${Object.keys(formData.metadata || {}).length + 1}`]: '' }
                        });
                      }}
                      className="text-sm text-emerald-400 hover:text-emerald-300"
                    >
                      + Add Metadata
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Set of 16 key-value pairs for storing additional information
                  </p>
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
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}