import { supabase } from '../supabase/clientV2';
import { interpolateVariables, VariableContext } from '../utils/promptVariables';

export interface Assistant {
  id: string;
  name: string;
  description?: string;
  model: string;
  instructions?: string;
  tools?: Array<{ type: string }>;
  file_ids?: string[];
  metadata?: Record<string, string>;
}

export interface Thread {
  id: string;
  metadata?: Record<string, string>;
  created_at: number;
}

export interface Message {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant';
  content: Array<{
    type: 'text' | 'image_file' | 'image_url';
    text?: { value: string; annotations?: any[] };
    image_file?: { file_id: string };
    image_url?: { url: string; detail?: 'auto' | 'low' | 'high' };
  }>;
  file_ids?: string[];
  assistant_id?: string;
  run_id?: string;
  metadata?: Record<string, string>;
  created_at: number;
}

export interface Run {
  id: string;
  thread_id: string;
  assistant_id: string;
  status: 'queued' | 'in_progress' | 'requires_action' | 'cancelling' | 'cancelled' | 'failed' | 'completed' | 'expired';
  required_action?: {
    type: 'submit_tool_outputs';
    submit_tool_outputs: {
      tool_calls: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
  };
  last_error?: {
    code: string;
    message: string;
  };
  metadata?: Record<string, string>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  created_at: number;
  started_at?: number;
  completed_at?: number;
  failed_at?: number;
  cancelled_at?: number;
}

export interface AssistantResponse {
  threadId: string;
  messageId: string;
  runId: string;
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string;
  metadata?: Record<string, string>;
}

interface RunConfig {
  assistantId: string;
  additionalInstructions?: string;
  metadata?: Record<string, string>;
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  temperature?: number;
  maxPromptTokens?: number;
  maxCompletionTokens?: number;
  responseFormat?: 'text' | 'json_object';
  truncationStrategy?: {
    type: 'auto' | 'last_messages';
    lastMessages?: number;
  };
}

/**
 * Service for managing OpenAI Assistant API interactions
 */
class OpenAIAssistantService {
  private static instance: OpenAIAssistantService;
  private apiKey: string | null = null;
  private baseUrl = 'https://api.openai.com/v1';
  private pollingInterval = 1000; // 1 second
  private maxPollingAttempts = 60; // 60 seconds max

  private constructor() {}

  public static getInstance(): OpenAIAssistantService {
    if (!OpenAIAssistantService.instance) {
      OpenAIAssistantService.instance = new OpenAIAssistantService();
    }
    return OpenAIAssistantService.instance;
  }

  /**
   * Initialize the service with API key
   */
  public async initialize(userId?: string): Promise<void> {
    // Try to get API key from user settings first
    if (userId) {
      try {
        const { data, error } = await supabase
          .from('user_settings')
          .select('ai_provider_keys')
          .eq('user_id', userId)
          .single();

        if (!error && data?.ai_provider_keys?.openai) {
          this.apiKey = data.ai_provider_keys.openai;
          return;
        }
      } catch (error) {
      }
    }

    // SECURITY: API keys must NOT be in frontend environment variables.
    this.apiKey = null;
    
    if (!this.apiKey) {
    }
  }

  /**
   * Set API key directly
   */
  public setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Ensure API key is available
   */
  private ensureApiKey(): void {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured. Please add your API key in settings.');
    }
  }

