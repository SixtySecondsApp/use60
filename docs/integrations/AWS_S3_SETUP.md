# AWS S3 Configuration for Meeting Recordings

## Overview
Meeting recordings are now stored in AWS S3 instead of Supabase Storage.

**Bucket Details:**
- **Name**: `use60-application`
- **Region**: `eu-west-2` (Europe - London)
- **Structure**: `meeting-recordings/{org_id}/{user_id}/{recording_id}/recording.{ext}`
- **Access**: Private (pre-signed URLs with 7-day expiry)

## Required Environment Variables

Add these environment variables to your Supabase Edge Functions:

### 1. Via Supabase Dashboard

1. Go to: https://supabase.com/dashboard/project/ygdpgliavpxeugaajgrb
2. Navigate to: **Edge Functions** → **Settings** → **Environment Variables**
3. Add the following variables:

```bash
AWS_REGION=eu-west-2
AWS_S3_BUCKET=use60-application
AWS_ACCESS_KEY_ID=<your-aws-access-key-id>
AWS_SECRET_ACCESS_KEY=<your-aws-secret-access-key>
```

### 2. Via Supabase CLI

```bash
# Set environment variables
supabase secrets set AWS_REGION=eu-west-2
supabase secrets set AWS_S3_BUCKET=use60-application
supabase secrets set AWS_ACCESS_KEY_ID=<your-access-key>
supabase secrets set AWS_SECRET_ACCESS_KEY=<your-secret-key>

# Verify they're set
supabase secrets list
```

## AWS IAM User Setup

### Create IAM User with S3 Access

1. **Go to AWS IAM Console**: https://console.aws.amazon.com/iam/
2. **Create new user**:
   - User name: `use60-recording-uploader`
   - Access type: Programmatic access
3. **Attach policy** (create custom policy):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowRecordingBucketAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:HeadObject"
      ],
      "Resource": [
        "arn:aws:s3:::use60-application",
        "arn:aws:s3:::use60-application/*"
      ]
    }
  ]
}
```

4. **Save credentials**:
   - Access Key ID
   - Secret Access Key
   - ⚠️ **IMPORTANT**: Store these securely - they can't be retrieved again!

### S3 Bucket Configuration

1. **Bucket Policy** (should already be configured):
   - Private bucket (Block all public access: ✅)
   - Pre-signed URLs for temporary access
   - Lifecycle rules for automatic deletion (optional)

2. **CORS Configuration** (if accessing from browser):
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": [
      "https://app.use60.com",
      "http://localhost:5175"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

## Deployment Steps

### 1. Set Environment Variables

```bash
# Set AWS credentials (replace with actual values)
supabase secrets set AWS_REGION=eu-west-2
supabase secrets set AWS_S3_BUCKET=use60-application
supabase secrets set AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
supabase secrets set AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

### 2. Deploy Edge Functions

```bash
# Deploy updated functions
supabase functions deploy process-recording
supabase functions deploy get-recording-url

# Verify deployment
supabase functions list | grep -E "process-recording|get-recording-url"
```

### 3. Test S3 Upload

Test with a recent recording that hasn't been uploaded yet:

```sql
-- Find recent recordings without S3 URL
SELECT
  id,
  title,
  status,
  created_at,
  meetingbaas_recording_id,
  recording_s3_url IS NULL as needs_upload
FROM recordings
WHERE status IN ('processing', 'pending')
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 5;
```

**Manually trigger processing** for a recording:
```bash
# Call process-recording endpoint
curl -X POST \
  "https://ygdpgliavpxeugaajgrb.supabase.co/functions/v1/process-recording" \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "recording_id": "<recording-id-from-query>",
    "bot_id": "<meetingbaas-bot-id>"
  }'
```

### 4. Monitor Logs

```bash
# Watch process-recording logs
supabase functions logs process-recording --follow

# Filter for S3-related logs
supabase functions logs process-recording --limit 100 | grep -i "s3\|upload\|aws"
```

## Verification Checklist

