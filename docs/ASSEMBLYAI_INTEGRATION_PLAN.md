# AssemblyAI Transcription Integration Plan

## Overview
Replace current transcription providers (Deepgram, Gladia, MeetingBaaS, Lambda WhisperX) with AssemblyAI for meeting recordings stored in S3.

## Current State Analysis

### Current Transcription Flow
1. **Recording Source**: MeetingBaaS bot records meeting → webhook receives `bot.completed`
2. **Storage**: Recording uploaded to S3 (`meeting-recordings/{org_id}/{user_id}/{recording_id}/`)
3. **Transcription**: Multiple providers supported:
   - **Deepgram** (primary) - `transcribeWithDeepgram()` in `process-recording/index.ts`
   - **Gladia** (fallback) - `transcribeWithGladia()` in `process-recording/index.ts`
   - **MeetingBaaS** (native) - Uses transcript from webhook if available
   - **Lambda WhisperX** - Separate async pipeline via `process-transcription-callback`
4. **Database Storage**: 
   - `recordings` table: `transcript_text`, `transcript_json`, `transcription_provider`, `transcription_status`
   - `meetings` table: `transcript_text`, `transcript_json` (synced from recordings)

### Current Transcript Format
```typescript
interface TranscriptResult {
  text: string; // Plain text transcript
  utterances: TranscriptUtterance[]; // Speaker-segmented with timestamps
  speakers?: SpeakerInfo[]; // Optional speaker metadata
}

interface TranscriptUtterance {
  speaker: number; // Speaker ID (0, 1, 2, ...)
  start: number; // Start time in seconds
  end: number; // End time in seconds
  text: string; // Utterance text
  confidence?: number; // Optional confidence score
}
```

### Database Schema
- **`recordings.transcription_provider`**: CHECK constraint allows `'whisperx' | 'gladia' | 'deepgram' | 'meetingbaas'`
- **`recordings.transcription_status`**: `'pending' | 'processing' | 'complete' | 'failed'`
- **`organizations.recording_settings.default_transcription_provider`**: JSONB field (currently `'gladia'` or `'meetingbaas'`)

---

## Integration Plan

### Phase 1: Setup & Dependencies

#### 1.1 Install AssemblyAI Package
- **File**: `package.json`
- **Action**: Add `assemblyai` dependency
- **Command**: `npm install assemblyai`
- **Note**: Edge functions use Deno, so we'll need to use npm: specifier or ESM import

#### 1.2 Environment Variables
- **File**: `.env` and Supabase Edge Function secrets
- **Variables**:
  ```bash
  ASSEMBLYAI_API_KEY=<your-assemblyai-api-key>
  ```
  **Note**: Get your API key from https://www.assemblyai.com/app
- **Action**: Add to `.env.example` and document in setup guide

#### 1.3 Database Migration
- **File**: `supabase/migrations/[timestamp]_add_assemblyai_provider.sql`
- **Changes**:
  1. Update `recordings.transcription_provider` CHECK constraint to include `'assemblyai'`
  2. Update `organizations.recording_settings` default to allow `'assemblyai'`
  3. Add migration to update existing `default_transcription_provider` values if needed

---

### Phase 2: Core Implementation

#### 2.1 Create AssemblyAI Transcription Function
- **File**: `supabase/functions/process-recording/index.ts`
- **Function**: `transcribeWithAssemblyAI(audioUrl: string): Promise<TranscriptResult>`
- **Implementation**:
  ```typescript
  async function transcribeWithAssemblyAI(audioUrl: string): Promise<TranscriptResult> {
    const apiKey = Deno.env.get('ASSEMBLYAI_API_KEY');
    if (!apiKey) {
      throw new Error('ASSEMBLYAI_API_KEY not configured');
    }

    const client = new AssemblyAI({ apiKey });

    const params = {
      audio: audioUrl, // S3 URL or MeetingBaaS URL
      speech_model: 'universal', // As per user's example
      speaker_labels: true, // Enable speaker diarization
      punctuate: true,
      format_text: true,
    };

    const transcript = await client.transcripts.transcribe(params);

    // Convert AssemblyAI format to our standard format
    return {
      text: transcript.text || '',
      utterances: (transcript.utterances || []).map((u: any) => ({
        speaker: u.speaker || 0,
        start: u.start / 1000, // Convert ms to seconds
        end: u.end / 1000,
        text: u.text || '',
        confidence: u.confidence,
      })),
      speakers: transcript.speakers?.map((s: any, idx: number) => ({
        id: idx,
        name: `Speaker ${idx + 1}`,
        // AssemblyAI may provide speaker labels
      })),
    };
  }
  ```

