/**
 * ParticleFlowCanvas — Canvas-based particle flow visualization
 *
 * Renders animated particles flowing between user nodes (left),
 * a checkpoint zone (middle), and LLM endpoint nodes (right).
 * Soft red = requests (L→R), soft blue = responses (R→L).
 * Designed for 100+ concurrent user nodes using HTML5 Canvas.
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import type { ActiveUser, RecentEvent, LLMEndpoint } from '@/lib/hooks/useGodsEyeData';

// ─── Types ──────────────────────────────────────────────────────────────

interface ParticleFlowCanvasProps {
  activeUsers: ActiveUser[];
  recentEvents: RecentEvent[];
  llmEndpoints: LLMEndpoint[];
  width: number;
  height: number;
  /** Pixels per frame for dot movement. Default 1.5 */
  flowSpeed?: number;
  onUserClick?: (user: ActiveUser) => void;
  onEndpointClick?: (endpoint: LLMEndpoint) => void;
}

/** Precomputed spline path for fast distance→position lookup */
interface SplinePath {
  totalLength: number;
  /** Flat array: [d0, x0, y0, d1, x1, y1, ...] */
  samples: Float64Array;
  sampleCount: number;
}

/** A Burst represents a Morse-pattern group that travels as a request→response cycle. */
interface Burst {
  /** 'outbound' = red elements going right, 'returning' = blue elements going left */
  phase: 'outbound' | 'returning';
  /** Per-element distance travelled in pixels, one per MORSE_PATTERN entry */
  elementDistances: number[];
  /** Precomputed S-curve spline path (same path used for both directions) */
  path: SplinePath;
  /** User node ID — only one active burst per user+endpoint pair */
  userId: string;
  /** Endpoint node ID */
  endpointId: string;
  userX: number;
  userY: number;
  endpointX: number;
  endpointY: number;
  isFlagged: boolean;
  opacity: number;
  size: number;
}

