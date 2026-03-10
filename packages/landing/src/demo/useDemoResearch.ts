/**
 * useDemoResearch
 *
 * Orchestrates multi-agent research with streaming status updates.
 * Each of 6 agents transitions through idle -> working -> found -> complete.
 *
 * Two phases:
 *   1. Initial animation with generic "working" messages (~6s)
 *   2. API data arrives → agents update with REAL findings → brief hold → complete
 *
 * For real domains, fires a parallel API call to the demo-research edge function;
 * falls back to client-side mock data if the API fails or times out.
 */

import { useState, useCallback, useRef } from 'react';
import type { AgentStatus, ResearchData } from './demo-types';
import { generateResearchFromUrl } from './demo-data';

/** Real-time event from a provider during SSE streaming */
export interface ProviderEvent {
  provider: string;
  status: 'working' | 'complete' | 'error' | 'skipped';
  summary: string;
  durationMs?: number;
  timestamp: number;
}

const INITIAL_AGENTS: AgentStatus[] = [
  { id: 'research', name: 'Research Agent', icon: 'search', status: 'idle', finding: '', detail: '' },
  { id: 'icp', name: 'ICP Agent', icon: 'users', status: 'idle', finding: '', detail: '' },
  { id: 'signal', name: 'Signal Agent', icon: 'bar-chart', status: 'idle', finding: '', detail: '' },
  { id: 'content', name: 'Content Agent', icon: 'file-text', status: 'idle', finding: '', detail: '' },
  { id: 'strategy', name: 'Strategy Agent', icon: 'target', status: 'idle', finding: '', detail: '' },
  { id: 'ops', name: 'Operations Agent', icon: 'zap', status: 'idle', finding: '', detail: '' },
];

// Domains that use client-side fallback only (no API call)
const LOCAL_ONLY_DOMAINS = ['example.com', 'velocitycrm.io'];

const API_TIMEOUT_MS = 55000; // 55s — 5 parallel Gemini + transform can take 40s

