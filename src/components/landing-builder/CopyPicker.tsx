/**
 * CopyPicker — Interactive A/B copy selection with mix-and-match + inline editing
 *
 * Parses AI-generated copy options (Option A / Option B per section)
 * and presents them step-by-step. Users can:
 * 1. Pick A or B for each section (original flow, one click)
 * 2. Mix-and-match: pick headline from A, CTA from B, etc.
 * 3. Inline edit: click pencil to edit any component text
 *
 * After all sections are chosen, a confirm button submits the compiled copy.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Check, ChevronRight, ChevronLeft, ArrowRight, Pencil, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CopyOption {
  headline: string;
  subhead: string;
  body: string;
  cta: string;
}

type CopyComponent = keyof CopyOption;

const COPY_COMPONENTS: CopyComponent[] = ['headline', 'subhead', 'body', 'cta'];

const COMPONENT_LABELS: Record<CopyComponent, string> = {
  headline: 'Headline',
  subhead: 'Subhead',
  body: 'Body',
  cta: 'CTA',
};

interface CopySection {
  name: string;
  optionA: CopyOption;
  optionB: CopyOption;
  microCopy?: string;
}

interface CopyPickerProps {
  /** Raw markdown content from AI with A/B copy options */
  markdown: string;
  /** Called when user confirms all selections */
  onConfirm: (selections: Record<string, 'A' | 'B'>, compiledCopy: string) => void;
}

/** Per-component selection: which option each component comes from */
interface ComponentSelections {
  headline: 'A' | 'B';
  subhead: 'A' | 'B';
  body: 'A' | 'B';
  cta: 'A' | 'B';
}

/**
 * Parse a single blockquote-style option block into structured copy.
 */
function parseOption(text: string): CopyOption {
  const clean = text.replace(/^>\s*/gm, '').trim();
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);

  let headline = '';
  let subhead = '';
  let cta = '';
  const bodyParts: string[] = [];

  for (const line of lines) {
    const boldMatch = line.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch && !headline) {
      headline = boldMatch[1];
      continue;
    }

    const ctaMatch = line.match(/\*\*CTA:\*\*\s*(.+)/);
    if (ctaMatch) {
      cta = ctaMatch[1].trim();
      continue;
    }

    if (line.startsWith('**')) continue;

    if (!subhead && !line.startsWith('-')) {
      subhead = line;
      continue;
    }

    bodyParts.push(line);
  }

  return { headline, subhead, body: bodyParts.join(' '), cta };
}

/**
 * Parse the AI's markdown into structured sections with A/B options.
 */
