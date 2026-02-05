# Thumbnail Lambda Function

AWS Lambda function for generating video thumbnails from Fathom recordings and S3 video files.

**Lambda URL**: `https://pnip1dhixe.execute-api.eu-west-2.amazonaws.com/fathom-thumbnail-generator/thumbnail`

**Region**: `eu-west-2`

---

## Overview

This Lambda uses ffmpeg to extract a frame from video files and upload the thumbnail to S3. It supports:
- **Fathom share URLs**: Transforms to HLS stream format (`/video.m3u8`)
- **S3 presigned URLs**: Direct MP4 access (no transformation)

---

## Request Format

```json
{
  "fathom_url": "https://fathom.video/share/BTPE7mwG8QtBsQwtPtX6PxeauX1C8bZf",
  "timestamp": "00:00:10",
  "width": 1280,
  "height": 720,
  "output_bucket": "my-bucket",
  "output_key": "thumbnails/thumb.jpg"
}
```

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `fathom_url` | Yes | - | Video URL (Fathom share URL or S3 presigned URL) |
| `timestamp` | No | `00:00:10` | Frame extraction time (HH:MM:SS format) |
| `width` | No | `1280` | Output thumbnail width |
| `height` | No | `720` | Output thumbnail height |
| `output_bucket` | No | env var | S3 bucket for output |
| `output_key` | No | auto-generated | S3 key for output |

---

## Response Format

```json
{
  "statusCode": 200,
  "body": {
    "message": "Thumbnail generated successfully",
    "thumbnail_size": 45678,
    "s3_location": "s3://bucket/thumbnails/20260125_123456_abc123.jpg",
    "http_url": "https://bucket.s3.eu-west-2.amazonaws.com/thumbnails/20260125_123456_abc123.jpg",
    "fathom_url": "https://fathom.video/share/xyz",
    "video_url": "https://fathom.video/share/xyz/video.m3u8"
  }
}
```

---

## Lambda Code

