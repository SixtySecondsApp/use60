# PRD-110: Meeting Content Library

**Priority:** Tier 3 — Differentiator Upgrade
**Current Score:** 2 (SCAFFOLD) — recording + search infrastructure exists, no unified library page
**Target Score:** 4 (BETA)
**Estimated Effort:** 10-12 hours
**Dependencies:** None

---

## Problem

The meeting recording and intelligence backend is massive — 40,000+ lines across 25+ edge functions covering MeetingBaaS bot recording, transcription (AssemblyAI + Gladia), semantic search (OpenAI embeddings), and natural language querying (GPT-4o-mini). The `meeting-analytics` function alone has 10 handlers (2,357 lines).

But there's no unified place to browse, search, and share recordings:
1. **No "Call Library" page** — recordings are scattered across meeting detail views
2. **Transcript search exists but buried** — `MeetingSearchPanel.tsx` (7,509 lines!) is powerful but only accessible from command centre
3. **No shareable meeting links** — voice recordings have public sharing (`voice-share-playback`) but meeting recordings don't
4. **Content generation is hidden** — `ContentLibrary.tsx` (247 lines) generates social/blog/email from meetings but isn't easily discoverable
5. **No "best calls" collection** — managers can't curate and share exemplary calls for training

## Goal

A Meeting Library page where reps and managers can browse all recordings, search across transcripts, share calls externally, and curate "best of" collections for team training.

## Success Criteria

- [ ] `/meetings/library` page with filterable recording list
- [ ] Full-text and semantic search across all transcripts
- [ ] Recording player with synced transcript (click-to-jump)
- [ ] Shareable meeting links with optional access controls
- [ ] "Best calls" collection that managers can curate
- [ ] Content generation quick actions (summary, follow-up, social post)

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| LIB-001 | Create MeetingLibraryPage with recording grid and filters | frontend | 2.5h | — |
| LIB-002 | Build RecordingCard with metadata, badges, and quick actions | frontend | 1.5h | LIB-001 |
| LIB-003 | Add transcript search integration (wire to meeting-analytics/search) | frontend | 2h | LIB-001 |
| LIB-004 | Build recording player with synced transcript viewer | frontend | 2h | LIB-001 |
| LIB-005 | Add shareable meeting links with access control | frontend + backend | 2h | LIB-004 |
| LIB-006 | Create "Best Calls" collection with manager curation | frontend + backend | 2h | LIB-001 |
| LIB-007 | Add content generation quick actions (reuse ContentLibrary patterns) | frontend | 1h | LIB-004 |

## Technical Notes

- `recordings` table has: id, org_id, meeting_id, status, recording_url, transcript_text, duration, speakers
- `RecordingsList.tsx` (1,111 lines) already has filtering and search — extract and extend for library page
- `RecordingPlayer.tsx` (96 lines) exists in command centre — needs transcript sync
- `TranscriptViewer.tsx` (143 lines) parses timestamps and highlights action items
- `RecordingBadges.tsx` (257 lines) shows status, platform, sentiment, quality badges
- `meeting-analytics/search` endpoint supports full-text + semantic search with filters
- `meeting-analytics/ask` endpoint supports natural language queries ("What did the prospect say about budget?")
- `recordingService.ts` (1,006 lines) has all recording management methods
- `voice-share-playback` pattern can be adapted for meeting recording sharing (presigned S3 URLs)
- `ContentLibrary.tsx` (247 lines) generates content from meetings — reuse for quick actions
- `share-recording` skill (372 lines) packages recording + highlights into shareable email
