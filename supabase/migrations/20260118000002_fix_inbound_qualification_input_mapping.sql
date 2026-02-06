-- Fix: Update sequence-inbound-qualification input mapping to use standard parameter names
-- Date: 2026-01-18
--
-- The previous migration used `lead_email`, `lead_name`, `lead_source` but users naturally
-- pass `email`, `name`, `source`. This migration updates the input mapping to accept both.

BEGIN;

-- Update the platform_skills record with corrected input mapping
UPDATE platform_skills
SET frontmatter = '{
  "name": "Inbound Lead Qualification",
  "description": "Instantly qualify, enrich, and route inbound leads with appropriate response speed. Uses available lead data and enrichment services.",
  "triggers": ["new_lead_webhook", "form_submission", "savvycal_booking"],
  "requires_context": ["email"],
  "outputs": ["lead_data", "enriched_contact", "enriched_company", "task_created", "notification_sent"],
  "priority": "critical",
  "agents": ["60"],
  "sequence_steps": [
    {
      "order": 1,
      "action": "get_lead",
      "input_mapping": {
        "email": "${trigger.params.email}",
        "name": "${trigger.params.name}"
      },
      "output_key": "lead_data",
      "on_failure": "stop"
    },
    {
      "order": 2,
      "action": "enrich_contact",
      "input_mapping": {
        "email": "${trigger.params.email}",
        "name": "${outputs.lead_data.leads[0].contact.name}",
        "company_name": "${outputs.lead_data.leads[0].domain}"
      },
      "output_key": "enriched_contact",
      "on_failure": "continue"
    },
    {
      "order": 3,
      "action": "enrich_company",
      "input_mapping": {
        "domain": "${outputs.lead_data.leads[0].domain}",
        "name": "${outputs.lead_data.leads[0].domain}"
      },
      "output_key": "enriched_company",
      "on_failure": "continue"
    },
    {
      "order": 4,
      "action": "create_task",
      "input_mapping": {
        "title": "Follow up with inbound lead: ${outputs.lead_data.leads[0].contact.name}",
        "description": "New inbound lead from ${trigger.params.source}.\n\nContact: ${outputs.lead_data.leads[0].contact.name} (${outputs.lead_data.leads[0].contact.email})\nCompany: ${outputs.lead_data.leads[0].domain}\nMeeting: ${outputs.lead_data.leads[0].meeting.title}\n\nEnrichment: ${outputs.enriched_contact.data.name || outputs.enriched_contact.data.title || \"pending\"}",
        "priority": "high",
        "due_date": "${outputs.lead_data.leads[0].meeting.start}"
      },
      "output_key": "task_created",
      "on_failure": "continue",
      "requires_approval": true
    },
    {
      "order": 5,
      "action": "send_notification",
      "input_mapping": {
        "channel": "slack",
        "message": "🚀 New inbound lead qualified!\n\n*Contact:* ${outputs.lead_data.leads[0].contact.name}\n*Email:* ${outputs.lead_data.leads[0].contact.email}\n*Company:* ${outputs.lead_data.leads[0].domain}\n*Source:* ${trigger.params.source}\n*Meeting:* ${outputs.lead_data.leads[0].meeting.title}"
      },
      "output_key": "notification_sent",
      "on_failure": "continue",
      "requires_approval": true
    }
  ]
}'::jsonb,
content_template = '# Inbound Lead Qualification Sequence

This sequence automatically qualifies and processes inbound leads.

## Pipeline Steps
1. **Get Lead Data** - Fetch lead information from the leads table (SavvyCal bookings, form submissions)
2. **Enrich Contact** - Add contact data from enrichment providers (Clearbit, Apollo)
3. **Enrich Company** - Add company data from enrichment providers
4. **Create Task** - Create a follow-up task for the sales rep (requires approval)
5. **Send Notification** - Send Slack notification about the new lead (requires approval)

## Input Context (JSON)
```json
{
  "email": "lead@example.com",
  "name": "John Doe",
  "source": "SavvyCal"
}
```

### Parameters
- `email` (required): Email address of the inbound lead
- `name` (optional): Name of the lead
- `source` (optional): Source of the lead (form, SavvyCal, etc.)

## Response Time SLA
- All steps execute in sequence
- Write actions (task creation, notifications) require approval
- In simulation mode, write actions return previews without executing
',
updated_at = now()
WHERE skill_key = 'sequence-inbound-qualification'
  AND category = 'agent-sequence';

-- Sync the updated frontmatter to all organization_skills entries
UPDATE organization_skills os
SET
  compiled_frontmatter = ps.frontmatter,
  updated_at = now()
FROM platform_skills ps
WHERE os.platform_skill_id = ps.id
  AND os.skill_id = 'sequence-inbound-qualification';

COMMIT;
