# Proposal Engine V2 — Testing Guide

## Prerequisites

### 1. Deploy migrations to staging

```bash
./scripts/deploy-migrations.sh staging --status    # Check current state
./scripts/deploy-migrations.sh staging             # Apply pending migrations
```

Two V2 migrations must be applied:
- `20260302000000_org_offering_profiles.sql` — Offering profile table + RLS
- `20260302000001_proposals_v2_pipeline_columns.sql` — V2 columns on proposals table (`generation_status`, `trigger_type`, `context_payload`, `pdf_url`, `pdf_s3_key`, `credits_used`, `style_config`, `autonomy_tier`)

### 2. Deploy edge functions to staging

```bash
# Deploy all V2 functions
./scripts/deploy-functions-staging.sh proposal-pipeline-v2
./scripts/deploy-functions-staging.sh proposal-assemble-context
./scripts/deploy-functions-staging.sh proposal-compose-v2
./scripts/deploy-functions-staging.sh proposal-render-gotenberg
./scripts/deploy-functions-staging.sh proposal-deliver
./scripts/deploy-functions-staging.sh offering-extract

# Or deploy everything at once
./scripts/deploy-functions-staging.sh
```

### 3. Verify Gotenberg is running on Railway

```bash
# From Railway dashboard or CLI — Gotenberg is on the internal network
# The edge functions call it at: http://gotenberg-pdf.railway.internal:3000
# Check Railway dashboard for gotenberg-pdf service health
```

### 4. Start the dev server against staging

```bash
npm run dev:staging
```

Opens at `localhost:5175` pointed at staging Supabase (`caerqjzvuerejfrdtygb`).

### 5. Test data you need

- A **meeting** with either a Fathom recording or transcript/notes (required for the Quick Generate button to be enabled)
- A **deal** linked to that meeting (optional but strongly recommended — enriches proposal context)
- A **contact** linked to the deal/meeting (optional — used for client name/company in the proposal)

---

## Test 1: Manual Button Trigger (Primary Happy Path)

This is the main flow — one-click proposal from a meeting page.

### Steps

1. Navigate to a **meeting detail page** that has a recording or notes
   - URL: `/meetings/{meeting-id}`

2. In the action bar (below the meeting header, alongside "Add Meeting" / "Add Outbound" buttons), find the **"Generate Proposal"** button (blue, FileText icon)

3. Click it. You should see:
   - Button enters loading state
   - `ProposalProgressOverlay` modal opens immediately
   - 5-stage stepper appears:
     1. **Context Assembly** (Search icon) — gathering deal, contact, meeting, offering data
     2. **AI Composition** (Brain icon) — writing the proposal sections
     3. **Template Merge** (Paintbrush icon) — merging into HTML template
     4. **PDF Rendering** (FileOutput icon) — Gotenberg converting HTML to PDF
     5. **Delivery** (Package icon) — creating activity record + Slack notification

4. Watch each stage light up in sequence. The whole pipeline typically takes **30–90 seconds**.

5. When complete, the overlay shows:
   - PDF thumbnail preview
   - "Download PDF" button — should download a real PDF
   - "Edit Sections" button
   - "Send to Client" button
   - Credits used badge
   - Elapsed time

### What to verify

