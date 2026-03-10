import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { Zap, Loader2, Building2 } from 'lucide-react';
import { ORBIT_RADII, ZOOM_EXTENT, CENTRE_NODE_RADIUS, TIER_COLORS, HEALTH_COLORS, NODE_SIZE_MIN, NODE_SIZE_MAX, COLD_CLUSTER_SIZE, CLUSTER_NODE_RADIUS, CLUSTER_INNER_ORBIT, CLUSTER_OUTER_ORBIT, CLUSTER_RING_CAPACITY, CLUSTER_OPACITY_DROP } from './constants';
import { useGraphData } from './hooks/useGraphData';
import { useWarmthBackfill } from './hooks/useWarmthBackfill';
import { useContactEnrich } from './hooks/useContactEnrich';
import { GraphTooltip } from './GraphTooltip';
import { GraphToolbar } from './GraphToolbar';
import { GraphDetailPanel } from './GraphDetailPanel';
import { ClusterDetailPanel } from './ClusterDetailPanel';
import { SelectionActionBar } from './SelectionActionBar';
import type { GraphNode, WarmthTier, ContactCategory, ContactSource, ColdCluster } from './types';

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
  const [clustered, setClustered] = useState(false);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [hideNoInteraction, setHideNoInteraction] = useState(false);
  const [excludedCategories, setExcludedCategories] = useState<Set<ContactCategory>>(new Set(['employee', 'other']));
  const [activeSources, setActiveSources] = useState<Set<ContactSource>>(new Set(['app']));

  // Multi-select state
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Drag-to-select rectangle (in SVG graph-root coordinates)
  const [dragRect, setDragRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const isDraggingRef = useRef(false);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);

  // Cluster selection state (when clicking a grouped cold cluster node)
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);

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
        transformRef.current = event.transform;
        g.attr('transform', event.transform.toString());
      });

    zoomRef.current = zoom;
    svg.call(zoom);

    // Centre the view initially
    const initialTransform = d3.zoomIdentity
      .translate(dimensions.width / 2, dimensions.height / 2);
    transformRef.current = initialTransform;
    svg.call(zoom.transform, initialTransform);

    return () => { svg.on('.zoom', null); };
  }, [dimensions]);

  // Disable zoom/pan when in multi-select mode (so drag-to-select works)
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    if (multiSelectMode) {
      svg.on('.zoom', null);
    } else if (zoomRef.current) {
      svg.call(zoomRef.current);
      // Restore current transform without resetting view
      svg.call(zoomRef.current.transform, transformRef.current);
    }
  }, [multiSelectMode]);

  const { data: contacts = [], isLoading, hasWarmthData } = useGraphData(activeSources);
  const backfill = useWarmthBackfill();

  // Contact enrichment (company from email domain + category inference)
  const enrich = useContactEnrich();
  const PERSONAL_DOMAINS = useMemo(() => new Set([
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
    'me.com', 'aol.com', 'live.com', 'msn.com', 'protonmail.com',
    'mail.com', 'yandex.com', 'zoho.com', 'gmx.com', 'fastmail.com',
    'yahoo.co.uk', 'hotmail.co.uk', 'btinternet.com', 'sky.com',
    'virginmedia.com', 'talktalk.net', 'googlemail.com',
  ]), []);
  const contactsMissingCompany = useMemo(
    () => contacts.filter((c) => {
      if (c.company_id || !c.email) return false;
      const domain = c.email.split('@')[1]?.toLowerCase();
      return domain && !PERSONAL_DOMAINS.has(domain);
    }).length,
    [contacts, PERSONAL_DOMAINS]
  );

  const cx = 0;
  const cy = 0;
  const maxR = Math.min(dimensions.width, dimensions.height) * 0.42;

  // All nodes — tier-based orbital layout with 2 rows per tier, full-circle distribution
  const allNodes: GraphNode[] = useMemo(() => {
    if (!contacts.length) return [];

    // Group contacts by tier
    const tierOrder: WarmthTier[] = ['hot', 'warm', 'cool', 'cold'];
    const tierBuckets: Record<WarmthTier, typeof contacts> = { hot: [], warm: [], cool: [], cold: [] };
    contacts.forEach((c) => {
      const t = c.tier ?? 'cold';
      tierBuckets[t].push(c);
    });

    // Sort each bucket by warmth descending so hotter contacts go to inner row
    for (const t of tierOrder) {
      tierBuckets[t].sort((a, b) => (b.warmth_score ?? 0) - (a.warmth_score ?? 0));
    }

    // Orbit band per tier — inner radius and outer radius (fraction of maxR)
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

      // Split into 2 rows: first half → inner row, second half → outer row
      const half = Math.ceil(bucket.length / 2);
      const innerRow = bucket.slice(0, half);
      const outerRow = bucket.slice(half);

      // Place inner row contacts evenly around the full circle
      innerRow.forEach((contact, i) => {
        const warmth = contact.warmth_score ?? 0;
        const angle = (i / innerRow.length) * Math.PI * 2;
        const nodeRadius = NODE_SIZE_MIN + warmth * (NODE_SIZE_MAX - NODE_SIZE_MIN);
        result.push({
          ...contact,
          x: Math.cos(angle) * innerR,
          y: Math.sin(angle) * innerR,
          radius: nodeRadius,
          angle,
        });
      });

      // Place outer row contacts evenly, offset by half a step to stagger
      outerRow.forEach((contact, i) => {
        const warmth = contact.warmth_score ?? 0;
        const stepOffset = outerRow.length > 0 ? (0.5 / outerRow.length) * Math.PI * 2 : 0;
        const angle = (i / outerRow.length) * Math.PI * 2 + stepOffset;
        const nodeRadius = NODE_SIZE_MIN + warmth * (NODE_SIZE_MAX - NODE_SIZE_MIN);
        result.push({
          ...contact,
          x: Math.cos(angle) * outerR,
          y: Math.sin(angle) * outerR,
          radius: nodeRadius,
          angle,
        });
      });
    }

    return result;
  }, [contacts, maxR]);

  // Filtered nodes for display
  const nodes = useMemo(() => {
    let filtered = allNodes;

    // Exclude individually hidden contacts
    if (excludedIds.size > 0) {
      filtered = filtered.filter((n) => !excludedIds.has(n.id));
    }

    // Hide contacts with no interactions (no warmth data at all)
    if (hideNoInteraction) {
      filtered = filtered.filter((n) => n.warmth_score !== null && n.warmth_score > 0);
    }

    // Exclude categories (employee, supplier, etc.)
    if (excludedCategories.size > 0) {
      filtered = filtered.filter((n) => !excludedCategories.has(n.category ?? 'prospect'));
    }

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
  }, [allNodes, excludedIds, hideNoInteraction, excludedCategories, filter, search]);

  // Cold contact clustering: group cold contacts into clusters of ~10
  // Spread across multiple concentric rings radiating outward with decreasing opacity
  const { displayNodes, coldClusters, allColdContacts } = useMemo(() => {
    const coldNodes = nodes.filter((n) => (n.tier ?? 'cold') === 'cold');
    const nonColdNodes = nodes.filter((n) => (n.tier ?? 'cold') !== 'cold');

    // If few enough cold contacts, show them all individually
    if (coldNodes.length <= COLD_CLUSTER_SIZE) {
      return { displayNodes: nodes, coldClusters: [] as ColdCluster[], allColdContacts: coldNodes };
    }

    // Group ALL cold contacts into clusters (no cap)
    const clusters: ColdCluster[] = [];
    const totalClusters = Math.ceil(coldNodes.length / COLD_CLUSTER_SIZE);

    // Distribute clusters across concentric rings
    const ringCount = Math.ceil(totalClusters / CLUSTER_RING_CAPACITY);
    const orbitStep = ringCount > 1
      ? (CLUSTER_OUTER_ORBIT - CLUSTER_INNER_ORBIT) / (ringCount - 1)
      : 0;

    let clusterIdx = 0;
    for (let ring = 0; ring < ringCount; ring++) {
      const orbitR = (CLUSTER_INNER_ORBIT + ring * orbitStep) * maxR;
      // How many clusters fit on this ring
      const remaining = totalClusters - clusterIdx;
      const onThisRing = Math.min(CLUSTER_RING_CAPACITY, remaining);
      // Offset odd rings by half-step so clusters nestle between previous ring
      const angleOffset = ring % 2 === 1 ? Math.PI / onThisRing : 0;

      for (let j = 0; j < onThisRing; j++) {
        const chunkStart = clusterIdx * COLD_CLUSTER_SIZE;
        const chunk = coldNodes.slice(chunkStart, chunkStart + COLD_CLUSTER_SIZE);
        if (chunk.length === 0) break;

        const angle = angleOffset + (j / onThisRing) * Math.PI * 2;
        clusters.push({
          id: `cold-cluster-${clusterIdx}`,
          contacts: chunk,
          x: Math.cos(angle) * orbitR,
          y: Math.sin(angle) * orbitR,
          radius: CLUSTER_NODE_RADIUS,
          angle,
        });
        clusterIdx++;
      }
    }

    return { displayNodes: nonColdNodes, coldClusters: clusters, allColdContacts: coldNodes };
  }, [nodes, maxR]);

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

  // Company clusters: when enabled, group contacts by company with centroid nodes
  interface CompanyCluster {
    id: string;
    name: string;
    initial: string;
    contacts: GraphNode[];
    cx: number;
    cy: number;
    totalDealValue: number;
    size: number;
  }

  // Consolidated company clusters: prominent companies shown individually, minor ones grouped
  interface CompanyMegaCluster {
    id: string;
    companies: CompanyCluster[];
    totalContacts: number;
    cx: number;
    cy: number;
    size: number;
  }

  const { prominentClusters: companyClusters, megaClusters: companyMegaClusters } = useMemo((): { prominentClusters: CompanyCluster[]; megaClusters: CompanyMegaCluster[] } => {
    if (!clustered) return { prominentClusters: [], megaClusters: [] };

    const groups: Record<string, GraphNode[]> = {};
    nodes.forEach((n) => {
      // Skip contacts without a company — they stay as individual nodes
      if (!n.company_id) return;
      (groups[n.company_id] = groups[n.company_id] || []).push(n);
    });

    const allClusters: CompanyCluster[] = Object.entries(groups).map(([companyId, contactNodes]) => {
      const centroidX = contactNodes.reduce((s, n) => s + n.x, 0) / contactNodes.length;
      const centroidY = contactNodes.reduce((s, n) => s + n.y, 0) / contactNodes.length;
      const companyObj = contactNodes[0].company_obj;

      const seen = new Set<string>();
      let totalDealValue = 0;
      contactNodes.forEach((n) => {
        n.deals.forEach((d) => {
          if (!seen.has(d.id) && d.value != null) {
            seen.add(d.id);
            totalDealValue += d.value;
          }
        });
      });

      return {
        id: companyId,
        name: companyObj?.name ?? companyId,
        initial: (companyObj?.name ?? companyId)[0].toUpperCase(),
        contacts: contactNodes,
        cx: centroidX,
        cy: centroidY,
        totalDealValue,
        size: Math.min(12 + contactNodes.length * 4, 60),
      };
    });

    // Prominent = has deals or 2+ contacts; minor = single contact with no deals
    const prominent = allClusters.filter((c) => c.contacts.length > 1 || c.totalDealValue > 0);
    const minor = allClusters.filter((c) => c.contacts.length === 1 && c.totalDealValue === 0);

    // Group minor companies into mega-clusters of ~8, placed on outer ring
    const MEGA_SIZE = 8;
    const megaClusters: CompanyMegaCluster[] = [];
    if (minor.length > 0) {
      const megaCount = Math.ceil(minor.length / MEGA_SIZE);
      const outerR = 0.85 * maxR;
      for (let i = 0; i < minor.length; i += MEGA_SIZE) {
        const idx = i / MEGA_SIZE;
        const chunk = minor.slice(i, i + MEGA_SIZE);
        const angle = (idx / megaCount) * Math.PI * 2;
        const totalContacts = chunk.reduce((s, c) => s + c.contacts.length, 0);
        megaClusters.push({
          id: `company-mega-${idx}`,
          companies: chunk,
          totalContacts,
          cx: Math.cos(angle) * outerR,
          cy: Math.sin(angle) * outerR,
          size: 18 + chunk.length * 2,
        });
      }
    }

    return { prominentClusters: prominent, megaClusters };
  }, [nodes, clustered, maxR]);

  // Lookup for selected/hovered nodes (search all nodes including clustered ones)
  const hoveredNode = hoveredId ? nodes.find((n) => n.id === hoveredId) ?? null : null;
  const selectedNode = selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null;
  const selectedCluster = selectedClusterId ? coldClusters.find((c) => c.id === selectedClusterId) ?? null : null;

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
    onSelectNode?.(node);
  }, [onSelectNode, multiSelectMode]);

  const handleClusterClick = useCallback((cluster: ColdCluster) => {
    if (multiSelectMode) {
      // In multi-select, add all contacts from the cluster
      setSelectedIds((prev) => {
        const next = new Set(prev);
        cluster.contacts.forEach((c) => next.add(c.id));
        return next;
      });
      return;
    }
    setSelectedId(null);
    setSelectedClusterId(cluster.id);
  }, [multiSelectMode]);

  const handleDeselect = useCallback(() => {
    setSelectedId(null);
    setSelectedClusterId(null);
    onSelectNode?.(null);
  }, [onSelectNode]);

  const toggleMultiSelect = useCallback(() => {
    setMultiSelectMode((prev) => {
      if (prev) setSelectedIds(new Set()); // clear selections when exiting
      return !prev;
    });
  }, []);

  // Convert screen (SVG element) coords to graph-root coords
  const screenToGraph = useCallback((screenX: number, screenY: number) => {
    const t = transformRef.current;
    return { x: (screenX - t.x) / t.k, y: (screenY - t.y) / t.k };
  }, []);

  // Drag-to-select handlers
  const handleDragStart = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!multiSelectMode) return;
    // Only start drag on background (not on nodes)
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

    // Only select if drag was big enough (not just a click)
    if (maxX - minX > 5 || maxY - minY > 5) {
      const hitIds = new Set(selectedIds);

      // Hit-test individual display nodes
      displayNodes.forEach((n) => {
        if (n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY) {
          hitIds.add(n.id);
        }
      });

      // Hit-test cluster nodes (select all contacts in hit clusters)
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
      {/* Stats + Filter toolbar */}
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
        activeSources={activeSources}
        onToggleSource={(source: ContactSource) => {
          setActiveSources((prev) => {
            const next = new Set(prev);
            if (next.has(source)) {
              // Don't allow removing all sources
              if (next.size > 1) next.delete(source);
            } else {
              next.add(source);
            }
            return next;
          });
        }}
      />

      {/* Backfill banner — shown when contacts exist but no warmth data */}
      {!hasWarmthData && !isLoading && contacts.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-500/10 border-b border-indigo-500/20 shrink-0">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-xs text-gray-300">
              <span className="font-semibold text-indigo-300">{contacts.length} contacts</span>
              {' '}found but no warmth data yet. Populate from your meetings, emails, and deals.
            </span>
          </div>
          <button
            onClick={() => backfill.mutate()}
            disabled={backfill.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs font-semibold hover:bg-indigo-500/30 transition-all disabled:opacity-50 shrink-0"
          >
            {backfill.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
            {backfill.isPending ? 'Populating...' : 'Populate Graph'}
          </button>
        </div>
      )}

      {/* Enrich banner — shown when contacts are missing company data */}
      {contactsMissingCompany > 0 && !isLoading && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs text-gray-300">
              <span className="font-semibold text-amber-300">{contactsMissingCompany} contacts</span>
              {' '}missing company data. Enrich from email domains and update categories.
            </span>
          </div>
          <button
            onClick={() => enrich.mutate()}
            disabled={enrich.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 text-xs font-semibold hover:bg-amber-500/30 transition-all disabled:opacity-50 shrink-0"
          >
            {enrich.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
            {enrich.isPending ? 'Enriching...' : 'Enrich Contacts'}
          </button>
        </div>
      )}

      {/* Main area: SVG + optional detail panel */}
      <div className="flex flex-1 overflow-hidden">
      <svg
        ref={svgRef}
        width={(selectedNode || selectedCluster) ? dimensions.width - 370 : dimensions.width}
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
          // Click on empty space deselects (only if not dragging)
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

          {/* Connection lines: centre to each non-clustered node */}
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

          {/* Connection lines: centre to each cluster (fade with distance) */}
          {coldClusters.map((cluster) => {
            const dist = Math.sqrt(cluster.x * cluster.x + cluster.y * cluster.y);
            const innerR = CLUSTER_INNER_ORBIT * maxR;
            const outerR = CLUSTER_OUTER_ORBIT * maxR;
            const ringProgress = outerR > innerR ? Math.max(0, (dist - innerR) / (outerR - innerR)) : 0;
            const lineOpacity = Math.max(0.02, 0.06 - ringProgress * 0.04);
            return (
              <line
                key={`conn-${cluster.id}`}
                x1={cx}
                y1={cy}
                x2={cluster.x}
                y2={cluster.y}
                stroke={TIER_COLORS.cold.glow}
                strokeOpacity={lineOpacity}
                strokeWidth={0.8}
                style={{ transition: 'all 0.6s ease' }}
              />
            );
          })}

          {/* Connection lines: centre to each company mega-cluster */}
          {companyMegaClusters.map((mega) => (
            <line
              key={`conn-${mega.id}`}
              x1={cx}
              y1={cy}
              x2={mega.cx}
              y2={mega.cy}
              stroke="rgba(99,102,241,0.15)"
              strokeOpacity={0.08}
              strokeWidth={0.6}
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

          {/* Company cluster nodes */}
          {companyClusters.map((cluster) => (
            <g key={`cluster-${cluster.id}`} style={{ transition: 'all 0.5s ease' }}>
              {/* Cluster background circle */}
              <circle
                cx={cluster.cx}
                cy={cluster.cy}
                r={cluster.size * 2.5}
                fill="rgba(99,102,241,0.04)"
                stroke="rgba(99,102,241,0.08)"
                strokeWidth={1}
                strokeDasharray="3 6"
              />
              {/* Company node at centroid */}
              <circle
                cx={cluster.cx}
                cy={cluster.cy}
                r={cluster.size}
                fill="rgba(30,30,46,0.9)"
                stroke="rgba(99,102,241,0.3)"
                strokeWidth={1.5}
              />
              <text
                x={cluster.cx}
                y={cluster.cy - 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#a5b4fc"
                fontSize={cluster.size * 0.6}
                fontWeight="700"
                fontFamily="Inter, system-ui, sans-serif"
              >
                {cluster.initial}
              </text>
              <text
                x={cluster.cx}
                y={cluster.cy + cluster.size + 10}
                textAnchor="middle"
                fill="rgba(255,255,255,0.5)"
                fontSize="8"
                fontFamily="Inter, system-ui, sans-serif"
              >
                {cluster.name}
              </text>
              {cluster.totalDealValue > 0 && (
                <text
                  x={cluster.cx}
                  y={cluster.cy + cluster.size + 20}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.3)"
                  fontSize="7"
                  fontFamily="Inter, system-ui, sans-serif"
                >
                  £{(cluster.totalDealValue / 1000).toFixed(0)}k
                </text>
              )}
            </g>
          ))}

          {/* Company mega-clusters (grouped minor companies on outer ring) */}
          {companyMegaClusters.map((mega) => (
            <g key={mega.id} style={{ transition: 'all 0.5s ease', opacity: 0.65 }}>
              <circle
                cx={mega.cx}
                cy={mega.cy}
                r={mega.size * 1.4}
                fill="none"
                stroke="rgba(99,102,241,0.12)"
                strokeWidth={1}
                strokeDasharray="3 4"
              />
              <circle
                cx={mega.cx}
                cy={mega.cy}
                r={mega.size}
                fill="url(#node-gradient-cold)"
                stroke="rgba(99,102,241,0.2)"
                strokeWidth={1.5}
              />
              <text
                x={mega.cx}
                y={mega.cy - 3}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#a5b4fc"
                fontSize="11"
                fontWeight="700"
                fontFamily="Inter, system-ui, sans-serif"
              >
                {mega.companies.length}
              </text>
              <text
                x={mega.cx}
                y={mega.cy + 8}
                textAnchor="middle"
                fill="rgba(165,180,252,0.5)"
                fontSize="7"
                fontFamily="Inter, system-ui, sans-serif"
              >
                cos
              </text>
              <text
                x={mega.cx}
                y={mega.cy + mega.size + 12}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="8"
                fontFamily="Inter, system-ui, sans-serif"
                opacity={0.6}
              >
                {mega.totalContacts} contacts
              </text>
            </g>
          ))}

          {/* Cold cluster nodes — multi-ring with fading opacity */}
          {coldClusters.map((cluster) => {
            const isClusterSelected = selectedClusterId === cluster.id;
            const isClusterHovered = hoveredId === cluster.id;
            const r = CLUSTER_NODE_RADIUS + (isClusterSelected ? 4 : isClusterHovered ? 2 : 0);

            // Calculate ring index from distance to derive opacity
            const dist = Math.sqrt(cluster.x * cluster.x + cluster.y * cluster.y);
            const innerR = CLUSTER_INNER_ORBIT * maxR;
            const outerR = CLUSTER_OUTER_ORBIT * maxR;
            const ringProgress = outerR > innerR ? Math.max(0, (dist - innerR) / (outerR - innerR)) : 0;
            const baseOpacity = Math.max(0.15, 0.6 - ringProgress * CLUSTER_OPACITY_DROP * 4);
            const nodeOpacity = isClusterSelected || isClusterHovered ? Math.min(0.95, baseOpacity + 0.3) : baseOpacity;

            return (
              <g
                key={cluster.id}
                style={{ cursor: 'pointer', transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1)', opacity: nodeOpacity }}
                onClick={() => handleClusterClick(cluster)}
                onMouseEnter={() => setHoveredId(cluster.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Outer ring */}
                <circle
                  cx={cluster.x}
                  cy={cluster.y}
                  r={r * 1.6}
                  fill="none"
                  stroke={TIER_COLORS.cold.primary}
                  strokeWidth={1}
                  strokeOpacity={isClusterSelected ? 0.4 : 0.15 * (1 - ringProgress * 0.5)}
                  strokeDasharray="3 4"
                />
                {/* Main node */}
                <circle
                  cx={cluster.x}
                  cy={cluster.y}
                  r={r}
                  fill="url(#node-gradient-cold)"
                  stroke={isClusterSelected ? '#a78bfa' : isClusterHovered ? TIER_COLORS.cold.primary : 'rgba(255,255,255,0.08)'}
                  strokeWidth={isClusterSelected ? 2 : 1}
                  filter={isClusterSelected ? 'url(#glow-selected)' : isClusterHovered ? 'url(#glow-cold)' : undefined}
                />
                {/* Count badge */}
                <text
                  x={cluster.x}
                  y={cluster.y + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="white"
                  fontSize="11"
                  fontWeight="700"
                  fontFamily="Inter, system-ui, sans-serif"
                >
                  {cluster.contacts.length}
                </text>
                {/* Label — only show on inner rings */}
                {ringProgress < 0.4 && (
                  <text
                    x={cluster.x}
                    y={cluster.y + r + 13}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize="9"
                    fontFamily="Inter, system-ui, sans-serif"
                    opacity={isClusterSelected || isClusterHovered ? 0.9 : 0.5}
                  >
                    cold
                  </text>
                )}
              </g>
            );
          })}

          {/* Contact nodes */}
          {displayNodes.map((node) => {
            const tier = node.tier ?? 'cold';
            const isTrending = (node.warmth_delta ?? 0) > 0.03;
            // Trending-up contacts in cold tier get promoted to cool visuals
            const visualTier = (tier === 'cold' && isTrending) ? 'cool' : tier;
            const tierColor = TIER_COLORS[visualTier];
            const displayName = node.full_name || `${node.first_name || ''} ${node.last_name || ''}`.trim() || node.email;
            const isSelected = selectedId === node.id || selectedIds.has(node.id);
            const isHovered = hoveredId === node.id;
            const r = node.radius + (isSelected ? 6 : isHovered ? 3 : 0);
            const showLabel = (node.warmth_score ?? 0) > 0.42 || isSelected || isHovered;
            const glowFilter = isSelected ? 'url(#glow-selected)' : (isHovered || (node.warmth_score ?? 0) > 0.65) ? `url(#glow-${visualTier})` : undefined;
            // Cold contacts at 50% opacity unless hovered/selected
            const nodeOpacity = (tier === 'cold' && !isTrending && !isSelected && !isHovered) ? 0.5 : 1;

            return (
              <g
                key={node.id}
                style={{ cursor: 'pointer', transition: 'transform 0.5s cubic-bezier(0.16,1,0.3,1)', opacity: nodeOpacity }}
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

                {/* Multi-select checkbox */}
                {multiSelectMode && (
                  <g>
                    <circle
                      cx={node.x - r * 0.7}
                      cy={node.y - r * 0.7}
                      r={6}
                      fill={selectedIds.has(node.id) ? '#6366f1' : '#1e1e2e'}
                      stroke={selectedIds.has(node.id) ? '#818cf8' : 'rgba(255,255,255,0.2)'}
                      strokeWidth={1.5}
                    />
                    {selectedIds.has(node.id) && (
                      <text
                        x={node.x - r * 0.7}
                        y={node.y - r * 0.7 + 1}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="white"
                        fontSize="8"
                        fontWeight="800"
                      >
                        {'\u2713'}
                      </text>
                    )}
                  </g>
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
      {selectedNode && !selectedCluster && (
        <GraphDetailPanel
          node={selectedNode}
          allNodes={allNodes}
          onClose={handleDeselect}
          onSelectContact={(id) => { setSelectedClusterId(null); setSelectedId(id); }}
          onExclude={(id) => setExcludedIds((prev) => new Set([...prev, id]))}
        />
      )}

      {/* Cluster detail panel */}
      {selectedCluster && (
        <ClusterDetailPanel
          cluster={selectedCluster}
          allColdContacts={allColdContacts}
          onClose={handleDeselect}
          onSelectContact={(id) => { setSelectedClusterId(null); setSelectedId(id); }}
          onSelectMultiple={(ids) => {
            setMultiSelectMode(true);
            setSelectedIds(new Set(ids));
          }}
        />
      )}
      </div>

      {/* Multi-select floating action bar */}
      {multiSelectMode && (
        <SelectionActionBar
          selectedIds={selectedIds}
          allNodes={allNodes}
          allColdContacts={allColdContacts}
          onToggleMode={toggleMultiSelect}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      )}

      {/* Hover tooltip (only when no node is selected) */}
      {hoveredNode && !selectedNode && !selectedCluster && (
        <GraphTooltip node={hoveredNode} position={mousePos} />
      )}
    </div>
  );
}
