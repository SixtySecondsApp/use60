/**
 * EntityChipPopover
 *
 * Renders an entity chip (e.g. "@Sarah Jones") in sent messages.
 * Clicking the chip opens a popover with a quick summary of the entity.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { User, Building2, Briefcase, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EntityChipPopoverProps {
  entity: {
    id: string;
    type: 'contact' | 'company' | 'deal';
    name: string;
    metadata?: Record<string, unknown>;
  };
  onActionClick?: (action: { action: string; params?: Record<string, unknown> }) => void;
}

const TYPE_CONFIG = {
  contact: {
    icon: User,
    label: 'Contact',
    chipClasses: 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25',
    badgeClasses: 'bg-blue-500/20 text-blue-400',
    action: 'open_contact',
    actionParam: 'contactId',
  },
  company: {
    icon: Building2,
    label: 'Company',
    chipClasses: 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25',
    badgeClasses: 'bg-emerald-500/20 text-emerald-400',
    action: 'open_contact', // companies navigate via contact view
    actionParam: 'companyId',
  },
  deal: {
    icon: Briefcase,
    label: 'Deal',
    chipClasses: 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25',
    badgeClasses: 'bg-amber-500/20 text-amber-400',
    action: 'open_deal',
    actionParam: 'dealId',
  },
} as const;

function formatCurrency(value: unknown): string {
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function formatDate(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  if (isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function ContactDetails({ metadata }: { metadata: Record<string, unknown> }) {
  const title = metadata.job_title as string | undefined;
  const company = metadata.company_name as string | undefined;
  const email = metadata.email as string | undefined;

  return (
    <div className="space-y-1 text-sm text-gray-300">
      {title && <div className="truncate">{title}</div>}
      {company && <div className="truncate text-gray-400">{company}</div>}
      {email && <div className="truncate text-gray-400">{email}</div>}
    </div>
  );
}

function CompanyDetails({ metadata }: { metadata: Record<string, unknown> }) {
  const industry = metadata.industry as string | undefined;
  const size = metadata.employee_count as string | number | undefined;
  const domain = metadata.domain as string | undefined;

  return (
    <div className="space-y-1 text-sm text-gray-300">
      {industry && <div className="truncate">{industry}</div>}
      {size && <div className="truncate text-gray-400">{size} employees</div>}
      {domain && <div className="truncate text-gray-400">{domain}</div>}
    </div>
  );
}

function DealDetails({ metadata }: { metadata: Record<string, unknown> }) {
  const stage = metadata.stage_name as string | undefined;
  const amount = metadata.amount;
  const closeDate = metadata.close_date;

  return (
    <div className="space-y-1 text-sm text-gray-300">
      {stage && <div className="truncate">{stage}</div>}
      {amount != null && <div className="truncate text-gray-400">{formatCurrency(amount)}</div>}
      {closeDate && <div className="truncate text-gray-400">Close: {formatDate(closeDate)}</div>}
    </div>
  );
}

const DETAIL_COMPONENTS: Record<string, React.FC<{ metadata: Record<string, unknown> }>> = {
  contact: ContactDetails,
  company: CompanyDetails,
  deal: DealDetails,
};

export function EntityChipPopover({ entity, onActionClick }: EntityChipPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState<'below' | 'above'>('below');
  const chipRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const config = TYPE_CONFIG[entity.type];
  const Icon = config.icon;

  // Determine placement based on available space
  const updatePlacement = useCallback(() => {
    if (!chipRef.current) return;
    const rect = chipRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setPlacement(spaceBelow < 200 ? 'above' : 'below');
  }, []);

  // Click outside to dismiss
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        chipRef.current &&
        !chipRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleChipClick = useCallback(() => {
    updatePlacement();
    setIsOpen((prev) => !prev);
  }, [updatePlacement]);

  const handleViewProfile = useCallback(() => {
    setIsOpen(false);
    onActionClick?.({
      action: config.action,
      params: { [config.actionParam]: entity.id },
    });
  }, [onActionClick, config, entity.id]);

  const metadata = entity.metadata ?? {};
  const hasMetadata = Object.keys(metadata).length > 0;
  const DetailComponent = DETAIL_COMPONENTS[entity.type];

  return (
    <span className="relative inline-block">
      <button
        ref={chipRef}
        type="button"
        onClick={handleChipClick}
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium',
          'cursor-pointer transition-colors',
          config.chipClasses,
        )}
      >
        <Icon className="w-3 h-3 flex-shrink-0" />
        {entity.name}
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className={cn(
            'absolute left-0 z-50 w-64 rounded-lg border border-gray-700 bg-gray-800 shadow-xl',
            'animate-in fade-in-0 zoom-in-95',
            placement === 'below' ? 'top-full mt-1' : 'bottom-full mb-1',
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-gray-700 px-3 py-2.5">
            <Icon className="w-4 h-4 flex-shrink-0 text-gray-400" />
            <span className="flex-1 truncate text-sm font-medium text-gray-200">
              {entity.name}
            </span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                config.badgeClasses,
              )}
            >
              {config.label}
            </span>
          </div>

          {/* Details */}
          {hasMetadata && DetailComponent && (
            <div className="border-b border-gray-700 px-3 py-2.5">
              <DetailComponent metadata={metadata} />
            </div>
          )}

          {/* Action */}
          <div className="px-3 py-2">
            <button
              type="button"
              onClick={handleViewProfile}
              className={cn(
                'flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5',
                'text-sm font-medium text-gray-300 transition-colors',
                'hover:bg-gray-700/60 hover:text-gray-100',
              )}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Full Profile
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
