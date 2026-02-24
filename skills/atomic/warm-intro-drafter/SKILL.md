---
name: Warm Intro Drafter
description: |
  Draft a warm introduction email connecting a prospect with a colleague, partner, or expert.
  Use when a user asks "introduce them to", "loop in", "connect them with",
  "warm intro", or needs to broker a valuable connection between two contacts.
  Returns personalized intro email explaining why both parties should connect.
metadata:
  author: sixty-ai
  version: "2"
  category: writing
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - outreach
  triggers:
    - pattern: "warm intro"
      intent: "warm_introduction"
      confidence: 0.90
      examples:
        - "make a warm intro"
        - "send a warm introduction"
        - "draft warm intro email"
    - pattern: "introduce"
      intent: "connect_contacts"
      confidence: 0.80
      examples:
        - "introduce them to Sarah"
        - "can you introduce me to"
        - "make an introduction"
    - pattern: "loop in"
      intent: "bring_in_contact"
      confidence: 0.85
      examples:
        - "loop Sarah into this conversation"
        - "bring in our technical lead"
        - "add Mike to the discussion"
    - pattern: "connect them with"
      intent: "broker_connection"
      confidence: 0.85
      examples:
        - "connect them with our SE"
        - "put them in touch with"
        - "link them up with"
  keywords:
    - "introduce"
    - "introduction"
    - "warm intro"
    - "connect"
    - "loop in"
    - "meet"
    - "colleague"
    - "expert"
    - "refer"
  required_context:
    - contact
    - company_name
  inputs:
    - name: person_to_introduce
      type: string
      description: "Name or identifier of the person being introduced (prospect, client, partner)"
      required: true
    - name: colleague
      type: string
      description: "Name or identifier of the colleague/expert being introduced to"
      required: true
    - name: reason
      type: string
      description: "Why these two people should connect"
      required: false
    - name: context
      type: string
      description: "Additional context about the relationship or deal"
      required: false
  outputs:
    - name: email_draft
      type: object
      description: "Introduction email with value proposition for both parties"
    - name: suggested_meeting_purpose
      type: string
      description: "Recommended agenda or discussion topics for their first meeting"
  priority: medium
  requires_capabilities:
    - email
    - crm
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Warm Intro Drafter

## Goal
Craft a professional, high-value introduction that connects a prospect or client with a colleague, technical expert, partner, or peer in a way that creates immediate mutual value and advances the deal or relationship.

## Why Warm Introductions Matter

Strategic introductions are one of the most powerful but underutilized sales tools:

- **Deals that involve 3+ people from the seller's side close 2.4x faster** than single-threaded deals (RAIN Group).
- **Warm introductions have a 72% response rate** vs. 18% for cold outreach (LinkedIn State of Sales, 2024).
- **Buyers rate "connecting me with the right expert" as the #2 most valuable action a rep can take**, just behind "bringing insights I didn't have" (Gartner B2B Buying Study).
- **Strategic introductions increase deal size by an average of 34%** because they expand scope and uncover additional needs (Salesforce internal research).
- **The quality of the introduction email determines whether the connection happens**: 68% of requested intros never result in a meeting because the intro email was too vague or failed to convey value (HubSpot analysis).

The key insight: a warm intro is not just CC'ing two people. It is strategic matchmaking that requires context, value articulation, and clear next steps.

## Required Capabilities
- **Email**: To draft and send introduction email
- **CRM**: To fetch context on both parties (relationship history, deal context, role)

## Inputs
- `person_to_introduce`: The prospect, client, or external party being introduced (required)
- `colleague`: The internal team member, partner, or peer being introduced to (required)
- `reason`: Why these two people should connect (optional but recommended)
- `context`: Deal context, relationship history, or background (optional)

## Data Gathering (via execute_action)

1. **Fetch person_to_introduce profile**: `execute_action("get_contact", { id: person_to_introduce })` — name, title, company, role, past interactions
2. **Fetch colleague profile**: `execute_action("get_contact", { id: colleague })` OR internal user lookup — title, expertise, role
3. **Fetch deal context**: `execute_action("get_deal", { contact_id: person_to_introduce })` — deal stage, value, key challenges
4. **Fetch relationship history**: `execute_action("get_contact_activities", { contact_id: person_to_introduce })` — past meetings, emails, trust level

If either profile is incomplete, proceed with available data but flag: "Limited profile information — please verify names, titles, and contact details before sending."

