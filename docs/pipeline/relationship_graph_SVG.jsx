import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as d3 from "d3";

// ── Data ──────────────────────────────────────────────────────
const COMPANIES = [
  { id: "c1", name: "Meridian Labs", industry: "SaaS", color: "#6366f1", initial: "M" },
  { id: "c2", name: "Oakbridge Capital", industry: "Finance", color: "#0ea5e9", initial: "O" },
  { id: "c3", name: "Helix Health", industry: "Healthcare", color: "#10b981", initial: "H" },
  { id: "c4", name: "Prism Analytics", industry: "Data", color: "#f59e0b", initial: "P" },
  { id: "c5", name: "Vertex Engineering", industry: "Engineering", color: "#ef4444", initial: "V" },
  { id: "c6", name: "Cascade Media", industry: "Media", color: "#ec4899", initial: "C" },
];

const DEALS = [
  { id: "d1", name: "Meridian Enterprise", value: 48000, stage: "Negotiation", probability: 0.85, health: "strong", companyId: "c1" },
  { id: "d2", name: "Oakbridge Pilot", value: 22000, stage: "Proposal", probability: 0.60, health: "healthy", companyId: "c2" },
  { id: "d3", name: "Helix Platform", value: 18500, stage: "Discovery", probability: 0.35, health: "at-risk", companyId: "c3" },
  { id: "d4", name: "Prism Integration", value: 12000, stage: "Qualification", probability: 0.20, health: "stalled", companyId: "c4" },
];

const HEALTH_COLORS = { strong: "#22c55e", healthy: "#6366f1", "at-risk": "#f59e0b", stalled: "#ef4444" };
const HEALTH_ICONS = { strong: "▲", healthy: "●", "at-risk": "◆", stalled: "▼" };

const CONTACTS = [
  { id: 1, name: "Sarah Chen", role: "VP Sales", companyId: "c1", warmth: 0.92, delta: 0.05, dealId: "d1", meetings: 12, emails: 34, calls: 8, linkedin: 5, lastType: "meeting", lastTime: "2h ago", nextAction: "Send contract revision", signals: ["Champion", "Budget Holder", "Engaged"], scores: { recency: 0.95, engagement: 0.88, dealMomentum: 0.92, multiThread: 0.85, sentiment: 0.90 } },
  { id: 2, name: "Marcus Rivera", role: "CTO", companyId: "c1", warmth: 0.78, delta: 0.03, dealId: "d1", meetings: 8, emails: 22, calls: 4, linkedin: 3, lastType: "email", lastTime: "1d ago", nextAction: "Share technical architecture doc", signals: ["Technical Buyer", "Evaluator"], scores: { recency: 0.80, engagement: 0.75, dealMomentum: 0.82, multiThread: 0.85, sentiment: 0.72 } },
  { id: 3, name: "James Thornton", role: "CFO", companyId: "c2", warmth: 0.65, delta: -0.04, dealId: "d2", meetings: 5, emails: 18, calls: 3, linkedin: 1, lastType: "call", lastTime: "3d ago", nextAction: "Follow up on pricing concerns", signals: ["Economic Buyer", "Cautious"], scores: { recency: 0.60, engagement: 0.65, dealMomentum: 0.58, multiThread: 0.45, sentiment: 0.55 } },
  { id: 4, name: "Priya Sharma", role: "Head of Ops", companyId: "c2", warmth: 0.55, delta: 0.02, dealId: "d2", meetings: 4, emails: 14, calls: 2, linkedin: 6, lastType: "linkedin", lastTime: "1d ago", nextAction: "Schedule demo for ops team", signals: ["Internal Champion", "Active"], scores: { recency: 0.70, engagement: 0.55, dealMomentum: 0.50, multiThread: 0.45, sentiment: 0.65 } },
  { id: 5, name: "Dr. Lisa Park", role: "CMO", companyId: "c3", warmth: 0.42, delta: -0.06, dealId: "d3", meetings: 3, emails: 11, calls: 1, linkedin: 2, lastType: "email", lastTime: "5d ago", nextAction: "Re-engage with case study", signals: ["Evaluator", "Going Quiet"], scores: { recency: 0.35, engagement: 0.45, dealMomentum: 0.40, multiThread: 0.30, sentiment: 0.48 } },
  { id: 6, name: "Tom Winters", role: "VP Eng", companyId: "c3", warmth: 0.38, delta: -0.02, dealId: "d3", meetings: 2, emails: 8, calls: 1, linkedin: 0, lastType: "meeting", lastTime: "8d ago", nextAction: "Technical deep-dive session", signals: ["Technical Gate", "Neutral"], scores: { recency: 0.28, engagement: 0.40, dealMomentum: 0.38, multiThread: 0.30, sentiment: 0.42 } },
  { id: 7, name: "Alex Novak", role: "Data Lead", companyId: "c4", warmth: 0.28, delta: 0.04, dealId: "d4", meetings: 2, emails: 6, calls: 0, linkedin: 4, lastType: "linkedin", lastTime: "4d ago", nextAction: "Send ROI calculator", signals: ["Early Interest", "Warming"], scores: { recency: 0.45, engagement: 0.25, dealMomentum: 0.18, multiThread: 0.15, sentiment: 0.55 } },
  { id: 8, name: "Nina Volkov", role: "CEO", companyId: "c4", warmth: 0.18, delta: -0.03, dealId: "d4", meetings: 1, emails: 4, calls: 1, linkedin: 0, lastType: "email", lastTime: "14d ago", nextAction: "Exec intro via warm referral", signals: ["Decision Maker", "Distant"], scores: { recency: 0.15, engagement: 0.18, dealMomentum: 0.15, multiThread: 0.15, sentiment: 0.30 } },
  { id: 9, name: "Rachel Kim", role: "Sales Dir", companyId: "c5", warmth: 0.72, delta: 0.06, meetings: 6, emails: 20, calls: 5, linkedin: 3, lastType: "call", lastTime: "6h ago", nextAction: "Prepare proposal draft", signals: ["High Intent", "Fast Mover", "Budget Confirmed"], scores: { recency: 0.90, engagement: 0.70, dealMomentum: 0.65, multiThread: 0.50, sentiment: 0.78 } },
  { id: 10, name: "David Okonkwo", role: "CRO", companyId: "c5", warmth: 0.48, delta: 0.01, meetings: 3, emails: 10, calls: 2, linkedin: 1, lastType: "email", lastTime: "3d ago", nextAction: "Share case study", signals: ["Interested", "Evaluating Options"], scores: { recency: 0.55, engagement: 0.48, dealMomentum: 0.40, multiThread: 0.50, sentiment: 0.50 } },
  { id: 11, name: "Sophie Laurent", role: "Content VP", companyId: "c6", warmth: 0.12, delta: -0.05, meetings: 1, emails: 3, calls: 0, linkedin: 2, lastType: "linkedin", lastTime: "21d ago", nextAction: "Cold reactivation sequence", signals: ["Went Dark", "Was Interested"], scores: { recency: 0.08, engagement: 0.12, dealMomentum: 0.05, multiThread: 0.10, sentiment: 0.25 } },
  { id: 12, name: "Kai Tanaka", role: "Partnerships", companyId: "c6", warmth: 0.06, delta: -0.01, meetings: 0, emails: 2, calls: 0, linkedin: 1, lastType: "email", lastTime: "30d ago", nextAction: "Enrich profile via Apollo", signals: ["Cold Lead"], scores: { recency: 0.04, engagement: 0.06, dealMomentum: 0.02, multiThread: 0.10, sentiment: 0.15 } },
];

