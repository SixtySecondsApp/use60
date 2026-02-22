/**
 * Re-engagement - Smart Engagement Algorithm Phase 4
 *
 * Content-driven re-engagement notification types, triggers,
 * and message builders for inactive users.
 */

import type { UserSegment } from "./types.ts";
import { getMessageTone, getPreferredReengagementChannel } from "./segmentation.ts";

// Environment-aware app URL (falls back to production if not set)
const APP_URL = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || Deno.env.get('PUBLIC_URL') || 'https://app.use60.com';

/**
 * Re-engagement notification types
 */
export type ReengagementType =
  | "gentle_nudge"
  | "activity_summary"
  | "upcoming_meeting"
  | "deal_update"
  | "value_reminder"
  | "win_back"
  | "product_update"
  | "champion_alert"
  | "new_email_summary";

/**
 * Re-engagement notification configuration
 */
export interface ReengagementConfig {
  type: ReengagementType;
  name: string;
  description: string;
  segments: UserSegment[];
  requiresContent: boolean;
  priority: number; // Higher = send first
}

export const REENGAGEMENT_TYPES: Record<ReengagementType, ReengagementConfig> = {
  gentle_nudge: {
    type: "gentle_nudge",
    name: "Gentle Nudge",
    description: "Friendly check-in with activity summary",
    segments: ["dormant", "at_risk"],
    requiresContent: false,
    priority: 30,
  },
  activity_summary: {
    type: "activity_summary",
    name: "Activity Summary",
    description: "Summary of what's happened while away",
    segments: ["dormant", "churned"],
    requiresContent: true,
    priority: 50,
  },
  upcoming_meeting: {
    type: "upcoming_meeting",
    name: "Upcoming Meeting",
    description: "Reminder about upcoming meetings with prep ready",
    segments: ["at_risk", "dormant", "churned"],
    requiresContent: true,
    priority: 90,
  },
  deal_update: {
    type: "deal_update",
    name: "Deal Update",
    description: "Important update on an active deal",
    segments: ["at_risk", "dormant"],
    requiresContent: true,
    priority: 80,
  },
  value_reminder: {
    type: "value_reminder",
    name: "Value Reminder",
    description: "Highlight value delivered recently",
    segments: ["at_risk"],
    requiresContent: false,
    priority: 40,
  },
  win_back: {
    type: "win_back",
    name: "Win Back",
    description: "Personalized message to re-engage churned user",
    segments: ["churned"],
    requiresContent: false,
    priority: 20,
  },
  product_update: {
    type: "product_update",
    name: "Product Update",
    description: "New features or improvements announcement",
    segments: ["churned", "dormant"],
    requiresContent: false,
    priority: 35,
  },
  champion_alert: {
    type: "champion_alert",
    name: "Champion Alert",
    description: "A key contact has changed or taken action",
    segments: ["at_risk", "dormant", "churned"],
    requiresContent: true,
    priority: 85,
  },
  new_email_summary: {
    type: "new_email_summary",
    name: "New Email Summary",
    description: "Summary of important emails received",
    segments: ["at_risk", "dormant"],
    requiresContent: true,
    priority: 70,
  },
};

/**
 * Content context for personalized messages
 */
export interface ReengagementContext {
  userName: string;
  userFirstName?: string;
  segment: UserSegment;
  daysInactive: number;
  // Optional content triggers
  upcomingMeetings?: Array<{
    title: string;
    company: string;
    date: string;
    prepReady: boolean;
  }>;
  dealUpdates?: Array<{
    dealName: string;
    company: string;
    updateType: string;
    detail: string;
  }>;
  activitySummary?: {
    newEmails: number;
    dealChanges: number;
    meetingsScheduled: number;
  };
  championChanges?: Array<{
    name: string;
    company: string;
    changeType: "job_change" | "promotion" | "left_company";
    detail: string;
  }>;
  newEmails?: Array<{
    from: string;
    subject: string;
    preview: string;
    isImportant: boolean;
  }>;
}