```python
import json
import subprocess
import os
import tempfile
import boto3
import logging
import uuid
import hashlib
from urllib.parse import urlparse, quote
from datetime import datetime
from PIL import Image

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3_client = boto3.client('s3')

def lambda_handler(event, context):
    """
    Generate a thumbnail from a Fathom video share URL or S3 presigned URL.

    Expected event:
    {
        "fathom_url": "https://fathom.video/share/BTPE7mwG8QtBsQwtPtX6PxeauX1C8bZf",
        "timestamp": "00:00:10",  # Optional, default is 10 seconds
        "width": 1280,            # Optional, default is 1280
        "height": 720,            # Optional, default is 720
        "output_bucket": "my-bucket",  # Optional S3 bucket for output
        "output_key": "thumbnails/thumb.jpg"  # Optional S3 key
    }
    """
    try:
        # Parse the request body - handle both direct invocation and HTTP API
        if 'body' in event and isinstance(event['body'], str):
            # HTTP API event - body is a JSON string
            try:
                body = json.loads(event['body'])
            except (json.JSONDecodeError, TypeError):
                return {
                    'statusCode': 400,
                    'body': json.dumps({'error': 'Invalid JSON in request body'})
                }
        else:
            # Direct invocation or parsed body
            body = event

        # Extract parameters from body
        fathom_url = body.get('fathom_url')
        if not fathom_url:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'fathom_url is required'})
            }

        timestamp = body.get('timestamp', '00:00:10')
        width = body.get('width', 1280)
        height = body.get('height', 720)
        output_bucket = body.get('output_bucket') or os.environ.get('OUTPUT_BUCKET')

        # Generate unique filename using timestamp and UUID
        unique_id = str(uuid.uuid4())[:8]
        timestamp_str = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_key = f"thumbnails/{timestamp_str}_{unique_id}.jpg"

        # Validate and transform the Fathom URL
        video_url = transform_fathom_url(fathom_url)
        logger.info(f"Transformed URL: {video_url}")

        # Create temporary directory for output
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = os.path.join(temp_dir, 'thumb.jpg')

            # Run ffmpeg to extract thumbnail
            # Apply darkening filter: brightness -0.15 (darkens by ~15%)
            ffmpeg_cmd = [
                '/opt/ffmpeg',
                '-ss', timestamp,
                '-i', video_url,
                '-frames:v', '1',
                '-vf', f'scale={width}:{height}:force_original_aspect_ratio=decrease,eq=brightness=-0.15',
                '-y',  # Overwrite output file
                output_path
            ]

            logger.info(f"Running ffmpeg command: {' '.join(ffmpeg_cmd)}")

            result = subprocess.run(
                ffmpeg_cmd,
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode != 0:
                logger.error(f"FFmpeg error: {result.stderr}")
                return {
                    'statusCode': 500,
                    'body': json.dumps({'error': f'FFmpeg failed: {result.stderr}'})
                }

            # Read the generated thumbnail
            with open(output_path, 'rb') as f:
                thumbnail_data = f.read()

            # If output bucket is specified, upload to S3
            s3_url = None
            http_url = None
            if output_bucket:
                try:
                    s3_client.put_object(
                        Bucket=output_bucket,
                        Key=output_key,
                        Body=thumbnail_data,
                        ContentType='image/jpeg'
                    )
                    s3_url = f"s3://{output_bucket}/{output_key}"
                    # Generate HTTP URL for public access
                    http_url = f"https://{output_bucket}.s3.eu-west-2.amazonaws.com/{output_key}"
                    logger.info(f"Uploaded thumbnail to {s3_url}")
                    logger.info(f"Public HTTP URL: {http_url}")
                except Exception as e:
                    logger.error(f"Failed to upload to S3: {str(e)}")
                    return {
                        'statusCode': 500,
                        'body': json.dumps({'error': f'S3 upload failed: {str(e)}'})
                    }

            return {
                'statusCode': 200,
                'body': json.dumps({
                    'message': 'Thumbnail generated successfully',
                    'thumbnail_size': len(thumbnail_data),
                    's3_location': s3_url,
                    'http_url': http_url,
                    'fathom_url': fathom_url,
                    'video_url': video_url
                })
            }

    except subprocess.TimeoutExpired:
        logger.error("FFmpeg process timed out")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'FFmpeg process timed out'})
        }
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({'error': f'Unexpected error: {str(e)}'})
        }


def transform_fathom_url(fathom_url):
    """
    Transform a Fathom share URL to the m3u8 video URL format.
    For non-Fathom URLs (like S3 presigned URLs), return as-is.

    Input:  https://fathom.video/share/BTPE7mwG8QtBsQwtPtX6PxeauX1C8bZf
    Output: https://fathom.video/share/BTPE7mwG8QtBsQwtPtX6PxeauX1C8bZf/video.m3u8

    Input:  https://bucket.s3.amazonaws.com/video.mp4?X-Amz-Signature=...
    Output: https://bucket.s3.amazonaws.com/video.mp4?X-Amz-Signature=... (unchanged)
    """
    # Remove trailing slashes
    fathom_url = fathom_url.rstrip('/')

    # Check if URL already has /video.m3u8
    if fathom_url.endswith('/video.m3u8'):
        return fathom_url

    # Check if this is a Fathom share URL
    parsed = urlparse(fathom_url)
    if 'fathom.video' in parsed.netloc and '/share/' in parsed.path:
        # Add /video.m3u8 for Fathom URLs only
        return f"{fathom_url}/video.m3u8"

    # For other URLs (S3 presigned, direct video files), return as-is
    # ffmpeg can handle direct MP4/WebM URLs without transformation
    return fathom_url
```

---

## URL Transformation Logic

The `transform_fathom_url` function handles two types of URLs:

### Fathom URLs
```
Input:  https://fathom.video/share/BTPE7mwG8QtBsQwtPtX6PxeauX1C8bZf
Output: https://fathom.video/share/BTPE7mwG8QtBsQwtPtX6PxeauX1C8bZf/video.m3u8
```
Fathom serves video as HLS streams, so `/video.m3u8` must be appended.

### S3 Presigned URLs (60 Notetaker)
```
Input:  https://use60-application.s3.eu-west-2.amazonaws.com/recordings/abc.mp4?X-Amz-Signature=...
Output: https://use60-application.s3.eu-west-2.amazonaws.com/recordings/abc.mp4?X-Amz-Signature=...
```
S3 URLs are direct MP4 files - ffmpeg can read them directly without transformation.

---

## Edge Function Integration

The `generate-s3-video-thumbnail` edge function calls this Lambda:

```typescript
// supabase/functions/generate-s3-video-thumbnail/index.ts

const response = await fetch(lambdaUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(lambdaApiKey && { 'x-api-key': lambdaApiKey }),
  },
  body: JSON.stringify({
    fathom_url: presignedS3Url,  // Works for both Fathom and S3 URLs
    timestamp_seconds: 30,
  }),
});
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OUTPUT_BUCKET` | Default S3 bucket for thumbnails |
| `AWS_LAMBDA_THUMBNAIL_URL` | Lambda endpoint URL |
| `AWS_LAMBDA_API_KEY` | API key for Lambda authentication |

---

## Deployment

The Lambda is deployed in AWS `eu-west-2` region with:
- **Runtime**: Python 3.x
- **Layer**: ffmpeg binary at `/opt/ffmpeg`
- **Timeout**: 30 seconds
- **Memory**: Recommended 512MB+

