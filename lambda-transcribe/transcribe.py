"""OpenAI Whisper transcription with word-level timestamps."""

import logging

import whisper

logger = logging.getLogger(__name__)

# Cache loaded models to avoid reloading across requests
_model_cache = {}


def transcribe(wav_path: str, model_size: str = "medium", language: str = None) -> tuple:
    """
    Transcribe audio using OpenAI Whisper with word-level timestamps.

    Args:
        wav_path: Path to 16kHz mono WAV file.
        model_size: Whisper model size ('small', 'medium', 'large-v3' -> 'large').
        language: ISO language code or None for auto-detect.

    Returns:
        Tuple of (segments_with_words, detected_language).
    """
    # Map model names (large-v3 not available in openai-whisper, use large)
    model_map = {
        "large-v3": "large",
        "large-v2": "large",
    }
    model_name = model_map.get(model_size, model_size)

    # Load model (cached across requests)
    if model_name not in _model_cache:
        logger.info(f"Loading Whisper model: {model_name}")
        _model_cache[model_name] = whisper.load_model(model_name)
    model = _model_cache[model_name]

    # Transcribe with word timestamps
    logger.info(f"Transcribing with model={model_name}, language={language or 'auto'}")
    transcribe_options = {
        "word_timestamps": True,
        "verbose": False,
    }
    if language:
        transcribe_options["language"] = language

    result = model.transcribe(wav_path, **transcribe_options)
    detected_language = result.get("language", language or "en")
    segments = result.get("segments", [])

    logger.info(f"Transcribed {len(segments)} segments, language={detected_language}")

    if not segments:
        logger.warning("No segments found in transcription")
        return [], detected_language

    return segments, detected_language
