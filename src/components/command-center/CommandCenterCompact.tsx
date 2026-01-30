import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, X, ChevronRight, ArrowLeft } from 'lucide-react';
import { ActionGrid } from '@/components/quick-add/ActionGrid';
import { QuickAddComponent } from '@/components/quick-add';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { useQuickAddVersionReadOnly } from '@/lib/hooks/useQuickAddVersion';
import { quickAddFormVariants } from './animations';
import type { QuickAddAction, QuickAddPrefill } from './useCommandCenterState';

const actionLabels: Record<string, string> = {
  outbound: 'Outbound',
  meeting: 'Meeting',
  proposal: 'Proposal',
  sale: 'Sale',
  task: 'Task',
  roadmap: 'Roadmap',
};

interface CommandCenterCompactProps {
  onClose: () => void;
  onOpenChat: () => void;
  activeQuickAddAction: QuickAddAction;
  quickAddPrefill: QuickAddPrefill;
  onSelectAction: (action: QuickAddAction) => void;
  onClearAction: () => void;
}

export function CommandCenterCompact({
  onClose,
  onOpenChat,
  activeQuickAddAction,
  quickAddPrefill,
  onSelectAction,
  onClearAction,
}: CommandCenterCompactProps) {
  const { effectiveUserType } = useUserPermissions();
  const { internalVersion, externalVersion } = useQuickAddVersionReadOnly();
  const variant = useMemo(() => {
    const version = effectiveUserType === 'external' ? externalVersion : internalVersion;
    return version === 'v2' ? 'v2' : 'v1';
  }, [effectiveUserType, internalVersion, externalVersion]);

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/50">
        <div className="flex items-center gap-3">
          <AnimatePresence mode="wait">
            {activeQuickAddAction ? (
              <motion.button
                key="back"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                onClick={onClearAction}
                className="p-1.5 -ml-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 rounded-lg transition-all"
              >
                <ArrowLeft className="w-5 h-5" />
              </motion.button>
            ) : (
              <motion.div
                key="icon"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center"
              >
                <Brain className="w-5 h-5 text-violet-400" />
              </motion.div>
            )}
          </AnimatePresence>
          <div>
            <h2 className="text-white font-semibold text-sm">
              {activeQuickAddAction
                ? `Add ${actionLabels[activeQuickAddAction] ?? activeQuickAddAction}`
                : 'Command Center'}
            </h2>
            {!activeQuickAddAction && (
              <p className="text-gray-500 text-xs">Quick actions & AI assistant</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content — min-height prevents layout jitter when contact modal opens over a form */}
      <div className={`overflow-y-auto p-5 ${activeQuickAddAction ? 'min-h-[20rem]' : ''}`}>
        <AnimatePresence mode="wait">
          {activeQuickAddAction ? (
            <motion.div
              key="quick-add"
              variants={quickAddFormVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <QuickAddComponent
                isOpen={true}
                onClose={onClearAction}
                variant={variant}
                renderMode="embedded"
                hideHeader={true}
                prefill={{
                  preselectAction: activeQuickAddAction,
                  ...(quickAddPrefill.initialData ? { initialData: quickAddPrefill.initialData as any } : {}),
                }}
              />
            </motion.div>
          ) : (
            <div className="space-y-5">
              <ActionGrid onActionSelect={(id) => onSelectAction(id as QuickAddAction)} />

              {/* Chat with Copilot button */}
              <motion.button
                type="button"
                onClick={onOpenChat}
                whileHover={{ scale: 1.01, y: -1 }}
                whileTap={{ scale: 0.99 }}
                className="w-full flex items-center justify-between px-5 py-4 rounded-xl bg-gradient-to-r from-violet-500/20 to-purple-500/20 border border-violet-500/30 hover:border-violet-500/50 group transition-all duration-300"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                    <Brain className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-white">Chat with Copilot</p>
                    <p className="text-xs text-gray-400">Get AI-powered assistance</p>
                  </div>
                </div>
                <motion.div
                  animate={{ x: [0, 4, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, repeatType: 'loop', ease: 'easeInOut' }}
                >
                  <ChevronRight className="w-5 h-5 text-violet-400 group-hover:text-violet-300 transition-colors" />
                </motion.div>
              </motion.button>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
