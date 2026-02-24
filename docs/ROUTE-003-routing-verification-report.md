# ROUTE-003: Routing Verification Report

**Date:** 2026-02-08
**Branch:** improve/security
**Verified by:** Static analysis of SKILL.md frontmatter + copilotRoutingService.ts

---

## 1. YAML Frontmatter Validation (6 files)

### Files Verified

| # | File | Status | Notes |
|---|------|--------|-------|
| 1 | `skills/atomic/meeting-prep-brief/SKILL.md` | PASS | Valid V2 triggers, 3 trigger patterns, 8 keywords |
| 2 | `skills/atomic/daily-focus-planner/SKILL.md` | PASS | Valid V2 triggers, 3 trigger patterns, 9 keywords |
| 3 | `skills/atomic/lead-qualification/SKILL.md` | PASS | Valid V2 triggers, 4 trigger patterns, 9 keywords |
| 4 | `skills/sequences/seq-catch-me-up/SKILL.md` | PASS | Valid V2 triggers, 4 trigger patterns, 9 keywords, 7-step workflow |
| 5 | `skills/sequences/seq-meeting-prep/SKILL.md` | PASS | Valid V2 triggers, 3 trigger patterns, 9 keywords, 3-step workflow |
| 6 | `skills/sequences/seq-pipeline-focus-tasks/SKILL.md` | PASS | Valid V2 triggers, 4 trigger patterns, 9 keywords, 3-step workflow |

### Validation Checklist

| Check | Result |
|-------|--------|
| YAML indentation (2 spaces) | All 6 files use consistent 2-space indentation |
| Strings with special characters quoted | All special-character strings properly quoted (e.g., `"2"` for version) |
| Arrays properly formatted | All arrays use correct YAML list syntax |
| No duplicate keys | No duplicate keys found in any file |
| V2 trigger format (pattern, intent, confidence, examples) | All 6 files use V2 format with pattern, intent, confidence, and examples array |
| keywords array exists | All 6 files have a `keywords` array |
| description uses block scalar (`\|`) | All 6 files use `\|` for multiline descriptions |

### YAML Issues Found

**None.** All 6 files pass YAML validation. The frontmatter is well-structured and consistent across atomic skills and sequences.

---

## 2. Routing Trace Analysis (5 Test Queries)

### How `calculateTriggerMatch()` Works

The function (`copilotRoutingService.ts` lines 85-158) uses a 3-tier scoring approach:

1. **Trigger patterns** (highest priority): Checks if `message.toLowerCase()` includes `trigger.pattern.toLowerCase()`. If matched, uses the trigger's `confidence` value directly. Also checks `trigger.examples` at 90% of the trigger's confidence.
2. **Keywords** (medium priority, only if best confidence < 0.5): Counts exact word matches against the keywords array. Score = `min(0.6, matches * 0.2)`.
3. **Description** (lowest priority, only if best confidence < 0.4): Counts message words (>3 chars) that appear in description. Score = `min(0.45, matches * 0.1)`.

The routing decision flow (`routeToSkill()` lines 234-399):
- **Step 1**: Check all sequences. If best sequence confidence >= 0.7, select it immediately.
- **Step 2**: If no sequence match, check individual skills. If best overall confidence >= 0.5, select it.
- **Step 3**: Semantic embedding fallback (cosine similarity >= 0.6).

### Query 1: "prep for my meeting"

| Skill/Sequence | Match Type | Matched Pattern | Confidence | Threshold |
|----------------|-----------|-----------------|------------|-----------|
| **seq-meeting-prep** (sequence) | Exact pattern | `"prep for my meeting"` | **0.95** | 0.7 |
| seq-next-meeting-command-center (sequence) | Example match | `"next meeting prep"` -- no, message does not contain "next meeting prep". Keyword "prep" + "meeting" = 0.4. Falls below 0.5 so keywords checked: "prep", "meeting" = 2 matches = 0.4 | 0.4 | 0.7 |
| meeting-prep-brief (atomic) | Exact pattern | `"prep for my meeting"` | 0.85 | 0.5 |
| meeting-command-center-plan (atomic) | Example match | `"prep for the call"` -- no, "prep for my meeting" does not contain "prep for the call". Keyword "prep" + "meeting" = 2 matches = 0.4, but only checked if confidence < 0.5. Pattern "prepare for my meeting" -- no exact match. Pattern "get ready for my call" -- no. | 0.0 from triggers. Keywords: "prepare" no, "prep" yes, "meeting" yes = 0.4 | 0.5 |

