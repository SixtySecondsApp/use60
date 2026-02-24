/**
 * EnrichStep — config form for action_type='enrich_contact'
 */

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface EnrichConfig {
  enrich_type: 'contact_profile' | 'company_profile' | 'competitor_intelligence' | 'social_presence' | 'custom';
  target?: string;
  description?: string;
}

const ENRICH_TYPES = [
  { value: 'contact_profile', label: 'Contact Profile (LinkedIn, title, company)' },
  { value: 'company_profile', label: 'Company Profile (firmographics, news)' },
  { value: 'competitor_intelligence', label: 'Competitor Intelligence (battlecard)' },
  { value: 'social_presence', label: 'Social Presence (recent posts, activity)' },
  { value: 'custom', label: 'Custom Enrichment' },
];

interface Props {
  value: EnrichConfig;
  onChange: (config: EnrichConfig) => void;
  disabled?: boolean;
}

export default function EnrichStep({ value, onChange, disabled }: Props) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Enrichment Type</Label>
        <Select
          value={value.enrich_type}
          onValueChange={(v) => onChange({ ...value, enrich_type: v as EnrichConfig['enrich_type'] })}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select enrichment type" />
          </SelectTrigger>
          <SelectContent>
            {ENRICH_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Target <span className="text-gray-400 font-normal">(optional)</span></Label>
        <Input
          placeholder="e.g. primary_contact, champion, deal_company"
          value={value.target ?? ''}
          onChange={(e) => onChange({ ...value, target: e.target.value })}
          disabled={disabled}
        />
        <p className="text-xs text-gray-400">
          Which contact or company to enrich. Defaults to primary contact on the deal.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Description <span className="text-gray-400 font-normal">(optional)</span></Label>
        <Input
          placeholder="What this enrichment does"
          value={value.description ?? ''}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
