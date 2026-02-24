# S3 Storage & Cost Tracking - Execution Plan

**Created**: 2026-01-26
**Estimated Time**: 7 hours
**Priority**: High (enables permanent video storage)

---

## Overview

Implement Phase 1 of S3 storage solution:
1. **Background S3 Upload**: Async job streams videos from MeetingBaaS to S3 without memory buffering
2. **Cost Tracking Dashboard**: Admin interface to monitor storage costs and usage trends

---

## Feature 1: Background S3 Upload

### Architecture

```
MeetingBaaS Webhook
  └─> Store URLs in bot_deployments
  └─> Set recordings.s3_upload_status = 'pending'
            ↓
  Poll S3 Upload Queue (every 5 min)
  └─> Find recordings with status='pending'
  └─> Trigger upload-recording-to-s3 function
            ↓
  Upload Recording to S3
  └─> Stream from MeetingBaaS URL (no buffering)
  └─> Multipart upload to S3 in 5MB chunks
  └─> Update s3_video_url, s3_audio_url
  └─> Set status='complete'
            ↓
  Process Gladia Webhook (after transcription)
  └─> Sync S3 URLs to meetings table
  └─> Meeting now has video_url for playback
```

### Stories (6 total, ~2.5 hours)

**S3-001: Schema Foundation** (15 min)
- Add s3_upload_status, s3_file_size_bytes, s3_upload_*_at columns
- Create index for queue queries
- Migration: `20260126160000_add_s3_upload_tracking.sql`

**S3-002: Upload Function** (30 min) ⚠️ Most Complex
- Create `upload-recording-to-s3/index.ts` edge function
- Implement streaming upload with AWS S3 multipart API
- No memory buffering - use fetch() stream reader
- Handle ~480MB files in < 9 min edge function limit

**S3-003: Queue Integration** (15 min)
- Modify `meetingbaas-webhook` to set status='pending'
- Store MeetingBaaS URLs (4-hour expiry)
- Don't block webhook on upload

**S3-004: Polling Cron** (20 min)
- Create `poll-s3-upload-queue` function
- Run every 5 minutes via pg_cron
- Priority: oldest recordings first (FIFO)
- Skip expired URLs (> 4 hours old)

**S3-005: Sync to Meetings** (10 min)
- Update `process-gladia-webhook` to sync S3 URLs
- Conditional: only if S3 upload complete
- Updates meetings.video_url, audio_url

**S3-006: Retry Logic** (15 min)
- Add retry_count column and exponential backoff
- Retry: 2 min, 5 min, 10 min (max 3 attempts)
- Mark failed after 3 retries or URL expiry

---

## Feature 2: Cost Tracking Dashboard

### Architecture

```
Daily Cron (midnight UTC)
  └─> Calculate S3 metrics by org
  └─> Sum total storage (GB)
  └─> Count uploads in last 24h
  └─> Estimate costs
  └─> Insert into s3_usage_metrics table
            ↓
Admin API Endpoint
  └─> GET /api/admin/s3-metrics
  └─> Fetch metrics with date range
  └─> Aggregate: day/week/month
  └─> Project next month costs
            ↓
Admin Dashboard UI
  └─> MeetingBaaSAdmin → "Storage & Costs" tab
  └─> Chart: storage growth over time
  └─> Cards: total storage, monthly cost, recordings
  └─> Alert if cost > $50/month
```

### Stories (5 total, ~1.8 hours)

**COST-001: Metrics Schema** (20 min)
- Create `s3_usage_metrics` table
- Columns: org_id, date, metric_type, value, cost_usd
- Types: storage_gb, upload_gb, download_gb
- RLS: admin-only access

**COST-002: Metrics Calculation** (25 min)
- Create `update-s3-metrics` edge function
- Daily cron: calculate storage, uploads, costs
- Cost formula: storage_gb × $0.023 / 30 (daily)
- Download estimate: 50% of storage watched

