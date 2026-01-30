"""Download video/audio from MeetingBaaS presigned URLs to /tmp."""

import os
import logging
import requests

logger = logging.getLogger(__name__)

CHUNK_SIZE = 8 * 1024 * 1024  # 8MB chunks for download


def download_file(url: str, output_path: str) -> int:
    """Download a file from URL to local path. Returns file size in bytes."""
    logger.info(f"Downloading to {output_path}")

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


def download_video(video_url: str, recording_id: str) -> tuple[str, int]:
    """Download video to /tmp. Returns (path, size_bytes)."""
    path = f"/tmp/{recording_id}_input.mp4"
    size = download_file(video_url, path)
    return path, size


def download_audio(audio_url: str, recording_id: str) -> tuple[str, int] | None:
    """Download audio to /tmp if URL provided. Returns (path, size_bytes) or None."""
    if not audio_url:
        return None
    path = f"/tmp/{recording_id}_input_audio.mp3"
    size = download_file(audio_url, path)
    return path, size


def cleanup_temp_files(recording_id: str):
    """Remove all temp files for a recording."""
    patterns = [
        f"/tmp/{recording_id}_input.mp4",
        f"/tmp/{recording_id}_input_audio.mp3",
        f"/tmp/{recording_id}_compressed.mp4",
        f"/tmp/{recording_id}_compressed_audio.mp3",
    ]
    for path in patterns:
        if os.path.exists(path):
            os.remove(path)
            logger.info(f"Cleaned up {path}")
