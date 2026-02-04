import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Mail, Linkedin, Building2, AlertCircle, Loader2, User } from 'lucide-react';

interface CellData {
  value: string | null;
  confidence: number | null;
  status: 'none' | 'pending' | 'complete' | 'failed';
}

interface DynamicTableCellProps {
  cell: CellData;
  columnType: string;
  isEnrichment: boolean;
  firstName?: string;
  lastName?: string;
  onEdit?: (value: string) => void;
}

/**
 * Renders a single cell in the DynamicTable.
 * Handles different column types with appropriate visuals, click-to-edit for text,
 * enrichment status indicators, and ICP score badges.
 */
export const DynamicTableCell: React.FC<DynamicTableCellProps> = ({
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
      inputRef.current.select();
    }
  }, [isEditing]);

  // Sync local edit value when cell value changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditValue(cell.value ?? '');
    }
  }, [cell.value, isEditing]);

  const handleDoubleClick = useCallback(() => {
    if (onEdit && columnType === 'text') {
      setIsEditing(true);
      setEditValue(cell.value ?? '');
    }
  }, [onEdit, columnType, cell.value]);

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
      }
    },
    [commitEdit, cancelEdit],
  );

  // --- Enrichment status indicators (shown before value rendering) ---
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

    if (cell.status === 'none' || cell.value == null) {
      return <span className="text-gray-600 select-none">&mdash;</span>;
    }
  }

  // --- Inline editing for text cells ---
  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={handleKeyDown}
        className="w-full h-full bg-gray-900 border border-blue-500/60 rounded px-1.5 py-0.5 text-sm text-gray-100 outline-none focus:ring-1 focus:ring-blue-500/40"
      />
    );
  }

  // --- Column type renderers ---

  // ICP Score badge
  if (columnType === 'icp_score') {
    const score = cell.value != null ? Number(cell.value) : null;
    if (score == null || isNaN(score)) {
      return <span className="text-gray-600 select-none">&mdash;</span>;
    }
    const badgeClasses =
      score >= 9
        ? 'bg-emerald-500/20 text-emerald-400 ring-emerald-500/30'
        : score >= 7
          ? 'bg-blue-500/20 text-blue-400 ring-blue-500/30'
          : 'bg-yellow-500/20 text-yellow-400 ring-yellow-500/30';
    return (
      <span
        className={`inline-flex items-center justify-center w-7 h-6 rounded text-xs font-bold ring-1 ${badgeClasses}`}
      >
        {score}
      </span>
    );
  }

  // Email
  if (columnType === 'email') {
    if (!cell.value) {
      return (
        <span className="text-red-500 text-xs flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          No email
        </span>
      );
    }
    return (
      <a
        href={`mailto:${cell.value}`}
        className="text-blue-400 hover:text-blue-300 hover:underline truncate block text-sm"
        title={cell.value}
      >
        {cell.value}
      </a>
    );
  }

  // LinkedIn
  if (columnType === 'linkedin') {
    if (!cell.value) {
      return <span className="text-gray-600 select-none">&mdash;</span>;
    }
    const href = cell.value.startsWith('http') ? cell.value : `https://${cell.value}`;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 hover:text-blue-300 hover:underline truncate block text-xs"
        title={cell.value}
      >
        {cell.value}
      </a>
    );
  }

  // Person
  if (columnType === 'person') {
    const initials = `${(firstName ?? '')[0] ?? ''}${(lastName ?? '')[0] ?? ''}`.toUpperCase();
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-[10px] font-semibold shrink-0">
          {initials || <User className="w-3 h-3" />}
        </div>
        <span className="truncate font-medium text-gray-100">
          {cell.value || <span className="text-gray-600">&mdash;</span>}
        </span>
      </div>
    );
  }

  // Company
  if (columnType === 'company') {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-5 h-5 rounded bg-gray-800 flex items-center justify-center shrink-0">
          <Building2 className="w-3 h-3 text-gray-500" />
        </div>
        <span className="truncate text-gray-100">
          {cell.value || <span className="text-gray-600">&mdash;</span>}
        </span>
      </div>
    );
  }

  // Enrichment value with confidence tint
  if (isEnrichment && cell.value != null) {
    const confidence = cell.confidence ?? 1;
    const opacityClass =
      confidence >= 0.8
        ? 'text-gray-100'
        : confidence >= 0.5
          ? 'text-gray-300'
          : 'text-gray-400 italic';
    return (
      <span className={`truncate block text-sm ${opacityClass}`} title={cell.value}>
        {cell.value}
      </span>
    );
  }

  // Default text (with click-to-edit support)
  if (!cell.value) {
    return <span className="text-gray-600 select-none">&mdash;</span>;
  }

  return (
    <span
      className="truncate block text-sm text-gray-200 cursor-default"
      onDoubleClick={handleDoubleClick}
      title={cell.value}
    >
      {cell.value}
    </span>
  );
};

export default DynamicTableCell;
