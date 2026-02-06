/**
 * AI Copilot Component
 * Main component for ChatGPT-style conversational interface
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useCopilot } from '@/lib/contexts/CopilotContext';
import { CopilotLayout } from './copilot/CopilotLayout';
import { CopilotRightPanel } from './copilot/CopilotRightPanel';
import { CopilotService } from '@/lib/services/copilotService';
import { useCopilotContextData } from '@/lib/hooks/useCopilotContextData';
import { EmailActionModal, EmailActionData, EmailActionType } from './copilot/EmailActionModal';
import { useDynamicPrompts } from '@/lib/hooks/useDynamicPrompts';
import logger from '@/lib/utils/logger';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { AssistantShell } from '@/components/assistant/AssistantShell';

// Helper to get auth headers for edge functions
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('No active session');
  }
  return { Authorization: `Bearer ${session.access_token}` };
}

interface CopilotProps {
  onGenerateEmail?: (contactId?: string) => void;
  onDraftEmail?: (contactId?: string) => void;
  initialQuery?: string;
}

// Email modal state interface
interface EmailModalState {
  isOpen: boolean;
  actionType: EmailActionType;
  emailId: string;
  emailDetails: {
    replyTo?: string;
    subject?: string;
    originalSnippet?: string;
  };
}

export const Copilot: React.FC<CopilotProps> = ({
  onGenerateEmail,
  onDraftEmail,
  initialQuery
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { messages, isLoading, sendMessage, cancelRequest, context, conversationId, loadConversation, startNewChat, progressSteps } = useCopilot();
  const [inputValue, setInputValue] = useState(initialQuery || '');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { prompts: suggestedPrompts } = useDynamicPrompts(3);

  // URL-based navigation for conversation selection
  const handleSelectConversation = useCallback((id: string) => {
    navigate(`/copilot/${id}`);
  }, [navigate]);

  // URL-based navigation for new chat
  const handleNewConversation = useCallback(() => {
    const newId = uuidv4();
    startNewChat();
    navigate(`/copilot/${newId}`);
  }, [navigate, startNewChat]);

  // Track last synced conversation ID to avoid redundant navigation
  const lastSyncedConversationId = useRef<string | undefined>(undefined);

  // Sync URL when API returns a different conversation ID
  useEffect(() => {
    // Only sync if we have a conversation ID and it's different from last synced
    if (conversationId && conversationId !== lastSyncedConversationId.current) {
      // Check if URL already matches
      const currentUrlId = location.pathname.split('/copilot/')[1];
      if (currentUrlId !== conversationId) {
        lastSyncedConversationId.current = conversationId;
        navigate(`/copilot/${conversationId}`, { replace: true });
      } else {
        lastSyncedConversationId.current = conversationId;
      }
    }
  }, [conversationId, location.pathname, navigate]);

  // US-012: Fetch context data for right panel (US-006: includes summary counts)
  const { contextItems, contextSummary, isLoading: isContextLoading } = useCopilotContextData();

  // Email action modal state
  const [emailModal, setEmailModal] = useState<EmailModalState>({
    isOpen: false,
    actionType: 'reply',
    emailId: '',
    emailDetails: {}
  });

  // Auto-send initial query if provided
  useEffect(() => {
    if (initialQuery && messages.length === 0) {
      sendMessage(initialQuery);
      setInputValue('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
    sendMessage(inputValue);
    setInputValue('');
  };

  const handlePromptClick = (prompt: string) => {
    setInputValue(prompt);
    // Auto-send when clicking a prompt
    setTimeout(() => {
      sendMessage(prompt);
      setInputValue('');
    }, 100);
  };

  const handleActionClick = async (action: any, data?: any) => {
    // Handle string-based actions (from CommunicationHistoryResponse)
    if (typeof action === 'string') {
      const emailId = data?.emailId;
      
      switch (action) {
        case 'reply':
          if (!emailId) {
            toast.error('Email ID is required to reply');
            return;
          }
          try {
            // Get email details first to extract reply information
            const headers = await getAuthHeaders();
            const { data: emailData, error: emailError } = await supabase.functions.invoke('google-gmail', {
              body: { action: 'get', messageId: emailId },
              headers
            });

            if (emailError) throw emailError;

            // Extract reply-to email from headers
            const emailHeaders = emailData?.payload?.headers || [];
            const fromHeader = emailHeaders.find((h: any) => h.name?.toLowerCase() === 'from');
            const subjectHeader = emailHeaders.find((h: any) => h.name?.toLowerCase() === 'subject');

            // Extract email from "Name <email@example.com>" format
            const extractEmail = (str: string) => {
              const match = str.match(/<(.+)>/);
              return match ? match[1] : str.trim();
            };

            const replyTo = fromHeader ? extractEmail(fromHeader.value) : '';
            const subject = subjectHeader?.value || 'Re: Email';
            const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

            // Open modal for reply
            setEmailModal({
              isOpen: true,
              actionType: 'reply',
              emailId,
              emailDetails: {
                replyTo,
                subject: replySubject,
                originalSnippet: emailData?.snippet
              }
            });
          } catch (error) {
            logger.error('Error preparing reply:', error);
            toast.error('Failed to prepare reply');
          }
          break;
          
        case 'forward':
          if (!emailId) {
            toast.error('Email ID is required to forward');
            return;
          }
          try {
            // Get email details first
            const fwdHeaders = await getAuthHeaders();
            const { data: fwdEmailData, error: fwdEmailError } = await supabase.functions.invoke('google-gmail', {
              body: { action: 'get', messageId: emailId },
              headers: fwdHeaders
            });

            if (fwdEmailError) throw fwdEmailError;

            const fwdEmailHeaders = fwdEmailData?.payload?.headers || [];
            const fwdSubjectHeader = fwdEmailHeaders.find((h: any) => h.name?.toLowerCase() === 'subject');
            const fwdSubject = fwdSubjectHeader?.value || 'Forwarded Email';
            const forwardSubject = fwdSubject.startsWith('Fwd:') ? fwdSubject : `Fwd: ${fwdSubject}`;

            // Open modal for forward
            setEmailModal({
              isOpen: true,
              actionType: 'forward',
              emailId,
              emailDetails: {
                subject: forwardSubject,
                originalSnippet: fwdEmailData?.snippet
              }
            });
          } catch (error) {
            logger.error('Error preparing forward:', error);
            toast.error('Failed to prepare forward');
          }
          break;
          
        case 'archive':
          if (!emailId) {
            toast.error('Email ID is required to archive');
            return;
          }
          try {
            const archiveHeaders = await getAuthHeaders();
            const { error } = await supabase.functions.invoke('google-gmail?action=archive', {
              body: { messageId: emailId },
              headers: archiveHeaders
            });

            if (error) throw error;

            toast.success('Email archived successfully');
            logger.log('Email archived:', emailId);
          } catch (error) {
            logger.error('Error archiving email:', error);
            toast.error('Failed to archive email');
          }
          break;
          
        case 'star':
          if (!emailId) {
            toast.error('Email ID is required to star');
            return;
          }
          try {
            // Toggle star - we'd need to check current state, but for now just star it
            const starHeaders = await getAuthHeaders();
            const { error } = await supabase.functions.invoke('google-gmail?action=star', {
              body: { messageId: emailId, starred: true },
              headers: starHeaders
            });

            if (error) throw error;

            toast.success('Email starred');
            logger.log('Email starred:', emailId);
          } catch (error) {
            logger.error('Error starring email:', error);
            toast.error('Failed to star email');
          }
          break;
          
        case 'add_to_task':
          if (!emailId) {
            toast.error('Email ID is required to create task');
            return;
          }
          try {
            // Get email details first
            const taskHeaders = await getAuthHeaders();
            const { data: emailData, error: emailError } = await supabase.functions.invoke('google-gmail', {
              body: { action: 'get', messageId: emailId },
              headers: taskHeaders
            });
            
            if (emailError) throw emailError;
            
            // Get current user
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
              toast.error('You must be logged in to create tasks');
              return;
            }
            
            // Extract email subject and snippet for task
            const subject = emailData?.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || 'Email follow-up';
            const snippet = emailData?.snippet || '';
            
            // Create task from email
            const taskData: any = {
              title: `Follow up: ${subject}`,
              description: `Task created from email:\n\n${snippet}`,
              status: 'todo',
              priority: 'medium',
              task_type: 'email',
              assigned_to: user.id,
              created_by: user.id,
              contact_email: user.email, // Required field
              due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
            };
            
            // Add metadata if supported
            try {
              taskData.metadata = {
                source: 'email_copilot',
                email_id: emailId
              };
            } catch (e) {
              // Metadata might not be supported, continue without it
            }
            
            const { data: task, error: taskError } = await supabase
              .from('tasks')
              .insert(taskData)
              .select()
              .single();
            
            if (taskError) throw taskError;
            
            toast.success('Task created successfully');
            logger.log('Task created from email:', task);
          } catch (error) {
            logger.error('Error creating task from email:', error);
            toast.error('Failed to create task from email');
          }
          break;
          
        default:
          logger.log('Unknown action:', action);
      }
      return;
    }
    
    // Handle special action types
    if (action === 'search_emails' || (typeof action === 'object' && action.type === 'search_emails')) {
      const params = typeof action === 'object' ? action : {};
      const query = params.contactEmail 
        ? `Show me all emails from ${params.contactName || params.contactEmail}`
        : 'Show me my recent emails';
      sendMessage(query);
      return;
    }
    
    // Handle API callbacks
    if (action.callback && action.callback.startsWith('/api/')) {
      try {
        const response = await fetch(action.callback, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(action.params || {})
        });
        
        if (response.ok) {
          const result = await response.json();
          logger.log('Action completed:', result);
          // Optionally refresh data or show success message
        } else {
          logger.error('Action failed:', response.statusText);
        }
      } catch (error) {
        logger.error('Error executing action:', error);
      }
      return;
    }

    // Handle action types
    switch (action.type) {
      case 'draft_email':
        if (action.contactId || context.contactId) {
          try {
            const emailDraft = await CopilotService.draftEmail(
              action.contactId || context.contactId!,
              'Follow-up email based on recent activity',
              'professional'
            );
            onDraftEmail?.(action.contactId || context.contactId);
          } catch (error) {
            logger.error('Error drafting email:', error);
          }
        } else {
          onDraftEmail?.();
        }
        break;
      case 'view_deal':
        if (action.href || action.dealId) {
          const url = action.href || `/crm/deals/${action.dealId}`;
          window.location.href = url;
        }
        break;
      case 'view_contact':
        if (action.href || action.contactId) {
          const url = action.href || `/crm/contacts/${action.contactId}`;
          window.location.href = url;
        }
        break;
      case 'schedule_call':
        // Handle schedule call action
        logger.log('Schedule call action');
        break;
      // US-010: Handle email tone change - regenerate email with new tone
      case 'change_email_tone':
        if (action.tone && action.context) {
          const toneLabels: Record<string, string> = {
            professional: 'professional',
            friendly: 'friendly and warm',
            concise: 'concise and brief'
          };
          const toneDescription = toneLabels[action.tone] || action.tone;
          const contactName = action.context.contactName || 'the contact';
          // Send a message to regenerate the email with the new tone
          sendMessage(`Regenerate the email draft for ${contactName} with a ${toneDescription} tone`);
        }
        break;
      default:
        // Handle callback function if provided
        if (typeof action.callback === 'function') {
          action.callback();
        } else if (action.callback && action.callback.startsWith('/')) {
          window.location.href = action.callback;
        }
    }
  };

  const isEmpty = messages.length === 0 && !isLoading;

  // Handle email modal submission (reply/forward)
  const handleEmailModalSubmit = useCallback(async (data: EmailActionData) => {
    const { emailId, actionType } = emailModal;
    const headers = await getAuthHeaders();

    if (actionType === 'reply') {
      const { error } = await supabase.functions.invoke('google-gmail?action=reply', {
        body: {
          messageId: emailId,
          body: data.body,
          replyAll: false,
          isHtml: false
        },
        headers
      });

      if (error) throw error;
      toast.success('Reply sent successfully');
      logger.log('Reply sent:', emailId);
    } else if (actionType === 'forward') {
      const { error } = await supabase.functions.invoke('google-gmail?action=forward', {
        body: {
          messageId: emailId,
          to: data.recipients,
          additionalMessage: data.body
        },
        headers
      });

      if (error) throw error;
      toast.success('Email forwarded successfully');
      logger.log('Email forwarded:', emailId);
    }
  }, [emailModal]);

  const closeEmailModal = useCallback(() => {
    setEmailModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  return (
    <CopilotLayout rightPanel={
      <CopilotRightPanel
        contextItems={contextItems}
        contextSummary={contextSummary}
        isContextLoading={isContextLoading}
        progressSteps={progressSteps}
        isProcessing={isLoading}
        currentConversationId={conversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
      />
    }>
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 flex flex-col min-h-0 overflow-hidden h-[calc(100dvh-var(--app-top-offset))]">
        <AssistantShell mode="page" />

        {/* Email Action Modal (Reply/Forward) */}
        <EmailActionModal
          isOpen={emailModal.isOpen}
          onClose={closeEmailModal}
          onSubmit={handleEmailModalSubmit}
          actionType={emailModal.actionType}
          emailDetails={emailModal.emailDetails}
        />
      </div>
    </CopilotLayout>
  );
};

