# Voice Cloning & ElevenLabs Integration — PRD

## Summary

Add voice cloning to 60's Video Avatar pipeline via ElevenLabs integration. Users can clone their voice in-app, generate personalized audio per row, then feed that audio into HeyGen for lip-synced avatar videos. Platform provides a shared ElevenLabs key for basics (1 free instant clone); users who want pro voices or higher volume bring their own key.

## Architecture

```
                    60 Platform

  [Voice Library]  ──>  [Audio Column]  ──>  [Video Column]
       |                     |                     |
  Clone voice via       TTS per row           HeyGen avatar
  ElevenLabs IVC     (personalized script)   lip-syncs audio
       |                     |                     |
  Platform key OR       ElevenLabs API        HeyGen API
  User's BYOK key      POST /v1/tts          POST /v2/video
```

### Pipeline (2-step, user-controlled)

1. **Generate Audio** — User triggers "Generate Audio" on rows. For each row:
   - Interpolate script template with row variables
   - Call ElevenLabs TTS: `POST /v1/text-to-speech/{voice_id}` -> MP3 binary
   - Upload MP3 to Supabase Storage, get public URL
   - Write URL to the audio column cell

2. **Generate Video** — User triggers "Generate Video" on rows. For each row:
   - Read audio URL from audio column
   - Call HeyGen: `voice.type = "audio"`, `voice.audio_url = <url>`
   - Avatar lip-syncs to the audio file

Users can preview/edit audio between steps before committing to video generation.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Clone creation | In-app wizard + import existing (BYOK) | Guided for new users, flexible for power users |
| Audio generation | Separate step (audio column) | Preview/edit before expensive video generation |
| API key strategy | Platform key for basics, BYOK for pro | Low barrier to entry, scales with user needs |
| Free tier voice | HeyGen stock + 1 instant clone | Enough to demo the full pipeline |
| Voice UX | Org-level library + column assignment | Reusable voices, clean column config |

## Voice Tiers

| Tier | What they get | API key needed |
|------|---------------|----------------|
| **Basic** (no key) | 300+ HeyGen stock voices (TTS built into HeyGen) | None |
| **Clone** (no key) | 1 instant voice clone via platform ElevenLabs key | None |
| **BYOK ElevenLabs** | Unlimited instant clones, up to 3 pro voices, full TTS | User's ElevenLabs key |
| **BYOK HeyGen** | Custom HeyGen avatars, higher video limits | User's HeyGen key |

## Data Model

### New table: `voice_clones`

```sql
CREATE TABLE voice_clones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL,

  -- Voice identity
  name TEXT NOT NULL,                          -- "Andrew's Voice"
  description TEXT,                            -- "Cloned from 90s recording"

  -- ElevenLabs reference
  elevenlabs_voice_id TEXT,                    -- ElevenLabs voice ID
  source TEXT NOT NULL DEFAULT 'instant_clone', -- 'instant_clone' | 'professional_clone' | 'imported' | 'heygen_stock'

  -- For HeyGen stock voices (no ElevenLabs)
  heygen_voice_id TEXT,                        -- HeyGen voice ID (stock voices only)

  -- Clone metadata
  clone_audio_url TEXT,                        -- Original audio used for cloning (stored in Supabase Storage)
  clone_duration_seconds NUMERIC,              -- Duration of source audio

  -- API key source
  api_key_source TEXT NOT NULL DEFAULT 'platform', -- 'platform' | 'byok'

  -- Status
  status TEXT NOT NULL DEFAULT 'ready',        -- 'cloning' | 'ready' | 'failed'
  error_message TEXT,

  -- Preview
  preview_audio_url TEXT,                      -- Short TTS sample for preview
  language TEXT DEFAULT 'en',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_voice_clones_org ON voice_clones(org_id);
```

### New table: `elevenlabs_tts_jobs`

Tracks batch TTS generation for ops table rows.

```sql
CREATE TABLE elevenlabs_tts_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  user_id UUID NOT NULL,
  voice_clone_id UUID REFERENCES voice_clones(id),

  -- Batch context
  table_id UUID NOT NULL,
  audio_column_id UUID NOT NULL,              -- Column to write audio URLs
  script_template TEXT NOT NULL,

  -- Progress
  total_rows INT NOT NULL DEFAULT 0,
  completed_rows INT NOT NULL DEFAULT 0,
  failed_rows INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',      -- 'pending' | 'processing' | 'completed' | 'failed'

  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
```

### Modified: `integration_credentials`

ElevenLabs key stored here (same pattern as HeyGen BYOK):

```sql
-- integration_type = 'elevenlabs'
-- credentials = { "api_key": "sk-..." }
```

### Modified: `dynamic_table_columns`

New column type `elevenlabs_audio` for the audio column. `integration_config` stores:

