import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TooltipProviderProps {
  children: React.ReactNode;
  delayDuration?: number;
}

interface TooltipProps {
  children: React.ReactNode;
}

interface TooltipTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
}

interface TooltipContentProps {
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  className?: string;
  sideOffset?: number;
}

const TooltipContext = React.createContext<{
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  delayDuration: number;
}>({
  isOpen: false,
  setIsOpen: () => {},
  delayDuration: 200,
});

const TooltipProviderContext = React.createContext<{
  delayDuration: number;
}>({
  delayDuration: 200,
});

export function TooltipProvider({
  children,
  delayDuration = 200
}: TooltipProviderProps) {
  return (
    <TooltipProviderContext.Provider value={{ delayDuration }}>
      {children}
    </TooltipProviderContext.Provider>
  );
}

export function Tooltip({ children }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { delayDuration } = React.useContext(TooltipProviderContext);

  return (
    <TooltipContext.Provider value={{ isOpen, setIsOpen, delayDuration }}>
      <div className="relative inline-block">{children}</div>
    </TooltipContext.Provider>
  );
}

export function TooltipTrigger({ children, asChild }: TooltipTriggerProps) {
  const { setIsOpen, delayDuration } = React.useContext(TooltipContext);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(true);
    }, delayDuration);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsOpen(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const props = {
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onFocus: () => setIsOpen(true),
    onBlur: () => setIsOpen(false),
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement, props);
  }

  return <span {...props}>{children}</span>;
}

export function TooltipContent({
  children,
  side = 'top',
  className = '',
}: TooltipContentProps) {
  const { isOpen } = React.useContext(TooltipContext);

  const sideStyles = {
    top: 'bottom-full mb-1',
    bottom: 'top-full mt-1',
    left: 'right-full mr-1',
    right: 'left-full ml-1',
  }[side];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.1 }}
          className={cn(
            'absolute z-50 px-3 py-1.5 text-xs font-medium rounded-md shadow-md whitespace-nowrap bg-slate-900 text-white dark:bg-white dark:text-slate-900 left-1/2 -translate-x-1/2',
            sideStyles,
            className
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
