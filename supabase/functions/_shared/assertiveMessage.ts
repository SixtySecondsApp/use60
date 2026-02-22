/**
 * Assertive Message Builder — composition layer above slackBlocks.ts primitives.
 *
 * Every proactive Slack message follows a three-part pattern:
 *   1. Action   — what the agent did (past tense, assertive)
 *   2. Evidence  — why it did it (trigger + source)
 *   3. Escape Hatch — tier-appropriate buttons (undo / edit / dismiss)
 *
 * Tier guide:
 *   HIGH   — agent already acted (auto-CRM, auto-task). User undoes if unwanted.
 *   MEDIUM — agent prepared a draft. User previews/sends or edits.
 *   LOW    — agent spotted something. User views or ignores.
 */

import {
  header,
  section,
  context,
  actions,
  divider,
  type SlackBlock,
  type SlackMessage,
} from './slackBlocks.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssertiveButton {
  text: string;
  actionId: string;
  value: string;
  style?: 'primary' | 'danger';
  url?: string;
}

export type AssertiveTier = 'high' | 'medium' | 'low';

export interface AssertiveAction {
  verb: string;   // past-tense for high, noun for medium/low
  entity: string; // deal name, contact name, meeting title, etc.
  detail?: string;
}

export interface AssertiveEvidence {
  trigger: string; // e.g. "3 action items detected"
  source?: string; // e.g. "Meeting transcript"
}

export interface AssertiveMessageConfig {
  tier: AssertiveTier;
  action: AssertiveAction;
  evidence: AssertiveEvidence;
  buttons: AssertiveButton[];
  contextLines?: string[];
  appUrl?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIER_EMOJI: Record<AssertiveTier, string> = {
  high: '✅',
  medium: '✏️',
  low: '💡',
};

/**
 * Phrases that should NEVER appear in proactive Slack messages.
 * Use for grep-guard validation.
 */
export const PASSIVE_PHRASES: string[] = [
  'Would you like me to',
  'I can help',
  'Just wanted to check in',
  'I hope this finds',
  'I hope this message finds',
  'don\'t hesitate to reach out',
  'Looking forward to hearing from you',
  'Thank you for taking the time',
  'I wanted to follow up',
  'Please let me know if there\'s anything',
  'Let me know if you need anything',
];

// ---------------------------------------------------------------------------
// Block Builders
// ---------------------------------------------------------------------------

/**
 * Build a tier-appropriate header block.
 *
 * HIGH:   "✅ {Past Verb} | {Entity}"
 * MEDIUM: "✏️ {Noun} Ready | {Entity}"
 * LOW:    "💡 {Noun} Spotted | {Entity}"
 */
export function assertiveHeader(
  tier: AssertiveTier,
  verb: string,
  entity: string,
): SlackBlock {
  const emoji = TIER_EMOJI[tier];
  const headerText = `${emoji} ${verb} | ${entity}`;
  return header(headerText);
}

/**
 * Build an evidence context block.
 * Shows the trigger reason and optional source.
 */
export function evidenceBlock(
  trigger: string,
  source?: string,
): SlackBlock {
  const parts = [`Trigger: ${trigger}`];
  if (source) {
    parts.push(`Source: ${source}`);
  }
  return context(parts);
}

/**
 * Build escape-hatch action buttons appropriate to the tier.
 *
 * HIGH:   [View] [Undo] [Mute Agent]
 * MEDIUM: [Preview & Send] [Edit] [Dismiss] [Snooze 4h]
 * LOW:    [View Suggestion] [Not Interested]
 *
 * If custom buttons are provided they are used as-is.
 */
export function escapeHatchButtons(
  tier: AssertiveTier,
  actionId: string,
  entityId: string,
): SlackBlock {
  const btnDefs: AssertiveButton[] = [];

  switch (tier) {
    case 'high':
      btnDefs.push(
        { text: 'View', actionId: `${actionId}_view::${entityId}`, value: entityId, style: 'primary' },
        { text: 'Undo', actionId: `${actionId}_undo::${entityId}`, value: entityId },
        { text: 'Mute Agent', actionId: `${actionId}_mute::${entityId}`, value: entityId, style: 'danger' },
      );
      break;
    case 'medium':
      btnDefs.push(
        { text: 'Preview & Send', actionId: `${actionId}_preview::${entityId}`, value: entityId, style: 'primary' },
        { text: 'Edit', actionId: `${actionId}_edit::${entityId}`, value: entityId },
        { text: 'Dismiss', actionId: `${actionId}_dismiss::${entityId}`, value: entityId },
        { text: 'Snooze 4h', actionId: `${actionId}_snooze::${entityId}`, value: entityId },
      );
      break;
    case 'low':
      btnDefs.push(
        { text: 'View Suggestion', actionId: `${actionId}_view::${entityId}`, value: entityId, style: 'primary' },
        { text: 'Not Interested', actionId: `${actionId}_dismiss::${entityId}`, value: entityId },
      );
      break;
  }

  return actions(btnDefs.map((b) => ({
    text: b.text,
    actionId: b.actionId,
    value: b.value,
    ...(b.style && { style: b.style }),
    ...(b.url && { url: b.url }),
  })));
}

// ---------------------------------------------------------------------------
// Full Message Builder
// ---------------------------------------------------------------------------

/**
 * Build a complete assertive Slack message from config.
 *
 * Structure:
 *   [Header]        — tier emoji + action verb + entity
 *   [Detail]        — optional detail section
 *   [Evidence]      — trigger reason + source
 *   [Context Lines] — optional extra context
 *   [Buttons]       — custom buttons OR tier-default escape hatch
 */
export function buildAssertiveMessage(config: AssertiveMessageConfig): SlackMessage {
  const blocks: SlackBlock[] = [];

  // 1. Header
  blocks.push(assertiveHeader(config.tier, config.action.verb, config.action.entity));

  // 2. Detail (optional)
  if (config.action.detail) {
    blocks.push(section(config.action.detail));
  }

  // 3. Evidence
  blocks.push(evidenceBlock(config.evidence.trigger, config.evidence.source));

  // 4. Extra context lines
  if (config.contextLines && config.contextLines.length > 0) {
    blocks.push(divider());
    for (const line of config.contextLines) {
      blocks.push(section(line));
    }
  }

  // 5. Buttons
  if (config.buttons.length > 0) {
    blocks.push(divider());
    blocks.push(actions(config.buttons.map((b) => ({
      text: b.text,
      actionId: b.actionId,
      value: b.value,
      ...(b.style && { style: b.style }),
      ...(b.url && { url: b.url }),
    }))));
  }

  // 6. App link context
  if (config.appUrl) {
    blocks.push(context([`<${config.appUrl}|Open in 60>`]));
  }

  return {
    blocks,
    text: `${TIER_EMOJI[config.tier]} ${config.action.verb} | ${config.action.entity}`,
  };
}
