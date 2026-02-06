/**
 * SequenceSimulator Component
 *
 * Simulation panel for testing agent sequences with mock or live data.
 * Shows step-by-step execution progress and results.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Play,
  Square,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Database,
  Edit3,
  Code2,
  AlertCircle,
  Search,
  User,
  X,
  Video,
  Building2,
  Briefcase,
  Eye,
  Code,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useQuery } from '@tanstack/react-query';
import { useSequenceExecution, DEFAULT_MOCK_DATA } from '@/lib/hooks/useSequenceExecution';
import { useLeads } from '@/lib/hooks/useLeads';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/clientV2';
import type { AgentSequence, StepResult } from '@/lib/hooks/useAgentSequences';
import type { LeadWithPrep } from '@/lib/services/leadService';
import { SkillOutputRenderer } from './SkillOutputRenderer';

// =============================================================================
// Meeting with Transcript Type
// =============================================================================

interface MeetingWithTranscript {
  id: string;
  title: string | null;
  meeting_start: string | null;
  meeting_end: string | null;
  summary: string | null;
  transcript_text: string | null;
  company_id: string | null;
  primary_contact_id: string | null;
  companies?: { name: string } | null;
}

interface DealWithDetails {
  id: string;
  name: string;
  stage: string | null;
  value: number | null;
  currency: string | null;
  close_date: string | null;
  companies?: { name: string } | null;
}

// =============================================================================
// Types
// =============================================================================

interface SequenceSimulatorProps {
  sequence: AgentSequence;
  className?: string;
}

interface InputField {
  name: string;
  required: boolean;
  placeholder?: string;
  description?: string;
}

// Field names that indicate transcript input is needed
const TRANSCRIPT_FIELD_NAMES = ['transcript', 'transcript_text', 'meeting_transcript', 'meeting_id'];

// Field names that indicate deal input is needed
const DEAL_FIELD_NAMES = ['deal_id', 'deal', 'opportunity_id'];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract all input variables from sequence steps' input_mapping
 * Looks for patterns like ${trigger.params.X} and returns unique field names
 */
function extractInputVariables(sequence: AgentSequence): InputField[] {
  const requiredFields = new Set<string>(sequence.frontmatter.requires_context || []);
  const allFields = new Set<string>();

  // Add required fields first
  requiredFields.forEach((field) => allFields.add(field));

  // Scan all steps for input_mapping variables
  const steps = sequence.frontmatter.sequence_steps || [];
  for (const step of steps) {
    const inputMapping = step.input_mapping || {};
    for (const [, sourceExpr] of Object.entries(inputMapping)) {
      if (typeof sourceExpr !== 'string') continue;

      // Match ${trigger.params.X} patterns
      const match = sourceExpr.match(/\$\{trigger\.params\.(\w+)\}/);
      if (match) {
        allFields.add(match[1]);
      }
    }
  }

  // Convert to InputField array with required info
  return Array.from(allFields).map((name) => ({
    name,
    required: requiredFields.has(name),
    placeholder: getFieldPlaceholder(name),
    description: getFieldDescription(name),
  }));
}

/**
 * Get placeholder text for common field names
 */
function getFieldPlaceholder(name: string): string {
  const placeholders: Record<string, string> = {
    email: 'lead@company.com',
    name: 'John Doe',
    source: 'SavvyCal',
    domain: 'company.com',
    website: 'https://company.com',
    company_name: 'Acme Inc',
    phone: '+1 555 123 4567',
    title: 'Sales Director',
    linkedin_url: 'https://linkedin.com/in/johndoe',
  };
  return placeholders[name] || '';
}

/**
 * Get description for common field names
 */
function getFieldDescription(name: string): string {
  const descriptions: Record<string, string> = {
    email: 'Email address of the lead',
    name: 'Full name of the contact',
    source: 'Where the lead came from',
    domain: 'Company domain (e.g., company.com)',
    website: 'Company website URL',
    company_name: 'Company name',
    phone: 'Phone number',
    title: 'Job title',
    linkedin_url: 'LinkedIn profile URL',
  };
  return descriptions[name] || '';
}

