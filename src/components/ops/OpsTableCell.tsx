import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Mail, Linkedin, Building2, AlertCircle, Loader2, User, Phone, Check, X, ChevronDown, FunctionSquare, Zap, Play } from 'lucide-react';
import type { DropdownOption } from '@/lib/services/opsTableService';

interface CellData {
  value: string | null;
  confidence: number | null;
  status: 'none' | 'pending' | 'complete' | 'failed';
}

interface OpsTableCellProps {
  cell: CellData;
  columnType: string;
  isEnrichment: boolean;
  firstName?: string;
  lastName?: string;
  onEdit?: (value: string) => void;
  dropdownOptions?: DropdownOption[] | null;
  formulaExpression?: string | null;
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
  onEdit,
  dropdownOptions,
  formulaExpression,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(cell.value ?? '');
  const [showDropdown, setShowDropdown] = useState(false);
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
        <span className="text-xs text-gray-500 italic flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
          Enriching...
        </span>
      );
    }

    if (cell.status === 'failed') {
      return (
        <span className="text-xs text-red-400 flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3" />
          Failed
        </span>
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
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-[10px] font-semibold shrink-0">
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
        <div className="w-5 h-5 rounded bg-gray-800 flex items-center justify-center shrink-0">
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

  // Action column (button)
  if (columnType === 'action') {
    const isRunning = cell.status === 'pending' || cell.status === 'running';
    const isDone = cell.status === 'complete';
    const isFailed = cell.status === 'failed';

    return (
      <div className="w-full h-full flex items-center justify-center">
        <button
          type="button"
          onClick={() => onEdit?.('execute')}
          disabled={isRunning}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors border ${
            isDone
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : isFailed
                ? 'border-red-500/30 bg-red-500/10 text-red-400'
                : isRunning
                  ? 'border-blue-500/30 bg-blue-500/10 text-blue-400 cursor-wait'
                  : 'border-violet-500/30 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20'
          }`}
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
          {isDone ? 'Done' : isFailed ? 'Retry' : isRunning ? 'Running' : 'Run'}
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

  // Enrichment value with confidence tint (read-only — no click-to-edit)
  if (isEnrichment && cell.value != null) {
    const confidence = cell.confidence ?? 1;
    const opacityClass =
      confidence >= 0.8
        ? 'text-gray-100'
        : confidence >= 0.5
          ? 'text-gray-300'
          : 'text-gray-400 italic';
    return (
      <div className="w-full h-full flex items-center cursor-default">
        <span className={`truncate text-sm ${opacityClass}`} title={cell.value}>
          {cell.value}
        </span>
      </div>
    );
  }

  // Enrichment column with no value yet (empty / not yet run)
  if (isEnrichment && cell.status === 'none') {
    return (
      <div className="w-full h-full flex items-center cursor-default">
        <span className="text-gray-600 text-xs italic">Awaiting enrichment</span>
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