export function parseCopySections(markdown: string): CopySection[] {
  const sections: CopySection[] = [];
  const sectionBlocks = markdown.split(/(?=###\s+[^\n]+)/);

  for (const block of sectionBlocks) {
    const headerMatch = block.match(/###\s+(.+)/);
    if (!headerMatch) continue;

    const name = headerMatch[1].trim();

    const optionAMatch = block.match(
      /\*\*Option A\*\*\s*\n([\s\S]*?)(?=\*\*Option B\*\*)/,
    );
    const optionBMatch = block.match(
      /\*\*Option B\*\*\s*\n([\s\S]*?)(?=\*\*Micro-copy|---|\n###|$)/,
    );

    if (!optionAMatch || !optionBMatch) continue;

    const microMatch = block.match(/\*\*Micro-copy:\*\*\s*(.+)/);

    sections.push({
      name,
      optionA: parseOption(optionAMatch[1]),
      optionB: parseOption(optionBMatch[1]),
      microCopy: microMatch ? microMatch[1].trim() : undefined,
    });
  }

  return sections;
}

/** Auto-resizing textarea */
function AutoTextarea({
  value,
  onChange,
  onBlur,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = `${ref.current.scrollHeight}px`;
      ref.current.focus();
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className={cn(
        'w-full bg-gray-900 border border-violet-500/40 rounded-lg px-3 py-2 text-sm text-gray-200',
        'focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none overflow-hidden',
        className,
      )}
      rows={1}
    />
  );
}

/** Source badge showing A/B/Custom */
function SourceBadge({ source }: { source: 'A' | 'B' | 'Custom' }) {
  return (
    <span
      className={cn(
        'text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider',
        source === 'Custom'
          ? 'bg-amber-500/20 text-amber-400'
          : 'bg-gray-700/50 text-gray-500',
      )}
    >
      {source}
    </span>
  );
}

/** Component row showing A | B toggle + edit pencil for a single copy component */
function ComponentRow({
  label,
  valueA,
  valueB,
  selectedSource,
  customValue,
  onSelectSource,
  onEdit,
}: {
  label: string;
  valueA: string;
  valueB: string;
  selectedSource: 'A' | 'B';
  customValue?: string;
  onSelectSource: (source: 'A' | 'B') => void;
  onEdit: () => void;
}) {
  const displayValue = customValue ?? (selectedSource === 'A' ? valueA : valueB);
  const source = customValue ? 'Custom' : selectedSource;

  if (!valueA && !valueB) return null;

  return (
    <div className="group">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
          {label}
        </span>
        <SourceBadge source={source} />
        <button
          type="button"
          onClick={onEdit}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-700/50"
          aria-label={`Edit ${label}`}
        >
          <Pencil className="w-3 h-3 text-gray-500 hover:text-violet-400" />
        </button>
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => onSelectSource('A')}
          className={cn(
            'flex-1 px-2.5 py-1.5 rounded-lg text-xs text-left transition-all border',
            selectedSource === 'A' && !customValue
              ? 'border-violet-500/40 bg-violet-500/10 text-gray-200'
              : 'border-gray-700/30 bg-gray-800/30 text-gray-400 hover:bg-gray-800/50 hover:text-gray-300',
          )}
        >
          {valueA || '—'}
        </button>
        <button
          type="button"
          onClick={() => onSelectSource('B')}
          className={cn(
            'flex-1 px-2.5 py-1.5 rounded-lg text-xs text-left transition-all border',
            selectedSource === 'B' && !customValue
              ? 'border-violet-500/40 bg-violet-500/10 text-gray-200'
              : 'border-gray-700/30 bg-gray-800/30 text-gray-400 hover:bg-gray-800/50 hover:text-gray-300',
          )}
        >
          {valueB || '—'}
        </button>
      </div>
      {customValue && (
        <div className="mt-1 px-2.5 py-1.5 rounded-lg text-xs text-amber-300 bg-amber-500/5 border border-amber-500/20">
          {displayValue}
        </div>
      )}
    </div>
  );
}

function OptionCard({
  opt,
  option,
  isSelected,
  onSelect,
}: {
  opt: 'A' | 'B';
  option: CopyOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'text-left p-3.5 rounded-xl border-2 transition-all duration-200 w-full',
        'hover:border-violet-500/50 hover:shadow-lg hover:shadow-violet-500/5',
        isSelected
          ? 'border-violet-500 bg-violet-500/10 ring-1 ring-violet-500/20'
          : 'border-gray-700/50 bg-gray-800/40 hover:bg-gray-800/60',
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider',
            isSelected
              ? 'bg-violet-500/20 text-violet-300'
              : 'bg-gray-700/50 text-gray-500',
          )}
        >
          Option {opt}
        </span>
        {isSelected && <Check className="w-4 h-4 text-violet-400" />}
      </div>

      {option.headline && (
        <p className="font-semibold text-sm text-gray-100 mb-1 leading-tight">
          {option.headline}
        </p>
      )}
      {option.subhead && (
        <p className="text-xs text-gray-400 mb-1.5 leading-snug line-clamp-2">
          {option.subhead}
        </p>
      )}
      {option.body && (
        <p className="text-[11px] text-gray-500 mb-2 leading-snug line-clamp-2">
          {option.body}
        </p>
      )}
      {option.cta && (
        <span
          className={cn(
            'inline-block text-[11px] px-3 py-1 rounded-lg font-medium',
            isSelected
              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
              : 'bg-gray-700/50 text-gray-400 border border-gray-600/30',
          )}
        >
          {option.cta}
        </span>
      )}
    </button>
  );
}

/**
 * Compile final copy from sections, per-component selections, and custom edits.
 */
function compileCopy(
  sections: CopySection[],
  sectionSelections: Record<string, 'A' | 'B'>,
  componentSelections: Record<string, ComponentSelections>,
  customEdits: Record<string, Partial<CopyOption>>,
): string {
  const lines: string[] = ['APPROVED COPY SELECTIONS:'];

  for (const section of sections) {
    const wholePick = sectionSelections[section.name] || 'A';
    const compSel = componentSelections[section.name];
    const edits = customEdits[section.name];

    lines.push(`\n## ${section.name}`);

    for (const comp of COPY_COMPONENTS) {
      // Priority: custom edit > per-component selection > whole selection
      const customVal = edits?.[comp];
      if (customVal) {
        lines.push(`${COMPONENT_LABELS[comp]}: ${customVal}`);
        continue;
      }

      const source = compSel?.[comp] ?? wholePick;
      const option = source === 'A' ? section.optionA : section.optionB;
      const val = option[comp];
      if (val) {
        lines.push(`${COMPONENT_LABELS[comp]}: ${val}`);
      }
    }

    if (section.microCopy) lines.push(`Micro-copy: ${section.microCopy}`);
  }

  return lines.join('\n');
}

export const CopyPicker: React.FC<CopyPickerProps> = ({ markdown, onConfirm }) => {
  const sections = useMemo(() => parseCopySections(markdown), [markdown]);

  // Whole-section A/B selection (original simple flow)
  const [selections, setSelections] = useState<Record<string, 'A' | 'B'>>({});
  // Per-component A/B selection for mix-and-match
  const [componentSelections, setComponentSelections] = useState<Record<string, ComponentSelections>>({});
  // Custom edits per component
  const [customEdits, setCustomEdits] = useState<Record<string, Partial<CopyOption>>>({});
  // Which component is being edited (sectionName:component)
  const [editingKey, setEditingKey] = useState<string | null>(null);
  // Whether mix-and-match mode is active for a section
  const [mixModeActive, setMixModeActive] = useState<Record<string, boolean>>({});

  const [activeIndex, setActiveIndex] = useState(0);

  const currentSection = sections[activeIndex];
  const currentSelection = currentSection ? selections[currentSection.name] : undefined;
  const isLastSection = activeIndex === sections.length - 1;
  const allSelected = sections.length > 0 && Object.keys(selections).length === sections.length;

  const handleSelect = useCallback((option: 'A' | 'B') => {
    if (!currentSection) return;
    setSelections(prev => ({ ...prev, [currentSection.name]: option }));
    // When whole-section is selected, init component selections to match
    setComponentSelections(prev => ({
      ...prev,
      [currentSection.name]: { headline: option, subhead: option, body: option, cta: option },
    }));
    // Auto-advance to next section after a brief delay so user sees the selection
    if (activeIndex < sections.length - 1) {
      setTimeout(() => setActiveIndex(prev => prev + 1), 350);
    }
  }, [currentSection, activeIndex, sections.length]);

  const handleComponentSelect = useCallback((sectionName: string, comp: CopyComponent, source: 'A' | 'B') => {
    setComponentSelections(prev => ({
      ...prev,
      [sectionName]: {
        ...(prev[sectionName] || { headline: 'A', subhead: 'A', body: 'A', cta: 'A' }),
        [comp]: source,
      },
    }));
    // Clear custom edit for this component
    setCustomEdits(prev => {
      const sectionEdits = { ...prev[sectionName] };
      delete sectionEdits[comp];
      return { ...prev, [sectionName]: sectionEdits };
    });
    // Ensure section is marked as selected
    if (!selections[sectionName]) {
      setSelections(prev => ({ ...prev, [sectionName]: source }));
    }
  }, [selections]);

  const handleCustomEdit = useCallback((sectionName: string, comp: CopyComponent, value: string) => {
    setCustomEdits(prev => ({
      ...prev,
      [sectionName]: {
        ...(prev[sectionName] || {}),
        [comp]: value,
      },
    }));
    // Ensure section is marked as selected
    if (!selections[sectionName]) {
      setSelections(prev => ({ ...prev, [sectionName]: 'A' }));
    }
  }, [selections]);

  const handleNext = useCallback(() => {
    if (isLastSection) return;
    setActiveIndex(prev => prev + 1);
  }, [isLastSection]);

  const handlePrev = useCallback(() => {
    if (activeIndex === 0) return;
    setActiveIndex(prev => prev - 1);
  }, [activeIndex]);

  const handleConfirm = useCallback(() => {
    const compiled = compileCopy(sections, selections, componentSelections, customEdits);
    onConfirm(selections, compiled);
  }, [sections, selections, componentSelections, customEdits, onConfirm]);

  const toggleMixMode = useCallback((sectionName: string) => {
    setMixModeActive(prev => ({ ...prev, [sectionName]: !prev[sectionName] }));
  }, []);

  if (sections.length === 0 || !currentSection) return null;

  const isMixMode = mixModeActive[currentSection.name];
  const currentCompSel = componentSelections[currentSection.name] || {
    headline: currentSelection || 'A',
    subhead: currentSelection || 'A',
    body: currentSelection || 'A',
    cta: currentSelection || 'A',
  };
  const currentEdits = customEdits[currentSection.name] || {};

  return (
    <div className="space-y-4 my-4">
      {/* Step indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-300">
            {currentSection.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {sections.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setActiveIndex(i)}
              className={cn(
                'w-2 h-2 rounded-full transition-all duration-200',
                i === activeIndex
                  ? 'bg-violet-400 w-5'
                  : selections[s.name]
                    ? 'bg-violet-500/40'
                    : 'bg-gray-700',
              )}
              aria-label={`Section ${i + 1}: ${s.name}`}
            />
          ))}
          <span className="text-xs text-gray-500 ml-2">
            {activeIndex + 1}/{sections.length}
          </span>
        </div>
      </div>

      {/* Quick A/B selection (always visible) */}
      <div className="grid grid-cols-2 gap-3">
        <OptionCard
          opt="A"
          option={currentSection.optionA}
          isSelected={currentSelection === 'A' && !isMixMode}
          onSelect={() => {
            handleSelect('A');
            setMixModeActive(prev => ({ ...prev, [currentSection.name]: false }));
          }}
        />
        <OptionCard
          opt="B"
          option={currentSection.optionB}
          isSelected={currentSelection === 'B' && !isMixMode}
          onSelect={() => {
            handleSelect('B');
            setMixModeActive(prev => ({ ...prev, [currentSection.name]: false }));
          }}
        />
      </div>

      {/* Mix-and-match toggle */}
      <button
        type="button"
        onClick={() => toggleMixMode(currentSection.name)}
        className={cn(
          'text-[11px] font-medium transition-colors',
          isMixMode ? 'text-violet-400' : 'text-gray-500 hover:text-gray-300',
        )}
      >
        {isMixMode ? 'Hide mix & match' : 'Mix & match / edit copy'}
      </button>

      {/* Per-component mix-and-match panel */}
      {isMixMode && (
        <div className="space-y-3 p-3 rounded-xl border border-gray-700/40 bg-gray-800/20">
          {COPY_COMPONENTS.map((comp) => {
            const editing = editingKey === `${currentSection.name}:${comp}`;

            if (editing) {
              const currentValue = currentEdits[comp]
                ?? (currentCompSel[comp] === 'A' ? currentSection.optionA[comp] : currentSection.optionB[comp]);
              return (
                <div key={comp}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                      {COMPONENT_LABELS[comp]}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingKey(null)}
                      className="p-0.5 rounded hover:bg-gray-700/50"
                    >
                      <X className="w-3 h-3 text-gray-500" />
                    </button>
                  </div>
                  <AutoTextarea
                    value={currentValue}
                    onChange={(v) => handleCustomEdit(currentSection.name, comp, v)}
                    onBlur={() => setEditingKey(null)}
                  />
                </div>
              );
            }

            return (
              <ComponentRow
                key={comp}
                label={COMPONENT_LABELS[comp]}
                valueA={currentSection.optionA[comp]}
                valueB={currentSection.optionB[comp]}
                selectedSource={currentCompSel[comp]}
                customValue={currentEdits[comp]}
                onSelectSource={(source) => handleComponentSelect(currentSection.name, comp, source)}
                onEdit={() => setEditingKey(`${currentSection.name}:${comp}`)}
              />
            );
          })}
        </div>
      )}

      {currentSection.microCopy && (
        <p className="text-[11px] text-gray-600 px-1 italic">
          Micro-copy: {currentSection.microCopy}
        </p>
      )}

      {/* Navigation / confirm */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={handlePrev}
          disabled={activeIndex === 0}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all',
            activeIndex === 0
              ? 'text-gray-600 cursor-not-allowed'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60',
          )}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Previous
        </button>

        {isLastSection ? (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!allSelected}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all',
              allSelected
                ? 'bg-violet-500 text-white hover:bg-violet-600 shadow-lg shadow-violet-500/20'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed',
            )}
          >
            Confirm All Selections
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              // Auto-advance after selecting
              handleNext();
            }}
            disabled={!currentSelection}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all',
              currentSelection
                ? 'bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-700'
                : 'bg-gray-800/50 text-gray-600 cursor-not-allowed',
            )}
          >
            Next Section
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