#### 2.2 Update Transcription Provider Selection
- **File**: `supabase/functions/process-recording/index.ts`
- **Function**: `transcribeAudio()` (currently lines 384-407)
- **Change**: Replace Deepgram/Gladia fallback with AssemblyAI as primary
- **New Logic**:
  ```typescript
  async function transcribeAudio(audioUrl: string): Promise<TranscriptResult> {
    const assemblyAiKey = Deno.env.get('ASSEMBLYAI_API_KEY');
    if (assemblyAiKey) {
      try {
        return await transcribeWithAssemblyAI(audioUrl);
      } catch (error) {
        console.warn('[ProcessRecording] AssemblyAI failed:', error);
        throw error; // Fail fast - no fallback for now
      }
    }
    throw new Error('ASSEMBLYAI_API_KEY not configured');
  }
  ```

#### 2.3 Update Database Save Logic
- **File**: `supabase/functions/process-recording/index.ts`
- **Location**: `processRecording()` function (around line 907-936)
- **Change**: Set `transcription_provider: 'assemblyai'` when saving transcript
- **No other changes needed** - existing save logic handles `transcript_text` and `transcript_json` correctly

---

### Phase 3: Integration Points

#### 3.1 Update `process-recording` Edge Function
- **File**: `supabase/functions/process-recording/index.ts`
- **Changes**:
  1. Import AssemblyAI SDK (check Deno compatibility - may need `npm:assemblyai` or ESM import)
  2. Add `transcribeWithAssemblyAI()` function
  3. Replace `transcribeAudio()` to use AssemblyAI
  4. Update error handling

#### 3.2 Update Organization Settings
- **File**: `supabase/migrations/[timestamp]_add_assemblyai_provider.sql`
- **Action**: Allow `'assemblyai'` as valid `default_transcription_provider` value
- **Default**: Can set `'assemblyai'` as new default, or keep existing orgs on `'gladia'`

#### 3.3 Handle Async Transcription (if needed)
- **Note**: AssemblyAI SDK supports both sync and async transcription
- **Current**: User's example shows sync `await client.transcripts.transcribe()`
- **If async needed**: Use `client.transcripts.subscribe()` or polling pattern
- **Decision**: Start with sync, add async later if needed for long recordings

---

### Phase 4: Testing & Validation

#### 4.1 Unit Tests
- **File**: `tests/unit/transcription/assemblyai.test.ts` (new)
- **Tests**:
  - AssemblyAI API integration
  - Format conversion (AssemblyAI → our format)
  - Error handling (API failures, invalid URLs)
  - Speaker diarization mapping

#### 4.2 Integration Tests
- **File**: `tests/integration/process-recording.test.ts` (update)
- **Tests**:
  - End-to-end: Recording → S3 → AssemblyAI → Database
  - Verify `transcript_text` and `transcript_json` saved correctly
  - Verify `meetings` table sync works

#### 4.3 Manual Testing Checklist
- [ ] Test with S3 URL (production path)
- [ ] Test with MeetingBaaS URL (fallback path)
- [ ] Verify transcript appears in `recordings` table
- [ ] Verify transcript synced to `meetings` table
- [ ] Verify speaker diarization works
- [ ] Verify error handling for API failures
- [ ] Test with different audio formats (mp3, mp4, webm)

---

### Phase 5: Documentation & Deployment

#### 5.1 Update Documentation
- **File**: `docs/TRANSCRIPTION.md` (new or update existing)
- **Content**:
  - AssemblyAI setup instructions
  - API key configuration
  - Cost/pricing notes
  - Comparison with other providers

#### 5.2 Environment Setup Guide
- **File**: `.env.example`
- **Action**: Add `ASSEMBLYAI_API_KEY` with placeholder

