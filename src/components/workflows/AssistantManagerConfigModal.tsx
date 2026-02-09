import React, { useState, useEffect, useCallback } from 'react';
import { X, Settings, Info, Plus, Edit2, RefreshCw, Upload, FileText, Code, Database, Trash2, AlertCircle, ChevronRight, Sparkles } from 'lucide-react';
import VariablePicker from './VariablePicker';
import { openaiAssistantService } from '../../lib/services/openaiAssistantService';
import { AIProviderService } from '../../lib/services/aiProvider';
import { supabase } from '../../lib/supabase/clientV2';

export interface AssistantManagerNodeConfig {
  operation: 'create' | 'update';
  assistantId?: string;
  assistantName: string;
  description?: string;
  model: string;
  instructions: string;
  tools?: {
    codeInterpreter?: boolean;
    fileSearch?: boolean;
    functions?: Array<{
      name: string;
      description: string;
      parameters: any;
    }>;
  };
  files?: Array<{
    id: string;
    name: string;
    size: number;
    type: string;
  }>;
  vectorStoreId?: string;
  vectorStoreName?: string;
  vectorStoreExpiration?: {
    anchor: 'last_active_at';
    days: number;
  };
  metadata?: Record<string, string>;
  temperature?: number;
  topP?: number;
  responseFormat?: 'text' | 'json_object';
}

interface AssistantManagerConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config?: AssistantManagerNodeConfig;
  onSave: (config: AssistantManagerNodeConfig) => void;
  availableVariables?: string[];
  formFields?: Array<{ name: string; type: string; label: string }>;
}

interface Assistant {
  id: string;
  name: string;
  description?: string;
  model: string;
  instructions?: string;
  tools?: Array<{ type: string }>;
  file_ids?: string[];
  metadata?: Record<string, string>;
}

