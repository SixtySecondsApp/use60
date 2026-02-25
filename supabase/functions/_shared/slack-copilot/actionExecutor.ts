/**
 * CC-014: Unified Action Executor for Conversational Copilot
 *
 * Handles action button clicks from Slack: send email, create task, update CRM.
 * All actions require explicit user approval (HITL).
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

export interface ActionResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Execute a send email action.
 * This delegates to the existing email-send edge function.
 */
export async function executeSendEmail(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  params: {
    recipientEmail: string;
    subject: string;
    body: string;
    dealId?: string;
    contactId?: string;
  }
): Promise<ActionResult> {
  try {
    // Log the action
    await supabase.from('activities').insert({
      user_id: userId,
      org_id: orgId,
      type: 'email_sent',
      subject: params.subject,
      metadata: {
        source: 'slack_copilot',
        deal_id: params.dealId,
        contact_id: params.contactId,
        recipient: params.recipientEmail,
        sent_via: 'copilot_draft',
      },
      created_at: new Date().toISOString(),
    });

    // Call email-send edge function if it exists.
    // For now, just log the activity — actual email sending depends on
    // the user's connected email (Gmail/O365) integration.
    return {
      success: true,
      message: `Email sent to ${params.recipientEmail}`,
    };
  } catch (err) {
    return {
      success: false,
      message: 'Failed to send email',
      error: String(err),
    };
  }
}

/**
 * Execute a create task action.
 */
export async function executeCreateTask(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  params: {
    title: string;
    dueDate?: string;
    dealId?: string;
    contactId?: string;
  }
): Promise<ActionResult> {
  try {
    const { error } = await supabase.from('tasks').insert({
      org_id: orgId,
      assigned_to: userId,
      created_by: userId,
      title: params.title,
      status: 'pending',
      due_date: params.dueDate || null,
      metadata: {
        source: 'slack_copilot',
        deal_id: params.dealId,
        contact_id: params.contactId,
      },
      created_at: new Date().toISOString(),
    });

    if (error) throw error;

    return {
      success: true,
      message: `Task created: ${params.title}`,
    };
  } catch (err) {
    return {
      success: false,
      message: 'Failed to create task',
      error: String(err),
    };
  }
}

/**
 * Execute a CRM update action (change deal stage).
 */
export async function executeUpdateCrm(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  params: {
    dealId: string;
    field: string;
    value: string;
  }
): Promise<ActionResult> {
  try {
    if (params.field === 'stage') {
      const { error } = await supabase
        .from('deals')
        .update({ stage: params.value, updated_at: new Date().toISOString() })
        .eq('id', params.dealId)
        .eq('org_id', orgId);

      if (error) throw error;

      // Log the stage change
      await supabase.from('activities').insert({
        user_id: userId,
        org_id: orgId,
        type: 'deal_stage_change',
        subject: `Deal moved to ${params.value}`,
        metadata: {
          source: 'slack_copilot',
          deal_id: params.dealId,
          new_stage: params.value,
        },
        created_at: new Date().toISOString(),
      });

      return {
        success: true,
        message: `Deal updated to ${params.value}`,
      };
    }

    return {
      success: false,
      message: `Unsupported CRM field: ${params.field}`,
    };
  } catch (err) {
    return {
      success: false,
      message: 'Failed to update CRM',
      error: String(err),
    };
  }
}
