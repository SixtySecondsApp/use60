"""Speaker diarization using pyannote.audio."""

import logging
import os

from pyannote.audio import Pipeline

logger = logging.getLogger(__name__)

# Cache diarization model across requests
_diarize_model = None


def diarize(wav_path: str, segments: list, num_speakers: int = None) -> list:
    """
    Assign speaker labels to transcript segments using pyannote diarization.

    Args:
        wav_path: Path to 16kHz mono WAV file.
        segments: Whisper transcript segments (from transcribe()).
        num_speakers: Optional hint for expected number of speakers.

    Returns:
        List of segments with 'speaker' field assigned (e.g., 'SPEAKER_00').
    """
    global _diarize_model

    if not segments:
        logger.warning("No segments to diarize")
        return segments

    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token:
        logger.warning("HF_TOKEN not set - skipping diarization, using SPEAKER_00 for all")
        for seg in segments:
            seg["speaker"] = "SPEAKER_00"
        return segments

    # Load diarization model (cached across requests)
    if _diarize_model is None:
        logger.info("Loading pyannote diarization model")
        _diarize_model = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=hf_token
        )

    # Run diarization
    diarize_kwargs = {}
    if num_speakers is not None and num_speakers > 0:
        diarize_kwargs["num_speakers"] = num_speakers
        logger.info(f"Diarizing with num_speakers hint: {num_speakers}")
    else:
        logger.info("Diarizing with automatic speaker detection")

    try:
        diarization = _diarize_model(wav_path, **diarize_kwargs)

        # Assign speakers to segments based on overlap
        for seg in segments:
            seg_start = seg.get("start", 0)
            seg_end = seg.get("end", seg_start)

            # Find speaker with most overlap in this segment
            speaker_times = {}
            for turn, _, speaker in diarization.itertracks(yield_label=True):
                overlap_start = max(seg_start, turn.start)
                overlap_end = min(seg_end, turn.end)
                overlap = max(0, overlap_end - overlap_start)
                if overlap > 0:
                    speaker_times[speaker] = speaker_times.get(speaker, 0) + overlap

            if speaker_times:
                dominant_speaker = max(speaker_times, key=speaker_times.get)
                seg["speaker"] = dominant_speaker
            else:
                seg["speaker"] = "SPEAKER_00"

        # Count unique speakers
        speakers = set(seg.get("speaker", "SPEAKER_00") for seg in segments)
        logger.info(f"Diarization complete: {len(speakers)} speakers detected")

        return segments

    except Exception as e:
        logger.error(f"Diarization failed: {e}", exc_info=True)
        # Fallback: assign all segments to SPEAKER_00
        logger.warning("Falling back to single-speaker assignment")
        for seg in segments:
            seg["speaker"] = "SPEAKER_00"
        return segments
