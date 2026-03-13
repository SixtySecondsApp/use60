---
name: Website Visitor Outreach Drafter
skill_key: visitor-outreach-drafter
category: outreach
version: "1.0.0"
description: Draft personalized outreach emails that reference a prospect's recent website visit, making outreach feel timely and relevant.
trigger_phrases:
  - "draft outreach for website visitor"
  - "write email for site visitor"
  - "visitor outreach"
  - "website visit follow up"
input_schema:
  required:
    - visitorId
  optional:
    - tone
    - emailLength
linked_skills:
  - copilot-followup
  - sales-sequence
  - email-send-as-rep
autonomy_tier: 1
output_type: email_draft
---

# Website Visitor Outreach Drafter

## Purpose
Generate a personalized cold outreach email that references the prospect's recent website visit. The email should feel natural and timely — not creepy. Reference the *content* they were interested in, not the fact that you tracked them.

## Context Assembly
1. **Visitor data**: Load from `website_visitors` table by visitorId — get page_url, page_title, visited_at, resolved_company_name, rb2b_identified
2. **Contact data**: Load matched contact — name, title, company, email, linkedin_url
3. **Company context**: If deal exists for this company, include deal stage and history
4. **Learning preferences**: Check `learning_preferences` for the sending rep — tone, length, greeting style
5. **Org email patterns**: Sample 2-3 recent sent emails from the rep for voice matching

## Email Generation Rules
- **Never** mention tracking, pixels, cookies, or "I saw you visited our site"
- **Do** reference the topic/content they were interested in: "I noticed {company} is exploring [topic from page title]"
- **Keep it short**: 3-5 sentences max unless learning_preferences say otherwise
- **Include a clear CTA**: One question or one ask. Not both.
- **Match the rep's voice**: Use learning_preferences for greeting style, sign-off, tone
- **Personalize by title**: Adjust value proposition framing based on contact's seniority and role

## Page Intent Mapping
Map page URLs to buyer intent signals:
- `/pricing` or `/plans` → High intent. "Evaluating solutions" framing.
- `/demo` or `/book` → Very high intent. "Happy to walk you through" framing.
- `/features` or `/product` → Mid intent. "Exploring how [product] could help" framing.
- `/case-studies` or `/customers` → Mid intent. "Proving ROI" framing.
- `/blog/*` → Low intent. "Thought you might find this relevant" framing.
- `/about` or `/team` → Research phase. "Getting to know us" framing.
- Other → Generic interest framing.

## Output Format
Store the draft in `crm_approval_queue` with:
- `action_type`: 'email_draft'
- `content`: The email body
- `metadata`: { subject, to_email, visitor_id, confidence_level }
- `status`: 'pending_approval'

The rep reviews and approves before sending.

## Example Output

**Subject:** Quick question about your evaluation

**Body:**
Hi {first_name},

I work with {similar_company_type} teams who are looking to [value prop based on page visited]. Thought it might be worth a quick conversation to see if we could help {company_name} with [specific challenge].

Would you be open to a 15-minute call this week?

Best,
{rep_name}
