/**
 * warmth-signal-ingest — RG-004
 *
 * Receives an interaction event, writes it to contact_warmth_signals,
 * then fire-and-forgets a warmth-recalculate call for the affected contact.
 *
 * POST body:
 *   {
 *     signal_type: string,          // Must be a valid enum value
 *     contact_id: string,           // UUID
 *     org_id: string,               // UUID
 *     metadata?: Record<string, unknown>,
 *     occurred_at?: string          // ISO timestamp — defaults to now()
 *   }
 *
 * Returns:
 *   { success: true, signal_id: string }
 *
 * Deploy with --no-verify-jwt (staging ES256 JWT issue).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  errorResponse,
  jsonResponse,
} from '../_shared/corsHelper.ts';

// ============================================================================
// Config
// ============================================================================

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ============================================================================
// Allowed signal types (must match contact_warmth_signals CHECK constraint)
// ============================================================================

const ALLOWED_SIGNAL_TYPES = new Set([
  'email_sent',
  'email_received',
  'email_opened',
  'meeting_held',
  'meeting_booked',
  'call_completed',
  'linkedin_message',
  'linkedin_engaged',
  'page_view',
  'proposal_opened',
  'form_filled',
  'event_attended',
  'deal_stage_change',
  'video_viewed',
]);

// ============================================================================
// Types
// ============================================================================

interface RequestBody {
  signal_type: string;
  contact_id: string;
  org_id: string;
  metadata?: Record<string, unknown>;
  occurred_at?: string;
}

interface InsertedSignal {
  id: string;
}

// ============================================================================
// Entry point
// ============================================================================

serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', req, 400);
  }

  const { signal_type, contact_id, org_id, metadata, occurred_at } = body;

  if (!signal_type) {
    return errorResponse('signal_type is required', req, 400);
  }
  if (!ALLOWED_SIGNAL_TYPES.has(signal_type)) {
    return errorResponse(
      `Invalid signal_type: "${signal_type}". Allowed values: ${[...ALLOWED_SIGNAL_TYPES].join(', ')}`,
      req,
      400,
    );
  }
  if (!contact_id) {
    return errorResponse('contact_id is required', req, 400);
  }
  if (!org_id) {
    return errorResponse('org_id is required', req, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // ---- Insert signal into contact_warmth_signals ------------------------
    const { data, error } = await supabase
      .from('contact_warmth_signals')
      .insert({
        signal_type,
        contact_id,
        org_id,
        signal_weight:  1.00,
        metadata:       metadata ?? {},
        occurred_at:    occurred_at ?? new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('[warmth-signal-ingest] insert error:', error.message);
      return errorResponse('Failed to insert signal', req, 500);
    }

    const signal_id = (data as InsertedSignal).id;

    // ---- Fire-and-forget: trigger warmth recalculation -------------------
    supabase.functions
      .invoke('warmth-recalculate', {
        body: { contact_id, org_id, mode: 'single' },
      })
      .catch((err: unknown) => {
        console.warn(
          '[warmth-signal-ingest] recalculate invoke failed (non-blocking):',
          err instanceof Error ? err.message : String(err),
        );
      });

    return jsonResponse({ success: true, signal_id }, req);
  } catch (err) {
    console.error(
      '[warmth-signal-ingest] unexpected error:',
      err instanceof Error ? err.message : String(err),
    );
    return errorResponse(
      err instanceof Error ? err.message : 'Internal server error',
      req,
      500,
    );
  }
});
