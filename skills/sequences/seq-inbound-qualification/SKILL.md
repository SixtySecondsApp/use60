---
name: Inbound Lead Qualification
description: |
  End-to-end inbound lead qualification workflow: find lead in CRM, enrich with web data,
  score against ICP, draft a tiered response email, and create follow-up tasks with SLA.
  Use when a user says "qualify this inbound lead", "new lead came in", "score this prospect",
  "inbound from [company]", or needs to process and route a new inbound lead.
  All write actions (drafting emails, creating tasks) require approval.
metadata:
  author: sixty-ai
  version: "2"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "qualify this inbound lead"
      intent: "inbound_qualification"
      confidence: 0.95
      examples:
        - "qualify this inbound"
        - "process this inbound lead"
        - "qualify the new lead"
    - pattern: "new lead came in"
      intent: "new_lead_processing"
      confidence: 0.90
      examples:
        - "we got a new lead"
        - "new inbound just came in"
        - "incoming lead to process"
    - pattern: "score this prospect"
      intent: "prospect_scoring"
      confidence: 0.90
      examples:
        - "score this inbound prospect"
        - "rate this new lead"
        - "assess this prospect"
    - pattern: "inbound from"
      intent: "inbound_company"
      confidence: 0.90
      examples:
        - "inbound from Acme Corp"
        - "got an inbound from this company"
        - "new lead from a company called"
    - pattern: "route this lead"
      intent: "lead_routing"
      confidence: 0.85
      examples:
        - "route this inbound"
        - "where should this lead go"
        - "triage this new lead"
  keywords:
    - "inbound"
    - "qualify"
    - "qualification"
    - "lead"
    - "score"
    - "prospect"
    - "route"
    - "ICP"
    - "new lead"
    - "triage"
  required_context:
    - lead_email
  outputs:
    - lead_data
    - enrichment
    - qualification
    - email_draft
    - followup_task
  requires_capabilities:
    - crm
    - web_search
    - email
  priority: critical
  linked_skills:
    - lead-research
    - lead-qualification
    - followup-reply-drafter
  workflow:
    - order: 1
      action: search_contacts
      input_mapping:
        query: "${trigger.params.lead_email}"
        email: "${trigger.params.lead_email}"
      output_key: lead_data
      on_failure: continue
    - order: 2
      skill_key: lead-research
      input_mapping:
        lead_name: "${trigger.params.lead_name}"
        company_name: "${trigger.params.company_name}"
        email: "${trigger.params.lead_email}"
      output_key: enrichment
      on_failure: continue
    - order: 3
      skill_key: lead-qualification
      input_mapping:
        lead_data: "${outputs.lead_data}"
        enrichment_data: "${outputs.enrichment}"
        lead_name: "${trigger.params.lead_name}"
        company_name: "${trigger.params.company_name}"
        email: "${trigger.params.lead_email}"
        source: "${trigger.params.lead_source}"
      output_key: qualification
      on_failure: stop
    - order: 4
      skill_key: followup-reply-drafter
      input_mapping:
        context: "Inbound lead qualification response. Tier: ${outputs.qualification.data.qualification_tier}. Score: ${outputs.qualification.data.qualification_score}. Company: ${trigger.params.company_name}. Lead: ${trigger.params.lead_name}. Strengths: ${outputs.qualification.data.strengths}. Next action: ${outputs.qualification.data.next_action.action}."
        tone: "${outputs.qualification.data.qualification_tier == 'hot' ? 'professional' : outputs.qualification.data.qualification_tier == 'warm' ? 'friendly' : 'professional'}"
        recipient_name: "${trigger.params.lead_name}"
      output_key: email_draft
      on_failure: continue
      requires_approval: true
    - order: 5
      action: create_task
      input_mapping:
        title: "Follow up with ${trigger.params.lead_name} (${outputs.qualification.data.qualification_tier} lead)"
        description: "Qualification tier: ${outputs.qualification.data.qualification_tier} (score: ${outputs.qualification.data.qualification_score}). ${outputs.qualification.data.qualification_summary}. Next action: ${outputs.qualification.data.next_action.action}."
        due_date: "${outputs.qualification.data.next_action.timeline}"
        priority: "${outputs.qualification.data.next_action.priority}"
        contact_id: "${outputs.lead_data.contacts[0].id}"
      output_key: followup_task
      on_failure: continue
      requires_approval: true
  tags:
    - agent-sequence
    - inbound
    - qualification
    - leads
    - routing
---

# Inbound Lead Qualification Sequence

This sequence orchestrates end-to-end inbound lead qualification:
1. Searches CRM for existing lead/contact record
2. Enriches the lead with web research (Gemini + Google Search)
3. Scores and qualifies against ICP criteria
4. Drafts a tiered response email (Hot=personalized, Warm=template, Cold=nurture)
5. Creates a follow-up task with SLA based on qualification tier

**Routing Logic:**
- **Hot** (score >= 4.0): Personalized response, book meeting within 24 hours
- **Warm** (score 3.0 - 3.9): Templated follow-up, respond within 48 hours
- **Cold** (score < 3.0): Nurture sequence, weekly cadence

**All write actions require approval** before execution.
