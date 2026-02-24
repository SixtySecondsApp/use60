// S3 client configuration for 60 Notetaker video storage
// Used by upload-recording-to-s3 edge function

import { S3Client } from 'npm:@aws-sdk/client-s3@3';

/**
 * Creates configured S3 client for video storage
 * Uses environment variables for credentials
 */
export function createS3Client(): S3Client {
  const region = Deno.env.get('AWS_REGION');
  const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing required AWS environment variables');
  }

  return new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

/**
 * Gets S3 bucket name from environment
 */
export function getS3Bucket(): string {
  const bucket = Deno.env.get('AWS_S3_BUCKET');
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET environment variable not set');
  }
  return bucket;
}

/**
 * Generates S3 key for recording file
 * Format: meeting-recordings/{org_id}/{user_id}/{recording_id}/{filename}
 */
export function generateS3Key(
  orgId: string,
  userId: string,
  recordingId: string,
  filename: string
): string {
  return `meeting-recordings/${orgId}/${userId}/${recordingId}/${filename}`;
}

/**
 * Generates public S3 URL for uploaded file
 */
export function getS3Url(bucket: string, region: string, key: string): string {
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}
