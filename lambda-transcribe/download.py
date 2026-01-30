"""Download audio from S3 URLs to /tmp for transcription."""

import glob
import os
import logging
import re

import boto3
import requests

logger = logging.getLogger(__name__)

CHUNK_SIZE = 8 * 1024 * 1024  # 8MB chunks for download

# Regex to parse S3 URLs: https://{bucket}.s3.{region}.amazonaws.com/{key}
_S3_URL_RE = re.compile(
    r"https?://(?P<bucket>[^.]+)\.s3[.-](?P<region>[^.]+)\.amazonaws\.com/(?P<key>.+)"
)


def _parse_s3_url(url: str):
    """Parse an S3 HTTPS URL into (bucket, key). Returns None if not an S3 URL."""
    m = _S3_URL_RE.match(url)
    if m:
        return m.group("bucket"), m.group("key")
    return None


def download_from_s3(bucket: str, key: str, output_path: str) -> int:
    """Download a file directly from S3 using IAM role credentials."""
    logger.info(f"Downloading s3://{bucket}/{key} to {output_path}")
    s3 = boto3.client("s3")
    s3.download_file(bucket, key, output_path)
    size = os.path.getsize(output_path)
    logger.info(f"Downloaded {size:,} bytes from S3")
    return size


def download_file(url: str, output_path: str) -> int:
    """Download a file from URL to local path. Returns file size in bytes."""
    # Try S3 direct download first (uses IAM role, no presigned URL needed)
    s3_parts = _parse_s3_url(url)
    if s3_parts:
        return download_from_s3(s3_parts[0], s3_parts[1], output_path)

    # Fallback to HTTP download (for presigned URLs or non-S3 sources)
    logger.info(f"Downloading via HTTP to {output_path}")
    response = requests.get(url, stream=True, timeout=600)
    response.raise_for_status()

    total_bytes = 0
    with open(output_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=CHUNK_SIZE):
            if chunk:
                f.write(chunk)
                total_bytes += len(chunk)

    logger.info(f"Downloaded {total_bytes:,} bytes to {output_path}")
    return total_bytes


def download_audio(audio_url: str, recording_id: str) -> str:
    """Download audio to /tmp. Returns local file path."""
    # Determine extension from URL or default to .mp3
    if ".webm" in audio_url:
        ext = ".webm"
    elif ".mp4" in audio_url:
        ext = ".mp4"
    elif ".wav" in audio_url:
        ext = ".wav"
    else:
        ext = ".mp3"

    path = f"/tmp/{recording_id}_input{ext}"
    download_file(audio_url, path)
    return path


def cleanup_temp_files(recording_id: str):
    """Remove all temp files for a recording."""
    patterns = [
        f"/tmp/{recording_id}_input*",
        f"/tmp/{recording_id}_audio*",
    ]
    for pattern in patterns:
        for path in glob.glob(pattern):
            try:
                os.remove(path)
                logger.info(f"Cleaned up {path}")
            except OSError as e:
                logger.warning(f"Failed to clean up {path}: {e}")
