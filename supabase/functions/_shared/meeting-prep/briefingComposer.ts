/**
 * briefingComposer.ts — Prompt templates and composition logic for
 * pre-meeting briefings. Two modes: first-meeting and return-meeting.
 *
 * The composer builds a prompt from all available context, calls Claude,
 * and formats the response into Slack Block Kit blocks + markdown.
 *
 * NOTE: The AI call itself is NOT in this file — that stays in the
 * preMeeting adapter. This file provides prompt builders and response
 * formatters only.
 */

import type {
  HistoricalContext,
  MeetingHistory,
  AttendeeComparison,
  PrepBriefingResult,
} from './types.ts';
import type { RAGResult } from '../memory/types.ts';

// ---- Prompt Templates -------------------------------------------------------

const RETURN_MEETING_SYSTEM_PROMPT =
  `You are a sales intelligence analyst preparing a pre-meeting brief for a sales rep. Write it like a trusted colleague who knows the deal inside out and is giving a 2-minute verbal briefing before the rep walks in.

TONE: Direct, specific, actionable. Reference exact details from transcripts. No filler like "it's important to build rapport." The rep knows that. Flag the things they might forget or didn't notice.`;

const FIRST_MEETING_SYSTEM_PROMPT =
  `You are a sales intelligence analyst preparing a first-meeting brief for a sales rep. Write it like a knowledgeable colleague who has done thorough homework on the prospect and company.

TONE: Informative, structured, actionable. Focus on what the rep needs to know to have a great first conversation. Suggest specific discovery questions based on what you know about the company and attendee.`;

// ---- Interfaces for composer inputs -----------------------------------------

interface ReturnMeetingInput {
  meetingTitle: string;
  meetingTime: string;
  meetingNumber: number;
  companyName: string;
  dealStage: string | null;
  daysInStage: number | null;
  dealAmount: number | null;
  attendeeProfiles: string; // formatted attendee list
  attendeeComparison: string; // who's new, returning, absent
  historicalContext: HistoricalContext;
  hubspotContext: string; // formatted deal properties
  companyNews: string; // formatted company news
}

interface FirstMeetingInput {
  meetingTitle: string;
  meetingTime: string;
  companyName: string;
  attendeeProfiles: string;
  companySnapshot: string;
  icpFitNotes: string;
  dealSource: string | null;
  companyNews: string;
}

// ---- Return Meeting Prompt Builder ------------------------------------------

export function buildReturnMeetingPrompt(input: ReturnMeetingInput): string {
  const sections: string[] = [];

  sections.push('# PRE-MEETING BRIEF — RETURN MEETING');
  sections.push('');
  sections.push(`Meeting: ${input.meetingTitle}`);
  sections.push(`Time: ${input.meetingTime}`);
  sections.push(`This is meeting #${input.meetingNumber} with ${input.companyName}`);
  if (input.dealStage) {
    sections.push(
      `Deal stage: ${input.dealStage}${input.daysInStage ? ` (${input.daysInStage} days)` : ''}`,
    );
  }
  if (input.dealAmount) {
    sections.push(`Deal value: $${input.dealAmount.toLocaleString()}`);
  }
  sections.push('');

  sections.push('## ATTENDEES');
  sections.push(input.attendeeProfiles);
  sections.push('');

  sections.push('## ATTENDEE CHANGES');
  sections.push(input.attendeeComparison);
  sections.push('');

  // Inject RAG context per section
  sections.push('## HISTORICAL CONTEXT FROM TRANSCRIPT ANALYSIS');
  const ctx = input.historicalContext.sections;

  const ragSections = [
    { id: 'conversation_summary', label: 'Conversation summary' },
    { id: 'commitments', label: 'Commitments made' },
    { id: 'objections_concerns', label: 'Objections/concerns' },
    { id: 'prospect_priorities', label: 'Prospect priorities' },
    { id: 'competitor_mentions', label: 'Competitor mentions' },
    { id: 'commercial_signals', label: 'Commercial signals' },
    { id: 'stakeholder_dynamics', label: 'Stakeholder dynamics' },
    { id: 'last_meeting_detail', label: 'Last meeting detail' },
  ];

  for (const rs of ragSections) {
    const ragResult: RAGResult | undefined = ctx[rs.id];
    if (ragResult && ragResult.answer.trim()) {
      sections.push(`- ${rs.label}: ${ragResult.answer}`);
    } else {
      sections.push(`- ${rs.label}: No data available`);
    }
  }
  sections.push('');

  if (input.hubspotContext) {
    sections.push('## HUBSPOT CONTEXT');
    sections.push(input.hubspotContext);
    sections.push('');
  }

  if (input.companyNews) {
    sections.push('## COMPANY NEWS');
    sections.push(input.companyNews);
    sections.push('');
  }

  sections.push('---');
  sections.push('');
  sections.push('Generate a pre-meeting brief in JSON format with these sections:');
  sections.push('1. story_so_far: 3-4 sentence narrative of the deal arc');
  sections.push(
    '2. attendees: array of { name, role, history, flags[] } — flags like "new", "returning_after_absence", "champion", "blocker"',
  );
  sections.push(
    '   For attendees who are NEW (first time), include their title, background, and LinkedIn notes if available.',
  );
  sections.push(
    '   For attendees who are RETURNING, include their meeting history and any known concerns.',
  );
  sections.push(
    '   For attendees who are RETURNING_AFTER_ABSENCE, flag when they were last seen and what their concerns were.',
  );
  sections.push(
    '3. open_items: array of { owner: "rep"|"prospect", action, status: "overdue"|"pending"|"fulfilled", deadline?, days_overdue? }',
  );
  sections.push(
    '4. landmines: array of strings — objections, concerns, or risks to navigate',
  );
  sections.push(
    '5. suggested_agenda: array of 4-6 specific items ordered by importance. Be concrete.',
  );
  sections.push(
    '6. what_matters_to_them: array of strings — their stated priorities and pain points',
  );
  sections.push(
    '7. competitive_context: string or null — only if competitors were mentioned',
  );
  sections.push('8. executive_summary: 2-3 sentence overview for the Slack header');
  sections.push('');
  sections.push('Return ONLY valid JSON. No markdown, no explanations.');

  return sections.join('\n');
}

