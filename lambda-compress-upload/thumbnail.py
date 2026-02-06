"""FFmpeg thumbnail extraction from video."""

import os
import subprocess
import logging

logger = logging.getLogger(__name__)


def extract_thumbnail(input_path: str, recording_id: str) -> tuple[str, int] | None:
    """
    Extract a single frame from the video at 30s (or 5s for short videos).

    Returns (output_path, size_bytes) or None on failure.
    """
    output_path = f"/tmp/{recording_id}_thumbnail.jpg"

    # Try 30s first, fall back to 5s if video is shorter
    for seek_time in ["30", "5", "1"]:
        cmd = [
            "ffmpeg",
            "-ss", seek_time,
            "-i", input_path,
            "-vframes", "1",
            "-q:v", "2",
            "-y",
            output_path,
        ]

        logger.info(f"Extracting thumbnail at {seek_time}s")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode == 0 and os.path.exists(output_path):
            size = os.path.getsize(output_path)
            if size > 0:
                logger.info(f"Thumbnail extracted: {size:,} bytes (at {seek_time}s)")
                return output_path, size

        logger.warning(f"Thumbnail extraction at {seek_time}s failed, trying earlier timestamp")

    logger.error("Thumbnail extraction failed at all timestamps")
    return None
