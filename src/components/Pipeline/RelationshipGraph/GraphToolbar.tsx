import { useMemo, useState } from 'react';
import { Search, Building2, EyeOff, Eye, RotateCcw, ChevronDown, Users, MousePointerSquareDashed, Database } from 'lucide-react';
import { TIER_COLORS } from './constants';
import type { GraphNode, WarmthTier, ContactCategory, ContactSource } from './types';

const SOURCES: { value: ContactSource; label: string; color: string }[] = [
  { value: 'app', label: '60', color: '#6366f1' },
  { value: 'hubspot', label: 'HubSpot', color: '#ff7a59' },
  { value: 'attio', label: 'Attio', color: '#6c5ce7' },
];

const CATEGORIES: { value: ContactCategory; label: string; color: string }[] = [
  { value: 'prospect', label: 'Prospects', color: '#6366f1' },
  { value: 'client', label: 'Clients', color: '#22c55e' },
  { value: 'partner', label: 'Partners', color: '#0ea5e9' },
  { value: 'supplier', label: 'Suppliers', color: '#f59e0b' },
  { value: 'employee', label: 'Employees', color: '#94a3b8' },
  { value: 'investor', label: 'Investors', color: '#a78bfa' },
  { value: 'other', label: 'Other', color: '#64748b' },
];

interface GraphToolbarProps {
  filter: WarmthTier | null;
  onFilterChange: (tier: WarmthTier | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
  nodes: GraphNode[];
  allContactCount: number;
  clustered: boolean;
  onClusteredChange: (value: boolean) => void;
  hideNoInteraction: boolean;
  onHideNoInteractionChange: (value: boolean) => void;
  excludedCount: number;
  onClearExcluded: () => void;
  excludedCategories: Set<ContactCategory>;
  onToggleCategory: (cat: ContactCategory) => void;
  multiSelectMode: boolean;
  onToggleMultiSelect: () => void;
  selectedCount: number;
  activeSources: Set<ContactSource>;
  onToggleSource: (source: ContactSource) => void;
}

const TIERS: WarmthTier[] = ['hot', 'warm', 'cool', 'cold'];

export function GraphToolbar({ filter, onFilterChange, search, onSearchChange, nodes, allContactCount, clustered, onClusteredChange, hideNoInteraction, onHideNoInteractionChange, excludedCount, onClearExcluded, excludedCategories, onToggleCategory, multiSelectMode, onToggleMultiSelect, selectedCount, activeSources, onToggleSource }: GraphToolbarProps) {
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);

  const tierCounts = useMemo(() => {
    const counts: Record<WarmthTier, number> = { hot: 0, warm: 0, cool: 0, cold: 0 };
    nodes.forEach((n) => { counts[n.tier ?? 'cold']++; });
    return counts;
  }, [nodes]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    nodes.forEach((n) => {
      const cat = n.category ?? 'prospect';
      counts[cat] = (counts[cat] || 0) + 1;
    });
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
    <div className="flex items-center gap-2.5 px-4 py-2 border-b border-white/[0.06] bg-[#111118]/70 shrink-0 flex-wrap">
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

      {/* Source filter buttons */}
      {SOURCES.map((s) => {
        const active = activeSources.has(s.value);
        return (
          <button
            key={s.value}
            onClick={() => onToggleSource(s.value)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-all"
            style={{
              borderColor: active ? s.color : 'rgba(100,116,139,0.2)',
              background: active ? `${s.color}22` : 'rgba(30,30,46,0.5)',
              color: active ? s.color : '#94a3b8',
            }}
          >
            <Database className="w-3 h-3" />
            {s.label}
          </button>
        );
      })}

      <div className="w-px h-5 bg-white/[0.08] mx-1" />

      {/* Category filter dropdown */}
      <div className="relative">
        <button
          onClick={() => setShowCategoryMenu(!showCategoryMenu)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-all"
          style={{
            borderColor: excludedCategories.size > 0 ? '#f59e0b' : 'rgba(100,116,139,0.2)',
            background: excludedCategories.size > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(30,30,46,0.5)',
            color: excludedCategories.size > 0 ? '#fbbf24' : '#94a3b8',
          }}
        >
          <Users className="w-3 h-3" />
          Type
          {excludedCategories.size > 0 && (
            <span className="text-[10px] text-amber-400">-{excludedCategories.size}</span>
          )}
          <ChevronDown className="w-3 h-3" />
        </button>

        {showCategoryMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowCategoryMenu(false)} />
            <div className="absolute top-full left-0 mt-1 z-50 bg-[#1a1a2e] border border-white/[0.1] rounded-lg shadow-xl py-1 min-w-[160px]">
              {CATEGORIES.map((cat) => {
                const isExcluded = excludedCategories.has(cat.value);
                const count = categoryCounts[cat.value] || 0;
                return (
                  <button
                    key={cat.value}
                    onClick={() => onToggleCategory(cat.value)}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] hover:bg-white/[0.06] transition-colors"
                    style={{ color: isExcluded ? '#64748b' : '#e2e8f0' }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: isExcluded ? '#334155' : cat.color }}
                    />
                    <span className={`flex-1 text-left ${isExcluded ? 'line-through' : ''}`}>
                      {cat.label}
                    </span>
                    <span className="text-gray-500">{count}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

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

      {/* Hide no-interaction toggle */}
      <button
        onClick={() => onHideNoInteractionChange(!hideNoInteraction)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-all"
        style={{
          borderColor: hideNoInteraction ? '#f59e0b' : 'rgba(100,116,139,0.2)',
          background: hideNoInteraction ? 'rgba(245,158,11,0.15)' : 'rgba(30,30,46,0.5)',
          color: hideNoInteraction ? '#fbbf24' : '#94a3b8',
        }}
      >
        {hideNoInteraction ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        {hideNoInteraction ? 'Engaged only' : 'All contacts'}
      </button>

      {/* Multi-select toggle */}
      <button
        onClick={onToggleMultiSelect}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-all"
        style={{
          borderColor: multiSelectMode ? '#6366f1' : 'rgba(100,116,139,0.2)',
          background: multiSelectMode ? 'rgba(99,102,241,0.15)' : 'rgba(30,30,46,0.5)',
          color: multiSelectMode ? '#a5b4fc' : '#94a3b8',
        }}
      >
        <MousePointerSquareDashed className="w-3 h-3" />
        Select
        {selectedCount > 0 && (
          <span className="text-[10px] bg-indigo-500/30 px-1.5 rounded-full text-indigo-300">{selectedCount}</span>
        )}
      </button>

      {/* Excluded contacts reset */}
      {excludedCount > 0 && (
        <button
          onClick={onClearExcluded}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-red-500/30 bg-red-500/10 text-[11px] font-semibold text-red-400 transition-all hover:bg-red-500/20"
        >
          <RotateCcw className="w-3 h-3" />
          {excludedCount} hidden
        </button>
      )}

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
