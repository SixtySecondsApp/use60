# Command Center - Progressive Modal Design

I'll create a comprehensive Command Center implementation with beautiful animations and smooth state transitions. Let me build this step by step.

## File Structure

```
src/components/command-center/
├── animations.ts
├── useCommandCenterState.ts
├── CommandCenter.tsx
├── CommandCenterCompact.tsx
├── CommandCenterMedium.tsx
├── CommandCenterFull.tsx
├── ActionGrid.tsx
├── CopilotRightPanel.tsx
└── index.ts
```

---

## 1. Animations Configuration

```typescript
// src/components/command-center/animations.ts
import { Variants, Transition } from 'framer-motion';

// Spring configurations for each state
export const springConfig = {
  compact: { type: 'spring', stiffness: 300, damping: 30 } as Transition,
  medium: { type: 'spring', stiffness: 280, damping: 28 } as Transition,
  full: { type: 'spring', stiffness: 260, damping: 26 } as Transition,
};

// Modal container variants
export const modalVariants: Variants = {
  closed: {
    opacity: 0,
    scale: 0.95,
    y: 20,
  },
  compact: {
    opacity: 1,
    scale: 1,
    y: 0,
    width: 'min(28rem, 95vw)',
    height: 'auto',
    maxHeight: '85dvh',
    borderRadius: '1.5rem',
    transition: springConfig.compact,
  },
  medium: {
    opacity: 1,
    scale: 1,
    y: 0,
    width: 'min(42rem, 95vw)',
    height: '70dvh',
    borderRadius: '1rem',
    transition: springConfig.medium,
  },
  full: {
    opacity: 1,
    scale: 1,
    y: 0,
    width: 'min(95vw, 1400px)',
    height: '95dvh',
    borderRadius: '1rem',
    transition: springConfig.full,
  },
};

// Backdrop variants
export const backdropVariants: Variants = {
  closed: {
    opacity: 0,
  },
  compact: {
    opacity: 1,
    backdropFilter: 'blur(4px)',
    transition: { duration: 0.3 },
  },
  medium: {
    opacity: 1,
    backdropFilter: 'blur(8px)',
    transition: { duration: 0.3 },
  },
  full: {
    opacity: 1,
    backdropFilter: 'blur(12px)',
    transition: { duration: 0.3 },
  },
};

// Content transition variants
export const contentVariants: Variants = {
  initial: {
    opacity: 0,
    y: 10,
    scale: 0.98,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.25,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.98,
    transition: {
      duration: 0.2,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
};

// Action grid item variants
export const actionGridVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.05,
      duration: 0.3,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
};

// Right panel slide variants
export const rightPanelVariants: Variants = {
  hidden: {
    x: '100%',
    opacity: 0,
  },
  visible: {
    x: 0,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    },
  },
  exit: {
    x: '100%',
    opacity: 0,
    transition: {
      duration: 0.2,
    },
  },
};

// Header button hover variants
export const buttonHoverVariants: Variants = {
  initial: { scale: 1 },
  hover: { scale: 1.05 },
  tap: { scale: 0.95 },
};

// Chat bubble variants
export const chatBubbleVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.9,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 25,
    },
  },
};

// Stagger children container
export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

// Quick add form slide variants
export const quickAddFormVariants: Variants = {
  hidden: {
    opacity: 0,
    x: 50,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 350,
      damping: 30,
    },
  },
  exit: {
    opacity: 0,
    x: -50,
    scale: 0.95,
    transition: {
      duration: 0.2,
    },
  },
};
```

---

## 2. State Management Hook

