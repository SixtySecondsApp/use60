/**
 * TriggerConditionSelector
 * SOP-003: 4-type trigger selector with per-type config forms.
 * Outputs trigger_config JSONB and trigger_type string.
 */

import { MessageSquare, Database, Mail, Clock, Hand } from 'lucide-react';
import { cn } from '@/lib/utils';
import TranscriptTriggerForm, { type TranscriptTriggerConfig } from './triggers/TranscriptTriggerForm';
import CRMFieldTriggerForm, { type CRMFieldTriggerConfig } from './triggers/CRMFieldTriggerForm';
import EmailTriggerForm, { type EmailTriggerConfig } from './triggers/EmailTriggerForm';
import TimeTriggerForm, { type TimeTriggerConfig } from './triggers/TimeTriggerForm';

export type TriggerType = 'transcript_phrase' | 'crm_field_change' | 'email_pattern' | 'time_based' | 'manual';

export type TriggerConfig =
  | TranscriptTriggerConfig
  | CRMFieldTriggerConfig
  | EmailTriggerConfig
  | TimeTriggerConfig
  | Record<string, never>;

interface TriggerTypeOption {
  value: TriggerType;
  label: string;
  description: string;
  icon: React.ElementType;
}

const TRIGGER_TYPES: TriggerTypeOption[] = [
  {
    value: 'transcript_phrase',
    label: 'Transcript Phrase',
    description: 'Fires when specific words or phrases appear in a meeting transcript',
    icon: MessageSquare,
  },
  {
    value: 'crm_field_change',
    label: 'CRM Field Change',
    description: 'Fires when a CRM field value changes (deal stage, contact status, etc.)',
    icon: Database,
  },
  {
    value: 'email_pattern',
    label: 'Email Pattern',
    description: 'Fires when an inbound or outbound email matches specific keywords',
    icon: Mail,
  },
  {
    value: 'time_based',
    label: 'Time-Based',
    description: 'Fires after a delay relative to an event (meeting start, last activity, etc.)',
    icon: Clock,
  },
  {
    value: 'manual',
    label: 'Manual',
    description: 'Triggered manually by a rep or via copilot command',
    icon: Hand,
  },
];

function getDefaultConfig(type: TriggerType): TriggerConfig {
  switch (type) {
    case 'transcript_phrase':
      return { phrases: [], match_mode: 'any', case_sensitive: false, use_regex: false };
    case 'crm_field_change':
      return { crm_object: 'deal', field_name: '', condition: 'any_change' };
    case 'email_pattern':
      return { match_field: 'both', keywords: '' };
    case 'time_based':
      return { relative_to: 'meeting_start', delay_minutes: 5, condition: 'always' };
    case 'manual':
      return {};
    default:
      return {};
  }
}

interface Props {
  triggerType: TriggerType;
  triggerConfig: TriggerConfig;
  onTriggerTypeChange: (type: TriggerType) => void;
  onTriggerConfigChange: (config: TriggerConfig) => void;
  disabled?: boolean;
}

export default function TriggerConditionSelector({
  triggerType,
  triggerConfig,
  onTriggerTypeChange,
  onTriggerConfigChange,
  disabled,
}: Props) {
  function handleTypeSelect(type: TriggerType) {
    if (disabled) return;
    onTriggerTypeChange(type);
    onTriggerConfigChange(getDefaultConfig(type));
  }

  return (
    <div className="space-y-4">
      {/* Type cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {TRIGGER_TYPES.map((opt) => {
          const Icon = opt.icon;
          const selected = triggerType === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleTypeSelect(opt.value)}
              disabled={disabled}
              className={cn(
                'flex items-start gap-3 p-3 rounded-xl border text-left transition-all',
                selected
                  ? 'border-[#37bd7e] bg-[#37bd7e]/5 dark:bg-[#37bd7e]/10'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 hover:border-[#37bd7e]/40',
                disabled && 'opacity-60 cursor-not-allowed'
              )}
            >
              <div
                className={cn(
                  'p-1.5 rounded-lg mt-0.5 flex-shrink-0',
                  selected
                    ? 'bg-[#37bd7e] text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                )}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{opt.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{opt.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Config form for selected type */}
      {triggerType !== 'manual' && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50/50 dark:bg-gray-800/30">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Trigger Configuration
          </p>

          {triggerType === 'transcript_phrase' && (
            <TranscriptTriggerForm
              value={triggerConfig as TranscriptTriggerConfig}
              onChange={onTriggerConfigChange}
              disabled={disabled}
            />
          )}
          {triggerType === 'crm_field_change' && (
            <CRMFieldTriggerForm
              value={triggerConfig as CRMFieldTriggerConfig}
              onChange={onTriggerConfigChange}
              disabled={disabled}
            />
          )}
          {triggerType === 'email_pattern' && (
            <EmailTriggerForm
              value={triggerConfig as EmailTriggerConfig}
              onChange={onTriggerConfigChange}
              disabled={disabled}
            />
          )}
          {triggerType === 'time_based' && (
            <TimeTriggerForm
              value={triggerConfig as TimeTriggerConfig}
              onChange={onTriggerConfigChange}
              disabled={disabled}
            />
          )}
        </div>
      )}

      {triggerType === 'manual' && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50/50 dark:bg-gray-800/30 text-center">
          <Hand className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            This SOP will only fire when manually triggered by a rep or via the AI copilot.
          </p>
        </div>
      )}
    </div>
  );
}
