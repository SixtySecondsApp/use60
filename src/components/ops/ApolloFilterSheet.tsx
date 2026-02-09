import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Loader2, RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import type { ApolloSearchParams } from '@/lib/services/apolloSearchService';
import { ApolloFilterEditor } from './ApolloFilterEditor';

interface ApolloFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string;
  currentSourceQuery: ApolloSearchParams;
  onSaved: () => void;
}

export function ApolloFilterSheet({
  open,
  onOpenChange,
  tableId,
  currentSourceQuery,
  onSaved,
}: ApolloFilterSheetProps) {
  // Local filter state initialized from source_query
  const [titles, setTitles] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [keywords, setKeywords] = useState('');
  const [seniorities, setSeniorities] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [employeeRanges, setEmployeeRanges] = useState<string[]>([]);
  const [fundingStages, setFundingStages] = useState<string[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [emailStatusVerified, setEmailStatusVerified] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Populate from source_query when sheet opens
  useEffect(() => {
    if (open && currentSourceQuery) {
      setTitles(currentSourceQuery.person_titles || []);
      setLocations(currentSourceQuery.person_locations || []);
      setKeywords(currentSourceQuery.q_keywords || '');
      setSeniorities(currentSourceQuery.person_seniorities || []);
      setDepartments(currentSourceQuery.person_departments || []);
      setEmployeeRanges(currentSourceQuery.organization_num_employees_ranges || []);
      setFundingStages(currentSourceQuery.organization_latest_funding_stage_cd || []);
      setDomains(currentSourceQuery.q_organization_domains || []);
      setEmailStatusVerified(currentSourceQuery.contact_email_status?.includes('verified') ?? false);
    }
  }, [open, currentSourceQuery]);

  const buildSearchParams = (): ApolloSearchParams => {
    const params: ApolloSearchParams = {};
    if (titles.length) params.person_titles = titles;
    if (locations.length) params.person_locations = locations;
    if (keywords.trim()) params.q_keywords = keywords.trim();
    if (seniorities.length) params.person_seniorities = seniorities;
    if (departments.length) params.person_departments = departments;
    if (employeeRanges.length) params.organization_num_employees_ranges = employeeRanges;
    if (fundingStages.length) params.organization_latest_funding_stage_cd = fundingStages;
    if (domains.length) params.q_organization_domains = domains;
    if (emailStatusVerified) params.contact_email_status = ['verified'];
    return params;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const newQuery = buildSearchParams();
      const { error } = await supabase
        .from('dynamic_tables')
        .update({
          source_query: newQuery,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tableId);

      if (error) throw error;

      toast.success('Filters saved');
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to save filters');
      console.error('[ApolloFilterSheet] Save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setTitles(currentSourceQuery.person_titles || []);
    setLocations(currentSourceQuery.person_locations || []);
    setKeywords(currentSourceQuery.q_keywords || '');
    setSeniorities(currentSourceQuery.person_seniorities || []);
    setDepartments(currentSourceQuery.person_departments || []);
    setEmployeeRanges(currentSourceQuery.organization_num_employees_ranges || []);
    setFundingStages(currentSourceQuery.organization_latest_funding_stage_cd || []);
    setDomains(currentSourceQuery.q_organization_domains || []);
    setEmailStatusVerified(currentSourceQuery.contact_email_status?.includes('verified') ?? false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] bg-zinc-900 border-zinc-700 text-white overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-white flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-purple-400" />
            Apollo Search Filters
          </SheetTitle>
          <p className="text-xs text-zinc-500">
            Edit filters for future data collection. Changes won't affect existing rows.
          </p>
        </SheetHeader>

        <div className="mt-6">
          <ApolloFilterEditor
            titles={titles}
            onTitlesChange={setTitles}
            locations={locations}
            onLocationsChange={setLocations}
            keywords={keywords}
            onKeywordsChange={setKeywords}
            seniorities={seniorities}
            onSenioritiesChange={setSeniorities}
            departments={departments}
            onDepartmentsChange={setDepartments}
            employeeRanges={employeeRanges}
            onEmployeeRangesChange={setEmployeeRanges}
            fundingStages={fundingStages}
            onFundingStagesChange={setFundingStages}
            domains={domains}
            onDomainsChange={setDomains}
            emailStatusVerified={emailStatusVerified}
            onEmailStatusChange={setEmailStatusVerified}
            showAdvancedDefault
          />
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-zinc-700/50 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="gap-1.5 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="gap-1.5 bg-purple-600 hover:bg-purple-500 text-white"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {isSaving ? 'Saving...' : 'Save Filters'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
