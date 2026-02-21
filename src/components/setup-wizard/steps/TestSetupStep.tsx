import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Zap, Check, ArrowLeft, Sparkles, PartyPopper, Loader2,
  Search, Mail, User, Building2, Globe, Newspaper, PenTool,
  Brain, CheckCircle2, Circle, Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSetupWizard } from '@/lib/hooks/useSetupWizard';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { useActiveICP } from '@/lib/hooks/useActiveICP';
import { supabase, getSupabaseAuthToken } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Phase = 'idle' | 'deploying' | 'researching' | 'synthesizing' | 'writing' | 'done' | 'error';

interface AgentStatus {
  id: string;
  name: string;
  icon: 'globe' | 'newspaper' | 'user' | 'pen-tool';
  status: 'waiting' | 'working' | 'done';
  findings: string[];
}

interface ActivityItem {
  id: number;
  text: string;
  type: 'info' | 'finding' | 'complete';
}

const AGENT_ICONS = {
  globe: Globe,
  newspaper: Newspaper,
  user: User,
  'pen-tool': PenTool,
};

const INITIAL_AGENTS: AgentStatus[] = [
  { id: 'company', name: 'Company Intel', icon: 'globe', status: 'waiting', findings: [] },
  { id: 'prospect', name: 'Prospect Profile', icon: 'user', status: 'waiting', findings: [] },
  { id: 'news', name: 'News & Signals', icon: 'newspaper', status: 'waiting', findings: [] },
  { id: 'writer', name: 'Email Composer', icon: 'pen-tool', status: 'waiting', findings: [] },
];

