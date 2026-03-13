/**
 * EditableTag Component
 *
 * Tag chip with inline edit and remove functionality.
 * Used for "words to avoid" and similar tag-based lists.
 */

import { useState, useCallback, KeyboardEvent, useRef, useEffect } from 'react';
import { Pencil, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditableTagProps {
  value: string;
  onSave: (newValue: string) => void;
  onDelete: () => void;
  className?: string;
}

export function EditableTag({
  value,
  onSave,
  onDelete,
  className,
}: EditableTagProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    if (editValue.trim()) {
      onSave(editValue.trim());
    }
    setIsEditing(false);
  }, [editValue, onSave]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
  }, [handleSave, value]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        className={cn(
          'px-2.5 py-1 text-sm rounded-full w-24 outline-none ring-2 ring-violet-500 bg-gray-800 text-white',
          className
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        'group px-2.5 py-1 text-sm rounded-full flex items-center gap-1.5 transition-colors',
        'bg-gray-800 text-gray-300 hover:bg-gray-700',
        className
      )}
    >
      <span>{value}</span>
      <button
        onClick={() => setIsEditing(true)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-violet-400"
      >
        <Pencil className="w-3 h-3" />
      </button>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}
