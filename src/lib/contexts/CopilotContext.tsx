/**
 * Copilot Context Provider
 * Manages global state for AI Copilot feature
 *
 * Supports two modes:
 * 1. Regular mode: Direct question/answer with the copilot API
 * 2. Agent mode: Autonomous agent that understands, plans, executes, and reports
 */

import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { CopilotService } from '@/lib/services/copilotService';
import type {
  CopilotMessage,
  CopilotState,
  CopilotContext as CopilotContextType,
  Recommendation
} from '@/components/copilot/types';
import type {
  ToolCall,
  ToolType,
  ToolState
} from '@/components/copilot/toolTypes';
import type {
  ExecutionPlan,
  ExecutionReport,
  QuestionOption,
} from '@/lib/copilot/agent/types';
import { supabase } from '@/lib/supabase/clientV2';
import logger from '@/lib/utils/logger';
import { getTemporalContext } from '@/lib/utils/temporalContext';
import { useOrg } from '@/lib/contexts/OrgContext';
import { toast } from 'sonner';
import { useAutonomousAgent } from '@/lib/copilot/agent/useAutonomousAgent';
import { useCopilotChat, type ToolCall as AutonomousToolCall } from '@/lib/hooks/useCopilotChat';

// =============================================================================
// Agent Mode Types
// =============================================================================

interface AgentQuestion {
  messageId: string;
  question: string;
  options?: QuestionOption[];
}

interface AgentModeState {
  /** Whether agent mode is enabled */
  enabled: boolean;
  /** Current question awaiting response */
  currentQuestion: AgentQuestion | null;
  /** Current execution plan */
  currentPlan: ExecutionPlan | null;
  /** Final report from agent */
  report: ExecutionReport | null;
}

// =============================================================================
// Context Value Interface
// =============================================================================

interface CopilotContextValue {
  // Core state
  isOpen: boolean;
  openCopilot: (initialQuery?: string, startNewChat?: boolean) => void;
  closeCopilot: () => void;
  sendMessage: (message: string) => Promise<void>;
  cancelRequest: () => void;
  messages: CopilotMessage[];
  isLoading: boolean;
  context: CopilotContextType;
  setContext: (context: Partial<CopilotContextType>) => void;
  startNewChat: () => void;
  conversationId?: string;
  loadConversation: (conversationId: string) => Promise<void>;

  // Agent mode
  agentMode: AgentModeState;
  enableAgentMode: () => void;
  disableAgentMode: () => void;
  respondToAgentQuestion: (response: string | string[]) => Promise<void>;

  // Autonomous copilot mode (new)
  autonomousMode: {
    enabled: boolean;
    isThinking: boolean;
    isStreaming: boolean;
    currentTool: AutonomousToolCall | null;
    toolsUsed: string[];
  };
  enableAutonomousMode: () => void;
  disableAutonomousMode: () => void;
}

const CopilotContext = createContext<CopilotContextValue | undefined>(undefined);

export const useCopilot = () => {
  const context = useContext(CopilotContext);
  if (!context) {
    throw new Error('useCopilot must be used within CopilotProvider');
  }
  return context;
};

interface CopilotProviderProps {
  children: ReactNode;
}

