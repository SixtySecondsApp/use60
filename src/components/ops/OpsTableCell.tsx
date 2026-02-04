import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Mail, Linkedin, Building2, AlertCircle, Loader2, User } from 'lucide-react';

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
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(cell.value ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

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
