import type { ButtonConfig } from '@/lib/services/opsTableService';

// ── Interfaces ──────────────────────────────────────────────────

export interface PipelineColumnDef {
  key: string;
  label: string;
  column_type: 'text' | 'date' | 'action' | 'formula';
  position: number;
  width?: number;
  is_source?: boolean;
  is_visible?: boolean;
  action_config?: ButtonConfig;
  formula_expression?: string;
}

export interface PipelineStepDef {
  title: string;
  description: string;
  icon: string;
  color: string;
  action_column_key: string;
}

export interface PipelineDataSourceConfig {
  type: 'meetings' | 'contacts' | 'deals' | 'synthetic';
  table?: string;
  filters?: Record<string, unknown>;
  column_mapping: Record<string, string>;
  limit?: number;
  synthetic_rows?: Record<string, string>[];
}

import type { FormattingRule } from '@/lib/utils/conditionalFormatting';

export interface PipelineTemplate {
  key: string;
  name: string;
  description: string;
  category: 'outreach' | 'analysis' | 'follow-up';
  icon: string;
  steps: PipelineStepDef[];
  columns: PipelineColumnDef[];
  formatting_rules?: FormattingRule[];
  dataSource: PipelineDataSourceConfig;
}

// ── Re-engagement Pipeline ──────────────────────────────────────

const REENGAGEMENT_PROMPT_1_SYSTEM = `You are an AI sales analyst. Analyse this meeting transcript and extract re-engagement intelligence.

Return ONLY a JSON object with these fields:
- qualified (string: "true" or "false") — was this a qualified prospect?
- months_ago (string) — approx how many months since the meeting
- specific_pain (string) — their main pain point
- budget_signal (string) — any budget/pricing discussion
- interest_areas (string) — what they were interested in
- company_context (string) — key company info mentioned
- suggested_tier (string: "high", "medium", "low") — re-engagement priority
- personalisation_hook (string) — something personal to reference
- use60_angle (string) — how 60 could help them specifically
- tone_notes (string) — recommended email tone`;

const REENGAGEMENT_PROMPT_1_USER = `Meeting with {{first_name}} {{last_name}} from {{company}} on {{meeting_date}}.

Transcript:
{{transcript_text}}`;

const REENGAGEMENT_PROMPT_2_SYSTEM = `You are an AI copywriter. Using this meeting analysis, generate email merge variables for a re-engagement email.

Return ONLY a JSON object with:
- time_ref (string) — natural time reference e.g. "back in January"
- pain_ref (string) — reference to their pain point
- pain_short (string) — 3-5 word pain summary
- hook_line (string) — opening hook line
- use60_intro (string) — one sentence about how 60 helps
- pain_reframe (string) — reframe their pain as an opportunity
- capability_match (string) — match their needs to capabilities`;

const REENGAGEMENT_PROMPT_2_USER = `Analysis for {{first_name}} {{last_name}} ({{company}}):
{{transcript_analysis}}`;

const REENGAGEMENT_PROMPT_3_SYSTEM = `You are an AI email writer. Write a short, warm re-engagement email. Plain text only. Under 150 words. Sound human, not salesy. Reference specific details from the meeting.`;

const REENGAGEMENT_PROMPT_3_USER = `Write a re-engagement email to {{first_name}} at {{company}}.

Variables:
- Hook line: {{hook_line}}
- Time reference: {{time_ref}}
- Pain reference: {{pain_ref}}
- Pain reframe: {{pain_reframe}}
- 60 intro: {{use60_intro}}
- Capability match: {{capability_match}}`;

