# Consult Report: Meeting Transcript & Video Redesign
Generated: 2026-02-20

## User Request
Redesign the meeting transcript UI to match a provided reference design with:
- Nicer visual layout (speaker avatars, speaker-colored hover effects, readable text)
- Full-row click-to-seek (any click on transcript line jumps video to that timestamp)
- Profile pictures for known organization members, initials fallback for others
- Video player slightly smaller and responsive (same structure, just constrained)
- Reference design: `c:\Users\Media 3\Downloads\poe-preview (1).html`

---

## Analysis Findings

### Transcript Gathering — Pipeline is Correct
- `supabase/functions/_shared/fathomTranscript.ts` fetches from Fathom API
- API endpoint: `https://api.fathom.ai/external/v1/recordings/{recordingId}/transcript`
- Segment format: `{ speaker: { display_name, matched_calendar_invitee_email }, text, timestamp }`
- Stored as `[HH:MM:SS] Speaker: text\n...` in `meetings.transcript_text`
- **No code bug** — the "messiness" is Fathom's speaker diarization outputting "Speaker 1/2" when it can't identify attendees by name

### Video Player — Too Large, Unresponsive
- `FathomPlayerV2` rendered with `className="aspect-video"` inside `lg:col-span-8`
- No max-height/max-width constraint → very large on wide monitors
- Same issue for 60_notetaker `<video>` element
- Fix: add `max-h-[340px]` to all player containers (Fathom, 60_notetaker, voice)

### Profiles — Avatar URL Available
- `profiles` table has `avatar_url` text column ✅
- Meeting attendees already fetched in component with emails ✅
- Profile avatars NOT fetched — trivial to add
- Speaker → profile matching: match transcript speaker name against `attendees[]` array

### Reference Design Key Patterns
From `poe-preview (1).html` analysis:
- **Row layout**: `[timestamp 52px] [avatar-col 36px] [content flex-1]`
- **Avatar**: 26×26px, `border-radius: 8px` (rounded square), gradient background per speaker
  - Speaker 1: `linear-gradient(135deg, #3b82f6, #60a5fa)`
  - Speaker 2: `linear-gradient(135deg, #7c3aed, #a78bfa)`
  - Speaker 3: `linear-gradient(135deg, #059669, #34d399)`
  - Speaker 4+: `linear-gradient(135deg, #ea580c, #fb923c)` cycling
- **Speaker name**: 12px, 600 weight, speaker color, above text
- **Text**: 14px, line-height 1.65, light color
- **Timestamp**: 52px wide, mono, muted opacity 0.6, animates to accent blue on hover
- **Hover**: speaker-tinted background (`rgba(color, 0.08)`) + border highlight
- **Continuation**: same speaker consecutive → hide avatar column, tighter padding
- **Speaker dividers**: thin gradient line between speaker changes
- **No play button** (user request)
- **Full row clickable** via `role="button"`

---

## Stories

### MEET-001: Constrain video player height for responsiveness
Files: `src/pages/MeetingDetail.tsx` (3 player containers)

### MEET-002: Transcript redesign matching reference design
Files: `src/pages/MeetingDetail.tsx` (transcript tab), `src/components/meeting-analytics/TranscriptDetailSheet.tsx`

### MEET-003: Fetch profile avatars and show for known members
Files: `src/pages/MeetingDetail.tsx` (new state + fetch + pass to transcript renderer)
