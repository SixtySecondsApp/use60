/**
 * ScriptEditor — Textarea with @-mention autocomplete for column variables.
 *
 * Type `@` to open a dropdown of available columns. Selecting one inserts
 * `{{column_key}}` at the cursor position. Variable chips are shown below
 * as a secondary insertion method.
 */

import React, { useState, useRef, useEffect } from 'react';

interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  columns: { key: string; label: string }[];
  /** Column keys to exclude from suggestions (e.g. the output column itself) */
  excludeKeys?: string[];
  placeholder?: string;
  rows?: number;
  className?: string;
}

export function ScriptEditor({
  value,
  onChange,
  columns,
  excludeKeys = [],
  placeholder,
  rows = 5,
  className,
}: ScriptEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownFilter, setDropdownFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Keep refs in sync so event handlers always see latest values
  const mentionStartRef = useRef(mentionStart);
  mentionStartRef.current = mentionStart;
  const valueRef = useRef(value);
  valueRef.current = value;

  const excludeSet = new Set(excludeKeys);
  const availableColumns = columns.filter((c) => !excludeSet.has(c.key));

  const filteredColumns = availableColumns.filter((c) => {
    if (!dropdownFilter) return true;
    const q = dropdownFilter.toLowerCase();
    return c.key.toLowerCase().includes(q) || c.label.toLowerCase().includes(q);
  });

  // Position the dropdown near the caret using a simple heuristic
  const updateDropdownPosition = () => {
    const el = textareaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Approximate caret position based on text before cursor
    const textBefore = value.slice(0, el.selectionStart);
    const lines = textBefore.split('\n');
    const lineIndex = lines.length - 1;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const paddingTop = parseFloat(getComputedStyle(el).paddingTop) || 8;
    const paddingLeft = parseFloat(getComputedStyle(el).paddingLeft) || 12;

    const top = rect.top + paddingTop + (lineIndex + 1) * lineHeight - el.scrollTop + 4;
    // Rough char width estimate for monospace
    const charWidth = 7.8;
    const lastLineLen = lines[lines.length - 1].length;
    const left = rect.left + paddingLeft + Math.min(lastLineLen * charWidth, rect.width - 240);

    setDropdownPos({
      top: Math.min(top, rect.bottom),
      left: Math.max(left, rect.left + paddingLeft),
    });
  };

  const insertAtCursor = (colKey: string, removeFrom?: number) => {
    const el = textareaRef.current;
    const tag = `{{${colKey}}}`;

    if (el) {
      const cursorPos = el.selectionStart;
      const start = removeFrom !== undefined ? removeFrom : cursorPos;
      const before = value.slice(0, start);
      const after = value.slice(cursorPos);
      const next = before + tag + after;
      onChange(next);
      const newCursor = start + tag.length;
      requestAnimationFrame(() => {
        el.focus();
        el.selectionStart = el.selectionEnd = newCursor;
      });
    } else {
      onChange(value + tag);
    }

    setShowDropdown(false);
    setMentionStart(null);
    setDropdownFilter('');
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    const el = e.target;
    const pos = el.selectionStart;
    const ms = mentionStartRef.current;

    // Check if we're in a mention context
    if (ms !== null) {
      if (pos <= ms) {
        setShowDropdown(false);
        setMentionStart(null);
        setDropdownFilter('');
      } else {
        const filterText = newValue.slice(ms, pos);
        if (/\s/.test(filterText) || filterText.includes('{') || filterText.includes('}')) {
          setShowDropdown(false);
          setMentionStart(null);
          setDropdownFilter('');
        } else {
          setDropdownFilter(filterText);
          setSelectedIndex(0);
        }
      }
      return;
    }

    // Detect new @ trigger
    if (pos > 0 && newValue[pos - 1] === '@') {
      const charBefore = pos > 1 ? newValue[pos - 2] : ' ';
      if (/[\s\n]/.test(charBefore) || pos === 1) {
        setMentionStart(pos);
        setDropdownFilter('');
        setSelectedIndex(0);
        setShowDropdown(true);
        requestAnimationFrame(updateDropdownPosition);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showDropdown || filteredColumns.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filteredColumns.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const ms = mentionStartRef.current;
      if (ms !== null) {
        // Remove the @ and any filter text, insert the tag
        insertAtCursor(filteredColumns[selectedIndex].key, ms - 1);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowDropdown(false);
      setMentionStart(null);
      setDropdownFilter('');
    }
  };

  const handleDropdownClick = (colKey: string) => {
    const ms = mentionStartRef.current;
    if (ms !== null) {
      insertAtCursor(colKey, ms - 1);
    } else {
      insertAtCursor(colKey);
    }
  };

  // Close dropdown on blur (with small delay for click to register)
  const handleBlur = () => {
    setTimeout(() => {
      setShowDropdown(false);
      setMentionStart(null);
      setDropdownFilter('');
    }, 200);
  };

  // Scroll selected item into view
  useEffect(() => {
    if (!showDropdown || !dropdownRef.current) return;
    const item = dropdownRef.current.children[selectedIndex] as HTMLElement;
    if (item) item.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, showDropdown]);

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          rows={rows}
          placeholder={placeholder}
          className={className || 'w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-purple-500 resize-none font-mono leading-relaxed'}
        />

        {/* @ mention dropdown */}
        {showDropdown && filteredColumns.length > 0 && (
          <div
            ref={dropdownRef}
            className="fixed z-[10000] w-56 max-h-48 overflow-y-auto rounded-lg border border-gray-600 bg-gray-800 shadow-xl py-1"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            {filteredColumns.slice(0, 20).map((col, i) => (
              <button
                key={col.key}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleDropdownClick(col.key);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                  i === selectedIndex
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                <span className="font-medium">{col.label}</span>
                <span className="ml-1.5 text-gray-500 font-mono text-[10px]">{`{{${col.key}}}`}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hint */}
      <p className="text-[10px] text-gray-600">
        Type <span className="font-mono text-gray-500">@</span> to insert a column variable, or click a chip below.
      </p>

      {/* Variable chips */}
      {availableColumns.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {availableColumns.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => insertAtCursor(c.key)}
              className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-mono border border-gray-700 bg-gray-800 text-gray-400 hover:text-purple-300 hover:border-purple-500/40 transition-colors"
            >
              {`{{${c.key}}}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
