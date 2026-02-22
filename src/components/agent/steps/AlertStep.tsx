/**
 * AlertStep — config form for action_type='alert_rep' and 'alert_manager'
 */

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface AlertConfig {
  channel: 'slack' | 'email' | 'in_app';
  message: string;
  include_battlecard?: boolean;
  include_draft?: boolean;
  description?: string;
}

interface Props {
  value: AlertConfig;
  onChange: (config: AlertConfig) => void;
  disabled?: boolean;
  variant?: 'rep' | 'manager';
}

export default function AlertStep({ value, onChange, disabled, variant = 'rep' }: Props) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Channel</Label>
        <Select
          value={value.channel}
          onValueChange={(v) => onChange({ ...value, channel: v as AlertConfig['channel'] })}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="slack">Slack</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="in_app">In-App Notification</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Message</Label>
        <Textarea
          placeholder={`Message to send to the ${variant}...`}
          value={value.message}
          onChange={(e) => onChange({ ...value, message: e.target.value })}
          disabled={disabled}
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Include Battlecard</Label>
            <p className="text-xs text-gray-400">Attach competitive battlecard to the alert</p>
          </div>
          <Switch
            checked={value.include_battlecard ?? false}
            onCheckedChange={(checked) => onChange({ ...value, include_battlecard: checked })}
            disabled={disabled}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Include Draft</Label>
            <p className="text-xs text-gray-400">Attach any email draft from this SOP run</p>
          </div>
          <Switch
            checked={value.include_draft ?? false}
            onCheckedChange={(checked) => onChange({ ...value, include_draft: checked })}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Description <span className="text-gray-400 font-normal">(optional)</span></Label>
        <Input
          placeholder="What this alert does"
          value={value.description ?? ''}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
