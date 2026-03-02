/**
 * Landing Page Builder Page
 *
 * Unlike CopilotPage, this does NOT use URL-based conversation routing.
 * Each visit starts a fresh builder session. The URL stays clean at
 * /landing-page-builder.
 *
 * Session Recovery: stores conversationId in localStorage so refreshing
 * can resume an in-progress workspace instead of losing all progress.
 *
 * startNewChat() calls clearMessages() which sets a skipSessionRestore flag
 * in useCopilotChat, preventing the async session restoration from
 * re-injecting old copilot messages after the builder has started.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useCopilot } from '@/lib/contexts/CopilotContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import { LandingPageBuilder } from '@/components/landing-builder/LandingPageBuilder';
import { landingBuilderWorkspaceService, type LandingBuilderWorkspace } from '@/lib/services/landingBuilderWorkspaceService';
import { ArrowRight, Plus } from 'lucide-react';

const LS_KEY = 'sixty_landing_builder_cid';

/** Check if a workspace was updated within the last 24 hours */
function isRecent(updatedAt: string): boolean {
  const diff = Date.now() - new Date(updatedAt).getTime();
  return diff < 24 * 60 * 60 * 1000;
}

const PHASE_NAMES = ['Strategy & Layout', 'Copy', 'Visuals & Animation', 'Build'];

export const LandingPageBuilderPage: React.FC = () => {
  const { messages, setConversationId, startNewChat } = useCopilot();
  const { userId } = useAuth();
  const [ready, setReady] = useState(false);
  const hasCleared = useRef(false);

  // Recovery state
  const [recoveredWorkspace, setRecoveredWorkspace] = useState<LandingBuilderWorkspace | null>(null);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [checking, setChecking] = useState(true);

  // Check for resumable session on mount
  useEffect(() => {
    if (!userId) return;

    const checkRecovery = async () => {
      try {
        // First check localStorage for a stored conversation ID
        const storedCid = localStorage.getItem(LS_KEY);
        if (storedCid) {
          const workspace = await landingBuilderWorkspaceService.get(storedCid);
          if (workspace && workspace.current_phase > 0 && isRecent(workspace.updated_at)) {
            setRecoveredWorkspace(workspace);
            setShowResumeBanner(true);
            setChecking(false);
            return;
          }
        }

        // Fallback: check for any recent workspace by user
        const latest = await landingBuilderWorkspaceService.getLatestByUser(userId);
        if (latest && isRecent(latest.updated_at)) {
          setRecoveredWorkspace(latest);
          setShowResumeBanner(true);
          setChecking(false);
          return;
        }
      } catch {
        // Recovery check failed — continue to fresh session
      }

      setChecking(false);
      initFreshSession();
    };

    checkRecovery();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const initFreshSession = useCallback(() => {
    if (hasCleared.current) return;
    hasCleared.current = true;
    startNewChat();
    const newId = uuidv4();
    setConversationId(newId);
    localStorage.setItem(LS_KEY, newId);
    setReady(true);
  }, [startNewChat, setConversationId]);

  const handleResume = useCallback(() => {
    if (!recoveredWorkspace) return;
    hasCleared.current = true;
    startNewChat();
    setConversationId(recoveredWorkspace.conversation_id);
    localStorage.setItem(LS_KEY, recoveredWorkspace.conversation_id);
    setShowResumeBanner(false);
    setReady(true);
  }, [recoveredWorkspace, startNewChat, setConversationId]);

  const handleStartFresh = useCallback(() => {
    setShowResumeBanner(false);
    setRecoveredWorkspace(null);
    hasCleared.current = false;
    initFreshSession();
  }, [initFreshSession]);

  // Wait for messages to clear when starting fresh (not resuming)
  useEffect(() => {
    if (ready || showResumeBanner || checking) return;

    if (!hasCleared.current) {
      initFreshSession();
      return;
    }

    if (messages.length === 0) {
      setReady(true);
    } else {
      startNewChat();
      const newId = uuidv4();
      setConversationId(newId);
      localStorage.setItem(LS_KEY, newId);
    }
  }, [ready, messages, startNewChat, setConversationId, showResumeBanner, checking, initFreshSession]);

  // Resume banner
  if (showResumeBanner && recoveredWorkspace) {
    const phaseName = PHASE_NAMES[recoveredWorkspace.current_phase - 1] || PHASE_NAMES[0];
    return (
      <div className="flex flex-col h-full items-center justify-center px-4">
        <div className="max-w-md w-full rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-900 p-6 shadow-lg">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Resume your landing page?
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            You have an in-progress project — <span className="text-violet-500 font-medium">{phaseName}</span> complete.
            Pick up where you left off or start a new project.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleResume}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              Resume
            </button>
            <button
              type="button"
              onClick={handleStartFresh}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-700"
            >
              <Plus className="w-4 h-4" />
              Start Fresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!ready) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <LandingPageBuilder
          initialPhase={recoveredWorkspace?.current_phase}
          initialConversationId={recoveredWorkspace?.conversation_id}
        />
      </div>
    </div>
  );
};

export default LandingPageBuilderPage;