export const CopilotProvider: React.FC<CopilotProviderProps> = ({ children }) => {
  const { activeOrgId } = useOrg();
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<CopilotState>({
    mode: 'empty',
    messages: [],
    isLoading: false,
    currentInput: '',
    conversationId: undefined
  });
  const [context, setContextState] = useState<CopilotContextType>({
    userId: '',
    currentView: 'dashboard'
  });
  const [pendingQuery, setPendingQuery] = useState<{ query: string; startNewChat: boolean } | null>(null);

  // =============================================================================
  // Agent Mode State
  // =============================================================================

  const [agentModeEnabled, setAgentModeEnabled] = useState(false);
  const [autonomousModeEnabled, setAutonomousModeEnabled] = useState(true); // Enabled by default

  // Initialize autonomous copilot (new skill-based tool use)
  const autonomousCopilot = useCopilotChat({
    organizationId: activeOrgId || '',
    userId: context.userId || '',
    initialContext: {
      currentView: context.currentView,
      contactId: context.contactId,
      dealIds: context.dealIds,
    },
    onToolStart: (toolCall) => {
      logger.log('[CopilotContext] Autonomous tool started:', toolCall.name);
    },
    onToolComplete: (toolCall) => {
      logger.log('[CopilotContext] Autonomous tool completed:', toolCall.name, toolCall.status);
    },
    onComplete: (response, toolsUsed) => {
      logger.log('[CopilotContext] Autonomous copilot completed, tools used:', toolsUsed);
    },
    onError: (error) => {
      logger.error('[CopilotContext] Autonomous copilot error:', error);
      toast.error('Copilot encountered an error: ' + error);
    },
  });

  // Initialize autonomous agent (legacy planning agent)
  const agent = useAutonomousAgent({
    organizationId: activeOrgId || '',
    userId: context.userId || '',
    onComplete: (report) => {
      logger.log('[CopilotContext] Agent completed:', report.summary);
    },
    onError: (error) => {
      logger.error('[CopilotContext] Agent error:', error);
      toast.error('Agent encountered an error: ' + error);
    },
  });

  // Derived agent mode state
  const agentMode: AgentModeState = {
    enabled: agentModeEnabled,
    currentQuestion: agent.currentQuestion,
    currentPlan: agent.currentPlan,
    report: agent.report,
  };

  // Abort controller for cancelling requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize user context
  React.useEffect(() => {
    const initContext = async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (session?.user) {
        setContextState(prev => ({
          ...prev,
          userId: session.user.id
        }));
      }
    };
    initContext();
  }, []);

  // Keep orgId in Copilot context (org-scoped assistant)
  // Clear org-scoped context (contactId, dealIds) when org changes to avoid stale references
  const prevOrgIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const isOrgChange = prevOrgIdRef.current !== null && prevOrgIdRef.current !== activeOrgId;
    prevOrgIdRef.current = activeOrgId;

    setContextState(prev => {
      // If org changed, clear org-scoped context to avoid stale references
      if (isOrgChange) {
        return {
          ...prev,
          orgId: activeOrgId || undefined,
          contactId: undefined,  // Clear stale contact reference
          dealIds: undefined,    // Clear stale deal references
        };
      }
      // Normal update - just set the orgId
      return {
        ...prev,
        orgId: activeOrgId || undefined,
      };
    });

    // If org changed, also clear conversation to avoid confusion
    if (isOrgChange) {
      setState(prev => ({
        ...prev,
        messages: [],
        conversationId: undefined,
        mode: 'empty',
      }));
    }
  }, [activeOrgId]);

  const startNewChat = useCallback(() => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState(prev => ({
      ...prev,
      messages: [],
      conversationId: undefined,
      currentInput: '',
      mode: 'empty',
      isLoading: false
    }));

    // Reset agent state if in agent mode
    if (agentModeEnabled) {
      agent.reset();
    }

    // Reset autonomous copilot if in autonomous mode
    if (autonomousModeEnabled) {
      autonomousCopilot.clearMessages();
    }
  }, [agentModeEnabled, agent, autonomousModeEnabled, autonomousCopilot]);

  // =============================================================================
  // Agent Mode Controls
  // =============================================================================

  const enableAgentMode = useCallback(() => {
    logger.log('[CopilotContext] Enabling agent mode');
    setAgentModeEnabled(true);
    // Reset both regular and agent state for clean start
    setState(prev => ({
      ...prev,
      messages: [],
      conversationId: undefined,
      mode: 'empty',
      isLoading: false
    }));
    agent.reset();
  }, [agent]);

  const disableAgentMode = useCallback(() => {
    logger.log('[CopilotContext] Disabling agent mode');
    setAgentModeEnabled(false);
    agent.reset();
  }, [agent]);

  const respondToAgentQuestion = useCallback(async (response: string | string[]) => {
    if (!agentModeEnabled) {
      logger.warn('[CopilotContext] respondToAgentQuestion called but agent mode is disabled');
      return;
    }
    await agent.respondToQuestion(response);
  }, [agentModeEnabled, agent]);

  // =============================================================================
  // Autonomous Copilot Mode Controls (new skill-based tool use)
  // =============================================================================

  const enableAutonomousMode = useCallback(() => {
    logger.log('[CopilotContext] Enabling autonomous copilot mode');
    setAutonomousModeEnabled(true);
    // Disable other modes
    setAgentModeEnabled(false);
    // Clear messages for fresh start
    autonomousCopilot.clearMessages();
    setState(prev => ({
      ...prev,
      messages: [],
      conversationId: undefined,
      mode: 'empty',
      isLoading: false
    }));
  }, [autonomousCopilot]);

  const disableAutonomousMode = useCallback(() => {
    logger.log('[CopilotContext] Disabling autonomous copilot mode');
    setAutonomousModeEnabled(false);
    autonomousCopilot.clearMessages();
  }, [autonomousCopilot]);

  // Derived autonomous mode state
  const autonomousMode = {
    enabled: autonomousModeEnabled,
    isThinking: autonomousCopilot.isThinking,
    isStreaming: autonomousCopilot.isStreaming,
    currentTool: autonomousCopilot.currentTool,
    toolsUsed: autonomousCopilot.toolsUsed,
  };

  // Cancel the current request
  const cancelRequest = useCallback(() => {
    // Handle autonomous mode cancellation
    if (autonomousModeEnabled) {
      autonomousCopilot.stopGeneration();
      logger.log('Autonomous copilot request cancelled by user');
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      logger.log('Request cancelled by user');

      // Update state to remove loading and pending message
      setState(prev => {
        // Remove the last assistant message if it's still loading (has toolCall)
        const messages = prev.messages.filter((msg, idx) => {
          if (idx === prev.messages.length - 1 && msg.role === 'assistant' && msg.toolCall) {
            return false;
          }
          return true;
        });

        return {
          ...prev,
          messages,
          isLoading: false
        };
      });
    }
  }, [autonomousModeEnabled, autonomousCopilot]);

  const openCopilot = useCallback((initialQuery?: string, startNewChatFlag?: boolean) => {
    setIsOpen(true);
    
    // If starting a new chat, reset the conversation state
    if (startNewChatFlag) {
      // Reset state first - this will clear messages and conversationId
      setState({
        messages: [],
        conversationId: undefined,
        currentInput: initialQuery || '',
        mode: initialQuery ? 'active' : 'empty',
        isLoading: false
      });
      
      // Set pending query to trigger auto-send after state reset
    if (initialQuery) {
        setPendingQuery({ query: initialQuery, startNewChat: true });
      }
    } else if (initialQuery) {
      setState(prev => ({
        ...prev,
        currentInput: initialQuery,
        mode: 'active'
      }));
      // Set pending query to trigger auto-send
      setPendingQuery({ query: initialQuery, startNewChat: false });
    } else {
      setState(prev => ({
        ...prev,
        mode: prev.messages.length > 0 ? 'active' : 'empty'
      }));
    }
  }, []);

  const closeCopilot = useCallback(() => {
    setIsOpen(false);
  }, []);

  const setContext = useCallback((newContext: Partial<CopilotContextType>) => {
    setContextState(prev => ({
      ...prev,
      ...newContext
    }));
  }, []);

  // Helper function to detect intent and determine tool type
  const detectToolType = useCallback((message: string): ToolType | null => {
    const lowerMessage = message.toLowerCase();
    
    // Contact/email queries - check for email addresses or contact names
    const emailPattern = /[\w\.-]+@[\w\.-]+\.\w+/;
    const hasEmail = emailPattern.test(message);
    const contactKeywords = ['contact', 'person', 'about', 'info on', 'tell me about', 'show me', 'lookup', 'find'];
    const hasContactKeyword = contactKeywords.some(keyword => lowerMessage.includes(keyword));
    
    if (hasEmail || (hasContactKeyword && (lowerMessage.includes('@') || lowerMessage.includes('email')))) {
      return 'contact_search';
    }
    
    // Task queries - check before pipeline to avoid conflicts
    if (
      lowerMessage.includes('task') || 
      lowerMessage.includes('tasks') || 
      lowerMessage.includes('todo') ||
      lowerMessage.includes('to-do') ||
      (lowerMessage.includes('list') && (lowerMessage.includes('task') || lowerMessage.includes('priority'))) ||
      (lowerMessage.includes('show') && lowerMessage.includes('task')) ||
      lowerMessage.includes('high priority task') ||
      lowerMessage.includes('overdue')
    ) {
      return 'task_search';
    }
    
    // General "prioritize" questions default to tasks (more actionable day-to-day)
    // But if pipeline/deal is mentioned, use pipeline
    if (lowerMessage.includes('prioritize') || lowerMessage.includes('what should i prioritize')) {
      if (lowerMessage.includes('pipeline') || lowerMessage.includes('deal') || lowerMessage.includes('deals')) {
        return 'pipeline_data';
      }
      // Default to tasks for general prioritize questions
      return 'task_search';
    }
    
    if (lowerMessage.includes('pipeline') || lowerMessage.includes('deal') || lowerMessage.includes('priority') || lowerMessage.includes('attention')) {
      return 'pipeline_data';
    }
    // Email queries - distinguish between drafting and searching
    const emailSearchKeywords = [
      'last email',
      'recent email',
      'emails from',
      'emails with',
      'email history',
      'what emails',
      'my emails',
      'show emails',
      'inbox',
      'gmail',
      'messages from'
    ];
    const isEmailSearch = emailSearchKeywords.some(keyword => lowerMessage.includes(keyword)) ||
      (lowerMessage.includes('email') && (lowerMessage.includes('what') || lowerMessage.includes('show') || lowerMessage.includes('find') || lowerMessage.includes('last') || lowerMessage.includes('recent')));
    
    if (isEmailSearch) {
      return 'email_search';
    }
    
    if (lowerMessage.includes('email') || lowerMessage.includes('draft')) {
      return 'email_draft';
    }
    if (lowerMessage.includes('calendar') || lowerMessage.includes('meeting') || lowerMessage.includes('schedule')) {
      return 'calendar_search';
    }
    if (lowerMessage.includes('contact') || lowerMessage.includes('person')) {
      return 'contact_lookup';
    }
    if (lowerMessage.includes('health') || lowerMessage.includes('score')) {
      return 'deal_health';
    }
    if (
      lowerMessage.includes('roadmap') || 
      lowerMessage.includes('add a roadmap') ||
      lowerMessage.includes('create roadmap') ||
      lowerMessage.includes('roadmap item')
    ) {
      return 'roadmap_create';
    }
    if (
      lowerMessage.includes('performance') ||
      lowerMessage.includes('how am i doing') ||
      lowerMessage.includes('how is my performance') ||
      lowerMessage.includes('sales coach') ||
      lowerMessage.includes('compare') && (lowerMessage.includes('month') || lowerMessage.includes('period')) ||
      (lowerMessage.includes('this month') && lowerMessage.includes('last month'))
    ) {
      return 'sales_coach';
    }
    
    return null;
  }, []);

  // Helper function to create initial tool call
  const createToolCall = useCallback((toolType: ToolType): ToolCall => {
      const getStepsForTool = (tool: ToolType) => {
      const stepConfigs: Record<ToolType, Array<{ label: string; icon: string }>> = {
        task_search: [
          { label: 'Searching tasks database', icon: 'database' },
          { label: 'Filtering by priority and status', icon: 'activity' },
          { label: 'Calculating due dates', icon: 'calendar' },
          { label: 'Organizing results', icon: 'activity' }
        ],
        pipeline_data: [
          { label: 'Fetching deals from database', icon: 'database' },
          { label: 'Calculating health scores', icon: 'activity' },
          { label: 'Analyzing priorities', icon: 'activity' },
          { label: 'Generating recommendations', icon: 'activity' }
        ],
        email_draft: [
          { label: 'Loading contact history', icon: 'users' },
          { label: 'Retrieving last meeting notes', icon: 'calendar' },
          { label: 'Generating personalized email', icon: 'mail' }
        ],
        email_search: [
          { label: 'Connecting to Gmail', icon: 'mail' },
          { label: 'Searching inbox', icon: 'database' },
          { label: 'Loading email details', icon: 'activity' }
        ],
        calendar_search: [
          { label: 'Connecting to Google Calendar', icon: 'calendar' },
          { label: 'Filtering meetings', icon: 'activity' },
          { label: 'Loading meeting details', icon: 'activity' }
        ],
        contact_lookup: [
          { label: 'Searching contacts', icon: 'users' },
          { label: 'Loading recent activity', icon: 'activity' }
        ],
        contact_search: [
          { label: 'Finding contact by email', icon: 'users' },
          { label: 'Fetching emails and communications', icon: 'mail' },
          { label: 'Loading deals and activities', icon: 'activity' },
          { label: 'Gathering meetings and tasks', icon: 'calendar' },
          { label: 'Compiling smart summary', icon: 'activity' }
        ],
        deal_health: [
          { label: 'Analyzing engagement metrics', icon: 'activity' },
          { label: 'Calculating risk factors', icon: 'activity' },
          { label: 'Generating health score', icon: 'activity' }
        ],
        meeting_analysis: [
          { label: 'Loading meeting data', icon: 'calendar' },
          { label: 'Analyzing discussion points', icon: 'activity' },
          { label: 'Generating insights', icon: 'activity' }
        ],
        roadmap_create: [
          { label: 'Preparing roadmap item', icon: 'file-text' },
          { label: 'Validating details', icon: 'activity' },
          { label: 'Creating roadmap item', icon: 'database' },
          { label: 'Confirming creation', icon: 'check-circle' }
        ],
        sales_coach: [
          { label: 'Gathering sales data', icon: 'database' },
          { label: 'Analyzing performance metrics', icon: 'activity' },
          { label: 'Comparing periods', icon: 'bar-chart' },
          { label: 'Generating insights', icon: 'lightbulb' },
          { label: 'Creating recommendations', icon: 'target' }
        ]
      };

      return stepConfigs[tool] || [];
    };

    const steps = getStepsForTool(toolType).map((config, i) => ({
      id: `step-${i}`,
      label: config.label,
      icon: config.icon,
      state: 'pending' as const
    }));

    return {
      id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tool: toolType,
      state: 'initiating' as ToolState,
      startTime: Date.now(),
      steps
    };
  }, []);

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim() || state.isLoading) return;

      // =============================================================================
      // Autonomous Copilot Mode Routing (new skill-based tool use)
      // =============================================================================
      if (autonomousModeEnabled) {
        logger.log('[CopilotContext] Routing to autonomous copilot mode');
        await autonomousCopilot.sendMessage(message);
        return;
      }

      // =============================================================================
      // Agent Mode Routing (legacy planning agent)
      // =============================================================================
      if (agentModeEnabled) {
        logger.log('[CopilotContext] Routing to agent mode');
        await agent.sendMessage(message);
        return;
      }

      // =============================================================================
      // Regular Copilot Mode
      // =============================================================================

      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();
      const abortSignal = abortControllerRef.current.signal;

      // Add user message to state
      const userMessage: CopilotMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date()
      };

      // Detect tool type and create tool call if needed
      const toolType = detectToolType(message);
      let toolCall: ToolCall | undefined;

      if (toolType) {
        toolCall = createToolCall(toolType);
        logger.log('🔧 Created tool call:', { toolType, toolCall });
      }

      // Add assistant message placeholder with tool call
      const assistantMessageId = `assistant-${Date.now()}`;
      const aiMessagePlaceholder: CopilotMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        toolCall
      };

      logger.log('📨 Adding messages:', { userMessage, aiMessagePlaceholder });

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, userMessage, aiMessagePlaceholder],
        isLoading: true,
        mode: 'active',
        currentInput: ''
      }));

      try {
        // Show tool call as processing (honest state - no fake step simulation)
        if (toolCall) {
          // Check if request was cancelled
          if (abortSignal.aborted) {
            logger.log('Request cancelled');
            return;
          }

          // Set tool call to processing state immediately (no fake progress steps)
          setState(prev => {
            const updatedMessages = prev.messages.map(msg => {
              if (msg.id === assistantMessageId && msg.toolCall) {
                const updatedToolCall: ToolCall = {
                  ...msg.toolCall,
                  state: 'processing' as ToolState,
                  // Mark first step as active, rest as pending - actual completion comes from response
                  steps: msg.toolCall.steps.map((step, idx) => ({
                    ...step,
                    state: (idx === 0 ? 'active' : 'pending') as ToolState,
                  }))
                };

                return { ...msg, toolCall: updatedToolCall };
              }
              return msg;
            });
            
            return { ...prev, messages: updatedMessages };
          });
        }

        // Check if cancelled before API call
        if (abortSignal.aborted) {
          logger.log('Request cancelled before API call');
          return;
        }

        // Send to API with timeout and abort support
        let response;
        try {
          const timeoutPromise = new Promise<never>((_, reject) => {
            const timeoutId = setTimeout(() => reject(new Error('Request timeout')), 30000);
            // Clear timeout if aborted
            abortSignal.addEventListener('abort', () => {
              clearTimeout(timeoutId);
              reject(new Error('Request cancelled'));
            });
          });

          // Format context for API
          const apiContext: CopilotContextType = {
            ...context,
            userId: context.userId || '',
            currentView: context.currentView || 'dashboard',
            contactId: context.contactId,
            dealIds: context.dealIds,
            orgId: context.orgId,
            temporalContext: getTemporalContext()
          };

          response = await Promise.race([
            CopilotService.sendMessage(message, apiContext, state.conversationId),
            timeoutPromise
          ]) as Awaited<ReturnType<typeof CopilotService.sendMessage>>;
        } catch (err: any) {
          if (err.message === 'Request cancelled' || abortSignal.aborted) {
            logger.log('Request was cancelled');
            return;
          }
          // Preserve fast-fail errors (e.g., CORS/preflight/network) so we can show useful dev diagnostics.
          // Only rewrite true timeouts to a friendly message.
          if (err?.message === 'Request timeout') {
            throw new Error('Request took too long. Please try again.');
          }
          throw (err instanceof Error ? err : new Error(String(err)));
        }

        // Update AI message with actual response - this will trigger fade out of tool call
        setState(prev => {
          const updatedMessages = prev.messages.map(msg => {
            if (msg.id === assistantMessageId) {
              const updatedMessage: CopilotMessage = {
                id: msg.id,
                role: msg.role,
                content: response.response.content || 'I processed your request, but received an empty response.',
          timestamp: new Date(response.timestamp),
                recommendations: response.response.recommendations || undefined,
                structuredResponse: response.response.structuredResponse || undefined,
                // Remove toolCall when response is ready to trigger fade out
                toolCall: undefined
              };
              
              return updatedMessage;
            }
            return msg;
          });
          
          return {
          ...prev,
            messages: updatedMessages,
          isLoading: false,
          conversationId: response.conversationId
          };
        });
      } catch (error) {
        logger.error('Error sending message to Copilot:', error);

        const rawMessage =
          error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';

        // Categorize errors for better user feedback
        const errorCategories = {
          cors: /cors|failed to fetch|networkerror|preflight|access control/i,
          timeout: /timeout|timed out|deadline|504|408/i,
          rateLimit: /rate limit|too many requests|429|throttl/i,
          auth: /unauthorized|401|403|forbidden|auth|token/i,
          serverError: /500|502|503|internal server|bad gateway|service unavailable/i,
          skillError: /skill not found|skill.*disabled|not enabled/i,
          confirmationRequired: /confirmation required|needs_confirmation/i,
        };

        const getErrorMessage = (): string => {
          if (import.meta.env.DEV && errorCategories.cors.test(rawMessage)) {
            return 'Copilot is currently unreachable from the browser (CORS / Edge Function preflight). A deploy/config fix is required.';
          }
          if (errorCategories.cors.test(rawMessage)) {
            return 'Unable to connect to Copilot. Please check your internet connection and try again.';
          }
          if (errorCategories.timeout.test(rawMessage)) {
            return 'The request took too long to complete. Please try a simpler question or try again in a moment.';
          }
          if (errorCategories.rateLimit.test(rawMessage)) {
            return 'You\'ve made too many requests. Please wait a moment before trying again.';
          }
          if (errorCategories.auth.test(rawMessage)) {
            return 'Your session may have expired. Please refresh the page and try again.';
          }
          if (errorCategories.serverError.test(rawMessage)) {
            return 'Copilot is temporarily unavailable. Please try again in a few minutes.';
          }
          if (errorCategories.skillError.test(rawMessage)) {
            return 'This capability isn\'t available for your organization. Contact your admin to enable it.';
          }
          if (errorCategories.confirmationRequired.test(rawMessage)) {
            return 'This action requires confirmation. Please confirm and try again.';
          }
          return 'Sorry, I encountered an error processing your request. Please try again.';
        };

        // Helpful dev-only toast so we don't silently fail with a generic message during local dev.
        if (import.meta.env.DEV && errorCategories.cors.test(rawMessage)) {
          toast.error(
            'Copilot request blocked (likely CORS / Edge Function preflight). Re-deploy with verify_jwt=false for api-copilot and allow localhost:5175.'
          );
        }

        // Update the existing assistant message with error and remove tool call
        setState(prev => {
          const updatedMessages = prev.messages.map(msg => {
            if (msg.id === assistantMessageId) {
              return {
                ...msg,
                content: getErrorMessage(),
                toolCall: undefined // Remove tool call to trigger fade out
              };
            }
            return msg;
          });

          return {
          ...prev,
            messages: updatedMessages,
          isLoading: false
          };
        });
      }
    },
    [context, state.conversationId, state.isLoading, detectToolType, createToolCall, agentModeEnabled, agent]
  );

  // Handle pending queries from openCopilot
  React.useEffect(() => {
    if (pendingQuery) {
      const { query, startNewChat } = pendingQuery;
      setPendingQuery(null); // Clear pending query

      // For new chats, add a small delay to ensure state is reset
      const delay = startNewChat ? 200 : 100;
      setTimeout(() => {
        sendMessage(query);
      }, delay);
    }
  }, [pendingQuery, sendMessage]);

  // Load a conversation from history
  const loadConversation = useCallback(async (conversationId: string) => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));

      // Fetch conversation messages from database
      const { data: messages, error } = await supabase
        .from('copilot_messages')
        .select('id, role, content, metadata, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('Error loading conversation:', error);
        throw error;
      }

      // Convert database messages to CopilotMessage format
      const copilotMessages: CopilotMessage[] = (messages || []).map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: new Date(msg.created_at),
        structuredResponse: msg.metadata?.structuredResponse,
        recommendations: msg.metadata?.recommendations
      }));

      setState(prev => ({
        ...prev,
        messages: copilotMessages,
        conversationId,
        mode: copilotMessages.length > 0 ? 'active' : 'empty',
        isLoading: false
      }));

      logger.log('Loaded conversation:', conversationId, 'with', copilotMessages.length, 'messages');
    } catch (error) {
      logger.error('Failed to load conversation:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Determine which messages to show based on mode
  // Priority: autonomousMode > agentMode > regular
  const getActiveMessages = (): CopilotMessage[] => {
    if (autonomousModeEnabled) {
      // Convert autonomous copilot messages to CopilotMessage format
      return autonomousCopilot.messages.map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: msg.timestamp,
        // Note: toolCalls are passed separately via ChatMessage props
      }));
    }
    if (agentModeEnabled) {
      return agent.messages;
    }
    return state.messages;
  };

  const activeMessages = getActiveMessages();
  const activeIsLoading = autonomousModeEnabled
    ? autonomousCopilot.isThinking
    : agentModeEnabled
      ? agent.isProcessing
      : state.isLoading;

  const value: CopilotContextValue = {
    // Core state
    isOpen,
    openCopilot,
    closeCopilot,
    sendMessage,
    cancelRequest,
    messages: activeMessages,
    isLoading: activeIsLoading,
    context,
    setContext,
    startNewChat,
    conversationId: state.conversationId,
    loadConversation,

    // Agent mode (legacy planning agent)
    agentMode,
    enableAgentMode,
    disableAgentMode,
    respondToAgentQuestion,

    // Autonomous copilot mode (new skill-based tool use)
    autonomousMode,
    enableAutonomousMode,
    disableAutonomousMode,
  };

  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
};