**Result: seq-meeting-prep selected at 0.95 confidence (sequence match).** This is correct. The sequence-first routing kicks in because 0.95 >= 0.7 threshold. The atomic `meeting-prep-brief` (0.85) would be a valid fallback but is not needed.

### Query 2: "what deals need attention"

| Skill/Sequence | Match Type | Matched Pattern | Confidence | Threshold |
|----------------|-----------|-----------------|------------|-----------|
| **seq-pipeline-focus-tasks** (sequence) | Example match | `"which deals need attention"` -- message is "what deals need attention", does it contain "which deals need attention"? No. Check pattern "which deals should I work on" -- no. Pattern "pipeline focus tasks" -- no. Pattern "review my pipeline" -- no. Pattern "deals needing attention this week" -- no. Examples: "which deals need attention" -- no. "what deals should I focus on" -- no. "top deals to work on" -- no. Keyword check: "deals" yes, "attention" yes = 2 matches = 0.4. | 0.4 | 0.7 |
| deal-slippage-diagnosis (atomic) | Pattern "at risk deals" -- no. Keywords: "deals" yes = 1 match = 0.2 | 0.2 | 0.5 |
| deal-next-best-actions (atomic) | Keywords: "deal" -- word split of "what deals need attention" = ["what", "deals", "need", "attention"]. Keyword "deal" does not match "deals" (exact word match). Keywords: "actions" no, "deal" no (message has "deals"), "advance" no, "priorities" no, "what to do" no, "next steps" no, "recommendations" no. Actually, keyword matching uses `words.includes(kw.toLowerCase())` -- "deals" does not match "deal". Score = 0. | 0.0 | 0.5 |

**Result: seq-pipeline-focus-tasks at 0.4 confidence via keywords. This is BELOW the sequence threshold (0.7) and below the individual threshold (0.5).** The query would fall through to semantic embedding fallback.

**Issue identified:** The query "what deals need attention" does not exactly match any trigger pattern or example. The closest is the example "which deals need attention" on seq-pipeline-focus-tasks, but "what" vs "which" prevents the substring match. The keyword score (0.4) is below both thresholds.

**This query relies on the semantic embedding fallback (Step 3) to route correctly.** If embeddings are working, it should match `seq-pipeline-focus-tasks` based on description similarity. If embeddings are unavailable, this query would return "no confident match."

### Query 3: "catch me up"

| Skill/Sequence | Match Type | Matched Pattern | Confidence | Threshold |
|----------------|-----------|-----------------|------------|-----------|
| **seq-catch-me-up** (sequence) | Exact pattern | `"catch me up"` | **0.95** | 0.7 |

**Result: seq-catch-me-up selected at 0.95 confidence (sequence match).** Clean, unambiguous match.

### Query 4: "draft a follow-up email"

| Skill/Sequence | Match Type | Matched Pattern | Confidence | Threshold |
|----------------|-----------|-----------------|------------|-----------|
| seq-followup-zero-inbox (sequence) | Pattern "zero inbox" -- no. Pattern "catch up on emails" -- no. Pattern "help me clear my follow-ups" -- no. Pattern "draft replies for my emails" -- no. Example "help me reply to emails" -- no. Keywords: "emails" no (message has "email" singular). "follow-ups" -- message has "follow-up" (singular). Word split: ["draft", "a", "follow-up", "email"]. Keyword "follow-ups" vs word "follow-up" -- no exact match. "emails" vs "email" -- no exact match. Score from keywords: 0 for exact word matches. | 0.0 | 0.7 |
| **followup-reply-drafter** (atomic) | Pattern "write a follow-up email" -- message "draft a follow-up email" does not contain "write a follow-up email". Pattern "draft a reply" -- message does not contain "draft a reply". Pattern "respond to this email" -- no. Example "draft a follow-up email" -- YES, message contains this exact string. Confidence = 0.85 * 0.9 = **0.765** | **0.765** | 0.5 |
| post-meeting-followup-drafter (atomic) | Pattern "draft a follow-up email for the meeting" -- message does not contain this (too long). Keywords: "follow-up" yes, "email" yes, "draft" yes = 3 matches = 0.6. But keywords only checked if bestConfidence < 0.5, and trigger check first: no pattern match. Actually wait -- examples: "draft meeting follow-up" -- message does not contain this. So triggers = 0. Keywords check since 0 < 0.5: "follow-up" matches word "follow-up" yes, "email" matches "email" yes, "draft" matches "draft" yes = 3 matches = min(0.6, 3*0.2) = 0.6. | 0.6 | 0.5 |

