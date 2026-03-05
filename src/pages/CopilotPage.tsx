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

export const CopilotPage: React.FC = () => {
  const { conversationId: urlConversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { loadConversation, ensureConversation, startNewChat, sendMessage } = useCopilot();
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

      // Ensure conversation exists in DB, send the seed message, then clear location state
      (async () => {
        try {
          await ensureConversation(urlConversationId);
          await sendMessage(seededPrompt);
        } catch (err) {
          console.error('[CopilotPage] Failed to ensure seeded conversation:', err);
        }
        // Clear location.state to prevent re-send on back navigation
        navigate(`/copilot/${urlConversationId}`, { replace: true, state: null });
      })();
      return;
    }

    // Skip if already initialized for this URL
    if (initializedForUrl.current === (urlConversationId ?? 'empty')) {
      return;
    }

    // If URL has no conversation ID, generate one and redirect
    if (!urlConversationId) {
      const newId = startNewChat();
      initializedForUrl.current = 'empty'; // Mark as handled
      navigate(`/copilot/${newId}`, { replace: true });
      return;
    }

    // Mark this URL as initialized
    initializedForUrl.current = urlConversationId;

    // Load the conversation from database (ensureConversation is called inside loadConversation)
    loadConversation(urlConversationId).catch((err) => {
      console.error('[CopilotPage] Failed to load conversation:', err);
    });
  }, [urlConversationId, seededPrompt, forceNewChat, startNewChat, ensureConversation, sendMessage, navigate, loadConversation]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <Copilot />
      </div>
    </div>
  );
};

export default CopilotPage;
