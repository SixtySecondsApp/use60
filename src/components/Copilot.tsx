/**
 * AI Copilot Component
 * Main component for ChatGPT-style conversational interface
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { useCopilot } from '@/lib/contexts/CopilotContext';
import { CopilotLayout } from './copilot/CopilotLayout';
import { CopilotRightPanel } from './copilot/CopilotRightPanel';
import { useCopilotContextData } from '@/lib/hooks/useCopilotContextData';
import { useToolResultContext } from '@/lib/hooks/useToolResultContext';
import { AssistantShell } from '@/components/assistant/AssistantShell';
import { useCopilotIntegrationStatus } from '@/lib/hooks/useCopilotIntegrationStatus';

interface CopilotProps {
  initialQuery?: string;
}

export const Copilot: React.FC<CopilotProps> = ({
  initialQuery
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { messages, isLoading, sendMessage, conversationId, startNewChat, progressSteps } = useCopilot();
  const { integrations } = useCopilotIntegrationStatus();

  // URL-based navigation for conversation selection
  const handleSelectConversation = useCallback((id: string) => {
    navigate(`/copilot/${id}`);
  }, [navigate]);

  // URL-based navigation for new chat
  const handleNewConversation = useCallback(() => {
    // startNewChat() generates a UUID and creates the DB record
    const newId = startNewChat();
    if (newId) {
      navigate(`/copilot/${newId}`);
    }
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
  const contextItems = React.useMemo(() => {
    const toolContextTypes = new Set(toolContextItems.map(item => item.type));
    const filteredDbItems = dbContextItems.filter(item => !toolContextTypes.has(item.type));
    return [...toolContextItems, ...filteredDbItems];
  }, [toolContextItems, dbContextItems]);

  // Merge summaries: tool counts take priority over DB counts
  const contextSummary = React.useMemo(() => ({
    ...dbContextSummary,
    ...(toolContextSummary.dealCount != null ? { dealCount: toolContextSummary.dealCount } : {}),
    ...(toolContextSummary.meetingCount != null ? { meetingCount: toolContextSummary.meetingCount } : {}),
    ...(toolContextSummary.contactCount != null ? { contactCount: toolContextSummary.contactCount } : {}),
    ...(toolContextSummary.taskCount != null ? { taskCount: toolContextSummary.taskCount } : {}),
  }), [dbContextSummary, toolContextSummary]);

  // Auto-send initial query if provided
  useEffect(() => {
    if (initialQuery && messages.length === 0) {
      sendMessage(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

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
        integrations={integrations}
      />
    }>
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 flex flex-col min-h-0 overflow-hidden h-[calc(100dvh-var(--app-top-offset))]">
        <AssistantShell mode="page" />
      </div>
    </CopilotLayout>
  );
};

