---
name: Slack Contact Query
namespace: slack
description: |
  Look up contact and company information from Slack DM.
  Use when a Slack user asks who someone is, wants details about a person or company,
  or asks what we know about a contact. Returns contact profile, title, company, email,
  and related deals as Slack Block Kit cards.
metadata:
  author: sixty-ai
  version: "1"
  category: slack-copilot
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - slack
  triggers:
    - pattern: "who is [name]"
      intent: "contact_query"
      confidence: 0.90
      examples:
        - "who is Sarah Chen?"
        - "who's the contact at Acme?"
        - "who is John Smith?"
    - pattern: "tell me about [contact]"
      intent: "contact_lookup"
      confidence: 0.85
      examples:
        - "tell me about Sarah Chen"
        - "tell me about Acme Corp"
        - "what do we know about GlobalTech?"
    - pattern: "info on [person]"
      intent: "contact_info"
      confidence: 0.82
      examples:
        - "info on John Smith"
        - "details on Sarah Chen"
        - "details about the TechCorp contact"
        - "what do we know about Mark Johnson?"
  keywords:
    - "who is"
    - "who's"
    - "tell me about"
    - "info on"
    - "details on"
    - "details about"
    - "what do we know"
    - "contact"
    - "person"
    - "company"
  required_context:
    - slack_user_id
  inputs:
    - name: contact_name
      type: string
      description: "Person name extracted from the Slack message"
      required: false
    - name: company_name
      type: string
      description: "Company name extracted from the Slack message"
      required: false
    - name: raw_query
      type: string
      description: "The original Slack message text"
      required: true
  outputs:
    - name: slack_blocks
      type: array
      description: "Slack Block Kit blocks to render in the DM response"
    - name: text
      type: string
      description: "Fallback plain text if blocks are unavailable"
  requires_capabilities:
    - crm
  priority: high
  tags:
    - slack
    - contact
    - person
    - company
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Slack Contact Query

## Goal
Return a concise contact profile card in Slack when a user asks about a person or company. Slack context means the user needs a quick snapshot — not a full CRM record.

## Intent Patterns

### Single Contact Found
1. Search contacts by `contact_name` or `company_name` (case-insensitive partial match)
2. If exactly one contact matches, show their profile card

**Contact card format**:
- Section: `*Full Name*`
- Fields: Title | Company | Email
- Related deals (if any, up to 3): "Related Deals:" followed by `• *Deal Title* — Stage` per deal
  - Match deals where deal title contains the contact's company name
- Divider
- Context: link to full contact profile in app (`/contacts/{id}`)

### Multiple Contacts Found
1. List up to 5 matches
2. Format: `• *Full Name* — Title at Company`
3. Context: "Be more specific — e.g. 'Tell me about Sarah Chen at Acme'"

### No Contact Found
Return plain text: `I couldn't find any contacts matching "{name}". Check the spelling or try a different name.`

## Data Sources

- **Contact search**: `execute_action("search_contacts", { query: contact_name || company_name, owner: slack_user_id })`
- **Related deals**: `execute_action("list_deals", { status: "active" })` — filter by company name overlap client-side

## Response Constraints

- Show email only if available — do not show "Not available" placeholder if empty (omit the field)
- Company name takes priority for disambiguation when both contact name and company are mentioned
- Keep related deals limited to 3 — link to full profile for more
- Name formatting: `${first_name} ${last_name}`.trim() — never show "Unknown" if first or last is available
- Always include the deep-link to the contact's full profile as the last element

## Error Cases

- **No contacts matching**: Plain text with the searched name and suggestion to check spelling
- **Contact with no email**: Omit the email field rather than showing "Not available"
- **No related deals**: Skip the "Related Deals" section entirely — don't show an empty section