```json
{
  "voice_clone_id": "uuid",
  "script_template": "Hey {{first_name}}, ...",
  "voice_name": "Andrew's Voice",
  "model_id": "eleven_multilingual_v2"
}
```

## Edge Functions

### `elevenlabs-voice-manage` (NEW)

Actions:
- `list` — List org's voice clones from `voice_clones` table
- `list_remote` — List voices from user's ElevenLabs account (BYOK only)
- `create_clone` — Upload audio, call ElevenLabs IVC API, save to DB
- `import_voice` — Import existing ElevenLabs voice by ID (BYOK only)
- `preview` — Generate short TTS sample for a voice
- `delete` — Delete voice clone (from DB + ElevenLabs API)

### `elevenlabs-tts-generate` (NEW)

Batch TTS generation for ops table rows.

```
POST /elevenlabs-tts-generate
Body: {
  voice_clone_id: string,
  script_template: string,
  table_id: string,
  row_ids: string[],
  audio_column_key: string
}
```

Per row:
1. Read row cell values
2. Interpolate script template
3. Call `POST /v1/text-to-speech/{voice_id}` with interpolated text
4. Upload returned MP3 to Supabase Storage: `audio/{org_id}/{row_id}.mp3`
5. Get public URL
6. Write URL to the audio column cell

### Modified: `heygen-video-generate`

Already supports `audio_url` and `audio_column_key` (built earlier this session). No changes needed.

## Frontend Components

### `VoiceLibrary.tsx` (NEW) — Settings page

Org-level voice management:
- List all voices (clones + HeyGen stock)
- Create new clone (wizard)
- Import existing (BYOK)
- Preview playback
- Delete

### `VoiceCloneWizard.tsx` (NEW) — Inline wizard

Steps:
1. **Record/Upload** — Record via browser mic or upload MP3 (1-2 min)
2. **Clone** — Call `elevenlabs-voice-manage` action `create_clone`, poll for completion
3. **Preview** — Play back a sample TTS with the cloned voice
4. **Name & Save** — Name the voice, saved to voice library

### Modified: `VideoAvatarColumnWizard.tsx`

Voice step updated:
- **HeyGen Voice** tab → picks from HeyGen stock voices (current behavior)
- **Cloned Voice** tab → picks from org voice library (`voice_clones` table)
- **Audio Column** tab → picks existing audio column (current behavior)

When "Cloned Voice" selected, column config stores `voice_clone_id` instead of `voice_id`.

### `ElevenLabsAudioCell.tsx` (NEW) — Ops table cell

For `elevenlabs_audio` column type:
- Empty: "Generate Audio" button
- Processing: spinner + progress
- Ready: Play button + waveform preview + duration
- Failed: Error + retry

### Modified: `EditHeyGenVideoSettingsModal.tsx`

Voice source toggle gets a third option:
- HeyGen Voice (stock)
- Cloned Voice (from library)
- Audio Column (external)

### `ElevenLabsKeySetup.tsx` (NEW) — Integration settings

Simple card in integrations page:
- Connect ElevenLabs API key
- Show current plan tier (from ElevenLabs API)
- Show voice count / limits
- Test connection

## ElevenLabs API Reference

### Instant Voice Clone
```
POST https://api.elevenlabs.io/v1/voices/add
Headers: xi-api-key: {key}
Body: multipart/form-data
  - name: "Voice Name"
  - files: [audio.mp3]  (1-2 min, clean audio)
  - description: "Cloned voice for sales outreach"
Response: { voice_id: "abc123" }
```

### Text-to-Speech
```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
Headers: xi-api-key: {key}, Content-Type: application/json
Body: {
  "text": "Hey John, I saw Acme Corp is...",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0.5,
    "speed": 1.0
  }
}
Query: ?output_format=mp3_44100_128
Response: audio/mpeg binary
```

### List Voices (BYOK)
```
GET https://api.elevenlabs.io/v1/voices
Headers: xi-api-key: {key}
Response: { voices: [{ voice_id, name, category, preview_url, ... }] }
```

## Stories

### Phase 1: Voice Library + Clone Creation (foundation)

**VC-001: Database schema — voice_clones + elevenlabs_tts_jobs tables**
- Migration for both tables + indexes + RLS
- AC: Tables exist, RLS policies enforce org isolation

**VC-002: ElevenLabs credential storage**
- Add `elevenlabs` integration type to credentials flow
- Settings page card: connect key, test, show plan info
- AC: Key stored encrypted, test connection works

**VC-003: `elevenlabs-voice-manage` edge function — list + create_clone**
- `list`: Return org voices from DB
- `create_clone`: Accept audio file URL, call ElevenLabs IVC, save to DB
- Platform key fallback when no BYOK key
- AC: Can clone a voice from 1-2 min audio, voice_id stored

