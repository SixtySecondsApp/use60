/**
 * SandboxQuickAdd
 *
 * Command palette / quick-add modal triggered by Cmd+K or search click.
 * Shows AI-suggested actions based on the personalized sandbox data.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Mail,
  Video,
  FileText,
  Heart,
  Users,
  Sparkles,
  ArrowRight,
  Command,
} from 'lucide-react';
import { useSandboxData } from '../data/SandboxDataProvider';

interface QuickAction {
  id: string;
  icon: React.ElementType;
  label: string;
  description: string;
  accentColor: string;
  view?: string;
}

interface SandboxQuickAddProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (view: string) => void;
}

export function SandboxQuickAdd({ isOpen, onClose, onNavigate }: SandboxQuickAddProps) {
  const { data } = useSandboxData();
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const companyName = data.visitorCompany?.name ?? 'Acme Corp';
  const contactName = data.emailDraft?.to_name ?? 'Sarah Chen';

  const actions: QuickAction[] = [
    {
      id: 'meeting-prep',
      icon: Video,
      label: `Prepare for ${companyName} meeting`,
      description: 'AI-generated talking points, risk signals, and questions',
      accentColor: 'text-emerald-400',
      view: 'meetings',
    },
    {
      id: 'email-draft',
      icon: Mail,
      label: `Draft follow-up to ${contactName}`,
      description: 'Personalized email based on deal context',
      accentColor: 'text-cyan-400',
      view: 'email',
    },
    {
      id: 'deal-health',
      icon: Heart,
      label: `Check ${companyName} deal health`,
      description: `Health score, risk signals, and next steps`,
      accentColor: 'text-rose-400',
      view: 'pipeline',
    },
    {
      id: 'contacts',
      icon: Users,
      label: `View ${companyName} stakeholders`,
      description: 'Contacts, engagement levels, and relationship map',
      accentColor: 'text-amber-400',
      view: 'contacts',
    },
    {
      id: 'copilot',
      icon: Sparkles,
      label: 'Ask 60 Copilot anything',
      description: 'AI assistant with full deal and contact context',
      accentColor: 'text-violet-400',
      view: 'copilot',
    },
    {
      id: 'proposal',
      icon: FileText,
      label: `Generate proposal for ${companyName}`,
      description: 'AI-drafted proposal based on deal stage and requirements',
      accentColor: 'text-indigo-400',
    },
  ];

  const filtered = search
    ? actions.filter(
        (a) =>
          a.label.toLowerCase().includes(search.toLowerCase()) ||
          a.description.toLowerCase().includes(search.toLowerCase())
      )
    : actions;

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setSearch('');
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const handleAction = (action: QuickAction) => {
    if (action.view && onNavigate) {
      onNavigate(action.view);
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-lg z-[61]"
          >
            <div className="bg-zinc-900/95 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
                <Search className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search actions or ask anything..."
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 outline-none"
                />
                <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-500 font-mono">
                  <Command className="w-2.5 h-2.5" />K
                </kbd>
              </div>

              {/* Actions */}
              <div className="max-h-[50vh] overflow-y-auto py-2">
                {filtered.length === 0 && (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-zinc-600">No matching actions</p>
                  </div>
                )}

                {filtered.map((action, i) => {
                  const Icon = action.icon;
                  return (
                    <motion.button
                      key={action.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03, duration: 0.2 }}
                      onClick={() => handleAction(action)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors group text-left"
                    >
                      <div className={`w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center flex-shrink-0 ${action.accentColor}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-200 group-hover:text-white truncate">
                          {action.label}
                        </p>
                        <p className="text-[11px] text-zinc-600 truncate">
                          {action.description}
                        </p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-700 group-hover:text-zinc-500 flex-shrink-0 transition-colors" />
                    </motion.button>
                  );
                })}
              </div>

              {/* Footer hint */}
              <div className="px-4 py-2 border-t border-white/[0.04] flex items-center gap-4 text-[10px] text-zinc-600">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-violet-500/50" />
                  AI-powered actions
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
