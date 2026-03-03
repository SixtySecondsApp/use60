# Progress — Proposal → Deal → Deal Room Pipeline

## Feature: PDR (proposal-deal-room-pipeline)

### Key Discovery
- Slack tables (slack_deal_rooms, slack_org_settings, etc.) **already exist on staging** — migrations were archived but tables are live
- Slack is connected for org `1d1b4274` with deal_rooms feature enabled
- Opportunity stage ID: `8be6a854-e7d0-41b5-9057-03b2213e7697`
- No schema migrations needed — all tables are in place

### Decisions (from consult)
- Deal stage: **Opportunity** (no new stage)
- Deal creation: **Auto-create** if none exists, from meeting context
- Room trigger: **Every proposal** that reaches 'ready'
- Room content: **Full briefing pack** (PDF + summary + meeting highlights + next steps)
- Room members: **Deal owner + configured stakeholders**
- Enrichment: **Async** after proposal ready (~60s follow-up)
- Existing deals: **Advance to Opportunity** (if earlier) + post to existing room

---

## Session Log

### 2026-03-03 — PDR-001 ✅
**Story**: Fix proposal metadata resolution (prepared_by, client name, company)
**Files**: supabase/functions/proposal-render-gotenberg/index.ts
**Changes**:
- ProfileRow interface: `first_name` + `last_name` (not `full_name`)
- Profile query selects correct columns
- Added `companyNameFromEmail()` helper — extracts company from email domain (e.g. `owen@aprilking.co.uk` → "April King"), skips free providers
- `preparedBy` now constructs full name from `first_name + last_name`
- `clientCompany` falls back to domain extraction before org name
- `clientName` falls back to email username as last resort
- Deployed to staging

---

### 2026-03-03 — PDR-003 ✅ (parallel with PDR-004)
**Story**: Wire proposal 'ready' status to trigger deal room creation
**Files**: supabase/functions/proposal-pipeline-v2/index.ts
**Changes**:
- Added Stage 5b after delivery: checks for existing deal room
- If no room + Slack deal_rooms enabled: invokes slack-deal-room to create channel
- If room exists: skips creation (PDR-005 handles posting)
- Checks slack_notification_settings for deal_rooms feature enabled
- Non-fatal: deal room failure logged but never blocks pipeline
- Deployed to staging

---

### 2026-03-03 — PDR-004 ✅ (parallel with PDR-003)
**Story**: Build full briefing pack Slack message for deal rooms
**Files**: supabase/functions/_shared/slackBlocks.ts, supabase/functions/slack-deal-room-update/index.ts
**Changes**:
- Added ProposalBriefingData interface + buildProposalBriefingMessage() to slackBlocks.ts
- Block Kit message: header, title/company/value, meeting highlights (top 3), next steps, action items, Download PDF + View Deal buttons, trigger context
- Uses existing safety helpers (safeHeaderText, safeMrkdwn, truncate)
- Added 'proposal_briefing' to UpdateType in slack-deal-room-update
- Wired case handler to buildProposalBriefingMessage
- Deployed to staging

---

### 2026-03-03 — PDR-006 + PDR-007 ✅
**Story**: Async company research enrichment + deal room posting
**Files**: supabase/functions/proposal-enrich-deal/index.ts (NEW), supabase/functions/proposal-pipeline-v2/index.ts
**Changes**:
- New edge function `proposal-enrich-deal`:
  - Extracts domain from contact email, skips free providers
  - Runs company-research skill via `executeAgentSkillWithContract`
  - Updates contact: full_name, title, company (if null)
  - Updates deal: company name (if "Unknown Company"), description with research report
  - Posts enrichment summary to deal room (company overview, key people, funding, tech stack, buying signals)
  - Threads message under the briefing post using briefing_slack_ts
  - Entirely non-fatal — errors logged but never surface to user
- Pipeline trigger: fire-and-forget Stage 6 after final status update
  - Passes briefing_slack_ts from PDR-005 for threading
  - Uses `.then()/.catch()` pattern — pipeline response is not delayed
- Both deployed to staging

---

### 2026-03-03 — PDR-005 ✅
**Story**: Post briefing pack into deal room on proposal ready
**Files**: supabase/functions/proposal-pipeline-v2/index.ts
**Changes**:
- Added Stage 5c after room creation: gathers proposal context, deal, contact, meeting summary
- Extracts meeting highlights from ai_summary (key_points/highlights)
- Extracts next_steps and action_items from context_payload
- Calls slack-deal-room-update with proposal_briefing payload
- Dedup check via slack_notifications_sent (entity_type=proposal_briefing)
- Non-fatal: briefing failure logged but never blocks pipeline
- Deployed to staging

---

### 2026-03-03 — PDR-002 ✅
**Story**: Add deal auto-create/update logic to proposal pipeline
**Files**: supabase/functions/proposal-pipeline-v2/index.ts
**Changes**:
- Added Stage 0 (pre-assembly) deal resolution block
- Auto-create: when no deal_id, creates deal from contact/meeting context with Opportunity stage
- Company name resolved from: contact.company → email domain extraction → "Unknown Company"
- Auto-advance: when deal exists at SQL stage, advances to Opportunity
- Never downgrades deal stage (Verbal/Signed stays as-is)
- deal_id written back to proposal row and passed to subsequent stages
- Entire block is non-fatal — deal failures never block the pipeline
- Deployed to staging
