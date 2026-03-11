/**
 * ActivityLogTerminal — Terminal-style live activity log for GoldenEye
 *
 * Read-only view of ai_cost_events showing:
 * username, timestamp, tokens in/out, provider/model, cost in GBP
 *
 * Cost is computed client-side: (input_tokens * input_rate + output_tokens * output_rate) / 1M
 * Rates come from the ai_models table (set in USD), then converted to GBP using daily FX rate.
 *
 * Auto-scrolls to top on new entries. Supports 200+ rows with virtualization.
 */

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { TerminalSquare, ChevronDown } from 'lucide-react';
import type { RecentEvent, LLMEndpoint } from '@/lib/hooks/useGoldenEyeData';
import { formatTokens } from '@/lib/types/aiModels';

// ─── FX Rate ────────────────────────────────────────────────────────────

const FX_CACHE_KEY = 'goldeneye_usd_gbp_fx';
const FX_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours
const FX_FALLBACK = 0.79; // reasonable fallback if API fails

interface FxCache {
  rate: number;
  fetchedAt: number;
}

function useFxRate(): number {
  const [rate, setRate] = useState<number>(() => {
    try {
      const cached = localStorage.getItem(FX_CACHE_KEY);
      if (cached) {
        const parsed: FxCache = JSON.parse(cached);
        if (Date.now() - parsed.fetchedAt < FX_CACHE_TTL) return parsed.rate;
      }
    } catch { /* ignore */ }
    return FX_FALLBACK;
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchRate() {
      try {
        // Free, no-auth API for daily FX rates
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        if (!res.ok) return;
        const data = await res.json();
        const gbp = data?.rates?.GBP;
        if (typeof gbp === 'number' && !cancelled) {
          setRate(gbp);
          localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ rate: gbp, fetchedAt: Date.now() }));
        }
      } catch { /* use cached or fallback */ }
    }

    // Only fetch if cache is stale
    try {
      const cached = localStorage.getItem(FX_CACHE_KEY);
      if (cached) {
        const parsed: FxCache = JSON.parse(cached);
        if (Date.now() - parsed.fetchedAt < FX_CACHE_TTL) return;
      }
    } catch { /* fetch anyway */ }

    fetchRate();
    return () => { cancelled = true; };
  }, []);

  return rate;
}

/** Format USD amount as GBP, rounded up to nearest 0.01 */
function formatGbp(usd: number, fxRate: number): string {
  const gbp = Math.ceil(usd * fxRate * 100) / 100;
  return `£${gbp.toFixed(2)}`;
}

// ─── Types ──────────────────────────────────────────────────────────────

interface ActivityLogTerminalProps {
  events: RecentEvent[];
  llmEndpoints: LLMEndpoint[];
  isPaused: boolean;
}

/** Known dummy token pairs logged by edge functions with hardcoded values */
const DUMMY_TOKEN_PAIRS = new Set(['500/400', '1000/800', '800/600', '0/0']);

function isDummyTokens(inT: number, outT: number): boolean {
  return DUMMY_TOKEN_PAIRS.has(`${inT}/${outT}`);
}

type RateMap = Map<string, { inputRate: number; outputRate: number }>;

function buildRateMap(endpoints: LLMEndpoint[]): RateMap {
  const map: RateMap = new Map();
  for (const ep of endpoints) {
    map.set(ep.model_id, {
      inputRate: ep.input_cost_per_million || 0,
      outputRate: ep.output_cost_per_million || 0,
    });
  }
  return map;
}

function computeUsdCost(event: RecentEvent, rates: RateMap): number | null {
  const r = rates.get(event.model);
  if (!r) return null;
  return (event.input_tokens * r.inputRate + event.output_tokens * r.outputRate) / 1_000_000;
}

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: 'text-amber-400',
  google: 'text-blue-400',
  openrouter: 'text-indigo-400',
  kimi: 'text-emerald-400',
};

// Blues, greens, purples, yellows — distinct on dark background
const USER_COLORS = [
  'text-sky-400',
  'text-emerald-400',
  'text-violet-400',
  'text-yellow-300',
  'text-blue-300',
  'text-green-400',
  'text-purple-400',
  'text-amber-300',
  'text-cyan-300',
  'text-lime-400',
  'text-indigo-300',
  'text-teal-300',
  'text-fuchsia-400',
  'text-yellow-200',
  'text-blue-400',
  'text-emerald-300',
];

