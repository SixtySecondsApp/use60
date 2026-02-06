-- Seed: Follow-Up Zero Inbox (everyday workflow #2)
-- Date: 2026-01-14
--
-- Adds:
-- - Skill: followup-triage
-- - Skill: followup-reply-drafter
-- - Sequence: seq-followup-zero-inbox
--
-- Safe to re-run (UPSERT by unique skill_key)

BEGIN;

-- -----------------------------------------------------------------------------
-- Skill: Follow-Up Triage
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'followup-triage',
  'sales-ai',
  '{
    "name": "Follow-Up Triage",
    "description": "Identify email threads needing response: unanswered questions, promised deliverables, stale conversations.",
    "version": 1,
    "requires_capabilities": ["email", "crm"],
    "requires_context": ["email_threads", "recent_contacts"],
    "outputs": ["threads_needing_response", "priorities"],
    "triggers": ["user_request", "email_received"],
    "priority": "high"
  }'::jsonb,
  E'# Follow-Up Triage\n\n## Goal\nIdentify **email threads** that need a response: unanswered questions, promised deliverables, stale conversations.\n\n## Inputs\n- `email_threads`: from `execute_action("search_emails", { limit: 50 })` (recent emails)\n- `recent_contacts`: from `execute_action("get_contacts_needing_attention", { days_since_contact: 7, limit: 20 })`\n\n## Output Contract\nReturn a SkillResult with:\n- `data.threads_needing_response`: array of 5-10 threads\n  - `thread_id`: string | null\n  - `contact_email`: string\n  - `contact_id`: string | null\n  - `subject`: string\n  - `last_message_date`: string (ISO date)\n  - `reason`: string (why it needs response: "unanswered_question", "promised_deliverable", "stale_conversation", "follow_up_requested")\n  - `urgency`: "high" | "medium" | "low"\n  - `context`: string (deal name, company, etc.)\n- `data.priorities`: array of top 3 threads (most urgent)\n\n## Guidance\n- Prioritize by: unanswered questions > promised deliverables > stale conversations.\n- If a thread is linked to a deal (via contact_id → deal), include deal context.\n- Mark as "high" urgency if: unanswered question > 2 days old, promised deliverable past due, or deal-related.\n',
  true
)
ON CONFLICT (skill_key)
DO UPDATE SET
  category = EXCLUDED.category,
  frontmatter = EXCLUDED.frontmatter,
  content_template = EXCLUDED.content_template,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Skill: Follow-Up Reply Drafter
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'followup-reply-drafter',
  'writing',
  '{
    "name": "Follow-Up Reply Drafter",
    "description": "Draft contextual reply emails for threads needing response, with suggested subject lines and clear CTAs.",
    "version": 1,
    "requires_capabilities": ["email", "crm"],
    "requires_context": ["threads_needing_response", "contact_data"],
    "outputs": ["reply_drafts", "task_previews"],
    "triggers": ["followup_triage_complete"],
    "priority": "high"
  }'::jsonb,
  E'# Follow-Up Reply Drafter\n\n## Goal\nDraft **contextual reply emails** for threads needing response, with suggested subject lines and clear CTAs.\n\n## Inputs\n- `threads_needing_response`: output from `followup-triage`\n- `contact_data`: from `execute_action("get_contact", { id })` for each thread''s contact_id\n\n## Output Contract\nReturn a SkillResult with:\n- `data.reply_drafts`: array of 3-5 email drafts (top threads)\n  - `to`: string (contact email)\n  - `subject`: string (suggested subject, e.g., "Re: [original subject]")\n  - `context`: string (structured bullets for the email writer)\n  - `tone`: "professional" | "friendly" | "executive"\n  - `thread_id`: string | null\n  - `contact_id`: string | null\n  - `deal_id`: string | null\n- `data.task_previews`: array of 2-3 task previews (for follow-up actions)\n  - `title`: string\n  - `description`: string\n  - `due_date`: string (ISO date, prefer "tomorrow")\n  - `priority`: "high" | "medium" | "low"\n  - `contact_id`: string | null\n  - `deal_id`: string | null\n\n## Guidance\n- Use thread context to acknowledge what was asked/promised.\n- Keep replies **short** (<= 150 words) with a single clear CTA.\n- If thread is deal-related, include deal context subtly.\n- Task previews should be: 1 internal follow-up, 1 customer-facing action.\n',
  true
)
ON CONFLICT (skill_key)
DO UPDATE SET
  category = EXCLUDED.category,
  frontmatter = EXCLUDED.frontmatter,
  content_template = EXCLUDED.content_template,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Sequence: Follow-Up Zero Inbox
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'seq-followup-zero-inbox',
  'agent-sequence',
  '{
    "name": "Follow-Up Zero Inbox",
    "description": "Identify email threads needing response, draft replies, and create follow-up tasks (approval-gated).",
    "version": 1,
    "requires_capabilities": ["email", "crm", "tasks"],
    "requires_context": [],
    "outputs": ["email_threads", "triage", "reply_drafts", "task_preview"],
    "triggers": ["user_request", "email_received"],
    "priority": "high",
    "sequence_steps": [
      {
        "order": 1,
        "action": "search_emails",
        "input_mapping": {
          "limit": 50
        },
        "output_key": "email_threads",
        "on_failure": "continue"
      },
      {
        "order": 2,
        "action": "get_contacts_needing_attention",
        "input_mapping": {
          "days_since_contact": 7,
          "limit": 20
        },
        "output_key": "recent_contacts",
        "on_failure": "continue"
      },
      {
        "order": 3,
        "skill_key": "followup-triage",
        "input_mapping": {
          "email_threads": "${outputs.email_threads}",
          "recent_contacts": "${outputs.recent_contacts}"
        },
        "output_key": "triage",
        "on_failure": "stop"
      },
      {
        "order": 4,
        "action": "get_contact",
        "input_mapping": {
          "id": "${outputs.triage.threads_needing_response[0].contact_id}"
        },
        "output_key": "contact_data",
        "on_failure": "continue"
      },
      {
        "order": 5,
        "skill_key": "followup-reply-drafter",
        "input_mapping": {
          "threads_needing_response": "${outputs.triage.threads_needing_response}",
          "contact_data": "${outputs.contact_data}"
        },
        "output_key": "reply_drafts",
        "on_failure": "stop"
      },
      {
        "order": 6,
        "action": "draft_email",
        "input_mapping": {
          "to": "${outputs.reply_drafts.reply_drafts[0].to}",
          "subject": "${outputs.reply_drafts.reply_drafts[0].subject}",
          "context": "${outputs.reply_drafts.reply_drafts[0].context}",
          "tone": "${outputs.reply_drafts.reply_drafts[0].tone}"
        },
        "output_key": "email_preview",
        "on_failure": "continue"
      },
      {
        "order": 7,
        "action": "create_task",
        "input_mapping": {
          "title": "${outputs.reply_drafts.task_previews[0].title}",
          "description": "${outputs.reply_drafts.task_previews[0].description}",
          "due_date": "${outputs.reply_drafts.task_previews[0].due_date}",
          "priority": "${outputs.reply_drafts.task_previews[0].priority}",
          "contact_id": "${outputs.reply_drafts.task_previews[0].contact_id}",
          "deal_id": "${outputs.reply_drafts.task_previews[0].deal_id}"
        },
        "output_key": "task_preview",
        "on_failure": "continue",
        "requires_approval": true
      }
    ]
  }'::jsonb,
  E'# Follow-Up Zero Inbox\n\nThis sequence helps reps catch missed follow-ups:\n1. Searches recent emails + contacts needing attention\n2. Identifies threads needing response (unanswered questions, promises, stale)\n3. Drafts reply emails for top threads\n4. Previews email drafts + creates follow-up task (approval-gated)\n',
  true
)
ON CONFLICT (skill_key)
DO UPDATE SET
  category = EXCLUDED.category,
  frontmatter = EXCLUDED.frontmatter,
  content_template = EXCLUDED.content_template,
  is_active = EXCLUDED.is_active,
  updated_at = now();

COMMIT;
