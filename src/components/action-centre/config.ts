/**
 * Action Centre Configuration
 *
 * Design tokens and configuration for the Action Centre components.
 */

import {
  Mail,
  CheckSquare,
  MessageSquare,
  Edit3,
  AlertTriangle,
  Lightbulb,
  FileText,
} from 'lucide-react';
import type { ActionType, RiskLevel, TypeConfig, RiskConfig } from './types';

// Type configuration with glassmorphic icon styles
export const typeConfig: Record<ActionType, TypeConfig> = {
  email: {
    icon: Mail,
    label: 'Email',
    color: 'blue',
    gradient: 'from-blue-500 to-blue-600',
    iconBg: 'bg-gray-800 border border-gray-700/50',
    iconColor: 'text-blue-400',
  },
  task: {
    icon: CheckSquare,
    label: 'Task',
    color: 'emerald',
    gradient: 'from-emerald-500 to-emerald-600',
    iconBg: 'bg-gray-800 border border-gray-700/50',
    iconColor: 'text-emerald-400',
  },
  slack_message: {
    icon: MessageSquare,
    label: 'Slack',
    color: 'purple',
    gradient: 'from-purple-500 to-purple-600',
    iconBg: 'bg-gray-800 border border-gray-700/50',
    iconColor: 'text-purple-400',
  },
  field_update: {
    icon: Edit3,
    label: 'Update',
    color: 'gray',
    gradient: 'from-gray-500 to-gray-600',
    iconBg: 'bg-gray-800 border border-gray-700/50',
    iconColor: 'text-gray-400',
  },
  alert: {
    icon: AlertTriangle,
    label: 'Alert',
    color: 'red',
    gradient: 'from-red-500 to-red-600',
    iconBg: 'bg-gray-800 border border-gray-700/50',
    iconColor: 'text-red-400',
  },
  insight: {
    icon: Lightbulb,
    label: 'Insight',
    color: 'amber',
    gradient: 'from-amber-500 to-amber-600',
    iconBg: 'bg-gray-800 border border-gray-700/50',
    iconColor: 'text-amber-400',
  },
  meeting_prep: {
    icon: FileText,
    label: 'Meeting Prep',
    color: 'indigo',
    gradient: 'from-indigo-500 to-indigo-600',
    iconBg: 'bg-gray-800 border border-gray-700/50',
    iconColor: 'text-indigo-400',
  },
};

// Risk level configuration
export const riskConfig: Record<RiskLevel, RiskConfig> = {
  low: {
    color: 'emerald',
    label: 'Safe',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
  },
  medium: {
    color: 'amber',
    label: 'Review',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
  },
  high: {
    color: 'red',
    label: 'Sensitive',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-400',
  },
  info: {
    color: 'blue',
    label: 'Info',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
  },
};

// Entity type configuration
export const entityConfig = {
  contact: {
    color: 'blue',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    text: 'text-blue-400',
  },
  deal: {
    color: 'emerald',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    text: 'text-emerald-400',
  },
  company: {
    color: 'purple',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    text: 'text-purple-400',
  },
};

// Action button labels per type
export const approveLabels: Record<ActionType, string> = {
  email: 'Send Email',
  task: 'Create Task',
  slack_message: 'Post to Slack',
  field_update: 'Update Field',
  alert: 'Mark Reviewed',
  insight: 'Acknowledge',
  meeting_prep: 'Mark Reviewed',
};
