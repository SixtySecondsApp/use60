#!/usr/bin/env tsx
/**
 * Backfill script to fetch missing transcripts for Fathom meetings
 * 
 * Usage:
 *   tsx scripts/backfill-fathom-transcripts.ts [--limit N] [--days N] [--dry-run]
 * 
 * Options:
 *   --limit N      Process only N meetings (default: all)
 *   --days N       Only process meetings from last N days (default: all)
 *   --dry-run      Show what would be processed without making changes
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});

interface CliOptions {
  limit?: number;
  days?: number;
  dryRun?: boolean;
  refetch?: boolean;  // Re-fetch existing transcripts to get timestamps
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--limit':
      case '-l': {
        const value = args[i + 1];
        if (!value) throw new Error(`Missing value for ${arg}`);
        options.limit = parseInt(value, 10);
        if (isNaN(options.limit)) throw new Error(`Invalid number: ${value}`);
        i++;
        break;
      }
      case '--days':
      case '-d': {
        const value = args[i + 1];
        if (!value) throw new Error(`Missing value for ${arg}`);
        options.days = parseInt(value, 10);
        if (isNaN(options.days)) throw new Error(`Invalid number: ${value}`);
        i++;
        break;
      }
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--refetch':
        options.refetch = true;
        break;
      case '--help':
      case '-h':
        process.exit(0);
        break;
      default:
        break;
    }
  }

  return options;
}

/**
 * Fetch transcript from Fathom API using dual authentication
 */
async function fetchTranscriptFromFathom(
  accessToken: string,
  recordingId: string
): Promise<string | null> {
  try {
    const url = `https://api.fathom.ai/external/v1/recordings/${recordingId}/transcript`;
    
    // Try X-Api-Key first (preferred for Fathom API)
    let response = await fetch(url, {
      headers: {
        'X-Api-Key': accessToken,
        'Content-Type': 'application/json',
      },
    });

    // If X-Api-Key fails with 401, try Bearer (for OAuth tokens)
    if (response.status === 401) {
      response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
    }

    if (response.status === 404) {
      // Transcript not yet available - Fathom still processing
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();

    // Handle array format (most common) — includes timestamps
    if (Array.isArray(data.transcript)) {
      const lines = data.transcript.map((segment: any) => {
        const timestamp = segment?.timestamp || null;
        const speaker = segment?.speaker?.display_name ? `${segment.speaker.display_name}: ` : '';
        const text = segment?.text || '';
        const prefix = timestamp ? `[${timestamp}] ` : '';
        return `${prefix}${speaker}${text}`.trim();
      });
      return lines.join('\n');
    }

    // Handle string format (fallback)
    if (typeof data.transcript === 'string') {
      return data.transcript;
    }

    // If data itself is a string
    if (typeof data === 'string') {
      return data;
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Refresh OAuth access token if expired
 */
async function refreshAccessToken(integration: any): Promise<string> {
  const now = new Date();
  const expiresAt = new Date(integration.token_expires_at);

  // Check if token is expired or will expire within 5 minutes
  const bufferMs = 5 * 60 * 1000; // 5 minutes buffer
  if (expiresAt.getTime() - now.getTime() > bufferMs) {
    // Token is still valid
    return integration.access_token;
  }
  const clientId = process.env.VITE_FATHOM_CLIENT_ID;
  const clientSecret = process.env.VITE_FATHOM_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing Fathom OAuth configuration for token refresh');
  }

  // Exchange refresh token for new access token
  const tokenParams = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: integration.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const tokenResponse = await fetch('https://fathom.video/external/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenParams.toString(),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Token refresh failed: ${errorText}`);
  }

  const tokenData = await tokenResponse.json();

  // Calculate new token expiry
  const expiresIn = tokenData.expires_in || 3600; // Default 1 hour
  const newTokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Update tokens in database
  const { error: updateError } = await supabase
    .from('fathom_integrations')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || integration.refresh_token,
      token_expires_at: newTokenExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id);

  if (updateError) {
    throw new Error(`Failed to update refreshed tokens: ${updateError.message}`);
  }

  return tokenData.access_token;
}

async function main() {
  const options = parseArgs();
  if (options.dryRun) {
  }

  // Build query for meetings needing transcripts
  let query = supabase
    .from('meetings')
    .select('id, title, fathom_recording_id, owner_user_id, meeting_start, transcript_text')
    .not('fathom_recording_id', 'is', null)
    .order('meeting_start', { ascending: false });

  if (options.refetch) {
    // Re-fetch existing transcripts to get new timestamp format
    query = query.not('transcript_text', 'is', null);
  } else {
    // Default: only missing transcripts
    query = query.is('transcript_text', null);
  }

  // Add date filter if specified
  if (options.days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - options.days);
    query = query.gte('meeting_start', cutoffDate.toISOString());
  }

  // Add limit if specified
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data: meetings, error: meetingsError } = await query;

  if (meetingsError) {
    process.exit(1);
  }

  if (!meetings || meetings.length === 0) {
    process.exit(0);
  }
  // Group meetings by owner to batch integration lookups
  const meetingsByOwner = new Map<string, typeof meetings>();
  for (const meeting of meetings) {
    if (!meeting.owner_user_id) continue;
    const ownerId = meeting.owner_user_id;
    if (!meetingsByOwner.has(ownerId)) {
      meetingsByOwner.set(ownerId, []);
    }
    meetingsByOwner.get(ownerId)!.push(meeting);
  }
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  // Process each owner's meetings
  for (const [ownerId, ownerMeetings] of meetingsByOwner) {
    // Get Fathom integration for this owner
    const { data: integration, error: integrationError } = await supabase
      .from('fathom_integrations')
      .select('id, access_token, refresh_token, token_expires_at')
      .eq('user_id', ownerId)
      .eq('is_active', true)
      .single();

    if (integrationError || !integration) {
      skippedCount += ownerMeetings.length;
      continue;
    }

    // Refresh token if needed
    let accessToken = integration.access_token;
    try {
      accessToken = await refreshAccessToken(integration);
    } catch (error) {
    }

    // Process each meeting
    for (const meeting of ownerMeetings) {
      if (!meeting.fathom_recording_id) {
        skippedCount++;
        continue;
      }
      if (options.dryRun) {
        continue;
      }

      // Fetch transcript
      const transcript = await fetchTranscriptFromFathom(accessToken, meeting.fathom_recording_id);

      if (!transcript) {
        skippedCount++;
        continue;
      }

      // Update meeting with transcript
      const { error: updateError } = await supabase
        .from('meetings')
        .update({
          transcript_text: transcript,
          updated_at: new Date().toISOString(),
        })
        .eq('id', meeting.id);

      if (updateError) {
        errorCount++;
      } else {
        successCount++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

main().catch((error) => {
  process.exit(1);
});












