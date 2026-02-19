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
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Copilot } from '@/components/Copilot';
import { useCopilot } from '@/lib/contexts/CopilotContext';
import { v4 as uuidv4 } from 'uuid';

export const CopilotPage: React.FC = () => {
  const { conversationId: urlConversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { loadConversation, setConversationId, startNewChat, sendMessage } = useCopilot();
  const routeState = location.state as { seedPrompt?: string; forceNewChat?: boolean } | null;
  const seededPrompt = routeState?.seedPrompt;
  const forceNewChat = routeState?.forceNewChat === true;

  // Track initialization to run only once per URL
  const initializedForUrl = useRef<string | null>(null);

  // Handle URL-based routing - runs once per unique URL
  useEffect(() => {
    // Deterministic seeded prompt flow (used by profile -> copilot builders).
    // Start a clean conversation for this URL and send the seed message once.
    if (urlConversationId && seededPrompt && forceNewChat) {
      if (initializedForUrl.current === `seeded:${urlConversationId}`) {
        return;
      }
      initializedForUrl.current = `seeded:${urlConversationId}`;
      startNewChat();
      setConversationId(urlConversationId);
      setTimeout(() => {
        void sendMessage(seededPrompt);
      }, 100);
      navigate(`/copilot/${urlConversationId}`, { replace: true, state: null });
      return;
    }

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
  }, [urlConversationId, seededPrompt, forceNewChat, startNewChat, setConversationId, sendMessage, navigate]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <Copilot />
      </div>
    </div>
  );
};

export default CopilotPage;
