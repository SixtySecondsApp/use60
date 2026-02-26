# Progress Log — PRD-01: Close the Email Loop

## Codebase Patterns
<!-- Reusable learnings specific to email loop feature -->

- hitl-send-followup-email calls google-gmail for the actual send
- slack-interactive/handlers/hitl.ts handles all Slack button callbacks — check routing logic before adding new action_ids
- hitl_pending_approvals.resource_type='email_draft' is the convention for email HITL rows
- agent-orchestrator resumeSequence() is the entry point for HITL resume flows
- Slack Block Kit preview messages should update in-place (not post new message) using response_url or chat.update

---

## Session Log

<!-- Stories log as they complete, oldest first -->

### 2026-02-26 — EMAIL-001 ✅
**Story**: Add Slack HITL approval step to meeting_ended Wave 3
**Files**: adapters/emailDraftApproval.ts (new), eventSequences.ts, adapters/index.ts
**Time**: ~30 min
**Gates**: lint ✅ | test ✅ | types: skipped | Opus review: 12 PASS / 6 WARN / 1 FAIL (fixed)
**Learnings**: Block Kit action_ids must be unique per actions block (not per message); Schedule/Skip use reject:: prefix with subAction in value JSON; added to SALES_ONLY_STEPS; removed from notify-slack-summary depends_on to avoid blocking summaries

---

### 2026-02-26 — EMAIL-002 + EMAIL-003 (parallel) ✅
**Stories**: [Approve] → resumeSequence + [Skip] → mark complete
**Files**: slack-interactive/index.ts (handleHITLApprove + handleHITLReject)
**Time**: ~20 min combined
**Gates**: lint ✅ | test ✅ | types: skipped
**Learnings**: triggerHITLCallback now returns {ok, error} for approve feedback; resumeOrchestratorJob is fire-and-forget; skip uses complete_sequence_job RPC with outcome='skipped'; subAction parsed from value JSON to distinguish skip from schedule

---

### 2026-02-26 — EMAIL-004 + EMAIL-007 (parallel) ✅
**Stories**: Thread-aware Gmail replies + [Edit in 60] deep link
**Files**: google-gmail/index.ts, hitl-send-followup-email/index.ts, slack-interactive/index.ts (handleHITLEdit)
**Time**: ~18 min combined
**Learnings**: RFC 2822 In-Reply-To + References headers on raw email; Gmail threadId keeps thread together; Edit button kept as pending (no 'editing' status in CHECK constraint); deep link format: /meetings?approval={id}

---

### 2026-02-26 — EMAIL-006 + EMAIL-008 + EMAIL-009 (parallel waves) ✅
**Stories**: Daily send cap + [Schedule] time picker + Autonomy signals
**Files**: migrations (email_send_cap, scheduled_sends), hitl-send-followup-email, slack-interactive (schedule modal + cancel)
**Time**: ~25 min combined
**Learnings**: Cap stored as INTEGER on organizations (not JSONB); scheduled_email_sends reused for both explicit scheduling (EMAIL-008) and 30s undo (EMAIL-005); pg_cron runs every minute; autopilot signals use existing recordSignal + recalculateUserConfidence

---

### 2026-02-26 — EMAIL-010 + EMAIL-005 (sequential) ✅
**Stories**: O365 Microsoft Graph send + 30s undo window
**Files**: ms-graph-email/index.ts (new), hitl-send-followup-email, slack-interactive (undo handler)
**Time**: ~22 min combined
**Learnings**: MS Graph uses POST /v1.0/me/sendMail with saveToSentItems; token refresh via common/oauth2/v2.0/token; undo reuses scheduled_email_sends with scheduled_at=now+30s; atomic cancel via conditional update eq('status','pending')

---

## PRD-01 COMPLETE — 10/10 stories ✅