## The Warm Intro Framework

A successful warm intro has three audiences, each with different needs:

### Audience 1: The External Party (Prospect/Client)
**What they need to know**:
- Who is this new person being introduced?
- Why should I care about meeting them?
- What specific value will this conversation bring me?

**Mistake to avoid**: Introducing your colleague without explaining the benefit to the buyer. "I'd like to introduce you to Sarah, our Solutions Engineer" tells the buyer nothing about why this matters to THEM.

### Audience 2: Your Colleague
**What they need to know**:
- Who is this person and what is the context?
- What is the deal status and priority?
- What specific value should I bring to this conversation?
- What am I being asked to do?

**Mistake to avoid**: Looping in a colleague cold with no context. They should never have to ask "Why am I on this email?"

### Audience 3: You (The Introducer)
**What you need to achieve**:
- Maintain deal momentum by bringing in the right expertise at the right time
- Position yourself as a connector and facilitator, not a blocker
- Ensure the next step is clear (a scheduled meeting, not "you two should chat sometime")

## Email Structure for Warm Introductions

### Format: The Double-Intro Method
The most effective warm intro format introduces BOTH parties to EACH OTHER, not just one to the other. This creates psychological reciprocity.

**Structure**:
1. **Opening**: State the purpose of the email (1 sentence)
2. **Person A, meet Person B**: Introduce external party to colleague (2-3 sentences)
3. **Person B, meet Person A**: Introduce colleague to external party (2-3 sentences)
4. **Why this connection matters**: Explain the value for both (1-2 sentences)
5. **Suggested next step**: Propose a specific action (1 sentence)

### Section 1: Opening (1 sentence)
State why you are making this introduction.

**Good example**: "I'd like to introduce you both — I think a 20-minute technical conversation would be valuable for the POC we discussed."

**Bad example**: "I wanted to connect you two."

### Section 2: Introduce External Party to Colleague (2-3 sentences)
Context for your colleague — who is this person, what is the deal, why does this intro matter RIGHT NOW?

**Good example**:
"Sarah, meet Alex Chen, VP of Engineering at Acme Corp. Acme is evaluating our data platform for their SOC 2 compliance initiative (Q3 deadline). Alex's team has specific OAuth integration questions that are beyond my expertise, and I think a technical deep-dive with you would de-risk the POC."

**Bad example**:
"Sarah, this is Alex from Acme. Can you help him with some technical questions?"

**Why this works**: Your colleague now knows: who Alex is, what Acme needs, why this is urgent (Q3 deadline), and what you need Sarah to do (technical deep-dive on OAuth).

### Section 3: Introduce Colleague to External Party (2-3 sentences)
Credentials and value prop for the buyer — why should they care about meeting this person?

**Good example**:
"Alex, meet Sarah Torres, our Lead Solutions Engineer. Sarah has worked with 15+ companies in your industry on OAuth implementations, including a similar migration at [Peer Company] last year. She can walk through our integration architecture and answer your team's specific questions about SSO and SAML flows."

**Bad example**:
"Alex, this is Sarah, our Solutions Engineer. She's really smart and can help with technical stuff."

**Why this works**: Alex now knows: Sarah's credentials (15+ implementations), relevant social proof (peer company), and specific value she brings (OAuth/SSO/SAML expertise that matches his stated needs).

### Section 4: Why This Connection Matters (1-2 sentences)
Articulate the mutual value explicitly.

**Good example**:
"I'm connecting you because Alex's OAuth requirements are exactly the type of architecture challenge Sarah specializes in, and I think a 20-minute technical sync would accelerate the POC timeline."

**Bad example**:
"I think you two should chat."

### Section 5: Suggested Next Step (1 sentence)
Propose a specific, low-friction action. Ideally, include a Calendly link or suggest a specific meeting time.

**Good example**:
"Sarah, would you have 20 minutes this week for a technical call? Here's my Calendly link to make scheduling easy: [link]"

**Bad example**:
"Let me know if you'd like to connect sometime."

## Timing: When to Make Introductions

Not all introductions should happen immediately. Timing matters:

### Early-Stage Introductions (Discovery → Evaluation)
**When**: Buyer expresses specific need that requires specialized expertise (technical, legal, industry-specific).
**Who to introduce**: Solutions Engineer, Industry Expert, Technical Architect.
**Risk**: Introducing too many people too early can overwhelm the buyer.

