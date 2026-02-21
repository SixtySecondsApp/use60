import React, { useState, useEffect, useRef } from 'react';
import { Building2, Tag, X, Search } from 'lucide-react';
import {
  searchIndustries,
  searchIndustryTags,
} from '@/lib/services/aiArkReferenceService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AiArkIndustryPickerProps {
  value: { industries: string[]; tags: string[] };
  onChange: (value: { industries: string[]; tags: string[] }) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AiArkIndustryPicker({
  value,
  onChange,
  className,
}: AiArkIndustryPickerProps) {
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Derived results — pure computation, no async needed (service is synchronous)
  const industryResults = searchIndustries(query, 8).filter(
    (item) => !value.industries.includes(item),
  );
  const tagResults = searchIndustryTags(query, 8).filter(
    (item) => !value.tags.includes(item),
  );

  const hasResults = industryResults.length > 0 || tagResults.length > 0;

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDropdown]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const addIndustry = (item: string) => {
    if (!value.industries.includes(item)) {
      onChange({ ...value, industries: [...value.industries, item] });
    }
    setQuery('');
    setShowDropdown(false);
  };

  const removeIndustry = (item: string) => {
    onChange({ ...value, industries: value.industries.filter((i) => i !== item) });
  };

  const addTag = (item: string) => {
    if (!value.tags.includes(item)) {
      onChange({ ...value, tags: [...value.tags, item] });
    }
    setQuery('');
    setShowDropdown(false);
  };

  const removeTag = (item: string) => {
    onChange({ ...value, tags: value.tags.filter((t) => t !== item) });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowDropdown(false);
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      // Pick the first available result (prefer industries)
      if (industryResults.length > 0) {
        addIndustry(industryResults[0]);
      } else if (tagResults.length > 0) {
        addTag(tagResults[0]);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div ref={containerRef} className={className}>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">
        Industries &amp; Tags
      </label>

      {/* Search input */}
      <div className="relative">
        <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 focus-within:border-blue-500 transition-colors">
          <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search industries or tags…"
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
          />
        </div>

        {/* Dropdown */}
        {showDropdown && hasResults && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl max-h-[300px] overflow-y-auto">

            {/* Industries section */}
            {industryResults.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 px-3 py-1.5">
                  <Building2 className="w-3 h-3 text-zinc-500" />
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                    Industries
                  </span>
                </div>
                {industryResults.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => addIndustry(item)}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-700/50 transition-colors"
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}

            {/* Tags section */}
            {tagResults.length > 0 && (
              <div className={industryResults.length > 0 ? 'border-t border-zinc-700/50' : ''}>
                <div className="flex items-center gap-1.5 px-3 py-1.5">
                  <Tag className="w-3 h-3 text-zinc-500" />
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                    Tags
                  </span>
                </div>
                {tagResults.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => addTag(item)}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-700/50 transition-colors"
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected chips */}
      {(value.industries.length > 0 || value.tags.length > 0) && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {value.industries.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs border bg-blue-500/20 text-blue-300 border-blue-500/30"
            >
              <Building2 className="w-3 h-3 opacity-70" />
              {item}
              <button
                type="button"
                onClick={() => removeIndustry(item)}
                className="text-blue-400 hover:text-blue-200 ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {value.tags.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs border bg-purple-500/20 text-purple-300 border-purple-500/30"
            >
              <Tag className="w-3 h-3 opacity-70" />
              {item}
              <button
                type="button"
                onClick={() => removeTag(item)}
                className="text-purple-400 hover:text-purple-200 ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
