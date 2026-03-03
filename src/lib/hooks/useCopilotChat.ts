/**
 * useCopilotChat Hook
 *
 * UI-friendly hook for the autonomous copilot.
 * Wraps the edge function with streaming support, message formatting,
 * and state management compatible with the existing chat UI.
 *
 * Features:
 * - Persistent session loading on mount
 * - Message persistence to database
 * - Integration with memory system
 */

import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, getSupabaseAuthToken } from '@/lib/supabase/clientV2';
import { CopilotSessionService } from '@/lib/services/copilotSessionService';
import type { CopilotMessage as PersistedMessage, CopilotMessageMetadata } from '@/lib/types/copilot';
import { toast } from 'sonner';

// =============================================================================
// Types
// =============================================================================

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: 'running' | 'completed' | 'error';
  result?: unknown;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface ActiveAgent {
  name: string;
  displayName: string;
  icon: string;
  color: string;
  reason: string;
  status: 'working' | 'done';
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
  structuredResponse?: unknown;
  preflightQuestions?: unknown;
  campaignWorkflow?: unknown;
}

export interface UseCopilotChatOptions {
  organizationId: string;
  userId: string;
  /** If provided, load this conversation on mount instead of auto-creating a main session */
  conversationId?: string | null;
  /** Initial context to pass to every request */
  initialContext?: Record<string, unknown>;
  /** Callback when a tool call starts */
  onToolStart?: (toolCall: ToolCall) => void;
  /** Callback when a tool call completes */
  onToolComplete?: (toolCall: ToolCall) => void;
  /** Callback when response is complete */
  onComplete?: (response: string, toolsUsed: string[]) => void;
  /** Callback on error */
  onError?: (error: string) => void;
  /** Enable session persistence (default: true) */
  persistSession?: boolean;
  /** Number of historical messages to load (default: 50) */
  historyLimit?: number;
}

export interface RoutingContext {
  skill_key?: string;
  confidence?: number;
  matched_by?: string;
  latency_ms?: number;
}

export interface SendMessageOptions {
  /** If true, don't show the user message in chat (used for enriched prompts from preflight) */
  silent?: boolean;
  /** Routing result from route-message edge function, passed as context to the AI */
  routingContext?: RoutingContext;
}

