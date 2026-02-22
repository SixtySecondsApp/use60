/**
 * Copilot Context Provider
 * Manages global state for AI Copilot feature
 *
 * Supports two modes:
 * 1. Regular mode: Direct question/answer with the copilot API
 * 2. Agent mode: Autonomous agent that understands, plans, executes, and reports
 */

import React, { createContext, useContext, useState, useCallback, useRef, ReactNode, useEffect } from 'react';
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
  ToolState,
  ToolStep
} from '@/components/copilot/toolTypes';
import type { ToolExecutionDetail } from '@/components/copilot/types';
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
import { useActionItemsStore, createActionItemFromStep, type ActionItemType } from '@/lib/stores/actionItemsStore';
import { getStepDurationEstimate } from '@/lib/utils/toolUtils';
import { useCopilotChat, type ToolCall as AutonomousToolCall, type ActiveAgent, type ChatMessage as AutonomousChatMessage } from '@/lib/hooks/useCopilotChat';
import { detectMissingInfo, enrichPromptWithAnswers, isWorkflowPrompt, isCampaignPrompt, detectCampaignMissingInfo, generateCampaignName } from '@/lib/utils/prospectingDetector';

// Key used to store copilot engine preference in user_settings.preferences JSON
const COPILOT_ENGINE_PREF_KEY = 'copilot_engine'; // 'autonomous' | 'classic'

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

// Context types that can be fetched for the right panel
export type ContextDataType = 'hubspot' | 'fathom' | 'calendar';

// Resolved entity data from resolve_entity tool - smart contact lookup
export interface ResolvedEntityData {
  name: string;
  email?: string;
  company?: string;
  role?: string;
  recencyScore: number;
  source: 'crm' | 'meeting' | 'calendar' | 'email';
  lastInteraction?: string;
  confidence: 'high' | 'medium' | 'needs_clarification';
  alternativeCandidates?: number;
}

// Import ProgressStep type from CopilotRightPanel (US-007)
import type { ProgressStep } from '@/components/copilot/CopilotRightPanel';

interface CopilotContextValue {
  // Core state
  isOpen: boolean;
  openCopilot: (initialQuery?: string, startNewChat?: boolean) => void;
  closeCopilot: () => void;
  sendMessage: (message: string, options?: { silent?: boolean }) => Promise<void>;
  cancelRequest: () => void;
  messages: CopilotMessage[];
  isLoading: boolean;
  context: CopilotContextType;
  setContext: (context: Partial<CopilotContextType>) => void;
  startNewChat: () => void;
  conversationId?: string;
  loadConversation: (conversationId: string) => Promise<void>;
  setConversationId: (conversationId: string) => void;

  // Progress steps for right panel (US-007)
  progressSteps: ProgressStep[];

  // Context panel data control
  relevantContextTypes: ContextDataType[];

