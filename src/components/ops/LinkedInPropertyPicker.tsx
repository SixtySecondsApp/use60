import React, { useState, useMemo } from 'react';
import { Search, User, Briefcase, GraduationCap, Globe, Hash, Check, Users, Award, Building2, Phone, Shield } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LinkedInField {
  name: string;
  label: string;
  type: string; // column type: text, url, number, tags
  group: string;
}

interface LinkedInPropertyPickerProps {
  onSelect: (property: { name: string; label: string; columnType: string }) => void;
  onSelectMultiple?: (properties: { name: string; label: string; columnType: string }[]) => void;
  excludeProperties?: string[];
  multiSelect?: boolean;
}

// ---------------------------------------------------------------------------
// Static field definitions (no API call needed — these are Apify's known fields)
// ---------------------------------------------------------------------------

const LINKEDIN_FIELDS: LinkedInField[] = [
  // Profile
  { name: 'full_name',             label: 'Full Name',              type: 'text',   group: 'profile' },
  { name: 'first_name',            label: 'First Name',             type: 'text',   group: 'profile' },
  { name: 'last_name',             label: 'Last Name',              type: 'text',   group: 'profile' },
  { name: 'headline',              label: 'Headline',               type: 'text',   group: 'profile' },
  { name: 'about',                 label: 'About / Summary',        type: 'text',   group: 'profile' },
  { name: 'location',              label: 'Location',               type: 'text',   group: 'profile' },
  { name: 'email',                 label: 'Email',                  type: 'text',   group: 'profile' },
  { name: 'mobile_number',         label: 'Mobile Number',          type: 'text',   group: 'profile' },
  { name: 'profile_photo',         label: 'Profile Photo',          type: 'url',    group: 'profile' },
  { name: 'linkedin_url',          label: 'LinkedIn URL',           type: 'url',    group: 'profile' },
  // Current Role
  { name: 'current_title',         label: 'Current Title',          type: 'text',   group: 'professional' },
  { name: 'current_company',       label: 'Current Company',        type: 'text',   group: 'professional' },
  { name: 'current_company_industry', label: 'Company Industry',    type: 'text',   group: 'professional' },
  { name: 'current_company_size',  label: 'Company Size',           type: 'text',   group: 'professional' },
  { name: 'current_company_website', label: 'Company Website',      type: 'url',    group: 'professional' },
  { name: 'current_company_linkedin', label: 'Company LinkedIn',    type: 'url',    group: 'professional' },
  { name: 'job_location',          label: 'Job Location',           type: 'text',   group: 'professional' },
  { name: 'current_duration',      label: 'Current Job Duration',   type: 'text',   group: 'professional' },
  { name: 'current_duration_yrs',  label: 'Duration (Years)',       type: 'number', group: 'professional' },
  { name: 'job_started_on',        label: 'Job Started On',         type: 'text',   group: 'professional' },
  // Experience History
  { name: 'previous_title',        label: 'Previous Title',         type: 'text',   group: 'experience' },
  { name: 'previous_company',      label: 'Previous Company',       type: 'text',   group: 'experience' },
  { name: 'total_experience_yrs',  label: 'Total Experience (Years)', type: 'number', group: 'experience' },
  { name: 'experience_count',      label: 'Experience Count',       type: 'number', group: 'experience' },
  // Education
  { name: 'education',             label: 'Education',              type: 'text',   group: 'education' },
  { name: 'education_school',      label: 'School',                 type: 'text',   group: 'education' },
  { name: 'certifications',        label: 'Top Certification',      type: 'text',   group: 'education' },
  // Social & Stats
  { name: 'connections',           label: 'Connections',             type: 'number', group: 'stats' },
  { name: 'followers',             label: 'Followers',               type: 'number', group: 'stats' },
  { name: 'skills',                label: 'Skills',                  type: 'tags',   group: 'stats' },
  { name: 'languages',             label: 'Languages',               type: 'tags',   group: 'stats' },
  // Flags
  { name: 'is_premium',            label: 'Premium Account',         type: 'text',   group: 'flags' },
  { name: 'is_creator',            label: 'Creator',                 type: 'text',   group: 'flags' },
  { name: 'is_influencer',         label: 'Influencer',              type: 'text',   group: 'flags' },
  { name: 'is_job_seeker',         label: 'Job Seeker',              type: 'text',   group: 'flags' },
];

const RECOMMENDED = [
  'full_name', 'headline', 'current_title', 'current_company', 'current_company_industry', 'email', 'location', 'skills',
];

const GROUP_META: Record<string, { label: string; icon: React.FC<{ className?: string }> }> = {
  profile:       { label: 'Profile',          icon: User },
  professional:  { label: 'Current Role',     icon: Briefcase },
  experience:    { label: 'Experience',        icon: Building2 },
  education:     { label: 'Education',         icon: GraduationCap },
  stats:         { label: 'Stats & Skills',    icon: Award },
  flags:         { label: 'Account Flags',     icon: Shield },
};

// Map field type → icon
function getTypeIcon(type: string) {
  switch (type) {
    case 'url': return Globe;
    case 'number': return Hash;
    case 'tags': return Users;
    default: return Hash;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LinkedInPropertyPicker({
  onSelect,
  onSelectMultiple,
  excludeProperties = [],
  multiSelect = false,
}: LinkedInPropertyPickerProps) {
  const [search, setSearch] = useState('');
  const [selectedProps, setSelectedProps] = useState<Set<string>>(new Set());

  const { recommendedFields, otherFields, filteredCount } = useMemo(() => {
    const excluded = new Set(excludeProperties);
    const available = LINKEDIN_FIELDS.filter((f) => !excluded.has(f.name));

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
    const groups: Record<string, LinkedInField[]> = {};
    for (const field of otherFields) {
      if (!groups[field.group]) groups[field.group] = [];
      groups[field.group].push(field);
    }
    return groups;
  }, [otherFields]);

  const handleSelect = (field: LinkedInField) => {
    if (multiSelect) {
      setSelectedProps((prev) => {
        const next = new Set(prev);
        if (next.has(field.name)) next.delete(field.name);
        else next.add(field.name);
        return next;
      });
    } else {
      onSelect({ name: field.name, label: field.label, columnType: field.type });
    }
  };

  const handleAddSelected = () => {
    if (!onSelectMultiple || selectedProps.size === 0) return;
    const selected = LINKEDIN_FIELDS
      .filter((f) => selectedProps.has(f.name))
      .map((f) => ({ name: f.name, label: f.label, columnType: f.type }));
    onSelectMultiple(selected);
    setSelectedProps(new Set());
  };

  const renderField = (field: LinkedInField) => {
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
          placeholder="Search LinkedIn fields..."
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
