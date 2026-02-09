import { supabase } from '../supabase/clientV2';
import type { AINodeConfig } from '../../components/workflows/AIAgentConfigModal';
import type { CustomGPTNodeConfig } from '../../components/workflows/CustomGPTConfigModal';
import { interpolateVariables, VariableContext } from '../utils/promptVariables';
import { 
  parseJSONResponse, 
  extractFields, 
  validateResponse,
  processWithRetry,
  ExtractionRule,
  ProcessingResult 
} from '../utils/responseProcessing';
import { 
  ToolRegistry, 
  formatToolsForAI, 
  parseToolCall,
  ToolExecutionContext 
} from '../services/workflowTools';
import { 
  MCPServerManager,
  MCPRequest,
  MCPResponse 
} from '../mcp/mcpServer';
import { z } from 'zod';
import { openaiAssistantService, type AssistantResponse } from './openaiAssistantService';
import type { AssistantManagerNodeConfig } from '../../components/workflows/AssistantManagerConfigModal';

export interface AIResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string;
  provider?: string;
  model?: string;
  processedData?: any;
  extractedFields?: Record<string, any>;
  toolCalls?: Array<{
    toolName: string;
    parameters: Record<string, any>;
    result?: any;
  }>;
}

export interface ModelConfig {
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
  isEnabled: boolean;
}

export interface AIProviderConfig {
  apiKey: string;
  baseUrl?: string;
  organization?: string;
}

/**
 * Service for managing AI provider integrations
 */
interface ModelCache {
  models: Array<{ value: string; label: string }>;
  timestamp: number;
}

export class AIProviderService {
  private static instance: AIProviderService;
  private apiKeys: Map<string, string> = new Map();
  private modelCache: Map<string, ModelCache> = new Map();
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  private constructor() {}

  public static getInstance(): AIProviderService {
    if (!AIProviderService.instance) {
      AIProviderService.instance = new AIProviderService();
    }
    return AIProviderService.instance;
  }

  /**
   * Initialize the service and load API keys from user settings
   */
  public async initialize(userId: string): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('ai_provider_keys')
        .eq('user_id', userId)
        .maybeSingle(); // Use maybeSingle() to handle missing records gracefully

