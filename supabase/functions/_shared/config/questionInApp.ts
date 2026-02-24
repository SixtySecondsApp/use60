/**
 * In-App Question Payload Builder (LEARN-006)
 *
 * Builds ProactiveNotificationPayload for contextual configuration questions
 * delivered via the in-app notification system.
 */

import type { ProactiveNotificationPayload } from '../proactive/types.ts';

const SETTINGS_URL = 'https://app.use60.com/settings';

// =============================================================================
// Types
// =============================================================================

export interface QuestionOption {
  label: string;
  value: string;
}

export interface InAppQuestionInput {
  question_id: string;
  config_key: string;
  question_text: string;
  category: string;
  options?: QuestionOption[];
}

// =============================================================================
// Payload Builder
// =============================================================================

/**
 * Build a ProactiveNotificationPayload for an in-app contextual question.
 *
 * Maps to the 'system' in-app category with 'info' type — questions are
 * informational prompts, not alerts. The `actions` array carries the answer
 * options so the in-app UI can render interactive buttons.
 */
export function buildInAppQuestionPayload(
  userId: string,
  orgId: string,
  question: InAppQuestionInput,
): ProactiveNotificationPayload {
  // Build actions from options or fall back to a single "Open Settings" action
  const actions: ProactiveNotificationPayload['actions'] = question.options && question.options.length > 0
    ? question.options.map(option => ({
        label: option.label,
        actionId: 'config_question_answer',
        // Encode the answer payload in the actionId value via the url field
        // (in-app handler reads metadata.question_id + metadata.config_key + option value)
      }))
    : [
        {
          label: 'Open Settings',
          actionId: 'open_external_url',
          url: `${SETTINGS_URL}?focus=${encodeURIComponent(question.config_key)}`,
          style: 'primary',
        },
      ];

  return {
    type: 'deal_clarification_question', // Closest semantic match for config questions
    orgId,
    recipientUserId: userId,

    title: 'Help me learn your preferences',
    message: question.question_text,

    inAppCategory: 'system',
    inAppType: 'info',
    priority: 'low',

    actionUrl: `${SETTINGS_URL}?focus=${encodeURIComponent(question.config_key)}`,
    actions,

    metadata: {
      question_id: question.question_id,
      config_key: question.config_key,
      category: question.category,
      options: question.options ?? null,
      // Preserve options as structured data so the in-app renderer can build buttons
      question_options: question.options
        ? question.options.map(o => ({
            label: o.label,
            value: o.value,
            action_payload: JSON.stringify({
              question_id: question.question_id,
              config_key: question.config_key,
              answer: o.value,
            }),
          }))
        : null,
    },
  };
}