---

## Test Cases

### Test 1: Fathom URL

Tests thumbnail generation from a Fathom share URL (HLS stream).

```bash
# Fathom Test Case
curl -X POST "https://pnip1dhixe.execute-api.eu-west-2.amazonaws.com/fathom-thumbnail-generator/thumbnail" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "fathom_url": "https://fathom.video/share/BTPE7mwG8QtBsQwtPtX6PxeauX1C8bZf",
    "timestamp": "00:00:30",
    "width": 1280,
    "height": 720
  }'
```

**Expected Response:**
```json
{
  "statusCode": 200,
  "body": {
    "message": "Thumbnail generated successfully",
    "thumbnail_size": 45678,
    "s3_location": "s3://use60-application/thumbnails/20260125_123456_abc123.jpg",
    "http_url": "https://use60-application.s3.eu-west-2.amazonaws.com/thumbnails/20260125_123456_abc123.jpg",
    "fathom_url": "https://fathom.video/share/BTPE7mwG8QtBsQwtPtX6PxeauX1C8bZf",
    "video_url": "https://fathom.video/share/BTPE7mwG8QtBsQwtPtX6PxeauX1C8bZf/video.m3u8"
  }
}
```

**Verification:**
- `video_url` should have `/video.m3u8` appended
- `http_url` should be a valid S3 URL to the generated thumbnail

---

### Test 2: 60 Notetaker (S3 Presigned URL)

Tests thumbnail generation from a direct S3 MP4 file via presigned URL.

```bash
# First, generate a presigned URL for an existing recording
# This can be done via the get-recording-url edge function or AWS CLI:

# Option A: Use edge function (requires auth)
curl -X GET "https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/get-recording-url?recording_id=YOUR_RECORDING_ID" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Option B: Use AWS CLI
aws s3 presign s3://use60-application/meeting-recordings/ORG_ID/USER_ID/RECORDING_ID/video.mp4 \
  --expires-in 900 \
  --region eu-west-2

# Then test the Lambda with the presigned URL:
curl -X POST "https://pnip1dhixe.execute-api.eu-west-2.amazonaws.com/fathom-thumbnail-generator/thumbnail" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "fathom_url": "https://use60-application.s3.eu-west-2.amazonaws.com/meeting-recordings/org123/user456/rec789/video.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...",
    "timestamp": "00:00:30",
    "width": 1280,
    "height": 720
  }'
```

**Expected Response:**
```json
{
  "statusCode": 200,
  "body": {
    "message": "Thumbnail generated successfully",
    "thumbnail_size": 52341,
    "s3_location": "s3://use60-application/thumbnails/20260125_123456_def456.jpg",
    "http_url": "https://use60-application.s3.eu-west-2.amazonaws.com/thumbnails/20260125_123456_def456.jpg",
    "fathom_url": "https://use60-application.s3.eu-west-2.amazonaws.com/meeting-recordings/...",
    "video_url": "https://use60-application.s3.eu-west-2.amazonaws.com/meeting-recordings/..."
  }
}
```

**Verification:**
- `video_url` should be UNCHANGED (no `/video.m3u8` appended)
- `video_url` should match the original `fathom_url` input
- `http_url` should be a valid S3 URL to the generated thumbnail

---

### Test 3: Unit Test for URL Transformation

Python unit test to verify the `transform_fathom_url` function:

```python
import unittest
from lambda_function import transform_fathom_url

class TestTransformFathomUrl(unittest.TestCase):

    def test_fathom_share_url(self):
        """Fathom share URLs should get /video.m3u8 appended"""
        input_url = "https://fathom.video/share/BTPE7mwG8QtBsQwtPtX6PxeauX1C8bZf"
        expected = "https://fathom.video/share/BTPE7mwG8QtBsQwtPtX6PxeauX1C8bZf/video.m3u8"
        self.assertEqual(transform_fathom_url(input_url), expected)

    def test_fathom_url_with_trailing_slash(self):
        """Trailing slashes should be removed before transformation"""
        input_url = "https://fathom.video/share/BTPE7mwG8QtBsQwtPtX6PxeauX1C8bZf/"
        expected = "https://fathom.video/share/BTPE7mwG8QtBsQwtPtX6PxeauX1C8bZf/video.m3u8"
        self.assertEqual(transform_fathom_url(input_url), expected)

    def test_fathom_url_already_has_m3u8(self):
        """URLs already ending in /video.m3u8 should not be modified"""
        input_url = "https://fathom.video/share/BTPE7mwG8QtBsQwtPtX6PxeauX1C8bZf/video.m3u8"
        self.assertEqual(transform_fathom_url(input_url), input_url)

    def test_s3_presigned_url_unchanged(self):
        """S3 presigned URLs should NOT be modified"""
        input_url = "https://use60-application.s3.eu-west-2.amazonaws.com/meeting-recordings/org/user/rec/video.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA..."
        self.assertEqual(transform_fathom_url(input_url), input_url)

    def test_s3_url_without_query_params(self):
        """Direct S3 URLs without presigning should NOT be modified"""
        input_url = "https://my-bucket.s3.amazonaws.com/videos/test.mp4"
        self.assertEqual(transform_fathom_url(input_url), input_url)

    def test_generic_video_url_unchanged(self):
        """Generic video URLs should NOT be modified"""
        input_url = "https://example.com/videos/meeting.mp4"
        self.assertEqual(transform_fathom_url(input_url), input_url)

    def test_cloudfront_url_unchanged(self):
        """CloudFront URLs should NOT be modified"""
        input_url = "https://d1234567890.cloudfront.net/videos/meeting.mp4"
        self.assertEqual(transform_fathom_url(input_url), input_url)

if __name__ == '__main__':
    unittest.main()
```