      // Handle case where record doesn't exist (PGRST116) or other errors
      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "not found" which is fine, other errors should be logged
        console.warn('[AIProvider] Error fetching user settings:', error.message);
        // Try to load from environment variables as fallback
        this.loadFromEnvironment();
        return;
      }

      if (data?.ai_provider_keys) {
        const keys = data.ai_provider_keys as Record<string, string>;
        Object.entries(keys).forEach(([provider, key]) => {
          this.apiKeys.set(provider, key);
        });
      }
      
      // Also check environment variables for any missing keys
      this.loadFromEnvironment();
    } catch (error) {
      console.warn('[AIProvider] Error initializing:', error);
      this.loadFromEnvironment();
    }
  }

  /**
   * Load API keys from environment variables
   */
  private loadFromEnvironment(): void {
    // SECURITY: AI API keys must NOT be in frontend environment variables.
    // They are loaded from user_settings in the database via initialize().
    // If keys are needed server-side, use edge functions instead.
  }

  /**
   * Save API key for a provider
   */
  public async saveApiKey(userId: string, provider: string, apiKey: string): Promise<void> {
    this.apiKeys.set(provider, apiKey);

    const allKeys = Object.fromEntries(this.apiKeys);
    
    // Use upsert with onConflict to handle existing records properly
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        ai_provider_keys: allKeys,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      throw new Error(`Failed to save API key: ${error.message}`);
    }
  }

  /**
   * Complete a prompt using the specified AI model
   */
  public async complete(
    config: AINodeConfig,
    variables: VariableContext,
    userId?: string
  ): Promise<AIResponse> {
    try {
      // Ensure we have a user ID for tracking and tools
      const effectiveUserId = userId || 'ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459'; // Fallback to dev user ID
      // Interpolate variables in prompts
      const systemPrompt = interpolateVariables(config.systemPrompt, variables);
      const userPrompt = interpolateVariables(config.userPrompt, variables);

      // Add chain-of-thought if enabled
      let enhancedSystemPrompt = systemPrompt;
      if (config.chainOfThought) {
        enhancedSystemPrompt += '\n\nPlease think step-by-step through your reasoning before providing the final answer.';
      }

      // Auto-enhance system prompt for CRM queries
      const crmKeywords = ['crm', 'contact', 'deal', 'company', 'record', 'database', 'search', 'find', 'lookup'];
      const isCRMQuery = crmKeywords.some(keyword => 
        userPrompt.toLowerCase().includes(keyword) || 
        systemPrompt.toLowerCase().includes(keyword)
      );
      
      if (isCRMQuery && !systemPrompt.includes('CRM access')) {
        enhancedSystemPrompt += '\n\nYou have direct access to the CRM database and can search for contacts, companies, and deals. ';
        enhancedSystemPrompt += 'When asked about CRM records, always use the available tools to search the actual database. ';
        enhancedSystemPrompt += 'Provide specific information and links when records are found.';
      }

      // Add tool instructions if enabled
      if (config.enableTools && config.selectedTools && config.selectedTools.length > 0) {
        const toolRegistry = ToolRegistry.getInstance();
        const selectedTools = config.selectedTools
          .map(name => toolRegistry.getTool(name)?.definition)
          .filter(Boolean);
        
        if (selectedTools.length > 0) {
          const toolDescriptions = formatToolsForAI(selectedTools);
          enhancedSystemPrompt += `\n\nYou have access to the following tools:\n\n${toolDescriptions}\n\n`;
          enhancedSystemPrompt += 'To use a tool, format your response as:\n';
          enhancedSystemPrompt += '<tool>tool_name</tool>\n';
          enhancedSystemPrompt += '<parameters>{"param1": "value1", "param2": "value2"}</parameters>\n';
          enhancedSystemPrompt += 'Then provide your analysis of the results.';
        }
      }

      // Add MCP server instructions if enabled
      if (config.enableMCP && config.selectedMCPServers && config.selectedMCPServers.length > 0 && userId) {
        const mcpManager = MCPServerManager.getInstance();
        
        // Initialize user servers if not already done
        mcpManager.initializeUserServers(effectiveUserId);
        
        enhancedSystemPrompt += '\n\nYou have access to MCP (Model Context Protocol) servers:\n';
        
        for (const serverName of config.selectedMCPServers) {
          enhancedSystemPrompt += `- ${serverName}: Access to ${serverName} data and operations\n`;
        }
        
        enhancedSystemPrompt += '\nTo use MCP, format requests as:\n';
        enhancedSystemPrompt += '<mcp server="server_name" method="method_name">{"params": {...}}</mcp>\n';
        enhancedSystemPrompt += 'Available methods: tools/list, tools/call, resources/list, resources/get, prompts/list, prompts/get';
      }

      // Add output format instructions
      if (config.outputFormat === 'json') {
        enhancedSystemPrompt += '\n\nYou must respond with valid JSON only. Do not include any explanatory text outside the JSON structure.';
        if (config.jsonSchema) {
          enhancedSystemPrompt += `\n\nThe JSON must conform to this schema:\n${config.jsonSchema}`;
        }
      }

      // Add few-shot examples if provided
      let enhancedUserPrompt = userPrompt;
      if (config.fewShotExamples && config.fewShotExamples.length > 0) {
        const examples = config.fewShotExamples.map(ex => 
          `Example:\nInput: ${ex.input}\nOutput: ${ex.output}`
        ).join('\n\n');
        enhancedUserPrompt = `${examples}\n\nNow process this:\n${userPrompt}`;
      }

      // Execute with retry logic if enabled
      const executeFn = async () => {
        let response: AIResponse;
        
        switch (config.modelProvider) {
          case 'openai':
            response = await this.completeWithOpenAI(config, enhancedSystemPrompt, enhancedUserPrompt);
            break;
          case 'anthropic':
            response = await this.completeWithAnthropic(config, enhancedSystemPrompt, enhancedUserPrompt);
            break;
          case 'openrouter':
            response = await this.completeWithOpenRouter(config, enhancedSystemPrompt, enhancedUserPrompt);
            break;
          case 'gemini':
            response = await this.completeWithGemini(config, enhancedSystemPrompt, enhancedUserPrompt);
            break;
          default:
            throw new Error(`Unsupported provider: ${config.modelProvider}`);
        }

        // Process response if needed
        if (!response.error && response.content) {
          response = await this.processResponse(response, config, userId);
        }

        return response;
      };

      // Use retry logic if configured
      if (config.retryOnError && config.maxRetries) {
        const result = await processWithRetry(executeFn, config.maxRetries, 1000);
        if (!result.success) {
          return {
            content: '',
            error: result.error,
          };
        }
        return result.data!;
      } else {
        return await executeFn();
      }
    } catch (error) {
      return {
        content: '',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Process AI response based on configuration
   */
  private async processResponse(
    response: AIResponse,
    config: AINodeConfig,
    userId?: string
  ): Promise<AIResponse> {
    // Check for MCP requests in the response
    if (config.enableMCP && userId) {
      const mcpMatch = response.content.match(/<mcp\s+server="([^"]+)"\s+method="([^"]+)">([^<]*)<\/mcp>/);
      
      if (mcpMatch) {
        const [, serverName, method, paramsStr] = mcpMatch;
        
        try {
          const params = paramsStr ? JSON.parse(paramsStr) : {};
          const mcpManager = MCPServerManager.getInstance();
          
          const mcpRequest: MCPRequest = {
            id: `req_${Date.now()}`,
            method: method as any,
            params
          };
          
          const mcpResponse = await mcpManager.handleRequest(serverName, mcpRequest);
          
          if (mcpResponse.error) {
            response.content += `\n\nMCP Error: ${mcpResponse.error.message}`;
          } else {
            response.content += `\n\nMCP Result: ${JSON.stringify(mcpResponse.result, null, 2)}`;
          }
        } catch (error) {
          response.content += `\n\nMCP Parse Error: ${error}`;
        }
      }
    }
    
    // Check for tool calls in the response
    if (config.enableTools && config.autoExecuteTools) {
      const toolCall = parseToolCall(response.content);
      if (toolCall.toolName) {
        const toolRegistry = ToolRegistry.getInstance();
        const context: ToolExecutionContext = {
          userId: effectiveUserId,
          workflowId: undefined, // Will be set by workflow engine
          nodeId: undefined, // Will be set by workflow engine
        };
        try {
          const toolResult = await toolRegistry.executeTool(
            toolCall.toolName,
            toolCall.parameters || {},
            context
          );
          if (!response.toolCalls) {
            response.toolCalls = [];
          }
          
          response.toolCalls.push({
            toolName: toolCall.toolName,
            parameters: toolCall.parameters || {},
            result: toolResult,
          });
          
          // Format the response based on tool results
          if (toolResult.success && toolResult.data) {
            const data = Array.isArray(toolResult.data) ? toolResult.data : [toolResult.data];
            
            if (data.length > 0) {
              // For contact search, format a user-friendly response
              if (toolCall.toolName === 'search_contacts') {
                const contacts = data;
                response.content = `Found ${contacts.length} contact(s) matching your search:\n\n`;
                contacts.forEach((contact: any) => {
                  response.content += `**${contact.name}**\n`;
                  response.content += `- Email: ${contact.email}\n`;
                  if (contact.company) response.content += `- Company: ${contact.company}\n`;
                  response.content += `- CRM Link: ${contact.crm_link || contact.view_url}\n\n`;
                });
              } else {
                // Generic tool result formatting
                response.content = `Tool executed successfully. Results:\n\n${JSON.stringify(data, null, 2)}`;
              }
            } else {
              response.content = 'No records found matching your search criteria.';
            }
          } else if (toolResult.error) {
            response.content = `I encountered an error while searching: ${toolResult.error}`;
          } else {
            response.content = 'The search completed but returned no results.';
          }
        } catch (error) {
          response.content = `Error executing tool: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      }
    }
    
    // Parse JSON if output format is JSON
    if (config.outputFormat === 'json' || config.outputFormat === 'structured') {
      const parseResult = parseJSONResponse(response.content);
      if (parseResult.success) {
        response.processedData = parseResult.data;
        
        // Validate against schema if provided
        if (config.jsonSchema) {
          try {
            const schema = z.object(JSON.parse(config.jsonSchema));
            const validationResult = validateResponse(parseResult.data, schema);
            if (!validationResult.success) {
              response.error = `JSON validation failed: ${validationResult.error}`;
            } else {
              response.processedData = validationResult.data;
            }
          } catch (error) {
          }
        }
      } else if (config.outputFormat === 'json') {
        response.error = parseResult.error;
      }
    }

    // Extract fields if rules are provided
    if (config.extractionRules && config.extractionRules.length > 0) {
      const extractionResult = extractFields(
        response.processedData || response.content,
        config.extractionRules
      );
      
      if (extractionResult.success || extractionResult.extractedFields) {
        response.extractedFields = extractionResult.extractedFields;
      }
      
      if (!extractionResult.success && extractionResult.error) {
        response.error = response.error 
          ? `${response.error}; ${extractionResult.error}`
          : extractionResult.error;
      }
    }

    return response;
  }

  /**
   * Complete using OpenAI API
   */
  private async completeWithOpenAI(
    config: AINodeConfig,
    systemPrompt: string,
    userPrompt: string
  ): Promise<AIResponse> {
    const apiKey = this.apiKeys.get('openai');
    if (!apiKey) {
      throw new Error('OpenAI API key not configured. Please add it in settings.');
    }

    // Try to use the model as-is first, then check if it needs mapping
    let model = config.model;
    
    // Log the model being used
    // Only map models that we know don't exist or have issues
    // Let OpenAI's API handle validation for models that might exist
    const fallbackMapping: Record<string, string> = {
      // Common typos or alternative names
      'gpt-3.5': 'gpt-3.5-turbo',
      'gpt-4': 'gpt-4-turbo',
      'gpt4': 'gpt-4-turbo',
      'gpt3.5': 'gpt-3.5-turbo',
    };
    
    // Only use fallback if the exact model is in our fallback list
    if (fallbackMapping[model]) {
      model = fallbackMapping[model];
    }

    try {
      // Determine which parameter to use based on model
      const tokenParam = model.includes('o1') || model.includes('o3') 
        ? 'max_completion_tokens' 
        : 'max_tokens';
      
      const requestBody: any = {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: config.temperature || 0.7,
      };
      
      // Add the appropriate token parameter
      requestBody[tokenParam] = config.maxTokens || 1000;
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json();
        const errorMessage = error.error?.message || response.statusText;
        // If the error is about max_tokens vs max_completion_tokens, retry with the correct parameter
        if (errorMessage.includes('max_tokens') && errorMessage.includes('max_completion_tokens')) {
          const retryBody: any = {
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: config.temperature || 0.7,
            max_completion_tokens: config.maxTokens || 1000,
          };
          
          const retryResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(retryBody),
          });
          
          if (retryResponse.ok) {
            const retryData = await retryResponse.json();
            return {
              content: retryData.choices[0].message.content || '',
              usage: {
                promptTokens: retryData.usage?.prompt_tokens || 0,
                completionTokens: retryData.usage?.completion_tokens || 0,
                totalTokens: retryData.usage?.total_tokens || 0,
              },
              provider: 'openai',
              model: model,
            };
          }
        }
        
        // If the model doesn't exist, try with a fallback
        if (errorMessage.includes('does not exist') || errorMessage.includes('invalid model')) {
          // Retry with a known good model
          const fallbackResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: config.temperature || 0.7,
              max_tokens: config.maxTokens || 1000, // gpt-4o-mini uses max_tokens
            }),
          });
          
          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            return {
              content: fallbackData.choices[0].message.content || '',
              usage: {
                promptTokens: fallbackData.usage?.prompt_tokens || 0,
                completionTokens: fallbackData.usage?.completion_tokens || 0,
                totalTokens: fallbackData.usage?.total_tokens || 0,
              },
              provider: 'openai',
              model: 'gpt-4o-mini',
              error: `Note: Model "${model}" not available, used gpt-4o-mini instead`,
            };
          }
        }
        
        throw new Error(`OpenAI API error: ${errorMessage}`);
      }

      const data = await response.json();
      
      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response from OpenAI API');
      }
      
      return {
        content: data.choices[0].message.content || '',
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
        provider: 'openai',
        model: model,
      };
    } catch (error) {
      return {
        content: '',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        provider: 'openai',
        model: model,
      };
    }
  }

  /**
   * Complete using Anthropic API
   */
  private async completeWithAnthropic(
    config: AINodeConfig,
    systemPrompt: string,
    userPrompt: string
  ): Promise<AIResponse> {
    const apiKey = this.apiKeys.get('anthropic');
    if (!apiKey) {
      throw new Error('Anthropic API key not configured. Please add it in settings.');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt },
        ],
        temperature: config.temperature || 0.7,
        max_tokens: config.maxTokens || 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    return {
      content: data.content[0].text,
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
      provider: 'anthropic',
      model: config.model,
    };
  }

  /**
   * Complete using OpenRouter API
   */
  private async completeWithOpenRouter(
    config: AINodeConfig,
    systemPrompt: string,
    userPrompt: string
  ): Promise<AIResponse> {
    const apiKey = this.apiKeys.get('openrouter');
    if (!apiKey) {
      throw new Error('OpenRouter API key not configured. Please add it in settings.');
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Sixty Sales Dashboard',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: config.temperature || 0.7,
        max_tokens: config.maxTokens || 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenRouter API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    return {
      content: data.choices[0].message.content,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
      provider: 'openrouter',
      model: config.model,
    };
  }

  /**
   * Complete using Google Gemini API
   */
  private async completeWithGemini(
    config: AINodeConfig,
    systemPrompt: string,
    userPrompt: string
  ): Promise<AIResponse> {
    const apiKey = this.apiKeys.get('gemini');
    if (!apiKey) {
      throw new Error('Gemini API key not configured. Please add it in settings.');
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: `${systemPrompt}\n\n${userPrompt}` },
              ],
            },
          ],
          generationConfig: {
            temperature: config.temperature || 0.7,
            maxOutputTokens: config.maxTokens || 1000,
            topP: 0.95,
            topK: 40,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    return {
      content,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
      },
      provider: 'gemini',
      model: config.model,
    };
  }


  /**
   * Test API key validity
   */
  public async testApiKey(provider: string, apiKey: string): Promise<boolean> {
    try {
      // Store temporarily for testing
      const originalKey = this.apiKeys.get(provider);
      this.apiKeys.set(provider, apiKey);

      // For Gemini, test directly with a simpler API call to avoid model deprecation issues
      if (provider === 'gemini') {
        try {
          // Test with the models endpoint first (lightweight check)
          const modelsResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
          );
          
          if (!modelsResponse.ok) {
            const errorData = await modelsResponse.json().catch(() => ({}));
            const errorMessage = errorData.error?.message || modelsResponse.statusText;
            console.error('[Gemini API Test] Models endpoint failed:', {
              status: modelsResponse.status,
              statusText: modelsResponse.statusText,
              error: errorMessage,
              details: errorData.error
            });
            
            // Provide helpful error messages
            if (modelsResponse.status === 400) {
              console.error('[Gemini API Test] Invalid API key format or API not enabled. Ensure:');
              console.error('  1. API key is correct (starts with AIza, 39 characters)');
              console.error('  2. Generative AI API is enabled in Google Cloud Console');
              console.error('  3. API key has no restrictions blocking this request');
            } else if (modelsResponse.status === 403) {
              console.error('[Gemini API Test] API key restricted or billing not enabled. Check:');
              console.error('  1. API key restrictions in Google Cloud Console');
              console.error('  2. Billing account is linked to the project');
              console.error('  3. Generative AI API is enabled');
            }
            
            return false;
          }
          
          // Test with a simple completion using available Gemini models
          // Try models in order: 2.5 Flash (stable), 3 Pro Preview, 2.5 Pro Preview, 1.5 Flash (fallback)
          const modelsToTry = [
            'gemini-2.5-flash',
            'gemini-3-pro-preview',
            'gemini-2.5-pro-preview-03-25',
            'gemini-1.5-flash-latest',
            'gemini-1.5-pro-latest'
          ];
          
          let testResponse: Response | null = null;
          let lastError: any = null;
          
          for (const model of modelsToTry) {
            try {
              console.log(`[Gemini API Test] Trying model: ${model}...`);
              testResponse = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    contents: [
                      {
                        parts: [
                          { text: 'Say OK' }
                        ],
                      },
                    ],
                    generationConfig: {
                      temperature: 0.1,
                      maxOutputTokens: 10, // Increased to ensure we get text content
                    },
                  }),
                }
              );
              
              if (testResponse.ok) {
                console.log(`[Gemini API Test] Success with model: ${model}`);
                break; // Success, exit loop
              }
              
              // If 404, try next model
              if (testResponse.status === 404) {
                const errorData = await testResponse.json().catch(() => ({}));
                lastError = errorData;
                console.log(`[Gemini API Test] Model ${model} not available (404), trying next...`);
                testResponse = null; // Reset to try next model
                continue;
              }
              
              // If 429 (rate limit), treat as valid key (key works, just rate limited)
              if (testResponse.status === 429) {
                console.log(`[Gemini API Test] Rate limited (429) - API key is valid but quota exceeded`);
                // Restore original key if it existed
                if (originalKey) {
                  this.apiKeys.set(provider, originalKey);
                } else {
                  this.apiKeys.delete(provider);
                }
                return true; // Rate limit means the key is valid
              }
              
              // For other errors, break and handle below
              break;
            } catch (error: any) {
              console.warn(`[Gemini API Test] Error testing ${model}:`, error.message);
              lastError = error;
              testResponse = null;
              continue; // Try next model
            }
          }
          
          if (!testResponse || !testResponse.ok) {
            const errorData = lastError || (testResponse ? await testResponse.json().catch(() => ({})) : {});
            const errorMessage = errorData.error?.message || (testResponse?.statusText || 'Unknown error');
            console.error('[Gemini API Test] Completion test failed:', {
              status: testResponse?.status || 'No response',
              statusText: testResponse?.statusText || 'Request failed',
              error: errorMessage,
              details: errorData.error
            });
            
            // Provide helpful error messages
            if (testResponse?.status === 400) {
              console.error('[Gemini API Test] Invalid request. Check model name and API key permissions.');
            } else if (testResponse?.status === 403) {
              console.error('[Gemini API Test] Access denied. Verify API key permissions and billing.');
            } else if (testResponse?.status === 404) {
              console.error('[Gemini API Test] No available models found. Check API key and enabled APIs.');
            }
            
            // Restore original key if it existed
            if (originalKey) {
              this.apiKeys.set(provider, originalKey);
            } else {
              this.apiKeys.delete(provider);
            }
            
            return false;
          }
          
          const data = await testResponse.json();
          // Check if we got a valid response with candidates
          const hasValidResponse = data.candidates && data.candidates.length > 0;
          // Check for text content (may be empty if maxOutputTokens was too low, but response structure is valid)
          const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          
          // Restore original key if it existed
          if (originalKey) {
            this.apiKeys.set(provider, originalKey);
          } else {
            this.apiKeys.delete(provider);
          }
          
          // Consider it valid if we got a response structure, even if text is empty (due to low maxOutputTokens)
          return hasValidResponse;
        } catch (error: any) {
          console.warn('[Gemini API Test] Error:', error.message);
          // Restore original key if it existed
          if (originalKey) {
            this.apiKeys.set(provider, originalKey);
          } else {
            this.apiKeys.delete(provider);
          }
          return false;
        }
      }

      const testConfig: AINodeConfig = {
        modelProvider: provider as any,
        model: provider === 'openai' ? 'gpt-3.5-turbo' : 
               provider === 'anthropic' ? 'claude-3-haiku-20240307' : 
               provider === 'gemini' ? 'gemini-2.5-flash' :
               'openai/gpt-3.5-turbo',
        systemPrompt: 'You are a test assistant.',
        userPrompt: 'Say "API key is valid" if you can read this.',
        temperature: 0.1,
        maxTokens: 10,
      };

      const response = await this.complete(testConfig, {});

      // Restore original key if it existed
      if (originalKey) {
        this.apiKeys.set(provider, originalKey);
      } else {
        this.apiKeys.delete(provider);
      }

      return !response.error && response.content.length > 0;
    } catch (error: any) {
      console.warn(`[API Test] Error testing ${provider}:`, error.message);
      // Restore original key if it existed
      if (originalKey) {
        this.apiKeys.set(provider, originalKey);
      } else {
        this.apiKeys.delete(provider);
      }
      return false;
    }
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(provider: string): boolean {
    const cache = this.modelCache.get(provider);
    if (!cache) return false;
    return Date.now() - cache.timestamp < this.CACHE_DURATION;
  }

  /**
   * Clear cache for a specific provider or all providers
   */
  public clearModelCache(provider?: string): void {
    if (provider) {
      this.modelCache.delete(provider);
    } else {
      this.modelCache.clear();
    }
  }

  /**
   * Fetch available models from OpenAI with caching
   */
  public async fetchOpenAIModels(forceRefresh = false): Promise<Array<{ value: string; label: string }>> {
    // Check cache first
    if (!forceRefresh && this.isCacheValid('openai')) {
      return this.modelCache.get('openai')!.models;
    }

    const apiKey = this.apiKeys.get('openai');
    if (!apiKey) {
      return [
        { value: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo' },
        { value: 'gpt-4', label: 'GPT-4' },
        { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
      ];
    }

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }

      const data = await response.json();
      
      // Log all models to see what OpenAI is actually returning
      // Filter for chat models (including GPT-5 if it exists)
      const chatModels = data.data
        .filter((model: any) => {
          const id = model.id.toLowerCase();
          // Include all GPT models, o1 models, and chatgpt models
          return id.includes('gpt') || id.includes('o1') || id.includes('chatgpt');
        })
        .map((model: any) => ({
          value: model.id,
          label: model.id
            .replace(/-/g, ' ')
            .replace(/gpt/gi, 'GPT')
            .replace(/\b\w/g, (l: string) => l.toUpperCase())
            .replace(/Gpt/g, 'GPT'), // Ensure GPT is always uppercase
        }))
        .sort((a: any, b: any) => {
          // Sort to put newer models first
          const getPriority = (model: string) => {
            if (model.includes('gpt-5')) return 10;
            if (model.includes('gpt-4o')) return 9;
            if (model.includes('gpt-4.1')) return 8;
            if (model.includes('gpt-4-turbo')) return 7;
            if (model.includes('gpt-4')) return 6;
            if (model.includes('o1')) return 5;
            if (model.includes('gpt-3.5')) return 4;
            return 0;
          };
          
          const aPriority = getPriority(a.value);
          const bPriority = getPriority(b.value);
          
          if (aPriority !== bPriority) {
            return bPriority - aPriority;
          }
          
          // Within same priority, sort by version/date
          return b.value.localeCompare(a.value);
        });

      const models = chatModels.length > 0 ? chatModels : [
        { value: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo' },
        { value: 'gpt-4', label: 'GPT-4' },
        { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
      ];

      // Cache the results
      this.modelCache.set('openai', {
        models,
        timestamp: Date.now(),
      });

      return models;
    } catch (error) {
      return [
        { value: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo' },
        { value: 'gpt-4', label: 'GPT-4' },
        { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
      ];
    }
  }

  /**
   * Fetch available models from Anthropic with caching
   */
  public async fetchAnthropicModels(forceRefresh = false): Promise<Array<{ value: string; label: string }>> {
    // Check cache first
    if (!forceRefresh && this.isCacheValid('anthropic')) {
      return this.modelCache.get('anthropic')!.models;
    }

    const apiKey = this.apiKeys.get('anthropic');
    if (!apiKey) {
      return [
        { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
        { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
        { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
        { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
        { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
      ];
    }

    try {
      // Anthropic now has a models endpoint!
      const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }

      const data = await response.json();
      const models = data.data
        .map((model: any) => ({
          value: model.id,
          label: model.display_name || model.id,
        }))
        .sort((a: any, b: any) => {
          // Sort newest models first
          if (a.label.includes('4.1') && !b.label.includes('4.1')) return -1;
          if (!a.label.includes('4.1') && b.label.includes('4.1')) return 1;
          if (a.label.includes('4') && !b.label.includes('4')) return -1;
          if (!a.label.includes('4') && b.label.includes('4')) return 1;
          if (a.label.includes('3.7') && !b.label.includes('3.7')) return -1;
          if (!a.label.includes('3.7') && b.label.includes('3.7')) return 1;
          return b.label.localeCompare(a.label);
        });

      const result = models.length > 0 ? models : [
        { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
        { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
        { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
      ];

      // Cache the results
      this.modelCache.set('anthropic', {
        models: result,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      // Return fallback models
      return [
        { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
        { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
        { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
      ];
    }
  }

  /**
   * Fetch available models from OpenRouter with caching
   */
  public async fetchOpenRouterModels(forceRefresh = false): Promise<Array<{ value: string; label: string }>> {
    // Check cache first
    if (!forceRefresh && this.isCacheValid('openrouter')) {
      return this.modelCache.get('openrouter')!.models;
    }

    const apiKey = this.apiKeys.get('openrouter');
    if (!apiKey) {
      return [
        { value: 'openai/gpt-4-turbo-preview', label: 'GPT-4 Turbo (via OpenRouter)' },
        { value: 'anthropic/claude-3-opus', label: 'Claude 3 Opus (via OpenRouter)' },
        { value: 'meta-llama/llama-3-70b', label: 'Llama 3 70B' },
      ];
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }

      const data = await response.json();
      const models = data.data
        .filter((model: any) => !model.id.includes('instruct') && !model.id.includes('free'))
        .slice(0, 20) // Limit to top 20 models
        .map((model: any) => ({
          value: model.id,
          label: model.name || model.id,
        }));

      const result = models.length > 0 ? models : [
        { value: 'openai/gpt-4-turbo-preview', label: 'GPT-4 Turbo (via OpenRouter)' },
        { value: 'anthropic/claude-3-opus', label: 'Claude 3 Opus (via OpenRouter)' },
        { value: 'meta-llama/llama-3-70b', label: 'Llama 3 70B' },
      ];

      // Cache the results
      this.modelCache.set('openrouter', {
        models: result,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      return [
        { value: 'openai/gpt-4-turbo-preview', label: 'GPT-4 Turbo (via OpenRouter)' },
        { value: 'anthropic/claude-3-opus', label: 'Claude 3 Opus (via OpenRouter)' },
        { value: 'meta-llama/llama-3-70b', label: 'Llama 3 70B' },
      ];
    }
  }

  /**
   * Fetch available models from Google Gemini with caching
   */
  public async fetchGeminiModels(forceRefresh = false): Promise<Array<{ value: string; label: string }>> {
    // Check cache first
    if (!forceRefresh && this.isCacheValid('gemini')) {
      return this.modelCache.get('gemini')!.models;
    }

    const apiKey = this.apiKeys.get('gemini');
    if (!apiKey) {
      return [
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Recommended)' },
        { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
        { value: 'gemini-2.5-pro-preview-03-25', label: 'Gemini 2.5 Pro Preview' },
        { value: 'gemini-1.5-pro-latest', label: 'Gemini 1.5 Pro' },
        { value: 'gemini-1.5-flash-latest', label: 'Gemini 1.5 Flash' },
        { value: 'gemini-pro', label: 'Gemini Pro (Legacy)' },
      ];
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }

      const data = await response.json();
      const models = data.models
        .filter((model: any) => model.supportedGenerationMethods?.includes('generateContent'))
        .map((model: any) => ({
          value: model.name.replace('models/', ''),
          label: model.displayName || model.name.replace('models/', ''),
        }));

      // Sort models to prioritize Gemini 3 Pro Preview, then 2.5 Flash, then 2.5 Pro, then 1.5, then others
      const sortedModels = models.sort((a, b) => {
        const aIs3Pro = a.value.includes('gemini-3-pro') ? 5 : 0;
        const bIs3Pro = b.value.includes('gemini-3-pro') ? 5 : 0;
        const aIs25Flash = a.value.includes('gemini-2.5-flash') && !a.value.includes('preview') ? 4 : 0;
        const bIs25Flash = b.value.includes('gemini-2.5-flash') && !b.value.includes('preview') ? 4 : 0;
        const aIs25Pro = a.value.includes('gemini-2.5-pro') ? 3 : 0;
        const bIs25Pro = b.value.includes('gemini-2.5-pro') ? 3 : 0;
        const aIs15Pro = a.value.includes('gemini-1.5-pro') ? 2 : 0;
        const bIs15Pro = b.value.includes('gemini-1.5-pro') ? 2 : 0;
        const aIs15Flash = a.value.includes('gemini-1.5-flash') ? 1 : 0;
        const bIs15Flash = b.value.includes('gemini-1.5-flash') ? 1 : 0;
        
        const aScore = aIs3Pro || aIs25Flash || aIs25Pro || aIs15Pro || aIs15Flash;
        const bScore = bIs3Pro || bIs25Flash || bIs25Pro || bIs15Pro || bIs15Flash;
        
        if (aScore !== bScore) return bScore - aScore;
        return a.value.localeCompare(b.value);
      });

      const result = sortedModels.length > 0 ? sortedModels : [
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Recommended)' },
        { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
        { value: 'gemini-2.5-pro-preview-03-25', label: 'Gemini 2.5 Pro Preview' },
        { value: 'gemini-1.5-pro-latest', label: 'Gemini 1.5 Pro' },
        { value: 'gemini-1.5-flash-latest', label: 'Gemini 1.5 Flash' },
        { value: 'gemini-pro', label: 'Gemini Pro (Legacy)' },
      ];

      // Cache the results
      this.modelCache.set('gemini', {
        models: result,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      return [
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Recommended)' },
        { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
        { value: 'gemini-2.5-pro-preview-03-25', label: 'Gemini 2.5 Pro Preview' },
        { value: 'gemini-1.5-pro-latest', label: 'Gemini 1.5 Pro' },
        { value: 'gemini-1.5-flash-latest', label: 'Gemini 1.5 Flash' },
        { value: 'gemini-pro', label: 'Gemini Pro (Legacy)' },
      ];
    }
  }

  /**
   * Fetch all available models for a provider with optional force refresh
   */
  public async fetchModelsForProvider(provider: string, forceRefresh = false): Promise<Array<{ value: string; label: string }>> {
    switch (provider) {
      case 'openai':
        return this.fetchOpenAIModels(forceRefresh);
      case 'anthropic':
        return this.fetchAnthropicModels(forceRefresh);
      case 'openrouter':
        return this.fetchOpenRouterModels(forceRefresh);
      case 'gemini':
        return this.fetchGeminiModels(forceRefresh);
      default:
        return [];
    }
  }

  /**
   * Get usage statistics for a user
   */
  public async getUsageStats(userId: string): Promise<any> {
    const { data, error } = await supabase
      .from('ai_usage_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      return null;
    }

    return data;
  }

  /**
   * Log AI usage for billing and monitoring
   */
  public async logUsage(
    userId: string,
    response: AIResponse,
    workflowId?: string
  ): Promise<void> {
    if (!response.usage) return;

    const { error } = await supabase
      .from('ai_usage_logs')
      .insert({
        user_id: userId,
        workflow_id: workflowId,
        provider: response.provider,
        model: response.model,
        prompt_tokens: response.usage.promptTokens,
        completion_tokens: response.usage.completionTokens,
        total_tokens: response.usage.totalTokens,
        created_at: new Date().toISOString(),
      });

    if (error) {
    }
  }

  /**
   * Resolve model configuration for a specific feature
   * Resolution order: 1. User settings → 2. System config → 3. Hardcoded defaults
   */
  public async resolveModelForFeature(
    userId: string,
    featureKey: string
  ): Promise<ModelConfig> {
    try {
      // 1. Check user_ai_feature_settings table
      const { data: userSettings, error: userError } = await supabase
        .rpc('get_user_feature_model_config', {
          p_user_id: userId,
          p_feature_key: featureKey,
        });

      if (!userError && userSettings && userSettings.length > 0) {
        const setting = userSettings[0];
        return {
          provider: setting.provider,
          model: setting.model,
          temperature: setting.temperature,
          maxTokens: setting.max_tokens,
          isEnabled: setting.is_enabled,
        };
      }

      // 2. Fall back to system_config
      const systemConfigKey = `ai_${featureKey}_model`;
      const { data: systemConfig, error: systemError } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', systemConfigKey)
        .maybeSingle();

      if (!systemError && systemConfig?.value) {
        // Parse provider/model from system config value (format: "provider/model")
        const [provider, ...modelParts] = systemConfig.value.split('/');
        const model = modelParts.join('/');

        if (provider && model) {
          return {
            provider: provider as any,
            model: model,
            temperature: 0.7,
            maxTokens: 2048,
            isEnabled: true,
          };
        }
      }

      // 3. Fall back to hardcoded defaults
      return this.getHardcodedDefault(featureKey);
    } catch (error) {
      console.error(`Error resolving model for feature ${featureKey}:`, error);
      // Return hardcoded default on error
      return this.getHardcodedDefault(featureKey);
    }
  }

  /**
   * Get hardcoded default model configuration for a feature
   */
  private getHardcodedDefault(featureKey: string): ModelConfig {
    const defaults: Record<string, ModelConfig> = {
      meeting_task_extraction: {
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20250514',
        temperature: 0.3,
        maxTokens: 500,
        isEnabled: true,
      },
      meeting_sentiment: {
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20250514',
        temperature: 0.3,
        maxTokens: 500,
        isEnabled: true,
      },
      proposal_generation: {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.7,
        maxTokens: 4096,
        isEnabled: true,
      },
      meeting_summary: {
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20250514',
        temperature: 0.5,
        maxTokens: 2048,
        isEnabled: true,
      },
    };

    return defaults[featureKey] || {
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20250514',
      temperature: 0.7,
      maxTokens: 2048,
      isEnabled: true,
    };
  }

  /**
   * Execute a Custom GPT assistant
   */
  public async executeCustomGPT(
    config: CustomGPTNodeConfig,
    variables: VariableContext,
    userId?: string
  ): Promise<AIResponse> {
    try {
      // Initialize the OpenAI Assistant service with user's API key
      if (userId) {
        await openaiAssistantService.initialize(userId);
      } else {
        // Try to use API key from environment or existing keys
        const openaiKey = this.apiKeys.get('openai');
        if (openaiKey) {
          openaiAssistantService.setApiKey(openaiKey);
        } else {
          await openaiAssistantService.initialize();
        }
      }

      // Execute the assistant
      const result = await openaiAssistantService.executeAssistant({
        assistantId: config.assistantId,
        threadId: config.threadId,
        createNewThread: config.createNewThread,
        message: config.message,
        variables,
        imageUrls: config.imageUrls,
        additionalInstructions: config.additionalInstructions,
        metadata: config.metadata,
        toolChoice: config.toolChoice,
        temperature: config.temperature,
        maxPromptTokens: config.maxPromptTokens,
        maxCompletionTokens: config.maxCompletionTokens,
        responseFormat: config.responseFormat,
        truncationStrategy: config.truncationStrategy,
      });

      // Convert to AIResponse format
      const response: AIResponse = {
        content: result.content || '',
        usage: result.usage,
        error: result.error,
        provider: 'openai',
        model: config.assistantName || 'custom-gpt',
        metadata: result.metadata,
      };

      // Parse JSON if response format is JSON
      if (config.responseFormat === 'json_object' && result.content) {
        try {
          response.processedData = JSON.parse(result.content);
        } catch (error) {
        }
      }

      return response;
    } catch (error) {
      return {
        content: '',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        provider: 'openai',
        model: 'custom-gpt',
      };
    }
  }

  /**
   * Execute Assistant Manager operations (create or update assistant)
   */
  public async executeAssistantManager(
    config: AssistantManagerNodeConfig,
    variables: VariableContext,
    userId?: string
  ): Promise<AIResponse> {
    try {
      // Initialize the OpenAI Assistant service with user's API key
      if (userId) {
        await openaiAssistantService.initialize(userId);
      } else {
        // Try to use API key from environment or existing keys
        const openaiKey = this.apiKeys.get('openai');
        if (openaiKey) {
          openaiAssistantService.setApiKey(openaiKey);
        } else {
          await openaiAssistantService.initialize();
        }
      }

      let result: any = {};
      
      if (config.operation === 'create') {
        // Create a new assistant
        const assistant = await openaiAssistantService.createAssistant({
          name: interpolateVariables(config.assistantName || 'New Assistant', variables),
          description: config.description ? interpolateVariables(config.description, variables) : undefined,
          model: config.model || 'gpt-4-turbo-preview',
          instructions: config.instructions ? interpolateVariables(config.instructions, variables) : undefined,
          tools: config.tools,
          metadata: config.metadata,
          temperature: config.temperature,
          topP: config.topP,
          responseFormat: config.responseFormat,
        });

        // Handle file uploads if provided
        if (config.files && config.files.length > 0) {
          const fileIds: string[] = [];
          for (const file of config.files) {
            // Note: Files should be uploaded through the UI before execution
            // The config.files array should contain file IDs
            if (typeof file === 'string') {
              fileIds.push(file);
            } else if (file.id) {
              fileIds.push(file.id);
            }
          }

          // Create or attach to vector store if file search is enabled
          if (config.tools?.fileSearch && fileIds.length > 0) {
            let vectorStoreId = config.vectorStoreId;
            
            if (!vectorStoreId && config.vectorStoreName) {
              // Create a new vector store
              const vectorStore = await openaiAssistantService.createVectorStore({
                name: interpolateVariables(config.vectorStoreName, variables),
                fileIds,
              });
              vectorStoreId = vectorStore.id;
            } else if (vectorStoreId) {
              // Attach files to existing vector store
              await openaiAssistantService.attachFilesToVectorStore(vectorStoreId, fileIds);
            }

            // Attach vector store to assistant
            if (vectorStoreId) {
              await openaiAssistantService.attachVectorStoreToAssistant(assistant.id, vectorStoreId);
            }
          }
        }

        result = {
          assistantId: assistant.id,
          assistantName: assistant.name,
          operation: 'created',
          model: assistant.model,
          tools: assistant.tools,
        };
      } else if (config.operation === 'update' && config.assistantId) {
        // Update existing assistant
        const assistant = await openaiAssistantService.updateAssistant(
          config.assistantId,
          {
            name: config.assistantName ? interpolateVariables(config.assistantName, variables) : undefined,
            description: config.description ? interpolateVariables(config.description, variables) : undefined,
            model: config.model,
            instructions: config.instructions ? interpolateVariables(config.instructions, variables) : undefined,
            tools: config.tools,
            metadata: config.metadata,
            temperature: config.temperature,
            topP: config.topP,
            responseFormat: config.responseFormat,
          }
        );

        // Handle file updates if provided
        if (config.files && config.files.length > 0) {
          const fileIds: string[] = [];
          for (const file of config.files) {
            if (typeof file === 'string') {
              fileIds.push(file);
            } else if (file.id) {
              fileIds.push(file.id);
            }
          }

          // Update vector store if needed
          if (config.tools?.fileSearch && fileIds.length > 0) {
            let vectorStoreId = config.vectorStoreId;
            
            if (!vectorStoreId && config.vectorStoreName) {
              // Create a new vector store
              const vectorStore = await openaiAssistantService.createVectorStore({
                name: interpolateVariables(config.vectorStoreName, variables),
                fileIds,
              });
              vectorStoreId = vectorStore.id;
              await openaiAssistantService.attachVectorStoreToAssistant(assistant.id, vectorStoreId);
            } else if (vectorStoreId) {
              // Attach new files to existing vector store
              await openaiAssistantService.attachFilesToVectorStore(vectorStoreId, fileIds);
            }
          }
        }

        result = {
          assistantId: assistant.id,
          assistantName: assistant.name,
          operation: 'updated',
          model: assistant.model,
          tools: assistant.tools,
        };
      } else {
        throw new Error('Invalid operation or missing assistant ID for update');
      }

      // Return response
      return {
        content: JSON.stringify(result, null, 2),
        provider: 'openai',
        model: 'assistant-manager',
        processedData: result,
      };
    } catch (error) {
      return {
        content: '',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        provider: 'openai',
        model: 'assistant-manager',
      };
    }
  }
}