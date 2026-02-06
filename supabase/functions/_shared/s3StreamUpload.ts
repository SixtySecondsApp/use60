// S3 streaming multipart upload
// Streams video from MeetingBaaS URL to S3 without memory buffering
// Handles large files (~500MB) within edge function 9-minute limit

import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  type S3Client,
} from 'npm:@aws-sdk/client-s3@3';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB minimum for S3 multipart
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

interface UploadResult {
  url: string;
  sizeBytes: number;
  durationMs: number;
}

interface UploadPart {
  ETag: string;
  PartNumber: number;
}

/**
 * Streams file from source URL to S3 using multipart upload
 * No memory buffering - uses stream reader with chunking
 */
export async function streamUploadToS3(
  s3Client: S3Client,
  bucket: string,
  key: string,
  sourceUrl: string,
  signal?: AbortSignal
): Promise<UploadResult> {
  const startTime = Date.now();
  let uploadId: string | undefined;
  let totalBytes = 0;

  try {
    // Step 1: Initiate multipart upload
    const { UploadId } = await s3Client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: sourceUrl.includes('.mp4') ? 'video/mp4' : 'audio/mpeg',
      })
    );
    uploadId = UploadId;

    if (!uploadId) {
      throw new Error('Failed to initiate multipart upload');
    }

    console.log(`Initiated multipart upload: ${uploadId}`);

    // Step 2: Stream from source URL
    const response = await fetch(sourceUrl, { signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch source: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const parts: UploadPart[] = [];
    let partNumber = 1;
    let buffer = new Uint8Array();

    // Step 3: Read and upload in chunks
    while (true) {
      const { done, value } = await reader.read();

      if (value) {
        // Accumulate bytes
        buffer = concatenateUint8Arrays(buffer, value);
        totalBytes += value.length;
      }

      // Upload chunk when buffer reaches threshold or stream ends
      const shouldUpload = buffer.length >= CHUNK_SIZE || (done && buffer.length > 0);

      if (shouldUpload) {
        console.log(`Uploading part ${partNumber}, size: ${buffer.length} bytes`);

        const part = await uploadPartWithRetry(
          s3Client,
          bucket,
          key,
          uploadId,
          partNumber,
          buffer
        );

        parts.push({
          ETag: part.ETag!,
          PartNumber: partNumber,
        });

        partNumber++;
        buffer = new Uint8Array(); // Reset buffer
      }

      if (done) break;
    }

    // Step 4: Complete multipart upload
    console.log(`Completing upload with ${parts.length} parts`);

    await s3Client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      })
    );

    const durationMs = Date.now() - startTime;
    const region = Deno.env.get('AWS_REGION');
    const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

    console.log(
      `Upload complete: ${totalBytes} bytes in ${durationMs}ms (${parts.length} parts)`
    );

    return {
      url,
      sizeBytes: totalBytes,
      durationMs,
    };
  } catch (error) {
    // Abort multipart upload on error to avoid incomplete uploads
    if (uploadId) {
      try {
        await s3Client.send(
          new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId,
          })
        );
        console.log('Aborted incomplete multipart upload');
      } catch (abortError) {
        console.error('Failed to abort multipart upload:', abortError);
      }
    }

    throw error;
  }
}

/**
 * Uploads single part with exponential backoff retry
 */
async function uploadPartWithRetry(
  s3Client: S3Client,
  bucket: string,
  key: string,
  uploadId: string,
  partNumber: number,
  body: Uint8Array
): Promise<{ ETag: string }> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await s3Client.send(
        new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: body,
        })
      );

      if (!result.ETag) {
        throw new Error('Upload part missing ETag');
      }

      return { ETag: result.ETag };
    } catch (error) {
      lastError = error as Error;
      console.error(`Part ${partNumber} upload attempt ${attempt} failed:`, error);

      if (attempt < MAX_RETRIES) {
        const delayMs = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`Retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new Error(
    `Failed to upload part ${partNumber} after ${MAX_RETRIES} attempts: ${lastError?.message}`
  );
}

/**
 * Concatenates two Uint8Arrays
 */
function concatenateUint8Arrays(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}
