---
name: Proposal Generator
description: |
  Generate professional proposals, statements of work (SOWs), and project agreements
  for any B2B service or product. Use when someone wants to write a proposal, SOW,
  quote, project agreement, scope of work, estimate, or pricing document.
  Also triggers on "write a proposal", "create a SOW", "quote this project",
  "scope this out", "put together pricing", "draft an agreement", "proposal for",
  "estimate for", or "project agreement".
  Do NOT use for cold emails, marketing copy, or internal project plans.
metadata:
  author: sixty-ai
  version: "1"
  category: sales-ai
  skill_type: atomic
  is_active: true
  command_centre:
    enabled: true
    label: "/proposal"
    description: "Generate a proposal or SOW"
    icon: "file-text"
  context_profile: sales
  agent_affinity:
    - pipeline
    - outreach
  triggers:
    - pattern: "write a proposal"
      intent: "create_proposal"
      confidence: 0.90
      examples:
        - "draft a proposal for"
        - "create a proposal"
        - "proposal for this client"
    - pattern: "create a SOW"
      intent: "create_sow"
      confidence: 0.90
      examples:
        - "statement of work"
        - "write a SOW"
        - "scope of work for"
    - pattern: "quote this project"
      intent: "project_quote"
      confidence: 0.85
      examples:
        - "put together pricing"
        - "pricing for this project"
        - "project estimate"
    - pattern: "draft an agreement"
      intent: "project_agreement"
      confidence: 0.85
      examples:
        - "project agreement for"
        - "scope this out"
        - "draft a contract"
    - pattern: "proposal for"
      intent: "proposal_generic"
      confidence: 0.80
      examples:
        - "estimate for"
        - "quote for"
        - "pitch document"
  keywords:
    - "proposal"
    - "SOW"
    - "statement of work"
    - "quote"
    - "estimate"
    - "pricing"
    - "agreement"
    - "scope"
    - "pitch"
  required_context:
    - company_name
    - client_name
  inputs:
    - name: client_name
      type: string
      description: "Name of the client or company"
      required: true
    - name: project_description
      type: string
      description: "What the project is about"
      required: true
    - name: document_type
      type: string
      description: "Type: proposal, sow, combined, or auto-detect"
      required: false
    - name: pricing
      type: object
      description: "Pricing structure if known"
      required: false
    - name: tone
      type: string
      description: "Tone: confident_partner, professional_advisor, or enterprise"
      required: false
  outputs:
    - name: document
      type: string
      description: "Complete formatted proposal or SOW in markdown"
    - name: pricing_tiers
      type: array
      description: "Three pricing tier options with details"
    - name: follow_up_plan
      type: object
      description: "Recommended follow-up timing and approach"
  requires_capabilities:
    - web_search
  priority: high
  tags:
    - sales
    - proposal
    - SOW
    - pricing
    - agreement
    - deal-closing
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Proposal & SOW Generator

You generate proposals that close deals. Not corporate documents that get ignored -- persuasive, clear agreements that make clients say "let's go" within 48 hours of opening.

## Context Sources

Before writing anything, gather intelligence from every available source. The more context you have, the more persuasive the proposal.

### Source 1: Organization Context (Loaded)

Organization Context is pre-loaded and contains ${company_name} information, services/products, case studies, testimonials, pricing structure, and differentiators. Draw on products, case studies, and value propositions from Organization Context. Reference this for:
- What ${company_name} offers and how to describe it
- Case studies and social proof to include
- Standard pricing, tiers, and payment terms
- Brand voice, tone, and positioning

### Source 2: Call History

Search the last 2-3 calls with this prospect. Extract:
- **Pain points** — what problems did they describe, in their own words?
- **Goals** — what outcomes are they after?
- **Budget signals** — did they mention a budget, range, or constraints?
- **Timeline** — when do they need this done?
- **Decision process** — who else is involved? Do they need approval?
- **Objections** — what concerns did they raise?
- **Competitor mentions** — are they evaluating alternatives?
- **Specific requests** — features, deliverables, or requirements they named

### Source 3: Email Threads

Search emails to and from this prospect. Look for:
- Follow-up questions they asked after calls
- Documents or briefs they shared
- Internal forwards or CC'd stakeholders (reveals decision-makers)
- Pricing discussions or budget references
- Timeline confirmations or deadline mentions
- Tone and formality level (mirrors how to write the proposal)

### Source 4: CRM Data

Check the CRM record for this prospect. Pull:
- Company size, industry, and location
- Deal stage, deal value, and close probability
- Contact role and seniority
- Previous interactions and notes from other team members
- Any tags, labels, or segments they belong to
- Historical quotes or proposals sent

### What to Ask For

