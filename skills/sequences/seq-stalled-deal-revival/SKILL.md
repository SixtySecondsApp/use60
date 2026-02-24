---
name: Stalled Deal Revival
description: |
  Revive stalled deals by detecting stale opportunities, researching re-engagement triggers,
  generating a rescue strategy, and drafting re-engagement outreach. Use when a user says
  "revive stalled deals", "re-engage cold deals", "deals that went dark", "bring back dead deals",
  or needs to identify and act on deals that have gone silent. All write actions require approval.
metadata:
  author: sixty-ai
  version: "2"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "revive stalled deals"
      intent: "stalled_deal_revival"
      confidence: 0.95
      examples:
        - "revive my stalled deals"
        - "wake up stalled pipeline"
        - "bring stalled deals back to life"
    - pattern: "re-engage cold deals"
      intent: "cold_deal_reengagement"
      confidence: 0.90
      examples:
        - "re-engage dead deals"
        - "warm up cold deals"
        - "restart cold pipeline"
    - pattern: "deals that went dark"
      intent: "dark_deal_recovery"
      confidence: 0.90
      examples:
        - "deals gone dark"
        - "prospects that went silent"
        - "deals with no response"
    - pattern: "bring back dead deals"
      intent: "dead_deal_revival"
      confidence: 0.90
      examples:
        - "resurrect dead deals"
        - "recover lost deals"
        - "reactivate old deals"
    - pattern: "what deals are stuck"
      intent: "stalled_deal_detection"
      confidence: 0.85
      examples:
        - "which deals are stalled"
        - "find stuck deals"
        - "show me stagnant deals"
  keywords:
    - "stalled"
    - "revive"
    - "revival"
    - "re-engage"
    - "cold"
    - "dark"
    - "dead"
    - "stuck"
    - "silent"
    - "reactivate"
  required_context: []
  outputs:
    - stalled_deals
    - enrichment
    - rescue_plan
    - email_draft
    - followup_tasks
  requires_capabilities:
    - crm
    - web_search
    - email
  priority: critical
  linked_skills:
    - lead-research
    - deal-rescue-plan
    - followup-reply-drafter
  workflow:
    - order: 1
      action: get_deals
      input_mapping:
        filters: "stalled"
        include_health: true
        days_inactive: 14
      output_key: stalled_deals
      on_failure: stop
    - order: 2
      skill_key: lead-research
      input_mapping:
        lead_name: "${outputs.stalled_deals.deals[0].primary_contact_name}"
        company_name: "${outputs.stalled_deals.deals[0].company_name}"
        email: "${outputs.stalled_deals.deals[0].primary_contact_email}"
      output_key: enrichment
      on_failure: continue
    - order: 3
      skill_key: deal-rescue-plan
      input_mapping:
        deal: "${outputs.stalled_deals.deals[0]}"
        deal_id: "${outputs.stalled_deals.deals[0].id}"
        deal_context:
          enrichment: "${outputs.enrichment}"
          recent_triggers: "${outputs.enrichment.data.recent_news}"
          hiring_signals: "${outputs.enrichment.data.enrichment_data.hiring_signals}"
          funding: "${outputs.enrichment.data.enrichment_data.funding}"
      output_key: rescue_plan
      on_failure: stop
    - order: 4
      skill_key: followup-reply-drafter
      input_mapping:
        context: "Re-engagement email for stalled deal. Company: ${outputs.stalled_deals.deals[0].company_name}. Days inactive: ${outputs.stalled_deals.deals[0].days_in_stage}. Trigger: ${outputs.enrichment.data.recent_news[0].summary}. Rescue strategy: ${outputs.rescue_plan.data.rescue_plan[0].action}. Previous last note: ${outputs.stalled_deals.deals[0].last_activity_note}."
        tone: "professional"
        recipient_name: "${outputs.stalled_deals.deals[0].primary_contact_name}"
      output_key: email_draft
      on_failure: continue
      requires_approval: true
    - order: 5
      action: create_task
      input_mapping:
        title: "Re-engage: ${outputs.stalled_deals.deals[0].company_name} (${outputs.stalled_deals.deals[0].days_in_stage} days stalled)"
        description: "Deal revival follow-up cadence. Strategy: ${outputs.rescue_plan.data.rescue_plan[0].action}. Trigger found: ${outputs.enrichment.data.recent_news[0].title}. MAP tasks: ${outputs.rescue_plan.data.map_tasks[0].title}."
        due_date: "${outputs.rescue_plan.data.map_tasks[0].due_date}"
        priority: "${outputs.rescue_plan.data.map_tasks[0].priority}"
        deal_id: "${outputs.stalled_deals.deals[0].id}"
      output_key: followup_tasks
      on_failure: continue
      requires_approval: true
  tags:
    - agent-sequence
    - deal-revival
    - stalled
    - re-engagement
    - pipeline
---

## Available Context
@_platform-references/org-variables.md

# Stalled Deal Revival Sequence

This sequence orchestrates stalled deal recovery:
1. Finds stalled/inactive deals from the pipeline
2. Researches the contact for recent activity triggers (job change, company news, funding)
3. Generates a rescue strategy with concrete actions
4. Drafts a re-engagement email with a relevant trigger/hook
5. Creates follow-up tasks for a recovery cadence

**Stall Detection Thresholds:**
- Discovery: 14 days no activity
- Evaluation: 21 days no activity
- Proposal: 14 days no activity
- Negotiation: 7 days no activity
- Closed Lost (recent): 90 days for check-in

**Trigger Types Detected:**
- Funding announced
- New leadership (especially sales/ops)
- Hiring surge in relevant roles
- Company news or PR
- Champion job change
- Tech stack change

**All write actions require approval** before execution.