### Mid-Stage Introductions (Evaluation → Negotiation)
**When**: Deal is progressing but needs deeper alignment (procurement, security, executive sponsorship).
**Who to introduce**: Account Executive's manager, Customer Success lead, Security specialist.
**Risk**: Introducing senior people too late signals the rep was out of their depth.

### Late-Stage Introductions (Negotiation → Close)
**When**: Executive alignment needed, strategic partnership discussion, or customer reference.
**Who to introduce**: Your CEO/VP to their CEO/VP, peer customer for reference call.
**Risk**: Bringing in executives prematurely can make the deal feel bigger than it is.

### Post-Sale Introductions (Onboarding → Expansion)
**When**: Handoff to implementation team, customer success, or account management.
**Who to introduce**: CSM, Implementation lead, Account Manager.
**Risk**: Poor handoff destroys trust built during sales cycle.

**General rule**: Introduce specialists when their expertise is explicitly needed, not preemptively. The buyer should be able to answer "Why am I meeting this person?" without you explaining it.

## Internal Colleague Briefing (BCC or Separate Email)

In many cases, you should send a SEPARATE briefing email to your colleague BEFORE or simultaneously with the warm intro email. This private briefing should include:

- **Deal context**: Stage, value, timeline, priority
- **Buyer context**: Key stakeholders, pain points, competitive landscape
- **What you need from them**: Specific deliverable, question to answer, relationship to build
- **Risks or sensitivities**: Anything they should know (budget concerns, competitor mentions, political dynamics)

**When to use a separate briefing**:
- The colleague is not familiar with the account
- The deal has complex context that would clutter the intro email
- There is sensitive information the buyer should not see (competitive intel, pricing strategy)

**Format**:
```
[BCC to colleague before sending intro]

Subject: Context for Acme intro

Sarah,

Quick context before I loop you into the Acme deal:

- Deal: $120K ARR, mid-stage evaluation, close target end of Q1
- Contact: Alex Chen (VP Eng), very technical, ex-Google, no-BS communication style
- Challenge: They need OAuth/SAML integration and our docs are not detailed enough for their team
- Competitor: Evaluating [Competitor X] in parallel — they have better API docs but weaker product
- What I need: 20-min technical deep-dive to answer OAuth questions and de-risk the POC
- Risk: If we can't prove the integration is simple, they'll go with Competitor X

I'll intro you both via email. Let me know if you need anything else.

[Rep]
```

## Tone Calibration by Introduction Type

### Peer-to-Peer Introduction (Connecting two equals)
**Tone**: Warm, collaborative, mutual-value-focused
**Emphasis**: "You two should know each other" energy
**Example**: Introducing a prospect to a peer customer for a reference call

### Expert-to-Buyer Introduction (Bringing in specialist)
**Tone**: Professional, credential-forward, problem-solving
**Emphasis**: "This person has the expertise you need" energy
**Example**: Introducing Solutions Engineer to answer technical questions

### Executive-to-Executive Introduction (Strategic alignment)
**Tone**: Concise, strategic, high-level
**Emphasis**: "This is worth both of your time" energy
**Example**: Introducing your CEO to their CEO for partnership discussion

### Handoff Introduction (Transitioning relationship)
**Tone**: Reassuring, continuity-focused, trust-transfer
**Emphasis**: "You are in great hands" energy
**Example**: Introducing Customer Success Manager after deal closes

## Output Contract

Return a SkillResult with:

### `data.email_draft`
Object:
- `subject`: string (e.g., "Intro: Alex Chen (Acme) <> Sarah Torres (Sixty)")
- `body`: string (full email text using double-intro method)
- `body_html`: string | null (HTML formatted version)
- `to`: string[] (both parties)
- `cc`: string[] | null (optional CC for visibility)
- `sections`: array of section objects:
  - `type`: "opening" | "intro_external" | "intro_colleague" | "value_prop" | "next_step"
  - `content`: string

### `data.colleague_briefing`
Object (optional, for separate internal email):
- `subject`: string
- `body`: string (private context for colleague)
- `to`: string (colleague email)
- `deal_context`: object with `stage`, `value`, `timeline`, `priority`

### `data.suggested_meeting_purpose`
String: Recommended agenda or discussion topics for their first meeting

**Example**: "Technical deep-dive on OAuth/SAML integration requirements, review Sixty's API architecture, address Acme's security compliance questions"