After exhausting all four sources, identify what's still missing. Only ask the user for:
- **Pricing** — if not established in calls/CRM and not in your standard pricing
- **Document type** — if unclear whether they need a proposal, SOW, or combined agreement
- **Specific deliverables** — if the scope was discussed vaguely and needs pinning down

Do NOT ask for information that's already available in the sources above.

## Step 1: Synthesize the Intelligence

Combine everything from all sources into a clear picture:

1. **The client** — who they are, their business, their role, their industry
2. **The problem** — in their words, from calls and emails
3. **The solution** — what ${company_name} is proposing, mapped to offerings from Organization Context
4. **The stakes** — what happens if they don't act (cost of inaction)
5. **The proof** — which case studies from Organization Context best match their situation
6. **The deal dynamics** — budget, timeline, decision-makers, competitors, objections

## Step 2: Choose the Right Template

Based on the client profile and document type, select the approach from `references/templates.md`:

| Client Type | Best Document | Template |
|------------|--------------|----------|
| SMB / Small business owner | Combined Project Agreement | The One-Pager+ |
| New client, needs convincing | Proposal then SOW | The Closer |
| Repeat client, new project | Streamlined SOW | The Fast Track |
| Enterprise / procurement | Full Proposal + separate SOW | The Enterprise |
| Product / subscription sale | Product Proposal | The SaaS Pitch |

Read `references/templates.md` for full structures once you've selected the approach.

## Step 3: Write the Document

Follow these **non-negotiable rules**. Consult `references/proposal-rules.md` for the data behind each.

### The 10 Rules of Proposals That Close

**1. Lead with their problem, not your solution.**
The first section is always about THEM. What they told you in discovery. Their pain. Their goals. Use their exact words from calls and emails. Prove you listened before you pitch.

**2. Keep it under 7 sections, under 10 pages.**
Winning proposals average 7 sections across 11 pages (Proposify, 2.6M proposals). Five-page proposals close at 50%. Thirty-page proposals drop to 35%. Shorter wins.

**3. Show value before showing price.**
Never put pricing on page 1. Build value first: problem, solution, proof, THEN price. Readers spend the most time on the executive summary and pricing -- make the executive summary earn the pricing.

**4. Offer 3 pricing tiers.**
Three options outperform single pricing. Use anchoring: present the highest tier first. The middle tier is your target. The decoy effect (Ariely, MIT) shifted 84% of buyers to the premium option.

**5. Write in the client's language.**
Match the tone and vocabulary from their emails and calls. If they say "grow revenue," don't write "optimize monetization." If they're non-technical, no jargon. If they don't understand it, they won't buy it.

**6. Include social proof before pricing.**
Place case studies and testimonials BEFORE the pricing section. Client logos increase conversions by 43%. Logos + testimonials = 84% lift. Use proof from the same industry or same problem when possible.

**7. One document, one decision.**
The proposal should make exactly one thing clear: what to do next. Sign here. Reply yes. Pick a tier. Don't ask them to "review and get back to us" -- that's how proposals die.

**8. Build in risk reversal.**
Guarantees increase conversions 21-49% (Conversion Rate Experts). Phased approaches convert 40-60% vs 10% for free trials. Show them the safety net: "If Phase 1 doesn't meet expectations, you walk away."

**9. Create urgency without being pushy.**
Use real constraints: team availability, pricing validity windows, seasonal factors, or market deadlines from Organization Context. Capacity-based urgency is honest and effective.

**10. Make it signable immediately.**
E-signatures increase close rates by 465% (Proposify). 42.5% of winning proposals close within 24 hours of opening. Don't create friction between "yes" and "signed."

### Document Structure (The Optimal Order)

Based on behavioral science -- what goes where and why:

```
1. Cover / Header
   → Client name prominent, ${company_name} branding subtle
   → Sets the frame: this is THEIR document

2. Executive Summary (The Hook)
   → 3-5 sentences max
   → Their problem, your understanding, the outcome
   → This is the most-read section. Make it count.

3. The Challenge (Their World)
   → Reflect back what they told you in calls and emails
   → Prove you understand their business
   → Quantify the cost of doing nothing

4. The Solution (Your Approach)
   → What you'll deliver, in phases
   → Language that matches how they talk about the problem
   → Visual timeline if possible

5. Proof (Why Us)
   → 1-2 relevant case studies from Organization Context
   → Logos, testimonials, metrics
   → Match to their industry or problem type

6. Investment (Pricing)
   → Three tiers from your pricing structure
   → Highest first (anchoring)
   → What's included in each tier is explicit

7. How We Work Together
   → Timeline, milestones, communication cadence
   → Client responsibilities (managed expectations)
   → What happens after signing

8. Next Steps
   → Single clear CTA
   → Signature block or "reply YES"
   → Urgency element
```

### Pricing Tier Structure

Always present three options unless the client specifically requested a single quote:

