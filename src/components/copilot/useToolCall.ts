/**
 * Hook for Managing Tool Calls
 * Handles tool execution with visual state management
 */

import { useState, useCallback } from 'react';
import type { ToolCall, ToolStep, ToolType, ToolState } from './toolTypes';
import logger from '@/lib/utils/logger';

interface ExecuteStepParams {
  step: ToolStep;
  toolType: ToolType;
  params: any;
}

function generateId(): string {
  return `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getStepsForTool(toolType: ToolType): Omit<ToolStep, 'id'>[] {
  const stepConfigs: Record<ToolType, Omit<ToolStep, 'id'>[]> = {
    pipeline_data: [
      { label: 'Fetching deals from database', icon: 'database', state: 'pending' },
      { label: 'Calculating health scores', icon: 'activity', state: 'pending' },
      { label: 'Analyzing priorities', icon: 'activity', state: 'pending' },
      { label: 'Generating recommendations', icon: 'activity', state: 'pending' }
    ],
    email_draft: [
      { label: 'Loading contact history', icon: 'users', state: 'pending' },
      { label: 'Retrieving last meeting notes', icon: 'calendar', state: 'pending' },
      { label: 'Generating personalized email', icon: 'mail', state: 'pending' }
    ],
    email_search: [
      { label: 'Connecting to Gmail', icon: 'mail', state: 'pending' },
      { label: 'Searching inbox', icon: 'database', state: 'pending' },
      { label: 'Loading email details', icon: 'activity', state: 'pending' }
    ],
    calendar_search: [
      { label: 'Connecting to Google Calendar', icon: 'calendar', state: 'pending' },
      { label: 'Filtering meetings', icon: 'activity', state: 'pending' },
      { label: 'Loading meeting details', icon: 'activity', state: 'pending' }
    ],
    next_meeting_prep: [
      { label: 'Finding your next meeting', icon: 'calendar', state: 'pending' },
      { label: 'Loading deal + contact context', icon: 'users', state: 'pending' },
      { label: 'Generating one-page brief', icon: 'activity', state: 'pending' },
      { label: 'Preparing prep task preview', icon: 'check-circle', state: 'pending' }
    ],
    post_meeting_followup_pack: [
      { label: 'Loading most recent recorded meeting', icon: 'calendar', state: 'pending' },
      { label: 'Extracting decisions & next steps', icon: 'activity', state: 'pending' },
      { label: 'Drafting buyer email + Slack update', icon: 'mail', state: 'pending' },
      { label: 'Preparing follow-up task preview', icon: 'check-circle', state: 'pending' }
    ],
    contact_lookup: [
      { label: 'Searching contacts', icon: 'users', state: 'pending' },
      { label: 'Loading recent activity', icon: 'activity', state: 'pending' }
    ],
    deal_health: [
      { label: 'Analyzing engagement metrics', icon: 'activity', state: 'pending' },
      { label: 'Calculating risk factors', icon: 'activity', state: 'pending' },
      { label: 'Generating health score', icon: 'activity', state: 'pending' }
    ],
    meeting_analysis: [
      { label: 'Loading meeting data', icon: 'calendar', state: 'pending' },
      { label: 'Analyzing discussion points', icon: 'activity', state: 'pending' },
      { label: 'Generating insights', icon: 'activity', state: 'pending' }
    ],
    contact_search: [
      { label: 'Finding contact by email', icon: 'users', state: 'pending' },
      { label: 'Fetching emails and communications', icon: 'mail', state: 'pending' },
      { label: 'Loading deals and activities', icon: 'activity', state: 'pending' },
      { label: 'Gathering meetings and tasks', icon: 'calendar', state: 'pending' },
      { label: 'Compiling smart summary', icon: 'activity', state: 'pending' }
    ],
    task_search: [
      { label: 'Searching tasks database', icon: 'database', state: 'pending' },
      { label: 'Filtering by priority and status', icon: 'activity', state: 'pending' },
      { label: 'Calculating due dates', icon: 'calendar', state: 'pending' },
      { label: 'Organizing results', icon: 'activity', state: 'pending' }
    ],
    roadmap_create: [
      { label: 'Preparing roadmap item', icon: 'file-text', state: 'pending' },
      { label: 'Validating details', icon: 'activity', state: 'pending' },
      { label: 'Creating roadmap item', icon: 'database', state: 'pending' },
      { label: 'Confirming creation', icon: 'check-circle', state: 'pending' }
    ],
    sales_coach: [
      { label: 'Gathering sales data', icon: 'database', state: 'pending' },
      { label: 'Analyzing performance metrics', icon: 'activity', state: 'pending' },
      { label: 'Comparing periods', icon: 'bar-chart', state: 'pending' },
      { label: 'Generating insights', icon: 'lightbulb', state: 'pending' },
      { label: 'Creating recommendations', icon: 'target', state: 'pending' }
    ],
    entity_resolution: [
      { label: 'Searching CRM contacts', icon: 'users', state: 'pending' },
      { label: 'Searching recent meetings', icon: 'calendar', state: 'pending' },
      { label: 'Searching calendar events', icon: 'calendar', state: 'pending' },
      { label: 'Searching recent emails', icon: 'mail', state: 'pending' },
      { label: 'Resolving best match', icon: 'activity', state: 'pending' }
    ]
  };

  return stepConfigs[toolType] || [];
}

// Placeholder for actual step execution
// This should be replaced with actual API calls
async function executeStep(
  step: ToolStep,
  toolType: ToolType,
  params: any
): Promise<Record<string, any>> {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));

  // Return mock metadata based on step
  if (step.label.includes('Fetching') || step.label.includes('Loading')) {
    return { count: Math.floor(Math.random() * 100) };
  }

  return {};
}

export function useToolCall(toolType: ToolType) {
  const [toolCall, setToolCall] = useState<ToolCall | null>(null);

  const executeToolCall = useCallback(
    async (params: any) => {
      // Initialize
      const steps = getStepsForTool(toolType).map((config, i) => ({
        ...config,
        id: `step-${i}`
      }));

      const newToolCall: ToolCall = {
        id: generateId(),
        tool: toolType,
        state: 'initiating',
        startTime: Date.now(),
        steps
      };

      setToolCall(newToolCall);

      try {
        // Execute each step
        for (let i = 0; i < newToolCall.steps.length; i++) {
          const stepStartTime = Date.now();

          // Update to active
          setToolCall(prev => {
            if (!prev) return null;
            const newState: ToolState =
              i === 0
                ? 'fetching'
                : i === newToolCall.steps.length - 1
                ? 'completing'
                : 'processing';

            return {
              ...prev,
              state: newState,
              steps: prev.steps.map((s, idx) =>
                idx === i ? { ...s, state: 'active' } : s
              )
            };
          });

          // Execute step
          const stepResult = await executeStep(newToolCall.steps[i], toolType, params);

          // Mark complete
          setToolCall(prev => {
            if (!prev) return null;
            return {
              ...prev,
              steps: prev.steps.map((s, idx) =>
                idx === i
                  ? {
                      ...s,
                      state: 'complete',
                      duration: Date.now() - stepStartTime,
                      metadata: stepResult
                    }
                  : s
              )
            };
          });

          // Small delay for visual effect
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Complete
        setToolCall(prev => {
          if (!prev) return null;
          return {
            ...prev,
            state: 'complete'
          };
        });
      } catch (error) {
        logger.error('Tool call failed:', error as Error);
        setToolCall(prev =>
          prev
            ? {
                ...prev,
                state: 'complete'
              }
            : null
        );
      }
    },
    [toolType]
  );

  const reset = useCallback(() => {
    setToolCall(null);
  }, []);

  return { toolCall, executeToolCall, reset };
}

