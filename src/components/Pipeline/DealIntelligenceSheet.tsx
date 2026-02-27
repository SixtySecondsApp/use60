/**
 * DealIntelligenceSheet Component (PIPE-009)
 *
 * Right-side sheet panel showing deal intelligence with health scores,
 * risk signals, and quick actions. Premium glass-morphism design.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Brain,
  Edit,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
  Heart,
  Shield,
  Ghost,
  ChevronRight,
  ChevronLeft,
  X,
  DollarSign,
  Layers,
  Calendar,
  Timer,
  Send,
  StopCircle,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { CopilotResponse } from '@/components/copilot/CopilotResponse';
import type { PipelineDeal } from './hooks/usePipelineData';
import { DealRiskFactors } from './DealRiskFactors';
import { useDealCopilotChat } from './hooks/useDealCopilotChat';
import { useOrgStore } from '@/lib/stores/orgStore';
import { DealTemperatureSummary } from '@/components/signals/DealTemperatureSummary';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { useOrgMoney } from '@/lib/hooks/useOrgMoney';

interface DealIntelligenceSheetProps {
  dealId: string | null;
  deal: PipelineDeal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditDeal?: (deal: PipelineDeal) => void;
}

// =============================================================================
// Helpers
// =============================================================================


/**
 * Get a deterministic gradient for the company avatar
 */