**Result:** No sequence exceeds 0.7 threshold. Individual skills are checked. Best overall is followup-reply-drafter at 0.765 (from example match). Selected as individual skill match. **Correct routing.**

Note: post-meeting-followup-drafter (0.6) is a secondary candidate but ranked lower. This is appropriate -- "draft a follow-up email" without meeting context should go to the general reply drafter, not the post-meeting specific one.

### Query 5: "qualify this lead"

| Skill/Sequence | Match Type | Matched Pattern | Confidence | Threshold |
|----------------|-----------|-----------------|------------|-----------|
| seq-inbound-qualification (sequence) | Need to check triggers. Pattern likely includes "qualify" -- would need to verify. But given lead-qualification atomic has direct pattern match, let's trace. |  |  |
| **lead-qualification** (atomic) | Exact pattern | `"qualify this lead"` | **0.90** | 0.5 |

**Sequence check:** seq-inbound-qualification has pattern "qualify this inbound lead" (0.95) -- but "qualify this lead" does NOT contain "qualify this inbound lead" (missing "inbound"). No sequence pattern match. Sequence keywords would score < 0.7.

**Result:** No sequence exceeds the 0.7 threshold. lead-qualification atomic skill wins with exact pattern match at 0.90 confidence. **Correct routing.** Note: if the user says "qualify this inbound lead" instead, seq-inbound-qualification would win at 0.95 -- the word "inbound" correctly differentiates the two paths.

### Query Trace Summary

| # | Query | Expected Target | Actual Match | Confidence | Status |
|---|-------|-----------------|-------------|------------|--------|
| 1 | "prep for my meeting" | seq-meeting-prep | seq-meeting-prep | 0.95 | PASS |
| 2 | "what deals need attention" | seq-pipeline-focus-tasks | Falls to semantic fallback | 0.40 (keyword) | WARN |
| 3 | "catch me up" | seq-catch-me-up | seq-catch-me-up | 0.95 | PASS |
| 4 | "draft a follow-up email" | followup-reply-drafter | followup-reply-drafter | 0.765 | PASS |
| 5 | "qualify this lead" | lead-qualification | lead-qualification | 0.90 | PASS |

---

## 3. Overlapping Trigger Conflict Analysis

### 3A. "meeting" Cluster

**Skills involved:** meeting-prep-brief, meeting-digest-truth-extractor, meeting-command-center-plan
**Sequences involved:** seq-meeting-prep, seq-catch-me-up, seq-meeting-digest, seq-post-meeting-followup-pack, seq-next-meeting-command-center

| Concern | Analysis | Severity |
|---------|----------|----------|
| "prep for my meeting" | seq-meeting-prep (0.95) vs meeting-prep-brief (0.85) vs seq-next-meeting-command-center (keyword ~0.4) | **LOW** - Sequence wins clearly at 0.95. Correct behavior: seq-meeting-prep wraps meeting-prep-brief. |
| "prep for my next meeting" | seq-next-meeting-command-center has exact pattern "prep for my next meeting" (0.95). seq-meeting-prep has pattern "prep for my meeting" which is substring of "prep for my next meeting" (0.95). **TIE risk.** | **MEDIUM** - Both score 0.95. seq-meeting-prep would match first if sequences are iterated in order. However, the user intent is "next meeting" which should route to seq-next-meeting-command-center. |
| "summarize my meeting" | meeting-digest-truth-extractor has exact pattern (0.85). seq-meeting-digest has pattern "digest my last meeting" -- no substring match. seq-post-meeting-followup-pack has no direct match. | **LOW** - Atomic skill handles it. Sequences handle "digest" phrasing. |
| "meeting command center" | seq-next-meeting-command-center has example "meeting command center" (0.95 * 0.9 = 0.855). meeting-command-center-plan has no direct pattern match for this. | **LOW** - Sequence wins. |
| "what happened in the meeting" | seq-meeting-digest example "what happened in the meeting" (confidence ~0.90 * 0.9 = 0.81). meeting-digest-truth-extractor example "what happened in the meeting" (0.85 * 0.9 = 0.765). | **LOW** - Sequence wins at 0.81 >= 0.7 threshold. |

