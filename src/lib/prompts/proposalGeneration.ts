/**
 * Proposal Generation Prompts
 *
 * Multi-step proposal generation workflow:
 * 1. Analyze Focus Areas - Extract key topics from transcripts
 * 2. Generate Goals - Create goals & objectives document
 * 3. Generate SOW - Create statement of work (markdown)
 * 4. Generate Proposal - Create HTML presentation
 * 5. Generate Email - Create email proposal (markdown)
 * 6. Generate Markdown - Create markdown proposal
 *
 * @file supabase/functions/generate-proposal/index.ts
 * @model OpenRouter (various Claude models)
 * @temperature 0.5-0.7
 * @maxTokens 4096-16384
 */

import type { PromptTemplate, PromptVariable } from './index';

// ============================================================================
// 1. ANALYZE FOCUS AREAS
// ============================================================================

export const FOCUS_AREAS_USER_PROMPT = `Analyze the following meeting transcripts and identify 5-10 key focus areas that should be included in a proposal or Statement of Work.

\${contactSection}
\${companySection}

Meeting Transcripts:
\${transcriptsText}

For each focus area, provide:
1. A concise title (5-8 words)
2. A brief description (20-40 words) explaining what this area covers
3. A category (e.g., "Strategy", "Technology", "Operations", "Marketing", "Financial", "Timeline", "Deliverables", "Risk Management")

Focus on:
- Strategic objectives and goals mentioned
- Key challenges or pain points discussed
- Solutions or approaches proposed
- Important deliverables or outcomes
- Timeline or milestone discussions
- Budget or pricing considerations
- Risk factors or concerns raised
- Success metrics or KPIs mentioned

CRITICAL INSTRUCTIONS:
- You MUST return ONLY valid JSON - no explanatory text, no apologies, no "I cannot find..."
- If the transcript lacks clear focus areas, infer reasonable ones from any business discussion
- If the transcript is minimal, create general focus areas like "Project Scope", "Timeline", "Budget"
- NEVER return text explanations - ALWAYS return the JSON structure below
- Start your response with { and end with }

Return ONLY valid JSON (no markdown, no code blocks):
{
  "focus_areas": [
    {
      "id": "focus-1",
      "title": "Example Focus Area Title",
      "description": "Brief description of what this focus area covers and why it's important.",
      "category": "Strategy"
    }
  ]
}`;

export const FOCUS_AREAS_VARIABLES: PromptVariable[] = [
  {
    name: 'contactSection',
    description: 'Client contact name if available',
    type: 'string',
    required: false,
    example: 'Client: John Smith',
    source: 'request',
  },
  {
    name: 'companySection',
    description: 'Company name if available',
    type: 'string',
    required: false,
    example: 'Company: Acme Corp',
    source: 'request',
  },
  {
    name: 'transcriptsText',
    description: 'Combined meeting transcript text',
    type: 'string',
    required: true,
    example: '[Full transcript content...]',
    source: 'meetings',
  },
];

export const FOCUS_AREAS_RESPONSE_SCHEMA = `{
  "type": "object",
  "required": ["focus_areas"],
  "properties": {
    "focus_areas": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "title", "description", "category"],
        "properties": {
          "id": { "type": "string" },
          "title": { "type": "string" },
          "description": { "type": "string" },
          "category": {
            "type": "string",
            "enum": ["Strategy", "Technology", "Operations", "Marketing", "Financial", "Timeline", "Deliverables", "Risk Management"]
          }
        }
      }
    }
  }
}`;

export const focusAreasTemplate: PromptTemplate = {
  id: 'proposal-focus-areas',
  name: 'Analyze Focus Areas',
  description: 'Extracts key focus areas from meeting transcripts for proposal generation.',
  featureKey: 'proposal_focus_areas',
  systemPrompt: '', // No system prompt - uses user prompt only
  userPrompt: FOCUS_AREAS_USER_PROMPT,
  variables: FOCUS_AREAS_VARIABLES,
  responseFormat: 'json',
  responseSchema: FOCUS_AREAS_RESPONSE_SCHEMA,
};

// ============================================================================
// 2. GENERATE GOALS
// ============================================================================

