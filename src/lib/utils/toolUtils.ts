/**
 * Tool Utilities for Copilot Stepper
 * 
 * Provides icons, labels, and duration estimates for tool types
 * Used by both ToolCallIndicator (chat) and CopilotRightPanel (sidebar)
 */

import {
  Calendar,
  Database,
  Mail,
  Users,
  Activity,
  FileText,
  BarChart3,
  Lightbulb,
  Target,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  type LucideIcon
} from 'lucide-react';
import type { ToolType } from '@/components/copilot/toolTypes';

// =============================================================================
// Tool Icon Configuration
// =============================================================================

export interface ToolIconConfig {
  icon: LucideIcon;
  label: string;
  gradient: string;
  iconColor: string;
  glowColor: string;
  estimatedDurationMs: number;
}

/**
 * Configuration for each tool type including icon, colors, and estimated duration
 */
export const TOOL_CONFIGS: Record<ToolType, ToolIconConfig> = {
  task_search: {
    icon: Activity,
    label: 'Task Search',
    gradient: 'from-violet-500 via-violet-600 to-violet-700',
    iconColor: 'text-violet-400',
    glowColor: 'shadow-violet-500/20',
    estimatedDurationMs: 2000
  },
  pipeline_data: {
    icon: BarChart3,
    label: 'Pipeline Analysis',
    gradient: 'from-blue-500 via-blue-600 to-blue-700',
    iconColor: 'text-blue-400',
    glowColor: 'shadow-blue-500/20',
    estimatedDurationMs: 3000
  },
  email_draft: {
    icon: Mail,
    label: 'Email Generation',
    gradient: 'from-purple-500 via-purple-600 to-purple-700',
    iconColor: 'text-purple-400',
    glowColor: 'shadow-purple-500/20',
    estimatedDurationMs: 4000
  },
  email_search: {
    icon: Mail,
    label: 'Email Search',
    gradient: 'from-blue-500 via-indigo-600 to-purple-700',
    iconColor: 'text-blue-400',
    glowColor: 'shadow-blue-500/20',
    estimatedDurationMs: 2500
  },
  calendar_search: {
    icon: Calendar,
    label: 'Calendar Search',
    gradient: 'from-emerald-500 via-emerald-600 to-emerald-700',
    iconColor: 'text-emerald-400',
    glowColor: 'shadow-emerald-500/20',
    estimatedDurationMs: 2000
  },
  next_meeting_prep: {
    icon: Calendar,
    label: 'Meeting Prep',
    gradient: 'from-violet-500 via-indigo-600 to-blue-700',
    iconColor: 'text-violet-400',
    glowColor: 'shadow-violet-500/20',
    estimatedDurationMs: 5000
  },
  post_meeting_followup_pack: {
    icon: Sparkles,
    label: 'Follow-Up Pack',
    gradient: 'from-purple-500 via-fuchsia-600 to-pink-700',
    iconColor: 'text-purple-400',
    glowColor: 'shadow-purple-500/20',
    estimatedDurationMs: 6000
  },
  contact_lookup: {
    icon: Users,
    label: 'Contact Lookup',
    gradient: 'from-amber-500 via-amber-600 to-amber-700',
    iconColor: 'text-amber-400',
    glowColor: 'shadow-amber-500/20',
    estimatedDurationMs: 1500
  },
  contact_search: {
    icon: Users,
    label: 'Contact Search',
    gradient: 'from-cyan-500 via-cyan-600 to-cyan-700',
    iconColor: 'text-cyan-400',
    glowColor: 'shadow-cyan-500/20',
    estimatedDurationMs: 2500
  },
  deal_health: {
    icon: Activity,
    label: 'Health Analysis',
    gradient: 'from-rose-500 via-rose-600 to-rose-700',
    iconColor: 'text-rose-400',
    glowColor: 'shadow-rose-500/20',
    estimatedDurationMs: 3000
  },
  meeting_analysis: {
    icon: Calendar,
    label: 'Meeting Analysis',
    gradient: 'from-indigo-500 via-indigo-600 to-indigo-700',
    iconColor: 'text-indigo-400',
    glowColor: 'shadow-indigo-500/20',
    estimatedDurationMs: 4000
  },
  roadmap_create: {
    icon: FileText,
    label: 'Roadmap Creation',
    gradient: 'from-teal-500 via-teal-600 to-teal-700',
    iconColor: 'text-teal-400',
    glowColor: 'shadow-teal-500/20',
    estimatedDurationMs: 3500
  },
  sales_coach: {
    icon: Target,
    label: 'Sales Coach',
    gradient: 'from-orange-500 via-orange-600 to-orange-700',
    iconColor: 'text-orange-400',
    glowColor: 'shadow-orange-500/20',
    estimatedDurationMs: 5000
  },
  entity_resolution: {
    icon: Users,
    label: 'Finding Contact',
    gradient: 'from-cyan-500 via-teal-500 to-emerald-600',
    iconColor: 'text-cyan-400',
    glowColor: 'shadow-cyan-500/20',
    estimatedDurationMs: 3000
  },
  general_query: {
    icon: Sparkles,
    label: 'Processing',
    gradient: 'from-blue-500 via-indigo-500 to-violet-600',
    iconColor: 'text-blue-400',
    glowColor: 'shadow-blue-500/20',
    estimatedDurationMs: 3000
  }
};