**Key conflict: "prep for my next meeting"** -- Both seq-meeting-prep and seq-next-meeting-command-center could match. seq-meeting-prep's pattern "prep for my meeting" is a substring of the query, scoring 0.95. seq-next-meeting-command-center's pattern "prep for my next meeting" is an exact match, also scoring 0.95. The winner depends on iteration order. **Recommendation:** Lower seq-meeting-prep's "prep for my meeting" confidence to 0.90, so the more specific seq-next-meeting-command-center (0.95) wins on "next meeting" queries.

### 3B. "deal" Cluster

**Skills involved:** deal-rescue-plan, deal-slippage-diagnosis, deal-map-builder, deal-next-best-actions
**Sequences involved:** seq-deal-rescue-pack, seq-deal-slippage-guardrails, seq-deal-map-builder

| Concern | Analysis | Severity |
|---------|----------|----------|
| "rescue this deal" | seq-deal-rescue-pack (0.95) vs deal-rescue-plan (0.90). | **LOW** - Sequence wins. Correct: sequence wraps the atomic skill. |
| "which deals are slipping" | seq-deal-slippage-guardrails (0.95) vs deal-slippage-diagnosis (0.90). | **LOW** - Sequence wins. Correct design. |
| "deal is at risk" | deal-rescue-plan pattern "deal is at risk" (0.85). seq-deal-rescue-pack does not have this exact pattern. deal-slippage-diagnosis pattern "at risk deals" -- message "deal is at risk" does not contain "at risk deals". seq-deal-slippage-guardrails pattern "deals in trouble" (0.85) -- no match. | **LOW** - deal-rescue-plan wins as atomic skill at 0.85. Acceptable. |
| "my deal is slipping" | deal-rescue-plan has example "my deal is slipping" (0.85 * 0.9 = 0.765). deal-slippage-diagnosis does not have this exact example. seq-deal-slippage-guardrails: no direct match. | **LOW** - deal-rescue-plan handles it. Could arguably route to slippage-diagnosis, but rescue-plan is also appropriate for a single deal. |
| Overlapping keywords "at risk", "trouble", "deal" | deal-rescue-plan and deal-slippage-diagnosis share keywords "at risk", "trouble", "deal". However, their trigger patterns are sufficiently distinct: rescue-plan focuses on single-deal rescue, slippage-diagnosis focuses on pipeline-wide scanning. | **LOW** - Keyword overlap only matters if confidence < 0.5, which is below routing thresholds. |

**No critical conflicts in the deal cluster.** The sequence-first routing correctly elevates seq-deal-rescue-pack and seq-deal-slippage-guardrails over their atomic counterparts.

### 3C. "follow-up" Cluster

**Skills involved:** followup-reply-drafter, followup-triage, post-meeting-followup-drafter
**Sequences involved:** seq-followup-zero-inbox, seq-post-meeting-followup-pack

| Concern | Analysis | Severity |
|---------|----------|----------|
| "draft a follow-up email" | followup-reply-drafter (0.765 via example). post-meeting-followup-drafter (0.6 via keywords). seq-followup-zero-inbox (0.0). | **LOW** - Correct routing to general reply drafter. |
| "follow up from my last meeting" | seq-post-meeting-followup-pack exact pattern (0.95). post-meeting-followup-drafter: no exact match. | **LOW** - Sequence wins correctly. |
| "which emails need replies" | followup-triage exact pattern (0.85). seq-followup-zero-inbox: no direct pattern match, but examples include "what emails do I need to handle" which won't substring-match. | **LOW** - Atomic skill handles it. Zero-inbox handles "zero inbox" / "catch up on emails" phrasing. |
| Keyword overlap "follow-up", "email" | followup-reply-drafter and post-meeting-followup-drafter share keywords. | **LOW** - Trigger patterns provide sufficient differentiation. Meeting-specific follow-up requires "meeting" in the query. |