const REENGAGEMENT_TEMPLATE: PipelineTemplate = {
  key: 'reengagement',
  name: 'Re-engagement Pipeline',
  description: 'Analyse old meeting transcripts, score re-engagement potential, and draft personalised outreach emails.',
  category: 'outreach',
  icon: 'RotateCcw',
  steps: [
    {
      title: 'Analyse Transcript',
      description: 'AI reads the meeting transcript and extracts pain points, budget signals, and re-engagement potential.',
      icon: 'Brain',
      color: 'violet',
      action_column_key: 'analyse_btn',
    },
    {
      title: 'Personalise',
      description: 'Generates email merge variables — hook lines, pain references, and capability matches.',
      icon: 'Sparkles',
      color: 'emerald',
      action_column_key: 'personalise_btn',
    },
    {
      title: 'Review',
      description: 'AI quality gate — reviews qualification and variable quality, auto-fixes wording issues.',
      icon: 'ShieldCheck',
      color: 'amber',
      action_column_key: 'review_btn',
    },
    {
      title: 'Write Email',
      description: 'Drafts a warm, human re-engagement email using the personalised variables.',
      icon: 'Mail',
      color: 'amber',
      action_column_key: 'write_email_btn',
    },
  ],
  columns: [
    { key: 'first_name', label: 'First Name', column_type: 'text', position: 0, is_source: true },
    { key: 'last_name', label: 'Last Name', column_type: 'text', position: 1, is_source: true },
    { key: 'email', label: 'Email', column_type: 'text', position: 2, is_source: true },
    { key: 'company', label: 'Company', column_type: 'text', position: 3, is_source: true },
    { key: 'meeting_date', label: 'Meeting Date', column_type: 'date', position: 4, is_source: true },
    { key: 'rep_name', label: 'Rep', column_type: 'text', position: 5, is_source: true },
    { key: 'transcript_text', label: 'Transcript', column_type: 'text', position: 6, width: 300, is_source: true },
    {
      key: 'analyse_btn', label: 'Analyse', column_type: 'action', position: 7,
      action_config: {
        label: 'Analyse Transcript',
        color: '#8b5cf6',
        actions: [{
          type: 'run_prompt',
          config: {
            system_prompt: REENGAGEMENT_PROMPT_1_SYSTEM,
            user_message_template: REENGAGEMENT_PROMPT_1_USER,
            model: 'claude-sonnet-4-5-20250929',
            provider: 'anthropic',
            temperature: 0.3,
            max_tokens: 2048,
            output_column_key: 'transcript_analysis',
          },
        }],
      },
    },
    { key: 'transcript_analysis', label: 'Analysis (JSON)', column_type: 'text', position: 8 },
    { key: 'qualified', label: 'Qualified', column_type: 'formula', position: 9, formula_expression: 'JSON_GET(@transcript_analysis, "qualified")', is_visible: false },
    { key: 'date_calculation', label: 'Date Calc', column_type: 'formula', position: 10, formula_expression: 'JSON_GET(@transcript_analysis, "date_calculation")', is_visible: false },
    { key: 'months_ago', label: 'Months Ago', column_type: 'formula', position: 11, formula_expression: 'JSON_GET(@transcript_analysis, "months_ago")', is_visible: false },
    { key: 'specific_pain', label: 'Pain Point', column_type: 'formula', position: 12, formula_expression: 'JSON_GET(@transcript_analysis, "specific_pain")', is_visible: false },
    { key: 'blocker_signal', label: 'Blocker Signal', column_type: 'formula', position: 13, formula_expression: 'JSON_GET(@transcript_analysis, "blocker_signal")', is_visible: false },
    { key: 'blocker_type', label: 'Blocker Type', column_type: 'formula', position: 14, formula_expression: 'JSON_GET(@transcript_analysis, "blocker_type")', is_visible: false },
    { key: 'interest_areas', label: 'Interest Areas', column_type: 'formula', position: 15, formula_expression: 'JSON_GET(@transcript_analysis, "interest_areas")', is_visible: false },
    { key: 'company_context', label: 'Company Context', column_type: 'formula', position: 16, formula_expression: 'JSON_GET(@transcript_analysis, "company_context")', is_visible: false },
    { key: 'suggested_tier', label: 'Tier', column_type: 'formula', position: 17, formula_expression: 'JSON_GET(@transcript_analysis, "suggested_tier")', is_visible: false },
    { key: 'personalisation_hook', label: 'Hook', column_type: 'formula', position: 18, formula_expression: 'JSON_GET(@transcript_analysis, "personalisation_hook")', is_visible: false },
    { key: 'use60_angle', label: 'use60 Angle', column_type: 'formula', position: 19, formula_expression: 'JSON_GET(@transcript_analysis, "use60_angle")', is_visible: false },
    { key: 'tone_notes', label: 'Tone Notes', column_type: 'formula', position: 20, formula_expression: 'JSON_GET(@transcript_analysis, "tone_notes")', is_visible: false },
    {
      key: 'personalise_btn', label: 'Personalise', column_type: 'action', position: 21,
      action_config: {
        label: 'Personalise',
        color: '#10b981',
        actions: [{
          type: 'run_prompt',
          config: {
            system_prompt: REENGAGEMENT_PROMPT_2_SYSTEM,
            user_message_template: REENGAGEMENT_PROMPT_2_USER,
            model: 'claude-sonnet-4-5-20250929',
            provider: 'anthropic',
            temperature: 0.3,
            max_tokens: 2048,
            output_column_key: 'email_variables',
          },
        }],
        condition: { column_key: 'qualified', operator: 'equals', value: 'true' },
      },
    },
    { key: 'email_variables', label: 'Email Vars (JSON)', column_type: 'text', position: 22 },
    { key: 'hook_line', label: 'Hook Line', column_type: 'formula', position: 23, formula_expression: 'JSON_GET(@email_variables, "hook_line")', is_visible: false },
    { key: 'pain_ref', label: 'Pain Ref', column_type: 'formula', position: 24, formula_expression: 'JSON_GET(@email_variables, "pain_ref")', is_visible: false },
    { key: 'pain_short', label: 'Pain Short', column_type: 'formula', position: 25, formula_expression: 'JSON_GET(@email_variables, "pain_short")', is_visible: false },
    { key: 'time_ref', label: 'Time Ref', column_type: 'formula', position: 26, formula_expression: 'JSON_GET(@email_variables, "time_ref")', is_visible: false },
    { key: 'blocker_ref', label: 'Blocker Ref', column_type: 'formula', position: 27, formula_expression: 'JSON_GET(@email_variables, "blocker_ref")', is_visible: false },
    { key: 'curiosity_line', label: 'Curiosity Line', column_type: 'formula', position: 28, formula_expression: 'JSON_GET(@email_variables, "curiosity_line")', is_visible: false },
    { key: 'use60_intro', label: '60 Intro', column_type: 'formula', position: 29, formula_expression: 'JSON_GET(@email_variables, "use60_intro")', is_visible: false },
    { key: 'use60_bridge', label: '60 Bridge', column_type: 'formula', position: 30, formula_expression: 'JSON_GET(@email_variables, "use60_bridge")', is_visible: false },
    { key: 'pain_reframe', label: 'Pain Reframe', column_type: 'formula', position: 31, formula_expression: 'JSON_GET(@email_variables, "pain_reframe")', is_visible: false },
    // ── Review step columns ──
    {
      key: 'review_btn', label: 'Review', column_type: 'action', position: 32,
      action_config: {
        label: 'Review Variables',
        color: '#f59e0b',
        icon: 'ShieldCheck',
        actions: [
          // Action 1: AI reviews qualification + variable quality
          {
            type: 'run_prompt',
            config: {
              system_prompt: REENGAGEMENT_REVIEW_SYSTEM,
              user_message_template: REENGAGEMENT_REVIEW_USER,
              model: 'claude-sonnet-4-5-20250929',
              provider: 'anthropic',
              temperature: 0.2,
              max_tokens: 1024,
              output_column_key: 'review_output',
            },
          },
          // Action 2: If wording_fix_needed, auto-fix variables (reads review_output from DB)
          {
            type: 'run_prompt',
            config: {
              system_prompt: REENGAGEMENT_FIX_VARIABLES_SYSTEM,
              user_message_template: REENGAGEMENT_FIX_VARIABLES_USER,
              model: 'claude-sonnet-4-5-20250929',
              provider: 'anthropic',
              temperature: 0.3,
              max_tokens: 1024,
              output_column_key: 'email_variables',
            },
          },
          // Action 3: Re-review after fix — makes final approved/needs_review decision
          {
            type: 'run_prompt',
            config: {
              system_prompt: REENGAGEMENT_RE_REVIEW_SYSTEM,
              user_message_template: REENGAGEMENT_RE_REVIEW_USER,
              model: 'claude-sonnet-4-5-20250929',
              provider: 'anthropic',
              temperature: 0.2,
              max_tokens: 512,
              output_column_key: 'review_output',
            },
          },
        ],
        condition: { column_key: 'email_variables', operator: 'is_not_empty' },
      },
    },
    { key: 'review_output', label: 'Review (JSON)', column_type: 'text', position: 33 },
    { key: 'review_status', label: 'Review Status', column_type: 'formula', position: 34, formula_expression: 'JSON_GET(@review_output, "review_status")' },
    { key: 'review_notes', label: 'Review Notes', column_type: 'formula', position: 35, formula_expression: 'JSON_GET(@review_output, "review_notes")' },
    // ── Write Email step ──
    {
      key: 'write_email_btn', label: 'Write Email', column_type: 'action', position: 36,
      action_config: {
        label: 'Write Email',
        color: '#f59e0b',
        actions: [{
          type: 'run_prompt',
          config: {
            system_prompt: REENGAGEMENT_PROMPT_3_SYSTEM,
            user_message_template: REENGAGEMENT_PROMPT_3_USER,
            model: 'claude-sonnet-4-5-20250929',
            provider: 'anthropic',
            temperature: 0.7,
            max_tokens: 1024,
            output_column_key: 'email_draft',
          },
        }],
        condition: { column_key: 'review_status', operator: 'equals', value: 'approved' },
      },
    },
    { key: 'email_draft', label: 'Email Draft', column_type: 'text', position: 37 },
  ],
  // ── Conditional formatting rules ──
  // Order matters: first matching row-scoped rule wins.
  // Uses equals (not not_equals) so empty/null fields don't trigger colours.
  formatting_rules: [
    {
      id: 'review-approved',
      column_key: 'review_status',
      operator: 'equals',
      value: 'approved',
      style: { backgroundColor: 'rgba(34,197,94,0.15)', textColor: '#4ade80' },
      scope: 'row',
    },
    {
      id: 'review-needs-review',
      column_key: 'review_status',
      operator: 'equals',
      value: 'needs_review',
      style: { backgroundColor: 'rgba(234,179,8,0.15)', textColor: '#facc15' },
      scope: 'row',
    },
    {
      id: 'review-not-qualified',
      column_key: 'review_status',
      operator: 'equals',
      value: 'not_qualified',
      style: { backgroundColor: 'rgba(239,68,68,0.15)', textColor: '#f87171' },
      scope: 'row',
    },
    {
      id: 'analyse-not-qualified',
      column_key: 'qualified',
      operator: 'equals',
      value: 'false',
      style: { backgroundColor: 'rgba(239,68,68,0.15)', textColor: '#f87171' },
      scope: 'row',
    },
  ],
  dataSource: {
    type: 'meetings',
    column_mapping: {
      first_name: 'contact_first_name',
      last_name: 'contact_last_name',
      email: 'contact_email',
      company: 'contact_company',
      meeting_date: 'meeting_date',
      rep_name: 'rep_name',
      transcript_text: 'transcript_text',
    },
    limit: 500,
    synthetic_rows: [
      { first_name: 'Sarah', last_name: 'Chen', company: 'TechFlow Inc', meeting_date: '2025-11-15', rep_name: 'Andrew', transcript_text: 'Rep: Thanks for taking the time today Sarah. So tell me about what\'s happening at TechFlow.\nSarah: Sure, so we\'re a 50-person SaaS company and honestly our sales process is a mess. We have leads coming in from the website, LinkedIn, events — but nobody follows up consistently.\nRep: What happens after a lead comes in?\nSarah: It sits in HubSpot until someone remembers to check. Could be days. Our AEs are good on calls but terrible at admin. We tried hiring an SDR but they quit after 3 months.\nRep: What\'s the revenue impact?\nSarah: We estimated we\'re losing 30-40% of inbound leads to slow follow-up. At our ACV of $24k, that\'s significant. Our CEO is frustrated.\nRep: Have you looked at automation tools?\nSarah: We tried Outreach but it felt too enterprise for us. And the reps hated it. We need something that just works without a lot of setup.' },
      { first_name: 'Marcus', last_name: 'Rivera', company: 'GrowthPath Advisory', meeting_date: '2025-10-22', rep_name: 'Andrew', transcript_text: 'Rep: Marcus, great to connect. What prompted you to take this call?\nMarcus: We\'re a boutique consulting firm, 12 people. I handle all the business development myself and I\'m drowning. Between client work and trying to grow the pipeline, something always drops.\nRep: What does your current sales process look like?\nMarcus: Honestly? It\'s my inbox and my memory. I meet someone at an event, exchange cards, maybe send a follow-up if I remember. Half the time I don\'t. I know I need a CRM but every time I try one I stop using it within a week.\nRep: What would success look like for you?\nMarcus: If someone could just handle the follow-ups and keep deals moving while I focus on delivery. I don\'t need complex pipelines — I need consistency. Budget isn\'t really an issue if it actually works, probably $500-1000/mo range.' },
      { first_name: 'Priya', last_name: 'Patel', company: 'ScaleUp Ventures', meeting_date: '2025-12-03', rep_name: 'Andrew', transcript_text: 'Rep: Priya, thanks for the intro from James. Tell me about ScaleUp.\nPriya: We\'re a VC fund, $50M AUM. I lead deal sourcing. The challenge is we need to track hundreds of founders and companies across our pipeline but our current setup is spreadsheets and Notion.\nRep: What breaks first?\nPriya: Follow-through. A founder pitches, we say we\'ll circle back in 6 months after they hit certain milestones, and then nobody remembers. We\'ve missed 3 deals this year because a competitor followed up when we didn\'t.\nRep: That\'s real money in VC.\nPriya: Exactly. Each missed deal could be a 10x return. We need something that keeps relationships warm automatically. Not spam — genuine, contextual touchpoints. We looked at Affinity but it\'s $30k/year and still requires manual work.' },
    ],
  },
};

