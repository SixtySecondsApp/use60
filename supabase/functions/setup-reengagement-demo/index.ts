// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

/**
 * setup-reengagement-demo — Create a demo re-engagement pipeline ops table
 * cloned from meetings data with AI prompt buttons and formula extractors.
 *
 * POST body: { org_id: string }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const JSON_HEADERS = { ...corsHeaders, 'Content-Type': 'application/json' }

const PROMPT_1_SYSTEM = `You are a sales intelligence analyst for Sixty Seconds, a B2B GTM agency.

Sixty Seconds runs managed outbound campaigns. They recently built use60, a self-serve AI sales assistant. It automates post-call admin, follow-ups, proposal generation, CRM sync, meeting prep and personalised outreach. Self-managed, no retainer, much cheaper than the managed service.

Your job: analyse a sales call transcript. The prospect met with a Sixty Seconds rep but did not convert. Could be budget, timing, scope, bandwidth or anything else. We are re-engaging them about use60.

TODAY'S DATE: {{today_date}}

=================================================================
STEP 0: QUALIFICATION GATE (DO THIS BEFORE ANYTHING ELSE)
=================================================================

Before analysing the transcript, determine if this meeting qualifies for the re-engagement campaign. Read the transcript and ask ALL THREE questions:

1. Is this a sales conversation between a Sixty Seconds rep and a prospect? (Not an internal meeting, team catch-up, podcast, webinar, or unrelated call.)
2. Did the prospect engage as a POTENTIAL BUYER of Sixty Seconds' services for their own business? (Not as a referral partner, not exploring a partnership, not interested on behalf of their clients. They must have been evaluating Sixty Seconds as something THEY would buy and use.)
3. Did the prospect show genuine interest but NOT convert? (They either hit a budget wall, timing issue, needed to think about it, got distracted, went quiet after pricing, or any other reason they didn't sign up despite being interested.)

If ANY answer is no, STOP. Do not analyse further. Return only this minimal JSON:

{
  "qualified": false,
  "disqualify_reason": "<one sentence explaining why>"
}

Examples of unqualified meetings:
- Internal team standup or planning call
- Prospect showed zero interest in anything Sixty Seconds does
- Call is about a completely different service or topic
- Transcript is too short or garbled to extract anything useful
- Networking or partnership discussion (not a buying conversation)
- Prospect was exploring referral opportunities for their clients, not buying for themselves
- Prospect was interested but engaged as a potential partner or reseller, not an end buyer

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
6. Valid JSON only?`

const PROMPT_1_USER = `Contact: {{first_name}} {{last_name}} at {{company}}
Meeting date: {{meeting_date}}
Rep: {{rep_name}}

Transcript:
{{transcript_text}}`

const PROMPT_2_SYSTEM = `You generate personalised merge variables for a sales email template. You are NOT writing emails. You are filling in short phrases that slot into a fixed template written by the sales rep.

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
  "use60_intro": "",
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

  Use months_ago from the input:
  0-1 months: "the other week" or "last week" or "recently"
  2-4 months: "a few months back" or "a little while back"
  5-8 months: "earlier this year" or "a few months back"
  9-12 months: "a while back" or "towards the end of last year"
  12+: "a while back" or "a good while ago"

pain_ref (max 15 words)
  What they were trying to solve. Completes: "about [pain_ref]".
  Must flow grammatically after the word "about".
  Write it as a natural phrase, not a label.

  GOOD: "getting Cleverfox's outbound working without it costing a fortune"
  GOOD: "sorting out the follow-up process so leads stopped going cold"
  GOOD: "scaling Lead Source Group without it all relying on you"
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

use60_intro (pick one of two fixed options)
  How to introduce use60. Depends on how recent the meeting was.

  The template reads:
  "[use60_intro] It's called use60. Basically the same toolkit but
  you run it yourself, way cheaper."

  If months_ago is 0-1 (very recent meeting):
    USE EXACTLY: "Anyway, we've actually got a self-serve version that might be a better fit."
  If months_ago is 2+:
    USE EXACTLY: "Anyway, we've actually built a self-serve version since then."

  Return the EXACT phrase from the two options above. Do not rewrite it. Do not rephrase it. Pick the one that matches months_ago and copy it word for word.

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
  "use60_intro": "Anyway, we've actually got a self-serve version that might be a better fit.",
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
  "use60_intro": "Anyway, we've actually built a self-serve version since then.",
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
5. Is pain_reframe a genuinely different angle from pain_ref?
6. Is use60_intro the correct version for this months_ago?
   (0-1 = "got", 2+ = "built since then")
7. Any em dashes? Remove.
8. Any Oxford commas? Fix.
9. All within max word counts?
10. Return ONLY valid JSON.`

const PROMPT_2_USER = `Contact: {{first_name}} at {{company}}
Months ago: {{months_ago}}
Blocker type: {{blocker_type}}
Specific pain: {{specific_pain}}
Personalisation hook: {{personalisation_hook}}
use60 angle: {{use60_angle}}
Interest areas: {{interest_areas}}`

const PROMPT_3_SYSTEM = `You are a sales rep writing a short, warm re-engagement email. Use the provided merge variables to compose the email. Keep it under 150 words. No subject line — just the body. Write in first person, casual-professional tone. Don't be salesy. Reference something specific from the original meeting. End with a soft CTA (e.g. "Would it make sense to grab 15 minutes?").

Output the email body as plain text — no JSON, no markdown, no formatting.

IMPORTANT — Date context: Today's date is {{today_date}}. The meeting was on {{meeting_date}}. Ensure any time references in the email are accurate based on these exact dates.`

const PROMPT_3_USER = `Write a re-engagement email to {{first_name}} at {{company}}.

Today's date: {{today_date}}
Meeting date: {{meeting_date}}

Variables:
- Hook line: {{hook_line}}
- Pain reference: {{pain_ref}}
- Time reference: {{time_ref}}
- Blocker reference: {{blocker_ref}}
- 60 intro: {{use60_intro}}
- Pain reframe: {{pain_reframe}}`

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // Auth
    const userToken = req.headers.get('Authorization')?.replace('Bearer ', '') || ''
    if (!userToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS })
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS })
    }

    const body = await req.json()
    const { org_id } = body
    if (!org_id) {
      return new Response(JSON.stringify({ error: 'org_id required' }), { status: 400, headers: JSON_HEADERS })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    console.log('[setup-reengagement-demo] Starting for org:', org_id, 'user:', user.id)

    // 1. Fetch 5 meetings with transcripts
    const { data: meetings, error: meetError } = await supabase
      .from('meetings')
      .select('id, title, meeting_start, owner_user_id, transcript_text, contact_id, company_id')
      .eq('org_id', org_id)
      .not('transcript_text', 'is', null)
      .order('meeting_start', { ascending: false })
      .limit(5)

    if (meetError) throw meetError
    console.log('[setup-reengagement-demo] Meetings found:', meetings?.length ?? 0)

    // Get contact details
    const contactIds = (meetings ?? []).map(m => m.contact_id).filter(Boolean)
    let contactMap: Record<string, { first_name: string; last_name: string; company: string; company_id: string | null }> = {}
    if (contactIds.length > 0) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, company, company_id')
        .in('id', contactIds)
      for (const c of contacts ?? []) {
        contactMap[c.id] = { first_name: c.first_name ?? '', last_name: c.last_name ?? '', company: c.company ?? '', company_id: c.company_id ?? null }
      }
    }

    // Fetch meeting_attendees as fallback when contact_id is null
    const meetingIds = (meetings ?? []).map(m => m.id).filter(Boolean)
    let allAttendeesMap: Record<string, Array<{ name: string; email: string }>> = {}
    let attendeeMap: Record<string, { first_name: string; last_name: string; email: string }> = {}
    if (meetingIds.length > 0) {
      const { data: attendees } = await supabase
        .from('meeting_attendees')
        .select('meeting_id, name, email, is_external')
        .in('meeting_id', meetingIds)
        .eq('is_external', true)
      for (const a of attendees ?? []) {
        if (!allAttendeesMap[a.meeting_id]) allAttendeesMap[a.meeting_id] = []
        allAttendeesMap[a.meeting_id].push({ name: a.name ?? '', email: a.email ?? '' })
      }
    }

    // Resolve best attendee per meeting using title matching
    for (const meeting of meetings ?? []) {
      const candidates = allAttendeesMap[meeting.id] ?? []
      if (candidates.length === 0) continue

      let bestCandidate = candidates[0]

      if (candidates.length > 1 && meeting.title) {
        const repName = meeting.owner_user_id ? profileMap[meeting.owner_user_id] : undefined
        // Try "Name & Name" or "Name - Name" patterns to find the prospect
        const titleLower = meeting.title.toLowerCase()
        const andMatch = meeting.title.match(/^(.+?)\s+(?:and|&)\s+(.+?)(?:\s*[-—].*)?$/i)
        const sepMatch = !andMatch ? meeting.title.match(/^(.+?)\s*(?:—|-)\s+(.+?)(?:\s*[-—].*)?$/i) : null
        const parsed = andMatch || sepMatch
        if (parsed && repName) {
          const [, personA, personB] = parsed
          const repLower = repName.toLowerCase().trim()
          const aLower = personA.trim().toLowerCase()
          const prospect = repLower.startsWith(aLower.split(' ')[0]) || aLower.startsWith(repLower.split(' ')[0])
            ? personB.trim() : personA.trim()
          const prospectFirst = prospect.split(/\s+/)[0]?.toLowerCase()
          if (prospectFirst) {
            const matched = candidates.find(c => (c.name ?? '').toLowerCase().includes(prospectFirst))
            if (matched) bestCandidate = matched
          }
        } else {
          // Fallback: match each attendee name against the raw title
          const matched = candidates.find(c => {
            const firstName = (c.name ?? '').split(' ')[0]?.toLowerCase()
            return firstName && firstName.length > 1 && titleLower.includes(firstName)
          })
          if (matched) bestCandidate = matched
        }
      }

      const parts = (bestCandidate.name ?? '').split(' ')
      attendeeMap[meeting.id] = {
        first_name: parts[0] ?? '',
        last_name: parts.slice(1).join(' ') ?? '',
        email: bestCandidate.email ?? '',
      }
    }

    // Try to match attendee emails to contacts for company info
    const attendeeEmails = Object.values(attendeeMap).map(a => a.email).filter(Boolean)
    let emailContactMap: Record<string, { company: string }> = {}
    if (attendeeEmails.length > 0) {
      const { data: emailContacts } = await supabase
        .from('contacts')
        .select('email, company')
        .in('email', attendeeEmails)
      for (const c of emailContacts ?? []) {
        if (c.email && c.company) {
          emailContactMap[c.email] = { company: c.company }
        }
      }
    }

    // Batch-fetch company names from companies table (meetings + contacts)
    const companyIdSet = new Set<string>()
    for (const m of meetings ?? []) {
      if (m.company_id) companyIdSet.add(m.company_id)
    }
    for (const c of Object.values(contactMap)) {
      if (c.company_id) companyIdSet.add(c.company_id)
    }
    let companyMap: Record<string, { name: string; domain: string }> = {}
    if (companyIdSet.size > 0) {
      const { data: companies } = await supabase
        .from('companies')
        .select('id, name, domain')
        .in('id', Array.from(companyIdSet))
      for (const co of companies ?? []) {
        companyMap[co.id] = { name: co.name ?? '', domain: co.domain ?? '' }
      }
    }

    // Get rep names from profiles
    const ownerIds = (meetings ?? []).map(m => m.owner_user_id).filter(Boolean)
    const uniqueOwnerIds = [...new Set(ownerIds)]
    let profileMap: Record<string, string> = {}
    if (uniqueOwnerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', uniqueOwnerIds)
      for (const p of profiles ?? []) {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ')
        profileMap[p.id] = name || p.email || 'Unknown Rep'
      }
    }

    // 2. Find a unique table name (append number if duplicates exist)
    const baseName = 'Re-Engagement Pipeline (Demo)'
    const { data: existingTables } = await supabase
      .from('dynamic_tables')
      .select('name')
      .eq('organization_id', org_id)
      .like('name', 'Re-Engagement Pipeline (Demo)%')

    let tableName = baseName
    if (existingTables && existingTables.length > 0) {
      const taken = new Set(existingTables.map(t => t.name))
      let n = 1
      while (taken.has(tableName)) {
        tableName = `${baseName} ${n}`
        n++
      }
    }

    const { data: table, error: tableError } = await supabase
      .from('dynamic_tables')
      .insert({
        organization_id: org_id,
        created_by: user.id,
        name: tableName,
        description: 'AI-powered re-engagement pipeline: analyse transcripts → generate personalised email variables',
        source_type: 'manual',
        row_count: meetings?.length ?? 0,
      })
      .select('id')
      .single()
    if (tableError) throw tableError
    const tableId = table.id
    console.log('[setup-reengagement-demo] Created table:', tableId, tableName)
    console.log('[setup-reengagement-demo] Table created:', tableId)

    // 3. Create columns — keep it lean, use JSON_GET formulas to extract key fields
    const columnDefs = [
      // Source data
      { key: 'first_name', label: 'First Name', column_type: 'text', position: 0 },
      { key: 'last_name', label: 'Last Name', column_type: 'text', position: 1 },
      { key: 'company', label: 'Company', column_type: 'text', position: 2 },
      { key: 'meeting_date', label: 'Meeting Date', column_type: 'date', position: 3 },
      { key: 'rep_name', label: 'Rep', column_type: 'text', position: 4 },
      { key: 'transcript_text', label: 'Transcript', column_type: 'text', position: 5 },

      // Step 1: Analyse button
      {
        key: 'analyse_btn', label: 'Analyse', column_type: 'action', position: 6,
        action_config: {
          label: 'Analyse Transcript',
          color: '#8b5cf6',
          actions: [{
            type: 'run_prompt',
            config: {
              system_prompt: PROMPT_1_SYSTEM,
              user_message_template: PROMPT_1_USER,
              model: 'claude-sonnet-4-5-20250929',
              provider: 'anthropic',
              temperature: 0,
              max_tokens: 1024,
              output_column_key: 'transcript_analysis',
            },
          }],
        },
      },

      // Step 1: Raw JSON output (hidden by default — formulas extract what matters)
      { key: 'transcript_analysis', label: 'Analysis (JSON)', column_type: 'text', position: 7 },

      // Step 1: Key extracted fields
      { key: 'qualified', label: 'Qualified', column_type: 'formula', position: 8, formula_expression: 'JSON_GET(@transcript_analysis, "qualified")' },
      { key: 'date_calculation', label: 'Date Calc', column_type: 'formula', position: 9, formula_expression: 'JSON_GET(@transcript_analysis, "date_calculation")' },
      { key: 'months_ago', label: 'Months Ago', column_type: 'formula', position: 10, formula_expression: 'JSON_GET(@transcript_analysis, "months_ago")' },
      { key: 'specific_pain', label: 'Pain Point', column_type: 'formula', position: 11, formula_expression: 'JSON_GET(@transcript_analysis, "specific_pain")' },
      { key: 'blocker_signal', label: 'Blocker Signal', column_type: 'formula', position: 12, formula_expression: 'JSON_GET(@transcript_analysis, "blocker_signal")' },
      { key: 'blocker_type', label: 'Blocker Type', column_type: 'formula', position: 13, formula_expression: 'JSON_GET(@transcript_analysis, "blocker_type")' },
      { key: 'interest_areas', label: 'Interest Areas', column_type: 'formula', position: 14, formula_expression: 'JSON_GET(@transcript_analysis, "interest_areas")' },
      { key: 'company_context', label: 'Company Context', column_type: 'formula', position: 15, formula_expression: 'JSON_GET(@transcript_analysis, "company_context")' },
      { key: 'suggested_tier', label: 'Tier', column_type: 'formula', position: 16, formula_expression: 'JSON_GET(@transcript_analysis, "suggested_tier")' },
      { key: 'personalisation_hook', label: 'Hook', column_type: 'formula', position: 17, formula_expression: 'JSON_GET(@transcript_analysis, "personalisation_hook")' },
      { key: 'use60_angle', label: 'use60 Angle', column_type: 'formula', position: 18, formula_expression: 'JSON_GET(@transcript_analysis, "use60_angle")' },
      { key: 'tone_notes', label: 'Tone Notes', column_type: 'formula', position: 19, formula_expression: 'JSON_GET(@transcript_analysis, "tone_notes")' },

      // Step 2: Personalise button (only shows when qualified = true)
      {
        key: 'personalise_btn', label: 'Personalise', column_type: 'action', position: 20,
        action_config: {
          label: 'Write Personalisation',
          color: '#10b981',
          actions: [{
            type: 'run_prompt',
            config: {
              system_prompt: PROMPT_2_SYSTEM,
              user_message_template: PROMPT_2_USER,
              model: 'claude-sonnet-4-5-20250929',
              provider: 'anthropic',
              temperature: 0.5,
              max_tokens: 512,
              output_column_key: 'email_variables',
            },
          }],
          condition: {
            column_key: 'qualified',
            operator: 'equals',
            value: 'true',
          },
        },
      },

      // Step 2: Raw JSON output
      { key: 'email_variables', label: 'Email Vars (JSON)', column_type: 'text', position: 21 },

      // Step 2: Key extracted fields
      { key: 'hook_line', label: 'Hook Line', column_type: 'formula', position: 22, formula_expression: 'JSON_GET(@email_variables, "hook_line")' },
      { key: 'pain_ref', label: 'Pain Ref', column_type: 'formula', position: 23, formula_expression: 'JSON_GET(@email_variables, "pain_ref")' },
      { key: 'pain_short', label: 'Pain Short', column_type: 'formula', position: 24, formula_expression: 'JSON_GET(@email_variables, "pain_short")' },
      { key: 'time_ref', label: 'Time Ref', column_type: 'formula', position: 25, formula_expression: 'JSON_GET(@email_variables, "time_ref")' },
      { key: 'blocker_ref', label: 'Blocker Ref', column_type: 'formula', position: 26, formula_expression: 'JSON_GET(@email_variables, "blocker_ref")' },
      { key: 'use60_intro', label: '60 Intro', column_type: 'formula', position: 27, formula_expression: 'JSON_GET(@email_variables, "use60_intro")' },
      { key: 'pain_reframe', label: 'Pain Reframe', column_type: 'formula', position: 28, formula_expression: 'JSON_GET(@email_variables, "pain_reframe")' },

      // Step 3: Write Email button (only shows when email_variables exist)
      {
        key: 'write_email_btn', label: 'Write Email', column_type: 'action', position: 29,
        action_config: {
          label: 'Write Email',
          color: '#f59e0b',
          actions: [{
            type: 'run_prompt',
            config: {
              system_prompt: PROMPT_3_SYSTEM,
              user_message_template: PROMPT_3_USER,
              model: 'claude-sonnet-4-5-20250929',
              provider: 'anthropic',
              temperature: 0.6,
              max_tokens: 1024,
              output_column_key: 'email_draft',
            },
          }],
          condition: {
            column_key: 'email_variables',
            operator: 'is_not_empty',
          },
        },
      },

      // Step 3: Email output
      { key: 'email_draft', label: 'Email Draft', column_type: 'text', position: 30 },
    ]

    const columnInserts = columnDefs.map((col) => ({
      table_id: tableId,
      key: col.key,
      label: col.label,
      column_type: col.column_type,
      position: col.position,
      width: col.column_type === 'text' && col.key === 'transcript_text' ? 300 : 150,
      is_visible: true,
      is_enrichment: false,
      ...(col.formula_expression ? { formula_expression: col.formula_expression } : {}),
      ...(col.action_config ? { action_config: col.action_config } : {}),
    }))

    const { data: createdColumns, error: colInsertError } = await supabase
      .from('dynamic_table_columns')
      .insert(columnInserts)
      .select('id, key')

    if (colInsertError) { console.error('[setup-reengagement-demo] Column insert error:', JSON.stringify(colInsertError)); throw colInsertError }

    const colKeyToId: Record<string, string> = {}
    for (const c of createdColumns ?? []) {
      colKeyToId[c.key] = c.id
    }

    // Helper: parse meeting title as prospect name (fallback for 1:1 sales calls)
    const skipTitleWords = ['stand up', 'standup', 'check-in', 'checkin', 'catch up', 'catchup', 'sync', 'meeting', 'internal', 'team', 'weekly', 'biweekly', 'impromptu', 'google meet', 'pipeline', 'demo']
    function parseTitleAsName(title: string): { first_name: string; last_name: string } | null {
      if (!title) return null
      const lower = title.toLowerCase()
      if (skipTitleWords.some(w => lower.includes(w))) return null
      if (title.includes(' — ') || title.includes(' - ') || title.includes('<>')) return null
      const parts = title.trim().split(/\s+/)
      if (parts.length < 1 || parts.length > 4) return null
      return { first_name: parts[0], last_name: parts.slice(1).join(' ') }
    }

    // 4. Create rows and cells from meetings
    for (const meeting of meetings ?? []) {
      let contact = meeting.contact_id ? contactMap[meeting.contact_id] : null
      let attendee = attendeeMap[meeting.id] ?? null
      const repName = meeting.owner_user_id ? profileMap[meeting.owner_user_id] : undefined

      // Helper: check if a name matches the rep
      function isRep(firstName: string, lastName: string, repFullName?: string): boolean {
        if (!repFullName) return false
        const repLower = repFullName.toLowerCase().trim()
        const first = (firstName ?? '').toLowerCase().trim()
        const last = (lastName ?? '').toLowerCase().trim()
        const fullName = [first, last].filter(Boolean).join(' ')
        if (fullName === repLower) return true
        const repFirst = repLower.split(' ')[0]
        const repLast = repLower.split(' ').slice(1).join(' ')
        if (first && repFirst && first === repFirst && (!last || !repLast || last === repLast)) return true
        return false
      }

      // Guard: if the resolved contact IS the rep, discard and fall back to attendee
      if (contact && isRep(contact.first_name, contact.last_name, repName)) {
        console.log(`[setup-reengagement-demo] Contact "${contact.first_name} ${contact.last_name}" matches rep "${repName}", falling back to attendee`)
        contact = null
      }

      // Guard: if the resolved attendee IS the rep, try the next candidate
      if (attendee && isRep(attendee.first_name, attendee.last_name, repName)) {
        console.log(`[setup-reengagement-demo] Attendee "${attendee.first_name} ${attendee.last_name}" matches rep "${repName}", picking alternate`)
        const candidates = allAttendeesMap[meeting.id] ?? []
        const alternate = candidates.find(c => {
          const cParts = (c.name ?? '').split(' ')
          return !isRep(cParts[0] ?? '', cParts.slice(1).join(' '), repName)
        })
        if (alternate) {
          const parts = (alternate.name ?? '').split(' ')
          attendee = { first_name: parts[0] ?? '', last_name: parts.slice(1).join(' ') ?? '', email: alternate.email ?? '' }
        } else {
          attendee = null
        }
      }

      // Extra guard: if name still matches the rep, clear it
      const resolvedFirstName = contact?.first_name || attendee?.first_name || ''
      if (isRep(resolvedFirstName, contact?.last_name || attendee?.last_name || '', repName) || (!contact && !attendee)) {
        contact = null
        if (attendee && isRep(attendee.first_name, attendee.last_name, repName)) attendee = null
      }

      const attendeeCompany = attendee?.email ? emailContactMap[attendee.email]?.company : null
      let titleName = (!contact && !attendee) ? parseTitleAsName(meeting.title ?? '') : null
      // Final guard on title-parsed name
      if (titleName && isRep(titleName.first_name, titleName.last_name, repName)) {
        console.log(`[setup-reengagement-demo] Title-parsed name "${titleName.first_name} ${titleName.last_name}" matches rep, discarding`)
        titleName = null
      }

      // If we still have nothing, extract the OTHER speaker from the transcript
      if (!contact && !attendee && !titleName && meeting.transcript_text && repName) {
        const speakerMatch = meeting.transcript_text.match(/\[[\d:]+\]\s+([^:]+):/g)
        if (speakerMatch) {
          const speakers = [...new Set(speakerMatch.map((s: string) => s.replace(/\[[\d:]+\]\s+/, '').replace(':', '').trim()))]
          const prospect = speakers.find((s: string) => !isRep(s.split(' ')[0], s.split(' ').slice(1).join(' '), repName))
          if (prospect) {
            const parts = prospect.split(' ')
            titleName = { first_name: parts[0], last_name: parts.slice(1).join(' ') }
            console.log(`[setup-reengagement-demo] Extracted prospect "${prospect}" from transcript speakers`)
          }
        }
      }

      const { data: row, error: rowError } = await supabase
        .from('dynamic_table_rows')
        .insert({ table_id: tableId, row_index: 0 })
        .select('id')
        .single()

      if (rowError) throw rowError

      const finalFirst = contact?.first_name || attendee?.first_name || titleName?.first_name || 'Unknown'
      const finalLast = contact?.last_name || attendee?.last_name || titleName?.last_name || ''

      // Build a set of all known person names to check company against
      const knownPersonNames = new Set<string>()
      const prospectFull = `${finalFirst} ${finalLast}`.toLowerCase().trim()
      if (prospectFull.length > 1) knownPersonNames.add(prospectFull)
      if (finalFirst.toLowerCase().trim().length > 1) knownPersonNames.add(finalFirst.toLowerCase().trim())
      if (repName) knownPersonNames.add(repName.toLowerCase().trim())
      const allCandidates = allAttendeesMap[meeting.id] ?? []
      for (const c of allCandidates) {
        const n = (c.name ?? '').toLowerCase().trim()
        if (n.length > 1) knownPersonNames.add(n)
      }

      // Helper: detect if a string looks like a person name
      function looksLikePersonName(val: string): boolean {
        if (!val) return false
        const words = val.trim().split(/\s+/)
        if (words.length < 2 || words.length > 4) return false
        return words.every((w: string) => /^[A-Z][a-z]*$/.test(w) && w.length <= 15)
      }

      // Priority: meeting.company_id -> contact.company -> contact.company_id -> attendeeCompany -> domain
      const meetingCo = meeting.company_id ? companyMap[meeting.company_id] : null
      const contactCo = contact?.company_id ? companyMap[contact.company_id] : null
      const companyCandidates = [
        meetingCo?.name,
        contact?.company,
        contactCo?.name,
        attendeeCompany
      ].filter(Boolean) as string[]
      let cleanCompany = ''
      for (const candidate of companyCandidates) {
        const candidateLower = candidate.toLowerCase().trim()
        if (knownPersonNames.has(candidateLower)) {
          console.log(`[setup-reengagement-demo] Company "${candidate}" matches a known person name, skipping`)
          continue
        }
        if (looksLikePersonName(candidate)) {
          console.log(`[setup-reengagement-demo] Company "${candidate}" looks like a person name, skipping`)
          continue
        }
        cleanCompany = candidate
        break
      }

      // Fallback: use domain from companies table or extract from attendee email
      if (!cleanCompany) {
        const coDomain = meetingCo?.domain || contactCo?.domain || ''
        const prospectEmail = attendee?.email || ''
        const emailDomain = prospectEmail ? (prospectEmail.split('@')[1] ?? '') : ''
        const domain = coDomain || emailDomain
        const genericDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'live.com', 'me.com', 'protonmail.com', 'mail.com']
        if (domain && !genericDomains.includes(domain.toLowerCase())) {
          cleanCompany = domain.split('.')[0]
          console.log(`[setup-reengagement-demo] Extracted company "${cleanCompany}" from domain "${domain}"`)
        }
      }

      const cellData: Record<string, string> = {
        first_name: finalFirst,
        last_name: finalLast,
        company: cleanCompany,
        meeting_date: meeting.meeting_start ?? '',
        rep_name: meeting.owner_user_id ? (profileMap[meeting.owner_user_id] ?? 'Unknown Rep') : 'Unknown Rep',
        transcript_text: meeting.transcript_text ?? '',
      }

      const cells = Object.entries(cellData)
        .filter(([key]) => colKeyToId[key])
        .map(([key, value]) => ({
          row_id: row.id,
          column_id: colKeyToId[key],
          value,
          source: 'import',
          status: 'complete',
          confidence: 1.0,
        }))

      if (cells.length > 0) {
        const { error: cellError } = await supabase
          .from('dynamic_table_cells')
          .insert(cells)
        if (cellError) throw cellError
      }
    }

    return new Response(
      JSON.stringify({
        table_id: tableId,
        rows_created: meetings?.length ?? 0,
        columns_created: createdColumns?.length ?? 0,
      }),
      { status: 200, headers: JSON_HEADERS },
    )
  } catch (error: any) {
    const msg = error?.message ?? String(error)
    const detail = error?.details ?? error?.hint ?? ''
    const code = error?.code ?? ''
    console.error('[setup-reengagement-demo] Error:', msg, detail, code, JSON.stringify(error))
    return new Response(
      JSON.stringify({ error: msg, detail, code }),
      { status: 500, headers: JSON_HEADERS },
    )
  }
})
