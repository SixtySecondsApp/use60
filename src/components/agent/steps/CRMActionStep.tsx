/**
 * CRMActionStep — config form for action_type='crm_action'
 */

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface CRMActionConfig {
  action: string;
  field?: string;
  value?: string;
  description?: string;
}

const CRM_ACTIONS = [
  { value: 'update_deal_stage', label: 'Update Deal Stage' },
  { value: 'log_activity', label: 'Log Activity' },
  { value: 'log_competitive_mention', label: 'Log Competitive Mention' },
  { value: 'check_calendar_status', label: 'Check Calendar Status' },
  { value: 'check_recent_activity', label: 'Check Recent Activity' },
  { value: 'update_contact_field', label: 'Update Contact Field' },
  { value: 'update_deal_field', label: 'Update Deal Field' },
  { value: 'add_deal_tag', label: 'Add Deal Tag' },
  { value: 'custom', label: 'Custom Action' },
];

interface Props {
  value: CRMActionConfig;
  onChange: (config: CRMActionConfig) => void;
  disabled?: boolean;
}

export default function CRMActionStep({ value, onChange, disabled }: Props) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Action</Label>
        <Select
          value={value.action}
          onValueChange={(v) => onChange({ ...value, action: v })}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select CRM action" />
          </SelectTrigger>
          <SelectContent>
            {CRM_ACTIONS.map((a) => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(value.action === 'update_contact_field' || value.action === 'update_deal_field') && (
        <>
          <div className="space-y-1.5">
            <Label>Field Name</Label>
            <Input
              placeholder="e.g. stage, owner, status"
              value={value.field ?? ''}
              onChange={(e) => onChange({ ...value, field: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label>New Value</Label>
            <Input
              placeholder="Value to set"
              value={value.value ?? ''}
              onChange={(e) => onChange({ ...value, value: e.target.value })}
              disabled={disabled}
            />
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <Label>Description <span className="text-gray-400 font-normal">(optional)</span></Label>
        <Input
          placeholder="What this step does"
          value={value.description ?? ''}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
