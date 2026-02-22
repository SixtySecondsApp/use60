/**
 * TimeTriggerForm
 * Config form for trigger_type='time_based'
 */

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface TimeTriggerConfig {
  delay_minutes?: number;
  delay_days?: number;
  relative_to: 'meeting_start' | 'meeting_end' | 'last_champion_activity' | 'last_contact_activity' | 'deal_created' | 'deal_stage_changed';
  condition: 'no_join_detected' | 'no_activity' | 'always' | 'custom';
  condition_custom?: string;
  recurring?: boolean;
  description?: string;
}

const RELATIVE_TO_OPTIONS = [
  { value: 'meeting_start', label: 'Meeting Start' },
  { value: 'meeting_end', label: 'Meeting End' },
  { value: 'last_champion_activity', label: 'Last Champion Activity' },
  { value: 'last_contact_activity', label: 'Last Contact Activity' },
  { value: 'deal_created', label: 'Deal Created' },
  { value: 'deal_stage_changed', label: 'Deal Stage Changed' },
];

const CONDITION_OPTIONS = [
  { value: 'always', label: 'Always Fire' },
  { value: 'no_join_detected', label: 'No Participant Joined' },
  { value: 'no_activity', label: 'No Activity Detected' },
  { value: 'custom', label: 'Custom Condition' },
];

interface Props {
  value: TimeTriggerConfig;
  onChange: (config: TimeTriggerConfig) => void;
  disabled?: boolean;
}

export default function TimeTriggerForm({ value, onChange, disabled }: Props) {
  const usesMinutes = value.relative_to === 'meeting_start' || value.relative_to === 'meeting_end';

  return (
    <div className="space-y-4">
      {/* Relative to */}
      <div className="space-y-1.5">
        <Label>Relative To</Label>
        <Select
          value={value.relative_to}
          onValueChange={(v) => onChange({ ...value, relative_to: v as TimeTriggerConfig['relative_to'] })}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RELATIVE_TO_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Delay */}
      <div className="space-y-1.5">
        <Label>{usesMinutes ? 'Delay (minutes)' : 'Delay (days)'}</Label>
        <Input
          type="number"
          min={0}
          placeholder={usesMinutes ? '5' : '14'}
          value={usesMinutes ? (value.delay_minutes ?? '') : (value.delay_days ?? '')}
          onChange={(e) => {
            const num = parseInt(e.target.value, 10) || 0;
            if (usesMinutes) {
              onChange({ ...value, delay_minutes: num, delay_days: undefined });
            } else {
              onChange({ ...value, delay_days: num, delay_minutes: undefined });
            }
          }}
          disabled={disabled}
        />
        <p className="text-xs text-gray-400">
          How long after the reference event before the SOP fires
        </p>
      </div>

      {/* Condition */}
      <div className="space-y-1.5">
        <Label>Fire Condition</Label>
        <Select
          value={value.condition}
          onValueChange={(v) => onChange({ ...value, condition: v as TimeTriggerConfig['condition'] })}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONDITION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {value.condition === 'custom' && (
        <div className="space-y-1.5">
          <Label>Custom Condition</Label>
          <Input
            placeholder="Describe the condition..."
            value={value.condition_custom ?? ''}
            onChange={(e) => onChange({ ...value, condition_custom: e.target.value })}
            disabled={disabled}
          />
        </div>
      )}

      {/* Summary */}
      <p className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
        Fires{' '}
        {usesMinutes
          ? `${value.delay_minutes ?? 0} minute(s)`
          : `${value.delay_days ?? 0} day(s)`}{' '}
        after <strong>{RELATIVE_TO_OPTIONS.find(o => o.value === value.relative_to)?.label}</strong>
        {value.condition !== 'always' && `, when: ${CONDITION_OPTIONS.find(o => o.value === value.condition)?.label}`}
      </p>
    </div>
  );
}
