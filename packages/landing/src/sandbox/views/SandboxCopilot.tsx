/**
 * SandboxCopilot
 *
 * Pixel-perfect replica of real 60 CopilotLayout.
 * Two-panel: left chat area + right sidebar panel.
 * Auto-playing conversation with tool call indicators.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Send,
  User,
  Video,
  Mail,
  Heart,
  ChevronRight,
  CheckCircle2,
  Loader2,
  Search,
  Plug,
  Zap,
  HelpCircle,
  UserSearch,
  ArrowRight,
} from 'lucide-react';
import { useSandboxData } from '../data/SandboxDataProvider';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isTyping?: boolean;
  toolCalls?: string[];
}

interface PromptOption {
  icon: typeof Video;
  label: string;
  patternKey: string;
}

const ALL_PROMPTS: PromptOption[] = [
  { icon: Video, patternKey: 'meeting', label: 'Prepare for my meeting with {prospect}' },
  { icon: Mail, patternKey: 'email', label: 'Draft a follow-up email to {contact}' },
  { icon: Heart, patternKey: 'deal', label: 'Show deal health for {prospect}' },
  { icon: UserSearch, patternKey: 'lead', label: 'Find new leads similar to {prospect}' },
  { icon: HelpCircle, patternKey: 'help', label: 'What can you help me with?' },
];

export default function SandboxCopilot() {
  const { data } = useSandboxData();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [autoPlayDone, setAutoPlayDone] = useState(false);
  const [usedPatterns, setUsedPatterns] = useState<Set<string>>(new Set());
  const [completedTools, setCompletedTools] = useState<string[]>(['Meeting lookup', 'Deal context', 'Prep generator']);
  const scrollRef = useRef<HTMLDivElement>(null);
  const msgCounter = useRef(1);

  const myCompanyName = data.visitorCompany.name;
  const prospectCompany = data.visitorDeal.company_name;
  const contactName = data.emailDraft.to_name;

  const availablePrompts = ALL_PROMPTS.filter((p) => !usedPatterns.has(p.patternKey));

  useEffect(() => {
    const timer = setTimeout(() => { playConversation(); }, 600);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Pattern matching ---
  function matchPattern(input: string): string {
    const lower = input.toLowerCase();
    if (/\b(meeting|prep|prepare)\b/.test(lower)) return 'meeting';
    if (/\b(email|follow|draft)\b/.test(lower)) return 'email';
    if (/\b(deal|health|pipeline|status)\b/.test(lower)) return 'deal';
    if (/\b(lead|find|prospect|research)\b/.test(lower)) return 'lead';
    if (/\b(help|what can|how do)\b/.test(lower)) return 'help';
    return 'none';
  }

  function getResponseForPattern(pattern: string): { response: string; tools: string[]; toolLabels: string[] } {
    const prep = data.meetings[0]?.prep;

    switch (pattern) {
      case 'meeting':
        return {
          tools: ['Searching meetings...', 'Loading deal context...', 'Generating prep doc...'],
          toolLabels: ['Meeting lookup', 'Deal context', 'Prep generator'],
          response: `Here's your meeting prep for **${prospectCompany}**:

**Meeting:** ${data.meetings[0]?.title ?? 'Demo & Pricing Review'}
**When:** Tomorrow at 2:00 PM (45 min)
**Attendees:** ${data.meetings[0]?.attendees.map((a) => a.name).join(', ') ?? contactName}

**Key Talking Points:**
${prep?.talking_points.slice(0, 3).map((tp, i) => `${i + 1}. ${tp}`).join('\n') ?? '1. Discuss platform capabilities\n2. Review pricing options'}

**Risk Signals:**
${prep?.risk_signals.slice(0, 2).map((rs) => `- ${rs}`).join('\n') ?? '- Budget approval may need CEO sign-off'}

**Deal Context:** $${(data.visitorDeal.value / 1000).toFixed(0)}K at ${data.visitorDeal.stage} stage, ${data.visitorDeal.health_score}/100 health

I've also drafted a follow-up email ready for after the call. Want me to show it?`,
        };

      case 'email':
        return {
          tools: ['Loading email context...', 'Analyzing tone...', 'Drafting email...'],
          toolLabels: ['Email context', 'Tone analysis', 'Email drafter'],
          response: `Here's a follow-up email draft for **${contactName}**:

**To:** ${data.emailDraft.to_email}
**Subject:** ${data.emailDraft.subject}

${data.emailDraft.body}

**Why this approach:** ${data.emailDraft.reasoning ?? 'Personalized based on your last conversation and deal context.'}

Want me to adjust the tone or add anything?`,
        };

      case 'deal':
        return {
          tools: ['Pulling deal data...', 'Calculating health score...', 'Checking risk factors...'],
          toolLabels: ['Deal lookup', 'Health calculator', 'Risk analyzer'],
          response: `Here's the deal health summary for **${prospectCompany}**:

**Deal:** ${data.visitorDeal.name}
**Value:** $${(data.visitorDeal.value / 1000).toFixed(0)}K
**Stage:** ${data.visitorDeal.stage} (${data.visitorDeal.days_in_stage} days)
**Health Score:** ${data.visitorDeal.health_score}/100 (${data.visitorDeal.health_status})
**Probability:** ${data.visitorDeal.probability}%

**Risk Factors:**
${data.visitorDeal.risk_factors?.slice(0, 3).map((rf) => `- ${rf}`).join('\n') ?? '- No major risks identified'}

**Next Steps:** ${data.visitorDeal.next_steps ?? 'Schedule follow-up to discuss proposal'}

Overall the deal looks ${data.visitorDeal.health_status === 'healthy' ? 'solid' : 'like it needs attention'}. Want me to draft an action plan?`,
        };

      case 'lead': {
        const industry = data.visitorCompany.industry ?? 'technology';
        // Pull other deal company names for cross-reference
        const otherDeals = data.deals
          .filter((d) => !d.isVisitorDeal && d.company_name !== prospectCompany)
          .map((d) => d.company_name)
          .slice(0, 2);

        const crossRefLine = otherDeals.length > 0
          ? `\n\nI also noticed **${otherDeals.join('** and **')}** ${otherDeals.length === 1 ? 'is' : 'are'} already in your pipeline — leads like these often overlap with similar accounts.`
          : '';

        return {
          tools: ['Scanning industry data...', 'Matching ICP criteria...', 'Enriching contacts...'],
          toolLabels: ['Industry scan', 'ICP matcher', 'Contact enricher'],
          response: `I found some promising leads similar to **${prospectCompany}** — companies that match your ideal customer profile:

**1. Sarah Mitchell** — VP of Sales at TechFlow Inc.
   50-200 employees, Series B, actively hiring sales team

**2. James Park** — Head of Revenue at DataSync
   100-500 employees, ${industry.toLowerCase()} vertical, using a competitor CRM

**3. Rachel Torres** — COO at GrowthMetrics
   Recently posted about scaling sales operations${crossRefLine}

All three match your ideal customer profile. Want me to draft personalized outreach for any of them?`,
        };
      }

      case 'help':
        return {
          tools: ['Loading capabilities...'],
          toolLabels: ['Capabilities index'],
          response: `I'm your AI sales assistant. Here's what I can help with:

**Before meetings:** Prep docs with talking points, risk signals, and deal context
**After meetings:** Follow-up emails drafted in your tone with full awareness of the deal
**Pipeline management:** Deal health scores, risk alerts, and next-step recommendations
**Prospecting:** Find and research leads matching your ICP
**Email drafts:** Personalized outreach based on your CRM data and conversation history

I pull context from your CRM, meeting transcripts, emails, and deal history to give you accurate, actionable help. Just ask naturally — no commands to memorize.

What would you like to tackle first?`,
        };

      default:
        return {
          tools: [],
          toolLabels: [],
          response: `That's a great question! In the full version of 60, I can help with meeting prep, email drafting, deal analysis, lead research, and much more.

**Sign up to unlock the full copilot** and get AI-powered assistance across your entire sales workflow.`,
        };
    }
  }

  // --- Submit handler ---
  async function handleSubmit() {
    const text = inputValue.trim();
    if (!text || isAnimating) return;

    setIsAnimating(true);
    setInputValue('');

    const userMsgId = `user-interactive-${msgCounter.current++}`;
    await addMessage({ id: userMsgId, role: 'user', content: text });
    await delay(400);

    const pattern = matchPattern(text);
    const { response, tools, toolLabels } = getResponseForPattern(pattern);

    // Mark pattern as used (unless it's the fallback)
    if (pattern !== 'none') {
      setUsedPatterns((prev) => new Set(prev).add(pattern));
    }

    // Show tool calls if any
    if (tools.length > 0) {
      setActiveTools(tools);
      setMessages((prev) => [...prev, { id: 'typing', role: 'assistant', content: '', isTyping: true }]);
      await delay(1800);
      setActiveTools([]);
      setMessages((prev) => prev.filter((m) => m.id !== 'typing'));
    }

    // Update completed tools in sidebar
    if (toolLabels.length > 0) {
      setCompletedTools(toolLabels);
    }

    const aiMsgId = `ai-interactive-${msgCounter.current++}`;
    await addMessageTyped({
      id: aiMsgId,
      role: 'assistant',
      content: response,
      toolCalls: toolLabels.length > 0 ? toolLabels : undefined,
    });

    setIsAnimating(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  async function playConversation() {
    setIsAnimating(true);

    await addMessage({ id: 'user-1', role: 'user', content: `Prepare for my meeting with ${prospectCompany} tomorrow` });
    await delay(600);

    // Show tool calls
    setActiveTools(['Searching meetings...', 'Loading deal context...', 'Generating prep doc...']);
    setMessages((prev) => [...prev, { id: 'typing', role: 'assistant', content: '', isTyping: true }]);
    await delay(2000);
    setActiveTools([]);
    setMessages((prev) => prev.filter((m) => m.id !== 'typing'));

    const prep = data.meetings[0]?.prep;
    const aiResponse = `Here's your meeting prep for **${prospectCompany}**:

**Meeting:** ${data.meetings[0]?.title ?? 'Demo & Pricing Review'}
**When:** Tomorrow at 2:00 PM (45 min)
**Attendees:** ${data.meetings[0]?.attendees.map((a) => a.name).join(', ') ?? contactName}

**Key Talking Points:**
${prep?.talking_points.slice(0, 3).map((tp, i) => `${i + 1}. ${tp}`).join('\n') ?? '1. Discuss platform capabilities\n2. Review pricing options'}

**Risk Signals:**
${prep?.risk_signals.slice(0, 2).map((rs) => `- ${rs}`).join('\n') ?? '- Budget approval may need CEO sign-off'}

**Deal Context:** $${(data.visitorDeal.value / 1000).toFixed(0)}K at ${data.visitorDeal.stage} stage, ${data.visitorDeal.health_score}/100 health

I've also drafted a follow-up email ready for after the call. Want me to show it?`;

    await addMessageTyped({
      id: 'ai-1',
      role: 'assistant',
      content: aiResponse,
      toolCalls: ['Meeting lookup', 'Deal context', 'Prep generator'],
    });

    // Mark the meeting pattern as used since auto-play covers it
    setUsedPatterns((prev) => new Set(prev).add('meeting'));
    setAutoPlayDone(true);
    setIsAnimating(false);
  }

  async function addMessage(msg: Message) {
    setMessages((prev) => [...prev, msg]);
    await delay(100);
    scrollToBottom();
  }

  async function addMessageTyped(msg: Message) {
    setMessages((prev) => [...prev, { ...msg, content: '' }]);
    const chunkSize = 3;
    for (let i = 0; i < msg.content.length; i += chunkSize) {
      const chunk = msg.content.slice(0, i + chunkSize);
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, content: chunk } : m)));
      await delay(10);
    }
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, content: msg.content } : m)));
    scrollToBottom();
  }

  function scrollToBottom() {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }

  function handlePromptClick(prompt: string) {
    const resolved = prompt.replace('{prospect}', prospectCompany).replace('{contact}', contactName);
    setInputValue(resolved);
  }

  return (
    <div className="space-y-4">
    <div className="flex gap-4 h-[calc(100vh-16rem)] md:h-[calc(100vh-12rem)]">
      {/* Left: Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-[#37bd7e] flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">60 Copilot</h2>
            <p className="text-[11px] text-gray-500">AI-powered sales assistant</p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 text-[10px] text-[#37bd7e]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#37bd7e] animate-pulse" />
            Online
          </span>
        </div>

        {/* Chat messages */}
        <div
          ref={scrollRef}
          className="flex-1 rounded-2xl border bg-gray-900/40 backdrop-blur-xl border-gray-700/30 overflow-hidden"
        >
          <div className="h-full overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <Bot className="w-8 h-8 text-gray-600 mb-3" />
                <p className="text-sm text-gray-400">Ask me anything about your deals, contacts, or meetings</p>
              </div>
            )}

            <AnimatePresence>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-lg bg-[#37bd7e]/15 border border-[#37bd7e]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-[#37bd7e]" />
                    </div>
                  )}

                  <div
                    className={`max-w-[80%] rounded-xl px-3.5 py-2.5 ${
                      msg.role === 'user'
                        ? 'bg-[#37bd7e]/15 border border-[#37bd7e]/20'
                        : 'bg-gray-900/40 border border-gray-700/30'
                    }`}
                  >
                    {msg.isTyping ? (
                      <div className="flex items-center gap-1.5 py-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#37bd7e] animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-[#37bd7e] animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-[#37bd7e] animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    ) : (
                      <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                        {msg.content.split('**').map((part, i) =>
                          i % 2 === 1 ? (
                            <strong key={i} className="text-gray-100 font-semibold">{part}</strong>
                          ) : (
                            <span key={i}>{part}</span>
                          )
                        )}
                      </div>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-lg bg-[#37bd7e] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Suggestions + Input */}
        <div className="mt-3">
          {autoPlayDone && !isAnimating && availablePrompts.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {availablePrompts.map((prompt) => {
                const Icon = prompt.icon;
                const label = prompt.label.replace('{prospect}', prospectCompany).replace('{contact}', contactName);
                return (
                  <button
                    key={prompt.patternKey}
                    onClick={() => handlePromptClick(prompt.label)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900/40 border border-gray-700/30 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors"
                  >
                    <Icon className="w-3 h-3" />
                    <span className="truncate max-w-[140px] sm:max-w-[200px]">{label}</span>
                    <ChevronRight className="w-3 h-3 text-gray-600" />
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2 rounded-xl bg-gray-900/40 border border-gray-700/30 px-4 py-2.5">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isAnimating || !autoPlayDone}
              placeholder={autoPlayDone ? 'Ask 60 anything...' : 'Watching demo...'}
              className="flex-1 bg-transparent text-sm text-gray-200 placeholder:text-gray-600 outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSubmit}
              disabled={isAnimating || !autoPlayDone || !inputValue.trim()}
              className="p-1.5 rounded-lg bg-[#37bd7e]/15 text-[#37bd7e] hover:bg-[#37bd7e]/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Right: Sidebar panel (320px) — hidden on mobile, visible on md+ */}
      <div className="hidden md:block w-64 lg:w-80 flex-shrink-0 space-y-3">
        {/* Progress / Tool execution */}
        <div className="rounded-2xl border bg-gray-900/40 backdrop-blur-xl border-gray-700/30 p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            {activeTools.length > 0 ? 'Running' : 'Progress'}
          </h4>
          {activeTools.length > 0 ? (
            <div className="space-y-2">
              {activeTools.map((tool, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 className="w-3 h-3 animate-spin text-[#37bd7e]" />
                  {tool}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {completedTools.map((step) => (
                <div key={step} className="flex items-center gap-2 text-xs text-gray-500">
                  <CheckCircle2 className="w-3 h-3 text-[#37bd7e]" />
                  {step}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Context sources */}
        <div className="rounded-2xl border bg-gray-900/40 backdrop-blur-xl border-gray-700/30 p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Context Sources</h4>
          <div className="space-y-2">
            {[
              { icon: Search, label: 'Meeting transcripts', count: 3 },
              { icon: Heart, label: 'Deal pipeline', count: 1 },
              { icon: Mail, label: 'Email threads', count: 5 },
            ].map((source) => (
              <div key={source.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-gray-400">
                  <source.icon className="w-3 h-3" />
                  {source.label}
                </div>
                <span className="text-gray-600">{source.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Connected integrations */}
        <div className="rounded-2xl border bg-gray-900/40 backdrop-blur-xl border-gray-700/30 p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Connected</h4>
          <div className="space-y-2">
            {[
              { icon: Plug, label: 'CRM', status: 'connected' },
              { icon: Video, label: 'Meeting Recorder', status: 'connected' },
              { icon: Zap, label: 'Email Sync', status: 'connected' },
            ].map((integration) => (
              <div key={integration.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-gray-400">
                  <integration.icon className="w-3 h-3" />
                  {integration.label}
                </div>
                <span className="flex items-center gap-1 text-[#37bd7e]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#37bd7e]" />
                  Live
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>

    {/* Personalized CTA */}
    <div className="rounded-2xl p-4 sm:p-5 bg-gradient-to-r from-[#37bd7e]/10 via-[#37bd7e]/5 to-transparent border border-[#37bd7e]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-white">
          Ask 60 anything about your pipeline
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Meeting prep, follow-ups, deal health, lead research — all from one conversation
        </p>
      </div>
      <div className="flex items-center gap-1.5 text-[#37bd7e] text-sm font-medium flex-shrink-0">
        Start free trial
        <ArrowRight className="w-4 h-4" />
      </div>
    </div>
    </div>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
