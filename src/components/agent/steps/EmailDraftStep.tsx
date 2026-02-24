/**
 * EmailDraftStep — config form for action_type='draft_email'
 */

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface EmailDraftConfig {
  template: string;
  subject?: string;
  tone?: string;
  recipient?: string;
  description?: string;
}

const EMAIL_TEMPLATES = [
  { value: 'reschedule_no_show', label: 'Reschedule (No-Show)' },
  { value: 'proposal_outline', label: 'Proposal Outline' },
  { value: 'champion_check_in', label: 'Champion Check-In' },
  { value: 'follow_up_post_meeting', label: 'Post-Meeting Follow Up' },
  { value: 'competitive_response', label: 'Competitive Response' },
  { value: 'custom', label: 'Custom (AI Generated)' },
];

const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual_professional', label: 'Casual Professional' },
  { value: 'empathetic', label: 'Empathetic' },
  { value: 'direct', label: 'Direct' },
  { value: 'friendly', label: 'Friendly' },
];

interface Props {
  value: EmailDraftConfig;
  onChange: (config: EmailDraftConfig) => void;
  disabled?: boolean;
}

export default function EmailDraftStep({ value, onChange, disabled }: Props) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Template</Label>
        <Select
          value={value.template}
          onValueChange={(v) => onChange({ ...value, template: v })}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select email template" />
          </SelectTrigger>
          <SelectContent>
            {EMAIL_TEMPLATES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Subject Line <span className="text-gray-400 font-normal">(optional)</span></Label>
        <Input
          placeholder="AI will generate if blank"
          value={value.subject ?? ''}
          onChange={(e) => onChange({ ...value, subject: e.target.value })}
          disabled={disabled}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Tone</Label>
        <Select
          value={value.tone ?? 'professional'}
          onValueChange={(v) => onChange({ ...value, tone: v })}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TONE_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Recipient <span className="text-gray-400 font-normal">(optional)</span></Label>
        <Input
          placeholder="e.g. prospect, champion, manager"
          value={value.recipient ?? ''}
          onChange={(e) => onChange({ ...value, recipient: e.target.value })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
