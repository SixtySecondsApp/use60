/**
 * StakeholderOrgChart
 *
 * Visual bubble-style org chart of the buying committee.
 * Uses SVG + React for a lightweight interactive view — no additional deps.
 * Nodes are positioned by role priority rings.
 * Part of PRD-121: Stakeholder Mapping (STAKE-006)
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { DealStakeholderWithContact } from '@/lib/types/stakeholder';
import {
  ROLE_LABELS,
  ROLE_COLORS,
  ENGAGEMENT_COLORS,
  INFLUENCE_COLORS,
} from '@/lib/types/stakeholder';

interface StakeholderOrgChartProps {
  stakeholders: DealStakeholderWithContact[];
  onSelectStakeholder?: (stakeholder: DealStakeholderWithContact) => void;
  selectedId?: string | null;
  className?: string;
}

// Role priority for layout rings (0 = centre)
const ROLE_RING: Record<string, number> = {
  economic_buyer: 0,
  champion: 0,
  blocker: 1,
  technical_evaluator: 1,
  coach: 1,
  influencer: 2,
  legal: 2,
  procurement: 2,
  end_user: 2,
  unknown: 3,
};

const RING_RADIUS = [60, 130, 190, 250];
const SVG_SIZE = 560;
const CENTER = SVG_SIZE / 2;

interface NodePosition {
  x: number;
  y: number;
  stakeholder: DealStakeholderWithContact;
}

function computePositions(stakeholders: DealStakeholderWithContact[]): NodePosition[] {
  // Group by ring
  const rings: DealStakeholderWithContact[][] = [[], [], [], []];
  for (const s of stakeholders) {
    const ring = ROLE_RING[s.role] ?? 3;
    rings[ring].push(s);
  }

  const positions: NodePosition[] = [];

  rings.forEach((group, ringIdx) => {
    if (group.length === 0) return;
    const radius = RING_RADIUS[ringIdx];
    const angleStep = (2 * Math.PI) / Math.max(group.length, 1);
    const offset = ringIdx % 2 === 0 ? 0 : Math.PI / group.length; // stagger rings

    group.forEach((stakeholder, i) => {
      const angle = i * angleStep + offset - Math.PI / 2;
      positions.push({
        x: CENTER + radius * Math.cos(angle),
        y: CENTER + radius * Math.sin(angle),
        stakeholder,
      });
    });
  });

  return positions;
}

function getContactInitials(contact: DealStakeholderWithContact['contact']): string {
  const first = contact.first_name?.[0] || '';
  const last = contact.last_name?.[0] || '';
  return (first + last).toUpperCase() || '?';
}

function getContactName(contact: DealStakeholderWithContact['contact']): string {
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email || '?';
}

// Map engagement status to border colour
const ENGAGEMENT_BORDER: Record<string, string> = {
  active: '#10b981',    // emerald-500
  warming: '#f59e0b',   // amber-500
  cold: '#3b82f6',      // blue-500
  unknown: '#9ca3af',   // gray-400
};

// Map influence to node size
const INFLUENCE_SIZE: Record<string, number> = {
  high: 40,
  medium: 34,
  low: 28,
  unknown: 30,
};

export function StakeholderOrgChart({
  stakeholders,
  onSelectStakeholder,
  selectedId,
  className,
}: StakeholderOrgChartProps) {
  const positions = useMemo(() => computePositions(stakeholders), [stakeholders]);

  if (stakeholders.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-48 text-muted-foreground text-sm', className)}>
        No stakeholders to display
      </div>
    );
  }

  return (
    <div className={cn('w-full overflow-auto', className)}>
      <svg
        width={SVG_SIZE}
        height={SVG_SIZE}
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        className="w-full max-w-[560px] mx-auto"
      >
        {/* Ring guides */}
        {RING_RADIUS.map((r, i) => (
          <circle
            key={i}
            cx={CENTER}
            cy={CENTER}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.5}
            className="text-muted-foreground/20"
            strokeDasharray="4 6"
          />
        ))}

        {/* Centre label */}
        <text
          x={CENTER}
          y={CENTER - 8}
          textAnchor="middle"
          fontSize="10"
          className="fill-muted-foreground"
          fontWeight="600"
        >
          Deal
        </text>
        <text
          x={CENTER}
          y={CENTER + 6}
          textAnchor="middle"
          fontSize="9"
          className="fill-muted-foreground/60"
        >
          Committee
        </text>

        {/* Connection lines from centre */}
        {positions.map((pos, i) => (
          <line
            key={`line-${i}`}
            x1={CENTER}
            y1={CENTER}
            x2={pos.x}
            y2={pos.y}
            stroke="currentColor"
            strokeWidth={0.5}
            className="text-muted-foreground/15"
          />
        ))}

        {/* Stakeholder nodes */}
        {positions.map((pos) => {
          const { stakeholder } = pos;
          const initials = getContactInitials(stakeholder.contact);
          const name = getContactName(stakeholder.contact);
          const nodeRadius = INFLUENCE_SIZE[stakeholder.influence] ?? 30;
          const borderColor = ENGAGEMENT_BORDER[stakeholder.engagement_status] ?? '#9ca3af';
          const isSelected = selectedId === stakeholder.id;

          return (
            <g
              key={stakeholder.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              onClick={() => onSelectStakeholder?.(stakeholder)}
              style={{ cursor: onSelectStakeholder ? 'pointer' : 'default' }}
            >
              {/* Selection ring */}
              {isSelected && (
                <circle
                  r={nodeRadius + 5}
                  fill="none"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  className="animate-pulse"
                />
              )}

              {/* Avatar circle */}
              <circle
                r={nodeRadius}
                fill="hsl(var(--muted))"
                stroke={borderColor}
                strokeWidth={isSelected ? 3 : 2}
              />

              {/* Initials */}
              <text
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={nodeRadius > 34 ? 12 : 10}
                fontWeight="600"
                className="fill-foreground select-none"
              >
                {initials}
              </text>

              {/* Name label below node */}
              <text
                y={nodeRadius + 12}
                textAnchor="middle"
                fontSize="9"
                className="fill-foreground/80 select-none"
              >
                {name.length > 14 ? name.slice(0, 13) + '…' : name}
              </text>

              {/* Role label */}
              <text
                y={nodeRadius + 22}
                textAnchor="middle"
                fontSize="8"
                className="fill-muted-foreground select-none"
              >
                {ROLE_LABELS[stakeholder.role]}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-4 mt-2 px-4 pb-2">
        <LegendItem color="#10b981" label="Active" />
        <LegendItem color="#f59e0b" label="Warming" />
        <LegendItem color="#3b82f6" label="Cold" />
        <LegendItem color="#9ca3af" label="Unknown" />
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-block w-3 h-3 rounded-full bg-muted border border-muted-foreground/30" style={{ transform: 'scale(1.4)', transformOrigin: 'center' }} />
          High influence
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-block w-3 h-3 rounded-full bg-muted border border-muted-foreground/30" />
          Low influence
        </div>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </div>
  );
}
