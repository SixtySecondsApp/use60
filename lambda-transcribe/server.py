"""
Railway server: FastAPI endpoint for WhisperX transcription + pyannote diarization.

POST /transcribe — accepts async transcription jobs, processes in background, sends HMAC callback.
GET /health — health check (includes model warm status).
"""

import logging
import os
import threading

from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional

from handler import process_transcription

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="60 Transcriber", version="1.0.0")

# Track whether models are loaded (for health check)
_models_warm = False
_active_jobs = 0
_lock = threading.Lock()


class TranscribeRequest(BaseModel):
    recording_id: str
    audio_url: Optional[str] = None
    video_url: Optional[str] = None
    callback_url: str
    callback_secret: str
    language: Optional[str] = None
    model_size: str = "medium"
    num_speakers: Optional[int] = None


@app.get("/health")
def health():
    return {
        "status": "ok",
        "models_warm": _models_warm,
        "active_jobs": _active_jobs,
    }


@app.post("/transcribe", status_code=202)
def transcribe(req: TranscribeRequest, background_tasks: BackgroundTasks):
    """Accept transcription job and process in background."""
    if not req.audio_url and not req.video_url:
        raise HTTPException(400, "audio_url or video_url required")

    background_tasks.add_task(_run_transcription, req.model_dump())
    logger.info(f"Accepted transcription job: {req.recording_id}")
    return {"status": "accepted", "recording_id": req.recording_id}


def _run_transcription(event: dict):
    """Background task that runs transcription and sends callback."""
    global _models_warm, _active_jobs

    with _lock:
        _active_jobs += 1

    try:
        process_transcription(event)
        _models_warm = True
    finally:
        with _lock:
            _active_jobs -= 1
