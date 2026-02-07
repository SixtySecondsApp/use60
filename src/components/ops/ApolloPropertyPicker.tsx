import React, { useState, useMemo } from 'react';
import { Search, Mail, Phone, Globe, Hash, User, Building2, MapPin, Share2, ShieldCheck, Check } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApolloField {
  name: string;
  label: string;
  type: string; // column type: email, phone, url, text, number, tags
  group: string;
}

interface ApolloPropertyPickerProps {
  onSelect: (property: { name: string; label: string; columnType: string; isOrgEnrichment?: boolean }) => void;
  onSelectMultiple?: (properties: { name: string; label: string; columnType: string; isOrgEnrichment?: boolean }[]) => void;
  excludeProperties?: string[];
  multiSelect?: boolean;
}

// ---------------------------------------------------------------------------
// Static field definitions (no API call needed — these are Apollo's known fields)
// ---------------------------------------------------------------------------

const APOLLO_FIELDS: ApolloField[] = [
  // Contact Info
  { name: 'email',              label: 'Work Email',            type: 'email',  group: 'contact' },
  { name: 'personal_email',    label: 'Personal Email',        type: 'email',  group: 'contact' },
  { name: 'phone',             label: 'Phone',                 type: 'phone',  group: 'contact' },
  { name: 'mobile_phone',      label: 'Mobile Phone',          type: 'phone',  group: 'contact' },
  { name: 'linkedin_url',      label: 'LinkedIn URL',          type: 'url',    group: 'contact' },
  // Professional
  { name: 'title',             label: 'Job Title',             type: 'text',   group: 'professional' },
  { name: 'headline',          label: 'Headline',              type: 'text',   group: 'professional' },
  { name: 'seniority',         label: 'Seniority Level',       type: 'text',   group: 'professional' },
  { name: 'departments',       label: 'Departments',           type: 'tags',   group: 'professional' },
  // Location
  { name: 'city',              label: 'City',                  type: 'text',   group: 'location' },
  { name: 'state',             label: 'State',                 type: 'text',   group: 'location' },
  { name: 'country',           label: 'Country',               type: 'text',   group: 'location' },
  // Social
  { name: 'twitter_url',       label: 'Twitter',               type: 'url',    group: 'social' },
  { name: 'github_url',        label: 'GitHub',                type: 'url',    group: 'social' },
  { name: 'facebook_url',      label: 'Facebook',              type: 'url',    group: 'social' },
  { name: 'photo_url',         label: 'Photo URL',             type: 'url',    group: 'social' },
  // Email Quality
  { name: 'email_status',      label: 'Email Status',          type: 'text',   group: 'email_quality' },
  { name: 'email_confidence',  label: 'Email Confidence',      type: 'number', group: 'email_quality' },
  // Company
  { name: 'company_name',      label: 'Company Name',          type: 'text',   group: 'company' },
  { name: 'company_domain',    label: 'Company Domain',        type: 'url',    group: 'company' },
  { name: 'company_industry',  label: 'Industry',              type: 'text',   group: 'company' },
  { name: 'company_employees', label: 'Employee Count',        type: 'number', group: 'company' },
  { name: 'company_revenue',   label: 'Annual Revenue',        type: 'number', group: 'company' },
  { name: 'company_funding',   label: 'Funding Stage',         type: 'text',   group: 'company' },
  { name: 'company_phone',     label: 'Company Phone',         type: 'phone',  group: 'company' },
  { name: 'company_city',      label: 'Company HQ City',       type: 'text',   group: 'company' },
  { name: 'company_country',   label: 'Company HQ Country',    type: 'text',   group: 'company' },
  { name: 'company_linkedin',  label: 'Company LinkedIn',      type: 'url',    group: 'company' },
  { name: 'company_website',   label: 'Company Website',       type: 'url',    group: 'company' },
  { name: 'company_tech_stack',label: 'Tech Stack',            type: 'tags',   group: 'company' },
  // Organization Enrichment (separate API — enriches by company domain)
  { name: 'org_name',         label: 'Org Name',              type: 'text',   group: 'org_enrichment' },
  { name: 'org_domain',       label: 'Org Domain',            type: 'url',    group: 'org_enrichment' },
  { name: 'org_industry',     label: 'Org Industry',          type: 'text',   group: 'org_enrichment' },
  { name: 'org_employees',    label: 'Org Employee Count',    type: 'number', group: 'org_enrichment' },
  { name: 'org_revenue',      label: 'Org Annual Revenue',    type: 'number', group: 'org_enrichment' },
  { name: 'org_funding',      label: 'Org Funding Stage',     type: 'text',   group: 'org_enrichment' },
  { name: 'org_funding_total',label: 'Org Total Funding',     type: 'number', group: 'org_enrichment' },
  { name: 'org_founded',      label: 'Org Founded Year',      type: 'number', group: 'org_enrichment' },
  { name: 'org_phone',        label: 'Org Phone',             type: 'phone',  group: 'org_enrichment' },
  { name: 'org_city',         label: 'Org HQ City',           type: 'text',   group: 'org_enrichment' },
  { name: 'org_country',      label: 'Org HQ Country',        type: 'text',   group: 'org_enrichment' },
  { name: 'org_linkedin',     label: 'Org LinkedIn',          type: 'url',    group: 'org_enrichment' },
  { name: 'org_website',      label: 'Org Website',           type: 'url',    group: 'org_enrichment' },
  { name: 'org_description',  label: 'Org Description',       type: 'text',   group: 'org_enrichment' },
  { name: 'org_tech_stack',   label: 'Org Tech Stack',        type: 'tags',   group: 'org_enrichment' },
  { name: 'org_keywords',     label: 'Org Keywords',          type: 'tags',   group: 'org_enrichment' },
  { name: 'org_logo',         label: 'Org Logo URL',          type: 'url',    group: 'org_enrichment' },
];

