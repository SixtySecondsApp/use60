/**
 * SandboxSidebar
 *
 * Pixel-perfect replica of the real AppLayout sidebar (dark mode).
 * Matches: w-[256px]/w-[96px], bg-gray-900/50, rounded-xl nav items,
 * #37bd7e active state, real Sixty logo URLs, icon sizes, spacing.
 */

import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Video,
  Kanban,
  Mail,
  Bot,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { SandboxView } from './data/sandboxTypes';
import { useSandboxData } from './data/SandboxDataProvider';

// Real Sixty branded logos from Supabase storage
const SIXTY_ICON = 'https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Icon.png';
const SIXTY_LOGO_DARK = 'https://ygdpgliavpxeugaajgrb.supabase.co/storage/v1/object/public/Logos/ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459/Dark%20Mode%20Logo.png';

interface NavItem {
  id: SandboxView;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pipeline', label: 'Pipeline', icon: Kanban },
  { id: 'meetings', label: 'Meetings', icon: Video },
  { id: 'email', label: 'Follow-Up Drafts', icon: Mail },
  { id: 'copilot', label: 'AI Copilot', icon: Bot },
];

interface SandboxSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  className?: string;
}

export function SandboxSidebar({
  collapsed,
  onToggleCollapse,
  className = '',
}: SandboxSidebarProps) {
  const { activeView, setActiveView, data, suggestedNextView } = useSandboxData();

  return (
    <div
      className={`
        fixed left-0 top-0 bottom-0 z-[40]
        flex flex-col
        bg-gray-900/50 backdrop-blur-xl
        border-r border-gray-800/50
        transition-all duration-300 ease-in-out
        p-6
        ${collapsed ? 'w-[96px]' : 'w-[256px]'}
        ${className}
      `}
    >
      {/* Logo area — matches real: mb-8 flex items-center justify-center h-10 */}
      <div className="mb-8 flex items-center justify-center h-10">
        <AnimatePresence mode="wait">
          {!collapsed ? (
            <motion.div
              key="full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="relative h-10 flex items-center justify-center"
            >
              <img
                src={SIXTY_LOGO_DARK}
                alt="Sixty"
                className="h-10 transition-opacity duration-300"
              />
            </motion.div>
          ) : (
            <motion.div
              key="icon"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <img
                src={SIXTY_ICON}
                alt="Sixty"
                className="h-8 w-8"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Separator — matches real: border-t border-gray-800 mb-6 */}
      <div className="border-t border-gray-800 mb-6" />

      {/* Navigation — matches real: space-y-2 (expanded) / space-y-3 (collapsed) */}
      <nav className="flex-1 overflow-y-auto scrollbar-none">
        <div className={collapsed ? 'space-y-3' : 'space-y-2'}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            const isSuggested = suggestedNextView === item.id && !active;

            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`
                  relative w-full flex items-center rounded-xl text-sm font-medium
                  transition-colors
                  ${collapsed
                    ? 'w-12 h-12 mx-auto justify-center'
                    : 'gap-3 px-2 py-2.5'
                  }
                  ${
                    active
                      ? 'bg-[#37bd7e]/10 text-white border border-[#37bd7e]/20 shadow-sm'
                      : isSuggested
                        ? 'text-gray-400/80 hover:text-gray-200 hover:bg-gray-800/20 border border-[#37bd7e]/10'
                        : 'text-gray-400/80 hover:text-gray-200 hover:bg-gray-800/20 border border-transparent'
                  }
                `}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className={`flex-shrink-0 ${collapsed ? 'w-5 h-5' : 'w-4 h-4'} ${active ? 'text-white' : ''}`}
                />
                {!collapsed && (
                  <span className="overflow-hidden whitespace-nowrap flex-1 text-left truncate">
                    {item.label}
                  </span>
                )}

                {/* Suggested next view pulse */}
                {isSuggested && !collapsed && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-[#37bd7e] animate-pulse" />
                )}

                {/* Copilot active indicator */}
                {item.id === 'copilot' && !collapsed && !active && !isSuggested && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-[#37bd7e] animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Bottom: User — matches real: mt-auto pt-6 border-t border-gray-800/50 */}
      <div className="mt-auto pt-6 border-t border-gray-800/50">
        <div
          className={`flex items-center rounded-xl ${collapsed ? 'w-12 h-12 mx-auto justify-center' : 'gap-3 px-2 py-2.5'}`}
        >
          <div className="w-8 h-8 rounded-lg bg-[#37bd7e] flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
            {data.user.initials}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">{data.user.full_name}</p>
              <p className="text-[11px] text-gray-500 truncate">{data.org.name}</p>
            </div>
          )}
        </div>
      </div>

      {/* Collapse/expand toggle — matches real: fixed z-[45] w-6 h-6 rounded-full */}
      <motion.button
        onClick={onToggleCollapse}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        className={`
          absolute top-[72px] z-[45]
          w-6 h-6 rounded-full
          bg-gray-800 border border-gray-700/50
          flex items-center justify-center
          text-gray-400 hover:text-white hover:bg-gray-700
          transition-colors
          ${collapsed ? 'left-[84px]' : 'left-[244px]'}
        `}
        style={{ transform: 'translateX(-50%)' }}
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </motion.button>
    </div>
  );
}