// ── Lead Scoring Pipeline ───────────────────────────────────────

const LEAD_SCORING_PROMPT_SYSTEM = `You are an AI lead scoring analyst. Evaluate this contact and score their fit as a potential customer.

Return ONLY a JSON object with:
- score (number 0-100) — overall lead score
- category (string: "hot", "warm", "cold") — lead temperature
- reasoning (string) — 2-3 sentence explanation
- icp_match (string: "strong", "partial", "weak") — ideal customer profile match
- buying_signals (string) — any signals of purchase intent
- recommended_approach (string) — suggested outreach strategy`;

const LEAD_SCORING_PROMPT_USER = `Evaluate this lead:
Name: {{first_name}} {{last_name}}
Company: {{company}}
Title: {{title}}
Industry: {{industry}}
Company Size: {{company_size}}`;

const LEAD_OUTREACH_PROMPT_SYSTEM = `You are an AI sales strategist. Based on this lead score analysis, generate a personalised outreach angle.

Return ONLY a JSON object with:
- angle (string) — the outreach angle in one sentence
- value_prop (string) — specific value proposition for this lead
- opener (string) — suggested email opening line
- cta (string) — suggested call-to-action`;

const LEAD_OUTREACH_PROMPT_USER = `Lead: {{first_name}} {{last_name}}, {{title}} at {{company}}
Industry: {{industry}}

Score Analysis:
{{score_analysis}}`;

