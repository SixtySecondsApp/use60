/**
 * Follow-Up Email Composer — FU-004
 *
 * AI prompt design and composition functions for generating follow-up emails.
 * Supports two distinct paths:
 *
 *   1. composeReturnMeetingFollowUp — uses full RAG historical context to produce
 *      relationship-aware, reference-rich follow-ups for meeting #2+.
 *
 *   2. composeFirstMeetingFollowUp — no historical context; produces a focused,
 *      clean follow-up for a first meeting where no prior history exists.
 *
 *   3. generateSubjectLine — standalone helper that generates a sharp, specific
 *      subject line for the composed email.
 *
 * Design notes:
 *   - All AI calls are fail-soft: a deterministic fallback is returned on any
 *     error so the edge function never surfaces an uncaught exception to callers.
 *   - The Anthropic API key is read from Deno.env at call time (not module load),
 *     keeping the module testable without env setup.
 *   - Model: claude-sonnet-4-20250514. Temperature 0.6 for natural variation while
 *     staying on-brief.
 */

import type { FollowUpContext } from '../rag/types.ts';
import type { ComposedEmail } from './types.ts';

// ============================================================================
// Constants
// ============================================================================

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
const COMPOSE_MODEL = 'claude-sonnet-4-20250514';
const COMPOSE_MAX_TOKENS = 1500;
const COMPOSE_TEMPERATURE = 0.6;
const SUBJECT_MAX_TOKENS = 256;
const SUBJECT_TEMPERATURE = 0.4;
const TRANSCRIPT_EXCERPT_CHARS = 3000;

// ============================================================================
// Input Types
// ============================================================================

export interface MeetingAnalysis {
  summary: string;
  actionItems: Array<{
    task: string;
    suggestedOwner?: string;
    dueInDays?: number;
  }>;
  keyTopics?: string[];
  buyingSignals?: string[];
  keyQuotes?: string[];
  sentiment?: 'positive' | 'neutral' | 'challenging';
}

export interface WritingStyle {
  name?: string;
  toneDescription?: string;
  /** 1 = very informal, 5 = very formal */
  formality?: number;
  /** 1 = indirect / diplomatic, 5 = blunt / direct */
  directness?: number;
  /** 1 = businesslike, 5 = warm and personal */
  warmth?: number;
  commonPhrases?: string[];
  signoffs?: string[];
  wordsToAvoid?: string[];
}

export interface RecipientInfo {
  name: string;
  email: string;
  role?: string;
  companyName?: string;
}

export interface DealContext {
  name?: string;
  stage?: string;
  value?: number;
}

export interface ComposeInput {
  meeting: {
    id: string;
    title: string;
    transcript?: string;
  };
  analysis: MeetingAnalysis;
  recipient: RecipientInfo;
  deal?: DealContext | null;
  writingStyle?: WritingStyle | null;
  senderFirstName: string;
  senderLastName?: string;
  orgName?: string;
}

// ============================================================================
// Private helpers
// ============================================================================

/**
 * Strip fenced code blocks and locate the first JSON object in a string.
 * Returns the raw JSON string, or null if no object is found.
 */
function extractJsonObject(text: string): string | null {
  if (!text) return null;
  let s = String(text).trim();

  // Strip fenced code blocks: ```json ... ``` or ``` ... ```
  if (s.startsWith('```')) {
    s = s.replace(/^```[a-zA-Z0-9_-]*\s*/m, '').replace(/```$/m, '').trim();
  }

  // Locate the first {...} object
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) return s.slice(start, end + 1).trim();
  return null;
}

/**
 * Count words in a plain-text string.
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Render a formality level as a human-readable description.
 */
function formalityLabel(level: number): string {
  const labels: Record<number, string> = {
    1: 'Very informal — casual, conversational',
    2: 'Informal — relaxed but professional',
    3: 'Balanced — professional but not stiff',
    4: 'Formal — polished and structured',
    5: 'Very formal — highly professional, precise',
  };
  return labels[Math.round(level)] ?? 'Balanced — professional but not stiff';
}