/** Named overrides for specific users */
const USER_COLOR_OVERRIDES: Record<string, string> = {
  'andrew bryce': 'text-teal-300',
};

/** Deterministic hash → colour index so each user always gets the same colour */
function userColor(userId: string, userName: string | null): string {
  // Check for named override first
  if (userName) {
    const override = USER_COLOR_OVERRIDES[userName.toLowerCase()];
    if (override) return override;
  }

  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${min}`;
}

function shortenModel(model: string): string {
  let s = model
    .replace('claude-', '')
    .replace('gemini-', '')
    .replace('deepseek/', '')
    .replace('meta/', '');

  // Strip trailing date stamps (e.g. -20251001, -20250514)
  s = s.replace(/-\d{8}$/, '');

  // Convert version separators: "4-6" → "4.6", "3-5" → "3.5", "2-5" → "2.5"
  // Matches a digit-dash-digit pair that looks like a version number
  s = s.replace(/(\d)-(\d)(?!\d)/g, '$1.$2');

  return s;
}

interface LogRowProps {
  event: RecentEvent;
  rates: RateMap;
  fxRate: number;
}

const SALMON = 'text-[#fa8072]';

function LogRow({ event, rates, fxRate }: LogRowProps) {
  const isTest = event.feature === 'test_burst';
  const providerColor = isTest ? SALMON : (PROVIDER_COLORS[event.provider] || 'text-slate-400');
  const name = event.user_name || event.user_email?.split('@')[0] || event.user_id.slice(0, 8);
  const isFlagged = event.is_flagged;
  const dummy = isDummyTokens(event.input_tokens, event.output_tokens);
  const usdCost = computeUsdCost(event, rates);

  return (
    <div
      className={`grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] gap-1 px-2 py-1 text-[10px] font-mono border-b border-slate-800/30 hover:bg-slate-800/30 transition-colors ${
        isFlagged ? 'bg-orange-950/20' : ''
      }`}
    >
      {/* Timestamp */}
      <span className={`${isTest ? SALMON : 'text-slate-500'} border-r border-slate-700/40 pr-1`} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {formatTimestamp(event.created_at)}
      </span>

      {/* Username */}
      <span className={`${isTest ? SALMON : userColor(event.user_id, event.user_name)} truncate border-r border-slate-700/40 pr-1`} title={event.user_email || undefined}>
        {isFlagged && <span className="text-orange-400 mr-0.5" title={event.flag_reason}>!</span>}
        {name}
      </span>

      {/* Provider / Model */}
      <span className={`${providerColor} truncate text-left w-full border-r border-slate-700/40 pr-1`} title={`${event.provider}/${event.model}`}>
        {isTest ? 'TEST ' : ''}{shortenModel(event.model)}
      </span>

      {/* Tokens in/out */}
      <span className="whitespace-nowrap border-r border-slate-700/40 pr-1" title={dummy ? 'Estimated — tokens may be approximate' : undefined}>
        <span className={isTest ? SALMON : dummy ? 'text-slate-500' : 'text-indigo-300'}>{formatTokens(event.input_tokens)}</span>
        <span className={isTest ? SALMON : 'text-slate-600'}>/</span>
        <span className={isTest ? SALMON : dummy ? 'text-slate-500' : 'text-emerald-300'}>{formatTokens(event.output_tokens)}</span>
        {dummy && !isTest && <span className="text-orange-400/60 ml-0.5" title="Hardcoded token count — not from API response">~</span>}
      </span>

      {/* Cost — computed in GBP from USD rates × FX */}
      <span
        className={`${isTest ? SALMON : 'text-yellow-300/80'} text-right`}
        title={usdCost != null ? `$${usdCost.toFixed(4)} USD × ${fxRate.toFixed(4)} FX` : 'No rate for this model'}
      >
        {formatGbp(usdCost ?? 0, fxRate)}
      </span>
    </div>
  );
}

export function ActivityLogTerminal({ events, llmEndpoints, isPaused }: ActivityLogTerminalProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const prevCountRef = useRef(events.length);

  const rates = useMemo(() => buildRateMap(llmEndpoints), [llmEndpoints]);
  const fxRate = useFxRate();

  // Track new events when not at bottom
  useEffect(() => {
    const diff = events.length - prevCountRef.current;
    if (diff > 0 && !atBottom) {
      setNewCount(prev => prev + diff);
    }
    prevCountRef.current = events.length;
  }, [events.length, atBottom]);

  // Auto-scroll when at bottom and new events arrive
  useEffect(() => {
    if (atBottom && events.length > 0) {
      virtuosoRef.current?.scrollToIndex({ index: 0, behavior: 'smooth' });
    }
  }, [events.length, atBottom]);

  const scrollToTop = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ index: 0, behavior: 'smooth' });
    setNewCount(0);
  }, []);

  // Sum real USD costs and tokens from events within the last 24 hours
  // computeUsdCost derives from ai_models pricing; never fall back to
  // estimated_cost which stores credit units, not USD.
  const totals24h = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return events.reduce(
      (acc, e) => {
        if (new Date(e.created_at).getTime() >= cutoff) {
          const usd = computeUsdCost(e, rates);
          acc.cost += usd ?? 0;
          acc.tokensIn += e.input_tokens || 0;
          acc.tokensOut += e.output_tokens || 0;
        }
        return acc;
      },
      { cost: 0, tokensIn: 0, tokensOut: 0 }
    );
  }, [events, rates]);

  return (
    <div className="flex flex-col h-full bg-[#0a0f1a] border-l border-slate-800/50">
      {/* Terminal header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0d1321] border-b border-slate-800/50 shrink-0">
        <div className="flex items-center gap-2">
          <TerminalSquare className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
            Activity Log
          </span>
          {!isPaused && (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </div>
        <span className="text-[10px] text-slate-600 font-mono">
          {events.length} events
        </span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] gap-1 pl-2 pr-[18px] py-1 text-[9px] font-mono text-slate-600 uppercase tracking-wider border-b border-slate-800/50 shrink-0 bg-[#0d1321]/50">
        <span className="border-r border-slate-700/40 pr-1">Time</span>
        <span className="border-r border-slate-700/40 pr-1">User</span>
        <span className="border-r border-slate-700/40 pr-1">Model</span>
        <span className="border-r border-slate-700/40 pr-1">In/Out</span>
        <span className="text-right">GBP</span>
      </div>

      {/* Scrollable log body */}
      <div className="flex-1 min-h-0 relative">
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-600 text-xs font-mono">
            Waiting for events...
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={events}
            itemContent={(_, event) => <LogRow event={event} rates={rates} fxRate={fxRate} />}
            atTopStateChange={setAtBottom}
            className="scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700"
          />
        )}

        {/* New events indicator */}
        {newCount > 0 && !atBottom && (
          <button
            onClick={scrollToTop}
            className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600/80 text-white text-[10px] font-mono backdrop-blur hover:bg-emerald-500/80 transition-colors"
          >
            <ChevronDown className="h-3 w-3 rotate-180" />
            {newCount} new
          </button>
        )}
      </div>

      {/* Sticky 24hr totals footer — same grid as rows */}
      <div className="shrink-0 grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] gap-1 pl-2 pr-[18px] py-1.5 bg-[#0d1321] border-t border-slate-800/50 font-mono text-[10px] items-center">
        <span className="text-slate-500 uppercase tracking-wider border-r border-slate-700/40 pr-1">24hr</span>
        <span className="text-slate-500 uppercase tracking-wider border-r border-slate-700/40 pr-1">Total</span>
        <span className="border-r border-slate-700/40" />
        <span className="whitespace-nowrap border-r border-slate-700/40 pr-1">
          <span className="text-indigo-300 font-semibold">{formatTokens(totals24h.tokensIn)}</span>
          <span className="text-slate-600">/</span>
          <span className="text-emerald-300 font-semibold">{formatTokens(totals24h.tokensOut)}</span>
        </span>
        <span className="text-yellow-300 font-semibold text-right">{formatGbp(totals24h.cost, fxRate)}</span>
      </div>
    </div>
  );
}
