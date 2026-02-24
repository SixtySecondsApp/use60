/**
 * Tool Call Indicator Component
 * Visualizes tool execution with animated progress states
 * 
 * US-002: Enhanced with delightful animations, duration estimates, and staggered reveals
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ToolCall, ToolStep, ToolState } from './toolTypes';
import {
  getToolConfig,
  getStepIcon,
  getStepDurationEstimate,
  formatDurationEstimate,
  formatActualDuration,
  calculateTotalStepDuration,
} from '@/lib/utils/toolUtils';

interface ToolCallIndicatorProps {
  toolCall: ToolCall;
  onComplete?: (result: unknown) => void;
  compact?: boolean;
  preview?: string[];
}

function getStateLabel(state: ToolState): string {
  const labels: Record<ToolState, string> = {
    pending: 'Pending...',
    initiating: 'Starting...',
    fetching: 'Retrieving data...',
    processing: 'Analyzing...',
    completing: 'Finalizing...',
    complete: 'Complete',
    active: 'Active...',
    error: 'Failed'
  };
  return labels[state] || 'Processing...';
}

function getProgress(toolCall: ToolCall): number {
  if (toolCall.state === 'complete') return 100;
  if (toolCall.state === 'error') return 100; // Show full bar in error state

  const completedSteps = toolCall.steps.filter(s => s.state === 'complete').length;
  const totalSteps = toolCall.steps.length;

  if (totalSteps === 0) {
    const stateProgress: Record<ToolState, number> = {
      pending: 10,
      initiating: 20,
      fetching: 40,
      processing: 70,
      completing: 90,
      complete: 100,
      active: 50,
      error: 100
    };
    return stateProgress[toolCall.state] || 0;
  }

  return (completedSteps / totalSteps) * 100;
}

function formatMetadata(metadata: Record<string, unknown>): string {
  return Object.entries(metadata)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' • ');
}

// =============================================================================
// Step Animation Variants
// =============================================================================

const stepVariants = {
  hidden: { 
    opacity: 0, 
    x: -20,
    scale: 0.95
  },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      delay: i * 0.15, // Staggered reveal
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94] // Custom easing for smooth reveal
    }
  }),
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.2 }
  }
};

const iconPulseVariants = {
  pending: {
    scale: 1,
    opacity: 0.5
  },
  active: {
    scale: [1, 1.15, 1],
    opacity: 1,
    boxShadow: [
      '0 0 0 0 rgba(59, 130, 246, 0.5)',
      '0 0 0 10px rgba(59, 130, 246, 0)',
      '0 0 0 0 rgba(59, 130, 246, 0)'
    ],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut'
    }
  },
  complete: {
    scale: [1.2, 1],
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 15
    }
  },
  error: {
    scale: [1, 1.1, 1],
    opacity: 1,
    boxShadow: [
      '0 0 0 0 rgba(239, 68, 68, 0.5)',
      '0 0 0 8px rgba(239, 68, 68, 0)',
      '0 0 0 0 rgba(239, 68, 68, 0)'
    ],
    transition: {
      duration: 0.6,
      ease: 'easeOut'
    }
  }
};

// =============================================================================
// Individual Step Component
// =============================================================================

interface ToolStepComponentProps {
  step: ToolStep;
  index: number;
  isLast: boolean;
  totalSteps: number;
}

function ToolStepComponent({ step, index, isLast }: ToolStepComponentProps) {
  const StepIcon = getStepIcon(step.icon);
  const estimatedDuration = getStepDurationEstimate(step.icon);
  const capabilityLabel = step.capability
    ? step.capability.charAt(0).toUpperCase() + step.capability.slice(1)
    : null;

  // Determine animation state
  const animationState = step.state === 'complete' ? 'complete' 
    : step.state === 'error' ? 'error'
    : (step.state === 'active' ? 'active' : 'pending');

  return (
    <motion.div
      custom={index}
      variants={stepVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex items-start gap-3 relative"
    >
      {/* Connecting Line with gradient for completed sections */}
      {!isLast && (
        <motion.div 
          className="absolute left-[11px] top-6 w-0.5 h-[calc(100%+4px)]"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ delay: index * 0.15 + 0.2, duration: 0.3 }}
          style={{ transformOrigin: 'top' }}
        >
          <div className={`h-full w-full ${
            step.state === 'complete'
              ? 'bg-gradient-to-b from-emerald-400 to-emerald-400/30'
              : 'bg-gradient-to-b from-gray-300 dark:from-gray-700/50 to-transparent'
          }`} />
        </motion.div>
      )}

      {/* Icon Container */}
      <div className="relative z-10">
        <motion.div
          className={`w-6 h-6 rounded-full flex items-center justify-center ${
            step.state === 'complete'
              ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30'
              : step.state === 'error'
              ? 'bg-red-500 shadow-lg shadow-red-500/30'
              : step.state === 'active'
              ? 'bg-blue-500 shadow-lg shadow-blue-500/30'
              : 'bg-gray-200 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600/50'
          }`}
          variants={iconPulseVariants}
          animate={animationState}
        >
          {step.state === 'complete' ? (
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 12 }}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
            </motion.div>
          ) : step.state === 'error' ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200 }}
            >
              <XCircle className="w-3.5 h-3.5 text-white" />
            </motion.div>
          ) : step.state === 'active' ? (
            <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
          ) : (
            <StepIcon className="w-3 h-3 text-gray-500 dark:text-gray-400" />
          )}
        </motion.div>
      </div>

      {/* Label and Metadata */}
      <div className="flex-1 pt-0.5 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <motion.div
            className={`text-sm transition-colors duration-200 ${
              step.state === 'complete'
                ? 'text-gray-700 dark:text-gray-300'
                : step.state === 'error'
                ? 'text-red-500 dark:text-red-400'
                : step.state === 'active'
                ? 'text-gray-900 dark:text-gray-100 font-medium'
                : 'text-gray-500 dark:text-gray-400'
            }`}
            animate={{
              opacity: step.state === 'pending' ? 0.7 : 1
            }}
          >
            {step.label}
          </motion.div>
          
          {capabilityLabel && (
            <Badge variant="outline" className="text-xs h-5 px-1.5">
              {capabilityLabel}
            </Badge>
          )}
          
          {step.provider && step.provider !== 'db' && (
            <Badge variant="outline" className="text-xs h-5 px-1.5">
              {step.provider === 'hubspot' ? 'HubSpot' :
               step.provider === 'salesforce' ? 'Salesforce' :
               step.provider === 'google' ? 'Google' :
               step.provider === 'gmail' ? 'Gmail' :
               step.provider === 'slack' ? 'Slack' :
               step.provider === 'fathom' ? 'Fathom' :
               step.provider === 'meetingbaas' ? 'MeetingBaaS' :
               step.provider}
            </Badge>
          )}

          {/* Duration estimate for active step - only show if >= 1 second */}
          {step.state === 'active' && estimatedDuration >= 1000 && (
            <motion.div
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-1 text-xs text-blue-400"
            >
              <Clock className="w-3 h-3" />
              <span>{formatDurationEstimate(estimatedDuration)}</span>
            </motion.div>
          )}
        </div>

        {/* Completed metadata */}
        <AnimatePresence>
          {step.metadata && step.state === 'complete' && Object.keys(step.metadata).length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-xs text-emerald-600 dark:text-emerald-400/80 mt-1 flex items-center gap-1"
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>{formatMetadata(step.metadata)}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actual duration for completed steps */}
        {step.duration && step.state === 'complete' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-gray-500 dark:text-gray-600 mt-0.5"
          >
            {formatActualDuration(step.duration)}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// =============================================================================
// Main Tool Call Indicator Component
// =============================================================================

export function ToolCallIndicator({
  toolCall,
  compact = false,
  preview
}: ToolCallIndicatorProps) {
  const config = getToolConfig(toolCall.tool);
  const Icon = config.icon;
  const isComplete = toolCall.state === 'complete';
  const isError = toolCall.state === 'error';

  // Calculate total estimated time remaining
  const { estimatedTimeRemaining, totalEstimatedTime } = useMemo(() => {
    const completedSteps = toolCall.steps.filter(s => s.state === 'complete');
    const remainingSteps = toolCall.steps.filter(s => s.state !== 'complete');
    
    const totalEstimated = calculateTotalStepDuration(toolCall.steps);
    const completedDuration = completedSteps.reduce((sum, s) => sum + (s.duration || getStepDurationEstimate(s.icon)), 0);
    const remaining = Math.max(0, totalEstimated - completedDuration);
    
    return { 
      estimatedTimeRemaining: remaining,
      totalEstimatedTime: totalEstimated
    };
  }, [toolCall.steps]);

  // ---------------------------------------------------------------------------
  // UX-005: Track elapsed time for long-operation reassurance messages
  // ---------------------------------------------------------------------------
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const isInProgress = !isComplete && !isError;

  useEffect(() => {
    if (!isInProgress) {
      setElapsedSeconds(0);
      return;
    }

    // Start counting from when the component mounts (tool call begins)
    const startTime = toolCall.startTime || Date.now();
    const initialElapsed = Math.floor((Date.now() - startTime) / 1000);
    setElapsedSeconds(initialElapsed);

    const interval = setInterval(() => {
      const now = Date.now();
      setElapsedSeconds(Math.floor((now - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isInProgress, toolCall.startTime]);

  const reassuranceMessage = useMemo(() => {
    if (!isInProgress) return null;
    if (elapsedSeconds >= 20) return 'Still working on it...';
    if (elapsedSeconds >= 10) return 'This is taking longer than usual...';
    return null;
  }, [isInProgress, elapsedSeconds]);

  // Compact mode for multiple tool calls
  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 5 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="inline-flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-gray-900/70 backdrop-blur-sm border border-gray-200 dark:border-gray-800/50 rounded-xl shadow-sm dark:shadow-none"
      >
        <motion.div
          animate={isComplete ? {} : { rotate: 360 }}
          transition={{ duration: 2, repeat: isComplete ? 0 : Infinity, ease: 'linear' }}
          className={config.iconColor}
        >
          <Icon className="w-4 h-4" />
        </motion.div>
        <span className="text-sm text-gray-900 dark:text-gray-300 font-medium">{toolCall.customLabel || config.label}</span>
        {!isComplete && <Loader2 className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 animate-spin" />}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="my-2"
    >
      <div className="bg-white dark:bg-gray-900/70 backdrop-blur-xl border border-gray-200 dark:border-gray-800/50 rounded-2xl p-5 shadow-lg dark:shadow-xl dark:shadow-black/20 overflow-hidden relative">
        {/* Animated background gradient */}
        {!isComplete && (
          <motion.div
            className={`absolute inset-0 bg-gradient-to-r ${config.gradient} opacity-5`}
            animate={{
              x: ['0%', '100%'],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'linear'
            }}
          />
        )}

        {/* Header */}
        <div className="flex items-center gap-4 mb-5 relative z-10">
          <motion.div
            className={`w-12 h-12 bg-gradient-to-br ${config.gradient} rounded-xl flex items-center justify-center shadow-lg ${config.glowColor} relative overflow-hidden`}
            animate={isComplete ? {} : { 
              scale: [1, 1.05, 1],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            {/* Shimmer effect */}
            {!isComplete && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                animate={{
                  x: ['-100%', '200%'],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'linear',
                  repeatDelay: 1
                }}
              />
            )}
            <Icon className="w-6 h-6 text-white relative z-10" />
          </motion.div>

          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{toolCall.customLabel || config.label}</div>
              {toolCall.provider && toolCall.provider !== 'db' && (
                <Badge variant="outline" className="text-xs h-5">
                  {toolCall.provider === 'hubspot' ? 'HubSpot' :
                   toolCall.provider === 'salesforce' ? 'Salesforce' :
                   toolCall.provider === 'google' ? 'Google' :
                   toolCall.provider === 'gmail' ? 'Gmail' :
                   toolCall.provider === 'slack' ? 'Slack' :
                   toolCall.provider === 'fathom' ? 'Fathom' :
                   toolCall.provider === 'meetingbaas' ? 'MeetingBaaS' :
                   toolCall.provider}
                </Badge>
              )}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-500 mt-0.5 flex items-center gap-2">
              {isComplete ? (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200 }}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  </motion.div>
                  <span className="text-emerald-600 dark:text-emerald-400">Complete</span>
                  {toolCall.endTime && toolCall.startTime && (
                    <span className="text-gray-500">
                      • {formatActualDuration(toolCall.endTime - toolCall.startTime)}
                    </span>
                  )}
                </>
              ) : isError ? (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200 }}
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                  </motion.div>
                  <span className="text-red-500">Failed</span>
                  {toolCall.endTime && toolCall.startTime && (
                    <span className="text-gray-500">
                      • {formatActualDuration(toolCall.endTime - toolCall.startTime)}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  >
                    <Loader2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  </motion.div>
                  <span>{getStateLabel(toolCall.state)}</span>
                  {/* Estimated time remaining - only show if >= 1 second */}
                  {estimatedTimeRemaining >= 1000 && (
                    <span className="text-blue-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDurationEstimate(estimatedTimeRemaining)} remaining
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {isComplete && (
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            >
              <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
            </motion.div>
          )}

          {isError && (
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            >
              <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
                <XCircle className="w-6 h-6 text-red-400" />
              </div>
            </motion.div>
          )}
        </div>

        {/* Progress Steps with staggered animation */}
        {toolCall.steps && toolCall.steps.length > 0 && (
          <div className="space-y-1 mb-4 relative z-10">
            <AnimatePresence mode="popLayout">
              {toolCall.steps.map((step, index) => (
                <ToolStepComponent
                  key={step.id}
                  step={step}
                  index={index}
                  isLast={index === toolCall.steps.length - 1}
                  totalSteps={toolCall.steps.length}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Error Message Display */}
        {isError && toolCall.error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl relative z-10"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-medium text-red-400">Something went wrong</div>
                <div className="text-xs text-red-300/80 mt-1">{toolCall.error}</div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Progress Bar */}
        {!isComplete && !isError && (
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-600 dark:text-gray-500 font-medium">Progress</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold">{Math.round(getProgress(toolCall))}%</span>
            </div>
            <div className="h-1.5 bg-gray-200 dark:bg-gray-800/80 rounded-full overflow-hidden backdrop-blur-sm">
              <motion.div
                className={`h-full bg-gradient-to-r ${config.gradient} shadow-lg ${config.glowColor} relative`}
                initial={{ width: '0%' }}
                animate={{ width: `${getProgress(toolCall)}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              >
                {/* Animated shimmer on progress bar */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                  animate={{
                    x: ['-100%', '200%'],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: 'linear'
                  }}
                />
              </motion.div>
            </div>
            {/* Total estimated time - only show if >= 1 second */}
            {totalEstimatedTime >= 1000 && (
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-600 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Est. total: {formatDurationEstimate(totalEstimatedTime)}</span>
              </div>
            )}
          </div>
        )}

        {/* UX-005: Long-operation reassurance message */}
        <AnimatePresence>
          {reassuranceMessage && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="relative z-10 mt-3"
            >
              <motion.p
                animate={elapsedSeconds >= 20 ? { opacity: [0.5, 1, 0.5] } : {}}
                transition={elapsedSeconds >= 20 ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
                className="text-xs text-gray-500 dark:text-gray-500 italic"
              >
                {reassuranceMessage}
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Streaming Preview */}
        {preview && preview.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-800/50 relative z-10"
          >
            <div className="text-xs text-gray-600 dark:text-gray-500 mb-3 font-medium flex items-center gap-2">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </motion.div>
              <span>Live Preview</span>
            </div>
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {preview.map((item, i) => (
                  <motion.div
                    key={`preview-${i}`}
                    initial={{ opacity: 0, x: -10, height: 0 }}
                    animate={{ opacity: 1, x: 0, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ delay: i * 0.1, duration: 0.3 }}
                    className="text-sm text-gray-700 dark:text-gray-400 pl-4 py-2 border-l-2 border-blue-500/30 bg-blue-50 dark:bg-blue-500/5 rounded-r-lg backdrop-blur-sm"
                  >
                    {item}
                  </motion.div>
                ))}
              </AnimatePresence>
              {toolCall.state !== 'complete' && (
                <motion.div
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="text-xs text-gray-500 dark:text-gray-600 pl-4 flex items-center gap-2"
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Loading more...</span>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// =============================================================================
// Exports
// =============================================================================

export function StreamingToolCall({
  toolCall,
  preview
}: {
  toolCall: ToolCall;
  preview?: string[];
}) {
  return <ToolCallIndicator toolCall={toolCall} preview={preview} />;
}

export function CompactToolCallIndicator({ toolCall }: { toolCall: ToolCall }) {
  return <ToolCallIndicator toolCall={toolCall} compact={true} />;
}
