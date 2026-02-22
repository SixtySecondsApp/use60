import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, Network, Eye, EyeOff, Route, X } from 'lucide-react';
import { graphNodes, graphEdges, warmIntroPaths } from '../data/graphData';
import type { GraphNode, GraphEdge } from '../data/graphData';

const TOOLTIP_TEXT =
  'Powered by Relationship Graph \u2014 maps connections across deals, detects former colleagues from company history, and suggests warm introduction paths';

// Layout: position nodes in a deterministic circular/clustered arrangement
// Sarah at center (300, 220). Others arranged by company clusters.

interface NodePosition {
  id: string;
  x: number;
  y: number;
}

const NODE_POSITIONS: NodePosition[] = [
  // Sarah (center)
  { id: 'sarah', x: 300, y: 220 },
  // DataFlow cluster (top-left)
  { id: 'jake-torres', x: 120, y: 80 },
  { id: 'lisa-park', x: 200, y: 50 },
  { id: 'sophie-wright', x: 80, y: 150 },
  // CloudBase (top-right)
  { id: 'maria-chen', x: 480, y: 80 },
  // Apex (right)
  { id: 'david-kim', x: 530, y: 200 },
  // TechVault cluster (bottom-right)
  { id: 'rachel-adams', x: 500, y: 320 },
  { id: 'ben-foster', x: 440, y: 380 },
  // Vertex (bottom)
  { id: 'tom-nguyen', x: 300, y: 400 },
  // SkyBridge (bottom-left)
  { id: 'nina-patel', x: 120, y: 370 },
  // Quantum cluster (left)
  { id: 'omar-hassan', x: 60, y: 260 },
  { id: 'emily-watson', x: 60, y: 320 },
  // Network contacts
  { id: 'james-wright', x: 190, y: 180 },
  { id: 'priya-sharma', x: 400, y: 160 },
];

function getPos(id: string): { x: number; y: number } {
  return NODE_POSITIONS.find((p) => p.id === id) ?? { x: 300, y: 220 };
}

function healthColor(health: GraphNode['health']): string {
  switch (health) {
    case 'healthy':
      return '#10b981';
    case 'at_risk':
      return '#f59e0b';
    case 'critical':
      return '#ef4444';
    case 'ghost':
      return '#9ca3af';
    default:
      return '#6b7280';
  }
}

function healthBorder(health: GraphNode['health']): string {
  switch (health) {
    case 'healthy':
      return 'border-emerald-400';
    case 'at_risk':
      return 'border-amber-400';
    case 'critical':
      return 'border-red-400';
    case 'ghost':
      return 'border-gray-400';
    default:
      return 'border-gray-300';
  }
}

function strengthToWidth(strength: number): number {
  if (strength >= 80) return 3;
  if (strength >= 50) return 2;
  return 1;
}

// Company background circles
const COMPANY_CLUSTERS: Array<{ company: string; cx: number; cy: number; r: number }> = [
  { company: 'DataFlow Systems', cx: 135, cy: 95, r: 75 },
  { company: 'TechVault', cx: 470, cy: 350, r: 55 },
  { company: 'Quantum Labs', cx: 60, cy: 290, r: 48 },
];