const LEAD_MESSAGE_PROMPT_SYSTEM = `You are an AI email writer. Write a short, personalised cold outreach email. Plain text only. Under 120 words. Be specific to their industry and role. No generic fluff.`;

const LEAD_MESSAGE_PROMPT_USER = `Write an outreach email to {{first_name}} ({{title}}) at {{company}}.

Outreach angle: {{outreach_angle}}
Opening line: {{opener}}
Value proposition: {{value_prop}}
CTA: {{cta}}`;

const LEAD_SCORING_TEMPLATE: PipelineTemplate = {
  key: 'lead_scoring',
  name: 'Lead Scoring Pipeline',
  description: 'Score leads by ICP fit, generate personalised outreach angles, and draft opening messages.',
  category: 'analysis',
  icon: 'Target',
  steps: [
    {
      title: 'Score & Classify',
      description: 'AI evaluates each lead against your ICP and assigns a score, category, and recommended approach.',
      icon: 'BarChart3',
      color: 'violet',
      action_column_key: 'score_btn',
    },
    {
      title: 'Outreach Angle',
      description: 'Generates a personalised outreach strategy based on the lead score. Only runs for leads scoring 60+.',
      icon: 'Compass',
      color: 'emerald',
      action_column_key: 'outreach_btn',
    },
    {
      title: 'Draft Message',
      description: 'Writes a short, personalised opening email using the outreach angle.',
      icon: 'PenLine',
      color: 'amber',
      action_column_key: 'message_btn',
    },
  ],
  columns: [
    { key: 'first_name', label: 'First Name', column_type: 'text', position: 0, is_source: true },
    { key: 'last_name', label: 'Last Name', column_type: 'text', position: 1, is_source: true },
    { key: 'company', label: 'Company', column_type: 'text', position: 2, is_source: true },
    { key: 'title', label: 'Title', column_type: 'text', position: 3, is_source: true },
    { key: 'industry', label: 'Industry', column_type: 'text', position: 4, is_source: true },
    { key: 'company_size', label: 'Company Size', column_type: 'text', position: 5, is_source: true },
    {
      key: 'score_btn', label: 'Score', column_type: 'action', position: 6,
      action_config: {
        label: 'Score Lead',
        color: '#8b5cf6',
        actions: [{
          type: 'run_prompt',
          config: {
            system_prompt: LEAD_SCORING_PROMPT_SYSTEM,
            user_message_template: LEAD_SCORING_PROMPT_USER,
            model: 'claude-sonnet-4-5-20250929',
            provider: 'anthropic',
            temperature: 0.3,
            max_tokens: 1024,
            output_column_key: 'score_analysis',
          },
        }],
      },
    },
    { key: 'score_analysis', label: 'Score Analysis (JSON)', column_type: 'text', position: 7 },
    { key: 'score', label: 'Score', column_type: 'formula', position: 8, formula_expression: 'JSON_GET(@score_analysis, "score")' },
    { key: 'category', label: 'Category', column_type: 'formula', position: 9, formula_expression: 'JSON_GET(@score_analysis, "category")' },
    { key: 'icp_match', label: 'ICP Match', column_type: 'formula', position: 10, formula_expression: 'JSON_GET(@score_analysis, "icp_match")' },
    { key: 'reasoning', label: 'Reasoning', column_type: 'formula', position: 11, formula_expression: 'JSON_GET(@score_analysis, "reasoning")' },
    {
      key: 'outreach_btn', label: 'Outreach', column_type: 'action', position: 12,
      action_config: {
        label: 'Generate Angle',
        color: '#10b981',
        actions: [{
          type: 'run_prompt',
          config: {
            system_prompt: LEAD_OUTREACH_PROMPT_SYSTEM,
            user_message_template: LEAD_OUTREACH_PROMPT_USER,
            model: 'claude-sonnet-4-5-20250929',
            provider: 'anthropic',
            temperature: 0.5,
            max_tokens: 1024,
            output_column_key: 'outreach_angle',
          },
        }],
        condition: { column_key: 'score', operator: 'is_not_empty' },
      },
    },
    { key: 'outreach_angle', label: 'Outreach Angle (JSON)', column_type: 'text', position: 13 },
    { key: 'angle', label: 'Angle', column_type: 'formula', position: 14, formula_expression: 'JSON_GET(@outreach_angle, "angle")' },
    { key: 'opener', label: 'Opener', column_type: 'formula', position: 15, formula_expression: 'JSON_GET(@outreach_angle, "opener")' },
    { key: 'value_prop', label: 'Value Prop', column_type: 'formula', position: 16, formula_expression: 'JSON_GET(@outreach_angle, "value_prop")' },
    { key: 'cta', label: 'CTA', column_type: 'formula', position: 17, formula_expression: 'JSON_GET(@outreach_angle, "cta")' },
    {
      key: 'message_btn', label: 'Draft', column_type: 'action', position: 18,
      action_config: {
        label: 'Draft Message',
        color: '#f59e0b',
        actions: [{
          type: 'run_prompt',
          config: {
            system_prompt: LEAD_MESSAGE_PROMPT_SYSTEM,
            user_message_template: LEAD_MESSAGE_PROMPT_USER,
            model: 'claude-sonnet-4-5-20250929',
            provider: 'anthropic',
            temperature: 0.7,
            max_tokens: 1024,
            output_column_key: 'draft_message',
          },
        }],
        condition: { column_key: 'outreach_angle', operator: 'is_not_empty' },
      },
    },
    { key: 'draft_message', label: 'Draft Message', column_type: 'text', position: 19 },
  ],
  dataSource: {
    type: 'contacts',
    column_mapping: {
      first_name: 'first_name',
      last_name: 'last_name',
      company: 'company_name',
      title: 'title',
      industry: 'industry',
      company_size: 'company_size',
    },
    limit: 10,
    synthetic_rows: [
      { first_name: 'Alex', last_name: 'Morgan', company: 'CloudScale Solutions', title: 'VP of Sales', industry: 'SaaS', company_size: '50-200' },
      { first_name: 'Jordan', last_name: 'Kim', company: 'DataDriven Analytics', title: 'Head of Growth', industry: 'Data Analytics', company_size: '10-50' },
      { first_name: 'Taylor', last_name: 'Brooks', company: 'Meridian Consulting Group', title: 'Managing Director', industry: 'Management Consulting', company_size: '20-100' },
      { first_name: 'Casey', last_name: 'Nguyen', company: 'SwiftShip Logistics', title: 'COO', industry: 'Logistics & Supply Chain', company_size: '200-500' },
      { first_name: 'Riley', last_name: 'Okafor', company: 'BrightPath Education', title: 'CEO', industry: 'EdTech', company_size: '5-20' },
    ],
  },
};