const RECOMMENDED = [
  'email', 'phone', 'title', 'company_name', 'linkedin_url', 'email_status',
];

const GROUP_META: Record<string, { label: string; icon: React.FC<{ className?: string }> }> = {
  contact:       { label: 'Contact Info',     icon: User },
  professional:  { label: 'Professional',     icon: User },
  location:      { label: 'Location',         icon: MapPin },
  social:        { label: 'Social',           icon: Share2 },
  email_quality: { label: 'Email Quality',    icon: ShieldCheck },
  company:       { label: 'Company',          icon: Building2 },
  org_enrichment:{ label: 'Org Enrichment',   icon: Building2 },
};

// Map field type → icon
function getTypeIcon(type: string) {
  switch (type) {
    case 'email': return Mail;
    case 'phone': return Phone;
    case 'url': return Globe;
    case 'number': return Hash;
    default: return Hash;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApolloPropertyPicker({
  onSelect,
  onSelectMultiple,
  excludeProperties = [],
  multiSelect = false,
}: ApolloPropertyPickerProps) {
  const [search, setSearch] = useState('');
  const [selectedProps, setSelectedProps] = useState<Set<string>>(new Set());

  const { recommendedFields, otherFields, filteredCount } = useMemo(() => {
    const excluded = new Set(excludeProperties);
    const available = APOLLO_FIELDS.filter((f) => !excluded.has(f.name));

    let filtered = available;
    if (search) {
      const q = search.toLowerCase();
      filtered = available.filter(
        (f) =>
          f.label.toLowerCase().includes(q) ||
          f.name.toLowerCase().includes(q) ||
          f.group.toLowerCase().includes(q),
      );
    }

    const recommended = filtered.filter((f) => RECOMMENDED.includes(f.name));
    recommended.sort((a, b) => RECOMMENDED.indexOf(a.name) - RECOMMENDED.indexOf(b.name));

    const other = filtered.filter((f) => !RECOMMENDED.includes(f.name));

    return { recommendedFields: recommended, otherFields: other, filteredCount: filtered.length };
  }, [excludeProperties, search]);

  // Group other fields by category
  const groupedOther = useMemo(() => {
    const groups: Record<string, ApolloField[]> = {};
    for (const field of otherFields) {
      if (!groups[field.group]) groups[field.group] = [];
      groups[field.group].push(field);
    }
    return groups;
  }, [otherFields]);

  const handleSelect = (field: ApolloField) => {
    if (multiSelect) {
      setSelectedProps((prev) => {
        const next = new Set(prev);
        if (next.has(field.name)) next.delete(field.name);
        else next.add(field.name);
        return next;
      });
    } else {
      onSelect({ name: field.name, label: field.label, columnType: field.type, isOrgEnrichment: field.group === 'org_enrichment' });
    }
  };

  const handleAddSelected = () => {
    if (!onSelectMultiple || selectedProps.size === 0) return;
    const selected = APOLLO_FIELDS
      .filter((f) => selectedProps.has(f.name))
      .map((f) => ({ name: f.name, label: f.label, columnType: f.type, isOrgEnrichment: f.group === 'org_enrichment' }));
    onSelectMultiple(selected);
    setSelectedProps(new Set());
  };

  const renderField = (field: ApolloField) => {
    const Icon = getTypeIcon(field.type);
    const isSelected = selectedProps.has(field.name);
    return (
      <button
        key={field.name}
        onClick={() => handleSelect(field)}
        className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gray-800 ${
          isSelected ? 'bg-blue-500/10 text-blue-300 border border-blue-500/30' : 'text-gray-300 hover:text-white'
        }`}
      >
        {multiSelect && (
          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
            isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-600'
          }`}>
            {isSelected && <Check className="w-3 h-3 text-white" />}
          </div>
        )}
        <Icon className="w-4 h-4 text-gray-500 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{field.label}</div>
          <div className="truncate text-xs text-gray-500">{field.name}</div>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 shrink-0">
          {field.type}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Apollo fields..."
          className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
          autoFocus
        />
      </div>

      {/* Field list */}
      <div className="max-h-[300px] overflow-y-auto space-y-3">
        {/* Recommended */}
        {recommendedFields.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 px-1">
              Recommended
            </h4>
            <div className="space-y-0.5">
              {recommendedFields.map(renderField)}
            </div>
          </div>
        )}

        {/* Grouped other fields */}
        {Object.entries(groupedOther).map(([group, fields]) => {
          const meta = GROUP_META[group];
          if (!meta) return null;
          return (
            <div key={group}>
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 px-1">
                {meta.label}
              </h4>
              <div className="space-y-0.5">
                {fields.map(renderField)}
              </div>
            </div>
          );
        })}

        {/* Empty state */}
        {filteredCount === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500">
              {search ? 'No fields match your search' : 'No fields available'}
            </p>
          </div>
        )}
      </div>

      {/* Add Selected button for multi-select mode */}
      {multiSelect && selectedProps.size > 0 && (
        <div className="pt-3 border-t border-gray-700">
          <button
            onClick={handleAddSelected}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            Add {selectedProps.size} Column{selectedProps.size > 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}
