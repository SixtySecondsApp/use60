/**
 * useAutonomousExecutor Hook
 *
 * React hook for using the autonomous executor in the copilot.
 * Claude autonomously decides which skills to use based on user messages.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  AutonomousExecutor,
  createAutonomousExecutor,
  ExecutorConfig,
  ExecutorMessage,
  ExecutorResult,
} from './autonomousExecutor';

// =============================================================================
// Types
// =============================================================================

export interface UseAutonomousExecutorOptions {
  organizationId: string;
  userId: string;
  /** Optional organization context */
  orgContext?: Record<string, unknown>;
  /** Model override */
  model?: string;
  /** Callback when execution starts */
  onExecutionStart?: () => void;
  /** Callback when execution completes */
  onExecutionComplete?: (result: ExecutorResult) => void;
  /** Callback when a tool is called */
  onToolCall?: (toolName: string, input: Record<string, unknown>) => void;
}

export interface UseAutonomousExecutorReturn {
  /** Send a message to the executor */
  sendMessage: (message: string) => Promise<ExecutorResult>;
  /** Current execution state */
  isExecuting: boolean;
  /** Message history */
  messages: ExecutorMessage[];
  /** Tools that have been used */
  toolsUsed: string[];
  /** Last error if any */
  error: string | null;
  /** Clear the conversation */
  clearMessages: () => void;
  /** Get available tools */
  getAvailableTools: () => Array<{
    name: string;
    description: string;
    category: string;
    isSequence: boolean;
  }>;
  /** Reload skills */
  reloadSkills: () => Promise<void>;
  /** Whether the executor is initialized */
  isInitialized: boolean;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useAutonomousExecutor(
  options: UseAutonomousExecutorOptions
): UseAutonomousExecutorReturn {
  const [isExecuting, setIsExecuting] = useState(false);
  const [messages, setMessages] = useState<ExecutorMessage[]>([]);
  const [toolsUsed, setToolsUsed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const executorRef = useRef<AutonomousExecutor | null>(null);

  // Initialize executor
  useEffect(() => {
    const config: ExecutorConfig = {
      organizationId: options.organizationId,
      userId: options.userId,
      orgContext: options.orgContext,
      model: options.model,
    };

    const executor = createAutonomousExecutor(config);
    executorRef.current = executor;

    // Initialize asynchronously
    executor
      .initialize()
      .then(() => {
        setIsInitialized(true);
        console.log('[useAutonomousExecutor] Initialized');
      })
      .catch((err) => {
        console.error('[useAutonomousExecutor] Initialization error:', err);
        setError(err.message);
      });

    return () => {
      executorRef.current = null;
    };
  }, [options.organizationId, options.userId, options.model]);

  // Update org context when it changes
  useEffect(() => {
    if (executorRef.current && options.orgContext) {
      // Recreate executor with new context
      const config: ExecutorConfig = {
        organizationId: options.organizationId,
        userId: options.userId,
        orgContext: options.orgContext,
        model: options.model,
      };
      executorRef.current = createAutonomousExecutor(config);
      executorRef.current.initialize().catch(console.error);
    }
  }, [options.orgContext]);

  /**
   * Send a message to the executor
   */
  const sendMessage = useCallback(
    async (message: string): Promise<ExecutorResult> => {
      if (!executorRef.current) {
        const errorResult: ExecutorResult = {
          success: false,
          response: 'Executor not initialized',
          messages: [],
          toolsUsed: [],
          iterations: 0,
          error: 'not_initialized',
        };
        return errorResult;
      }

      setIsExecuting(true);
      setError(null);
      options.onExecutionStart?.();

      try {
        const result = await executorRef.current.execute(message);

        // Update state
        setMessages((prev) => [...prev, ...result.messages]);
        setToolsUsed((prev) => [...new Set([...prev, ...result.toolsUsed])]);

        if (!result.success && result.error) {
          setError(result.error);
        }

        options.onExecutionComplete?.(result);

        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);

        const errorResult: ExecutorResult = {
          success: false,
          response: `Error: ${errorMsg}`,
          messages: [],
          toolsUsed: [],
          iterations: 0,
          error: errorMsg,
        };

        options.onExecutionComplete?.(errorResult);
        return errorResult;
      } finally {
        setIsExecuting(false);
      }
    },
    [options]
  );

  /**
   * Clear messages
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
    setToolsUsed([]);
    setError(null);
  }, []);

  /**
   * Get available tools
   */
  const getAvailableTools = useCallback(() => {
    if (!executorRef.current) return [];
    return executorRef.current.getAvailableTools();
  }, []);

  /**
   * Reload skills
   */
  const reloadSkills = useCallback(async () => {
    if (!executorRef.current) return;
    await executorRef.current.reload();
    console.log('[useAutonomousExecutor] Skills reloaded');
  }, []);

  return {
    sendMessage,
    isExecuting,
    messages,
    toolsUsed,
    error,
    clearMessages,
    getAvailableTools,
    reloadSkills,
    isInitialized,
  };
}
