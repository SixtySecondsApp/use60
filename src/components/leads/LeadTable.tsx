import type { LeadWithPrep } from '@/lib/services/leadService';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Calendar, Clock, RotateCw, Loader2, Building2, Tag } from 'lucide-react';
import { useState, useMemo, useEffect, type MouseEvent } from 'react';
import { useCompanyLogo } from '@/lib/hooks/useCompanyLogo';

interface LeadTableProps {
  leads: LeadWithPrep[];
  selectedLeadId: string | null;
  onSelect: (leadId: string) => void;
  isLoading?: boolean;
  onReprocessLead?: (leadId: string) => Promise<void> | void;
  reprocessingLeadId?: string | null;
  isReprocessing?: boolean;
}

export function LeadTable({
  leads,
  selectedLeadId,
  onSelect,
  isLoading,
  onReprocessLead,
  reprocessingLeadId,
  isReprocessing,
}: LeadTableProps) {
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

  const getStatusBadge = (lead: LeadWithPrep) => {
    const prepStatus = lead.prep_status?.toLowerCase() || 'pending';
    const enrichStatus = lead.enrichment_status?.toLowerCase() || 'pending';
    const isComplete = prepStatus === 'completed' && enrichStatus === 'completed';
    const isInProgress = prepStatus === 'in_progress' || enrichStatus === 'in_progress';
    const hasFailed = prepStatus === 'failed' || enrichStatus === 'failed';

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
  };

  const handleReprocessClick = async (e: MouseEvent<HTMLButtonElement>, leadId: string) => {
    e.stopPropagation();
    if (onReprocessLead) {
      await onReprocessLead(leadId);
    }
  };

  const formatDateTime = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'MMM d, yyyy • h:mm a');
    } catch {
      return 'Invalid date';
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Contact
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Company
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Source
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Meeting
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
          {leads.map((lead) => (
            <LeadTableRow
              key={lead.id}
              lead={lead}
              isSelected={selectedLeadId === lead.id}
              onSelect={() => onSelect(lead.id)}
              onReprocessLead={onReprocessLead}
              isReprocessing={reprocessingLeadId === lead.id}
              disableReprocess={Boolean(isReprocessing) && reprocessingLeadId !== lead.id}
              getStatusBadge={getStatusBadge}
              formatDateTime={formatDateTime}
              handleReprocessClick={handleReprocessClick}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface LeadTableRowProps {
  lead: LeadWithPrep;
  isSelected: boolean;
  onSelect: () => void;
  onReprocessLead?: (leadId: string) => Promise<void> | void;
  isReprocessing: boolean;
  disableReprocess: boolean;
  getStatusBadge: (lead: LeadWithPrep) => JSX.Element;
  formatDateTime: (dateString: string | null | undefined) => string;
  handleReprocessClick: (e: MouseEvent<HTMLButtonElement>, leadId: string) => Promise<void>;
}

const SOURCE_CHANNEL_COLORS: Record<string, string> = {
  paid_social: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  paid_search: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  email: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
  organic: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
  direct: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  website: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
};

function LeadTableRow({
  lead,
  isSelected,
  onSelect,
  onReprocessLead,
  isReprocessing,
  disableReprocess,
  getStatusBadge,
  formatDateTime,
  handleReprocessClick,
}: LeadTableRowProps) {
  const meetingDate = lead.meeting_start;

  // Extract domain from email if domain field is not available
  const domainForLogo = useMemo(() => {
    if (lead.domain) return lead.domain;
    if (lead.contact_email) {
      const emailDomain = lead.contact_email.split('@')[1];
      if (emailDomain) {
        const freeEmailProviders = [
          'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
          'icloud.com', 'proton.me', 'aol.com', 'mail.com', 'live.com'
        ];
        const normalizedDomain = emailDomain.toLowerCase();
        if (!freeEmailProviders.includes(normalizedDomain)) return normalizedDomain;
      }
    }
    return null;
  }, [lead.domain, lead.contact_email]);

  const { logoUrl, isLoading } = useCompanyLogo(domainForLogo);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    setLogoError(false);
  }, [domainForLogo, logoUrl]);

  const initials = useMemo(() => {
    const contactName = lead.contact_name || '';
    if (contactName && contactName.trim()) {
      const nameParts = contactName.trim().split(/\s+/).filter(p => p.length > 0);
      if (nameParts.length >= 2) {
        return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
      } else if (nameParts.length === 1 && nameParts[0].length >= 2) {
        return nameParts[0].substring(0, 2).toUpperCase();
      }
    }
    if (domainForLogo) {
      const domainParts = domainForLogo.split('.').filter(p => p.length > 0 && p !== 'www');
      if (domainParts.length > 0 && domainParts[0].length >= 2) return domainParts[0].substring(0, 2).toUpperCase();
    }
    return '?';
  }, [lead.contact_name, domainForLogo]);

  // Extract company data from joined relation
  const company = lead.company as { id: string; name: string; domain: string | null; industry: string | null; size: string | null; enrichment_data: Record<string, unknown> | null } | null;
  const companyName = company?.name || lead.domain || 'Unknown';
  const companyIndustry = company?.industry || null;
  const companySize = company?.size || null;

  // Extract source data from joined relation
  const source = lead.source as { id: string; name: string; source_key: string | null; channel: string | null } | null;
  const sourceLabel = source?.name || lead.source_channel || null;
  const sourceChannel = source?.channel || lead.source_channel || null;

  return (
    <tr
      onClick={onSelect}
      className={cn(
        'cursor-pointer transition-colors',
        'hover:bg-emerald-50 dark:hover:bg-emerald-500/10',
        isSelected && 'bg-emerald-100/70 dark:bg-emerald-500/20'
      )}
    >
      {/* Contact */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            {logoUrl && !logoError && !isLoading ? (
              <img
                src={logoUrl}
                alt={domainForLogo || 'Company logo'}
                className="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center border font-semibold text-xs",
                isLoading
                  ? "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                  : "bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-200 dark:border-emerald-500/30 text-white"
              )}>
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="select-none">{initials}</span>
                )}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {lead.contact_name || lead.contact_email || 'Unnamed Lead'}
            </div>
            {lead.contact_email && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                {lead.contact_email}
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Company + Industry */}
      <td className="px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{companyName}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            {companyIndustry && (
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300 truncate max-w-[120px]">
                {companyIndustry}
              </span>
            )}
            {companySize && (
              <span className="text-[10px] text-gray-400">{companySize}</span>
            )}
          </div>
        </div>
      </td>

      {/* Source */}
      <td className="px-4 py-3">
        {sourceLabel ? (
          <div className="flex items-center gap-1.5">
            <Tag className="h-3 w-3 text-gray-400 flex-shrink-0" />
            <span className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium truncate max-w-[110px]',
              sourceChannel && SOURCE_CHANNEL_COLORS[sourceChannel]
                ? SOURCE_CHANNEL_COLORS[sourceChannel]
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
            )}>
              {sourceLabel}
            </span>
          </div>
        ) : (
          <span className="text-xs text-gray-400">-</span>
        )}
      </td>

      {/* Meeting Date */}
      <td className="px-4 py-3">
        {meetingDate ? (
          <div className="flex items-center gap-1.5 text-sm text-gray-900 dark:text-gray-100">
            <Calendar className="h-3.5 w-3.5 text-gray-400" />
            <span>{formatDateTime(meetingDate)}</span>
          </div>
        ) : (
          <span className="text-sm text-gray-400">N/A</span>
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        {getStatusBadge(lead)}
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {onReprocessLead && (
            <button
              type="button"
              onClick={(e) => handleReprocessClick(e, lead.id)}
              disabled={isReprocessing || disableReprocess}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors',
                'border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800',
                (isReprocessing || disableReprocess) && 'opacity-60 cursor-not-allowed'
              )}
              title="Reprocess lead prep"
            >
              {isReprocessing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCw className="h-3 w-3" />
              )}
              <span>Reprocess</span>
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
