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
import { useCopilotContextData } from '@/lib/hooks/useCopilotContextData';
import { useToolResultContext } from '@/lib/hooks/useToolResultContext';
import { EmailActionModal, EmailActionData, EmailActionType } from './copilot/EmailActionModal';
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
  /** @deprecated No longer used -- email actions are handled in AssistantShell */
  onGenerateEmail?: (contactId?: string) => void;
  /** @deprecated No longer used -- email actions are handled in AssistantShell */
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
  initialQuery
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { messages, isLoading, sendMessage, conversationId, startNewChat, progressSteps } = useCopilot();

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
  const { contextItems: dbContextItems, contextSummary: dbContextSummary, isLoading: isContextLoading } = useCopilotContextData();

  // Extract rich context from autonomous tool call results
  const { toolContextItems, toolContextSummary } = useToolResultContext();

  // Merge: tool context items first, then DB items (filter overlapping types)
  const toolContextTypes = new Set(toolContextItems.map(item => item.type));
  const filteredDbItems = dbContextItems.filter(item => !toolContextTypes.has(item.type));
  const contextItems = [...toolContextItems, ...filteredDbItems];

  // Merge summaries: tool counts take priority over DB counts
  const contextSummary = {
    ...dbContextSummary,
    ...(toolContextSummary.dealCount != null ? { dealCount: toolContextSummary.dealCount } : {}),
    ...(toolContextSummary.meetingCount != null ? { meetingCount: toolContextSummary.meetingCount } : {}),
    ...(toolContextSummary.contactCount != null ? { contactCount: toolContextSummary.contactCount } : {}),
    ...(toolContextSummary.taskCount != null ? { taskCount: toolContextSummary.taskCount } : {}),
  };

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

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

