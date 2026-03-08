// Tier colours
export const TIER_COLORS = {
  hot: { primary: '#f97316', glow: '#f97316', gradient: ['#fbbf24', '#f97316'] },
  warm: { primary: '#f59e0b', glow: '#f59e0b', gradient: ['#fcd34d', '#f59e0b'] },
  cool: { primary: '#6366f1', glow: '#6366f1', gradient: ['#818cf8', '#6366f1'] },
  cold: { primary: '#64748b', glow: '#64748b', gradient: ['#94a3b8', '#64748b'] },
} as const;

// Health colours for deal arcs
export const HEALTH_COLORS = {
  strong: '#22c55e',
  healthy: '#6366f1',
  'at-risk': '#f59e0b',
  stalled: '#ef4444',
} as const;

// Orbit ring radii (as fraction of container)
export const ORBIT_RADII = [0.18, 0.36, 0.56, 0.78];

// Zoom constraints
export const ZOOM_EXTENT: [number, number] = [0.3, 4];

// Centre node
export const CENTRE_NODE_RADIUS = 24;

// Node size range
export const NODE_SIZE_MIN = 14;
export const NODE_SIZE_MAX = 28; // 14 + 14 * 1
