"""
Transcription handler: Download audio → Transcribe (WhisperX) → Diarize (pyannote) → Callback.

Core logic used by both Railway server (server.py) and Lambda handler.

Expected event payload:
{
    "recording_id": "uuid",
    "audio_url": "https://s3-bucket.../audio.mp3",
    "video_url": "https://s3-bucket.../video.mp4",  # fallback if no audio_url
    "callback_url": "https://....supabase.co/functions/v1/process-transcription-callback",
    "callback_secret": "shared-hmac-secret",
    "language": "en",          # optional, auto-detect if omitted
    "model_size": "medium",    # small | medium | large-v3
    "num_speakers": null       # optional hint for diarization
}
"""

import hashlib
import hmac
import json
import logging
import os
import subprocess
import time

import requests

from download import cleanup_temp_files, download_audio
from format_output import format_output

logger = logging.getLogger(__name__)


def process_transcription(event: dict) -> dict:
    """
    Core transcription pipeline. Downloads, transcribes, diarizes, callbacks.
    Used by both Railway server and Lambda handler.
    """
    recording_id = event["recording_id"]
    logger.info(f"Transcribing recording: {recording_id}")

    start_time = time.time()
    result = {
        "recording_id": recording_id,
        "status": "error",
        "error": None,
    }

    try:
        # Prefer audio_url over video_url (smaller file, faster download)
        audio_url = event.get("audio_url") or event.get("video_url")
        if not audio_url:
            raise ValueError("No audio_url or video_url provided")

        # Step 1: Download audio
        local_path = download_audio(audio_url, recording_id)
        logger.info(f"Downloaded audio to {local_path}")

        # Step 2: Convert to WAV 16kHz mono (WhisperX requirement)
        wav_path = convert_to_wav(local_path, recording_id)
        logger.info(f"Converted to WAV: {wav_path}")

        # Step 3: Transcribe with WhisperX (lazy import — heavy ML libraries)
        from transcribe import transcribe
        model_size = event.get("model_size", "medium")
        language = event.get("language")
        segments, detected_language = transcribe(wav_path, model_size, language)
        logger.info(f"Transcribed {len(segments)} segments, language: {detected_language}")

        # Step 4: Speaker diarization with pyannote (lazy import — heavy ML libraries)
        from diarize import diarize
        num_speakers = event.get("num_speakers")
        diarized_segments = diarize(wav_path, segments, num_speakers)
        logger.info(f"Diarized {len(diarized_segments)} segments")

        # Step 5: Format output
        transcript_text, transcript_json, utterances = format_output(diarized_segments)

        # Step 6: Get audio duration
        duration_seconds = get_audio_duration(wav_path)

        # Build success result
        result["status"] = "success"
        result["transcript_text"] = transcript_text
        result["transcript_json"] = transcript_json
        result["transcript_utterances"] = utterances
        result["duration_seconds"] = duration_seconds
        result["language"] = detected_language
        result["word_count"] = len(transcript_text.split())
        result["speaker_count"] = len(set(u["speaker"] for u in utterances))
        result["processing_seconds"] = int(time.time() - start_time)

        logger.info(
            f"Transcription complete: {result['word_count']} words, "
            f"{result['speaker_count']} speakers, "
            f"{result['processing_seconds']}s processing"
        )

    except Exception as e:
        logger.error(f"Transcription failed: {e}", exc_info=True)
        result["error"] = str(e)
        result["processing_seconds"] = int(time.time() - start_time)

    finally:
        # Always clean up temp files
        cleanup_temp_files(recording_id)

        # Always send callback (success or error)
        _send_callback(event["callback_url"], event["callback_secret"], result)

    return result


# Legacy Lambda entry point
def lambda_handler(event, context):
    return process_transcription(event)


def convert_to_wav(input_path: str, recording_id: str) -> str:
    """Convert audio/video to WAV 16kHz mono for WhisperX."""
    wav_path = f"/tmp/{recording_id}_audio.wav"

    cmd = [
        "ffmpeg",
        "-i", input_path,
        "-ar", "16000",      # 16kHz sample rate
        "-ac", "1",           # Mono
        "-c:a", "pcm_s16le",  # 16-bit PCM
        "-y",                 # Overwrite
        wav_path,
    ]

    subprocess.run(cmd, capture_output=True, check=True, timeout=300)
    logger.info(f"Converted to WAV: {os.path.getsize(wav_path):,} bytes")
    return wav_path


def get_audio_duration(wav_path: str) -> float:
    """Get duration of audio file in seconds using ffprobe."""
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        wav_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    try:
        return round(float(result.stdout.strip()), 2)
    except (ValueError, AttributeError):
        logger.warning("Could not determine audio duration")
        return 0.0


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
