/**
 * FloatingChatBar — 3-state expandable chat overlay for assembly mode.
 *
 * States:
 *   COLLAPSED (64px)  — agent dot, last message preview, input stub, expand chevron
 *   EXPANDED  (65vh)   — header with agent identity, full AssistantShell
 *   MAXIMIZED (100vh-6rem) — backdrop blur, near full-screen chat
 *
 * AssistantShell stays mounted in all states (h-0 when collapsed)
 * to preserve scroll position and message history.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, Maximize2, Minimize2, X, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AssistantShell, type QuickAction } from '@/components/assistant/AssistantShell';
import { IntelligenceToggle, type ModelTier } from './IntelligenceToggle';

export type ChatOverlayState = 'collapsed' | 'expanded' | 'maximized';

interface FloatingChatBarProps {
  apiContentTransform?: (message: string) => string;
  phaseActions?: QuickAction[];
  onPhaseAction?: (prompt: string) => boolean;
  phaseComponent?: React.ReactNode;
  agentLabel?: string;
  agentColor?: string;
  statusText?: string;
  sectionCount?: number;
  isAgentWorking?: boolean;
  onChatStateChange?: (state: ChatOverlayState) => void;
  lastMessagePreview?: string;
  modelTier?: ModelTier;
  onModelTierChange?: (tier: ModelTier) => void;
}

const springTransition = { type: 'spring' as const, stiffness: 300, damping: 30 };

const AVATAR_GRADIENTS: Record<string, string> = {
  blue: 'from-blue-500 to-blue-600',
  violet: 'from-violet-500 to-violet-600',
  amber: 'from-amber-500 to-amber-600',
};

const DOT_COLORS: Record<string, string> = {
  blue: 'bg-blue-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
};

function resolveColorKey(agentColor?: string): string {
  if (agentColor?.includes('blue')) return 'blue';
  if (agentColor?.includes('violet')) return 'violet';
  return 'amber';
}

export const FloatingChatBar: React.FC<FloatingChatBarProps> = ({
  apiContentTransform,
  phaseActions,
  onPhaseAction,
  phaseComponent,
  agentLabel = 'Editor',
  agentColor = 'text-amber-500',
  statusText = 'Ready',
  sectionCount,
  isAgentWorking = false,
  onChatStateChange,
  lastMessagePreview,
  modelTier = 'balanced',
  onModelTierChange,
}) => {
  const [chatState, setChatState] = useState<ChatOverlayState>('collapsed');
  const prevIsAgentWorking = useRef(isAgentWorking);

  const updateState = useCallback((next: ChatOverlayState) => {
    setChatState(next);
    onChatStateChange?.(next);
  }, [onChatStateChange]);

  // Auto-expand when AI starts responding while collapsed
  useEffect(() => {
    if (!prevIsAgentWorking.current && isAgentWorking && chatState === 'collapsed') {
      updateState('expanded');
    }
    prevIsAgentWorking.current = isAgentWorking;
  }, [isAgentWorking, chatState, updateState]);

  // Keyboard: Cmd+J toggles collapsed<->expanded, Escape exits maximized
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        updateState(chatState === 'collapsed' ? 'expanded' : 'collapsed');
      }
      if (e.key === 'Escape' && chatState === 'maximized') {
        e.preventDefault();
        updateState('expanded');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [chatState, updateState]);

  const colorKey = resolveColorKey(agentColor);
  const avatarGradient = AVATAR_GRADIENTS[colorKey];
  const dotColor = DOT_COLORS[colorKey];

  const isCollapsed = chatState === 'collapsed';
  const isMaximized = chatState === 'maximized';

  // Primary phase action for the quick-action pill (collapsed only)
  const primaryAction = phaseActions?.find(a => a.variant === 'primary');

  // Height variants for spring animation
  const heightVariants = {
    collapsed: { height: 64 },
    expanded: { height: 'min(65vh, 560px)' },
    maximized: { height: 'calc(100vh - 6rem)' },
  };

  return (
    <>
      {/* Backdrop — maximized state only */}
      <AnimatePresence>
        {isMaximized && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[19]"
            onClick={() => updateState('expanded')}
          />
        )}
      </AnimatePresence>

      {/* Positioned wrapper */}
      <div
        className={cn(
          'absolute bottom-4 z-20 px-4',
          isMaximized
            ? 'inset-x-0'
            : 'left-1/2 -translate-x-1/2 w-full',
        )}
        style={{ maxWidth: isMaximized ? undefined : isCollapsed ? 720 : 820 }}
      >
        {/* Quick-action pill — floats above collapsed bar */}
        <AnimatePresence>
          {isCollapsed && primaryAction && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18 }}
              className="flex justify-center mb-2"
            >
              <button
                type="button"
                onClick={() => onPhaseAction?.(primaryAction.prompt)}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm font-medium',
                  'bg-indigo-600 text-white hover:bg-indigo-500',
                  'shadow-lg shadow-indigo-500/25 transition-colors',
                )}
              >
                <Sparkles className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                {primaryAction.label}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main chat container */}
        <motion.div
          animate={chatState}
          variants={heightVariants}
          transition={springTransition}
          className={cn(
            'bg-gray-950/95 backdrop-blur-xl',
            'rounded-xl shadow-2xl border border-white/10',
            'overflow-hidden mx-auto flex flex-col',
          )}
        >
          {/* ─── COLLAPSED BAR ─── */}
          {isCollapsed && (
            <div className="flex items-center h-full px-4 gap-3">
              {/* Agent dot (pulses when working) */}
              <div className="relative flex-shrink-0">
                <div className={cn('w-2.5 h-2.5 rounded-full', dotColor)} />
                {isAgentWorking && (
                  <div
                    className={cn(
                      'absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping opacity-75',
                      dotColor,
                    )}
                  />
                )}
              </div>

              {/* Agent label */}
              <span className={cn('text-sm font-medium flex-shrink-0', agentColor)}>
                {agentLabel}
              </span>

              {/* Last message preview */}
              <span className="text-sm text-gray-400 truncate flex-1 min-w-0">
                {lastMessagePreview
                  ? `\u201c${lastMessagePreview}\u201d`
                  : 'Start a conversation\u2026'}
              </span>

              {/* Input stub — click to expand */}
              <button
                type="button"
                onClick={() => updateState('expanded')}
                className={cn(
                  'flex-shrink-0 px-3 py-1.5 rounded-lg text-sm',
                  'bg-white/5 border border-white/10 text-gray-500',
                  'hover:bg-white/10 hover:text-gray-300 transition-colors',
                  'min-w-[140px] text-left',
                )}
              >
                Ask anything\u2026
              </button>

              {/* Expand chevron */}
              <button
                type="button"
                onClick={() => updateState('expanded')}
                className="flex-shrink-0 p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
                aria-label="Expand chat"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ─── EXPANDED / MAXIMIZED HEADER ─── */}
          {!isCollapsed && (
            <div className="flex items-center h-12 px-4 border-b border-white/5 flex-shrink-0">
              {/* Agent avatar */}
              <div
                className={cn(
                  'w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0',
                  avatarGradient,
                )}
              >
                <Sparkles className="w-4 h-4 text-white" />
              </div>

              {/* Agent info */}
              <div className="ml-3 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn('text-sm font-semibold', agentColor)}>
                    {agentLabel}
                  </span>
                  <span className="text-xs text-gray-500">&middot;</span>
                  <span className="text-xs text-gray-400 truncate flex items-center gap-1.5">
                    {isAgentWorking && <Loader2 className="w-3 h-3 animate-spin" />}
                    {statusText}
                  </span>
                </div>
              </div>

              {/* Intelligence toggle */}
              {onModelTierChange && (
                <IntelligenceToggle
                  value={modelTier}
                  onChange={onModelTierChange}
                  className="flex-shrink-0 mr-2"
                />
              )}

              {/* Section count badge */}
              {sectionCount != null && sectionCount > 0 && (
                <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-white/5 text-xs text-gray-400 tabular-nums mr-1">
                  {sectionCount}
                </span>
              )}

              {/* Maximize / minimize */}
              <button
                type="button"
                onClick={() => updateState(isMaximized ? 'expanded' : 'maximized')}
                className="flex-shrink-0 p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
                aria-label={isMaximized ? 'Minimize' : 'Maximize'}
              >
                {isMaximized ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>

              {/* Collapse / close */}
              <button
                type="button"
                onClick={() => updateState(isMaximized ? 'expanded' : 'collapsed')}
                className="flex-shrink-0 p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
                aria-label={isMaximized ? 'Close' : 'Collapse'}
              >
                {isMaximized ? (
                  <X className="w-4 h-4" />
                ) : (
                  <ChevronUp className="w-4 h-4 rotate-180" />
                )}
              </button>
            </div>
          )}

          {/* ─── CHAT CONTENT ─── */}
          {/* AssistantShell stays mounted; h-0 when collapsed preserves scroll/message state */}
          <div
            className={cn(
              'flex flex-col overflow-hidden',
              isCollapsed ? 'h-0' : 'flex-1 min-h-0',
            )}
          >
            <AssistantShell
              mode="page"
              apiContentTransform={apiContentTransform}
              phaseActions={phaseActions}
              onPhaseAction={onPhaseAction}
              phaseComponent={phaseComponent}
            />
          </div>
        </motion.div>
      </div>
    </>
  );
};

export default FloatingChatBar;
