import { motion } from 'framer-motion';
import { useCommandCenterState } from './useCommandCenterState';
import { CommandCenterCompact } from './CommandCenterCompact';
import { CommandCenterMedium } from './CommandCenterMedium';
import { CommandCenterFull } from './CommandCenterFull';
import { modalVariants, backdropVariants } from './animations';
import type { QuickAddAction } from './useCommandCenterState';

interface CommandCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandCenter({ isOpen, onClose }: CommandCenterProps) {
  const {
    state,
    activeQuickAddAction,
    quickAddPrefill,
    openChat,
    collapseToMedium,
    returnToCompact,
    close,
    setActiveQuickAddAction,
    clearQuickAddAction,
  } = useCommandCenterState({ isOpen, onClose });

  // Bridge: QuickAdd from chat → compact with prefill
  const handleOpenQuickAdd = (action: QuickAddAction, prefill?: { preselectAction?: string; initialData?: Record<string, unknown> }) => {
    returnToCompact();
    // Short delay so compact mounts before we set the action
    setTimeout(() => {
      setActiveQuickAddAction(action, prefill ?? {});
    }, 200);
  };

  if (state === 'closed') return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        key="cc-backdrop"
        variants={backdropVariants}
        initial="closed"
        animate={state}
        exit="closed"
        onClick={close}
        className={`absolute inset-0 ${
          state === 'compact'
            ? 'bg-black/30 backdrop-blur-[4px]'
            : 'bg-black/50 backdrop-blur-sm'
        }`}
      />

      {/* Modal container — height via CSS (framer motion can't animate auto→fixed) */}
      <motion.div
        key="cc-modal"
        variants={modalVariants}
        initial="closed"
        animate={state}
        exit="closed"
        className={`relative z-10 bg-gray-900 border border-gray-800 shadow-2xl shadow-black/50 overflow-hidden ${
          state === 'compact'
            ? 'max-h-[85dvh]'
            : state === 'medium'
              ? 'h-[70dvh]'
              : 'h-[95dvh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact state */}
        {state === 'compact' && (
          <CommandCenterCompact
            onClose={close}
            onOpenChat={openChat}
            activeQuickAddAction={activeQuickAddAction}
            quickAddPrefill={quickAddPrefill}
            onSelectAction={setActiveQuickAddAction}
            onClearAction={clearQuickAddAction}
          />
        )}

        {/* Medium state */}
        {state === 'medium' && (
          <CommandCenterMedium
            onClose={close}
            onBack={returnToCompact}
            onOpenQuickAdd={handleOpenQuickAdd}
          />
        )}

        {/* Full state */}
        {state === 'full' && (
          <CommandCenterFull
            onClose={close}
            onCollapse={collapseToMedium}
            onOpenQuickAdd={handleOpenQuickAdd}
          />
        )}
      </motion.div>
    </div>
  );
}