// =============================================================================
// Lead Picker Component
// =============================================================================

interface LeadPickerProps {
  leads: LeadWithPrep[];
  isLoading: boolean;
  selectedLead: LeadWithPrep | null;
  onSelect: (lead: LeadWithPrep | null) => void;
}

function LeadPicker({ leads, isLoading, selectedLead, onSelect }: LeadPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Filter leads by search term (email or name)
  const filteredLeads = useMemo(() => {
    if (!search.trim()) {
      return leads.slice(0, 20); // Show first 20 when no search
    }
    const searchLower = search.toLowerCase();
    return leads
      .filter((lead) => {
        const email = lead.contact_email?.toLowerCase() || '';
        const name = lead.contact_name?.toLowerCase() || '';
        const firstName = lead.contact_first_name?.toLowerCase() || '';
        const lastName = lead.contact_last_name?.toLowerCase() || '';
        return (
          email.includes(searchLower) ||
          name.includes(searchLower) ||
          firstName.includes(searchLower) ||
          lastName.includes(searchLower)
        );
      })
      .slice(0, 20);
  }, [leads, search]);

  const getLeadDisplayName = (lead: LeadWithPrep) => {
    if (lead.contact_name) return lead.contact_name;
    if (lead.contact_first_name || lead.contact_last_name) {
      return [lead.contact_first_name, lead.contact_last_name].filter(Boolean).join(' ');
    }
    return lead.contact_email || 'Unknown';
  };

  const handleSelect = (lead: LeadWithPrep) => {
    onSelect(lead);
    setOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Quick fill from existing lead</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-9 text-sm font-normal"
          >
            {selectedLead ? (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <User className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="truncate">{getLeadDisplayName(selectedLead)}</span>
                {selectedLead.contact_email && (
                  <span className="text-muted-foreground truncate">
                    ({selectedLead.contact_email})
                  </span>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground">Search leads...</span>
            )}
            {selectedLead ? (
              <X
                className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={handleClear}
              />
            ) : (
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <div className="p-2 border-b">
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8"
              autoFocus
            />
          </div>
          <div className="max-h-[250px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {search ? 'No leads found' : 'No leads available'}
              </div>
            ) : (
              <div className="py-1">
                {filteredLeads.map((lead) => (
                  <button
                    key={lead.id}
                    onClick={() => handleSelect(lead)}
                    className={cn(
                      'w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors',
                      selectedLead?.id === lead.id && 'bg-muted'
                    )}
                  >
                    <User className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {getLeadDisplayName(lead)}
                      </div>
                      {lead.contact_email && (
                        <div className="text-xs text-muted-foreground truncate">
                          {lead.contact_email}
                        </div>
                      )}
                      {(lead.domain || lead.external_source) && (
                        <div className="text-xs text-muted-foreground truncate">
                          {[lead.domain, lead.external_source].filter(Boolean).join(' • ')}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// =============================================================================
// Meeting Picker Component
// =============================================================================

interface MeetingPickerProps {
  meetings: MeetingWithTranscript[];
  isLoading: boolean;
  selectedMeeting: MeetingWithTranscript | null;
  onSelect: (meeting: MeetingWithTranscript | null) => void;
}

function MeetingPicker({ meetings, isLoading, selectedMeeting, onSelect }: MeetingPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Filter meetings by search term (title or company name)
  const filteredMeetings = useMemo(() => {
    if (!search.trim()) {
      return meetings.slice(0, 20);
    }
    const searchLower = search.toLowerCase();
    return meetings
      .filter((meeting) => {
        const title = meeting.title?.toLowerCase() || '';
        const companyName = meeting.companies?.name?.toLowerCase() || '';
        return title.includes(searchLower) || companyName.includes(searchLower);
      })
      .slice(0, 20);
  }, [meetings, search]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleSelect = (meeting: MeetingWithTranscript) => {
    onSelect(meeting);
    setOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Select meeting with transcript</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-9 text-sm font-normal"
          >
            {selectedMeeting ? (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Video className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="truncate">{selectedMeeting.title || 'Untitled Meeting'}</span>
                {selectedMeeting.meeting_start && (
                  <span className="text-muted-foreground truncate">
                    ({formatDate(selectedMeeting.meeting_start)})
                  </span>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground">Search meetings...</span>
            )}
            {selectedMeeting ? (
              <X
                className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={handleClear}
              />
            ) : (
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <div className="p-2 border-b">
            <Input
              placeholder="Search by title or company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8"
              autoFocus
            />
          </div>
          <div className="max-h-[250px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : filteredMeetings.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {search ? 'No meetings found' : 'No meetings with transcripts'}
              </div>
            ) : (
              <div className="py-1">
                {filteredMeetings.map((meeting) => (
                  <button
                    key={meeting.id}
                    onClick={() => handleSelect(meeting)}
                    className={cn(
                      'w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors',
                      selectedMeeting?.id === meeting.id && 'bg-muted'
                    )}
                  >
                    <Video className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {meeting.title || 'Untitled Meeting'}
                      </div>
                      {meeting.meeting_start && (
                        <div className="text-xs text-muted-foreground">
                          {formatDate(meeting.meeting_start)}
                        </div>
                      )}
                      {meeting.companies?.name && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                          <Building2 className="h-3 w-3" />
                          {meeting.companies.name}
                        </div>
                      )}
                      {meeting.transcript_text && (
                        <div className="text-xs text-green-600 mt-0.5">
                          ✓ Transcript available
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// =============================================================================
// Deal Picker Component
// =============================================================================

interface DealPickerProps {
  deals: DealWithDetails[];
  isLoading: boolean;
  selectedDeal: DealWithDetails | null;
  onSelect: (deal: DealWithDetails | null) => void;
}

function DealPicker({ deals, isLoading, selectedDeal, onSelect }: DealPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Filter deals by search term (name or company name)
  const filteredDeals = useMemo(() => {
    if (!search.trim()) {
      return deals.slice(0, 20);
    }
    const searchLower = search.toLowerCase();
    return deals
      .filter((deal) => {
        const name = deal.name?.toLowerCase() || '';
        const companyName = deal.companies?.name?.toLowerCase() || '';
        const stage = deal.stage?.toLowerCase() || '';
        return name.includes(searchLower) || companyName.includes(searchLower) || stage.includes(searchLower);
      })
      .slice(0, 20);
  }, [deals, search]);

  const formatCurrency = (value: number | null, currency: string | null) => {
    if (value === null) return '';
    const curr = currency || 'USD';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleSelect = (deal: DealWithDetails) => {
    onSelect(deal);
    setOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Select deal</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-9 text-sm font-normal"
          >
            {selectedDeal ? (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Briefcase className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="truncate">{selectedDeal.name}</span>
                {selectedDeal.value !== null && (
                  <span className="text-muted-foreground truncate">
                    ({formatCurrency(selectedDeal.value, selectedDeal.currency)})
                  </span>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground">Search deals...</span>
            )}
            {selectedDeal ? (
              <X
                className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={handleClear}
              />
            ) : (
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <div className="p-2 border-b">
            <Input
              placeholder="Search by name, company, or stage..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8"
              autoFocus
            />
          </div>
          <div className="max-h-[250px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : filteredDeals.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {search ? 'No deals found' : 'No deals available'}
              </div>
            ) : (
              <div className="py-1">
                {filteredDeals.map((deal) => (
                  <button
                    key={deal.id}
                    onClick={() => handleSelect(deal)}
                    className={cn(
                      'w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors',
                      selectedDeal?.id === deal.id && 'bg-muted'
                    )}
                  >
                    <Briefcase className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {deal.name}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {deal.stage && (
                          <span className="px-1.5 py-0.5 bg-muted rounded text-xs">
                            {deal.stage}
                          </span>
                        )}
                        {deal.value !== null && (
                          <span>{formatCurrency(deal.value, deal.currency)}</span>
                        )}
                      </div>
                      {deal.companies?.name && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                          <Building2 className="h-3 w-3" />
                          {deal.companies.name}
                        </div>
                      )}
                      {deal.close_date && (
                        <div className="text-xs text-muted-foreground">
                          Close: {formatDate(deal.close_date)}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// =============================================================================
// Step Result Display
// =============================================================================

interface StepResultDisplayProps {
  result: StepResult;
  index: number;
}

/**
 * Extract renderable content from skill output
 * Returns markdown/text content if found, otherwise null
 */
function extractRenderableContent(output: unknown): string | null {
  if (!output) return null;

  // If output is already a string, it might be markdown
  if (typeof output === 'string') {
    // Check if it looks like markdown (has headers, lists, or significant formatting)
    if (output.includes('#') || output.includes('*') || output.includes('-') || output.length > 100) {
      return output;
    }
    return null;
  }

  // If output is an object, look for common content fields
  if (typeof output === 'object' && output !== null) {
    const obj = output as Record<string, unknown>;

    // Priority fields that typically contain rendered content
    const contentFields = ['analysis', 'content', 'summary', 'report', 'output', 'text', 'markdown'];

    for (const field of contentFields) {
      if (typeof obj[field] === 'string' && (obj[field] as string).length > 50) {
        return obj[field] as string;
      }
    }
  }

  return null;
}

function StepResultDisplay({ result, index }: StepResultDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [outputView, setOutputView] = useState<'rendered' | 'raw'>('rendered');

  const statusIcon = {
    pending: <Clock className="h-4 w-4 text-muted-foreground" />,
    running: <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />,
    completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    failed: <XCircle className="h-4 w-4 text-red-500" />,
    skipped: <Clock className="h-4 w-4 text-muted-foreground" />,
  };

  const statusColor = {
    pending: 'border-muted',
    running: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20',
    completed: 'border-green-500 bg-green-50 dark:bg-green-950/20',
    failed: 'border-red-500 bg-red-50 dark:bg-red-950/20',
    skipped: 'border-muted',
  };

  // Check if output has renderable content
  const renderableContent = extractRenderableContent(result.output);
  const hasRenderableContent = renderableContent !== null;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div
        className={cn(
          'rounded-lg border p-3 transition-colors',
          statusColor[result.status]
        )}
      >
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-3 text-left">
            {statusIcon[result.status]}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Step {index + 1}</span>
                <code className="text-xs text-muted-foreground">{result.skill_key}</code>
              </div>
              {result.duration_ms && (
                <span className="text-xs text-muted-foreground">
                  {result.duration_ms}ms
                </span>
              )}
            </div>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-3 space-y-2 text-sm">
            {/* Input */}
            {Object.keys(result.input).length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">Input</Label>
                <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto max-h-[200px]">
                  {JSON.stringify(result.input, null, 2)}
                </pre>
              </div>
            )}

            {/* Output */}
            {result.output && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs text-muted-foreground">Output</Label>
                  {hasRenderableContent && (
                    <div className="flex bg-muted rounded-md p-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOutputView('rendered');
                        }}
                        className={cn(
                          'px-2 py-0.5 text-xs font-medium rounded transition-colors flex items-center gap-1',
                          outputView === 'rendered'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Eye className="w-3 h-3" />
                        Rendered
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOutputView('raw');
                        }}
                        className={cn(
                          'px-2 py-0.5 text-xs font-medium rounded transition-colors flex items-center gap-1',
                          outputView === 'raw'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Code className="w-3 h-3" />
                        Raw
                      </button>
                    </div>
                  )}
                </div>
                {hasRenderableContent && outputView === 'rendered' ? (
                  <div className="mt-1 p-3 bg-background border rounded-lg overflow-auto max-h-[400px]">
                    <SkillOutputRenderer content={renderableContent} />
                  </div>
                ) : (
                  <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto max-h-[300px]">
                    {JSON.stringify(result.output, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {/* Error */}
            {result.error && (
              <div>
                <Label className="text-xs text-red-600">Error</Label>
                <pre className="mt-1 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-400">
                  {result.error}
                </pre>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function SequenceSimulator({ sequence, className }: SequenceSimulatorProps) {
  const [isSimulation, setIsSimulation] = useState(true);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [inputContextJson, setInputContextJson] = useState('{}');
  const [mockDataJson, setMockDataJson] = useState(
    JSON.stringify(DEFAULT_MOCK_DATA, null, 2)
  );
  const [showMockEditor, setShowMockEditor] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<LeadWithPrep | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingWithTranscript | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<DealWithDetails | null>(null);

  // Auth for user-scoped queries
  const { user } = useAuth();

  // Fetch leads for the picker
  const { data: leads = [], isLoading: leadsLoading } = useLeads();

  // Fetch meetings with transcripts for the picker
  const { data: meetingsWithTranscripts = [], isLoading: meetingsLoading } = useQuery({
    queryKey: ['meetings-with-transcripts', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('meetings')
        .select(`
          id,
          title,
          meeting_start,
          meeting_end,
          summary,
          transcript_text,
          company_id,
          primary_contact_id,
          companies:company_id (name)
        `)
        .eq('owner_user_id', user.id)
        .not('transcript_text', 'is', null)
        .order('meeting_start', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching meetings with transcripts:', error);
        return [];
      }
      return (data || []) as MeetingWithTranscript[];
    },
    enabled: !!user?.id,
  });

  // Fetch deals for the picker
  const { data: dealsWithDetails = [], isLoading: dealsLoading } = useQuery({
    queryKey: ['deals-for-picker', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('deals')
        .select(`
          id,
          name,
          stage,
          value,
          currency,
          close_date,
          companies:company_id (name)
        `)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching deals:', error);
        return [];
      }
      return (data || []) as DealWithDetails[];
    },
    enabled: !!user?.id,
  });

  // Extract input fields from sequence
  const inputFields = useMemo(() => extractInputVariables(sequence), [sequence]);

  // Detect if sequence needs transcript input
  const hasTranscriptField = useMemo(() => {
    return inputFields.some((field) =>
      TRANSCRIPT_FIELD_NAMES.some((tf) => field.name.toLowerCase().includes(tf))
    );
  }, [inputFields]);

  // Detect if sequence needs deal input
  const hasDealField = useMemo(() => {
    return inputFields.some((field) =>
      DEAL_FIELD_NAMES.some((df) => field.name.toLowerCase().includes(df))
    );
  }, [inputFields]);

  // Form state for input fields
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => {
    // Initialize with empty values for all fields
    const initial: Record<string, string> = {};
    inputFields.forEach((field) => {
      initial[field.name] = '';
    });
    return initial;
  });

  const execution = useSequenceExecution();

  // Parse JSON safely
  const parseJson = useCallback((json: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(json);
      setJsonError(null);
      return parsed;
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'Invalid JSON');
      return null;
    }
  }, []);

  // Sync form values to JSON
  const syncFormToJson = useCallback(() => {
    const context: Record<string, string> = {};
    for (const [key, value] of Object.entries(fieldValues)) {
      if (value.trim()) {
        context[key] = value.trim();
      }
    }
    setInputContextJson(JSON.stringify(context, null, 2));
  }, [fieldValues]);

  // Handle field value change
  const handleFieldChange = useCallback((name: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Handle lead selection - populate form fields from lead data
  const handleLeadSelect = useCallback((lead: LeadWithPrep | null) => {
    setSelectedLead(lead);
    if (lead) {
      setFieldValues((prev) => {
        const updated = { ...prev };
        // Map lead fields to input fields
        if (lead.contact_email) updated.email = lead.contact_email;
        if (lead.contact_name) {
          updated.name = lead.contact_name;
        } else if (lead.contact_first_name || lead.contact_last_name) {
          updated.name = [lead.contact_first_name, lead.contact_last_name].filter(Boolean).join(' ');
        }
        if (lead.external_source) updated.source = lead.external_source;
        if (lead.domain) updated.domain = lead.domain;
        return updated;
      });
    }
  }, []);

  // Handle meeting selection - populate transcript fields from meeting data
  const handleMeetingSelect = useCallback((meeting: MeetingWithTranscript | null) => {
    setSelectedMeeting(meeting);
    if (meeting) {
      setFieldValues((prev) => {
        const updated = { ...prev };
        // Map meeting fields to input fields (check for various transcript field names)
        for (const field of inputFields) {
          const fieldNameLower = field.name.toLowerCase();
          if (fieldNameLower.includes('transcript') && meeting.transcript_text) {
            updated[field.name] = meeting.transcript_text;
          } else if (fieldNameLower === 'meeting_id') {
            updated[field.name] = meeting.id;
          } else if (fieldNameLower === 'summary' && meeting.summary) {
            updated[field.name] = meeting.summary;
          }
        }
        return updated;
      });
    }
  }, [inputFields]);

  // Handle deal selection - populate deal_id fields from deal data
  const handleDealSelect = useCallback((deal: DealWithDetails | null) => {
    setSelectedDeal(deal);
    if (deal) {
      setFieldValues((prev) => {
        const updated = { ...prev };
        // Map deal fields to input fields (check for various deal field names)
        for (const field of inputFields) {
          const fieldNameLower = field.name.toLowerCase();
          if (DEAL_FIELD_NAMES.some((df) => fieldNameLower.includes(df))) {
            updated[field.name] = deal.id;
          }
        }
        return updated;
      });
    }
  }, [inputFields]);

  // Validate required fields
  const missingRequiredFields = useMemo(() => {
    return inputFields
      .filter((field) => field.required && !fieldValues[field.name]?.trim())
      .map((field) => field.name);
  }, [inputFields, fieldValues]);

  // Build input context from form fields
  const buildInputContext = useCallback((): Record<string, unknown> => {
    if (showJsonEditor) {
      return parseJson(inputContextJson) || {};
    }

    const context: Record<string, string> = {};
    for (const [key, value] of Object.entries(fieldValues)) {
      if (value.trim()) {
        context[key] = value.trim();
      }
    }
    return context;
  }, [showJsonEditor, inputContextJson, fieldValues, parseJson]);

  // Handle run simulation
  const handleRun = useCallback(async () => {
    const inputContext = buildInputContext();

    // In live mode, only require input context if the sequence has required fields
    // Sequences that don't reference trigger.params can run with empty context
    const hasRequiredFields = inputFields.some(f => f.required);
    if (!isSimulation && hasRequiredFields && (!inputContext || Object.keys(inputContext).length === 0)) {
      setJsonError('Live mode requires input context. Please fill in the required fields.');
      return;
    }

    const mockData = isSimulation ? parseJson(mockDataJson) : undefined;
    if (isSimulation && !mockData) return;

    // Clear any previous errors
    setJsonError(null);

    try {
      await execution.execute(sequence, {
        isSimulation,
        inputContext,
        mockData,
        // For live mode, use backend execution which supports both skills and actions
        useLiveBackend: !isSimulation,
        onStepStart: (index) => {
          console.log(`[Simulator] Step ${index + 1} started`);
        },
        onStepComplete: (index, result) => {
          console.log(`[Simulator] Step ${index + 1} completed`, result);
        },
        onStepFailed: (index, error) => {
          console.log(`[Simulator] Step ${index + 1} failed:`, error);
        },
      });
    } catch (error) {
      console.error('[Simulator] Execution error:', error);
    }
  }, [sequence, isSimulation, buildInputContext, mockDataJson, parseJson, execution, inputFields]);

  // Handle stop
  const handleStop = useCallback(() => {
    execution.cancel();
  }, [execution]);

  // Handle reset
  const handleReset = useCallback(() => {
    execution.reset();
    setJsonError(null);
  }, [execution]);

  // Check if all steps have valid skill keys or actions
  const stepsWithSkillsOrActions = sequence.frontmatter.sequence_steps?.filter(s => s.skill_key || s.action) || [];
  const hasValidSteps = stepsWithSkillsOrActions.length > 0;
  const totalSteps = sequence.frontmatter.sequence_steps?.length || 0;
  const missingSkillCount = totalSteps - stepsWithSkillsOrActions.length;

  // In mock mode, allow running without required fields (mock data will be used)
  // In live mode, require all required fields to be filled
  const canRun =
    !execution.isExecuting &&
    hasValidSteps &&
    !jsonError &&
    (isSimulation || showJsonEditor || missingRequiredFields.length === 0);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="p-4 border-b space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Simulation</h3>
          <div className="flex items-center gap-2">
            <Label htmlFor="simulation-mode" className="text-sm text-muted-foreground">
              Mode:
            </Label>
            <div className="flex items-center gap-2 rounded-lg border p-1">
              <button
                onClick={() => setIsSimulation(true)}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors',
                  isSimulation
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Mock
              </button>
              <button
                onClick={() => setIsSimulation(false)}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors',
                  !isSimulation
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <Database className="h-3.5 w-3.5" />
                Live
              </button>
            </div>
          </div>
        </div>

        {/* Input Fields Form */}
        {!showJsonEditor && inputFields.length > 0 && (
          <div className="space-y-3">
            {/* Lead Picker - quick fill from existing leads */}
            <LeadPicker
              leads={leads}
              isLoading={leadsLoading}
              selectedLead={selectedLead}
              onSelect={handleLeadSelect}
            />

            {/* Meeting Picker - for sequences that need transcript input */}
            {hasTranscriptField && (
              <MeetingPicker
                meetings={meetingsWithTranscripts}
                isLoading={meetingsLoading}
                selectedMeeting={selectedMeeting}
                onSelect={handleMeetingSelect}
              />
            )}

            {/* Deal Picker - for sequences that need deal input */}
            {hasDealField && (
              <DealPicker
                deals={dealsWithDetails}
                isLoading={dealsLoading}
                selectedDeal={selectedDeal}
                onSelect={handleDealSelect}
              />
            )}

            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Input Context</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => {
                  syncFormToJson();
                  setShowJsonEditor(true);
                }}
              >
                <Code2 className="h-3 w-3" />
                Edit JSON
              </Button>
            </div>

            <div className="space-y-3">
              {inputFields.map((field) => (
                <div key={field.name} className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    {field.name}
                    {field.required && (
                      <span className="text-red-500">*</span>
                    )}
                    {!field.required && (
                      <span className="text-muted-foreground">(optional)</span>
                    )}
                  </Label>
                  <Input
                    value={fieldValues[field.name] || ''}
                    onChange={(e) => handleFieldChange(field.name, e.target.value)}
                    placeholder={field.placeholder}
                    className={cn(
                      'h-8 text-sm',
                      field.required && !fieldValues[field.name]?.trim() && 'border-orange-300'
                    )}
                  />
                  {field.description && (
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Missing required fields warning */}
            {missingRequiredFields.length > 0 && (
              <div className="flex items-start gap-2 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-700">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  Required: {missingRequiredFields.join(', ')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* JSON Editor (collapsible when form is shown) */}
        {showJsonEditor && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Input Context (JSON)</Label>
              {inputFields.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => setShowJsonEditor(false)}
                >
                  <Edit3 className="h-3 w-3" />
                  Use Form
                </Button>
              )}
            </div>
            <Textarea
              value={inputContextJson}
              onChange={(e) => {
                setInputContextJson(e.target.value);
                parseJson(e.target.value);
              }}
              placeholder='{ "email": "example@company.com" }'
              className="font-mono text-xs h-24"
            />
          </div>
        )}

        {/* Fallback: Show JSON editor if no fields extracted */}
        {!showJsonEditor && inputFields.length === 0 && (
          <div className="space-y-2">
            <Label className="text-sm">Input Context (JSON)</Label>
            <Textarea
              value={inputContextJson}
              onChange={(e) => {
                setInputContextJson(e.target.value);
                parseJson(e.target.value);
              }}
              placeholder='{ "email": "example@company.com" }'
              className="font-mono text-xs h-20"
            />
          </div>
        )}

        {/* Mock Data Editor (only in simulation mode) */}
        {isSimulation && (
          <Collapsible open={showMockEditor} onOpenChange={setShowMockEditor}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 w-full justify-start">
                <Edit3 className="h-3.5 w-3.5" />
                {showMockEditor ? 'Hide' : 'Edit'} Mock Data
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Textarea
                value={mockDataJson}
                onChange={(e) => {
                  setMockDataJson(e.target.value);
                  parseJson(e.target.value);
                }}
                className="mt-2 font-mono text-xs h-48"
              />
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Error Message */}
        {jsonError && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            JSON Error: {jsonError}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {execution.isExecuting ? (
            <Button onClick={handleStop} variant="destructive" className="gap-2 flex-1">
              <Square className="h-4 w-4" />
              Stop
            </Button>
          ) : (
            <Button onClick={handleRun} disabled={!canRun} className="gap-2 flex-1">
              <Play className="h-4 w-4" />
              Run {isSimulation ? 'Simulation' : 'Live'}
            </Button>
          )}
          <Button onClick={handleReset} variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Status Messages */}
        {!canRun && !execution.isExecuting && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
            {totalSteps === 0 ? (
              <span>Add at least one step to run the simulation.</span>
            ) : missingSkillCount > 0 ? (
              <span>
                {missingSkillCount} step{missingSkillCount > 1 ? 's' : ''} need{missingSkillCount === 1 ? 's' : ''} a skill or action.
              </span>
            ) : jsonError ? (
              <span>{jsonError}</span>
            ) : !isSimulation && missingRequiredFields.length > 0 ? (
              <span>Fill in required fields for live mode.</span>
            ) : null}
          </div>
        )}
      </div>

      {/* Results */}
      <ScrollArea className="flex-1 p-4">
        {execution.stepResults.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <p>Click "Run" to test the sequence.</p>
            <p className="mt-2 text-xs">
              {isSimulation
                ? 'Mock mode uses simulated data.'
                : 'Live mode executes against your database.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {execution.stepResults.map((result, index) => (
              <StepResultDisplay key={index} result={result} index={index} />
            ))}

            {/* Final Status */}
            {(execution.status === 'completed' || execution.status === 'failed') && (
              <div
                className={cn(
                  'mt-4 p-4 rounded-lg border',
                  execution.status === 'completed'
                    ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  {execution.status === 'completed' ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  )}
                  <span
                    className={cn(
                      'font-semibold',
                      execution.status === 'completed'
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-red-700 dark:text-red-300'
                    )}
                  >
                    {execution.status === 'completed'
                      ? 'Sequence Completed'
                      : 'Sequence Failed'}
                  </span>
                </div>

                {execution.error && (
                  <p className="text-sm text-red-700 dark:text-red-400">{execution.error}</p>
                )}

                {execution.status === 'completed' && Object.keys(execution.context).length > 0 && (
                  <div className="mt-3">
                    <Label className="text-xs text-muted-foreground">Final Context</Label>
                    <pre className="mt-1 p-2 bg-background border rounded text-xs overflow-x-auto max-h-48">
                      {JSON.stringify(execution.context, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export default SequenceSimulator;