**COST-003: API Endpoint** (20 min)
- Create `admin-s3-metrics` function
- Query params: start_date, end_date, org_id
- Returns: total storage, cost, daily breakdown
- Projections: current/next month estimates

**COST-004: UI Component** (30 min)
- Create `S3CostMetrics.tsx` component
- Recharts line chart: storage growth
- Metrics cards: storage (GB), cost ($), recordings
- Export CSV button

**COST-005: Admin Integration** (15 min)
- Add "Storage & Costs" tab to MeetingBaaSAdmin
- Show S3CostMetrics component
- Alert if monthly cost > $50

---

## Execution Order

### Sequential Dependencies

```
Group 1: S3-001 (schema)
           ↓
Group 2: S3-002 (upload) + S3-003 (webhook) [parallel]
           ↓
Group 3: S3-004 (polling)
           ↓
Group 4: S3-005 (sync) + S3-006 (retry) [parallel]
           ↓
Group 5: COST-001 (metrics schema)
           ↓
Group 6: COST-002 (calculation)
           ↓
Group 7: COST-003 (API)
           ↓
Group 8: COST-004 (UI)
           ↓
Group 9: COST-005 (integration)
```

### Parallel Opportunities

- **After S3-001**: Work on S3-002 and S3-003 simultaneously
- **After S3-004**: Work on S3-005 and S3-006 simultaneously
- **Cost tracking**: Can start COST-001 before S3 upload is complete

---

## Technical Implementation Details

### S3 Streaming Upload Pattern

```typescript
// supabase/functions/upload-recording-to-s3/index.ts

import { S3Client, CreateMultipartUploadCommand,
         UploadPartCommand, CompleteMultipartUploadCommand } from '@aws-sdk/client-s3';

async function streamUploadToS3(sourceUrl: string, s3Key: string) {
  const s3 = new S3Client({ region: 'eu-west-2' });

  // Step 1: Initiate multipart upload
  const { UploadId } = await s3.send(new CreateMultipartUploadCommand({
    Bucket: 'use60-staging',
    Key: s3Key,
  }));

  // Step 2: Stream from MeetingBaaS in chunks
  const response = await fetch(sourceUrl);
  const reader = response.body.getReader();

  const parts = [];
  let partNumber = 1;
  let buffer = new Uint8Array();
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB minimum

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Accumulate until chunk size
    buffer = concatenateUint8Arrays(buffer, value);

    if (buffer.length >= CHUNK_SIZE) {
      const part = await s3.send(new UploadPartCommand({
        Bucket: 'use60-staging',
        Key: s3Key,
        UploadId,
        PartNumber: partNumber,
        Body: buffer,
      }));

      parts.push({ ETag: part.ETag, PartNumber: partNumber });
      partNumber++;
      buffer = new Uint8Array(); // Reset buffer
    }
  }

  // Upload final chunk
  if (buffer.length > 0) {
    const part = await s3.send(new UploadPartCommand({
      Bucket: 'use60-staging',
      Key: s3Key,
      UploadId,
      PartNumber: partNumber,
      Body: buffer,
    }));
    parts.push({ ETag: part.ETag, PartNumber: partNumber });
  }

  // Step 3: Complete upload
  await s3.send(new CompleteMultipartUploadCommand({
    Bucket: 'use60-staging',
    Key: s3Key,
    UploadId,
    MultipartUpload: { Parts: parts },
  }));

  return `https://use60-staging.s3.eu-west-2.amazonaws.com/${s3Key}`;
}
```

### Cost Calculation Formula

```typescript
// Daily storage cost per GB
const STORAGE_COST_PER_GB_MONTH = 0.023;
const STORAGE_COST_PER_GB_DAY = STORAGE_COST_PER_GB_MONTH / 30;

// Bandwidth costs
const DOWNLOAD_COST_PER_GB = 0.09;
const UPLOAD_COST_PER_GB = 0; // Free

