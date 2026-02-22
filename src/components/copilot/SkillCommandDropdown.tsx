/**
 * SkillCommandDropdown
 *
 * Floating autocomplete dropdown for /skill commands.
 * Shows available skills grouped by category when user types / at start of input.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FileText, Search, BarChart3, MessageSquare, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SkillItem {
  skill_key: string;
  command: string;
  name: string;
  description: string;
  category: string;
  required_entities?: string[];
}

interface SkillCommandDropdownProps {
  query: string;
  caretRect: DOMRect | null;
  onSelect: (command: string) => void;
  onDismiss: () => void;
}

// Built-in skills for the / command palette
// These match the skills defined in the plan (BSKILL-001 through BSKILL-004)
const BUILT_IN_SKILLS: SkillItem[] = [
  { skill_key: 'copilot-proposal', command: 'proposal', name: 'Proposal', description: 'Generate a tailored proposal from deal/company context', category: 'writing', required_entities: ['company', 'deal'] },
  { skill_key: 'copilot-followup', command: 'followup', name: 'Follow-Up', description: 'Draft a follow-up email from recent meeting or activity', category: 'writing', required_entities: ['contact', 'deal'] },
  { skill_key: 'copilot-research', command: 'research', name: 'Research', description: 'Pre-meeting research brief with intel and talking points', category: 'research', required_entities: ['company', 'contact'] },
  { skill_key: 'copilot-summary', command: 'summary', name: 'Summary', description: 'Deal summary with status, risks, and next steps', category: 'pipeline', required_entities: ['deal'] },
  { skill_key: 'copilot-objection', command: 'objection', name: 'Objection', description: 'Surface past handling and draft a response', category: 'coaching', required_entities: ['contact', 'deal'] },
  { skill_key: 'copilot-battlecard', command: 'battlecard', name: 'Battlecard', description: 'Competitive positioning against a named competitor', category: 'research', required_entities: ['deal'] },
  { skill_key: 'copilot-handoff', command: 'handoff', name: 'Handoff', description: 'Full context brief for deal transfer', category: 'pipeline', required_entities: ['deal'] },
  { skill_key: 'copilot-chase', command: 'chase', name: 'Chase', description: 'Gentle follow-up for a deal gone quiet', category: 'outreach', required_entities: ['contact', 'deal'] },
  { skill_key: 'copilot-agenda', command: 'agenda', name: 'Agenda', description: 'Structured meeting agenda from deal stage and open items', category: 'writing', required_entities: ['deal', 'contact'] },
  { skill_key: 'copilot-win', command: 'win', name: 'Win Note', description: 'Deal-won announcement for Slack with key stats', category: 'pipeline', required_entities: ['deal'] },
];

const CATEGORY_ICONS: Record<string, typeof FileText> = {
  writing: FileText,
  research: Search,
  pipeline: BarChart3,
  coaching: MessageSquare,
  outreach: Send,
};

const CATEGORY_LABELS: Record<string, string> = {
  writing: 'Writing',
  research: 'Research',
  pipeline: 'Pipeline',
  coaching: 'Coaching',
  outreach: 'Outreach',
};

export function SkillCommandDropdown({
  query,
  caretRect,
  onSelect,
  onDismiss,
}: SkillCommandDropdownProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter skills by query
  const filteredSkills = query.length === 0
    ? BUILT_IN_SKILLS
    : BUILT_IN_SKILLS.filter(
        (s) =>
          s.command.toLowerCase().startsWith(query.toLowerCase()) ||
          s.name.toLowerCase().includes(query.toLowerCase()),
      );

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Group by category
  const grouped = groupByCategory(filteredSkills);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (filteredSkills.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredSkills.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredSkills.length) % filteredSkills.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const selected = filteredSkills[selectedIndex];
        if (selected) onSelect(selected.command);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    },
    [filteredSkills, selectedIndex, onSelect, onDismiss],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  // Click outside to dismiss
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onDismiss]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const style: React.CSSProperties = caretRect
    ? {
        position: 'fixed',
        left: caretRect.left,
        bottom: window.innerHeight - caretRect.top + 8,
        maxHeight: 360,
        zIndex: 50,
      }
    : { display: 'none' };

  if (filteredSkills.length === 0) {
    return (
      <div ref={listRef} style={style} className="w-80 rounded-lg border border-gray-700/60 bg-gray-900/95 backdrop-blur-sm shadow-xl p-3 text-sm text-gray-400">
        No matching skills for &ldquo;/{query}&rdquo;
      </div>
    );
  }

  return (
    <div ref={listRef} style={style} className="w-80 rounded-lg border border-gray-700/60 bg-gray-900/95 backdrop-blur-sm shadow-xl overflow-hidden">
      <div className="max-h-80 overflow-y-auto py-1">
        {grouped.map(({ category, items }) => (
          <div key={category}>
            <div className="px-3 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
              {CATEGORY_LABELS[category] || category}
            </div>
            {items.map((skill) => {
              const globalIdx = filteredSkills.indexOf(skill);
              const Icon = CATEGORY_ICONS[skill.category] || FileText;
              return (
                <button
                  key={skill.skill_key}
                  type="button"
                  data-index={globalIdx}
                  onClick={() => onSelect(skill.command)}
                  onMouseEnter={() => setSelectedIndex(globalIdx)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                    globalIdx === selectedIndex
                      ? 'bg-violet-500/20 text-gray-100'
                      : 'text-gray-300 hover:bg-gray-800/60',
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-violet-400">/{skill.command}</span>
                      <span className="text-sm text-gray-300">{skill.name}</span>
                    </div>
                    <div className="text-xs text-gray-500 truncate">{skill.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function groupByCategory(
  skills: SkillItem[],
): { category: string; items: SkillItem[] }[] {
  const order = ['writing', 'research', 'pipeline', 'coaching', 'outreach'];
  const map = new Map<string, SkillItem[]>();

  for (const s of skills) {
    if (!map.has(s.category)) map.set(s.category, []);
    map.get(s.category)!.push(s);
  }

  return order.filter((c) => map.has(c)).map((c) => ({ category: c, items: map.get(c)! }));
}