function AgentCard({ agent }: { agent: AgentStatus }) {
  const Icon = AGENT_ICONS[agent.icon];
  const isWorking = agent.status === 'working';
  const isDone = agent.status === 'done';

  return (
    <div
      className={cn(
        'relative rounded-lg border p-2.5 transition-all duration-500',
        isDone && 'border-green-300 dark:border-green-700/50 bg-green-50/50 dark:bg-green-900/10',
        isWorking && 'border-indigo-300 dark:border-indigo-700/50 bg-indigo-50/50 dark:bg-indigo-900/10',
        !isWorking && !isDone && 'border-gray-200 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30 opacity-50'
      )}
    >
      {isWorking && (
        <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-indigo-500/5 to-purple-500/5 animate-pulse" />
      )}
      <div className="relative flex items-center gap-2">
        <div
          className={cn(
            'w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 transition-colors duration-500',
            isDone && 'bg-green-100 dark:bg-green-900/30',
            isWorking && 'bg-indigo-100 dark:bg-indigo-900/30',
            !isWorking && !isDone && 'bg-gray-100 dark:bg-gray-800'
          )}
        >
          {isDone ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Icon
              className={cn(
                'w-3.5 h-3.5 transition-colors',
                isWorking ? 'text-indigo-500 animate-pulse' : 'text-gray-400'
              )}
            />
          )}
        </div>
        <div className="min-w-0">
          <p className={cn(
            'text-xs font-medium truncate',
            isDone ? 'text-green-700 dark:text-green-400' :
            isWorking ? 'text-gray-900 dark:text-white' :
            'text-gray-400 dark:text-gray-500'
          )}>
            {agent.name}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
            {isDone ? 'Complete' : isWorking ? 'Working...' : 'Queued'}
          </p>
        </div>
      </div>
    </div>
  );
}

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <div className="space-y-1 max-h-[120px] overflow-y-auto scrollbar-hide">
      {items.map((item, idx) => (
        <div
          key={item.id}
          className={cn(
            'flex items-start gap-1.5 text-[11px] leading-relaxed transition-opacity duration-300',
            idx === items.length - 1 ? 'opacity-100' : 'opacity-60'
          )}
        >
          {item.type === 'complete' ? (
            <CheckCircle2 className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
          ) : item.type === 'finding' ? (
            <Sparkles className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
          ) : (
            <Circle className="w-3 h-3 text-indigo-400 mt-0.5 flex-shrink-0 animate-pulse" />
          )}
          <span className={cn(
            item.type === 'complete' ? 'text-green-600 dark:text-green-400' :
            item.type === 'finding' ? 'text-amber-600 dark:text-amber-400' :
            'text-gray-500 dark:text-gray-400'
          )}>
            {item.text}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TestSetupStep() {
  const { steps, completeStep, setCurrentStep } = useSetupWizard();
  const { user } = useAuth();
  const { activeOrgId } = useOrgStore();
  const { activeICP } = useActiveICP();
  const completed = steps.test.completed;

  const [prospectName, setProspectName] = useState('');
  const [prospectCompany, setProspectCompany] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [agents, setAgents] = useState<AgentStatus[]>(INITIAL_AGENTS);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [streamedContent, setStreamedContent] = useState('');
  const [isFinishing, setIsFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activityIdRef = useRef(0);
  const simulationTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [signOff, setSignOff] = useState('');
  const [suggestions, setSuggestions] = useState<Array<{ name: string; company: string; title: string; email: string }>>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('user_tone_settings')
      .select('email_sign_off')
      .eq('user_id', user.id)
      .eq('content_type', 'email')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.email_sign_off) setSignOff(data.email_sign_off);
      });
  }, [user?.id]);

  // Fetch prospect suggestions from Apollo using active ICP criteria,
  // then call apollo-reveal to unmask real names and get verified emails.
  useEffect(() => {
    if (!activeICP?.criteria || !user?.id) return;

    const criteria = activeICP.criteria as Record<string, unknown>;
    const params: Record<string, unknown> = { per_page: 10 };

    const titleKeywords = criteria.title_keywords as string[] | undefined;
    const seniorityLevels = criteria.seniority_levels as string[] | undefined;
    const departments = criteria.departments as string[] | undefined;
    const industries = criteria.industries as string[] | undefined;
    const employeeRanges = criteria.employee_ranges as Array<{ min: number; max: number }> | undefined;

    if (titleKeywords?.length) params.person_titles = titleKeywords;
    if (seniorityLevels?.length) params.person_seniorities = seniorityLevels;
    if (departments?.length) params.person_departments = departments;
    if (industries?.length) params.q_organization_keyword_tags = industries;
    if (employeeRanges?.length) {
      params.organization_num_employees_ranges = employeeRanges.map(r => `${r.min},${r.max}`);
    }

    const hasFilters = titleKeywords?.length || seniorityLevels?.length || industries?.length;
    if (!hasFilters) return;

    setLoadingSuggestions(true);

    const callApi = async () => {
      const token = await getSupabaseAuthToken();
      const headers = {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const base = import.meta.env.VITE_SUPABASE_URL;

      // Step 1: Search Apollo to get apollo_ids + partial data
      const searchRes = await fetch(`${base}/functions/v1/apollo-search`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });
      if (!searchRes.ok) return;

      const searchData = await searchRes.json();
      const contacts: Record<string, unknown>[] = (searchData.contacts || [])
        .filter((c: Record<string, unknown>) => c.first_name && c.apollo_id)
        .slice(0, 5);

      if (!contacts.length) return;

      // Step 2: Reveal real names + emails via bulk_match using apollo_ids
      const apolloIds = contacts.map(c => c.apollo_id as string);
      const revealRes = await fetch(`${base}/functions/v1/apollo-reveal`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ apollo_ids: apolloIds }),
      });

      if (!revealRes.ok) {
        // Reveal failed — fall back to masked search data
        setSuggestions(
          contacts.map(c => ({
            name: `${c.first_name} ${c.last_name || ''}`.trim(),
            company: (c.company as string) || '',
            title: (c.title as string) || '',
            email: (c.email as string) || '',
          }))
        );
        return;
      }

      const revealData = await revealRes.json();
      const revealMap = new Map<string, Record<string, unknown>>();
      for (const p of (revealData.people || [])) {
        revealMap.set(p.apollo_id, p);
      }

      // Merge reveal data over search data — revealed fields win
      setSuggestions(
        contacts.map(c => {
          const revealed = revealMap.get(c.apollo_id as string);
          return {
            name: revealed?.full_name as string || `${c.first_name} ${c.last_name || ''}`.trim(),
            company: revealed?.company as string || (c.company as string) || '',
            title: revealed?.title as string || (c.title as string) || '',
            email: revealed?.email as string || (c.email as string) || '',
          };
        })
      );
    };

    callApi()
      .catch(() => { /* silently fail — user can still type manually */ })
      .finally(() => setLoadingSuggestions(false));
  }, [activeICP?.id, user?.id]);

  const canGenerate = prospectName.trim().length > 0 && prospectCompany.trim().length > 0;

  // Extract the email: strips preamble thinking text AND postamble explanations
  const extractEmail = (raw: string): string => {
    // Detect failure responses
    const failureSignals = [
      /unable to access/i,
      /technical limitations/i,
      /I recommend:/i,
      /I would need to successfully/i,
      /can't find|cannot find/i,
    ];
    if (failureSignals.some(r => r.test(raw))) return '';

    // Find email start — prefer Subject: at line start first
    const markers = [
      /^Subject:/im,
      /\*\*Subject:?\*\*/i,
      /---\s*\n/,
      /Here'?s (?:your|the) (?:cold )?email:\s*/i,
      /^Hi\s+\w/m,
      /^Hey\s+\w/m,
    ];

    let email = '';
    for (const marker of markers) {
      const match = raw.match(marker);
      if (match && match.index !== undefined) {
        email = raw.slice(match.index).replace(/^---\s*\n/, '').trim();
        if (email.length > 20) break;
        email = '';
      }
    }

    // No email marker found — return empty to avoid showing raw thinking text
    if (!email) return '';

    // Strip postamble — model often adds explanation after the email
    const junkPatterns = [
      /\n\n(?:That'?s |Note:|Here'?s |I'?ve |The email |This email |This opens |Key elements|Why this|Breaking)/i,
      /\n\n\*\*(?:Why|Note|Key|Breaking|That)/i,
    ];
    for (const junk of junkPatterns) {
      const m = email.match(junk);
      if (m && m.index !== undefined) {
        email = email.slice(0, m.index).trim();
      }
    }

    return email.length > 20 ? email : '';
  };

  const addActivity = useCallback((text: string, type: ActivityItem['type'] = 'info') => {
    const id = ++activityIdRef.current;
    setActivities(prev => [...prev.slice(-8), { id, text, type }]);
  }, []);

  const setAgentStatus = useCallback((agentId: string, status: AgentStatus['status']) => {
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, status } : a));
  }, []);

  const startSimulatedResearch = useCallback((name: string, company: string) => {
    // Clear any previous timers
    simulationTimersRef.current.forEach(clearTimeout);
    simulationTimersRef.current = [];

    // Stagger agent activation
    const t1 = setTimeout(() => {
      setAgentStatus('company', 'working');
      addActivity(`Scanning ${company} website and public data...`);
    }, 400);

    const t2 = setTimeout(() => {
      setAgentStatus('prospect', 'working');
      addActivity(`Searching for ${name}'s professional profile...`);
    }, 1200);

    const t3 = setTimeout(() => {
      setAgentStatus('news', 'working');
      addActivity(`Checking recent ${company} news and press releases...`);
    }, 2000);

    // Simulated findings (will be replaced by real SSE events when they arrive)
    const t4 = setTimeout(() => {
      addActivity(`Found ${company} company details and tech stack`, 'finding');
    }, 3500);

    const t5 = setTimeout(() => {
      addActivity(`Identified ${name}'s role and responsibilities`, 'finding');
    }, 5000);

    const t6 = setTimeout(() => {
      addActivity('Analyzing competitive landscape and market position...', 'info');
    }, 6500);

    const t7 = setTimeout(() => {
      addActivity('Discovering personalization angles...', 'info');
    }, 8000);

    simulationTimersRef.current = [t1, t2, t3, t4, t5, t6, t7];
  }, [addActivity, setAgentStatus]);

  const handleGenerate = async () => {
    if (!canGenerate || !activeOrgId) return;

    // Reset state
    setPhase('deploying');
    setStreamedContent('');
    setError(null);
    setAgents(INITIAL_AGENTS);
    setActivities([]);
    activityIdRef.current = 0;

    // Brief "deploying agents" phase
    addActivity('Deploying AI research team...');
    await new Promise(r => setTimeout(r, 600));
    setPhase('researching');

    // Start simulated agent activity (real SSE events will enhance this)
    startSimulatedResearch(prospectName.trim(), prospectCompany.trim());

    const name = prospectName.trim();
    const company = prospectCompany.trim();
    const firstName = (
      (user?.user_metadata?.full_name as string) ||
      (user?.user_metadata?.name as string) ||
      user?.email || ''
    ).split(/[\s@]/)[0];

    const signOffInstruction = signOff
      ? `- End with this exact sign-off (nothing after it):\n${signOff}`
      : `- End with a natural sign-off and my first name: ${firstName || 'my name'}`;

    const prompt = `You must write a cold email to ${name} at ${company}. Follow these steps exactly:

STEP 1 — Use gemini_research with query: "Who is ${name} at ${company}? What is their role, background, and what does ${company} do? Include any recent news or initiatives."

STEP 2 — Use get_skill with skill_key "sales-sequence" to load my writing style preferences (if available).

STEP 3 — Write one cold email using what you found. Rules:
- Under 75 words total
- Open with something specific about THEM (role, company, recent news)
- One clear ask
- Human tone, not a template
${signOffInstruction}

IMPORTANT: Output ONLY the final email. Start directly with "Subject:" — no preamble, no explanation, no commentary before or after the email.`;


    try {
      const token = await getSupabaseAuthToken();
      abortRef.current = new AbortController();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-autonomous`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: prompt,
            organizationId: activeOrgId,
            context: { user_id: user?.id, force_single_agent: true },
            stream: true,
          }),
          signal: abortRef.current.signal,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.error === 'insufficient_credits') {
          throw new Error('Your organization has run out of AI credits. Complete earlier setup steps to earn credits, or top up.');
        }
        throw new Error(errorData.message || errorData.error || `Request failed (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let sawFirstToken = false;
      let toolCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          if (line.startsWith('event: ')) {
            const eventType = line.slice(7);
            const dataLine = lines[i + 1];

            if (dataLine?.startsWith('data: ')) {
              let data: Record<string, unknown>;
              try {
                data = JSON.parse(dataLine.slice(6));
              } catch {
                i++;
                continue;
              }

              switch (eventType) {
                case 'agent_start': {
                  // Real multi-agent event — update agent cards
                  const agentName = (data.displayName as string) || (data.agent as string) || '';
                  const reason = (data.reason as string) || '';
                  addActivity(`${agentName} agent activated${reason ? `: ${reason}` : ''}`, 'info');
                  // Map to our visual agents
                  if (agentName.toLowerCase().includes('company') || agentName.toLowerCase().includes('research')) {
                    setAgentStatus('company', 'working');
                  } else if (agentName.toLowerCase().includes('prospect') || agentName.toLowerCase().includes('people')) {
                    setAgentStatus('prospect', 'working');
                  } else if (agentName.toLowerCase().includes('news') || agentName.toLowerCase().includes('signal')) {
                    setAgentStatus('news', 'working');
                  }
                  break;
                }

                case 'agent_done': {
                  const agentName = (data.displayName as string) || (data.agent as string) || '';
                  addActivity(`${agentName} completed research`, 'complete');
                  if (agentName.toLowerCase().includes('company') || agentName.toLowerCase().includes('research')) {
                    setAgentStatus('company', 'done');
                  } else if (agentName.toLowerCase().includes('prospect') || agentName.toLowerCase().includes('people')) {
                    setAgentStatus('prospect', 'done');
                  } else if (agentName.toLowerCase().includes('news') || agentName.toLowerCase().includes('signal')) {
                    setAgentStatus('news', 'done');
                  }
                  break;
                }

                case 'tool_start': {
                  toolCount++;
                  const toolName = (data.name as string) || '';
                  const toolInput = data.input as Record<string, unknown> | undefined;

                  // Use tool events to drive agent progress in single-agent mode
                  if (toolCount === 1) {
                    setAgentStatus('company', 'working');
                  } else if (toolCount === 2) {
                    setAgentStatus('company', 'done');
                    setAgentStatus('prospect', 'working');
                    addActivity('Company research complete', 'complete');
                  } else if (toolCount === 3) {
                    setAgentStatus('prospect', 'done');
                    setAgentStatus('news', 'working');
                    addActivity('Prospect analysis complete', 'complete');
                  }

                  // Show what tool is doing
                  if (toolName === 'execute_action') {
                    const actionType = (toolInput?.action_type as string) || (toolInput?.skill_key as string) || '';
                    if (actionType) {
                      addActivity(`Executing: ${actionType.replace(/_/g, ' ')}...`);
                    }
                  } else if (toolName === 'get_skill') {
                    addActivity('Loading writing style configuration...', 'info');
                    setAgentStatus('writer', 'working');
                  }
                  break;
                }

                case 'tool_result': {
                  const success = data.success !== false;
                  if (success) {
                    addActivity('Action completed successfully', 'finding');
                  }
                  break;
                }

                case 'synthesis': {
                  // Multi-agent synthesis phase
                  setPhase('synthesizing');
                  setAgentStatus('company', 'done');
                  setAgentStatus('prospect', 'done');
                  setAgentStatus('news', 'done');
                  addActivity('Synthesizing research findings...', 'info');

                  // Stream synthesis content as tokens
                  const synthContent = data.content as string;
                  if (synthContent) {
                    accumulated = synthContent;
                    setStreamedContent(accumulated);
                  }
                  break;
                }

                case 'token': {
                  if (!sawFirstToken) {
                    sawFirstToken = true;
                    // Clear simulation timers
                    simulationTimersRef.current.forEach(clearTimeout);
                    simulationTimersRef.current = [];
                    // Mark all research agents done, activate writer
                    setAgentStatus('company', 'done');
                    setAgentStatus('prospect', 'done');
                    setAgentStatus('news', 'done');
                    setAgentStatus('writer', 'working');
                    setPhase('writing');
                    addActivity('All research complete - composing email...', 'complete');
                  }
                  accumulated += data.text || '';
                  setStreamedContent(accumulated);
                  break;
                }

                case 'message':
                case 'message_complete': {
                  if (data.content && !accumulated) {
                    accumulated = data.content as string;
                    setStreamedContent(accumulated);
                  }
                  break;
                }

                case 'done': {
                  // Mark everything complete
                  setAgentStatus('writer', 'done');
                  break;
                }

                case 'error': {
                  const errorMsg = (data.message as string) || (data.error as string) || 'Research failed';
                  throw new Error(errorMsg);
                }
              }

              i++; // Skip data line
            }
          }
        }
      }

      // Clear simulation timers
      simulationTimersRef.current.forEach(clearTimeout);
      simulationTimersRef.current = [];

      setAgentStatus('writer', 'done');
      setPhase('done');
      addActivity('Email ready for review', 'complete');
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      simulationTimersRef.current.forEach(clearTimeout);
      console.error('Email generation error:', err);
      setError(err.message || 'Failed to generate email');
      setPhase('error');
      toast.error('Failed to generate email. Try again.');
    }
  };

  const handleFinishSetup = async () => {
    if (!user?.id || !activeOrgId) return;
    setIsFinishing(true);
    try {
      await completeStep(user.id, activeOrgId, 'test');
    } finally {
      setIsFinishing(false);
    }
  };

  const isActive = phase !== 'idle' && phase !== 'done' && phase !== 'error';
  const doneAgentCount = agents.filter(a => a.status === 'done').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={cn(
          'flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center',
          completed ? 'bg-green-100 dark:bg-green-900/30' : 'bg-indigo-100 dark:bg-indigo-900/30'
        )}>
          {completed ? (
            <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
          ) : (
            <Zap className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          )}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Write Your First Cold Email
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Enter a real prospect — our AI team will research them and craft a personalized email.
          </p>
        </div>
      </div>

      {/* Input form */}
      {phase === 'idle' && !streamedContent && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/50 p-5 space-y-3">

          {/* ICP-sourced suggestions */}
          {(loadingSuggestions || suggestions.length > 0) && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Target className="w-3 h-3 text-indigo-500" />
                <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  Suggested from your ICP
                </span>
              </div>

              {loadingSuggestions ? (
                <div className="space-y-1.5">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-[42px] rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse" />
                  ))}
                </div>
              ) : (
                suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      const isSelected = selectedSuggestion === i;
                      setSelectedSuggestion(isSelected ? null : i);
                      setProspectName(isSelected ? '' : s.name);
                      setProspectCompany(isSelected ? '' : s.company);
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all text-left',
                      selectedSuggestion === i
                        ? 'border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-indigo-200 dark:hover:border-indigo-700/50'
                    )}
                  >
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                      selectedSuggestion === i
                        ? 'bg-indigo-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    )}>
                      {s.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        'text-xs font-medium truncate',
                        selectedSuggestion === i ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-white'
                      )}>
                        {s.name}
                      </p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                        {[s.title, s.company].filter(Boolean).join(' · ')}
                      </p>
                      {s.email && (
                        <p className="text-[10px] text-green-600 dark:text-green-400 truncate flex items-center gap-0.5 mt-0.5">
                          <Mail className="w-2.5 h-2.5 flex-shrink-0" />
                          {s.email}
                        </p>
                      )}
                    </div>
                    {selectedSuggestion === i && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                    )}
                  </button>
                ))
              )}

              <div className="flex items-center gap-2 pt-0.5">
                <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
                <span className="text-[10px] text-gray-400">or enter your own</span>
                <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
              </div>
            </div>
          )}

          {/* Manual entry inputs */}
          <div className="space-y-2">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={prospectName}
                onChange={(e) => { setProspectName(e.target.value); setSelectedSuggestion(null); }}
                placeholder="Prospect name (e.g. Sarah Johnson)"
                className="pl-9"
                onKeyDown={(e) => e.key === 'Enter' && canGenerate && handleGenerate()}
              />
            </div>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={prospectCompany}
                onChange={(e) => { setProspectCompany(e.target.value); setSelectedSuggestion(null); }}
                placeholder="Company (e.g. Stripe)"
                className="pl-9"
                onKeyDown={(e) => e.key === 'Enter' && canGenerate && handleGenerate()}
              />
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full h-10 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-medium rounded-lg disabled:opacity-50"
          >
            <Search className="w-4 h-4 mr-2" />
            Research & Write Email
          </Button>
        </div>
      )}

      {/* Agent Team Working View */}
      {isActive && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-700/50 bg-gradient-to-b from-indigo-50/80 to-white dark:from-indigo-900/10 dark:to-gray-900/50 overflow-hidden">
          {/* Phase header */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {phase === 'writing' || phase === 'synthesizing' ? (
                  <PenTool className="w-4 h-4 text-indigo-500 animate-pulse" />
                ) : (
                  <Brain className="w-4 h-4 text-indigo-500 animate-pulse" />
                )}
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {phase === 'deploying' && 'Deploying research agents...'}
                  {phase === 'researching' && `Researching ${prospectName} at ${prospectCompany}...`}
                  {phase === 'synthesizing' && 'Synthesizing research findings...'}
                  {phase === 'writing' && 'Composing personalized email...'}
                </span>
              </div>
              <span className="text-[10px] font-medium text-indigo-500 bg-indigo-100 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">
                {doneAgentCount}/{agents.length} agents
              </span>
            </div>
          </div>

          {/* Agent cards grid */}
          <div className="px-4 pb-3">
            <div className="grid grid-cols-4 gap-2">
              {agents.map(agent => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-indigo-100 dark:border-indigo-800/30" />

          {/* Activity feed */}
          {activities.length > 0 && phase !== 'writing' && (
            <div className="px-4 py-3">
              <ActivityFeed items={activities} />
            </div>
          )}

          {/* Streaming email content — only show once Subject: line has arrived */}
          {phase === 'writing' && extractEmail(streamedContent) && (
            <div className="px-4 pb-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Mail className="w-3 h-3 text-indigo-500" />
                <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  Draft Email
                </span>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">
                  {extractEmail(streamedContent)}
                  <span className="inline-block w-1.5 h-4 bg-indigo-500 ml-0.5 animate-pulse rounded-sm align-text-bottom" />
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Completed result */}
      {(phase === 'done' || (phase === 'idle' && streamedContent)) && (() => {
        const emailContent = extractEmail(streamedContent);
        const researchFailed = !emailContent;
        return (
        <div className="space-y-3">
          {researchFailed ? (
            /* Research failed — show retry */
            <div className="rounded-xl border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/10 p-4 space-y-2">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Couldn't find enough data for {prospectName} at {prospectCompany}.
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Try a well-known contact at a larger company, or try again.
              </p>
              <Button
                onClick={() => { setPhase('idle'); setStreamedContent(''); setAgents(INITIAL_AGENTS); setActivities([]); }}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                Try again
              </Button>
            </div>
          ) : (
          <div className="rounded-xl border border-green-200 dark:border-green-700/50 bg-gradient-to-b from-green-50/80 to-white dark:from-green-900/10 dark:to-gray-900/50 overflow-hidden">
            {/* Compact success header */}
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                  Email crafted for {prospectName}
                </span>
              </div>
              <span className="text-[10px] font-medium text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                4 agents used
              </span>
            </div>

            <div className="border-t border-green-100 dark:border-green-800/30" />

            {/* Email content */}
            <div className="px-4 py-3">
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 max-h-[240px] overflow-y-auto">
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">
                  {emailContent}
                </p>
              </div>
            </div>
          </div>
          )}

          {!completed && !researchFailed && (
            <Button
              onClick={handleFinishSetup}
              disabled={isFinishing}
              className="w-full h-11 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-medium rounded-xl"
            >
              {isFinishing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Finishing...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <PartyPopper className="w-4 h-4" />
                  Complete Setup & Earn +20 Credits
                </span>
              )}
            </Button>
          )}
        </div>
      )})()}

      {/* Error */}
      {phase === 'error' && (
        <div className="rounded-xl border border-red-200 dark:border-red-700/50 bg-red-50 dark:bg-red-900/10 p-4 space-y-3">
          <p className="text-xs text-red-600 dark:text-red-400">
            {error || 'Failed to generate email'}
          </p>
          <Button
            onClick={() => { setPhase('idle'); setStreamedContent(''); setAgents(INITIAL_AGENTS); setActivities([]); }}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            Try again
          </Button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentStep('followups')}
          disabled={isActive}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        {phase === 'idle' && !streamedContent && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFinishSetup}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Skip for now
          </Button>
        )}
      </div>
    </div>
  );
}
