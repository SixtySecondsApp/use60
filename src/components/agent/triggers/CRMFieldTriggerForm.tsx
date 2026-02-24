/**
 * CRMFieldTriggerForm
 * Config form for trigger_type='crm_field_change'
 */

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface CRMFieldTriggerConfig {
  crm_object: 'deal' | 'contact' | 'company' | 'activity';
  field_name: string;
  condition: 'changed_to' | 'changed_from' | 'any_change';
  condition_value?: string;
  description?: string;
}

const CRM_OBJECTS = [
  { value: 'deal', label: 'Deal' },
  { value: 'contact', label: 'Contact' },
  { value: 'company', label: 'Company' },
  { value: 'activity', label: 'Activity' },
];

const DEAL_FIELDS = ['stage', 'amount', 'close_date', 'owner', 'probability', 'status'];
const CONTACT_FIELDS = ['job_title', 'company', 'email', 'phone', 'lifecycle_stage'];
const COMPANY_FIELDS = ['industry', 'size', 'revenue', 'status', 'owner'];
const ACTIVITY_FIELDS = ['type', 'status', 'outcome', 'direction'];

function getFieldsForObject(obj: string): string[] {
  switch (obj) {
    case 'deal': return DEAL_FIELDS;
    case 'contact': return CONTACT_FIELDS;
    case 'company': return COMPANY_FIELDS;
    case 'activity': return ACTIVITY_FIELDS;
    default: return [];
  }
}

interface Props {
  value: CRMFieldTriggerConfig;
  onChange: (config: CRMFieldTriggerConfig) => void;
  disabled?: boolean;
}

export default function CRMFieldTriggerForm({ value, onChange, disabled }: Props) {
  const fields = getFieldsForObject(value.crm_object);

  return (
    <div className="space-y-4">
      {/* CRM Object */}
      <div className="space-y-1.5">
        <Label>CRM Object</Label>
        <Select
          value={value.crm_object}
          onValueChange={(v) => onChange({ ...value, crm_object: v as CRMFieldTriggerConfig['crm_object'], field_name: '' })}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select object" />
          </SelectTrigger>
          <SelectContent>
            {CRM_OBJECTS.map((obj) => (
              <SelectItem key={obj.value} value={obj.value}>{obj.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Field */}
      <div className="space-y-1.5">
        <Label>Field</Label>
        <Select
          value={value.field_name}
          onValueChange={(v) => onChange({ ...value, field_name: v })}
          disabled={disabled || !value.crm_object}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select field" />
          </SelectTrigger>
          <SelectContent>
            {fields.map((f) => (
              <SelectItem key={f} value={f}>{f.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Condition */}
      <div className="space-y-1.5">
        <Label>Condition</Label>
        <Select
          value={value.condition}
          onValueChange={(v) => onChange({ ...value, condition: v as CRMFieldTriggerConfig['condition'] })}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any_change">Any Change</SelectItem>
            <SelectItem value="changed_to">Changed To</SelectItem>
            <SelectItem value="changed_from">Changed From</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Condition value */}
      {(value.condition === 'changed_to' || value.condition === 'changed_from') && (
        <div className="space-y-1.5">
          <Label>Value</Label>
          <Input
            placeholder={`Field ${value.condition === 'changed_to' ? 'changes to' : 'changes from'} this value`}
            value={value.condition_value ?? ''}
            onChange={(e) => onChange({ ...value, condition_value: e.target.value })}
            disabled={disabled}
          />
        </div>
      )}

      {value.crm_object && value.field_name && (
        <p className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
          Fires when <strong>{value.crm_object}</strong> field <strong>{value.field_name.replace(/_/g, ' ')}</strong>{' '}
          {value.condition === 'any_change' ? 'changes to any value' : `${value.condition.replace('_', ' ')} "${value.condition_value || '...'}"`}
        </p>
      )}
    </div>
  );
}
