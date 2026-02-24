"""
Lambda handler: Download → Compress → Upload → Callback.

Invoked asynchronously (InvocationType: 'Event') by the
upload-recording-to-s3 edge function.

Expected event payload:
{
    "recording_id": "uuid",
    "video_url": "https://meetingbaas-presigned-url...",
    "audio_url": "https://meetingbaas-presigned-url..." | null,
    "s3_bucket": "use60-application",
    "s3_video_key": "meeting-recordings/{org}/{user}/{id}/video.mp4",
    "s3_audio_key": "meeting-recordings/{org}/{user}/{id}/audio.mp3",
    "callback_url": "https://....supabase.co/functions/v1/process-compress-callback",
    "callback_secret": "shared-hmac-secret",
    "video_quality": "480p" | "720p" | "1080p"  (optional, default "480p")
}
"""

import hashlib
import hmac
import json
import logging
import time

import requests

from compress import compress_video, extract_audio
from download import cleanup_temp_files, download_audio, download_video
from s3_upload import upload_to_s3
from thumbnail import extract_thumbnail

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def lambda_handler(event, context):
    recording_id = event["recording_id"]
    logger.info(f"Processing recording: {recording_id}")

    start_time = time.time()
    result = {
        "recording_id": recording_id,
        "status": "failed",
        "error": None,
    }

    try:
        # 1. Download video from MeetingBaaS
        video_path, original_size = download_video(event["video_url"], recording_id)
        result["original_size_bytes"] = original_size

        # 2. Download audio separately if provided
        audio_download = download_audio(event.get("audio_url"), recording_id)

        # 3. Compress video to configured resolution
        quality_map = {"480p": 480, "720p": 720, "1080p": 1080}
        video_quality = event.get("video_quality", "480p")
        resolution = quality_map.get(video_quality, 480)
        logger.info(f"Video quality setting: {video_quality} → {resolution}p")

        compressed_path, compressed_size, compress_duration = compress_video(
            video_path, recording_id, resolution=resolution
        )
        result["compressed_size_bytes"] = compressed_size
        result["compression_duration_seconds"] = int(compress_duration)
        result["compression_ratio"] = round(compressed_size / original_size, 4) if original_size > 0 else 0

        # 4. Upload compressed video to S3
        video_size = upload_to_s3(
            compressed_path,
            event["s3_bucket"],
            event["s3_video_key"],
            content_type="video/mp4",
        )

        # 5. Upload audio to S3
        audio_size = 0
        if audio_download:
            # Use separately downloaded audio
            audio_path, _ = audio_download
            audio_size = upload_to_s3(
                audio_path,
                event["s3_bucket"],
                event["s3_audio_key"],
                content_type="audio/mpeg",
            )
        else:
            # Extract audio from compressed video
            extracted = extract_audio(compressed_path, recording_id)
            if extracted:
                audio_path, _ = extracted
                audio_size = upload_to_s3(
                    audio_path,
                    event["s3_bucket"],
                    event["s3_audio_key"],
                    content_type="audio/mpeg",
                )

        # 6. Extract and upload thumbnail
        thumbnail_s3_key = event["s3_video_key"].rsplit("/", 1)[0] + "/thumbnail.jpg"
        thumbnail_result = extract_thumbnail(compressed_path, recording_id)
        thumbnail_size = 0
        if thumbnail_result:
            thumb_path, _ = thumbnail_result
            thumbnail_size = upload_to_s3(
                thumb_path,
                event["s3_bucket"],
                thumbnail_s3_key,
                content_type="image/jpeg",
            )

        # Build S3 URLs
        region = event.get("aws_region", "eu-west-2")
        bucket = event["s3_bucket"]
        result["s3_video_url"] = f"https://{bucket}.s3.{region}.amazonaws.com/{event['s3_video_key']}"
        result["s3_audio_url"] = f"https://{bucket}.s3.{region}.amazonaws.com/{event['s3_audio_key']}" if audio_size > 0 else None
        result["video_size_bytes"] = video_size
        result["audio_size_bytes"] = audio_size
        if thumbnail_size > 0:
            result["s3_thumbnail_url"] = f"https://{bucket}.s3.{region}.amazonaws.com/{thumbnail_s3_key}"
        result["status"] = "success"
        result["duration_seconds"] = int(time.time() - start_time)

        logger.info(
            f"Compression complete: {original_size:,} → {compressed_size:,} bytes "
            f"({result['compression_ratio']:.1%} of original) in {compress_duration:.0f}s"
        )

    except Exception as e:
        logger.error(f"Processing failed: {e}", exc_info=True)
        result["error"] = str(e)
        result["duration_seconds"] = int(time.time() - start_time)

    finally:
        # Always clean up temp files
        cleanup_temp_files(recording_id)

        # Always send callback (success or failure)
        _send_callback(event["callback_url"], event["callback_secret"], result)

    return result


def _send_callback(callback_url: str, secret: str, payload: dict):
    """Send callback to edge function with HMAC-SHA256 signature."""
    body = json.dumps(payload)
    signature = hmac.new(
        secret.encode("utf-8"),
        body.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    headers = {
        "Content-Type": "application/json",
        "X-Callback-Signature": signature,
    }

    try:
        response = requests.post(
            callback_url,
            data=body,
            headers=headers,
            timeout=30,
        )
        logger.info(f"Callback sent: {response.status_code}")
        if response.status_code >= 400:
            logger.error(f"Callback failed: {response.text[:500]}")
    except Exception as e:
        logger.error(f"Callback request failed: {e}")
