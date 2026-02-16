/**
 * Prospecting Detector Utilities
 *
 * Shared utilities for detecting prospecting/workflow prompts and generating
 * clarifying questions. Used by both the Ops page workflow orchestrator and
 * the Copilot chat interface.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClarifyingQuestion {
  type: 'select' | 'text';
  question: string;
  options?: string[];
  key: string;
}

// ---------------------------------------------------------------------------
// Pre-flight question detection (deterministic, no AI round-trip)
// ---------------------------------------------------------------------------

/**
 * Detect what critical info is missing from the prompt and generate
 * chip-select questions for the user before hitting the backend.
 */
export function detectMissingInfo(prompt: string): ClarifyingQuestion[] {
  const lower = prompt.toLowerCase();
  const questions: ClarifyingQuestion[] = [];

  // 1. Company vs Contact — ask unless prompt clearly indicates one
  const mentionsCompanies = /compan|organi[sz]ation|business|firm|agenc/i.test(lower);
  const mentionsContacts = /contact|people|person|lead|prospect|decision.?maker|founder|ceo|cto|cfo|cmo|coo|vp\b|director|manager|head of/i.test(lower);
  if (!mentionsCompanies && !mentionsContacts) {
    questions.push({
      type: 'select',
      question: 'Are you looking for companies or contacts?',
      options: ['Companies', 'Contacts (people)', 'Both'],
      key: 'search_type',
    });
  }

  // 2. Company size — ask if not mentioned
  const mentionsSize = /small|medium|large|enterprise|startup|employee|headcount|\d+[\s,-]+\d+\s*(employee|people|staff)/i.test(lower);
  if (!mentionsSize) {
    questions.push({
      type: 'select',
      question: 'What size companies are you targeting?',
      options: ['Small (1-50)', 'Medium (51-500)', 'Large (500+)', 'Any size'],
      key: 'company_size',
    });
  }

  // 3. Result count — ask if no number is mentioned alongside a search verb
  const hasNumberWithVerb = /\b(\d+)\b/.test(lower) && /find|get|show|list|search|build/i.test(lower);
  if (!hasNumberWithVerb) {
    questions.push({
      type: 'select',
      question: 'How many results would you like?',
      options: ['10', '25', '50', '100'],
      key: 'result_count',
    });
  }

  return questions;
}

/**
 * Enrich the original prompt with pre-flight answers as natural language.
 */
export function enrichPromptWithAnswers(prompt: string, answers: Record<string, string>): string {
  const additions: string[] = [];

  // Campaign high-level intent
  if (answers.campaign_goal) {
    additions.push(`the goal is to ${answers.campaign_goal.toLowerCase()}`);
  }
  if (answers.target_audience) {
    additions.push(`targeting ${answers.target_audience}`);
  }

  if (answers.search_type) {
    additions.push(`I'm looking for ${answers.search_type.toLowerCase()}`);
  }
  if (answers.company_size && answers.company_size !== 'Any size') {
    additions.push(`targeting ${answers.company_size.toLowerCase()} companies`);
  }
  if (answers.result_count) {
    additions.push(`I want ${answers.result_count} results`);
  }

  // Campaign-specific answers
  if (answers.enrichment_scope) {
    if (answers.enrichment_scope === 'Email only') {
      additions.push('enrich with email');
    } else if (answers.enrichment_scope === 'Email + Phone') {
      additions.push('enrich with email and phone');
    } else if (answers.enrichment_scope === 'Skip enrichment') {
      additions.push('skip enrichment');
    }
  }
  if (answers.email_steps) {
    if (answers.email_steps === 'Yes (3 steps)') {
      additions.push('generate a 3-step email sequence');
    } else if (answers.email_steps === 'Yes (5 steps)') {
      additions.push('generate a 5-step email sequence');
    } else if (answers.email_steps.startsWith('No')) {
      additions.push('skip email generation');
    }
  }
  if (answers.campaign_name) {
    additions.push(`name the campaign '${answers.campaign_name}'`);
  }

  return additions.length ? `${prompt}. ${additions.join(', ')}.` : prompt;
}

