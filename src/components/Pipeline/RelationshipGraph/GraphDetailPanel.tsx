import { useState } from 'react';
import { X, Mail, Phone, Video, Linkedin } from 'lucide-react';
import { TIER_COLORS, HEALTH_COLORS } from './constants';
import type { GraphNode, WarmthTier } from './types';
import { GraphTimeline } from './GraphTimeline';
import { GraphAgentActions } from './GraphAgentActions';

interface GraphDetailPanelProps {
  node: GraphNode;
  allNodes: GraphNode[];
  onClose: () => void;
  onSelectContact?: (id: string) => void;
}

type PanelTab = 'overview' | 'timeline' | 'agents';

const SIGNAL_BARS: { label: string; key: keyof GraphNode; color: string }[] = [
  { label: 'Recency', key: 'recency_score', color: '#f97316' },
  { label: 'Engagement', key: 'engagement_score', color: '#eab308' },
  { label: 'Deal Momentum', key: 'deal_momentum_score', color: '#6366f1' },
  { label: 'Multi-Thread', key: 'multi_thread_score', color: '#0ea5e9' },
  { label: 'Sentiment', key: 'sentiment_score', color: '#22c55e' },
];

export function GraphDetailPanel({ node, allNodes, onClose, onSelectContact }: GraphDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('overview');
  const tier: WarmthTier = node.tier ?? 'cold';
  const tierColor = TIER_COLORS[tier];
  const warmthPct = ((node.warmth_score ?? 0) * 100).toFixed(0);
  const delta = node.warmth_delta ?? 0;
  const displayName = node.full_name || `${node.first_name || ''} ${node.last_name || ''}`.trim() || node.email;
  const initial = (node.first_name || node.email)[0]?.toUpperCase() ?? '?';

  return (
    <div
      className="w-[370px] shrink-0 flex flex-col overflow-hidden border-l border-white/[0.08]"
      style={{ background: 'rgba(17,17,24,0.88)', backdropFilter: 'blur(20px)' }}
    >
      {/* Header */}
      <div
        className="px-4 py-3.5 border-b border-white/[0.06]"
        style={{ background: `linear-gradient(135deg, ${tierColor.primary}11, transparent)` }}
      >
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2.5">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[15px] font-bold"
              style={{ background: `linear-gradient(135deg, ${tierColor.primary}, ${tierColor.gradient[1]})` }}
            >
              {initial}
            </div>
            <div>
              <div className="text-gray-100 text-sm font-bold">{displayName}</div>
              <div className="text-gray-400 text-[11px]">
                {node.title}{node.company_obj ? ` \u00b7 ${node.company_obj.name}` : ''}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-gray-400 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Warmth meter */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${warmthPct}%`,
                background: `linear-gradient(90deg, ${tierColor.primary}, ${tierColor.primary}aa)`,
              }}
            />
          </div>
          <span
            className="text-[13px] font-extrabold min-w-[36px] text-right"
            style={{ color: tierColor.primary }}
          >
            {warmthPct}%
          </span>
          {Math.abs(delta) > 0.01 && (
            <span
              className="text-[11px] font-bold"
              style={{ color: delta > 0 ? '#22c55e' : '#ef4444' }}
            >
              {delta > 0 ? '\u2191' : '\u2193'}{Math.abs(delta * 100).toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/[0.06] pl-4">
        {(['overview', 'timeline', 'agents'] as PanelTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-3.5 py-2.5 text-[11px] font-semibold capitalize transition-all"
            style={{
              color: activeTab === tab ? '#e2e8f0' : '#64748b',
              borderBottom: activeTab === tab ? `2px solid ${tierColor.primary}` : '2px solid transparent',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'overview' && (
          <OverviewTab node={node} allNodes={allNodes} tierColor={tierColor} onSelectContact={onSelectContact} />
        )}
        {activeTab === 'timeline' && (
          <GraphTimeline contactId={node.id} orgId={node.owner_id ?? ''} />
        )}
        {activeTab === 'agents' && (
          <GraphAgentActions node={node} />
        )}
      </div>
    </div>
  );
}

function OverviewTab({
  node,
  allNodes,
  tierColor,
  onSelectContact,
}: {
  node: GraphNode;
  allNodes: GraphNode[];
  tierColor: (typeof TIER_COLORS)[WarmthTier];
  onSelectContact?: (id: string) => void;
}) {
  const topDeal = node.deals[0];
  const relatedContacts = node.company_id
    ? allNodes.filter((n) => n.company_id === node.company_id && n.id !== node.id)
    : [];

  return (
    <div className="flex flex-col gap-4">
      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2">
        {([
          { label: 'Meetings', icon: Video },
          { label: 'Emails', icon: Mail },
          { label: 'Calls', icon: Phone },
          { label: 'LinkedIn', icon: Linkedin },
        ] as const).map(({ label, icon: Icon }) => (
          <div
            key={label}
            className="bg-[#1e1e2e]/60 rounded-lg p-2 text-center border border-white/[0.04]"
          >
            <Icon className="w-3 h-3 text-gray-400 mx-auto mb-1" />
            <div className="text-gray-100 text-base font-extrabold">&mdash;</div>
            <div className="text-gray-500 text-[8px] font-semibold">{label}</div>
          </div>
        ))}
      </div>

      {/* 5-signal warmth breakdown */}
      <div>
        <div className="text-gray-400 text-[10px] font-semibold uppercase tracking-wide mb-2">
          Warmth Breakdown
        </div>
        {SIGNAL_BARS.map(({ label, key, color }) => {
          const val = (node[key] as number | null) ?? 0;
          return (
            <div key={label} className="flex items-center gap-2 mb-1.5">
              <span className="text-gray-400 text-[10px] w-20 shrink-0">{label}</span>
              <div className="flex-1 h-[5px] rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${val * 100}%`, background: color }}
                />
              </div>
              <span className="text-gray-100 text-[10px] font-bold w-7 text-right">
                {(val * 100).toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Deal card (will be enriched in RG-012) */}
      {topDeal && (
        <div
          className="bg-[#1e1e2e]/60 rounded-xl p-3 border"
          style={{ borderColor: `${HEALTH_COLORS[(topDeal.health_status as keyof typeof HEALTH_COLORS) ?? 'stalled'] ?? HEALTH_COLORS.stalled}33` }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-gray-100 text-xs font-bold">{topDeal.name}</span>
            <span
              className="text-[10px] font-bold capitalize"
              style={{ color: HEALTH_COLORS[(topDeal.health_status as keyof typeof HEALTH_COLORS) ?? 'stalled'] ?? HEALTH_COLORS.stalled }}
            >
              {topDeal.health_status ?? 'unknown'}
            </span>
          </div>
          <div className="flex gap-3">
            {topDeal.value != null && (
              <div>
                <div className="text-gray-500 text-[9px]">Value</div>
                <div className="text-gray-100 text-xs font-bold">
                  £{(topDeal.value / 1000).toFixed(0)}k
                </div>
              </div>
            )}
            {topDeal.probability != null && (
              <div>
                <div className="text-gray-500 text-[9px]">Probability</div>
                <div
                  className="text-xs font-bold"
                  style={{ color: HEALTH_COLORS[(topDeal.health_status as keyof typeof HEALTH_COLORS) ?? 'stalled'] ?? HEALTH_COLORS.stalled }}
                >
                  {(topDeal.probability * 100).toFixed(0)}%
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI next step */}
      <div
        className="rounded-xl p-3 border"
        style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
          borderColor: 'rgba(99,102,241,0.2)',
        }}
      >
        <div className="text-indigo-300 text-[9px] font-bold uppercase tracking-wider mb-1">
          AI Suggested Next Step
        </div>
        <div className="text-gray-200 text-xs">
          {getAiSuggestion(node)}
        </div>
      </div>

      {/* Trending indicator */}
      {node.trending_direction && node.trending_direction !== 'stable' && (
        <div
          className="rounded-xl p-3 border"
          style={{
            background: `linear-gradient(135deg, ${tierColor.primary}12, transparent)`,
            borderColor: `${tierColor.primary}20`,
          }}
        >
          <div className="text-indigo-300 text-[9px] font-bold uppercase tracking-wider mb-1">
            Trending {node.trending_direction === 'up' ? 'Warmer' : 'Cooler'}
          </div>
          <div className="text-gray-200 text-xs">
            {node.trending_direction === 'up'
              ? 'This contact is becoming more engaged. Consider nurturing the relationship.'
              : 'Engagement is declining. Consider a re-engagement action.'}
          </div>
        </div>
      )}

      {/* Related contacts at same company */}
      {relatedContacts.length > 0 && (
        <div>
          <div className="text-gray-400 text-[10px] font-semibold uppercase tracking-wide mb-2">
            Related at {node.company_obj?.name ?? 'Company'}
          </div>
          <div className="flex flex-col gap-1.5">
            {relatedContacts.map((rc) => {
              const rcTier = rc.tier ?? 'cold';
              const rcName = rc.full_name || `${rc.first_name || ''} ${rc.last_name || ''}`.trim() || rc.email;
              return (
                <button
                  key={rc.id}
                  onClick={() => onSelectContact?.(rc.id)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-[#1e1e2e]/40 hover:bg-[#1e1e2e]/80 border border-white/[0.04] transition-colors text-left w-full"
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                    style={{ background: `linear-gradient(135deg, ${TIER_COLORS[rcTier].primary}, ${TIER_COLORS[rcTier].gradient[1]})` }}
                  >
                    {(rc.first_name || rc.email)[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-gray-200 text-[11px] font-semibold truncate">{rcName}</div>
                    <div className="text-gray-500 text-[9px] truncate">{rc.title}</div>
                  </div>
                  <span
                    className="text-[10px] font-bold shrink-0"
                    style={{ color: TIER_COLORS[rcTier].primary }}
                  >
                    {((rc.warmth_score ?? 0) * 100).toFixed(0)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function getAiSuggestion(node: GraphNode): string {
  const name = node.first_name || node.full_name?.split(' ')[0] || 'this contact';
  const tier = node.tier ?? 'cold';
  const hasDeal = node.deals.length > 0;

  if (tier === 'hot' && hasDeal) return `Send ${name} the contract revision \u2014 they're highly engaged and the deal is progressing.`;
  if (tier === 'hot') return `${name} is very engaged. Schedule a discovery call to explore opportunities.`;
  if (tier === 'warm' && hasDeal) return `Follow up with ${name} on pricing concerns. Keep the momentum going.`;
  if (tier === 'warm') return `Share a relevant case study with ${name} to deepen the relationship.`;
  if (tier === 'cool' && hasDeal) return `Re-engage ${name} with a personalised message about the deal.`;
  if (tier === 'cool') return `Send ${name} a check-in message. The relationship needs attention.`;
  return `Enrich ${name}'s profile and consider a cold reactivation sequence.`;
}
