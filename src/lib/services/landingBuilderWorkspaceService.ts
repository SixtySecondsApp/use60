/**
 * Landing Builder Workspace Service
 *
 * CRUD operations for the landing_builder_sessions table.
 * Each session stores phase outputs (brief, strategy, copy, visuals, code)
 * as JSONB columns, enabling agents to read only what they need.
 */

import { supabase } from '@/lib/supabase/clientV2';
import logger from '@/lib/utils/logger';
import type { LandingResearchData, LandingSection, AssetStatus } from '@/components/landing-builder/types';

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
  research: LandingResearchData | null;
  sections: LandingSection[];
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
// Column selection — gracefully handles missing `sections` column on older DBs
// ---------------------------------------------------------------------------

const COLUMNS_WITH_SECTIONS = 'id, conversation_id, user_id, org_id, brief, strategy, copy, visuals, code, research, sections, current_phase, phase_status, created_at, updated_at';
const COLUMNS_WITHOUT_SECTIONS = 'id, conversation_id, user_id, org_id, brief, strategy, copy, visuals, code, research, current_phase, phase_status, created_at, updated_at';

let hasSectionsColumn = true; // optimistic — flip on first 42703

function withDefaultSections(row: Record<string, unknown>): LandingBuilderWorkspace {
  if (!('sections' in row)) {
    (row as Record<string, unknown>).sections = [];
  }
  return row as LandingBuilderWorkspace;
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
    const cols = hasSectionsColumn ? COLUMNS_WITH_SECTIONS : COLUMNS_WITHOUT_SECTIONS;
    const { data, error } = await supabase
      .from('landing_builder_sessions')
      .select(cols)
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (error) {
      // Column doesn't exist yet — retry without it
      if (error.code === '42703' && hasSectionsColumn) {
        hasSectionsColumn = false;
        return this.get(conversationId);
      }
      logger.error('[workspace] Failed to get session:', error);
      throw error;
    }

    return data ? withDefaultSections(data as Record<string, unknown>) : null;
  },

  /**
   * Create a new workspace session.
   */
  async create(params: CreateWorkspaceParams): Promise<LandingBuilderWorkspace> {
    const cols = hasSectionsColumn ? COLUMNS_WITH_SECTIONS : COLUMNS_WITHOUT_SECTIONS;
    const { data, error } = await supabase
      .from('landing_builder_sessions')
      .insert({
        conversation_id: params.conversation_id,
        user_id: params.user_id,
        org_id: params.org_id,
      })
      .select(cols)
      .single();

    if (error) {
      if (error.code === '42703' && hasSectionsColumn) {
        hasSectionsColumn = false;
        return this.create(params);
      }
      logger.error('[workspace] Failed to create session:', error);
      throw error;
    }

    return withDefaultSections(data as Record<string, unknown>);
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
   * Update the research data for a workspace session.
   */
  async updateResearch(conversationId: string, research: LandingResearchData): Promise<void> {
    const { error } = await supabase
      .from('landing_builder_sessions')
      .update({ research })
      .eq('conversation_id', conversationId);

    if (error) {
      logger.error('[workspace] Failed to update research:', error);
      throw error;
    }
  },

  /**
   * Get the most recent workspace with actual progress for a user.
   * Used for session recovery — returns null if nothing resumable.
   */
  async getLatestByUser(userId: string): Promise<LandingBuilderWorkspace | null> {
    const cols = hasSectionsColumn ? COLUMNS_WITH_SECTIONS : COLUMNS_WITHOUT_SECTIONS;
    const { data, error } = await supabase
      .from('landing_builder_sessions')
      .select(cols)
      .eq('user_id', userId)
      .gt('current_phase', 0)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.code === '42703' && hasSectionsColumn) {
        hasSectionsColumn = false;
        return this.getLatestByUser(userId);
      }
      logger.error('[workspace] Failed to get latest session:', error);
      return null;
    }

    return data ? withDefaultSections(data as Record<string, unknown>) : null;
  },

  // -------------------------------------------------------------------------
  // Section CRUD (progressive assembly)
  // -------------------------------------------------------------------------

  /**
   * Bulk update all sections (reorder, initial creation).
   */
  async updateSections(conversationId: string, sections: LandingSection[]): Promise<void> {
    if (!hasSectionsColumn) return; // Column not migrated yet — skip silently
    const { error } = await supabase
      .from('landing_builder_sessions')
      .update({ sections })
      .eq('conversation_id', conversationId);

    if (error) {
      if (error.code === '42703') { hasSectionsColumn = false; return; }
      logger.error('[workspace] Failed to update sections:', error);
      throw error;
    }
  },

  /**
   * Update a single section by patching the sections array.
   */
  async updateSection(
    conversationId: string,
    sectionId: string,
    patch: Partial<LandingSection>,
  ): Promise<void> {
    const ws = await this.get(conversationId);
    if (!ws) throw new Error('Workspace not found');

    const sections = (ws.sections ?? []).map((s: LandingSection) =>
      s.id === sectionId ? { ...s, ...patch } : s,
    );

    await this.updateSections(conversationId, sections);
  },

  /**
   * Update asset status + URL/code for a specific section.
   */
  async updateSectionAsset(
    conversationId: string,
    sectionId: string,
    assetType: 'image' | 'svg',
    status: AssetStatus,
    value?: string,
  ): Promise<void> {
    const patch: Partial<LandingSection> =
      assetType === 'image'
        ? { image_status: status, ...(value !== undefined && { image_url: value }) }
        : { svg_status: status, ...(value !== undefined && { svg_code: value }) };

    await this.updateSection(conversationId, sectionId, patch);
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
