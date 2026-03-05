/**
 * ParticleFlowCanvas — Canvas-based particle flow visualization
 *
 * Renders animated particles flowing between user nodes (left),
 * a checkpoint zone (middle), and LLM endpoint nodes (right).
 * Soft red = requests (L→R), soft blue = responses (R→L).
 * Designed for 100+ concurrent user nodes using HTML5 Canvas.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { ActiveUser, RecentEvent, LLMEndpoint } from '@/lib/hooks/useGodsEyeData';

// ─── Types ──────────────────────────────────────────────────────────────

interface ParticleFlowCanvasProps {
  activeUsers: ActiveUser[];
  recentEvents: RecentEvent[];
  llmEndpoints: LLMEndpoint[];
  width: number;
  height: number;
  onUserClick?: (user: ActiveUser) => void;
  onEndpointClick?: (endpoint: LLMEndpoint) => void;
}

interface Particle {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  startX: number;
  startY: number;
  progress: number;
  speed: number;
  type: 'request' | 'response';
  isFlagged: boolean;
  opacity: number;
  size: number;
  curveOffset: number;
}

interface NodePosition {
  x: number;
  y: number;
  label: string;
  id: string;
  radius: number;
}

// ─── Constants ──────────────────────────────────────────────────────────

const COLORS = {
  request: { r: 239, g: 68, b: 68 },      // Soft red
  response: { r: 96, g: 165, b: 250 },     // Soft blue
  flagged: { r: 251, g: 146, b: 60 },      // Orange warning
  checkpoint: { r: 74, g: 222, b: 128 },   // Green gate
  checkpointFlagged: { r: 251, g: 146, b: 60 },
  userNode: '#6366f1',
  endpointNode: '#10b981',
  text: '#e2e8f0',
  textDim: '#94a3b8',
  gridLine: 'rgba(148, 163, 184, 0.05)',
  bg: '#0f172a',
};

const PARTICLE_SPEED_MIN = 0.003;
const PARTICLE_SPEED_MAX = 0.008;
const MAX_PARTICLES = 500;
const PARTICLE_SPAWN_RATE = 0.15; // per frame per recent event

// ─── Helpers ────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function getQuadraticPoint(
  x0: number, y0: number,
  cx: number, cy: number,
  x1: number, y1: number,
  t: number
): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x: mt * mt * x0 + 2 * mt * t * cx + t * t * x1,
    y: mt * mt * y0 + 2 * mt * t * cy + t * t * y1,
  };
}

function truncateLabel(text: string, maxLen: number): string {
  if (!text) return '?';
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

// ─── Component ──────────────────────────────────────────────────────────

export function ParticleFlowCanvas({
  activeUsers,
  recentEvents,
  llmEndpoints,
  width,
  height,
  onUserClick,
  onEndpointClick,
}: ParticleFlowCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);
  const userNodesRef = useRef<NodePosition[]>([]);
  const endpointNodesRef = useRef<NodePosition[]>([]);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);

  // Layout zones
  const leftZone = width * 0.15;
  const checkpointX = width * 0.5;
  const rightZone = width * 0.85;
  const topPad = 60;
  const bottomPad = 40;

  // Compute node positions
  const computeNodes = useCallback(() => {
    const usableHeight = height - topPad - bottomPad;

    // User nodes on the left
    const users = activeUsers.slice(0, 50); // Cap visual nodes at 50
    const userSpacing = users.length > 1 ? usableHeight / (users.length - 1) : 0;
    userNodesRef.current = users.map((u, i) => ({
      x: leftZone,
      y: topPad + (users.length === 1 ? usableHeight / 2 : i * userSpacing),
      label: u.user_name || u.user_email || u.user_id.slice(0, 8),
      id: u.user_id,
      radius: Math.min(6, Math.max(3, Math.log2(u.request_count + 1) * 2)),
    }));

    // Endpoint nodes on the right — group by provider, show top models
    const topEndpoints = llmEndpoints
      .filter(e => e.active_request_count > 0)
      .sort((a, b) => b.active_request_count - a.active_request_count)
      .slice(0, 15);

    // If no active endpoints, show all available (up to 8)
    const endpoints = topEndpoints.length > 0 ? topEndpoints : llmEndpoints.slice(0, 8);
    const epSpacing = endpoints.length > 1 ? usableHeight / (endpoints.length - 1) : 0;
    endpointNodesRef.current = endpoints.map((e, i) => ({
      x: rightZone,
      y: topPad + (endpoints.length === 1 ? usableHeight / 2 : i * epSpacing),
      label: e.display_name,
      id: e.id,
      radius: Math.min(8, Math.max(4, Math.log2(e.active_request_count + 1) * 2.5)),
    }));
  }, [activeUsers, llmEndpoints, width, height, leftZone, rightZone, topPad, bottomPad]);

  // Spawn particles from recent events
  const spawnParticles = useCallback(() => {
    if (particlesRef.current.length >= MAX_PARTICLES) return;
    if (userNodesRef.current.length === 0 || endpointNodesRef.current.length === 0) return;

    for (const event of recentEvents.slice(0, 20)) {
      if (Math.random() > PARTICLE_SPAWN_RATE) continue;
      if (particlesRef.current.length >= MAX_PARTICLES) break;

      // Find matching user node
      const userNode = userNodesRef.current.find(n => n.id === event.user_id)
        || userNodesRef.current[Math.floor(Math.random() * userNodesRef.current.length)];

      // Find matching endpoint node
      const endpointNode = endpointNodesRef.current.find(n =>
        n.label.toLowerCase().includes(event.model?.toLowerCase()?.split('/').pop() || '')
      ) || endpointNodesRef.current[Math.floor(Math.random() * endpointNodesRef.current.length)];

      const isRequest = Math.random() > 0.4; // Slightly more requests visible
      const curveOffset = (Math.random() - 0.5) * 80;

      particlesRef.current.push({
        x: isRequest ? userNode.x : endpointNode.x,
        y: isRequest ? userNode.y : endpointNode.y,
        startX: isRequest ? userNode.x : endpointNode.x,
        startY: isRequest ? userNode.y : endpointNode.y,
        targetX: isRequest ? endpointNode.x : userNode.x,
        targetY: isRequest ? endpointNode.y : userNode.y,
        progress: 0,
        speed: PARTICLE_SPEED_MIN + Math.random() * (PARTICLE_SPEED_MAX - PARTICLE_SPEED_MIN),
        type: isRequest ? 'request' : 'response',
        isFlagged: event.is_flagged || false,
        opacity: 0.6 + Math.random() * 0.4,
        size: 1.5 + Math.random() * 2,
        curveOffset,
      });
    }
  }, [recentEvents]);

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

    // Draw checkpoint zone
    const checkpointWidth = 40;
    const gradient = ctx.createLinearGradient(
      checkpointX - checkpointWidth, 0,
      checkpointX + checkpointWidth, 0
    );
    gradient.addColorStop(0, 'rgba(74, 222, 128, 0)');
    gradient.addColorStop(0.5, 'rgba(74, 222, 128, 0.08)');
    gradient.addColorStop(1, 'rgba(74, 222, 128, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(checkpointX - checkpointWidth, 0, checkpointWidth * 2, height);

    // Checkpoint line
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(checkpointX, topPad - 20);
    ctx.lineTo(checkpointX, height - bottomPad + 20);
    ctx.stroke();
    ctx.setLineDash([]);

    // Checkpoint label
    ctx.fillStyle = 'rgba(74, 222, 128, 0.6)';
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CHECKPOINT', checkpointX, topPad - 28);

    // Draw zone labels
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ACTIVE USERS', leftZone, topPad - 28);
    ctx.fillText('LLM ENDPOINTS', rightZone, topPad - 28);

    // Draw connection paths (faint)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.04)';
    ctx.lineWidth = 1;
    for (const user of userNodesRef.current) {
      for (const endpoint of endpointNodesRef.current) {
        ctx.beginPath();
        ctx.moveTo(user.x, user.y);
        ctx.quadraticCurveTo(checkpointX, (user.y + endpoint.y) / 2, endpoint.x, endpoint.y);
        ctx.stroke();
      }
    }

    // Spawn new particles
    spawnParticles();

    // Update and draw particles
    const aliveParticles: Particle[] = [];
    for (const p of particlesRef.current) {
      p.progress += p.speed;

      if (p.progress >= 1) continue; // Remove completed particles

      const t = easeInOutCubic(p.progress);
      const cx = checkpointX;
      const cy = (p.startY + p.targetY) / 2 + p.curveOffset;
      const pos = getQuadraticPoint(p.startX, p.startY, cx, cy, p.targetX, p.targetY, t);
      p.x = pos.x;
      p.y = pos.y;

      // Determine color
      let color: { r: number; g: number; b: number };
      if (p.isFlagged && Math.abs(p.x - checkpointX) < 30) {
        color = COLORS.flagged;
      } else {
        color = p.type === 'request' ? COLORS.request : COLORS.response;
      }

      // Glow effect
      const glowRadius = p.size * 4;
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowRadius);
      glow.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${p.opacity * 0.4})`);
      glow.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(p.x - glowRadius, p.y - glowRadius, glowRadius * 2, glowRadius * 2);

      // Particle dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${p.opacity})`;
      ctx.fill();

      aliveParticles.push(p);
    }
    particlesRef.current = aliveParticles;

    // Draw user nodes
    for (const node of userNodesRef.current) {
      // Outer glow
      const nodeGlow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius * 3);
      nodeGlow.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
      nodeGlow.addColorStop(1, 'rgba(99, 102, 241, 0)');
      ctx.fillStyle = nodeGlow;
      ctx.fillRect(node.x - node.radius * 3, node.y - node.radius * 3, node.radius * 6, node.radius * 6);

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.userNode;
      ctx.fill();

      // Label
      ctx.fillStyle = COLORS.text;
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(truncateLabel(node.label, 16), node.x - node.radius - 8, node.y + 3);
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
    const flaggedCount = particlesRef.current.filter(p => p.isFlagged && Math.abs(p.x - checkpointX) < 30).length;
    if (flaggedCount > 0) {
      ctx.fillStyle = `rgba(251, 146, 60, ${0.4 + Math.sin(Date.now() / 300) * 0.2})`;
      ctx.font = 'bold 12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${flaggedCount} FLAGGED`, checkpointX, height - bottomPad + 16);
    }

    animFrameRef.current = requestAnimationFrame(render);
  }, [width, height, spawnParticles, checkpointX, leftZone, rightZone, topPad, bottomPad]);

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
      style={{ cursor: 'crosshair' }}
    />
  );
}
