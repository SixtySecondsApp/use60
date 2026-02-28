/**
 * Landing Builder Workspace Service
 *
 * CRUD operations for the landing_builder_sessions table.
 * Each session stores phase outputs (brief, strategy, copy, visuals, code)
 * as JSONB columns, enabling agents to read only what they need.
 */

import { supabase } from '@/lib/supabase/clientV2';
import logger from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LandingBuilderWorkspace {
  id: string;
  conversation_id: string;
  user_id: string;
  org_id: string;
  brief: Record<string, unknown>;
  strategy: Record<string, unknown>;
  copy: Record<string, unknown>;
  visuals: Record<string, unknown>;
  code: string | null;
  current_phase: number;
  phase_status: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export type WorkspacePhaseKey = 'brief' | 'strategy' | 'copy' | 'visuals';

export interface CreateWorkspaceParams {
  conversation_id: string;
  user_id: string;
  org_id: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const landingBuilderWorkspaceService = {
  /**
   * Get a workspace by conversation_id.
   * Returns null if not found.
   */
  async get(conversationId: string): Promise<LandingBuilderWorkspace | null> {
    const { data, error } = await supabase
      .from('landing_builder_sessions')
      .select('id, conversation_id, user_id, org_id, brief, strategy, copy, visuals, code, current_phase, phase_status, created_at, updated_at')
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (error) {
      logger.error('[workspace] Failed to get session:', error);
      throw error;
    }

    return data as LandingBuilderWorkspace | null;
  },

  /**
   * Create a new workspace session.
   */
  async create(params: CreateWorkspaceParams): Promise<LandingBuilderWorkspace> {
    const { data, error } = await supabase
      .from('landing_builder_sessions')
      .insert({
        conversation_id: params.conversation_id,
        user_id: params.user_id,
        org_id: params.org_id,
      })
      .select('id, conversation_id, user_id, org_id, brief, strategy, copy, visuals, code, current_phase, phase_status, created_at, updated_at')
      .single();

    if (error) {
      logger.error('[workspace] Failed to create session:', error);
      throw error;
    }

    return data as LandingBuilderWorkspace;
  },

  /**
   * Get or create a workspace for a conversation.
   * Ensures exactly one session per conversation_id.
   */
  async getOrCreate(params: CreateWorkspaceParams): Promise<LandingBuilderWorkspace> {
    const existing = await this.get(params.conversation_id);
    if (existing) return existing;
    return this.create(params);
  },

  /**
   * Update a specific phase output (brief, strategy, copy, or visuals).
   */
  async updatePhaseOutput(
    conversationId: string,
    phase: WorkspacePhaseKey,
    output: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await supabase
      .from('landing_builder_sessions')
      .update({ [phase]: output })
      .eq('conversation_id', conversationId);

    if (error) {
      logger.error(`[workspace] Failed to update ${phase}:`, error);
      throw error;
    }
  },

  /**
   * Update the generated code (final build phase output).
   */
  async updateCode(conversationId: string, code: string): Promise<void> {
    const { error } = await supabase
      .from('landing_builder_sessions')
      .update({ code })
      .eq('conversation_id', conversationId);

    if (error) {
      logger.error('[workspace] Failed to update code:', error);
      throw error;
    }
  },

  /**
   * Advance the current phase and update phase_status.
   */
  async advancePhase(
    conversationId: string,
    nextPhase: number,
    phaseStatus: Record<string, string>,
  ): Promise<void> {
    const { error } = await supabase
      .from('landing_builder_sessions')
      .update({
        current_phase: nextPhase,
        phase_status: phaseStatus,
      })
      .eq('conversation_id', conversationId);

    if (error) {
      logger.error('[workspace] Failed to advance phase:', error);
      throw error;
    }
  },

  /**
   * Delete a workspace session.
   */
  async remove(conversationId: string): Promise<void> {
    const { error } = await supabase
      .from('landing_builder_sessions')
      .delete()
      .eq('conversation_id', conversationId);

    if (error) {
      logger.error('[workspace] Failed to delete session:', error);
      throw error;
    }
  },
};
