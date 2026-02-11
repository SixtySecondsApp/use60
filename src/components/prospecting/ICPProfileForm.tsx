/**
 * ICPProfileForm — Dialog form for creating and editing ICP profiles.
 *
 * Multi-section form with firmographic, persona, geography, and technographic filters.
 * Uses Dialog from @/components/ui, useState for form state, and ICP CRUD hooks.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Building2, Users, MapPin, Cpu, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCreateICPProfile, useUpdateICPProfile } from '@/lib/hooks/useICPProfilesCRUD';
import type {
  ICPProfile,
  ICPCriteria,
  ICPTargetProvider,
  ICPStatus,
  ICPVisibility,
} from '@/lib/types/prospecting';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMPLOYEE_RANGES = [
  { label: '1-10', min: 1, max: 10 },
  { label: '11-20', min: 11, max: 20 },
  { label: '21-50', min: 21, max: 50 },
  { label: '51-100', min: 51, max: 100 },
  { label: '101-200', min: 101, max: 200 },
  { label: '201-500', min: 201, max: 500 },
  { label: '501-1,000', min: 501, max: 1000 },
  { label: '1,001-5,000', min: 1001, max: 5000 },
  { label: '5,001-10,000', min: 5001, max: 10000 },
  { label: '10,001+', min: 10001, max: 1000000 },
];

const FUNDING_STAGES = [
  { value: 'seed', label: 'Seed' },
  { value: 'angel', label: 'Angel' },
  { value: 'venture', label: 'Venture' },
  { value: 'series_a', label: 'Series A' },
  { value: 'series_b', label: 'Series B' },
  { value: 'series_c', label: 'Series C' },
  { value: 'series_d', label: 'Series D' },
  { value: 'series_e', label: 'Series E' },
  { value: 'ipo', label: 'IPO' },
  { value: 'private_equity', label: 'Private Equity' },
];

const SENIORITY_LEVELS = [
  { value: 'owner', label: 'Owner' },
  { value: 'founder', label: 'Founder' },
  { value: 'c_suite', label: 'C-Suite' },
  { value: 'partner', label: 'Partner' },
  { value: 'vp', label: 'VP' },
  { value: 'head', label: 'Head' },
  { value: 'director', label: 'Director' },
  { value: 'manager', label: 'Manager' },
  { value: 'senior', label: 'Senior' },
  { value: 'entry', label: 'Entry' },
];

const DEPARTMENTS = [
  { value: 'engineering_technical', label: 'Engineering / Technical' },
  { value: 'sales', label: 'Sales' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'finance', label: 'Finance' },
  { value: 'operations', label: 'Operations' },
  { value: 'human_resources', label: 'Human Resources' },
  { value: 'support', label: 'Support' },
  { value: 'legal', label: 'Legal' },
  { value: 'product_management', label: 'Product Management' },
  { value: 'data_science', label: 'Data Science' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'education', label: 'Education' },
  { value: 'media_communications', label: 'Media / Communications' },
];

const TARGET_PROVIDERS: { value: ICPTargetProvider; label: string }[] = [
  { value: 'apollo', label: 'Apollo' },
  { value: 'ai_ark', label: 'AI Ark' },
  { value: 'both', label: 'Both' },
];

const STATUS_OPTIONS: { value: ICPStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'testing', label: 'Testing' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ICPProfileFormProps {
  isOpen: boolean;
  onClose: () => void;
  editProfile?: ICPProfile;
  onSaved?: (profile: ICPProfile) => void;
  orgId: string;
}

// ---------------------------------------------------------------------------
// Helper: Collapsible Section
// ---------------------------------------------------------------------------

function FormSection({
  icon: Icon,
  title,
  defaultOpen = true,
  children,
}: {
  icon: React.ElementType;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[#E2E8F0] dark:border-gray-700/50 rounded-xl">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left text-sm font-medium text-[#1E293B] dark:text-gray-100 hover:bg-[#F8FAFC] dark:hover:bg-gray-800/50 rounded-xl transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4 text-[#64748B] dark:text-gray-400" /> : <ChevronRight className="h-4 w-4 text-[#64748B] dark:text-gray-400" />}
        <Icon className="h-4 w-4 text-[#64748B] dark:text-gray-400" />
        {title}
      </button>
      {open && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: Multi-select chip picker (for predefined options)
// ---------------------------------------------------------------------------

function MultiChipPicker({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm text-[#64748B] dark:text-gray-400">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isSelected = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggle(opt.value)}
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                isSelected
                  ? 'bg-brand-blue/5 dark:bg-brand-blue/10 text-brand-blue dark:text-blue-400 border-brand-blue/20 dark:border-brand-blue/30'
                  : 'bg-white dark:bg-gray-800/50 text-[#64748B] dark:text-gray-400 border-[#E2E8F0] dark:border-gray-700/50 hover:border-brand-blue/30 dark:hover:border-brand-blue/30'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: Tag input (freeform text)
// ---------------------------------------------------------------------------

function TagInput({
  label,
  tags,
  onAdd,
  onRemove,
  placeholder,
}: {
  label: string;
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  placeholder?: string;
}) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && inputValue.trim()) {
      e.preventDefault();
      const trimmed = inputValue.trim().replace(/,$/g, '');
      if (trimmed && !tags.includes(trimmed)) {
        onAdd(trimmed);
      }
      setInputValue('');
    }
    if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onRemove(tags[tags.length - 1]);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm text-[#64748B] dark:text-gray-400">{label}</Label>
      <div className="flex flex-wrap gap-1.5 p-2 min-h-[40px] border border-[#E2E8F0] dark:border-gray-700/50 rounded-lg bg-white dark:bg-gray-800/50 focus-within:ring-2 focus-within:ring-brand-blue focus-within:ring-offset-2">
        {tags.map((tag) => (
          <Badge key={tag} variant="default" className="gap-1">
            {tag}
            <button
              type="button"
              onClick={() => onRemove(tag)}
              className="ml-0.5 hover:text-brand-blue dark:hover:text-blue-200"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm text-[#1E293B] dark:text-gray-100 placeholder:text-[#94A3B8] dark:placeholder:text-gray-500"
        />
      </div>
      <p className="text-xs text-[#94A3B8] dark:text-gray-500">Press Enter or comma to add</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: Employee range multi-select
// ---------------------------------------------------------------------------

function EmployeeRangePicker({
  selected,
  onToggle,
}: {
  selected: { min: number; max: number }[];
  onToggle: (range: { min: number; max: number }) => void;
}) {
  const isSelected = (range: { min: number; max: number }) =>
    selected.some((s) => s.min === range.min && s.max === range.max);

  return (
    <div className="space-y-2">
      <Label className="text-sm text-[#64748B] dark:text-gray-400">Employee Count</Label>
      <div className="flex flex-wrap gap-1.5">
        {EMPLOYEE_RANGES.map((range) => {
          const sel = isSelected(range);
          return (
            <button
              key={range.label}
              type="button"
              onClick={() => onToggle({ min: range.min, max: range.max })}
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                sel
                  ? 'bg-brand-blue/5 dark:bg-brand-blue/10 text-brand-blue dark:text-blue-400 border-brand-blue/20 dark:border-brand-blue/30'
                  : 'bg-white dark:bg-gray-800/50 text-[#64748B] dark:text-gray-400 border-[#E2E8F0] dark:border-gray-700/50 hover:border-brand-blue/30 dark:hover:border-brand-blue/30'
              }`}
            >
              {range.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ICPProfileForm({ isOpen, onClose, editProfile, onSaved, orgId }: ICPProfileFormProps) {
  const { userId } = useAuth();
  const createMutation = useCreateICPProfile();
  const updateMutation = useUpdateICPProfile();
  const isEditing = !!editProfile;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  // ----- Form state -----
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetProvider, setTargetProvider] = useState<ICPTargetProvider>('apollo');
  const [status, setStatus] = useState<ICPStatus>('draft');
  const [visibility, setVisibility] = useState<ICPVisibility>('team_only');

  // Criteria state
  const [industries, setIndustries] = useState<string[]>([]);
  const [employeeRanges, setEmployeeRanges] = useState<{ min: number; max: number }[]>([]);
  const [fundingStages, setFundingStages] = useState<string[]>([]);
  const [revenueMin, setRevenueMin] = useState('');
  const [revenueMax, setRevenueMax] = useState('');
  const [seniorityLevels, setSeniorityLevels] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [titleKeywords, setTitleKeywords] = useState<string[]>([]);
  const [titleSearchMode, setTitleSearchMode] = useState<'smart' | 'exact' | 'any'>('smart');
  const [countries, setCountries] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [technologyKeywords, setTechnologyKeywords] = useState<string[]>([]);
  const [customKeywords, setCustomKeywords] = useState<string[]>([]);

  // ----- Reset form on open / editProfile change -----
  useEffect(() => {
    if (!isOpen) return;

    if (editProfile) {
      setName(editProfile.name);
      setDescription(editProfile.description ?? '');
      setTargetProvider(editProfile.target_provider);
      setStatus(editProfile.status);
      setVisibility(editProfile.visibility);

      const c = editProfile.criteria;
      setIndustries(c.industries ?? []);
      setEmployeeRanges(c.employee_ranges ?? []);
      setFundingStages(c.funding_stages ?? []);
      setRevenueMin(c.revenue_range?.min?.toString() ?? '');
      setRevenueMax(c.revenue_range?.max?.toString() ?? '');
      setSeniorityLevels(c.seniority_levels ?? []);
      setDepartments(c.departments ?? []);
      setTitleKeywords(c.title_keywords ?? []);
      setTitleSearchMode(c.title_search_mode ?? 'smart');
      setCountries(c.location_countries ?? []);
      setRegions(c.location_regions ?? []);
      setCities(c.location_cities ?? []);
      setTechnologyKeywords(c.technology_keywords ?? []);
      setCustomKeywords(c.custom_keywords ?? []);
    } else {
      setName('');
      setDescription('');
      setTargetProvider('apollo');
      setStatus('draft');
      setVisibility('team_only');
      setIndustries([]);
      setEmployeeRanges([]);
      setFundingStages([]);
      setRevenueMin('');
      setRevenueMax('');
      setSeniorityLevels([]);
      setDepartments([]);
      setTitleKeywords([]);
      setTitleSearchMode('smart');
      setCountries([]);
      setRegions([]);
      setCities([]);
      setTechnologyKeywords([]);
      setCustomKeywords([]);
    }
  }, [isOpen, editProfile]);

  // ----- Toggle helpers -----
  const toggleArray = useCallback((arr: string[], value: string): string[] =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value], []);

  const toggleRange = useCallback((arr: { min: number; max: number }[], range: { min: number; max: number }) =>
    arr.some((r) => r.min === range.min && r.max === range.max)
      ? arr.filter((r) => !(r.min === range.min && r.max === range.max))
      : [...arr, range], []);

  // ----- Build criteria object -----
  const buildCriteria = (): ICPCriteria => {
    const criteria: ICPCriteria = {};

    if (industries.length > 0) criteria.industries = industries;
    if (employeeRanges.length > 0) criteria.employee_ranges = employeeRanges;
    if (fundingStages.length > 0) criteria.funding_stages = fundingStages;
    if (seniorityLevels.length > 0) criteria.seniority_levels = seniorityLevels;
    if (departments.length > 0) criteria.departments = departments;
    if (titleKeywords.length > 0) {
      criteria.title_keywords = titleKeywords;
      criteria.title_search_mode = titleSearchMode;
    }
    if (countries.length > 0) criteria.location_countries = countries;
    if (regions.length > 0) criteria.location_regions = regions;
    if (cities.length > 0) criteria.location_cities = cities;
    if (technologyKeywords.length > 0) criteria.technology_keywords = technologyKeywords;
    if (customKeywords.length > 0) criteria.custom_keywords = customKeywords;
    if (revenueMin || revenueMax) {
      criteria.revenue_range = {
        min: revenueMin ? Number(revenueMin) : 0,
        max: revenueMax ? Number(revenueMax) : 0,
      };
    }

    return criteria;
  };

  // ----- Validation -----
  const hasAnyCriteria = () => {
    return (
      industries.length > 0 ||
      employeeRanges.length > 0 ||
      fundingStages.length > 0 ||
      seniorityLevels.length > 0 ||
      departments.length > 0 ||
      titleKeywords.length > 0 ||
      countries.length > 0 ||
      regions.length > 0 ||
      cities.length > 0 ||
      technologyKeywords.length > 0 ||
      customKeywords.length > 0 ||
      revenueMin !== '' ||
      revenueMax !== ''
    );
  };

  const canSave = name.trim().length > 0 && hasAnyCriteria();

  // ----- Save handler -----
  const handleSave = async () => {
    if (!canSave || !userId) return;

    const criteria = buildCriteria();

    if (isEditing && editProfile) {
      updateMutation.mutate(
        {
          id: editProfile.id,
          payload: {
            name: name.trim(),
            description: description.trim() || null,
            target_provider: targetProvider,
            status,
            visibility,
            criteria,
          },
        },
        {
          onSuccess: (profile) => {
            onSaved?.(profile);
            onClose();
          },
        }
      );
    } else {
      createMutation.mutate(
        {
          organization_id: orgId,
          created_by: userId,
          name: name.trim(),
          description: description.trim() || null,
          criteria,
          target_provider: targetProvider,
          status,
          visibility,
        },
        {
          onSuccess: (profile) => {
            onSaved?.(profile);
            onClose();
          },
        }
      );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit ICP Profile' : 'Create ICP Profile'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update targeting criteria for this Ideal Customer Profile.'
              : 'Define your Ideal Customer Profile to target the right prospects.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* ---- Basic Info ---- */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="icp-name">Name *</Label>
              <Input
                id="icp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Mid-Market SaaS CTOs"
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="icp-description">Description</Label>
              <Textarea
                id="icp-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe who this ICP targets and why..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={targetProvider} onValueChange={(v) => setTargetProvider(v as ICPTargetProvider)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TARGET_PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as ICPStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Visibility</Label>
                <Select value={visibility} onValueChange={(v) => setVisibility(v as ICPVisibility)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="team_only">Team Only</SelectItem>
                    <SelectItem value="shared">Shared</SelectItem>
                    <SelectItem value="client_visible">Client Visible</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ---- Firmographic Filters ---- */}
          <FormSection icon={Building2} title="Firmographic Filters">
            <TagInput
              label="Industries"
              tags={industries}
              onAdd={(t) => setIndustries((prev) => [...prev, t])}
              onRemove={(t) => setIndustries((prev) => prev.filter((v) => v !== t))}
              placeholder="e.g. SaaS, FinTech, Healthcare..."
            />

            <EmployeeRangePicker
              selected={employeeRanges}
              onToggle={(r) => setEmployeeRanges((prev) => toggleRange(prev, r))}
            />

            <MultiChipPicker
              label="Funding Stages"
              options={FUNDING_STAGES}
              selected={fundingStages}
              onToggle={(v) => setFundingStages((prev) => toggleArray(prev, v))}
            />

            <div className="space-y-2">
              <Label className="text-sm text-[#64748B] dark:text-gray-400">Revenue Range</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={revenueMin}
                  onChange={(e) => setRevenueMin(e.target.value)}
                  placeholder="Min ($)"
                  className="w-full"
                />
                <span className="text-[#94A3B8] dark:text-gray-500 text-sm">to</span>
                <Input
                  type="number"
                  value={revenueMax}
                  onChange={(e) => setRevenueMax(e.target.value)}
                  placeholder="Max ($)"
                  className="w-full"
                />
              </div>
            </div>
          </FormSection>

          {/* ---- Persona Filters ---- */}
          <FormSection icon={Users} title="Persona Filters">
            <MultiChipPicker
              label="Seniority Levels"
              options={SENIORITY_LEVELS}
              selected={seniorityLevels}
              onToggle={(v) => setSeniorityLevels((prev) => toggleArray(prev, v))}
            />

            <MultiChipPicker
              label="Departments"
              options={DEPARTMENTS}
              selected={departments}
              onToggle={(v) => setDepartments((prev) => toggleArray(prev, v))}
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-[#64748B] dark:text-gray-400">Title Keywords</Label>
                <Select value={titleSearchMode} onValueChange={(v) => setTitleSearchMode(v as 'smart' | 'exact' | 'any')}>
                  <SelectTrigger className="h-7 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="smart">Smart</SelectItem>
                    <SelectItem value="exact">Exact</SelectItem>
                    <SelectItem value="any">Any</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <TagInput
                label=""
                tags={titleKeywords}
                onAdd={(t) => setTitleKeywords((prev) => [...prev, t])}
                onRemove={(t) => setTitleKeywords((prev) => prev.filter((v) => v !== t))}
                placeholder="e.g. CTO, VP Engineering, Head of Product..."
              />
            </div>
          </FormSection>

          {/* ---- Geography ---- */}
          <FormSection icon={MapPin} title="Geography" defaultOpen={false}>
            <TagInput
              label="Countries"
              tags={countries}
              onAdd={(t) => setCountries((prev) => [...prev, t])}
              onRemove={(t) => setCountries((prev) => prev.filter((v) => v !== t))}
              placeholder="e.g. United States, United Kingdom..."
            />

            <TagInput
              label="Regions / States"
              tags={regions}
              onAdd={(t) => setRegions((prev) => [...prev, t])}
              onRemove={(t) => setRegions((prev) => prev.filter((v) => v !== t))}
              placeholder="e.g. California, London..."
            />

            <TagInput
              label="Cities"
              tags={cities}
              onAdd={(t) => setCities((prev) => [...prev, t])}
              onRemove={(t) => setCities((prev) => prev.filter((v) => v !== t))}
              placeholder="e.g. San Francisco, New York..."
            />
          </FormSection>

          {/* ---- Technographic ---- */}
          <FormSection icon={Cpu} title="Technographic" defaultOpen={false}>
            <TagInput
              label="Technology Keywords"
              tags={technologyKeywords}
              onAdd={(t) => setTechnologyKeywords((prev) => [...prev, t])}
              onRemove={(t) => setTechnologyKeywords((prev) => prev.filter((v) => v !== t))}
              placeholder="e.g. React, Salesforce, AWS..."
            />

            <TagInput
              label="Custom Keywords"
              tags={customKeywords}
              onAdd={(t) => setCustomKeywords((prev) => [...prev, t])}
              onRemove={(t) => setCustomKeywords((prev) => prev.filter((v) => v !== t))}
              placeholder="e.g. remote-first, B2B, enterprise..."
            />
          </FormSection>
        </div>

        {/* ---- Validation hint ---- */}
        {name.trim().length > 0 && !hasAnyCriteria() && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Add at least one filter criterion to save this profile.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || isSaving}>
            {isSaving ? 'Saving...' : isEditing ? 'Update Profile' : 'Create Profile'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
