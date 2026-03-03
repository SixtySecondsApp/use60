import { useMemo } from 'react';
import { Search, Building2 } from 'lucide-react';
import { TIER_COLORS } from './constants';
import type { GraphNode, WarmthTier } from './types';

interface GraphToolbarProps {
  filter: WarmthTier | null;
  onFilterChange: (tier: WarmthTier | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
  nodes: GraphNode[];
  allContactCount: number;
  clustered: boolean;
  onClusteredChange: (value: boolean) => void;
}

const TIERS: WarmthTier[] = ['hot', 'warm', 'cool', 'cold'];

export function GraphToolbar({ filter, onFilterChange, search, onSearchChange, nodes, allContactCount, clustered, onClusteredChange }: GraphToolbarProps) {
  const tierCounts = useMemo(() => {
    const counts: Record<WarmthTier, number> = { hot: 0, warm: 0, cool: 0, cold: 0 };
    nodes.forEach((n) => { counts[n.tier ?? 'cold']++; });
    return counts;
  }, [nodes]);

  const pipelineValue = useMemo(() => {
    const seen = new Set<string>();
    let total = 0;
    nodes.forEach((n) => {
      n.deals.forEach((d) => {
        if (!seen.has(d.id) && d.value != null) {
          seen.add(d.id);
          total += d.value;
        }
      });
    });
    return total;
  }, [nodes]);

  const trendingUp = useMemo(() => nodes.filter((n) => (n.warmth_delta ?? 0) > 0.03).length, [nodes]);
  const trendingDown = useMemo(() => nodes.filter((n) => (n.warmth_delta ?? 0) < -0.03).length, [nodes]);

  return (
    <div className="flex items-center gap-2.5 px-4 py-2 border-b border-white/[0.06] bg-[#111118]/70 shrink-0">
      {/* Tier filter buttons */}
      {TIERS.map((t) => {
        const active = filter === t;
        return (
          <button
            key={t}
            onClick={() => onFilterChange(active ? null : t)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold capitalize transition-all"
            style={{
              borderColor: active ? TIER_COLORS[t].primary : 'rgba(100,116,139,0.2)',
              background: active ? `${TIER_COLORS[t].primary}22` : 'rgba(30,30,46,0.5)',
              color: active ? TIER_COLORS[t].primary : '#94a3b8',
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: TIER_COLORS[t].primary }}
            />
            {t}
            <span className="text-gray-500 text-[11px]">{tierCounts[t]}</span>
          </button>
        );
      })}

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      {/* Stats */}
      <span className="text-gray-500 text-[11px]">Contacts</span>
      <span className="text-gray-100 text-xs font-bold">{allContactCount}</span>

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      <span className="text-gray-500 text-[11px]">Pipeline</span>
      <span className="text-gray-100 text-xs font-bold">
        £{pipelineValue >= 1000 ? `${(pipelineValue / 1000).toFixed(1)}k` : pipelineValue}
      </span>

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      <span className="text-gray-500 text-[11px]">Trending</span>
      <span className="text-green-500 text-xs font-bold">{trendingUp} ↑</span>
      <span className="text-red-500 text-xs font-bold ml-0.5">{trendingDown} ↓</span>

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      {/* Cluster toggle */}
      <button
        onClick={() => onClusteredChange(!clustered)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-all"
        style={{
          borderColor: clustered ? '#6366f1' : 'rgba(100,116,139,0.2)',
          background: clustered ? 'rgba(99,102,241,0.15)' : 'rgba(30,30,46,0.5)',
          color: clustered ? '#a5b4fc' : '#94a3b8',
        }}
      >
        <Building2 className="w-3 h-3" />
        Company
      </button>

      {/* Search */}
      <div className="ml-auto relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search contacts..."
          className="bg-[#1e1e2e]/80 border border-gray-600/30 rounded-lg pl-8 pr-3 py-1.5 text-gray-200 text-xs w-44 outline-none focus:border-indigo-500/40 placeholder:text-gray-600"
        />
      </div>
    </div>
  );
}
