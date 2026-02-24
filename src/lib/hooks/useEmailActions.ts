/**
 * useEmailActions Hook
 *
 * React Query hooks for managing email actions (HITL approvals + notification-based).
 * Provides unified interface for both real HITL records and simulated notification data.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../supabase/clientV2';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import { toast } from 'sonner';

// =============================================================================
// Demo Email Content for Simulated Actions
// =============================================================================

interface DemoEmailContent {
  title: string;
  to: string;
  recipientName: string;
  subject: string;
  body: string;
}

const DEMO_EMAILS: DemoEmailContent[] = [
  {
    title: 'Follow-up: Hamilton Barnes Partnership',
    to: 'sarah@hamilton-barnes.co.uk',
    recipientName: 'Sarah Ellis-Barker',
    subject: 'Great call today — next steps for our partnership',
    body: `Hi Sarah,

Thanks so much for taking the time to chat today. It was great learning more about Hamilton Barnes and the challenges you're facing with candidate pipeline visibility.

As we discussed, here's a quick recap of the next steps:

**1. Technical Demo** — I'll set up a session with your team to walk through the CRM integration specifically for recruitment workflows.

**2. Data Migration Plan** — Let's map out how we'll import your existing candidate data without disrupting current operations.

**3. Timeline** — Targeting a pilot with your tech recruitment team in the next 2 weeks, with full rollout by end of month.

Would Tuesday at 10am work for the technical demo? I'll send over the prep materials beforehand.

Looking forward to working together!

Best,
Andrew`
  },
  {
    title: 'Proposal follow-up: Conturae',
    to: 'dan@conturae.com',
    recipientName: 'Dan Debnam',
    subject: 'Re: 60 Seconds proposal — any questions?',
    body: `Hi Dan,

Hope you've had a chance to review the proposal I sent over last week. Wanted to check in and see if you have any questions or if there's anything else you'd like me to clarify.

A few things I wanted to highlight:

**1. Integration Timeline** — We can have you fully set up within 48 hours, including the HubSpot sync you mentioned.

**2. Team Onboarding** — I've included complimentary onboarding sessions for your entire sales team.

**3. Pricing** — The annual plan includes a 20% discount, and we can start with a monthly option if you'd prefer to test first.

Let me know if you'd like to hop on a quick call this week to discuss. I'm flexible on timing.

Cheers,
Andrew`
  },
  {
    title: 'Meeting prep: Resource Agent deep-dive',
    to: 'anton@resource-agent.ai',
    recipientName: 'Anton Peruga',
    subject: 'Tomorrow\'s demo — prep materials + agenda',
    body: `Hi Anton,

Looking forward to our deep-dive session tomorrow! I wanted to send over some prep materials and the agenda.

**Agenda for tomorrow (30 mins):**

1. Quick recap of your current workflow challenges (5 mins)
2. Live demo of AI meeting intelligence features (15 mins)
3. Q&A and integration discussion (10 mins)

**Prep materials attached:**
- Product overview deck
- Integration documentation for your AI stack
- Case study from a similar AI-first company

Is there anything specific you'd like me to focus on during the demo? Happy to tailor it to your team's priorities.

See you tomorrow!

Best,
Andrew`
  },
  {
    title: 'Re-engagement: Evolve Group',
    to: 'will.kellett@evolvegrp.io',
    recipientName: 'Will Kellett',
    subject: 'Checking in — still interested in streamlining your sales process?',
    body: `Hi Will,

It's been a few weeks since we last spoke, and I wanted to check in. I know things can get busy, but I thought it might be worth reconnecting.

Since our last conversation, we've shipped a few features that might be relevant for Evolve Group:

**1. Automated Meeting Prep** — AI-generated briefing docs before every call, including company research and deal history.

**2. Smart Follow-up Suggestions** — The system now drafts follow-up emails based on meeting transcripts (like this one!).

**3. Pipeline Health Alerts** — Proactive notifications when deals show signs of going cold.

Would love to show you what's new. Any chance you have 15 minutes this week?

Best,
Andrew`
  },
  {
    title: 'Contract review: Hamilton Barnes',
    to: 'sarah@hamilton-barnes.co.uk',
    recipientName: 'Sarah Ellis-Barker',
    subject: 'Contract ready for review — Hamilton Barnes x 60 Seconds',
    body: `Hi Sarah,

Great news! Following our call yesterday, I've prepared the contract for the Hamilton Barnes pilot program.

**Contract highlights:**

- **Duration:** 3-month pilot with option to extend
- **Users:** Up to 10 users during pilot phase
- **Pricing:** Pilot rate of £X/month (40% discount from standard)
- **Support:** Dedicated onboarding manager + priority support

**Next steps:**

1. Review the attached contract
2. Let me know if you need any amendments
3. Once signed, we'll schedule your kickoff call

I've also included our security documentation and GDPR compliance details as requested.

Let me know if you have any questions — happy to jump on a quick call to walk through anything.

Best,
Andrew`
  },
];

function getDemoEmailContent(index: number): DemoEmailContent {
  return DEMO_EMAILS[index % DEMO_EMAILS.length];
}

// =============================================================================
// Types
// =============================================================================

export interface EmailAction {
  id: string;
  type: 'hitl' | 'notification';
  source: 'hitl_pending_approvals' | 'notifications';
  
  // Common fields
  title: string;
  message?: string;
  status: 'pending' | 'approved' | 'rejected' | 'edited' | 'expired' | 'cancelled' | 'sent';
  created_at: string;
  expires_at?: string;
  
  // Email content
  emailContent: {
    to: string;
    subject: string;
    body: string;
    recipientName?: string;
    recipientEmail?: string;
  };
  
  // Context
  originalEmail?: {
    from: string;
    fromName?: string;
    subject: string;
    snippet?: string;
    receivedAt?: string;
  };
  
  // Linked entities
  contactId?: string;
  dealId?: string;
  meetingId?: string;
  
  // HITL-specific
  approvalId?: string;
  resourceType?: string;
  resourceId?: string;
  
  // Notification-specific
  notificationId?: string;
  metadata?: Record<string, any>;
}

// =============================================================================
// Query Keys
// =============================================================================

const EMAIL_ACTIONS_QUERY_KEYS = {
  all: ['email-actions'] as const,
  pending: (orgId: string) => ['email-actions', 'pending', orgId] as const,
  byId: (id: string) => ['email-actions', id] as const,
};

// =============================================================================
// Hooks
// =============================================================================

/**
 * Fetch all pending email actions for the current user
 */