export const GOALS_SYSTEM_PROMPT = `You are an expert business consultant who extracts strategic goals and objectives from sales call transcripts.
Your task is to analyze call transcripts and create a comprehensive Goals & Objectives document.

Use the following example structure as a reference for format and style:
\${goalsTemplate}

Key requirements:
- Extract all strategic objectives mentioned in the calls
- Organize goals by category (Marketing, Operations, Revenue Growth, etc.)
- Include specific metrics and timelines where mentioned
- Maintain professional, clear language
- Structure similar to the example provided`;

export const GOALS_USER_PROMPT = `Analyze the following sales call transcripts and create a comprehensive Goals & Objectives document.

\${contactSection}
\${companySection}

Call Transcripts:
\${transcriptsText}\${focusAreasSection}

Create a Goals & Objectives document following the structure and style of the example provided. Include all strategic objectives, immediate actions, success metrics, timelines, and any other relevant information from the calls.`;

export const GOALS_VARIABLES: PromptVariable[] = [
  {
    name: 'goalsTemplate',
    description: 'Example goals template from proposal_templates table',
    type: 'string',
    required: false,
    example: '# Goals & Objectives\n\n## Strategic Objectives...',
    source: 'proposal_templates',
  },
  {
    name: 'contactSection',
    description: 'Client contact name if available',
    type: 'string',
    required: false,
    example: 'Client: John Smith',
    source: 'request',
  },
  {
    name: 'companySection',
    description: 'Company name if available',
    type: 'string',
    required: false,
    example: 'Company: Acme Corp',
    source: 'request',
  },
  {
    name: 'transcriptsText',
    description: 'Combined meeting transcript text',
    type: 'string',
    required: true,
    example: '[Full transcript content...]',
    source: 'meetings',
  },
  {
    name: 'focusAreasSection',
    description: 'Optional focus areas to emphasize',
    type: 'string',
    required: false,
    example: '\n\nFOCUS AREAS TO EMPHASIZE:\n1. Revenue Growth\n2. Customer Retention',
    source: 'request',
  },
];

export const goalsTemplate: PromptTemplate = {
  id: 'proposal-goals',
  name: 'Generate Goals & Objectives',
  description: 'Creates a comprehensive goals and objectives document from meeting transcripts.',
  featureKey: 'proposal_goals',
  systemPrompt: GOALS_SYSTEM_PROMPT,
  userPrompt: GOALS_USER_PROMPT,
  variables: GOALS_VARIABLES,
  responseFormat: 'markdown',
};

// ============================================================================
// 3. GENERATE SOW (Statement of Work)
// ============================================================================

export const SOW_SYSTEM_PROMPT = `You are an expert proposal writer who creates Statement of Work (SOW) documents in MARKDOWN FORMAT ONLY.

Your task is to transform a Goals & Objectives document into a comprehensive Statement of Work document.

ABSOLUTE REQUIREMENTS - NO EXCEPTIONS:
1. Output format MUST be PURE MARKDOWN (.md) - NO HTML WHATSOEVER
2. Start with markdown headers (# for main title, ## for sections)
3. Use markdown syntax ONLY:
   - # Header, ## Subheader, ### Sub-subheader
   - **bold text** for emphasis
   - - or * for bullet lists
   - 1. 2. 3. for numbered lists
   - [link text](url) for links
   - --- for horizontal rules
4. NEVER use HTML tags like <html>, <head>, <body>, <div>, <span>, <style>, <script>
5. NEVER include CSS styles or JavaScript
6. NEVER use HTML entities or HTML structure
7. The output should be a plain text markdown file that can be opened in any markdown viewer

Example SOW structure (in markdown):
\${sowTemplate}

Key requirements:
- Create a professional Statement of Work document in MARKDOWN format
- Include all standard SOW sections (Introduction, Project Objectives, Proposed Solution, Pricing & Terms, etc.)
- Translate goals into actionable project phases and deliverables
- Maintain the same level of detail and professionalism as the example
- Include realistic timelines and pricing structures based on the goals
- Use ONLY Markdown syntax - NO HTML`;

