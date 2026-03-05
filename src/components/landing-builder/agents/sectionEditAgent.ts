/**
 * Section Edit Agent
 *
 * Post-assembly specialist: receives the current sections array + user message,
 * returns structured edit operations and a conversational response.
 *
 * Clarify-first philosophy: ambiguous requests get a focused clarifying question
 * with specific options before any edits are made.
 *
 * Reads: current sections array (injected as context)
 * Writes: SectionEditOp[] applied by the orchestrator
 */

import type { LandingSection } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SectionEditOp {
  op: 'update_copy' | 'update_layout' | 'update_style' | 'regenerate_asset' | 'reorder' | 'remove' | 'add';
  section_id?: string;
  after_section_id?: string;
  field?: string;
  value?: string;
  variant?: string;
  style_patch?: Record<string, string>;
  asset_type?: 'image' | 'svg';
  prompt_override?: string;
  section_ids?: string[];
  section_type?: string;
  copy?: { headline: string; subhead: string; body: string; cta: string };
}

export interface SectionEditResponse {
  ops: SectionEditOp[];
  message: string;
  highlight_section_id: string | null;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const SECTION_EDIT_AGENT_SYSTEM_PROMPT = `You are the SECTION EDITOR — a conversion-focused landing page editor that makes precise, surgical changes to an existing page.

YOUR ROLE:
- Receive the current sections array and the user's edit request
- Return structured edit operations that the system will apply
- Explain what you changed (or ask a clarifying question if the request is ambiguous)

CLARIFY-FIRST PHILOSOPHY:
Before making changes, ensure you understand EXACTLY what the user wants. When in doubt, ask — but ask smart.

Ambiguity triggers — ask a clarifying question when:
- "Make it better" → "Which section feels off? I can tighten the copy, try a different layout, or regenerate the visuals — what's bugging you most?"
- "I don't like the middle part" → list the middle sections by name and ask which one
- "The colors feel off" → "Do you mean the whole page palette, or a specific section? And do you have a color direction in mind (warmer, cooler, more contrast)?"
- "That section" → reference the last discussed section from conversation history; if none, ask "Which section are you referring to?"
- "Change the text" → "Which text — the headline, subhead, body copy, or CTA button?"
- Multiple possible interpretations → "Would you prefer X or Y?" (give concrete options, never open-ended)

When NOT to clarify (just do it):
- "Change the hero headline to X" → clear target + clear value, just do it
- "Remove the FAQ section" → unambiguous, just do it
- "Swap sections 2 and 3" → clear reorder, just do it
- "Make the CTA button say 'Get Started Free'" → exact copy provided, just do it
- User answers a previous clarifying question → now act on it, don't re-ask

EDIT RULES:
- Make the minimum change needed — don't rewrite the whole page for a headline tweak
- Preserve the user's approved copy unless they explicitly ask to change it
- When updating copy, maintain the same tone and energy level unless asked to change it
- When changing colors, keep sufficient contrast for accessibility
- When adding a section, place it in a logical conversion flow position

OUTPUT FORMAT:
You MUST respond with a single JSON object (no markdown wrapping, no explanation outside the JSON):

{
  "ops": [
    { "op": "update_copy", "section_id": "...", "field": "headline", "value": "New Headline" },
    { "op": "update_layout", "section_id": "...", "variant": "cards-grid" },
    { "op": "update_style", "section_id": "...", "style_patch": { "bg_color": "#1a1a2e", "text_color": "#ffffff" } },
    { "op": "regenerate_asset", "section_id": "...", "asset_type": "image", "prompt_override": "..." },
    { "op": "reorder", "section_ids": ["id1", "id2", "id3"] },
    { "op": "remove", "section_id": "..." },
    { "op": "add", "after_section_id": "...", "section_type": "features", "copy": { "headline": "...", "subhead": "...", "body": "...", "cta": "..." } }
  ],
  "message": "Your conversational response to the user explaining what you did or asking a clarifying question.",
  "highlight_section_id": "uuid-of-the-section-to-highlight-in-preview"
}

RULES FOR THE JSON:
- "ops" is always an array. If you're asking a clarifying question, "ops" is an empty array [].
- "message" is always a string. Keep it concise and conversational.
- "highlight_section_id" is the id of the most relevant section to scroll to in the preview, or null if not applicable.
- For "update_copy": include only the field you're changing (headline, subhead, body, or cta), not all four.
- For "reorder": section_ids must include ALL section ids in the new order.
- For "add": section_type must be one of: hero, problem, solution, features, social-proof, cta, faq, footer, pricing, comparison, stats, how-it-works.
- For "update_layout": variant must be one of: centered, split-left, split-right, cards-grid, gradient, alternating, logo-banner, metrics-bar, case-study, review-badges.
- For "update_copy": you can also set field to "content_blocks" with value as a JSON array of {type, value, label} objects (type: stat|bullet|quote|step).
- For "update_style": style_patch can also include "asset_strategy" (image|svg|icon|none), "icon_name" (Lucide icon name), and "divider" (wave|diagonal|curve|mesh|none).
- For "regenerate_asset": include a descriptive prompt_override for the new asset.

CONVERSATION STYLE:
- Brief, confident, action-oriented
- When you make changes: "Done — I've [what you did]. The preview should update now."
- When you clarify: give 2-3 concrete options, not open-ended questions
- Never apologize or hedge — be a decisive creative partner`;

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

/**
 * Formats the sections array into a readable context block for injection
 * into the section edit system prompt.
 */
export function buildSectionEditContext(sections: LandingSection[]): string {
  if (sections.length === 0) {
    return 'CURRENT SECTIONS: (none — the page is empty)';
  }

  const lines = sections.map((s, i) => {
    const parts = [
      `  Section ${i + 1}: "${s.type}" (id: ${s.id})`,
      `    Layout: ${s.layout_variant}`,
      `    Headline: ${s.copy.headline}`,
      `    Subhead: ${s.copy.subhead}`,
      `    Body: ${s.copy.body.length > 120 ? s.copy.body.slice(0, 120) + '...' : s.copy.body}`,
      `    CTA: ${s.copy.cta}`,
      `    Style: bg=${s.style.bg_color}, text=${s.style.text_color}, accent=${s.style.accent_color}`,
      `    Asset Strategy: ${s.asset_strategy ?? 'image'}`,
      ...(s.icon_name ? [`    Icon: ${s.icon_name}`] : []),
      ...(s.divider && s.divider !== 'none' ? [`    Divider: ${s.divider}`] : []),
      ...(s.content_blocks?.length ? [`    Content Blocks: ${s.content_blocks.length} items`] : []),
      `    Image: ${s.image_status === 'complete' ? 'yes' : s.image_status}`,
      `    SVG: ${s.svg_status === 'complete' ? 'yes' : s.svg_status}`,
    ];
    return parts.join('\n');
  });

  return `CURRENT SECTIONS (${sections.length} total):\n${lines.join('\n\n')}`;
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

/**
 * Extract a SectionEditResponse from raw AI text.
 * Handles JSON wrapped in markdown code blocks or bare JSON.
 */
export function parseSectionEditResponse(rawText: string): SectionEditResponse {
  const fallback: SectionEditResponse = {
    ops: [],
    message: rawText,
    highlight_section_id: null,
  };

  // Try to extract JSON from markdown code blocks first
  const codeBlockMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : rawText.trim();

  try {
    const parsed = JSON.parse(jsonStr);

    if (!parsed || typeof parsed !== 'object') return fallback;

    return {
      ops: Array.isArray(parsed.ops) ? parsed.ops : [],
      message: typeof parsed.message === 'string' ? parsed.message : rawText,
      highlight_section_id: typeof parsed.highlight_section_id === 'string' ? parsed.highlight_section_id : null,
    };
  } catch {
    // If JSON parsing fails, try to find a JSON object in the text
    const jsonMatch = rawText.match(/\{[\s\S]*"ops"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          ops: Array.isArray(parsed.ops) ? parsed.ops : [],
          message: typeof parsed.message === 'string' ? parsed.message : rawText,
          highlight_section_id: typeof parsed.highlight_section_id === 'string' ? parsed.highlight_section_id : null,
        };
      } catch {
        return fallback;
      }
    }

    return fallback;
  }
}
