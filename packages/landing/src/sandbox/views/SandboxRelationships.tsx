/**
 * SandboxRelationships
 *
 * Uses the production RelationshipGraph components (types, constants, toolbar, tooltip)
 * directly from the main app via @graph alias. Same D3 radial rendering engine,
 * same visual output — just with mock data instead of Supabase queries.
 */

import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { X, Mail, Phone, Video, Linkedin } from 'lucide-react';

// Production graph components — imported directly from main app
import {
  ORBIT_RADII,
  ZOOM_EXTENT,
  CENTRE_NODE_RADIUS,
  TIER_COLORS,
  HEALTH_COLORS,
  NODE_SIZE_MIN,
  NODE_SIZE_MAX,
  COLD_CLUSTER_SIZE,
  COLD_MAX_DISPLAY,
  CLUSTER_NODE_RADIUS,
} from '@graph/constants';
import { GraphToolbar } from '@graph/GraphToolbar';
import { GraphTooltip } from '@graph/GraphTooltip';
import type {
  GraphNode,
  GraphContact,
  WarmthTier,
  ContactCategory,
  ColdCluster,
} from '@graph/types';

// ---------------------------------------------------------------------------
// Mock data — realistic contacts across warmth tiers
// ---------------------------------------------------------------------------

const MOCK_COMPANIES = [
  { id: 'c1', name: 'DataFlow Systems', industry: 'SaaS', domain: 'dataflow.io' },
  { id: 'c2', name: 'TechVault', industry: 'Cloud Infrastructure', domain: 'techvault.com' },
  { id: 'c3', name: 'Quantum Labs', industry: 'AI/ML', domain: 'quantumlabs.ai' },
  { id: 'c4', name: 'BrightPath Analytics', industry: 'Analytics', domain: 'brightpath.co' },
  { id: 'c5', name: 'NovaCRM', industry: 'CRM', domain: 'novacrm.io' },
  { id: 'c6', name: 'Meridian Group', industry: 'Consulting', domain: 'meridiangroup.com' },
  { id: 'c7', name: 'Apex Solutions', industry: 'FinTech', domain: 'apexsolutions.co' },
  { id: 'c8', name: 'BlueShift Media', industry: 'Marketing', domain: 'blueshift.media' },
];

const MOCK_DEALS = [
  { id: 'd1', name: 'DataFlow Enterprise', value: 42000, stage_id: 's3', probability: 0.75, status: 'open', health_status: 'strong', health_score: 85, role: 'champion' },
  { id: 'd2', name: 'TechVault Cloud Migration', value: 28000, stage_id: 's2', probability: 0.55, status: 'open', health_status: 'healthy', health_score: 68, role: 'decision-maker' },
  { id: 'd3', name: 'Quantum AI Platform', value: 65000, stage_id: 's4', probability: 0.85, status: 'open', health_status: 'strong', health_score: 92, role: 'champion' },
  { id: 'd4', name: 'BrightPath Dashboard', value: 15000, stage_id: 's1', probability: 0.30, status: 'open', health_status: 'at-risk', health_score: 35, role: 'stakeholder' },
  { id: 'd5', name: 'NovaCRM Integration', value: 22000, stage_id: 's2', probability: 0.45, status: 'open', health_status: 'healthy', health_score: 55, role: 'decision-maker' },
  { id: 'd6', name: 'Apex FinTech Suite', value: 38000, stage_id: 's3', probability: 0.65, status: 'open', health_status: 'stalled', health_score: 42, role: 'stakeholder' },
];