export const SOW_USER_PROMPT = `Transform the following Goals & Objectives document into a comprehensive Statement of Work.

\${contactSection}
\${companySection}

Goals & Objectives:
\${goals}\${focusAreasSection}\${lengthGuidance}

CRITICAL: Create a Statement of Work document in PURE MARKDOWN FORMAT.

DO NOT:
- Use HTML tags (<html>, <head>, <body>, <div>, etc.)
- Include CSS styles or JavaScript
- Use HTML structure or formatting
- Output anything that looks like HTML

DO:
- Use markdown headers (# ## ###)
- Use markdown formatting (**bold**, *italic*, - lists)
- Output plain markdown text that can be saved as a .md file
- Follow the structure and style of the example provided
- Translate the goals into actionable project phases, deliverables, timelines, and pricing

Output ONLY markdown text starting with a # header.`;

export const SOW_VARIABLES: PromptVariable[] = [
  {
    name: 'sowTemplate',
    description: 'Example SOW template from proposal_templates table',
    type: 'string',
    required: false,
    example: '# Statement of Work\n\n## Introduction...',
    source: 'proposal_templates',
  },
  {
    name: 'contactSection',
    description: 'Client contact name if available',
    type: 'string',
    required: false,
    example: 'Client: John Smith',
    source: 'request',
  },
  {
    name: 'companySection',
    description: 'Company name if available',
    type: 'string',
    required: false,
    example: 'Company: Acme Corp',
    source: 'request',
  },
  {
    name: 'goals',
    description: 'Goals & Objectives document content',
    type: 'string',
    required: true,
    example: '# Goals & Objectives\n\n## Strategic Objectives...',
    source: 'previous_step',
  },
  {
    name: 'focusAreasSection',
    description: 'Optional focus areas to emphasize',
    type: 'string',
    required: false,
    example: '\n\nFOCUS AREAS TO EMPHASIZE:\n1. Revenue Growth',
    source: 'request',
  },
  {
    name: 'lengthGuidance',
    description: 'Document length requirements',
    type: 'string',
    required: false,
    example: '\n\nLENGTH REQUIREMENTS:\nKeep the document concise: under 1000 words.',
    source: 'request',
  },
];

export const sowTemplate: PromptTemplate = {
  id: 'proposal-sow',
  name: 'Generate Statement of Work',
  description: 'Creates a markdown Statement of Work from goals and objectives.',
  featureKey: 'proposal_sow',
  systemPrompt: SOW_SYSTEM_PROMPT,
  userPrompt: SOW_USER_PROMPT,
  variables: SOW_VARIABLES,
  responseFormat: 'markdown',
};

// ============================================================================
// 4. GENERATE HTML PROPOSAL
// ============================================================================

export const HTML_PROPOSAL_SYSTEM_PROMPT = `You are an expert web developer and proposal designer who creates beautiful, interactive HTML proposal presentations.
Your task is to transform a Goals & Objectives document into a modern, professional HTML proposal presentation tailored to the specific needs and context of the client.

CRITICAL INSTRUCTION: You must IMMEDIATELY output the complete HTML document. Do NOT:
- Ask for confirmation or clarification
- Ask "Would you like me to proceed?"
- Provide explanations before the HTML
- Output anything except the HTML document itself
Start your response with <!DOCTYPE html> and output ONLY the complete HTML.

Use the following HTML proposal example as a reference for structure, styling, and interactivity:
\${proposalTemplate}

Use the following design system guidelines for styling:
\${designSystemTemplate}

PROPOSAL STRUCTURE GUIDANCE (Adapt flexibly based on the Goals & Objectives):
Analyze the Goals & Objectives document carefully to determine what sections are relevant. Use this as a flexible guide, not a rigid template:

1.  **Opening Hook**: Start with a compelling insight, opportunity, or challenge relevant to THEIR specific situation (not generic).
2.  **Current State Analysis**: If relevant, show "What's Working" vs. "What's Missing" based on their actual goals. Skip if not applicable.
3.  **Proposed Solution/Methodology**: Present YOUR approach tailored to their specific needs.
4.  **Deliverables/Scope**: List concrete outputs, but ONLY what's relevant to their goals.
5.  **Timeline/Phases**: If timelines are relevant, structure them appropriately. Skip if not applicable.
6.  **Investment/Pricing**: Include if relevant. Format appropriately.
7.  **Why Us/Credibility**: Include if it adds value.
8.  **Next Steps/CTA**: Clear action items tailored to their decision process.

CRITICAL: Do NOT force-fit sections that don't apply.

Key requirements:
- Create a complete, standalone HTML file with embedded CSS and JavaScript
- Use the glassmorphic dark theme design system
- Include smooth animations and transitions
- Make it interactive with navigation dots and keyboard controls
- Structure content into logical slides/sections
- Ensure mobile responsiveness
- Include password protection if needed
- Use Tailwind CSS via CDN for styling
- Follow the design system's color tokens, typography, and component patterns
- Tailor every section to the specific Goals & Objectives provided`;