// ---------------------------------------------------------------------------
// Workflow prompt detector
// ---------------------------------------------------------------------------

const WORKFLOW_KEYWORDS = [
  'find me',
  'find and',
  'search for',
  'search and',
  'prospect',
  'outreach',
  'sequence',
  'campaign',
  'cold email',
  'send emails',
  'email sequence',
  'create a table',
  'build a list',
  'build me a list',
  'run a search',
  'apollo search',
  'find leads',
  'generate emails',
  'start a campaign',
  'reach out',
];

/**
 * Detect if a query is a workflow-level prompt (prospecting/outreach)
 * vs a table-level query (filter, sort, analyze existing data).
 */
export function isWorkflowPrompt(query: string): boolean {
  const lower = query.toLowerCase().trim();
  return WORKFLOW_KEYWORDS.some(kw => lower.includes(kw));
}

// ---------------------------------------------------------------------------
// Campaign prompt detection
// ---------------------------------------------------------------------------

const CAMPAIGN_KEYWORDS = [
  'start a campaign',
  'start campaign',
  'create a campaign',
  'create campaign',
  'run a campaign',
  'run campaign',
  'launch outreach',
  'launch a campaign',
  'launch campaign',
  'send cold emails',
  'email campaign',
  'outreach campaign',
  'cold outreach',
  'build a campaign',
  'build campaign',
  'outreach sequence',
  'create outreach',
  'create a sequence',
  'create sequence',
  'invite them',
  'reach out to them',
  'message them all',
  'email them',
  'send them',
];

const TARGET_PATTERN =
  /\b(in|near)\s+[A-Z][a-z]+|\b(cto|cfo|ceo|cmo|coo|founder|director|manager|vp|head of|decision.?maker|lead)\b|\b(marketing|tech|saas|fintech|ecommerce|e-commerce|agenc|healthcare|real estate|insurance|legal|consulting|software|startup)/i;

/**
 * Detect if a query is a full-pipeline campaign intent
 * (search + enrich + email + push). A campaign keyword alone is enough —
 * if the user hasn't specified a target, we ask them in the preflight questions.
 */
