# 60 Transcriber (Railway)

Self-hosted transcription using WhisperX + pyannote speaker diarization on Railway.

## Architecture

Always-on container with FastAPI endpoint. Invoked via HTTP POST by `process-compress-callback` edge function after S3 upload completes. Sends HMAC-signed callback to `process-transcription-callback` with transcript results.

```
process-compress-callback → POST /transcribe (Railway) → process-transcription-callback
                                                            ↓
                                                      Save to DB + trigger AI analysis
```

## Endpoints

- `POST /transcribe` — Accept transcription job (returns 202, processes in background)
- `GET /health` — Health check with model warm status

## Fallback Strategy

- **Tier 1**: WhisperX on Railway (3 retries, ~$0.10/hr audio)
- **Tier 2**: Gladia/Deepgram via process-recording (fallback for failures)

## Request Payload

```json
{
  "recording_id": "uuid",
  "audio_url": "https://s3-bucket.../audio.mp3",
  "video_url": "https://s3-bucket.../video.mp4",
  "callback_url": "https://....supabase.co/functions/v1/process-transcription-callback",
  "callback_secret": "shared-hmac-secret",
  "language": "en",
  "model_size": "medium",
  "num_speakers": null
}
```

## Environment Variables

- `HF_TOKEN`: HuggingFace token for pyannote model access (required for diarization)
- `AWS_ACCESS_KEY_ID`: S3 access for audio download
- `AWS_SECRET_ACCESS_KEY`: S3 secret
- `AWS_REGION`: S3 region (eu-west-2)
- `PORT`: Set automatically by Railway (default 8080)

## Deployment

Railway auto-deploys from the Dockerfile. The WhisperX medium model (~1.5GB) is pre-baked into the Docker image during build — no cold-start model download needed.

## Performance

| Recording | Processing | Notes |
|-----------|-----------|-------|
| 15 min | 3-5 min | Comfortable |
| 30 min | 5-8 min | Normal |
| 60 min | 9-14 min | Fine (no timeout) |
| >60 min | 15-25 min | Works (Railway has no timeout) |

## Resource Config

- Memory: ~4GB (WhisperX medium needs ~2.5GB)
- CPU: 2 vCPU recommended
- Docker image: ~8GB (includes pre-downloaded model)
