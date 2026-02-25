/**
 * Demo V2 — Shared Types
 *
 * Re-exports core types from v1 and adds v2-specific types.
 * The ResearchData shape is identical — only the flow changes.
 */

export type { ResearchData, AgentStatus, DemoPrompt } from '../demo/demo-types';

export type DemoStep =
  | 'hero'
  | 'research'
  | 'showcase'
  | 'recap'
  | 'signup';
