"""Format WhisperX diarized output into database-compatible formats.

Produces three output formats:
1. transcript_text: Plain text with speaker labels ("Speaker 0: Hello\\n")
2. transcript_json: {"utterances": [...]} with full metadata
3. utterances: Raw array of utterance objects

The transcript_text format matches what the frontend expects:
  - MeetingDetail.tsx splits by newline
  - Parses each line for "Name: text" pattern using regex
  - Speaker labels are "Speaker N" (numeric index)
"""

import logging

logger = logging.getLogger(__name__)


def format_output(diarized_segments: list) -> tuple:
    """
    Format diarized segments into DB-compatible output.

    Args:
        diarized_segments: WhisperX segments with 'speaker' field.

    Returns:
        Tuple of (transcript_text, transcript_json, utterances).
    """
    if not diarized_segments:
        return "", {"utterances": []}, []

    utterances = []
    text_lines = []

    for segment in diarized_segments:
        speaker_label = segment.get("speaker", "SPEAKER_00")

        # Extract speaker number from "SPEAKER_00" format
        try:
            speaker_num = int(speaker_label.replace("SPEAKER_", ""))
        except (ValueError, AttributeError):
            speaker_num = 0

        text = segment.get("text", "").strip()
        if not text:
            continue

        # Build word-level timestamps array
        words = []
        for w in segment.get("words", []):
            # Only include words with valid timestamps
            if "start" in w and "end" in w:
                words.append({
                    "word": w["word"],
                    "start": round(w["start"], 3),
                    "end": round(w["end"], 3),
                    "confidence": round(w.get("score", 0.0), 4),
                })

        utterance = {
            "speaker": speaker_num,
            "start": round(segment.get("start", 0.0), 3),
            "end": round(segment.get("end", 0.0), 3),
            "text": text,
            "confidence": round(segment.get("confidence", 0.0), 4),
            "words": words,
        }
        utterances.append(utterance)
        text_lines.append(f"Speaker {speaker_num}: {text}")

    transcript_text = "\n".join(text_lines)
    transcript_json = {"utterances": utterances}

    logger.info(
        f"Formatted output: {len(utterances)} utterances, "
        f"{len(transcript_text)} chars, "
        f"{len(set(u['speaker'] for u in utterances))} speakers"
    )

    return transcript_text, transcript_json, utterances