After deployment, verify:

- [ ] Environment variables are set correctly
- [ ] Edge functions deployed successfully
- [ ] IAM user has correct permissions
- [ ] S3 bucket policy allows IAM user access
- [ ] Test recording upload succeeds
- [ ] Signed URLs are generated correctly
- [ ] Dashboard displays recordings with S3 URLs

## Folder Structure in S3

```
use60-application/
├── meeting-recordings/
│   ├── {org-id-1}/
│   │   ├── {user-id-1}/
│   │   │   ├── {recording-id-1}/
│   │   │   │   └── recording.mp4
│   │   │   ├── {recording-id-2}/
│   │   │   │   └── recording.webm
│   │   └── {user-id-2}/
│   │       └── {recording-id-3}/
│   │           └── recording.mp4
│   └── {org-id-2}/
│       └── {user-id-3}/
│           └── {recording-id-4}/
│               └── recording.mp4
└── voice-recordings/
    └── (future feature)
```

**Benefits:**
- ✅ Org isolation: Each org's data in separate folder
- ✅ User isolation: Each user's recordings separated
- ✅ Easy cleanup: Delete entire org/user folder
- ✅ Cost tracking: S3 cost explorer by prefix

## Troubleshooting

### Issue: "Access Denied" Error

**Symptoms**: Process-recording fails with S3 access denied error

**Solutions**:
1. Verify IAM user has PutObject permission
2. Check bucket policy allows IAM user
3. Verify AWS credentials are correct in environment variables
4. Ensure bucket name matches exactly: `use60-application`

### Issue: "Invalid Signature" Error

**Symptoms**: Signed URL generation fails

**Solutions**:
1. Check AWS_SECRET_ACCESS_KEY is correct (no extra spaces)
2. Verify region matches: `eu-west-2`
3. Ensure S3 client credentials are properly formatted

### Issue: Recordings Not Appearing on Dashboard

**Symptoms**: Upload succeeds but dashboard is empty

**Solutions**:
1. Check `recording_s3_url` is being saved to database
2. Verify `recording_s3_key` format: `meeting-recordings/{org}/{user}/{recording}/recording.{ext}`
3. Check RLS policies allow user to read recordings
4. Test signed URL generation manually

### Issue: Signed URLs Expire Quickly

**Symptoms**: URLs work initially but fail after some time

**Solutions**:
1. Verify expiry is set to 7 days: `expiresIn: 60 * 60 * 24 * 7`
2. Check system clock is synchronized (affects signature calculation)
3. Regenerate URL using get-recording-url function

## Migration from Supabase Storage (if needed)

If you have existing recordings in Supabase Storage:

```sql
-- List recordings in Supabase Storage
SELECT
  id,
  recording_s3_key,
  recording_s3_url
FROM recordings
WHERE recording_s3_key IS NOT NULL
  AND recording_s3_url LIKE '%supabase.co%'
LIMIT 10;
```

**Migration script** (manual process):
1. Download from Supabase Storage
2. Upload to S3
3. Update database with new S3 URL

## Cost Estimation

**Storage Costs** (S3 Standard, eu-west-2):
- $0.023 per GB/month
- Example: 100 recordings × 500MB each = 50GB = $1.15/month

**Data Transfer Costs**:
- Upload to S3: FREE
- Download via signed URL: $0.09 per GB (first 10TB/month)

**Request Costs**:
- PUT requests: $0.005 per 1,000 requests
- GET requests: $0.0004 per 1,000 requests

**Total estimated cost for 100 recordings/month**:
- Storage: $1.15
- Transfer (assuming 2x download): $9.00
- Requests: ~$0.01
- **Total**: ~$10/month

## Next Steps

1. ✅ Set environment variables in Supabase
2. ✅ Deploy updated edge functions
3. ✅ Test with a new recording
4. ⏳ Monitor logs for any errors
5. ⏳ Verify dashboard displays recordings correctly
6. ⏳ (Optional) Set up S3 lifecycle policies for auto-deletion after 90 days
