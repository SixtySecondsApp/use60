/**
 * ParticleFlowCanvas — Sankey-style rolling flow visualization
 *
 * Shows the last 11 API calls as flowing ribbons from user labels (left)
 * to LLM endpoint lozenges (right). Band width is proportional to token
 * count. New calls enter at the top and push older calls down.
 *
 * Animation lifecycle per ribbon:
 *   1. Grow (left → right bezier ribbon draws itself)
 *   2. Glow pulse fades once fully drawn
 *   3. Return pulse sweeps right → left (simulating response)
 *   4. Settled — static unless anomalous (slow constant pulse)
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { ActiveUser, RecentEvent, LLMEndpoint } from '@/lib/hooks/useGoldenEyeData';

// ─── Props (unchanged for parent compatibility) ─────────────────────────

interface ParticleFlowCanvasProps {
  activeUsers: ActiveUser[];
  recentEvents: RecentEvent[];
  llmEndpoints: LLMEndpoint[];
  width: number;
  height: number;
  /** Controls animation speed. Default 10 */
  flowSpeed?: number;
  /** Custom colour palette (10 hex strings). Falls back to built-in palette. */
  colors?: string[];
  onUserClick?: (user: ActiveUser) => void;
  onEndpointClick?: (endpoint: LLMEndpoint) => void;
}

// ─── Internal types ─────────────────────────────────────────────────────

interface SankeyRibbon {
  id: string;
  event: RecentEvent;
  userId: string;
  userName: string;
  userOrg: string;
  endpointId: string;
  modelName: string;
  totalTokens: number;
  colorIdx: number;
  isFlagged: boolean;
  flagReason: string;
  isTest: boolean;

  // animation state
  growProgress: number;       // 0→1
  glowIntensity: number;      // 1→0 after grow
  returnProgress: number;     // <0 = waiting delay, 0→1 = sweep, >=1 = done
  returnComplete: boolean;

  // layout (animated)
  slotIndex: number;
  targetY: number;
  currentY: number;
  displayWidth: number;       // computed per frame from tokens

  // endpoint stacking
  endpointBaseY: number;      // endpoint centre Y
  endpointStackY: number;     // actual Y after stacking
}

interface EndpointPos {
  id: string;
  modelId: string;
  displayName: string;
  x: number;
  y: number;
  targetY: number;
  volume: number;
  visible: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────

const MAX_SLOTS = 11;
const BG = '#0f172a';

/** Default palette — matched to ElastiFlow Sankey reference */
export const DEFAULT_SANKEY_COLORS = [
  '#E8864A', // warm salmon orange
  '#D45E2C', // deep rust orange
  '#E04E42', // rich coral red
  '#1EBCA8', // bright teal
  '#C93350', // crimson
  '#D84888', // hot pink
  '#4A90D8', // vivid blue
  '#30A8CC', // cyan
  '#E09828', // golden amber
  '#44B88A', // jade green
];

/** Runtime palette — overridden by `colors` prop */
let PALETTE = DEFAULT_SANKEY_COLORS;

/** Salmon colour used for test triggers — matches ActivityLogTerminal */
const TEST_SALMON = '#fa8072';

const MIN_W = 4;
const MAX_W_RATIO = 0.55;   // of slot spacing

// Frames at 60 fps (scaled by flowSpeed)
const GROW_FRAMES = 45;
const GLOW_FRAMES = 25;
const RETURN_DELAY_FRAMES = 15;
const RETURN_FRAMES = 35;
const SLIDE_LERP = 0.1;

// ─── Tiny helpers ───────────────────────────────────────────────────────

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function hexRgb(hex: string) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  return m
    ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
    : { r: 200, g: 200, b: 200 };
}

function relTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min${m > 1 ? 's' : ''} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function trunc(s: string, max: number) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/** Centre-out ordering: highest volume → middle, 2nd → below, 3rd → above … */
function centreOut<T>(items: T[], vol: (t: T) => number): T[] {
  const sorted = [...items].sort((a, b) => vol(b) - vol(a));
  const out: (T | null)[] = new Array(sorted.length).fill(null);
  const mid = Math.floor(sorted.length / 2);
  for (let i = 0; i < sorted.length; i++) {
    const slot =
      i === 0 ? mid : i % 2 === 1 ? mid + Math.ceil(i / 2) : mid - i / 2;
    out[Math.max(0, Math.min(sorted.length - 1, slot))] = sorted[i];
  }
  return out.filter((x): x is T => x !== null);
}