export default function AssistantManagerConfigModal({
  isOpen,
  onClose,
  config,
  onSave,
  availableVariables = [],
  formFields = [],
}: AssistantManagerConfigModalProps) {
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [models, setModels] = useState<Array<{ value: string; label: string }>>([]);
  const [loadingAssistants, setLoadingAssistants] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'tools' | 'files' | 'advanced'>('basic');
  const [error, setError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const aiProviderService = AIProviderService.getInstance();
  
  const [formData, setFormData] = useState<AssistantManagerNodeConfig>({
    operation: config?.operation || 'create',
    assistantId: config?.assistantId || '',
    assistantName: config?.assistantName || '',
    description: config?.description || '',
    model: config?.model || 'gpt-4-turbo-preview',
    instructions: config?.instructions || 'You are a helpful assistant.',
    tools: config?.tools || {
      codeInterpreter: false,
      fileSearch: false,
      functions: [],
    },
    files: config?.files || [],
    vectorStoreId: config?.vectorStoreId || '',
    vectorStoreName: config?.vectorStoreName || '',
    vectorStoreExpiration: config?.vectorStoreExpiration || {
      anchor: 'last_active_at',
      days: 7,
    },
    metadata: config?.metadata || {},
    temperature: config?.temperature || 1.0,
    topP: config?.topP || 1.0,
    responseFormat: config?.responseFormat || 'text',
  });

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
    if (isOpen) {
      loadAssistants();
      loadModels();
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
    } catch (error) {
      setError('Failed to load assistants. Please add your OpenAI API key in Settings > AI Provider Settings.');
      setAssistants([]);
    } finally {
      setLoadingAssistants(false);
    }
  };

  const loadModels = async () => {
    setLoadingModels(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await aiProviderService.initialize(user.id);
      }
      const modelList = await aiProviderService.fetchOpenAIModels();
      setModels(modelList);
    } catch (error) {
      setModels([
        { value: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo' },
        { value: 'gpt-4', label: 'GPT-4' },
        { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
      ]);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleAssistantSelect = (assistantId: string) => {
    const assistant = assistants.find(a => a.id === assistantId);
    if (assistant) {
      setFormData(prev => ({
        ...prev,
        assistantId: assistant.id,
        assistantName: assistant.name,
        description: assistant.description || '',
        model: assistant.model,
        instructions: assistant.instructions || '',
        tools: {
          codeInterpreter: assistant.tools?.some(t => t.type === 'code_interpreter') || false,
          fileSearch: assistant.tools?.some(t => t.type === 'file_search') || false,
          functions: [], // Would need to fetch function details separately
        },
        metadata: assistant.metadata || {},
      }));
    }
  };

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newFiles = Array.from(files);
      setUploadedFiles(prev => [...prev, ...newFiles]);
      
      // Convert to file format for config
      const fileConfigs = newFiles.map(file => ({
        id: `temp_${Date.now()}_${file.name}`,
        name: file.name,
        size: file.size,
        type: file.type,
      }));
      
      setFormData(prev => ({
        ...prev,
        files: [...(prev.files || []), ...fileConfigs],
      }));
    }
  }, []);

  const removeFile = (fileId: string) => {
    setFormData(prev => ({
      ...prev,
      files: prev.files?.filter(f => f.id !== fileId) || [],
    }));
    // Also remove from uploadedFiles if it's there
    const fileName = formData.files?.find(f => f.id === fileId)?.name;
    if (fileName) {
      setUploadedFiles(prev => prev.filter(f => f.name !== fileName));
    }
  };

  const addFunction = () => {
    setFormData(prev => ({
      ...prev,
      tools: {
        ...prev.tools,
        functions: [
          ...(prev.tools?.functions || []),
          {
            name: '',
            description: '',
            parameters: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
        ],
      },
    }));
  };

  const updateFunction = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      tools: {
        ...prev.tools,
        functions: prev.tools?.functions?.map((fn, i) => 
          i === index ? { ...fn, [field]: value } : fn
        ) || [],
      },
    }));
  };

  const removeFunction = (index: number) => {
    setFormData(prev => ({
      ...prev,
      tools: {
        ...prev.tools,
        functions: prev.tools?.functions?.filter((_, i) => i !== index) || [],
      },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.assistantName.trim()) {
      setError('Please enter an assistant name');
      return;
    }
    
    if (formData.operation === 'update' && !formData.assistantId) {
      setError('Please select an assistant to update');
      return;
    }
    
    if (!formData.model) {
      setError('Please select a model');
      return;
    }
    
    if (!formData.instructions.trim()) {
      setError('Please enter instructions for the assistant');
      return;
    }
    
    onSave(formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-lg">
              <Settings className="w-5 h-5 text-indigo-400" />
            </div>
            <h2 className="text-xl font-semibold text-white">Assistant Manager</h2>
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

          {/* Operation Mode Selection */}
          <div className="px-6 py-4 bg-gray-800/50 border-b border-gray-800">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, operation: 'create' }))}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  formData.operation === 'create'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <Plus className="w-4 h-4" />
                Create New
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, operation: 'update' }))}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  formData.operation === 'update'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <Edit2 className="w-4 h-4" />
                Update Existing
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-800">
            <div className="flex px-6">
              <button
                type="button"
                onClick={() => setActiveTab('basic')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'basic'
                    ? 'text-indigo-400 border-indigo-400'
                    : 'text-gray-400 border-transparent hover:text-gray-300'
                }`}
              >
                Basic Configuration
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('tools')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'tools'
                    ? 'text-indigo-400 border-indigo-400'
                    : 'text-gray-400 border-transparent hover:text-gray-300'
                }`}
              >
                Tools & Capabilities
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('files')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'files'
                    ? 'text-indigo-400 border-indigo-400'
                    : 'text-gray-400 border-transparent hover:text-gray-300'
                }`}
              >
                Files & Vector Store
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('advanced')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'advanced'
                    ? 'text-indigo-400 border-indigo-400'
                    : 'text-gray-400 border-transparent hover:text-gray-300'
                }`}
              >
                Advanced
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {activeTab === 'basic' ? (
              <>
                {/* Assistant Selection (Update Mode) */}
                {formData.operation === 'update' && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-300">
                        Select Assistant to Update
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
                    ) : (
                      <select
                        value={formData.assistantId}
                        onChange={(e) => handleAssistantSelect(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">Select an assistant...</option>
                        {assistants.map((assistant) => (
                          <option key={assistant.id} value={assistant.id}>
                            {assistant.name} ({assistant.model})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* Assistant Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Assistant Name
                  </label>
                  <input
                    type="text"
                    value={formData.assistantName}
                    onChange={(e) => setFormData({ ...formData, assistantName: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="My Custom Assistant"
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="A helpful assistant for..."
                  />
                </div>

                {/* Model Selection */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-300">
                      Model
                    </label>
                    <button
                      type="button"
                      onClick={() => loadModels()}
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
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    disabled={loadingModels}
                    required
                  >
                    {models.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Instructions */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-300">
                      Instructions
                    </label>
                    <VariablePicker
                      onInsert={(variable) => {
                        const newValue = formData.instructions + variable;
                        setFormData({ ...formData, instructions: newValue });
                      }}
                      buttonText="Insert Variable"
                      formFields={formFields}
                    />
                  </div>
                  <textarea
                    value={formData.instructions}
                    onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                    rows={6}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                    placeholder="You are a helpful assistant that..."
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Define the assistant's behavior and capabilities. Use variables for dynamic content.
                  </p>
                </div>
              </>
            ) : activeTab === 'tools' ? (
              <>
                {/* Built-in Tools */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Built-in Tools
                  </label>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 text-gray-300">
                      <input
                        type="checkbox"
                        checked={formData.tools?.codeInterpreter || false}
                        onChange={(e) => setFormData({
                          ...formData,
                          tools: { ...formData.tools, codeInterpreter: e.target.checked }
                        })}
                        className="rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <Code className="w-4 h-4 text-blue-400" />
                          <span className="text-sm font-medium">Code Interpreter</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Run Python code, analyze data, create charts, and process files
                        </p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 text-gray-300">
                      <input
                        type="checkbox"
                        checked={formData.tools?.fileSearch || false}
                        onChange={(e) => setFormData({
                          ...formData,
                          tools: { ...formData.tools, fileSearch: e.target.checked }
                        })}
                        className="rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <Database className="w-4 h-4 text-green-400" />
                          <span className="text-sm font-medium">File Search (Vector Store)</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Search through uploaded documents and retrieve relevant information
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Custom Functions */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-gray-300">
                      Custom Functions
                    </label>
                    <button
                      type="button"
                      onClick={addFunction}
                      className="px-3 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-600/40 rounded-lg text-indigo-400 text-sm transition-colors"
                    >
                      <Plus className="w-4 h-4 inline mr-1" />
                      Add Function
                    </button>
                  </div>

                  {formData.tools?.functions && formData.tools.functions.length > 0 ? (
                    <div className="space-y-3">
                      {formData.tools.functions.map((fn, index) => (
                        <div key={index} className="p-3 bg-gray-800 rounded-lg space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-2">
                              <input
                                type="text"
                                value={fn.name}
                                onChange={(e) => updateFunction(index, 'name', e.target.value)}
                                placeholder="Function name"
                                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                              />
                              <input
                                type="text"
                                value={fn.description}
                                onChange={(e) => updateFunction(index, 'description', e.target.value)}
                                placeholder="Function description"
                                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                              />
                              <textarea
                                value={typeof fn.parameters === 'string' ? fn.parameters : JSON.stringify(fn.parameters, null, 2)}
                                onChange={(e) => {
                                  try {
                                    updateFunction(index, 'parameters', JSON.parse(e.target.value));
                                  } catch {
                                    updateFunction(index, 'parameters', e.target.value);
                                  }
                                }}
                                placeholder="Parameters JSON schema"
                                rows={3}
                                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white font-mono"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFunction(index)}
                              className="p-1 text-red-400 hover:bg-red-900/20 rounded transition-colors ml-2"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No custom functions defined</p>
                  )}
                </div>
              </>
            ) : activeTab === 'files' ? (
              <>
                {/* File Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Upload Files
                  </label>
                  <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center hover:border-gray-600 transition-colors">
                    <input
                      type="file"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                      id="file-upload"
                      accept=".pdf,.txt,.csv,.json,.md,.docx,.xlsx"
                    />
                    <label
                      htmlFor="file-upload"
                      className="cursor-pointer flex flex-col items-center"
                    >
                      <Upload className="w-8 h-8 text-gray-500 mb-2" />
                      <span className="text-sm text-gray-400">
                        Click to upload or drag and drop
                      </span>
                      <span className="text-xs text-gray-500 mt-1">
                        PDF, TXT, CSV, JSON, MD, DOCX, XLSX
                      </span>
                    </label>
                  </div>

                  {/* File List */}
                  {formData.files && formData.files.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {formData.files.map((file) => (
                        <div key={file.id} className="flex items-center justify-between p-2 bg-gray-800 rounded-lg">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-300">{file.name}</span>
                            <span className="text-xs text-gray-500">
                              ({(file.size / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFile(file.id)}
                            className="p-1 text-red-400 hover:bg-red-900/20 rounded transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Vector Store Configuration */}
                {formData.tools?.fileSearch && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Vector Store Configuration
                    </label>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">
                          Vector Store Name
                        </label>
                        <input
                          type="text"
                          value={formData.vectorStoreName}
                          onChange={(e) => setFormData({ ...formData, vectorStoreName: e.target.value })}
                          placeholder="My Knowledge Base"
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">
                          Expiration (Days)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={formData.vectorStoreExpiration?.days || 7}
                          onChange={(e) => setFormData({
                            ...formData,
                            vectorStoreExpiration: {
                              anchor: 'last_active_at',
                              days: parseInt(e.target.value) || 7,
                            }
                          })}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Vector store will expire after this many days of inactivity (helps manage costs)
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Info Box */}
                <div className="p-4 bg-blue-900/20 border border-blue-800/50 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-400 mt-0.5" />
                    <div className="text-xs text-blue-300">
                      <p className="font-medium mb-1">File Processing</p>
                      <p>Files will be automatically uploaded to OpenAI and processed for use with the assistant.</p>
                      <p className="mt-1">For File Search, files are chunked and embedded in a vector store.</p>
                      <p className="mt-1">For Code Interpreter, files can be accessed and processed by Python code.</p>
                    </div>
                  </div>
                </div>
              </>
            ) : activeTab === 'advanced' ? (
              <>
                {/* Temperature */}
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
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">0 = Focused, 2 = Creative</p>
                </div>

                {/* Top P */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Top P
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.1"
                    value={formData.topP}
                    onChange={(e) => setFormData({ ...formData, topP: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Nucleus sampling parameter</p>
                </div>

                {/* Response Format */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Response Format
                  </label>
                  <select
                    value={formData.responseFormat}
                    onChange={(e) => setFormData({ ...formData, responseFormat: e.target.value as 'text' | 'json_object' })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="text">Text</option>
                    <option value="json_object">JSON Object</option>
                  </select>
                  {formData.responseFormat === 'json_object' && (
                    <p className="text-xs text-amber-500 mt-1">
                      ⚠️ Ensure your instructions mention JSON output
                    </p>
                  )}
                </div>

                {/* Metadata */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Metadata
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
                      className="text-sm text-indigo-400 hover:text-indigo-300"
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
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                {formData.operation === 'create' ? (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Assistant
                  </>
                ) : (
                  <>
                    <Edit2 className="w-4 h-4" />
                    Update Assistant
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}