function calculateDailyCost(storageGB: number, downloadsGB: number) {
  const storageCost = storageGB * STORAGE_COST_PER_GB_DAY;
  const downloadCost = downloadsGB * DOWNLOAD_COST_PER_GB;
  return storageCost + downloadCost;
}

// Estimate monthly cost
function estimateMonthly(dailyStorageGB: number) {
  // Assume 50% of videos watched per month
  const monthlyDownloadsGB = dailyStorageGB * 0.5;

  const storageCost = dailyStorageGB * STORAGE_COST_PER_GB_MONTH;
  const downloadCost = monthlyDownloadsGB * DOWNLOAD_COST_PER_GB;

  return storageCost + downloadCost;
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// Test S3 streaming upload
describe('streamUploadToS3', () => {
  it('uploads 5MB file in single chunk', async () => {
    // Mock S3 client
    // Test single-part upload
  });

  it('uploads 20MB file in multiple chunks', async () => {
    // Test multipart upload with 4 chunks (5MB each)
  });

  it('handles network error with retry', async () => {
    // Test exponential backoff
  });
});

// Test cost calculation
describe('calculateDailyCost', () => {
  it('calculates storage cost correctly', () => {
    expect(calculateDailyCost(100, 0)).toBe(0.0767); // ~$0.08/day
  });

  it('includes download cost', () => {
    expect(calculateDailyCost(100, 50)).toBe(4.5767); // ~$4.58/day
  });
});
```

### Integration Tests

1. **End-to-End Upload Flow**
   - Deploy test recording bot
   - Verify webhook sets s3_upload_status='pending'
   - Trigger poll-s3-upload-queue manually
   - Check S3 bucket for uploaded video
   - Verify meetings table has video_url

2. **Metrics Calculation**
   - Create test recordings with known sizes
   - Run update-s3-metrics function
   - Verify s3_usage_metrics table has correct values
   - Check cost calculation accuracy

3. **Admin Dashboard**
   - Navigate to MeetingBaaSAdmin
   - Click "Storage & Costs" tab
   - Verify chart renders with data
   - Test date range picker
   - Test CSV export

### Manual Testing Checklist

- [ ] Upload 5-min recording (~80MB)
- [ ] Upload 15-min recording (~240MB)
- [ ] Upload 30-min recording (~480MB)
- [ ] Verify all S3 URLs work in video player
- [ ] Check cost dashboard shows correct totals
- [ ] Test retry logic by killing upload mid-process
- [ ] Verify expired URL handling (mock 4+ hour old recording)

---

## Deployment Steps

### 1. Deploy Schema Migrations

```bash
cd /Users/andrewbryce/Documents/sixty-sales-dashboard

# Apply all S3 migrations
supabase db push

# Verify migrations applied
psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name='recordings' AND column_name LIKE 's3%';"
```

### 2. Deploy Edge Functions

```bash
# Deploy in order
supabase functions deploy upload-recording-to-s3 --project-ref caerqjzvuerejfrdtygb
supabase functions deploy poll-s3-upload-queue --project-ref caerqjzvuerejfrdtygb
supabase functions deploy update-s3-metrics --project-ref caerqjzvuerejfrdtygb
supabase functions deploy admin-s3-metrics --project-ref caerqjzvuerejfrdtygb

# Redeploy with changes
supabase functions deploy meetingbaas-webhook --project-ref caerqjzvuerejfrdtygb
supabase functions deploy process-gladia-webhook --project-ref caerqjzvuerejfrdtygb
```

### 3. Verify Cron Jobs

```sql
-- Check S3 upload polling cron
SELECT * FROM cron.job WHERE jobname = 'poll-s3-upload-queue';

-- Check metrics calculation cron
SELECT * FROM cron.job WHERE jobname = 'update-s3-metrics';
```

### 4. Deploy Frontend

```bash
npm run build
# Deploy to Vercel/hosting
```

---

## Monitoring & Alerts

### Key Metrics to Track

1. **S3 Upload Success Rate**
   - Query: `SELECT COUNT(*) FROM recordings WHERE s3_upload_status='complete' / total`
   - Target: > 95%

2. **Average Upload Time**
   - Query: `SELECT AVG(s3_upload_completed_at - s3_upload_started_at) FROM recordings`
   - Target: < 5 minutes for 30-min recordings

3. **Failed Uploads**
   - Query: `SELECT * FROM recordings WHERE s3_upload_status='failed'`
   - Alert if > 5% failure rate

4. **Monthly Storage Cost**
   - Query: `SELECT SUM(cost_usd) FROM s3_usage_metrics WHERE date >= date_trunc('month', CURRENT_DATE)`
   - Alert if > $50/month

### Supabase Dashboard Queries

```sql
-- Failed uploads in last 24 hours
SELECT id, s3_upload_error_message, s3_upload_retry_count
FROM recordings
WHERE s3_upload_status = 'failed'
  AND updated_at > NOW() - INTERVAL '24 hours';

-- Storage growth trend
SELECT
  DATE(created_at) as date,
  COUNT(*) as recordings,
  SUM(s3_file_size_bytes) / 1e9 as total_gb
FROM recordings
WHERE s3_upload_status = 'complete'
GROUP BY DATE(created_at)
ORDER BY date DESC
LIMIT 30;
```

---

## Cost Projections

### Year 1 Estimate

**Assumptions**:
- 50 recordings/month average
- 30 min average duration = 480MB per recording
- 50% playback rate

**Monthly Breakdown**:

| Metric | Value | Cost |
|--------|-------|------|
| New recordings | 50 × 480MB = 24GB | - |
| Cumulative storage (Month 1) | 24GB | $0.55 |
| Cumulative storage (Month 6) | 144GB | $3.31 |
| Cumulative storage (Month 12) | 288GB | $6.62 |
| Upload bandwidth | 24GB | $0 (free) |
| Download bandwidth | 12GB | $1.08 |

**Total Year 1**: ~$50-60

**With Lifecycle Policies** (90-day Glacier):
- Move to Glacier after 90 days: $0.004/GB (83% savings)
- **Reduced Year 1**: ~$20-25

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| S3 multipart upload complexity | Medium | Use AWS SDK, test with large files, monitor errors |
| MeetingBaaS URL expiry before upload | Low | Priority FIFO queue, retry logic, 5-min polling |
| Edge function timeout (9 min limit) | Medium | Test with 60-min recordings (~1GB), optimize chunk size |
| Cost tracking accuracy | Low | Start with estimates, integrate CloudWatch later |
| Storage costs exceed budget | Low | Set alerts at $50/month, implement lifecycle policies |

---

## Success Criteria

✅ **Feature Complete When**:
1. New recordings automatically upload to S3 within 10 minutes
2. S3 URLs appear in meetings table for video playback
3. Failed uploads retry up to 3 times before marking failed
4. Admin dashboard shows real-time storage metrics
5. Cost projections accurate within 10%
6. < 5% upload failure rate over 30 days

---

## Next Steps After Phase 1

**Phase 2: Optimization** (Future)
- Implement S3 lifecycle policies (move to Glacier after 90 days)
- Add thumbnail generation during upload
- CloudWatch integration for actual bandwidth tracking
- Video transcoding for smaller file sizes

**Phase 3: Advanced Features** (Future)
- Download analytics per video
- Storage quotas per org
- Auto-delete old recordings (> 1 year)
- CDN integration for faster playback

---

## Questions & Decisions

**Q: Should we upload video + audio separately or together?**
A: Separately. Allows audio-only playback if video upload fails.

**Q: What S3 storage class to use initially?**
A: S3 Standard. Move to lifecycle policies after validating usage patterns.

**Q: How to handle partial uploads (network interruption)?**
A: AWS multipart upload is resumable. Store UploadId in database for resume capability.

**Q: Should cost dashboard be org-specific or global?**
A: Both. Show global admin view + per-org breakdown.

---

**Ready to implement?** Run `60/run` to start execution with this plan.