```typescript
// src/components/command-center/useCommandCenterState.ts
import { useState, useCallback, useEffect, useRef } from 'react';

export type CommandCenterState = 'closed' | 'compact' | 'medium' | 'full';

export type QuickAddAction = 
  | 'outbound'
  | 'meeting'
  | 'proposal'
  | 'sale'
  | 'task'
  | 'roadmap'
  | null;

export interface QuickAddPrefill {
  contactId?: string;
  dealId?: string;
  subject?: string;
  notes?: string;
}

interface StructuredResponse {
  type: string;
  data: any;
}

interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  structuredResponse?: StructuredResponse;
}

interface UseCommandCenterStateProps {
  isOpen: boolean;
  onClose: () => void;
  // Optional: pass in copilot messages for auto-expansion
  messages?: CopilotMessage[];
}

interface UseCommandCenterStateReturn {
  state: CommandCenterState;
  activeQuickAddAction: QuickAddAction;
  quickAddPrefill: QuickAddPrefill;
  // Transition methods
  openChat: () => void;
  expandFull: () => void;
  collapseToMedium: () => void;
  returnToCompact: () => void;
  close: () => void;
  // Quick add methods
  setActiveQuickAddAction: (action: QuickAddAction, prefill?: QuickAddPrefill) => void;
  clearQuickAddAction: () => void;
}

export function useCommandCenterState({
  isOpen,
  onClose,
  messages = [],
}: UseCommandCenterStateProps): UseCommandCenterStateReturn {
  const [state, setState] = useState<CommandCenterState>('closed');
  const [activeQuickAddAction, setActiveQuickAddActionState] = useState<QuickAddAction>(null);
  const [quickAddPrefill, setQuickAddPrefill] = useState<QuickAddPrefill>({});
  
  const prevMessagesLengthRef = useRef(messages.length);
  const hasAutoExpandedRef = useRef(false);

  // Sync open state
  useEffect(() => {
    if (isOpen && state === 'closed') {
      setState('compact');
      hasAutoExpandedRef.current = false;
    } else if (!isOpen && state !== 'closed') {
      setState('closed');
      // Reset state for next open
      setActiveQuickAddActionState(null);
      setQuickAddPrefill({});
      hasAutoExpandedRef.current = false;
    }
  }, [isOpen, state]);

  // Auto-expand to full when structured response detected
  useEffect(() => {
    if (state !== 'medium' || hasAutoExpandedRef.current) return;
    
    // Check if new message with structured response
    if (messages.length > prevMessagesLengthRef.current) {
      const latestMessage = messages[messages.length - 1];
      if (
        latestMessage?.role === 'assistant' &&
        latestMessage?.structuredResponse
      ) {
        setState('full');
        hasAutoExpandedRef.current = true;
      }
    }
    
    prevMessagesLengthRef.current = messages.length;
  }, [messages, state]);

  // Escape key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state !== 'closed') {
        if (activeQuickAddAction) {
          setActiveQuickAddActionState(null);
          setQuickAddPrefill({});
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [state, activeQuickAddAction, onClose]);

  // Body overflow lock
  useEffect(() => {
    if (state !== 'closed') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [state]);

  // Transition methods
  const openChat = useCallback(() => {
    setState('medium');
    setActiveQuickAddActionState(null);
    setQuickAddPrefill({});
  }, []);

  const expandFull = useCallback(() => {
    setState('full');
  }, []);

  const collapseToMedium = useCallback(() => {
    setState('medium');
    hasAutoExpandedRef.current = false;
  }, []);

  const returnToCompact = useCallback(() => {
    setState('compact');
    hasAutoExpandedRef.current = false;
  }, []);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  // Quick add methods
  const setActiveQuickAddAction = useCallback(
    (action: QuickAddAction, prefill: QuickAddPrefill = {}) => {
      setActiveQuickAddActionState(action);
      setQuickAddPrefill(prefill);
    },
    []
  );

  const clearQuickAddAction = useCallback(() => {
    setActiveQuickAddActionState(null);
    setQuickAddPrefill({});
  }, []);

  return {
    state,
    activeQuickAddAction,
    quickAddPrefill,
    openChat,
    expandFull,
    collapseToMedium,
    returnToCompact,
    close,
    setActiveQuickAddAction,
    clearQuickAddAction,
  };
}
```

---

## 3. Action Grid Component

```tsx
// src/components/command-center/ActionGrid.tsx
import React from 'react';
import { motion } from 'framer-motion';
import {
  Phone,
  Users,
  FileText,
  PoundSterling,
  CheckSquare,
  Map,
  LucideIcon,
} from 'lucide-react';
import { actionGridVariants, staggerContainerVariants } from './animations';
import { QuickAddAction } from './useCommandCenterState';

interface ActionItem {
  id: QuickAddAction;
  label: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  borderColor: string;
  hoverBorderColor: string;
}

const actions: ActionItem[] = [
  {
    id: 'outbound',
    label: 'Add Outbound',
    icon: Phone,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    hoverBorderColor: 'hover:border-blue-500/40',
  },
  {
    id: 'meeting',
    label: 'Add Meeting',
    icon: Users,
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10',
    borderColor: 'border-violet-500/20',
    hoverBorderColor: 'hover:border-violet-500/40',
  },
  {
    id: 'proposal',
    label: 'Add Proposal',
    icon: FileText,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/20',
    hoverBorderColor: 'hover:border-orange-500/40',
  },
  {
    id: 'sale',
    label: 'Add Sale',
    icon: PoundSterling,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    hoverBorderColor: 'hover:border-emerald-500/40',
  },
  {
    id: 'task',
    label: 'Add Task',
    icon: CheckSquare,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-500/20',
    hoverBorderColor: 'hover:border-indigo-500/40',
  },
  {
    id: 'roadmap',
    label: 'Add Roadmap',
    icon: Map,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
    hoverBorderColor: 'hover:border-purple-500/40',
  },
];

interface ActionGridProps {
  onSelectAction: (action: QuickAddAction) => void;
}

export function ActionGrid({ onSelectAction }: ActionGridProps) {
  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-1"
    >
      {actions.map((action, index) => {
        const Icon = action.icon;
        return (
          <motion.button
            key={action.id}
            custom={index}
            variants={actionGridVariants}
            whileHover={{ 
              scale: 1.02,
              y: -2,
              transition: { duration: 0.2 }
            }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectAction(action.id)}
            className={`
              relative flex flex-col items-center justify-center
              p-4 sm:p-5 rounded-xl
              bg-white dark:bg-gray-900/60
              backdrop-blur-sm
              border ${action.borderColor} ${action.hoverBorderColor}
              shadow-sm dark:shadow-none
              transition-all duration-300
              group cursor-pointer
              overflow-hidden
            `}
          >
            {/* Background glow on hover */}
            <motion.div
              className={`
                absolute inset-0 ${action.bgColor} opacity-0
                group-hover:opacity-100 transition-opacity duration-300
              `}
            />
            
            {/* Icon container */}
            <motion.div
              className={`
                relative z-10
                w-11 h-11 sm:w-12 sm:h-12
                rounded-xl ${action.bgColor}
                flex items-center justify-center
                mb-2.5
                group-hover:scale-110 transition-transform duration-300
              `}
            >
              <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${action.color}`} />
            </motion.div>
            
            {/* Label */}
            <span className="
              relative z-10
              text-xs sm:text-sm font-medium
              text-gray-700 dark:text-gray-300
              group-hover:text-gray-900 dark:group-hover:text-white
              transition-colors duration-300
              text-center
            ">
              {action.label}
            </span>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