export default function RelationshipGraphScene() {
  const [showTooltip, setShowTooltip] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showRisks, setShowRisks] = useState(false);
  const [showWarmIntro, setShowWarmIntro] = useState(false);

  const warmIntroPath = warmIntroPaths[0]; // Sarah -> Lisa Park -> Jake Torres

  const riskNodes = useMemo(
    () => graphNodes.filter((n) => n.health === 'critical' || n.health === 'ghost'),
    [],
  );

  const hoveredNodeData = hoveredNode
    ? graphNodes.find((n) => n.id === hoveredNode)
    : null;

  const hoveredEdge = hoveredNode
    ? graphEdges.find(
        (e) =>
          (e.source === 'sarah' && e.target === hoveredNode) ||
          (e.target === 'sarah' && e.source === hoveredNode),
      )
    : null;

  const selectedNodeData = selectedNode
    ? graphNodes.find((n) => n.id === selectedNode)
    : null;

  const selectedEdge = selectedNode
    ? graphEdges.find(
        (e) =>
          (e.source === 'sarah' && e.target === selectedNode) ||
          (e.target === 'sarah' && e.source === selectedNode),
      )
    : null;

  // Warm intro highlight edges
  const warmIntroEdgeIds = showWarmIntro
    ? [
        ['sarah', 'lisa-park'],
        ['lisa-park', 'jake-torres'],
      ]
    : [];

  function isWarmIntroEdge(source: string, target: string): boolean {
    return warmIntroEdgeIds.some(
      ([s, t]) => (s === source && t === target) || (s === target && t === source),
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-violet-500" />
          <span className="text-sm font-semibold text-gray-600">
            Relationship Graph — 14 Contacts, 8 Deals
          </span>
        </div>
        <div className="relative">
          <button
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
          >
            <Info className="w-4 h-4 text-gray-400" />
          </button>
          {showTooltip && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute right-0 top-8 z-50 w-72 rounded-lg bg-gray-900 px-3 py-2 text-xs text-gray-100 shadow-lg"
            >
              {TOOLTIP_TEXT}
            </motion.div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowWarmIntro(!showWarmIntro)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
            showWarmIntro
              ? 'bg-violet-100 border-violet-300 text-violet-700'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Route className="w-3 h-3" />
          Show Warm Intros
        </button>
        <button
          onClick={() => setShowRisks(!showRisks)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
            showRisks
              ? 'bg-red-100 border-red-300 text-red-700'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {showRisks ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          Show Risks
        </button>
      </div>

      {/* Graph */}
      <div className="relative rounded-xl bg-gray-950 overflow-hidden" style={{ height: 460 }}>
        {/* SVG edges */}
        <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 1 }}>
          {/* Company cluster backgrounds */}
          {COMPANY_CLUSTERS.map((c) => (
            <g key={c.company}>
              <circle
                cx={c.cx}
                cy={c.cy}
                r={c.r}
                fill="rgba(255,255,255,0.03)"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
              />
              <text
                x={c.cx}
                y={c.cy + c.r + 14}
                textAnchor="middle"
                className="fill-gray-600 text-[9px]"
              >
                {c.company}
              </text>
            </g>
          ))}

          {/* Edges */}
          {graphEdges.map((edge, idx) => {
            const from = getPos(edge.source);
            const to = getPos(edge.target);
            const isHighlighted = isWarmIntroEdge(edge.source, edge.target);

            return (
              <line
                key={idx}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={isHighlighted ? '#a78bfa' : 'rgba(255,255,255,0.1)'}
                strokeWidth={isHighlighted ? 3 : strengthToWidth(edge.strength)}
                strokeDasharray={edge.type === 'former_colleague' ? '4 3' : undefined}
              />
            );
          })}

          {/* Warm intro path arrow annotations */}
          {showWarmIntro && (
            <>
              {/* Glow on path */}
              <line
                x1={getPos('sarah').x}
                y1={getPos('sarah').y}
                x2={getPos('lisa-park').x}
                y2={getPos('lisa-park').y}
                stroke="#a78bfa"
                strokeWidth={5}
                opacity={0.3}
              />
              <line
                x1={getPos('lisa-park').x}
                y1={getPos('lisa-park').y}
                x2={getPos('jake-torres').x}
                y2={getPos('jake-torres').y}
                stroke="#a78bfa"
                strokeWidth={5}
                opacity={0.3}
              />
            </>
          )}
        </svg>

        {/* Nodes */}
        {graphNodes.map((node) => {
          const pos = getPos(node.id);
          const isCenter = node.isUser;
          const isRisk =
            showRisks && (node.health === 'critical' || node.health === 'ghost');
          const size = isCenter ? 44 : 32;
          const half = size / 2;

          return (
            <motion.div
              key={node.id}
              className="absolute flex flex-col items-center"
              style={{
                left: pos.x - half,
                top: pos.y - half,
                zIndex: hoveredNode === node.id || selectedNode === node.id ? 20 : 10,
              }}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
            >
              {/* Pulsing risk ring */}
              {isRisk && (
                <motion.div
                  className="absolute rounded-full border-2 border-red-500"
                  style={{ width: size + 10, height: size + 10, top: -5, left: -5 }}
                  animate={{ scale: [1, 1.3, 1], opacity: [1, 0.3, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}

              {/* Pulsing glow for center node */}
              {isCenter && (
                <motion.div
                  className="absolute rounded-full"
                  style={{
                    width: size + 16,
                    height: size + 16,
                    top: -8,
                    left: -8,
                    background:
                      'radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%)',
                  }}
                  animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 3, repeat: Infinity }}
                />
              )}

              {/* Node circle */}
              <div
                className={`rounded-full border-2 flex items-center justify-center text-white text-[10px] font-bold cursor-pointer transition-transform hover:scale-110 ${
                  isCenter ? 'border-violet-400' : healthBorder(node.health)
                }`}
                style={{
                  width: size,
                  height: size,
                  backgroundColor: isCenter ? '#7c3aed' : healthColor(node.health) + '33',
                  borderColor: isCenter ? '#a78bfa' : healthColor(node.health),
                }}
              >
                {node.name
                  .split(' ')
                  .map((w) => w[0])
                  .join('')}
              </div>

              {/* Name label */}
              <span
                className="mt-1 text-[9px] text-gray-400 whitespace-nowrap text-center leading-tight"
                style={{ maxWidth: 80 }}
              >
                {node.name.split(' ')[0]}
              </span>

              {/* Ghost label */}
              {isRisk && showRisks && (
                <span className="text-[8px] text-red-400 font-medium mt-0.5">
                  {node.health === 'ghost' ? 'Ghost' : 'Critical'}
                </span>
              )}
            </motion.div>
          );
        })}

        {/* Hover tooltip */}
        <AnimatePresence>
          {hoveredNodeData && !selectedNode && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="absolute z-30 bg-gray-900 rounded-lg shadow-xl border border-gray-700 px-3 py-2.5"
              style={{
                left: Math.min(getPos(hoveredNodeData.id).x + 30, 420),
                top: Math.max(getPos(hoveredNodeData.id).y - 20, 10),
                maxWidth: 200,
              }}
            >
              <p className="text-xs font-semibold text-white">{hoveredNodeData.name}</p>
              <p className="text-[10px] text-gray-400">
                {hoveredNodeData.title}, {hoveredNodeData.company}
              </p>
              {/* Strength bar */}
              <div className="mt-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] text-gray-500">Strength</span>
                  <span className="text-[9px] text-gray-400">{hoveredNodeData.strength}/100</span>
                </div>
                <div className="h-1 rounded-full bg-gray-700">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${hoveredNodeData.strength}%`,
                      backgroundColor: healthColor(hoveredNodeData.health),
                    }}
                  />
                </div>
              </div>
              {hoveredNodeData.lastInteraction && (
                <p className="text-[9px] text-gray-500 mt-1.5">
                  Last: {hoveredNodeData.lastInteraction}
                </p>
              )}
              {hoveredEdge?.notes && (
                <p className="text-[9px] text-gray-400 mt-1 italic leading-snug">
                  {hoveredEdge.notes.length > 100
                    ? hoveredEdge.notes.slice(0, 100) + '...'
                    : hoveredEdge.notes}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Warm intro callout */}
        <AnimatePresence>
          {showWarmIntro && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute bottom-3 left-3 right-3 z-30 bg-violet-950/90 backdrop-blur-sm border border-violet-700 rounded-lg px-4 py-3"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Route className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs font-semibold text-violet-300">
                  Warm Introduction Path
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-300">
                <span className="font-medium text-violet-300">Sarah</span>
                <span className="text-violet-500">&rarr;</span>
                <span className="font-medium text-violet-300">Lisa Park</span>
                <span className="text-violet-500">&rarr;</span>
                <span className="font-medium text-violet-300">Jake Torres</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                Lisa brought Jake from Zendesk to DataFlow. Prior relationship means Lisa can vouch
                for Sarah&apos;s understanding of the space. Confidence: {warmIntroPath.confidence}%
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom panel: Strength breakdown */}
      <AnimatePresence>
        {selectedNodeData && selectedEdge && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-lg border border-gray-200 bg-white overflow-hidden"
          >
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{selectedNodeData.name}</p>
                  <p className="text-xs text-gray-500">
                    {selectedNodeData.title} at {selectedNodeData.company}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1 rounded hover:bg-gray-100"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Strength', value: selectedEdge.strength },
                  { label: 'Interactions', value: selectedEdge.interactionCount },
                  {
                    label: 'Recency',
                    value:
                      Math.max(
                        0,
                        Math.floor(
                          (Date.now() - new Date(selectedEdge.lastInteraction).getTime()) /
                            86400000,
                        ),
                      ) + 'd ago',
                  },
                  { label: 'Type', value: selectedEdge.type.replace('_', ' ') },
                ].map((item) => (
                  <div key={item.label} className="text-center">
                    <p className="text-lg font-bold text-gray-900">{item.value}</p>
                    <p className="text-[10px] text-gray-500 uppercase font-medium">{item.label}</p>
                  </div>
                ))}
              </div>
              {selectedEdge.notes && (
                <p className="text-xs text-gray-500 mt-3 border-t border-gray-100 pt-2">
                  {selectedEdge.notes}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
