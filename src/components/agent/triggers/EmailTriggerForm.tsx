/**
 * EmailTriggerForm
 * Config form for trigger_type='email_pattern'
 */

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface EmailTriggerConfig {
  match_field: 'subject' | 'body' | 'both';
  keywords: string;
  sender_filter?: string;
  recipient_filter?: string;
  description?: string;
}

interface Props {
  value: EmailTriggerConfig;
  onChange: (config: EmailTriggerConfig) => void;
  disabled?: boolean;
}

export default function EmailTriggerForm({ value, onChange, disabled }: Props) {
  return (
    <div className="space-y-4">
      {/* Match field */}
      <div className="space-y-1.5">
        <Label>Match In</Label>
        <Select
          value={value.match_field}
          onValueChange={(v) => onChange({ ...value, match_field: v as EmailTriggerConfig['match_field'] })}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="subject">Subject Line</SelectItem>
            <SelectItem value="body">Email Body</SelectItem>
            <SelectItem value="both">Subject + Body</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Keywords */}
      <div className="space-y-1.5">
        <Label>Keywords</Label>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Comma-separated. SOP fires if any keyword matches (OR logic).
        </p>
        <Input
          placeholder="e.g. proposal, pricing, invoice, unsubscribe"
          value={value.keywords}
          onChange={(e) => onChange({ ...value, keywords: e.target.value })}
          disabled={disabled}
        />
      </div>

      {/* Sender filter */}
      <div className="space-y-1.5">
        <Label>Sender Filter <span className="text-gray-400 font-normal">(optional)</span></Label>
        <Input
          placeholder="e.g. @competitor.com, ceo@, specific@email.com"
          value={value.sender_filter ?? ''}
          onChange={(e) => onChange({ ...value, sender_filter: e.target.value || undefined })}
          disabled={disabled}
        />
        <p className="text-xs text-gray-400">Only trigger for emails from matching senders</p>
      </div>

      {/* Recipient filter */}
      <div className="space-y-1.5">
        <Label>Recipient Filter <span className="text-gray-400 font-normal">(optional)</span></Label>
        <Input
          placeholder="e.g. sales@, support@"
          value={value.recipient_filter ?? ''}
          onChange={(e) => onChange({ ...value, recipient_filter: e.target.value || undefined })}
          disabled={disabled}
        />
        <p className="text-xs text-gray-400">Only trigger for emails sent to matching recipients</p>
      </div>
    </div>
  );
}
