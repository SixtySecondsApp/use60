import { TIER_COLORS, HEALTH_COLORS } from './constants';
import type { GraphNode, WarmthTier } from './types';

interface GraphTooltipProps {
  node: GraphNode | null;
  position: { x: number; y: number };
}

export function GraphTooltip({ node, position }: GraphTooltipProps) {
  if (!node) return null;

  const tier: WarmthTier = node.tier ?? 'cold';
  const warmthPct = ((node.warmth_score ?? 0) * 100).toFixed(0);
  const delta = node.warmth_delta ?? 0;
  const deltaPct = (delta * 100).toFixed(1);
  const displayName = node.full_name || `${node.first_name || ''} ${node.last_name || ''}`.trim() || node.email;
  const topDeal = node.deals[0];

  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{ left: position.x + 16, top: position.y - 10 }}
    >
      <div className="rounded-xl border border-white/10 bg-[#111118]/95 backdrop-blur-2xl px-3.5 py-2.5 min-w-[180px]">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
            style={{ background: `linear-gradient(135deg, ${TIER_COLORS[tier].primary}, ${TIER_COLORS[tier].gradient[1]})` }}
          >
            {(node.first_name || node.email)[0]?.toUpperCase()}
          </div>
          <div>
            <div className="text-gray-100 text-xs font-bold leading-tight">{displayName}</div>
            <div className="text-gray-400 text-[10px] leading-tight">
              {node.title}{node.company_obj ? ` · ${node.company_obj.name}` : ''}
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1.5">
          <span className="text-gray-500 text-[9px]">Warmth</span>
          <span
            className="text-[10px] font-bold text-right"
            style={{ color: TIER_COLORS[tier].primary }}
          >
            {warmthPct}%
          </span>

          <span className="text-gray-500 text-[9px]">Trend</span>
          <span
            className="text-[10px] font-semibold text-right"
            style={{ color: delta > 0.03 ? '#22c55e' : delta < -0.03 ? '#ef4444' : '#64748b' }}
          >
            {delta > 0 ? '+' : ''}{deltaPct}%
          </span>

          {node.last_interaction_at && (
            <>
              <span className="text-gray-500 text-[9px]">Last</span>
              <span className="text-gray-400 text-[10px] text-right">
                {formatRelativeTime(node.last_interaction_at)}
              </span>
            </>
          )}

          {topDeal && (
            <>
              <span className="text-gray-500 text-[9px]">Deal</span>
              <span
                className="text-[10px] font-semibold text-right"
                style={{ color: HEALTH_COLORS[(topDeal.health_status as keyof typeof HEALTH_COLORS) ?? 'stalled'] ?? HEALTH_COLORS.stalled }}
              >
                {topDeal.value != null ? `£${(topDeal.value / 1000).toFixed(0)}k` : topDeal.name}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}