export const HTML_PROPOSAL_USER_PROMPT = `Transform the following Goals & Objectives document into a beautiful HTML proposal presentation.

\${contactSection}
\${companySection}

Goals & Objectives:
\${goals}\${focusAreasSection}\${lengthGuidance}

CRITICAL REQUIREMENTS:
- OUTPUT ONLY HTML - no questions, no confirmations, no explanations
- Start immediately with <!DOCTYPE html> - do not ask "Would you like me to proceed?"
- Create a COMPLETE, standalone HTML file with ALL tags properly closed
- The HTML must start with <!DOCTYPE html> and end with </html>
- ALL opening tags must have corresponding closing tags
- The HTML must be fully functional and renderable in a browser
- Ensure the file is complete - do not truncate or leave sections incomplete
- Include all CSS styles within <style> tags
- Include all JavaScript within <script> tags
- Use the design system guidelines for consistent styling
- The HTML should be a complete, standalone file that can be opened in a browser

STRUCTURE ADAPTATION:
- Analyze the Goals & Objectives above to determine what type of proposal this is
- Adapt the structure from the example template to fit THIS specific proposal's needs
- Only include sections that are relevant to the Goals & Objectives
- Tailor all content to the specific client, company, and their stated goals
- Do NOT copy generic content - every section should be customized

PRICING / INVESTMENT TABLE:
- If the Goals & Objectives mention pricing, budgets, costs, or investment amounts, include a Pricing or Investment section
- Format pricing as an HTML table with columns: Item/Description, Quantity (if applicable), Unit Rate, Amount
- Include a subtotal row, optional tax row (if mentioned), and a total row
- Use clear number formatting with currency symbols
- If no specific pricing is mentioned, omit the pricing section entirely rather than guessing

BEGIN YOUR RESPONSE WITH <!DOCTYPE html> - NO OTHER TEXT BEFORE IT.`;

export const HTML_PROPOSAL_VARIABLES: PromptVariable[] = [
  {
    name: 'proposalTemplate',
    description: 'Example HTML proposal template from proposal_templates table',
    type: 'string',
    required: false,
    example: '<!DOCTYPE html>...',
    source: 'proposal_templates',
  },
  {
    name: 'designSystemTemplate',
    description: 'Design system guidelines for styling',
    type: 'string',
    required: false,
    example: 'IMPORTANT DESIGN SYSTEM PRINCIPLES:\n- Dark Mode: Deep dark backgrounds...',
    source: 'proposal_templates',
  },
  {
    name: 'contactSection',
    description: 'Client contact name if available',
    type: 'string',
    required: false,
    example: 'Client: John Smith',
    source: 'request',
  },
  {
    name: 'companySection',
    description: 'Company name if available',
    type: 'string',
    required: false,
    example: 'Company: Acme Corp',
    source: 'request',
  },
  {
    name: 'goals',
    description: 'Goals & Objectives document content',
    type: 'string',
    required: true,
    example: '# Goals & Objectives\n\n## Strategic Objectives...',
    source: 'previous_step',
  },
  {
    name: 'focusAreasSection',
    description: 'Optional focus areas to emphasize',
    type: 'string',
    required: false,
    example: '\n\nFOCUS AREAS TO EMPHASIZE:\n1. Revenue Growth',
    source: 'request',
  },
  {
    name: 'lengthGuidance',
    description: 'Document length requirements',
    type: 'string',
    required: false,
    example: '\n\nLENGTH REQUIREMENTS:\nCreate a comprehensive proposal.',
    source: 'request',
  },
];