**No critical conflicts in the follow-up cluster.**

### 3D. Keyword-Only Matching Vulnerability

The routing service has a design feature where keywords are only checked when `bestConfidence < 0.5` (line 128). This means keyword-only matches max out at 0.6. Since the individual skill threshold is 0.5, keyword matches CAN route queries -- but only to individual skills, never to sequences (threshold 0.7). This is actually a useful safety behavior: vague queries that only match keywords will get a lower-confidence individual skill rather than triggering a full sequence workflow.

However, keyword matching uses exact word matching (`words.includes(kw)`). This means:
- "deals" does not match keyword "deal"
- "emails" does not match keyword "email"
- "follow-ups" does not match keyword "follow-up"

This is a systemic issue that could reduce keyword matching effectiveness. See recommendation below.

---

## 4. Issues Found and Recommendations

### Issue 1: "what deals need attention" does not trigger-match (MEDIUM)

**Problem:** The query "what deals need attention" fails to match any trigger pattern because:
- seq-pipeline-focus-tasks has example "which deals need attention" (uses "which" not "what")
- The substring check fails because "what" != "which"

**Impact:** Query falls to semantic embedding fallback. If embeddings are unavailable or the similarity score is below 0.6, the query returns "no confident match."

**Recommendation:** Add "what deals need attention" as an additional example under seq-pipeline-focus-tasks's first trigger pattern. This is a common natural phrasing that should have a direct trigger match.

### Issue 2: "prep for my next meeting" routing ambiguity (MEDIUM)

**Problem:** Both seq-meeting-prep (pattern: "prep for my meeting") and seq-next-meeting-command-center (pattern: "prep for my next meeting") score 0.95 on the query "prep for my next meeting" because substring matching finds "prep for my meeting" inside "prep for my next meeting".

**Impact:** The winner depends on iteration order from the database query, which is non-deterministic.

**Recommendation:** Lower seq-meeting-prep's "prep for my meeting" trigger confidence from 0.95 to 0.90. This allows the more specific seq-next-meeting-command-center (0.95) to win when the user says "next meeting."

### Issue 3: Singular/plural keyword mismatch (LOW)

**Problem:** Keyword matching uses exact word matching. Keywords like "deal", "email", "follow-up" won't match the user's pluralized forms "deals", "emails", "follow-ups".

**Impact:** Keywords are a fallback mechanism (only checked when confidence < 0.5) and max at 0.6. The trigger patterns and examples are the primary matching mechanism and work well. This is a minor gap.

**Recommendation:** Consider adding both singular and plural forms to keyword arrays, or implementing stemming/fuzzy matching in a future iteration.

### Issue 4: seq-stalled-deal-revival directory is empty (LOW)

**Problem:** The directory `skills/sequences/seq-stalled-deal-revival/` exists but contains no SKILL.md file.

**Impact:** The sequence is listed in the filesystem but has no routing configuration. It will not appear in the routing system.

**Recommendation:** Either create a proper SKILL.md for this sequence or remove the empty directory to avoid confusion.

---

## 5. Overall Routing Health Assessment

| Metric | Value |
|--------|-------|
| Total skills (atomic) | 22 |
| Total sequences | 14 directories (13 with SKILL.md, 1 empty) |
| YAML validation pass rate | **6/6 (100%)** |
| Test query routing accuracy | **4/5 (80%)** -- 1 relies on semantic fallback |
| Critical trigger conflicts | **0** |
| Medium trigger conflicts | **2** (next meeting ambiguity, "what deals need attention" miss) |
| Low concerns | **2** (keyword plurality, empty directory) |

### Verdict

**Routing is healthy.** The V2 trigger system is well-designed with clear intent differentiation across skills and sequences. The sequence-first routing correctly prioritizes orchestrated workflows over atomic skills. The two medium issues identified are edge cases that can be resolved with minor trigger/example additions. The semantic embedding fallback provides a reasonable safety net for queries that don't exactly match trigger patterns.

The most impactful quick fix would be adding "what deals need attention" as an example to seq-pipeline-focus-tasks, which would bring the test query pass rate to 100%.
