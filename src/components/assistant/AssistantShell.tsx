import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, CheckSquare, PhoneCall, Users, FileText, PoundSterling, Map, Sparkles, Send } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCopilot } from '@/lib/contexts/CopilotContext';
import { ChatMessage } from '@/components/copilot/ChatMessage';
import { CopilotEmpty } from '@/components/copilot/CopilotEmpty';
import { AgentWorkingIndicator } from '@/components/copilot/AgentWorkingIndicator';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useEventEmitter } from '@/lib/communication/EventBus';

type AssistantShellMode = 'overlay' | 'page';

interface AssistantShellProps {
  mode: AssistantShellMode;
  onOpenQuickAdd?: (opts: { preselectAction: string; initialData?: Record<string, unknown> }) => void;
}

export function AssistantShell({ mode, onOpenQuickAdd }: AssistantShellProps) {
  const { messages, isLoading, sendMessage, cancelRequest, autonomousMode } = useCopilot();
  const [inputValue, setInputValue] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const emit = useEventEmitter();

  const isEmpty = messages.length === 0 && !isLoading;

  // ---------------------------------------------------------------------------
  // UX-003: Scroll-to-bottom button
  // ---------------------------------------------------------------------------
  const [showScrollButton, setShowScrollButton] = useState(false);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      setShowScrollButton(distanceFromBottom > 200);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isEmpty]);

  // Auto-scroll to bottom on new messages (only if user is near bottom)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      // Fallback for when container isn't mounted yet (e.g., first message)
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    // Auto-scroll only if user is near bottom (within 300px)
    if (distanceFromBottom < 300) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // ---------------------------------------------------------------------------
  // UX-005: Keyboard shortcuts
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // "/" focuses the input (only when no other input/textarea is focused)
      if (
        e.key === '/' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        !document.activeElement?.getAttribute('contenteditable')
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }

      // Escape cancels the current request (if loading)
      if (e.key === 'Escape' && isLoading) {
        e.preventDefault();
        cancelRequest();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isLoading, cancelRequest]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
    sendMessage(inputValue);
    setInputValue('');
  };

  const handleActionClick = async (action: any) => {
    const actionName = typeof action === 'string' ? action : action?.callback || action?.action || action?.type;
    const payload = typeof action === 'object' ? (action?.params ?? action?.data ?? action) : undefined;

    if (!actionName) return;

    // ---------------------------------------------------------------------------
    // Standard Copilot action contract (Option A)
    // ---------------------------------------------------------------------------
    // In-app navigation
    if (actionName === 'open_contact' && (payload?.contactId || payload?.id)) {
      navigate(`/crm/contacts/${String(payload.contactId || payload.id)}`);
      return;
    }

    if (actionName === 'open_deal' && (payload?.dealId || payload?.id)) {
      navigate(`/crm/deals/${String(payload.dealId || payload.id)}`);
      return;
    }

    if (actionName === 'open_meeting' && (payload?.meetingId || payload?.id)) {
      navigate(`/meetings?meeting=${encodeURIComponent(String(payload.meetingId || payload.id))}`);
      return;
    }

    if (actionName === 'open_task') {
      navigate('/tasks');
      return;
    }

    // Ops navigation
    if (actionName === 'open_dynamic_table' && (payload?.table_id || payload?.tableId)) {
      navigate(`/ops/${String(payload.table_id || payload.tableId)}`);
      return;
    }

    if (actionName === 'add_enrichment' && (payload?.table_id || payload?.tableId)) {
      navigate(`/ops/${String(payload.table_id || payload.tableId)}?action=enrich`);
      return;
    }

    if (actionName === 'push_to_instantly' && (payload?.table_id || payload?.tableId)) {
      navigate(`/ops/${String(payload.table_id || payload.tableId)}?action=push`);
      return;
    }

    if (actionName === 'open_ops_rules' && (payload?.table_id || payload?.tableId)) {
      navigate(`/ops/${String(payload.table_id || payload.tableId)}?action=rules`);
      return;
    }

    if (actionName === 'open_ops_ai_query' && (payload?.table_id || payload?.tableId)) {
      navigate(`/ops/${String(payload.table_id || payload.tableId)}?action=query`);
      return;
    }

    if (actionName === 'start_campaign' && (payload?.table_id || payload?.tableId)) {
      navigate(`/ops/${String(payload.table_id || payload.tableId)}?action=campaign`);
      return;
    }

    if (actionName === 'export_table_csv' && (payload?.table_id || payload?.tableId)) {
      navigate(`/ops/${String(payload.table_id || payload.tableId)}?action=export`);
      return;
    }

    // External navigation
    if (actionName === 'open_external_url' && payload?.url) {
      window.open(String(payload.url), '_blank');
      return;
    }

    // ---------------------------------------------------------------------------
    // Backwards-compatible aliases (older response components)
    // ---------------------------------------------------------------------------
    if (actionName === 'open_meeting_url' && payload?.url) {
      window.open(String(payload.url), '_blank');
      return;
    }

    if (actionName === 'view_meeting' && (payload?.meetingId || payload?.id)) {
      navigate(`/meetings?meeting=${encodeURIComponent(String(payload.meetingId || payload.id))}`);
      return;
    }

    if (actionName === 'view_task') {
      navigate('/tasks');
      return;
    }

    // Command Centre actions
    if (actionName === 'navigate' && payload?.path) {
      navigate(String(payload.path));
      return;
    }

    if (actionName === 'approve_deliverable' && payload?.taskId) {
      // Send confirmation message to copilot
      sendMessage(`Approve the deliverable for task ${String(payload.taskId)}`);
      return;
    }

    if (actionName === 'dismiss_deliverable' && payload?.taskId) {
      sendMessage(`Dismiss the deliverable for task ${String(payload.taskId)}`);
      return;
    }

    if (actionName === 'open_contact' && payload?.contactId) {
      navigate(`/crm/contacts/${payload.contactId}`);
      return;
    }

    if (actionName === 'open_deal' && payload?.dealId) {
      navigate(`/crm/deals/${payload.dealId}`);
      return;
    }

    if (actionName === 'open_meeting' && payload?.meetingId) {
      navigate(`/meetings?meeting=${encodeURIComponent(payload.meetingId)}`);
      return;
    }

    if (actionName === 'open_search_result' && payload?.id && payload?.type) {
      const t = String(payload.type);
      if (t === 'contact') {
        navigate(`/crm/contacts/${payload.id}`);
        return;
      }
      if (t === 'deal') {
        navigate(`/crm/deals/${payload.id}`);
        return;
      }
      if (t === 'task') {
        navigate('/tasks');
        return;
      }
      if (t === 'meeting') {
        navigate(`/meetings?meeting=${encodeURIComponent(payload.id)}`);
        return;
      }
      navigate('/crm');
      return;
    }

    // Quick Add launcher (prefilled)
    if (actionName === 'quickadd_task') {
      const initialData = {
        ...(payload?.contactId ? { contact_id: payload.contactId } : {}),
        ...(payload?.dealId ? { deal_id: payload.dealId } : {}),
        ...(payload?.meetingId ? { meeting_id: payload.meetingId } : {}),
      };

      if (onOpenQuickAdd) {
        onOpenQuickAdd({ preselectAction: 'task', initialData });
        return;
      }

      await emit('modal:opened', {
        type: 'quick-add',
        context: { preselectAction: 'task', initialData },
      });
      return;
    }

    // Send a new message to copilot (for interactive follow-up actions)
    if (actionName === 'send_message' && payload?.prompt) {
      sendMessage(String(payload.prompt));
      return;
    }

    // Meeting intelligence actions
    if (actionName === 'open_transcript' && (payload?.transcriptId || payload?.id)) {
      navigate(`/meeting-analytics?transcript=${encodeURIComponent(String(payload.transcriptId || payload.id))}`);
      return;
    }

    if (actionName === 'create_task_from_meeting' || actionName === 'create_task') {
      const context = payload?.meetingTitle
        ? `Create a task from this meeting: "${String(payload.meetingTitle)}"${payload?.description ? ` — ${String(payload.description)}` : ''}`
        : 'Create a task from this meeting action item';
      sendMessage(context);
      return;
    }

    if (actionName === 'draft_email_from_meeting' || actionName === 'draft_email') {
      const context = payload?.meetingTitle
        ? `Draft a follow-up email based on the meeting: "${String(payload.meetingTitle)}"${payload?.recipient ? ` to ${String(payload.recipient)}` : ''}`
        : 'Draft a follow-up email from this meeting';
      sendMessage(context);
      return;
    }

    // Email actions - handled in-component (EmailResponse)
    if (actionName === 'change_email_tone') return;
    if (actionName === 'shorten') return;
    if (actionName === 'add_calendar_link') return;
    if (actionName === 'copy_email') return;
    if (actionName === 'send_email') return;
    if (actionName === 'edit_in_gmail') return;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const shellClass = useMemo(() => {
    return mode === 'overlay' ? 'h-full' : 'h-full';
  }, [mode]);

  const quickActions = useMemo(() => {
    return [
      { id: 'task', icon: CheckSquare, label: 'Add Task', color: 'text-blue-400', bg: 'bg-blue-500/10' },
      { id: 'outbound', icon: PhoneCall, label: 'Add Outbound', color: 'text-sky-400', bg: 'bg-sky-500/10' },
      { id: 'meeting', icon: Users, label: 'Add Meeting', color: 'text-violet-400', bg: 'bg-violet-500/10' },
      { id: 'proposal', icon: FileText, label: 'Add Proposal', color: 'text-amber-400', bg: 'bg-amber-500/10' },
      { id: 'sale', icon: PoundSterling, label: 'Add Sale', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
      { id: 'roadmap', icon: Map, label: 'Add Roadmap', color: 'text-purple-400', bg: 'bg-purple-500/10' },
    ] as const;
  }, []);

  // Suggested prompts for overlay inline welcome
  const inlinePrompts = useMemo(() => [
    'Prep me for my next meeting',
    'Show me deals that need attention',
    'What should I prioritize today?',
  ], []);

  // Overlay mode uses inline chat-style welcome; page mode uses full CopilotEmpty
  const showInlineWelcome = mode === 'overlay' && isEmpty;
  const showFullWelcome = mode === 'page' && isEmpty;
  // In overlay mode, always show input (even when empty)
  // In page mode, show input always (UX-004: consistent input between empty and active states)
  const showInput = true;

  // ---------------------------------------------------------------------------
  // UX-004: Shared input renderer for both empty and active states
  // ---------------------------------------------------------------------------
  const renderInput = () => (
    <div className="flex-shrink-0 px-5 py-4 border-t border-gray-800/50 bg-gray-900/80 backdrop-blur-sm">
      <div className="flex items-end gap-3 bg-gray-800/60 border border-gray-700/40 rounded-xl px-4 py-3 focus-within:border-violet-500/50 focus-within:ring-2 focus-within:ring-violet-500/20 transition-all">
        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me to create, find, or prep anything..."
          rows={1}
          data-testid="copilot-input"
          className="flex-1 bg-transparent resize-none text-sm text-gray-100 placeholder-gray-500 focus:outline-none max-h-32"
          style={{ minHeight: '24px' }}
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={!inputValue.trim() || isLoading}
          className={cn(
            'p-2 rounded-lg transition-all',
            inputValue.trim() && !isLoading
              ? 'bg-violet-500 text-white hover:bg-violet-600'
              : 'text-gray-600 cursor-not-allowed',
          )}
          aria-label="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {isLoading && (
        <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
          Working...{' '}
          <button className="underline hover:text-gray-300 transition-colors" onClick={cancelRequest}>
            Cancel
          </button>
          <span className="text-gray-600">(Esc)</span>
        </div>
      )}
    </div>
  );

  return (
    <div className={cn('flex flex-col min-h-0', shellClass)}>
      {/* Full-page welcome (page mode only) -- UX-004: no input here, shared input below */}
      {showFullWelcome && (
        <CopilotEmpty onPromptClick={(prompt) => sendMessage(prompt)} />
      )}

      {/* Inline chat welcome (overlay mode, no messages) */}
      {showInlineWelcome && (
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {/* Assistant welcome bubble */}
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-gray-300">Copilot</span>
              </div>
              <div className="bg-gray-800/60 rounded-2xl rounded-tl-md px-4 py-3 text-sm text-gray-200 leading-relaxed">
                Hey! I&apos;m your Sales Assistant. Ask me to prep meetings, find deals, contacts or tasks, and create actions.
              </div>
            </div>
          </div>

          {/* Suggested prompts */}
          <div className="space-y-2 mt-2 pl-11">
            {inlinePrompts.map((prompt, index) => (
              <button
                key={prompt}
                type="button"
                onClick={() => sendMessage(prompt)}
                className="w-full text-left px-4 py-3 rounded-xl bg-gray-800/40 border border-gray-700/30 text-sm text-gray-300 hover:bg-gray-800/60 hover:border-gray-600/50 transition-all"
                style={{ animationDelay: `${0.3 + index * 0.1}s` }}
              >
                <span className="text-gray-500 mr-2">&rsaquo;</span>
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages area (has messages) */}
      {!isEmpty && (
        <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 relative">
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} onActionClick={handleActionClick} />
          ))}
          {autonomousMode.activeAgents.length > 0 && (
            <AgentWorkingIndicator agents={autonomousMode.activeAgents} />
          )}
          <div ref={endRef} />

          {/* UX-003: Scroll-to-bottom floating button */}
          <AnimatePresence>
            {showScrollButton && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2 }}
                onClick={scrollToBottom}
                className="sticky bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800/90 border border-gray-700/60 text-sm text-gray-300 hover:bg-gray-700/90 hover:text-white shadow-lg backdrop-blur-sm transition-colors"
                aria-label="Scroll to bottom"
              >
                <ArrowDown className="w-4 h-4" />
                New messages
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Quick action chips (separate section, overlay mode only) */}
      {showInput && mode === 'overlay' && (
        <div className="flex-shrink-0 px-5 py-3 border-t border-gray-800/50 bg-gray-900/50">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                disabled={isLoading}
                onClick={() => {
                  if (onOpenQuickAdd) {
                    onOpenQuickAdd({ preselectAction: action.id });
                    return;
                  }
                  emit('modal:opened', { type: 'quick-add', context: { preselectAction: action.id } });
                }}
                className={cn(
                  'flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-gray-800/60 border border-gray-700/40 rounded-lg text-xs font-medium text-gray-300 hover:bg-gray-700/60 hover:border-gray-600/60 transition-all whitespace-nowrap',
                  isLoading && 'opacity-60 cursor-not-allowed',
                )}
              >
                <action.icon className={cn('w-3.5 h-3.5', action.color)} />
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* UX-004: Unified input area -- always visible, identical styling in both empty and active states */}
      {showInput && renderInput()}
    </div>
  );
}