// ── Post-Meeting Follow-up Pipeline ─────────────────────────────

const MEETING_SUMMARY_PROMPT_SYSTEM = `You are an AI meeting analyst. Summarise this meeting concisely.

Return ONLY a JSON object with:
- summary (string) — 3-4 sentence meeting summary
- outcome (string: "positive", "neutral", "negative") — meeting sentiment
- key_topics (string) — comma-separated main topics discussed
- next_steps_discussed (string) — what was agreed for next steps
- deal_stage (string) — where this deal is (discovery, demo, proposal, negotiation, closed)
- risk_flags (string) — any concerns or blockers mentioned`;

const MEETING_SUMMARY_PROMPT_USER = `Meeting with {{first_name}} {{last_name}} from {{company}} on {{meeting_date}}.

Transcript:
{{transcript_text}}`;

const ACTION_ITEMS_PROMPT_SYSTEM = `You are an AI action item extractor. Extract all commitments and follow-up actions from this meeting.

Return ONLY a JSON object with:
- our_actions (string) — bullet list of actions our team committed to
- their_actions (string) — bullet list of actions the prospect committed to
- deadlines (string) — any deadlines or timeframes mentioned
- priority_action (string) — the single most important action to take first
- follow_up_date (string) — recommended follow-up date (YYYY-MM-DD format)`;

