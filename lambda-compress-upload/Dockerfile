FROM public.ecr.aws/lambda/python:3.12

# Install FFmpeg static build
RUN dnf install -y xz tar && \
    curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o /tmp/ffmpeg.tar.xz && \
    tar -xf /tmp/ffmpeg.tar.xz -C /tmp && \
    cp /tmp/ffmpeg-*-amd64-static/ffmpeg /usr/local/bin/ffmpeg && \
    cp /tmp/ffmpeg-*-amd64-static/ffprobe /usr/local/bin/ffprobe && \
    chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe && \
    rm -rf /tmp/ffmpeg* && \
    dnf clean all

# Copy requirements and install
COPY requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install -r ${LAMBDA_TASK_ROOT}/requirements.txt --target "${LAMBDA_TASK_ROOT}"

# Copy function code
COPY handler.py ${LAMBDA_TASK_ROOT}/
COPY download.py ${LAMBDA_TASK_ROOT}/
COPY compress.py ${LAMBDA_TASK_ROOT}/
COPY s3_upload.py ${LAMBDA_TASK_ROOT}/
COPY thumbnail.py ${LAMBDA_TASK_ROOT}/

CMD ["handler.lambda_handler"]
