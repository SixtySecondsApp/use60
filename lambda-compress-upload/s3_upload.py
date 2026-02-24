"""Multipart S3 upload with progress tracking."""

import os
import logging
import boto3
from botocore.config import Config

logger = logging.getLogger(__name__)

PART_SIZE = 8 * 1024 * 1024  # 8MB parts (above 5MB minimum)


def upload_to_s3(
    file_path: str,
    bucket: str,
    key: str,
    content_type: str = "video/mp4",
) -> int:
    """
    Upload file to S3 using multipart upload.
    Returns the file size in bytes.
    """
    file_size = os.path.getsize(file_path)
    logger.info(f"Uploading {file_path} ({file_size:,} bytes) to s3://{bucket}/{key}")

    s3_client = boto3.client(
        "s3",
        config=Config(
            retries={"max_attempts": 3, "mode": "adaptive"},
        ),
    )

    # Use multipart for files > 8MB, simple put otherwise
    if file_size > PART_SIZE:
        _multipart_upload(s3_client, file_path, bucket, key, content_type, file_size)
    else:
        with open(file_path, "rb") as f:
            s3_client.put_object(
                Bucket=bucket,
                Key=key,
                Body=f.read(),
                ContentType=content_type,
            )

    logger.info(f"Upload complete: s3://{bucket}/{key}")
    return file_size


def _multipart_upload(
    s3_client,
    file_path: str,
    bucket: str,
    key: str,
    content_type: str,
    file_size: int,
):
    """Perform multipart upload with progress logging."""
    mpu = s3_client.create_multipart_upload(
        Bucket=bucket,
        Key=key,
        ContentType=content_type,
    )
    upload_id = mpu["UploadId"]

    parts = []
    part_number = 1
    uploaded_bytes = 0

    try:
        with open(file_path, "rb") as f:
            while True:
                data = f.read(PART_SIZE)
                if not data:
                    break

                response = s3_client.upload_part(
                    Bucket=bucket,
                    Key=key,
                    PartNumber=part_number,
                    UploadId=upload_id,
                    Body=data,
                )

                parts.append({
                    "PartNumber": part_number,
                    "ETag": response["ETag"],
                })

                uploaded_bytes += len(data)
                progress = (uploaded_bytes / file_size) * 100
                logger.info(
                    f"Part {part_number}: {uploaded_bytes:,}/{file_size:,} bytes ({progress:.0f}%)"
                )
                part_number += 1

        s3_client.complete_multipart_upload(
            Bucket=bucket,
            Key=key,
            UploadId=upload_id,
            MultipartUpload={"Parts": parts},
        )

    except Exception:
        logger.error("Multipart upload failed, aborting")
        s3_client.abort_multipart_upload(
            Bucket=bucket,
            Key=key,
            UploadId=upload_id,
        )
        raise