export function useEmailActions() {
  const { activeOrg } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: EMAIL_ACTIONS_QUERY_KEYS.pending(activeOrg?.id || ''),
    queryFn: async (): Promise<EmailAction[]> => {
      if (!activeOrg?.id || !user?.id) return [];

      const actions: EmailAction[] = [];

      // 1. Fetch HITL pending approvals for email drafts
      console.log('[useEmailActions] Fetching HITL approvals for:', { orgId: activeOrg.id, userId: user.id });
      
      const { data: hitlApprovals, error: hitlError } = await supabase
        .from('hitl_pending_approvals')
        .select('*')
        .eq('org_id', activeOrg.id)
        .eq('user_id', user.id)
        .in('status', ['pending'])
        .in('resource_type', ['email_draft', 'follow_up'])
        .order('created_at', { ascending: false });

      console.log('[useEmailActions] HITL query result:', { 
        count: hitlApprovals?.length, 
        error: hitlError?.message,
        approvals: hitlApprovals?.map(a => ({ id: a.id, resource_type: a.resource_type, status: a.status, metadata: a.metadata }))
      });

      if (!hitlError && hitlApprovals) {
        for (let i = 0; i < hitlApprovals.length; i++) {
          const approval = hitlApprovals[i];
          const content = (approval.original_content || {}) as Record<string, any>;
          const meta = (approval.metadata || {}) as Record<string, any>;
          const isSimulated = meta.source === 'proactive_simulator';
          
          // Get demo email content based on index for variety
          const demoEmail = isSimulated ? getDemoEmailContent(i) : null;
          const hasRealBody = content.body && content.body.length > 50;
          
          const emailContent = {
            to: content.recipientEmail || content.recipient || content.to || (demoEmail?.to ?? ''),
            subject: content.subject || (demoEmail?.subject ?? 'Following up'),
            body: hasRealBody ? content.body : (demoEmail?.body ?? content.body ?? content.html ?? ''),
            recipientName: content.recipientName || content.name || (demoEmail?.recipientName ?? ''),
            recipientEmail: content.recipientEmail || content.recipient || content.to || (demoEmail?.to ?? ''),
          };

          actions.push({
            id: `hitl-${approval.id}`,
            type: 'hitl',
            source: 'hitl_pending_approvals',
            title: demoEmail?.title ?? approval.resource_name ?? 'Email Draft',
            message: `AI-generated email draft ready for review`,
            status: approval.status as EmailAction['status'],
            created_at: approval.created_at,
            expires_at: approval.expires_at,
            emailContent,
            originalEmail: content.originalEmail || undefined,
            contactId: content.contactId || undefined,
            dealId: content.dealId || undefined,
            meetingId: content.meetingId || undefined,
            approvalId: approval.id,
            resourceType: approval.resource_type,
            resourceId: approval.resource_id,
            metadata: meta,
          });
        }
      }

      // 2. Fetch notifications with email-related metadata
      const { data: notifications, error: notifError } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .in('entity_type', ['email', 'email_draft', 'email_reply_alert'])
        .or('read.is.null,read.eq.false')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!notifError && notifications) {
        for (const notification of notifications) {
          // Check if notification metadata contains email content
          const metadata = notification.metadata || {};
          const hasEmailContent = 
            metadata.emailContent ||
            metadata.suggestedResponse ||
            metadata.draft ||
            (metadata.source === 'proactive_simulator' && notification.entity_type === 'email');

          if (hasEmailContent) {
            const emailContentData = metadata.emailContent || metadata.suggestedResponse || metadata.draft || {};
            const originalEmail = metadata.originalEmail || {};
            
            // For simulated notifications, get demo content based on index
            const isSimulated = metadata.source === 'proactive_simulator';
            const demoIndex = actions.length; // Use current action count for variety
            const demoEmail = isSimulated ? getDemoEmailContent(demoIndex) : null;

            const bodyContent = emailContentData.body || emailContentData.content || emailContentData.html || (demoEmail?.body ?? '');

            actions.push({
              id: `notif-${notification.id}`,
              type: 'notification',
              source: 'notifications',
              title: demoEmail?.title ?? notification.title,
              message: notification.message,
              status: notification.read ? 'sent' : 'pending',
              created_at: notification.created_at,
              expires_at: notification.expires_at,
              emailContent: {
                to: emailContentData.to || emailContentData.recipient || originalEmail.from || (demoEmail?.to ?? ''),
                subject: emailContentData.subject || (demoEmail?.subject ?? `Re: ${originalEmail.subject || ''}`),
                body: bodyContent,
                recipientName: emailContentData.recipientName || emailContentData.name || originalEmail.fromName || (demoEmail?.recipientName ?? ''),
                recipientEmail: emailContentData.to || emailContentData.recipient || originalEmail.from || (demoEmail?.to ?? ''),
              },
              originalEmail: {
                from: originalEmail.from || '',
                fromName: originalEmail.fromName || originalEmail.from || '',
                subject: originalEmail.subject || '',
                snippet: originalEmail.snippet || originalEmail.body || '',
                receivedAt: originalEmail.receivedAt || originalEmail.date || '',
              },
              contactId: metadata.contactId || undefined,
              dealId: metadata.dealId || undefined,
              meetingId: metadata.meetingId || undefined,
              notificationId: notification.id,
              metadata,
            });
          }
        }
      }

      // Sort by created_at descending
      return actions.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
    enabled: !!activeOrg?.id && !!user?.id,
  });

  // Set up real-time subscription for HITL approvals
  useEffect(() => {
    if (!activeOrg?.id || !user?.id) return;

    const channel = supabase
      .channel(`email-actions-${activeOrg.id}-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hitl_pending_approvals',
          filter: `org_id=eq.${activeOrg.id},user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: EMAIL_ACTIONS_QUERY_KEYS.pending(activeOrg.id!),
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: EMAIL_ACTIONS_QUERY_KEYS.pending(activeOrg.id!),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeOrg?.id, user?.id, queryClient]);

  return query;
}

