/**
 * SandboxTopbar
 *
 * Pixel-perfect replica of the real AppLayout topbar (dark mode).
 * Matches: bg-gray-950/50 backdrop-blur-sm, border-b border-gray-800/50,
 * icon sizes, spacing, search trigger, notification bell.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Bell,
  Command,
  X,
  Zap,
  Bot,
  Check,
  ChevronRight,
} from 'lucide-react';
import { useSandboxData, TOTAL_VIEWS } from './data/SandboxDataProvider';
import { getLogoDevUrl } from './data/sandboxTypes';
import type { SandboxView } from './data/sandboxTypes';

/** Human-readable labels for nudge chip */
const VIEW_LABELS: Record<SandboxView, string> = {
  dashboard: 'Dashboard',
  pipeline: 'Pipeline',
  contacts: 'Contacts',
  meetings: 'Meetings',
  email: 'Email',
  proposals: 'Proposals',
  copilot: 'Copilot',
};

interface SandboxTopbarProps {
  sidebarCollapsed: boolean;
  className?: string;
}

export function SandboxTopbar({
  sidebarCollapsed,
  className = '',
}: SandboxTopbarProps) {
  const { data, visitorName, isPersonalized, setActiveView, visitedCount, completionPercentage, suggestedNextView } = useSandboxData();
  const [showNotifications, setShowNotifications] = useState(false);
  const isComplete = visitedCount >= TOTAL_VIEWS;

  return (
    <>
    <div
      className={`
        fixed top-0 right-0 z-20 h-16
        flex items-center justify-between
        bg-gray-950/50 backdrop-blur-sm
        border-b border-gray-800/50
        px-5
        transition-all duration-300 ease-in-out
        ${sidebarCollapsed ? 'left-[96px]' : 'left-[256px]'}
        max-md:left-0
        ${className}
      `}
    >
      {/* Left: Greeting / Page title */}
      <div className="flex items-center gap-3 min-w-0">
        {data.visitorCompany?.domain && (
          <img
            src={getLogoDevUrl(data.visitorCompany.domain, 32)}
            alt=""
            className="w-6 h-6 rounded-md object-contain bg-white/[0.06] p-0.5"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        {isPersonalized && visitorName ? (
          <h1 className="text-sm font-medium text-white truncate">
            Hey {visitorName.split(' ')[0]}, welcome to 60
          </h1>
        ) : (
          <h1 className="text-sm font-medium text-gray-400 truncate">
            {data.org.name}
          </h1>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Search / Command palette trigger */}
        <button
          onClick={() => setActiveView('copilot')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-gray-800/50 text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="text-xs hidden sm:inline">Search...</span>
          <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] text-gray-600 ml-2">
            <Command className="w-2.5 h-2.5" />K
          </kbd>
        </button>

        {/* Agent Activity indicator */}
        <button className="relative p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-colors">
          <Bot className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#37bd7e] animate-pulse" />
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-colors"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-orange-500" />
          </button>

          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-12 w-80 bg-gray-900 border border-gray-800/50 rounded-xl shadow-2xl shadow-black/40 overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/50">
                  <span className="text-sm font-medium text-white">Notifications</span>
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="p-1 rounded text-gray-500 hover:text-gray-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto">
                  {data.slackMessages.slice(0, 3).map((msg, i) => (
                    <div
                      key={i}
                      className="px-4 py-3 border-b border-gray-800/30 hover:bg-white/[0.02] transition-colors cursor-pointer"
                    >
                      <div className="flex items-start gap-2.5">
                        <div
                          className="w-1 h-8 rounded-full flex-shrink-0 mt-0.5"
                          style={{ backgroundColor: msg.accent_color }}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-200 truncate">
                            {msg.title}
                          </p>
                          <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5">
                            {msg.body}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Credits widget */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-gray-800/50">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs text-gray-400">2,450</span>
        </div>

        {/* User avatar */}
        <button className="p-1 rounded-lg hover:bg-white/[0.04] transition-colors">
          <div className="w-8 h-8 rounded-lg bg-[#37bd7e] flex items-center justify-center text-white text-xs font-semibold">
            {data.user.initials}
          </div>
        </button>
      </div>
    </div>

    {/* Progress bar below topbar */}
    <div
      className={`
        fixed top-16 right-0 z-20 h-[3px]
        transition-all duration-300 ease-in-out
        ${sidebarCollapsed ? 'left-[96px]' : 'left-[256px]'}
        max-md:left-0
      `}
    >
      {/* Track */}
      <div className="absolute inset-0 bg-gray-800/40" />

      {/* Fill */}
      <motion.div
        className="absolute inset-y-0 left-0"
        style={{
          background: isComplete
            ? '#22c55e'
            : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
        }}
        initial={{ width: '0%' }}
        animate={{ width: `${completionPercentage}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />

      {/* Label + nudge chip */}
      <div className="absolute right-2 -bottom-5 flex items-center gap-2">
        <AnimatePresence mode="wait">
          {isComplete ? (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              className="flex items-center gap-1"
            >
              <span className="w-3.5 h-3.5 rounded-full bg-green-500 flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
              </span>
              <span className="text-[10px] text-green-400 font-medium">
                All explored
              </span>
            </motion.div>
          ) : (
            <motion.span
              key="progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[10px] text-gray-500 font-medium"
            >
              {visitedCount}/{TOTAL_VIEWS} explored
            </motion.span>
          )}
        </AnimatePresence>

        {/* Suggested next view nudge chip */}
        <AnimatePresence>
          {suggestedNextView && !isComplete && (
            <motion.button
              key="nudge"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onClick={() => setActiveView(suggestedNextView)}
              className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/20 text-[10px] text-violet-300 font-medium hover:bg-violet-500/25 transition-colors cursor-pointer"
            >
              Next: {VIEW_LABELS[suggestedNextView]}
              <ChevronRight className="w-3 h-3" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
    </>
  );
}
