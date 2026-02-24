FROM python:3.12-slim

# Install ffmpeg
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Whisper medium model (~1.5GB, cached in image)
# This avoids cold-start download on first request
ENV XDG_CACHE_HOME=/app/models
RUN python -c "import whisper; whisper.load_model('medium'); print('Whisper medium model cached')"

# Copy application code
COPY handler.py .
COPY server.py .
COPY download.py .
COPY transcribe.py .
COPY diarize.py .
COPY format_output.py .

EXPOSE 8080

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
