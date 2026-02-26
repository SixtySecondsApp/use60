import React, { useEffect, useMemo, useState } from 'react';
import { X, Bot, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useCopilot } from '@/lib/contexts/CopilotContext';
import { AssistantShell } from './AssistantShell';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { useQuickAddVersionReadOnly } from '@/lib/hooks/useQuickAddVersion';
import { QuickAddComponent } from '@/components/quick-add';

interface AssistantOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AssistantOverlay({ isOpen, onClose }: AssistantOverlayProps) {
  const { cancelRequest } = useCopilot();
  const navigate = useNavigate();
  const { effectiveUserType } = useUserPermissions();
  const { internalVersion, externalVersion } = useQuickAddVersionReadOnly();
  const variant = useMemo(() => {
    const version = effectiveUserType === 'external' ? externalVersion : internalVersion;
    return version === 'v2' ? 'v2' : 'v1';
  }, [effectiveUserType, internalVersion, externalVersion]);

  const [activePane, setActivePane] = useState<'assistant' | 'quickadd'>('assistant');
  const [quickAddPrefill, setQuickAddPrefill] = useState<{ preselectAction?: string; initialData?: Record<string, unknown> } | null>(null);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelRequest();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, cancelRequest, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        >
          <div className="absolute inset-0" onClick={onClose} />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="relative w-full max-w-2xl bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl shadow-black/50 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-white font-semibold text-sm">Sales Assistant</h2>
                  <p className="text-gray-500 text-xs">Org-scoped. Actionable. Fast.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-1 p-1 rounded-xl bg-gray-800/50 border border-gray-700/50">
                  <button
                    type="button"
                    onClick={() => setActivePane('assistant')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      activePane === 'assistant'
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Assistant
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePane('quickadd')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      activePane === 'quickadd'
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Quick Add
                  </button>
                </div>
                <button
                  onClick={() => { navigate('/settings/proactive-agent'); onClose(); }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                  title="Agent Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActivePane('assistant');
                    setQuickAddPrefill(null);
                    onClose();
                  }}
                  className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="h-[75dvh] sm:h-[70dvh]">
              {activePane === 'assistant' ? (
                <AssistantShell
                  mode="overlay"
                  onOpenQuickAdd={(opts) => {
                    setQuickAddPrefill(opts);
                    setActivePane('quickadd');
                  }}
                />
              ) : (
                <QuickAddComponent
                  isOpen={true}
                  onClose={() => {
                    setActivePane('assistant');
                  }}
                  variant={variant}
                  renderMode="embedded"
                  hideHeader={true}
                  prefill={quickAddPrefill || undefined}
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

