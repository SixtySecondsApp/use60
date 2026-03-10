# PRD: VoiceBox White-Labeled TTS ("60 Voice")

## Introduction

Integrate VoiceBox (open-source Qwen3-TTS engine) as a white-labeled TTS solution branded "60 Voice", running on our on-prem Windows machine (Turbo). This gives users a built-in voice cloning and TTS capability at half the credit cost of ElevenLabs, while keeping ElevenLabs as a premium BYOK integration. Audio files are stored in S3.

## Goals

- Deploy VoiceBox on Turbo (on-prem, 64GB RAM, Windows) with internet access via Cloudflare Tunnel
- White-label as "60 Voice" with no mention of underlying technology
- Price at half the credit cost of ElevenLabs TTS
- Reuse existing voice clone UX (upload/record audio, clone, preview, save to Voice Library)
- Store generated audio in S3
- Unify the Ops table audio column into a single "Audio" type with provider selection (60 Voice / ElevenLabs)

## Prerequisites

- Verify Turbo GPU has 8GB+ VRAM (12GB+ ideal) before starting any work
- Turbo must be running and accessible on the local network
- AWS S3 bucket credentials available for audio storage

## User Stories

### US-001: Verify Turbo GPU & Install VoiceBox
**Description:** As a platform operator, I want VoiceBox installed and running on Turbo so that TTS generation is available via API.

**Acceptance Criteria:**
- [ ] Confirm Turbo GPU has 8GB+ VRAM and CUDA support
- [ ] VoiceBox repo cloned, dependencies installed (Python 3.11+, PyTorch CUDA)
- [ ] VoiceBox FastAPI server starts and responds on `localhost:8000`
- [ ] `/generate` endpoint returns audio for a test prompt
- [ ] `/profiles` endpoint lists voice profiles
- [ ] Server configured to start automatically on boot (Windows service or scheduled task)

### US-002: Expose VoiceBox API via Cloudflare Tunnel
**Description:** As a platform operator, I want Turbo's VoiceBox API securely accessible from the internet so that Supabase Edge Functions can call it.

**Acceptance Criteria:**
- [ ] Cloudflare Tunnel installed on Turbo
- [ ] Tunnel configured to route `voicebox.use60.com` (or similar subdomain) to `localhost:8000`
- [ ] Shared secret header auth added — requests without valid `X-API-Key` header are rejected
- [ ] Edge function can reach the VoiceBox API from Supabase (test with curl from staging)
- [ ] HTTPS enforced (handled by Cloudflare)
- [ ] VoiceBox URL and API key stored as Supabase secrets (`VOICEBOX_URL`, `VOICEBOX_API_KEY`)

### US-003: S3 Audio Storage Utility
**Description:** As the platform, I want generated audio files stored in S3 so that they are served via CDN and not dependent on Supabase Storage.