// ---- First Meeting Prompt Builder -------------------------------------------

export function buildFirstMeetingPrompt(input: FirstMeetingInput): string {
  const sections: string[] = [];

  sections.push('# PRE-MEETING BRIEF — FIRST MEETING');
  sections.push('');
  sections.push(`Meeting: ${input.meetingTitle}`);
  sections.push(`Time: ${input.meetingTime}`);
  sections.push(`Company: ${input.companyName}`);
  if (input.dealSource) {
    sections.push(`Source: ${input.dealSource}`);
  }
  sections.push('');

  sections.push('## ATTENDEES');
  sections.push(input.attendeeProfiles);
  sections.push('');

  sections.push('## COMPANY');
  sections.push(input.companySnapshot);
  sections.push('');

  if (input.icpFitNotes) {
    sections.push('## ICP FIT ASSESSMENT');
    sections.push(input.icpFitNotes);
    sections.push('');
  }

  if (input.companyNews) {
    sections.push('## RECENT NEWS');
    sections.push(input.companyNews);
    sections.push('');
  }

  sections.push('---');
  sections.push('');
  sections.push('Generate a first-meeting brief in JSON format with:');
  sections.push('1. attendees: array of { name, title, background, linkedin_notes }');
  sections.push(
    '2. company_snapshot: 2-3 sentence company overview with ICP fit assessment',
  );
  sections.push(
    '3. discovery_questions: array of 4-6 personalized discovery questions based on attendee roles and company context',
  );
  sections.push(
    '4. deal_context: { source, existing_deal: boolean, suggested_deal_stage }',
  );
  sections.push('5. executive_summary: 2-3 sentence overview for the Slack header');
  sections.push('6. talking_points: array of 3-5 key topics to raise');
  sections.push('');
  sections.push('Return ONLY valid JSON. No markdown, no explanations.');

  return sections.join('\n');
}

// ---- Slack Block Kit Formatters ---------------------------------------------

/**
 * Build Slack blocks for a return-meeting briefing from parsed AI JSON response.
 * All text sections are truncated to Slack's Block Kit limits:
 *   - header: 150 chars
 *   - section/mrkdwn: 3000 chars (we use 2800 to leave margin)
 */