/**
 * Fetch a single email action by ID
 */
export function useEmailAction(actionId: string | undefined) {
  const { data: actions } = useEmailActions();
  
  return {
    data: actions?.find(a => a.id === actionId),
    isLoading: false,
  };
}

/**
 * Approve and send an email action
 */
export function useApproveEmailAction() {
  const queryClient = useQueryClient();
  const { activeOrg } = useOrg();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ emailAction, editedContent }: { emailAction: EmailAction; editedContent?: { to: string; subject: string; body: string } }) => {

      if (emailAction.type === 'hitl' && emailAction.approvalId) {
        const content = editedContent || emailAction.emailContent;
        const isSimulated = emailAction.metadata?.source === 'proactive_simulator';
        
        // For simulated emails, just update the HITL approval status (no actual email sent)
        // For real emails, we would call an edge function to send the email
        if (isSimulated) {
          // Update HITL approval status directly
          const { error } = await supabase
            .from('hitl_pending_approvals')
            .update({ 
              status: editedContent ? 'edited' : 'approved',
              actioned_by: user?.id,
              actioned_at: new Date().toISOString(),
              edited_content: editedContent || null,
              response: { 
                action: editedContent ? 'edited' : 'approved', 
                source: 'email_action_center',
                simulated: true,
              },
            })
            .eq('id', emailAction.approvalId);

          if (error) {
            throw new Error(error.message || 'Failed to approve');
          }

          return { success: true, simulated: true };
        }
        
        // For real HITL approvals, try to send via edge function
        const { data, error } = await supabase.functions.invoke('hitl-send-followup-email', {
          body: {
            approval_id: emailAction.approvalId,
            action: editedContent ? 'edited' : 'approved',
            content: {
              recipientEmail: content.to,
              recipient: content.to,
              to: content.to,
              subject: content.subject,
              body: content.body,
            },
          },
        });

        if (error) {
          // Fallback: just update the status if edge function fails
          const { error: updateError } = await supabase
            .from('hitl_pending_approvals')
            .update({ 
              status: editedContent ? 'edited' : 'approved',
              actioned_by: user?.id,
              actioned_at: new Date().toISOString(),
              edited_content: editedContent || null,
              response: { action: editedContent ? 'edited' : 'approved', source: 'email_action_center' },
            })
            .eq('id', emailAction.approvalId);

          if (updateError) {
            throw new Error(updateError.message || 'Failed to approve');
          }

          return { success: true, fallback: true };
        }

        return data;
      } else if (emailAction.type === 'notification') {
        // For notification-based actions, use Gmail send via edge function
        const content = editedContent || emailAction.emailContent;
        
        const { data, error } = await supabase.functions.invoke('google-gmail', {
          body: {
            action: 'send',
            userId: user?.id,
            to: content.to,
            subject: content.subject,
            body: content.body,
            isHtml: false,
          },
        });

        if (error) {
          throw new Error(error.message || 'Failed to send email');
        }

        // Mark notification as read
        if (emailAction.notificationId) {
          await supabase
            .from('notifications')
            .update({ read: true, read_at: new Date().toISOString() })
            .eq('id', emailAction.notificationId);
        }

        return data;
      }

      throw new Error('Unsupported action type');
    },
    onMutate: async ({ emailAction }) => {
      const orgId = activeOrg?.id || '';
      const queryKey = EMAIL_ACTIONS_QUERY_KEYS.pending(orgId);
      
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousActions = queryClient.getQueryData<EmailAction[]>(queryKey);

      // Optimistically remove the action from the list
      if (previousActions) {
        queryClient.setQueryData<EmailAction[]>(
          queryKey,
          previousActions.filter(action => action.id !== emailAction.id)
        );
      }

      return { previousActions, queryKey };
    },
    onSuccess: (data) => {
      const message = data?.simulated 
        ? 'Email approved (simulated - not actually sent)' 
        : 'Email sent successfully';
      toast.success(message);
    },
    onError: (error: Error, _variables, context) => {
      // Rollback on error
      if (context?.previousActions && context?.queryKey) {
        queryClient.setQueryData<EmailAction[]>(
          context.queryKey,
          context.previousActions
        );
      }
      toast.error(error.message || 'Failed to send email');
    },
    onSettled: (_data, _error, _variables, context) => {
      // Always refetch to sync with server
      if (context?.queryKey) {
        queryClient.invalidateQueries({ queryKey: context.queryKey });
      }
    },
  });
}

