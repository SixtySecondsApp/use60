/**
 * Shared types for the Multi-Agent Demo page
 */

export interface PanelMetrics {
  startTime: number;
  endTime: number | null;
  durationMs: number;
  toolCount: number;
  toolsUsed: string[];
  agentsUsed: string[];
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  prompt: string;
  icon: string; // Lucide icon name
  agents: { name: string; color: string }[];
}

export interface TimelineEntry {
  agentName: string;
  displayName: string;
  color: string;
  startMs: number;
  endMs: number | null;
}

export interface MockMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: { name: string; status: 'running' | 'done' }[];
}

export interface MockAgentState {
  messages: MockMessage[];
  isThinking: boolean;
  isStreaming: boolean;
  activeAgents: {
    name: string;
    displayName: string;
    icon: string;
    color: string;
    reason: string;
    status: 'working' | 'done';
  }[];
  toolsUsed: string[];
  timeline: TimelineEntry[];
  metrics: PanelMetrics | null;
}
