# AssemblyAI Integration - Deployment Guide

## ✅ Pre-Deployment Checklist

- [x] Package installed: `assemblyai@^4.0.0` added to `package.json`
- [x] Migration created: `20260129000000_add_assemblyai_transcription_provider.sql`
- [x] Code implemented: `transcribeWithAssemblyAI()` function added
- [x] Environment variable added to `.env` and `.env.example`

## 🚀 Deployment Steps

### Step 1: Deploy Database Migration

The migration adds `'assemblyai'` to the `transcription_provider` enum constraint.

#### Option A: Via Supabase Dashboard (Recommended for Development)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/wbgmnyekgqklggilgqag
2. Navigate to **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy the entire contents of:
   ```
   supabase/migrations/20260129000000_add_assemblyai_transcription_provider.sql
   ```
5. Paste into SQL Editor
6. Click **Run** (or Cmd/Ctrl + Enter)
7. Verify success message

#### Option B: Via Supabase CLI (Staging/Production)

```bash
# For staging
./scripts/deploy-migrations.sh staging

# For production (requires confirmation)
./scripts/deploy-migrations.sh production
```

**Note**: Requires `SUPABASE_DB_PASSWORD` environment variable set.

---

### Step 2: Set Environment Variable in Supabase

The edge function needs `ASSEMBLYAI_API_KEY` to be set in Supabase.

1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/wbgmnyekgqklggilgqag
2. Navigate to **Edge Functions** → **Settings** → **Secrets** (or **Environment Variables**)
3. Click **Add Secret** or **Add Variable**
4. Add:
   - **Name**: `ASSEMBLYAI_API_KEY`
   - **Value**: `<your-assemblyai-api-key>` (get from https://www.assemblyai.com/app)
5. Click **Save**

**Important**: This must be set **before** deploying the edge function, or transcription will fail.

---

### Step 3: Deploy Edge Function

Deploy the updated `process-recording` function:

```bash
# Deploy to development/staging
supabase functions deploy process-recording --project-ref wbgmnyekgqklggilgqag

# Or use the deployment script for staging
./scripts/deploy-functions-staging.sh process-recording
```

---

### Step 4: Verify Deployment

#### Check Migration Applied

Run this query in Supabase SQL Editor:

```sql
-- Check constraint includes 'assemblyai'
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conname = 'recordings_transcription_provider_check';
```

Expected output should include `'assemblyai'` in the CHECK constraint.

#### Check Environment Variable

```bash
# Test if function can access the secret (requires Supabase CLI)
supabase secrets list --project-ref wbgmnyekgqklggilgqag
```

#### Test Transcription

1. Trigger a recording via MeetingBaaS webhook
2. Check `recordings` table:
   ```sql
   SELECT 
     id,
     transcription_provider,
     transcription_status,
     transcript_text IS NOT NULL as has_transcript
   FROM recordings
   ORDER BY created_at DESC
   LIMIT 5;
   ```
3. Verify:
   - `transcription_provider = 'assemblyai'`
   - `transcription_status = 'complete'`
   - `transcript_text` is populated

---

## 🔍 Troubleshooting

### Migration Fails

**Error**: `constraint already exists`
- **Solution**: The constraint may have been partially applied. Check if `'assemblyai'` is already in the enum by running:
  ```sql
  SELECT DISTINCT transcription_provider FROM recordings;
  ```

**Error**: `syntax error`
- **Solution**: Verify SQL syntax in Supabase SQL Editor first (it will highlight errors)

### Transcription Fails

**Error**: `ASSEMBLYAI_API_KEY not configured`
- **Solution**: 
  1. Verify secret is set in Supabase Dashboard
  2. Redeploy the function after setting the secret
  3. Check function logs: Supabase Dashboard → Edge Functions → process-recording → Logs

**Error**: `AssemblyAI API error: ...`
- **Solution**:
  1. Check API key is valid
  2. Verify S3 URL is publicly accessible (or use presigned URL)
  3. Check AssemblyAI account limits/quota
  4. Review function logs for detailed error message

### Transcript Not Saved

**Check**:
1. Verify `transcription_status = 'complete'` in `recordings` table
2. Check `transcription_error` column for error messages
3. Verify `transcript_text` and `transcript_json` columns are populated
4. Check if transcript synced to `meetings` table

---

## 📊 Monitoring

### Check Transcription Status

```sql
-- View recent transcription status
SELECT 
  id,
  created_at,
  transcription_provider,
  transcription_status,
  transcription_error,
  CASE 
    WHEN transcript_text IS NOT NULL THEN 'Has transcript'
    ELSE 'No transcript'
  END as transcript_status
FROM recordings
ORDER BY created_at DESC
LIMIT 10;
```

### Check AssemblyAI Usage

Monitor AssemblyAI API usage in their dashboard:
- https://www.assemblyai.com/app/usage

---

## ✅ Post-Deployment Verification

- [ ] Migration applied successfully
- [ ] `ASSEMBLYAI_API_KEY` set in Supabase secrets
- [ ] Edge function deployed
- [ ] Test recording transcribed successfully
- [ ] Transcript saved to `recordings` table
- [ ] Transcript synced to `meetings` table
- [ ] `transcription_provider = 'assemblyai'` set correctly
- [ ] Speaker diarization working (check `transcript_json`)

---

## 🔄 Rollback Plan

If AssemblyAI integration causes issues:

1. **Revert Edge Function**:
   ```bash
   git checkout HEAD~1 supabase/functions/process-recording/index.ts
   supabase functions deploy process-recording --project-ref wbgmnyekgqklggilgqag
   ```

2. **Migration Rollback** (if needed):
   ```sql
   -- Remove 'assemblyai' from constraint (if no recordings use it yet)
   ALTER TABLE recordings
     DROP CONSTRAINT IF EXISTS recordings_transcription_provider_check;
   
   ALTER TABLE recordings
     ADD CONSTRAINT recordings_transcription_provider_check
       CHECK (transcription_provider IN ('whisperx', 'gladia', 'deepgram', 'meetingbaas'));
   ```

3. **No Data Loss**: Existing transcripts remain in database, only new recordings affected.

---

## 📝 Notes

- **S3 URL Access**: Ensure S3 bucket allows public read access OR generate presigned URLs before passing to AssemblyAI
- **Async Transcription**: Current implementation uses sync transcription. For very long recordings (>2 hours), consider switching to async pattern
- **Cost Monitoring**: Set up alerts in AssemblyAI dashboard for usage limits