const ACTION_ITEMS_PROMPT_USER = `Meeting with {{first_name}} at {{company}}.

Meeting summary:
{{meeting_summary}}

Full transcript:
{{transcript_text}}`;

const FOLLOWUP_EMAIL_PROMPT_SYSTEM = `You are an AI email writer. Write a professional follow-up email after a sales meeting. Plain text only. Under 200 words. Reference specific discussion points. Include action items and next steps. Be warm but professional.`;

const FOLLOWUP_EMAIL_PROMPT_USER = `Write a follow-up email to {{first_name}} at {{company}} after our meeting on {{meeting_date}}.

Meeting summary: {{summary}}
Key topics: {{key_topics}}
Our action items: {{our_actions}}
Their action items: {{their_actions}}
Priority action: {{priority_action}}
Recommended follow-up: {{follow_up_date}}`;

const MEETING_FOLLOWUP_TEMPLATE: PipelineTemplate = {
  key: 'meeting_followup',
  name: 'Post-Meeting Follow-up',
  description: 'Summarise meetings, extract action items and deadlines, then draft professional follow-up emails.',
  category: 'follow-up',
  icon: 'CalendarCheck',
  steps: [
    {
      title: 'Summarise Meeting',
      description: 'AI reads the transcript and produces a structured summary with outcome, topics, and risk flags.',
      icon: 'FileText',
      color: 'violet',
      action_column_key: 'summarise_btn',
    },
    {
      title: 'Extract Actions',
      description: 'Pulls out all commitments, deadlines, and the single most important next step.',
      icon: 'ListChecks',
      color: 'emerald',
      action_column_key: 'actions_btn',
    },
    {
      title: 'Draft Follow-up',
      description: 'Writes a professional follow-up email with meeting highlights and action items.',
      icon: 'Send',
      color: 'amber',
      action_column_key: 'followup_btn',
    },
  ],
  columns: [
    { key: 'first_name', label: 'First Name', column_type: 'text', position: 0, is_source: true },
    { key: 'last_name', label: 'Last Name', column_type: 'text', position: 1, is_source: true },
    { key: 'company', label: 'Company', column_type: 'text', position: 2, is_source: true },
    { key: 'meeting_date', label: 'Meeting Date', column_type: 'date', position: 3, is_source: true },
    { key: 'transcript_text', label: 'Transcript', column_type: 'text', position: 4, width: 300, is_source: true },
    {
      key: 'summarise_btn', label: 'Summarise', column_type: 'action', position: 5,
      action_config: {
        label: 'Summarise Meeting',
        color: '#8b5cf6',
        actions: [{
          type: 'run_prompt',
          config: {
            system_prompt: MEETING_SUMMARY_PROMPT_SYSTEM,
            user_message_template: MEETING_SUMMARY_PROMPT_USER,
            model: 'claude-sonnet-4-5-20250929',
            provider: 'anthropic',
            temperature: 0.3,
            max_tokens: 1024,
            output_column_key: 'meeting_summary',
          },
        }],
      },
    },
    { key: 'meeting_summary', label: 'Summary (JSON)', column_type: 'text', position: 6 },
    { key: 'summary', label: 'Summary', column_type: 'formula', position: 7, formula_expression: 'JSON_GET(@meeting_summary, "summary")' },
    { key: 'outcome', label: 'Outcome', column_type: 'formula', position: 8, formula_expression: 'JSON_GET(@meeting_summary, "outcome")' },
    { key: 'key_topics', label: 'Key Topics', column_type: 'formula', position: 9, formula_expression: 'JSON_GET(@meeting_summary, "key_topics")' },
    { key: 'deal_stage', label: 'Deal Stage', column_type: 'formula', position: 10, formula_expression: 'JSON_GET(@meeting_summary, "deal_stage")' },
    {
      key: 'actions_btn', label: 'Actions', column_type: 'action', position: 11,
      action_config: {
        label: 'Extract Actions',
        color: '#10b981',
        actions: [{
          type: 'run_prompt',
          config: {
            system_prompt: ACTION_ITEMS_PROMPT_SYSTEM,
            user_message_template: ACTION_ITEMS_PROMPT_USER,
            model: 'claude-sonnet-4-5-20250929',
            provider: 'anthropic',
            temperature: 0.3,
            max_tokens: 1024,
            output_column_key: 'action_items',
          },
        }],
        condition: { column_key: 'meeting_summary', operator: 'is_not_empty' },
      },
    },
    { key: 'action_items', label: 'Action Items (JSON)', column_type: 'text', position: 12 },
    { key: 'our_actions', label: 'Our Actions', column_type: 'formula', position: 13, formula_expression: 'JSON_GET(@action_items, "our_actions")' },
    { key: 'their_actions', label: 'Their Actions', column_type: 'formula', position: 14, formula_expression: 'JSON_GET(@action_items, "their_actions")' },
    { key: 'priority_action', label: 'Priority Action', column_type: 'formula', position: 15, formula_expression: 'JSON_GET(@action_items, "priority_action")' },
    { key: 'follow_up_date', label: 'Follow-up Date', column_type: 'formula', position: 16, formula_expression: 'JSON_GET(@action_items, "follow_up_date")' },
    {
      key: 'followup_btn', label: 'Follow-up', column_type: 'action', position: 17,
      action_config: {
        label: 'Draft Follow-up',
        color: '#f59e0b',
        actions: [{
          type: 'run_prompt',
          config: {
            system_prompt: FOLLOWUP_EMAIL_PROMPT_SYSTEM,
            user_message_template: FOLLOWUP_EMAIL_PROMPT_USER,
            model: 'claude-sonnet-4-5-20250929',
            provider: 'anthropic',
            temperature: 0.7,
            max_tokens: 1024,
            output_column_key: 'followup_email',
          },
        }],
        condition: { column_key: 'action_items', operator: 'is_not_empty' },
      },
    },
    { key: 'followup_email', label: 'Follow-up Email', column_type: 'text', position: 18 },
  ],
  dataSource: {
    type: 'meetings',
    column_mapping: {
      first_name: 'contact_first_name',
      last_name: 'contact_last_name',
      company: 'contact_company',
      meeting_date: 'meeting_date',
      transcript_text: 'transcript_text',
    },
    limit: 10,
    synthetic_rows: [
      { first_name: 'David', last_name: 'Park', company: 'Zenith Digital', meeting_date: '2026-02-28', transcript_text: 'Rep: David, thanks for the demo. What did you think?\nDavid: Honestly impressive. The pipeline automation is exactly what we need. We\'re currently using 4 different tools and nothing talks to each other.\nRep: What would consolidation save you?\nDavid: Time mostly. My team of 6 AEs each spend about 2 hours a day on admin — CRM updates, writing follow-ups, prepping for calls. That\'s 12 hours a day of selling time we\'re losing.\nRep: And the budget conversation?\nDavid: We\'re spending $3k/mo across our current stack. If you can replace even half of that and save time, it\'s a no-brainer. I need to loop in our CTO for the technical review though.\nRep: Timeline?\nDavid: We want something in place by end of Q1. The board is pushing for better pipeline metrics.' },
      { first_name: 'Emma', last_name: 'Walsh', company: 'Beacon Health Partners', meeting_date: '2026-03-01', transcript_text: 'Rep: Emma, how did the trial go?\nEmma: Mixed. The meeting prep feature is incredible — saved me 30 minutes before every call. But the email drafts felt too generic for healthcare.\nRep: What would make them work for your space?\nEmma: Healthcare has compliance requirements. We can\'t make certain claims. The AI needs to understand HIPAA-adjacent language constraints. Also, our sales cycle is 6-9 months, so the follow-up cadence needs to be much longer.\nRep: Those are solvable. We can customise the AI prompts for healthcare.\nEmma: That would help. The other thing is we need SSO. Non-negotiable for our IT team.\nRep: SSO is on our roadmap for next month.\nEmma: OK. Send me a proposal with healthcare customisation and SSO timeline. I\'ll share with our procurement team.' },
      { first_name: 'Chris', last_name: 'Tanaka', company: 'Velocity Ventures', meeting_date: '2026-03-02', transcript_text: 'Rep: Chris, thanks for squeezing this in. I know you\'re busy with fundraising.\nChris: Always. Look, I\'ll be direct — we looked at your competitor last week too. What makes you different?\nRep: Fair question. The main difference is we\'re built for small teams. No 6-month implementation, no dedicated admin needed.\nChris: That matters. We\'re 4 people doing everything. I don\'t have time to configure software.\nRep: Exactly our sweet spot. What\'s your current process?\nChris: Spreadsheet. I\'m not kidding. Google Sheets with colour coding. It works until it doesn\'t, and it doesn\'t work anymore.\nRep: What broke?\nChris: We lost a $500k deal because I forgot to follow up after a partner intro. That was the wake-up call.\nRep: What\'s your budget range?\nChris: For something that prevents half-million dollar mistakes? Up to $200/mo. When can we start?' },
    ],
  },
};

// ── Exports ─────────────────────────────────────────────────────

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  REENGAGEMENT_TEMPLATE,
  LEAD_SCORING_TEMPLATE,
  MEETING_FOLLOWUP_TEMPLATE,
];

export function getPipelineTemplateByKey(key: string): PipelineTemplate | undefined {
  return PIPELINE_TEMPLATES.find(t => t.key === key);
}
