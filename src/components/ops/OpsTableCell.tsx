import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Mail, Linkedin, Building2, AlertCircle, Loader2, User, Phone, Check, X, ChevronDown, FunctionSquare, Zap, Play, Sparkles, Copy, CheckCheck, ExternalLink, Send, Clock, MessageSquare, Eye, Radio } from 'lucide-react';
import type { InstantlyColumnConfig } from '@/lib/types/instantly';
import type { DropdownOption, ButtonConfig } from '@/lib/services/opsTableService';

interface CellData {
  value: string | null;
  confidence: number | null;
  status: 'none' | 'pending' | 'complete' | 'failed';
}

interface SourceEntry {
  title?: string;
  url?: string;
}

interface OpsTableCellProps {
  cell: CellData;
  columnType: string;
  isEnrichment: boolean;
  firstName?: string;
  lastName?: string;
  /** Profile photo URL (from Apollo enrichment) */
  photoUrl?: string;
  /** Company domain for logo.dev logo (from Apollo enrichment) */
  companyDomain?: string;
  onEdit?: (value: string) => void;
  dropdownOptions?: DropdownOption[] | null;
  formulaExpression?: string | null;
  columnLabel?: string;
  metadata?: Record<string, unknown> | null;
  onEnrichRow?: () => void;
  /** Button column config (label, color, actions) */
  buttonConfig?: ButtonConfig | null;
  /** All cell values for this row, keyed by column key — for dynamic label resolution */
  rowCellValues?: Record<string, string>;
  /** Instantly column config (subtype, campaign, field mapping) */
  integrationConfig?: Record<string, unknown> | null;
}

/**
 * Renders a single cell in the OpsTable.
 * Click-to-edit input for all editable column types.
 * Enrichment status indicators, ICP score badges, and linked fields (email, linkedin)
 * retain their special rendering but become editable on click.
 */
