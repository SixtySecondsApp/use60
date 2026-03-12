/**
 * SandboxRelationships
 *
 * Interactive relationship graph showing contacts, deals, and companies
 * as connected nodes. Demonstrates 60's relationship health monitoring.
 */

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Network,
  Building2,
  User,
  DollarSign,
  Calendar,
  Mail,
  Phone,
  TrendingUp,
  TrendingDown,
  Minus,
  Filter,
  ChevronRight,
} from 'lucide-react';
import { useSandboxData } from '../data/SandboxDataProvider';
import type { SandboxContact, SandboxDeal, SandboxCompany, SandboxActivity } from '../data/sandboxTypes';

// ── Types ──

interface GraphNode {
  id: string;
  type: 'contact' | 'company' | 'deal';
  label: string;
  sublabel?: string;
  engagement?: 'hot' | 'warm' | 'cold';
  healthStatus?: string;
  value?: number;
  x: number;
  y: number;
}

interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  strength: 'strong' | 'medium' | 'weak';
}

type EntityFilter = 'all' | 'contacts' | 'companies';

// ── Helpers ──

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function engagementColor(level: string): string {
  switch (level) {
    case 'hot': return 'text-amber-400 bg-amber-400/10 border-amber-400/30';
    case 'warm': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30';
    case 'cold': return 'text-blue-400 bg-blue-400/10 border-blue-400/30';
    default: return 'text-gray-400 bg-gray-400/10 border-gray-400/30';
  }
}

function healthColor(status: string): string {
  switch (status) {
    case 'healthy': return 'text-emerald-400';
    case 'warning': return 'text-amber-400';
    case 'critical': return 'text-red-400';
    default: return 'text-gray-400';
  }
}

function healthIcon(status: string) {
  switch (status) {
    case 'healthy': return TrendingUp;
    case 'warning': return Minus;
    case 'critical': return TrendingDown;
    default: return Minus;
  }
}

// ── Graph Layout ──

function layoutNodes(
  contacts: SandboxContact[],
  companies: SandboxCompany[],
  deals: SandboxDeal[],
  filter: EntityFilter,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const centerX = 400;
  const centerY = 300;

  // Companies at the top
  const visibleCompanies = companies.slice(0, 5);
  visibleCompanies.forEach((c, i) => {
    const angle = (Math.PI / (visibleCompanies.length + 1)) * (i + 1);
    nodes.push({
      id: `company-${c.id}`,
      type: 'company',
      label: c.name,
      sublabel: c.industry,
      x: centerX + Math.cos(angle - Math.PI / 2) * 220,
      y: 80 + Math.sin(angle - Math.PI / 2) * 40,
    });
  });

  // Deals in the middle ring
  if (filter === 'all' || filter === 'companies') {
    deals.slice(0, 6).forEach((d, i) => {
      const angle = ((2 * Math.PI) / Math.min(deals.length, 6)) * i - Math.PI / 2;
      const radius = 150;
      nodes.push({
        id: `deal-${d.id}`,
        type: 'deal',
        label: d.name,
        sublabel: d.stage,
        healthStatus: d.health_status,
        value: d.value,
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius * 0.7,
      });

      // Edge: deal → company
      const companyNode = nodes.find(n => n.type === 'company' && n.label === d.company_name);
      if (companyNode) {
        edges.push({
          from: `deal-${d.id}`,
          to: companyNode.id,
          label: formatCurrency(d.value),
          strength: d.health_status === 'healthy' ? 'strong' : d.health_status === 'warning' ? 'medium' : 'weak',
        });
      }
    });
  }

  // Contacts around the outer ring
  if (filter === 'all' || filter === 'contacts') {
    contacts.slice(0, 8).forEach((c, i) => {
      const angle = ((2 * Math.PI) / Math.min(contacts.length, 8)) * i - Math.PI / 2;
      const radius = 260;
      nodes.push({
        id: `contact-${c.id}`,
        type: 'contact',
        label: `${c.first_name} ${c.last_name}`,
        sublabel: c.title || c.company_name,
        engagement: c.engagement_level,
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius * 0.75,
      });

      // Edge: contact → company
      const companyNode = nodes.find(n => n.type === 'company' && n.label === c.company_name);
      if (companyNode) {
        edges.push({
          from: `contact-${c.id}`,
          to: companyNode.id,
          strength: c.engagement_level === 'hot' ? 'strong' : c.engagement_level === 'warm' ? 'medium' : 'weak',
        });
      }

      // Edge: contact → deal (if primary)
      const deal = deals.find(d => d.primary_contact_id === c.id || d.company_name === c.company_name);
      if (deal) {
        edges.push({
          from: `contact-${c.id}`,
          to: `deal-${deal.id}`,
          strength: c.engagement_level === 'hot' ? 'strong' : 'medium',
        });
      }
    });
  }

  return { nodes, edges };
}

