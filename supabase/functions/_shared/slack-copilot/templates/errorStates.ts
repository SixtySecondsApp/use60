// supabase/functions/_shared/slack-copilot/templates/errorStates.ts
// Reusable error state templates for Slack copilot responses (PRD-22, CONV-010)

import { section, context, actions, divider, header } from '../responseFormatter.ts';
import type { SlackBlock } from '../types.ts';

const APP_URL = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com';

/**
 * Rate limited — user has exceeded query quota.
 */
export function rateLimitedResponse(message: string): SlackBlock[] {
  return [
    section(':hourglass: *Query Limit Reached*'),
    section(message),
    divider(),
    context([`You can always use the full app at <${APP_URL}|app.use60.com>.`]),
  ];
}

/**
 * No data found — query returned empty results.
 */
export function noDataResponse(entityType: string, query?: string): SlackBlock[] {
  const msg = query
    ? `I couldn't find any ${entityType} matching "${query}".`
    : `I don't have any ${entityType} data to show yet.`;

  return [
    section(`:mag: ${msg}`),
    context([
      entityType === 'deals' ? 'Make sure your CRM is connected and deals are synced.' :
      entityType === 'contacts' ? 'Contacts are synced from your CRM and calendar.' :
      entityType === 'meetings' ? 'Meeting data comes from your connected calendar.' :
      'Data populates as you use the platform.',
    ]),
  ];
}

/**
 * Processing timeout — response took too long.
 */
export function timeoutResponse(): SlackBlock[] {
  return [
    section(':warning: *Taking Longer Than Expected*'),
    section('Your request is still processing but I ran out of time waiting. Try again in a moment, or check the app for the latest data.'),
    context([`<${APP_URL}|Open 60>`]),
  ];
}

/**
 * General error — something went wrong.
 */
export function generalErrorResponse(userMessage?: string): SlackBlock[] {
  return [
    section(`:x: ${userMessage || "Something went wrong processing your request."}`),
    context(['Try rephrasing your question, or use the app directly.']),
  ];
}

/**
 * Feature not available — requested capability not yet built.
 */
export function featureNotAvailableResponse(feature: string): SlackBlock[] {
  return [
    section(`:construction: *${feature}* isn't available yet in Slack.`),
    section(`You can access this feature in the full app.`),
    actions([
      { text: 'Open App', actionId: 'copilot_open_app', value: APP_URL, style: 'primary' },
    ]),
  ];
}

/**
 * Credit warning — user is approaching their daily AI budget limit.
 */
export function creditWarningResponse(creditsUsed: number, dailyLimit: number): SlackBlock[] {
  const pct = Math.round((creditsUsed / dailyLimit) * 100);
  return [
    section(`⚠️ You've used ${pct}% of your daily AI budget (${creditsUsed.toFixed(1)}/${dailyLimit} credits). I can still answer questions, but I'll use simpler lookups where possible.`),
  ];
}

/**
 * Credit exhausted — user has reached their daily AI budget.
 * Cheap queries (deal status, pipeline, metrics) still work.
 */
export function creditExhaustedResponse(): SlackBlock[] {
  return [
    section(`⚠️ You've reached your daily AI budget. Simple lookups (deal status, pipeline, metrics) still work. RAG-powered queries and email drafting will resume tomorrow.`),
  ];
}

/**
 * Help command — lists available conversational queries.
 */
export function helpResponse(): SlackBlock[] {
  return [
    header('60 Copilot — What I Can Do'),
    divider(),
    section("*:chart_with_upwards_trend: Pipeline & Deals*\n• \"How's my pipeline looking?\"\n• \"What's happening with [deal name]?\"\n• \"Which deals are at risk?\"\n• \"Am I on track for Q1?\""),
    section("*:busts_in_silhouette: Contacts & History*\n• \"When did I last talk to [person]?\"\n• \"What do we know about [company]?\"\n• \"Show my meetings this week\""),
    section("*:pencil2: Actions*\n• \"Draft a follow-up for [deal]\"\n• \"Create a task to [action]\""),
    section("*:crossed_swords: Competitive & Coaching*\n• \"What works against [competitor]?\"\n• \"How should I handle [objection]?\"\n• \"How am I doing this week?\""),
    divider(),
    context([
      "Just message me naturally — I'll figure out what you need.",
      `Full features at <${APP_URL}|app.use60.com>`,
    ]),
  ];
}
