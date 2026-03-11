import React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "animate-pulse rounded-md bg-slate-200 dark:bg-gray-700/50",
          className
        )}
        {...props}
      />
    );
  }
);

Skeleton.displayName = "Skeleton";

export { Skeleton };