export function isCampaignPrompt(query: string): boolean {
  const lower = query.toLowerCase().trim();
  return CAMPAIGN_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Detect missing info for a campaign prompt. Leads with high-level intent
 * (goal + audience) before tactical filters (size, count, enrichment, emails).
 * Only asks questions the prompt doesn't already answer.
 */
export function detectCampaignMissingInfo(prompt: string): ClarifyingQuestion[] {
  const lower = prompt.toLowerCase();
  const questions: ClarifyingQuestion[] = [];
  const hasTarget = TARGET_PATTERN.test(prompt);

  // ── Phase 1: Intent & Audience (high-level) ──

  // 1. Campaign goal — always ask unless prompt clearly states intent
  const mentionsGoal = /book meeting|generate lead|brand awareness|promote|nurture|re-?engage|upsell|cross-?sell/i.test(lower);
  if (!mentionsGoal) {
    questions.push({
      type: 'select',
      question: 'What do you want to achieve from this campaign?',
      options: ['Book meetings', 'Generate leads', 'Promote content/offer', 'Re-engage cold leads'],
      key: 'campaign_goal',
    });
  }

  // 2. Who are you targeting — ask if the prompt has no target indicators
  if (!hasTarget) {
    questions.push({
      type: 'text',
      question: 'Who are you targeting? (e.g. "SaaS CTOs in London" or "marketing agencies in Bristol")',
      key: 'target_audience',
    });
  }

  // ── Phase 2: Tactical filters (from detectMissingInfo) ──

  // Company vs Contact — skip if audience question already covers it or prompt is clear
  const mentionsCompanies = /compan|organi[sz]ation|business|firm|agenc/i.test(lower);
  const mentionsContacts = /contact|people|person|lead|prospect|decision.?maker|founder|ceo|cto|cfo|cmo|coo|vp\b|director|manager|head of/i.test(lower);
  if (!mentionsCompanies && !mentionsContacts && hasTarget) {
    questions.push({
      type: 'select',
      question: 'Are you looking for companies or contacts?',
      options: ['Companies', 'Contacts (people)', 'Both'],
      key: 'search_type',
    });
  }

  // Company size — ask if not mentioned
  const mentionsSize = /small|medium|large|enterprise|startup|employee|headcount|\d+[\s,-]+\d+\s*(employee|people|staff)/i.test(lower);
  if (!mentionsSize) {
    questions.push({
      type: 'select',
      question: 'What size companies are you targeting?',
      options: ['Small (1-50)', 'Medium (51-500)', 'Large (500+)', 'Any size'],
      key: 'company_size',
    });
  }

  // Result count — ask if no number is mentioned
  const hasNumberWithVerb = /\b(\d+)\b/.test(lower) && /find|get|show|list|search|build/i.test(lower);
  if (!hasNumberWithVerb) {
    questions.push({
      type: 'select',
      question: 'How many results would you like?',
      options: ['10', '25', '50', '100'],
      key: 'result_count',
    });
  }

  // ── Phase 3: Campaign-specific (enrichment & emails) ──

  if (!/enrich/i.test(lower)) {
    questions.push({
      type: 'select',
      question: 'What should we enrich?',
      options: ['Email only', 'Email + Phone', 'Skip enrichment'],
      key: 'enrichment_scope',
    });
  }

  if (!/no emails|just contacts|just push/i.test(lower)) {
    questions.push({
      type: 'select',
      question: 'Generate email sequence?',
      options: ['Yes (3 steps)', 'Yes (5 steps)', 'No, just push contacts'],
      key: 'email_steps',
    });
  }

  return questions;
}

/**
 * Detect missing campaign info for an EXISTING table context.
 * Skips search-related questions (target audience, company size, result count)
 * since contacts already exist in the table. Only asks campaign-specific questions.
 */
export function detectTableCampaignMissingInfo(prompt: string): ClarifyingQuestion[] {
  const SEARCH_KEYS = new Set(['target_audience', 'search_type', 'company_size', 'result_count']);
  return detectCampaignMissingInfo(prompt).filter(q => !SEARCH_KEYS.has(q.key));
}

/**
 * Given a list of questions and ICP defaults, return which question keys
 * are auto-answered by the ICP profile.
 */
export function applyICPDefaults(
  questions: ClarifyingQuestion[],
  icpDefaults: Record<string, string>
): { answeredKeys: string[]; firstUnansweredIndex: number } {
  const answeredKeys = questions
    .filter(q => icpDefaults[q.key])
    .map(q => q.key);
  const firstUnansweredIndex = questions.findIndex(q => !icpDefaults[q.key]);
  return {
    answeredKeys,
    firstUnansweredIndex: firstUnansweredIndex >= 0 ? firstUnansweredIndex : questions.length,
  };
}

/**
 * Generate a human-readable campaign name from a prompt.
 * Format: "{Location} {Industry/Role} {Mon YYYY}"
 */
export function generateCampaignName(prompt: string): string {
  const parts: string[] = [];

  // Extract location: word(s) after "in" or "near"
  const locationMatch = prompt.match(/\b(?:in|near)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/);
  if (locationMatch) {
    parts.push(locationMatch[1]);
  }

  // Extract all industry and role terms, preserving order from the prompt
  const descriptorPattern =
    /\b(marketing|tech|saas|fintech|ecommerce|e-commerce|agencies|agency|healthcare|real estate|insurance|legal|consulting|software|startups?|CTOs?|CFOs?|CEOs?|CMOs?|COOs?|founders?|directors?|managers?|VPs?|head of \w+|decision[\s-]?makers?)\b/gi;
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = descriptorPattern.exec(prompt)) !== null) {
    const val = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    // Skip if location already captured this word
    if (locationMatch && locationMatch[1].includes(val)) continue;
    if (!seen.has(val.toLowerCase())) {
      seen.add(val.toLowerCase());
      parts.push(val);
    }
  }

  // Fallback if nothing was extracted
  if (parts.length === 0) {
    parts.push('Campaign');
  }

  const now = new Date();
  const monthYear = now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  parts.push(monthYear);

  return parts.join(' ');
}
