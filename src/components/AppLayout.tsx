import { useState, useEffect, useMemo } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence, useCycle } from 'framer-motion';
import { QuickAdd } from '@/components/QuickAdd';
import { useAuth } from '@/lib/contexts/AuthContext';
import { ViewModeBanner } from '@/components/ViewModeBanner';
import { ExternalViewBanner, ExternalViewBannerSpacer } from '@/components/ExternalViewBanner';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import { ExternalViewToggle } from '@/components/ExternalViewToggle';
import { NotificationBell } from '@/components/NotificationBell';
import { HITLIndicator } from '@/components/HITLIndicator';
import { EmailIcon } from '@/components/EmailIcon';
import { CalendarIcon } from '@/components/CalendarIcon';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Activity,
  FileText,
  LineChart,
  Settings,
  LogOut,
  Menu as MenuIcon,
  X,
  Plus,
  UserCog,
  UserX,
  Kanban,
  PanelLeft,
  PanelLeftClose,
  Users as UsersIcon,
  Link2,
  CheckSquare,
  MailWarning,
  MailCheck,
  Building2,
  Shield,
  Map,
  DollarSign,
  Video,
  Code2,
  Zap,
  History,
  Workflow,
  ExternalLink as LinkIcon,
  Sparkles,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Layers,
  Eye,
  EyeOff,
  Calendar,
  Mail,
  CreditCard
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUser } from '@/lib/hooks/useUser';
import { isUserAdmin } from '@/lib/utils/adminUtils';
import { useUserPermissions, useIsViewingAsExternal } from '@/contexts/UserPermissionsContext';
import { getNavigationItems } from '@/lib/routes/routeConfig';
import logger from '@/lib/utils/logger';
import { useEventListener } from '@/lib/communication/EventBus';
import { useTaskNotifications } from '@/lib/hooks/useTaskNotifications';
import { SmartSearch } from '@/components/SmartSearch';
import { useCopilot } from '@/lib/contexts/CopilotContext';
import { useNavigate } from 'react-router-dom';
import { AssistantOverlay } from '@/components/assistant/AssistantOverlay';
// MeetingUsageIndicator moved to MeetingsList page
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from '@/components/ui/dropdown-menu';
import { useBrandingSettings } from '@/lib/hooks/useBrandingSettings';
import { useTheme } from '@/hooks/useTheme';
import { TrialBanner } from '@/components/subscription/TrialBanner';
import { useTrialStatus } from '@/lib/hooks/useSubscription';
import { useOrg } from '@/lib/contexts/OrgContext';
import { PasswordSetupModal } from '@/components/auth/PasswordSetupModal';
import { usePasswordSetupRequired } from '@/lib/hooks/usePasswordSetupRequired';
import { IntegrationReconnectBanner } from '@/components/IntegrationReconnectBanner';
import { useIntegrationReconnectNeeded } from '@/lib/hooks/useIntegrationReconnectNeeded';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { userData, isImpersonating, stopImpersonating } = useUser();
  const { signOut } = useAuth();
  const { activeOrgId } = useOrg();
  const trialStatus = useTrialStatus(activeOrgId);
  const location = useLocation();

  // Check if user has integration that needs reconnection (must be before isIntegrationBannerVisible)
  const { needsReconnect: integrationNeedsReconnect } = useIntegrationReconnectNeeded();

  // Check if trial banner should be showing (same logic as TrialBanner component)
  const isTrialBannerVisible = useMemo(() => {
    // Check for simulation data
    try {
      const data = sessionStorage.getItem('trial_simulation');
      if (data) {
        const parsed = JSON.parse(data);
        if (Date.now() - parsed.timestamp < 5 * 60 * 1000) {
          return true; // Show banner in preview mode
        }
      }
    } catch {
      // Ignore errors
    }

    // Check real trial status
    return trialStatus.isTrialing && !trialStatus.isLoading;
  }, [trialStatus.isTrialing, trialStatus.isLoading]);

  // Check if integration reconnect banner should be showing
  const isIntegrationBannerVisible = !!integrationNeedsReconnect;

  // AppLayout uses top padding to make room for the fixed top bars/banners.
  // Some pages (e.g. Copilot chat) need a reliable way to compute the remaining viewport height
  // without hard-coding "4rem" and accidentally creating extra scroll space.
  const topOffsetPx = useMemo(() => {
    // Base top bar is 64px (pt-16). Impersonation adds 44px. Trial banner adds ~51px. Integration banner adds ~40px.
    let offset = 64; // Base top bar
    if (isImpersonating) offset += 44;
    if (isTrialBannerVisible) offset += 51;
    if (isIntegrationBannerVisible) offset += 40;
    return offset;
  }, [isTrialBannerVisible, isImpersonating, isIntegrationBannerVisible]);

  // Note: topOffsetPx is used for inline paddingTop style since dynamic Tailwind classes
  // like pt-[${px}px] don't work at runtime (Tailwind JIT needs to see them at build time)
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, toggleMobileMenu] = useCycle(false, true);
  const [hasMounted, setHasMounted] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isSmartSearchOpen, setIsSmartSearchOpen] = useState(false);
  const navigate = useNavigate();
  const { openCopilot } = useCopilot();
  // Allow decoupled components (assistant/chat panels/etc) to open Quick Add.
  useEventListener(
    'modal:opened',
    ({ type }) => {
      if (type === 'quick-add') {
        setIsQuickAddOpen(true);
      }
    },
    []
  );
  const { logoLight, logoDark, icon } = useBrandingSettings();
  const { resolvedTheme } = useTheme();

  // Select logo based on current theme
  const currentLogo = resolvedTheme === 'light' ? logoLight : logoDark;

  // User permissions for dynamic navigation
  const { effectiveUserType, isAdmin, isInternal, isPlatformAdmin, isOrgAdmin } = useUserPermissions();
  const isViewingAsExternal = useIsViewingAsExternal();

  // Initialize task notifications - this will show toasts for auto-created tasks
  useTaskNotifications();

  // Check if user needs to set up their password (magic link users)
  const { needsSetup: needsPasswordSetup, completeSetup: completePasswordSetup } = usePasswordSetupRequired();

  // Open/close QuickAdd via global modal events
  useEventListener('modal:opened', ({ type, context }) => {
    if (type === 'quick-add') {
      setIsQuickAddOpen(true);
    }
  }, []);
  useEventListener('modal:closed', ({ type }) => {
    if (type === 'quick-add') {
      setIsQuickAddOpen(false);
    }
  }, []);

  const handleLogout = async () => {
    try {
      if (isImpersonating) {
        // Stop impersonating instead of logging out
        await stopImpersonating();
      } else {
        // Normal logout
        const { error } = await signOut();
        if (error) {
          toast.error('Error logging out: ' + error.message);
        }
      }
      // Success toast is handled by the respective functions
    } catch (error: any) {
      toast.error(isImpersonating ? 'Error stopping impersonation' : 'Error logging out');
      logger.error('[Auth]', error);
    }
  };

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Auto-collapse sidebar on specific pages for more space
  useEffect(() => {
    const collapsedPages = ['/email', '/calendar', '/workflows', '/freepik-flow'];
    const shouldCollapse = collapsedPages.includes(location.pathname);
    
    if (shouldCollapse) {
      setIsCollapsed(true);
    }
  }, [location.pathname]);

  // Pages that should behave like an app-within-the-app (no document scrolling).
  // The page itself manages its own internal scroll regions (e.g. Copilot chat).
  const isFullHeightPage = useMemo(() => {
    return location.pathname === '/copilot';
  }, [location.pathname]);

  // Keyboard shortcut for SmartSearch (⌘K) - Disabled
  // useEffect(() => {
  //   const handleKeyDown = (e: KeyboardEvent) => {
  //     if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
  //       e.preventDefault();
  //       setIsSmartSearchOpen(true);
  //     }
  //   };

  //   document.addEventListener('keydown', handleKeyDown);
  //   return () => document.removeEventListener('keydown', handleKeyDown);
  // }, []);

  // Dynamic navigation based on user type (internal vs external)
  // Uses centralized route config with access levels
  const menuItems = useMemo(() => {
    // Get main section navigation items
    const mainItems = getNavigationItems(effectiveUserType, isAdmin, isOrgAdmin, 'main');
    // Get tools section for internal users
    const toolsItems = getNavigationItems(effectiveUserType, isAdmin, isOrgAdmin, 'tools');

    // Type for menu items (compatible with existing template)
    type MenuItem = {
      icon: typeof Activity;
      label: string;
      href: string;
      badge?: string;
      displayGroup?: number;
      subItems?: Array<{ icon: typeof Activity; label: string; href: string }>;
      isDivider?: boolean;
      isExternal?: boolean;
    };

    // Map route configs to menu item format
    const mapToMenuItem = (config: ReturnType<typeof getNavigationItems>[number]): MenuItem => ({
      icon: config.icon || Activity,
      label: config.label || '',
      href: config.path,
      badge: config.badge,
      displayGroup: config.displayGroup,
      subItems: undefined, // Route config doesn't have subItems, they can be added if needed
      isExternal: config.isExternal,
    });

    // Combine main and tools items for the menu, then add dividers between display groups
    let allItems = [...mainItems.map(mapToMenuItem), ...toolsItems.map(mapToMenuItem)];

    // Filter items for customer/external view - only show group 1
    if (isViewingAsExternal) {
      allItems = allItems.filter(item => !item.isDivider && (item.displayGroup === 1 || !item.displayGroup));
    }

    // Sort by displayGroup and order within group
    allItems.sort((a, b) => {
      const groupA = a.displayGroup ?? 999;
      const groupB = b.displayGroup ?? 999;
      if (groupA !== groupB) return groupA - groupB;
      return 0;
    });

    // Add dividers between display groups
    const itemsWithDividers: MenuItem[] = [];
    let lastGroup: number | undefined;

    for (const item of allItems) {
      const currentGroup = item.displayGroup ?? 999;

      // Add divider if group changed and we have items (but not in external view)
      if (!isViewingAsExternal && lastGroup !== undefined && lastGroup !== currentGroup && itemsWithDividers.length > 0) {
        itemsWithDividers.push({
          icon: Activity,
          label: '',
          href: '',
          isDivider: true,
        });
      }

      itemsWithDividers.push(item);
      lastGroup = currentGroup;
    }

    return itemsWithDividers;
  }, [effectiveUserType, isAdmin, isOrgAdmin, isViewingAsExternal]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-gradient-to-br dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 text-[#1E293B] dark:text-gray-100 transition-colors duration-200">
      {/* Impersonation Banner at the top - highest priority */}
      <ImpersonationBanner />

      {/* View Mode Banner at the top */}
      <ViewModeBanner />

      {/* External View Banner - shown when internal user is viewing as external */}
      <ExternalViewBanner />

      {/* Trial Banner - shown when organization is in trial period */}
      <TrialBanner />

      {/* Integration Reconnect Banner - shown when user needs to reconnect Fathom */}
      <IntegrationReconnectBanner
        hasTrialBannerAbove={isTrialBannerVisible}
        hasImpersonationBannerAbove={isImpersonating}
        isSidebarCollapsed={isCollapsed}
      />

      {/* Main app content */}
      <div className="flex">
      
      <div className={cn(
      "fixed left-0 right-0 flex items-center justify-between z-[90] p-4 bg-white/80 dark:bg-gray-950/50 backdrop-blur-sm border-b border-[#E2E8F0] dark:border-gray-800/50 lg:hidden transition-all duration-200",
      isImpersonating ? "top-[44px]" : "top-0"
    )}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg overflow-hidden">
            {userData?.avatar_url ? (
              <img
                src={userData.avatar_url}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-[#37bd7e]/20 flex items-center justify-center">
                <span className="text-sm font-medium text-[#37bd7e]">
                  {userData?.first_name?.[0] || ''}{userData?.last_name?.[0] || ''}
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {userData?.first_name} {userData?.last_name}
            </span>
            <span className="text-xs text-gray-700 dark:text-gray-300">{userData?.stage}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {effectiveUserType !== 'external' && (
            <>
              <EmailIcon />
              <CalendarIcon />
              <HITLIndicator />
              <NotificationBell />
            </>
          )}
          <motion.button
            animate={isMobileMenuOpen ? { opacity: 0 } : { opacity: 1 }}
            onClick={() => toggleMobileMenu()}
            className="p-2 rounded-xl bg-slate-100 dark:bg-gray-800/50 hover:bg-slate-50 dark:hover:bg-gray-800/70 transition-colors lg:hidden"
          >
            <MenuIcon className="w-6 h-6 text-[#64748B] dark:text-gray-400" />
          </motion.button>
        </div>
      </div>
      
      {/* Quick Add FAB - Only shown for admins in internal view */}
      {location.pathname !== '/workflows' && !isViewingAsExternal && isUserAdmin(userData) && (
        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsAssistantOpen(true)}
          className="fixed bottom-6 right-6 p-4 rounded-full bg-[#37bd7e] hover:bg-[#2da76c] transition-colors shadow-lg shadow-[#37bd7e]/20 z-50"
        >
          <Plus className="w-6 h-6 text-white" />
        </motion.button>
      )}

      {/* Mobile Menu - Full Page with Scrolling */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[99] lg:hidden"
              onClick={() => toggleMobileMenu()}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
              className="fixed inset-0 w-full bg-white dark:bg-gray-900/95 backdrop-blur-xl z-[100] lg:hidden transition-colors duration-200 flex flex-col"
            >
              {/* Fixed Header */}
              <div className="flex-shrink-0 p-4 sm:p-6 border-b border-[#E2E8F0] dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden">
                      {userData?.avatar_url ? (
                        <img
                          src={userData.avatar_url}
                          alt="Profile"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-[#37bd7e]/20 flex items-center justify-center">
                          <span className="text-base sm:text-lg font-medium text-[#37bd7e]">
                            {userData?.first_name?.[0]}{userData?.last_name?.[0]}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-base sm:text-lg font-semibold text-[#1E293B] dark:text-gray-100">
                        {userData?.first_name} {userData?.last_name}
                      </span>
                      <span className="text-xs sm:text-sm text-[#64748B] dark:text-gray-300">{userData?.stage}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleMobileMenu()}
                    className="p-2 sm:p-3 min-h-[44px] min-w-[44px] hover:bg-slate-100 dark:hover:bg-gray-800/50 rounded-lg transition-colors flex items-center justify-center"
                  >
                    <X className="w-6 h-6 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Scrollable Navigation */}
              <div className="flex-1 overflow-y-auto">
                <nav className="p-4 sm:p-6 space-y-1 sm:space-y-2">
                  {menuItems.map((item) => {
                    // Handle dividers
                    if (item.isDivider) {
                      return (
                        <div key={`divider-${Math.random()}`} className="my-2 border-t border-[#E2E8F0] dark:border-gray-800/50" />
                      );
                    }

                    const mobileClasses = cn(
                      'w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 min-h-[56px] sm:min-h-[64px] rounded-xl text-base sm:text-lg font-medium transition-colors active:scale-[0.98]',
                      !item.isExternal && (location.pathname === item.href || (item.subItems && item.subItems.some(sub => location.pathname === sub.href)))
                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/70 shadow-sm dark:bg-[#37bd7e]/10 dark:text-white dark:border-[#37bd7e]/20'
                        : 'text-[#64748B] hover:bg-slate-50 dark:text-gray-400/80 dark:hover:bg-gray-800/20'
                    );

                    const mobileIconClasses = cn(
                      'w-6 h-6 sm:w-7 sm:h-7 flex-shrink-0',
                      !item.isExternal && (location.pathname === item.href || (item.subItems && item.subItems.some(sub => location.pathname === sub.href)))
                        ? 'text-indigo-700 dark:text-white' : 'text-[#64748B] dark:text-gray-400/80'
                    );

                    return (
                      <div key={item.href + item.label}>
                        {item.isExternal ? (
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => toggleMobileMenu()}
                            className={mobileClasses}
                          >
                            <item.icon className={mobileIconClasses} />
                            <span>{item.label}</span>
                          </a>
                        ) : (
                          <Link
                            to={item.href}
                            onClick={() => toggleMobileMenu()}
                            className={mobileClasses}
                          >
                            <item.icon className={mobileIconClasses} />
                            <span>{item.label}</span>
                          </Link>
                        )}

                        {item.subItems && (
                          <div className="ml-10 sm:ml-12 mt-1 space-y-1">
                            {item.subItems.map((subItem) => (
                              <Link
                                key={subItem.href + subItem.label}
                                to={subItem.href}
                                onClick={() => toggleMobileMenu()}
                                className={cn(
                                  'w-full flex items-center gap-3 px-4 py-3 min-h-[48px] rounded-xl text-sm font-medium transition-colors',
                                  location.pathname === subItem.href
                                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/70 shadow-sm dark:bg-[#37bd7e]/10 dark:text-white dark:border-[#37bd7e]/20'
                                    : 'text-[#64748B] hover:bg-slate-50 dark:text-gray-400/80 dark:hover:bg-gray-800/20'
                                )}
                              >
                                <subItem.icon className="w-5 h-5" />
                                <span>{subItem.label}</span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </nav>
              </div>

              {/* Fixed Footer with Settings and Logout */}
              <div className="flex-shrink-0 p-4 sm:p-6 border-t border-[#E2E8F0] dark:border-gray-800 space-y-2">
                <Link
                  to="/settings"
                  onClick={() => toggleMobileMenu()}
                  className={cn(
                    "flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 min-h-[56px] rounded-xl text-base sm:text-lg font-medium transition-colors active:scale-[0.98]",
                    location.pathname.startsWith('/settings')
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/70 shadow-sm dark:bg-[#37bd7e]/10 dark:text-white dark:border-[#37bd7e]/20'
                      : 'text-[#64748B] dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800/50'
                  )}
                >
                  <Settings className="w-6 h-6 sm:w-7 sm:h-7" />
                  Settings
                </Link>

                {/* Platform Admin - internal admins only */}
                {isPlatformAdmin && (
                  <Link
                    to="/platform"
                    onClick={() => toggleMobileMenu()}
                    className={cn(
                      "flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 min-h-[56px] rounded-xl text-base sm:text-lg font-medium transition-colors active:scale-[0.98]",
                      location.pathname.startsWith('/platform')
                        ? 'bg-purple-50 text-purple-600 border border-purple-200 dark:bg-purple-900/20 dark:text-white dark:border-purple-800/20'
                        : 'text-[#64748B] dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800/50'
                    )}
                  >
                    <Shield className="w-6 h-6 sm:w-7 sm:h-7" />
                    Platform Admin
                  </Link>
                )}

                {/* External View Toggle for internal users on mobile */}
                {isInternal && (
                  <div className="px-4 sm:px-5 py-2">
                    <ExternalViewToggle showLabel={true} variant="ghost" className="w-full justify-start text-base sm:text-lg min-h-[48px]" />
                  </div>
                )}

                <button
                  onClick={handleLogout}
                  className={cn(
                    "w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 min-h-[56px] rounded-xl text-base sm:text-lg font-medium transition-colors active:scale-[0.98]",
                    isImpersonating
                      ? "text-amber-400 hover:bg-amber-500/10"
                      : "text-red-400 hover:bg-red-500/10"
                  )}
                >
                  {isImpersonating ? (
                    <>
                      <UserX className="w-6 h-6 sm:w-7 sm:h-7" />
                      Stop Impersonation
                    </>
                  ) : (
                    <>
                      <LogOut className="w-6 h-6 sm:w-7 sm:h-7" />
                      Logout
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Top Bar */}
      <div className={cn(
        'fixed left-0 right-0 h-16 bg-white/80 dark:bg-gray-950/50 backdrop-blur-sm border-b border-[#E2E8F0] dark:border-gray-800/50 z-[90]',
        'hidden lg:flex items-center justify-between px-6',
        isCollapsed ? 'lg:left-[80px]' : 'lg:left-[256px]',
        'transition-all duration-300 ease-in-out',
        isImpersonating ? 'top-[44px]' : 'top-0'
      )}>
        {/* Search Button (cmdK) - Hidden */}
        {/* <button
          onClick={() => setIsSmartSearchOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800/50 hover:bg-gray-200 dark:hover:bg-gray-800/70 transition-colors text-sm text-gray-600 dark:text-gray-400"
        >
          <Search className="w-4 h-4" />
          <span className="hidden xl:inline">Search...</span>
          <kbd className="hidden xl:inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded">
            <span className="text-[10px]">⌘</span>K
          </kbd>
        </button> */}

        {/* User Profile with Dropdown */}
        <div className="flex items-center gap-3 ml-auto">
          {effectiveUserType !== 'external' && (
            <>
              <EmailIcon />
              <CalendarIcon />
              <HITLIndicator />
              <NotificationBell />
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800/50 transition-colors">
                <div className="w-8 h-8 rounded-lg overflow-hidden">
                  {userData?.avatar_url ? (
                    <img
                      src={userData.avatar_url}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#37bd7e]/20 flex items-center justify-center">
                      <span className="text-sm font-medium text-[#37bd7e]">
                        {userData?.first_name?.[0] || ''}{userData?.last_name?.[0] || ''}
                      </span>
                    </div>
                  )}
                </div>
                <div className="hidden xl:flex flex-col items-start">
                  <span className="text-sm font-semibold text-[#1E293B] dark:text-gray-100">
                    {userData?.first_name} {userData?.last_name}
                  </span>
                  <span className="text-xs text-[#64748B] dark:text-gray-400">{userData?.stage}</span>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400 hidden xl:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => navigate('/profile')}>
                <UserCog className="w-4 h-4 mr-2" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              {/* Platform Admin - internal admins only */}
              {isPlatformAdmin && (
                <DropdownMenuItem onClick={() => navigate('/platform')}>
                  <Shield className="w-4 h-4 mr-2" />
                  Platform Admin
                </DropdownMenuItem>
              )}
              {/* External View Toggle - only for internal users */}
              {isInternal && (
                <>
                  <div className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
                  <div className="px-2 py-1.5">
                    <ExternalViewToggle variant="menu" />
                  </div>
                </>
              )}

              {/* Product Pages Links */}
              <div className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
              <DropdownMenuItem onClick={() => window.open(import.meta.env.DEV ? '/landing' : '/product/meetings', '_blank')}>
                <Eye className="w-4 h-4 mr-2" />
                View Sales Page
                <LinkIcon className="w-3 h-3 ml-auto text-gray-400" />
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open(import.meta.env.DEV ? '/landing#pricing' : '/product/meetings/pricing', '_blank')}>
                <DollarSign className="w-4 h-4 mr-2" />
                View Pricing
                <LinkIcon className="w-3 h-3 ml-auto text-gray-400" />
              </DropdownMenuItem>

              <div className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
              <DropdownMenuItem onClick={handleLogout} className="text-red-400 hover:text-red-500 hover:bg-red-500/10">
                {isImpersonating ? (
                  <>
                    <UserX className="w-4 h-4 mr-2" />
                    Stop Impersonation
                  </>
                ) : (
                  <>
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <motion.div
        initial={!hasMounted ? { opacity: 0, x: -20 } : false}
        animate={!hasMounted ? { opacity: 1, x: 0 } : false}
        className={cn(
          'fixed left-0 bottom-0 bg-white dark:bg-gray-900/50 backdrop-blur-xl p-6',
          'border-r border-[#E2E8F0] dark:border-gray-800/50 shadow-[2px_0_8px_-2px_rgba(0,0,0,0.04)] dark:shadow-none',
          'transition-all duration-300 ease-in-out flex-shrink-0',
          'overflow-visible',
          isCollapsed ? 'w-[96px]' : 'w-[256px]',
          'hidden lg:block z-[100]',
          isImpersonating ? 'top-[44px] h-[calc(100vh-44px)]' : 'top-0 h-screen'
        )}
      >
        {/* Small Circular Toggle Button - Positioned on Edge, Inline with Logo */}
        <div
          className={cn(
            'absolute z-50',
            // Align with logo: p-6 (24px) + half logo height
            // Collapsed: 24px + 24px = 48px (logo is now w-12 h-12), Expanded: 24px + 24px = 48px
            'top-[48px]',
            // Position on edge with transform to center button on edge
            'right-0 translate-x-1/2',
            'w-6 h-6'
          )}
        >
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={cn(
              'w-full h-full rounded-full',
              'bg-white dark:bg-gray-800',
              'border border-gray-200 dark:border-gray-700/50',
              'text-gray-500 dark:text-gray-400',
              'hover:text-gray-700 dark:hover:text-gray-200',
              'hover:bg-gray-50 dark:hover:bg-gray-700',
              'shadow-md dark:shadow-lg dark:shadow-black/20',
              'flex items-center justify-center',
              'transition-colors duration-200'
            )}
            style={{ transformOrigin: 'center center' }}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5" />
            )}
          </motion.button>
        </div>

        <div className="flex h-full flex-col">
          {/* Logo Header */}
          <div className={cn(
            'mb-8 flex items-center justify-center'
          )}>
            <Link to="/" className={cn(
              'transition-opacity hover:opacity-80',
              isCollapsed ? 'w-12 h-12' : 'w-full'
            )}>
              {isCollapsed ? (
                <img
                  key={`icon-collapsed-${resolvedTheme}`}
                  src={icon}
                  alt="Logo"
                  className="w-12 h-12 object-contain rounded-xl"
                />
              ) : (
                <img
                  key={`logo-expanded-${resolvedTheme}`}
                  src={currentLogo}
                  alt="Logo"
                  className="h-12 w-full object-contain"
                />
              )}
            </Link>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 -mr-2">
            <nav className={cn(
              'pb-6',
              isCollapsed ? 'space-y-3' : 'space-y-2'
            )}>
              {menuItems.map((item) => {
                // Handle dividers
                if (item.isDivider) {
                  return (
                    <div key={`divider-${Math.random()}`} className={cn(
                      'my-2 border-t border-[#E2E8F0] dark:border-gray-800/50',
                      isCollapsed && 'my-3'
                    )} />
                  );
                }

                const navLinkClasses = cn(
                  'flex items-center transition-colors text-sm font-medium',
                  isCollapsed
                    ? 'w-12 h-12 mx-auto rounded-xl justify-center'
                    : 'w-full gap-3 px-2 py-2.5 rounded-xl',
                  !item.isExternal && (location.pathname === item.href || (item.subItems && item.subItems.some(sub => location.pathname === sub.href)))
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/70 shadow-sm dark:bg-[#37bd7e]/10 dark:text-white dark:border-[#37bd7e]/20'
                    : 'text-[#64748B] hover:bg-slate-50 dark:text-gray-400/80 dark:hover:bg-gray-800/20'
                );

                const navLinkContent = (
                  <>
                    <motion.div
                      animate={{
                        x: isCollapsed ? 0 : 0,
                        scale: isCollapsed ? 1.1 : 1
                      }}
                      className={cn(
                        'relative z-10 flex items-center justify-center',
                        isCollapsed ? 'w-full h-full' : 'min-w-[20px]',
                        !item.isExternal && (location.pathname === item.href || (item.subItems && item.subItems.some(sub => location.pathname === sub.href)))
                          ? 'text-indigo-700 dark:text-white' : 'text-[#64748B] dark:text-gray-400/80'
                      )}
                    >
                      <item.icon className={cn(isCollapsed ? 'w-5 h-5' : 'w-4 h-4')} />
                    </motion.div>
                    <AnimatePresence>
                      {!isCollapsed && (
                        <motion.span
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: 'auto' }}
                          exit={{ opacity: 0, width: 0 }}
                          className="overflow-hidden whitespace-nowrap"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </>
                );

                return (
                  <div key={item.href + item.label}>
                    {item.isExternal ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={navLinkClasses}
                      >
                        {navLinkContent}
                      </a>
                    ) : (
                      <Link
                        to={item.href}
                        className={navLinkClasses}
                      >
                        {navLinkContent}
                      </Link>
                    )}

                    {item.subItems && !isCollapsed && (
                      <div className="ml-8 mt-1 space-y-1">
                        {item.subItems.map((subItem) => (
                          <Link
                            key={subItem.href + subItem.label}
                            to={subItem.href}
                            className={cn(
                              'w-full flex items-center gap-3 px-2 py-2 rounded-xl text-xs font-medium transition-colors',
                              location.pathname === subItem.href
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/70 shadow-sm dark:bg-[#37bd7e]/10 dark:text-white dark:border-[#37bd7e]/20'
                                : 'text-[#64748B] hover:bg-slate-50 dark:text-gray-400/80 dark:hover:bg-gray-800/20'
                            )}
                          >
                            <subItem.icon className="w-3.5 h-3.5" />
                            <span>{subItem.label}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>
          
          {/* Settings and Logout at bottom */}
          <div className={cn(
            'mt-auto pt-6 border-t border-[#E2E8F0] dark:border-gray-800/50',
            isCollapsed ? 'space-y-3' : 'space-y-0'
          )}>
            <Link
              to="/settings"
              className={cn(
                'flex items-center transition-colors text-sm font-medium',
                isCollapsed 
                  ? 'w-12 h-12 mx-auto rounded-xl justify-center mb-0' 
                  : 'w-full gap-3 px-2 py-2.5 rounded-xl mb-2',
                location.pathname.startsWith('/settings')
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/70 shadow-sm dark:bg-[#37bd7e]/10 dark:text-white dark:border-[#37bd7e]/20'
                  : 'text-[#64748B] hover:bg-slate-50 dark:text-gray-400/80 dark:hover:bg-gray-800/20'
              )}
            >
              <Settings className={cn(isCollapsed ? 'w-5 h-5' : 'w-4 h-4 flex-shrink-0')} />
              <AnimatePresence>
                {!isCollapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    className="overflow-hidden whitespace-nowrap"
                  >
                    Settings
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>

            {/* Platform Admin link - internal admins only */}
            {isPlatformAdmin && (
              <Link
                to="/platform"
                className={cn(
                  'flex items-center transition-colors text-sm font-medium',
                  isCollapsed 
                    ? 'w-12 h-12 mx-auto rounded-xl justify-center mb-0' 
                    : 'w-full gap-3 px-2 py-2.5 rounded-xl mb-2',
                  location.pathname.startsWith('/platform')
                    ? 'bg-purple-50 text-purple-600 border border-purple-200 dark:bg-purple-900/20 dark:text-white dark:border-purple-800/20'
                    : 'text-[#64748B] hover:bg-slate-50 dark:text-gray-400/80 dark:hover:bg-gray-800/20'
                )}
              >
                <Shield className={cn(isCollapsed ? 'w-5 h-5' : 'w-4 h-4 flex-shrink-0')} />
                <AnimatePresence>
                  {!isCollapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="overflow-hidden whitespace-nowrap"
                    >
                      Platform Admin
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            )}
            
            <button
              onClick={handleLogout}
              className={cn(
                'flex items-center transition-colors text-sm font-medium',
                isCollapsed 
                  ? 'w-12 h-12 mx-auto rounded-xl justify-center' 
                  : 'w-full gap-3 px-2 py-2.5 rounded-xl',
                isImpersonating
                  ? 'text-amber-400 hover:bg-amber-500/10'
                  : 'text-red-400 hover:bg-red-500/10'
              )}
            >
              {isImpersonating ? (
                <>
                  <UserX className={cn(isCollapsed ? 'w-5 h-5' : 'w-4 h-4 flex-shrink-0')} />
                  <AnimatePresence>
                    {!isCollapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className="overflow-hidden whitespace-nowrap"
                      >
                        Stop Impersonation
                      </motion.span>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <>
                  <LogOut className={cn(isCollapsed ? 'w-5 h-5' : 'w-4 h-4 flex-shrink-0')} />
                  <AnimatePresence>
                    {!isCollapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className="overflow-hidden whitespace-nowrap"
                      >
                        Logout
                      </motion.span>
                    )}
                  </AnimatePresence>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
      <main
        style={
          {
            // Used by full-height pages to avoid double-counting the top padding.
            '--app-top-offset': `${topOffsetPx}px`,
            // Dynamic padding for banners - inline style because dynamic Tailwind classes don't work at runtime
            paddingTop: `${topOffsetPx}px`,
          } as React.CSSProperties
        }
        className={cn(
        isFullHeightPage && 'h-[100dvh] overflow-hidden',
        'flex-1 transition-[margin] duration-300 ease-in-out',
        isCollapsed ? 'lg:ml-[96px]' : 'lg:ml-[256px]',
        'ml-0'
      )}
      >
        {children}
        <QuickAdd isOpen={isQuickAddOpen} onClose={() => setIsQuickAddOpen(false)} />
        <AssistantOverlay isOpen={isAssistantOpen} onClose={() => setIsAssistantOpen(false)} />

        {/* Password Setup Modal - shown for magic link users who haven't set a password */}
        <PasswordSetupModal
          isOpen={needsPasswordSetup === true}
          userEmail={userData?.email || null}
          onComplete={completePasswordSetup}
        />

        {/* SmartSearch - Hidden */}
        {/* <SmartSearch
          isOpen={isSmartSearchOpen}
          onClose={() => setIsSmartSearchOpen(false)}
          onOpenCopilot={() => {
            navigate('/copilot');
            setIsSmartSearchOpen(false);
          }}
          onDraftEmail={(contactId, contactEmail) => {
            // Navigate to email page with contact information
            if (contactEmail) {
              navigate(`/email?to=${encodeURIComponent(contactEmail)}`);
            } else {
              navigate('/email');
            }
            setIsSmartSearchOpen(false);
          }}
          onAddContact={() => {
            navigate('/crm?tab=contacts');
            setIsSmartSearchOpen(false);
          }}
          onScheduleMeeting={(contactId) => {
            // Navigate to meetings page, optionally with contact pre-selected
            if (contactId) {
              navigate(`/meetings?contact=${contactId}`);
            } else {
              navigate('/meetings');
            }
            setIsSmartSearchOpen(false);
          }}
          onSelectContact={(contactId) => {
            navigate(`/crm/contacts/${contactId}`);
            setIsSmartSearchOpen(false);
          }}
          onSelectMeeting={(meetingId) => {
            navigate(`/meetings/${meetingId}`);
            setIsSmartSearchOpen(false);
          }}
          onSelectCompany={(companyId) => {
            navigate(`/crm/companies/${companyId}`);
            setIsSmartSearchOpen(false);
          }}
          onSelectDeal={(dealId) => {
            navigate(`/crm/deals/${dealId}`);
            setIsSmartSearchOpen(false);
          }}
          onAskCopilot={(query) => {
            openCopilot(query, true); // Start a new chat for each search query
            navigate('/copilot');
            setIsSmartSearchOpen(false);
          }}
        /> */}
      </main>
    </div>
    </div>
  );
}