  /**
   * Make an API request to OpenAI
   */
  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    body?: any
  ): Promise<T> {
    this.ensureApiKey();

    const headers: HeadersInit = {
      'Authorization': `Bearer ${this.apiKey}`,
      'OpenAI-Beta': 'assistants=v2',
    };

    if (method !== 'GET' && body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * List available assistants
   */
  public async listAssistants(limit: number = 20): Promise<Assistant[]> {
    try {
      const response = await this.makeRequest<{ data: Assistant[] }>(
        `/assistants?limit=${limit}`,
        'GET'
      );
      return response.data || [];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get a specific assistant
   */
  public async getAssistant(assistantId: string): Promise<Assistant> {
    try {
      return await this.makeRequest<Assistant>(`/assistants/${assistantId}`, 'GET');
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create a new thread
   */
  public async createThread(metadata?: Record<string, string>): Promise<Thread> {
    try {
      return await this.makeRequest<Thread>('/threads', 'POST', { metadata });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get a thread
   */
  public async getThread(threadId: string): Promise<Thread> {
    try {
      return await this.makeRequest<Thread>(`/threads/${threadId}`, 'GET');
    } catch (error) {
      throw error;
    }
  }

  /**
   * Add a message to a thread
   */
  public async addMessage(
    threadId: string,
    content: string,
    variables?: VariableContext,
    imageUrls?: string[],
    metadata?: Record<string, string>
  ): Promise<Message> {
    try {
      // Interpolate variables in the content
      const interpolatedContent = variables ? interpolateVariables(content, variables) : content;

      // Build content array
      const contentArray: any[] = [
        {
          type: 'text',
          text: interpolatedContent
        }
      ];

      // Add image URLs if provided
      if (imageUrls && imageUrls.length > 0) {
        for (const url of imageUrls) {
          contentArray.push({
            type: 'image_url',
            image_url: {
              url,
              detail: 'auto'
            }
          });
        }
      }

      return await this.makeRequest<Message>(
        `/threads/${threadId}/messages`,
        'POST',
        {
          role: 'user',
          content: contentArray,
          metadata
        }
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * List messages in a thread
   */
  public async listMessages(threadId: string, limit: number = 20): Promise<Message[]> {
    try {
      const response = await this.makeRequest<{ data: Message[] }>(
        `/threads/${threadId}/messages?limit=${limit}`,
        'GET'
      );
      return response.data || [];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create and run an assistant
   */
  public async createRun(
    threadId: string,
    config: RunConfig
  ): Promise<Run> {
    try {
      const body: any = {
        assistant_id: config.assistantId,
      };

      // Add optional parameters
      if (config.additionalInstructions) body.additional_instructions = config.additionalInstructions;
      if (config.metadata) body.metadata = config.metadata;
      if (config.toolChoice) body.tool_choice = config.toolChoice;
      if (config.temperature !== undefined) body.temperature = config.temperature;
      if (config.maxPromptTokens) body.max_prompt_tokens = config.maxPromptTokens;
      if (config.maxCompletionTokens) body.max_completion_tokens = config.maxCompletionTokens;
      if (config.responseFormat) body.response_format = { type: config.responseFormat };
      if (config.truncationStrategy) body.truncation_strategy = config.truncationStrategy;

      return await this.makeRequest<Run>(
        `/threads/${threadId}/runs`,
        'POST',
        body
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get run status
   */
  public async getRun(threadId: string, runId: string): Promise<Run> {
    try {
      return await this.makeRequest<Run>(
        `/threads/${threadId}/runs/${runId}`,
        'GET'
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Cancel a run
   */
  public async cancelRun(threadId: string, runId: string): Promise<Run> {
    try {
      return await this.makeRequest<Run>(
        `/threads/${threadId}/runs/${runId}/cancel`,
        'POST'
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Submit tool outputs for a run
   */
  public async submitToolOutputs(
    threadId: string,
    runId: string,
    toolOutputs: Array<{ tool_call_id: string; output: string }>
  ): Promise<Run> {
    try {
      return await this.makeRequest<Run>(
        `/threads/${threadId}/runs/${runId}/submit_tool_outputs`,
        'POST',
        { tool_outputs: toolOutputs }
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Wait for run completion
   */
  private async waitForRunCompletion(threadId: string, runId: string): Promise<Run> {
    let attempts = 0;
    
    while (attempts < this.maxPollingAttempts) {
      const run = await this.getRun(threadId, runId);
      
      if (run.status === 'completed') {
        return run;
      }
      
      if (run.status === 'failed' || run.status === 'cancelled' || run.status === 'expired') {
        throw new Error(`Run ${run.status}: ${run.last_error?.message || 'Unknown error'}`);
      }
      
      if (run.status === 'requires_action') {
        // For now, we'll throw an error for function calling
        // In the future, we can implement function call handling
        throw new Error('Run requires action: Function calling not yet implemented');
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, this.pollingInterval));
      attempts++;
    }
    
    throw new Error('Run timed out after 60 seconds');
  }

  /**
   * Execute a complete assistant interaction
   */
  public async executeAssistant(
    config: {
      assistantId: string;
      threadId?: string;
      createNewThread: boolean;
      message: string;
      variables?: VariableContext;
      imageUrls?: string[];
      additionalInstructions?: string;
      metadata?: Record<string, string>;
      toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
      temperature?: number;
      maxPromptTokens?: number;
      maxCompletionTokens?: number;
      responseFormat?: 'text' | 'json_object';
      truncationStrategy?: {
        type: 'auto' | 'last_messages';
        lastMessages?: number;
      };
    }
  ): Promise<AssistantResponse> {
    try {
      // Create or get thread
      let thread: Thread;
      if (config.createNewThread || !config.threadId) {
        thread = await this.createThread(config.metadata);
      } else {
        thread = await this.getThread(config.threadId);
      }

      // Add message to thread
      const message = await this.addMessage(
        thread.id,
        config.message,
        config.variables,
        config.imageUrls,
        config.metadata
      );

      // Create and run assistant
      const run = await this.createRun(thread.id, {
        assistantId: config.assistantId,
        additionalInstructions: config.additionalInstructions,
        metadata: config.metadata,
        toolChoice: config.toolChoice,
        temperature: config.temperature,
        maxPromptTokens: config.maxPromptTokens,
        maxCompletionTokens: config.maxCompletionTokens,
        responseFormat: config.responseFormat,
        truncationStrategy: config.truncationStrategy,
      });

      // Wait for completion
      const completedRun = await this.waitForRunCompletion(thread.id, run.id);

      // Get the latest messages
      const messages = await this.listMessages(thread.id, 1);
      const assistantMessage = messages.find(m => m.role === 'assistant');

      if (!assistantMessage) {
        throw new Error('No assistant response found');
      }

      // Extract text content
      const textContent = assistantMessage.content
        .filter(c => c.type === 'text')
        .map(c => c.text?.value || '')
        .join('\n');

      return {
        threadId: thread.id,
        messageId: assistantMessage.id,
        runId: completedRun.id,
        content: textContent,
        usage: completedRun.usage ? {
          promptTokens: completedRun.usage.prompt_tokens,
          completionTokens: completedRun.usage.completion_tokens,
          totalTokens: completedRun.usage.total_tokens,
        } : undefined,
        metadata: assistantMessage.metadata,
      };
    } catch (error) {
      return {
        threadId: '',
        messageId: '',
        runId: '',
        content: '',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }


  /**
   * Create a new assistant
   */
  public async createAssistant(config: {
    name: string;
    description?: string;
    model: string;
    instructions: string;
    tools?: Array<{ type: 'code_interpreter' | 'file_search' | 'function'; function?: any }>;
    file_ids?: string[];
    metadata?: Record<string, string>;
    temperature?: number;
    top_p?: number;
    response_format?: { type: 'text' | 'json_object' };
  }): Promise<Assistant> {
    try {
      const body: any = {
        name: config.name,
        model: config.model,
        instructions: config.instructions,
      };

      if (config.description) body.description = config.description;
      if (config.tools) body.tools = config.tools;
      if (config.file_ids) body.file_ids = config.file_ids;
      if (config.metadata) body.metadata = config.metadata;
      if (config.temperature !== undefined) body.temperature = config.temperature;
      if (config.top_p !== undefined) body.top_p = config.top_p;
      if (config.response_format) body.response_format = config.response_format;

      return await this.makeRequest<Assistant>('/assistants', 'POST', body);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update an existing assistant
   */
  public async updateAssistant(
    assistantId: string,
    config: {
      name?: string;
      description?: string;
      model?: string;
      instructions?: string;
      tools?: Array<{ type: 'code_interpreter' | 'file_search' | 'function'; function?: any }>;
      file_ids?: string[];
      metadata?: Record<string, string>;
      temperature?: number;
      top_p?: number;
      response_format?: { type: 'text' | 'json_object' };
    }
  ): Promise<Assistant> {
    try {
      const body: any = {};

      if (config.name) body.name = config.name;
      if (config.description !== undefined) body.description = config.description;
      if (config.model) body.model = config.model;
      if (config.instructions) body.instructions = config.instructions;
      if (config.tools !== undefined) body.tools = config.tools;
      if (config.file_ids !== undefined) body.file_ids = config.file_ids;
      if (config.metadata !== undefined) body.metadata = config.metadata;
      if (config.temperature !== undefined) body.temperature = config.temperature;
      if (config.top_p !== undefined) body.top_p = config.top_p;
      if (config.response_format !== undefined) body.response_format = config.response_format;

      return await this.makeRequest<Assistant>(`/assistants/${assistantId}`, 'POST', body);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete an assistant
   */
  public async deleteAssistant(assistantId: string): Promise<{ id: string; deleted: boolean }> {
    try {
      return await this.makeRequest<{ id: string; deleted: boolean }>(
        `/assistants/${assistantId}`,
        'DELETE'
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Upload a file to OpenAI
   */
  public async uploadFile(file: File, purpose: 'assistants' = 'assistants'): Promise<{ id: string; filename: string; bytes: number; created_at: number }> {
    try {
      this.ensureApiKey();

      const formData = new FormData();
      formData.append('file', file);
      formData.append('purpose', purpose);

      const response = await fetch(`${this.baseUrl}/files`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(error.error?.message || `File upload failed: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      throw error;
    }
  }

  /**
   * List uploaded files
   */
  public async listFiles(purpose?: string): Promise<Array<{ id: string; filename: string; bytes: number; created_at: number; purpose: string }>> {
    try {
      const query = purpose ? `?purpose=${purpose}` : '';
      const response = await this.makeRequest<{ data: Array<any> }>(`/files${query}`, 'GET');
      return response.data || [];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete a file
   */
  public async deleteFile(fileId: string): Promise<{ id: string; deleted: boolean }> {
    try {
      return await this.makeRequest<{ id: string; deleted: boolean }>(`/files/${fileId}`, 'DELETE');
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create a vector store
   */
  public async createVectorStore(config: {
    name?: string;
    file_ids?: string[];
    metadata?: Record<string, string>;
    expires_after?: {
      anchor: 'last_active_at';
      days: number;
    };
  }): Promise<{ id: string; name?: string; created_at: number; file_counts: any; metadata?: Record<string, string> }> {
    try {
      return await this.makeRequest('/vector_stores', 'POST', config);
    } catch (error) {
      throw error;
    }
  }

  /**
   * List vector stores
   */
  public async listVectorStores(limit: number = 20): Promise<Array<{ id: string; name?: string; created_at: number; file_counts: any }>> {
    try {
      const response = await this.makeRequest<{ data: Array<any> }>(`/vector_stores?limit=${limit}`, 'GET');
      return response.data || [];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete a vector store
   */
  public async deleteVectorStore(vectorStoreId: string): Promise<{ id: string; deleted: boolean }> {
    try {
      return await this.makeRequest<{ id: string; deleted: boolean }>(`/vector_stores/${vectorStoreId}`, 'DELETE');
    } catch (error) {
      throw error;
    }
  }

  /**
   * Attach files to a vector store
   */
  public async attachFilesToVectorStore(vectorStoreId: string, fileIds: string[]): Promise<void> {
    try {
      for (const fileId of fileIds) {
        await this.makeRequest(`/vector_stores/${vectorStoreId}/files`, 'POST', { file_id: fileId });
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Attach vector store to assistant
   */
  public async attachVectorStoreToAssistant(assistantId: string, vectorStoreId: string): Promise<Assistant> {
    try {
      // Update the assistant with the vector store ID
      return await this.updateAssistant(assistantId, {
        tools: [{ type: 'file_search' }],
        tool_resources: {
          file_search: {
            vector_store_ids: [vectorStoreId]
          }
        }
      } as any);
    } catch (error) {
      throw error;
    }
  }
}

export const openaiAssistantService = OpenAIAssistantService.getInstance();