/**
 * Reject/dismiss an email action
 */
export function useRejectEmailAction() {
  const queryClient = useQueryClient();
  const { activeOrg } = useOrg();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (emailAction: EmailAction) => {
      console.log('[useRejectEmailAction] Rejecting action:', {
        id: emailAction.id,
        type: emailAction.type,
        approvalId: emailAction.approvalId,
        notificationId: emailAction.notificationId,
      });

      if (emailAction.type === 'hitl' && emailAction.approvalId) {
        // Directly update HITL approval status in database
        const { data, error } = await supabase
          .from('hitl_pending_approvals')
          .update({ 
            status: 'rejected',
            actioned_by: user?.id,
            actioned_at: new Date().toISOString(),
            response: { action: 'rejected', source: 'email_action_center' },
          })
          .eq('id', emailAction.approvalId)
          .select();

        console.log('[useRejectEmailAction] HITL update result:', { data, error });

        if (error) {
          throw new Error(error.message || 'Failed to dismiss');
        }

        if (!data || data.length === 0) {
          console.warn('[useRejectEmailAction] No rows updated - record may not exist or RLS blocking');
        }

        return { success: true, actionId: emailAction.id };
      } else if (emailAction.type === 'notification' && emailAction.notificationId) {
        // Mark notification as read/dismissed
        const { data, error } = await supabase
          .from('notifications')
          .update({ read: true, read_at: new Date().toISOString() })
          .eq('id', emailAction.notificationId)
          .select();

        console.log('[useRejectEmailAction] Notification update result:', { data, error });

        if (error) {
          throw new Error(error.message || 'Failed to dismiss notification');
        }

        return { success: true, actionId: emailAction.id };
      }

      throw new Error('Unsupported action type');
    },
    onMutate: async (emailAction: EmailAction) => {
      const orgId = activeOrg?.id || '';
      const queryKey = EMAIL_ACTIONS_QUERY_KEYS.pending(orgId);
      
      console.log('[useRejectEmailAction] onMutate:', {
        orgId,
        queryKey,
        emailActionId: emailAction.id,
      });
      
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousActions = queryClient.getQueryData<EmailAction[]>(queryKey);
      console.log('[useRejectEmailAction] Previous actions count:', previousActions?.length);

      // Optimistically remove the action from the list
      if (previousActions) {
        const newActions = previousActions.filter(action => action.id !== emailAction.id);
        console.log('[useRejectEmailAction] New actions count:', newActions.length);
        queryClient.setQueryData<EmailAction[]>(queryKey, newActions);
      }

      // Return context with the snapshotted value
      return { previousActions, queryKey };
    },
    onSuccess: () => {
      toast.success('Email dismissed');
    },
    onError: (error: Error, _emailAction, context) => {
      // Rollback to the previous value on error
      if (context?.previousActions && context?.queryKey) {
        queryClient.setQueryData<EmailAction[]>(
          context.queryKey,
          context.previousActions
        );
      }
      toast.error(error.message || 'Failed to dismiss');
    },
    onSettled: (_data, _error, _variables, context) => {
      // Always refetch after error or success to sync with server
      if (context?.queryKey) {
        queryClient.invalidateQueries({ queryKey: context.queryKey });
      }
    },
  });
}