interface NodePosition {
  x: number;
  y: number;
  label: string;
  orgName: string;
  id: string;
  shortId: string;
  lastRequestAt: string;
  radius: number;
  isActive?: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────

const COLORS = {
  request: { r: 239, g: 68, b: 68 },      // Soft red
  requestPassed: { r: 74, g: 222, b: 128 }, // Green — passed checkpoint rules
  response: { r: 96, g: 165, b: 250 },     // Soft blue
  flagged: { r: 251, g: 146, b: 60 },      // Orange warning
  checkpoint: { r: 74, g: 222, b: 128 },   // Green gate
  checkpointFlagged: { r: 251, g: 146, b: 60 },
  userNode: '#6366f1',
  userNodeDim: '#4b4d8a',
  endpointNode: '#10b981',
  text: '#e2e8f0',
  textDim: '#94a3b8',
  gridLine: 'rgba(148, 163, 184, 0.05)',
  bg: '#0f172a',
};

const FLOW_SPEED_PX = 10; // pixels per frame — constant for all dots
const MAX_BURSTS = 80;

// Morse pattern: ... - . . .-.. . (STEELE)
// Unit = 6px. Dot = 1 unit, Dash = 3 units, intra-char gap = 1 unit, inter-char gap = 3 units
const MORSE_UNIT = 6;
const MORSE_PATTERN: Array<{ type: 'dot' | 'dash'; offset: number }> = [
  // S: ...
  { type: 'dot',  offset: 0 },
  { type: 'dot',  offset: -2 * MORSE_UNIT },
  { type: 'dot',  offset: -4 * MORSE_UNIT },
  // T: -
  { type: 'dash', offset: -8 * MORSE_UNIT },
  // E: .
  { type: 'dot',  offset: -14 * MORSE_UNIT },
  // E: .
  { type: 'dot',  offset: -18 * MORSE_UNIT },
  // L: .-..
  { type: 'dot',  offset: -22 * MORSE_UNIT },
  { type: 'dash', offset: -24 * MORSE_UNIT },
  { type: 'dot',  offset: -28 * MORSE_UNIT },
  { type: 'dot',  offset: -30 * MORSE_UNIT },
  // E: .
  { type: 'dot',  offset: -34 * MORSE_UNIT },
];

// ─── Helpers ────────────────────────────────────────────────────────────

/** Cubic bezier interpolation */
function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

const PATH_SAMPLES = 120; // samples per full path (60 per S-curve segment)

/**
 * Build a precomputed S-curve spline path: user → checkpoint → endpoint.
 * Two cubic bezier S-curves joined at the checkpoint midpoint.
 * Returns a lookup table for fast distance→position queries.
 */
function buildSplinePath(
  startX: number, startY: number,
  cpX: number, // checkpoint X position
  cpYMin: number, cpYMax: number, // checkpoint vertical bounds
  targetX: number, targetY: number,
): SplinePath {
  // Clamp to the central half of the checkpoint zone for tighter flow
  const innerMargin = (cpYMax - cpYMin) / 4;
  const innerMin = cpYMin + innerMargin;
  const innerMax = cpYMax - innerMargin;
  const midY = (startY + targetY) / 2;
  const cpY = Math.max(innerMin, Math.min(innerMax, midY));

  // S-curve 1: start → checkpoint
  // Control points pull horizontally to create smooth S shape
  const s1_cx0 = startX + (cpX - startX) * 0.5;
  const s1_cy0 = startY;
  const s1_cx1 = cpX - (cpX - startX) * 0.5;
  const s1_cy1 = cpY;

  // S-curve 2: checkpoint → target
  const s2_cx0 = cpX + (targetX - cpX) * 0.5;
  const s2_cy0 = cpY;
  const s2_cx1 = targetX - (targetX - cpX) * 0.5;
  const s2_cy1 = targetY;

  const halfSamples = PATH_SAMPLES / 2;
  const samples = new Float64Array(PATH_SAMPLES * 3);

  let totalDist = 0;
  let prevX = startX, prevY = startY;
  let idx = 0;

  // First S-curve: start → checkpoint
  for (let i = 0; i < halfSamples; i++) {
    const t = (i + 1) / halfSamples;
    const x = cubicBezier(t, startX, s1_cx0, s1_cx1, cpX);
    const y = cubicBezier(t, startY, s1_cy0, s1_cy1, cpY);
    totalDist += Math.sqrt((x - prevX) ** 2 + (y - prevY) ** 2);
    samples[idx++] = totalDist;
    samples[idx++] = x;
    samples[idx++] = y;
    prevX = x;
    prevY = y;
  }

  // Second S-curve: checkpoint → target
  for (let i = 0; i < halfSamples; i++) {
    const t = (i + 1) / halfSamples;
    const x = cubicBezier(t, cpX, s2_cx0, s2_cx1, targetX);
    const y = cubicBezier(t, cpY, s2_cy0, s2_cy1, targetY);
    totalDist += Math.sqrt((x - prevX) ** 2 + (y - prevY) ** 2);
    samples[idx++] = totalDist;
    samples[idx++] = x;
    samples[idx++] = y;
    prevX = x;
    prevY = y;
  }

  return { totalLength: totalDist, samples, sampleCount: PATH_SAMPLES };
}

/** Look up position at a given pixel distance along a precomputed spline path */
function getSplinePoint(path: SplinePath, dist: number): { x: number; y: number } {
  if (dist <= 0) {
    // Before first sample — return first sample position
    return { x: path.samples[1], y: path.samples[2] };
  }
  if (dist >= path.totalLength) {
    const last = (path.sampleCount - 1) * 3;
    return { x: path.samples[last + 1], y: path.samples[last + 2] };
  }

  // Binary search for the segment containing this distance
  let lo = 0, hi = path.sampleCount - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (path.samples[mid * 3] < dist) lo = mid + 1;
    else hi = mid;
  }

  const i1 = lo * 3;
  const d1 = path.samples[i1];
  const x1 = path.samples[i1 + 1];
  const y1 = path.samples[i1 + 2];

  if (lo === 0) return { x: x1, y: y1 };

  const i0 = (lo - 1) * 3;
  const d0 = path.samples[i0];
  const x0 = path.samples[i0 + 1];
  const y0 = path.samples[i0 + 2];