**Acceptance Criteria:**
- [ ] S3 bucket created (e.g. `sixty-voice-audio`) with appropriate CORS policy
- [ ] Shared edge function utility in `_shared/s3Upload.ts` that uploads audio buffer to S3 and returns public URL
- [ ] Upload path convention: `audio/{orgId}/{rowId}/{timestamp}.mp3`
- [ ] S3 credentials stored as Supabase secrets (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_S3_REGION`)
- [ ] Typecheck passes

### US-004: VoiceBox Voice Clone Edge Function
**Description:** As a user, I want to clone my voice using 60 Voice so that I can generate personalized audio without needing an ElevenLabs account.

**Acceptance Criteria:**
- [ ] New edge function `voicebox-voice-manage` with actions: `create_clone`, `list`, `preview`, `delete`
- [ ] `create_clone`: accepts uploaded audio, sends to VoiceBox `/profiles` API, saves to `voice_clones` table with `source = 'voicebox'`
- [ ] `preview`: calls VoiceBox `/generate` with sample text, uploads preview MP3 to S3, returns URL
- [ ] `delete`: removes profile from VoiceBox API and deletes `voice_clones` record
- [ ] `list`: returns org's VoiceBox voices from DB
- [ ] Uses shared secret auth to call Turbo
- [ ] Credit check before clone creation
- [ ] Typecheck passes

### US-005: VoiceBox TTS Generation Edge Function
**Description:** As a user, I want to generate audio for Ops table rows using 60 Voice so that I get TTS at half the credit cost of ElevenLabs.

**Acceptance Criteria:**
- [ ] New edge function `voicebox-tts-generate` mirroring `elevenlabs-tts-generate` pattern
- [ ] Accepts `voice_clone_id`, `script_template`, `table_id`, `row_ids`, `audio_column_key`
- [ ] Interpolates `{{column_key}}` placeholders from row cell values
- [ ] Calls VoiceBox `/generate` endpoint with cloned voice profile
- [ ] Uploads generated MP3 to S3 via `_shared/s3Upload.ts`
- [ ] Updates cell value with `{ status, audio_url, error_message }` format
- [ ] Batch processing with concurrency control (MAX_CONCURRENT=3, MAX_BATCH=50)
- [ ] Creates job record for progress tracking (reuse `elevenlabs_tts_jobs` table or new `tts_jobs` table)
- [ ] Credit deduction at half the ElevenLabs rate
- [ ] Typecheck passes

### US-006: Extend Voice Library for Dual Provider
**Description:** As a user, I want to see both 60 Voice and ElevenLabs voices in my Voice Library so that I can manage all my voices in one place.

**Acceptance Criteria:**
- [ ] `VoiceLibrary.tsx` shows voices from both providers with a filter tab: All / 60 Voice / ElevenLabs
- [ ] 60 Voice clones display with "60 Voice" badge (no mention of VoiceBox/Qwen3)
- [ ] Voice clone wizard detects provider: if no ElevenLabs BYOK key, defaults to 60 Voice; if BYOK connected, user picks provider
- [ ] Preview playback works for both providers
- [ ] Delete works for both providers
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-007: Unified Audio Column Type with Provider Selection
**Description:** As a user, I want a single "Audio" column type in the Add Column modal where I pick my provider as the first step, so the experience is clean and unified.

**Acceptance Criteria:**
- [ ] `AddColumnModal` shows one "Audio" column type (replaces separate `elevenlabs_audio`)
- [ ] Clicking "Audio" opens a unified wizard with Step 1: Choose Provider (60 Voice / ElevenLabs)
- [ ] ElevenLabs option disabled with "Connect API key" hint if no BYOK key configured
- [ ] 60 Voice option always available
- [ ] After provider selection, wizard continues with existing flow (Voice → Script)
- [ ] Column type stored as `audio` with `integrationConfig.provider: 'voicebox' | 'elevenlabs'`
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-008: Audio Cell Renderer for Dual Provider
**Description:** As a user, I want the audio cell in the Ops table to work identically regardless of which provider generated the audio.

**Acceptance Criteria:**
- [ ] `ElevenLabsAudioCell` renamed/generalized to `AudioCell` (or provider-agnostic wrapper)
- [ ] Cell reads `integrationConfig.provider` to determine which edge function to call for generation
- [ ] Playback, progress bar, duration display work identically for both providers
- [ ] "Generate" and "Retry" buttons call the correct provider's edge function
- [ ] Bulk generate action (`GenerateAudioAction`) routes to correct provider
- [ ] Typecheck passes
- [ ] Verify in browser on localhost:5175

### US-009: Credit Pricing for 60 Voice
**Description:** As a platform operator, I want 60 Voice TTS charged at half the ElevenLabs credit rate so that users have a cost-effective default option.

**Acceptance Criteria:**
- [ ] Credit cost for 60 Voice TTS generation is 50% of ElevenLabs rate
- [ ] Credit deduction happens in `voicebox-tts-generate` before generation
- [ ] Insufficient credits shows clear error toast with "Upgrade" CTA
- [ ] Credit usage visible in billing/usage dashboard (if exists)
- [ ] Typecheck passes

## Functional Requirements

- FR-1: VoiceBox API on Turbo must be protected with shared secret auth — no unauthenticated access
- FR-2: All generated audio stored in S3, not Supabase Storage
- FR-3: Voice clones stored in existing `voice_clones` table with `source = 'voicebox'`
- FR-4: Script template interpolation (`{{column_key}}`) must work identically across both providers
- FR-5: Cell value format `{ status, audio_url, error_message }` is provider-agnostic
- FR-6: If Turbo is unreachable, generation fails gracefully with clear error message (not silent failure)
- FR-7: 60 Voice branding only — no mention of VoiceBox, Qwen3, or underlying technology in the UI

## Non-Goals (Out of Scope)

- Real-time streaming TTS (VoiceBox roadmap, not needed now)
- Multi-language support beyond English (Qwen3-TTS supports Chinese too, but not exposing it)
- VoiceBox desktop app distribution to users (server-only deployment)
- Migrating existing ElevenLabs audio to S3 (new audio only)
- Voice effects, pitch shifting, or audio editing
- VoiceBox UI — we only use the API

## Technical Considerations

### Infrastructure
- VoiceBox runs as a persistent FastAPI server on Turbo (Windows)
- Cloudflare Tunnel provides secure, free HTTPS ingress
- No DNS changes needed beyond adding a CNAME for the tunnel subdomain

### Database Changes
- Add `'voicebox'` to `voice_clones.source` enum/constraint
- May need a generic `tts_jobs` table or extend `elevenlabs_tts_jobs` with a `provider` column
- Column type migration: `elevenlabs_audio` → `audio` (or support both for backwards compat)

### Existing Patterns to Follow
- `elevenlabs-tts-generate` edge function for batch TTS pattern
- `elevenlabs-voice-manage` edge function for voice CRUD pattern
- `VoiceLibrary.tsx` component structure and state management
- `ElevenLabsAudioColumnWizard.tsx` wizard step pattern
- `_shared/corsHelper.ts` for CORS in new edge functions

### S3 Integration
- Use AWS SDK v3 (`@aws-sdk/client-s3`) or raw `fetch` with presigned URLs
- For Deno edge functions: `npm:@aws-sdk/client-s3` or manual S3 REST API with `crypto.subtle` for signing

### Risk: Turbo Availability
- If Turbo goes offline, all 60 Voice generation fails
- Consider a health check endpoint that the app polls to show provider status
- No SLA — this is acceptable for current scale

## Success Metrics

- 60 Voice clone creation completes in under 60 seconds
- TTS generation latency under 10 seconds per row
- Audio quality subjectively comparable to ElevenLabs for sales use cases
- Users adopt 60 Voice for 50%+ of audio generation within 30 days of launch

## Open Questions

- What is the exact GPU model in Turbo? (blocks US-001)
- S3 bucket: use existing AWS account or create new one?
- Credit pricing: what is the current ElevenLabs credit rate? (need exact number to halve)
- Should we add a health/status indicator in the UI showing if 60 Voice is available?
- Domain for Cloudflare Tunnel — `voicebox.use60.com` or different subdomain?
