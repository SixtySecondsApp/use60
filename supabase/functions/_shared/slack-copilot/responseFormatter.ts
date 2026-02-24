// supabase/functions/_shared/slack-copilot/responseFormatter.ts
// Slack Block Kit response formatting utilities (PRD-22)

import type { SlackBlock } from './types.ts';

const APP_URL = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com';

export function header(text: string): SlackBlock {
  return { type: 'header', text: { type: 'plain_text', text, emoji: true } };
}

export function section(text: string): SlackBlock {
  return { type: 'section', text: { type: 'mrkdwn', text } };
}

export function divider(): SlackBlock {
  return { type: 'divider' };
}

export function fields(pairs: Array<{ label: string; value: string }>): SlackBlock {
  return {
    type: 'section',
    fields: pairs.map((p) => ({
      type: 'mrkdwn',
      text: `*${p.label}*\n${p.value}`,
    })),
  };
}

export function actions(buttons: Array<{ text: string; actionId: string; value: string; style?: 'primary' | 'danger' }>): SlackBlock {
  return {
    type: 'actions',
    elements: buttons.map((b) => ({
      type: 'button',
      text: { type: 'plain_text', text: b.text },
      action_id: b.actionId,
      value: b.value,
      ...(b.style ? { style: b.style } : {}),
    })),
  };
}

export function context(texts: string[]): SlackBlock {
  return {
    type: 'context',
    elements: texts.map((t) => ({ type: 'mrkdwn', text: t })),
  };
}

export function riskBadge(level: string): string {
  switch (level?.toLowerCase()) {
    case 'critical': return ':red_circle: Critical';
    case 'high': return ':large_orange_circle: High';
    case 'medium': return ':large_yellow_circle: Medium';
    case 'low': return ':large_green_circle: Low';
    default: return ':white_circle: Unknown';
  }
}

export function formatCurrency(value: number | null): string {
  if (value == null) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export function appLink(path: string, label: string): string {
  return `<${APP_URL}${path}|${label}>`;
}

export function truncate(text: string, maxLen: number = 100): string {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen - 3) + '...' : text;
}
