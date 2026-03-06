/**
 * SandboxPipeline
 *
 * Pixel-perfect replica of the real 60 Pipeline kanban board.
 * Rich deal cards with health bars, risk tags, stage colors from STAGE_META.
 * Clicking a deal opens a slide-over detail panel with "Ask Copilot" CTA.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  LayoutGrid,
  Table2,
  GitBranch,
  BarChart3,
  Plus,
  Filter,
  SortAsc,
  ArrowRight,
  X,
  Bot,
  Calendar,
  User,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Send,
  Loader2,
} from 'lucide-react';
import { useSandboxData } from '../data/SandboxDataProvider';
import type { SandboxDeal, DealStage } from '../data/sandboxTypes';
import { STAGE_META, getLogoDevUrl } from '../data/sandboxTypes';

const VISIBLE_STAGES: DealStage[] = ['lead', 'qualified', 'proposal', 'negotiation', 'closed_won'];

// ── Deal Card ────────────────────────────────────────────────

function DealCard({ deal, index, onClick }: { deal: SandboxDeal; index: number; onClick: () => void }) {
  const healthGradient =
    deal.health_status === 'healthy' ? 'bg-gradient-to-r from-emerald-500 to-emerald-400/40'
    : deal.health_status === 'warning' ? 'bg-gradient-to-r from-amber-500 to-amber-400/40'
    : deal.health_status === 'critical' ? 'bg-gradient-to-r from-red-500 to-red-400/40'
    : 'bg-gray-400/25';

  const daysColor =
    deal.days_in_stage >= 14 ? 'text-red-400'
    : deal.days_in_stage >= 7 ? 'text-amber-400'
    : 'text-gray-400';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      className={`
        relative overflow-hidden rounded-xl cursor-pointer
        bg-gray-900/40 backdrop-blur-xl border
        hover:bg-gray-900/50 hover:border-gray-600/40
        hover:-translate-y-0.5 hover:shadow-[0_8px_25px_rgba(0,0,0,0.25)]
        transition-all duration-200
        ${
          deal.isVisitorDeal
            ? 'border-[#37bd7e]/40 shadow-lg shadow-[#37bd7e]/10'
            : 'border-gray-700/30'
        }
      `}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-gray-800/10 to-transparent pointer-events-none" />

      {deal.isVisitorDeal && (
        <div className="relative z-[1] px-3 pt-2.5">
          <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-[#37bd7e]/15 text-[#37bd7e] uppercase tracking-wider">
            Top deal
          </span>
        </div>
      )}

      <div className="relative z-[1] p-3 pb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {deal.company_domain ? (
            <img
              src={getLogoDevUrl(deal.company_domain, 64)}
              alt={deal.company_name}
              className="w-[34px] h-[34px] rounded-lg flex-shrink-0 object-cover shadow-sm bg-gray-800"
              onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
            />
          ) : null}
          <div className={`w-[34px] h-[34px] rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 shadow-[0_2px_8px_rgba(0,0,0,0.2)] flex items-center justify-center flex-shrink-0 ${deal.company_domain ? 'hidden' : ''}`}>
            <span className="text-[13px] font-bold text-white">
              {deal.company_name.charAt(0)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-gray-100 truncate leading-tight">{deal.company_name}</p>
            <p className="text-[11.5px] text-gray-500 truncate mt-0.5">{deal.name}</p>
          </div>
        </div>
        <span className="text-[13.5px] font-bold text-gray-100 flex-shrink-0 tracking-tight">
          ${(deal.value / 1000).toFixed(0)}K
        </span>
      </div>

      <div className="relative z-[1] mx-3 mb-2">
        <div className="w-full h-[2.5px] bg-gray-800/50 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${healthGradient}`}
            style={{ width: `${deal.health_score}%` }}
          />
        </div>
      </div>

      <div className="relative z-[1] px-3 pb-2 flex flex-wrap gap-1">
        {(deal.risk_level === 'high' || deal.risk_level === 'critical') && (
          <span className="text-[10px] font-semibold px-[7px] py-[2.5px] rounded-[5px] border bg-red-500/10 text-red-400 border-red-500/10">
            At Risk
          </span>
        )}
        {deal.value >= 100000 && (
          <span className="text-[10px] font-semibold px-[7px] py-[2.5px] rounded-[5px] border bg-amber-500/10 text-amber-400 border-amber-500/10">
            High Value
          </span>
        )}
        {deal.next_actions && deal.next_actions.length > 0 && (
          <span className="text-[10px] font-semibold px-[7px] py-[2.5px] rounded-[5px] border bg-blue-500/10 text-blue-400 border-blue-500/10">
            {deal.next_actions.length} Actions
          </span>
        )}
        {deal.contact_count && deal.contact_count > 1 && (
          <span className="text-[10px] font-semibold px-[7px] py-[2.5px] rounded-[5px] border bg-violet-500/10 text-violet-400 border-violet-500/10">
            {deal.contact_count} Stakeholders
          </span>
        )}
      </div>

      <div className="relative z-[1] px-3 pb-3 flex items-center justify-between">
        <div className={`flex items-center gap-1 text-[11px] ${daysColor}`}>
          <Clock className="w-3 h-3" />
          {deal.days_in_stage}d in stage
        </div>
        <div className="w-[22px] h-[22px] rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-[9px] font-bold text-white">
          {deal.owner_initials}
        </div>
      </div>
    </motion.div>
  );
}

// ── Stage Column ─────────────────────────────────────────────

function StageColumn({
  stage,
  deals,
  stageIndex,
  onDealClick,
}: {
  stage: DealStage;
  deals: SandboxDeal[];
  stageIndex: number;
  onDealClick: (deal: SandboxDeal) => void;
}) {
  const meta = STAGE_META[stage];
  const totalValue = deals.reduce((sum, d) => sum + d.value, 0);
  const avgProb = deals.length > 0
    ? Math.round(deals.reduce((sum, d) => sum + d.probability, 0) / deals.length)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: stageIndex * 0.06, duration: 0.4 }}
      className="flex-1 min-w-[300px] rounded-2xl bg-gray-900/40 backdrop-blur-xl border border-gray-700/30"
    >
      <div className="h-[2.5px] rounded-t-2xl" style={{ background: `linear-gradient(90deg, ${meta.color}, ${meta.color}80)` }} />

      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-200">{meta.label}</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-800/50 text-gray-400">
              {deals.length}
            </span>
          </div>
          {totalValue > 0 && (
            <div className="text-right">
              <span className="text-xs text-gray-400 font-mono">
                ${(totalValue / 1000).toFixed(0)}K
              </span>
              {avgProb > 0 && (
                <span className="text-[10px] text-gray-600 ml-1">· {avgProb}%</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-3 pb-3 space-y-2.5">
        {deals.map((deal, i) => (
          <DealCard key={deal.id} deal={deal} index={stageIndex * 3 + i} onClick={() => onDealClick(deal)} />
        ))}
        {deals.length === 0 && (
          <div className="h-24 rounded-xl border border-dashed border-gray-700/30 flex items-center justify-center">
            <span className="text-xs text-gray-600">No deals</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Deal Detail Panel ────────────────────────────────────────

const HEALTH_CONFIG = {
  healthy: { label: 'Healthy', color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle2 },
  warning: { label: 'Warning', color: 'text-amber-400', bg: 'bg-amber-500/10', icon: AlertTriangle },
  critical: { label: 'Critical', color: 'text-red-400', bg: 'bg-red-500/10', icon: AlertTriangle },
  stalled: { label: 'Stalled', color: 'text-gray-400', bg: 'bg-gray-500/10', icon: Clock },
};

function DealDetailPanel({
  deal,
  onClose,
  onAskCopilot,
}: {
  deal: SandboxDeal;
  onClose: () => void;
  onAskCopilot: (deal: SandboxDeal) => void;
}) {
  const stageMeta = STAGE_META[deal.stage];
  const healthCfg = HEALTH_CONFIG[deal.health_status];
  const HealthIcon = healthCfg.icon;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="fixed top-16 right-0 bottom-0 z-[61] w-full max-w-md bg-gray-950/95 backdrop-blur-xl border-l border-gray-800/50 overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-950/90 backdrop-blur-lg border-b border-gray-800/50 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              {deal.company_domain ? (
                <img
                  src={getLogoDevUrl(deal.company_domain, 64)}
                  alt=""
                  className="w-10 h-10 rounded-xl object-contain bg-white/[0.06] p-1"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
                  <span className="text-sm font-bold text-white">{deal.company_name.charAt(0)}</span>
                </div>
              )}
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-white truncate">{deal.company_name}</h3>
                <p className="text-xs text-gray-500 truncate">{deal.name}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.05] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Value + Stage */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-900/60 border border-gray-800/40 p-4">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Deal Value</p>
              <p className="text-2xl font-bold text-white tracking-tight">${(deal.value / 1000).toFixed(0)}K</p>
            </div>
            <div className="rounded-xl bg-gray-900/60 border border-gray-800/40 p-4">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Stage</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stageMeta.color }} />
                <span className="text-sm font-medium text-white">{stageMeta.label}</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">{deal.probability}% probability</p>
            </div>
          </div>

          {/* Health Score */}
          <div className="rounded-xl bg-gray-900/60 border border-gray-800/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Deal Health</p>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${healthCfg.color}`}>
                <HealthIcon className="w-3.5 h-3.5" />
                {healthCfg.label}
              </div>
            </div>
            <div className="h-2 bg-gray-800/60 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  deal.health_status === 'healthy' ? 'bg-emerald-500'
                  : deal.health_status === 'warning' ? 'bg-amber-500'
                  : deal.health_status === 'critical' ? 'bg-red-500'
                  : 'bg-gray-500'
                }`}
                style={{ width: `${deal.health_score}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">{deal.health_score}/100</p>
          </div>

          {/* Key Details */}
          <div className="rounded-xl bg-gray-900/60 border border-gray-800/40 p-4 space-y-3">
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">Details</p>

            {deal.primary_contact_name && (
              <div className="flex items-center gap-2.5 text-sm">
                <User className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-gray-300">{deal.primary_contact_name}</span>
              </div>
            )}
            <div className="flex items-center gap-2.5 text-sm">
              <Building2 className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-300">{deal.company_name}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <Clock className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-300">{deal.days_in_stage} days in current stage</span>
            </div>
            {deal.expected_close_date && (
              <div className="flex items-center gap-2.5 text-sm">
                <Calendar className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-gray-300">Expected close: {new Date(deal.expected_close_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
            )}
          </div>

          {/* Risk Factors */}
          {deal.risk_factors && deal.risk_factors.length > 0 && (
            <div className="rounded-xl bg-red-500/5 border border-red-500/15 p-4 space-y-2">
              <p className="text-[11px] text-red-400 uppercase tracking-wider font-medium">Risk Signals</p>
              {deal.risk_factors.map((risk, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-300">{risk}</span>
                </div>
              ))}
            </div>
          )}

          {/* Next Steps */}
          {deal.next_actions && deal.next_actions.length > 0 && (
            <div className="rounded-xl bg-gray-900/60 border border-gray-800/40 p-4 space-y-2">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Next Steps</p>
              {deal.next_actions.map((action, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <ArrowRight className="w-3.5 h-3.5 text-[#37bd7e] mt-0.5 flex-shrink-0" />
                  <span className="text-gray-300">{action}</span>
                </div>
              ))}
            </div>
          )}

          {/* Ask Copilot CTA */}
          <button
            onClick={() => onAskCopilot(deal)}
            className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-semibold transition-all duration-200 shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30"
          >
            <Bot className="w-4 h-4" />
            Ask Copilot about this deal
          </button>

          {deal.next_steps && (
            <div className="rounded-xl bg-gray-900/60 border border-gray-800/40 p-4">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">AI Summary</p>
              <p className="text-sm text-gray-300 leading-relaxed">{deal.next_steps}</p>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ── Copilot Chat Panel ───────────────────────────────────────

function CopilotDealChat({
  deal,
  onClose,
  onBack,
}: {
  deal: SandboxDeal;
  onClose: () => void;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasAutoPlayed = useRef(false);

  // Auto-play initial analysis on mount
  useEffect(() => {
    if (hasAutoPlayed.current) return;
    hasAutoPlayed.current = true;

    const userMsg = `Analyze the ${deal.company_name} deal and tell me what I should focus on.`;
    setMessages([{ role: 'user', text: userMsg }]);
    setIsTyping(true);

    const healthLabel = deal.health_status === 'healthy' ? 'healthy' : deal.health_status === 'warning' ? 'showing some warning signs' : 'at risk';
    const riskLine = deal.risk_factors?.length
      ? `\n\n**Risk signals:** ${deal.risk_factors.join('; ')}.`
      : '';
    const actionsLine = deal.next_actions?.length
      ? `\n\n**Recommended next steps:**\n${deal.next_actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`
      : '';

    const response = `Here's my analysis of the **${deal.company_name}** deal:\n\nThe deal is worth **$${(deal.value / 1000).toFixed(0)}K** and is currently in the **${STAGE_META[deal.stage].label}** stage with a **${deal.probability}%** close probability. Health score is **${deal.health_score}/100** — the deal is ${healthLabel}.${riskLine}${actionsLine}\n\n${deal.days_in_stage >= 14 ? `This deal has been in stage for **${deal.days_in_stage} days** which is above average. I'd recommend taking action soon to keep momentum.` : `The deal has been in stage for ${deal.days_in_stage} days — still within healthy range.`}`;

    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'assistant', text: response }]);
      setIsTyping(false);
    }, 1800);
  }, [deal]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  const QUICK_QUESTIONS = [
    `Draft a follow-up email for ${deal.company_name}`,
    `What are the biggest risks on this deal?`,
    `How can I accelerate the ${deal.company_name} deal?`,
  ];

  const handleSend = useCallback((text: string) => {
    if (!text.trim() || isTyping) return;
    setMessages(prev => [...prev, { role: 'user', text: text.trim() }]);
    setInput('');
    setIsTyping(true);

    // Simulated responses based on question
    const lower = text.toLowerCase();
    let response: string;
    if (lower.includes('email') || lower.includes('follow-up') || lower.includes('draft')) {
      response = `Here's a follow-up draft for **${deal.company_name}**:\n\n---\n\nHi ${deal.primary_contact_name || 'there'},\n\nGreat speaking with you about ${deal.name}. I wanted to follow up on our conversation and share a few thoughts:\n\n1. Based on what you shared about your priorities, I think we're well-positioned to help\n2. I've put together some additional context that might be useful for your team's evaluation\n3. Happy to set up a call with our solutions team to dive deeper into the technical requirements\n\nWould Thursday or Friday work for a 30-minute follow-up?\n\nBest regards`;
    } else if (lower.includes('risk')) {
      const risks = deal.risk_factors?.length ? deal.risk_factors : ['No major risks identified — keep momentum going'];
      response = `**Risk assessment for ${deal.company_name}:**\n\n${risks.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\n**Recommended mitigations:**\n- Schedule a check-in call within the next 48 hours\n- Confirm decision timeline with ${deal.primary_contact_name || 'the primary contact'}\n- Share relevant case studies to reinforce value`;
    } else if (lower.includes('accelerate') || lower.includes('faster') || lower.includes('speed')) {
      response = `**Acceleration playbook for ${deal.company_name}:**\n\n1. **Create urgency** — reference their stated timeline and work backwards from implementation\n2. **Multi-thread** — get a meeting with at least one other stakeholder this week\n3. **Remove friction** — offer a pilot or phased rollout to reduce perceived risk\n4. **Social proof** — share a case study from a similar company in their vertical\n\nThe deal is currently at ${deal.probability}% probability. Executing these steps could move it to the next stage within 1-2 weeks.`;
    } else {
      response = `For the **${deal.company_name}** deal ($${(deal.value / 1000).toFixed(0)}K, ${STAGE_META[deal.stage].label} stage):\n\nBased on the deal signals I'm tracking, the most impactful thing you can do right now is focus on confirming the decision-making timeline and getting alignment with all stakeholders. The health score of ${deal.health_score}/100 suggests ${deal.health_status === 'healthy' ? 'things are on track' : 'there are areas that need attention'}.\n\nWant me to draft a specific email or build a meeting prep brief?`;
    }

    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'assistant', text: response }]);
      setIsTyping(false);
    }, 2000);
  }, [deal, isTyping]);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="fixed top-16 right-0 bottom-0 z-[61] w-full max-w-md bg-gray-950/95 backdrop-blur-xl border-l border-gray-800/50 flex flex-col"
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-800/50 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.05] transition-colors"
              >
                <ArrowRight className="w-4 h-4 rotate-180" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">AI Copilot</h3>
                  <p className="text-[10px] text-gray-500">{deal.company_name} deal</p>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.05] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#37bd7e]/15 text-gray-200 rounded-br-md'
                  : 'bg-gray-900/60 border border-gray-800/40 text-gray-300 rounded-bl-md'
              }`}>
                {msg.text.split('\n').map((line, j) => {
                  // Basic markdown-ish rendering
                  const boldRegex = /\*\*(.*?)\*\*/g;
                  const parts: React.ReactNode[] = [];
                  let lastIdx = 0;
                  let match;
                  while ((match = boldRegex.exec(line)) !== null) {
                    if (match.index > lastIdx) parts.push(line.slice(lastIdx, match.index));
                    parts.push(<strong key={`${j}-${match.index}`} className="font-semibold text-white">{match[1]}</strong>);
                    lastIdx = match.index + match[0].length;
                  }
                  if (lastIdx < line.length) parts.push(line.slice(lastIdx));
                  if (line === '---') return <hr key={j} className="border-gray-700/40 my-2" />;
                  if (line === '') return <br key={j} />;
                  return <p key={j}>{parts.length ? parts : line}</p>;
                })}
              </div>
            </motion.div>
          ))}

          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="rounded-2xl rounded-bl-md bg-gray-900/60 border border-gray-800/40 px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Analyzing deal...
                </div>
              </div>
            </motion.div>
          )}

          {/* Quick questions — show after first exchange */}
          {messages.length >= 2 && !isTyping && (
            <div className="space-y-2 pt-2">
              <p className="text-[11px] text-gray-600 font-medium">Ask a follow-up:</p>
              {QUICK_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(q)}
                  className="block w-full text-left text-xs text-gray-400 hover:text-white px-3 py-2 rounded-lg bg-gray-900/40 border border-gray-800/30 hover:border-gray-700/50 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex-shrink-0 border-t border-gray-800/50 px-4 py-3">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask about ${deal.company_name}...`}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gray-900/60 border border-gray-800/50 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/30 transition-colors"
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="p-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </motion.div>
    </>
  );
}

