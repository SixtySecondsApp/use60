/**
 * Relationship Graph Adapters (KNW-003)
 *
 * Adapters for building and maintaining the contact relationship graph.
 * Called by fleet orchestrator after meeting_completed and contact_enriched events.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

/**
 * Build relationship graph from meeting attendees (post_meeting mode)
 */
export const buildRelationshipGraphAdapter: SkillAdapter = {
  name: 'build-relationship-graph',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[build-relationship-graph] Starting...');

      const orgId = state.event.org_id;
      const meetingId = state.event.payload?.meeting_id as string
        || state.context?.tier2?.meeting?.id;

      if (!meetingId) {
        return { success: true, output: { skipped: true, reason: 'no_meeting_id' }, duration_ms: Date.now() - start };
      }

      // Call agent-relationship-graph edge function
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/agent-relationship-graph`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          mode: 'post_meeting',
          meeting_id: meetingId,
          org_id: orgId,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        console.error(`[build-relationship-graph] Edge function returned ${resp.status}: ${text}`);
        return { success: false, error: `edge_function_${resp.status}`, duration_ms: Date.now() - start };
      }

      const result = await resp.json();
      console.log(`[build-relationship-graph] Complete: ${result.edges_created} created, ${result.edges_updated} updated`);

      return { success: true, output: result, duration_ms: Date.now() - start };

    } catch (err) {
      console.error('[build-relationship-graph] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

/**
 * Enrich relationship graph from Apollo data (enrichment mode)
 */
export const enrichRelationshipGraphAdapter: SkillAdapter = {
  name: 'enrich-relationship-graph',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[enrich-relationship-graph] Starting...');

      const orgId = state.event.org_id;
      const contactId = state.event.payload?.contact_id as string;
      const apolloData = state.event.payload?.apollo_data;

      if (!contactId) {
        return { success: true, output: { skipped: true, reason: 'no_contact_id' }, duration_ms: Date.now() - start };
      }

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/agent-relationship-graph`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          mode: 'enrichment',
          contact_id: contactId,
          org_id: orgId,
          apollo_data: apolloData,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return { success: false, error: `edge_function_${resp.status}: ${text}`, duration_ms: Date.now() - start };
      }

      const result = await resp.json();
      console.log(`[enrich-relationship-graph] Complete: ${result.history_entries} history entries, ${result.edges_created} edges, ${result.company_changes_detected} company changes`);

      return { success: true, output: result, duration_ms: Date.now() - start };

    } catch (err) {
      console.error('[enrich-relationship-graph] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};
