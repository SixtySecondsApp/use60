/**
 * Autonomous Agent Module
 *
 * Exports the autonomous agent orchestrator and related components.
 *
 * @example
 * ```typescript
 * import { createAutonomousAgent, AutonomousAgent } from '@/lib/copilot/agent';
 *
 * const agent = createAutonomousAgent({
 *   organizationId: 'org-123',
 *   userId: 'user-456'
 * });
 *
 * for await (const event of agent.run("Help me outreach to 50 leads")) {
 *   // Handle events
 * }
 * ```
 */

// Main Agent (pattern-matching orchestrator)
export { AutonomousAgent, createAutonomousAgent } from './agent';

// Autonomous Executor (Claude decides which tools to use)
export {
  AutonomousExecutor,
  createAutonomousExecutor,
} from './autonomousExecutor';
export type {
  SkillToolDefinition,
  ExecutorConfig,
  ExecutorMessage,
  ExecutorResult,
} from './autonomousExecutor';

// Autonomous Executor Hook
export { useAutonomousExecutor } from './useAutonomousExecutor';
export type {
  UseAutonomousExecutorOptions,
  UseAutonomousExecutorReturn,
} from './useAutonomousExecutor';

// Understanding Engine
export { UnderstandingEngine, createUnderstandingEngine } from './understand';

// Planning Engine
export { PlanningEngine, createPlanningEngine } from './planner';

// Types
export type {
  // State types
  AgentPhase,
  AgentState,
  AgentGoal,
  AgentConfig,

  // Plan types
  ExecutionPlan,
  PlannedStep,
  SkillGap,
  ExecutionReport,

  // Message types
  AgentMessage,
  AgentMessageType,
  QuestionOption,
  UserResponse,

  // Event types
  AgentEvent,
  AgentEventHandler,

  // AI service types
  UnderstandingRequest,
  UnderstandingResponse,
  PlanningRequest,
  PlanningResponse,
} from './types';