export const OpsTableCell: React.FC<OpsTableCellProps> = ({
  cell,
  columnType,
  isEnrichment,
  firstName,
  lastName,
  photoUrl,
  companyDomain,
  onEdit,
  dropdownOptions,
  formulaExpression,
  columnLabel,
  metadata,
  onEnrichRow,
  buttonConfig,
  rowCellValues,
  integrationConfig,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(cell.value ?? '');
  const [showDropdown, setShowDropdown] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  // Sync local edit value when cell value changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditValue(cell.value ?? '');
    }
  }, [cell.value, isEditing]);

  // Close enrichment overlay on Escape
  useEffect(() => {
    if (!expanded) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setExpanded(false); setCopied(false); }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [expanded]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDropdown]);

  const startEditing = useCallback(() => {
    if (onEdit) {
      setIsEditing(true);
      setEditValue(cell.value ?? '');
    }
  }, [onEdit, cell.value]);

  const commitEdit = useCallback(() => {
    setIsEditing(false);
    if (onEdit && editValue !== (cell.value ?? '')) {
      onEdit(editValue);
    }
  }, [onEdit, editValue, cell.value]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditValue(cell.value ?? '');
  }, [cell.value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        commitEdit();
      } else if (e.key === 'Escape') {
        cancelEdit();
      } else if (e.key === 'Tab') {
        commitEdit();
      }
    },
    [commitEdit, cancelEdit],
  );

  // --- Enrichment status indicators ---
  if (isEnrichment) {
    if (cell.status === 'pending') {
      return (
        <div className="w-full h-full flex items-center">
          <span className="text-xs text-violet-300 italic flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
            Processing...
          </span>
        </div>
      );
    }

    if (cell.status === 'failed') {
      return (
        <div className="w-full h-full flex items-center group/enrich-fail">
          <span className="text-xs text-red-400 flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3" />
            Failed
          </span>
          {onEnrichRow && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEnrichRow(); }}
              className="ml-auto opacity-0 group-hover/enrich-fail:opacity-100 transition-opacity p-0.5 rounded hover:bg-violet-500/20"
              title="Retry enrichment"
            >
              <Zap className="w-3.5 h-3.5 text-violet-400" />
            </button>
          )}
        </div>
      );
    }
  }

  // --- ICP Score badge (not inline-editable) ---
  if (columnType === 'icp_score') {
    const score = cell.value != null ? Number(cell.value) : null;
    if (score == null || isNaN(score)) {
      return (
        <div className="w-full h-full flex items-center cursor-text" onClick={startEditing}>
          {isEditing ? renderInput() : <span className="text-gray-600 select-none">&mdash;</span>}
        </div>
      );
    }
    if (isEditing) return renderInput();
    const badgeClasses =
      score >= 9
        ? 'bg-emerald-500/20 text-emerald-400 ring-emerald-500/30'
        : score >= 7
          ? 'bg-blue-500/20 text-blue-400 ring-blue-500/30'
          : 'bg-yellow-500/20 text-yellow-400 ring-yellow-500/30';
    return (
      <div className="w-full h-full flex items-center cursor-text" onClick={startEditing}>
        <span
          className={`inline-flex items-center justify-center w-7 h-6 rounded text-xs font-bold ring-1 ${badgeClasses}`}
        >
          {score}
        </span>
      </div>
    );
  }

  // --- Inline editing input ---
  function renderInput() {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={handleKeyDown}
        placeholder="Type here..."
        className="w-full h-full bg-transparent text-sm text-gray-100 outline-none placeholder-gray-600"
      />
    );
  }

  if (isEditing) {
    return renderInput();
  }

  // --- Display mode: click anywhere to edit ---

  // Email
  if (columnType === 'email') {
    if (!cell.value) {
      return (
        <div className="w-full h-full flex items-center cursor-text" onClick={startEditing}>
          <span className="text-gray-600 text-sm">Enter email...</span>
        </div>
      );
    }
    return (
      <div className="w-full h-full flex items-center min-w-0 group/cell">
        <Mail className="w-3 h-3 text-blue-400 shrink-0 mr-1.5" />
        <span
          className="truncate text-sm text-blue-400 cursor-text"
          onClick={startEditing}
          title={cell.value}
        >
          {cell.value}
        </span>
      </div>
    );
  }

  // LinkedIn
  if (columnType === 'linkedin') {
    if (!cell.value) {
      return (
        <div className="w-full h-full flex items-center cursor-text" onClick={startEditing}>
          <span className="text-gray-600 text-sm">Enter URL...</span>
        </div>
      );
    }
    return (
      <div className="w-full h-full flex items-center min-w-0 group/cell">
        <Linkedin className="w-3 h-3 text-blue-400 shrink-0 mr-1.5" />
        <span
          className="truncate text-sm text-blue-400 cursor-text"
          onClick={startEditing}
          title={cell.value}
        >
          {cell.value}
        </span>
      </div>
    );
  }

  // Person
  if (columnType === 'person') {
    const initials = `${(firstName ?? '')[0] ?? ''}${(lastName ?? '')[0] ?? ''}`.toUpperCase();
    return (
      <div className="w-full h-full flex items-center gap-2 min-w-0 cursor-text" onClick={startEditing}>
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="w-6 h-6 rounded-full object-cover shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <div className={`w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-[10px] font-semibold shrink-0 ${photoUrl ? 'hidden' : ''}`}>
          {initials || <User className="w-3 h-3" />}
        </div>
        <span className="truncate font-medium text-gray-100 text-sm">
          {cell.value || <span className="text-gray-600">Enter name...</span>}
        </span>
      </div>
    );
  }

  // Company
  if (columnType === 'company') {
    return (
      <div className="w-full h-full flex items-center gap-2 min-w-0 cursor-text" onClick={startEditing}>
        {companyDomain ? (
          <img
            src={`https://img.logo.dev/${companyDomain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ&size=32&format=png`}
            alt=""
            className="w-5 h-5 rounded object-contain shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <div className={`w-5 h-5 rounded bg-gray-800 flex items-center justify-center shrink-0 ${companyDomain ? 'hidden' : ''}`}>
          <Building2 className="w-3 h-3 text-gray-500" />
        </div>
        <span className="truncate text-gray-100 text-sm">
          {cell.value || <span className="text-gray-600">Enter company...</span>}
        </span>
      </div>
    );
  }

  // Phone
  if (columnType === 'phone') {
    if (!cell.value) {
      return (
        <div className="w-full h-full flex items-center cursor-text" onClick={startEditing}>
          {isEditing ? renderInput() : <span className="text-gray-600 text-sm">Enter phone...</span>}
        </div>
      );
    }
    if (isEditing) return renderInput();
    return (
      <div className="w-full h-full flex items-center min-w-0 group/cell">
        <Phone className="w-3 h-3 text-emerald-400 shrink-0 mr-1.5" />
        <span
          className="truncate text-sm text-emerald-400 cursor-text"
          onClick={startEditing}
          title={cell.value}
        >
          {cell.value}
        </span>
      </div>
    );
  }

  // Checkbox
  if (columnType === 'checkbox') {
    const checked = cell.value === 'true' || cell.value === '1';
    return (
      <div className="w-full h-full flex items-center justify-center">
        <button
          type="button"
          onClick={() => onEdit?.(checked ? 'false' : 'true')}
          className={`w-5 h-5 rounded border transition-colors flex items-center justify-center ${
            checked
              ? 'bg-violet-500 border-violet-500 text-white'
              : 'border-gray-600 bg-gray-800/50 hover:border-gray-500'
          }`}
        >
          {checked && <Check className="w-3 h-3" />}
        </button>
      </div>
    );
  }

  // Dropdown (single-select)
  if (columnType === 'dropdown') {
    const options = dropdownOptions ?? [];
    const selected = options.find((o) => o.value === cell.value);
    return (
      <div className="w-full h-full flex items-center relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setShowDropdown(!showDropdown)}
          className="w-full h-full flex items-center gap-1.5 cursor-pointer text-left"
        >
          {selected ? (
            <span
              className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: `${selected.color ?? '#6366f1'}20`, color: selected.color ?? '#6366f1' }}
            >
              {selected.label}
            </span>
          ) : (
            <span className="text-gray-600 text-sm">Select...</span>
          )}
          <ChevronDown className="w-3 h-3 text-gray-500 ml-auto" />
        </button>
        {showDropdown && (
          <div className="absolute top-full left-0 z-20 mt-1 min-w-[140px] rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onEdit?.(opt.value);
                  setShowDropdown(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-gray-800 ${
                  opt.value === cell.value ? 'text-violet-300' : 'text-gray-300'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: opt.color ?? '#6366f1' }}
                />
                {opt.label}
              </button>
            ))}
            {cell.value && (
              <>
                <div className="my-1 border-t border-gray-700/60" />
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onEdit?.('');
                    setShowDropdown(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                >
                  <X className="w-3 h-3" />
                  Clear
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // Tags (multi-select)
  if (columnType === 'tags') {
    const options = dropdownOptions ?? [];
    const selectedValues = cell.value ? cell.value.split(',').filter(Boolean) : [];
    const selectedOptions = selectedValues
      .map((v) => options.find((o) => o.value === v))
      .filter(Boolean) as DropdownOption[];

    return (
      <div className="w-full h-full flex items-center relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setShowDropdown(!showDropdown)}
          className="w-full h-full flex items-center gap-1 cursor-pointer overflow-hidden"
        >
          {selectedOptions.length > 0 ? (
            <div className="flex items-center gap-1 overflow-hidden">
              {selectedOptions.map((opt) => (
                <span
                  key={opt.value}
                  className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium shrink-0"
                  style={{ backgroundColor: `${opt.color ?? '#6366f1'}20`, color: opt.color ?? '#6366f1' }}
                >
                  {opt.label}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-gray-600 text-sm">Select tags...</span>
          )}
          <ChevronDown className="w-3 h-3 text-gray-500 ml-auto shrink-0" />
        </button>
        {showDropdown && (
          <div className="absolute top-full left-0 z-20 mt-1 min-w-[160px] rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl">
            {options.map((opt) => {
              const isSelected = selectedValues.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const newValues = isSelected
                      ? selectedValues.filter((v) => v !== opt.value)
                      : [...selectedValues, opt.value];
                    onEdit?.(newValues.join(','));
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-gray-800 ${
                    isSelected ? 'text-violet-300' : 'text-gray-300'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: opt.color ?? '#6366f1' }}
                  />
                  {opt.label}
                  {isSelected && <Check className="w-3 h-3 ml-auto text-violet-400" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Apollo property column — uses Zap icon like enrichment columns
  if (columnType === 'apollo_property' || columnType === 'apollo_org_property') {
    if (isEditing) {
      return renderInput();
    }

    if (cell.status === 'pending') {
      return (
        <div className="w-full h-full flex items-center cursor-text" onClick={startEditing}>
          <span className="text-xs text-blue-300 italic flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
            Enriching...
          </span>
        </div>
      );
    }

    if (cell.status === 'failed') {
      return (
        <div className="w-full h-full flex items-center group/apollo-fail cursor-text" onClick={startEditing}>
          <span className="text-xs text-red-400 flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3" />
            Failed
          </span>
          {onEnrichRow && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEnrichRow(); }}
              className="ml-auto opacity-0 group-hover/apollo-fail:opacity-100 transition-opacity p-0.5 rounded hover:bg-blue-500/20"
              title="Retry enrichment"
            >
              <Zap className="w-3.5 h-3.5 text-blue-400" />
            </button>
          )}
        </div>
      );
    }

    if (cell.status === 'complete' && cell.value != null) {
      return (
        <div className="w-full h-full flex items-center cursor-text group/apollo" onClick={startEditing}>
          <span className="truncate text-sm text-gray-200" title={cell.value}>
            {cell.value}
          </span>
          {onEnrichRow && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEnrichRow(); }}
              className="ml-auto opacity-0 group-hover/apollo:opacity-100 transition-opacity p-0.5 rounded hover:bg-blue-500/20 shrink-0"
              title="Re-enrich this row"
            >
              <Zap className="w-3.5 h-3.5 text-blue-400" />
            </button>
          )}
        </div>
      );
    }

    // No data yet — show zap icon to enrich
    return (
      <div className="w-full h-full flex items-center cursor-text group/apollo-await" onClick={startEditing}>
        <span className="text-gray-600 text-xs italic">Not enriched</span>
        {onEnrichRow && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEnrichRow(); }}
            className="ml-auto opacity-0 group-hover/apollo-await:opacity-100 transition-opacity p-0.5 rounded hover:bg-blue-500/20"
            title="Enrich this row"
          >
            <Zap className="w-3.5 h-3.5 text-blue-400" />
          </button>
        )}
      </div>
    );
  }

  // Integration column (status badge + value)
  if (columnType === 'integration') {
    const statusColors: Record<string, string> = {
      pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
      running: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
      complete: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      failed: 'bg-red-500/15 text-red-400 border-red-500/30',
    };
    const badgeClass = statusColors[cell.status] ?? statusColors.pending;

    if (cell.status === 'pending' || cell.status === 'none') {
      return (
        <div className="w-full h-full flex items-center">
          <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium border ${statusColors.pending}`}>
            <Zap className="w-3 h-3" />
            Pending
          </span>
        </div>
      );
    }

    if (cell.status === 'running') {
      return (
        <div className="w-full h-full flex items-center">
          <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium border ${badgeClass}`}>
            <Loader2 className="w-3 h-3 animate-spin" />
            Running
          </span>
        </div>
      );
    }

    if (cell.status === 'failed') {
      return (
        <div className="w-full h-full flex items-center gap-1.5 cursor-pointer" title={cell.value ?? 'Failed'}>
          <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium border ${badgeClass}`}>
            <AlertCircle className="w-3 h-3" />
            Failed
          </span>
        </div>
      );
    }

    // Complete — show value
    return (
      <div className="w-full h-full flex items-center cursor-default" title={cell.value ?? undefined}>
        <span className="truncate text-sm text-emerald-300">
          {cell.value ?? '—'}
        </span>
      </div>
    );
  }

  // Button / Action column
  if (columnType === 'button' || columnType === 'action') {
    const isRunning = cell.status === 'pending' || cell.status === 'running';
    const isDone = cell.status === 'complete';
    const isFailed = cell.status === 'failed';

    // Resolve dynamic label: replace @column_key refs with row values
    const rawLabel = buttonConfig?.label || '';
    const resolvedLabel = rawLabel.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key) => {
      return rowCellValues?.[key] ?? '';
    }).trim();
    const displayLabel = resolvedLabel || 'Run';
    const btnColor = buttonConfig?.color || '#8b5cf6';

    // Build action summary for tooltip
    const actionSummary = buttonConfig?.actions?.length
      ? buttonConfig.actions.map((a) => a.type.replace(/_/g, ' ')).join(' → ')
      : undefined;

    return (
      <div className="w-full h-full flex items-center justify-center" title={actionSummary}>
        <button
          type="button"
          onClick={() => onEdit?.('execute')}
          disabled={isRunning}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors border"
          style={
            isDone
              ? { borderColor: '#10b98160', backgroundColor: '#10b98115', color: '#10b981' }
              : isFailed
                ? { borderColor: '#ef444460', backgroundColor: '#ef444415', color: '#ef4444' }
                : isRunning
                  ? { borderColor: btnColor + '60', backgroundColor: btnColor + '15', color: btnColor, cursor: 'wait' }
                  : { borderColor: btnColor + '60', backgroundColor: btnColor + '15', color: btnColor }
          }
        >
          {isRunning ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : isDone ? (
            <Check className="w-3 h-3" />
          ) : isFailed ? (
            <AlertCircle className="w-3 h-3" />
          ) : (
            <Play className="w-3 h-3" />
          )}
          {isDone ? displayLabel : isFailed ? displayLabel : isRunning ? displayLabel : displayLabel}
        </button>
      </div>
    );
  }

  // Formula (read-only, computed value)
  if (columnType === 'formula') {
    return (
      <div className="w-full h-full flex items-center cursor-default" title={formulaExpression ?? undefined}>
        <FunctionSquare className="w-3 h-3 text-blue-400 shrink-0 mr-1.5" />
        <span className="truncate text-sm text-blue-300">
          {cell.value ?? <span className="text-gray-600 italic text-xs">No value</span>}
        </span>
      </div>
    );
  }

  // Enrichment value with confidence tint — click to expand full text
  if (isEnrichment && cell.value != null) {
    const confidence = cell.confidence ?? 1;
    const opacityClass =
      confidence >= 0.8
        ? 'text-gray-100'
        : confidence >= 0.5
          ? 'text-gray-300'
          : 'text-gray-400 italic';
    const hasSources = Array.isArray(metadata?.sources) && (metadata.sources as SourceEntry[]).length > 0;
    return (
      <>
        <div
          className="w-full h-full flex items-center cursor-pointer group/enrich"
          onClick={() => setExpanded(true)}
        >
          <span className={`truncate text-sm ${opacityClass} group-hover/enrich:text-violet-300 transition-colors`}>
            {cell.value}
          </span>
          {hasSources && (
            <ExternalLink className="w-3 h-3 ml-1 shrink-0 text-gray-600 group-hover/enrich:text-violet-400 transition-colors" />
          )}
          {onEnrichRow && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEnrichRow(); }}
              className="ml-auto opacity-0 group-hover/enrich:opacity-100 transition-opacity p-0.5 rounded hover:bg-violet-500/20 shrink-0"
              title="Re-enrich this row"
            >
              <Zap className="w-3.5 h-3.5 text-violet-400" />
            </button>
          )}
        </div>
        {expanded && createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            onClick={() => { setExpanded(false); setCopied(false); }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div
              className="relative z-10 w-full max-w-lg mx-4 rounded-xl border border-gray-700/80 bg-gray-900 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-medium text-gray-200">{columnLabel || 'Enrichment'}</span>
                  {confidence < 1 && (
                    <span className="text-xs text-gray-500 ml-1">
                      {Math.round(confidence * 100)}% confidence
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(cell.value ?? '');
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                    title="Copy to clipboard"
                  >
                    {copied ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setExpanded(false); setCopied(false); }}
                    className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="px-4 py-4 max-h-[60vh] overflow-y-auto">
                <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
                  {cell.value}
                </p>
                {(() => {
                  const sources = (metadata?.sources ?? []) as SourceEntry[];
                  if (sources.length === 0) return null;
                  return (
                    <div className="mt-4 pt-3 border-t border-gray-800">
                      <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">Sources</p>
                      <ul className="space-y-1.5">
                        {sources.map((src, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-gray-400">
                            <ExternalLink className="w-3 h-3 mt-0.5 shrink-0 text-gray-500" />
                            {src.url ? (
                              <a
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-violet-300 transition-colors underline underline-offset-2 break-all"
                              >
                                {src.title || src.url}
                              </a>
                            ) : (
                              <span>{src.title || 'Unknown source'}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  // Enrichment column with no value yet (empty / not yet run)
  if (isEnrichment && cell.status === 'none') {
    return (
      <div className="w-full h-full flex items-center cursor-default group/enrich-await">
        <span className="text-gray-600 text-xs italic">Awaiting enrichment</span>
        {onEnrichRow && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEnrichRow(); }}
            className="ml-auto opacity-0 group-hover/enrich-await:opacity-100 transition-opacity p-0.5 rounded hover:bg-violet-500/20"
            title="Enrich this row"
          >
            <Zap className="w-3.5 h-3.5 text-violet-400" />
          </button>
        )}
      </div>
    );
  }

  // --- Instantly column subtypes ---
  if (columnType === 'instantly') {
    const config = integrationConfig as InstantlyColumnConfig | null | undefined;
    const subtype = config?.instantly_subtype;

    // Campaign config — shows campaign name + status badge
    if (subtype === 'campaign_config') {
      const campaignName = config?.campaign_name || cell.value;
      const campaignStatus = (config as Record<string, unknown>)?.campaign_status as string | undefined;
      const isActive = campaignStatus === 'active' || campaignStatus === '1';
      const isPaused = campaignStatus === 'paused' || campaignStatus === 'draft' || campaignStatus === '0';
      const badgeBg = isActive ? 'bg-green-500/15' : isPaused ? 'bg-amber-500/15' : 'bg-blue-500/15';
      const badgeText = isActive ? 'text-green-400' : isPaused ? 'text-amber-400' : 'text-blue-400';
      const badgeBorder = isActive ? 'border-green-500/30' : isPaused ? 'border-amber-500/30' : 'border-blue-500/30';
      return (
        <div className="w-full h-full flex items-center min-w-0">
          <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium ${badgeBg} ${badgeText} border ${badgeBorder}`}>
            <Send className="w-3 h-3" />
            {campaignName || 'No campaign'}
          </span>
        </div>
      );
    }

    // Push action — button to push row to Instantly
    if (subtype === 'push_action') {
      const isRunning = cell.status === 'pending';
      const isDone = cell.status === 'complete';
      const isFailed = cell.status === 'failed';
      return (
        <div className="w-full h-full flex items-center justify-center">
          <button
            type="button"
            onClick={() => onEdit?.('execute')}
            disabled={isRunning}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors border"
            style={
              isDone
                ? { borderColor: '#10b98160', backgroundColor: '#10b98115', color: '#10b981' }
                : isFailed
                  ? { borderColor: '#ef444460', backgroundColor: '#ef444415', color: '#ef4444' }
                  : isRunning
                    ? { borderColor: '#3b82f660', backgroundColor: '#3b82f615', color: '#3b82f6', cursor: 'wait' }
                    : { borderColor: '#3b82f660', backgroundColor: '#3b82f615', color: '#3b82f6' }
            }
          >
            {isRunning ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : isDone ? (
              <Check className="w-3 h-3" />
            ) : isFailed ? (
              <AlertCircle className="w-3 h-3" />
            ) : (
              <Send className="w-3 h-3" />
            )}
            {isDone ? 'Repush' : isFailed ? 'Retry' : isRunning ? 'Pushing...' : 'Push'}
          </button>
        </div>
      );
    }

    // Engagement status — colored badge
    if (subtype === 'engagement_status') {
      const status = cell.value;
      if (!status) {
        return (
          <div className="w-full h-full flex items-center">
            <span className="text-gray-600 text-xs italic">—</span>
          </div>
        );
      }
      const statusColors: Record<string, string> = {
        Interested: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        'Meeting Booked': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        'Meeting Completed': 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
        Closed: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
        'Not Interested': 'bg-red-500/15 text-red-400 border-red-500/30',
        'Out of Office': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
        'Wrong Person': 'bg-orange-500/15 text-orange-400 border-orange-500/30',
      };
      const badgeClass = statusColors[status] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/30';
      return (
        <div className="w-full h-full flex items-center">
          <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium border ${badgeClass}`}>
            {status}
          </span>
        </div>
      );
    }

    // Email status — badge (Sent, Opened, Replied, Bounced)
    if (subtype === 'email_status') {
      const status = cell.value;
      if (!status) {
        return (
          <div className="w-full h-full flex items-center">
            <span className="text-gray-600 text-xs italic">—</span>
          </div>
        );
      }
      const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
        Sent: { color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', icon: <Send className="w-3 h-3" /> },
        Opened: { color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: <Eye className="w-3 h-3" /> },
        Replied: { color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: <MessageSquare className="w-3 h-3" /> },
        Bounced: { color: 'bg-red-500/15 text-red-400 border-red-500/30', icon: <AlertCircle className="w-3 h-3" /> },
      };
      const cfg = statusConfig[status] ?? { color: 'bg-gray-500/15 text-gray-400 border-gray-500/30', icon: null };
      return (
        <div className="w-full h-full flex items-center">
          <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium border ${cfg.color}`}>
            {cfg.icon}
            {status}
          </span>
        </div>
      );
    }

    // Last contacted — relative date
    if (subtype === 'last_contacted') {
      if (!cell.value) {
        return (
          <div className="w-full h-full flex items-center">
            <span className="text-gray-600 text-xs italic">—</span>
          </div>
        );
      }
      const date = new Date(cell.value);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const relative = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : `${diffDays}d ago`;
      return (
        <div className="w-full h-full flex items-center gap-1.5" title={date.toLocaleString()}>
          <Clock className="w-3 h-3 text-gray-500 shrink-0" />
          <span className="text-sm text-gray-300">{relative}</span>
        </div>
      );
    }

    // Reply count / Open count — plain number
    if (subtype === 'reply_count' || subtype === 'open_count') {
      const icon = subtype === 'reply_count'
        ? <MessageSquare className="w-3 h-3 text-emerald-500 shrink-0" />
        : <Eye className="w-3 h-3 text-amber-500 shrink-0" />;
      const count = cell.value ? Number(cell.value) : 0;
      return (
        <div className="w-full h-full flex items-center gap-1.5">
          {icon}
          <span className={`text-sm ${count > 0 ? 'text-gray-200 font-medium' : 'text-gray-600'}`}>
            {count}
          </span>
        </div>
      );
    }

    // Sequence step — editable text with step indicator
    if (subtype === 'sequence_step') {
      const stepNum = config?.step_config?.step_number ?? 0;
      const stepField = config?.step_config?.field ?? 'body';
      if (isEditing) return renderInput();
      return (
        <div className="w-full h-full flex items-center gap-1.5 min-w-0 cursor-text" onClick={startEditing}>
          <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-violet-500/20 text-violet-400 shrink-0">
            {stepNum}
          </span>
          <span className="text-[10px] text-gray-500 uppercase shrink-0">{stepField === 'subject' ? 'Subj' : 'Body'}</span>
          <span className="truncate text-sm text-gray-200" title={cell.value ?? undefined}>
            {cell.value || <span className="text-gray-600">Enter content...</span>}
          </span>
        </div>
      );
    }

    // Fallback for unknown subtype
    return (
      <div className="w-full h-full flex items-center">
        <span className="truncate text-sm text-gray-200">{cell.value ?? '—'}</span>
      </div>
    );
  }

  // Signal column — read-only badge showing latest signal
  if (columnType === 'signal') {
    if (!cell.value) {
      return (
        <div className="w-full h-full flex items-center">
          <span className="text-gray-600 text-xs italic">No signals</span>
        </div>
      );
    }
    // cell.value is the signal summary text, metadata may contain signal_type and severity
    const signalType = (metadata?.signal_type as string) ?? '';
    const severity = (metadata?.severity as string) ?? 'low';
    const severityColors: Record<string, string> = {
      critical: 'border-red-400 bg-red-500/10 text-red-400',
      high: 'border-orange-400 bg-orange-500/10 text-orange-400',
      medium: 'border-yellow-400 bg-yellow-500/10 text-yellow-400',
      low: 'border-gray-600 bg-gray-500/10 text-gray-400',
    };
    const badgeClass = severityColors[severity] ?? severityColors.low;
    return (
      <div className="w-full h-full flex items-center" title={cell.value}>
        <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${badgeClass}`}>
          <Radio className="w-3 h-3" />
          <span className="truncate max-w-[120px]">{cell.value}</span>
        </span>
      </div>
    );
  }

  // Default: text cell — click to type
  return (
    <div className="w-full h-full flex items-center cursor-text" onClick={startEditing}>
      <span className="truncate text-sm text-gray-200" title={cell.value ?? undefined}>
        {cell.value || <span className="text-gray-600">Type here...</span>}
      </span>
    </div>
  );
};

export default OpsTableCell;