// ── SVG Graph ──

function RelationshipGraph({
  nodes,
  edges,
  selectedNode,
  onSelectNode,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNode: string | null;
  onSelectNode: (id: string | null) => void;
}) {
  const edgeStrokeColor = (s: GraphEdge['strength']) =>
    s === 'strong' ? 'stroke-emerald-500/40' : s === 'medium' ? 'stroke-amber-500/30' : 'stroke-gray-600/20';

  const edgeStrokeWidth = (s: GraphEdge['strength']) =>
    s === 'strong' ? 2 : s === 'medium' ? 1.5 : 1;

  const nodeRadius = (type: string) => type === 'company' ? 32 : type === 'deal' ? 26 : 22;

  const nodeFill = (node: GraphNode) => {
    const isSelected = selectedNode === node.id;
    if (node.type === 'company') return isSelected ? '#6366f1' : '#1e1b4b';
    if (node.type === 'deal') {
      if (node.healthStatus === 'healthy') return isSelected ? '#059669' : '#064e3b';
      if (node.healthStatus === 'warning') return isSelected ? '#d97706' : '#451a03';
      return isSelected ? '#dc2626' : '#450a0a';
    }
    if (node.engagement === 'hot') return isSelected ? '#f59e0b' : '#451a03';
    if (node.engagement === 'warm') return isSelected ? '#10b981' : '#064e3b';
    return isSelected ? '#6b7280' : '#1f2937';
  };

  const nodeStroke = (node: GraphNode) => {
    if (selectedNode === node.id) return '#37bd7e';
    if (node.type === 'company') return '#4338ca';
    if (node.type === 'deal') return node.healthStatus === 'healthy' ? '#059669' : node.healthStatus === 'warning' ? '#d97706' : '#dc2626';
    if (node.engagement === 'hot') return '#f59e0b';
    if (node.engagement === 'warm') return '#10b981';
    return '#374151';
  };

  return (
    <svg viewBox="0 0 800 600" className="w-full h-full" onClick={() => onSelectNode(null)}>
      <defs>
        <radialGradient id="graph-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(99,102,241,0.03)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>
      <rect width="800" height="600" fill="url(#graph-bg)" />

      {/* Edges */}
      {edges.map((edge, i) => {
        const fromNode = nodes.find(n => n.id === edge.from);
        const toNode = nodes.find(n => n.id === edge.to);
        if (!fromNode || !toNode) return null;
        const isHighlighted = selectedNode === edge.from || selectedNode === edge.to;
        return (
          <line
            key={i}
            x1={fromNode.x}
            y1={fromNode.y}
            x2={toNode.x}
            y2={toNode.y}
            className={isHighlighted ? 'stroke-[#37bd7e]/50' : edgeStrokeColor(edge.strength)}
            strokeWidth={isHighlighted ? 2.5 : edgeStrokeWidth(edge.strength)}
            strokeDasharray={edge.strength === 'weak' ? '4 4' : undefined}
          />
        );
      })}

      {/* Nodes */}
      {nodes.map((node) => {
        const r = nodeRadius(node.type);
        const isSelected = selectedNode === node.id;
        return (
          <g
            key={node.id}
            className="cursor-pointer"
            onClick={(e) => { e.stopPropagation(); onSelectNode(node.id === selectedNode ? null : node.id); }}
          >
            {isSelected && (
              <circle cx={node.x} cy={node.y} r={r + 6} fill="none" stroke="#37bd7e" strokeWidth={2} opacity={0.4}>
                <animate attributeName="r" values={`${r + 4};${r + 8};${r + 4}`} dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0.15;0.4" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
            <circle
              cx={node.x}
              cy={node.y}
              r={r}
              fill={nodeFill(node)}
              stroke={nodeStroke(node)}
              strokeWidth={isSelected ? 2.5 : 1.5}
              className="transition-all duration-200"
            />
            {/* Icon placeholder */}
            <text
              x={node.x}
              y={node.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize={node.type === 'company' ? 11 : 10}
              fontWeight={600}
            >
              {node.type === 'company' ? node.label.slice(0, 2).toUpperCase() : node.label.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </text>
            {/* Label below */}
            <text
              x={node.x}
              y={node.y + r + 14}
              textAnchor="middle"
              fill="#a1a1aa"
              fontSize={10}
              className="pointer-events-none"
            >
              {node.label.length > 16 ? node.label.slice(0, 14) + '...' : node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Detail Panel ──

function NodeDetailPanel({
  node,
  activities,
  deals,
  contacts,
}: {
  node: GraphNode;
  activities: SandboxActivity[];
  deals: SandboxDeal[];
  contacts: SandboxContact[];
}) {
  const relatedActivities = activities
    .filter(a =>
      (node.type === 'contact' && a.contact_name === node.label) ||
      (node.type === 'company' && a.company_name === node.label) ||
      (node.type === 'deal' && a.deal_name === node.label)
    )
    .slice(0, 5);

  const activityIcon = (type: string) => {
    switch (type) {
      case 'email': return Mail;
      case 'call': return Phone;
      case 'meeting': return Calendar;
      default: return Calendar;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="absolute right-0 top-0 bottom-0 w-full sm:w-80 bg-gray-900/95 backdrop-blur-lg border-l border-gray-800/50 p-4 sm:p-5 overflow-y-auto z-10"
    >
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            node.type === 'company' ? 'bg-indigo-500/15 border border-indigo-500/30'
            : node.type === 'deal' ? 'bg-emerald-500/15 border border-emerald-500/30'
            : 'bg-violet-500/15 border border-violet-500/30'
          }`}>
            {node.type === 'company' ? <Building2 className="w-5 h-5 text-indigo-400" />
            : node.type === 'deal' ? <DollarSign className="w-5 h-5 text-emerald-400" />
            : <User className="w-5 h-5 text-violet-400" />}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{node.label}</h3>
            {node.sublabel && <p className="text-xs text-gray-500">{node.sublabel}</p>}
          </div>
        </div>

        {/* Stats */}
        {node.type === 'deal' && node.value && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-gray-800/50 border border-gray-700/50 p-3">
              <p className="text-xs text-gray-500 mb-1">Value</p>
              <p className="text-sm font-semibold text-white">{formatCurrency(node.value)}</p>
            </div>
            <div className="rounded-lg bg-gray-800/50 border border-gray-700/50 p-3">
              <p className="text-xs text-gray-500 mb-1">Health</p>
              <div className="flex items-center gap-1.5">
                {(() => { const Icon = healthIcon(node.healthStatus || ''); return <Icon className={`w-3.5 h-3.5 ${healthColor(node.healthStatus || '')}`} />; })()}
                <p className={`text-sm font-semibold capitalize ${healthColor(node.healthStatus || '')}`}>{node.healthStatus}</p>
              </div>
            </div>
          </div>
        )}

        {node.type === 'contact' && node.engagement && (
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border ${engagementColor(node.engagement)}`}>
              {node.engagement === 'hot' ? 'Hot' : node.engagement === 'warm' ? 'Warm' : 'Cold'} lead
            </span>
          </div>
        )}

        {/* Connected entities */}
        {node.type === 'company' && (
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Contacts</h4>
            <div className="space-y-2">
              {contacts
                .filter(c => c.company_name === node.label)
                .slice(0, 4)
                .map(c => (
                  <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800/30 border border-gray-700/30">
                    <User className="w-3.5 h-3.5 text-gray-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-white truncate">{c.first_name} {c.last_name}</p>
                      {c.title && <p className="text-[10px] text-gray-500 truncate">{c.title}</p>}
                    </div>
                    <span className={`w-2 h-2 rounded-full ${c.engagement_level === 'hot' ? 'bg-amber-400' : c.engagement_level === 'warm' ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Activity timeline */}
        {relatedActivities.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Recent Activity</h4>
            <div className="space-y-2">
              {relatedActivities.map((a) => {
                const Icon = activityIcon(a.type);
                return (
                  <div key={a.id} className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-gray-800/30 border border-gray-700/30">
                    <Icon className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-300 truncate">{a.subject}</p>
                      <p className="text-[10px] text-gray-600 mt-0.5">{new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Main Component ──

export default function SandboxRelationships() {
  const { data } = useSandboxData();
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');

  const { nodes, edges } = useMemo(
    () => layoutNodes(data.contacts, data.companies, data.deals, entityFilter),
    [data.contacts, data.companies, data.deals, entityFilter]
  );

  const selectedNodeData = useMemo(
    () => selectedNode ? nodes.find(n => n.id === selectedNode) ?? null : null,
    [selectedNode, nodes]
  );

  const handleSelectNode = useCallback((id: string | null) => setSelectedNode(id), []);

  // Stats
  const hotContacts = data.contacts.filter(c => c.engagement_level === 'hot').length;
  const healthyDeals = data.deals.filter(d => d.health_status === 'healthy').length;
  const totalValue = data.deals.reduce((s, d) => s + d.value, 0);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-gray-800/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
            <Network className="w-4.5 h-4.5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Relationship Graph</h2>
            <p className="text-xs text-gray-500">{data.contacts.length} contacts across {data.companies.length} companies</p>
          </div>
        </div>

        {/* Simple filter toggle */}
        <div className="flex items-center gap-1 p-1 bg-gray-800/50 border border-gray-700/50 rounded-lg self-start sm:self-auto">
          {(['all', 'contacts', 'companies'] as EntityFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setEntityFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                entityFilter === f
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {f === 'all' ? 'All' : f === 'contacts' ? 'Contacts' : 'Companies'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-4 sm:gap-6 px-4 sm:px-6 py-3 border-b border-gray-800/30">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-xs text-gray-400">{hotContacts} hot leads</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-xs text-gray-400">{healthyDeals}/{data.deals.length} deals healthy</span>
        </div>
        <div className="flex items-center gap-2">
          <DollarSign className="w-3 h-3 text-gray-500" />
          <span className="text-xs text-gray-400">{formatCurrency(totalValue)} pipeline</span>
        </div>
      </div>

      {/* Graph + Detail panel */}
      <div className="flex-1 relative overflow-hidden">
        <div className={`h-full transition-all duration-300 ${selectedNodeData ? 'sm:mr-80' : ''}`}>
          <RelationshipGraph
            nodes={nodes}
            edges={edges}
            selectedNode={selectedNode}
            onSelectNode={handleSelectNode}
          />
        </div>

        <AnimatePresence>
          {selectedNodeData && (
            <NodeDetailPanel
              node={selectedNodeData}
              activities={data.activities}
              deals={data.deals}
              contacts={data.contacts}
            />
          )}
        </AnimatePresence>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 flex items-center gap-4 px-3 py-2 rounded-lg bg-gray-900/80 backdrop-blur-sm border border-gray-800/50">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-indigo-900 border border-indigo-500" />
            <span className="text-[10px] text-gray-500">Company</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-emerald-900 border border-emerald-500" />
            <span className="text-[10px] text-gray-500">Deal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-violet-900 border border-violet-500" />
            <span className="text-[10px] text-gray-500">Contact</span>
          </div>
        </div>
      </div>
    </div>
  );
}