---

### Test 4: Integration Test via Edge Function

Test the full flow through the Supabase edge function:

```bash
# Generate thumbnail for an existing 60 Notetaker recording
curl -X POST "https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/generate-s3-video-thumbnail" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "recording_id": "f3446528-0a81-4cb2-bfb6-b2afb52ce615",
    "timestamp": 30
  }'
```

**Expected Response (Success):**
```json
{
  "success": true,
  "thumbnail_url": "https://use60-application.s3.eu-west-2.amazonaws.com/thumbnails/20260125_123456_abc123.jpg",
  "thumbnail_s3_key": "thumbnails/20260125_123456_abc123.jpg"
}
```

**Expected Response (Fallback to Placeholder):**
```json
{
  "success": true,
  "thumbnail_url": "https://use60-application.s3.eu-west-2.amazonaws.com/meeting-thumbnails/org/rec/placeholder.svg",
  "thumbnail_s3_key": "meeting-thumbnails/org/rec/placeholder.svg"
}
```

---

### Quick Validation Script

Bash script to validate Lambda handles both URL types correctly:

```bash
#!/bin/bash
# test_thumbnail_lambda.sh

LAMBDA_URL="https://pnip1dhixe.execute-api.eu-west-2.amazonaws.com/fathom-thumbnail-generator/thumbnail"
API_KEY="YOUR_API_KEY"

echo "=== Test 1: Fathom URL ==="
FATHOM_RESPONSE=$(curl -s -X POST "$LAMBDA_URL" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"fathom_url": "https://fathom.video/share/BTPE7mwG8QtBsQwtPtX6PxeauX1C8bZf", "timestamp": "00:00:10"}')

echo "$FATHOM_RESPONSE" | jq .

# Check if video_url has /video.m3u8
if echo "$FATHOM_RESPONSE" | jq -r '.body' | jq -r '.video_url' | grep -q "video.m3u8"; then
  echo "✅ PASS: Fathom URL correctly transformed to HLS stream"
else
  echo "❌ FAIL: Fathom URL not transformed correctly"
fi

echo ""
echo "=== Test 2: S3 Presigned URL ==="
# Replace with a valid presigned URL
S3_URL="https://use60-application.s3.eu-west-2.amazonaws.com/test.mp4?X-Amz-Signature=test"

S3_RESPONSE=$(curl -s -X POST "$LAMBDA_URL" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d "{\"fathom_url\": \"$S3_URL\", \"timestamp\": \"00:00:10\"}")

echo "$S3_RESPONSE" | jq .

# Check if video_url does NOT have /video.m3u8
VIDEO_URL=$(echo "$S3_RESPONSE" | jq -r '.body' | jq -r '.video_url' 2>/dev/null)
if [[ "$VIDEO_URL" != *"video.m3u8"* ]]; then
  echo "✅ PASS: S3 URL correctly passed through unchanged"
else
  echo "❌ FAIL: S3 URL incorrectly transformed"
fi
```

---

## Troubleshooting

### Error: "HTTP error 404 Not Found"
**Cause**: URL transformation appended `/video.m3u8` to a non-Fathom URL.
**Fix**: Update `transform_fathom_url` to check for Fathom domain before transforming.

### Error: "FFmpeg process timed out"
**Cause**: Video file too large or network latency.
**Fix**: Increase Lambda timeout or use a timestamp closer to the start of the video.

### Error: "S3 upload failed"
**Cause**: Missing S3 permissions or incorrect bucket name.
**Fix**: Ensure Lambda IAM role has `s3:PutObject` permission on the output bucket.
