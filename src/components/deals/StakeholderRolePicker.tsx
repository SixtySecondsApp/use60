/**
 * StakeholderRolePicker
 *
 * Inline dropdowns for assigning role and influence level to a stakeholder.
 * Changes save immediately via optimistic update.
 * Part of PRD-121: Stakeholder Mapping (STAKE-003)
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type StakeholderRole,
  type StakeholderInfluence,
  ROLE_LABELS,
  INFLUENCE_LABELS,
  ROLE_COLORS,
  INFLUENCE_COLORS,
} from '@/lib/types/stakeholder';

// ============================================================================
// Role Picker
// ============================================================================

const ROLE_OPTIONS: StakeholderRole[] = [
  'economic_buyer',
  'champion',
  'technical_evaluator',
  'end_user',
  'blocker',
  'coach',
  'influencer',
  'legal',
  'procurement',
  'unknown',
];

interface RolePickerProps {
  value: StakeholderRole;
  onChange: (role: StakeholderRole) => void;
  disabled?: boolean;
}

export function RolePicker({ value, onChange, disabled = false }: RolePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium transition-opacity',
          ROLE_COLORS[value],
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80 cursor-pointer',
        )}
      >
        {ROLE_LABELS[value]}
        {!disabled && <ChevronDown className="h-3 w-3 flex-shrink-0" />}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg p-1 w-52 max-h-72 overflow-y-auto">
          {ROLE_OPTIONS.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => {
                onChange(role);
                setOpen(false);
              }}
              className={cn(
                'w-full flex items-center justify-between px-3 py-1.5 rounded text-xs hover:bg-muted/70 transition-colors',
                role === value && 'bg-muted',
              )}
            >
              <span className={cn('font-medium', ROLE_COLORS[role].split(' ').pop())}>
                {ROLE_LABELS[role]}
              </span>
              {role === value && <Check className="h-3 w-3 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Influence Picker
// ============================================================================

const INFLUENCE_OPTIONS: StakeholderInfluence[] = ['high', 'medium', 'low', 'unknown'];

interface InfluencePickerProps {
  value: StakeholderInfluence;
  onChange: (influence: StakeholderInfluence) => void;
  disabled?: boolean;
}

export function InfluencePicker({ value, onChange, disabled = false }: InfluencePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium transition-opacity border',
          INFLUENCE_COLORS[value],
          value === 'high' && 'border-violet-400/30',
          value === 'medium' && 'border-sky-400/30',
          value === 'low' && 'border-gray-400/30',
          value === 'unknown' && 'border-gray-300/30',
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80 cursor-pointer',
        )}
      >
        {INFLUENCE_LABELS[value]} influence
        {!disabled && <ChevronDown className="h-3 w-3 flex-shrink-0" />}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg p-1 w-40">
          {INFLUENCE_OPTIONS.map((influence) => (
            <button
              key={influence}
              type="button"
              onClick={() => {
                onChange(influence);
                setOpen(false);
              }}
              className={cn(
                'w-full flex items-center justify-between px-3 py-1.5 rounded text-xs hover:bg-muted/70 transition-colors',
                influence === value && 'bg-muted',
              )}
            >
              <span className={cn('font-medium capitalize', INFLUENCE_COLORS[influence].split(' ').pop())}>
                {INFLUENCE_LABELS[influence]}
              </span>
              {influence === value && <Check className="h-3 w-3 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