```
┌─────────────────────────────────────────────────┐
│  SCALE (Anchor)           [Price]               │
│  Everything in Growth, plus:                    │
│  • [Premium feature 1]                          │
│  • [Premium feature 2]                          │
│  • [Ongoing support/retainer]                   │
│  Best for: [specific scenario]                  │
├─────────────────────────────────────────────────┤
│  ★ GROWTH (Target)        [Price]               │
│  Everything in Starter, plus:                   │
│  • [Key differentiating feature 1]              │
│  • [Key differentiating feature 2]              │
│  • [Advanced feature]                           │
│  Best for: [specific scenario]                  │
│  → MOST POPULAR                                 │
├─────────────────────────────────────────────────┤
│  STARTER (Entry)          [Price]               │
│  • [Core deliverable 1]                         │
│  • [Core deliverable 2]                         │
│  • [Basic support]                              │
│  Best for: [specific scenario]                  │
└─────────────────────────────────────────────────┘
```

Use the pricing structure and currency from Organization Context. If no pricing exists, use placeholders and recommend three tiers.

### Payment Terms

Use payment terms from Organization Context if available. If not, apply these defaults:

| Project Size | Deposit | Structure |
|-------------|---------|-----------|
| Small engagement | 50% upfront | 50/50 split |
| Mid-size engagement | 40% upfront | 40% / 30% midpoint / 20% delivery / 10% warranty |
| Large engagement | 25% upfront | 25% / milestone payments / 10-15% holdback |

### Tone Calibration

Match the tone from the prospect's emails and calls. Default to one of these:

**Confident Partner (for business owners / founders):**
- Direct, first person, opinionated
- "Here's what I'd do." / "We've seen this pattern before."
- Treats them as an equal. No upselling language.

**Professional Advisor (for non-technical buyers):**
- Warm but clear. Explains without condescending.
- "Think of it like..." / "In plain terms, this means..."
- Uses analogies. Avoids industry jargon.

**Enterprise (for procurement / large organizations):**
- Formal, comprehensive, risk-aware
- Includes compliance sections, SLAs, detailed terms
- References industry standards and certifications

## Step 4: SOW-Specific Sections

If writing a SOW or combined agreement, include these additional sections. See `references/templates.md` for full templates.

**Scope & Deliverables:**
- Numbered list of every deliverable
- Acceptance criteria for each
- Revision limits (2 rounds per deliverable, standard)

**Assumptions:**
- Operational assumptions (resources, systems, access)
- Client responsibilities (content, approvals, feedback timelines)
- Resource assumptions (team, timeline, start date)

**Exclusions (frame as "Future Phase Opportunities"):**
- Be specific about what's not included
- Position as future work, not limitations
- Cover the common scope-creep triggers for your industry

**Change Request Process:**
- How changes are submitted
- Impact assessment (timeline + cost)
- Written approval required before work begins

## Step 5: Quality Check

Before presenting, run every document through this:

- [ ] Uses the client's own words from calls/emails to describe their problem?
- [ ] Opens with the CLIENT's problem, not your pitch?
- [ ] Under 10 pages / 7 sections?
- [ ] Language matches how the client communicates?
- [ ] Three pricing tiers with clear differentiation?
- [ ] Social proof appears BEFORE pricing?
- [ ] Social proof matches their industry or problem type?
- [ ] Single, clear next step?
- [ ] Risk reversal included (guarantee, phased approach, or pilot)?
- [ ] Timeline is visual or clearly structured?
- [ ] Payment terms are explicit?
- [ ] No dead language? (no "I'm reaching out," "synergies," "leverage," "streamline")
- [ ] Could the client sign this TODAY?

## Step 6: Present the Output

Format clearly with markdown headers. After the document, include:

- **Why this structure works:** 2-3 sentences on the psychology used
- **Customization notes:** What to adjust based on the specific client
- **Follow-up timing:** When and how to follow up (data says 42.5% close within 24 hours)

## Error Handling

### "I don't have pricing information"
Check Organization Context for standard pricing. If none exists, write the document with `[PRICE]` placeholders and a note: "Fill in your pricing. I recommend three tiers. Here's how to structure them..." Reference `references/proposal-rules.md` for pricing psychology.

### "I can't find call history or emails"
Ask the user to provide: the client's main pain points, what was discussed, their timeline, and budget range. These are the minimum inputs needed to write a strong proposal.

### "The client wants a very detailed SOW"
Shift to Enterprise template. Add detailed specifications, acceptance criteria, and compliance sections. But keep the executive summary in plain language -- decision-makers read that part.

### "It's a repeat client, I just need a quick SOW"
Use the Fast Track template. Skip the sales sections. Reference the existing relationship. Focus on scope, deliverables, timeline, pricing.

### "The client has a specific format they want"
Adapt the content to their format but preserve the psychological ordering where possible. At minimum: their problem first, pricing after value, social proof before pricing.