```

---

## 4. Compact State Component

```tsx
// src/components/command-center/CommandCenterCompact.tsx
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, X, ChevronRight, ArrowLeft } from 'lucide-react';
import { ActionGrid } from './ActionGrid';
import { contentVariants, quickAddFormVariants, buttonHoverVariants } from './animations';
import { QuickAddAction, QuickAddPrefill } from './useCommandCenterState';

// Placeholder QuickAdd component - replace with your actual implementation
interface QuickAddComponentProps {
  action: QuickAddAction;
  prefill?: QuickAddPrefill;
  onComplete: () => void;
  onCancel: () => void;
  embedded?: boolean;
}

function QuickAddComponent({ 
  action, 
  prefill, 
  onComplete, 
  onCancel,
  embedded = true 
}: QuickAddComponentProps) {
  const actionLabels: Record<NonNullable<QuickAddAction>, string> = {
    outbound: 'Outbound Call',
    meeting: 'Meeting',
    proposal: 'Proposal',
    sale: 'Sale',
    task: 'Task',
    roadmap: 'Roadmap',
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Subject
        </label>
        <input
          type="text"
          defaultValue={prefill?.subject || ''}
          placeholder={`Enter ${actionLabels[action!]} subject...`}
          className="
            w-full px-4 py-2.5
            bg-white dark:bg-gray-800/50
            border border-gray-300 dark:border-gray-700/50
            rounded-lg
            text-gray-900 dark:text-gray-100
            placeholder-gray-400 dark:placeholder-gray-500
            focus:outline-none focus:ring-2 focus:ring-violet-500
            focus:border-transparent
            transition-all
          "
        />
      </div>
      
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Notes
        </label>
        <textarea
          rows={3}
          defaultValue={prefill?.notes || ''}
          placeholder="Add any notes..."
          className="
            w-full px-4 py-2.5
            bg-white dark:bg-gray-800/50
            border border-gray-300 dark:border-gray-700/50
            rounded-lg
            text-gray-900 dark:text-gray-100
            placeholder-gray-400 dark:placeholder-gray-500
            focus:outline-none focus:ring-2 focus:ring-violet-500
            focus:border-transparent
            transition-all resize-none
          "
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          className="
            flex-1 px-4 py-2.5
            bg-white dark:bg-gray-700/30
            text-gray-700 dark:text-gray-300
            border border-gray-300 dark:border-gray-600/30
            rounded-lg font-medium text-sm
            hover:bg-gray-50 dark:hover:bg-gray-700/50
            transition-all
          "
        >
          Cancel
        </button>
        <button
          onClick={onComplete}
          className="
            flex-1 px-4 py-2.5
            bg-violet-600 dark:bg-violet-500/20
            text-white dark:text-violet-400
            border border-violet-600 dark:border-violet-500/30
            rounded-lg font-medium text-sm
            hover:bg-violet-700 dark:hover:bg-violet-500/30
            transition-all
          "
        >
          Save {actionLabels[action!]}
        </button>
      </div>
    </div>
  );
}

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
  const actionLabels: Record<NonNullable<QuickAddAction>, string> = {
    outbound: 'Outbound Call',
    meeting: 'Meeting',
    proposal: 'Proposal',
    sale: 'Sale',
    task: 'Task',
    roadmap: 'Roadmap',
  };

  return (
    <motion.div
      variants={contentVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="
        flex items-center justify-between
        px-5 py-4
        border-b border-gray-200 dark:border-gray-800/50
      ">
        <div className="flex items-center gap-3">
          <AnimatePresence mode="wait">
            {activeQuickAddAction ? (
              <motion.button
                key="back"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                onClick={onClearAction}
                className="
                  p-1.5 -ml-1.5
                  text-gray-500 dark:text-gray-400
                  hover:text-gray-700 dark:hover:text-gray-200
                  hover:bg-gray-100 dark:hover:bg-gray-800/50
                  rounded-lg transition-all
                "
              >
                <ArrowLeft className="w-5 h-5" />
              </motion.button>
            ) : (
              <motion.div
                key="icon"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="
                  w-9 h-9 rounded-xl
                  bg-violet-500/10 dark:bg-violet-500/20
                  flex items-center justify-center
                "
              >
                <Brain className="w-5 h-5 text-violet-500 dark:text-violet-400" />
              </motion.div>
            )}
          </AnimatePresence>
          
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {activeQuickAddAction 
                ? `Add ${actionLabels[activeQuickAddAction]}`
                : 'Command Center'
              }
            </h2>
            {!activeQuickAddAction && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Quick actions & AI assistant
              </p>
            )}
          </div>
        </div>

        <motion.button
          variants={buttonHoverVariants}
          initial="initial"
          whileHover="hover"
          whileTap="tap"
          onClick={onClose}
          className="
            p-2 rounded-lg
            text-gray-500 dark:text-gray-400
            hover:text-gray-700 dark:hover:text-gray-200
            hover:bg-gray-100 dark:hover:bg-gray-800/50
            transition-colors
          "
        >
          <X className="w-5 h-5" />
        </motion.button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
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
                action={activeQuickAddAction}
                prefill={quickAddPrefill}
                onComplete={onClearAction}
                onCancel={onClearAction}
                embedded
              />
            </motion.div>
          ) : (
            <motion.div
              key="action-grid"
              variants={contentVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-5"
            >
              <ActionGrid onSelectAction={onSelectAction} />
              
              {/* Chat with Copilot button */}
              <motion.button
                onClick={onOpenChat}
                whileHover={{ scale: 1.01, y: -1 }}
                whileTap={{ scale: 0.99 }}
                className="
                  w-full flex items-center justify-between
                  px-5 py-4 rounded-xl
                  bg-gradient-to-r from-violet-500/10 to-purple-500/10
                  dark:from-violet-500/20 dark:to-purple-500/20
                  border border-violet-500/20 dark:border-violet-500/30
                  hover:border-violet-500/40 dark:hover:border-violet-500/50
                  group transition-all duration-300
                "
              >
                <div className="flex items-center gap-3">
                  <div className="
                    w-10 h-10 rounded-xl
                    bg-gradient-to-br from-violet-500 to-purple-600
                    flex items-center justify-center
                    shadow-lg shadow-violet-500/25
                  ">
                    <Brain className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Chat with Copilot
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Get AI-powered assistance
                    </p>
                  </div>
                </div>
                
                <motion.div
                  animate={{ x: [0, 4, 0] }}
                  transition={{ 
                    duration: 1.5, 
                    repeat: Infinity, 
                    repeatType: 'loop',
                    ease: 'easeInOut'
                  }}
                >
                  <ChevronRight className="
                    w-5 h-5 
                    text-violet-500 dark:text-violet-400
                    group-hover:text-violet-600 dark:group-hover:text-violet-300
                    transition-colors
                  " />
                </motion.div>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
```

---

## 5. Medium State Component (Chat)

```tsx
// src/components/command-center/CommandCenterMedium.tsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, 
  X, 
  ChevronLeft, 
  Send, 
  Sparkles,
  Phone,
  Users,
  FileText,
  PoundSterling,
  CheckSquare,
} from 'lucide-react';
import { contentVariants, buttonHoverVariants, chatBubbleVariants } from './animations';
import { QuickAddAction } from './useCommandCenterState';

// Quick action chips for chat
const quickActionChips = [
  { id: 'task', label: 'Add Task', icon: CheckSquare },
  { id: 'outbound', label: 'Add Outbound', icon: Phone },
  { id: 'meeting', label: 'Add Meeting', icon: Users },
  { id: 'proposal', label: 'Add Proposal', icon: FileText },
  { id: 'sale', label: 'Add Sale', icon: PoundSterling },
] as const;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface CommandCenterMediumProps {
  onClose: () => void;
  onBack: () => void;
  onOpenQuickAdd: (action: QuickAddAction) => void;
}

export function CommandCenterMedium({
  onClose,
  onBack,
  onOpenQuickAdd,
}: CommandCenterMediumProps) {
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hey! I'm your Sales Assistant. Ask me to prep meetings, find deals/contacts/tasks, and create actions.",
      timestamp: new Date(),
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Simulate assistant response
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'll help you with that! Let me analyze your request and find the relevant information.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1500);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <motion.div
      variants={contentVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="
        flex items-center justify-between
        px-5 py-4
        border-b border-gray-200 dark:border-gray-800/50
        bg-white/50 dark:bg-gray-900/50
        backdrop-blur-sm
      ">
        <div className="flex items-center gap-3">
          <motion.button
            variants={buttonHoverVariants}
            initial="initial"
            whileHover="hover"
            whileTap="tap"
            onClick={onBack}
            className="
              p-1.5 -ml-1.5
              text-gray-500 dark:text-gray-400
              hover:text-gray-700 dark:hover:text-gray-200
              hover:bg-gray-100 dark:hover:bg-gray-800/50
              rounded-lg transition-all
            "
          >
            <ChevronLeft className="w-5 h-5" />
          </motion.button>
          
          <div className="
            w-9 h-9 rounded-xl
            bg-gradient-to-br from-violet-500 to-purple-600
            flex items-center justify-center
            shadow-md shadow-violet-500/20
          ">
            <Brain className="w-5 h-5 text-white" />
          </div>
          
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Sales Assistant
            </h2>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Online
              </span>
            </div>
          </div>
        </div>

        <motion.button
          variants={buttonHoverVariants}
          initial="initial"
          whileHover="hover"
          whileTap="tap"
          onClick={onClose}
          className="
            p-2 rounded-lg
            text-gray-500 dark:text-gray-400
            hover:text-gray-700 dark:hover:text-gray-200
            hover:bg-gray-100 dark:hover:bg-gray-800/50
            transition-colors
          "
        >
          <X className="w-5 h-5" />
        </motion.button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <AnimatePresence mode="popLayout">
          {messages.map((message) => (
            <motion.div
              key={message.id}
              variants={chatBubbleVariants}
              initial="hidden"
              animate="visible"
              layout
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`
                max-w-[85%] px-4 py-3 rounded-2xl
                ${message.role === 'user'
                  ? 'bg-violet-600 dark:bg-violet-500 text-white rounded-br-md'
                  : 'bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 rounded-bl-md'
                }
              `}>
                {message.role === 'assistant' && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400" />
                    <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
                      Copilot
                    </span>
                  </div>
                )}
                <p className="text-sm leading-relaxed">{message.content}</p>
              </div>
            </motion.div>
          ))}
          
          {isTyping && (
            <motion.div
              key="typing"
              variants={chatBubbleVariants}
              initial="hidden"
              animate="visible"
              className="flex justify-start"
            >
              <div className="
                px-4 py-3 rounded-2xl rounded-bl-md
                bg-gray-100 dark:bg-gray-800/80
              ">
                <div className="flex items-center gap-1.5">
                  <motion.span
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
                    className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500"
                  />
                  <motion.span
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
                    className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500"
                  />
                  <motion.span
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
                    className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Suggested prompts */}
        {messages.length === 1 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-2 mt-4"
          >
            {[
              'Prep me for my next meeting',
              'Show me deals that need attention',
              'What should I prioritize today?',
            ].map((prompt, index) => (
              <motion.button
                key={prompt}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + index * 0.1 }}
                onClick={() => setInputValue(prompt)}
                className="
                  w-full text-left px-4 py-3 rounded-xl
                  bg-gray-50 dark:bg-gray-800/40
                  border border-gray-200 dark:border-gray-700/30
                  text-sm text-gray-700 dark:text-gray-300
                  hover:bg-gray-100 dark:hover:bg-gray-800/60
                  hover:border-gray-300 dark:hover:border-gray-600/50
                  transition-all
                "
              >
                <span className="text-gray-400 dark:text-gray-500 mr-2">›</span>
                {prompt}
              </motion.button>
            ))}
          </motion.div>
        )}
      </div>

      {/* Quick action chips */}
      <div className="
        px-5 py-3
        border-t border-gray-200 dark:border-gray-800/50
        bg-gray-50/50 dark:bg-gray-900/50
      ">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {quickActionChips.map((chip) => {
            const Icon = chip.icon;
            return (
              <motion.button
                key={chip.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onOpenQuickAdd(chip.id as QuickAddAction)}
                className="
                  flex items-center gap-2 px-3 py-2
                  bg-white dark:bg-gray-800/60
                  border border-gray-200 dark:border-gray-700/40
                  rounded-lg text-xs font-medium
                  text-gray-700 dark:text-gray-300
                  hover:bg-gray-50 dark:hover:bg-gray-700/60
                  hover:border-gray-300 dark:hover:border-gray-600/60
                  transition-all whitespace-nowrap
                "
              >
                <Icon className="w-3.5 h-3.5" />
                {chip.label}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Input */}
      <div className="
        px-5 py-4
        border-t border-gray-200 dark:border-gray-800/50
        bg-white/80 dark:bg-gray-900/80
        backdrop-blur-sm
      ">
        <div className="
          flex items-end gap-3
          bg-gray-100 dark:bg-gray-800/60
          border border-gray-200 dark:border-gray-700/40
          rounded-xl px-4 py-3
          focus-within:border-violet-500/50
          focus-within:ring-2 focus-within:ring-violet-500/20
          transition-all
        ">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me to create, find, or prep anything..."
            rows={1}
            className="
              flex-1 bg-transparent resize-none
              text-sm text-gray-900 dark:text-gray-100
              placeholder-gray-400 dark:placeholder-gray-500
              focus:outline-none
              max-h-32
            "
            style={{ minHeight: '24px' }}
          />
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className="
              p-2 rounded-lg
              bg-violet-600 dark:bg-violet-500
              text-white
              disabled:opacity-50 disabled:cursor-not-allowed
              hover:bg-violet-700 dark:hover:bg-violet-600
              transition-all
            "
          >
            <Send className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
