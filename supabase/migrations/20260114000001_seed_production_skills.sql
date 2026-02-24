-- Seed: Production Skills (capability-driven)
-- Date: 2026-01-14
--
-- NOTE: This file is intentionally placed in supabase/migrations/ so deploy scripts apply it.
-- Safe to re-run (UPSERT by unique skill_key)

BEGIN;

-- -----------------------------------------------------------------------------
-- Skill 1: Meeting Prep Brief
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'meeting-prep-brief',
  'sales-ai',
  '{
    "name": "Meeting Prep Brief",
    "description": "Generate a comprehensive pre-meeting brief with agenda, talking points, and risk assessment. Uses calendar, CRM, and optional transcript data.",
    "version": 1,
    "requires_capabilities": ["calendar", "crm"],
    "requires_context": ["meeting_id", "event_id"],
    "outputs": ["brief", "agenda", "talking_points", "risks", "questions", "context_summary"],
    "triggers": ["meeting_scheduled", "before_meeting"],
    "priority": "high"
  }'::jsonb,
  E'# Meeting Prep Brief\n\n## Goal\nGenerate a comprehensive pre-meeting brief that helps sales reps prepare effectively.\n\n## Required Capabilities\n- **Calendar**: To fetch meeting details, attendees, and context\n- **CRM**: To pull related deals, contacts, and company information\n- **Transcript** (optional): To reference previous meeting notes\n\n## Inputs\n- `meeting_id` or `event_id`: The calendar event identifier\n- `organization_id`: Current organization context\n\n## Data Gathering (via execute_action)\n1. Fetch meeting details: `execute_action("get_meetings", { meeting_id })`\n2. Fetch primary contact (preferred): `execute_action("get_contact", { id: primary_contact_id })`\n3. Fetch related deals (best-effort): `execute_action("get_deal", { name: company_or_deal_name })`\n4. Fetch company status: `execute_action("get_company_status", { company_name })`\n5. (Optional) Search for previous meeting transcripts if transcript capability available\n\n## Output Contract\nReturn a SkillResult with:\n- `data.brief`: Structured brief object with:\n  - `meeting_title`: Meeting subject/title\n  - `attendees`: Array of attendee objects (name, email, role, company)\n  - `meeting_goals`: Primary objectives for this meeting\n  - `context_summary`: Key context from CRM (deal stage, recent activity, relationship health)\n  - `agenda`: Suggested agenda items\n  - `talking_points`: Key points to cover (aligned to deal stage and company needs)\n  - `questions`: Strategic questions to ask\n  - `risks`: Potential risks or objections to prepare for\n  - `success_criteria`: What "good" looks like for this meeting\n- `data.context_summary`: High-level summary of relationship/deal context\n- `references`: Links to related CRM records, previous meetings, etc.\n\n## Guidelines\n- Use organization context (company_name, brand_tone, products) to personalize talking points\n- Reference deal stage to suggest appropriate next steps\n- Flag any red flags or risks from CRM data\n- Keep brief concise but actionable (aim for 1-page summary)\n',
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
-- Skill 2: Meeting Digest Truth Extractor
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'meeting-digest-truth-extractor',
  'sales-ai',
  '{
    "name": "Meeting Digest Truth Extractor",
    "description": "Extract decisions, commitments, MEDDICC deltas, risks, and stakeholders from meeting transcripts. Enforces truth hierarchy (CRM > transcript > notes).",
    "version": 1,
    "requires_capabilities": ["meetings", "crm"],
    "requires_context": ["meeting_id", "transcript_id"],
    "outputs": ["decisions", "commitments", "meddicc_deltas", "risks", "stakeholders", "unknowns", "next_steps"],
    "triggers": ["meeting_ended", "transcript_ready"],
    "priority": "critical"
  }'::jsonb,
  E'# Meeting Digest Truth Extractor\n\n## Goal\nExtract structured, actionable truth from meeting transcripts with strict contract output.\n\n## Required Capabilities\n- **Transcript**: To access meeting transcript/recording\n- **CRM**: To validate and enrich extracted data against CRM records\n\n## Inputs\n- `meeting_id`: The meeting identifier\n- `transcript_id` or `transcript`: Transcript content or reference\n- `organization_id`: Current organization context\n\n## Data Gathering (via execute_action)\n1. Fetch transcript: Use transcript capability to get full transcript\n2. Fetch related CRM data: `execute_action("get_deal", { id: deal_id })`\n3. Fetch contact details: `execute_action("get_contact", { id: contact_id })`\n4. Fetch company info: `execute_action("get_company_status", { company_name })`\n\n## Truth Hierarchy (enforced)\n1. **CRM data** (highest priority): If CRM says deal stage is "negotiation", trust that over transcript mentions\n2. **Transcript** (medium priority): Explicit statements in transcript\n3. **User notes** (lowest priority): Only if no CRM/transcript data\n\n## Output Contract\nReturn a SkillResult with:\n- `data.decisions`: Array of decision objects:\n  - `decision`: What was decided\n  - `decision_maker`: Who made it\n  - `confidence`: High/Medium/Low\n  - `source`: "crm" | "transcript" | "inferred"\n- `data.commitments`: Array of commitment objects:\n  - `commitment`: What was committed to\n  - `owner`: Who committed (name, email)\n  - `deadline`: When (if mentioned)\n  - `status`: "explicit" | "implied"\n  - `missing_info`: What info is missing (owner, deadline, etc.)\n- `data.meddicc_deltas`: Object with MEDDICC field changes:\n  - `metrics`: Changes to success metrics\n  - `economic_buyer`: Changes to decision maker\n  - `decision_criteria`: Changes to evaluation criteria\n  - `decision_process`: Changes to process/timeline\n  - `identify_pain`: New pain points identified\n  - `champion`: Champion status changes\n  - `competition`: Competitive mentions\n- `data.risks`: Array of risk objects:\n  - `risk`: Description of risk\n  - `severity`: High/Medium/Low\n  - `mitigation`: Suggested mitigation\n- `data.stakeholders`: Array of stakeholder objects:\n  - `name`: Stakeholder name\n  - `role`: Their role/title\n  - `influence`: High/Medium/Low\n  - `sentiment`: Positive/Neutral/Negative\n- `data.unknowns`: Array of questions/unknowns that need follow-up\n- `data.next_steps`: Array of recommended next steps with owners and deadlines\n- `references`: Links to transcript, CRM records, etc.\n\n## Guidelines\n- De-duplicate contradictions using truth hierarchy\n- Flag missing information (e.g., commitment without owner)\n- Extract explicit quotes for "what we heard" sections\n- Be conservative: if uncertain, mark confidence as Low\n',
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
-- Skill 3: Post-Meeting Follow-up Drafter
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'post-meeting-followup-drafter',
  'writing',
  '{
    "name": "Post-Meeting Follow-up Drafter",
    "description": "Generate follow-up email and internal Slack update from meeting digest. Includes recap, value, decisions, and clear CTAs. Approval-gated for sending.",
    "version": 1,
    "requires_capabilities": ["email", "messaging"],
    "requires_context": ["meeting_digest", "meeting_id"],
    "outputs": ["email_draft", "slack_update", "subject_lines", "cta"],
    "triggers": ["meeting_digest_complete"],
    "priority": "high"
  }'::jsonb,
  E'# Post-Meeting Follow-up Drafter\n\n## Goal\nGenerate professional follow-up communications (email + Slack) that recap meeting value and drive next steps.\n\n## Required Capabilities\n- **Email**: To draft and send follow-up emails\n- **Messaging**: To post internal Slack updates\n\n## Inputs\n- `meeting_digest`: Output from meeting-digest-truth-extractor\n- `meeting_id`: Meeting identifier\n- `organization_id`: Current organization context\n\n## Data Gathering (via execute_action)\n1. Fetch meeting details: `execute_action("get_meetings", { meeting_id })`\n2. Fetch contact details: `execute_action("get_contact", { id: contact_id })`\n3. Fetch deal context: `execute_action("get_deal", { id: deal_id })`\n\n## Output Contract\nReturn a SkillResult with:\n- `data.email_draft`: Email draft object:\n  - `subject`: Subject line (with variants)\n  - `body`: Email body (structured sections)\n  - `to`: Recipient email(s)\n  - `cc`: CC recipients (if any)\n  - `sections`: Array of sections:\n    - `type`: "recap" | "value" | "decisions" | "next_steps" | "cta"\n    - `content`: Section content\n    - `quotes`: Relevant quotes from meeting\n- `data.slack_update`: Internal Slack update object:\n  - `channel`: Suggested channel\n  - `message`: Slack-formatted message\n  - `thread_ts`: Optional thread timestamp\n- `data.subject_lines`: Array of subject line options\n- `data.cta`: Clear call-to-action for the email\n- `data.approval_required`: true (always require approval for sending)\n\n## Structure Requirements\n1. **Recap**: Brief summary of what was discussed\n2. **Value**: What value was delivered/created in the meeting\n3. **Decisions**: Key decisions made (with quotes if available)\n4. **Next Steps**: Clear action items with owners and deadlines\n5. **CTA**: Specific next action requested\n\n## Guidelines\n- Use organization brand_tone and writing_style\n- Include "what we heard" quotes from transcript\n- Avoid risky claims (use organization words_to_avoid list)\n- Make CTAs specific and time-bound\n- Generate both short and long email variants\n- Always require approval before sending (approval-gated)\n',
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
-- Skill 4: Deal Next Best Actions
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'deal-next-best-actions',
  'sales-ai',
  '{
    "name": "Deal Next Best Actions",
    "description": "Generate stage-aware, capacity-aware ranked action plan for a deal. Considers deal stage, recent activity, and user capacity.",
    "version": 1,
    "requires_capabilities": ["crm"],
    "requires_context": ["deal_id"],
    "outputs": ["actions", "priorities", "roi_rationale", "minimum_viable_action"],
    "triggers": ["deal_updated", "deal_stage_changed", "user_request"],
    "priority": "high"
  }'::jsonb,
  E'# Deal Next Best Actions\n\n## Goal\nGenerate a ranked, prioritized action plan for advancing a deal based on stage, activity patterns, and capacity.\n\n## Required Capabilities\n- **CRM**: To fetch deal data, stage, recent activity, and related records\n\n## Inputs\n- `deal_id`: The deal identifier\n- `user_capacity` (optional): "busy" | "normal" | "available"\n- `organization_id`: Current organization context\n\n## Data Gathering (via execute_action)\n1. Fetch deal: `execute_action("get_deal", { id: deal_id })`\n2. Fetch pipeline summary: `execute_action("get_pipeline_summary", {})`\n3. Fetch recent activity signals: `execute_action("get_contacts_needing_attention", { days_since_contact: 7, filter: "at_risk" })`\n4. Fetch tasks: `execute_action("list_tasks", { deal_id })`\n\n## Output Contract\nReturn a SkillResult with:\n- `data.actions`: Array of action objects (ranked by priority):\n  - `action_type`: "email" | "call" | "meeting" | "task" | "crm_update" | "research"\n  - `title`: Action title\n  - `description`: What to do\n  - `priority`: "urgent" | "high" | "medium" | "low"\n  - `roi_rationale`: Why this action matters\n  - `estimated_time`: Time estimate (minutes)\n  - `deadline`: Recommended deadline\n  - `owner`: Suggested owner\n  - `dependencies`: Other actions this depends on\n- `data.priorities`: Summary of priority distribution\n- `data.roi_rationale`: Overall rationale for the action plan\n- `data.minimum_viable_action`: If user is busy, the single most important action\n- `data.stage_insights`: Insights about deal stage and what typically works\n\n## Guidelines\n- Consider deal stage: different stages need different actions\n- Factor in activity recency: if no activity in 7 days, prioritize re-engagement\n- Respect user capacity: if "busy", return only minimum_viable_action\n- Rank by ROI: actions that move deal forward fastest get highest priority\n- Include time estimates so user can plan\n- Reference organization sales methodology if available\n',
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
-- Skill 5: Objection to Playbook Mapper
-- -----------------------------------------------------------------------------
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'objection-to-playbook',
  'sales-ai',
  '{
    "name": "Objection to Playbook Mapper",
    "description": "Map objections to approved playbook responses with proof points, discovery questions, and disqualifiers. Enforces compliance constraints.",
    "version": 1,
    "requires_capabilities": ["crm", "meetings"],
    "requires_context": ["objection", "deal_id"],
    "outputs": ["playbook_match", "response", "proof_points", "discovery_questions", "disqualifiers", "allowed_claims", "banned_phrases"],
    "triggers": ["objection_detected", "user_request"],
    "priority": "high"
  }'::jsonb,
  E'# Objection to Playbook Mapper\n\n## Goal\nMap sales objections to approved playbook responses with compliance-safe guidance.\n\n## Required Capabilities\n- **CRM**: To fetch deal context and company information\n- **Transcript**: To analyze objection context from meeting transcripts\n\n## Inputs\n- `objection`: The objection text or identifier\n- `deal_id`: Related deal (for context)\n- `organization_id`: Current organization context\n\n## Data Gathering (via execute_action)\n1. Fetch deal: `execute_action("get_deal", { id: deal_id })`\n2. Fetch company: `execute_action("get_company_status", { company_name })`\n3. (Optional) Search transcripts: If transcript capability available, search for similar objections\n\n## Output Contract\nReturn a SkillResult with:\n- `data.playbook_match`: Playbook match object:\n  - `objection_type`: Categorized objection type\n  - `playbook_section`: Which playbook section applies\n  - `confidence`: Match confidence (High/Medium/Low)\n- `data.response`: Response object:\n  - `opening`: How to acknowledge the objection\n  - `main_response`: Core response content\n  - `closing`: How to transition to next topic\n  - `tone`: Recommended tone (empathetic, confident, etc.)\n- `data.proof_points`: Array of proof points:\n  - `point`: The proof point\n  - `source`: Where it comes from (case study, data, etc.)\n  - `relevance`: Why it addresses this objection\n- `data.discovery_questions`: Array of questions to ask:\n  - `question`: The question\n  - `purpose`: Why to ask it\n  - `follow_up`: What to do with the answer\n- `data.disqualifiers`: Array of disqualification criteria:\n  - `criteria`: What would disqualify this prospect\n  - `question`: Question to assess this\n- `data.allowed_claims`: Array of claims that are safe to make\n- `data.banned_phrases`: Array of phrases to avoid (from organization context)\n- `references`: Links to playbook, case studies, etc.\n\n## Guidelines\n- Use organization context (words_to_avoid, key_phrases) for compliance\n- Map to standard objection categories (price, timing, competition, etc.)\n- Provide multiple response options (short, detailed, empathetic)\n- Include discovery questions to understand root cause\n- Flag if objection suggests disqualification\n- Reference organization-specific proof points when available\n',
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

