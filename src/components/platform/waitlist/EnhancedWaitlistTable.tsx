/**
 * EnhancedWaitlistTable Component
 * Waitlist table with checkbox selection and onboarding progress display
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Check, X, Download, Trash2, RotateCw, Filter, ChevronUp, ChevronDown, ArrowUpDown, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import type { WaitlistEntry } from '@/lib/types/waitlist';
import { OnboardingProgressWidget } from './OnboardingProgressWidget';
import { useWaitlistOnboardingProgress } from '@/lib/hooks/useWaitlistOnboarding';

type SortColumn = 'position' | 'name' | 'email' | 'company' | 'dialer' | 'meeting_recorder' | 'crm' | 'referrals' | 'points' | 'status' | null;
type SortDirection = 'asc' | 'desc' | null;

export interface EnhancedWaitlistTableProps {
  entries: WaitlistEntry[];
  isLoading: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  canSelect: (entry: WaitlistEntry) => boolean;
  isSelected: (id: string) => boolean;
  onRelease: (id: string, notes?: string) => Promise<void>;
  onUnrelease?: (id: string, notes?: string) => Promise<void>;
  onResendMagicLink?: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onExport: () => Promise<void>;
  hideSeeded?: boolean;
  onHideSeededChange?: (hideSeeded: boolean) => void;
}

export function EnhancedWaitlistTable({
  entries,
  isLoading,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  canSelect,
  isSelected,
  onRelease,
  onUnrelease,
  onResendMagicLink,
  onDelete,
  onExport,
  hideSeeded = true,
  onHideSeededChange,
}: EnhancedWaitlistTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Filter entries based on search and seeded status
  const filteredEntries = useMemo(() => {
    let filtered = entries.filter((entry) => {
      // Search filter
      const matchesSearch =
        entry.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (entry.company_name || '').toLowerCase().includes(searchTerm.toLowerCase());

      // Seeded filter
      const matchesSeeded = hideSeeded ? !entry.is_seeded : true;

      return matchesSearch && matchesSeeded;
    });

    // Apply sorting
    if (sortColumn && sortDirection) {
      filtered = [...filtered].sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch (sortColumn) {
          case 'position':
            aValue = a.effective_position || a.signup_position || 0;
            bValue = b.effective_position || b.signup_position || 0;
            break;
          case 'name':
            aValue = (a.full_name || '').toLowerCase();
            bValue = (b.full_name || '').toLowerCase();
            break;
          case 'email':
            aValue = (a.email || '').toLowerCase();
            bValue = (b.email || '').toLowerCase();
            break;
          case 'company':
            aValue = (a.company_name || '').toLowerCase();
            bValue = (b.company_name || '').toLowerCase();
            break;
          case 'dialer':
            aValue = (a.dialer_tool === 'Other' && a.dialer_other ? a.dialer_other : a.dialer_tool || '').toLowerCase();
            bValue = (b.dialer_tool === 'Other' && b.dialer_other ? b.dialer_other : b.dialer_tool || '').toLowerCase();
            break;
          case 'meeting_recorder':
            aValue = (a.meeting_recorder_tool === 'Other' && a.meeting_recorder_other ? a.meeting_recorder_other : a.meeting_recorder_tool || '').toLowerCase();
            bValue = (b.meeting_recorder_tool === 'Other' && b.meeting_recorder_other ? b.meeting_recorder_other : b.meeting_recorder_tool || '').toLowerCase();
            break;
          case 'crm':
            aValue = (a.crm_tool === 'Other' && a.crm_other ? a.crm_other : a.crm_tool || '').toLowerCase();
            bValue = (b.crm_tool === 'Other' && b.crm_other ? b.crm_other : b.crm_tool || '').toLowerCase();
            break;
          case 'referrals':
            aValue = a.referral_count || 0;
            bValue = b.referral_count || 0;
            break;
          case 'points':
            aValue = a.total_points || 0;
            bValue = b.total_points || 0;
            break;
          case 'status':
            aValue = (a.status || '').toLowerCase();
            bValue = (b.status || '').toLowerCase();
            break;
          default:
            return 0;
        }

        // Handle null/undefined values
        if (aValue === null || aValue === undefined) aValue = '';
        if (bValue === null || bValue === undefined) bValue = '';

        // Compare values
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        } else {
          if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
          if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
          return 0;
        }
      });
    }

    return filtered;
  }, [entries, searchTerm, hideSeeded, sortColumn, sortDirection]);

  // Reset to page 1 when filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, hideSeeded, sortColumn, sortDirection]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredEntries.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedEntries = filteredEntries.slice(startIndex, endIndex);
  const startItem = filteredEntries.length > 0 ? startIndex + 1 : 0;
  const endItem = Math.min(endIndex, filteredEntries.length);

  // Handle column header click - cycle through: none -> asc -> desc -> none
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Cycle: asc -> desc -> none
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      // New column, start with asc
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Get sort icon for a column
  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-3 h-3 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />;
    }
    if (sortDirection === 'asc') {
      return <ChevronUp className="w-4 h-4 text-gray-700 dark:text-gray-300" />;
    }
    if (sortDirection === 'desc') {
      return <ChevronDown className="w-4 h-4 text-gray-700 dark:text-gray-300" />;
    }
    return <ArrowUpDown className="w-3 h-3 text-gray-400 dark:text-gray-500" />;
  };

  // Calculate select all state (memoized to prevent unnecessary recalculations)
  // Only consider entries on current page for select all
  const selectableEntries = useMemo(() => {
    return paginatedEntries.filter(canSelect);
  }, [paginatedEntries, canSelect]);
  
  const allSelectableSelected = useMemo(() => {
    if (selectableEntries.length === 0) return false;
    return selectableEntries.every((entry) => isSelected(entry.id));
  }, [selectableEntries, isSelected]);
  
  const someSelected = useMemo(() => {
    return selectableEntries.some((entry) => isSelected(entry.id));
  }, [selectableEntries, isSelected]);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-200 dark:bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden w-full transition-colors duration-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 transition-colors duration-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-3 w-full">
          <input
            type="text"
            placeholder="Search by name, email, or company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="
              w-full sm:max-w-md px-4 py-2
              bg-white dark:bg-gray-800
              border border-gray-300 dark:border-gray-600
              rounded-lg
              text-gray-900 dark:text-white
              placeholder-gray-400 dark:placeholder-gray-500
              focus:ring-2 focus:ring-blue-500 focus:border-transparent
            "
          />
          <button
            onClick={onExport}
            className="
              flex items-center gap-2
              px-4 py-2
              border border-gray-300 dark:border-gray-600
              hover:bg-gray-50 dark:hover:bg-gray-800
              rounded-lg
              text-gray-700 dark:text-gray-300
              font-medium text-sm
              transition-colors duration-200
            "
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={hideSeeded}
              onChange={(e) => onHideSeededChange?.(e.target.checked)}
              className="
                w-4 h-4
                text-blue-600
                bg-white dark:bg-gray-700
                border-gray-300 dark:border-gray-600
                rounded
                focus:ring-2 focus:ring-blue-500
              "
            />
            <span>Hide seeded users</span>
            <span className="text-xs text-gray-500 dark:text-gray-500">
              ({entries.filter(e => e.is_seeded).length} seeded)
            </span>
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="w-full overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left">
              <th className="px-2 py-2 w-10">
                <input
                  type="checkbox"
                  checked={allSelectableSelected}
                  onChange={() => {
                    // Select/deselect all entries on current page
                    const shouldSelectAll = !allSelectableSelected;
                    selectableEntries.forEach(entry => {
                      const isCurrentlySelected = isSelected(entry.id);
                      if (shouldSelectAll && !isCurrentlySelected) {
                        onToggleSelect(entry.id);
                      } else if (!shouldSelectAll && isCurrentlySelected) {
                        onToggleSelect(entry.id);
                      }
                    });
                  }}
                  disabled={selectableEntries.length === 0}
                  className="
                    w-4 h-4
                    text-blue-600
                    bg-white dark:bg-gray-700
                    border-gray-300 dark:border-gray-600
                    rounded
                    focus:ring-2 focus:ring-blue-500
                    disabled:opacity-50 disabled:cursor-not-allowed
                  "
                  style={{
                    appearance: someSelected && !allSelectableSelected ? 'auto' : 'auto',
                  }}
                />
              </th>
              <th 
                className="px-2 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 group w-12"
                onClick={() => handleSort('position')}
              >
                <div className="flex items-center gap-1">
                  #
                  {getSortIcon('position')}
                </div>
              </th>
              <th 
                className="px-2 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 group"
                style={{ width: '12%' }}
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center gap-1">
                  Name
                  {getSortIcon('name')}
                </div>
              </th>
              <th 
                className="px-2 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 group"
                style={{ width: '16%' }}
                onClick={() => handleSort('email')}
              >
                <div className="flex items-center gap-1">
                  Email
                  {getSortIcon('email')}
                </div>
              </th>
              <th 
                className="px-2 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 group"
                style={{ width: '10%' }}
                onClick={() => handleSort('company')}
              >
                <div className="flex items-center gap-1">
                  Company
                  {getSortIcon('company')}
                </div>
              </th>
              <th 
                className="px-2 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 group"
                style={{ width: '12%' }}
                onClick={() => handleSort('dialer')}
              >
                <div className="flex items-center gap-1">
                  Tools
                  {getSortIcon('dialer')}
                </div>
              </th>
              <th 
                className="px-2 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 group"
                style={{ width: '6%' }}
                onClick={() => handleSort('referrals')}
              >
                <div className="flex items-center justify-center gap-1">
                  Ref
                  {getSortIcon('referrals')}
                </div>
              </th>
              <th 
                className="px-2 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 group"
                style={{ width: '6%' }}
                onClick={() => handleSort('points')}
              >
                <div className="flex items-center justify-center gap-1">
                  Pts
                  {getSortIcon('points')}
                </div>
              </th>
              <th 
                className="px-2 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 group"
                style={{ width: '12%' }}
              >
                <div className="flex items-center gap-1">
                  Registration URL
                </div>
              </th>
              <th 
                className="px-2 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 group"
                style={{ width: '8%' }}
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center gap-1">
                  Status
                  {getSortIcon('status')}
                </div>
              </th>
              <th className="px-2 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap" style={{ width: '10%' }}>
                Onboard
              </th>
              <th className="px-2 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap" style={{ width: '8%' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedEntries.length === 0 ? (
              <tr>
                <td
                  colSpan={12}
                  className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                >
                  No entries found
                </td>
              </tr>
            ) : (
              paginatedEntries.map((entry) => {
                const selectable = canSelect(entry);
                const selected = isSelected(entry.id);

                return (
                  <WaitlistTableRow
                    key={entry.id}
                    entry={entry}
                    selectable={selectable}
                    selected={selected}
                    onToggleSelect={onToggleSelect}
                    onRelease={onRelease}
                    onUnrelease={onUnrelease}
                    onResendMagicLink={onResendMagicLink}
                    onDelete={onDelete}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filteredEntries.length > pageSize && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
            Showing <span className="font-medium text-gray-900 dark:text-gray-100">{startItem}</span> to{' '}
            <span className="font-medium text-gray-900 dark:text-gray-100">{endItem}</span> of{' '}
            <span className="font-medium text-gray-900 dark:text-gray-100">{filteredEntries.length}</span> entries
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="
                inline-flex items-center gap-1
                px-3 py-1.5
                rounded-lg
                border border-gray-300 dark:border-gray-600
                text-xs sm:text-sm font-medium
                text-gray-700 dark:text-gray-300
                bg-white dark:bg-gray-800
                hover:bg-gray-50 dark:hover:bg-gray-700
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors duration-200
              "
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>

            <div className="flex items-center gap-1">
              {/* Show page numbers (max 5 visible) */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`
                      w-8 h-8
                      rounded-lg
                      text-xs font-medium
                      border transition-colors duration-200
                      ${
                        currentPage === pageNum
                          ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }
                    `}
                  >
                    {pageNum}
                  </button>
                );
              })}
              {totalPages > 5 && currentPage < totalPages - 2 && (
                <>
                  <span className="text-gray-400 dark:text-gray-500 px-1">...</span>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    className="
                      w-8 h-8
                      rounded-lg
                      text-xs font-medium
                      bg-white dark:bg-gray-800
                      text-gray-700 dark:text-gray-300
                      border border-gray-300 dark:border-gray-600
                      hover:bg-gray-50 dark:hover:bg-gray-700
                      transition-colors duration-200
                    "
                  >
                    {totalPages}
                  </button>
                </>
              )}
            </div>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="
                inline-flex items-center gap-1
                px-3 py-1.5
                rounded-lg
                border border-gray-300 dark:border-gray-600
                text-xs sm:text-sm font-medium
                text-gray-700 dark:text-gray-300
                bg-white dark:bg-gray-800
                hover:bg-gray-50 dark:hover:bg-gray-700
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors duration-200
              "
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Separate row component for better performance with onboarding progress
function WaitlistTableRow({
  entry,
  selectable,
  selected,
  onToggleSelect,
  onRelease,
  onUnrelease,
  onResendMagicLink,
  onDelete,
}: {
  entry: WaitlistEntry;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onRelease: (id: string, notes?: string) => Promise<void>;
  onUnrelease?: (id: string, notes?: string) => Promise<void>;
  onResendMagicLink?: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  // Fetch onboarding progress if user is converted
  const { data: onboardingProgress } = useWaitlistOnboardingProgress(
    entry.user_id || null
  );

  return (
    <tr className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-150">
      {/* Checkbox */}
      <td className="px-2 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(entry.id)}
          disabled={!selectable}
          className="
            w-4 h-4
            text-blue-600
            bg-white dark:bg-gray-700
            border-gray-300 dark:border-gray-600
            rounded
            focus:ring-2 focus:ring-blue-500
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        />
      </td>

      {/* Position */}
      <td className="px-2 py-2 text-xs text-gray-900 dark:text-white font-medium whitespace-nowrap">
        #{entry.effective_position}
      </td>

      {/* Name */}
      <td className="px-2 py-2 text-xs text-gray-900 dark:text-white">
        <div className="flex items-center gap-1 min-w-0">
          <span className="truncate" title={entry.full_name}>{entry.full_name}</span>
          {entry.is_seeded && (
            <span
              className="
                inline-flex items-center flex-shrink-0
                px-1 py-0.5
                rounded
                text-[10px] font-medium
                bg-purple-100 dark:bg-purple-900/20
                text-purple-800 dark:text-purple-400
                border border-purple-200 dark:border-purple-800
              "
              title="Seeded user for social proof"
            >
              S
            </span>
          )}
        </div>
      </td>

      {/* Email */}
      <td className="px-2 py-2 text-xs text-gray-600 dark:text-gray-400 truncate" title={entry.email}>
        {entry.email}
      </td>

      {/* Company */}
      <td className="px-2 py-2 text-xs text-gray-600 dark:text-gray-400 truncate" title={entry.company_name || ''}>
        {entry.company_name || '-'}
      </td>

      {/* Tools (Combined: Dialer, Meeting Recorder, CRM, Task Manager) */}
      <td className="px-2 py-2 text-xs text-gray-600 dark:text-gray-400">
        <div className="flex flex-col gap-0.5 min-w-0">
          {entry.dialer_tool && (
            <div className="truncate text-[10px]" title={entry.dialer_tool === 'Other' && entry.dialer_other ? entry.dialer_other : entry.dialer_tool}>
              <span className="mr-0.5">📞</span>
              <span className="truncate">{entry.dialer_tool === 'Other' && entry.dialer_other ? entry.dialer_other : entry.dialer_tool}</span>
            </div>
          )}
          {entry.meeting_recorder_tool && (
            <div className="truncate text-[10px]" title={entry.meeting_recorder_tool === 'Other' && entry.meeting_recorder_other ? entry.meeting_recorder_other : entry.meeting_recorder_tool}>
              <span className="mr-0.5">🎙️</span>
              <span className="truncate">{entry.meeting_recorder_tool === 'Other' && entry.meeting_recorder_other ? entry.meeting_recorder_other : entry.meeting_recorder_tool}</span>
            </div>
          )}
          {entry.crm_tool && (
            <div className="truncate text-[10px]" title={entry.crm_tool === 'Other' && entry.crm_other ? entry.crm_other : entry.crm_tool}>
              <span className="mr-0.5">📊</span>
              <span className="truncate">{entry.crm_tool === 'Other' && entry.crm_other ? entry.crm_other : entry.crm_tool}</span>
            </div>
          )}
          {entry.task_manager_tool && (
            <div className="truncate text-[10px]" title={entry.task_manager_tool === 'Other' && entry.task_manager_other ? entry.task_manager_other : entry.task_manager_tool}>
              <span className="mr-0.5">🔧</span>
              <span className="truncate">{entry.task_manager_tool === 'Other' && entry.task_manager_other ? entry.task_manager_other : entry.task_manager_tool}</span>
            </div>
          )}
          {!entry.dialer_tool && !entry.meeting_recorder_tool && !entry.crm_tool && !entry.task_manager_tool && (
            <span className="text-gray-400 dark:text-gray-500 text-[10px]">-</span>
          )}
        </div>
      </td>

      {/* Referrals */}
      <td className="px-2 py-2 text-xs text-gray-900 dark:text-white font-medium whitespace-nowrap text-center">
        {entry.referral_count || 0}
      </td>

      {/* Points */}
      <td className="px-2 py-2 text-xs text-gray-900 dark:text-white font-medium whitespace-nowrap text-center">
        {entry.total_points || 0}
      </td>

      {/* Registration URL */}
      <td className="px-2 py-2 text-xs text-gray-600 dark:text-gray-400 truncate" title={entry.registration_url || ''}>
        {entry.registration_url ? (
          <span className="font-mono text-[10px]">
            {entry.registration_url}
          </span>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">-</span>
        )}
      </td>

      {/* Status */}
      <td className="px-2 py-2 whitespace-nowrap">
        <span
          className={`
            inline-flex items-center
            px-1.5 py-0.5
            rounded-full
            text-[10px] font-medium
            ${
              entry.status === 'pending'
                ? 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400'
                : entry.status === 'released'
                ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400'
                : entry.status === 'converted'
                ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-400'
            }
          `}
        >
          {entry.status}
        </span>
      </td>

      {/* Onboarding Progress */}
      <td className="px-2 py-2 whitespace-nowrap">
        {entry.status === 'converted' && onboardingProgress ? (
          <OnboardingProgressWidget progress={onboardingProgress} variant="badge" />
        ) : entry.status === 'released' ? (
          <span className="text-[10px] text-gray-500 dark:text-gray-400">Pending</span>
        ) : (
          <span className="text-[10px] text-gray-400 dark:text-gray-500">-</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-2 py-2 whitespace-nowrap">
        <div className="flex items-center gap-1">
          {entry.status === 'pending' && (
            <button
              onClick={() => onRelease(entry.id)}
              className="
                p-1 flex-shrink-0
                text-green-600 dark:text-green-400
                hover:bg-green-50 dark:hover:bg-green-900/20
                rounded
                transition-colors duration-200
              "
              title="Grant access"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          {entry.status === 'released' && onUnrelease && (
            <button
              onClick={() => onUnrelease(entry.id)}
              className="
                p-1 flex-shrink-0
                text-orange-600 dark:text-orange-400
                hover:bg-orange-50 dark:hover:bg-orange-900/20
                rounded
                transition-colors duration-200
              "
              title="Put back on waitlist"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          )}
          {entry.status === 'released' && onResendMagicLink && (
            <button
              onClick={() => onResendMagicLink(entry.id)}
              className="
                p-1 flex-shrink-0
                text-blue-600 dark:text-blue-400
                hover:bg-blue-50 dark:hover:bg-blue-900/20
                rounded
                transition-colors duration-200
              "
              title="Resend magic link"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          )}
          {entry.status === 'converted' && (
            <button
              onClick={() => onRelease(entry.id)}
              className="
                p-1 flex-shrink-0
                text-blue-600 dark:text-blue-400
                hover:bg-blue-50 dark:hover:bg-blue-900/20
                rounded
                transition-colors duration-200
              "
              title="Re-invite user (reset and send new invitation)"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => {
              if (confirm('Are you sure you want to delete this entry?')) {
                onDelete(entry.id);
              }
            }}
              className="
                p-1 flex-shrink-0
                text-red-600 dark:text-red-400
                hover:bg-red-50 dark:hover:bg-red-900/20
                rounded
                transition-colors duration-200
              "
            title="Delete entry"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