export function buildReturnMeetingSlackBlocks(
  briefing: any,
  meetingTitle: string,
  meetingTime: string,
  meetingNumber: number,
  companyName: string,
): any[] {
  const blocks: any[] = [];

  // Header
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: truncate(`Pre-Meeting Brief — ${companyName}`, 150),
    },
  });

  // Meeting context line
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `${meetingTime} — ${meetingTitle} (Meeting #${meetingNumber})`,
      },
    ],
  });

  blocks.push({ type: 'divider' });

  // Story so far
  if (briefing.story_so_far) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: truncate(`*THE STORY SO FAR*\n${briefing.story_so_far}`, 2800),
      },
    });
    blocks.push({ type: 'divider' });
  }

  // Attendees
  if (briefing.attendees?.length > 0) {
    let attendeeText = "*WHO'S IN THE ROOM*\n";
    for (const att of briefing.attendees) {
      const flags =
        att.flags?.length > 0
          ? ` ${att.flags.map((f: string) => `_${f}_`).join(' ')}`
          : '';
      attendeeText += `• *${att.name}* — ${att.role || 'Unknown role'}${flags}\n`;
      if (att.history) attendeeText += `  ${att.history}\n`;
    }
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: truncate(attendeeText, 2800) },
    });
    blocks.push({ type: 'divider' });
  }

  // Open items
  if (briefing.open_items?.length > 0) {
    let itemsText = '*OPEN ITEMS*\n';
    for (const item of briefing.open_items) {
      const icon =
        item.status === 'overdue'
          ? ':red_circle:'
          : item.status === 'pending'
            ? ':large_yellow_circle:'
            : ':white_check_mark:';
      const ownerLabel = item.owner === 'rep' ? 'YOU OWE' : 'THEY OWE';
      const overdueNote = item.days_overdue ? ` (${item.days_overdue} days overdue)` : '';
      itemsText += `${icon} *${ownerLabel}:* ${item.action}${overdueNote}\n`;
    }
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: truncate(itemsText, 2800) },
    });
    blocks.push({ type: 'divider' });
  }

  // Landmines
  if (briefing.landmines?.length > 0) {
    let landminesText = '*LANDMINES*\n';
    for (const lm of briefing.landmines) {
      landminesText += `• ${lm}\n`;
    }
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: truncate(landminesText, 2800) },
    });
    blocks.push({ type: 'divider' });
  }

  // Suggested agenda
  if (briefing.suggested_agenda?.length > 0) {
    let agendaText = '*SUGGESTED AGENDA*\n';
    briefing.suggested_agenda.forEach((item: unknown, i: number) => {
      const text = typeof item === 'string' ? item : (item as any)?.item || (item as any)?.text || (item as any)?.action || JSON.stringify(item);
      agendaText += `${i + 1}. ${text}\n`;
    });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: truncate(agendaText, 2800) },
    });
    blocks.push({ type: 'divider' });
  }

  // What matters to them
  if (briefing.what_matters_to_them?.length > 0) {
    let mattersText = '*WHAT MATTERS TO THEM*\n';
    for (const item of briefing.what_matters_to_them) {
      mattersText += `• ${item}\n`;
    }
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: truncate(mattersText, 2800) },
    });
  }

  // Competitive context
  if (briefing.competitive_context) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: truncate(`*COMPETITIVE CONTEXT*\n${briefing.competitive_context}`, 2800),
      },
    });
  }

  return blocks;
}

/**
 * Build Slack blocks for a first-meeting briefing from parsed AI JSON response.
 */
export function buildFirstMeetingSlackBlocks(
  briefing: any,
  meetingTitle: string,
  meetingTime: string,
  companyName: string,
): any[] {
  const blocks: any[] = [];

  // Header
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: truncate(`Pre-Meeting Brief — ${companyName}`, 150),
    },
  });

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `${meetingTime} — ${meetingTitle} (First Meeting)`,
      },
    ],
  });

  blocks.push({ type: 'divider' });

  // Attendees
  if (briefing.attendees?.length > 0) {
    let attendeeText = "*WHO YOU'RE MEETING*\n";
    for (const att of briefing.attendees) {
      attendeeText += `• *${att.name}*${att.title ? ` — ${att.title}` : ''}\n`;
      if (att.background) attendeeText += `  ${att.background}\n`;
      if (att.linkedin_notes) attendeeText += `  _${att.linkedin_notes}_\n`;
    }
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: truncate(attendeeText, 2800) },
    });
    blocks.push({ type: 'divider' });
  }

  // Company snapshot
  if (briefing.company_snapshot) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: truncate(`*COMPANY SNAPSHOT*\n${briefing.company_snapshot}`, 2800),
      },
    });
    blocks.push({ type: 'divider' });
  }

  // Discovery questions
  if (briefing.discovery_questions?.length > 0) {
    let questionsText = '*SUGGESTED DISCOVERY QUESTIONS*\n';
    briefing.discovery_questions.forEach((q: string, i: number) => {
      questionsText += `${i + 1}. ${q}\n`;
    });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: truncate(questionsText, 2800) },
    });
    blocks.push({ type: 'divider' });
  }

  // Talking points
  if (briefing.talking_points?.length > 0) {
    let tpText = '*KEY TALKING POINTS*\n';
    for (const tp of briefing.talking_points) {
      tpText += `• ${tp}\n`;
    }
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: truncate(tpText, 2800) },
    });
  }

  return blocks;
}