```

---

## 6. Copilot Right Panel Component

```tsx
// src/components/command-center/CopilotRightPanel.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  Users, 
  Calendar, 
  AlertCircle,
  ChevronRight,
  Building2,
  Mail,
  Phone,
} from 'lucide-react';
import { rightPanelVariants, staggerContainerVariants, actionGridVariants } from './animations';

interface Deal {
  id: string;
  name: string;
  company: string;
  value: string;
  stage: string;
  priority: 'high' | 'medium' | 'low';
}

interface Contact {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
}

interface Task {
  id: string;
  title: string;
  dueDate: string;
  priority: 'high' | 'medium' | 'low';
}

// Sample data - replace with actual data from copilot response
const sampleDeals: Deal[] = [
  { id: '1', name: 'Enterprise Deal', company: 'Acme Corp', value: '£45,000', stage: 'Negotiation', priority: 'high' },
  { id: '2', name: 'Mid-Market Expansion', company: 'TechStart Inc', value: '£22,500', stage: 'Proposal', priority: 'medium' },
];

const sampleContacts: Contact[] = [
  { id: '1', name: 'Sarah Johnson', company: 'Acme Corp', email: 'sarah@acme.com', phone: '+44 7911 123456' },
  { id: '2', name: 'Michael Chen', company: 'TechStart Inc', email: 'michael@techstart.com', phone: '+44 7911 654321' },
];