function makeMockContacts(): GraphContact[] {
  return [
    // HOT tier
    { id: 'n1', first_name: 'Sarah', last_name: 'Chen', full_name: 'Sarah Chen', email: 'sarah@dataflow.io', title: 'VP Engineering', company: 'DataFlow Systems', company_id: 'c1', owner_id: 'u1', category: 'prospect' as ContactCategory, warmth_score: 0.92, warmth_delta: 0.08, tier: 'hot' as WarmthTier, recency_score: 0.95, engagement_score: 0.88, deal_momentum_score: 0.90, multi_thread_score: 0.85, sentiment_score: 0.92, last_interaction_at: new Date(Date.now() - 3600000).toISOString(), trending_direction: 'up' as const, company_obj: MOCK_COMPANIES[0], deals: [MOCK_DEALS[0]] },
    { id: 'n2', first_name: 'James', last_name: 'Wright', full_name: 'James Wright', email: 'james@quantumlabs.ai', title: 'CTO', company: 'Quantum Labs', company_id: 'c3', owner_id: 'u1', category: 'prospect' as ContactCategory, warmth_score: 0.88, warmth_delta: 0.05, tier: 'hot' as WarmthTier, recency_score: 0.90, engagement_score: 0.85, deal_momentum_score: 0.92, multi_thread_score: 0.80, sentiment_score: 0.88, last_interaction_at: new Date(Date.now() - 7200000).toISOString(), trending_direction: 'up' as const, company_obj: MOCK_COMPANIES[2], deals: [MOCK_DEALS[2]] },
    { id: 'n3', first_name: 'Maria', last_name: 'Garcia', full_name: 'Maria Garcia', email: 'maria@quantumlabs.ai', title: 'Head of Product', company: 'Quantum Labs', company_id: 'c3', owner_id: 'u1', category: 'prospect' as ContactCategory, warmth_score: 0.85, warmth_delta: 0.03, tier: 'hot' as WarmthTier, recency_score: 0.88, engagement_score: 0.82, deal_momentum_score: 0.88, multi_thread_score: 0.90, sentiment_score: 0.80, last_interaction_at: new Date(Date.now() - 14400000).toISOString(), trending_direction: 'stable' as const, company_obj: MOCK_COMPANIES[2], deals: [MOCK_DEALS[2]] },

    // WARM tier
    { id: 'n4', first_name: 'Tom', last_name: 'Bradley', full_name: 'Tom Bradley', email: 'tom@techvault.com', title: 'Engineering Manager', company: 'TechVault', company_id: 'c2', owner_id: 'u1', category: 'prospect' as ContactCategory, warmth_score: 0.72, warmth_delta: 0.04, tier: 'warm' as WarmthTier, recency_score: 0.75, engagement_score: 0.70, deal_momentum_score: 0.68, multi_thread_score: 0.65, sentiment_score: 0.78, last_interaction_at: new Date(Date.now() - 86400000).toISOString(), trending_direction: 'up' as const, company_obj: MOCK_COMPANIES[1], deals: [MOCK_DEALS[1]] },
    { id: 'n5', first_name: 'Rachel', last_name: 'Kim', full_name: 'Rachel Kim', email: 'rachel@novacrm.io', title: 'Director of Operations', company: 'NovaCRM', company_id: 'c5', owner_id: 'u1', category: 'prospect' as ContactCategory, warmth_score: 0.65, warmth_delta: -0.02, tier: 'warm' as WarmthTier, recency_score: 0.68, engagement_score: 0.62, deal_momentum_score: 0.60, multi_thread_score: 0.70, sentiment_score: 0.65, last_interaction_at: new Date(Date.now() - 172800000).toISOString(), trending_direction: 'stable' as const, company_obj: MOCK_COMPANIES[4], deals: [MOCK_DEALS[4]] },
    { id: 'n6', first_name: 'David', last_name: 'Patel', full_name: 'David Patel', email: 'david@techvault.com', title: 'CTO', company: 'TechVault', company_id: 'c2', owner_id: 'u1', category: 'prospect' as ContactCategory, warmth_score: 0.62, warmth_delta: 0.01, tier: 'warm' as WarmthTier, recency_score: 0.65, engagement_score: 0.58, deal_momentum_score: 0.65, multi_thread_score: 0.60, sentiment_score: 0.62, last_interaction_at: new Date(Date.now() - 259200000).toISOString(), trending_direction: 'stable' as const, company_obj: MOCK_COMPANIES[1], deals: [MOCK_DEALS[1]] },
    { id: 'n7', first_name: 'Emma', last_name: 'Hughes', full_name: 'Emma Hughes', email: 'emma@dataflow.io', title: 'Product Manager', company: 'DataFlow Systems', company_id: 'c1', owner_id: 'u1', category: 'client' as ContactCategory, warmth_score: 0.58, warmth_delta: -0.01, tier: 'warm' as WarmthTier, recency_score: 0.60, engagement_score: 0.55, deal_momentum_score: 0.58, multi_thread_score: 0.62, sentiment_score: 0.55, last_interaction_at: new Date(Date.now() - 345600000).toISOString(), trending_direction: 'stable' as const, company_obj: MOCK_COMPANIES[0], deals: [MOCK_DEALS[0]] },

    // COOL tier
    { id: 'n8', first_name: 'Alex', last_name: 'Morrison', full_name: 'Alex Morrison', email: 'alex@brightpath.co', title: 'CEO', company: 'BrightPath Analytics', company_id: 'c4', owner_id: 'u1', category: 'prospect' as ContactCategory, warmth_score: 0.42, warmth_delta: -0.04, tier: 'cool' as WarmthTier, recency_score: 0.45, engagement_score: 0.40, deal_momentum_score: 0.38, multi_thread_score: 0.42, sentiment_score: 0.48, last_interaction_at: new Date(Date.now() - 604800000).toISOString(), trending_direction: 'down' as const, company_obj: MOCK_COMPANIES[3], deals: [MOCK_DEALS[3]] },
    { id: 'n9', first_name: 'Lisa', last_name: 'Chang', full_name: 'Lisa Chang', email: 'lisa@apexsolutions.co', title: 'VP Sales', company: 'Apex Solutions', company_id: 'c7', owner_id: 'u1', category: 'prospect' as ContactCategory, warmth_score: 0.38, warmth_delta: -0.06, tier: 'cool' as WarmthTier, recency_score: 0.40, engagement_score: 0.35, deal_momentum_score: 0.42, multi_thread_score: 0.30, sentiment_score: 0.42, last_interaction_at: new Date(Date.now() - 864000000).toISOString(), trending_direction: 'down' as const, company_obj: MOCK_COMPANIES[6], deals: [MOCK_DEALS[5]] },
    { id: 'n10', first_name: 'Mike', last_name: 'Roberts', full_name: 'Mike Roberts', email: 'mike@meridiangroup.com', title: 'Partner', company: 'Meridian Group', company_id: 'c6', owner_id: 'u1', category: 'partner' as ContactCategory, warmth_score: 0.35, warmth_delta: 0.0, tier: 'cool' as WarmthTier, recency_score: 0.38, engagement_score: 0.32, deal_momentum_score: 0.30, multi_thread_score: 0.35, sentiment_score: 0.40, last_interaction_at: new Date(Date.now() - 1209600000).toISOString(), trending_direction: 'stable' as const, company_obj: MOCK_COMPANIES[5], deals: [] },
    { id: 'n11', first_name: 'Sophie', last_name: 'Turner', full_name: 'Sophie Turner', email: 'sophie@brightpath.co', title: 'Data Lead', company: 'BrightPath Analytics', company_id: 'c4', owner_id: 'u1', category: 'prospect' as ContactCategory, warmth_score: 0.30, warmth_delta: -0.02, tier: 'cool' as WarmthTier, recency_score: 0.32, engagement_score: 0.28, deal_momentum_score: 0.35, multi_thread_score: 0.28, sentiment_score: 0.32, last_interaction_at: new Date(Date.now() - 1728000000).toISOString(), trending_direction: 'stable' as const, company_obj: MOCK_COMPANIES[3], deals: [MOCK_DEALS[3]] },

    // COLD tier
    { id: 'n12', first_name: 'Chris', last_name: 'Anderson', full_name: 'Chris Anderson', email: 'chris@blueshift.media', title: 'Marketing Director', company: 'BlueShift Media', company_id: 'c8', owner_id: 'u1', category: 'prospect' as ContactCategory, warmth_score: 0.15, warmth_delta: 0.0, tier: 'cold' as WarmthTier, recency_score: 0.18, engagement_score: 0.12, deal_momentum_score: 0.10, multi_thread_score: 0.15, sentiment_score: 0.20, last_interaction_at: new Date(Date.now() - 2592000000).toISOString(), trending_direction: 'stable' as const, company_obj: MOCK_COMPANIES[7], deals: [] },
    { id: 'n13', first_name: 'Olivia', last_name: 'Reed', full_name: 'Olivia Reed', email: 'olivia@meridiangroup.com', title: 'Analyst', company: 'Meridian Group', company_id: 'c6', owner_id: 'u1', category: 'prospect' as ContactCategory, warmth_score: 0.10, warmth_delta: -0.03, tier: 'cold' as WarmthTier, recency_score: 0.12, engagement_score: 0.08, deal_momentum_score: 0.10, multi_thread_score: 0.10, sentiment_score: 0.12, last_interaction_at: new Date(Date.now() - 3456000000).toISOString(), trending_direction: 'down' as const, company_obj: MOCK_COMPANIES[5], deals: [] },
    { id: 'n14', first_name: 'Daniel', last_name: 'Foster', full_name: 'Daniel Foster', email: 'daniel@novacrm.io', title: 'Account Manager', company: 'NovaCRM', company_id: 'c5', owner_id: 'u1', category: 'prospect' as ContactCategory, warmth_score: 0.08, warmth_delta: 0.0, tier: 'cold' as WarmthTier, recency_score: 0.10, engagement_score: 0.06, deal_momentum_score: 0.08, multi_thread_score: 0.08, sentiment_score: 0.10, last_interaction_at: null, trending_direction: 'stable' as const, company_obj: MOCK_COMPANIES[4], deals: [] },
    { id: 'n15', first_name: 'Hannah', last_name: 'Webb', full_name: 'Hannah Webb', email: 'hannah@apexsolutions.co', title: 'Consultant', company: 'Apex Solutions', company_id: 'c7', owner_id: 'u1', category: 'prospect' as ContactCategory, warmth_score: 0.05, warmth_delta: 0.0, tier: 'cold' as WarmthTier, recency_score: 0.06, engagement_score: 0.04, deal_momentum_score: 0.05, multi_thread_score: 0.05, sentiment_score: 0.06, last_interaction_at: null, trending_direction: 'stable' as const, company_obj: MOCK_COMPANIES[6], deals: [] },
    { id: 'n16', first_name: 'Ryan', last_name: 'Clarke', full_name: 'Ryan Clarke', email: 'ryan@dataflow.io', title: 'SDR', company: 'DataFlow Systems', company_id: 'c1', owner_id: 'u1', category: 'prospect' as ContactCategory, warmth_score: 0.04, warmth_delta: 0.0, tier: 'cold' as WarmthTier, recency_score: 0.05, engagement_score: 0.03, deal_momentum_score: 0.04, multi_thread_score: 0.04, sentiment_score: 0.05, last_interaction_at: null, trending_direction: 'stable' as const, company_obj: MOCK_COMPANIES[0], deals: [] },
  ];
}

