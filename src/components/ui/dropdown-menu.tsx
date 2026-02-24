import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface DropdownMenuProps {
  children: React.ReactNode;
}

interface DropdownMenuTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
}

interface DropdownMenuContentProps {
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}

interface DropdownMenuItemProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}

const DropdownMenuContext = React.createContext<{
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  triggerRef: React.RefObject<HTMLElement>;
  contentRef: React.RefObject<HTMLDivElement>;
}>({
  isOpen: false,
  setIsOpen: () => {},
  triggerRef: { current: null },
  contentRef: { current: null },
});

// Export hook to allow closing dropdown from nested components
export function useDropdownMenuClose() {
  const { setIsOpen } = React.useContext(DropdownMenuContext);
  return () => setIsOpen(false);
}

export function DropdownMenu({ children }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Check if click is outside both the trigger AND the dropdown content
      const isOutsideTrigger = triggerRef.current && !triggerRef.current.contains(target);
      const isOutsideContent = contentRef.current && !contentRef.current.contains(target);

      if (isOutsideTrigger && isOutsideContent) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <DropdownMenuContext.Provider value={{ isOpen, setIsOpen, triggerRef, contentRef }}>
      <div className="relative inline-block">{children}</div>
    </DropdownMenuContext.Provider>
  );
}

export function DropdownMenuTrigger({ children, asChild }: DropdownMenuTriggerProps) {
  const { setIsOpen, triggerRef } = React.useContext(DropdownMenuContext);

  const handleClick = () => {
    setIsOpen(prev => !prev);
  };

  if (asChild) {
    return React.cloneElement(children as React.ReactElement, {
      ref: triggerRef,
      onClick: handleClick,
    });
  }

  return (
    <button ref={triggerRef as any} onClick={handleClick}>
      {children}
    </button>
  );
}

export function DropdownMenuContent({
  children,
  align = 'start',
  className = '',
}: DropdownMenuContentProps) {
  const { isOpen, contentRef, triggerRef } = React.useContext(DropdownMenuContext);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 192; // min-w-[12rem] approximate

    let left: number;
    if (align === 'end') {
      left = rect.right - menuWidth;
    } else if (align === 'center') {
      left = rect.left + rect.width / 2 - menuWidth / 2;
    } else {
      left = rect.left;
    }

    // Keep within viewport
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));

    setPosition({ top: rect.bottom + 4, left });
  }, [align, triggerRef]);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  return ReactDOM.createPortal(
    <AnimatePresence>
      {isOpen && position && (
        <motion.div
          ref={contentRef}
          initial={{ opacity: 0, y: -4, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.95 }}
          transition={{ duration: 0.1 }}
          style={{ top: position.top, left: position.left }}
          className={`
            fixed z-[9999] min-w-[12rem] rounded-md border shadow-md backdrop-blur-sm
            bg-white/95 dark:bg-gray-900/95 border-[#E2E8F0] dark:border-gray-700/50 text-[#1E293B] dark:text-gray-100 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-none
            ${className}
          `}
        >
          <div className="p-1">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export function DropdownMenuItem({
  children,
  className = '',
  onClick,
  disabled = false,
}: DropdownMenuItemProps) {
  const { setIsOpen } = React.useContext(DropdownMenuContext);

  const handleClick = () => {
    if (disabled) return;
    onClick?.();
    setIsOpen(false);
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`
        relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm
        outline-none transition-colors hover:bg-slate-100 dark:hover:bg-gray-800 hover:text-[#1E293B] dark:hover:text-white focus:bg-slate-100 dark:focus:bg-gray-800 focus:text-[#1E293B] dark:focus:text-white
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
    >
      {children}
    </button>
  );
}

export function DropdownMenuSeparator({ className = '' }: { className?: string }) {
  return (
    <div className={`-mx-1 my-1 h-px bg-slate-200 dark:bg-gray-700 ${className}`} />
  );
}