export interface UseCopilotChatReturn {
  /** Send a message to the copilot */
  sendMessage: (message: string, options?: SendMessageOptions) => Promise<void>;
  /** All messages in the conversation */
  messages: ChatMessage[];
  /** Whether the copilot is currently processing */
  isThinking: boolean;
  /** Whether we're streaming a response */
  isStreaming: boolean;
  /** Current tool being executed (if any) */
  currentTool: ToolCall | null;
  /** All tools used in this session */
  toolsUsed: string[];
  /** Last error (if any) */
  error: string | null;
  /** Clear all messages */
  clearMessages: () => void;
  /** Inject synthetic messages (e.g. preflight questions) */
  injectMessages: (msgs: ChatMessage[]) => void;
  /** Stop the current request */
  stopGeneration: () => void;
  /** Current conversation ID */
  conversationId: string | null;
  /** Set conversation ID externally (e.g. from CopilotContext) */
  setConversationId: (id: string | null) => void;
  /** Ensure a conversation exists in the DB via RPC, returns the conversation record */
  ensureConversation: (id: string, title?: string) => Promise<{ id: string; user_id: string; org_id: string | null; title: string; created_at: string; updated_at: string }>;
  /** Whether session is loading */
  isLoadingSession: boolean;
  /** Active specialist agents during multi-agent execution */
  activeAgents: ActiveAgent[];
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useCopilotChat(options: UseCopilotChatOptions): UseCopilotChatReturn {
  const queryClient = useQueryClient();
  const {
    persistSession = true,
    historyLimit = 50,
  } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentTool, setCurrentTool] = useState<ToolCall | null>(null);
  const [toolsUsed, setToolsUsed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(persistSession);
  const [activeAgents, setActiveAgents] = useState<ActiveAgent[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);
  const sessionServiceRef = useRef<CopilotSessionService | null>(null);
  // Ref mirror of conversationId — always up-to-date regardless of closure capture timing
  const conversationIdRef = useRef<string | null>(null);

  // Keep ref in sync with state so SSE handlers never use a stale conversationId
  // useLayoutEffect ensures immediate sync before any paint/effect
  useLayoutEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Initialize session service
  if (!sessionServiceRef.current) {
    sessionServiceRef.current = new CopilotSessionService(supabase);
  }

  /**
   * Generate a unique message ID
   */
  const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  /**
   * Send a message to the autonomous copilot
   */
  const sendMessage = useCallback(
    async (message: string, sendOpts?: SendMessageOptions) => {
      if (!message.trim()) return;

      const silent = sendOpts?.silent ?? false;

      // Add user message (skip if silent — e.g. enriched prompts from preflight)
      if (!silent) {
        const userMessage: ChatMessage = {
          id: generateId(),
          role: 'user',
          content: message,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMessage]);
      }

      setIsThinking(true);
      setError(null);
      setActiveAgents([]);

      // Persist user message to database (non-blocking)
      // Use ref to avoid stale closure — conversationId state may lag behind actual session load
      const currentConvId = conversationIdRef.current;
      if (persistSession && currentConvId && sessionServiceRef.current) {
        const userMsgPayload = {
          conversation_id: currentConvId,
          role: 'user' as const,
          content: message,
        };
        sessionServiceRef.current.addMessage(userMsgPayload).catch(async (err) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          // FK constraint violation (23503) — conversation row missing, auto-create and retry
          if (errMsg.includes('foreign key') || errMsg.includes('23503')) {
            try {
              await supabase.rpc('ensure_copilot_conversation', {
                p_id: currentConvId,
                p_user_id: options.userId,
                p_org_id: options.organizationId || null,
                p_title: 'New Conversation',
              });
              await sessionServiceRef.current!.addMessage(userMsgPayload);
            } catch (retryErr) {
              console.error('[useCopilotChat] Retry failed for user message:', retryErr);
              toast.error('Message may not be saved — conversation sync issue');
            }
          } else {
            console.warn('[useCopilotChat] Error persisting user message:', err);
            toast.error('Message may not be saved');
          }
        });
      }

      // Create placeholder assistant message
      const assistantMessageId = generateId();
      currentMessageIdRef.current = assistantMessageId;

      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        toolCalls: [],
        isStreaming: true,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Set up abort controller
      abortControllerRef.current = new AbortController();

      try {
        // Resolve auth token across both Supabase Auth and Clerk auth modes.
        const token = await getSupabaseAuthToken();

        console.log('[useCopilotChat] Auth token present:', !!token);
        console.log('[useCopilotChat] Calling copilot-autonomous with org:', options.organizationId);

        // Call the edge function
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-autonomous`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              message,
              organizationId: options.organizationId,
              context: {
                ...options.initialContext,
                user_id: options.userId,
              },
              stream: true,
              ...(sendOpts?.routingContext ? { routingContext: sendOpts.routingContext } : {}),
            }),
            signal: abortControllerRef.current.signal,
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          if (response.status === 402 || errorData.error === 'insufficient_credits') {
            throw new Error('INSUFFICIENT_CREDITS');
          }
          throw new Error(errorData.error || 'Request failed');
        }

        // Process SSE stream
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedContent = '';
        let receivedStructuredResponse: unknown = undefined;
        const currentToolCalls: ToolCall[] = [];

        setIsStreaming(true);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE events
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('event: ')) {
              const eventType = line.slice(7);
              const dataLine = lines[i + 1];

              if (dataLine?.startsWith('data: ')) {
                let data: Record<string, unknown>;
                try {
                  data = JSON.parse(dataLine.slice(6));
                } catch (parseErr) {
                  console.warn('[useCopilotChat] Failed to parse SSE data:', dataLine.slice(6, 200));
                  i++;
                  continue;
                }

                switch (eventType) {
                  case 'token':
                    // Handle streaming tokens
                    accumulatedContent += data.text || '';
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessageId
                          ? { ...m, content: accumulatedContent }
                          : m
                      )
                    );
                    break;

                  case 'message':
                  case 'message_complete':
                    // Handle complete message (legacy or completion marker)
                    if (data.content && !accumulatedContent) {
                      // Only use if we haven't accumulated tokens
                      accumulatedContent = data.content;
                    }
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessageId
                          ? { ...m, content: accumulatedContent || data.content }
                          : m
                      )
                    );
                    break;

                  case 'tool_start':
                    const newToolCall: ToolCall = {
                      id: data.id,
                      name: data.name,
                      input: data.input,
                      status: 'running',
                      startedAt: new Date(),
                    };
                    currentToolCalls.push(newToolCall);
                    setCurrentTool(newToolCall);
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessageId
                          ? { ...m, toolCalls: [...currentToolCalls] }
                          : m
                      )
                    );
                    options.onToolStart?.(newToolCall);
                    break;

                  case 'tool_result':
                    const toolIndex = currentToolCalls.findIndex(
                      (t) => t.id === data.id
                    );
                    if (toolIndex !== -1) {
                      currentToolCalls[toolIndex] = {
                        ...currentToolCalls[toolIndex],
                        status: data.success ? 'completed' : 'error',
                        result: data.result,
                        error: data.error,
                        completedAt: new Date(),
                      };
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === assistantMessageId
                            ? { ...m, toolCalls: [...currentToolCalls] }
                            : m
                        )
                      );
                      setCurrentTool(null);
                      options.onToolComplete?.(currentToolCalls[toolIndex]);

                      // Invalidate targets query when copilot updates a sales goal
                      if (data.success && data.result?.source === 'upsert_target') {
                        queryClient.invalidateQueries({ queryKey: ['targets', options.userId] });
                      }

                      // Track tools used
                      setToolsUsed((prev) => {
                        if (!prev.includes(data.name)) {
                          return [...prev, data.name];
                        }
                        return prev;
                      });
                    }
                    break;

                  case 'structured_response':
                    // Attach structured response data to the assistant message
                    receivedStructuredResponse = data;
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessageId
                          ? { ...m, structuredResponse: data }
                          : m
                      )
                    );
                    break;

                  case 'agent_start':
                    // A specialist agent has started working
                    setActiveAgents((prev) => {
                      // Avoid duplicates
                      if (prev.some((a) => a.name === data.agent)) return prev;
                      return [
                        ...prev,
                        {
                          name: data.agent,
                          displayName: data.displayName,
                          icon: data.icon,
                          color: data.color,
                          reason: data.reason,
                          status: 'working',
                        },
                      ];
                    });
                    break;

                  case 'agent_done':
                    // A specialist agent has finished
                    setActiveAgents((prev) =>
                      prev.map((a) =>
                        a.name === data.agent
                          ? { ...a, status: 'done' as const }
                          : a
                      )
                    );
                    break;

                  case 'synthesis':
                    // Synthesis content from multi-agent orchestrator
                    accumulatedContent += data.content || '';
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessageId
                          ? { ...m, content: accumulatedContent }
                          : m
                      )
                    );
                    break;

                  case 'done':
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessageId
                          ? { ...m, isStreaming: false }
                          : m
                      )
                    );
                    // Track agents used in multi-agent mode
                    if (data.agents_used) {
                      setActiveAgents((prev) =>
                        prev.map((a) => ({ ...a, status: 'done' as const }))
                      );
                    }
                    options.onComplete?.(accumulatedContent, data.toolsUsed || []);

                    // Belt-and-suspenders: if any tool call in this turn was upsert_target,
                    // invalidate targets even if the tool_result event was missed/ambiguous
                    const hadTargetUpdate = currentToolCalls.some(
                      (tc) =>
                        tc.status === 'completed' &&
                        (tc.result?.source === 'upsert_target' ||
                          (tc.result?.data?.field && String(tc.result.data.field).endsWith('_target')))
                    );
                    if (hadTargetUpdate) {
                      queryClient.invalidateQueries({ queryKey: ['targets', options.userId] });
                    }

                    // Persist assistant message after streaming completes
                    // Use ref to get latest conversationId — the closure may have captured a stale value
                    const persistConvId = conversationIdRef.current;
                    if (persistSession && persistConvId && sessionServiceRef.current && accumulatedContent) {
                      const toolCallsMeta = currentToolCalls.length > 0
                        ? currentToolCalls.map((tc) => ({
                            id: tc.id,
                            name: tc.name,
                            input: tc.input,
                            status: tc.status,
                            result: tc.result,
                            error: tc.error,
                          }))
                        : undefined;

                      const metadata: Record<string, unknown> = {};
                      if (toolCallsMeta) metadata.tool_calls = toolCallsMeta;
                      if (receivedStructuredResponse) metadata.structuredResponse = receivedStructuredResponse;

                      // Include multi-agent attribution so compaction/memory extraction
                      // can understand which specialists contributed to the response
                      if (data.is_multi_agent) {
                        metadata.is_multi_agent = true;
                        metadata.agents_used = data.agents_used;
                        metadata.agent_responses = data.agent_responses;
                        metadata.strategy = data.strategy;
                      }

                      const assistantMsgPayload = {
                        conversation_id: persistConvId,
                        role: 'assistant' as const,
                        content: accumulatedContent,
                        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
                      };
                      sessionServiceRef.current.addMessage(assistantMsgPayload).catch(async (err) => {
                        const errMsg = err instanceof Error ? err.message : String(err);
                        if (errMsg.includes('foreign key') || errMsg.includes('23503')) {
                          try {
                            await supabase.rpc('ensure_copilot_conversation', {
                              p_id: persistConvId,
                              p_user_id: options.userId,
                              p_org_id: options.organizationId || null,
                              p_title: 'New Conversation',
                            });
                            await sessionServiceRef.current!.addMessage(assistantMsgPayload);
                          } catch (retryErr) {
                            console.error('[useCopilotChat] Retry failed for assistant message:', retryErr);
                            toast.error('AI response may not be saved — conversation sync issue');
                          }
                        } else {
                          console.error('[useCopilotChat] Error persisting assistant message:', err);
                          toast.error('AI response may not be saved');
                        }
                      });
                    } else if (persistSession && !accumulatedContent) {
                      console.warn('[useCopilotChat] Assistant message not persisted — accumulatedContent empty at done event');
                    }
                    break;

                  case 'error':
                    setError(data.message);
                    options.onError?.(data.message);
                    break;
                }

                i++; // Skip the data line we just processed
              }
            }
          }
        }

        // Ensure message isStreaming is always set to false when stream ends,
        // even if no 'done' event was received (e.g. unexpected stop reason)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId && m.isStreaming
              ? { ...m, isStreaming: false, content: m.content || "I wasn't able to process that request. Please try again." }
              : m
          )
        );
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Request was cancelled
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: m.content + ' [Stopped]', isStreaming: false }
                : m
            )
          );
        } else {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const isInsufficientCredits = errorMsg === 'INSUFFICIENT_CREDITS';
          const displayMsg = isInsufficientCredits
            ? 'Your organization has run out of AI credits. Please top up to continue using the copilot.'
            : errorMsg;

          setError(displayMsg);
          options.onError?.(displayMsg);

          // Update message with error
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: isInsufficientCredits
                      ? 'Your organization has run out of AI credits. Please visit Settings > Credits to top up.'
                      : `Sorry, an error occurred: ${errorMsg}`,
                    isStreaming: false,
                  }
                : m
            )
          );
        }
      } finally {
        setIsThinking(false);
        setIsStreaming(false);
        setCurrentTool(null);
        abortControllerRef.current = null;
        currentMessageIdRef.current = null;
      }
    },
    [options, persistSession]
  );

  /**
   * Clear all messages
   */
  const clearMessages = useCallback(() => {
    // Ensure any in-flight generation is fully cancelled when resetting chat.
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setMessages([]);
    setToolsUsed([]);
    setError(null);
    setIsThinking(false);
    setIsStreaming(false);
    setCurrentTool(null);
    setActiveAgents([]);
    currentMessageIdRef.current = null;
  }, []);

  /**
   * Inject synthetic messages (e.g. preflight clarification questions)
   */
  const injectMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages((prev) => [...prev, ...msgs]);
  }, []);

  /**
   * Stop the current generation
   */
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  /**
   * Ensure a conversation exists in the DB via the ensure_copilot_conversation RPC.
   * Returns the conversation record (created or existing).
   */
  const ensureConversation = useCallback(
    async (id: string, title?: string) => {
      const { data, error: rpcError } = await supabase.rpc('ensure_copilot_conversation', {
        p_id: id,
        p_user_id: options.userId,
        p_org_id: options.organizationId || null,
        p_title: title || 'New Conversation',
      });

      if (rpcError) throw rpcError;
      if (!data || data.length === 0) throw new Error('ensure_copilot_conversation returned no data');

      const record = data[0];
      setConversationId(record.id);
      return record;
    },
    [options.userId, options.organizationId]
  );

  // Load conversation messages when conversationId is provided via options
  useEffect(() => {
    const convId = options.conversationId;
    if (!persistSession || !options.userId || !convId) {
      setIsLoadingSession(false);
      return;
    }

    let cancelled = false;

    async function loadConversationMessages() {
      try {
        const service = sessionServiceRef.current!;

        // Set the conversation ID immediately
        if (!cancelled) {
          setConversationId(convId!);
        }

        // Load recent messages for this conversation
        const persistedMessages = await service.loadMessages({
          conversation_id: convId!,
          limit: historyLimit,
          include_compacted: false,
        });

        if (cancelled) return;

        if (persistedMessages.length > 0) {
          const chatMessages: ChatMessage[] = persistedMessages.map((m) => ({
            id: m.id,
            role: m.role as MessageRole,
            content: m.content,
            timestamp: new Date(m.created_at),
            toolCalls: m.metadata?.tool_calls?.map((tc: Record<string, unknown>) => ({
              id: tc.id,
              name: tc.name,
              input: tc.input,
              status: tc.status,
              result: tc.result,
              error: tc.error,
              startedAt: tc.startedAt ? new Date(tc.startedAt as string) : new Date(),
            })),
            structuredResponse: (m.metadata as Record<string, unknown>)?.structuredResponse,
          }));
          setMessages(chatMessages);
        } else {
          setMessages([]);
        }
      } catch (err) {
        console.error('[useCopilotChat] Error loading conversation messages:', err);
        toast.error('Could not load conversation history');
      } finally {
        if (!cancelled) {
          setIsLoadingSession(false);
        }
      }
    }

    loadConversationMessages();

    return () => {
      cancelled = true;
    };
  }, [options.conversationId, options.userId, persistSession, historyLimit]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    sendMessage,
    messages,
    isThinking,
    isStreaming,
    currentTool,
    toolsUsed,
    error,
    clearMessages,
    injectMessages,
    stopGeneration,
    conversationId,
    setConversationId,
    ensureConversation,
    isLoadingSession,
    activeAgents,
  };
}

export default useCopilotChat;