function getAvatarGradient(name: string | null): string {
  const gradients = [
    'from-violet-600 to-violet-400',
    'from-blue-600 to-blue-400',
    'from-emerald-600 to-emerald-400',
    'from-amber-600 to-amber-400',
    'from-pink-600 to-pink-400',
    'from-cyan-600 to-cyan-400',
    'from-red-600 to-red-400',
    'from-indigo-600 to-indigo-400',
  ];
  if (!name) return gradients[0];
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

/**
 * Get health score color classes (text + bg)
 */
function getHealthColor(status: string | null): {
  text: string;
  bg: string;
  iconBg: string;
  border: string;
} {
  switch (status) {
    case 'healthy':
      return {
        text: 'text-emerald-600 dark:text-emerald-400',
        bg: 'bg-emerald-500/10',
        iconBg: 'bg-emerald-500/15 dark:bg-emerald-500/20',
        border: 'border-emerald-500/20',
      };
    case 'warning':
    case 'at_risk':
      return {
        text: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-500/10',
        iconBg: 'bg-amber-500/15 dark:bg-amber-500/20',
        border: 'border-amber-500/20',
      };
    case 'critical':
      return {
        text: 'text-red-600 dark:text-red-400',
        bg: 'bg-red-500/10',
        iconBg: 'bg-red-500/15 dark:bg-red-500/20',
        border: 'border-red-500/20',
      };
    case 'stalled':
    case 'ghost':
      return {
        text: 'text-gray-500 dark:text-gray-400',
        bg: 'bg-gray-500/10',
        iconBg: 'bg-gray-500/15 dark:bg-gray-500/20',
        border: 'border-gray-500/20',
      };
    default:
      return {
        text: 'text-gray-500 dark:text-gray-400',
        bg: 'bg-gray-500/10',
        iconBg: 'bg-gray-500/15 dark:bg-gray-500/20',
        border: 'border-gray-500/20',
      };
  }
}

/**
 * Get probability bar gradient
 */
function getProbabilityGradient(probability: number): string {
  if (probability >= 70) return 'from-emerald-500 to-emerald-400';
  if (probability >= 40) return 'from-amber-500 to-amber-400';
  return 'from-red-500 to-red-400';
}

/**
 * Get probability text color
 */
function getProbabilityColor(probability: number): string {
  if (probability >= 70) return 'text-emerald-600 dark:text-emerald-400';
  if (probability >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

/**
 * Capitalize first letter
 */
function capitalize(str: string | null): string {
  if (!str) return 'Unknown';
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
}

// =============================================================================
// Slash Commands
// =============================================================================

interface SlashCommand {
  command: string;
  label: string;
  prompt: string;
  /** If true, fills input instead of sending immediately (user adds text) */
  fillInput?: boolean;
}

const DEAL_SLASH_COMMANDS: SlashCommand[] = [
  { command: '/summary', label: 'Summarize deal', prompt: 'Give me a full summary of this deal' },
  { command: '/followup', label: 'Write follow-up', prompt: 'Draft a follow-up email for this deal' },
  { command: '/next', label: 'Next actions', prompt: 'What should I do next to advance this deal?' },
  { command: '/rescue', label: 'Rescue plan', prompt: 'This deal is at risk. Create a rescue plan.' },
  { command: '/chase', label: 'Re-engage', prompt: 'This deal has gone quiet. Help me re-engage.' },
  { command: '/prep', label: 'Meeting prep', prompt: 'Prep me for my next meeting on this deal' },
  { command: '/research', label: 'Research company', prompt: 'Research this company and give me key insights' },
  { command: '/proposal', label: 'Write proposal', prompt: 'Write a proposal for this deal' },
  { command: '/objection', label: 'Handle objection', prompt: 'Help me handle this objection: ', fillInput: true },
  { command: '/handoff', label: 'Handoff brief', prompt: 'Create a handoff brief for this deal' },
  { command: '/battlecard', label: 'Battlecard', prompt: 'Create a competitive battlecard for ', fillInput: true },
];

// =============================================================================
// Component
// =============================================================================

export function DealIntelligenceSheet({
  dealId: _dealId,
  deal,
  open,
  onOpenChange,
  onEditDeal,
}: DealIntelligenceSheetProps) {
  const dealChat = useDealCopilotChat(deal);
  const activeOrgId = useOrgStore((state) => state.activeOrgId);
  const { formatMoney: fmtMoney } = useOrgMoney();
  const formatCurrency = (value: number | null) => fmtMoney(value ?? 0);
  const [chatMode, setChatMode] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const chatEndRef = React.useRef<HTMLDivElement>(null);
  const chatInputRef = React.useRef<HTMLTextAreaElement>(null);

  // Filtered slash commands based on current input
  const filteredSlashCommands = useMemo(() => {
    if (!showSlashMenu) return [];
    const filter = chatInput.toLowerCase();
    if (filter === '/') return DEAL_SLASH_COMMANDS;
    return DEAL_SLASH_COMMANDS.filter(
      (cmd) => cmd.command.startsWith(filter) || cmd.label.toLowerCase().includes(filter.slice(1)),
    );
  }, [chatInput, showSlashMenu]);

  // Reset chat mode when sheet closes or deal changes
  useEffect(() => {
    if (!open) {
      setChatMode(false);
      dealChat.reset();
    }
  }, [open, _dealId, dealChat]);

  // Auto-scroll chat on new messages
  useEffect(() => {
    if (chatMode) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [dealChat.messages, dealChat.isLoading, chatMode]);

  // Focus input when entering chat mode
  useEffect(() => {
    if (chatMode) {
      setTimeout(() => chatInputRef.current?.focus(), 300);
    }
  }, [chatMode]);
  const [crmSyncStatus, setCrmSyncStatus] = useState<{
    hasHubSpot: boolean;
    hasAttio: boolean;
    lastSyncedAt: string | null;
    syncStatus: 'synced' | 'pending' | 'error' | 'none';
  }>({ hasHubSpot: false, hasAttio: false, lastSyncedAt: null, syncStatus: 'none' });
  const [isSyncing, setIsSyncing] = useState(false);

  // Fetch CRM integration status
  useEffect(() => {
    if (!activeOrgId || !open) return;

    async function fetchCRMStatus() {
      try {
        // Check for HubSpot integration
        const { data: hubspot } = await supabase
          .from('hubspot_org_integrations')
          .select('id, clerk_org_id')
          .eq('clerk_org_id', activeOrgId)
          .eq('is_active', true)
          .maybeSingle();

        // Check for Attio integration
        const { data: attio } = await supabase
          .from('attio_org_integrations')
          .select('id, clerk_org_id')
          .eq('clerk_org_id', activeOrgId)
          .eq('is_active', true)
          .maybeSingle();

        const hasHubSpot = !!hubspot;
        const hasAttio = !!attio;

        // Get last sync timestamp from deal_health_scores
        if (deal && (hasHubSpot || hasAttio)) {
          const { data: healthScore } = await supabase
            .from('deal_health_scores')
            .select('updated_at')
            .eq('deal_id', deal.id)
            .maybeSingle();

          setCrmSyncStatus({
            hasHubSpot,
            hasAttio,
            lastSyncedAt: healthScore?.updated_at || null,
            syncStatus: healthScore?.updated_at ? 'synced' : 'none',
          });
        } else {
          setCrmSyncStatus({
            hasHubSpot,
            hasAttio,
            lastSyncedAt: null,
            syncStatus: 'none',
          });
        }
      } catch (error) {
        console.error('Error fetching CRM status:', error);
      }
    }

    fetchCRMStatus();
  }, [activeOrgId, deal, open]);

  // Handle retry sync
  const handleRetrySync = async () => {
    if (!deal || !activeOrgId) return;

    setIsSyncing(true);
    try {
      // Trigger health recalculation which will trigger CRM sync
      const { error } = await supabase
        .from('health_recalc_queue')
        .insert({
          deal_id: deal.id,
          trigger_type: 'manual_crm_sync',
          trigger_source: 'pipeline_ui',
        });

      if (error) throw error;

      toast.success('CRM sync triggered. Health scores will be pushed to CRM shortly.');

      // Update status to pending
      setCrmSyncStatus((prev) => ({ ...prev, syncStatus: 'pending' }));
    } catch (error) {
      console.error('Error triggering CRM sync:', error);
      toast.error('Failed to trigger CRM sync');
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle "Ask Copilot" button click — switch to inline chat mode
  const handleAskCopilot = useCallback(() => {
    if (!deal) return;
    dealChat.activate();
    setChatMode(true);
  }, [deal, dealChat]);

  // Handle selecting a slash command
  const handleSlashSelect = useCallback(
    (cmd: SlashCommand) => {
      setShowSlashMenu(false);
      setSlashSelectedIndex(0);
      if (cmd.fillInput) {
        setChatInput(cmd.prompt);
        setTimeout(() => chatInputRef.current?.focus(), 0);
      } else {
        setChatInput('');
        dealChat.sendMessage(cmd.prompt);
      }
    },
    [dealChat],
  );

  // Handle sending a chat message
  const handleChatSend = useCallback(() => {
    if (!chatInput.trim() || dealChat.isLoading) return;
    setShowSlashMenu(false);
    dealChat.sendMessage(chatInput);
    setChatInput('');
  }, [chatInput, dealChat]);

  // Handle chat input changes — detect slash commands
  const handleChatInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setChatInput(val);
    if (val.startsWith('/') && val.length <= 20) {
      setShowSlashMenu(true);
      setSlashSelectedIndex(0);
    } else {
      setShowSlashMenu(false);
    }
  }, []);

  const handleChatKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showSlashMenu && filteredSlashCommands.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSlashSelectedIndex((prev) => Math.min(prev + 1, filteredSlashCommands.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSlashSelectedIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          handleSlashSelect(filteredSlashCommands[slashSelectedIndex]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowSlashMenu(false);
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleChatSend();
      }
    },
    [handleChatSend, showSlashMenu, filteredSlashCommands, slashSelectedIndex, handleSlashSelect],
  );

  if (!deal) {
    return null;
  }

  const companyInitial = (deal.company || deal.name || '?').charAt(0).toUpperCase();
  const winProbability = deal.predicted_close_probability ?? deal.probability;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        hideClose
        className="!top-16 !h-[calc(100vh-4rem)] w-full md:w-[500px] md:max-w-[600px] p-0 border-l border-gray-200/80 dark:border-white/[0.06] bg-white/80 dark:bg-white/[0.03] backdrop-blur-xl overflow-hidden"
      >
        {/* ============================================================= */}
        {/* CHAT MODE                                                      */}
        {/* ============================================================= */}
        {chatMode ? (
          <div className="h-full flex flex-col bg-gray-900">
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-800/50 bg-gray-900/80 backdrop-blur-sm flex-shrink-0">
              <button
                type="button"
                onClick={() => setChatMode(false)}
                className="p-1.5 -ml-1 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md shadow-violet-500/20">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-100 leading-tight truncate">
                  {deal.company || deal.name}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] text-gray-400">Deal Copilot</span>
                </div>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chat messages */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              {dealChat.messages.map((m) =>
                m.role === 'assistant' ? (
                  <div key={m.id} className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-lg overflow-hidden bg-gray-800 border border-gray-700 flex items-center justify-center mt-0.5">
                      <img src="/favicon_0_64x64.png" alt="60" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="bg-gray-800/60 rounded-2xl rounded-tl-md px-4 py-3 text-sm text-gray-300 leading-relaxed prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-headings:text-gray-200 prose-strong:text-gray-200">
                        {m.isStreaming && !m.content ? (
                          <span className="inline-flex gap-1 items-center text-gray-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse [animation-delay:150ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse [animation-delay:300ms]" />
                          </span>
                        ) : m.structuredResponse ? (
                          <CopilotResponse response={m.structuredResponse} />
                        ) : (
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        )}
                      </div>
                    </div>
                  </div>
                ) : m.role === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] bg-blue-500/10 border border-blue-500/20 rounded-2xl rounded-tr-md px-4 py-3 text-sm text-gray-100">
                      {m.content}
                    </div>
                  </div>
                ) : null,
              )}
              {dealChat.isLoading && dealChat.messages.at(-1)?.role !== 'assistant' && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-lg overflow-hidden bg-gray-800 border border-gray-700 flex items-center justify-center">
                    <img src="/favicon_0_64x64.png" alt="60" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="bg-gray-800/60 rounded-2xl rounded-tl-md px-4 py-3">
                      <span className="inline-flex gap-1 items-center text-gray-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse [animation-delay:300ms]" />
                      </span>
                    </div>
                  </div>
                </div>
              )}
              {/* Suggestion chips — shown when only the greeting is visible */}
              {dealChat.messages.length <= 1 && !dealChat.isLoading && (
                <div className="flex flex-wrap gap-1.5 px-1">
                  {dealChat.suggestions.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => dealChat.sendMessage(s.prompt)}
                      className="px-3 py-1.5 rounded-full text-[12px] font-medium bg-gray-800/60 border border-gray-700/40 text-gray-400 hover:text-gray-200 hover:bg-gray-800 hover:border-gray-600/50 transition-all"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat input */}
            <div className="flex-shrink-0 px-4 py-3 border-t border-gray-800/50 bg-gray-900/80 backdrop-blur-sm">
              <div className="relative">
                {/* Slash command dropdown */}
                {showSlashMenu && filteredSlashCommands.length > 0 && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden z-10 max-h-64 overflow-y-auto">
                    {filteredSlashCommands.map((cmd, i) => (
                      <button
                        key={cmd.command}
                        type="button"
                        onClick={() => handleSlashSelect(cmd)}
                        onMouseEnter={() => setSlashSelectedIndex(i)}
                        className={`w-full text-left px-3 py-2 flex items-center gap-3 text-sm transition-colors ${
                          i === slashSelectedIndex
                            ? 'bg-violet-500/20 text-gray-100'
                            : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
                        }`}
                      >
                        <span className="font-mono text-[11px] text-violet-400 min-w-[80px]">{cmd.command}</span>
                        <span className="truncate">{cmd.label}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2 bg-gray-800/60 border border-gray-700/40 rounded-xl px-3 py-2.5 focus-within:border-violet-500/50 focus-within:ring-2 focus-within:ring-violet-500/20 transition-all">
                <textarea
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={handleChatInputChange}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Ask about this deal... (type / for commands)"
                  rows={1}
                  className="flex-1 bg-transparent resize-none text-sm text-gray-100 placeholder-gray-500 focus:outline-none max-h-24"
                  style={{ minHeight: '22px' }}
                />
                <button
                  type="button"
                  onClick={handleChatSend}
                  disabled={!chatInput.trim() || dealChat.isLoading}
                  className={`p-1.5 rounded-lg transition-all ${
                    chatInput.trim() && !dealChat.isLoading
                      ? 'bg-violet-500 text-white hover:bg-violet-600'
                      : 'text-gray-600 cursor-not-allowed'
                  }`}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              </div>
              {dealChat.isLoading && (
                <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
                  Working...{' '}
                  <button className="underline hover:text-gray-300 transition-colors flex items-center gap-1" onClick={dealChat.stopGeneration}>
                    <StopCircle className="w-3 h-3" />
                    Stop
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
        /* ============================================================= */
        /* DEAL INFO MODE (default)                                       */
        /* ============================================================= */
        <div className="h-full flex flex-col">
          <div className="flex-1 overflow-y-auto">
            {/* ---------------------------------------------------------------- */}
            {/* Header                                                           */}
            {/* ---------------------------------------------------------------- */}
            <SheetHeader className="p-5 pb-4">
              <div className="flex items-start gap-3.5">
                {/* Company Avatar */}
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatarGradient(deal.company)} flex items-center justify-center flex-shrink-0 shadow-sm`}
                >
                  <span className="text-[15px] font-bold text-white leading-none">
                    {companyInitial}
                  </span>
                </div>

                {/* Company + Deal Name */}
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-[17px] font-bold text-gray-900 dark:text-white leading-tight">
                    {deal.company || 'Unknown Company'}
                  </SheetTitle>
                  <p className="text-[13px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                    {deal.name}
                  </p>
                </div>

                {/* Close button */}
                <button
                  onClick={() => onOpenChange(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </SheetHeader>

            <div className="px-5 pb-5 space-y-5">
              {/* ---------------------------------------------------------------- */}
              {/* Stat Grid (2x2)                                                  */}
              {/* ---------------------------------------------------------------- */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* Deal Value */}
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06]">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                    <span className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      Value
                    </span>
                  </div>
                  <p className="text-[17px] font-bold text-gray-900 dark:text-white leading-tight">
                    {formatCurrency(deal.value)}
                  </p>
                </div>

                {/* Stage */}
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06]">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Layers className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                    <span className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      Stage
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {deal.stage_color && (
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: deal.stage_color }}
                      />
                    )}
                    <span className="text-[13px] font-semibold text-gray-900 dark:text-white truncate">
                      {deal.stage_name || 'Unknown'}
                    </span>
                  </div>
                </div>

                {/* Close Date */}
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06]">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                    <span className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      Close Date
                    </span>
                  </div>
                  <p className="text-[13px] font-semibold text-gray-900 dark:text-white">
                    {deal.close_date
                      ? format(new Date(deal.close_date), 'MMM d, yyyy')
                      : 'Not set'}
                  </p>
                </div>

                {/* Days in Stage */}
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06]">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Timer className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                    <span className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      Days in Stage
                    </span>
                  </div>
                  <p className="text-[17px] font-bold text-gray-900 dark:text-white leading-tight">
                    {deal.days_in_current_stage !== null ? deal.days_in_current_stage : '--'}
                  </p>
                </div>
              </div>

              {/* ---------------------------------------------------------------- */}
              {/* Win Probability                                                   */}
              {/* ---------------------------------------------------------------- */}
              {winProbability !== null && (
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06]">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-gray-200 dark:after:bg-white/[0.06]">
                      Win Probability
                    </span>
                    <span className={`text-[15px] font-bold ${getProbabilityColor(winProbability)} ml-3`}>
                      {winProbability}%
                    </span>
                  </div>
                  <div className="h-[7px] rounded-full bg-gray-100 dark:bg-white/[0.03] overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${getProbabilityGradient(winProbability)} transition-all duration-500 ease-out`}
                      style={{ width: `${Math.min(winProbability, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* ---------------------------------------------------------------- */}
              {/* Copilot CTA                                                       */}
              {/* ---------------------------------------------------------------- */}
              <button
                onClick={handleAskCopilot}
                className="w-full bg-gradient-to-r from-violet-500/[0.06] to-blue-500/[0.06] border border-violet-500/[0.12] rounded-xl p-3.5 flex items-center gap-3 group hover:from-violet-500/[0.10] hover:to-blue-500/[0.10] hover:border-violet-500/[0.20] transition-all duration-200 text-left"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Brain className="w-4.5 h-4.5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 dark:text-white leading-tight">
                    Ask Copilot about this deal
                  </p>
                  <p className="text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5">
                    Get AI-powered insights, next steps & risk analysis
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-colors flex-shrink-0" />
              </button>

              {/* ---------------------------------------------------------------- */}
              {/* Health Overview                                                   */}
              {/* ---------------------------------------------------------------- */}
              <div>
                <h3 className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2 mb-3 after:content-[''] after:flex-1 after:h-px after:bg-gray-200 dark:after:bg-white/[0.06]">
                  Health Overview
                </h3>
                <div className="space-y-2">
                  {/* Deal Health */}
                  {(() => {
                    const colors = getHealthColor(deal.health_status);
                    return (
                      <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06]">
                        <div className={`w-8 h-8 rounded-full ${colors.iconBg} flex items-center justify-center flex-shrink-0`}>
                          <Heart className={`w-4 h-4 ${colors.text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-gray-500 dark:text-gray-400 leading-tight">
                            Deal Health
                          </p>
                          <p className="text-[13px] font-semibold text-gray-900 dark:text-white leading-tight mt-0.5">
                            {capitalize(deal.health_status)}
                          </p>
                        </div>
                        <span className={`text-[20px] font-bold ${colors.text} tabular-nums`}>
                          {deal.health_score !== null ? deal.health_score : '--'}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Relationship Health */}
                  {(() => {
                    const colors = getHealthColor(deal.relationship_health_status);
                    return (
                      <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06]">
                        <div className={`w-8 h-8 rounded-full ${colors.iconBg} flex items-center justify-center flex-shrink-0`}>
                          <Shield className={`w-4 h-4 ${colors.text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-gray-500 dark:text-gray-400 leading-tight">
                            Relationship Health
                          </p>
                          <p className="text-[13px] font-semibold text-gray-900 dark:text-white leading-tight mt-0.5">
                            {capitalize(deal.relationship_health_status)}
                          </p>
                        </div>
                        <span className={`text-[20px] font-bold ${colors.text} tabular-nums`}>
                          {deal.relationship_health_score !== null ? deal.relationship_health_score : '--'}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Ghost Risk */}
                  {deal.ghost_probability !== null && deal.ghost_probability > 0 && (() => {
                    const ghostStatus = deal.ghost_probability > 50 ? 'critical' : 'warning';
                    const colors = getHealthColor(ghostStatus);
                    return (
                      <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06]">
                        <div className={`w-8 h-8 rounded-full ${colors.iconBg} flex items-center justify-center flex-shrink-0`}>
                          <Ghost className={`w-4 h-4 ${colors.text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-gray-500 dark:text-gray-400 leading-tight">
                            Ghost Risk
                          </p>
                          <p className="text-[13px] font-semibold text-gray-900 dark:text-white leading-tight mt-0.5">
                            {deal.ghost_probability > 70 ? 'High' : deal.ghost_probability > 40 ? 'Medium' : 'Low'}
                          </p>
                        </div>
                        <span className={`text-[20px] font-bold ${colors.text} tabular-nums`}>
                          {deal.ghost_probability}%
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* ---------------------------------------------------------------- */}
              {/* Deal Temperature                                                  */}
              {/* ---------------------------------------------------------------- */}
              {activeOrgId && (
                <div>
                  <h3 className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2 mb-3 after:content-[''] after:flex-1 after:h-px after:bg-gray-200 dark:after:bg-white/[0.06]">
                    Signal Temperature
                  </h3>
                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06]">
                    <DealTemperatureSummary dealId={deal.id} orgId={activeOrgId} />
                  </div>
                </div>
              )}

              {/* ---------------------------------------------------------------- */}
              {/* Risk Signals                                                      */}
              {/* ---------------------------------------------------------------- */}
              {((deal.risk_factors && deal.risk_factors.length > 0) ||
                (deal.relationship_risk_factors && deal.relationship_risk_factors.length > 0)) && (
                <div>
                  <h3 className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2 mb-3 after:content-[''] after:flex-1 after:h-px after:bg-gray-200 dark:after:bg-white/[0.06]">
                    Risk Signals
                  </h3>
                  <DealRiskFactors
                    riskFactors={deal.risk_factors || []}
                    relationshipRiskFactors={deal.relationship_risk_factors || []}
                    riskLevel={deal.risk_level}
                  />
                </div>
              )}

              {/* ---------------------------------------------------------------- */}
              {/* Next Actions                                                      */}
              {/* ---------------------------------------------------------------- */}
              {deal.pending_actions_count > 0 && (
                <div>
                  <h3 className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2 mb-3 after:content-[''] after:flex-1 after:h-px after:bg-gray-200 dark:after:bg-white/[0.06]">
                    Next Actions ({deal.pending_actions_count})
                  </h3>
                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06]">
                    <p className="text-[13px] text-gray-600 dark:text-gray-400">
                      {deal.pending_actions_count} pending action{deal.pending_actions_count !== 1 ? 's' : ''}
                      {deal.high_urgency_actions_count > 0 && (
                        <span className="text-red-600 dark:text-red-400 font-medium">
                          {' '}({deal.high_urgency_actions_count} high urgency)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* ---------------------------------------------------------------- */}
              {/* CRM Sync Status                                                   */}
              {/* ---------------------------------------------------------------- */}
              {(crmSyncStatus.hasHubSpot || crmSyncStatus.hasAttio) && (
                <div>
                  <h3 className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2 mb-3 after:content-[''] after:flex-1 after:h-px after:bg-gray-200 dark:after:bg-white/[0.06]">
                    CRM Sync
                  </h3>
                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06] space-y-2.5">
                    {/* Connected CRMs */}
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-gray-500 dark:text-gray-400">Connected CRMs</span>
                      <div className="flex items-center gap-1.5">
                        {crmSyncStatus.hasHubSpot && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-white/[0.06]">
                            HubSpot
                          </Badge>
                        )}
                        {crmSyncStatus.hasAttio && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-white/[0.06]">
                            Attio
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Sync Status */}
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-gray-500 dark:text-gray-400">Status</span>
                      <div className="flex items-center gap-1.5">
                        {crmSyncStatus.syncStatus === 'synced' && (
                          <>
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">Synced</span>
                          </>
                        )}
                        {crmSyncStatus.syncStatus === 'pending' && (
                          <>
                            <Clock className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-amber-600 dark:text-amber-400 text-[11px] font-medium">Pending</span>
                          </>
                        )}
                        {crmSyncStatus.syncStatus === 'error' && (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-red-500" />
                            <span className="text-red-600 dark:text-red-400 text-[11px] font-medium">Error</span>
                          </>
                        )}
                        {crmSyncStatus.syncStatus === 'none' && (
                          <span className="text-gray-500 dark:text-gray-500 text-[11px]">Not synced</span>
                        )}
                      </div>
                    </div>

                    {/* Last Synced */}
                    {crmSyncStatus.lastSyncedAt && (
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-gray-500 dark:text-gray-400">Last synced</span>
                        <span className="text-gray-900 dark:text-white text-[11px] font-medium">
                          {formatDistanceToNow(new Date(crmSyncStatus.lastSyncedAt), { addSuffix: true })}
                        </span>
                      </div>
                    )}

                    {/* Retry Button */}
                    {(crmSyncStatus.syncStatus === 'error' || crmSyncStatus.syncStatus === 'none') && (
                      <Button
                        className="w-full justify-center mt-1"
                        variant="outline"
                        size="sm"
                        onClick={handleRetrySync}
                        disabled={isSyncing}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Syncing...' : 'Retry Sync'}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Bottom spacer for sticky footer */}
              <div className="h-20" />
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Quick Actions - Sticky Footer                                     */}
          {/* ---------------------------------------------------------------- */}
          <div className="flex-shrink-0 border-t border-gray-200/80 dark:border-white/[0.06] bg-white/80 dark:bg-white/[0.03] backdrop-blur-xl p-4">
            <div className="flex items-center gap-2.5">
              <Button
                onClick={handleAskCopilot}
                className="flex-1 bg-gradient-to-r from-blue-500/20 to-violet-500/20 border border-blue-500/25 hover:from-blue-500/30 hover:to-violet-500/30 hover:border-blue-500/35 text-gray-900 dark:text-white font-semibold text-[13px] h-10 rounded-xl transition-all duration-200"
                variant="ghost"
              >
                <Brain className="w-4 h-4 mr-1.5" />
                Ask Copilot
              </Button>
              <Button
                variant="ghost"
                className="flex-1 border border-gray-200/80 dark:border-white/[0.06] hover:bg-gray-50 dark:hover:bg-white/[0.04] text-gray-700 dark:text-gray-300 font-semibold text-[13px] h-10 rounded-xl transition-all duration-200"
                onClick={() => {
                  if (deal && onEditDeal) {
                    onEditDeal(deal);
                    onOpenChange(false);
                  }
                }}
              >
                <Edit className="w-4 h-4 mr-1.5" />
                Edit Deal
              </Button>
            </div>
          </div>
        </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