#### 5.3 Deployment Checklist
- [ ] Run database migration
- [ ] Set `ASSEMBLYAI_API_KEY` in Supabase Edge Function secrets
- [ ] Update `.env` files (dev, staging, production)
- [ ] Deploy updated `process-recording` edge function
- [ ] Test with real recording
- [ ] Monitor logs for errors

---

## Implementation Details

### AssemblyAI SDK Import (Deno Compatibility)
Since Edge Functions run on Deno, we need to use npm: specifier:
```typescript
import { AssemblyAI } from 'npm:assemblyai@^4.0.0';
```

### Format Conversion Notes
- **AssemblyAI `utterances`**: `{ speaker, start, end, text, confidence }`
  - `start`/`end` are in **milliseconds** → convert to seconds (`/ 1000`)
- **AssemblyAI `text`**: Full transcript string (matches our format)
- **Speaker labels**: AssemblyAI provides speaker IDs (0, 1, 2, ...) - matches our format

### Error Handling
- **API failures**: Log error, set `transcription_status='failed'`, `transcription_error=error.message`
- **Invalid URLs**: Validate URL format before calling API
- **Timeout**: AssemblyAI SDK handles timeouts, but add explicit timeout wrapper if needed

### Cost Considerations
- **AssemblyAI pricing**: Check current rates (typically per minute of audio)
- **S3 URL access**: Ensure S3 URLs are publicly accessible or use presigned URLs
- **Rate limiting**: Add retry logic with exponential backoff if needed

---

## Migration Strategy

### Option A: Complete Replacement (Recommended)
- Replace Deepgram/Gladia with AssemblyAI immediately
- Update all new recordings to use AssemblyAI
- Keep existing transcripts unchanged

### Option B: Gradual Rollout
- Add AssemblyAI as new option
- Allow orgs to choose provider via `recording_settings.default_transcription_provider`
- Migrate orgs one by one

**Recommendation**: Option A (Complete Replacement) - simpler, cleaner codebase

---

## Rollback Plan

If AssemblyAI integration fails:
1. Revert `transcribeAudio()` to use Deepgram/Gladia fallback
2. Keep database migration (adds `'assemblyai'` to enum - harmless)
3. Remove AssemblyAI code, restore previous transcription logic
4. No data loss - existing transcripts remain in database

---

## Success Criteria

✅ AssemblyAI successfully transcribes recordings from S3 URLs
✅ Transcripts saved to `recordings` table with `transcription_provider='assemblyai'`
✅ Transcripts synced to `meetings` table (same as Fathom pattern)
✅ Speaker diarization works correctly
✅ Error handling robust (API failures, invalid URLs)
✅ No breaking changes to existing transcript display/processing

---

## Files to Modify

1. **`package.json`** - Add `assemblyai` dependency
2. **`supabase/functions/process-recording/index.ts`** - Add AssemblyAI transcription function
3. **`supabase/migrations/[timestamp]_add_assemblyai_provider.sql`** - Database migration
4. **`.env.example`** - Add `ASSEMBLYAI_API_KEY` placeholder
5. **`docs/TRANSCRIPTION.md`** - Documentation (new or update)

---

## Next Steps

1. Review and approve this plan
2. Create database migration file
3. Implement `transcribeWithAssemblyAI()` function
4. Update `transcribeAudio()` to use AssemblyAI
5. Test with sample recording
6. Deploy to staging
7. Monitor and validate
8. Deploy to production

---

## Questions & Considerations

1. **Async vs Sync**: User's example shows sync transcription. Should we support async for long recordings?
2. **Fallback Provider**: Should we keep Deepgram/Gladia as fallback, or fail fast if AssemblyAI fails?
3. **S3 URL Access**: Do S3 URLs need to be public, or should we use presigned URLs?
4. **Cost Monitoring**: Should we add usage tracking for AssemblyAI API calls?
5. **Speaker Identification**: AssemblyAI provides speaker IDs - do we need to map to actual names/emails?

---

## Timeline Estimate

- **Phase 1 (Setup)**: 1-2 hours
- **Phase 2 (Core Implementation)**: 3-4 hours
- **Phase 3 (Integration)**: 2-3 hours
- **Phase 4 (Testing)**: 2-3 hours
- **Phase 5 (Documentation)**: 1 hour

**Total**: ~10-13 hours