// ─── Drawing helpers ────────────────────────────────────────────────────

function ribbonPath(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, sw: number,
  ex: number, ey: number, ew: number,
) {
  const hsw = sw / 2, hew = ew / 2;
  const cp = (ex - sx) * 0.4;
  ctx.beginPath();
  ctx.moveTo(sx, sy - hsw);
  ctx.bezierCurveTo(sx + cp, sy - hsw, ex - cp, ey - hew, ex, ey - hew);
  ctx.lineTo(ex, ey + hew);
  ctx.bezierCurveTo(ex - cp, ey + hew, sx + cp, sy + hsw, sx, sy + hsw);
  ctx.closePath();
}

function drawRibbon(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, sw: number,
  ex: number, ey: number, ew: number,
  color: string, alpha: number,
  clipProg?: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (clipProg !== undefined && clipProg < 1) {
    const cx = sx + (ex - sx) * clipProg + 2;
    ctx.beginPath();
    ctx.rect(0, 0, cx, ctx.canvas.height);
    ctx.clip();
  }
  ribbonPath(ctx, sx, sy, sw, ex, ey, ew);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawGlow(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, sw: number,
  ex: number, ey: number, ew: number,
  color: string, intensity: number,
  clipProg?: number,
) {
  const expand = 4 + intensity * 8;
  drawRibbon(ctx, sx, sy, sw + expand, ex, ey, ew + expand, color, intensity * 0.35, clipProg);
}

function drawReturnPulse(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, sw: number,
  ex: number, ey: number, ew: number,
  color: string, progress: number,
) {
  const pulseX = ex - (ex - sx) * progress;
  const bandW = (ex - sx) * 0.15;

  ctx.save();
  ctx.beginPath();
  ctx.rect(pulseX - bandW, 0, bandW * 2, ctx.canvas.height);
  ctx.clip();

  const expand = 6;
  ribbonPath(ctx, sx, sy, sw + expand, ex, ey, ew + expand);

  const { r, g, b } = hexRgb(color);
  const grad = ctx.createLinearGradient(pulseX - bandW, 0, pulseX + bandW, 0);
  grad.addColorStop(0,   `rgba(${r},${g},${b},0)`);
  grad.addColorStop(0.35, `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(0.5,  `rgba(${r},${g},${b},0.8)`);
  grad.addColorStop(0.65, `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
}

/** Draw a thin salmon centre-line through a ribbon to mark test triggers */
function drawTestCentreLine(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  ex: number, ey: number,
  clipProg?: number,
) {
  const cp = (ex - sx) * 0.4;
  ctx.save();
  if (clipProg !== undefined && clipProg < 1) {
    const cx = sx + (ex - sx) * clipProg + 2;
    ctx.beginPath();
    ctx.rect(0, 0, cx, ctx.canvas.height);
    ctx.clip();
  }
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.bezierCurveTo(sx + cp, sy, ex - cp, ey, ex, ey);
  ctx.strokeStyle = TEST_SALMON;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.8;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** Rounded-rect helper (avoids reliance on ctx.roundRect support) */
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Component ──────────────────────────────────────────────────────────

export function ParticleFlowCanvas({
  activeUsers,
  recentEvents,
  llmEndpoints,
  width,
  height,
  flowSpeed = 10,
  colors,
  onUserClick,
  onEndpointClick,
}: ParticleFlowCanvasProps) {
  // Apply custom palette when provided
  PALETTE = colors && colors.length >= 10 ? colors : DEFAULT_SANKEY_COLORS;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const ribbonsRef = useRef<SankeyRibbon[]>([]);
  const endpointsRef = useRef<EndpointPos[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const frameRef = useRef(0);
  const speedRef = useRef(flowSpeed);
  speedRef.current = flowSpeed;

  // HTML overlays
  const [hover, setHover] = useState<{
    x: number; y: number;
    name: string; org: string; time: string;
    tokens: number; model: string;
    flagged: boolean; reason: string;
  } | null>(null);
  const [popup, setPopup] = useState<{
    x: number; y: number; ribbon: SankeyRibbon;
  } | null>(null);

  // ── Layout ──

  const LEFT_X = width * 0.091;
  const RIGHT_X = width * 0.86;
  const TOP = 20;
  const BOT = 20;
  const usable = height - TOP - BOT;
  const slotGap = MAX_SLOTS > 1 ? usable / (MAX_SLOTS - 1) : usable;
  const maxW = Math.min(slotGap * MAX_W_RATIO, 44);

  // ── Endpoint positions (recompute when list changes) ──

  useEffect(() => {
    const active = llmEndpoints
      .filter(e => e.active_request_count > 0 || e.is_available)
      .slice(0, 12);
    const ordered = centreOut(active, e => e.active_request_count);
    const gap = ordered.length > 1 ? usable / (ordered.length - 1) : 0;
    // Preserve existing positions for smooth transitions
    const prev = new Map(endpointsRef.current.map(ep => [ep.id, ep]));
    endpointsRef.current = ordered.map((e, i) => {
      const initY = TOP + (ordered.length === 1 ? usable / 2 : i * gap);
      const existing = prev.get(e.id);
      // New endpoints start at the center of the pane so they animate outward
      const centerY = TOP + usable / 2;
      return {
        id: e.id,
        modelId: e.model_id,
        displayName: e.display_name,
        x: RIGHT_X,
        y: existing ? existing.y : centerY,
        targetY: initY,
        volume: e.active_request_count,
        visible: true,
      };
    });
  }, [llmEndpoints, usable, TOP, RIGHT_X]);

  // ── Resolve model string → endpoint ID ──

  const resolve = useCallback(
    (model: string): string | undefined => {
      for (const ep of endpointsRef.current) {
        if (ep.modelId === model || ep.modelId.startsWith(model)) return ep.id;
      }
      for (const ep of llmEndpoints) {
        if (ep.model_id === model || ep.model_id.startsWith(model)) return ep.id;
      }
      return undefined;
    },
    [llmEndpoints],
  );

  // ── Ingest new events into rolling ribbon log ──

  useEffect(() => {
    if (endpointsRef.current.length === 0) return;

    // First load — seed seen set + create initial (pre-settled) ribbons
    if (seenRef.current.size === 0 && recentEvents.length > 0) {
      for (const e of recentEvents) seenRef.current.add(e.id);

      // Build valid ribbons first, then distribute evenly across all MAX_SLOTS positions
      const valid: { ev: typeof recentEvents[0]; epId: string; ep: EndpointPos; user: typeof activeUsers[0] | undefined }[] = [];
      for (const ev of recentEvents.slice(0, MAX_SLOTS)) {
        const epId = resolve(ev.model);
        if (!epId) continue;
        const ep = endpointsRef.current.find(e => e.id === epId);
        if (!ep) continue;
        const user = activeUsers.find(u => u.user_id === ev.user_id);
        valid.push({ ev, epId, ep, user });
        if (valid.length >= MAX_SLOTS) break;
      }
      const initial: SankeyRibbon[] = [];
      // Distribute evenly across full pane height regardless of count
      const initGap = valid.length > 1 ? usable / (valid.length - 1) : 0;
      for (let i = 0; i < valid.length; i++) {
        const { ev, epId, ep, user } = valid[i];
        const tY = valid.length === 1 ? TOP + usable / 2 : TOP + i * initGap;
        initial.push({
          id: ev.id, event: ev,
          userId: ev.user_id,
          userName: user?.user_name || ev.user_name || ev.user_email || 'Unknown',
          userOrg: user?.org_name || '',
          endpointId: epId,
          modelName: ep.displayName,
          totalTokens: ev.input_tokens + ev.output_tokens,
          colorIdx: hash(ev.user_id) % PALETTE.length,
          isFlagged: ev.is_flagged || false,
          flagReason: ev.flag_reason || '',
          isTest: ev.feature === 'test_burst',
          growProgress: 1, glowIntensity: 0,
          returnProgress: 1, returnComplete: true,
          slotIndex: i, targetY: tY, currentY: tY,
          displayWidth: 0,
          endpointBaseY: ep.y, endpointStackY: ep.y,
        });
      }
      ribbonsRef.current = initial;
      return;
    }

    // Detect genuinely new events
    const fresh = recentEvents.filter(e => !seenRef.current.has(e.id));
    if (fresh.length === 0) return;

    for (const ev of fresh) {
      seenRef.current.add(ev.id);
      const epId = resolve(ev.model);
      if (!epId) continue;
      const ep = endpointsRef.current.find(e => e.id === epId);
      if (!ep) continue;
      const user = activeUsers.find(u => u.user_id === ev.user_id);

      // Shift existing ribbons down one slot
      for (const r of ribbonsRef.current) {
        r.slotIndex++;
        r.targetY = TOP + r.slotIndex * slotGap;
      }

      ribbonsRef.current.unshift({
        id: ev.id, event: ev,
        userId: ev.user_id,
        userName: user?.user_name || ev.user_name || ev.user_email || 'Unknown',
        userOrg: user?.org_name || '',
        endpointId: epId,
        modelName: ep.displayName,
        totalTokens: ev.input_tokens + ev.output_tokens,
        colorIdx: hash(ev.user_id) % PALETTE.length,
        isFlagged: ev.is_flagged || false,
        flagReason: ev.flag_reason || '',
        isTest: ev.feature === 'test_burst',
        growProgress: 0, glowIntensity: 1,
        returnProgress: -1, returnComplete: false,
        slotIndex: 0, targetY: TOP, currentY: TOP,
        displayWidth: 0,
        endpointBaseY: ep.y, endpointStackY: ep.y,
      });

      // Trim overflow
      if (ribbonsRef.current.length > MAX_SLOTS) {
        ribbonsRef.current.length = MAX_SLOTS;
      }
    }

    // Bound seen-set growth
    if (seenRef.current.size > 500) {
      const a = Array.from(seenRef.current);
      seenRef.current = new Set(a.slice(a.length - 300));
    }
  }, [recentEvents, activeUsers, resolve, slotGap, TOP]);

  // ── Reposition ribbons when canvas resizes (slotGap / TOP change) ──

  useEffect(() => {
    const ribbons = ribbonsRef.current;
    if (ribbons.length === 0) return;
    const gap = ribbons.length > 1 ? usable / (ribbons.length - 1) : 0;
    for (let i = 0; i < ribbons.length; i++) {
      ribbons[i].slotIndex = i;
      ribbons[i].targetY = ribbons.length === 1 ? TOP + usable / 2 : TOP + i * gap;
    }
  }, [slotGap, TOP, usable]);

  // ── Render loop ──

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    frameRef.current++;
    const spd = speedRef.current / 10;

    // Clear
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, width, height);

    const ribbons = ribbonsRef.current;
    const endpoints = endpointsRef.current;

    // ── Draw endpoints (lozenges) — only visible ones ──
    ctx.textBaseline = 'middle';
    for (const ep of endpoints.filter(e => e.visible)) {
      const x = ep.x + 14;
      ctx.font = '10px Inter, system-ui, sans-serif';
      const tw = ctx.measureText(ep.displayName).width;
      const lw = tw + 18;
      const lh = 22;
      const r = lh / 2;

      roundedRect(ctx, x, ep.y - lh / 2, lw, lh, r);
      ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#cbd5e1';
      ctx.textAlign = 'left';
      ctx.fillText(ep.displayName, x + 9, ep.y + 1);
    }

    if (ribbons.length === 0) {
      ctx.fillStyle = 'rgba(148,163,184,0.25)';
      ctx.font = '13px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Waiting for activity…', width / 2, height / 2);
      rafRef.current = requestAnimationFrame(render);
      return;
    }

    // ── Compute widths ──
    const maxTok = Math.max(...ribbons.map(r => r.totalTokens), 1);
    for (const r of ribbons) {
      r.displayWidth = MIN_W + (maxW - MIN_W) * (r.totalTokens / maxTok);
    }

    // ── CentreOut endpoint positioning — clustered around vertical center ──
    const byEp = new Map<string, SankeyRibbon[]>();
    for (const r of ribbons) {
      if (!byEp.has(r.endpointId)) byEp.set(r.endpointId, []);
      byEp.get(r.endpointId)!.push(r);
    }

    // Mark visibility & compute ribbon stack heights
    const stackHeight = new Map<string, number>();
    for (const ep of endpoints) {
      const group = byEp.get(ep.id);
      ep.visible = !!group && group.length > 0;
      stackHeight.set(ep.id, group ? group.reduce((s, r) => s + r.displayWidth, 0) : 0);
    }

    // Use the stable centreOut order from endpointsRef (set in useEffect), filtered to visible
    // This preserves order across frames and avoids jitter
    const orderedVisible = endpoints.filter(ep => ep.visible);

    // Layout: stack them sequentially, centered vertically, with 20px gap between stack edges
    const EP_GAP = 20;
    if (orderedVisible.length > 0) {
      const totalStackH = orderedVisible.reduce((s, ep) => s + (stackHeight.get(ep.id) || 0), 0);
      const totalGaps = Math.max(0, orderedVisible.length - 1) * EP_GAP;
      const totalNeeded = totalStackH + totalGaps;

      const centerY = TOP + usable / 2;
      const startY = centerY - totalNeeded / 2;

      let curY = startY;
      for (const ep of orderedVisible) {
        const sh = stackHeight.get(ep.id) || 0;
        ep.targetY = curY + sh / 2;
        curY += sh + EP_GAP;
      }

      // Clamp to bounds (account for stack extents)
      for (const ep of orderedVisible) {
        const half = (stackHeight.get(ep.id) || 0) / 2;
        ep.targetY = Math.max(TOP + half, Math.min(TOP + usable - half, ep.targetY));
      }

      // Re-separate if clamping caused overlaps
      for (let pass = 0; pass < 5; pass++) {
        for (let i = 1; i < orderedVisible.length; i++) {
          const prev = orderedVisible[i - 1];
          const curr = orderedVisible[i];
          const prevHalf = (stackHeight.get(prev.id) || 0) / 2;
          const currHalf = (stackHeight.get(curr.id) || 0) / 2;
          const minDist = prevHalf + currHalf + EP_GAP;
          const overlap = (prev.targetY + minDist) - curr.targetY;
          if (overlap > 0) {
            curr.targetY = prev.targetY + minDist;
          }
        }
        // Clamp again
        for (const ep of orderedVisible) {
          const half = (stackHeight.get(ep.id) || 0) / 2;
          ep.targetY = Math.max(TOP + half, Math.min(TOP + usable - half, ep.targetY));
        }
      }
    }

    // Smooth lerp endpoint Y toward target
    for (const ep of endpoints) {
      ep.y += (ep.targetY - ep.y) * SLIDE_LERP;
    }

    // ── Stack ribbons at endpoints ──
    byEp.forEach((group, epId) => {
      const ep = endpoints.find(e => e.id === epId);
      if (!ep) return;
      const totalW = group.reduce((s, r) => s + r.displayWidth, 0);
      let cur = ep.y - totalW / 2;
      for (const r of group) {
        r.endpointStackY = cur + r.displayWidth / 2;
        cur += r.displayWidth;
      }
    });

    // ── Update animation state ──
    for (const r of ribbons) {
      // Smooth slide
      r.currentY += (r.targetY - r.currentY) * SLIDE_LERP;

      // Grow
      if (r.growProgress < 1) {
        r.growProgress = Math.min(1, r.growProgress + spd / GROW_FRAMES);
      }

      // Glow fade
      if (r.growProgress >= 1 && r.glowIntensity > 0) {
        r.glowIntensity = Math.max(0, r.glowIntensity - spd / GLOW_FRAMES);
      }

      // Return pulse
      if (r.growProgress >= 1 && r.glowIntensity <= 0 && !r.returnComplete) {
        if (r.returnProgress < 0) {
          r.returnProgress += spd / RETURN_DELAY_FRAMES;
          if (r.returnProgress > 0) r.returnProgress = 0;
        } else {
          r.returnProgress = Math.min(1, r.returnProgress + spd / RETURN_FRAMES);
          if (r.returnProgress >= 1) r.returnComplete = true;
        }
      }
    }

    // ── Draw ribbons ──
    ctx.textBaseline = 'middle';
    for (const r of ribbons) {
      const col = PALETTE[r.colorIdx];
      const sx = LEFT_X;
      const sy = r.currentY;
      const ex = RIGHT_X;
      const ey = r.endpointStackY;
      const w = r.displayWidth;

      const easedGrow = 1 - Math.pow(1 - r.growProgress, 3); // ease-out cubic
      const clip = r.growProgress < 1 ? easedGrow : undefined;

      // Base alpha; anomalous ribbons pulse
      let alpha = 0.6;
      if (r.isFlagged && r.growProgress >= 1) {
        alpha = 0.45 + 0.2 * (0.5 + 0.5 * Math.sin(frameRef.current * 0.04));
      }

      drawRibbon(ctx, sx, sy, w, ex, ey, w, col, alpha, clip);

      // Grow glow
      if (r.glowIntensity > 0) {
        drawGlow(ctx, sx, sy, w, ex, ey, w, col, r.glowIntensity, clip);
      }

      // Return pulse
      if (r.returnProgress >= 0 && r.returnProgress < 1) {
        drawReturnPulse(ctx, sx, sy, w, ex, ey, w, col, r.returnProgress);
      }

      // Anomalous extra glow
      if (r.isFlagged && r.growProgress >= 1) {
        const pi = 0.15 + 0.1 * Math.sin(frameRef.current * 0.04);
        drawGlow(ctx, sx, sy, w, ex, ey, w, '#FF6B35', pi);
      }

      // Test trigger centre-line
      if (r.isTest) {
        drawTestCentreLine(ctx, sx, sy, ex, ey, clip);
      }
    }

    // ── Draw user labels (left side) ──
    ctx.textBaseline = 'middle';
    for (const r of ribbons) {
      const col = r.isTest ? TEST_SALMON : PALETTE[r.colorIdx];
      const y = r.currentY;
      const barX = LEFT_X - 8;

      // Colour bar
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.85;
      const bh = Math.max(Math.min(r.displayWidth, 16), 4);
      ctx.fillRect(barX, y - bh / 2, 3, bh);
      ctx.globalAlpha = 1;

      // Name
      const nameX = barX - 6;
      ctx.textAlign = 'right';
      ctx.fillStyle = r.isTest ? TEST_SALMON : '#e2e8f0';
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.fillText(trunc(r.userName, 16), nameX, r.userOrg ? y - 5 : y);

      // Org
      if (r.userOrg) {
        ctx.fillStyle = r.isTest ? TEST_SALMON : '#64748b';
        ctx.font = '9px Inter, system-ui, sans-serif';
        ctx.fillText(trunc(r.userOrg, 18), nameX, y + 8);
      }
    }

    rafRef.current = requestAnimationFrame(render);
  }, [width, height, LEFT_X, RIGHT_X, TOP, maxW, slotGap]);

  // Start / stop RAF
  useEffect(() => {
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [render]);

  // ── Mouse move — hover tooltips + cursor ──

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Check user label hit zones
      for (const r of ribbonsRef.current) {
        const labelRight = LEFT_X - 8;
        if (mx < labelRight + 6 && mx > labelRight - 130 && Math.abs(my - r.currentY) < 14) {
          setHover({
            x: mx, y: my,
            name: r.userName, org: r.userOrg,
            time: relTime(r.event.created_at),
            tokens: r.totalTokens, model: r.modelName,
            flagged: r.isFlagged, reason: r.flagReason,
          });
          return;
        }
      }
      setHover(null);
    },
    [LEFT_X],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Dismiss open popup
      if (popup) { setPopup(null); return; }

      // Check flagged ribbon hits
      for (const r of ribbonsRef.current) {
        if (!r.isFlagged) continue;
        ribbonPath(ctx, LEFT_X, r.currentY, r.displayWidth, RIGHT_X, r.endpointStackY, r.displayWidth);
        if (ctx.isPointInPath(mx, my)) {
          setPopup({ x: mx, y: my, ribbon: r });
          return;
        }
      }

      // Check user label clicks → onUserClick
      for (const r of ribbonsRef.current) {
        const labelRight = LEFT_X - 8;
        if (mx < labelRight + 6 && mx > labelRight - 130 && Math.abs(my - r.currentY) < 14) {
          const user = activeUsers.find(u => u.user_id === r.userId);
          if (user && onUserClick) onUserClick(user);
          return;
        }
      }

      // Check endpoint lozenge clicks → onEndpointClick
      for (const ep of endpointsRef.current) {
        const lx = ep.x + 14;
        if (mx >= lx && mx <= lx + 160 && Math.abs(my - ep.y) < 14) {
          const endpoint = llmEndpoints.find(e => e.id === ep.id);
          if (endpoint && onEndpointClick) onEndpointClick(endpoint);
          return;
        }
      }
    },
    [popup, LEFT_X, RIGHT_X, activeUsers, llmEndpoints, onUserClick, onEndpointClick],
  );

  // Cursor: pointer when over user labels or flagged ribbons
  const getCursor = useCallback(() => {
    if (hover) return 'pointer';
    return 'default';
  }, [hover]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHover(null); }}
        style={{ cursor: getCursor(), width: '100%', height: '100%' }}
      />

      {/* Hover tooltip */}
      {hover && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(hover.x + 14, width - 230),
            top: Math.max(hover.y - 90, 8),
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(100, 116, 139, 0.4)',
            borderRadius: 8,
            padding: '10px 14px',
            pointerEvents: 'none',
            zIndex: 10,
            minWidth: 190,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif' }}>
            {hover.name}
          </div>
          {hover.org && (
            <div style={{ color: '#94a3b8', fontSize: 10, marginTop: 2, fontFamily: 'Inter, system-ui, sans-serif' }}>
              {hover.org}
            </div>
          )}
          <div style={{ color: '#64748b', fontSize: 10, marginTop: 5, fontFamily: 'Inter, system-ui, sans-serif' }}>
            {hover.time} · {fmtTokens(hover.tokens)} tokens · {hover.model}
          </div>
          {hover.flagged && (
            <div style={{ color: '#fb923c', fontSize: 10, marginTop: 4, fontFamily: 'Inter, system-ui, sans-serif' }}>
              ⚠ {hover.reason || 'Anomalous request'}
            </div>
          )}
        </div>
      )}

      {/* Anomaly popup */}
      {popup && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(popup.x, width - 270),
            top: Math.max(popup.y - 110, 10),
            background: 'rgba(30, 20, 10, 0.95)',
            border: '1px solid rgba(251, 146, 60, 0.5)',
            borderRadius: 10,
            padding: '14px 16px',
            zIndex: 20,
            minWidth: 230,
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 24px rgba(251, 146, 60, 0.15)',
          }}
        >
          <div style={{ color: '#fb923c', fontSize: 12, fontWeight: 700, fontFamily: 'Inter, system-ui, sans-serif', marginBottom: 8 }}>
            Anomaly Detected
          </div>
          <div style={{ color: '#e2e8f0', fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 1.6 }}>
            <div><strong>User:</strong> {popup.ribbon.userName}</div>
            <div><strong>Model:</strong> {popup.ribbon.modelName}</div>
            <div><strong>Tokens:</strong> {fmtTokens(popup.ribbon.totalTokens)}</div>
            <div><strong>Time:</strong> {relTime(popup.ribbon.event.created_at)}</div>
            <div style={{ color: '#fb923c', marginTop: 6 }}>
              <strong>Reason:</strong> {popup.ribbon.flagReason || 'Flagged by anomaly detection rules'}
            </div>
          </div>
          <div
            onClick={() => setPopup(null)}
            style={{ color: '#64748b', fontSize: 9, marginTop: 10, cursor: 'pointer', textAlign: 'right', fontFamily: 'Inter, system-ui, sans-serif' }}
          >
            Click anywhere to dismiss
          </div>
        </div>
      )}
    </div>
  );
}
