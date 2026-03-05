/**
 * Call Type Service
 * Manages organization-level call type definitions for meeting classification
 */

import { supabase } from '@/lib/supabase/clientV2';
import type { WorkflowConfig, WorkflowChecklistConfig } from '@/lib/hooks/useWorkflowResults';

// Re-export workflow config types for external consumers
export type { WorkflowConfig, WorkflowChecklistConfig };

export interface OrgCallType {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  keywords: string[];
  color: string;
  icon: string;
  is_system: boolean;
  is_active: boolean;
  enable_coaching: boolean;
  workflow_config: WorkflowConfig | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCallTypeInput {
  name: string;
  description?: string;
  keywords?: string[];
  color?: string;
  icon?: string;
  display_order?: number;
}

export interface UpdateCallTypeInput {
  name?: string;
  description?: string;
  keywords?: string[];
  color?: string;
  icon?: string;
  is_active?: boolean;
  display_order?: number;
}

export class CallTypeService {
  private static formatSupabaseError(err: unknown): string {
    // supabase-js PostgrestError shape: { message, details, hint, code }
    if (err && typeof err === 'object') {
      const anyErr = err as any;
      const code = anyErr.code ? ` (${anyErr.code})` : '';
      const message = anyErr.message ? String(anyErr.message) : 'Unknown error';
      const details = anyErr.details ? ` | details: ${String(anyErr.details)}` : '';
      const hint = anyErr.hint ? ` | hint: ${String(anyErr.hint)}` : '';
      return `${message}${code}${details}${hint}`;
    }
    return String(err);
  }

  /**
   * Get all call types for an organization
   */
  static async getCallTypes(orgId: string): Promise<OrgCallType[]> {
    try {
      const { data, error } = await supabase
        .from('org_call_types')
        .select('*')
        .eq('org_id', orgId)
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as OrgCallType[];
    } catch (error) {
      console.error('Error fetching call types:', CallTypeService.formatSupabaseError(error), error);
      throw error;
    }
  }

  /**
   * Get active call types for an organization
   */
  static async getActiveCallTypes(orgId: string): Promise<OrgCallType[]> {
    try {
      const { data, error } = await supabase
        .from('org_call_types')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as OrgCallType[];
    } catch (error) {
      console.error('Error fetching active call types:', CallTypeService.formatSupabaseError(error), error);
      throw error;
    }
  }

  /**
   * Get a specific call type by ID
   */
  static async getCallType(orgId: string, callTypeId: string): Promise<OrgCallType | null> {
    try {
      const { data, error } = await supabase
        .from('org_call_types')
        .select('*')
        .eq('org_id', orgId)
        .eq('id', callTypeId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }
      return data as unknown as OrgCallType;
    } catch (error) {
      console.error('Error fetching call type:', CallTypeService.formatSupabaseError(error), error);
      throw error;
    }
  }

  /**
   * Create a new call type
   */
  static async createCallType(
    orgId: string,
    input: CreateCallTypeInput
  ): Promise<OrgCallType> {
    try {
      // Get max display_order to append at end
      const { data: existing } = await supabase
        .from('org_call_types')
        .select('display_order')
        .eq('org_id', orgId)
        .order('display_order', { ascending: false })
        .limit(1)
        .single();

      const displayOrder = input.display_order ?? ((existing?.display_order ?? -1) + 1);

      const { data, error } = await supabase
        .from('org_call_types')
        .insert({
          org_id: orgId,
          name: input.name,
          description: input.description || null,
          keywords: input.keywords || [],
          color: input.color || '#6366f1',
          icon: input.icon || 'phone',
          is_system: false,
          is_active: true,
          display_order: displayOrder,
        })
        .select()
        .single();

      if (error) throw error;
      return data as unknown as OrgCallType;
    } catch (error) {
      console.error('Error creating call type:', CallTypeService.formatSupabaseError(error), error);
      throw error;
    }
  }

  /**
   * Update an existing call type
   */
  static async updateCallType(
    orgId: string,
    callTypeId: string,
    input: UpdateCallTypeInput
  ): Promise<OrgCallType> {
    try {
      const { data, error } = await supabase
        .from('org_call_types')
        .update(input)
        .eq('id', callTypeId)
        .eq('org_id', orgId)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as OrgCallType;
    } catch (error) {
      console.error('Error updating call type:', CallTypeService.formatSupabaseError(error), error);
      throw error;
    }
  }

  /**
   * Delete a call type (only non-system types)
   */
  static async deleteCallType(orgId: string, callTypeId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('org_call_types')
        .delete()
        .eq('id', callTypeId)
        .eq('org_id', orgId)
        .eq('is_system', false); // Prevent deletion of system types

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting call type:', CallTypeService.formatSupabaseError(error), error);
      throw error;
    }
  }

  /**
   * Reorder call types
   */
  static async reorderCallTypes(
    orgId: string,
    callTypeIds: string[]
  ): Promise<void> {
    try {
      // Update display_order for each call type
      const updates = callTypeIds.map((id, index) => ({
        id,
        display_order: index,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('org_call_types')
          .update({ display_order: update.display_order })
          .eq('id', update.id)
          .eq('org_id', orgId);

        if (error) throw error;
      }
    } catch (error) {
      console.error('Error reordering call types:', CallTypeService.formatSupabaseError(error), error);
      throw error;
    }
  }

  /**
   * Seed default call types for an organization
   */
  static async seedDefaultCallTypes(orgId: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('seed_default_call_types', {
        p_org_id: orgId,
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error seeding default call types:', CallTypeService.formatSupabaseError(error), error);
      throw error;
    }
  }

  /**
   * Update meeting's call type (for manual override)
   */
  static async updateMeetingCallType(
    meetingId: string,
    callTypeId: string | null,
    userId: string
  ): Promise<void> {
    try {
      // Verify user has access to the meeting
      const { data: meeting, error: meetingError } = await supabase
        .from('meetings')
        .select('owner_user_id, call_type_id')
        .eq('id', meetingId)
        .single();

      if (meetingError) throw meetingError;
      if (!meeting) throw new Error('Meeting not found');

      // Check if user owns the meeting or is admin
      if (meeting.owner_user_id !== userId) {
        // Check if user is admin
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', userId)
          .single();

        if (!profile?.is_admin) {
          throw new Error('Unauthorized: Cannot update meeting call type');
        }
      }

      const updateData: any = {
        call_type_id: callTypeId,
        call_type_confidence: callTypeId ? 1.0 : null, // Manual override = 100% confidence
        call_type_reasoning: callTypeId ? 'Manually set by user' : null,
      };

      const { error } = await supabase
        .from('meetings')
        .update(updateData)
        .eq('id', meetingId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating meeting call type:', CallTypeService.formatSupabaseError(error), error);
      throw error;
    }
  }
}

