/**
 * AgentTeamsLiveDemoPage
 *
 * Live demo of multi-agent copilot working with real data.
 * Sends prompts to the actual copilot-autonomous edge function and
 * visualizes real-time agent delegation, tool execution, and synthesis.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Play,
  RotateCcw,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Clock,
  Wrench,
  Users,
  BarChart3,
  Mail,
  Search,
  Database,
  Calendar,
  Target,
  Zap,
  Brain,
  Send,
  Square,
  ChevronDown,
  ChevronUp,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { useNavigate } from 'react-router-dom';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import { useCopilotChat } from '@/lib/hooks/useCopilotChat';
import type { ActiveAgent, ToolCall } from '@/lib/hooks/useCopilotChat';
import { AgentWorkingIndicator } from '@/components/copilot/AgentWorkingIndicator';
import { CopilotResponse } from '@/components/copilot/CopilotResponse';
import { PipelineOutreachResponse } from '@/components/copilot/responses/PipelineOutreachResponse';
import type { CopilotResponse as CopilotResponseType, PipelineOutreachResponse as PipelineOutreachResponseType } from '@/components/copilot/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AnimatePresence, motion } from 'framer-motion';

// =============================================================================
// Agent metadata
// =============================================================================

const AGENT_ICON_MAP: Record<string, React.ElementType> = {
  pipeline: BarChart3,
  outreach: Mail,
  research: Search,
  crm_ops: Database,
  meetings: Calendar,
  prospecting: Target,
};

const AGENT_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  pipeline:    { text: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30' },
  outreach:    { text: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/30' },
  research:    { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  crm_ops:     { text: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30' },
  meetings:    { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30' },
  prospecting: { text: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30' },
};

// =============================================================================
// Demo scenarios — these trigger different agent combinations with live data
// =============================================================================

interface DemoScenario {
  id: string;
  title: string;
  description: string;
  prompt: string;
  expectedAgents: string[];
  icon: React.ElementType;
  gradient: string;
}

const LIVE_SCENARIOS: DemoScenario[] = [
  {
    id: 'pipeline-review-followup',
    title: 'Pipeline Review + Follow-ups',
    description: 'Review pipeline health and draft follow-up emails for stale deals',
    prompt: 'Review my pipeline health and draft follow-up emails for any stale deals that need attention',
    expectedAgents: ['pipeline', 'outreach'],
    icon: BarChart3,
    gradient: 'from-blue-500/20 to-purple-500/20',
  },
  {
    id: 'meeting-prep-research',
    title: 'Meeting Prep + Research',
    description: 'Prepare for upcoming meetings with company research',
    prompt: 'Help me prepare for my upcoming meetings today — research the companies and suggest talking points',
    expectedAgents: ['meetings', 'research'],
    icon: Calendar,
    gradient: 'from-amber-500/20 to-emerald-500/20',
  },
  {
    id: 'daily-priorities',
    title: 'Daily Priority Planner',
    description: 'Analyze pipeline, tasks, and meetings to plan your day',
    prompt: 'What should I prioritize today? Look at my pipeline, pending tasks, and upcoming meetings',
    expectedAgents: ['pipeline', 'crm_ops', 'meetings'],
    icon: Target,
    gradient: 'from-rose-500/20 to-amber-500/20',
  },
  {
    id: 'lead-outreach-sprint',
    title: 'Lead Research + Outreach',
    description: 'Research contacts needing attention and draft personalized outreach',
    prompt: 'Find contacts that need follow-up, research their companies, and draft personalized re-engagement emails',
    expectedAgents: ['research', 'outreach', 'prospecting'],
    icon: Search,
    gradient: 'from-emerald-500/20 to-purple-500/20',
  },
  {
    id: 'deal-rescue',
    title: 'Stalled Deal Recovery',
    description: 'Identify stalled deals and create rescue plans with outreach',
    prompt: 'Show me deals that have been stuck for over 30 days, analyze what went wrong, and draft re-engagement strategies',
    expectedAgents: ['pipeline', 'research', 'outreach'],
    icon: Zap,
    gradient: 'from-orange-500/20 to-blue-500/20',
  },
  {
    id: 'full-team',
    title: 'Full Team Sprint',
    description: 'Maximum delegation — pipeline, outreach, research, and CRM ops',
    prompt: 'Give me a complete end-of-week sales review: pipeline health, deals needing action, follow-ups to send, contacts to research, and tasks to update',
    expectedAgents: ['pipeline', 'outreach', 'research', 'crm_ops'],
    icon: Users,
    gradient: 'from-blue-500/20 to-rose-500/20',
  },
];

// =============================================================================
// Timeline tracking
// =============================================================================

interface AgentTimeline {
  name: string;
  displayName: string;
  color: string;
  startMs: number;
  endMs: number | null;
}

// =============================================================================
// Scenario Card
// =============================================================================

function ScenarioCard({
  scenario,
  isSelected,
  onSelect,
  disabled,
}: {
  scenario: DemoScenario;
  isSelected: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  const Icon = scenario.icon;
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`text-left rounded-xl border p-4 transition-all duration-200 ${
        isSelected
          ? 'border-primary ring-2 ring-primary/20 bg-gradient-to-br ' + scenario.gradient
          : 'border-border/50 hover:border-border hover:bg-muted/30'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isSelected ? 'bg-primary/10' : 'bg-muted/50'}`}>
          <Icon className={`h-5 w-5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{scenario.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{scenario.description}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {scenario.expectedAgents.map((agent) => {
              const AgentIcon = AGENT_ICON_MAP[agent] || Brain;
              const colors = AGENT_COLORS[agent];
              return (
                <span
                  key={agent}
                  className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${colors?.bg || 'bg-muted/50'} ${colors?.text || 'text-muted-foreground'}`}
                >
                  <AgentIcon className="h-2.5 w-2.5" />
                  {agent.replace('_', ' ')}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </button>
  );
}

// =============================================================================
// Execution Metrics Panel
// =============================================================================

function ExecutionMetrics({
  durationMs,
  toolsUsed,
  agentTimelines,
}: {
  durationMs: number;
  toolsUsed: string[];
  agentTimelines: AgentTimeline[];
}) {
  const uniqueTools = [...new Set(toolsUsed)];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Execution Metrics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-lg bg-muted/30">
            <p className="text-2xl font-bold tabular-nums">{(durationMs / 1000).toFixed(1)}s</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Duration</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/30">
            <p className="text-2xl font-bold tabular-nums">{agentTimelines.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Agents</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/30">
            <p className="text-2xl font-bold tabular-nums">{toolsUsed.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tool Calls</p>
          </div>
        </div>

        {/* Agent Gantt timeline */}
        {agentTimelines.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Agent Timeline
            </p>
            <div className="space-y-1.5">
              {agentTimelines.map((entry) => {
                const maxEnd = Math.max(...agentTimelines.map(t => t.endMs ?? durationMs), 1000);
                const startPct = (entry.startMs / maxEnd) * 100;
                const endMs = entry.endMs ?? durationMs;
                const widthPct = Math.max(((endMs - entry.startMs) / maxEnd) * 100, 4);
                const durationSec = (endMs - entry.startMs) / 1000;
                const colors = AGENT_COLORS[entry.name];
                const barColor = colors ? colors.text.replace('text-', 'bg-').replace('-400', '-500') : 'bg-zinc-500';

                return (
                  <div key={entry.name} className="flex items-center gap-2">
                    <span className={`text-[10px] font-medium w-20 truncate ${colors?.text || 'text-muted-foreground'}`}>
                      {entry.displayName}
                    </span>
                    <div className="flex-1 h-5 bg-muted/30 rounded-sm relative overflow-hidden">
                      <div
                        className={`absolute top-0 h-full rounded-sm ${barColor} opacity-70`}
                        style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-10 text-right tabular-nums">
                      {durationSec.toFixed(1)}s
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tools used */}
        {uniqueTools.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Tools Used ({toolsUsed.length} calls)
            </p>
            <div className="flex flex-wrap gap-1">
              {uniqueTools.map((tool) => {
                const count = toolsUsed.filter((t) => t === tool).length;
                return (
                  <Badge key={tool} variant="secondary" className="text-[10px] font-mono">
                    {tool}{count > 1 ? ` x${count}` : ''}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Live Chat Panel
// =============================================================================

function LiveChatPanel({
  organizationId,
  userId,
  scenario,
  startSignal,
  onMetricsReady,
}: {
  organizationId: string;
  userId: string;
  scenario: DemoScenario;
  startSignal: number;
  onMetricsReady: (metrics: { durationMs: number; toolsUsed: string[]; agentTimelines: AgentTimeline[] }) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  const [agentTimelines, setAgentTimelines] = useState<AgentTimeline[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const frameRef = useRef<number>(0);
  const [showTools, setShowTools] = useState(false);
  const completedRef = useRef(false);

  const {
    sendMessage,
    messages,
    isThinking,
    isStreaming,
    currentTool,
    toolsUsed,
    error,
    clearMessages,
    stopGeneration,
    activeAgents,
  } = useCopilotChat({
    organizationId,
    userId,
    persistSession: false,
    onToolStart: () => {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }
    },
    onComplete: (_response, tools) => {
      if (completedRef.current) return;
      completedRef.current = true;
      cancelAnimationFrame(frameRef.current);
      const duration = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
      setElapsedMs(duration);
      onMetricsReady({ durationMs: duration, toolsUsed: tools, agentTimelines });
    },
  });

  // Track agent timelines from activeAgents changes
  useEffect(() => {
    if (!startTimeRef.current || activeAgents.length === 0) return;
    const elapsed = Date.now() - startTimeRef.current;

    setAgentTimelines((prev) => {
      const updated = [...prev];
      for (const agent of activeAgents) {
        const existing = updated.find((t) => t.name === agent.name);
        if (!existing) {
          updated.push({
            name: agent.name,
            displayName: agent.displayName,
            color: agent.color,
            startMs: elapsed,
            endMs: null,
          });
        } else if (agent.status === 'done' && existing.endMs === null) {
          existing.endMs = elapsed;
        }
      }
      return updated;
    });
  }, [activeAgents]);

  // Timer
  useEffect(() => {
    if (!isThinking && !isStreaming) return;
    const tick = () => {
      if (startTimeRef.current) {
        setElapsedMs(Date.now() - startTimeRef.current);
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [isThinking, isStreaming]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, activeAgents]);

  // Send prompt when startSignal changes
  useEffect(() => {
    if (startSignal > 0) {
      completedRef.current = false;
      startTimeRef.current = 0;
      setAgentTimelines([]);
      setElapsedMs(0);
      clearMessages();
      // Small delay to allow state reset
      const t = setTimeout(() => sendMessage(scenario.prompt), 100);
      return () => clearTimeout(t);
    }
  }, [startSignal]);

  const isActive = isThinking || isStreaming;
  const assistantMessages = messages.filter((m) => m.role === 'assistant');
  const lastAssistant = assistantMessages[assistantMessages.length - 1];

  return (
    <div className="flex flex-col h-full">
      {/* Header with timer */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Live Multi-Agent</span>
          {isActive && (
            <Badge variant="secondary" className="text-[10px] animate-pulse">
              Running
            </Badge>
          )}
          {!isActive && lastAssistant && !completedRef.current && (
            <Badge variant="outline" className="text-[10px]">
              Idle
            </Badge>
          )}
          {completedRef.current && (
            <Badge className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Complete
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {elapsedMs > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {(elapsedMs / 1000).toFixed(1)}s
            </span>
          )}
          {isActive && (
            <Button variant="ghost" size="sm" className="h-6 px-2" onClick={stopGeneration}>
              <Square className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {/* User message */}
        {messages.filter((m) => m.role === 'user').map((msg) => (
          <div key={msg.id} className="flex justify-end">
            <div className="bg-primary/10 rounded-xl rounded-tr-sm px-4 py-2.5 max-w-[85%]">
              <p className="text-sm">{msg.content}</p>
            </div>
          </div>
        ))}

        {/* Agent indicators */}
        {activeAgents.length > 0 && (
          <AgentWorkingIndicator agents={activeAgents} />
        )}

        {/* Tool activity */}
        {toolsUsed.length > 0 && (
          <div className="space-y-1">
            <button
              onClick={() => setShowTools(!showTools)}
              className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Wrench className="h-3 w-3" />
              {toolsUsed.length} tool{toolsUsed.length !== 1 ? 's' : ''} executed
              {showTools ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showTools && (
              <div className="flex flex-wrap gap-1 pl-4">
                {toolsUsed.map((tool, i) => (
                  <Badge key={i} variant="outline" className="text-[9px] font-mono py-0">
                    {tool}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Current tool */}
        {currentTool && currentTool.status === 'running' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Running {currentTool.name}...
          </div>
        )}

        {/* Thinking indicator */}
        {isThinking && !currentTool && toolsUsed.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Classifying intent and delegating to agents...
          </div>
        )}

        {/* Response content — structured panel if available, otherwise raw text */}
        {lastAssistant && lastAssistant.structuredResponse && (
          <div className="rounded-xl rounded-tl-sm overflow-hidden">
            <CopilotResponse
              response={lastAssistant.structuredResponse as CopilotResponseType}
              onActionClick={(action) => {
                console.log('[DEMO] Action clicked:', action);
              }}
            />
          </div>
        )}
        {lastAssistant && lastAssistant.content && !lastAssistant.structuredResponse && (
          <div className="bg-muted/20 rounded-xl rounded-tl-sm px-4 py-3 space-y-2">
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:my-3 prose-li:my-0.5 prose-table:text-xs prose-a:text-blue-400 prose-a:underline prose-hr:my-3 prose-strong:text-white">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ node, ...props }) => (
                    <a {...props} target="_blank" rel="noopener noreferrer" />
                  ),
                  input: ({ node, ...props }) => (
                    <input {...props} disabled className="mr-1.5 accent-primary" />
                  ),
                }}
              >
                {lastAssistant.content}
              </ReactMarkdown>
            </div>
            {lastAssistant.isStreaming && (
              <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse rounded-sm" />
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Mock data for Pipeline Outreach preview
// =============================================================================

const MOCK_PIPELINE_OUTREACH: PipelineOutreachResponseType = {
  type: 'pipeline_outreach',
  summary: "Here's your pipeline health summary with 4 follow-up emails ready to review.",
  data: {
    pipeline_summary: {
      stale_count: 5,
      total_deals: 18,
      risk_level: 'high',
      health_score: 42,
      zero_interaction_count: 3,
    },
    email_drafts: [
      {
        contactId: 'c-001',
        contactName: 'Sarah Chen',
        company: 'Meridian Technologies',
        to: 'sarah.chen@meridiantech.com',
        subject: 'Quick follow-up on our integration discussion',
        body: `Hi Sarah,

I wanted to circle back on our conversation about the data integration project. It's been a couple of weeks and I'd love to hear how the internal review went.

We've also recently shipped a new API connector that could simplify the migration path we discussed. Happy to walk you through it if that would be helpful.

Would you have 15 minutes this week for a quick call?

Best regards`,
        urgency: 'high',
        strategyNotes: 'Decision-maker went silent after technical demo. Re-engage with new feature as hook.',
        daysSinceContact: 18,
        dealId: 'd-001',
        meetingContext: {
          meetingId: 'm-101',
          meetingTitle: 'Technical Integration Review — Meridian',
          meetingDate: '2026-01-23T14:00:00Z',
          meetingSummary: 'Walked through the API integration architecture. Sarah had concerns about data migration timeline and asked for a phased rollout plan. Team agreed to evaluate the new connector option.',
          pendingActionItems: [
            { id: 'ai-201', title: 'Send phased rollout proposal' },
            { id: 'ai-202', title: 'Schedule follow-up with engineering lead' },
            { id: 'ai-203', title: 'Share API connector documentation' },
          ],
        },
      },
      {
        contactId: 'c-002',
        contactName: 'Marcus Rodriguez',
        company: 'Apex Financial Group',
        to: 'mrodriguez@apexfin.com',
        subject: 'Pricing proposal follow-up — Apex x use60',
        body: `Hi Marcus,

I hope you've had a chance to review the pricing proposal I sent over. I know budget cycles can be complex, so I wanted to check in and see if there are any questions from your team.

I'm also happy to set up a call with our solutions team to address any technical concerns before your next review meeting.

Looking forward to hearing from you.

Cheers`,
        urgency: 'high',
        strategyNotes: 'Proposal sent 3 weeks ago, no response. May need to loop in their VP of Ops.',
        lastInteraction: '2026-01-20',
        daysSinceContact: 21,
        dealId: 'd-002',
      },
      {
        contactId: 'c-003',
        contactName: 'Lisa Park',
        company: 'CloudBridge Solutions',
        to: 'lisa.park@cloudbridge.io',
        subject: 'Case study you might find valuable',
        body: `Hi Lisa,

I came across a case study from one of our customers in the SaaS infrastructure space that reminded me of the challenges you mentioned during our last call.

They saw a 40% reduction in pipeline review time after implementing our workflow automation. I thought it might be helpful as you evaluate options for Q2.

Happy to discuss — let me know if you'd like to set up some time.

Best`,
        urgency: 'medium',
        strategyNotes: 'Warm lead, showed interest but needs internal buy-in. Share social proof.',
        daysSinceContact: 12,
        dealId: 'd-003',
      },
      {
        contactId: 'c-004',
        contactName: 'James Whitfield',
        company: 'Orion Dynamics',
        to: 'j.whitfield@oriondyn.com',
        subject: 'Checking in — pilot program update',
        body: `Hi James,

Just wanted to touch base on the pilot program we kicked off last month. I noticed the team hasn't logged in for a few days and wanted to make sure everything is running smoothly.

If there are any blockers or if the team needs additional training, I'm happy to arrange a session.

Let me know how things are going!

Best regards`,
        urgency: 'medium',
        strategyNotes: 'Pilot engagement dropping. Proactive check-in to prevent churn risk.',
        daysSinceContact: 8,
        dealId: 'd-004',
        meetingContext: {
          meetingId: 'm-104',
          meetingTitle: 'Orion Dynamics — Pilot Kickoff',
          meetingDate: '2026-01-31T10:00:00Z',
          meetingSummary: 'Launched pilot with 5-user cohort. James mentioned onboarding was smooth but wanted custom reporting dashboards before expanding to full team.',
          pendingActionItems: [
            { id: 'ai-301', title: 'Deliver custom dashboard mockups' },
            { id: 'ai-302', title: 'Check in on pilot usage metrics after 2 weeks' },
          ],
        },
      },
    ],
  },
  actions: [
    {
      id: 'queue-all',
      label: 'Add All to Action Centre',
      type: 'secondary',
      callback: 'queue_all_emails',
      params: { count: 4 },
    },
  ],
};

// =============================================================================
// Main Page
// =============================================================================

export default function AgentTeamsLiveDemoPage() {
  const navigate = useNavigate();
  const { isPlatformAdmin } = useUserPermissions();
  const orgId = useOrgId();
  const { data: authUser } = useAuthUser();

  const [selectedScenario, setSelectedScenario] = useState<DemoScenario | null>(null);
  const [runState, setRunState] = useState<'idle' | 'running' | 'complete'>('idle');
  const [startSignal, setStartSignal] = useState(0);
  const [completionMetrics, setCompletionMetrics] = useState<{
    durationMs: number;
    toolsUsed: string[];
    agentTimelines: AgentTimeline[];
  } | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');

  const handleRun = useCallback(() => {
    if (!selectedScenario) return;
    setCompletionMetrics(null);
    setRunState('running');
    setStartSignal(Date.now());
  }, [selectedScenario]);

  const handleRunCustom = useCallback(() => {
    if (!customPrompt.trim()) return;
    // Create ad-hoc scenario
    setSelectedScenario({
      id: 'custom',
      title: 'Custom Prompt',
      description: customPrompt.slice(0, 80),
      prompt: customPrompt,
      expectedAgents: [],
      icon: Brain,
      gradient: 'from-zinc-500/20 to-zinc-500/20',
    });
    setCompletionMetrics(null);
    setRunState('running');
    setStartSignal(Date.now());
  }, [customPrompt]);

  const handleReset = useCallback(() => {
    setCompletionMetrics(null);
    setRunState('idle');
    setStartSignal(0);
  }, []);

  const handleMetrics = useCallback((metrics: { durationMs: number; toolsUsed: string[]; agentTimelines: AgentTimeline[] }) => {
    setCompletionMetrics(metrics);
    setRunState('complete');
  }, []);

  if (!isPlatformAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">You don&apos;t have permission to access this page.</p>
        <Button variant="outline" onClick={() => navigate('/platform')}>Go Back</Button>
      </div>
    );
  }

  if (!orgId || !authUser?.id) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="space-y-2">
        <BackToPlatform />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              Agent Teams — Live Preview
              <Badge className="text-xs font-normal bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                Live Data
              </Badge>
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Run multi-agent prompts against your real pipeline data. Watch agents delegate, execute tools, and synthesize responses in real-time.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/platform/multi-agent-demo')}
          >
            View Mock Demo
          </Button>
        </div>
      </div>

      {/* Pipeline Outreach Response Preview */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Pipeline Outreach Response
                <Badge className="text-[10px] font-normal bg-blue-500/10 text-blue-500 border-blue-500/30">
                  New
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                When the copilot reviews pipeline health, stale deals get interactive email cards — edit in place, send via Gmail, or queue to Action Centre.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border/50 bg-gray-950/60 p-4">
            <PipelineOutreachResponse
              data={MOCK_PIPELINE_OUTREACH}
              onActionClick={(action) => {
                console.log('[DEMO] Action clicked:', action);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Scenario Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Choose a Scenario
          </CardTitle>
          <CardDescription>
            Each scenario triggers different agent combinations with your real CRM data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {LIVE_SCENARIOS.map((s) => (
              <ScenarioCard
                key={s.id}
                scenario={s}
                isSelected={selectedScenario?.id === s.id}
                onSelect={() => {
                  setSelectedScenario(s);
                  setCustomPrompt('');
                }}
                disabled={runState === 'running'}
              />
            ))}
          </div>

          {/* Custom prompt input */}
          <div className="flex items-center gap-2 pt-2 border-t border-border/50">
            <div className="relative flex-1">
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => {
                  setCustomPrompt(e.target.value);
                  if (e.target.value) setSelectedScenario(null);
                }}
                placeholder="Or type a custom prompt..."
                className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={runState === 'running'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customPrompt.trim()) handleRunCustom();
                }}
              />
            </div>
            {customPrompt.trim() && (
              <Button size="sm" onClick={handleRunCustom} disabled={runState === 'running'}>
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Run
              </Button>
            )}
          </div>

          {/* Selected prompt preview + controls */}
          {selectedScenario && selectedScenario.id !== 'custom' && (
            <div className="flex items-center gap-3">
              <div className="flex-1 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2 font-mono truncate">
                &quot;{selectedScenario.prompt}&quot;
              </div>
              {runState !== 'running' ? (
                <div className="flex gap-2">
                  {runState === 'complete' && (
                    <Button variant="outline" size="sm" onClick={handleReset}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      Reset
                    </Button>
                  )}
                  <Button size="sm" onClick={handleRun}>
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                    {runState === 'complete' ? 'Run Again' : 'Run Live'}
                  </Button>
                </div>
              ) : (
                <Badge variant="secondary" className="animate-pulse">
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  Running...
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live execution area */}
      {startSignal > 0 && selectedScenario && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: 500 }}>
          {/* Chat panel — 2/3 width */}
          <Card className="lg:col-span-2 overflow-hidden">
            <div className="h-[500px]">
              <LiveChatPanel
                organizationId={orgId}
                userId={authUser.id}
                scenario={selectedScenario}
                startSignal={startSignal}
                onMetricsReady={handleMetrics}
              />
            </div>
          </Card>

          {/* Metrics panel — 1/3 width */}
          <div className="space-y-4">
            {/* Expected agents */}
            {selectedScenario.expectedAgents.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Expected Agents
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {selectedScenario.expectedAgents.map((agent) => {
                      const AgentIcon = AGENT_ICON_MAP[agent] || Brain;
                      const colors = AGENT_COLORS[agent];
                      const timeline = completionMetrics?.agentTimelines.find((t) => t.name === agent);
                      return (
                        <div
                          key={agent}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm ${colors?.bg || 'bg-muted/30'}`}
                        >
                          <AgentIcon className={`h-4 w-4 ${colors?.text || 'text-muted-foreground'}`} />
                          <span className="flex-1 capitalize">{agent.replace('_', ' ')}</span>
                          {timeline?.endMs != null && (
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {((timeline.endMs - timeline.startMs) / 1000).toFixed(1)}s
                            </span>
                          )}
                          {timeline ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          ) : runState === 'running' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Completion metrics */}
            {completionMetrics && (
              <ExecutionMetrics
                durationMs={completionMetrics.durationMs}
                toolsUsed={completionMetrics.toolsUsed}
                agentTimelines={completionMetrics.agentTimelines}
              />
            )}
          </div>
        </div>
      )}

    </div>
  );
}
