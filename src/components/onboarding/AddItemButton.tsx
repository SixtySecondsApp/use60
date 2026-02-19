/**
 * AddItemButton Component
 *
 * Button that toggles to an inline input for adding new items.
 * Used across skill configuration for adding criteria, questions, etc.
 */

import { useState, useCallback, KeyboardEvent, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AddItemButtonProps {
  onAdd: (value: string) => void;
  placeholder: string;
  className?: string;
  disabled?: boolean;
}

export function AddItemButton({
  onAdd,
  placeholder,
  className,
  disabled,
}: AddItemButtonProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  const handleAdd = useCallback(() => {
    if (value.trim()) {
      onAdd(value.trim());
      setValue('');
    }
    setIsAdding(false);
  }, [value, onAdd]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAdd();
    } else if (e.key === 'Escape') {
      setValue('');
      setIsAdding(false);
    }
  }, [handleAdd]);

  if (isAdding) {
    return (
      <div className={cn(
        'flex items-center gap-2 p-2 rounded-lg bg-gray-800',
        className
      )}>
        <Plus className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleAdd}
          placeholder={placeholder}
          className="flex-1 text-sm bg-transparent outline-none text-white placeholder-gray-500"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsAdding(true)}
      disabled={disabled}
      className={cn(
        'w-full flex items-center gap-2 p-2 rounded-lg border-2 border-dashed transition-colors',
        'border-gray-700 text-gray-500 hover:border-violet-500 hover:text-violet-400',
        disabled && 'opacity-50 cursor-not-allowed hover:border-gray-700 hover:text-gray-500',
        className
      )}
    >
      <Plus className="w-3.5 h-3.5" />
      <span className="text-sm">{placeholder}</span>
    </button>
  );
}
