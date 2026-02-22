/**
 * Question Block Kit Builder (LEARN-006)
 *
 * Builds Slack Block Kit messages for contextual configuration questions.
 * Produces compact DM-friendly layouts with action buttons for quick answers.
 *
 * Action ID contract: answer buttons use "config_question_answer" — this is
 * the routing key that slack-interactive (LEARN-007) will match on.
 */

const SETTINGS_URL = 'https://app.use60.com/settings';
const MAX_OPTION_BUTTONS = 5;

// =============================================================================
// Types
// =============================================================================

export interface QuestionOption {
  label: string;
  value: string;
}

export interface QuestionInput {
  question_id: string;
  config_key: string;
  question_text: string;
  category: string;
  options?: QuestionOption[];
}

export interface QuestionBlockKitResult {
  blocks: any[];
  text: string;
}

// =============================================================================
// Category Label Map
// =============================================================================

const CATEGORY_LABELS: Record<string, string> = {
  mission: 'Mission & Purpose',
  playbook: 'Sales Playbook',
  voice: 'Tone & Voice',
  delivery: 'Delivery Preferences',
  thresholds: 'Alert Thresholds',
  boundaries: 'Agent Boundaries',
  heartbeat: 'Check-in Cadence',
  methodology: 'Sales Methodology',
  pipeline: 'Pipeline Settings',
  temporal: 'Time & Scheduling',
};

function formatCategory(category: string): string {
  return CATEGORY_LABELS[category] ?? category
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// =============================================================================
// Block Builder
// =============================================================================

/**
 * Build a Slack Block Kit message for a contextual configuration question.
 *
 * Layout (max 4 blocks):
 *   1. Section — question text (mrkdwn)
 *   2. Context — category label + "Set in Settings" link
 *   3. Actions — answer buttons (if options) or "Open Settings" button
 */
export function buildQuestionBlocks(question: QuestionInput): QuestionBlockKitResult {
  const blocks: any[] = [];

  // Block 1: Question text
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*${question.question_text}*`,
    },
  });

  // Block 2: Context — category + settings link
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `*${formatCategory(question.category)}*  ·  <${SETTINGS_URL}|Set in Settings>`,
      },
    ],
  });

  // Block 3: Actions
  if (question.options && question.options.length > 0) {
    // Truncate to MAX_OPTION_BUTTONS — Slack action block limit is 5
    const visibleOptions = question.options.slice(0, MAX_OPTION_BUTTONS);

    const buttons = visibleOptions.map(option => ({
      type: 'button',
      text: {
        type: 'plain_text',
        text: option.label,
        emoji: false,
      },
      action_id: 'config_question_answer',
      value: JSON.stringify({
        question_id: question.question_id,
        config_key: question.config_key,
        answer: option.value,
      }),
    }));

    blocks.push({
      type: 'actions',
      elements: buttons,
    });
  } else {
    // No options — single "Open Settings" link button
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Open Settings',
            emoji: false,
          },
          action_id: 'config_question_open_settings',
          url: `${SETTINGS_URL}?focus=${encodeURIComponent(question.config_key)}`,
          style: 'primary',
        },
      ],
    });
  }

  // Fallback text for notifications / accessibility
  const text = question.question_text;

  return { blocks, text };
}