// ---------------------------------------------------------------------------
// Sandbox detail panel (simplified — no auth-dependent tabs)
// ---------------------------------------------------------------------------

const SIGNAL_BARS: { label: string; key: keyof GraphNode; color: string }[] = [
  { label: 'Recency', key: 'recency_score', color: '#f97316' },
  { label: 'Engagement', key: 'engagement_score', color: '#eab308' },
  { label: 'Deal Momentum', key: 'deal_momentum_score', color: '#6366f1' },
  { label: 'Multi-Thread', key: 'multi_thread_score', color: '#0ea5e9' },
  { label: 'Sentiment', key: 'sentiment_score', color: '#22c55e' },
];

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

function SandboxDetailPanel({
  node,
  allNodes,
  onClose,
  onSelectContact,
  onExclude,
}: {
  node: GraphNode;
  allNodes: GraphNode[];
  onClose: () => void;
  onSelectContact?: (id: string) => void;
  onExclude?: (id: string) => void;
}) {
  const tier: WarmthTier = node.tier ?? 'cold';
  const tierColor = TIER_COLORS[tier];
  const warmthPct = ((node.warmth_score ?? 0) * 100).toFixed(0);
  const delta = node.warmth_delta ?? 0;
  const displayName = node.full_name || `${node.first_name || ''} ${node.last_name || ''}`.trim() || node.email;
  const initial = (node.first_name || node.email)[0]?.toUpperCase() ?? '?';
  const topDeal = node.deals[0];
  const relatedContacts = node.company_id
    ? allNodes.filter((n) => n.company_id === node.company_id && n.id !== node.id)
    : [];

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
          <div className="flex items-center gap-1.5">
            {onExclude && (
              <button
                onClick={() => { onExclude(node.id); onClose(); }}
                className="w-7 h-7 rounded-md bg-white/[0.06] hover:bg-red-500/20 flex items-center justify-center text-gray-400 hover:text-red-400 transition-colors"
                title="Hide from graph"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-md bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-gray-400 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
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

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
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

          {/* Deal card */}
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
                      &pound;{(topDeal.value / 1000).toFixed(0)}k
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

          {/* AI suggestion */}
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

          {/* Related contacts */}
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
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main graph — same D3 radial rendering as production RelationshipGraph
// ---------------------------------------------------------------------------

export default function SandboxRelationships() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Interaction state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [filter, setFilter] = useState<WarmthTier | null>(null);
  const [search, setSearch] = useState('');
  const [clustered, setClustered] = useState(false);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [hideNoInteraction, setHideNoInteraction] = useState(false);
  const [excludedCategories, setExcludedCategories] = useState<Set<ContactCategory>>(new Set());

  // Multi-select state
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Drag-to-select rectangle
  const [dragRect, setDragRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const isDraggingRef = useRef(false);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);

  // Cluster selection
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);

  // Mock data
  const contacts = useMemo(() => makeMockContacts(), []);

  // ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height: Math.max(height, 500) });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // D3 zoom/pan
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const g = svg.select<SVGGElement>('.graph-root');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent(ZOOM_EXTENT)
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        g.attr('transform', event.transform.toString());
      });

    zoomRef.current = zoom;
    svg.call(zoom);

    const initialTransform = d3.zoomIdentity
      .translate(dimensions.width / 2, dimensions.height / 2);
    transformRef.current = initialTransform;
    svg.call(zoom.transform, initialTransform);

    return () => { svg.on('.zoom', null); };
  }, [dimensions]);

  // Disable zoom in multi-select mode
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    if (multiSelectMode) {
      svg.on('.zoom', null);
    } else if (zoomRef.current) {
      svg.call(zoomRef.current);
      svg.call(zoomRef.current.transform, transformRef.current);
    }
  }, [multiSelectMode]);

  const cx = 0;
  const cy = 0;
  const maxR = Math.min(dimensions.width, dimensions.height) * 0.42;

  // Tier-based orbital layout — same algorithm as production
  const allNodes: GraphNode[] = useMemo(() => {
    if (!contacts.length) return [];

    const tierOrder: WarmthTier[] = ['hot', 'warm', 'cool', 'cold'];
    const tierBuckets: Record<WarmthTier, typeof contacts> = { hot: [], warm: [], cool: [], cold: [] };
    contacts.forEach((c) => { tierBuckets[c.tier ?? 'cold'].push(c); });

    for (const t of tierOrder) {
      tierBuckets[t].sort((a, b) => (b.warmth_score ?? 0) - (a.warmth_score ?? 0));
    }

    const TIER_BANDS: Record<WarmthTier, [number, number]> = {
      hot:  [0.10, 0.25],
      warm: [0.28, 0.45],
      cool: [0.48, 0.65],
      cold: [0.68, 0.88],
    };

    const result: GraphNode[] = [];

    for (const tier of tierOrder) {
      const bucket = tierBuckets[tier];
      if (bucket.length === 0) continue;

      const [innerFrac, outerFrac] = TIER_BANDS[tier];
      const innerR = innerFrac * maxR;
      const outerR = outerFrac * maxR;

      const half = Math.ceil(bucket.length / 2);
      const innerRow = bucket.slice(0, half);
      const outerRow = bucket.slice(half);

      innerRow.forEach((contact, i) => {
        const warmth = contact.warmth_score ?? 0;
        const angle = (i / innerRow.length) * Math.PI * 2;
        const nodeRadius = NODE_SIZE_MIN + warmth * (NODE_SIZE_MAX - NODE_SIZE_MIN);
        result.push({ ...contact, x: Math.cos(angle) * innerR, y: Math.sin(angle) * innerR, radius: nodeRadius, angle });
      });

      outerRow.forEach((contact, i) => {
        const warmth = contact.warmth_score ?? 0;
        const stepOffset = outerRow.length > 0 ? (0.5 / outerRow.length) * Math.PI * 2 : 0;
        const angle = (i / outerRow.length) * Math.PI * 2 + stepOffset;
        const nodeRadius = NODE_SIZE_MIN + warmth * (NODE_SIZE_MAX - NODE_SIZE_MIN);
        result.push({ ...contact, x: Math.cos(angle) * outerR, y: Math.sin(angle) * outerR, radius: nodeRadius, angle });
      });
    }

    return result;
  }, [contacts, maxR]);

  // Filtered nodes
  const nodes = useMemo(() => {
    let filtered = allNodes;
    if (excludedIds.size > 0) filtered = filtered.filter((n) => !excludedIds.has(n.id));
    if (hideNoInteraction) filtered = filtered.filter((n) => n.warmth_score !== null && n.warmth_score > 0);
    if (excludedCategories.size > 0) filtered = filtered.filter((n) => !excludedCategories.has(n.category ?? 'prospect'));
    if (filter) filtered = filtered.filter((n) => (n.tier ?? 'cold') === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((n) => {
        const name = (n.full_name || `${n.first_name || ''} ${n.last_name || ''}`).toLowerCase();
        const company = n.company_obj?.name?.toLowerCase() ?? '';
        return name.includes(q) || company.includes(q);
      });
    }
    return filtered;
  }, [allNodes, excludedIds, hideNoInteraction, excludedCategories, filter, search]);

  // Cold clustering
  const { displayNodes, coldClusters, allColdContacts } = useMemo(() => {
    const coldNodes = nodes.filter((n) => (n.tier ?? 'cold') === 'cold');
    const nonColdNodes = nodes.filter((n) => (n.tier ?? 'cold') !== 'cold');

    if (coldNodes.length <= COLD_CLUSTER_SIZE) {
      return { displayNodes: nodes, coldClusters: [] as ColdCluster[], allColdContacts: coldNodes };
    }

    const capped = coldNodes.slice(0, COLD_MAX_DISPLAY);
    const clusters: ColdCluster[] = [];
    const clusterCount = Math.ceil(capped.length / COLD_CLUSTER_SIZE);
    const clusterOrbitR = 0.78 * maxR;

    for (let i = 0; i < capped.length; i += COLD_CLUSTER_SIZE) {
      const idx = i / COLD_CLUSTER_SIZE;
      const chunk = capped.slice(i, i + COLD_CLUSTER_SIZE);
      const angle = (idx / clusterCount) * Math.PI * 2;
      clusters.push({
        id: `cold-cluster-${idx}`,
        contacts: chunk,
        x: Math.cos(angle) * clusterOrbitR,
        y: Math.sin(angle) * clusterOrbitR,
        radius: CLUSTER_NODE_RADIUS,
        angle,
      });
    }

    return { displayNodes: nonColdNodes, coldClusters: clusters, allColdContacts: coldNodes };
  }, [nodes, maxR]);

  // Deal arcs
  const dealArcs = useMemo(() => {
    const arcs: { a: GraphNode; b: GraphNode; deal: GraphNode['deals'][number]; cpx: number; cpy: number }[] = [];
    const dealGroups: Record<string, GraphNode[]> = {};

    nodes.forEach((n) => {
      n.deals.forEach((d) => {
        (dealGroups[d.id] = dealGroups[d.id] || []).push(n);
      });
    });

    Object.entries(dealGroups).forEach(([dId, group]) => {
      if (group.length < 2) return;
      const deal = group[0].deals.find((d) => d.id === dId);
      if (!deal) return;

      for (let i = 0; i < group.length - 1; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i], b = group[j];
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist === 0) continue;
          const offset = dist * 0.25;
          const nx = -dy / dist, ny = dx / dist;
          arcs.push({ a, b, deal, cpx: mx + nx * offset, cpy: my + ny * offset });
        }
      }
    });

    return arcs;
  }, [nodes]);

  // Lookups
  const hoveredNode = hoveredId ? nodes.find((n) => n.id === hoveredId) ?? null : null;
  const selectedNode = selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null;

  const handleNodeClick = useCallback((node: GraphNode) => {
    if (multiSelectMode) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
        return next;
      });
      return;
    }
    setSelectedClusterId(null);
    setSelectedId(node.id);
  }, [multiSelectMode]);

  const handleDeselect = useCallback(() => {
    setSelectedId(null);
    setSelectedClusterId(null);
  }, []);

  const toggleMultiSelect = useCallback(() => {
    setMultiSelectMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  const screenToGraph = useCallback((screenX: number, screenY: number) => {
    const t = transformRef.current;
    return { x: (screenX - t.x) / t.k, y: (screenY - t.y) / t.k };
  }, []);

  // Drag-to-select handlers
  const handleDragStart = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!multiSelectMode) return;
    const tag = (e.target as SVGElement).tagName;
    if (tag !== 'svg' && tag !== 'rect') return;

    const svgEl = svgRef.current;
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const svgX = e.clientX - rect.left;
    const svgY = e.clientY - rect.top;
    const graphPt = screenToGraph(svgX, svgY);

    isDraggingRef.current = true;
    setDragRect({ x1: graphPt.x, y1: graphPt.y, x2: graphPt.x, y2: graphPt.y });
  }, [multiSelectMode, screenToGraph]);

  const handleDragMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDraggingRef.current || !dragRect) return;

    const svgEl = svgRef.current;
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const svgX = e.clientX - rect.left;
    const svgY = e.clientY - rect.top;
    const graphPt = screenToGraph(svgX, svgY);

    setDragRect((prev) => prev ? { ...prev, x2: graphPt.x, y2: graphPt.y } : null);
  }, [dragRect, screenToGraph]);

  const handleDragEnd = useCallback(() => {
    if (!isDraggingRef.current || !dragRect) {
      isDraggingRef.current = false;
      return;
    }
    isDraggingRef.current = false;

    const minX = Math.min(dragRect.x1, dragRect.x2);
    const maxX = Math.max(dragRect.x1, dragRect.x2);
    const minY = Math.min(dragRect.y1, dragRect.y2);
    const maxY = Math.max(dragRect.y1, dragRect.y2);

    if (maxX - minX > 5 || maxY - minY > 5) {
      const hitIds = new Set(selectedIds);
      displayNodes.forEach((n) => {
        if (n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY) {
          hitIds.add(n.id);
        }
      });
      coldClusters.forEach((cluster) => {
        if (cluster.x >= minX && cluster.x <= maxX && cluster.y >= minY && cluster.y <= maxY) {
          cluster.contacts.forEach((c) => hitIds.add(c.id));
        }
      });
      setSelectedIds(hitIds);
    }

    setDragRect(null);
  }, [dragRect, selectedIds, displayNodes, coldClusters]);

  return (
    <div
      ref={containerRef}
      className="relative w-full min-h-[500px] h-[calc(100vh-280px)] rounded-2xl overflow-hidden bg-[#030712] border border-white/[0.06] flex flex-col"
    >
      {/* Production GraphToolbar */}
      <GraphToolbar
        filter={filter}
        onFilterChange={setFilter}
        search={search}
        onSearchChange={setSearch}
        nodes={allNodes}
        allContactCount={contacts.length}
        clustered={clustered}
        onClusteredChange={setClustered}
        hideNoInteraction={hideNoInteraction}
        onHideNoInteractionChange={setHideNoInteraction}
        excludedCount={excludedIds.size}
        onClearExcluded={() => setExcludedIds(new Set())}
        excludedCategories={excludedCategories}
        onToggleCategory={(cat: ContactCategory) => {
          setExcludedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat); else next.add(cat);
            return next;
          });
        }}
        multiSelectMode={multiSelectMode}
        onToggleMultiSelect={toggleMultiSelect}
        selectedCount={selectedIds.size}
      />

      {/* Main area: SVG + detail panel */}
      <div className="flex flex-1 overflow-hidden">
        <svg
          ref={svgRef}
          width={selectedNode ? dimensions.width - 370 : dimensions.width}
          height={dimensions.height}
          className="flex-1"
          style={{ transition: 'width 0.3s ease', cursor: multiSelectMode ? 'crosshair' : undefined }}
          onMouseMove={(e) => {
            setMousePos({ x: e.clientX, y: e.clientY });
            handleDragMove(e);
          }}
          onMouseDown={handleDragStart}
          onMouseUp={handleDragEnd}
          onMouseLeave={handleDragEnd}
          onClick={(e) => {
            if (!multiSelectMode && ((e.target as SVGElement).tagName === 'svg' || (e.target as SVGElement).tagName === 'rect')) {
              handleDeselect();
            }
          }}
        >
          <defs>
            {/* Nebula background gradients */}
            <radialGradient id="nebula-1" cx="30%" cy="40%" r="50%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="nebula-2" cx="70%" cy="30%" r="45%">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="nebula-3" cx="50%" cy="70%" r="40%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
            </radialGradient>

            <radialGradient id="centre-glow">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#6366f1" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </radialGradient>

            <filter id="glow-centre" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feFlood floodColor="#6366f1" floodOpacity="0.4" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="glow-selected" x="-150%" y="-150%" width="400%" height="400%">
              <feGaussianBlur stdDeviation="12" result="blur" />
              <feFlood floodColor="#a78bfa" floodOpacity="0.7" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Per-tier gradients + glow filters */}
            {Object.entries(TIER_COLORS).map(([tier, colors]) => (
              <radialGradient key={`node-grad-${tier}`} id={`node-gradient-${tier}`}>
                <stop offset="0%" stopColor={colors.gradient[0]} stopOpacity="0.9" />
                <stop offset="100%" stopColor={colors.gradient[1]} stopOpacity="0.7" />
              </radialGradient>
            ))}
            {Object.entries(TIER_COLORS).map(([tier, colors]) => (
              <filter key={`glow-${tier}`} id={`glow-${tier}`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feFlood floodColor={colors.glow} floodOpacity="0.3" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ))}
          </defs>

          {/* Background */}
          <rect width="100%" height="100%" fill="#030712" />
          <rect width="100%" height="100%" fill="url(#nebula-1)" />
          <rect width="100%" height="100%" fill="url(#nebula-2)" />
          <rect width="100%" height="100%" fill="url(#nebula-3)" />

          <g className="graph-root">
            {/* Orbit rings */}
            {ORBIT_RADII.map((ratio, i) => (
              <circle
                key={`orbit-${i}`}
                cx={cx}
                cy={cy}
                r={maxR * ratio}
                fill="none"
                stroke="rgba(255,255,255,0.04)"
                strokeWidth={1}
                strokeDasharray="4 8"
              >
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from={`0 ${cx} ${cy}`}
                  to={`${i % 2 === 0 ? 360 : -360} ${cx} ${cy}`}
                  dur={`${120 + i * 40}s`}
                  repeatCount="indefinite"
                />
              </circle>
            ))}

            {/* Tier labels */}
            {(['Hot', 'Warm', 'Cool', 'Cold'] as const).map((label, i) => (
              <text
                key={`tier-label-${i}`}
                x={cx + maxR * ORBIT_RADII[i] + 6}
                y={cy - 4}
                fill="rgba(255,255,255,0.15)"
                fontSize="9"
                fontFamily="Inter, system-ui, sans-serif"
              >
                {label}
              </text>
            ))}

            {/* Connection lines: centre to nodes */}
            {displayNodes.map((n) => (
              <line
                key={`conn-${n.id}`}
                x1={cx}
                y1={cy}
                x2={n.x}
                y2={n.y}
                stroke={TIER_COLORS[n.tier ?? 'cold'].glow}
                strokeOpacity={0.06 + (n.warmth_score ?? 0) * 0.12}
                strokeWidth={0.5 + (n.warmth_score ?? 0) * 1.2}
                style={{ transition: 'all 0.6s ease' }}
              />
            ))}

            {/* Connection lines: centre to clusters */}
            {coldClusters.map((cluster) => (
              <line
                key={`conn-${cluster.id}`}
                x1={cx}
                y1={cy}
                x2={cluster.x}
                y2={cluster.y}
                stroke={TIER_COLORS.cold.glow}
                strokeOpacity={0.06}
                strokeWidth={0.8}
                style={{ transition: 'all 0.6s ease' }}
              />
            ))}

            {/* Deal arcs */}
            {dealArcs.map((arc, i) => (
              <path
                key={`arc-${i}`}
                d={`M ${arc.a.x} ${arc.a.y} Q ${arc.cpx} ${arc.cpy} ${arc.b.x} ${arc.b.y}`}
                fill="none"
                stroke={HEALTH_COLORS[(arc.deal.health_status as keyof typeof HEALTH_COLORS) ?? 'stalled'] ?? HEALTH_COLORS.stalled}
                strokeWidth={1.5}
                strokeDasharray="5 5"
                strokeOpacity={0.35}
                style={{ transition: 'all 0.6s ease' }}
              />
            ))}

            {/* Cold cluster nodes */}
            {coldClusters.map((cluster) => {
              const isClusterSelected = selectedClusterId === cluster.id;
              const isClusterHovered = hoveredId === cluster.id;
              const r = CLUSTER_NODE_RADIUS + (isClusterSelected ? 4 : isClusterHovered ? 2 : 0);
              return (
                <g
                  key={cluster.id}
                  style={{ cursor: 'pointer', transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1)', opacity: isClusterSelected || isClusterHovered ? 0.9 : 0.6 }}
                  onClick={() => {
                    setSelectedId(null);
                    setSelectedClusterId(cluster.id);
                  }}
                  onMouseEnter={() => setHoveredId(cluster.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <circle cx={cluster.x} cy={cluster.y} r={r * 1.6} fill="none" stroke={TIER_COLORS.cold.primary} strokeWidth={1} strokeOpacity={isClusterSelected ? 0.4 : 0.15} strokeDasharray="3 4" />
                  <circle cx={cluster.x} cy={cluster.y} r={r} fill="url(#node-gradient-cold)" stroke={isClusterSelected ? '#a78bfa' : isClusterHovered ? TIER_COLORS.cold.primary : 'rgba(255,255,255,0.08)'} strokeWidth={isClusterSelected ? 2 : 1} filter={isClusterSelected ? 'url(#glow-selected)' : isClusterHovered ? 'url(#glow-cold)' : undefined} />
                  <text x={cluster.x} y={cluster.y + 1} textAnchor="middle" dominantBaseline="central" fill="white" fontSize="11" fontWeight="700" fontFamily="Inter, system-ui, sans-serif">{cluster.contacts.length}</text>
                  <text x={cluster.x} y={cluster.y + r + 13} textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="Inter, system-ui, sans-serif" opacity={isClusterSelected || isClusterHovered ? 0.9 : 0.5}>cold</text>
                </g>
              );
            })}

            {/* Contact nodes */}
            {displayNodes.map((node) => {
              const tier = node.tier ?? 'cold';
              const isTrending = (node.warmth_delta ?? 0) > 0.03;
              const visualTier = (tier === 'cold' && isTrending) ? 'cool' : tier;
              const tierColor = TIER_COLORS[visualTier];
              const displayName = node.full_name || `${node.first_name || ''} ${node.last_name || ''}`.trim() || node.email;
              const isSelected = selectedId === node.id || selectedIds.has(node.id);
              const isHovered = hoveredId === node.id;
              const r = node.radius + (isSelected ? 6 : isHovered ? 3 : 0);
              const showLabel = (node.warmth_score ?? 0) > 0.42 || isSelected || isHovered;
              const glowFilter = isSelected ? 'url(#glow-selected)' : (isHovered || (node.warmth_score ?? 0) > 0.65) ? `url(#glow-${visualTier})` : undefined;
              const nodeOpacity = (tier === 'cold' && !isTrending && !isSelected && !isHovered) ? 0.5 : 1;

              return (
                <g
                  key={node.id}
                  style={{ cursor: 'pointer', transition: 'transform 0.5s cubic-bezier(0.16,1,0.3,1)', opacity: nodeOpacity }}
                  onClick={() => handleNodeClick(node)}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {/* Outer glow ring */}
                  {(isSelected || isHovered || (node.warmth_score ?? 0) > 0.6) && (
                    <circle cx={node.x} cy={node.y} r={r * 2.2} fill={tierColor.glow} opacity={isSelected ? 0.12 : isHovered ? 0.08 : 0.04}>
                      {isSelected && (
                        <animate attributeName="r" values={`${r * 2};${r * 2.6};${r * 2}`} dur="2.5s" repeatCount="indefinite" />
                      )}
                    </circle>
                  )}

                  {/* Main node */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r}
                    fill={`url(#node-gradient-${visualTier})`}
                    filter={glowFilter}
                    stroke={isSelected ? '#a78bfa' : isHovered ? tierColor.primary : 'rgba(255,255,255,0.08)'}
                    strokeWidth={isSelected ? 2.5 : isHovered ? 1.5 : 0.5}
                    style={{ transition: 'all 0.3s ease' }}
                  />

                  {/* Deal probability arc */}
                  {node.deals.length > 0 && (() => {
                    const deal = node.deals[0];
                    const prob = deal.probability ?? 0;
                    const arcR = r + 4;
                    const circumference = 2 * Math.PI * arcR;
                    const healthKey = (deal.health_status as keyof typeof HEALTH_COLORS) ?? 'stalled';
                    return (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={arcR}
                        fill="none"
                        stroke={HEALTH_COLORS[healthKey] ?? HEALTH_COLORS.stalled}
                        strokeWidth={2}
                        strokeOpacity={0.6}
                        strokeDasharray={`${circumference * prob} ${circumference * (1 - prob)}`}
                        strokeDashoffset={circumference * 0.25}
                        strokeLinecap="round"
                        style={{ transition: 'all 0.6s ease' }}
                      />
                    );
                  })()}

                  {/* Company badge */}
                  {node.company_obj && (
                    <g>
                      <circle cx={node.x - r * 0.6} cy={node.y + r * 0.6} r={6.5} fill="#1e1e2e" stroke="rgba(255,255,255,0.1)" strokeWidth={0.5} />
                      <text x={node.x - r * 0.6} y={node.y + r * 0.6 + 1} textAnchor="middle" dominantBaseline="central" fill="white" fontSize="7" fontWeight="600">{node.company_obj.name[0]}</text>
                    </g>
                  )}

                  {/* Delta indicator */}
                  {node.warmth_delta !== null && Math.abs(node.warmth_delta) > 0.03 && (
                    <g>
                      <circle cx={node.x + r * 0.6} cy={node.y - r * 0.6} r={5.5} fill={node.warmth_delta > 0 ? '#22c55e' : '#ef4444'} stroke="#030712" strokeWidth={1.5} />
                      <text x={node.x + r * 0.6} y={node.y - r * 0.6 + 0.5} textAnchor="middle" dominantBaseline="central" fill="white" fontSize="7" fontWeight="800">{node.warmth_delta > 0 ? '\u2191' : '\u2193'}</text>
                    </g>
                  )}

                  {/* Name label */}
                  {showLabel && (
                    <text
                      x={node.x}
                      y={node.y + r + 13}
                      textAnchor="middle"
                      fill="#e2e8f0"
                      fontSize="10"
                      fontWeight="600"
                      fontFamily="Inter, system-ui, sans-serif"
                      opacity={isSelected || isHovered ? 1 : 0.7}
                      style={{ transition: 'opacity 0.3s', pointerEvents: 'none' }}
                    >
                      {displayName.split(' ')[0]}
                    </text>
                  )}

                  {/* Role on hover */}
                  {isHovered && (
                    <text
                      x={node.x}
                      y={node.y + r + 24}
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize="8"
                      fontFamily="Inter, system-ui, sans-serif"
                      style={{ pointerEvents: 'none' }}
                    >
                      {node.title}{node.company_obj ? ` \u00b7 ${node.company_obj.name}` : ''}
                    </text>
                  )}

                  {/* Multi-select checkbox */}
                  {multiSelectMode && (
                    <g>
                      <circle cx={node.x - r * 0.7} cy={node.y - r * 0.7} r={6} fill={selectedIds.has(node.id) ? '#6366f1' : '#1e1e2e'} stroke={selectedIds.has(node.id) ? '#818cf8' : 'rgba(255,255,255,0.2)'} strokeWidth={1.5} />
                      {selectedIds.has(node.id) && (
                        <text x={node.x - r * 0.7} y={node.y - r * 0.7 + 1} textAnchor="middle" dominantBaseline="central" fill="white" fontSize="8" fontWeight="800">{'\u2713'}</text>
                      )}
                    </g>
                  )}
                </g>
              );
            })}

            {/* Centre "YOU" node */}
            <g filter="url(#glow-centre)">
              <circle cx={cx} cy={cy} r={CENTRE_NODE_RADIUS * 1.8} fill="url(#centre-glow)" opacity={0.5}>
                <animate attributeName="r" values={`${CENTRE_NODE_RADIUS * 1.5};${CENTRE_NODE_RADIUS * 2.2};${CENTRE_NODE_RADIUS * 1.5}`} dur="4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.3;0.6;0.3" dur="4s" repeatCount="indefinite" />
              </circle>
              <circle cx={cx} cy={cy} r={CENTRE_NODE_RADIUS} fill="#6366f1" stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} />
              <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central" fill="white" fontSize="10" fontWeight="600" fontFamily="Inter, system-ui, sans-serif">YOU</text>
            </g>

            {/* Drag-to-select rectangle */}
            {dragRect && (
              <rect
                x={Math.min(dragRect.x1, dragRect.x2)}
                y={Math.min(dragRect.y1, dragRect.y2)}
                width={Math.abs(dragRect.x2 - dragRect.x1)}
                height={Math.abs(dragRect.y2 - dragRect.y1)}
                fill="rgba(99,102,241,0.12)"
                stroke="#6366f1"
                strokeWidth={1}
                strokeDasharray="4 3"
                style={{ pointerEvents: 'none' }}
              />
            )}
          </g>
        </svg>

        {/* Detail panel */}
        {selectedNode && (
          <SandboxDetailPanel
            node={selectedNode}
            allNodes={allNodes}
            onClose={handleDeselect}
            onSelectContact={(id) => { setSelectedClusterId(null); setSelectedId(id); }}
            onExclude={(id) => setExcludedIds((prev) => new Set([...prev, id]))}
          />
        )}
      </div>

      {/* Production GraphTooltip */}
      {hoveredNode && !selectedNode && (
        <GraphTooltip node={hoveredNode} position={mousePos} />
      )}
    </div>
  );
}