// ---- Markdown Formatters ----------------------------------------------------

export function buildReturnMeetingMarkdown(
  briefing: any,
  meetingTitle: string,
  meetingNumber: number,
  companyName: string,
): string {
  const lines: string[] = [];

  lines.push(`# Pre-Meeting Brief — ${companyName}`);
  lines.push(`**${meetingTitle}** (Meeting #${meetingNumber})`);
  lines.push('');

  if (briefing.story_so_far) {
    lines.push('## The Story So Far');
    lines.push(briefing.story_so_far);
    lines.push('');
  }

  if (briefing.attendees?.length > 0) {
    lines.push("## Who's in the Room");
    for (const att of briefing.attendees) {
      const flags = att.flags?.length > 0 ? ` (${att.flags.join(', ')})` : '';
      lines.push(`- **${att.name}** — ${att.role || 'Unknown'}${flags}`);
      if (att.history) lines.push(`  ${att.history}`);
    }
    lines.push('');
  }

  if (briefing.open_items?.length > 0) {
    lines.push('## Open Items');
    for (const item of briefing.open_items) {
      const icon =
        item.status === 'overdue'
          ? 'OVERDUE'
          : item.status === 'pending'
            ? 'PENDING'
            : 'DONE';
      lines.push(
        `- [${icon}] ${item.owner === 'rep' ? 'You owe' : 'They owe'}: ${item.action}`,
      );
    }
    lines.push('');
  }

  if (briefing.landmines?.length > 0) {
    lines.push('## Landmines');
    for (const lm of briefing.landmines) {
      lines.push(`- ${lm}`);
    }
    lines.push('');
  }

  if (briefing.suggested_agenda?.length > 0) {
    lines.push('## Suggested Agenda');
    briefing.suggested_agenda.forEach((item: unknown, i: number) => {
      const text = typeof item === 'string' ? item : (item as any)?.item || (item as any)?.text || (item as any)?.action || JSON.stringify(item);
      lines.push(`${i + 1}. ${text}`);
    });
    lines.push('');
  }

  if (briefing.what_matters_to_them?.length > 0) {
    lines.push('## What Matters to Them');
    for (const item of briefing.what_matters_to_them) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  if (briefing.competitive_context) {
    lines.push('## Competitive Context');
    lines.push(briefing.competitive_context);
    lines.push('');
  }

  return lines.join('\n');
}

export function buildFirstMeetingMarkdown(
  briefing: any,
  meetingTitle: string,
  companyName: string,
): string {
  const lines: string[] = [];

  lines.push(`# Pre-Meeting Brief — ${companyName}`);
  lines.push(`**${meetingTitle}** (First Meeting)`);
  lines.push('');

  if (briefing.attendees?.length > 0) {
    lines.push("## Who You're Meeting");
    for (const att of briefing.attendees) {
      lines.push(`- **${att.name}**${att.title ? ` — ${att.title}` : ''}`);
      if (att.background) lines.push(`  ${att.background}`);
    }
    lines.push('');
  }

  if (briefing.company_snapshot) {
    lines.push('## Company Snapshot');
    lines.push(briefing.company_snapshot);
    lines.push('');
  }

  if (briefing.discovery_questions?.length > 0) {
    lines.push('## Discovery Questions');
    briefing.discovery_questions.forEach((q: string, i: number) => {
      lines.push(`${i + 1}. ${q}`);
    });
    lines.push('');
  }

  if (briefing.talking_points?.length > 0) {
    lines.push('## Talking Points');
    for (const tp of briefing.talking_points) {
      lines.push(`- ${tp}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---- Helpers ----------------------------------------------------------------

/**
 * Truncate a string to maxLength characters, appending an ellipsis if cut.
 * Used to stay within Slack Block Kit text limits:
 *   - plain_text header: 150 chars
 *   - mrkdwn section text: 3000 chars (we cap at 2800 for safety)
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '\u2026';
}

// Re-export prompt constants for testing
export { RETURN_MEETING_SYSTEM_PROMPT, FIRST_MEETING_SYSTEM_PROMPT };