- [ ] Button is disabled when the meeting has no recording AND no notes
- [ ] Tooltip shows "Recording or notes required" when disabled
- [ ] Overlay opens and stages progress in order
- [ ] No stage gets stuck (if one hangs >60s, something's wrong)
- [ ] PDF thumbnail appears in the done state
- [ ] Download PDF gives you a real, properly formatted document
- [ ] The proposal appears in the database with `trigger_type: 'manual_button'`
- [ ] An activity record was created (check the deal's activity feed)

### If it fails

- Check browser console for errors
- Check the proposal row: `SELECT generation_status, style_config->>'_pipeline_error' FROM proposals WHERE id = '{id}'`
- Check Supabase function logs: Dashboard > Edge Functions > proposal-pipeline-v2 > Logs

---

## Test 2: Post-Generation Editing (UX-006)

### Steps

1. Complete Test 1 (or open the overlay on an existing `ready` proposal)
2. Click **"Edit Sections"** in the done state
3. The overlay switches to edit mode showing each proposal section with:
   - Title field (text input)
   - Content field (textarea)
4. Edit a section title or content
5. Click **"Save & Re-render"**
6. Watch the stepper animate through stages 3–4 only (Template Merge + PDF Rendering — skips context assembly and AI composition)
7. Done state returns with the updated PDF

### What to verify

- [ ] Edit mode loads all sections from `content_json`
- [ ] Changes are saved to the database
- [ ] Re-render only calls `proposal-render-gotenberg` (not the full pipeline)
- [ ] Updated PDF reflects the edits
- [ ] Cancel button exits edit mode without saving
- [ ] Thumbnail updates after re-render

---

## Test 3: Copilot Trigger

### Steps

1. Open the copilot panel (command bar or chat)
2. Navigate to a deal that has meetings
3. Type: **"write a proposal for this deal"** or **"generate a proposal"**
4. The copilot should route to the `generate-proposal-v2` skill
5. A `ProposalPanel` response card should appear showing:
   - PDF thumbnail (or loading spinner while generating)
   - Title, client info
   - Status badge (blue spinner → green checkmark)
   - Action buttons: Download, Edit, Regenerate, Send

### What to verify

- [ ] Copilot correctly identifies proposal intent
- [ ] Pipeline fires with `trigger_type: 'copilot'`
- [ ] ProposalPanel response renders with correct status transitions
- [ ] All action buttons work (Download opens PDF, Edit navigates to proposal)
- [ ] If no deal context, copilot asks "which deal?"

---

## Test 4: Slack Trigger

### Prerequisites
- Slack integration connected for your org
- Bot has access to a channel or DM

### Steps

1. In Slack, trigger a proposal request (via the 60 bot — either through a slash command or a conversational prompt like "generate a proposal for [deal]")
2. The bot should acknowledge and start the pipeline
3. A progress message appears in the Slack thread
4. When complete, a Block Kit message appears with:
   - "Proposal Ready" header
   - Title, contact, company
   - Trigger badge ("Slack") + credits badge
   - Buttons: Download PDF, View in 60, Send to Client

### What to verify

- [ ] Pipeline fires with `trigger_type: 'slack'`
- [ ] `slack_thread` (channel_id, thread_ts, bot_token) is forwarded through the pipeline to the deliver stage
- [ ] Delivery posts a reply **in the same thread** (not a new DM)
- [ ] "Download PDF" button returns a valid presigned URL
- [ ] "Send to Client" button works (if autonomy tier allows)
- [ ] Clicking "Approve" in Slack records an `approved` signal for autopilot

---

## Test 5: Auto Post-Meeting Trigger

This fires automatically after a meeting ends (via the orchestrator).

### Steps

1. Have a meeting complete with a recording/transcript
2. The orchestrator's `detectProposalIntentAdapter` evaluates whether to generate
3. If confidence is high enough, it creates a pending action
4. Based on autonomy tier:
   - **Suggest**: Copilot surfaces "I can generate a proposal — approve?"
   - **Approve**: Generates automatically, sends notification
   - **Auto**: Generates and sends to client automatically

### What to verify

- [ ] Pipeline fires with `trigger_type: 'auto_post_meeting'`
- [ ] Autonomy tier is respected (doesn't auto-send if tier is "suggest")
- [ ] Pending action appears in the copilot/notification system
- [ ] Approval triggers the full pipeline

---

## Test 6: Proposals List Page

### Steps

1. Navigate to `/proposals`
2. You should see a table of all generated proposals

### What to verify

- [ ] Table shows: Title, Client, Deal, Created, Status, Trigger, Credits
- [ ] Status filter works (filter by "ready", "failed", etc.)
- [ ] Trigger filter works (filter by "manual_button", "copilot", etc.)
- [ ] Date range filter works (7/30/90 days)
- [ ] Column sorting works (click headers to toggle asc/desc)
- [ ] Row actions dropdown: Download PDF, Edit, Regenerate, Delete
- [ ] Delete shows confirmation dialog
- [ ] Regenerate fires a new pipeline run

---

## Test 7: Offering Profile Upload

### Steps

1. Navigate to Settings > Proposals (or wherever `ProposalSettings` is mounted)
2. Find the **Offering Profile** section
3. Click upload or drag-drop a sales collateral document (PDF, DOCX, or PPTX)
4. Watch the upload + analysis flow:
   - Upload progress bar
   - "Extracting offering details..." spinner
   - Extracted data appears for review

### What to verify

- [ ] Accepts PDF, DOCX, PPTX (rejects other formats)
- [ ] Max 25MB enforced
- [ ] File uploads to `proposal-assets/{orgId}/offerings/` in Supabase Storage
- [ ] `offering-extract` edge function is called
- [ ] Extracted content (product, pricing, use cases) appears in the review UI
- [ ] You can edit the extracted data
- [ ] Once saved, the offering profile is used in subsequent proposal context assembly

---

## Test 8: Autopilot Settings (AUT-003)

### Steps

1. Navigate to Settings > Proposals
2. Find the **Autopilot / Autonomy** section
3. You should see:
   - Tier cards for `proposal.generate` and `proposal.send`
   - Current tier badge (Manual / Suggest / Auto)
   - Confidence bar
   - Signal history (approved/edited/rejected counts)
   - Manual override dropdown ("Cap maximum tier")

### What to verify

- [ ] Tier cards display correctly for both actions
- [ ] Signal history grid shows correct counts from `autopilot_signals` table
- [ ] Manual override dropdown works (caps tier, sets `never_promote: true`)
- [ ] Promotion criteria info card explains thresholds (10+/60% and 25+/85%)

---

## Test 9: PDF Quality Check

### Steps

1. Generate a proposal via any trigger
2. Download the PDF
3. Inspect the output

### What to verify

- [ ] Cover page: company name, client name, date, prepared by
- [ ] Executive summary section present and coherent
- [ ] Problem/solution sections reflect the meeting context
- [ ] Pricing section (if offering profile exists) is formatted correctly
- [ ] Page breaks are clean (no orphaned headings, no cut-off tables)
- [ ] Brand colours applied (if org has brand_config)
- [ ] Fonts render correctly
- [ ] Thumbnail matches the first page of the PDF

---

## Test 10: Error Handling & Edge Cases

### Scenarios to test

| Scenario | Expected Behavior |
|----------|-------------------|
| Meeting with no transcript AND no notes | Button disabled with tooltip |
| Meeting with notes but no recording | Button enabled, proposal uses notes as context |
| No deal linked to meeting | Proposal generates with limited context (no company/stage data) |
| No offering profile for org | Proposal generates without product details (generic) |
| Gotenberg is down | Pipeline fails at stage 3–4, overlay shows error with failed stage highlighted |
| AI composition timeout | Retry logic kicks in (up to 2 retries with exponential backoff) |
| Insufficient credits | Pipeline fails with credits error, toast shown |
| Generate while one is already in progress | Should prevent double-generation (check `generation_status`) |
| Concurrent proposals for same deal | Context caching kicks in (reuses context from last hour) |

---

## Quick Debugging Reference

### Check proposal status in DB

```sql
SELECT id, title, generation_status, trigger_type, credits_used,
       style_config->>'_pipeline_error' as error,
       style_config->'_pipeline_metrics' as metrics,
       created_at
FROM proposals
WHERE org_id = 'YOUR_ORG_ID'
ORDER BY created_at DESC
LIMIT 5;
```

### Check pipeline metrics

```sql
SELECT id, title,
       style_config->'_pipeline_metrics'->'total_ms' as total_ms,
       style_config->'_pipeline_metrics'->'stages' as stage_timings,
       credits_used
FROM proposals
WHERE generation_status = 'ready'
ORDER BY created_at DESC
LIMIT 5;
```

### Check autopilot signals

```sql
SELECT signal, weight, metadata, created_at
FROM autopilot_signals
WHERE action_type LIKE 'proposal.%'
ORDER BY created_at DESC
LIMIT 10;
```

### Edge function logs

```bash
# Via Supabase CLI
supabase functions logs proposal-pipeline-v2 --project-ref caerqjzvuerejfrdtygb

# Or via Dashboard: Edge Functions > [function-name] > Logs
```

### Gotenberg health

Check Railway dashboard for the `gotenberg-pdf` service status and logs.

---

## Test Execution Order (Recommended)

Start with the happy path and expand outward:

1. **Test 1** — Manual button (proves the full pipeline works end-to-end)
2. **Test 9** — PDF quality (verify the output is actually good)
3. **Test 2** — Edit + re-render (proves partial pipeline works)
4. **Test 6** — Proposals list (verify data is showing up correctly)
5. **Test 7** — Offering profile (enriches subsequent proposals)
6. **Test 3** — Copilot trigger (second entry point)
7. **Test 4** — Slack trigger (third entry point)
8. **Test 5** — Auto trigger (depends on orchestrator)
9. **Test 8** — Autopilot settings (needs signal history from prior tests)
10. **Test 10** — Error handling (break things intentionally)