  // Resolved entity from smart contact lookup
  resolvedEntity: ResolvedEntityData | null;

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
    activeAgents: ActiveAgent[];
  };
  /** Raw autonomous copilot messages — used by useToolResultContext to extract tool results */
  autonomousMessages: import('@/lib/hooks/useCopilotChat').ChatMessage[];
  enableAutonomousMode: () => void;
  disableAutonomousMode: () => void;

  // CPT-003: Copilot engine preference
  /** Current engine preference: 'autonomous' (Claude) | 'classic' (Gemini) */
  copilotEnginePreference: 'autonomous' | 'classic';
  /** Set engine preference and persist to user_settings */
  setCopilotEnginePreference: (pref: 'autonomous' | 'classic') => Promise<void>;
  /** Whether the engine preference is being loaded from the database */
  isLoadingEnginePreference: boolean;
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
  // Track whether conversation exists in database (vs client-generated UUID for URL)
  const [isConversationPersisted, setIsConversationPersisted] = useState(false);
  const [context, setContextState] = useState<CopilotContextType>({
    userId: '',
    currentView: 'dashboard'
  });
  const [pendingQuery, setPendingQuery] = useState<{ query: string; startNewChat: boolean } | null>(null);
  const [relevantContextTypes, setRelevantContextTypes] = useState<ContextDataType[]>([]);
  const [resolvedEntity, setResolvedEntity] = useState<ResolvedEntityData | null>(null);

  // =============================================================================
  // Agent Mode State
  // =============================================================================

  const [agentModeEnabled, setAgentModeEnabled] = useState(false);
  // CPT-003: autonomousModeEnabled is now derived from the user's persisted engine preference.
  // Default to true (autonomous) until the preference is loaded from the database.
  const [autonomousModeEnabled, setAutonomousModeEnabled] = useState(true);
  const [copilotEnginePreference, setCopilotEnginePreferenceState] = useState<'autonomous' | 'classic'>('autonomous');
  const [isLoadingEnginePreference, setIsLoadingEnginePreference] = useState(true);

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

  // Clear expired action items on mount
  useEffect(() => {
    const actionItemsStore = useActionItemsStore.getState();
    actionItemsStore.clearExpired();
    logger.log('🧹 Cleared expired action items on CopilotProvider mount');
  }, []);

  // Abort controller for cancelling requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Step progression timer ref for cleaning up
  const stepProgressionRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup step progression timer on unmount
  useEffect(() => {
    return () => {
      if (stepProgressionRef.current) {
        clearTimeout(stepProgressionRef.current);
      }
    };
  }, []);

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

  // CPT-003: Load copilot engine preference from user_settings on mount (after auth is set)
  React.useEffect(() => {
    if (!context.userId) return;

    const loadEnginePreference = async () => {
      try {
        const { data, error } = await supabase
          .from('user_settings')
          .select('preferences')
          .eq('user_id', context.userId)
          .maybeSingle();

        if (error) {
          logger.warn('[CopilotContext] Could not load engine preference:', error.message);
          return;
        }

        const prefs = (data?.preferences as Record<string, unknown> | null) ?? {};
        const saved = prefs[COPILOT_ENGINE_PREF_KEY];

        if (saved === 'classic' || saved === 'autonomous') {
          setCopilotEnginePreferenceState(saved);
          setAutonomousModeEnabled(saved === 'autonomous');
        }
        // If no preference saved, stay with default (autonomous = true)
      } catch (err) {
        logger.warn('[CopilotContext] Error loading engine preference:', err);
      } finally {
        setIsLoadingEnginePreference(false);
      }
    };

    loadEnginePreference();
  }, [context.userId]);

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
    // Clear step progression timer
    if (stepProgressionRef.current) {
      clearTimeout(stepProgressionRef.current);
      stepProgressionRef.current = null;
    }
    setState(prev => ({
      ...prev,
      messages: [],
      conversationId: undefined,
      currentInput: '',
      mode: 'empty',
      isLoading: false
    }));
    setIsConversationPersisted(false);

    // Clear context panel data
    setRelevantContextTypes([]);
    setResolvedEntity(null);

    // Reset agent state if in agent mode
    if (agentModeEnabled) {
      agent.reset();
    }

    // Reset autonomous copilot if in autonomous mode
    if (autonomousModeEnabled) {
      autonomousCopilot.stopGeneration();
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

  // CPT-003: Persist engine preference to user_settings and switch mode
  const setCopilotEnginePreference = useCallback(async (pref: 'autonomous' | 'classic') => {
    const isCurrentlyInConversation = autonomousModeEnabled
      ? autonomousCopilot.messages.length > 0
      : state.messages.length > 0;

    if (isCurrentlyInConversation) {
      toast.warning('Copilot engine changed — starting a new conversation.');
    }

    // Update local state
    setCopilotEnginePreferenceState(pref);
    const newAutonomous = pref === 'autonomous';
    setAutonomousModeEnabled(newAutonomous);

    // Clear current session for a clean switch
    if (newAutonomous) {
      setAgentModeEnabled(false);
      autonomousCopilot.clearMessages();
    } else {
      autonomousCopilot.clearMessages();
    }
    setState(prev => ({
      ...prev,
      messages: [],
      conversationId: undefined,
      mode: 'empty',
      isLoading: false,
    }));

    // Persist to user_settings
    try {
      if (!context.userId) return;

      // Read current preferences first to merge (avoid overwriting other prefs)
      const { data: existing } = await supabase
        .from('user_settings')
        .select('preferences')
        .eq('user_id', context.userId)
        .maybeSingle();

      const currentPrefs = (existing?.preferences as Record<string, unknown> | null) ?? {};
      const updatedPrefs = { ...currentPrefs, [COPILOT_ENGINE_PREF_KEY]: pref };

      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: context.userId,
          preferences: updatedPrefs,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) {
        logger.error('[CopilotContext] Failed to save engine preference:', error);
        toast.error('Failed to save copilot preference');
      } else {
        logger.log('[CopilotContext] Engine preference saved:', pref);
      }
    } catch (err) {
      logger.error('[CopilotContext] Error saving engine preference:', err);
    }
  }, [autonomousModeEnabled, autonomousCopilot, state.messages.length, context.userId]);

  // Derived autonomous mode state
  const autonomousMode = {
    enabled: autonomousModeEnabled,
    isThinking: autonomousCopilot.isThinking,
    isStreaming: autonomousCopilot.isStreaming,
    currentTool: autonomousCopilot.currentTool,
    toolsUsed: autonomousCopilot.toolsUsed,
    activeAgents: autonomousCopilot.activeAgents,
  };

  // =============================================================================
  // CPT-002: HITL Preview → Confirm flow for autonomous mode
  // Track structured responses with isSimulation=true in the action items store,
  // exactly as regular mode does. The confirm/cancel buttons in response
  // components call sendMessage('Confirm') / sendMessage("Cancel, I don't need this")
  // which routes through autonomousCopilot.sendMessage in autonomous mode.
  // =============================================================================
  const trackedSimulationIdsRef = useRef<Set<string>>(new Set());

  React.useEffect(() => {
    if (!autonomousModeEnabled) return;

    for (let i = autonomousCopilot.messages.length - 1; i >= 0; i--) {
      const msg = autonomousCopilot.messages[i];
      if (msg.role !== 'assistant' || !msg.structuredResponse) continue;

      const sr = msg.structuredResponse as any;
      const data = sr?.data;
      if (!data?.isSimulation || !data?.sequenceKey) continue;

      // Deduplicate: only track each execution once
      const trackingKey = data.executionId || `${data.sequenceKey}-${msg.id}`;
      if (trackedSimulationIdsRef.current.has(trackingKey)) break;
      trackedSimulationIdsRef.current.add(trackingKey);

      const actionItemsStore = useActionItemsStore.getState();
      const taskPreview = data.taskPreview || data.prepTaskPreview;

      const typeMap: Record<string, ActionItemType> = {
        'seq-pipeline-focus-tasks': 'task',
        'seq-deal-rescue-pack': 'task',
        'seq-next-meeting-command-center': 'meeting',
        'seq-post-meeting-followup-pack': 'email',
        'seq-deal-map-builder': 'task',
        'seq-daily-focus-plan': 'task',
        'seq-followup-zero-inbox': 'email',
        'seq-deal-slippage-guardrails': 'slack',
      };
      const itemType = typeMap[data.sequenceKey] || 'other';

      const item = createActionItemFromStep(
        data.sequenceKey,
        data.executionId || `autonomous-preview-${Date.now()}`,
        {
          type: itemType,
          title: taskPreview?.title || `${String(sr.type || '').replace(/_/g, ' ')} preview`,
          description: taskPreview?.description || sr.summary,
          contactId: data.contact?.id,
          contactName: data.contact?.name,
          dealId: data.deal?.id,
          dealName: data.deal?.name,
          previewData: data,
        }
      );

      actionItemsStore.addItem(item);
      logger.log('[CopilotContext] CPT-002: Tracked autonomous simulation as action item:', data.sequenceKey);
      break; // Only process the most recent simulation
    }
  }, [autonomousModeEnabled, autonomousCopilot.messages]);

  // When autonomous mode re-executes with isSimulation=false, mark pending items confirmed
  React.useEffect(() => {
    if (!autonomousModeEnabled) return;

    for (let i = autonomousCopilot.messages.length - 1; i >= 0; i--) {
      const msg = autonomousCopilot.messages[i];
      if (msg.role !== 'assistant' || !msg.structuredResponse) continue;

      const sr = msg.structuredResponse as any;
      const data = sr?.data;
      if (!data || data.isSimulation !== false || !data.sequenceKey) continue;

      const actionItemsStore = useActionItemsStore.getState();
      const pendingItems = actionItemsStore.getItemsBySequence(data.sequenceKey);
      pendingItems
        .filter(item => item.status === 'pending')
        .forEach(item => {
          actionItemsStore.confirmItem(item.id);
          logger.log('[CopilotContext] CPT-002: Confirmed autonomous action item:', item.id);
        });
      break;
    }
  }, [autonomousModeEnabled, autonomousCopilot.messages]);

  // =============================================================================
  // Extract resolved entity from autonomous tool calls for right panel
  // =============================================================================
  React.useEffect(() => {
    if (!autonomousModeEnabled) return;
    // Scan latest messages for resolve_entity tool results
    for (let i = autonomousCopilot.messages.length - 1; i >= 0; i--) {
      const msg = autonomousCopilot.messages[i];
      if (msg.role !== 'assistant' || !msg.toolCalls) continue;
      const entityCall = msg.toolCalls.find(
        tc => tc.name === 'resolve_entity' && tc.status === 'completed' && tc.result
      );
      if (entityCall?.result) {
        const result = entityCall.result as any;
        // Handle disambiguation (multiple candidates)
        if (result.candidates?.length > 1 || result.disambiguation_needed) {
          const topCandidate = result.candidates?.[0];
          if (topCandidate) {
            setResolvedEntity({
              name: topCandidate.full_name || topCandidate.name,
              email: topCandidate.email,
              company: topCandidate.company_name || topCandidate.company,
              role: topCandidate.title || topCandidate.role,
              recencyScore: topCandidate.recency_score || 0,
              source: topCandidate.type || topCandidate.source || 'crm',
              lastInteraction: topCandidate.last_interaction,
              confidence: 'needs_clarification',
              alternativeCandidates: (result.candidates?.length || 1) - 1,
            });
          }
        } else if (result.contact) {
          // Single clear match
          const match = result.contact;
          setResolvedEntity({
            name: match.full_name || match.name,
            email: match.email,
            company: match.company_name || match.company,
            role: match.title || match.role,
            recencyScore: match.recency_score || 0,
            source: match.type || match.source || 'crm',
            lastInteraction: match.last_interaction,
            confidence: 'high',
            alternativeCandidates: 0,
          });
        }
        return; // Found entity data, stop scanning
      }
    }
  }, [autonomousModeEnabled, autonomousCopilot.messages]);

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

      // Clear step progression timer
      if (stepProgressionRef.current) {
        clearTimeout(stepProgressionRef.current);
        stepProgressionRef.current = null;
      }

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
      // Use canonical reset path to avoid mode-specific state drift/races.
      startNewChat();
      // Keep input state in sync for UI affordances while pending query sends.
      setState(prev => ({
        ...prev,
        currentInput: initialQuery || '',
        mode: initialQuery ? 'active' : 'empty',
      }));
      
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
  }, [startNewChat]);

  const closeCopilot = useCallback(() => {
    setIsOpen(false);
  }, []);

  const setContext = useCallback((newContext: Partial<CopilotContextType>) => {
    setContextState(prev => ({
      ...prev,
      ...newContext
    }));
  }, []);

  // Helper function to create tool call from real telemetry
  const createToolCallFromTelemetry = useCallback((executions: ToolExecutionDetail[]): ToolCall => {
    // Map capability to tool type
    const capabilityToToolType = (capability?: string, toolName?: string): ToolType => {
      // Entity resolution tool - smart contact lookup
      if (toolName === 'resolve_entity') return 'entity_resolution';
      if (capability === 'crm') return 'pipeline_data';
      if (capability === 'calendar') return 'calendar_search';
      if (capability === 'email') {
        if (toolName?.includes('draft')) return 'email_draft';
        return 'email_search';
      }
      if (capability === 'meetings') return 'meeting_analysis';
      if (capability === 'messaging') return 'contact_lookup';
      // Fallback based on tool name
      if (toolName?.includes('task')) return 'task_search';
      if (toolName?.includes('contact')) return 'contact_search';
      if (toolName?.includes('deal')) return 'deal_health';
      return 'pipeline_data'; // Default
    };

    // Get capability labels
    const getCapabilityLabel = (capability?: string): string => {
      const labels: Record<string, string> = {
        crm: 'CRM',
        calendar: 'Calendar',
        email: 'Email',
        meetings: 'Meetings',
        messaging: 'Messaging',
        entity_resolution: 'Finding Contact',
      };
      return labels[capability || ''] || 'Tool';
    };

    // Get provider labels
    const getProviderLabel = (provider?: string): string => {
      const labels: Record<string, string> = {
        db: 'Database',
        hubspot: 'HubSpot',
        salesforce: 'Salesforce',
        google: 'Google',
        gmail: 'Gmail',
        slack: 'Slack',
        fathom: 'Fathom',
        meetingbaas: 'MeetingBaaS',
      };
      return labels[provider || ''] || provider || '';
    };

    // Map internal tool names to user-friendly labels
    const getToolLabel = (toolName?: string): string => {
      const labels: Record<string, string> = {
        // Core actions
        execute_action: 'Processing request',
        run_sequence: 'Running workflow',
        list_skills: 'Loading capabilities',
        get_skill: 'Retrieving skill',
        resolve_entity: 'Finding contact',
        // CRM operations
        get_deals: 'Fetching deals',
        get_contacts: 'Fetching contacts',
        get_companies: 'Fetching companies',
        search_deals: 'Searching deals',
        search_contacts: 'Searching contacts',
        create_task: 'Creating task',
        update_deal: 'Updating deal',
        // Calendar operations
        get_calendar_events: 'Checking calendar',
        get_meetings: 'Loading meetings',
        get_meetings_for_period: 'Finding meetings',
        // Email operations
        draft_email: 'Drafting email',
        search_emails: 'Searching emails',
        send_email: 'Sending email',
        // Meeting operations
        get_meeting_transcript: 'Loading transcript',
        analyze_meeting: 'Analyzing meeting',
        // Task operations
        get_tasks: 'Loading tasks',
        search_tasks: 'Searching tasks',
        // Activity
        get_activities: 'Loading activities',
        log_activity: 'Logging activity',
      };
      return labels[toolName || ''] || 'Processing';
    };

    // Group executions by capability
    const executionsByCapability = new Map<string, ToolExecutionDetail[]>();
    for (const exec of executions) {
      const cap = exec.capability || 'unknown';
      if (!executionsByCapability.has(cap)) {
        executionsByCapability.set(cap, []);
      }
      executionsByCapability.get(cap)!.push(exec);
    }

    // Create steps from executions
    const steps: ToolStep[] = [];
    for (const [capability, execs] of executionsByCapability.entries()) {
      for (const exec of execs) {
        const toolType = capabilityToToolType(exec.capability, exec.toolName);
        const capabilityLabel = getCapabilityLabel(exec.capability);
        const providerLabel = getProviderLabel(exec.provider);
        
        const toolLabel = getToolLabel(exec.toolName);
        const providerSuffix = providerLabel ? ` via ${providerLabel}` : '';

        steps.push({
          id: `step-${exec.toolName}-${exec.latencyMs}`,
          label: `${toolLabel}${providerSuffix}`,
          icon: capability === 'crm' ? 'database' : capability === 'calendar' ? 'calendar' : capability === 'email' ? 'mail' : 'activity',
          state: exec.success ? 'complete' : 'complete', // All steps are complete when we receive telemetry
          duration: exec.latencyMs,
          metadata: { result: exec.result, args: exec.args },
          capability: exec.capability,
          provider: exec.provider,
        });
      }
    }

    // Determine overall tool type from first execution
    const firstExec = executions[0];
    const toolType = capabilityToToolType(firstExec?.capability, firstExec?.toolName);

    return {
      id: `tool-${Date.now()}`,
      tool: toolType,
      state: 'complete',
      startTime: executions.reduce((min, e) => Math.min(min, Date.now() - (e.latencyMs || 0)), Date.now()),
      endTime: Date.now(),
      steps,
      capability: firstExec?.capability,
      provider: firstExec?.provider,
    };
  }, []);

  // Helper function to detect intent and determine tool type
  const detectToolType = useCallback((message: string): ToolType | null => {
    const lowerMessage = message.toLowerCase();

    // -------------------------------------------------------------------------
    // Skill-first intent hints (used for the "working story" stepper while waiting)
    // -------------------------------------------------------------------------
    // Post-meeting follow-up pack (email + Slack + tasks)
    if (
      lowerMessage.includes('follow-up pack') ||
      lowerMessage.includes('follow up pack') ||
      lowerMessage.includes('post-meeting') ||
      lowerMessage.includes('post meeting') ||
      lowerMessage.includes('send recap') ||
      lowerMessage.includes('write recap') ||
      lowerMessage.includes('create follow-ups') ||
      lowerMessage.includes('create follow ups')
    ) {
      return 'post_meeting_followup_pack';
    }

    // Next meeting prep / briefing
    if (
      (lowerMessage.includes('next meeting') || lowerMessage.includes('my next meeting')) &&
      (lowerMessage.includes('prep') || lowerMessage.includes('prepare') || lowerMessage.includes('brief'))
    ) {
      return 'next_meeting_prep';
    }
    
    // Contact/email queries - check for email addresses or contact names
    const emailPattern = /[\w.-]+@[\w.-]+\.\w+/;
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

    // Fallback: show a generic loading animation for any query
    // This ensures users always see visual feedback while waiting
    return 'general_query';
  }, []);

  // Helper function to detect which context panel data sources are relevant
  const detectRelevantContextTypes = useCallback((message: string): ContextDataType[] => {
    const lowerMessage = message.toLowerCase();
    const types: ContextDataType[] = [];

    // HubSpot/CRM context - contacts, deals, pipeline, companies
    const crmKeywords = [
      'contact', 'deal', 'pipeline', 'company', 'account', 'opportunity',
      'lead', 'prospect', 'customer', 'crm', 'hubspot', 'salesforce',
      'health score', 'deal health', 'stale', 'attention', 'priority',
      'follow up', 'follow-up', 'email', 'draft'
    ];
    if (crmKeywords.some(keyword => lowerMessage.includes(keyword))) {
      types.push('hubspot');
    }

    // Fathom/Meetings context - calls, transcripts, meetings analysis
    const meetingKeywords = [
      'meeting', 'call', 'transcript', 'fathom', 'recording',
      'said', 'discussed', 'talked about', 'mentioned', 'conversation',
      'prep', 'prepare', 'brief', 'debrief', 'summary', 'summarise', 'summarize',
      'what did', 'action items', 'next steps'
    ];
    if (meetingKeywords.some(keyword => lowerMessage.includes(keyword))) {
      types.push('fathom');
    }

    // Calendar context - scheduling, upcoming meetings
    const calendarKeywords = [
      'calendar', 'schedule', 'upcoming', 'today', 'tomorrow', 'this week',
      'next week', 'appointment', 'event', 'when', 'time', 'busy', 'free',
      'book', 'reschedule'
    ];
    if (calendarKeywords.some(keyword => lowerMessage.includes(keyword))) {
      types.push('calendar');
    }

    return types;
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
        next_meeting_prep: [
          { label: 'Finding your next meeting', icon: 'calendar' },
          { label: 'Loading deal + contact context', icon: 'users' },
          { label: 'Generating one-page brief', icon: 'activity' },
          { label: 'Preparing prep task preview', icon: 'check-circle' }
        ],
        post_meeting_followup_pack: [
          { label: 'Loading most recent recorded meeting', icon: 'calendar' },
          { label: 'Extracting decisions & next steps', icon: 'activity' },
          { label: 'Drafting buyer email + Slack update', icon: 'mail' },
          { label: 'Preparing follow-up task preview', icon: 'check-circle' }
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
        ],
        entity_resolution: [
          { label: 'Searching CRM contacts', icon: 'users' },
          { label: 'Searching recent meetings', icon: 'calendar' },
          { label: 'Searching calendar events', icon: 'calendar' },
          { label: 'Searching recent emails', icon: 'mail' },
          { label: 'Resolving best match', icon: 'activity' }
        ],
        general_query: [
          { label: 'Analyzing your request', icon: 'sparkles' },
          { label: 'Gathering relevant context', icon: 'database' },
          { label: 'Processing information', icon: 'activity' },
          { label: 'Preparing response', icon: 'check-circle' }
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

  // Helper function to generate contextual label from user message (fast, client-side)
  const generateContextualLabel = useCallback((message: string): string => {
    const lowerMessage = message.toLowerCase().trim();

    // Keyword-based label generation for common patterns
    const labelPatterns: Array<{ keywords: string[]; label: string }> = [
      // Pipeline & Deals
      { keywords: ['pipeline', 'deals', 'opportunities'], label: 'Analyzing pipeline' },
      { keywords: ['closing', 'close this'], label: 'Finding closing deals' },
      { keywords: ['deal health', 'how is the', 'deal going'], label: 'Checking deal health' },
      { keywords: ['stalled', 'stuck', 'at risk'], label: 'Identifying at-risk deals' },

      // Meetings
      { keywords: ['prep', 'prepare', 'brief', 'next meeting'], label: 'Preparing meeting brief' },
      { keywords: ['follow-up', 'followup', 'follow up', 'after meeting'], label: 'Creating follow-ups' },
      { keywords: ['meeting', 'meetings', 'calendar'], label: 'Checking meetings' },
      { keywords: ['schedule', 'book', 'reschedule'], label: 'Checking schedule' },

      // Email
      { keywords: ['draft email', 'write email', 'email to'], label: 'Drafting email' },
      { keywords: ['email', 'emails', 'inbox'], label: 'Searching emails' },

      // Contacts & People
      { keywords: ['contact', 'person', 'who is'], label: 'Looking up contact' },
      { keywords: ['team', 'rep', 'sales person'], label: 'Checking team data' },

      // Activity & Updates
      { keywords: ['catch me up', 'catch up', 'what did i miss', 'missed'], label: 'Reviewing recent activity' },
      { keywords: ['activity', 'activities', 'recent'], label: 'Loading activity' },
      { keywords: ['update', 'updates', 'news'], label: 'Getting updates' },
      { keywords: ['summary', 'summarize', 'summarise'], label: 'Creating summary' },

      // Tasks
      { keywords: ['task', 'tasks', 'todo', 'to-do', 'to do'], label: 'Loading tasks' },
      { keywords: ['overdue', 'due today', 'due this week'], label: 'Checking due tasks' },

      // Analytics & Insights
      { keywords: ['analytics', 'metrics', 'performance'], label: 'Analyzing performance' },
      { keywords: ['forecast', 'projection', 'predict'], label: 'Running forecast' },
      { keywords: ['coach', 'coaching', 'advice', 'tips'], label: 'Getting sales advice' },

      // Search
      { keywords: ['search', 'find', 'look for', 'looking for'], label: 'Searching' },
      { keywords: ['show me', 'show my', 'list'], label: 'Loading data' },
    ];

    // Find matching pattern
    for (const pattern of labelPatterns) {
      if (pattern.keywords.some(keyword => lowerMessage.includes(keyword))) {
        return pattern.label;
      }
    }

    // Fallback: Extract first verb + noun for a reasonable label
    // Common action verbs in sales context
    const actionVerbs = ['check', 'get', 'show', 'find', 'search', 'load', 'analyze', 'review', 'prepare', 'create', 'draft', 'update'];
    const words = lowerMessage.split(/\s+/);

    for (const verb of actionVerbs) {
      const verbIndex = words.findIndex(w => w.startsWith(verb));
      if (verbIndex !== -1 && words[verbIndex + 1]) {
        const noun = words[verbIndex + 1].replace(/[^a-z]/g, '');
        if (noun.length > 2) {
          // Capitalize first letter of verb
          const capitalizedVerb = verb.charAt(0).toUpperCase() + verb.slice(1);
          return `${capitalizedVerb}ing ${noun}`;
        }
      }
    }

    // Final fallback based on question type
    if (lowerMessage.startsWith('what') || lowerMessage.startsWith('how')) {
      return 'Analyzing request';
    }
    if (lowerMessage.startsWith('can you') || lowerMessage.startsWith('please')) {
      return 'Processing request';
    }

    return 'Processing';
  }, []);

  const sendMessage = useCallback(
    async (message: string, options?: { silent?: boolean; entities?: Array<{ id: string; type: string; name: string }>; skillCommand?: string }) => {
      const isModeLoading = autonomousModeEnabled
        ? autonomousCopilot.isThinking || autonomousCopilot.isStreaming
        : agentModeEnabled
          ? agent.isProcessing
          : state.isLoading;
      if (!message.trim() || isModeLoading) return;

      // Detect relevant context types for the right panel BEFORE routing
      // This enables context data fetching (HubSpot, Fathom, Calendar) in all modes
      const contextTypes = detectRelevantContextTypes(message);
      setRelevantContextTypes(contextTypes);

      // =============================================================================
      // @ Mention Entity Context Injection & /Skill Command Handling
      // =============================================================================
      let enrichedMessage = message;
      let entityContextBlock = '';

      // Resolve entity context if entities are provided
      if (options?.entities && options.entities.length > 0) {
        try {
          const { resolveEntityContexts, formatEntityContextForPrompt } = await import('@/lib/services/entityContextService');
          const contexts = await resolveEntityContexts(options.entities as any);
          entityContextBlock = formatEntityContextForPrompt(contexts);
          logger.log(`[CopilotContext] Resolved entity context for ${options.entities.length} entities`);
        } catch (err) {
          logger.error('[CopilotContext] Failed to resolve entity context:', err);
        }
      }

      // Handle /skill command if present
      if (options?.skillCommand) {
        try {
          const { parseSkillCommand, validateSkillEntities, buildSkillPrompt } = await import('@/lib/copilot/skillCommandParser');
          const parsed = parseSkillCommand({
            text: message,
            entities: options.entities || [],
            skillCommand: options.skillCommand,
          });

          if (parsed) {
            // Validate entity requirements
            const validationError = validateSkillEntities(parsed.command, parsed.entities);
            if (validationError) {
              // Show validation error as an assistant message
              logger.warn('[CopilotContext] Skill validation failed:', validationError.message);
              // Still send but prepend the validation hint
              enrichedMessage = `${entityContextBlock}\n\n${message}\n\n[Note: ${validationError.message}]`;
            } else {
              // Build the enriched skill prompt
              enrichedMessage = buildSkillPrompt(parsed, entityContextBlock);
              logger.log(`[CopilotContext] Built skill prompt for /${parsed.command}`);

              // Track execution (fire and forget)
              if (activeOrgId) {
                supabase.auth.getUser().then(({ data }) => {
                  if (data?.user?.id) {
                    supabase.from('copilot_skill_executions').insert({
                      skill_key: parsed.skillKey,
                      user_id: data.user.id,
                      org_id: activeOrgId,
                      entities_referenced: parsed.entities,
                      input_text: message,
                    });
                  }
                }).catch(() => {});
              }
            }
          }
        } catch (err) {
          logger.error('[CopilotContext] Failed to parse skill command:', err);
        }
      } else if (entityContextBlock) {
        // No skill command but has entity context — just prepend context
        enrichedMessage = `${entityContextBlock}\n\n${message}`;
      }

      // =============================================================================
      // Autonomous Copilot Mode Routing (new skill-based tool use)
      // =============================================================================
      if (autonomousModeEnabled) {
        // Campaign pre-flight: intercept campaign prompts (more specific, check first)
        if (!options?.silent && isCampaignPrompt(message)) {
          const campaignQuestions = detectCampaignMissingInfo(message);
          if (campaignQuestions.length > 0) {
            logger.log('[CopilotContext] Campaign preflight: injecting campaign workflow questions');
            const userMsg: AutonomousChatMessage = {
              id: `msg-${Date.now()}-user`,
              role: 'user',
              content: message,
              timestamp: new Date(),
            };
            const assistantMsg: AutonomousChatMessage = {
              id: `msg-${Date.now()}-campaign`,
              role: 'assistant',
              content: '',
              timestamp: new Date(),
              campaignWorkflow: {
                original_prompt: message,
                questions: campaignQuestions,
                suggested_campaign_name: generateCampaignName(message),
              },
            };
            autonomousCopilot.injectMessages([userMsg, assistantMsg]);
            return;
          }
        }

        // Prospecting pre-flight: intercept workflow prompts to ask clarifying questions
        // Skip preflight if this is already an enriched prompt sent silently from preflight UI
        if (!options?.silent && isWorkflowPrompt(message)) {
          const questions = detectMissingInfo(message);
          if (questions.length > 0) {
            logger.log('[CopilotContext] Prospecting preflight: injecting clarifying questions');
            const userMsg: AutonomousChatMessage = {
              id: `msg-${Date.now()}-user`,
              role: 'user',
              content: message,
              timestamp: new Date(),
            };
            const assistantMsg: AutonomousChatMessage = {
              id: `msg-${Date.now()}-preflight`,
              role: 'assistant',
              content: '',
              timestamp: new Date(),
              preflightQuestions: {
                original_prompt: message,
                questions,
              },
            };
            autonomousCopilot.injectMessages([userMsg, assistantMsg]);
            return;
          }
        }

        logger.log('[CopilotContext] Routing to autonomous copilot mode');
        await autonomousCopilot.sendMessage(enrichedMessage, options);
        return;
      }

      // =============================================================================
      // Agent Mode Routing (legacy planning agent)
      // =============================================================================
      if (agentModeEnabled) {
        logger.log('[CopilotContext] Routing to agent mode');
        await agent.sendMessage(enrichedMessage);
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

      // Tool call will be created from real telemetry in the response
      let toolCall: ToolCall | undefined;
      const predictedToolType = detectToolType(message);
      if (predictedToolType) {
        toolCall = createToolCall(predictedToolType);
        // Add contextual label based on user's message
        toolCall.customLabel = generateContextualLabel(message);
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
        // Show tool call as processing with time-based step progression
        if (toolCall) {
          // Check if request was cancelled
          if (abortSignal.aborted) {
            logger.log('Request cancelled');
            return;
          }

          // Clear any existing step progression timer
          if (stepProgressionRef.current) {
            clearTimeout(stepProgressionRef.current);
            stepProgressionRef.current = null;
          }

          // Set tool call to processing state immediately with first step active
          setState(prev => {
            const updatedMessages = prev.messages.map(msg => {
              if (msg.id === assistantMessageId && msg.toolCall) {
                const updatedToolCall: ToolCall = {
                  ...msg.toolCall,
                  state: 'processing' as ToolState,
                  // Mark first step as active, rest as pending
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

          // Start step progression timer to advance through steps while waiting
          // Use progressive intervals - earlier steps are faster, later steps are slower
          // This matches user perception: quick initial progress, then slower "heavy lifting"
          const steps = toolCall.steps;
          const totalExpectedDuration = 10000; // 10 seconds typical API response time

          // Calculate progressive step durations: each step takes longer than the previous
          // For 4 steps: 1s, 2s, 3s, 4s = 10s total (1:2:3:4 ratio)
          const stepCount = steps.length;
          const ratioSum = (stepCount * (stepCount + 1)) / 2; // Sum of 1+2+3+...+n
          const stepDurations = Array.from({ length: stepCount }, (_, i) => {
            return Math.round((totalExpectedDuration * (i + 1)) / ratioSum);
          });

          let currentStepIndex = 0;

          const advanceStep = () => {
            // Check if cancelled
            if (abortSignal.aborted) {
              if (stepProgressionRef.current) {
                clearTimeout(stepProgressionRef.current);
                stepProgressionRef.current = null;
              }
              return;
            }

            // Move to next step (mark current as complete, next as active)
            currentStepIndex++;

            // Don't go past the last step - keep it active until response arrives
            if (currentStepIndex >= steps.length) {
              return;
            }

            setState(prev => {
              const updatedMessages = prev.messages.map(msg => {
                if (msg.id === assistantMessageId && msg.toolCall) {
                  const updatedToolCall: ToolCall = {
                    ...msg.toolCall,
                    steps: msg.toolCall.steps.map((step, idx) => ({
                      ...step,
                      state: (idx < currentStepIndex ? 'complete' : idx === currentStepIndex ? 'active' : 'pending') as ToolState,
                    }))
                  };
                  return { ...msg, toolCall: updatedToolCall };
                }
                return msg;
              });
              return { ...prev, messages: updatedMessages };
            });

            // Schedule next step advancement if not at the last step
            // Use progressive duration for the current step
            if (currentStepIndex < steps.length - 1) {
              stepProgressionRef.current = setTimeout(advanceStep, stepDurations[currentStepIndex]);
            }
          };

          // Schedule first step advancement with first step's duration
          if (steps.length > 1) {
            stepProgressionRef.current = setTimeout(advanceStep, stepDurations[0]);
          }
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

          // Only send conversationId if it exists in the database
          // For new conversations (client-generated UUID), let the API create it
          const conversationIdToSend = isConversationPersisted ? state.conversationId : undefined;

          response = await Promise.race([
            CopilotService.sendMessage(enrichedMessage, apiContext, conversationIdToSend),
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

        // Clear step progression timer now that response has arrived
        if (stepProgressionRef.current) {
          clearTimeout(stepProgressionRef.current);
          stepProgressionRef.current = null;
        }

        // Create tool call from real telemetry if available
        // For 'general_query' type, keep placeholder steps and mark as complete for better UX
        let realToolCall: ToolCall | undefined;
        if (response.tool_executions && response.tool_executions.length > 0) {
          // For generic queries, use placeholder steps marked complete instead of raw telemetry
          if (predictedToolType === 'general_query' && toolCall) {
            realToolCall = {
              ...toolCall,
              state: 'complete',
              endTime: Date.now(),
              steps: toolCall.steps.map(step => ({
                ...step,
                state: 'complete' as const
              }))
            };
            logger.log('🔧 Using completed placeholder steps for general_query');
          } else {
            realToolCall = createToolCallFromTelemetry(response.tool_executions);
            logger.log('🔧 Created tool call from telemetry:', { toolCall: realToolCall, executions: response.tool_executions });
          }

          // Check for resolve_entity tool results to update context panel
          const entityResolution = response.tool_executions.find(
            (exec: ToolExecutionDetail) => exec.toolName === 'resolve_entity' && exec.success
          );
          // Store disambiguation data for interactive selection UI
          let entityDisambiguationData: { name_searched: string; disambiguation_reason?: string; candidates: any[] } | undefined;

          if (entityResolution?.result) {
            const result = entityResolution.result;

            // Check if disambiguation is needed:
            // 1. Explicitly marked as needing disambiguation, OR
            // 2. Multiple candidates exist (even if auto-resolved, user may want to select different one)
            const hasMultipleCandidates = result.candidates?.length > 1;
            const shouldShowDisambiguation = result.disambiguation_needed || hasMultipleCandidates;

            if (shouldShowDisambiguation && result.candidates?.length > 0) {
              // Store disambiguation data for interactive UI
              entityDisambiguationData = {
                name_searched: result.search_summary?.name_searched || '',
                disambiguation_reason: result.disambiguation_reason || (hasMultipleCandidates ? `Found ${result.candidates.length} people - select the one you meant` : undefined),
                candidates: result.candidates,
              };
              logger.log('🔀 Entity disambiguation UI enabled, found', result.candidates.length, 'candidates (explicit:', result.disambiguation_needed, ', multiple:', hasMultipleCandidates, ')');

              // Also update context panel with top candidate
              const topCandidate = result.candidates[0];
              setResolvedEntity({
                name: topCandidate.full_name || topCandidate.name,
                email: topCandidate.email,
                company: topCandidate.company_name || topCandidate.company,
                role: topCandidate.title || topCandidate.role,
                recencyScore: topCandidate.recency_score || topCandidate.recencyScore || 0,
                source: topCandidate.type || topCandidate.source || 'crm',
                lastInteraction: topCandidate.last_interaction || topCandidate.lastInteraction,
                confidence: 'needs_clarification',
                alternativeCandidates: result.candidates.length - 1,
              });
            } else if (result.contact) {
              // Single clear match - update context panel
              const match = result.contact;
              setResolvedEntity({
                name: match.full_name || match.name,
                email: match.email,
                company: match.company_name || match.company,
                role: match.title || match.role,
                recencyScore: match.recency_score || match.recencyScore || 0,
                source: match.type || match.source || 'crm',
                lastInteraction: match.last_interaction || match.lastInteraction,
                confidence: 'high',
                alternativeCandidates: 0,
              });
              logger.log('🎯 Resolved entity for context panel:', match.full_name || match.name);
            }
          }
        }

        // Recapture entityDisambiguationData from tool_executions for use in message update
        let entityDisambiguationForMessage: { name_searched: string; disambiguation_reason?: string; candidates: any[] } | undefined;
        if (response.tool_executions && response.tool_executions.length > 0) {
          const entityResolution = response.tool_executions.find(
            (exec: ToolExecutionDetail) => exec.toolName === 'resolve_entity' && exec.success
          );
          // Show disambiguation UI when multiple candidates exist (even if auto-resolved)
          const hasMultipleCandidates = entityResolution?.result?.candidates?.length > 1;
          const shouldShowDisambiguation = entityResolution?.result?.disambiguation_needed || hasMultipleCandidates;
          if (shouldShowDisambiguation && entityResolution?.result?.candidates?.length > 0) {
            entityDisambiguationForMessage = {
              name_searched: entityResolution.result.search_summary?.name_searched || '',
              disambiguation_reason: entityResolution.result.disambiguation_reason || (hasMultipleCandidates ? `Found ${entityResolution.result.candidates.length} people - select the one you meant` : undefined),
              candidates: entityResolution.result.candidates,
            };
          }
        }

        // Update AI message with actual response
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
                // Show tool call if we have telemetry, otherwise remove it
                toolCall: realToolCall,
                // Include entity disambiguation data for interactive selection UI
                entityDisambiguation: entityDisambiguationForMessage,
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

        // Mark conversation as persisted now that API has created/confirmed it
        if (response.conversationId) {
          setIsConversationPersisted(true);
        }

        // Track simulation responses in Action Items Store for pending approvals
        const structuredResponse = response.response.structuredResponse;
        if (structuredResponse?.data) {
          const data = structuredResponse.data as {
            isSimulation?: boolean;
            sequenceKey?: string;
            executionId?: string;
            taskPreview?: { title?: string; description?: string } | null;
            prepTaskPreview?: { title?: string; description?: string } | null;
            deal?: { id?: string; name?: string } | null;
            contact?: { id?: string; name?: string } | null;
            meeting?: { id?: string; title?: string } | null;
          };

          // Track simulation (preview) responses in Action Items Store
          if (data.isSimulation && data.sequenceKey) {
            const actionItemsStore = useActionItemsStore.getState();
            const taskPreview = data.taskPreview || data.prepTaskPreview;

            // Determine action item type based on sequence key
            const typeMap: Record<string, ActionItemType> = {
              'seq-pipeline-focus-tasks': 'task',
              'seq-deal-rescue-pack': 'task',
              'seq-next-meeting-command-center': 'meeting',
              'seq-post-meeting-followup-pack': 'email',
              'seq-deal-map-builder': 'task',
              'seq-daily-focus-plan': 'task',
              'seq-followup-zero-inbox': 'email',
              'seq-deal-slippage-guardrails': 'slack',
            };

            const itemType = typeMap[data.sequenceKey] || 'other';
            const item = createActionItemFromStep(
              data.sequenceKey,
              data.executionId || `preview-${Date.now()}`,
              {
                type: itemType,
                title: taskPreview?.title || `${structuredResponse.type.replace(/_/g, ' ')} preview`,
                description: taskPreview?.description || structuredResponse.summary,
                contactId: data.contact?.id,
                contactName: data.contact?.name,
                dealId: data.deal?.id,
                dealName: data.deal?.name,
                previewData: data,
              }
            );

            actionItemsStore.addItem(item);
            logger.log('📋 Added action item for preview:', data.sequenceKey);
          } else if (!data.isSimulation && data.sequenceKey) {
            // Confirmed execution - mark matching pending items as confirmed
            const actionItemsStore = useActionItemsStore.getState();
            const pendingItems = actionItemsStore.getItemsBySequence(data.sequenceKey);

            // Find pending items for this sequence and mark as confirmed
            pendingItems
              .filter(item => item.status === 'pending')
              .forEach(item => {
                actionItemsStore.confirmItem(item.id);
                logger.log('✅ Confirmed action item:', item.id, data.sequenceKey);
              });
          }
        }
      } catch (error) {
        logger.error('❌ Error sending message to Copilot:', error);

        const rawMessage =
          error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';

        // Enhanced debugging in development
        if (import.meta.env.DEV) {
          console.error('[Copilot Debug] Full error:', error);
          console.error('[Copilot Debug] Raw message:', rawMessage);
          console.error('[Copilot Debug] Error type:', error?.constructor?.name);
        }

        // Categorize errors for better user feedback
        const errorCategories = {
          cors: /cors|failed to fetch|networkerror|preflight|access control/i,
          timeout: /timeout|timed out|deadline|504|408/i,
          rateLimit: /rate limit|too many requests|429|throttl/i,
          auth: /unauthorized|401|403|forbidden|auth|token/i,
          serverError: /500|502|503|internal server|bad gateway|service unavailable/i,
          skillError: /skill not found|skill.*disabled|not enabled/i,
          confirmationRequired: /confirmation required|needs_confirmation/i,
          insufficientCredits: /insufficient.credits|402|run out of.*credits/i,
        };

        const getErrorMessage = (): string => {
          if (errorCategories.insufficientCredits.test(rawMessage)) {
            return 'Your organization has run out of AI credits. Please visit Settings > Credits to top up.';
          }
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
        if (import.meta.env.DEV) {
          if (errorCategories.cors.test(rawMessage)) {
            toast.error(
              'Copilot request blocked (likely CORS / Edge Function preflight). Re-deploy with verify_jwt=false for api-copilot and allow localhost:5175.'
            );
          } else {
            // Show the actual error in dev mode for debugging
            toast.error(`[DEV] Copilot error: ${rawMessage.slice(0, 150)}`);
          }
        }

        // Update the existing assistant message with error and remove tool call
        setState(prev => {
          const updatedMessages = prev.messages.map(msg => {
            if (msg.id === assistantMessageId) {
              return {
                ...msg,
                content: getErrorMessage(),
                toolCall: undefined, // Remove tool call to trigger fade out
                isError: true // UX-001: Flag for retry button rendering
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
    [context, state.conversationId, state.isLoading, detectToolType, createToolCall, detectRelevantContextTypes, generateContextualLabel, agentModeEnabled, agent, autonomousModeEnabled, autonomousCopilot]
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
      setIsConversationPersisted(copilotMessages.length > 0); // Persisted if has messages

      logger.log('Loaded conversation:', conversationId, 'with', copilotMessages.length, 'messages');
    } catch (error) {
      logger.error('Failed to load conversation:', error);
      setState(prev => ({ ...prev, isLoading: false }));
      setIsConversationPersisted(false); // Failed to load, not persisted
    }
  }, []);

  // Set conversation ID without loading messages (for new conversations from URL)
  // This is used for client-generated IDs that don't exist in database yet
  const setConversationId = useCallback((conversationId: string) => {
    setState(prev => ({
      ...prev,
      conversationId,
    }));
    setIsConversationPersisted(false); // Not in database yet
    logger.log('Set conversation ID (not persisted):', conversationId);
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
        structuredResponse: msg.structuredResponse as CopilotMessage['structuredResponse'],
        preflightQuestions: msg.preflightQuestions as CopilotMessage['preflightQuestions'],
        campaignWorkflow: msg.campaignWorkflow as CopilotMessage['campaignWorkflow'],
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

  // US-007: Derive progress steps from the latest message's toolCall
  // This shows real-time progress in the right panel Progress section
  const progressSteps: ProgressStep[] = React.useMemo(() => {
    // Autonomous mode: derive progress from useCopilotChat tool calls
    if (autonomousModeEnabled) {
      const lastMsg = [...autonomousCopilot.messages]
        .reverse()
        .find(m => m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0);
      if (lastMsg?.toolCalls) {
        return lastMsg.toolCalls.map((tc, idx) => {
          // Map tool names to user-friendly labels
          const label = tc.name === 'execute_action'
            ? `Running ${(tc.input as any)?.action?.replace(/_/g, ' ') || 'action'}`
            : tc.name === 'list_skills'
              ? 'Discovering available skills'
              : tc.name === 'get_skill'
                ? `Loading skill: ${(tc.input as any)?.skill_key || 'skill'}`
                : tc.name === 'resolve_entity'
                  ? `Looking up ${(tc.input as any)?.name || 'contact'}`
                  : tc.name.replace(/_/g, ' ');
          // Map tool icons
          const icon = tc.name === 'execute_action' ? 'activity'
            : tc.name === 'list_skills' ? 'database'
            : tc.name === 'get_skill' ? 'file-text'
            : tc.name === 'resolve_entity' ? 'user'
            : 'activity';
          const duration = tc.completedAt && tc.startedAt
            ? tc.completedAt.getTime() - tc.startedAt.getTime()
            : undefined;
          return {
            id: idx + 1,
            label,
            icon,
            duration,
            status: tc.status === 'completed' ? 'complete' as const
              : tc.status === 'running' ? 'active' as const
              : 'pending' as const,
          };
        });
      }
      return [];
    }
    // Regular mode: derive from toolCall.steps on CopilotMessage
    for (let i = activeMessages.length - 1; i >= 0; i--) {
      const msg = activeMessages[i];
      if (msg.role === 'assistant' && msg.toolCall?.steps?.length) {
        return msg.toolCall.steps.map((step, idx) => ({
          id: idx + 1,
          label: step.label,
          status: step.state === 'complete'
            ? 'complete' as const
            : step.state === 'active'
              ? 'active' as const
              : 'pending' as const
        }));
      }
    }
    return [];
  }, [activeMessages, autonomousModeEnabled, autonomousCopilot.messages]);

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
    setConversationId,

    // Progress steps for right panel (US-007)
    progressSteps,

    // Context panel data control
    relevantContextTypes,

    // Resolved entity from smart contact lookup
    resolvedEntity,

    // Agent mode (legacy planning agent)
    agentMode,
    enableAgentMode,
    disableAgentMode,
    respondToAgentQuestion,

    // Autonomous copilot mode (new skill-based tool use)
    autonomousMode,
    autonomousMessages: autonomousCopilot.messages,
    enableAutonomousMode,
    disableAutonomousMode,

    // CPT-003: Copilot engine preference
    copilotEnginePreference,
    setCopilotEnginePreference,
    isLoadingEnginePreference,
  };

  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
};