/**
 * Build re-engagement message for Slack
 */
export function buildReengagementSlackBlocks(
  type: ReengagementType,
  context: ReengagementContext
): Record<string, unknown>[] {
  const tone = getMessageTone(context.segment);
  const firstName = context.userFirstName || context.userName.split(" ")[0];

  const blocks: Record<string, unknown>[] = [];

  switch (type) {
    case "gentle_nudge":
      blocks.push(
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: tone === "friendly"
              ? `Hey ${firstName}! 👋 *${context.daysInactive} days* of pipeline activity waiting. Here's what moved:`
              : `Hi ${firstName}, pipeline activity needs attention. Your deals have been moving while you were away.`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Open 60", emoji: true },
              style: "primary",
              action_id: "reengagement_open_app",
              url: APP_URL,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Catch me up", emoji: true },
              action_id: "reengagement_summary",
              value: JSON.stringify({ type: "summary", user_id: context.userName }),
            },
          ],
        }
      );
      break;

    case "upcoming_meeting":
      if (context.upcomingMeetings && context.upcomingMeetings.length > 0) {
        const meeting = context.upcomingMeetings[0];
        blocks.push(
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `📅 *Heads up!* You have a meeting coming up with *${meeting.company}*:\n\n*${meeting.title}*\n${meeting.date}`,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: meeting.prepReady
                ? "✅ Meeting prep ready. Talking points prepared."
                : "Talking points prepared.",
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "Get Meeting Prep", emoji: true },
                style: "primary",
                action_id: "reengagement_meeting_prep",
                value: JSON.stringify({ meeting_title: meeting.title }),
              },
              {
                type: "button",
                text: { type: "plain_text", text: "View All Meetings", emoji: true },
                action_id: "reengagement_view_meetings",
                url: `${APP_URL}/meetings`,
              },
            ],
          }
        );
      }
      break;

    case "deal_update":
      if (context.dealUpdates && context.dealUpdates.length > 0) {
        const update = context.dealUpdates[0];
        blocks.push(
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `💼 *Deal Activity* — ${update.dealName} (${update.company})\n\n${update.updateType}: ${update.detail}`,
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "View Deal", emoji: true },
                style: "primary",
                action_id: "reengagement_view_deal",
                value: JSON.stringify({ deal_name: update.dealName }),
              },
            ],
          }
        );
      }
      break;

    case "activity_summary":
      if (context.activitySummary) {
        const summary = context.activitySummary;
        blocks.push(
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `📊 *While you were away* (${context.daysInactive} days):\n\n` +
                `• *${summary.newEmails}* new emails from key contacts\n` +
                `• *${summary.dealChanges}* deal stage changes\n` +
                `• *${summary.meetingsScheduled}* meetings scheduled`,
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "See Full Summary", emoji: true },
                style: "primary",
                action_id: "reengagement_full_summary",
                url: `${APP_URL}/dashboard`,
              },
            ],
          }
        );
      }
      break;

    case "value_reminder":
      blocks.push(
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Hey ${firstName}, just a quick note — you've got *${context.daysInactive > 5 ? "a few" : "some"} deals* in motion and I'm tracking them for you.\n\nWant a quick rundown of what's happening in your pipeline?`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Show Pipeline", emoji: true },
              style: "primary",
              action_id: "reengagement_show_pipeline",
              url: `${APP_URL}/pipeline`,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Not Now", emoji: true },
              action_id: "reengagement_dismiss",
            },
          ],
        }
      );
      break;

    case "champion_alert":
      if (context.championChanges && context.championChanges.length > 0) {
        const change = context.championChanges[0];
        const alertText = change.changeType === "job_change"
          ? `🔔 *${change.name}* from ${change.company} has a new role: ${change.detail}`
          : change.changeType === "left_company"
          ? `⚠️ *${change.name}* has left ${change.company}. ${change.detail}`
          : `🎉 *${change.name}* at ${change.company} was promoted: ${change.detail}`;

        blocks.push(
          {
            type: "section",
            text: { type: "mrkdwn", text: alertText },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "View Contact", emoji: true },
                style: "primary",
                action_id: "reengagement_view_contact",
                value: JSON.stringify({ contact_name: change.name }),
              },
            ],
          }
        );
      }
      break;

    case "new_email_summary":
      if (context.newEmails && context.newEmails.length > 0) {
        const importantEmails = context.newEmails.filter((e) => e.isImportant);
        const emailList = importantEmails.slice(0, 3).map(
          (e) => `• *${e.from}*: ${e.subject}`
        ).join("\n");

        blocks.push(
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `📬 You have *${context.newEmails.length}* emails from key contacts:\n\n${emailList}`,
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "View Emails", emoji: true },
                style: "primary",
                action_id: "reengagement_view_emails",
                url: `${APP_URL}/inbox`,
              },
            ],
          }
        );
      }
      break;

    case "win_back":
      blocks.push(
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Hi ${firstName} 👋\n\nIt's been a while! We've been keeping an eye on your accounts and there might be some activity worth checking out.\n\nWant me to catch you up on what's been happening?`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Yes, catch me up", emoji: true },
              style: "primary",
              action_id: "reengagement_win_back_yes",
            },
            {
              type: "button",
              text: { type: "plain_text", text: "No thanks", emoji: true },
              action_id: "reengagement_win_back_no",
            },
          ],
        }
      );
      break;

    case "product_update":
      blocks.push(
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🚀 *New in 60*\n\nWe've added some features you might find helpful:\n\n• Smart meeting prep with AI summaries\n• Pipeline health scoring\n• Proactive deal alerts\n\nCome check it out!`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "See What's New", emoji: true },
              style: "primary",
              action_id: "reengagement_product_update",
              url: `${APP_URL}/updates`,
            },
          ],
        }
      );
      break;
  }

  return blocks;
}

