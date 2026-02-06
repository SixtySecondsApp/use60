/**
 * Copilot Page with URL-based conversation routing
 *
 * Routes:
 * - /copilot → Redirects to /copilot/{new-uuid} (new conversation)
 * - /copilot/:conversationId → Loads existing or starts new conversation with that ID
 *
 * This enables:
 * - Shareable conversation URLs for debugging
 * - Browser back/forward navigation between conversations
 * - Persistent conversation state across page refreshes
 */

import React, { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Copilot } from '@/components/Copilot';
import { useCopilot } from '@/lib/contexts/CopilotContext';
import { v4 as uuidv4 } from 'uuid';

export const CopilotPage: React.FC = () => {
  const { conversationId: urlConversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const { loadConversation, setConversationId, startNewChat } = useCopilot();

  // Track initialization to run only once per URL
  const initializedForUrl = useRef<string | null>(null);

  // Handle URL-based routing - runs once per unique URL
  useEffect(() => {
    // Skip if already initialized for this URL
    if (initializedForUrl.current === (urlConversationId ?? 'empty')) {
      return;
    }

    // If URL has no conversation ID, generate one and redirect
    if (!urlConversationId) {
      const newId = uuidv4();
      initializedForUrl.current = 'empty'; // Mark as handled
      startNewChat();
      setConversationId(newId);
      navigate(`/copilot/${newId}`, { replace: true });
      return;
    }

    // Mark this URL as initialized
    initializedForUrl.current = urlConversationId;

    // Try to load the conversation from database
    loadConversation(urlConversationId).catch(() => {
      // If loading fails (conversation doesn't exist yet), just set the ID
      // This allows new conversations to be created with the URL ID
      setConversationId(urlConversationId);
    });
  }, [urlConversationId]); // Only depend on URL, not context state

  return <Copilot />;
};

export default CopilotPage;
