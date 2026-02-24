"""FFmpeg video compression with configurable resolution (H.264)."""

import os
import subprocess
import logging
import time

logger = logging.getLogger(__name__)


def compress_video(input_path: str, recording_id: str, resolution: int = 480) -> tuple[str, int, float]:
    """
    Compress video to the given resolution using FFmpeg.

    Args:
        resolution: Target height in pixels (e.g. 480, 720, 1080). Default 480p.

    Returns (output_path, compressed_size_bytes, duration_seconds).
    """
    output_path = f"/tmp/{recording_id}_compressed.mp4"

    cmd = [
        "ffmpeg",
        "-i", input_path,
        "-vf", f"scale=-2:{resolution}",
        "-c:v", "libx264",
        "-crf", "23",
        "-preset", "veryfast",
        "-threads", "0",  # Use all available CPU cores
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-y",  # Overwrite output
        output_path,
    ]

    logger.info(f"Compressing video: {' '.join(cmd)}")
    start_time = time.time()

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=840,  # 14 minutes max (leave 1 min for upload)
    )

    duration = time.time() - start_time

    if result.returncode != 0:
        logger.error(f"FFmpeg stderr: {result.stderr[-2000:]}")
        raise RuntimeError(f"FFmpeg failed with code {result.returncode}: {result.stderr[-500:]}")

    compressed_size = os.path.getsize(output_path)
    logger.info(
        f"Compression complete: {compressed_size:,} bytes in {duration:.1f}s"
    )

    return output_path, compressed_size, duration


def extract_audio(input_path: str, recording_id: str) -> tuple[str, int] | None:
    """
    Extract and compress audio to MP3 128k if no separate audio URL was provided.
    Returns (output_path, size_bytes) or None if input has no audio stream.
    """
    output_path = f"/tmp/{recording_id}_compressed_audio.mp3"

    cmd = [
        "ffmpeg",
        "-i", input_path,
        "-vn",  # No video
        "-c:a", "libmp3lame",
        "-b:a", "128k",
        "-y",
        output_path,
    ]

    logger.info("Extracting audio track")

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=300,
    )

    if result.returncode != 0:
        logger.warning(f"Audio extraction failed (may have no audio): {result.stderr[-200:]}")
        return None

    size = os.path.getsize(output_path)
    logger.info(f"Audio extracted: {size:,} bytes")
    return output_path, size