export const htmlProposalTemplate: PromptTemplate = {
  id: 'proposal-html',
  name: 'Generate HTML Proposal',
  description: 'Creates an interactive HTML proposal presentation from goals and objectives.',
  featureKey: 'proposal_html',
  systemPrompt: HTML_PROPOSAL_SYSTEM_PROMPT,
  userPrompt: HTML_PROPOSAL_USER_PROMPT,
  variables: HTML_PROPOSAL_VARIABLES,
  responseFormat: 'html',
};

// ============================================================================
// 5. GENERATE EMAIL PROPOSAL
// ============================================================================

export const EMAIL_PROPOSAL_SYSTEM_PROMPT = `You are an expert proposal writer who creates professional email proposals in MARKDOWN FORMAT ONLY.

Your task is to transform a Goals & Objectives document into a professional email proposal that can be sent directly to clients.

ABSOLUTE REQUIREMENTS - NO EXCEPTIONS:
1. Output format MUST be PURE MARKDOWN (.md) - NO HTML WHATSOEVER
2. Start with a subject line in the format: **Subject:** [Proposal Title]
3. Use markdown syntax ONLY:
   - **bold text** for emphasis
   - - or * for bullet lists
   - 1. 2. 3. for numbered lists
   - --- for horizontal rules (section separators)
4. NEVER use HTML tags
5. Structure as a professional email with:
   - Subject line
   - Personal greeting
   - Brief overview/introduction
   - Key points/deliverables
   - Pricing/investment (if relevant)
   - Next steps
   - Professional sign-off

Key requirements:
- Create a professional email proposal in MARKDOWN format
- Keep it concise and scannable (use bullet points and short paragraphs)
- Include all relevant information from the goals
- Make it personal and conversational but professional
- Use ONLY Markdown syntax - NO HTML`;

export const EMAIL_PROPOSAL_USER_PROMPT = `Transform the following Goals & Objectives document into a professional email proposal.

\${contactSection}
\${companySection}

Goals & Objectives:
\${goals}\${focusAreasSection}\${lengthGuidance}

CRITICAL: Create an email proposal in PURE MARKDOWN FORMAT.

DO NOT:
- Use HTML tags (<html>, <head>, <body>, <div>, etc.)
- Include CSS styles or JavaScript
- Use HTML structure or formatting
- Output anything that looks like HTML

DO:
- Start with **Subject:** line
- Use markdown formatting (**bold**, *italic*, - lists)
- Output plain markdown text that can be copied into an email
- Translate the goals into a professional, scannable email format
- Keep paragraphs short and use bullet points for lists

Output ONLY markdown text starting with # header and **Subject:** line.`;

export const EMAIL_PROPOSAL_VARIABLES: PromptVariable[] = [
  {
    name: 'contactSection',
    description: 'Client contact name if available',
    type: 'string',
    required: false,
    example: 'Client: John Smith',
    source: 'request',
  },
  {
    name: 'companySection',
    description: 'Company name if available',
    type: 'string',
    required: false,
    example: 'Company: Acme Corp',
    source: 'request',
  },
  {
    name: 'goals',
    description: 'Goals & Objectives document content',
    type: 'string',
    required: true,
    example: '# Goals & Objectives\n\n## Strategic Objectives...',
    source: 'previous_step',
  },
  {
    name: 'focusAreasSection',
    description: 'Optional focus areas to emphasize',
    type: 'string',
    required: false,
    example: '\n\nFOCUS AREAS TO EMPHASIZE:\n1. Revenue Growth',
    source: 'request',
  },
  {
    name: 'lengthGuidance',
    description: 'Document length requirements',
    type: 'string',
    required: false,
    example: '\n\nLENGTH REQUIREMENTS:\nKeep the email concise.',
    source: 'request',
  },
];

export const emailProposalTemplate: PromptTemplate = {
  id: 'proposal-email',
  name: 'Generate Email Proposal',
  description: 'Creates a professional email proposal in markdown format.',
  featureKey: 'proposal_email',
  systemPrompt: EMAIL_PROPOSAL_SYSTEM_PROMPT,
  userPrompt: EMAIL_PROPOSAL_USER_PROMPT,
  variables: EMAIL_PROPOSAL_VARIABLES,
  responseFormat: 'markdown',
};

// ============================================================================
// 6. GENERATE MARKDOWN PROPOSAL
// ============================================================================