const TIMELINE_DATA = {
  1: [
    { type: "meeting", label: "Contract review call", time: "2h ago", sentiment: "hot" },
    { type: "email", label: "Sent revised pricing deck", time: "1d ago", sentiment: "positive" },
    { type: "signal", label: "Opened proposal 3 times", time: "2d ago", sentiment: "hot" },
    { type: "call", label: "Quick check-in on timeline", time: "4d ago", sentiment: "positive" },
    { type: "meeting", label: "Stakeholder alignment session", time: "1w ago", sentiment: "positive" },
  ],
  3: [
    { type: "call", label: "Pricing concerns discussion", time: "3d ago", sentiment: "cold" },
    { type: "email", label: "Requested budget breakdown", time: "5d ago", sentiment: "neutral" },
    { type: "meeting", label: "Initial discovery call", time: "2w ago", sentiment: "positive" },
  ],
};

const getTier = (w) => w >= 0.7 ? "hot" : w >= 0.4 ? "warm" : w >= 0.15 ? "cool" : "cold";
const TIER_COLORS = { hot: "#f97316", warm: "#eab308", cool: "#6366f1", cold: "#64748b" };
const TIER_GLOWS = { hot: "#f97316", warm: "#eab308", cool: "#818cf8", cold: "#475569" };
const TIER_RINGS = [
  { tier: "hot", radius: 0.22, label: "Hot" },
  { tier: "warm", radius: 0.42, label: "Warm" },
  { tier: "cool", radius: 0.65, label: "Cool" },
  { tier: "cold", radius: 0.88, label: "Cold" },
];

const SIGNAL_LABELS = { "Champion": "👑", "Budget Holder": "💰", "Technical Buyer": "⚙️", "Evaluator": "🔍", "Economic Buyer": "📊", "High Intent": "🔥", "Fast Mover": "⚡", "Internal Champion": "🏅", "Decision Maker": "👔", "Going Quiet": "🔇", "Went Dark": "🌑", "Cold Lead": "❄️", "Engaged": "✅", "Active": "📡", "Cautious": "⚠️", "Neutral": "➖", "Distant": "📏", "Budget Confirmed": "✓", "Evaluating Options": "⚖️", "Was Interested": "💭", "Warming": "🌡️", "Technical Gate": "🔒", "Early Interest": "🌱" };

const AGENT_ACTIONS = [
  { id: "draft", label: "Draft Follow-up", credits: 2, confidence: 0.87, color: "#6366f1", icon: "✉" },
  { id: "prep", label: "Meeting Prep", credits: 4, confidence: 0.92, color: "#8b5cf6", icon: "📋" },
  { id: "reengage", label: "Re-engage", credits: 3, confidence: 0.76, color: "#0ea5e9", icon: "🔄" },
  { id: "task", label: "Create Task", credits: 0, confidence: 0.95, color: "#22c55e", icon: "✓" },
  { id: "enrich", label: "Enrich Profile", credits: 1, confidence: 0.88, color: "#f59e0b", icon: "🔎" },
];

const TYPE_ICONS = { email: "✉", meeting: "◎", signal: "◈", call: "☎", linkedin: "in" };
const SENT_COLORS = { hot: "#f97316", positive: "#22c55e", neutral: "#64748b", cold: "#6366f1" };

