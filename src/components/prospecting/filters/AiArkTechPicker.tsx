import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Check, Cpu } from 'lucide-react';
import { searchTechnologies, getPopularTechnologies } from '@/lib/services/aiArkReferenceService';
import type { Technology } from '@/lib/services/aiArkReferenceService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDocCount(count: number): string {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(count);
}

// ---------------------------------------------------------------------------
// AiArkTechPicker
// ---------------------------------------------------------------------------

export interface AiArkTechPickerProps {
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
}

export function AiArkTechPicker({ value, onChange, className }: AiArkTechPickerProps) {
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [results, setResults] = useState<Technology[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Populate results whenever query or dropdown visibility changes
  useEffect(() => {
    if (query.trim()) {
      setResults(searchTechnologies(query, 20));
    } else {
      setResults(getPopularTechnologies(20));
    }
  }, [query]);

  // Close on outside click
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

  const toggle = (key: string) => {
    if (value.includes(key)) {
      onChange(value.filter((v) => v !== key));
    } else {
      onChange([...value, key]);
    }
  };

  const remove = (key: string) => {
    onChange(value.filter((v) => v !== key));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  return (
    <div className={className} ref={containerRef}>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">Technologies</label>

      <div className="relative">
        {/* Search input */}
        <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus-within:border-blue-500 transition-colors">
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
            placeholder="Search technologies..."
            className="flex-1 bg-transparent outline-none placeholder:text-zinc-500 text-sm text-white"
          />
        </div>

        {/* Dropdown */}
        {showDropdown && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl max-h-[350px] overflow-y-auto">
            {results.length === 0 ? (
              <div className="px-3 py-4 text-xs text-zinc-500 text-center">No technologies found</div>
            ) : (
              <>
                {!query.trim() && (
                  <div className="px-3 pt-2 pb-1">
                    <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">Popular</span>
                  </div>
                )}
                {results.map((tech) => {
                  const isSelected = value.includes(tech.key);
                  return (
                    <button
                      key={tech.key}
                      type="button"
                      onClick={() => toggle(tech.key)}
                      className="w-full px-3 py-2 text-left text-xs hover:bg-zinc-700/50 transition-colors flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isSelected ? (
                          <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        ) : (
                          <Cpu className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        )}
                        <span className={`truncate ${isSelected ? 'text-blue-300' : 'text-zinc-300'}`}>
                          {tech.key}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 bg-zinc-700/50 px-1.5 py-0.5 rounded shrink-0">
                        {formatDocCount(tech.doc_count)}
                      </span>
                    </button>
                  );
                })}
                {/* Search all link */}
                <div className="border-t border-zinc-700/50 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => console.log('Search all technologies')}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Search all 64K+ technologies
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Selected chips */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {value.map((key) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300 border border-blue-500/30"
            >
              {key}
              <button
                type="button"
                onClick={() => remove(key)}
                className="text-blue-400 hover:text-blue-200 transition-colors"
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