/**
 * Build re-engagement email subject and preview
 */
export function buildReengagementEmailContent(
  type: ReengagementType,
  context: ReengagementContext
): { subject: string; previewText: string; bodyHtml: string } {
  const firstName = context.userFirstName || context.userName.split(" ")[0];

  switch (type) {
    case "upcoming_meeting":
      const meeting = context.upcomingMeetings?.[0];
      return {
        subject: `📅 Meeting prep ready: ${meeting?.title || "Upcoming meeting"}`,
        previewText: `Your meeting with ${meeting?.company || "a key account"} is coming up...`,
        bodyHtml: buildEmailBodyHtml(type, context),
      };

    case "deal_update":
      const deal = context.dealUpdates?.[0];
      return {
        subject: `💼 Update on ${deal?.dealName || "your deal"}`,
        previewText: `${deal?.updateType || "Important update"}: ${deal?.detail || "See details"}`,
        bodyHtml: buildEmailBodyHtml(type, context),
      };

    case "champion_alert":
      const champion = context.championChanges?.[0];
      return {
        subject: `⚠️ ${champion?.name || "Key contact"} update`,
        previewText: champion?.detail || "An important contact has changed",
        bodyHtml: buildEmailBodyHtml(type, context),
      };

    case "activity_summary":
      return {
        subject: `📊 ${context.daysInactive} days of activity waiting`,
        previewText: "Here's what happened while you were away...",
        bodyHtml: buildEmailBodyHtml(type, context),
      };

    case "gentle_nudge":
      return {
        subject: `${firstName}, you have activity waiting`,
        previewText: "Your deals have been moving. Want a quick summary?",
        bodyHtml: buildEmailBodyHtml(type, context),
      };

    case "win_back":
      return {
        subject: `We've been keeping track for you, ${firstName}`,
        previewText: "There might be some activity worth checking out...",
        bodyHtml: buildEmailBodyHtml(type, context),
      };

    default:
      return {
        subject: `Update from 60`,
        previewText: "You have new activity to review",
        bodyHtml: buildEmailBodyHtml(type, context),
      };
  }
}

/**
 * Build email body HTML (simplified)
 */