// ── Main Component ──────────────────────────────────────────
export default function RelationshipGraph() {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 700 });
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [filter, setFilter] = useState(null);
  const [search, setSearch] = useState("");
  const [panelTab, setPanelTab] = useState("overview");
  const [expandedAction, setExpandedAction] = useState(null);
  const [triggered, setTriggered] = useState({});
  const [transform, setTransform] = useState(d3.zoomIdentity);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setDimensions({ width: e.contentRect.width, height: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // D3 Zoom
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const zoom = d3.zoom()
      .scaleExtent([0.3, 4])
      .on("zoom", (e) => setTransform(e.transform));
    svg.call(zoom);
    return () => svg.on(".zoom", null);
  }, []);

  const cx = dimensions.width / 2;
  const cy = dimensions.height / 2;
  const maxR = Math.min(cx, cy) * 0.88;

  // Compute node positions
  const nodes = useMemo(() => {
    const filtered = filter
      ? CONTACTS.filter(c => getTier(c.warmth) === filter)
      : CONTACTS;
    const searched = search
      ? filtered.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || COMPANIES.find(co => co.id === c.companyId)?.name.toLowerCase().includes(search.toLowerCase()))
      : filtered;

    return searched.map((c, i) => {
      const angle = (i / searched.length) * Math.PI * 2 - Math.PI / 2;
      const radius = (1 - c.warmth) * maxR * 0.85 + maxR * 0.12;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      const size = 14 + c.warmth * 14;
      const tier = getTier(c.warmth);
      const company = COMPANIES.find(co => co.id === c.companyId);
      const deal = DEALS.find(d => d.id === c.dealId);
      return { ...c, x, y, size, tier, company, deal, angle, radius };
    });
  }, [filter, search, cx, cy, maxR]);

  // Deal arcs: connect nodes on same deal
  const dealArcs = useMemo(() => {
    const arcs = [];
    const dealGroups = {};
    nodes.forEach(n => { if (n.dealId) { (dealGroups[n.dealId] = dealGroups[n.dealId] || []).push(n); } });
    Object.entries(dealGroups).forEach(([dId, group]) => {
      if (group.length < 2) return;
      const deal = DEALS.find(d => d.id === dId);
      for (let i = 0; i < group.length - 1; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i], b = group[j];
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const offset = dist * 0.25;
          const nx = -dy / dist, ny = dx / dist;
          arcs.push({ a, b, deal, cpx: mx + nx * offset, cpy: my + ny * offset });
        }
      }
    });
    return arcs;
  }, [nodes]);

  const handleTrigger = (actionId) => {
    setTriggered(p => ({ ...p, [actionId]: true }));
    setTimeout(() => setTriggered(p => ({ ...p, [actionId]: false })), 3000);
  };

  const selectedNode = selected ? nodes.find(n => n.id === selected) : null;
  const hoveredNode = hovered ? nodes.find(n => n.id === hovered) : null;

  const tierCounts = useMemo(() => {
    const counts = { hot: 0, warm: 0, cool: 0, cold: 0 };
    CONTACTS.forEach(c => counts[getTier(c.warmth)]++);
    return counts;
  }, []);

  const totalPipeline = DEALS.reduce((s, d) => s + d.value, 0);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100vh", background: "#030712", display: "flex", flexDirection: "column", fontFamily: "'DM Sans', system-ui, sans-serif", overflow: "hidden", position: "relative" }}>

      {/* ── Top Bar ─────────────────────────────────────── */}
      <div style={{ height: 52, background: "rgba(17,17,24,0.92)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(99,102,241,0.15)", display: "flex", alignItems: "center", padding: "0 20px", gap: 14, flexShrink: 0, zIndex: 20 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 12 }}>60</div>
        <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 15 }}>Relationship Graph</span>
        <span style={{ color: "#475569", fontSize: 12 }}>SVG + D3 Force</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts..."
            style={{ background: "rgba(30,30,46,0.8)", border: "1px solid rgba(100,116,139,0.3)", borderRadius: 8, padding: "6px 14px", color: "#e2e8f0", fontSize: 12, width: 180, outline: "none" }}
          />
        </div>
      </div>

      {/* ── Stats + Filters Bar ─────────────────────────── */}
      <div style={{ height: 44, background: "rgba(17,17,24,0.7)", borderBottom: "1px solid rgba(100,116,139,0.12)", display: "flex", alignItems: "center", padding: "0 20px", gap: 10, flexShrink: 0, zIndex: 20 }}>
        {["hot", "warm", "cool", "cold"].map(t => (
          <button key={t} onClick={() => setFilter(f => f === t ? null : t)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 6, border: `1px solid ${filter === t ? TIER_COLORS[t] : "rgba(100,116,139,0.2)"}`, background: filter === t ? `${TIER_COLORS[t]}22` : "rgba(30,30,46,0.5)", cursor: "pointer", transition: "all 0.15s" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: TIER_COLORS[t] }} />
            <span style={{ color: filter === t ? TIER_COLORS[t] : "#94a3b8", fontSize: 11, fontWeight: 600, textTransform: "capitalize" }}>{t}</span>
            <span style={{ color: "#64748b", fontSize: 11 }}>{tierCounts[t]}</span>
          </button>
        ))}
        <div style={{ width: 1, height: 20, background: "rgba(100,116,139,0.2)", margin: "0 6px" }} />
        <span style={{ color: "#64748b", fontSize: 11 }}>Pipeline</span>
        <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700 }}>£{(totalPipeline / 1000).toFixed(1)}k</span>
        <div style={{ width: 1, height: 20, background: "rgba(100,116,139,0.2)", margin: "0 6px" }} />
        <span style={{ color: "#64748b", fontSize: 11 }}>Trending</span>
        <span style={{ color: "#22c55e", fontSize: 12, fontWeight: 700 }}>{CONTACTS.filter(c => c.delta > 0.03).length} ↑</span>
        <span style={{ color: "#ef4444", fontSize: 12, fontWeight: 700, marginLeft: 4 }}>{CONTACTS.filter(c => c.delta < -0.03).length} ↓</span>
        <span style={{ marginLeft: "auto", color: "#475569", fontSize: 10 }}>Zoom: {Math.round(transform.k * 100)}%</span>
      </div>

      {/* ── Main Area ───────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        {/* SVG Graph */}
        <svg ref={svgRef} width={dimensions.width - (selectedNode ? 370 : 0)} height={dimensions.height - 96}
          style={{ background: "#030712", cursor: "grab", transition: "width 0.3s ease" }}
          onMouseMove={e => setMousePos({ x: e.clientX, y: e.clientY })}>

          {/* Defs: filters, gradients */}
          <defs>
            {Object.entries(TIER_GLOWS).map(([tier, color]) => (
              <filter key={tier} id={`glow-${tier}`} x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feFlood floodColor={color} floodOpacity="0.5" />
                <feComposite in2="blur" operator="in" />
                <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            ))}
            <filter id="glow-selected" x="-150%" y="-150%" width="400%" height="400%">
              <feGaussianBlur stdDeviation="12" result="blur" />
              <feFlood floodColor="#a78bfa" floodOpacity="0.7" />
              <feComposite in2="blur" operator="in" />
              <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <radialGradient id="nebula1" cx="30%" cy="40%"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.06" /><stop offset="100%" stopColor="#6366f1" stopOpacity="0" /></radialGradient>
            <radialGradient id="nebula2" cx="70%" cy="60%"><stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.04" /><stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" /></radialGradient>
            <radialGradient id="nebula3" cx="50%" cy="30%"><stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.03" /><stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" /></radialGradient>
            <radialGradient id="center-glow" cx="50%" cy="50%">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.3" />
              <stop offset="40%" stopColor="#6366f1" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </radialGradient>
            {CONTACTS.map(c => {
              const color = TIER_COLORS[getTier(c.warmth)];
              return (
                <radialGradient key={`ng-${c.id}`} id={`node-grad-${c.id}`} cx="35%" cy="35%">
                  <stop offset="0%" stopColor={color} stopOpacity="0.9" />
                  <stop offset="60%" stopColor={color} stopOpacity="0.6" />
                  <stop offset="100%" stopColor={color} stopOpacity="0.3" />
                </radialGradient>
              );
            })}
          </defs>

          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
            {/* Nebula */}
            <rect width="100%" height="100%" fill="url(#nebula1)" />
            <rect width="100%" height="100%" fill="url(#nebula2)" />
            <rect width="100%" height="100%" fill="url(#nebula3)" />

            {/* Orbit Rings */}
            {TIER_RINGS.map((ring, i) => (
              <g key={ring.tier}>
                <circle cx={cx} cy={cy} r={ring.radius * maxR} fill="none" stroke="rgba(100,116,139,0.08)" strokeWidth="1" strokeDasharray="4 8">
                  <animateTransform attributeName="transform" type="rotate" from={`0 ${cx} ${cy}`} to={`${i % 2 === 0 ? 360 : -360} ${cx} ${cy}`} dur={`${200 + i * 40}s`} repeatCount="indefinite" />
                </circle>
                <text x={cx + ring.radius * maxR + 8} y={cy - 4} fill={TIER_COLORS[ring.tier]} fontSize="9" fontWeight="600" opacity="0.5" fontFamily="DM Sans, sans-serif">{ring.label}</text>
              </g>
            ))}

            {/* Centre glow */}
            <circle cx={cx} cy={cy} r={maxR * 0.15} fill="url(#center-glow)">
              <animate attributeName="r" values={`${maxR * 0.13};${maxR * 0.17};${maxR * 0.13}`} dur="4s" repeatCount="indefinite" />
            </circle>

            {/* Connection lines: center to nodes */}
            {nodes.map(n => (
              <line key={`conn-${n.id}`} x1={cx} y1={cy} x2={n.x} y2={n.y}
                stroke={TIER_COLORS[n.tier]} strokeOpacity={0.06 + n.warmth * 0.12} strokeWidth={0.5 + n.warmth * 1.2}
                style={{ transition: "all 0.6s ease" }} />
            ))}

            {/* Deal arcs */}
            {dealArcs.map((arc, i) => (
              <path key={`arc-${i}`}
                d={`M ${arc.a.x} ${arc.a.y} Q ${arc.cpx} ${arc.cpy} ${arc.b.x} ${arc.b.y}`}
                fill="none" stroke={HEALTH_COLORS[arc.deal.health]} strokeWidth="1.5"
                strokeDasharray="5 5" strokeOpacity="0.35"
                style={{ transition: "all 0.6s ease" }} />
            ))}

            {/* Centre node */}
            <g>
              <circle cx={cx} cy={cy} r={22} fill="rgba(99,102,241,0.15)" stroke="rgba(99,102,241,0.4)" strokeWidth="2">
                <animate attributeName="r" values="20;24;20" dur="3s" repeatCount="indefinite" />
              </circle>
              <circle cx={cx} cy={cy} r={14} fill="#1e1b4b" stroke="rgba(139,92,246,0.5)" strokeWidth="1.5" />
              <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fill="#a78bfa" fontSize="8" fontWeight="800" fontFamily="DM Sans, sans-serif">YOU</text>
            </g>

            {/* Contact Nodes */}
            {nodes.map(n => {
              const isSelected = selected === n.id;
              const isHovered = hovered === n.id;
              const r = n.size + (isSelected ? 6 : isHovered ? 3 : 0);
              const glowFilter = isSelected ? "url(#glow-selected)" : (isHovered || n.warmth > 0.65) ? `url(#glow-${n.tier})` : undefined;

              return (
                <g key={n.id}
                  style={{ cursor: "pointer", transition: "transform 0.5s cubic-bezier(0.16,1,0.3,1)" }}
                  onClick={() => { setSelected(n.id); setPanelTab("overview"); setExpandedAction(null); }}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}>

                  {/* Outer glow ring */}
                  {(isSelected || isHovered || n.warmth > 0.6) && (
                    <circle cx={n.x} cy={n.y} r={r * 2.2} fill={TIER_GLOWS[n.tier]} opacity={isSelected ? 0.12 : isHovered ? 0.08 : 0.04}>
                      {isSelected && <animate attributeName="r" values={`${r * 2};${r * 2.6};${r * 2}`} dur="2.5s" repeatCount="indefinite" />}
                    </circle>
                  )}

                  {/* Main node */}
                  <circle cx={n.x} cy={n.y} r={r} fill={`url(#node-grad-${n.id})`}
                    filter={glowFilter}
                    stroke={isSelected ? "#a78bfa" : isHovered ? TIER_COLORS[n.tier] : "rgba(255,255,255,0.08)"}
                    strokeWidth={isSelected ? 2.5 : isHovered ? 1.5 : 0.5}
                    style={{ transition: "all 0.3s ease" }} />

                  {/* Deal probability arc */}
                  {n.deal && (() => {
                    const arcR = r + 4;
                    const startAngle = -Math.PI / 2;
                    const endAngle = startAngle + n.deal.probability * Math.PI * 2;
                    const x1 = n.x + Math.cos(startAngle) * arcR;
                    const y1 = n.y + Math.sin(startAngle) * arcR;
                    const x2 = n.x + Math.cos(endAngle) * arcR;
                    const y2 = n.y + Math.sin(endAngle) * arcR;
                    const largeArc = n.deal.probability > 0.5 ? 1 : 0;
                    return (
                      <path d={`M ${x1} ${y1} A ${arcR} ${arcR} 0 ${largeArc} 1 ${x2} ${y2}`}
                        fill="none" stroke={HEALTH_COLORS[n.deal.health]} strokeWidth="2" strokeOpacity="0.7" strokeLinecap="round"
                        style={{ transition: "all 0.5s ease" }} />
                    );
                  })()}

                  {/* Company badge */}
                  {n.company && (
                    <g>
                      <circle cx={n.x - r * 0.6} cy={n.y + r * 0.6} r={6.5} fill={n.company.color} stroke="#030712" strokeWidth="1.5" />
                      <text x={n.x - r * 0.6} y={n.y + r * 0.6 + 0.5} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="7" fontWeight="700" fontFamily="DM Sans, sans-serif">{n.company.initial}</text>
                    </g>
                  )}

                  {/* Delta indicator */}
                  {Math.abs(n.delta) > 0.03 && (
                    <g>
                      <circle cx={n.x + r * 0.6} cy={n.y - r * 0.6} r={5.5} fill={n.delta > 0 ? "#22c55e" : "#ef4444"} stroke="#030712" strokeWidth="1.5" />
                      <text x={n.x + r * 0.6} y={n.y - r * 0.6 + 0.5} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="7" fontWeight="800">{n.delta > 0 ? "↑" : "↓"}</text>
                    </g>
                  )}

                  {/* Label */}
                  {(n.warmth > 0.42 || isSelected || isHovered) && (
                    <text x={n.x} y={n.y + r + 13} textAnchor="middle" fill="#e2e8f0" fontSize="10" fontWeight="600" fontFamily="DM Sans, sans-serif"
                      opacity={isSelected || isHovered ? 1 : 0.7}
                      style={{ transition: "opacity 0.3s", pointerEvents: "none" }}>
                      {n.name.split(" ")[0]}
                    </text>
                  )}
                  {isHovered && (
                    <text x={n.x} y={n.y + r + 24} textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="DM Sans, sans-serif" style={{ pointerEvents: "none" }}>
                      {n.role} · {n.company?.name}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* ── Hover Tooltip ─────────────────────────────── */}
        {hoveredNode && !selectedNode && (
          <div style={{ position: "fixed", left: mousePos.x + 16, top: mousePos.y - 10, background: "rgba(17,17,24,0.95)", backdropFilter: "blur(16px)", border: "1px solid rgba(100,116,139,0.2)", borderRadius: 10, padding: "10px 14px", pointerEvents: "none", zIndex: 50, minWidth: 180 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg, ${TIER_COLORS[hoveredNode.tier]}, ${hoveredNode.company?.color || "#6366f1"})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700 }}>{hoveredNode.name[0]}</div>
              <div>
                <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700 }}>{hoveredNode.name}</div>
                <div style={{ color: "#94a3b8", fontSize: 10 }}>{hoveredNode.role} · {hoveredNode.company?.name}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", marginTop: 6 }}>
              <div style={{ color: "#64748b", fontSize: 9 }}>Warmth</div>
              <div style={{ color: TIER_COLORS[hoveredNode.tier], fontSize: 10, fontWeight: 700, textAlign: "right" }}>{(hoveredNode.warmth * 100).toFixed(0)}%</div>
              <div style={{ color: "#64748b", fontSize: 9 }}>Trend</div>
              <div style={{ color: hoveredNode.delta > 0 ? "#22c55e" : hoveredNode.delta < 0 ? "#ef4444" : "#64748b", fontSize: 10, fontWeight: 600, textAlign: "right" }}>{hoveredNode.delta > 0 ? "+" : ""}{(hoveredNode.delta * 100).toFixed(1)}%</div>
              <div style={{ color: "#64748b", fontSize: 9 }}>Last</div>
              <div style={{ color: "#94a3b8", fontSize: 10, textAlign: "right" }}>{hoveredNode.lastTime}</div>
              {hoveredNode.deal && <>
                <div style={{ color: "#64748b", fontSize: 9 }}>Deal</div>
                <div style={{ color: HEALTH_COLORS[hoveredNode.deal.health], fontSize: 10, fontWeight: 600, textAlign: "right" }}>£{(hoveredNode.deal.value / 1000).toFixed(0)}k</div>
              </>}
            </div>
          </div>
        )}

        {/* ── Detail Panel ──────────────────────────────── */}
        {selectedNode && (
          <div style={{ width: 370, flexShrink: 0, background: "rgba(17,17,24,0.88)", backdropFilter: "blur(20px)", borderLeft: "1px solid rgba(100,116,139,0.15)", display: "flex", flexDirection: "column", overflow: "hidden", transition: "width 0.3s ease" }}>

            {/* Panel Header */}
            <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(100,116,139,0.12)", background: `linear-gradient(135deg, ${TIER_COLORS[selectedNode.tier]}11, transparent)` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: `linear-gradient(135deg, ${TIER_COLORS[selectedNode.tier]}, ${selectedNode.company?.color || "#6366f1"})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 15, fontWeight: 700 }}>{selectedNode.name[0]}</div>
                  <div>
                    <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 700 }}>{selectedNode.name}</div>
                    <div style={{ color: "#94a3b8", fontSize: 11 }}>{selectedNode.role} · {selectedNode.company?.name}</div>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: "rgba(100,116,139,0.15)", border: "none", borderRadius: 6, width: 28, height: 28, color: "#94a3b8", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(100,116,139,0.15)", overflow: "hidden" }}>
                  <div style={{ width: `${selectedNode.warmth * 100}%`, height: "100%", borderRadius: 3, background: `linear-gradient(90deg, ${TIER_COLORS[selectedNode.tier]}, ${TIER_COLORS[selectedNode.tier]}aa)`, transition: "width 0.5s ease" }} />
                </div>
                <span style={{ color: TIER_COLORS[selectedNode.tier], fontSize: 13, fontWeight: 800, minWidth: 36 }}>{(selectedNode.warmth * 100).toFixed(0)}%</span>
                {Math.abs(selectedNode.delta) > 0.01 && (
                  <span style={{ color: selectedNode.delta > 0 ? "#22c55e" : "#ef4444", fontSize: 11, fontWeight: 700 }}>{selectedNode.delta > 0 ? "↑" : "↓"}{Math.abs(selectedNode.delta * 100).toFixed(1)}%</span>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid rgba(100,116,139,0.12)", paddingLeft: 18 }}>
              {["overview", "timeline", "agents"].map(tab => (
                <button key={tab} onClick={() => setPanelTab(tab)}
                  style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: panelTab === tab ? "#e2e8f0" : "#64748b", background: "none", border: "none", cursor: "pointer", borderBottom: panelTab === tab ? `2px solid ${TIER_COLORS[selectedNode.tier]}` : "2px solid transparent", textTransform: "capitalize", transition: "all 0.15s" }}>
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflow: "auto", padding: 18 }}>

              {/* ── OVERVIEW ─────────────────────────────── */}
              {panelTab === "overview" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Stats grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                    {[["Meetings", selectedNode.meetings, "◎"], ["Emails", selectedNode.emails, "✉"], ["Calls", selectedNode.calls, "☎"], ["LinkedIn", selectedNode.linkedin, "in"]].map(([label, val, icon]) => (
                      <div key={label} style={{ background: "rgba(30,30,46,0.6)", borderRadius: 8, padding: "8px 6px", textAlign: "center", border: "1px solid rgba(100,116,139,0.1)" }}>
                        <div style={{ fontSize: 12, marginBottom: 2 }}>{icon}</div>
                        <div style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 800 }}>{val}</div>
                        <div style={{ color: "#64748b", fontSize: 8, fontWeight: 600 }}>{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Scoring breakdown */}
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Warmth Breakdown</div>
                    {[["Recency", selectedNode.scores.recency, "#f97316"], ["Engagement", selectedNode.scores.engagement, "#eab308"], ["Deal Momentum", selectedNode.scores.dealMomentum, "#6366f1"], ["Multi-Thread", selectedNode.scores.multiThread, "#0ea5e9"], ["Sentiment", selectedNode.scores.sentiment, "#22c55e"]].map(([label, val, color]) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ color: "#94a3b8", fontSize: 10, width: 80, flexShrink: 0 }}>{label}</span>
                        <div style={{ flex: 1, height: 5, borderRadius: 3, background: "rgba(100,116,139,0.12)", overflow: "hidden" }}>
                          <div style={{ width: `${val * 100}%`, height: "100%", borderRadius: 3, background: color, transition: "width 0.5s ease" }} />
                        </div>
                        <span style={{ color: "#e2e8f0", fontSize: 10, fontWeight: 700, width: 28, textAlign: "right" }}>{(val * 100).toFixed(0)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Deal card */}
                  {selectedNode.deal && (
                    <div style={{ background: "rgba(30,30,46,0.6)", border: `1px solid ${HEALTH_COLORS[selectedNode.deal.health]}33`, borderRadius: 10, padding: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700 }}>{selectedNode.deal.name}</span>
                        <span style={{ color: HEALTH_COLORS[selectedNode.deal.health], fontSize: 10, fontWeight: 700 }}>{HEALTH_ICONS[selectedNode.deal.health]} {selectedNode.deal.health}</span>
                      </div>
                      <div style={{ display: "flex", gap: 12 }}>
                        <div><div style={{ color: "#64748b", fontSize: 9 }}>Value</div><div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700 }}>£{(selectedNode.deal.value / 1000).toFixed(0)}k</div></div>
                        <div><div style={{ color: "#64748b", fontSize: 9 }}>Stage</div><div style={{ color: "#94a3b8", fontSize: 11 }}>{selectedNode.deal.stage}</div></div>
                        <div><div style={{ color: "#64748b", fontSize: 9 }}>Probability</div><div style={{ color: HEALTH_COLORS[selectedNode.deal.health], fontSize: 12, fontWeight: 700 }}>{(selectedNode.deal.probability * 100).toFixed(0)}%</div></div>
                      </div>
                    </div>
                  )}

                  {/* Signals */}
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Active Signals</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {selectedNode.signals.map(s => (
                        <span key={s} style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 6, padding: "3px 8px", color: "#a5b4fc", fontSize: 10 }}>{SIGNAL_LABELS[s] || "•"} {s}</span>
                      ))}
                    </div>
                  </div>

                  {/* AI Next Step */}
                  <div style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10, padding: 12 }}>
                    <div style={{ color: "#a5b4fc", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>AI Suggested Next Step</div>
                    <div style={{ color: "#e2e8f0", fontSize: 12 }}>{selectedNode.nextAction}</div>
                  </div>

                  {/* Related contacts */}
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Related at {selectedNode.company?.name}</div>
                    {nodes.filter(n => n.companyId === selectedNode.companyId && n.id !== selectedNode.id).map(n => (
                      <div key={n.id} onClick={() => { setSelected(n.id); setPanelTab("overview"); }}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, cursor: "pointer", marginBottom: 4, background: "transparent", transition: "background 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(100,116,139,0.1)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <div style={{ width: 22, height: 22, borderRadius: "50%", background: TIER_COLORS[n.tier], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 700 }}>{n.name[0]}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: "#e2e8f0", fontSize: 11, fontWeight: 600 }}>{n.name}</div>
                          <div style={{ color: "#64748b", fontSize: 9 }}>{n.role}</div>
                        </div>
                        <span style={{ color: TIER_COLORS[n.tier], fontSize: 10, fontWeight: 700 }}>{(n.warmth * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── TIMELINE ─────────────────────────────── */}
              {panelTab === "timeline" && (
                <div style={{ position: "relative", paddingLeft: 20 }}>
                  <div style={{ position: "absolute", left: 6, top: 0, bottom: 0, width: 1.5, background: "rgba(100,116,139,0.15)", borderRadius: 1 }} />
                  {(TIMELINE_DATA[selectedNode.id] || [
                    { type: selectedNode.lastType, label: `Last interaction — ${selectedNode.lastType}`, time: selectedNode.lastTime, sentiment: "neutral" },
                    { type: "signal", label: "Contact added to pipeline", time: "2w ago", sentiment: "positive" },
                  ]).map((ev, i) => (
                    <div key={i} style={{ position: "relative", marginBottom: 18 }}>
                      <div style={{ position: "absolute", left: -17, top: 2, width: 13, height: 13, borderRadius: "50%", background: SENT_COLORS[ev.sentiment], border: "2px solid #0a0a0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: 6, color: "#fff" }}>{TYPE_ICONS[ev.type] || "•"}</span>
                      </div>
                      <div style={{ color: "#e2e8f0", fontSize: 11, fontWeight: 600 }}>{ev.label}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <span style={{ color: "#64748b", fontSize: 10 }}>{ev.time}</span>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: SENT_COLORS[ev.sentiment] }} />
                        <span style={{ color: SENT_COLORS[ev.sentiment], fontSize: 9, textTransform: "capitalize" }}>{ev.sentiment}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── AGENTS ───────────────────────────────── */}
              {panelTab === "agents" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {AGENT_ACTIONS.map(action => {
                    const isExpanded = expandedAction === action.id;
                    const isTriggered = triggered[action.id];
                    return (
                      <div key={action.id} style={{ background: "rgba(30,30,46,0.6)", border: `1px solid ${isExpanded ? action.color + "44" : "rgba(100,116,139,0.12)"}`, borderRadius: 10, overflow: "hidden", transition: "all 0.2s" }}>
                        <div onClick={() => setExpandedAction(isExpanded ? null : action.id)}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer" }}>
                          <span style={{ fontSize: 14 }}>{action.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>{action.label}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                              <div style={{ width: 50, height: 3, borderRadius: 2, background: "rgba(100,116,139,0.2)", overflow: "hidden" }}>
                                <div style={{ width: `${action.confidence * 100}%`, height: "100%", borderRadius: 2, background: action.color }} />
                              </div>
                              <span style={{ color: "#94a3b8", fontSize: 9 }}>{(action.confidence * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                          <span style={{ color: action.credits > 0 ? "#f59e0b" : "#22c55e", fontSize: 10, fontWeight: 700 }}>{action.credits > 0 ? `${action.credits} cr` : "Free"}</span>
                          <span style={{ color: "#64748b", fontSize: 10, transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}>▾</span>
                        </div>
                        {isExpanded && (
                          <div style={{ padding: "0 12px 12px", borderTop: "1px solid rgba(100,116,139,0.08)" }}>
                            <div style={{ background: "rgba(10,10,18,0.6)", borderRadius: 8, padding: 10, marginTop: 8, marginBottom: 10, fontSize: 11, color: "#94a3b8", lineHeight: 1.6 }}>
                              {action.id === "draft" && (<>
                                <div style={{ color: "#64748b", fontSize: 9, marginBottom: 4 }}>PREVIEW — Email Draft</div>
                                <div style={{ color: "#a5b4fc", fontWeight: 600 }}>Re: {selectedNode.deal?.name || selectedNode.company?.name} — Next Steps</div>
                                <div style={{ marginTop: 6, color: "#94a3b8" }}>Hi {selectedNode.name.split(" ")[0]}, great speaking with you {selectedNode.lastTime}. Following up on our conversation about {selectedNode.deal?.stage?.toLowerCase() || "next steps"} — I wanted to share a few points that address the topics we covered...</div>
                              </>)}
                              {action.id === "prep" && (<>
                                <div style={{ color: "#64748b", fontSize: 9, marginBottom: 4 }}>PREVIEW — Meeting Briefing</div>
                                <div style={{ color: "#a5b4fc", fontWeight: 600 }}>{selectedNode.name} — {selectedNode.role} at {selectedNode.company?.name}</div>
                                <div style={{ marginTop: 6 }}>{selectedNode.meetings} meetings · {selectedNode.emails} emails · Warmth: {(selectedNode.warmth * 100).toFixed(0)}% {selectedNode.delta > 0 ? "↑ trending up" : selectedNode.delta < 0 ? "↓ trending down" : ""}</div>
                                {selectedNode.deal && <div style={{ marginTop: 4 }}>Deal: {selectedNode.deal.name} ({selectedNode.deal.stage}) — £{(selectedNode.deal.value / 1000).toFixed(0)}k at {(selectedNode.deal.probability * 100).toFixed(0)}%</div>}
                                <div style={{ marginTop: 4 }}>Key signals: {selectedNode.signals.join(", ")}</div>
                              </>)}
                              {action.id === "reengage" && (<>
                                <div style={{ color: "#64748b", fontSize: 9, marginBottom: 4 }}>PREVIEW — Sequence</div>
                                <div style={{ color: "#a5b4fc", fontWeight: 600 }}>{selectedNode.warmth > 0.5 ? "Nurture — Active Deal" : selectedNode.warmth > 0.2 ? "Re-engage — Gone Quiet" : "Cold Reactivation"}</div>
                                <div style={{ marginTop: 6 }}>Day 0: {selectedNode.warmth > 0.5 ? "Send value-add content" : selectedNode.warmth > 0.2 ? "Personalised check-in email" : "Enrich via Apollo"}</div>
                                <div>Day 3: {selectedNode.warmth > 0.5 ? "LinkedIn touchpoint" : selectedNode.warmth > 0.2 ? "Share relevant case study" : "Cold personalised outbound"}</div>
                                <div>Day 7: {selectedNode.warmth > 0.5 ? "Check-in email" : selectedNode.warmth > 0.2 ? "Phone call attempt" : "Follow-up with social proof"}</div>
                              </>)}
                              {action.id === "task" && (<>
                                <div style={{ color: "#64748b", fontSize: 9, marginBottom: 4 }}>PREVIEW — Task</div>
                                <div style={{ color: "#a5b4fc", fontWeight: 600 }}>{selectedNode.nextAction}</div>
                                <div style={{ marginTop: 6 }}>Due: {selectedNode.warmth > 0.6 ? "Today" : selectedNode.warmth > 0.3 ? "Tomorrow" : "This week"} · Priority: {selectedNode.warmth > 0.6 ? "High" : selectedNode.warmth > 0.3 ? "Medium" : "Low"}</div>
                              </>)}
                              {action.id === "enrich" && (<>
                                <div style={{ color: "#64748b", fontSize: 9, marginBottom: 4 }}>PREVIEW — Enrichment</div>
                                <div style={{ color: "#a5b4fc", fontWeight: 600 }}>Sources: Apollo, LinkedIn, Company website, News</div>
                                <div style={{ marginTop: 6 }}>Fields: Direct phone, tech stack, recent funding, org chart, buying signals</div>
                              </>)}
                            </div>
                            {isTriggered ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8 }}>
                                <span style={{ color: "#22c55e", fontSize: 13 }}>✓</span>
                                <span style={{ color: "#22c55e", fontSize: 11, fontWeight: 600 }}>Queued — executing via Command Centre</span>
                              </div>
                            ) : (
                              <button onClick={() => handleTrigger(action.id)}
                                style={{ width: "100%", padding: "8px 14px", borderRadius: 8, border: "none", background: `linear-gradient(135deg, ${action.color}, ${action.color}cc)`, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "opacity 0.15s" }}
                                onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
                                onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                                Trigger {action.label} {action.credits > 0 ? `· ${action.credits} credits` : ""}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}