/**
 * Render a directness level as a human-readable description.
 */
function directnessLabel(level: number): string {
  const labels: Record<number, string> = {
    1: 'Very indirect — diplomatic, reads between the lines',
    2: 'Indirect — polite, softens statements',
    3: 'Balanced — clear but considerate',
    4: 'Direct — says it plainly',
    5: 'Very direct — blunt, no hedging',
  };
  return labels[Math.round(level)] ?? 'Balanced — clear but considerate';
}

/**
 * Render a warmth level as a human-readable description.
 */
function warmthLabel(level: number): string {
  const labels: Record<number, string> = {
    1: 'Businesslike — keeps it purely professional',
    2: 'Cordial — friendly but restrained',
    3: 'Warm — personable, acknowledges the relationship',
    4: 'Very warm — openly friendly, uses the person's name naturally',
    5: 'Highly personal — reads like an email to a close contact',
  };
  return labels[Math.round(level)] ?? 'Warm — personable, acknowledges the relationship';
}

/**
 * Build the REP WRITING STYLE section of the system prompt.
 * Returns an empty string if no style data is available.
 */
function buildWritingStyleBlock(style: WritingStyle | null | undefined): string {
  if (!style) return '';

  const lines: string[] = ['## REP WRITING STYLE'];

  if (style.toneDescription) {
    lines.push(`Tone description (from the rep's own words): "${style.toneDescription}"`);
  }
  if (style.formality != null) {
    lines.push(`Formality: ${formalityLabel(style.formality)} (${style.formality}/5)`);
  }
  if (style.directness != null) {
    lines.push(`Directness: ${directnessLabel(style.directness)} (${style.directness}/5)`);
  }
  if (style.warmth != null) {
    lines.push(`Warmth: ${warmthLabel(style.warmth)} (${style.warmth}/5)`);
  }
  if (style.commonPhrases?.length) {
    lines.push(`Phrases this rep commonly uses: ${style.commonPhrases.map((p) => `"${p}"`).join(', ')}`);
  }
  if (style.signoffs?.length) {
    lines.push(`Preferred sign-offs: ${style.signoffs.join(' / ')}`);
  }
  if (style.wordsToAvoid?.length) {
    lines.push(`Words / phrases to avoid: ${style.wordsToAvoid.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Build the HISTORICAL CONTEXT sections from the FollowUpContext.
 * Only sections that have chunks are included.
 */
function buildHistoricalContextBlock(followUpContext: FollowUpContext): string {
  const sectionLabels: Record<string, string> = {
    prior_commitments: 'PRIOR COMMITMENTS (what the rep promised in previous meetings)',
    prospect_concerns: "PROSPECT CONCERNS (objections and hesitations raised previously)",
    their_words: "THEIR WORDS (exact phrases and priorities the prospect has used)",
    deal_trajectory: 'DEAL TRAJECTORY (how the conversation has evolved)',
    commercial_history: 'COMMERCIAL HISTORY (budget, pricing, or deal size context)',
    stakeholder_context: 'STAKEHOLDER CONTEXT (who has attended, who has dropped off)',
  };

  const populated = Object.entries(followUpContext.sections).filter(
    ([, result]) => result.chunks.length > 0
  );

  if (populated.length === 0) return '';

  const lines: string[] = ['## HISTORICAL CONTEXT FROM PREVIOUS MEETINGS'];

  for (const [sectionId, result] of populated) {
    const label = sectionLabels[sectionId] ?? sectionId.toUpperCase().replace(/_/g, ' ');
    lines.push(`\n### ${label}`);
    for (const chunk of result.chunks) {
      const datePart = chunk.meetingDate
        ? ` (from meeting on ${chunk.meetingDate.slice(0, 10)})`
        : '';
      const sourcePart = chunk.source ? ` — source: ${chunk.source}` : '';
      lines.push(`- ${chunk.text.trim()}${datePart}${sourcePart}`);
    }
  }

  return lines.join('\n');
}

/**
 * Build the action items text block.
 */
function buildActionItemsBlock(
  actionItems: MeetingAnalysis['actionItems'],
): string {
  if (!actionItems.length) return 'None identified.';
  return actionItems
    .map((item) => {
      const owner = item.suggestedOwner ? ` (${item.suggestedOwner})` : '';
      const due = item.dueInDays != null ? ` — due in ${item.dueInDays} day${item.dueInDays === 1 ? '' : 's'}` : '';
      return `- ${item.task}${owner}${due}`;
    })
    .join('\n');
}

/**
 * Call the Anthropic API and return the raw text content of the first message.
 * Returns null on any error so callers can fall back gracefully.
 */
async function callAnthropic(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  temperature: number,
): Promise<string | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.warn('[composer] ANTHROPIC_API_KEY not set — skipping AI composition');
    return null;
  }

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model: COMPOSE_MODEL,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      console.error(`[composer] Anthropic API error ${response.status}: ${errText}`);
      return null;
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const textBlock = data.content?.find((c) => c.type === 'text');
    return textBlock?.text ?? null;
  } catch (err) {
    console.error('[composer] Anthropic API call failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Parse `{ "subject": "...", "body": "..." }` from raw AI text.
 * Returns null if the structure cannot be parsed.
 */
function parseEmailJson(
  raw: string,
): { subject: string; body: string } | null {
  const jsonStr = extractJsonObject(raw);
  if (!jsonStr) return null;

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const subject = typeof parsed['subject'] === 'string' ? parsed['subject'].trim() : null;
    const body = typeof parsed['body'] === 'string' ? parsed['body'].trim() : null;

    if (!subject || !body) return null;
    return { subject, body };
  } catch {
    return null;
  }
}

/**
 * Build a simple deterministic fallback email when AI is unavailable or fails.
 */
function buildFallbackEmail(input: ComposeInput): { subject: string; body: string } {
  const { recipient, analysis, senderFirstName, senderLastName } = input;
  const recipientFirst = recipient.name.split(' ')[0];
  const senderName = [senderFirstName, senderLastName].filter(Boolean).join(' ');

  const actionItemLines = analysis.actionItems.length
    ? '\n\nNext steps:\n' +
      analysis.actionItems
        .map((a) => `- ${a.task}`)
        .join('\n')
    : '';

  const subject = `Follow up: ${input.meeting.title}`;

  const body = `Hi ${recipientFirst},

Thanks for the time today. ${analysis.summary}${actionItemLines}

Let me know if anything needs clarifying.

${senderName}`;

  return { subject, body };
}

// ============================================================================
// Public: composeReturnMeetingFollowUp
// ============================================================================

/**
 * Compose a follow-up email for a return meeting (meeting #2+).
 * Uses full RAG historical context to produce a relationship-aware email
 * that references prior commitments, the prospect's own language, and deal
 * trajectory naturally within the body copy.
 *
 * @param input           - Meeting, analysis, recipient, style and sender info
 * @param followUpContext - Assembled RAG context from getFollowUpContext()
 * @returns               - Fully composed email; falls back gracefully on AI failure
 */
export async function composeReturnMeetingFollowUp(
  input: ComposeInput,
  followUpContext: FollowUpContext,
): Promise<ComposedEmail> {
  const {
    meeting,
    analysis,
    recipient,
    deal,
    writingStyle,
    senderFirstName,
    senderLastName,
    orgName,
  } = input;

  const today = new Date().toISOString().slice(0, 10);
  const senderFullName = [senderFirstName, senderLastName].filter(Boolean).join(' ');
  const meetingNumber = followUpContext.meetingNumber;

  // ------------------------------------------------------------------
  // System prompt
  // ------------------------------------------------------------------

  const writingStyleBlock = buildWritingStyleBlock(writingStyle);
  const historicalBlock = buildHistoricalContextBlock(followUpContext);

  const systemPrompt = `You are writing a follow-up email on behalf of a sales rep after a meeting.
The email should read like the rep wrote it personally — warm, specific,
and relationship-aware. The recipient should feel like the rep remembers
everything about their conversations and genuinely cares about their needs.

${writingStyleBlock}

## RECIPIENT
- Name: ${recipient.name}
- Role: ${recipient.role ?? 'Unknown'}
- Company: ${recipient.companyName ?? 'Unknown'}
- This is meeting number ${meetingNumber} with this person${meetingNumber > 1 ? ` — they have an established relationship` : ''}.

## TODAY'S MEETING ANALYSIS
- Sentiment: ${analysis.sentiment ?? 'neutral'}
- Key topics: ${analysis.keyTopics?.join(', ') || 'See summary'}
- Buying signals: ${analysis.buyingSignals?.join(', ') || 'None noted'}
- Summary: ${analysis.summary}

${historicalBlock}

## INSTRUCTIONS
1. Open warmly but specifically — reference something concrete from today's meeting, not a generic opener. Never say "great catching up."
2. Weave in 2-3 references to previous conversations naturally. Do not list them as a recap — fold them organically into the flow of the email.
3. For action items, acknowledge any overdue commitments honestly. If something was promised previously and has not been delivered, own it.
4. Use the prospect's own language when describing their priorities. Mirror their words back, not a paraphrase.
5. If stakeholders have appeared or disappeared across meetings, reference this naturally and without making it awkward.
6. Include one specific, timed next step — a concrete date or timeframe, not "soon" or "in the coming weeks."
7. If commercial terms were discussed previously, reference them contextually as appropriate. Do not lead with pricing.
8. Keep the email under 250 words.
9. No bullet-point dumps. Write as a real email with natural paragraphs. Action items may be formatted as a brief list but should not dominate the email.
10. End with something specific and forward-looking that advances the relationship or deal.

CRITICAL: The email must sound human. No AI tells — no "Certainly!", no "I hope this email finds you well", no "As per our discussion", no "Please do not hesitate." Write like a sharp, caring human who has their notes in front of them.

OUTPUT FORMAT: Return only a JSON object with this structure (no explanation, no markdown wrapper):
{"subject": "...", "body": "..."}`;

  // ------------------------------------------------------------------
  // User message
  // ------------------------------------------------------------------

  const actionItemsText = buildActionItemsBlock(analysis.actionItems);
  const keyQuotesText = analysis.keyQuotes?.length
    ? `\nKey quotes from today:\n${analysis.keyQuotes.map((q) => `"${q}"`).join('\n')}`
    : '';

  const transcriptExcerpt = meeting.transcript
    ? `\nTRANSCRIPT EXCERPT (first ${TRANSCRIPT_EXCERPT_CHARS} chars):\n${meeting.transcript.slice(0, TRANSCRIPT_EXCERPT_CHARS)}`
    : '';

  const dealLine = deal
    ? `\nDeal: ${deal.name ?? 'Unnamed deal'}${deal.stage ? ` (${deal.stage})` : ''}${deal.value != null ? ` — £${deal.value.toLocaleString()}` : ''}`
    : '';

  const userMessage = `Today's date: ${today}
Sender: ${senderFullName}${orgName ? ` at ${orgName}` : ''}
Meeting: ${meeting.title}
Recipient: ${recipient.name}${recipient.role ? `, ${recipient.role}` : ''}${recipient.companyName ? ` at ${recipient.companyName}` : ''}${dealLine}

MEETING SUMMARY:
${analysis.summary}
${keyQuotesText}

ACTION ITEMS FROM TODAY:
${actionItemsText}
${transcriptExcerpt}

Write the follow-up email. Return only the JSON object.`;

  // ------------------------------------------------------------------
  // AI call → parse → fallback
  // ------------------------------------------------------------------

  const rawResponse = await callAnthropic(
    systemPrompt,
    userMessage,
    COMPOSE_MAX_TOKENS,
    COMPOSE_TEMPERATURE,
  );

  const parsed = rawResponse ? parseEmailJson(rawResponse) : null;
  const email = parsed ?? buildFallbackEmail(input);

  console.log(
    `[composer] composeReturnMeetingFollowUp meetingId=${meeting.id} ` +
      `meetingNumber=${meetingNumber} hasHistory=${followUpContext.hasHistory} ` +
      `aiSuccess=${parsed !== null} wordCount=${countWords(email.body)}`
  );

  return {
    to: recipient.email,
    subject: email.subject,
    body: email.body,
    wordCount: countWords(email.body),
  };
}

// ============================================================================
// Public: composeFirstMeetingFollowUp
// ============================================================================

/**
 * Compose a follow-up email for a first meeting.
 * No historical RAG context is available, so the email focuses on a clean,
 * specific recap that references what the prospect actually said and proposes
 * a clear next step.
 *
 * @param input - Meeting, analysis, recipient, style and sender info
 * @returns     - Fully composed email; falls back gracefully on AI failure
 */
export async function composeFirstMeetingFollowUp(
  input: ComposeInput,
): Promise<ComposedEmail> {
  const {
    meeting,
    analysis,
    recipient,
    deal,
    writingStyle,
    senderFirstName,
    senderLastName,
    orgName,
  } = input;

  const today = new Date().toISOString().slice(0, 10);
  const senderFullName = [senderFirstName, senderLastName].filter(Boolean).join(' ');

  // ------------------------------------------------------------------
  // System prompt
  // ------------------------------------------------------------------

  const writingStyleBlock = buildWritingStyleBlock(writingStyle);

  const systemPrompt = `You are writing a first-meeting follow-up email on behalf of a sales rep.
This is the first time the rep has met this prospect. The email should feel personal,
specific, and efficient — not like a template. It should make the prospect feel heard
and leave them with a clear next step.

${writingStyleBlock}

## RECIPIENT
- Name: ${recipient.name}
- Role: ${recipient.role ?? 'Unknown'}
- Company: ${recipient.companyName ?? 'Unknown'}
- This is the FIRST meeting — there is no prior relationship history.

## TODAY'S MEETING ANALYSIS
- Sentiment: ${analysis.sentiment ?? 'neutral'}
- Key topics: ${analysis.keyTopics?.join(', ') || 'See summary'}
- Buying signals: ${analysis.buyingSignals?.join(', ') || 'None noted'}
- Summary: ${analysis.summary}

## INSTRUCTIONS
1. Reference one specific thing the prospect said — use their actual words or a close paraphrase. This signals that you were genuinely listening.
2. Keep the recap brief — one to two sentences. They were there.
3. List action items clearly but concisely. If there are none, propose one.
4. Propose a specific next step with a suggested timeframe or date. Make it easy to say yes.
5. Keep the email under 200 words.
6. No filler openings. Do not start with "It was great to meet you." Start with something specific.
7. No bullet-point walls. One short list for action items if needed, the rest in prose.

CRITICAL: Sound like a real person who found the conversation genuinely useful. No AI tells.

OUTPUT FORMAT: Return only a JSON object with this structure (no explanation, no markdown wrapper):
{"subject": "...", "body": "..."}`;

  // ------------------------------------------------------------------
  // User message
  // ------------------------------------------------------------------

  const actionItemsText = buildActionItemsBlock(analysis.actionItems);
  const keyQuotesText = analysis.keyQuotes?.length
    ? `\nKey quotes from today:\n${analysis.keyQuotes.map((q) => `"${q}"`).join('\n')}`
    : '';

  const transcriptExcerpt = meeting.transcript
    ? `\nTRANSCRIPT EXCERPT (first ${TRANSCRIPT_EXCERPT_CHARS} chars):\n${meeting.transcript.slice(0, TRANSCRIPT_EXCERPT_CHARS)}`
    : '';

  const dealLine = deal
    ? `\nDeal: ${deal.name ?? 'Unnamed deal'}${deal.stage ? ` (${deal.stage})` : ''}${deal.value != null ? ` — £${deal.value.toLocaleString()}` : ''}`
    : '';

  const userMessage = `Today's date: ${today}
Sender: ${senderFullName}${orgName ? ` at ${orgName}` : ''}
Meeting: ${meeting.title}
Recipient: ${recipient.name}${recipient.role ? `, ${recipient.role}` : ''}${recipient.companyName ? ` at ${recipient.companyName}` : ''}${dealLine}

MEETING SUMMARY:
${analysis.summary}
${keyQuotesText}

ACTION ITEMS FROM TODAY:
${actionItemsText}
${transcriptExcerpt}

Write the first-meeting follow-up email. Return only the JSON object.`;

  // ------------------------------------------------------------------
  // AI call → parse → fallback
  // ------------------------------------------------------------------

  const rawResponse = await callAnthropic(
    systemPrompt,
    userMessage,
    COMPOSE_MAX_TOKENS,
    COMPOSE_TEMPERATURE,
  );

  const parsed = rawResponse ? parseEmailJson(rawResponse) : null;
  const email = parsed ?? buildFallbackEmail(input);

  console.log(
    `[composer] composeFirstMeetingFollowUp meetingId=${meeting.id} ` +
      `aiSuccess=${parsed !== null} wordCount=${countWords(email.body)}`
  );

  return {
    to: recipient.email,
    subject: email.subject,
    body: email.body,
    wordCount: countWords(email.body),
  };
}

// ============================================================================
// Public: generateSubjectLine
// ============================================================================

/**
 * Generate a sharp, specific email subject line for a follow-up.
 * Keeps the subject under 50 characters and avoids generic filler.
 * Falls back to primaryTopic if AI is unavailable or fails.
 *
 * @param meetingSummaryOneLine - One-sentence summary of the meeting outcome
 * @param meetingNumber         - Sequential meeting number (1 = first meeting)
 * @param primaryTopic          - The main topic discussed (used as fallback)
 * @param topActionItem         - The single most important action item
 * @param styleFormality        - Rep's formality score (1-5), optional
 * @returns                     - Subject line string; never throws
 */
export async function generateSubjectLine(
  meetingSummaryOneLine: string,
  meetingNumber: number,
  primaryTopic: string,
  topActionItem: string,
  styleFormality?: number,
): Promise<string> {
  const formalityNote = styleFormality != null
    ? `The rep writes at formality level ${styleFormality}/5 (${formalityLabel(styleFormality)}).`
    : '';

  const systemPrompt = `You generate email subject lines for sales follow-up emails.
${formalityNote}

Rules:
- Under 50 characters (count carefully)
- Reference something specific from the meeting — a topic, a commitment, or the next step
- No generic subjects like "Following up" or "Great to meet you" or "Next steps"
- Match the rep's communication style — if they're informal, the subject should feel casual; if formal, keep it clean
- No punctuation at the end unless it's a question

Return only the subject line as plain text. No JSON, no explanation.`;

  const userMessage = `Meeting number: ${meetingNumber}
One-line summary: ${meetingSummaryOneLine}
Primary topic: ${primaryTopic}
Top action item: ${topActionItem}

Generate the subject line.`;

  const raw = await callAnthropic(
    systemPrompt,
    userMessage,
    SUBJECT_MAX_TOKENS,
    SUBJECT_TEMPERATURE,
  );

  if (!raw) {
    console.warn('[composer] generateSubjectLine: AI unavailable, using primaryTopic fallback');
    return primaryTopic;
  }

  // Strip any accidental JSON wrapping or quotes
  const cleaned = raw.trim().replace(/^["']|["']$/g, '').trim();

  // Guard: if the result is too long, fall back
  if (cleaned.length > 80 || cleaned.length === 0) {
    console.warn(`[composer] generateSubjectLine: result out of bounds ("${cleaned}"), falling back`);
    return primaryTopic;
  }

  return cleaned;
}