/** Fetch real research data from the v2 edge function (multi-source). Falls back to v1. */
async function fetchResearch(url: string): Promise<ResearchData | null> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!supabaseUrl || !anonKey) {
    console.warn('[demo-research] Missing env vars — falling back to mock data');
    return null;
  }

  // Try v2 first (multi-source), fall back to v1
  const endpoints = [
    `${supabaseUrl}/functions/v1/demo-research-v2`,
    `${supabaseUrl}/functions/v1/demo-research`,
  ];

  for (const endpoint of endpoints) {
    const isV2 = endpoint.includes('v2');
    console.log(`[demo-research] Calling ${isV2 ? 'v2' : 'v1'}:`, endpoint);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.warn(`[demo-research] ${isV2 ? 'v2' : 'v1'} non-OK:`, response.status, text);
        if (isV2) continue; // Fall back to v1
        return null;
      }

      const json = await response.json();
      if (json.data?.company?.name) {
        console.log(`[demo-research] ${isV2 ? 'v2' : 'v1'} found:`, json.data.company.name);
      }

      if (!json.success || !json.data) {
        if (isV2) continue;
        return null;
      }
      return json.data as ResearchData;
    } catch (err) {
      console.warn(`[demo-research] ${isV2 ? 'v2' : 'v1'} error:`, err);
      if (isV2) continue; // Fall back to v1
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

/** Fetch research via SSE streaming — emits provider events in real-time, returns final data. */
async function fetchResearchSSE(
  url: string,
  onEvent: (event: ProviderEvent) => void,
): Promise<ResearchData | null> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!supabaseUrl || !anonKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/demo-research-v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) return null;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalData: ResearchData | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      let currentEvent = '';
      let currentData = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          currentData = line.slice(6);
        } else if (line === '' && currentEvent && currentData) {
          // End of event block
          try {
            const parsed = JSON.parse(currentData);
            if (currentEvent === 'provider') {
              onEvent({
                provider: parsed.provider,
                status: parsed.status,
                summary: parsed.summary || '',
                durationMs: parsed.durationMs,
                timestamp: Date.now(),
              });
            } else if (currentEvent === 'complete' && parsed.success && parsed.data) {
              finalData = parsed.data as ResearchData;
            }
          } catch {
            // Skip malformed events
          }
          currentEvent = '';
          currentData = '';
        }
      }
    }

    return finalData;
  } catch (err) {
    console.warn('[demo-research] SSE error:', err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Build agent findings from real ResearchData so the agent screen shows real intelligence. */
function buildRealAgentFindings(data: ResearchData): { id: string; finding: string; detail: string }[] {
  const c = data.company ?? {} as ResearchData['company'];
  const s = data.stats ?? { signals_found: 30, actions_queued: 8, contacts_identified: 5, opportunities_mapped: 3 };
  const hook = data.demo_actions?.cold_outreach?.personalised_hook ?? '';
  const vps = c.value_props ?? [];

  // Build richer detail strings from v2 enrichment data
  const firmographicParts: string[] = [];
  if (c.employee_range) firmographicParts.push(c.employee_range + ' employees');
  if (c.funding_stage) firmographicParts.push(c.funding_stage);
  if (c.headquarters) firmographicParts.push(c.headquarters);
  const firmographicDetail = firmographicParts.join(' · ') || c.icp?.industry || '';

  const techDetail = c.tech_stack?.length
    ? `Tech: ${c.tech_stack.slice(0, 4).join(', ')}`
    : '';

  const newsDetail = c.recent_news?.length
    ? c.recent_news[0].slice(0, 80)
    : '';

  return [
    {
      id: 'research',
      finding: `Found: ${c.name || 'Company'} — ${c.vertical || 'Technology'}`,
      detail: c.product_summary || '',
    },
    {
      id: 'icp',
      finding: `ICP: ${c.icp?.title || 'Decision Maker'}, ${c.icp?.company_size || 'Mid-market'}`,
      detail: firmographicDetail,
    },
    {
      id: 'signal',
      finding: `${s.signals_found} signals, ${s.contacts_identified} contacts identified`,
      detail: newsDetail || `${s.opportunities_mapped} opportunities mapped`,
    },
    {
      id: 'content',
      finding: `Mapped ${vps.length || 3} value propositions`,
      detail: techDetail || vps.join(' · ') || '',
    },
    {
      id: 'strategy',
      finding: `${s.actions_queued} outreach angles identified`,
      detail: hook ? hook.slice(0, 80) + '…' : '',
    },
    {
      id: 'ops',
      finding: `All agents ready — ${s.signals_found} signals, ${s.actions_queued} actions queued`,
      detail: '',
    },
  ];
}

/** Deep-merge API data with mock fallback — fills any empty sections from mock. */
function mergeResearchData(api: ResearchData, mock: ResearchData): ResearchData {
  const hasCompany = api.company?.name && api.company.name !== api.company.domain;
  const da = api.demo_actions ?? {} as ResearchData['demo_actions'];
  const md = mock.demo_actions;

  return {
    company: hasCompany ? api.company : { ...mock.company, domain: api.company?.domain || mock.company.domain },
    demo_actions: {
      cold_outreach: da.cold_outreach?.target_name ? da.cold_outreach : md.cold_outreach,
      proposal_draft: da.proposal_draft?.proposal_title ? da.proposal_draft : md.proposal_draft,
      meeting_prep: da.meeting_prep?.attendee_name ? da.meeting_prep : md.meeting_prep,
      pipeline_action: da.pipeline_action?.deal_name ? da.pipeline_action : md.pipeline_action,
    },
    stats: api.stats ?? mock.stats,
    copilot_responses: api.copilot_responses,
    suggested_skills: api.suggested_skills,
  };
}

interface UseDemoResearchReturn {
  agents: AgentStatus[];
  isRunning: boolean;
  isComplete: boolean;
  isAnimationDone: boolean;
  research: ResearchData | null;
  providerEvents: ProviderEvent[];
  start: (url: string) => void;
  reset: () => void;
}

export function useDemoResearch(): UseDemoResearchReturn {
  const [agents, setAgents] = useState<AgentStatus[]>(INITIAL_AGENTS);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isAnimationDone, setIsAnimationDone] = useState(false);
  const [research, setResearch] = useState<ResearchData | null>(null);
  const [providerEvents, setProviderEvents] = useState<ProviderEvent[]>([]);
  const abortRef = useRef(false);

  const updateAgent = (
    id: string,
    updates: Partial<AgentStatus>,
    prev: AgentStatus[]
  ): AgentStatus[] =>
    prev.map((a) => (a.id === id ? { ...a, ...updates } : a));

  const start = useCallback((url: string) => {
    abortRef.current = false;
    setIsRunning(true);
    setIsComplete(false);
    setIsAnimationDone(false);
    setResearch(null);
    setProviderEvents([]);
    setAgents(INITIAL_AGENTS);

    const domain = url
      .replace(/^(https?:\/\/)?(www\.)?/, '')
      .replace(/\/.*$/, '')
      .toLowerCase();

    const isLocalOnly = LOCAL_ONLY_DOMAINS.includes(domain);
    const mockData = generateResearchFromUrl(url);

    // Fire API call in parallel for real domains — try SSE first, fall back to JSON
    const onProviderEvent = (event: ProviderEvent) => {
      if (abortRef.current) return;
      setProviderEvents((prev) => [...prev, event]);
    };

    const apiPromise: Promise<ResearchData | null> = isLocalOnly
      ? Promise.resolve(null)
      : fetchResearchSSE(url, onProviderEvent).then((data) => {
          // If SSE returned data, use it; otherwise fall back to JSON
          if (data) return data;
          console.log('[demo-research] SSE returned no data, falling back to JSON');
          return fetchResearch(url);
        });

    // Phase 1: Generic "working" animation — shows agents are active
    // Uses domain-only text (no fake findings) while we wait for real data
    // Tighter stagger (150-350ms) for a snappy cascade
    const workingTimeline: { delay: number; agentId: string; updates: Partial<AgentStatus> }[] = [
      { delay: 150,  agentId: 'research', updates: { status: 'working', finding: `Scanning ${domain}…` } },
      { delay: 350,  agentId: 'icp',      updates: { status: 'working', finding: 'Building ideal customer profile…' } },
      { delay: 300,  agentId: 'signal',   updates: { status: 'working', finding: 'Analysing market signals…' } },
      { delay: 300,  agentId: 'content',  updates: { status: 'working', finding: 'Mapping product positioning…' } },
      { delay: 300,  agentId: 'strategy', updates: { status: 'working', finding: 'Identifying outreach angles…' } },
      { delay: 250,  agentId: 'ops',      updates: { status: 'working', finding: 'Preparing agent configurations…' } },
    ];

    let cumulativeDelay = 0;
    workingTimeline.forEach((event) => {
      cumulativeDelay += event.delay;
      const d = cumulativeDelay;
      setTimeout(() => {
        if (abortRef.current) return;
        setAgents((prev) => updateAgent(event.agentId, event.updates, prev));
      }, d);
    });

    const allWorkingTime = cumulativeDelay + 200;

    // Mark initial animation done (all agents show "working")
    setTimeout(() => {
      if (!abortRef.current) setIsAnimationDone(true);
    }, allWorkingTime);

    // Phase 2: When API data arrives, update agents with REAL findings
    apiPromise.then((apiData) => {
      if (abortRef.current) return;

      // Deep-merge: use API data but fill missing sections from mock
      const finalData = apiData ? mergeResearchData(apiData, mockData) : mockData;
      const realFindings = buildRealAgentFindings(finalData);

      console.log('[demo-research] Using:', apiData ? 'API data' : 'mock fallback', 'company:', finalData.company.name);

      // Stagger real findings across agents for a satisfying reveal
      // Faster stagger (120ms) — keeps momentum while being readable
      realFindings.forEach((item, i) => {
        setTimeout(() => {
          if (abortRef.current) return;
          setAgents((prev) => updateAgent(item.id, {
            status: 'found',
            finding: item.finding,
            detail: item.detail,
          }, prev));
        }, i * 120);
      });

      // After all findings revealed, mark complete with a brief hold
      const revealTime = realFindings.length * 120 + 300;
      setTimeout(() => {
        if (abortRef.current) return;
        // Mark all agents complete
        setAgents((prev) =>
          prev.map((a) => ({ ...a, status: 'complete' as const }))
        );
      }, revealTime);

      // Set research data and mark complete after user sees findings
      setTimeout(() => {
        if (abortRef.current) return;
        setResearch(finalData);
        setIsRunning(false);
        setIsComplete(true);
      }, revealTime + 400);
    });
  }, []);

  const reset = useCallback(() => {
    abortRef.current = true;
    setAgents(INITIAL_AGENTS);
    setIsRunning(false);
    setIsComplete(false);
    setIsAnimationDone(false);
    setResearch(null);
    setProviderEvents([]);
  }, []);

  return { agents, isRunning, isComplete, isAnimationDone, research, providerEvents, start, reset };
}