// =============================================================================
// Step Icon Mapping
// =============================================================================

/**
 * Maps step icon names to Lucide icon components
 */
export const STEP_ICONS: Record<string, LucideIcon> = {
  database: Database,
  mail: Mail,
  calendar: Calendar,
  users: Users,
  activity: Activity,
  'file-text': FileText,
  'check-circle': CheckCircle2,
  'bar-chart': BarChart3,
  lightbulb: Lightbulb,
  target: Target,
  message: MessageSquare,
  sparkles: Sparkles
};

/**
 * Get the Lucide icon component for a step icon name
 */
export function getStepIcon(iconName: string): LucideIcon {
  return STEP_ICONS[iconName] || Activity;
}

// =============================================================================
// Duration Utilities
// =============================================================================

/**
 * Step duration estimates in milliseconds
 */
export const STEP_DURATION_ESTIMATES: Record<string, number> = {
  database: 800,
  mail: 1200,
  calendar: 1000,
  users: 600,
  activity: 1000,
  'file-text': 1500,
  'check-circle': 500,
  'bar-chart': 1200,
  lightbulb: 1500,
  target: 800,
  message: 1000,
  sparkles: 2000
};

/**
 * Get estimated duration for a step based on its icon type
 */
export function getStepDurationEstimate(iconName: string): number {
  return STEP_DURATION_ESTIMATES[iconName] || 1000;
}

/**
 * Format duration for display (e.g., "~2s", "~3s")
 * Returns empty string for durations under 1 second (not useful to show)
 */
export function formatDurationEstimate(ms: number): string {
  if (ms >= 1000) {
    return `~${Math.round(ms / 1000)}s`;
  }
  // Don't show estimates under 1 second - they're not meaningful
  return '';
}

/**
 * Format actual duration for display
 */
export function formatActualDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}

/**
 * Get the tool configuration by tool type
 */
export function getToolConfig(toolType: ToolType): ToolIconConfig {
  return TOOL_CONFIGS[toolType] || TOOL_CONFIGS.pipeline_data;
}

/**
 * Get the icon component for a tool type
 */
export function getToolIcon(toolType: ToolType): LucideIcon {
  return TOOL_CONFIGS[toolType]?.icon || Activity;
}

/**
 * Get the label for a tool type
 */
export function getToolLabel(toolType: ToolType): string {
  return TOOL_CONFIGS[toolType]?.label || 'Processing';
}

/**
 * Get estimated total duration for a tool type in milliseconds
 */
export function getToolDurationEstimate(toolType: ToolType): number {
  return TOOL_CONFIGS[toolType]?.estimatedDurationMs || 3000;
}

/**
 * Calculate total estimated duration from a list of steps
 */
export function calculateTotalStepDuration(steps: Array<{ icon: string }>): number {
  return steps.reduce((total, step) => total + getStepDurationEstimate(step.icon), 0);
}
