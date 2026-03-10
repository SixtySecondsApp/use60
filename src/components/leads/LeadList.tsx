import type { LeadWithPrep } from '@/lib/services/leadService';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useCompanyLogo } from '@/lib/hooks/useCompanyLogo';
import { useState, useMemo, useEffect, useRef, useCallback, type KeyboardEvent, type MouseEvent } from 'react';
import { Calendar, Clock, User, Tag, RotateCw, Loader2, Search } from 'lucide-react';

type FilterType = 'all' | 'meeting_date' | 'booked_date';

interface LeadListProps {
  leads: LeadWithPrep[];
  selectedLeadId: string | null;
  onSelect: (leadId: string) => void;
  isLoading?: boolean;
  onReprocessLead?: (leadId: string) => Promise<void> | void;
  reprocessingLeadId?: string | null;
  isReprocessing?: boolean;
  filterType?: FilterType;
  onFilterTypeChange?: (filter: FilterType) => void;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

export function LeadList({
  leads,
  selectedLeadId,
  onSelect,
  isLoading,
  onReprocessLead,
  reprocessingLeadId,
  isReprocessing,
  filterType: externalFilterType,
  onFilterTypeChange: externalOnFilterTypeChange,
  searchQuery: externalSearchQuery,
  onSearchQueryChange: externalOnSearchQueryChange,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
}: LeadListProps) {
  // Use external props if provided, otherwise use internal state
  const [internalFilterType, setInternalFilterType] = useState<FilterType>('all');
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filterType = externalFilterType ?? internalFilterType;
  const searchQuery = externalSearchQuery ?? internalSearchQuery;
  
  const setFilterType = externalOnFilterTypeChange ?? setInternalFilterType;
  const setSearchQuery = externalOnSearchQueryChange ?? setInternalSearchQuery;

  const handleToggleSearch = () => {
    setIsSearchOpen((prev) => {
      if (prev) {
        setSearchQuery('');
      }
      return !prev;
    });
  };

  const handleSearchQueryChange = (value: string) => {
    setSearchQuery(value);
  };

  useEffect(() => {
    if (!isSearchOpen) return;

    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 150);

    return () => clearTimeout(timer);
  }, [isSearchOpen]);

  // If external filter props are provided, leads are already filtered/sorted - use as-is
  // Otherwise, apply internal filtering/sorting
  const sortedLeads = useMemo(() => {
    // If external props provided, leads are already filtered/sorted by parent
    if (externalFilterType !== undefined || externalSearchQuery !== undefined) {
      return leads;
    }

    // Internal filtering/sorting logic
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const matchesQuery = (lead: LeadWithPrep) => {
      if (!normalizedQuery) return true;

      const owner = lead.owner as { first_name: string | null; last_name: string | null; email: string | null } | null;
      const source = lead.source as { name: string | null; source_key: string | null } | null;
      const contact = lead.contact as {
        title: string | null;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      } | null;

      const values = [
        lead.contact_name,
        lead.contact_email,
        lead.domain,
        lead.meeting_title,
        lead.booking_link_name,
        lead.utm_source,
        lead.external_source,
        source?.name,
        source?.source_key,
        owner?.first_name,
        owner?.last_name,
        owner?.email,
        contact?.title,
        contact?.first_name,
        contact?.last_name,
        contact ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() : '',
      ];

      return values.some((value) => typeof value === 'string' && value.toLowerCase().includes(normalizedQuery));
    };

    const filtered = normalizedQuery ? leads.filter(matchesQuery) : [...leads];
    
    if (filterType === 'meeting_date') {
      return filtered.sort((a, b) => {
        const aDate = a.meeting_start ? new Date(a.meeting_start).getTime() : 0;
        const bDate = b.meeting_start ? new Date(b.meeting_start).getTime() : 0;
        return bDate - aDate; // Most recent first
      });
    }
    
    const getBookedDate = (lead: LeadWithPrep) =>
      lead.first_seen_at || lead.external_occured_at || lead.created_at || lead.meeting_start || null;

    if (filterType === 'booked_date') {
      return filtered.sort((a, b) => {
        const aDate = getBookedDate(a) ? new Date(getBookedDate(a) as string).getTime() : 0;
        const bDate = getBookedDate(b) ? new Date(getBookedDate(b) as string).getTime() : 0;
        return bDate - aDate; // Most recent first
      });
    }
    
    // Default: sort by booked date (first_seen/external)
    return filtered.sort((a, b) => {
      const aDate = getBookedDate(a) ? new Date(getBookedDate(a) as string).getTime() : 0;
      const bDate = getBookedDate(b) ? new Date(getBookedDate(b) as string).getTime() : 0;
      return bDate - aDate;
    });
  }, [leads, filterType, searchQuery, externalFilterType, externalSearchQuery]);