// ── Main Pipeline View ───────────────────────────────────────

export default function SandboxPipeline() {
  const { data, isPersonalized, setActiveView } = useSandboxData();
  const companyName = data.visitorCompany?.name;
  const totalValue = data.deals.reduce((s, d) => s + d.value, 0);
  const weightedValue = data.deals.reduce((s, d) => s + d.value * (d.probability / 100), 0);
  const activeDeals = data.deals.filter(d => d.stage !== 'closed_won' && d.stage !== 'closed_lost');
  const healthyCt = activeDeals.filter(d => d.health_status === 'healthy').length;
  const warningCt = activeDeals.filter(d => d.health_status === 'warning').length;
  const criticalCt = activeDeals.filter(d => d.health_status === 'critical' || d.health_status === 'stalled').length;

  const [selectedDeal, setSelectedDeal] = useState<SandboxDeal | null>(null);
  const [panelMode, setPanelMode] = useState<'detail' | 'copilot'>('detail');

  const handleDealClick = useCallback((deal: SandboxDeal) => {
    setSelectedDeal(deal);
    setPanelMode('detail');
  }, []);

  const handleAskCopilot = useCallback((deal: SandboxDeal) => {
    setSelectedDeal(deal);
    setPanelMode('copilot');
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedDeal(null);
    setPanelMode('detail');
  }, []);

  const handleBackToDetail = useCallback(() => {
    setPanelMode('detail');
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">Sales Pipeline</h2>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
            {data.deals.length} deals
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-gray-900/50 border border-gray-800/50">
            {[
              { icon: LayoutGrid, label: 'Board' },
              { icon: Table2, label: 'Table' },
              { icon: GitBranch, label: 'Graph' },
              { icon: BarChart3, label: 'Forecast' },
            ].map((v, i) => (
              <button
                key={v.label}
                className={`p-1.5 rounded-md transition-colors ${
                  i === 0 ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
                title={v.label}
              >
                <v.icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
          <button className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]">
            <Filter className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]">
            <SortAsc className="w-4 h-4" />
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#37bd7e] text-white text-xs font-medium hover:bg-[#2da76c] transition-colors">
            <Plus className="w-3.5 h-3.5" />
            New Deal
          </button>
        </div>
      </div>

      {/* Summary metrics strip */}
      <div className="flex items-center gap-4 mb-5 px-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">Total:</span>
          <span className="font-semibold text-white">${(totalValue / 1000).toFixed(0)}K</span>
        </div>
        <div className="w-px h-4 bg-gray-800" />
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">Weighted:</span>
          <span className="font-semibold text-gray-300">${(weightedValue / 1000).toFixed(0)}K</span>
        </div>
        <div className="w-px h-4 bg-gray-800" />
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {healthyCt} healthy
          </span>
          <span className="flex items-center gap-1 text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            {warningCt} warning
          </span>
          {criticalCt > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              {criticalCt} critical
            </span>
          )}
        </div>
      </div>

      {/* Kanban */}
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1">
        {VISIBLE_STAGES.map((stage, i) => (
          <StageColumn
            key={stage}
            stage={stage}
            deals={data.deals.filter((d) => d.stage === stage)}
            stageIndex={i}
            onDealClick={handleDealClick}
          />
        ))}
      </div>

      {/* Personalized CTA */}
      {isPersonalized && companyName && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="mt-4 rounded-2xl p-5 bg-gradient-to-r from-[#37bd7e]/10 via-[#37bd7e]/5 to-transparent border border-[#37bd7e]/20 flex items-center justify-between"
        >
          <div>
            <p className="text-sm font-semibold text-white">
              Track your real pipeline like this
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Health scores, risk alerts, and AI-powered next steps — updated in real time
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[#37bd7e] text-sm font-medium flex-shrink-0">
            Start free trial
            <ArrowRight className="w-4 h-4" />
          </div>
        </motion.div>
      )}

      {/* Deal Detail / Copilot Panel */}
      <AnimatePresence>
        {selectedDeal && panelMode === 'detail' && (
          <DealDetailPanel
            key="detail"
            deal={selectedDeal}
            onClose={handleClosePanel}
            onAskCopilot={handleAskCopilot}
          />
        )}
        {selectedDeal && panelMode === 'copilot' && (
          <CopilotDealChat
            key={`copilot-${selectedDeal.id}`}
            deal={selectedDeal}
            onClose={handleClosePanel}
            onBack={handleBackToDetail}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