export const MARKDOWN_PROPOSAL_SYSTEM_PROMPT = `You are an expert proposal writer who creates professional proposal documents in MARKDOWN FORMAT ONLY.

Your task is to transform a Goals & Objectives document into a clean, simple markdown proposal document.

ABSOLUTE REQUIREMENTS - NO EXCEPTIONS:
1. Output format MUST be PURE MARKDOWN (.md) - NO HTML WHATSOEVER
2. Start with markdown headers (# for main title, ## for sections)
3. Use markdown syntax ONLY:
   - # Header, ## Subheader, ### Sub-subheader
   - **bold text** for emphasis
   - - or * for bullet lists
   - 1. 2. 3. for numbered lists
   - [link text](url) for links
   - --- for horizontal rules
4. NEVER use HTML tags
5. Structure as a clean proposal document with:
   - Title
   - Introduction/Overview
   - Proposed Solution
   - Deliverables/Scope
   - Timeline (if relevant)
   - Pricing/Investment (if relevant)
   - Next Steps

Key requirements:
- Create a professional proposal document in MARKDOWN format
- Keep it simple and easy to read
- Include all relevant information from the goals
- Use ONLY Markdown syntax - NO HTML`;

export const MARKDOWN_PROPOSAL_USER_PROMPT = `Transform the following Goals & Objectives document into a professional markdown proposal document.

\${contactSection}
\${companySection}

Goals & Objectives:
\${goals}\${focusAreasSection}\${lengthGuidance}

CRITICAL: Create a proposal document in PURE MARKDOWN FORMAT.

DO NOT:
- Use HTML tags (<html>, <head>, <body>, <div>, etc.)
- Include CSS styles or JavaScript
- Use HTML structure or formatting
- Output anything that looks like HTML

DO:
- Use markdown headers (# ## ###)
- Use markdown formatting (**bold**, *italic*, - lists)
- Output plain markdown text that can be saved as a .md file
- Translate the goals into a clear, professional proposal format

Output ONLY markdown text starting with a # header.`;

export const MARKDOWN_PROPOSAL_VARIABLES: PromptVariable[] = [
  {
    name: 'contactSection',
    description: 'Client contact name if available',
    type: 'string',
    required: false,
    example: 'Client: John Smith',
    source: 'request',
  },
  {
    name: 'companySection',
    description: 'Company name if available',
    type: 'string',
    required: false,
    example: 'Company: Acme Corp',
    source: 'request',
  },
  {
    name: 'goals',
    description: 'Goals & Objectives document content',
    type: 'string',
    required: true,
    example: '# Goals & Objectives\n\n## Strategic Objectives...',
    source: 'previous_step',
  },
  {
    name: 'focusAreasSection',
    description: 'Optional focus areas to emphasize',
    type: 'string',
    required: false,
    example: '\n\nFOCUS AREAS TO EMPHASIZE:\n1. Revenue Growth',
    source: 'request',
  },
  {
    name: 'lengthGuidance',
    description: 'Document length requirements',
    type: 'string',
    required: false,
    example: '\n\nLENGTH REQUIREMENTS:\nCreate a medium-length document.',
    source: 'request',
  },
];

export const markdownProposalTemplate: PromptTemplate = {
  id: 'proposal-markdown',
  name: 'Generate Markdown Proposal',
  description: 'Creates a clean markdown proposal document from goals and objectives.',
  featureKey: 'proposal_markdown',
  systemPrompt: MARKDOWN_PROPOSAL_SYSTEM_PROMPT,
  userPrompt: MARKDOWN_PROPOSAL_USER_PROMPT,
  variables: MARKDOWN_PROPOSAL_VARIABLES,
  responseFormat: 'markdown',
};

// ============================================================================
// Response Types
// ============================================================================

export interface FocusArea {
  id: string;
  title: string;
  description: string;
  category: string;
}

export interface FocusAreasResponse {
  focus_areas: FocusArea[];
}

export type ProposalLengthTarget = 'short' | 'medium' | 'long';