**VC-004: `elevenlabs-voice-manage` — list_remote + import**
- `list_remote`: Fetch voices from user's ElevenLabs account
- `import_voice`: Save remote voice reference to DB
- AC: BYOK users can browse and import existing voices

**VC-005: `elevenlabs-voice-manage` — preview + delete**
- `preview`: Generate 5-sec TTS sample, upload to storage, return URL
- `delete`: Remove from DB + ElevenLabs API
- AC: Can preview any voice, delete removes from both systems

**VC-006: Voice Library settings page**
- List voices with preview playback
- Create clone button (opens wizard)
- Import button (BYOK only, shows remote voices)
- Delete with confirmation
- AC: Full CRUD on voice library from settings

**VC-007: Voice Clone Wizard — record/upload + clone + preview + save**
- Browser mic recording (MediaRecorder API)
- File upload alternative
- Upload to Supabase Storage
- Call create_clone, poll status
- Preview playback of cloned voice
- Name and save
- AC: End-to-end clone creation from browser mic or file upload

### Phase 2: Audio Generation Column

**VC-008: `elevenlabs_audio` column type registration**
- Add to column type registry in AddColumnModal
- Column config: voice_clone_id, script_template
- AC: Can add an ElevenLabs Audio column to any ops table

**VC-009: `elevenlabs-tts-generate` edge function**
- Accept voice_clone_id, script_template, table_id, row_ids
- Per row: interpolate script, call TTS, upload MP3, write cell URL
- Batch with progress tracking via elevenlabs_tts_jobs
- AC: Generates audio for selected rows, URLs in cells

**VC-010: `ElevenLabsAudioCell` component**
- Generate button (empty state)
- Processing spinner
- Audio player with play/pause (ready state)
- Error + retry (failed state)
- AC: Full cell lifecycle visible in ops table

**VC-011: Bulk "Generate Audio" action**
- Select rows, bulk action "Generate Audio"
- Calls elevenlabs-tts-generate for batch
- Progress toast
- AC: Can generate audio for 50 rows in one action

### Phase 3: Wire to Video Pipeline

**VC-012: Update Video Avatar wizard voice step**
- Add "Cloned Voice" tab alongside HeyGen Voice and Audio Column
- Lists voices from org voice library
- Stores voice_clone_id in column config
- Can create new clone inline (opens wizard)
- AC: Can assign a cloned voice to a video avatar column

**VC-013: Update video generation to use cloned voice**
- When column config has voice_clone_id + no audio_column_key:
  - Generate TTS audio on-the-fly per row
  - Pass audio_url to HeyGen
- When audio_column_key set: use existing audio column (current behavior)
- AC: Videos generated with cloned voice, lip-synced correctly

**VC-014: Credit tracking for ElevenLabs usage**
- Track TTS character usage per org
- Platform key: enforce monthly limits
- BYOK: track but don't limit
- Show usage in voice library page
- AC: Usage visible, platform key users hit limit gracefully

### Phase 4: Polish

**VC-015: Voice preview in video settings modal**
- Play sample audio for selected voice in EditHeyGenVideoSettingsModal
- Show voice source badge (HeyGen Stock / Cloned / Imported)
- AC: Can hear voice before generating videos

**VC-016: Audio column preview in ops table**
- Inline audio waveform/duration in cell
- Click to expand with full player
- Download link
- AC: Audio cells are visually informative

## Execution Order

```
Phase 1 (foundation):  VC-001 → VC-002 → VC-003 → VC-004, VC-005 (parallel) → VC-006 → VC-007
Phase 2 (audio col):   VC-008 → VC-009 → VC-010 → VC-011
Phase 3 (wire up):     VC-012 → VC-013 → VC-014
Phase 4 (polish):      VC-015, VC-016 (parallel)
```

Phases 1 and 2 can partially overlap — VC-008 can start once VC-003 is done.

## Platform ElevenLabs Key Management

- Stored as Supabase secret: `ELEVENLABS_PLATFORM_KEY`
- Shared across all orgs using the free tier
- Limits enforced server-side:
  - 1 instant clone per org (stored in voice_clones with `api_key_source = 'platform'`)
  - TTS capped at ~5,000 chars/month per org (enforced in elevenlabs-tts-generate)
- When org connects BYOK key, all new operations use their key
- Existing platform-created clones remain accessible

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| ElevenLabs rate limits | Queue TTS calls, max 3 concurrent per org |
| Audio storage costs | Auto-delete generated audio after 30 days |
| Platform key abuse | Per-org monthly character limits, enforced server-side |
| Clone quality issues | Preview step before saving, re-record option |
| HeyGen lip-sync quality varies with audio | Recommend clean, consistent audio in wizard tips |
