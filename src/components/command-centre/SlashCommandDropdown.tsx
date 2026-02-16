import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Mail, FileText, FileSearch, RefreshCw, Phone, FileEdit,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const SLASH_COMMANDS = [
  { id: 'email', label: '/email', description: 'Draft an email from task context', icon: Mail, color: 'text-blue-500' },
  { id: 'proposal', label: '/proposal', description: 'Generate a proposal or SOW', icon: FileText, color: 'text-amber-500' },
  { id: 'research', label: '/research', description: 'Deep research on a company or contact', icon: FileSearch, color: 'text-cyan-500' },
  { id: 'followup', label: '/follow-up', description: 'Draft a follow-up based on history', icon: RefreshCw, color: 'text-purple-500' },
  { id: 'call-prep', label: '/call-prep', description: 'Generate a call script with objection handling', icon: Phone, color: 'text-green-500' },
  { id: 'summarize', label: '/summarize', description: 'Summarize meeting or activity history', icon: FileEdit, color: 'text-indigo-500' },
];

export type SlashCommand = typeof SLASH_COMMANDS[0];

interface SlashCommandDropdownProps {
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
  filter: string;
}

export function SlashCommandDropdown({ onSelect, onClose, filter }: SlashCommandDropdownProps) {
  const filtered = SLASH_COMMANDS.filter(c =>
    c.label.toLowerCase().includes(filter.toLowerCase()) ||
    c.description.toLowerCase().includes(filter.toLowerCase())
  );
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    setSelectedIdx(0);
  }, [filter]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[selectedIdx]) {
        e.preventDefault();
        onSelect(filtered[selectedIdx]);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filtered, selectedIdx, onSelect, onClose]);

  if (filtered.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      className="absolute bottom-full left-0 mb-2 w-72 rounded-xl border border-slate-200 dark:border-gray-700/50 bg-white dark:bg-gray-900 shadow-xl z-50 overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-slate-100 dark:border-gray-800">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500">AI Commands</span>
      </div>
      <div className="py-1">
        {filtered.map((cmd, i) => (
          <button
            key={cmd.id}
            onClick={() => onSelect(cmd)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
              i === selectedIdx ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-slate-50 dark:hover:bg-gray-800/50'
            )}
          >
            <div className={cn('flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 dark:bg-gray-800', cmd.color)}>
              <cmd.icon className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-700 dark:text-gray-300">{cmd.label}</div>
              <div className="text-[11px] text-slate-400 dark:text-gray-500">{cmd.description}</div>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
