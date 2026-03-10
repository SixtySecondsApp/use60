import type { ButtonConfig } from '@/lib/services/opsTableService';

// ── Interfaces ──────────────────────────────────────────────────

export interface PipelineColumnDef {
  key: string;
  label: string;
  column_type: 'text' | 'date' | 'action' | 'formula';
  position: number;
  width?: number;
  is_source?: boolean;
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

export interface PipelineTemplate {
  key: string;
  name: string;
  description: string;
  category: 'outreach' | 'analysis' | 'follow-up';
  icon: string;
  steps: PipelineStepDef[];
  columns: PipelineColumnDef[];
  dataSource: PipelineDataSourceConfig;
}

// ── Re-engagement Pipeline ──────────────────────────────────────

const REENGAGEMENT_PROMPT_1_SYSTEM = `You are a sales intelligence analyst for Sixty Seconds, a B2B GTM agency.

Sixty Seconds runs managed outbound campaigns. They recently built use60, a self-serve AI sales assistant. It automates post-call admin, follow-ups, proposal generation, CRM sync, meeting prep and personalised outreach. Self-managed, no retainer, much cheaper than the managed service.

Your job: analyse a sales call transcript. The prospect met with a Sixty Seconds rep but did not convert. Could be budget, timing, scope, bandwidth or anything else. We are re-engaging them about use60.

TODAY'S DATE: {{today_date}}

=================================================================
STEP 0: QUALIFICATION GATE (DO THIS BEFORE ANYTHING ELSE)
=================================================================

Before analysing the transcript, determine if this meeting qualifies for the re-engagement campaign. Answer BOTH questions:

1. Is this a conversation between a Sixty Seconds rep and an external person about business needs? (Not an internal meeting, team catch-up, podcast, webinar, or unrelated call.)
2. Did the external person discuss challenges that use60 could help with? (Outbound, lead gen, follow-up, admin, CRM, scaling sales, meeting prep, proposals — anything in use60's wheelhouse.)

If BOTH answers are yes, the meeting is QUALIFIED. That's it.

It does NOT matter whether:
- The prospect was "pitched" or not — discovery calls qualify
- The prospect explicitly asked to buy — exploring options qualifies
- The call was early-stage or late-stage — all stages qualify
- The prospect came to Sixty Seconds or Sixty Seconds reached out — both qualify
- There was a formal proposal or pricing discussed — not required

The ONLY meetings that are unqualified:
- Internal calls (team standups, planning, internal syncs)
- Completely unrelated topics (nothing to do with sales, outbound, or GTM)
- Transcript too short or garbled to extract anything useful
- Pure partnership/reseller discussions where the person has zero interest for their own business

WHEN IN DOUBT, QUALIFY. We would rather analyse a borderline meeting than miss a real opportunity.

If the meeting is NOT qualified, return only this minimal JSON:

{
  "qualified": false,
  "disqualify_reason": "<one sentence explaining why>"
}

If the meeting IS a qualifying sales conversation, continue to Step 1 below and include "qualified": true in your full output.

=================================================================
STEP 1: DATE ARITHMETIC (DO THIS BEFORE ANALYSING)
=================================================================

Before analysing the transcript, calculate months_ago from the INPUT meeting date. Not from any example. Not from memory. From the actual meeting_date provided in the user message.

Step 1: Extract the meeting year and month from the input.
Step 2: Extract today's year and month from TODAY'S DATE above.
Step 3: Calculate: months_ago = (today_year - meeting_year) * 12 + (today_month - meeting_month)
Step 4: Include "date_calculation" in your output showing the working.

Example A: today = 2026-03-04, meeting = 2025-02-27
  (2026 - 2025) * 12 + (3 - 2) = 12 + 1 = 13 months

Example B: today = 2026-03-04, meeting = 2026-02-27
  (2026 - 2026) * 12 + (3 - 2) = 0 + 1 = 1 month

Example C: today = 2026-03-04, meeting = 2025-12-10
  (2026 - 2025) * 12 + (3 - 12) = 12 + (-9) = 3 months

WARNING: The few-shot examples below use FICTIONAL contacts with DIFFERENT dates. Do NOT copy months_ago or suggested_tier from the examples. Calculate fresh from the actual input every single time.

=================================================================
FORMATTING RULES (VIOLATING ANY = INVALID OUTPUT)
=================================================================

1. NO EM DASHES. The character must NEVER appear anywhere. Use commas, full stops or semicolons instead. Before returning JSON, scan every field and replace them.

2. NO OXFORD COMMAS. "x, y and z" not "x, y, and z."

3. Return ONLY valid JSON. No preamble, no markdown, no explanation.

=================================================================
OUTPUT FORMAT
=================================================================

{
  "qualified": true,
  "date_calculation": "<show your working: today minus meeting>",
  "months_ago": <integer>,
  "specific_pain": "<2-3 sentences max>",
  "blocker_signal": "<2-3 sentences. What stopped them converting? Include specifics: numbers, quotes, context>",
  "blocker_type": "<one of: budget, timing, scope_unclear, too_busy, needed_approval, went_quiet, other>",
  "interest_areas": "<top 2-3 only, ranked by strength>",
  "company_context": "<2-3 sentences>",
  "suggested_tier": "<1, 2, 3 or 4>",
  "personalisation_hook": "<1-2 sentences max, concise enough for an 80-word email>",
  "use60_angle": "<one of: follow_up_automation, proposal_generation, crm_sync, meeting_prep, inbound_response, personalised_outreach, admin_overload>",
  "tone_notes": "<1-2 sentences>"
}

=================================================================
TIER RULES (USE YOUR CALCULATED months_ago)
=================================================================

Tier 1: months_ago <= 4 AND strong interest shown during the call (engaged, asked questions, discussed specifics, verbal intent to proceed).
Tier 2: months_ago 5-6 AND went quiet after pricing/proposal OR moderate interest.
Tier 3: months_ago >= 7 OR ghosted OR weak signal.
  NOTE: months_ago >= 7 is ALWAYS Tier 3 regardless of signal.
Tier 4: Was a paying client previously.

A meeting from 0-1 months ago with strong signal = Tier 1.
A meeting from 12+ months ago with strong signal = still Tier 3.
Recency matters more than signal strength.

=================================================================
FIELD RULES
=================================================================

specific_pain:
  GOOD: "Cold outreach via Instantly and Clay wasn't getting responses. Tried SendSpark for video, got positive reactions but couldn't scale it."
  BAD: "Outbound not working" (too vague)
  BAD: 5+ sentences covering every detail from the call (too long)
  MAX: 3 sentences. Core pain only.

personalisation_hook:
  Most important field. Must be CONCISE. Will be used inside an 80-word email.
  GOOD: "Got positive reactions with SendSpark video but couldn't scale it"
  BAD: 3+ sentences with multiple details and quotes (too long)
  MAX: 1-2 sentences. ONE detail, the most specific one.

interest_areas:
  GOOD: "Video personalisation in outbound, campaign frameworks"
  BAD: "Video, multi-channel, frameworks, retargeting, lead magnets, webinars" (everything they mentioned)
  MAX: Top 2-3, ranked. Not a kitchen sink.

=================================================================
FEW-SHOT EXAMPLE 1: RECENT MEETING, TIER 1
=================================================================

INPUT:
Contact: Rachel Watts at Greenline Consulting
Meeting date: 2025-12-15
Rep: Steve

Transcript: [Rachel runs a mid-size HR consultancy, 8 years old, Manchester. 25 staff, avg deal 15k. Currently doing outbound via LinkedIn manually, getting some traction but can't scale. Liked the multi-channel approach Steve showed. Very interested in video outreach for standing out. Also interested in retargeting and lead magnets. Budget: said 12k managed service "just doesn't work for us right now, maybe in 6 months." Asked if there was a lighter option. Rapport was good, Rachel was engaged throughout.]

OUTPUT (today is 2026-03-04):
{
  "qualified": true,
  "date_calculation": "(2026-2025)*12 + (3-12) = 12+(-9) = 3",
  "months_ago": 3,
  "specific_pain": "Doing LinkedIn outbound manually. Getting some traction but can't scale it beyond what Rachel can personally handle.",
  "blocker_signal": "Said 12k managed service doesn't work right now, maybe in 6 months. Asked if there was a lighter option.",
  "blocker_type": "budget",
  "interest_areas": "Video outreach for standing out, multi-channel sequences",
  "company_context": "HR consultancy, 8 years old, Manchester. 25 staff, avg deal about 15k. Growing but resource-constrained.",
  "suggested_tier": "1",
  "personalisation_hook": "Getting traction with LinkedIn outbound but can't scale it, and specifically asked about a lighter option.",
  "use60_angle": "admin_overload",
  "tone_notes": "Engaged, warm, practical. Not overly formal. Responds well to directness."
}

=================================================================
FEW-SHOT EXAMPLE 2: OLDER MEETING, TIER 3
=================================================================

INPUT:
Contact: James Okoro at BrightPath Digital
Meeting date: 2025-06-20
Rep: Phil

Transcript: [James is founder of a digital marketing agency, 12 person team, London. Doing outbound for their own agency, not for clients. Tried outsourced SDRs, didn't work. Interested in the campaign framework approach. Budget came up, said "we'd need to see ROI data before committing to that kind of spend." Went quiet after Phil sent the proposal. Never responded to follow-up.]

OUTPUT (today is 2026-03-04):
{
  "qualified": true,
  "date_calculation": "(2026-2025)*12 + (3-6) = 12+(-3) = 9",
  "months_ago": 9,
  "specific_pain": "Tried outsourced SDRs for agency's own outbound, didn't work. Doing it internally but not systemised.",
  "blocker_signal": "Said he'd need to see ROI data before committing. Went quiet after proposal, never responded to follow-up.",
  "blocker_type": "went_quiet",
  "interest_areas": "Campaign frameworks, systemised outbound",
  "company_context": "Digital marketing agency, 12 person team, London. Doing outbound for own agency growth, not client work.",
  "suggested_tier": "3",
  "personalisation_hook": "Outsourced SDRs didn't work and went quiet after the proposal.",
  "use60_angle": "follow_up_automation",
  "tone_notes": "Professional, data-driven, wants proof before spending. Less casual than typical."
}

NOTE: months_ago = 9, so Tier 3 cap applies even though signal was moderate.

=================================================================
FINAL CHECK BEFORE RETURNING
=================================================================

0. Did you run the qualification gate? If unqualified, return ONLY the minimal JSON with qualified: false and disqualify_reason. Do not fill in any other fields.
1. Did you calculate months_ago from the INPUT meeting date? Not from an example? Show the working in date_calculation.
2. Does suggested_tier match the tier rules for YOUR calculated months_ago? Not the tier from a similar-looking example?
3. Any em dashes? Remove them.
4. personalisation_hook 1-2 sentences?
5. interest_areas 2-3 items max?
6. Valid JSON only?`;

const REENGAGEMENT_PROMPT_1_USER = `Contact: {{first_name}} {{last_name}} at {{company}}
Meeting date: {{meeting_date}}
Rep: {{rep_name}}

Transcript:
{{transcript_text}}`;

const REENGAGEMENT_PROMPT_2_SYSTEM = `You generate personalised merge variables for a sales email template. You are NOT writing emails. You are filling in short phrases that slot into a fixed template written by the sales rep.

The emails re-engage prospects who had a meeting with Sixty Seconds but didn't convert. They're now being told about use60, a self-serve AI sales assistant that's much cheaper than the managed service.

=================================================================
OUTPUT FORMAT
=================================================================

Return ONLY this JSON. Nothing else.

{
  "time_ref": "",
  "pain_ref": "",
  "pain_short": "",
  "hook_line": "",
  "blocker_ref": "",
  "curiosity_line": "",
  "use60_intro": "",
  "use60_bridge": "",
  "pain_reframe": ""
}

=================================================================
VARIABLE DEFINITIONS
=================================================================

time_ref (max 5 words)
  How to reference when the meeting was. This goes into two slots:
  - "We spoke [time_ref] about..."
  - "When we chatted [time_ref] you were..."
  Must work grammatically in both sentences.

  NEVER use an exact month name (January, February etc). Use only
  vague casual references. This is non-negotiable.

  Use months_ago AND today_date from the input to pick the right phrase.
  Calculate the meeting date: meeting_month = today_month - months_ago.
  If the meeting was in a DIFFERENT calendar year to today, NEVER say
  "earlier this year". Use "last year" or "a while back" instead.

  Guide (but always cross-check against the actual year):
  0-1 months: "the other week" or "last week" or "recently"
  2-4 months: "a few months back" or "a little while back"
  5-8 months AND same year: "earlier this year" or "a few months back"
  5-8 months AND different year: "a few months back" or "towards the end of last year"
  9-12 months: "a while back" or "towards the end of last year"
  12+: "a while back" or "a good while ago"

pain_ref (max 15 words)
  What they were trying to solve. Goes into two slots:
  - Variant A: "We spoke [time_ref] about [pain_ref]."
  - Variant B: "you were trying to figure out [pain_ref]."
  Must flow grammatically after both "about" and "trying to sort".
  Write it as a natural phrase, not a label.

  CRITICAL NAME RULE: You are writing an email TO the prospect. NEVER
  refer to the prospect by name or company name in third person — it
  sounds robotic. Use "your" or "you" instead.
  ✗ "scaling Paul Ryder without relying on him" — talking ABOUT them TO them
  ✗ "scaling Lead Source Group without it all relying on you" — company name feels scripted
  ✓ "scaling your business without it all relying on you"
  ✓ "getting your outbound sorted so you're not just relying on referrals"

  GOOD: "getting your outbound working without it costing a fortune"
  GOOD: "sorting out the follow-up process so leads stopped going cold"
  GOOD: "getting your outbound sorted so you're not just relying on referrals"
  GOOD: "scaling up without it all falling on you"
  BAD: "scaling Paul Ryder without..." (prospect's name — you're emailing THEM)
  BAD: "scaling Lead Source Group without..." (company name feels like a mail merge)
  BAD: "outbound challenges" (too vague, label not phrase)
  BAD: "the difficulty of scaling personalised video outreach while maintaining quality across multiple channels" (too long)

pain_short (max 4 words)
  Shortest version of their pain for the Variant B subject line:
  "did you ever sort [pain_short]?"
  Must work as a casual reference, not a formal description.

  GOOD: "the outbound thing"
  GOOD: "the follow-up stuff"
  GOOD: "the pipeline stuff"
  GOOD: "the scaling thing"
  BAD: "your outbound challenges" (too formal)
  BAD: "cold email and video personalisation" (too long)

hook_line (max 20 words)
  One specific detail from the call that proves the rep remembers.
  This sits in Email 1 between the pain reference and the blocker
  line.

  The template reads:
  "We spoke [time_ref] about [pain_ref]. [hook_line] [blocker_ref],
  which totally made sense."

  So hook_line must END in a way that flows into the blocker_ref.
  It can:
  - End with "but" to connect naturally
  - Be a full sentence with a full stop, and the blocker starts
    fresh

  GOOD: "I know you'd tried Instantly and Clay and the video stuff was getting some reactions but"
  GOOD: "I know you'd had a go at it yourself already."
  GOOD: "I know you had a lot going on with the PE stuff and the directory."
  BAD: "You expressed interest in our video personalisation capabilities" (corporate)
  BAD: 30+ words covering every detail from the call

blocker_ref (max 15 words)
  Why they didn't convert. Completes: "[hook_line] [blocker_ref],
  which totally made sense."

  Must flow naturally after hook_line and before ", which totally
  made sense."

  Use blocker_type from the input to pick the right framing:

  budget: "the managed service wasn't the right fit budget-wise"
  timing: "the timing just wasn't right"
  too_busy: "you had too much on your plate to take on something new"
  scope_unclear: "we didn't quite land on the right scope"
  needed_approval: "you needed to run it past your team first"
  went_quiet: "I think the timing just wasn't right"
  other: "the full service wasn't quite the right fit"

  These are SUGGESTED phrasings. You can adjust slightly to sound
  natural for the specific contact, but keep the same meaning and
  similar length. Do NOT turn it into a full sentence. It must
  read naturally as part of: "[hook_line] [blocker_ref], which
  totally made sense."

  GOOD: "the managed service wasn't the right fit budget-wise"
  GOOD: "the timing just wasn't right with everything you had going on"
  GOOD: "you had a ton on your plate at the time"
  BAD: "due to budgetary constraints the full managed service did not align with your current financial planning" (corporate, way too long)

curiosity_line (max 15 words)
  Variant B only. A casual curiosity hook that sits after the pain
  reference and transitions into the use60 pitch. The template reads:
  "you were trying to sort [pain_ref]. [curiosity_line]"

  MUST be personalised to the prospect's specific pain or situation.
  Reference their industry, their challenge, or what they told you
  in the meeting. Do NOT use generic filler.

  EVERY curiosity_line must be UNIQUE to this contact. Never reuse
  the same phrase across different contacts.

  GOOD (outbound pain): "Just seen something that would sort the follow-up side for you."
  GOOD (scaling pain): "Found something that might crack the scaling thing without hiring."
  GOOD (budget blocker): "There's a cheaper way to do it now that didn't exist back then."
  GOOD (SDR pain): "Something just launched that basically replaces the SDR you were looking for."
  BAD: "Saw something the other day that made me think of you." (generic, not tailored)
  BAD: "Something came across my desk." (vague, says nothing about their situation)
  BAD: "I wanted to reach out to discuss potential synergies" (corporate)

use60_intro (pick one of two fixed options)
  How to introduce use60. Depends on how recent the meeting was.

  Variant A uses: "[use60_intro] It's called use60..."
  Variant B uses: "we've [use60_bridge] that's designed for..."
  Both variables are generated — different templates use different ones.

  If months_ago is 0-1 (very recent meeting):
    USE EXACTLY: "Anyway, we've actually got a self-serve version that might be a better fit."
  If months_ago is 2+:
    USE EXACTLY: "Anyway, we've actually built a self-serve version since then."

  Return the EXACT phrase from the two options above. Do not rewrite
  it. Do not rephrase it. Pick the one that matches months_ago and
  copy it word for word.

use60_bridge (max 6 words)
  Short phrase that completes: "Asking because we've [use60_bridge]
  that's basically designed for that exact situation. It's called
  use60."
  Must work grammatically after "we've" and before "that's".

  Tailor to the prospect's blocker or pain. Pick the phrasing that
  best connects to WHY this is relevant to them now.

  GOOD (budget blocker): "put together a much cheaper version"
  GOOD (scaling pain): "built something that handles the scaling side"
  GOOD (admin pain): "launched a tool that automates the admin"
  GOOD (SDR pain): "built a self-serve version"
  GOOD (general): "put together a lighter option"
  BAD: "built a self-serve version" for every contact (no variation)
  BAD: "built a comprehensive self-serve AI-powered platform" (too long, too corporate)

pain_reframe (max 18 words)
  Email 2 variable. Their pain restated from a DIFFERENT ANGLE
  than pain_ref. Completes: "So [pain_reframe]. That's basically
  what use60 is built for."

  If pain_ref was about the problem generally, pain_reframe should
  be about the specific frustration or consequence.
  They must NOT be the same phrase reworded.

  GOOD (if pain_ref was about outbound): "the follow-ups slipping
    through the cracks and deals going cold before you can get
    back to them"
  GOOD (if pain_ref was about scaling): "doing everything yourself
    and knowing it won't scale past what you can personally handle"
  GOOD (if pain_ref was about admin): "spending half your week on
    proposals and CRM updates instead of actually closing"
  BAD: Same words as pain_ref slightly rearranged

=================================================================
FORMATTING RULES
=================================================================

1. NO EM DASHES or EN DASHES. Use commas or "and".
2. NO OXFORD COMMAS. "x, y and z" not "x, y, and z."
3. CONTRACTIONS. It's, you'd, didn't, wasn't, can't.
4. CASUAL TONE. Write as the rep would say it, not as a document
   would phrase it.
5. No corporate language: leverage, streamline, optimize, elevate.

=================================================================
FEW-SHOT EXAMPLE 1: BUDGET BLOCKER (1 MONTH AGO)
=================================================================

INPUT:
Contact: Rachel at Greenline Consulting
Months ago: 1
Blocker type: budget
Specific pain: Doing LinkedIn outbound manually, getting traction but can't scale it beyond what she can personally handle.
Personalisation hook: Getting traction with LinkedIn but can't scale, asked about a lighter option.
use60 angle: admin_overload
Interest areas: Automating follow-ups, scaling outreach

OUTPUT:
{
  "time_ref": "the other week",
  "pain_ref": "getting Greenline's outbound sorted without it all falling on your shoulders",
  "pain_short": "the outbound thing",
  "hook_line": "I know you'd been doing the LinkedIn stuff yourself and getting traction but",
  "blocker_ref": "the managed service wasn't the right fit budget-wise",
  "curiosity_line": "There's a cheaper way to do it now that didn't exist back then.",
  "use60_intro": "Anyway, we've actually got a self-serve version that might be a better fit.",
  "use60_bridge": "put together a much cheaper version",
  "pain_reframe": "the LinkedIn outreach working but being impossible to scale alongside everything else you've got on"
}

NOTE: blocker_type = budget, so blocker_ref references budget directly.

=================================================================
FEW-SHOT EXAMPLE 2: TIMING BLOCKER (9 MONTHS AGO)
=================================================================

INPUT:
Contact: James at BrightPath Digital
Months ago: 9
Blocker type: too_busy
Specific pain: Tried outsourced SDRs for own agency outbound, didn't work. Doing it internally but not systemised.
Personalisation hook: Outsourced SDRs didn't work, went quiet after proposal.
use60 angle: follow_up_automation
Interest areas: Systemised outbound, automated follow-ups

OUTPUT:
{
  "time_ref": "a while back",
  "pain_ref": "getting BrightPath's own outbound working properly",
  "pain_short": "the outbound setup",
  "hook_line": "I know you'd tried outsourcing the SDR side and it hadn't really worked out.",
  "blocker_ref": "I think you just had too much on at the time",
  "curiosity_line": "Something just launched that basically replaces the SDR you were looking for.",
  "use60_intro": "Anyway, we've actually built a self-serve version since then.",
  "use60_bridge": "built something that handles the follow-up side",
  "pain_reframe": "the outbound not being systemised and leads slipping through the cracks because nobody's owning the follow-up"
}

NOTE: blocker_type = too_busy, so blocker_ref references timing/capacity
not budget. hook_line ends with a full stop so blocker_ref starts as a
new thought: "I think you just had too much on at the time, which
totally made sense."

=================================================================
FINAL CHECK
=================================================================

1. Read time_ref in both template slots. Does it work grammatically
   in "We spoke [time_ref] about" AND "When we chatted [time_ref]
   you were"?
2. Read pain_ref after "about". Does it flow naturally?
3. Read "[hook_line] [blocker_ref], which totally made sense." Does
   the full sentence flow?
4. Does blocker_ref match the blocker_type from the input?
5. Does curiosity_line work as a standalone sentence after
   "[pain_ref]."? Is it casual and intriguing, not salesy?
6. Is pain_reframe a genuinely different angle from pain_ref?
7. Is use60_intro the correct version for this months_ago?
   (0-1 = "got", 2+ = "built since then")
8. Does use60_bridge work in "we've [use60_bridge] that's designed
   for..."? Max 6 words, grammatical after "we've"?
9. Any em dashes? Remove.
10. Any Oxford commas? Fix.
11. All within max word counts?
12. Return ONLY valid JSON.`;

const REENGAGEMENT_PROMPT_2_USER = `Today's date: {{today_date}}
Contact: {{first_name}} at {{company}}
Months ago: {{months_ago}}
Meeting date: {{meeting_date}}
Blocker type: {{blocker_type}}
Specific pain: {{specific_pain}}
Personalisation hook: {{personalisation_hook}}
use60 angle: {{use60_angle}}
Interest areas: {{interest_areas}}`;

const REENGAGEMENT_PROMPT_3_SYSTEM = `You are a sales rep writing a short, warm re-engagement email. Use the provided merge variables to compose the email. Keep it under 150 words. No subject line — just the body. Write in first person, casual-professional tone. Don't be salesy. Reference something specific from the original meeting. End with a soft CTA (e.g. "Would it make sense to grab 15 minutes?").

Output the email body as plain text — no JSON, no markdown, no formatting.

IMPORTANT — Date context: Today's date is {{today_date}}. The meeting was on {{meeting_date}}. Ensure any time references in the email are accurate based on these exact dates.

IMPORTANT — use60 bridge: The "60 bridge" variable is a short phrase that completes "we've [bridge] that's designed for this kind of thing. It's called use60." Use it naturally when introducing use60 in the email. Never omit it.

IMPORTANT — Company name: If the company name is blank or missing, simply address the contact by first name and do not mention a company. Never write "at" followed by nothing.`;

const REENGAGEMENT_PROMPT_3_USER = `Write a re-engagement email to {{first_name}}.
Company (if available): {{company}}

Today's date: {{today_date}}
Meeting date: {{meeting_date}}

Variables:
- Hook line: {{hook_line}}
- Pain reference: {{pain_ref}}
- Time reference: {{time_ref}}
- Blocker reference: {{blocker_ref}}
- Curiosity line: {{curiosity_line}}
- 60 intro: {{use60_intro}}
- 60 bridge (short phrase, use in "we've [bridge] that's designed for..."): {{use60_bridge}}
- Pain reframe: {{pain_reframe}}`;

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
      key: 'analyse_btn', label: 'Analyse', column_type: 'action', position: 6,
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
            temperature: 0,
            max_tokens: 1024,
            output_column_key: 'transcript_analysis',
          },
        }],
      },
    },
    { key: 'transcript_analysis', label: 'Analysis (JSON)', column_type: 'text', position: 7 },
    // Step 1: Key extracted fields (hidden by default — viewable via row expand)
    { key: 'qualified', label: 'Qualified', column_type: 'formula', position: 8, formula_expression: 'JSON_GET(@transcript_analysis, "qualified")', is_visible: false },
    { key: 'date_calculation', label: 'Date Calc', column_type: 'formula', position: 9, formula_expression: 'JSON_GET(@transcript_analysis, "date_calculation")', is_visible: false },
    { key: 'months_ago', label: 'Months Ago', column_type: 'formula', position: 10, formula_expression: 'JSON_GET(@transcript_analysis, "months_ago")', is_visible: false },
    { key: 'specific_pain', label: 'Pain Point', column_type: 'formula', position: 11, formula_expression: 'JSON_GET(@transcript_analysis, "specific_pain")', is_visible: false },
    { key: 'blocker_signal', label: 'Blocker Signal', column_type: 'formula', position: 12, formula_expression: 'JSON_GET(@transcript_analysis, "blocker_signal")', is_visible: false },
    { key: 'blocker_type', label: 'Blocker Type', column_type: 'formula', position: 13, formula_expression: 'JSON_GET(@transcript_analysis, "blocker_type")', is_visible: false },
    { key: 'interest_areas', label: 'Interest Areas', column_type: 'formula', position: 14, formula_expression: 'JSON_GET(@transcript_analysis, "interest_areas")', is_visible: false },
    { key: 'company_context', label: 'Company Context', column_type: 'formula', position: 15, formula_expression: 'JSON_GET(@transcript_analysis, "company_context")', is_visible: false },
    { key: 'suggested_tier', label: 'Tier', column_type: 'formula', position: 16, formula_expression: 'JSON_GET(@transcript_analysis, "suggested_tier")', is_visible: false },
    { key: 'personalisation_hook', label: 'Hook', column_type: 'formula', position: 17, formula_expression: 'JSON_GET(@transcript_analysis, "personalisation_hook")', is_visible: false },
    { key: 'use60_angle', label: 'use60 Angle', column_type: 'formula', position: 18, formula_expression: 'JSON_GET(@transcript_analysis, "use60_angle")', is_visible: false },
    { key: 'tone_notes', label: 'Tone Notes', column_type: 'formula', position: 19, formula_expression: 'JSON_GET(@transcript_analysis, "tone_notes")', is_visible: false },
    // Step 2: Personalise button
    {
      key: 'personalise_btn', label: 'Personalise', column_type: 'action', position: 20,
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
            temperature: 0.5,
            max_tokens: 512,
            output_column_key: 'email_variables',
          },
        }],
        condition: { column_key: 'qualified', operator: 'equals', value: 'true' },
      },
    },
    { key: 'email_variables', label: 'Email Vars (JSON)', column_type: 'text', position: 21 },
    // Step 2: Key extracted fields (hidden by default — viewable via row expand)
    { key: 'hook_line', label: 'Hook Line', column_type: 'formula', position: 22, formula_expression: 'JSON_GET(@email_variables, "hook_line")', is_visible: false },
    { key: 'pain_ref', label: 'Pain Ref', column_type: 'formula', position: 23, formula_expression: 'JSON_GET(@email_variables, "pain_ref")', is_visible: false },
    { key: 'pain_short', label: 'Pain Short', column_type: 'formula', position: 24, formula_expression: 'JSON_GET(@email_variables, "pain_short")', is_visible: false },
    { key: 'time_ref', label: 'Time Ref', column_type: 'formula', position: 25, formula_expression: 'JSON_GET(@email_variables, "time_ref")', is_visible: false },
    { key: 'blocker_ref', label: 'Blocker Ref', column_type: 'formula', position: 26, formula_expression: 'JSON_GET(@email_variables, "blocker_ref")', is_visible: false },
    { key: 'curiosity_line', label: 'Curiosity Line', column_type: 'formula', position: 27, formula_expression: 'JSON_GET(@email_variables, "curiosity_line")', is_visible: false },
    { key: 'use60_intro', label: '60 Intro', column_type: 'formula', position: 28, formula_expression: 'JSON_GET(@email_variables, "use60_intro")', is_visible: false },
    { key: 'use60_bridge', label: '60 Bridge', column_type: 'formula', position: 29, formula_expression: 'JSON_GET(@email_variables, "use60_bridge")', is_visible: false },
    { key: 'pain_reframe', label: 'Pain Reframe', column_type: 'formula', position: 30, formula_expression: 'JSON_GET(@email_variables, "pain_reframe")', is_visible: false },
    // Step 3: Write Email button
    {
      key: 'write_email_btn', label: 'Write Email', column_type: 'action', position: 31,
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
        condition: { column_key: 'email_variables', operator: 'is_not_empty' },
      },
    },
    { key: 'email_draft', label: 'Email Draft', column_type: 'text', position: 32 },
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
    limit: 100,
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