  const trimmedSearchQuery = searchQuery.trim();
  const showSearchEmptyState = Boolean(trimmedSearchQuery) && sortedLeads.length === 0;

  // Intersection observer for infinite scroll
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || !onLoadMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          onLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, onLoadMore, isLoadingMore]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
        Loading leads…
      </div>
    );
  }

  if (!leads.length) {
    return (
      <div className="flex flex-1 items-center justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
        No leads yet. Webhook-processing new SavvyCal bookings will populate this list.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
            Sort by:
            <button
              type="button"
              onClick={handleToggleSearch}
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-md border text-gray-500 transition-colors',
                isSearchOpen
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : 'border-gray-200 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800 dark:text-gray-300'
              )}
              aria-label={isSearchOpen ? 'Close lead search' : 'Search leads'}
              aria-pressed={isSearchOpen}
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setFilterType('all')}
              className={cn(
                'px-2 py-1 text-xs font-medium rounded-md transition-colors',
                filterType === 'all'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              )}
            >
              All
            </button>
            <button
              onClick={() => setFilterType('meeting_date')}
              className={cn(
                'px-2 py-1 text-xs font-medium rounded-md transition-colors',
                filterType === 'meeting_date'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              )}
            >
              Meeting Date
            </button>
            <button
              onClick={() => setFilterType('booked_date')}
              className={cn(
                'px-2 py-1 text-xs font-medium rounded-md transition-colors',
                filterType === 'booked_date'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              )}
            >
              Booked Date
            </button>
          </div>
        </div>
        <div className="ml-auto flex items-center">
          <div
            className={cn(
              'flex h-8 items-center overflow-hidden rounded-md border transition-all duration-300 ease-out',
              isSearchOpen
                ? 'w-48 sm:w-60 border-gray-200 bg-white px-2 dark:border-gray-700 dark:bg-gray-900'
                : 'pointer-events-none w-0 border-transparent px-0 opacity-0'
            )}
          >
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(event) => handleSearchQueryChange(event.target.value)}
              placeholder="Search leads..."
              className="h-full w-full bg-transparent text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none dark:text-gray-100 dark:placeholder:text-gray-500"
            />
          </div>
        </div>
      </div>

      {/* Lead List */}
      <div className="flex-1 overflow-y-auto">
        {showSearchEmptyState ? (
          <div className="flex h-full items-center justify-center px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
            No leads match "{trimmedSearchQuery}". Try another name, company, or email.
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {sortedLeads.map((lead) => {
                return (
                  <LeadListItem
                    key={lead.id}
                    lead={lead}
                    isSelected={selectedLeadId === lead.id}
                    onSelect={() => onSelect(lead.id)}
                    onReprocessLead={onReprocessLead}
                    isReprocessingLead={reprocessingLeadId === lead.id}
                    disableReprocess={
                      Boolean(isReprocessing) && reprocessingLeadId !== null && reprocessingLeadId !== lead.id
                    }
                  />
                );
              })}
            </div>

            {/* Load More Trigger */}
            {hasMore && (
              <div
                ref={loadMoreRef}
                className="flex items-center justify-center py-6 text-sm text-gray-500 dark:text-gray-400"
              >
                {isLoadingMore ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading more leads...</span>
                  </div>
                ) : (
                  <span>Scroll to load more</span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface LeadListItemProps {
  lead: LeadWithPrep;
  isSelected: boolean;
  onSelect: () => void;
  onReprocessLead?: (leadId: string) => Promise<void> | void;
  isReprocessingLead?: boolean;
  disableReprocess?: boolean;
}

function LeadListItem({
  lead,
  isSelected,
  onSelect,
  onReprocessLead,
  isReprocessingLead,
  disableReprocess,
}: LeadListItemProps) {
  // Extract domain from email if domain field is not available
  const domainForLogo = useMemo(() => {
    if (lead.domain) {
      return lead.domain;
    }
    
    // Extract domain from email
    if (lead.contact_email) {
      const emailDomain = lead.contact_email.split('@')[1];
      if (emailDomain) {
        // Filter out common free email providers
        const freeEmailProviders = [
          'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
          'icloud.com', 'proton.me', 'aol.com', 'mail.com', 'live.com'
        ];
        
        const normalizedDomain = emailDomain.toLowerCase();
        if (!freeEmailProviders.includes(normalizedDomain)) {
          return normalizedDomain;
        } else {
        }
      }
    }
    return null;
  }, [lead.domain, lead.contact_email]);

  const { logoUrl, isLoading } = useCompanyLogo(domainForLogo);
  const [logoError, setLogoError] = useState(false);
  
  // Debug logging
  useEffect(() => {
  }, [domainForLogo, logoUrl, isLoading, logoError]);
  
  // Reset error state when domain or logoUrl changes
  useEffect(() => {
    setLogoError(false);
  }, [domainForLogo, logoUrl]);
  
  const owner = lead.owner as { first_name: string | null; last_name: string | null; email: string | null } | null;
  const source = lead.source as { name: string | null; source_key: string | null } | null;
  const contact = lead.contact as { title: string | null; first_name: string | null; last_name: string | null; email: string | null } | null;
  
  // Debug: Log contact data to verify it's being fetched
  useEffect(() => {
    if (lead.id) {
    }
  }, [lead.id, lead.contact_id, contact]);

  // Get source label
  const getSourceLabel = () => {
    if (source?.name) return source.name;
    
    // Fallback to UTM or booking link name
    if (lead.utm_source) {
      const utm = lead.utm_source.toLowerCase();
      if (utm.includes('facebook')) return 'Facebook Ads';
      if (utm.includes('linkedin')) return 'LinkedIn Ads';
      if (utm.includes('email')) return 'Email Outreach';
    }
    
    if (lead.booking_link_name) {
      const linkName = lead.booking_link_name.toLowerCase();
      if (linkName.includes('linkedin')) return 'LinkedIn Ads';
      if (linkName.includes('facebook')) return 'Facebook Ads';
      if (linkName.includes('email')) return 'Email Outreach';
      if (linkName.includes('website') || linkName.includes('homepage')) return 'Website';
      if (linkName.includes('personal') || linkName.includes('direct')) return 'Personal Link';
    }
    
    return 'Unknown Source';
  };

  const sourceLabel = getSourceLabel();
  const ownerName = owner
    ? [owner.first_name, owner.last_name].filter(Boolean).join(' ') || owner.email
    : null;

  // Extract and format company name from domain
  const companyName = useMemo(() => {
    if (!domainForLogo) return null;
    
    // Remove common TLDs and www
    let name = domainForLogo
      .replace(/^www\./, '')
      .replace(/\.(com|net|org|io|co|ai|app|dev|tech|ly|me|uk|us|ca|au|de|fr|es|it|nl|se|no|dk|fi|pl|cz|at|ch|be|ie|pt|gr|ro|hu|bg|hr|si|sk|lt|lv|ee|lu|mt|cy)$/i, '');
    
    // Check for common suffixes after TLD removal (e.g., "companyinc", "companyllc")
    const nameLower = name.toLowerCase();
    let suffix = '';
    if (nameLower.endsWith('inc')) {
      suffix = ' Inc';
      name = name.slice(0, -3).trim();
    } else if (nameLower.endsWith('llc')) {
      suffix = ' LLC';
      name = name.slice(0, -3).trim();
    } else if (nameLower.endsWith('ltd')) {
      suffix = ' Ltd';
      name = name.slice(0, -3).trim();
    } else if (nameLower.endsWith('corp')) {
      suffix = ' Corp';
      name = name.slice(0, -4).trim();
    }
    
    // Handle camelCase: add space before capital letters (but not at the start)
    name = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    
    // Replace hyphens and underscores with spaces
    name = name.replace(/[-_]/g, ' ');
    
    // Handle numbers: add space before/after numbers if needed
    name = name.replace(/([a-z])([0-9])/gi, '$1 $2');
    name = name.replace(/([0-9])([a-z])/gi, '$1 $2');
    
    // Normalize multiple spaces
    name = name.replace(/\s+/g, ' ').trim();
    
    // Capitalize first letter of each word
    name = name
      .split(' ')
      .map(word => {
        // Handle special cases like "m1" -> "M1", "ai" -> "AI" if it's a short acronym
        if (word.length <= 2 && /^[a-z]+$/i.test(word)) {
          return word.toUpperCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
    
    // Add suffix back if we had one
    if (suffix) {
      name += suffix;
    }
    
    return name || null;
  }, [domainForLogo]);

  // Format company name with title if available: "{title} @ {company name}" or just "{title}" or just "{company name}"
  const companyNameWithTitle = useMemo(() => {
    const title = contact?.title?.trim();
    if (title && companyName) {
      return `${title} @ ${companyName}`;
    } else if (title) {
      return title;
    } else if (companyName) {
      return companyName;
    }
    return null;
  }, [contact?.title, companyName]);

  // Extract initials for fallback when logo is not available
  const initials = useMemo(() => {
    // Try company name first
    if (companyName) {
      const words = companyName.split(' ').filter(Boolean).filter(w => w.length > 0);
      if (words.length >= 2) {
        const first = words[0][0]?.toUpperCase() || '';
        const second = words[1][0]?.toUpperCase() || '';
        if (first && second) return first + second;
      } else if (words.length === 1 && words[0].length >= 2) {
        return words[0].substring(0, 2).toUpperCase();
      } else if (words.length === 1 && words[0].length === 1) {
        return words[0].toUpperCase();
      }
    }
    
    // Fallback to contact name
    const contactName = lead.contact_name || '';
    if (contactName && contactName.trim()) {
      const nameParts = contactName.trim().split(/\s+/).filter(p => p.length > 0);
      if (nameParts.length >= 2) {
        const first = nameParts[0][0]?.toUpperCase() || '';
        const last = nameParts[nameParts.length - 1][0]?.toUpperCase() || '';
        if (first && last) return first + last;
      } else if (nameParts.length === 1) {
        const name = nameParts[0];
        if (name.length >= 2) {
          return name.substring(0, 2).toUpperCase();
        } else if (name.length === 1) {
          return name.toUpperCase();
        }
      }
    }
    
    // Fallback to email prefix (before @)
    if (lead.contact_email) {
      const emailPrefix = lead.contact_email.split('@')[0];
      if (emailPrefix && emailPrefix.length >= 2) {
        // Try to extract initials from email (e.g., "kelston.smith" -> "KS")
        const parts = emailPrefix.split(/[._-]/).filter(p => p.length > 0);
        if (parts.length >= 2) {
          const first = parts[0][0]?.toUpperCase() || '';
          const second = parts[parts.length - 1][0]?.toUpperCase() || '';
          if (first && second) return first + second;
        } else if (parts.length === 1 && parts[0].length >= 2) {
          return parts[0].substring(0, 2).toUpperCase();
        }
      }
    }
    
    // Last resort: use domain initials
    if (domainForLogo) {
      const domainParts = domainForLogo.split('.').filter(p => p.length > 0 && p !== 'www');
      if (domainParts.length > 0) {
        const mainPart = domainParts[0];
        if (mainPart.length >= 2) {
          return mainPart.substring(0, 2).toUpperCase();
        } else if (mainPart.length === 1) {
          return mainPart.toUpperCase();
        }
      }
    }
    
    // Absolute fallback
    return '?';
  }, [companyName, lead.contact_name, lead.contact_email, domainForLogo]);

  // Format dates
  const bookedDate = lead.first_seen_at || lead.external_occured_at || lead.created_at;
  const meetingDate = lead.meeting_start;
  const bookedDateFormatted = bookedDate ? format(new Date(bookedDate), 'MMM d, yyyy • h:mm a') : null;
  const meetingDateFormatted = meetingDate ? format(new Date(meetingDate), 'MMM d, yyyy • h:mm a') : null;
  const meetingStatus = meetingDate
    ? new Date(meetingDate).getTime() < Date.now()
      ? `Completed ${formatDistanceToNow(new Date(meetingDate), { addSuffix: true })}`
      : `In ${formatDistanceToNow(new Date(meetingDate))}`
    : null;

  // Consolidated status badge
  const prepStatus = lead.prep_status?.toLowerCase() || 'pending';
  const enrichStatus = lead.enrichment_status?.toLowerCase() || 'pending';
  const isComplete = prepStatus === 'completed' && enrichStatus === 'completed';
  const isInProgress = prepStatus === 'in_progress' || enrichStatus === 'in_progress';
  const hasFailed = prepStatus === 'failed' || enrichStatus === 'failed';

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect();
    }
  };

  const handleReprocessClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (onReprocessLead) {
      await onReprocessLead(lead.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={cn(
        'w-full text-left px-4 sm:px-5 py-6 min-h-[120px] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70',
        'hover:bg-emerald-50 dark:hover:bg-emerald-500/10',
        isSelected
          ? 'bg-emerald-100/70 dark:bg-emerald-500/20 border-l-4 border-emerald-500'
          : 'border-l-4 border-transparent'
      )}
    >
      <div className="flex items-start gap-4">
        {/* Company Logo - Always show */}
        <div className="flex-shrink-0">
          {logoUrl && !logoError && !isLoading ? (
            <img
              src={logoUrl}
              alt={domainForLogo || 'Company logo'}
              className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-0.5"
              onError={() => {
                // Show placeholder on error
                setLogoError(true);
              }}
            />
          ) : (
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center border-2 font-semibold text-xs",
              isLoading
                ? "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                : "bg-gradient-to-br from-emerald-500 to-teal-600 dark:from-emerald-600 dark:to-teal-700 border-emerald-200 dark:border-emerald-500/30 text-white shadow-sm"
            )}>
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="select-none">{initials}</span>
              )}
            </div>
          )}
        </div>

        {/* Lead Content */}
        <div className="flex-1 min-w-0">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                {lead.contact_name || lead.contact_email || 'Unnamed Lead'}
              </p>
              {companyNameWithTitle && (
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mt-0.5 truncate">
                  {companyNameWithTitle}
                </p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
                {lead.meeting_title || 'Discovery Call'}
              </p>
            </div>
            
            {/* Consolidated Status Badge */}
            <div className="flex items-center gap-2">
              {onReprocessLead && (
                <ReprocessButton
                  onClick={handleReprocessClick}
                  isProcessing={isReprocessingLead}
                  disabled={Boolean(disableReprocess)}
                />
              )}
              <ConsolidatedStatusBadge
                prepStatus={prepStatus}
                enrichStatus={enrichStatus}
                isComplete={isComplete}
                isInProgress={isInProgress}
                hasFailed={hasFailed}
              />
            </div>
          </div>

          {/* Labels Row */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {/* Meeting Booked Label */}
            {lead.external_source === 'savvycal' && (
              <LabelBadge icon={Tag} label="Meeting Booked" variant="emerald" />
            )}
            {lead.external_source === 'linkedin' && (
              <LabelBadge icon={Tag} label="LinkedIn Lead" variant="blue" />
            )}
            
            {/* Source Label */}
            <LabelBadge icon={Tag} label={sourceLabel} variant="blue" />
            
            {/* Owner Label */}
            {ownerName && (
              <LabelBadge icon={User} label={ownerName} variant="purple" />
            )}
          </div>

          {/* Timestamps Row */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            {bookedDate && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>
                  Booked on {bookedDateFormatted}{' '}
                  <span className="text-gray-400">
                    ({formatDistanceToNow(new Date(bookedDate), { addSuffix: true })})
                  </span>
                </span>
              </div>
            )}
            {meetingDate && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>
                  Call {meetingDateFormatted}{' '}
                  {meetingStatus && <span className="text-gray-400">({meetingStatus})</span>}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ConsolidatedStatusBadgeProps {
  prepStatus: string;
  enrichStatus: string;
  isComplete: boolean;
  isInProgress: boolean;
  hasFailed: boolean;
}

function ConsolidatedStatusBadge({
  prepStatus,
  enrichStatus,
  isComplete,
  isInProgress,
  hasFailed,
}: ConsolidatedStatusBadgeProps) {
  let variant: 'completed' | 'in_progress' | 'pending' | 'failed' = 'pending';
  let label = 'Prep & Enrich';

  if (hasFailed) {
    variant = 'failed';
    label = 'Failed';
  } else if (isComplete) {
    variant = 'completed';
    label = 'Ready';
  } else if (isInProgress) {
    variant = 'in_progress';
    label = 'Processing';
  }

  const variants: Record<string, string> = {
    completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200',
    in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
    pending: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
    failed: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200',
  };

  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium', variants[variant])}>
      {label}
    </span>
  );
}

interface LabelBadgeProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  variant: 'emerald' | 'blue' | 'purple' | 'gray';
}

function LabelBadge({ icon: Icon, label, variant }: LabelBadgeProps) {
  const variants: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/30',
    blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-200 dark:border-blue-500/30',
    purple: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-200 dark:border-purple-500/30',
    gray: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-500/10 dark:text-gray-200 dark:border-gray-500/30',
  };

  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
      variants[variant]
    )}>
      <Icon className="w-3 h-3" />
      <span className="truncate max-w-[120px]">{label}</span>
    </span>
  );
}

interface ReprocessButtonProps {
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  isProcessing?: boolean;
  disabled?: boolean;
}

function ReprocessButton({ onClick, isProcessing, disabled }: ReprocessButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isProcessing}
      title="Reprocess lead prep"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors',
        'border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800',
        (disabled || isProcessing) && 'opacity-60 cursor-not-allowed'
      )}
    >
      {isProcessing ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <RotateCw className="h-3 w-3" />
      )}
      <span>Reprocess</span>
    </button>
  );
}
