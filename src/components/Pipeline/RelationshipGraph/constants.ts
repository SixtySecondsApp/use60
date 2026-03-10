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

// Orbit ring radii — midpoint of each tier band (hot, warm, cool, cold)
export const ORBIT_RADII = [0.175, 0.365, 0.565, 0.78];

// Zoom constraints
export const ZOOM_EXTENT: [number, number] = [0.3, 4];

// Centre node
export const CENTRE_NODE_RADIUS = 24;

// Node size range
export const NODE_SIZE_MIN = 14;
export const NODE_SIZE_MAX = 28; // 14 + 14 * 1

// Cold clustering
export const COLD_CLUSTER_SIZE = 10;   // contacts per cluster node
export const COLD_MAX_DISPLAY = 100;   // legacy — no longer caps (kept for import compat)
export const CLUSTER_NODE_RADIUS = 22; // visual size of cluster nodes

// Multi-ring cluster layout
export const CLUSTER_INNER_ORBIT = 0.78;  // first ring (same as cold tier orbit)
export const CLUSTER_OUTER_ORBIT = 0.98;  // outermost ring
export const CLUSTER_RING_CAPACITY = 12;  // max clusters per ring before wrapping to next
export const CLUSTER_OPACITY_DROP = 0.20; // opacity reduction per ring outward
