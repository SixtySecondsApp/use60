import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Base Skeleton Component - Animated loading placeholder
 */
interface SkeletonProps {
  className?: string;
  variant?: 'default' | 'shimmer' | 'pulse';
}

export function Skeleton({ className, variant = 'shimmer' }: SkeletonProps) {
  return (
    <div
      className={cn(
        'bg-gray-200 dark:bg-gray-800/50 rounded',
        variant === 'shimmer' && 'animate-shimmer bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-800/50 dark:via-gray-700/50 dark:to-gray-800/50 bg-[length:200%_100%]',
        variant === 'pulse' && 'animate-pulse',
        className
      )}
    />
  );
}

/**
 * Email List Item Skeleton - Loading state for individual email items
 */
export function EmailListItemSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-4 border-l-2 border-l-transparent bg-gray-900/20"
    >
      <div className="flex items-start gap-3">
        {/* Status indicator */}
        <div className="flex flex-col items-center gap-1 pt-1">
          <Skeleton className="w-2 h-2 rounded-full" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Name and timestamp */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20 ml-auto" />
          </div>

          {/* Subject */}
          <Skeleton className="h-4 w-3/4" />

          {/* Preview */}
          <Skeleton className="h-3 w-full" />

          {/* Labels */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Email List Skeleton - Multiple email items
 */
export function EmailListSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="space-y-px">
      {Array.from({ length: count }).map((_, i) => (
        <EmailListItemSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Email Thread Message Skeleton - Loading state for email message
 */
export function EmailThreadMessageSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900/40 rounded-xl border border-gray-800/50 p-4"
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24 ml-auto" />
          </div>
          <Skeleton className="h-3 w-48" />
        </div>
      </div>

      {/* Content */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>

      {/* Attachments (optional) */}
      <div className="mt-4 pt-4 border-t border-gray-800/50 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    </motion.div>
  );
}

/**
 * Email Thread Skeleton - Complete thread view
 */
export function EmailThreadSkeleton() {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-800/50">
        <div className="space-y-3">
          <Skeleton className="h-6 w-3/4" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-4">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <EmailThreadMessageSkeleton />
        <EmailThreadMessageSkeleton />
      </div>
    </div>
  );
}

/**
 * Composer Skeleton - Email composer loading state
 */
export function EmailComposerSkeleton() {
  return (
    <div className="space-y-4 p-6">
      {/* To field */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>

      {/* Subject */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>

      {/* Body */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-24 rounded-lg" />
        <Skeleton className="h-10 w-24 rounded-lg" />
      </div>
    </div>
  );
}

/**
 * Attachment Skeleton - Loading state for attachments
 */
export function AttachmentSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
      <Skeleton className="w-8 h-8 rounded" />
      <div className="flex-1 space-y-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="w-8 h-8 rounded" />
    </div>
  );
}
