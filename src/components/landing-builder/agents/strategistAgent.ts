/**
 * Strategist Agent
 *
 * Phase 0 specialist: enriches the brief from the DiscoveryWizard,
 * asks targeted follow-up questions, and produces strategy + section layout.
 *
 * After the user completes the DiscoveryWizard (5 questions), the Strategist:
 * 1. Analyzes the brief for gaps (missing competitors, vague audience, etc.)
 * 2. Asks 2-3 targeted follow-up questions in the chat
 * 3. Produces the enriched strategy + section layout
 */

import type { AgentRole, LandingResearchData } from '../types';

export const STRATEGIST_ROLE: AgentRole = 'strategist';

/**
 * System instructions injected when the Strategist is active (phase 0).
 * Appended to the BUILDER_CONTINUATION prompt.
 */
export const STRATEGIST_SYSTEM_PROMPT = `You are the STRATEGIST — a conversion-focused landing page strategist.

YOUR ROLE:
- Analyze the client brief for gaps and weaknesses
- Ask 2-3 sharp follow-up questions before producing strategy
- Produce a section-by-section layout with conversion psychology baked in

FOLLOW-UP QUESTION RULES:
- Ask ONLY about gaps you detect — don't repeat what the brief already covers
- Maximum 3 questions, minimum 1
- Ask all questions in a single message (numbered list)
- Questions should be specific, not generic. Good: "Who are the top 3 competitors your prospects compare you to?" Bad: "Tell me more about your market."
- After the user answers, produce the strategy immediately — don't ask more questions

GAP DETECTION — ask follow-ups when:
- No competitors mentioned → "Who are the 2-3 competitors your prospects most often compare you to?"
- Vague audience → "Can you name a specific company or person who is your ideal buyer?"
- Unclear urgency → "What happens if someone does nothing? What's the cost of inaction?"
- No social proof mentioned → "What's your strongest proof point? (case study, metric, logos)"
- Missing pricing signal → "Will this page mention pricing, or should we drive to a call?"

STRATEGY OUTPUT FORMAT:
When you have enough information, deliver the strategy in this format:

**PAGE STRATEGY** (3 sentences: the conversion thesis — who, what problem, what transformation)

**SECTION LAYOUT**
For each section:

**[Section Name]** — [purpose in 5 words]
Layout: [full-width / two-column / centered / asymmetric]
Elements: [headline, subhead, image, form, button, stats, logos, etc.]
CTA: [exact button text] (if applicable)
Conversion lever: [social proof / urgency / authority / specificity]

RESEARCH CONTEXT:
- If MARKET RESEARCH data is provided below, use it instead of asking about competitors, social proof, or pricing
- Only ask follow-up questions for gaps that research did NOT cover
- Reference competitors by name in the strategy when research provides them
- Use real social proof metrics and audience language from research
- If research covers all gaps, skip follow-ups entirely and deliver strategy immediately

RULES:
- Be specific to THIS business — use real product names and outcomes from the brief
- No generic marketing advice
- Keep each section to 4 lines max
- Every section must earn its place (what does it do for conversion?)
- Hero section always first, CTA section always last
- Recommend 5-8 sections based on page complexity`;

/**
 * Detect gaps in a brief and generate follow-up questions.
 * Used by the DiscoveryWizard → Strategist handoff.
 */
export function detectBriefGaps(brief: Record<string, string>, research?: LandingResearchData | null): string[] {
  const gaps: string[] = [];

  // Check for missing or weak fields
  if (!brief.audience || brief.audience.length < 20) {
    gaps.push('audience_vague');
  }

  if (!brief.outcome || brief.outcome.length < 15) {
    gaps.push('outcome_unclear');
  }

  // Check content for missing concepts
  const allText = Object.values(brief).join(' ').toLowerCase();

  if (!allText.includes('competitor') && !allText.includes('alternative') && !allText.includes('vs')) {
    gaps.push('no_competitors');
  }

  if (!allText.includes('proof') && !allText.includes('case study') && !allText.includes('testimonial') && !allText.includes('logo') && !allText.includes('%')) {
    gaps.push('no_social_proof');
  }

  if (!allText.includes('price') && !allText.includes('pricing') && !allText.includes('cost') && !allText.includes('free')) {
    gaps.push('no_pricing_signal');
  }

  // Suppress gaps that research already filled
  if (research?.status === 'complete') {
    if (research.competitors.length > 0) {
      const idx = gaps.indexOf('no_competitors');
      if (idx !== -1) gaps.splice(idx, 1);
    }
    if (research.market_context.social_proof_examples.length > 0 || research.market_context.review_ratings.length > 0) {
      const idx = gaps.indexOf('no_social_proof');
      if (idx !== -1) gaps.splice(idx, 1);
    }
    if (research.market_context.pricing_signals.length > 0) {
      const idx = gaps.indexOf('no_pricing_signal');
      if (idx !== -1) gaps.splice(idx, 1);
    }
  }

  return gaps;
}

/**
 * Build the strategist's follow-up prompt based on detected gaps.
 * Returns the prompt to inject into the conversation.
 */
export function buildStrategistFollowUpPrompt(gaps: string[]): string {
  if (gaps.length === 0) return '';

  const questions: string[] = [];

  if (gaps.includes('no_competitors')) {
    questions.push('Who are the 2-3 competitors or alternatives your prospects most often compare you to?');
  }

  if (gaps.includes('audience_vague')) {
    questions.push('Can you name a specific company or job title that represents your ideal buyer?');
  }

  if (gaps.includes('outcome_unclear')) {
    questions.push('What happens if someone does nothing? What specific cost or pain do they keep experiencing?');
  }

  if (gaps.includes('no_social_proof')) {
    questions.push('What\'s your strongest proof point? (e.g. a case study result, a metric, client logos)');
  }

  if (gaps.includes('no_pricing_signal')) {
    questions.push('Will this page mention pricing, or should we drive visitors to book a call?');
  }

  // Cap at 3 questions
  const selected = questions.slice(0, 3);

  return `Before I create the strategy, I need a few more details to make this page convert:

${selected.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Answer these and I'll deliver the full strategy and section layout.`;
}
