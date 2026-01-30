import { useState, useCallback, useEffect, useRef } from 'react';
import { useCopilot } from '@/lib/contexts/CopilotContext';

export type CommandCenterState = 'closed' | 'compact' | 'medium' | 'full';

export type QuickAddAction =
  | 'outbound'
  | 'meeting'
  | 'proposal'
  | 'sale'
  | 'task'
  | 'roadmap'
  | null;

export interface QuickAddPrefill {
  preselectAction?: string;
  initialData?: Record<string, unknown>;
}

interface UseCommandCenterStateProps {
  isOpen: boolean;
  onClose: () => void;
}

export function useCommandCenterState({ isOpen, onClose }: UseCommandCenterStateProps) {
  const { messages, cancelRequest } = useCopilot();
  const [state, setState] = useState<CommandCenterState>('closed');
  const [activeQuickAddAction, setActiveQuickAddActionState] = useState<QuickAddAction>(null);
  const [quickAddPrefill, setQuickAddPrefill] = useState<QuickAddPrefill>({});

  const hasAutoExpandedRef = useRef(false);

  // Sync open prop → state
  useEffect(() => {
    if (isOpen && state === 'closed') {
      setState('compact');
      hasAutoExpandedRef.current = false;
    } else if (!isOpen && state !== 'closed') {
      setState('closed');
      setActiveQuickAddActionState(null);
      setQuickAddPrefill({});
      hasAutoExpandedRef.current = false;
    }
  }, [isOpen, state]);

  // Auto-expand medium→full when assistant returns a structuredResponse
  // Note: messages array length doesn't change when the API response arrives —
  // the placeholder message is updated in-place. So we check the latest
  // assistant message's structuredResponse directly instead of tracking length.
  useEffect(() => {
    if (state !== 'medium' || hasAutoExpandedRef.current) return;

    const latest = messages[messages.length - 1];
    if (latest?.role === 'assistant' && latest?.structuredResponse) {
      setState('full');
      hasAutoExpandedRef.current = true;
    }
  }, [messages, state]);

  // Escape key: clear form first, then close
  useEffect(() => {
    if (state === 'closed') return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (activeQuickAddAction) {
          setActiveQuickAddActionState(null);
          setQuickAddPrefill({});
        } else {
          cancelRequest();
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [state, activeQuickAddAction, cancelRequest, onClose]);

  // Body overflow lock
  useEffect(() => {
    if (state === 'closed') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [state]);

  const openChat = useCallback(() => {
    setState('medium');
    setActiveQuickAddActionState(null);
    setQuickAddPrefill({});
  }, []);

  const expandFull = useCallback(() => {
    setState('full');
  }, []);

  const collapseToMedium = useCallback(() => {
    setState('medium');
    hasAutoExpandedRef.current = false;
  }, []);

  const returnToCompact = useCallback(() => {
    setState('compact');
    hasAutoExpandedRef.current = false;
  }, []);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  const setActiveQuickAddAction = useCallback(
    (action: QuickAddAction, prefill: QuickAddPrefill = {}) => {
      setActiveQuickAddActionState(action);
      setQuickAddPrefill(prefill);
    },
    [],
  );

  const clearQuickAddAction = useCallback(() => {
    setActiveQuickAddActionState(null);
    setQuickAddPrefill({});
  }, []);

  return {
    state,
    activeQuickAddAction,
    quickAddPrefill,
    openChat,
    expandFull,
    collapseToMedium,
    returnToCompact,
    close,
    setActiveQuickAddAction,
    clearQuickAddAction,
  };
}