### `data.introduction_type`
String: "peer_to_peer" | "expert_to_buyer" | "executive_to_executive" | "handoff"

### `data.approval_required`
Boolean: `true` — introductions should always be reviewed before sending

## Quality Checklist

Before returning results, validate:

- [ ] Both parties are introduced TO EACH OTHER (not just one-way)
- [ ] External party's intro includes context (company, role, why this matters now)
- [ ] Colleague's intro includes credentials and specific value proposition
- [ ] The reason for connection is explicitly stated
- [ ] Next step is specific and actionable (not "let me know if you want to connect")
- [ ] Subject line follows format: "Intro: [Person A] <> [Person B]"
- [ ] Tone matches introduction type (peer, expert, executive, handoff)
- [ ] No jargon or acronyms unless both parties are technical
- [ ] Email is under 200 words (introductions should be concise)

## Error Handling

### Missing contact information
If email addresses are not available for either party: "Contact information missing for [name]. Please provide email address before sending introduction."

### Colleague has no profile or context
If colleague is mentioned by first name only with no profile data: Proceed with basic intro but flag: "Limited information about [colleague name]. Please verify their title and expertise before sending."

### No clear reason for introduction
If `reason` is not provided and cannot be inferred from deal context: Return draft with placeholder: "[Explain why this connection would be valuable]" and flag: "Reason for introduction is unclear. Please specify why these two people should connect."

### Introduction may be premature
If deal is very early-stage (first interaction) and introduction is to a senior executive: Flag warning: "Consider whether an executive introduction is appropriate at this deal stage. Early-stage deals may benefit from specialist intros first."

### Colleague may be overloaded
If the colleague has been introduced to 5+ deals in the past week (detectable via activity log): Flag: "[Colleague name] has been looped into several deals recently. Confirm they have capacity for this introduction."

## Examples

### Good Warm Intro Email (Expert-to-Buyer)
```
Subject: Intro: Alex Chen (Acme) <> Sarah Torres (Sixty)

Hi both,

I'd like to introduce you — I think a 20-minute technical conversation would be valuable for the POC we discussed.

Sarah, meet Alex Chen, VP of Engineering at Acme Corp. Acme is evaluating our data platform for their SOC 2 compliance initiative (Q3 deadline). Alex's team has specific OAuth and SAML integration questions that are beyond my expertise, and I think a technical deep-dive with you would de-risk the POC.

Alex, meet Sarah Torres, our Lead Solutions Engineer. Sarah has worked with 15+ companies in your industry on OAuth implementations, including a similar migration at TechCorp last year. She can walk through our integration architecture and answer your team's specific questions about SSO and SAML flows.

I'm connecting you because Alex's OAuth requirements are exactly the type of architecture challenge Sarah specializes in, and I think a 20-minute sync would accelerate the POC timeline.

Sarah, would you have 20 minutes this week for a technical call? Here's my Calendly: [link]

Best,
[Rep]
```

### Bad Warm Intro Email
```
Subject: Introduction

Hi,

I wanted to introduce you two. Alex, this is Sarah from our technical team. Sarah, this is Alex from Acme.

You guys should connect.

Let me know if you want to set up a call.

Thanks
```
**Why this is bad**: No context for either party. No value proposition. No reason for the connection. No specific next step. Both people will ignore this email.

### Good Warm Intro Email (Executive-to-Executive)
```
Subject: Intro: James Liu (Acme CEO) <> Rachel Kim (Sixty CEO)

James, Rachel — I'd like to introduce you.

Rachel, meet James Liu, CEO of Acme Corp. Acme is in late-stage evaluation of our enterprise platform ($200K ARR opportunity). James has expressed interest in exploring a strategic partnership beyond the initial deployment, particularly around co-marketing and joint customer success.

James, meet Rachel Kim, CEO and co-founder of Sixty. Rachel has led several strategic partnerships in the data infrastructure space and can speak to how we've approached co-marketing and co-selling with partners like [Company X] and [Company Y].

I'm connecting you because I think there's a larger strategic opportunity here beyond the initial deal, and a 30-minute conversation between you two could explore what that might look like.

Rachel, would you have 30 minutes next week for a strategic conversation with James? I'll let you two take it from here.

Best,
[Rep]
```
**Why this is good**: Concise (executives are busy). Focuses on strategic value, not tactical details. Specific next step. The rep steps back and lets the executives drive the conversation.