  const segLen = d1 - d0;
  const t = segLen > 0 ? (dist - d0) / segLen : 0;

  return {
    x: x0 + (x1 - x0) * t,
    y: y0 + (y1 - y0) * t,
  };
}

function truncateLabel(text: string, maxLen: number): string {
  if (!text) return '?';
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

function formatRelativeDate(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Component ──────────────────────────────────────────────────────────

export function ParticleFlowCanvas({
  activeUsers,
  recentEvents,
  llmEndpoints,
  width,
  height,
  flowSpeed = FLOW_SPEED_PX,
  onUserClick,
  onEndpointClick,
}: ParticleFlowCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const burstsRef = useRef<Burst[]>([]);
  const animFrameRef = useRef<number>(0);
  const userNodesRef = useRef<NodePosition[]>([]);
  const endpointNodesRef = useRef<NodePosition[]>([]);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const flowSpeedRef = useRef(flowSpeed);
  flowSpeedRef.current = flowSpeed;
  const seenEventIdsRef = useRef<Set<string>>(new Set());

  // Layout zones
  const leftZone = width * 0.18;
  const checkpointX = width * 0.5;
  const rightZone = width * 0.85;
  const topPad = 60;
  const bottomPad = 40;

  // Checkpoint vertical bounds — middle 1/3 of usable height
  const usableH = height - topPad - bottomPad;
  const cpHeight = usableH / 3;
  const cpTop = topPad + (usableH - cpHeight) / 2;
  const cpBottom = cpTop + cpHeight;

  // Compute node positions
  const computeNodes = useCallback(() => {
    const usableHeight = height - topPad - bottomPad;

    // User nodes on the left
    const users = activeUsers.slice(0, 50); // Cap visual nodes at 50
    const userSpacing = users.length > 1 ? usableHeight / (users.length - 1) : 0;
    userNodesRef.current = users.map((u, i) => ({
      x: leftZone,
      y: topPad + (users.length === 1 ? usableHeight / 2 : i * userSpacing),
      label: u.user_name || u.user_email || u.user_id.slice(0, 7),
      orgName: u.org_name || '',
      id: u.user_id,
      shortId: u.user_id.slice(0, 7),
      lastRequestAt: u.last_request_at,
      radius: Math.min(6, Math.max(3, Math.log2(u.request_count + 1) * 2)),
      isActive: u.is_active,
    }));

    // Endpoint nodes on the right — show top models by activity
    // Also include endpoints referenced by recent events so particles always have a target
    const recentModelIds = new Set(recentEvents.map(e => e.model));
    const hasRecentEvent = (modelId: string) =>
      recentModelIds.has(modelId) || Array.from(recentModelIds).some(m => modelId.startsWith(m));
    const topEndpoints = llmEndpoints
      .filter(e => e.active_request_count > 0 || hasRecentEvent(e.model_id))
      .sort((a, b) => b.active_request_count - a.active_request_count)
      .slice(0, 15);

    // If no active endpoints, show all available (up to 8)
    const endpoints = topEndpoints.length > 0 ? topEndpoints : llmEndpoints.slice(0, 8);

    // Stable sort by provider+model so vertical positions don't shuffle when counts change
    endpoints.sort((a, b) => `${a.provider}/${a.model_id}`.localeCompare(`${b.provider}/${b.model_id}`));
    const epSpacing = endpoints.length > 1 ? usableHeight / (endpoints.length - 1) : 0;
    endpointNodesRef.current = endpoints.map((e, i) => ({
      x: rightZone,
      y: topPad + (endpoints.length === 1 ? usableHeight / 2 : i * epSpacing),
      label: e.display_name,
      orgName: '',
      id: e.id,
      shortId: '',
      lastRequestAt: '',
      radius: Math.min(8, Math.max(4, Math.log2(e.active_request_count + 1) * 2.5)),
    }));
  }, [activeUsers, llmEndpoints, recentEvents, width, height, leftZone, rightZone, topPad, bottomPad]);

  // Map model_id → endpoint node for quick lookup
  // Also maps short model names (e.g. "claude-haiku-4-5") to endpoint IDs
  // since events may log truncated model names vs full IDs in ai_models
  const endpointByModel = useMemo(() => {
    const map = new Map<string, string>(); // model_id → endpoint.id
    for (const ep of llmEndpoints) {
      map.set(ep.model_id, ep.id);
    }
    return map;
  }, [llmEndpoints]);

  // Resolve an event's model string to an endpoint ID, handling prefix mismatches
  const resolveEndpoint = useCallback((eventModel: string): string | undefined => {
    // Exact match
    const exact = endpointByModel.get(eventModel);
    if (exact) return exact;
    // Prefix match: event model is a prefix of a canonical model_id
    for (const [modelId, epId] of Array.from(endpointByModel.entries())) {
      if (modelId.startsWith(eventModel)) return epId;
    }
    return undefined;
  }, [endpointByModel]);

  // Spawn bursts from real events only — detect genuinely new events
  useEffect(() => {
    // Recompute node positions first so refs are fresh for this render cycle.
    // Without this, burst paths use stale positions from the previous render
    // because the computeNodes effect runs *after* this one in React's order.
    computeNodes();

    if (userNodesRef.current.length === 0 || endpointNodesRef.current.length === 0) return;

    // On first load, seed the seen set without spawning bursts
    if (seenEventIdsRef.current.size === 0 && recentEvents.length > 0) {
      for (const e of recentEvents) {
        seenEventIdsRef.current.add(e.id);
      }
      return;
    }

    const newEvents = recentEvents.filter(e => !seenEventIdsRef.current.has(e.id));
    if (newEvents.length === 0) return;

    for (const event of newEvents) {
      seenEventIdsRef.current.add(event.id);

      if (burstsRef.current.length >= MAX_BURSTS) continue;

      // Find matching user node
      const userNode = userNodesRef.current.find(n => n.id === event.user_id);
      if (!userNode) continue;

      // Find matching endpoint node via model_id (handles prefix mismatches)
      const epId = resolveEndpoint(event.model);
      const endpointNode = epId
        ? endpointNodesRef.current.find(n => n.id === epId)
        : null;

      // Skip burst if endpoint isn't in visible nodes — never send to wrong endpoint
      if (!endpointNode) continue;

      const splinePath = buildSplinePath(userNode.x, userNode.y, checkpointX, cpTop, cpBottom, endpointNode.x, endpointNode.y);
      if (splinePath.totalLength === 0) continue;

      burstsRef.current.push({
        phase: 'outbound',
        elementDistances: MORSE_PATTERN.map(p => p.offset),
        path: splinePath,
        userId: userNode.id,
        endpointId: endpointNode.id,
        userX: userNode.x,
        userY: userNode.y,
        endpointX: endpointNode.x,
        endpointY: endpointNode.y,
        isFlagged: event.is_flagged || false,
        opacity: 0.7 + Math.random() * 0.3,
        size: 2 + Math.random() * 1.5,
      });
    }

    // Cap seen set to prevent unbounded growth
    if (seenEventIdsRef.current.size > 500) {
      const arr = Array.from(seenEventIdsRef.current);
      seenEventIdsRef.current = new Set(arr.slice(arr.length - 300));
    }
  }, [recentEvents, endpointByModel, computeNodes]);

  // Main render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    // Draw subtle grid
    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw checkpoint zone — 1/3 height, vertically centered
    const checkpointWidth = 40;

    const gradient = ctx.createLinearGradient(
      checkpointX - checkpointWidth, 0,
      checkpointX + checkpointWidth, 0
    );
    gradient.addColorStop(0, 'rgba(74, 222, 128, 0)');
    gradient.addColorStop(0.5, 'rgba(74, 222, 128, 0.08)');
    gradient.addColorStop(1, 'rgba(74, 222, 128, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(checkpointX - checkpointWidth, cpTop, checkpointWidth * 2, cpHeight);

    // Checkpoint line
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(checkpointX, cpTop);
    ctx.lineTo(checkpointX, cpBottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Checkpoint label
    ctx.fillStyle = 'rgba(74, 222, 128, 0.6)';
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CHECKPOINT', checkpointX, cpTop - 8);

    // Draw zone labels
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('USERS (7D)', leftZone, topPad - 28);
    ctx.fillText('LLM ENDPOINTS', rightZone, topPad - 28);

    // Update and draw bursts — wrapped in try/catch to prevent render loop death
    try {
      const aliveBursts: Burst[] = [];
      for (const b of burstsRef.current) {
        // Advance all elements
        const elemCount = b.elementDistances.length;
        for (let i = 0; i < elemCount; i++) {
          b.elementDistances[i] += flowSpeedRef.current;
        }

        // Check if all elements have completed their current phase
        const pathLen = b.path.totalLength;
        const allArrived = b.elementDistances.every(d => d >= pathLen);

        if (allArrived) {
          if (b.phase === 'outbound') {
            // All red elements arrived at LLM — start blue elements returning on same path
            b.phase = 'returning';
            b.elementDistances = MORSE_PATTERN.map(p => p.offset);
            aliveBursts.push(b);
            continue;
          } else {
            // All blue elements arrived back at user — burst complete
            continue;
          }
        }

        const isOutbound = b.phase === 'outbound';

        // Draw each element in the Morse pattern
        for (let i = 0; i < elemCount; i++) {
          const dist = b.elementDistances[i];
          // Only draw if element has started and hasn't arrived yet
          if (dist < 0 || dist >= pathLen) continue;

          // Outbound: follow path forward. Returning: follow path in reverse.
          const lookupDist = isOutbound ? dist : pathLen - dist;
          const pos = getSplinePoint(b.path, lookupDist);

          // Guard against NaN — skip this element if coords are invalid
          if (!isFinite(pos.x) || !isFinite(pos.y)) continue;

          const elemType = MORSE_PATTERN[i].type;

          // Determine color
          // Outbound: red before checkpoint, green after (if passed rules), stays red if flagged
          // Returning: always blue
          let color: { r: number; g: number; b: number };
          if (!isOutbound) {
            color = COLORS.response;
          } else if (b.isFlagged) {
            color = COLORS.flagged;
          } else {
            // Past the checkpoint? Turn green
            const pastCheckpoint = pos.x > checkpointX;
            color = pastCheckpoint ? COLORS.requestPassed : COLORS.request;
          }

          const colorStr = `rgba(${color.r}, ${color.g}, ${color.b}, ${b.opacity})`;
          const glowStr = `rgba(${color.r}, ${color.g}, ${color.b}, ${b.opacity * 0.4})`;
          const glowEnd = `rgba(${color.r}, ${color.g}, ${color.b}, 0)`;

          // Glow effect
          const glowRadius = b.size * 4;
          const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, glowRadius);
          glow.addColorStop(0, glowStr);
          glow.addColorStop(1, glowEnd);
          ctx.fillStyle = glow;
          ctx.fillRect(pos.x - glowRadius, pos.y - glowRadius, glowRadius * 2, glowRadius * 2);

          if (elemType === 'dash') {
            // Dash — line with round caps trailing behind the lead point
            const dashLen = MORSE_UNIT * 3;
            const trailRawDist = Math.max(0, dist - dashLen);
            const trailLookup = isOutbound ? trailRawDist : pathLen - trailRawDist;
            const trailPos = getSplinePoint(b.path, trailLookup);
            if (isFinite(trailPos.x) && isFinite(trailPos.y)) {
              ctx.save();
              ctx.beginPath();
              ctx.moveTo(trailPos.x, trailPos.y);
              ctx.lineTo(pos.x, pos.y);
              ctx.strokeStyle = colorStr;
              ctx.lineWidth = b.size * 2;
              ctx.lineCap = 'round';
              ctx.stroke();
              ctx.restore();
            }
          } else {
            // Circle dot
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, b.size, 0, Math.PI * 2);
            ctx.fillStyle = colorStr;
            ctx.fill();
          }
        }

        aliveBursts.push(b);
      }
      burstsRef.current = aliveBursts;
    } catch (e) {
      // If burst drawing fails, clear all bursts to recover
      console.error('Burst render error:', e);
      burstsRef.current = [];
    }

    // Reset canvas state before drawing nodes
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';
    ctx.setLineDash([]);

    // Draw user nodes — active users bright, historical users dimmed
    for (const node of userNodesRef.current) {
      const isActive = node.isActive !== false;
      const glowAlpha = isActive ? 0.3 : 0.1;
      const labelColor = isActive ? COLORS.text : COLORS.textDim;
      const nodeColor = isActive ? COLORS.userNode : COLORS.userNodeDim;

      // Outer glow
      const nodeGlow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius * 3);
      nodeGlow.addColorStop(0, `rgba(99, 102, 241, ${glowAlpha})`);
      nodeGlow.addColorStop(1, 'rgba(99, 102, 241, 0)');
      ctx.fillStyle = nodeGlow;
      ctx.fillRect(node.x - node.radius * 3, node.y - node.radius * 3, node.radius * 6, node.radius * 6);

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = nodeColor;
      ctx.globalAlpha = isActive ? 1 : 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Label: Name, Org, UUID + timestamp (3 lines, centered on node)
      ctx.textAlign = 'right';
      const labelX = node.x - node.radius - 8;
      // Line 1: User name
      ctx.fillStyle = labelColor;
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillText(truncateLabel(node.label, 18), labelX, node.y - 6);
      // Line 2: Organisation name
      if (node.orgName) {
        ctx.fillStyle = COLORS.textDim;
        ctx.font = '9px Inter, system-ui, sans-serif';
        ctx.fillText(truncateLabel(node.orgName, 18), labelX, node.y + 5);
      }
      // Line 3: Short ID + relative date
      ctx.fillStyle = COLORS.textDim;
      ctx.font = '8px Inter, system-ui, sans-serif';
      ctx.fillText(`${node.shortId}  ${formatRelativeDate(node.lastRequestAt)}`, labelX, node.y + (node.orgName ? 15 : 9));
    }

    // Draw endpoint nodes
    for (const node of endpointNodesRef.current) {
      // Outer glow
      const epGlow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius * 3);
      epGlow.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
      epGlow.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = epGlow;
      ctx.fillRect(node.x - node.radius * 3, node.y - node.radius * 3, node.radius * 6, node.radius * 6);

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.endpointNode;
      ctx.fill();

      // Label
      ctx.fillStyle = COLORS.text;
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(truncateLabel(node.label, 20), node.x + node.radius + 8, node.y + 3);
    }

    // Draw flagged checkpoint indicator
    const flaggedCount = burstsRef.current.filter(b => b.isFlagged).length;
    if (flaggedCount > 0) {
      ctx.fillStyle = `rgba(251, 146, 60, ${0.4 + Math.sin(Date.now() / 300) * 0.2})`;
      ctx.font = 'bold 12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${flaggedCount} FLAGGED`, checkpointX, height - bottomPad + 16);
    }

    animFrameRef.current = requestAnimationFrame(render);
  }, [width, height, checkpointX, leftZone, rightZone, topPad, bottomPad, cpTop, cpBottom, cpHeight]);

  // Compute nodes when data changes
  useEffect(() => {
    computeNodes();
  }, [computeNodes]);

  // Start/stop animation loop
  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [render]);

  // Handle click events
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check user nodes
    for (const node of userNodesRef.current) {
      const dist = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
      if (dist < node.radius + 10) {
        const user = activeUsers.find(u => u.user_id === node.id);
        if (user && onUserClick) onUserClick(user);
        return;
      }
    }

    // Check endpoint nodes
    for (const node of endpointNodesRef.current) {
      const dist = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
      if (dist < node.radius + 10) {
        const endpoint = llmEndpoints.find(e => e.id === node.id);
        if (endpoint && onEndpointClick) onEndpointClick(endpoint);
        return;
      }
    }
  }, [activeUsers, llmEndpoints, onUserClick, onEndpointClick]);

  // Track mouse for hover effects
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { mouseRef.current = null; }}
      style={{ cursor: 'crosshair', width: '100%', height: '100%' }}
    />
  );
}
