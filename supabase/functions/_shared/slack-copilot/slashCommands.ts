/**
 * CC-015: /60 Slash Command Router
 *
 * Maps /60 subcommands to pre-resolved intents, bypassing AI classification.
 * Supports: /60 pipeline, /60 risks, /60 prep, /60 stale, /60 draft [name],
 *           /60 coaching, /60 metrics, /60 help
 *
 * Integration note: slack-copilot/index.ts accepts a `preResolvedIntent` field
 * in the request body. When present, it is used directly instead of calling
 * route-message for classification. This module produces that pre-resolved
 * intent from the user's text after stripping the @mention.
 */

import type { CopilotIntentType, ClassifiedIntent, ExtractedEntities } from './types.ts';

export interface SlashCommandResult {
  intent: ClassifiedIntent;
  isSlashCommand: true;
}

const COMMAND_MAP: Record<string, CopilotIntentType> = {
  'pipeline': 'pipeline_query',
  'risks': 'risk_query',
  'risk': 'risk_query',
  'prep': 'trigger_prep',
  'prepare': 'trigger_prep',
  'stale': 'risk_query',  // Filtered to stale deals via entities.rawQuery
  'draft': 'draft_email',
  'coaching': 'coaching_query',
  'coach': 'coaching_query',
  'metrics': 'metrics_query',
  'stats': 'metrics_query',
  'help': 'help',
  'h': 'help',
};

/**
 * Parse a /60 command (or @60 mention with subcommand) and return a pre-resolved
 * intent. Returns null if the text doesn't match any known subcommand.
 *
 * @param text - The message text after stripping the @mention, e.g. "pipeline"
 *               or "draft Acme Corp".
 */
export function parseSlashCommand(text: string): SlashCommandResult | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/);
  const subcommand = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ').trim();

  const intentType = COMMAND_MAP[subcommand];
  if (!intentType) return null;

  const entities: ExtractedEntities = { rawQuery: text };

  // Parse arguments based on subcommand
  if (subcommand === 'draft' && args) {
    entities.dealName = args;    // "/60 draft Acme" → dealName = "Acme"
    entities.actionType = 'draft_email';
  }

  if (subcommand === 'stale') {
    // Override rawQuery so the risk handler filters for stale/no-activity deals
    entities.rawQuery = 'deals with no recent activity';
  }

  if ((subcommand === 'prep' || subcommand === 'prepare') && args) {
    // "/60 prep 2pm" or "/60 prep Acme" — pass through as a time/name hint
    entities.time_reference = args;
  }

  return {
    intent: {
      type: intentType,
      confidence: 1.0, // Slash commands have max confidence — no classification needed
      entities,
    },
    isSlashCommand: true,
  };
}

/**
 * Build help text showing all available /60 commands.
 * Used as a fallback when the help intent handler isn't reached.
 */
export function buildSlashCommandHelp(): string {
  return [
    '*Available /60 commands:*',
    '',
    '`/60 pipeline` — Pipeline summary with coverage and stage breakdown',
    '`/60 risks` — Show at-risk deals that need attention',
    '`/60 stale` — Deals with no recent activity',
    '`/60 draft [name]` — Draft a follow-up email for a deal',
    '`/60 prep` — Generate meeting prep for your next meeting',
    '`/60 coaching` — Sales coaching and performance tips',
    '`/60 metrics` — This week\'s activity metrics',
    '`/60 help` — Show this help message',
    '',
    '_Or just type naturally: "What\'s happening with the Acme deal?"_',
  ].join('\n');
}