function buildEmailBodyHtml(
  type: ReengagementType,
  context: ReengagementContext
): string {
  const firstName = context.userFirstName || context.userName.split(" ")[0];

  // Simple email template
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0; }
        .footer { margin-top: 32px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <p>Hi ${firstName},</p>
        <p>${getEmailBodyText(type, context)}</p>
        <a href="${APP_URL}" class="button">Open 60</a>
        <div class="footer">
          <p>— The 60 Team</p>
          <p>You're receiving this because you haven't logged in recently. <a href="${APP_URL}/settings/notifications">Manage preferences</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function getEmailBodyText(type: ReengagementType, context: ReengagementContext): string {
  switch (type) {
    case "upcoming_meeting":
      const meeting = context.upcomingMeetings?.[0];
      return `You have a meeting coming up with ${meeting?.company || "a key account"}: <strong>${meeting?.title || "Scheduled meeting"}</strong> on ${meeting?.date || "soon"}. Your prep is ready when you need it.`;

    case "deal_update":
      const deal = context.dealUpdates?.[0];
      return `There's been activity on <strong>${deal?.dealName || "your deal"}</strong> (${deal?.company || ""}): ${deal?.updateType || "Update"} — ${deal?.detail || "See details in the app."}`;

    case "activity_summary":
      const summary = context.activitySummary;
      return `While you were away (${context.daysInactive} days), there have been ${summary?.newEmails || 0} new emails, ${summary?.dealChanges || 0} deal changes, and ${summary?.meetingsScheduled || 0} meetings scheduled. Want me to catch you up?`;

    case "gentle_nudge":
      return `Just checking in — you've got ${context.daysInactive} days of activity waiting. Your pipeline has been moving, and I've been tracking it for you.`;

    case "win_back":
      return `It's been a while! We've been keeping an eye on your accounts, and there might be some activity worth checking out.`;

    default:
      return `You have new activity to review in 60.`;
  }
}

/**
 * Select the best re-engagement type for a user
 */
export function selectReengagementType(
  segment: UserSegment,
  availableContent: {
    upcomingMeetings: boolean;
    dealUpdates: boolean;
    championChanges: boolean;
    newEmails: boolean;
    activitySummary: boolean;
  },
  previousAttempts: ReengagementType[]
): ReengagementType {
  // Get eligible types for segment
  const eligibleTypes = Object.values(REENGAGEMENT_TYPES)
    .filter((config) => config.segments.includes(segment))
    .filter((config) => !previousAttempts.includes(config.type))
    .sort((a, b) => b.priority - a.priority);

  // First, try content-driven types
  for (const config of eligibleTypes) {
    if (!config.requiresContent) continue;

    switch (config.type) {
      case "upcoming_meeting":
        if (availableContent.upcomingMeetings) return config.type;
        break;
      case "deal_update":
        if (availableContent.dealUpdates) return config.type;
        break;
      case "champion_alert":
        if (availableContent.championChanges) return config.type;
        break;
      case "new_email_summary":
        if (availableContent.newEmails) return config.type;
        break;
      case "activity_summary":
        if (availableContent.activitySummary) return config.type;
        break;
    }
  }

  // Fallback to non-content types
  const fallback = eligibleTypes.find((config) => !config.requiresContent);
  return fallback?.type || "gentle_nudge";
}

/**
 * Check if a re-engagement type is valid for a segment
 */
export function isValidReengagementType(
  type: ReengagementType,
  segment: UserSegment
): boolean {
  const config = REENGAGEMENT_TYPES[type];
  return config?.segments.includes(segment) ?? false;
}

/**
 * Get channel for re-engagement based on segment and user config
 */
export function getReengagementChannel(
  segment: UserSegment,
  hasSlackConnected: boolean,
  userPreference?: "slack" | "email" | "both"
): "slack_dm" | "email" {
  if (userPreference === "email") return "email";
  if (userPreference === "slack" && hasSlackConnected) return "slack_dm";

  return getPreferredReengagementChannel(segment, hasSlackConnected);
}