export interface ProposalGenerationConfig {
  contactName?: string;
  companyName?: string;
  focusAreas?: string[];
  lengthTarget?: ProposalLengthTarget;
  wordLimit?: number;
  pageTarget?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build the contact section for prompts
 */
export function buildContactSection(contactName?: string): string {
  return contactName ? `Client: ${contactName}` : '';
}

/**
 * Build the company section for prompts
 */
export function buildCompanySection(companyName?: string): string {
  return companyName ? `Company: ${companyName}` : '';
}

/**
 * Build the focus areas section for prompts
 */
export function buildFocusAreasSection(focusAreas?: string[]): string {
  if (!focusAreas || focusAreas.length === 0) return '';

  return `\n\nFOCUS AREAS TO EMPHASIZE:\n${focusAreas
    .map((fa, idx) => `${idx + 1}. ${fa}`)
    .join('\n')}\n\nPlease ensure these focus areas are prominently featured.`;
}

/**
 * Build length guidance based on configuration
 */
export function buildLengthGuidance(config: ProposalGenerationConfig): string {
  const { lengthTarget, wordLimit, pageTarget } = config;

  if (lengthTarget === 'short') {
    return '\n\nLENGTH REQUIREMENTS:\nKeep the document concise: under 1000 words, approximately 2 pages.';
  }
  if (lengthTarget === 'long') {
    return '\n\nLENGTH REQUIREMENTS:\nCreate a comprehensive document: over 2500 words, approximately 6+ pages.';
  }
  if (lengthTarget === 'medium') {
    return '\n\nLENGTH REQUIREMENTS:\nCreate a medium-length document: 1000-2500 words, approximately 3-5 pages.';
  }
  if (wordLimit) {
    return `\n\nLENGTH REQUIREMENTS:\nTarget approximately ${wordLimit} words.`;
  }
  if (pageTarget) {
    return `\n\nLENGTH REQUIREMENTS:\nTarget approximately ${pageTarget} pages.`;
  }

  return '';
}

/**
 * Combine multiple transcripts into a single text block
 */
export function combineTranscripts(transcripts: string[]): string {
  return transcripts.join('\n\n---\n\n');
}

/**
 * Parse focus areas response from AI
 */
export function parseFocusAreasResponse(content: string): FocusAreasResponse {
  // Try to extract JSON from the response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in focus areas response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  if (!parsed.focus_areas || !Array.isArray(parsed.focus_areas)) {
    throw new Error('Invalid focus areas response: missing focus_areas array');
  }

  return {
    focus_areas: parsed.focus_areas.map((fa: any, idx: number) => ({
      id: fa.id || `focus-${idx + 1}`,
      title: fa.title || 'Untitled Focus Area',
      description: fa.description || '',
      category: fa.category || 'General',
    })),
  };
}

/**
 * Clean HTML content from markdown (for SOW and email outputs)
 */
export function cleanMarkdownOutput(content: string): string {
  let cleaned = content
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<html[^>]*>/gi, '')
    .replace(/<\/html>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<body[^>]*>/gi, '')
    .replace(/<\/body>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();

  // Remove markdown code block markers
  cleaned = cleaned.replace(/^```\s*markdown\s*\n?/i, '');
  cleaned = cleaned.replace(/^```\s*md\s*\n?/i, '');
  cleaned = cleaned.replace(/^```\s*\n?/g, '');
  cleaned = cleaned.replace(/\n?```\s*$/g, '');

  return cleaned;
}

/**
 * Clean HTML proposal output
 */
export function cleanHtmlOutput(content: string): string {
  let cleaned = content
    .replace(/^'''\s*HTML\s*\n?/gi, '')
    .replace(/^```\s*HTML\s*\n?/gi, '')
    .replace(/^```html\n?/gi, '')
    .replace(/\n?```$/gi, '')
    .replace(/^```\n?/gi, '')
    .replace(/^html\s*/gi, '')
    .trim();

  // Find where actual HTML starts
  const htmlStart = cleaned.search(/<!DOCTYPE|<html/i);
  if (htmlStart > 0) {
    cleaned = cleaned.substring(htmlStart);
  }

  // Ensure it starts with DOCTYPE
  if (!cleaned.startsWith('<!DOCTYPE') && !cleaned.startsWith('<html')) {
    const htmlMatch = cleaned.match(/<!DOCTYPE[\s\S]*<\/html>/i);
    if (htmlMatch) {
      cleaned = htmlMatch[0];
    } else {
      cleaned = '<!DOCTYPE html>\n' + cleaned;
    }
  }

  return cleaned;
}
