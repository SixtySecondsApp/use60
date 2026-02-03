import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        default:
          'bg-blue-600 dark:bg-blue-600 text-white border border-blue-600 dark:border-blue-500 hover:bg-blue-700 dark:hover:bg-blue-500 hover:border-blue-700 dark:hover:border-blue-400 shadow-sm focus-visible:ring-blue-500',
        destructive:
          'bg-red-600 dark:bg-red-600 text-white border border-red-600 dark:border-red-500 hover:bg-red-700 dark:hover:bg-red-500 hover:border-red-700 dark:hover:border-red-400 shadow-sm focus-visible:ring-red-500',
        outline:
          'bg-white dark:bg-gray-700/10 text-[#1E293B] dark:text-gray-300 border border-[#E2E8F0] dark:border-gray-600/20 hover:bg-slate-50 dark:hover:bg-gray-700/20 hover:border-slate-300 dark:hover:border-gray-500/30 shadow-sm dark:shadow-none focus-visible:ring-gray-500',
        secondary:
          'bg-white dark:bg-gray-600/10 text-[#1E293B] dark:text-gray-400 border border-[#E2E8F0] dark:border-gray-500/20 hover:bg-slate-50 dark:hover:bg-gray-600/20 hover:border-slate-300 dark:hover:border-gray-500/30 shadow-sm dark:shadow-none focus-visible:ring-gray-500',
        tertiary:
          'bg-slate-50 dark:bg-gray-800/50 text-[#64748B] dark:text-gray-400 border border-[#E2E8F0] dark:border-gray-700/50 hover:bg-slate-100 dark:hover:bg-gray-700/50 hover:border-slate-300 dark:hover:border-gray-600/50 focus-visible:ring-gray-500',
        success:
          'bg-emerald-600 dark:bg-emerald-600 text-white border border-emerald-600 dark:border-emerald-500 hover:bg-emerald-700 dark:hover:bg-emerald-500 hover:border-emerald-700 dark:hover:border-emerald-400 shadow-sm focus-visible:ring-emerald-500',
        danger:
          'bg-red-600 dark:bg-red-600 text-white border border-red-600 dark:border-red-500 hover:bg-red-700 dark:hover:bg-red-500 hover:border-red-700 dark:hover:border-red-400 shadow-sm focus-visible:ring-red-500',
        ghost:
          'bg-transparent text-[#64748B] dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800/30 hover:text-[#1E293B] dark:hover:text-white focus-visible:ring-gray-500',
        link: 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline underline-offset-4',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };