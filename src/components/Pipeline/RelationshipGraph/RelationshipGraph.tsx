import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { ORBIT_RADII, ZOOM_EXTENT, CENTRE_NODE_RADIUS, TIER_COLORS, HEALTH_COLORS, NODE_SIZE_MIN, NODE_SIZE_MAX } from './constants';
import { useGraphData } from './hooks/useGraphData';
import { GraphTooltip } from './GraphTooltip';
import { GraphToolbar } from './GraphToolbar';
import { GraphDetailPanel } from './GraphDetailPanel';
import type { GraphNode, WarmthTier } from './types';

interface RelationshipGraphProps {
  onSelectNode?: (node: GraphNode | null) => void;
}

export function RelationshipGraph({ onSelectNode }: RelationshipGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Interaction state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [filter, setFilter] = useState<WarmthTier | null>(null);
  const [search, setSearch] = useState('');

  // ResizeObserver for responsive dimensions
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

  // D3 zoom/pan setup
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const g = svg.select<SVGGElement>('.graph-root');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent(ZOOM_EXTENT)
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
      });

    svg.call(zoom);

    // Centre the view initially
    const initialTransform = d3.zoomIdentity
      .translate(dimensions.width / 2, dimensions.height / 2);
    svg.call(zoom.transform, initialTransform);

    return () => { svg.on('.zoom', null); };
  }, [dimensions]);

  const { data: contacts = [], isLoading } = useGraphData();

  const cx = 0;
  const cy = 0;
  const maxR = Math.min(dimensions.width, dimensions.height) * 0.42;

  // All nodes (unfiltered) for stats
  const allNodes: GraphNode[] = useMemo(() => {
    if (!contacts.length) return [];

    return contacts.map((contact, index) => {
      const warmth = contact.warmth_score ?? 0;
      const angle = (index / contacts.length) * Math.PI * 2;
      const radius = (1 - warmth) * maxR;
      const nodeRadius = NODE_SIZE_MIN + warmth * (NODE_SIZE_MAX - NODE_SIZE_MIN);

      return {
        ...contact,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        radius: nodeRadius,
        angle,
      };
    });
  }, [contacts, maxR]);

  // Filtered nodes for display
  const nodes = useMemo(() => {
    let filtered = allNodes;

    if (filter) {
      filtered = filtered.filter((n) => (n.tier ?? 'cold') === filter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((n) => {
        const name = (n.full_name || `${n.first_name || ''} ${n.last_name || ''}`).toLowerCase();
        const company = n.company_obj?.name?.toLowerCase() ?? '';
        return name.includes(q) || company.includes(q);
      });
    }

    return filtered;
  }, [allNodes, filter, search]);

  // Compute deal arcs: connect contacts sharing the same deal
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

  // Lookup for selected/hovered nodes
  const hoveredNode = hoveredId ? nodes.find((n) => n.id === hoveredId) ?? null : null;
  const selectedNode = selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null;

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedId(node.id);
    onSelectNode?.(node);
  }, [onSelectNode]);

  const handleDeselect = useCallback(() => {
    setSelectedId(null);
    onSelectNode?.(null);
  }, [onSelectNode]);

  return (
    <div
      ref={containerRef}
      className="relative w-full min-h-[500px] h-[calc(100vh-280px)] rounded-2xl overflow-hidden bg-[#030712] border border-white/[0.06] flex flex-col"
    >
      {/* Stats + Filter toolbar */}
      <GraphToolbar
        filter={filter}
        onFilterChange={setFilter}
        search={search}
        onSearchChange={setSearch}
        nodes={allNodes}
        allContactCount={contacts.length}
      />

      {/* Main area: SVG + optional detail panel */}
      <div className="flex flex-1 overflow-hidden">
      <svg
        ref={svgRef}
        width={selectedNode ? dimensions.width - 370 : dimensions.width}
        height={dimensions.height}
        className="flex-1"
        style={{ transition: 'width 0.3s ease' }}
        onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
        onClick={(e) => {
          // Click on empty space deselects
          if ((e.target as SVGElement).tagName === 'svg' || (e.target as SVGElement).tagName === 'rect') {
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

          {/* Centre node glow */}
          <radialGradient id="centre-glow">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#6366f1" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </radialGradient>

          {/* Glow filter for centre node */}
          <filter id="glow-centre" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feFlood floodColor="#6366f1" floodOpacity="0.4" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Selected node glow filter */}
          <filter id="glow-selected" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feFlood floodColor="#a78bfa" floodOpacity="0.7" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Per-tier radial gradients */}
          {Object.entries(TIER_COLORS).map(([tier, colors]) => (
            <radialGradient key={`node-grad-${tier}`} id={`node-gradient-${tier}`}>
              <stop offset="0%" stopColor={colors.gradient[0]} stopOpacity="0.9" />
              <stop offset="100%" stopColor={colors.gradient[1]} stopOpacity="0.7" />
            </radialGradient>
          ))}

          {/* Per-tier glow filters */}
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

        {/* Background nebula */}
        <rect width="100%" height="100%" fill="#030712" />
        <rect width="100%" height="100%" fill="url(#nebula-1)" />
        <rect width="100%" height="100%" fill="url(#nebula-2)" />
        <rect width="100%" height="100%" fill="url(#nebula-3)" />

        {/* Root group for zoom/pan transforms */}
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

          {/* Tier labels on orbit rings */}
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

          {/* Loading indicator */}
          {isLoading && (
            <g>
              <circle cx={cx} cy={cy} r={maxR * 0.5} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              <text
                x={cx}
                y={cy + maxR * 0.6}
                textAnchor="middle"
                fill="rgba(255,255,255,0.3)"
                fontSize="11"
                fontFamily="Inter, system-ui, sans-serif"
              >
                Loading contacts...
              </text>
            </g>
          )}

          {/* Connection lines: centre to each node */}
          {nodes.map((n) => (
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

          {/* Deal arcs: curved lines between contacts sharing a deal */}
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

          {/* Contact nodes */}
          {nodes.map((node) => {
            const tier = node.tier ?? 'cold';
            const tierColor = TIER_COLORS[tier];
            const displayName = node.full_name || `${node.first_name || ''} ${node.last_name || ''}`.trim() || node.email;
            const isSelected = selectedId === node.id;
            const isHovered = hoveredId === node.id;
            const r = node.radius + (isSelected ? 6 : isHovered ? 3 : 0);
            const showLabel = (node.warmth_score ?? 0) > 0.42 || isSelected || isHovered;
            const glowFilter = isSelected ? 'url(#glow-selected)' : (isHovered || (node.warmth_score ?? 0) > 0.65) ? `url(#glow-${tier})` : undefined;

            return (
              <g
                key={node.id}
                style={{ cursor: 'pointer', transition: 'transform 0.5s cubic-bezier(0.16,1,0.3,1)' }}
                onClick={() => handleNodeClick(node)}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Outer glow ring for selected/hovered */}
                {(isSelected || isHovered || (node.warmth_score ?? 0) > 0.6) && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r * 2.2}
                    fill={tierColor.glow}
                    opacity={isSelected ? 0.12 : isHovered ? 0.08 : 0.04}
                  >
                    {isSelected && (
                      <animate
                        attributeName="r"
                        values={`${r * 2};${r * 2.6};${r * 2}`}
                        dur="2.5s"
                        repeatCount="indefinite"
                      />
                    )}
                  </circle>
                )}

                {/* Main node */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={r}
                  fill={`url(#node-gradient-${tier})`}
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
                    <circle
                      cx={node.x - r * 0.6}
                      cy={node.y + r * 0.6}
                      r={6.5}
                      fill="#1e1e2e"
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth={0.5}
                    />
                    <text
                      x={node.x - r * 0.6}
                      y={node.y + r * 0.6 + 1}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="white"
                      fontSize="7"
                      fontWeight="600"
                    >
                      {node.company_obj.name[0]}
                    </text>
                  </g>
                )}

                {/* Delta indicator */}
                {node.warmth_delta !== null && Math.abs(node.warmth_delta) > 0.03 && (
                  <g>
                    <circle
                      cx={node.x + r * 0.6}
                      cy={node.y - r * 0.6}
                      r={5.5}
                      fill={node.warmth_delta > 0 ? '#22c55e' : '#ef4444'}
                      stroke="#030712"
                      strokeWidth={1.5}
                    />
                    <text
                      x={node.x + r * 0.6}
                      y={node.y - r * 0.6 + 0.5}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="white"
                      fontSize="7"
                      fontWeight="800"
                    >
                      {node.warmth_delta > 0 ? '\u2191' : '\u2193'}
                    </text>
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

                {/* Role + company on hover */}
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
              </g>
            );
          })}

          {/* Centre "YOU" node */}
          <g filter="url(#glow-centre)">
            <circle
              cx={cx}
              cy={cy}
              r={CENTRE_NODE_RADIUS * 1.8}
              fill="url(#centre-glow)"
              opacity={0.5}
            >
              <animate
                attributeName="r"
                values={`${CENTRE_NODE_RADIUS * 1.5};${CENTRE_NODE_RADIUS * 2.2};${CENTRE_NODE_RADIUS * 1.5}`}
                dur="4s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.3;0.6;0.3"
                dur="4s"
                repeatCount="indefinite"
              />
            </circle>
            <circle
              cx={cx}
              cy={cy}
              r={CENTRE_NODE_RADIUS}
              fill="#6366f1"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth={1.5}
            />
            <text
              x={cx}
              y={cy + 1}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              fontSize="10"
              fontWeight="600"
              fontFamily="Inter, system-ui, sans-serif"
            >
              YOU
            </text>
          </g>
        </g>
      </svg>

      {/* Detail panel */}
      {selectedNode && (
        <GraphDetailPanel
          node={selectedNode}
          onClose={handleDeselect}
          onSelectContact={(id) => setSelectedId(id)}
        />
      )}
      </div>

      {/* Hover tooltip (only when no node is selected) */}
      {hoveredNode && !selectedNode && (
        <GraphTooltip node={hoveredNode} position={mousePos} />
      )}
    </div>
  );
}
