import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, Loader2, MessageSquare, Clock, Sparkles, X } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

interface AiQueryBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  columns: { key: string; label: string; column_type: string }[];
  tableId: string;
}

interface Suggestion {
  category: string;
  categoryColor: string;
  text: string;
}

// =============================================================================
// Helpers
// =============================================================================

const HISTORY_KEY_PREFIX = 'ops-query-history-';
const MAX_HISTORY = 10;

function getHistory(tableId: string): string[] {
  try {
    const raw = localStorage.getItem(`${HISTORY_KEY_PREFIX}${tableId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToHistory(tableId: string, query: string) {
  try {
    const history = getHistory(tableId);
    const filtered = history.filter((q) => q !== query);
    filtered.unshift(query);
    localStorage.setItem(
      `${HISTORY_KEY_PREFIX}${tableId}`,
      JSON.stringify(filtered.slice(0, MAX_HISTORY))
    );
  } catch {
    // Silently fail
  }
}

function generateSuggestions(columns: { key: string; label: string; column_type: string }[]): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Find relevant columns for contextual suggestions
  const emailCol = columns.find((c) =>
    c.column_type === 'email' || c.key.includes('email') || c.label.toLowerCase().includes('email')
  );
  const phoneCol = columns.find((c) =>
    c.column_type === 'phone' || c.key.includes('phone') || c.label.toLowerCase().includes('phone')
  );
  const nameCol = columns.find((c) =>
    c.column_type === 'person' || c.key.includes('name') || c.label.toLowerCase().includes('name')
  );
  const companyCol = columns.find((c) =>
    c.column_type === 'company' || c.key.includes('company') || c.label.toLowerCase().includes('company')
  );
  const statusCol = columns.find((c) =>
    c.column_type === 'status' || c.column_type === 'dropdown' ||
    c.key.includes('status') || c.key.includes('stage') || c.key.includes('lifecycle')
  );
  const titleCol = columns.find((c) =>
    c.key.includes('title') || c.label.toLowerCase().includes('title') || c.label.toLowerCase().includes('role')
  );

  // Cleanup suggestions
  if (emailCol) {
    suggestions.push({
      category: 'Cleanup',
      categoryColor: 'text-amber-400',
      text: `Delete rows with blank ${emailCol.label.toLowerCase()}s`,
    });
  }
  if (phoneCol) {
    suggestions.push({
      category: 'Cleanup',
      categoryColor: 'text-amber-400',
      text: `Fix formatting on all ${phoneCol.label.toLowerCase()}s to E.164`,
    });
  }
  if (nameCol) {
    suggestions.push({
      category: 'Cleanup',
      categoryColor: 'text-amber-400',
      text: `Trim whitespace from ${nameCol.label.toLowerCase()} fields`,
    });
  }

  // Segment suggestions
  if (titleCol) {
    suggestions.push({
      category: 'Segment',
      categoryColor: 'text-blue-400',
      text: `Show only decision-makers (Director, VP, C-suite)`,
    });
  }
  if (companyCol) {
    suggestions.push({
      category: 'Segment',
      categoryColor: 'text-blue-400',
      text: `Create a view for each unique ${companyCol.label.toLowerCase()}`,
    });
  }

  // Analyze suggestions
  if (statusCol) {
    suggestions.push({
      category: 'Analyze',
      categoryColor: 'text-violet-400',
      text: `How many leads per ${statusCol.label.toLowerCase()}?`,
    });
  }
  if (emailCol) {
    suggestions.push({
      category: 'Analyze',
      categoryColor: 'text-violet-400',
      text: `What percentage of leads have ${emailCol.label.toLowerCase()}s?`,
    });
  }

  // Enrich suggestions
  if (titleCol && companyCol) {
    suggestions.push({
      category: 'Enrich',
      categoryColor: 'text-emerald-400',
      text: `Add a column that scores leads 1-5 by seniority`,
    });
  }

  // Dedup suggestion
  if (emailCol) {
    suggestions.push({
      category: 'Cleanup',
      categoryColor: 'text-amber-400',
      text: `Remove duplicate ${emailCol.label.toLowerCase()}s, keep most recent`,
    });
  }

  // Export
  suggestions.push({
    category: 'Export',
    categoryColor: 'text-gray-400',
    text: 'Export all rows to CSV',
  });

  return suggestions.slice(0, 8);
}

// =============================================================================
// Component
// =============================================================================

export function AiQueryBar({
  value,
  onChange,
  onSubmit,
  isLoading,
  columns,
  tableId,
}: AiQueryBarProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => generateSuggestions(columns), [columns]);
  const history = useMemo(() => getHistory(tableId), [tableId]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setShowHistory(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cmd+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        if (!value) setShowDropdown(true);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [value]);

  const handleFocus = useCallback(() => {
    if (!value) {
      setShowDropdown(true);
      setShowHistory(false);
    }
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDropdown(false);
        setShowHistory(false);
        inputRef.current?.blur();
      }
      if (e.key === 'ArrowUp' && !value) {
        e.preventDefault();
        setShowHistory(true);
        setShowDropdown(false);
      }
    },
    [value]
  );

  const handleSelectSuggestion = useCallback(
    (text: string) => {
      onChange(text);
      setShowDropdown(false);
      setShowHistory(false);
      inputRef.current?.focus();
    },
    [onChange]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      if (value.trim()) {
        saveToHistory(tableId, value.trim());
      }
      setShowDropdown(false);
      setShowHistory(false);
      onSubmit(e);
    },
    [value, tableId, onSubmit]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
      if (e.target.value) {
        setShowDropdown(false);
        setShowHistory(false);
      }
    },
    [onChange]
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <form onSubmit={handleSubmit}>
        <div className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-2.5 transition-colors focus-within:border-violet-500/40 focus-within:ring-1 focus-within:ring-violet-500/20">
          {isLoading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-400" />
          ) : (
            <Sparkles className="h-4 w-4 shrink-0 text-gray-500" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="Ask anything... e.g. 'Delete rows with blank emails' or 'How many leads per stage?'"
            className="min-w-0 flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none disabled:opacity-50"
          />
          <kbd className="hidden shrink-0 items-center gap-0.5 rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500 sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
          <button
            type="submit"
            disabled={!value.trim() || isLoading}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </form>

      {/* Suggestions dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-xl">
          <div className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-gray-500">
            Suggestions
          </div>
          {suggestions.map((s, idx) => (
            <button
              key={idx}
              onClick={() => handleSelectSuggestion(s.text)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-800"
            >
              <span className={`shrink-0 text-[10px] font-medium uppercase tracking-wider ${s.categoryColor}`}>
                {s.category}
              </span>
              <span className="truncate text-gray-300">{s.text}</span>
            </button>
          ))}
        </div>
      )}

      {/* History dropdown */}
      {showHistory && history.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-xl">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Recent queries
            </span>
            <button
              onClick={() => {
                localStorage.removeItem(`${HISTORY_KEY_PREFIX}${tableId}`);
                setShowHistory(false);
              }}
              className="text-[10px] text-gray-600 hover:text-gray-400"
            >
              Clear
            </button>
          </div>
          {history.map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleSelectSuggestion(q)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-800"
            >
              <Clock className="h-3 w-3 shrink-0 text-gray-600" />
              <span className="truncate text-gray-400">{q}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