const sampleTasks: Task[] = [
  { id: '1', title: 'Follow up with Sarah', dueDate: 'Today', priority: 'high' },
  { id: '2', title: 'Send proposal to TechStart', dueDate: 'Tomorrow', priority: 'medium' },
  { id: '3', title: 'Review contract terms', dueDate: 'This week', priority: 'low' },
];

interface CopilotRightPanelProps {
  type?: 'deals' | 'contacts' | 'tasks' | 'insights';
  data?: any;
}

export function CopilotRightPanel({ type = 'insights', data }: CopilotRightPanelProps) {
  const priorityColors = {
    high: 'bg-red-500/10 text-red-500 border-red-500/20',
    medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    low: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  };

  return (
    <motion.div
      variants={rightPanelVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="h-full flex flex-col bg-gray-50 dark:bg-gray-950/50"
    >
      {/* Header */}
      <div className="
        px-5 py-4
        border-b border-gray-200 dark:border-gray-800/50
      ">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Context Panel
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Related information from your request
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Deals Section */}
        <motion.section
          variants={staggerContainerVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="
                w-7 h-7 rounded-lg
                bg-emerald-500/10 dark:bg-emerald-500/20
                flex items-center justify-center
              ">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              </div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Related Deals
              </h4>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {sampleDeals.length} found
            </span>
          </div>

          <div className="space-y-2">
            {sampleDeals.map((deal, index) => (
              <motion.div
                key={deal.id}
                custom={index}
                variants={actionGridVariants}
                className="
                  p-3 rounded-xl
                  bg-white dark:bg-gray-900/60
                  border border-gray-200 dark:border-gray-800/50
                  hover:border-emerald-500/30 dark:hover:border-emerald-500/30
                  cursor-pointer transition-all group
                "
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {deal.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Building2 className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {deal.company}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="
                    w-4 h-4 text-gray-400
                    opacity-0 group-hover:opacity-100
                    transition-opacity
                  " />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {deal.value}
                  </span>
                  <span className={`
                    px-2 py-0.5 rounded-full text-xs font-medium border
                    ${priorityColors[deal.priority]}
                  `}>
                    {deal.stage}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Contacts Section */}
        <motion.section
          variants={staggerContainerVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="
                w-7 h-7 rounded-lg
                bg-blue-500/10 dark:bg-blue-500/20
                flex items-center justify-center
              ">
                <Users className="w-4 h-4 text-blue-500" />
              </div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Key Contacts
              </h4>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {sampleContacts.length} found
            </span>
          </div>

          <div className="space-y-2">
            {sampleContacts.map((contact, index) => (
              <motion.div
                key={contact.id}
                custom={index + sampleDeals.length}
                variants={actionGridVariants}
                className="
                  p-3 rounded-xl
                  bg-white dark:bg-gray-900/60
                  border border-gray-200 dark:border-gray-800/50
                  hover:border-blue-500/30 dark:hover:border-blue-500/30
                  cursor-pointer transition-all group
                "
              >
                <div className="flex items-center gap-3">
                  <div className="
                    w-9 h-9 rounded-full
                    bg-gradient-to-br from-blue-500 to-violet-500
                    flex items-center justify-center
                    text-white text-sm font-semibold
                  ">
                    {contact.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {contact.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {contact.company}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2 pl-12">
                  <button className="
                    flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400
                    hover:text-blue-500 dark:hover:text-blue-400
                    transition-colors
                  ">
                    <Mail className="w-3 h-3" />
                    Email
                  </button>
                  <button className="
                    flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400
                    hover:text-emerald-500 dark:hover:text-emerald-400
                    transition-colors
                  ">
                    <Phone className="w-3 h-3" />
                    Call
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Tasks Section */}
        <motion.section
          variants={staggerContainerVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="
                w-7 h-7 rounded-lg
                bg-violet-500/10 dark:bg-violet-500/20
                flex items-center justify-center
              ">
                <Calendar className="w-4 h-4 text-violet-500" />
              </div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Related Tasks
              </h4>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {sampleTasks.length} pending
            </span>
          </div>

          <div className="space-y-2">
            {sampleTasks.map((task, index) => (
              <motion.div
                key={task.id}
                custom={index + sampleDeals.length + sampleContacts.length}
                variants={actionGridVariants}
                className="
                  flex items-center gap-3 p-3 rounded-xl
                  bg-white dark:bg-gray-900/60
                  border border-gray-200 dark:border-gray-800/50
                  hover:border-violet-500/30 dark:hover:border-violet-500/30
                  cursor-pointer transition-all
                "
              >
                <div className={`
                  w-2 h-2 rounded-full
                  ${task.priority === 'high' ? 'bg-red-500' :
                    task.priority === 'medium' ? 'bg-yellow-500' : 'bg-emerald-500'}
                `} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {task.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Due: {task.dueDate}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Insights Section */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="
              w-7 h-7 rounded-lg
              bg-amber-500/10 dark:bg-amber-500/20
              flex items-center justify-center
            ">
              <AlertCircle className="w-4 h-4 text-amber-500" />
            </div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              AI Insights
            </h4>
          </div>

          <div className="
            p-4 rounded-xl
            bg-gradient-to-br from-amber-500/5 to-orange-500/5
            dark:from-amber-500/10 dark:to-orange-500/10
            border border-amber-500/20 dark:border-amber-500/30
          ">
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              Based on your recent activity, I recommend prioritizing the 
              <span className="font-medium text-amber-600 dark:text-amber-400"> Enterprise Deal </span>
              with Acme Corp. Sarah Johnson hasn't been contacted in 5 days, 
              and the deal is at a critical stage.
            </p>
          </div>
        </motion.section>
      </div>
    </motion.div>
  );
}
```

---

## 7. Full State Component (Two-Panel)

```tsx
// src/components/command-center/CommandCenterFull.tsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, 
  X, 
  Minimize2, 
  PanelRightClose,
  PanelRightOpen,
  Send,
  Sparkles,
} from 'lucide-react';
import { CopilotRightPanel } from './CopilotRightPanel';
import { contentVariants, buttonHoverVariants, chatBubbleVariants, rightPanelVariants } from './animations';
import { QuickAddAction } from './useCommandCenterState';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  structuredResponse?: {
    type: string;
    data: any;
  };
}

interface CommandCenterFullProps {
  onClose: () => void;
  onCollapse: () => void;
  onOpenQuickAdd: (action: QuickAddAction) => void;
}

export function CommandCenterFull({
  onClose,
  onCollapse,
  onOpenQuickAdd,
}: CommandCenterFullProps) {
  const [inputValue, setInputValue] = useState('');
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "I've found some relevant information for your request. Check the context panel on the right for deals, contacts, and tasks related to your query.",
      timestamp: new Date(),
      structuredResponse: {
        type: 'context',
        data: {},
      },
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I've updated the context panel with the latest information based on your query.",
        timestamp: new Date(),
        structuredResponse: {
          type: 'context',
          data: {},
        },
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1500);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <motion.div
      variants={contentVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="
        flex items-center justify-between
        px-5 py-4
        border-b border-gray-200 dark:border-gray-800/50
        bg-white/80 dark:bg-gray-900/80
        backdrop-blur-sm
      ">
        <div className="flex items-center gap-3">
          <div className="
            w-10 h-10 rounded-xl
            bg-gradient-to-br from-violet-500 to-purple-600
            flex items-center justify-center
            shadow-lg shadow-violet-500/25
          ">
            <Brain className="w-5 h-5 text-white" />
          </div>
          
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Command Center
            </h2>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Full workspace mode
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle right panel (mobile) */}
          <motion.button
            variants={buttonHoverVariants}
            initial="initial"
            whileHover="hover"
            whileTap="tap"
            onClick={() => setShowRightPanel(!showRightPanel)}
            className="
              p-2 rounded-lg
              text-gray-500 dark:text-gray-400
              hover:text-gray-700 dark:hover:text-gray-200
              hover:bg-gray-100 dark:hover:bg-gray-800/50
              transition-colors
              lg:hidden
            "
          >
            {showRightPanel ? (
              <PanelRightClose className="w-5 h-5" />
            ) : (
              <PanelRightOpen className="w-5 h-5" />
            )}
          </motion.button>

          {/* Collapse button */}
          <motion.button
            variants={buttonHoverVariants}
            initial="initial"
            whileHover="hover"
            whileTap="tap"
            onClick={onCollapse}
            className="
              p-2 rounded-lg
              text-gray-500 dark:text-gray-400
              hover:text-gray-700 dark:hover:text-gray-200
              hover:bg-gray-100 dark:hover:bg-gray-800/50
              transition-colors
            "
          >
            <Minimize2 className="w-5 h-5" />
          </motion.button>

          {/* Close button */}
          <motion.button
            variants={buttonHoverVariants}
            initial="initial"
            whileHover="hover"
            whileTap="tap"
            onClick={onClose}
            className="
              p-2 rounded-lg
              text-gray-500 dark:text-gray-400
              hover:text-gray-700 dark:hover:text-gray-200
              hover:bg-gray-100 dark:hover:bg-gray-800/50
              transition-colors
            "
          >
            <X className="w-5 h-5" />
          </motion.button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex min-h-0">
        {/* Left panel - Chat */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <AnimatePresence mode="popLayout">
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  variants={chatBubbleVariants}
                  initial="hidden"
                  animate="visible"
                  layout
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`
                    max-w-[80%] px-4 py-3 rounded-2xl
                    ${message.role === 'user'
                      ? 'bg-violet-600 dark:bg-violet-500 text-white rounded-br-md'
                      : 'bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 rounded-bl-md'
                    }
                  `}>
                    {message.role === 'assistant' && (
                      <div className="flex items-center gap-2 mb-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400" />
                        <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
                          Copilot
                        </span>
                      </div>
                    )}
                    <p className="text-sm leading-relaxed">{message.content}</p>
                    
                    {message.structuredResponse && (
                      <div className="
                        mt-3 pt-3
                        border-t border-gray-200/50 dark:border-gray-700/50
                      ">
                        <span className="
                          inline-flex items-center gap-1.5
                          px-2 py-1 rounded-md
                          bg-violet-500/10 dark:bg-violet-500/20
                          text-xs font-medium text-violet-600 dark:text-violet-400
                        ">
                          <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                          Context panel updated
                        </span>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              
              {isTyping && (
                <motion.div
                  key="typing"
                  variants={chatBubbleVariants}
                  initial="hidden"
                  animate="visible"
                  className="flex justify-start"
                >
                  <div className="
                    px-4 py-3 rounded-2xl rounded-bl-md
                    bg-gray-100 dark:bg-gray-800/80
                  ">
                    <div className="flex items-center gap-1.5">
                      <motion.span
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
                        className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500"
                      />
                      <motion.span
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
                        className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500"
                      />
                      <motion.span
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
                        className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Input */}
          <div className="
            px-5 py-4
            border-t border-gray-200 dark:border-gray-800/50
            bg-white/80 dark:bg-gray-900/80
            backdrop-blur-sm
          ">
            <div className="
              flex items-end gap-3
              bg-gray-100 dark:bg-gray-800/60
              border border-gray-200 dark:border-gray-700/40
              rounded-xl px-4 py-3
              focus-within:border-violet-500/50
              focus-within:ring-2 focus-within:ring-violet-500/20
              transition-all
            ">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Continue the conversation..."
                rows={1}
                className="
                  flex-1 bg-transparent resize-none
                  text-sm text-gray-900 dark:text-gray-100
                  placeholder-gray-400 dark:placeholder-gray-500
                  focus:outline-none
                  max-h-32
                "
                style={{ minHeight: '24px' }}
              />
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className="
                  p-2 rounded-lg
                  bg-violet-600 dark:bg-violet-500
                  text-white
                  disabled:opacity-50 disabled:cursor-not-allowed
                  hover:bg-violet-700 dark:hover:bg-violet-600
                  transition-all
                "
              >
                <Send className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        </div>

        {/* Right panel - Context */}
        <AnimatePresence>
          {showRightPanel && (
            <motion.div
              variants={rightPanelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="
                hidden lg:block
                w-[380px] flex-shrink-0
                border-l border-gray-200 dark:border-gray-800/50
              "
            >
              <CopilotRightPanel />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile right panel overlay */}
        <AnimatePresence>
          {showRightPanel && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="
                lg:hidden
                fixed inset-0 z-50
                bg-black/50 backdrop-blur-sm
              "
              onClick={() => setShowRightPanel(false)}
            >
              <motion.div
                variants={rightPanelVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                onClick={(e) => e.stopPropagation()}
                className="
                  absolute right-0 top-0 bottom-0
                  w-[85vw] max-w-[380px]
                  bg-white dark:bg-gray-900
                  shadow-2xl
                "
              >
                <CopilotRightPanel />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
```

---

## 8. Main Command Center Orchestrator

```tsx
// src/components/command-center/CommandCenter.tsx
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCommandCenterState, QuickAddAction } from './useCommandCenterState';
import { CommandCenterCompact } from './CommandCenterCompact';
import { CommandCenterMedium } from './CommandCenterMedium';
import { CommandCenterFull } from './CommandCenterFull';
import { modalVariants, backdropVariants } from './animations';

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

  // Handle quick add from chat view
  const handleOpenQuickAdd = (action: QuickAddAction) => {
    returnToCompact();
    setTimeout(() => {
      setActiveQuickAddAction(action);
    }, 200);
  };

  // Don't render if closed
  if (state === 'closed') return null;

  return (
    <AnimatePresence mode="wait">
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          key="backdrop"
          variants={backdropVariants}
          initial="closed"
          animate={state}
          exit="closed"
          onClick={close}
          className={`
            absolute inset-0
            ${state === 'compact' 
              ? 'bg-gray-900/30 dark:bg-black/50' 
              : 'bg-gray-900/50 dark:bg-black/70'
            }
          `}
        />

        {/* Modal Container */}
        <motion.div
          key="modal"
          variants={modalVariants}
          initial="closed"
          animate={state}
          exit="closed"
          className="
            relative z-10
            bg-white dark:bg-gray-900
            border border-gray-200 dark:border-gray-800/60
            shadow-2xl dark:shadow-none
            overflow-hidden
            flex flex-col
          "
          style={{
            boxShadow: state !== 'compact' 
              ? '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
              : '0 10px 40px -10px rgba(0, 0, 0, 0.15)',
          }}
        >
          {/* Content based on state */}
          <AnimatePresence mode="wait">
            {state === 'compact' && (
              <CommandCenterCompact
                key="compact"
                onClose={close}
                onOpenChat={openChat}
                activeQuickAddAction={activeQuickAddAction}
                quickAddPrefill={quickAddPrefill}
                onSelectAction={setActiveQuickAddAction}
                onClearAction={clearQuickAddAction}
              />
            )}

            {state === 'medium' && (
              <CommandCenterMedium
                key="medium"
                onClose={close}
                onBack={returnToCompact}
                onOpenQuickAdd={handleOpenQuickAdd}
              />
            )}

            {state === 'full' && (
              <CommandCenterFull
                key="full"
                onClose={close}
                onCollapse={collapseToMedium}
                onOpenQuickAdd={handleOpenQuickAdd}
              />
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
```

---

## 9. Index Export

```typescript
// src/components/command-center/index.ts
export { CommandCenter } from './CommandCenter';
export { useCommandCenterState } from './useCommandCenterState';
export type { CommandCenterState, QuickAddAction, QuickAddPrefill } from './useCommandCenterState';
```

---

## 10. AppLayout Integration

```tsx
// src/components/AppLayout.tsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { CommandCenter } from './command-center';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [isCommandCenterOpen, setIsCommandCenterOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Main content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Floating Action Button */}
      <motion.button
        onClick={() => setIsCommandCenterOpen(true)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="
          fixed bottom-6 right-6 z-40
          w-14 h-14 rounded-full
          bg-gradient-to-br from-emerald-500 to-emerald-600
          text-white
          shadow-lg shadow-emerald-500/30
          hover:shadow-xl hover:shadow-emerald-500/40
          transition-shadow
          flex items-center justify-center
        "
      >
        <Plus className="w-6 h-6" />
      </motion.button>

      {/* Command Center Modal */}
      <CommandCenter
        isOpen={isCommandCenterOpen}
        onClose={() => setIsCommandCenterOpen(false)}
      />
    </div>
  );
}
```

---

## Usage Example

```tsx
// pages/index.tsx or app/page.tsx
import { AppLayout } from '@/components/AppLayout';

export default function HomePage() {
  return (
    <AppLayout>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Click the green button in the bottom right to open the Command Center.
        </p>
      </div>
    </AppLayout>
  );
}
```

---

## Key Features

### 🎭 **Smooth Animations**
- Spring-based transitions with tuned stiffness/damping for each state
- Staggered entrance animations for grid items
- Chat bubble pop-in effects
- Right panel slide animations

### 📐 **Three Progressive States**
1. **Compact** (~28rem): Quick actions grid + Chat button
2. **Medium** (~42rem, 70dvh): Full chat interface
3. **Full** (~95vw, 95dvh): Two-panel workspace

### 🔄 **State Transitions**
- Compact → Medium: "Chat with Copilot" button
- Medium → Full: Auto-triggered on structured response
- Full → Medium: Collapse button
- Medium → Compact: Back button
- Any → Closed: X button or Escape key

### 📱 **Mobile Responsive**
- CSS clamp/min for fluid sizing
- Right panel hidden on mobile with toggle
- Touch-friendly tap targets

### ✨ **Design System Compliant**
- Follows the glassmorphism dark mode patterns
- Clean light mode with proper shadows
- Consistent border colors and transitions
- Theme-aware color tokens throughout