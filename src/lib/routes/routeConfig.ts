/**
 * Route Configuration - Centralized Route Definitions
 *
 * Defines all application routes with their access levels and navigation metadata.
 * Supports 3-tier permission system:
 * - Tier 1: User (all authenticated users)
 * - Tier 2: Org Admin (org owners/admins)
 * - Tier 3: Platform Admin (internal + is_admin)
 */

import {
  Activity,
  Video,
  PhoneCall,
  Mic,
  Sparkles,
  Layers,
  BarChart3,
  Building2,
  Kanban,
  CheckSquare,
  Calendar,
  Mail,
  Users,
  Settings,
  Shield,
  Workflow,
  Plug,
  User,
  LayoutDashboard,
  HeartPulse,
  Bot,
  Inbox,
  ExternalLink,
  Table2,
  BookOpen,
  Crosshair,
  FileSearch,
  Brain,
  Send,
  LifeBuoy,
  FileText,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';
import { type UserType } from '@/lib/types/userTypes';

// =====================================================
// Types
// =====================================================

// Extended route access type for 3-tier system
export type RouteAccess =
  | 'any'           // All authenticated users
  | 'internal'      // Internal users only (legacy support)
  | 'external'      // External users only
  | 'admin'         // Legacy - maps to platformAdmin
  | 'orgAdmin'      // Org admins (owner/admin role) or platform admins
  | 'platformAdmin'; // Platform admins only (internal + is_admin)

export interface RouteConfig {
  /** Route path */
  path: string;
  /** Access level required */
  access: RouteAccess;
  /** Display label for navigation */
  label?: string;
  /** Icon for navigation */
  icon?: LucideIcon;
  /** Whether to show in navigation sidebar */
  showInNav?: boolean;
  /** Override navigation visibility for specific user types (independent of access) */
  showInNavFor?: 'internal' | 'external';
  /** Navigation section grouping */
  navSection?: 'main' | 'tools' | 'settings' | 'org' | 'platform';
  /** Order within section (lower = higher in list) */
  order?: number;
  /** Badge text (e.g., "New", "Beta") */
  badge?: string;
  /** Display group for visual grouping in sidebar (1-5) */
  displayGroup?: number;
  /** Whether this is an external link (opens in new tab) */
  isExternal?: boolean;
}

// =====================================================
// Route Definitions
// =====================================================

export const ROUTE_CONFIGS: RouteConfig[] = [
  // ========== Main Section (External + Internal) ==========
  {
    path: '/',
    access: 'internal',
    label: 'Dashboard',
    icon: LayoutDashboard,
    showInNav: false, // Dashboard is shown separately for internal users
    navSection: 'main',
    order: 1,
  },
  {
    path: '/meetings',
    access: 'any',
    label: 'Meetings',
    icon: Video,
    showInNav: true,
    navSection: 'main',
    order: 2,
    displayGroup: 1,
  },
  // ========== Dashboard (Available to all users) ==========
  {
    path: '/dashboard',
    access: 'any',
    label: 'Dashboard',
    icon: LayoutDashboard,
    showInNav: true,
    navSection: 'main',
    order: 1,
    displayGroup: 1,
  },
  {
    path: '/meetings/intelligence',
    access: 'any',
    label: 'Intelligence',
    icon: Sparkles,
    showInNav: false, // V1 — replaced by Meeting Analytics (now /meeting-analytics as "Intelligence")
    navSection: 'main',
    order: 3,
    displayGroup: 1,
  },
  {
    path: '/insights/content-topics',
    access: 'internal',
    label: 'Content Topics',
    icon: Layers,
    showInNav: false, // Moved to Platform Admin "Feature Development"
    navSection: 'main',
    order: 1,
    displayGroup: 3,
  },
  {
    path: '/insights/team',
    access: 'any',
    label: 'Team Analytics',
    icon: BarChart3,
    showInNav: false,
    navSection: 'main',
    order: 4,
    displayGroup: 1,
  },
  {
    path: '/meeting-analytics',
    access: 'any',
    label: 'Intelligence',
    icon: Sparkles,
    showInNav: true,
    navSection: 'main',
    order: 5,
    displayGroup: 1,
  },

  // ========== Internal-Only Main Routes ==========
  {
    path: '/leads',
    access: 'internal',
    label: 'Leads',
    icon: Inbox,
    showInNav: false, // Phase 2: accessible from Ops standard tables
    navSection: 'main',
    order: 2,
    displayGroup: 3,
  },
  {
    path: '/crm',
    access: 'internal',
    label: 'CRM',
    icon: Building2,
    showInNav: false, // Replaced by Ops
    navSection: 'main',
    order: 3,
    displayGroup: 3,
  },
  {
    path: '/pipeline',
    access: 'internal',
    label: 'Pipeline',
    icon: Kanban,
    showInNav: false, // Phase 2: accessible from Ops standard tables
    navSection: 'main',
    order: 4,
    displayGroup: 3,
  },
  {
    path: '/calls',
    access: 'internal',
    label: 'Calls',
    icon: PhoneCall,
    showInNav: false, // Moved to Platform Admin "Feature Development"
    navSection: 'main',
    order: 1,
    displayGroup: 4,
  },
  {
    path: '/voice',
    access: 'internal',
    label: 'Voice',
    icon: Mic,
    showInNav: false, // Moved to Platform Admin "Feature Development"
    navSection: 'main',
    order: 1,
    displayGroup: 5,
  },
  {
    path: '/activity',
    access: 'internal',
    label: 'Activity',
    icon: Activity,
    showInNav: false, // Phase 2: embedded in Dashboard as tab
    navSection: 'main',
    order: 5,
    displayGroup: 3,
  },
  {
    path: '/insights',
    access: 'internal',
    label: 'Insights',
    icon: BarChart3,
    showInNav: false, // Phase 2: embedded in Dashboard as tab
    navSection: 'main',
    order: 6,
    displayGroup: 3,
  },

  // ========== Tools Section (Internal Only) ==========
  {
    path: '/tasks',
    access: 'internal',
    label: 'Tasks',
    icon: CheckSquare,
    showInNav: false, // Replaced by Command Centre
    navSection: 'tools',
    order: 1,
    displayGroup: 2,
  },
  {
    path: '/projects',
    access: 'internal',
    label: 'Projects',
    icon: Layers,
    showInNav: false, // Replaced by Command Centre
    navSection: 'tools',
    order: 2,
    displayGroup: 2,
  },
  {
    path: '/ops',
    access: 'internal',
    label: 'Ops',
    icon: Table2,
    showInNav: true,
    navSection: 'tools',
    order: 3,
    displayGroup: 4, // Phase 2: same group as other tools to remove separator lines
    badge: 'New',
  },
  {
    path: '/profiles',
    access: 'internal',
    label: 'Profiles',
    icon: Building2,
    showInNav: false, // Phase 2: accessible via direct URL
    navSection: 'tools',
    order: 4,
    displayGroup: 2,
  },
  // Calendar and Email routes removed from navigation - users should use Google Calendar/Gmail directly
  // Routes still exist but redirect to Google services in App.tsx
  {
    path: '/workflows',
    access: 'internal',
    label: 'Workflows',
    icon: Workflow,
    showInNav: false, // Hidden from nav — full code deletion deferred
    navSection: 'tools',
    order: 2,
    displayGroup: 5,
  },
  {
    path: '/integrations',
    access: 'any',
    label: 'Integrations',
    icon: Plug,
    showInNav: true,
    navSection: 'main',
    order: 6,
    displayGroup: 1,
  },
  {
    path: '/copilot',
    access: 'internal',
    label: 'AI Copilot',
    icon: Bot,
    showInNav: true,
    navSection: 'tools',
    order: 2,
    displayGroup: 4,
  },
  {
    path: '/command-centre',
    access: 'internal',
    label: 'Command Centre',
    icon: Crosshair,
    showInNav: true,
    navSection: 'tools',
    order: 3,
    displayGroup: 4,
    badge: 'New',
  },
  {
    path: '/action-centre',
    access: 'internal',
    label: 'Action Centre',
    icon: Inbox,
    showInNav: false, // Deprecated — replaced by Command Centre
    navSection: 'tools',
    order: 3.1,
    displayGroup: 4,
  },
  {
    path: '/email-actions',
    access: 'internal',
    label: 'Email Actions',
    icon: Mail,
    showInNav: false, // Accessible via notifications, not in nav
    navSection: 'tools',
    order: 7,
  },
  {
    path: '/docs',
    access: 'any',
    label: 'Help & Docs',
    icon: BookOpen,
    showInNav: false, // Hardcoded in AppLayout sidebar footer (below Settings)
    navSection: 'settings',
    order: 5,
  },
  {
    path: '/support',
    access: 'any',
    label: 'Support',
    icon: LifeBuoy,
    showInNav: false, // Hardcoded in AppLayout sidebar footer (below Settings)
    navSection: 'settings',
    order: 6,
  },
  {
    path: '/demo/agent-research',
    access: 'internal',
    label: 'AI Research Demo',
    icon: Brain,
    showInNav: false,
    navSection: 'tools',
    order: 7,
    badge: 'Demo',
  },
  {
    path: '/demo/campaign-workflow',
    access: 'internal',
    label: 'Campaign Workflow Demo',
    icon: Send,
    showInNav: false,
    navSection: 'tools',
    order: 8,
    badge: 'Demo',
  },
  {
    path: '/platform/multi-agent-demo',
    access: 'internal',
    label: 'Multi-Agent Sales Demo',
    icon: Users,
    showInNav: false,
    navSection: 'tools',
    order: 9,
    badge: 'Demo',
  },
  {
    path: '/platform/multi-agent-research-demo',
    access: 'internal',
    label: 'Multi-Agent Research Demo',
    icon: Brain,
    showInNav: false,
    navSection: 'tools',
    order: 10,
    badge: 'Demo',
  },
  {
    path: '/platform/demo/prep-briefing',
    access: 'platformAdmin',
    label: 'Prep Briefing Demo',
    icon: FileText,
    showInNav: false,
    navSection: 'platform',
    order: 56,
    badge: 'New',
  },
  {
    path: '/platform/demo/conversational-copilot',
    access: 'platformAdmin',
    label: 'Conversational Copilot Demo',
    icon: Bot,
    showInNav: false,
    navSection: 'platform',
    order: 57,
    badge: 'New',
  },

  // ========== Settings Section (Tier 1: All Users) ==========
  {
    path: '/settings',
    access: 'any',
    label: 'Settings',
    icon: Settings,
    showInNav: true,
    navSection: 'settings',
    order: 1,
  },
  {
    path: '/profile',
    access: 'any',
    label: 'Profile',
    icon: User,
    showInNav: false,
    navSection: 'settings',
    order: 2,
  },
  {
    path: '/settings/ai',
    access: 'any',
    label: 'AI Settings',
    showInNav: false,
    navSection: 'settings',
    order: 3,
  },
  {
    path: '/settings/task-sync',
    access: 'any',
    label: 'Task Auto-Sync',
    showInNav: false,
    navSection: 'settings',
    order: 4,
  },

  // ========== Org Admin Routes ==========
  // Org/team management is now accessed via the main Settings page (role-gated cards).
  // We keep legacy redirects for /team/* paths elsewhere.
  {
    path: '/admin/control-room',
    access: 'orgAdmin',
    label: 'Control Room',
    icon: LayoutGrid,
    showInNav: true,
    navSection: 'org',
    order: 80,
    badge: 'New',
  },
  {
    path: '/settings/autonomy',
    access: 'orgAdmin',
    label: 'Autonomy & Approvals',
    showInNav: false,
    navSection: 'settings',
    order: 86,
  },
  {
    path: '/settings/methodology',
    access: 'orgAdmin',
    label: 'Sales Methodology',
    showInNav: false,
    navSection: 'settings',
    order: 85,
  },
  {
    path: '/agent/marketplace',
    access: 'orgAdmin',
    label: 'Agent Marketplace',
    icon: Bot,
    showInNav: false, // Phase 2: accessible via AI Copilot page
    navSection: 'tools',
    order: 1.5,
    displayGroup: 4,
  },

  // ========== Platform Admin Section (Tier 3: Platform Admins Only) ==========
  {
    path: '/platform',
    access: 'platformAdmin',
    label: 'Platform',
    icon: Shield,
    showInNav: true,
    navSection: 'platform',
    order: 1,
  },
  // Customer Management
  {
    path: '/platform/customers',
    access: 'platformAdmin',
    label: 'Customers',
    showInNav: false,
    navSection: 'platform',
    order: 2,
  },
  {
    path: '/platform/plans',
    access: 'platformAdmin',
    label: 'Plans',
    showInNav: false,
    navSection: 'platform',
    order: 3,
  },
  {
    path: '/platform/pricing',
    access: 'platformAdmin',
    label: 'Pricing Control',
    showInNav: false,
    navSection: 'platform',
    order: 3.5,
  },
  {
    path: '/platform/cost-analysis',
    access: 'platformAdmin',
    label: 'Cost Analysis',
    showInNav: false,
    navSection: 'platform',
    order: 3.6,
  },
  {
    path: '/platform/engagement',
    access: 'platformAdmin',
    label: 'Engagement',
    icon: HeartPulse,
    showInNav: true,
    navSection: 'platform',
    order: 3.7,
    badge: 'New',
  },
  {
    path: '/platform/engagement-simulator',
    access: 'platformAdmin',
    label: 'Engagement Simulator',
    showInNav: false,
    navSection: 'platform',
    order: 3.8,
  },
  {
    path: '/platform/usage',
    access: 'platformAdmin',
    label: 'Usage',
    showInNav: false,
    navSection: 'platform',
    order: 4,
  },
  {
    path: '/platform/features',
    access: 'platformAdmin',
    label: 'Features',
    showInNav: false,
    navSection: 'platform',
    order: 5,
  },
  // User Management
  {
    path: '/platform/users',
    access: 'platformAdmin',
    label: 'Users',
    showInNav: false,
    navSection: 'platform',
    order: 10,
  },
  {
    path: '/platform/audit',
    access: 'platformAdmin',
    label: 'Audit Logs',
    showInNav: false,
    navSection: 'platform',
    order: 11,
  },
  // CRM Configuration
  {
    path: '/platform/crm/pipeline',
    access: 'platformAdmin',
    label: 'Pipeline Settings',
    showInNav: false,
    navSection: 'platform',
    order: 20,
  },
  {
    path: '/platform/crm/smart-tasks',
    access: 'platformAdmin',
    label: 'Smart Tasks',
    showInNav: false,
    navSection: 'platform',
    order: 21,
  },
  {
    path: '/platform/crm/automation',
    access: 'platformAdmin',
    label: 'Pipeline Automation',
    showInNav: false,
    navSection: 'platform',
    order: 22,
  },
  {
    path: '/platform/crm/health-rules',
    access: 'platformAdmin',
    label: 'Health Rules',
    showInNav: false,
    navSection: 'platform',
    order: 23,
  },
  {
    path: '/platform/email-templates',
    access: 'platformAdmin',
    label: 'Email Templates',
    icon: Mail,
    showInNav: false,
    navSection: 'platform',
    order: 24,
  },
  {
    path: '/platform/support-tickets',
    access: 'platformAdmin',
    label: 'Support Tickets',
    icon: LifeBuoy,
    showInNav: true,
    navSection: 'platform',
    order: 14,
  },
  // Meetings Waitlist (now embedded in Platform Settings)
  {
    path: '/platform/meetings-waitlist',
    access: 'platformAdmin',
    label: 'Meetings Waitlist',
    icon: Users,
    showInNav: false,
    navSection: 'platform',
    order: 15,
  },
  // Public waitlist page (no auth required)
  {
    path: '/product/meetings/waitlist',
    access: 'any',
    label: 'Meetings Waitlist',
    showInNav: false,
  },
  // AI Configuration
  {
    path: '/platform/ai/providers',
    access: 'platformAdmin',
    label: 'AI Providers',
    showInNav: false,
    navSection: 'platform',
    order: 30,
  },
  {
    path: '/platform/ai/models',
    access: 'platformAdmin',
    label: 'Model Settings',
    showInNav: false,
    navSection: 'platform',
    order: 31,
  },
  {
    path: '/platform/ai/prompts',
    access: 'platformAdmin',
    label: 'Prompts',
    showInNav: false,
    navSection: 'platform',
    order: 32,
  },
  {
    path: '/platform/skills',
    access: 'platformAdmin',
    label: 'Platform Skills',
    showInNav: false,
    navSection: 'platform',
    order: 33,
  },
  {
    path: '/platform/ai/extraction',
    access: 'platformAdmin',
    label: 'Extraction Rules',
    showInNav: false,
    navSection: 'platform',
    order: 33,
  },
  {
    path: '/platform/copilot-tests',
    access: 'platformAdmin',
    label: 'Copilot Tests',
    showInNav: false,
    navSection: 'platform',
    order: 34,
  },
  // Integrations
  {
    path: '/platform/integrations/savvycal',
    access: 'platformAdmin',
    label: 'SavvyCal',
    showInNav: false,
    navSection: 'platform',
    order: 40,
  },
  {
    path: '/platform/integrations/booking',
    access: 'platformAdmin',
    label: 'Booking Sources',
    showInNav: false,
    navSection: 'platform',
    order: 41,
  },
  {
    path: '/platform/integrations/domains',
    access: 'platformAdmin',
    label: 'Internal Domains',
    showInNav: false,
    navSection: 'platform',
    order: 42,
  },
  // Dev Tools (kept: API testing and Function testing only)
  {
    path: '/platform/dev/api',
    access: 'platformAdmin',
    label: 'API Testing',
    showInNav: false,
    navSection: 'platform',
    order: 50,
  },
  {
    path: '/platform/dev/api-monitor',
    access: 'platformAdmin',
    label: 'API Monitor',
    showInNav: false,
    navSection: 'platform',
    order: 50.5,
  },
  {
    path: '/platform/dev/billing-analytics',
    access: 'platformAdmin',
    label: 'Billing Analytics',
    icon: BarChart3,
    showInNav: false,
    navSection: 'platform',
    order: 50.6,
  },
  {
    path: '/platform/dev/functions',
    access: 'platformAdmin',
    label: 'Function Testing',
    showInNav: false,
    navSection: 'platform',
    order: 51,
  },
  {
    path: '/platform/onboarding-simulator',
    access: 'internal',
    label: 'Onboarding Simulator',
    showInNav: false,
    navSection: 'platform',
    order: 52,
  },
  // Agent simulator (Slack + in-app)
  {
    path: '/platform/agent-simulator',
    access: 'platformAdmin',
    label: 'Agent Simulator',
    icon: Bot,
    showInNav: true,
    navSection: 'platform',
    order: 53,
    badge: 'New',
  },
  // Process Maps - AI-generated process visualization
  {
    path: '/platform/process-maps',
    access: 'platformAdmin',
    label: 'Process Maps',
    showInNav: false,
    navSection: 'platform',
    order: 54,
  },
  // Content Management
  {
    path: '/platform/docs-admin',
    access: 'platformAdmin',
    label: 'Documentation CMS',
    icon: BookOpen,
    showInNav: false,
    navSection: 'platform',
    order: 55,
  },
  // CRM Field Mapping (Org Admin)
  {
    path: '/settings/crm-field-mapping',
    access: 'orgAdmin',
    label: 'CRM Field Mapping',
    showInNav: false,
    navSection: 'settings',
    order: 87,
  },
  // Custom SOPs / Playbooks (Org Admin)
  {
    path: '/settings/custom-sops',
    access: 'orgAdmin',
    label: 'Custom Playbooks (SOPs)',
    icon: Workflow,
    showInNav: false,
    navSection: 'settings',
    order: 88,
  },
  // Signal Intelligence (Org Admin)
  {
    path: '/settings/signal-intelligence',
    access: 'orgAdmin',
    label: 'Signal Intelligence',
    showInNav: false,
    navSection: 'settings',
    order: 89,
  },
  // Knowledge & Memory (Org Admin)
  {
    path: '/settings/knowledge-memory',
    access: 'orgAdmin',
    label: 'Knowledge & Memory',
    showInNav: false,
    navSection: 'settings',
    order: 90,
  },
  // Slack Settings (Org Admin)
  {
    path: '/settings/integrations/slack',
    access: 'any',
    label: 'Slack Settings',
    showInNav: false,
    navSection: 'settings',
    order: 10,
  },
  // JustCall Settings (Org Admin)
  {
    path: '/settings/integrations/justcall',
    access: 'any',
    label: 'JustCall Settings',
    showInNav: false,
    navSection: 'settings',
    order: 11,
  },

  // Legacy admin routes removed - now redirect to /platform in App.tsx
];

// =====================================================
// Helper Functions
// =====================================================

/**
 * Get navigation items for a specific user type and section
 */
export function getNavigationItems(
  effectiveUserType: UserType,
  isAdmin: boolean,
  isOrgAdmin: boolean,
  section?: RouteConfig['navSection']
): RouteConfig[] {
  return ROUTE_CONFIGS.filter((route) => {
    // Must be marked for navigation
    if (!route.showInNav) return false;

    // Filter by section if specified
    if (section && route.navSection !== section) return false;

    // Check access level based on 3-tier system
    switch (route.access) {
      case 'platformAdmin':
      case 'admin':
        // Tier 3: Platform Admin (internal + is_admin)
        if (!isAdmin || effectiveUserType !== 'internal') return false;
        break;
      case 'orgAdmin':
        // Tier 2: Org Admin or Platform Admin
        if (!isOrgAdmin && !(isAdmin && effectiveUserType === 'internal')) return false;
        break;
      case 'internal':
        // Internal users only
        if (effectiveUserType === 'external') return false;
        break;
      case 'external':
        // External users only
        if (effectiveUserType !== 'external') return false;
        break;
      case 'any':
      default:
        // No restrictions
        break;
    }

    // Check showInNavFor override (controls nav visibility independent of access)
    if (route.showInNavFor) {
      if (route.showInNavFor === 'external' && effectiveUserType !== 'external') return false;
      if (route.showInNavFor === 'internal' && effectiveUserType === 'external') return false;
    }

    return true;
  }).sort((a, b) => (a.order || 999) - (b.order || 999));
}

/**
 * Get all navigation sections with their items
 */
export function getNavigationSections(
  effectiveUserType: UserType,
  isAdmin: boolean,
  isOrgAdmin: boolean = false
): Array<{ section: string; items: RouteConfig[] }> {
  const sections: RouteConfig['navSection'][] = ['main', 'tools', 'settings', 'org', 'platform'];

  return sections
    .map((section) => ({
      section: section || 'main',
      items: getNavigationItems(effectiveUserType, isAdmin, isOrgAdmin, section),
    }))
    .filter((s) => s.items.length > 0);
}

/**
 * Get route config by path
 */
export function getRouteConfig(path: string): RouteConfig | undefined {
  // First try exact match
  const exactMatch = ROUTE_CONFIGS.find((r) => r.path === path);
  if (exactMatch) return exactMatch;

  // Try prefix match for nested routes (e.g., /meetings/123 matches /meetings)
  const sortedConfigs = [...ROUTE_CONFIGS].sort((a, b) => b.path.length - a.path.length);
  return sortedConfigs.find(
    (r) => path.startsWith(r.path) && (r.path === '/' ? path === '/' : true)
  );
}

/**
 * Check if a route requires internal access
 */
export function isInternalRoute(path: string): boolean {
  const config = getRouteConfig(path);
  return config?.access === 'internal' ||
         config?.access === 'admin' ||
         config?.access === 'platformAdmin';
}

/**
 * Check if a route requires admin access (legacy)
 * @deprecated Use isPlatformAdminRoute instead
 */
export function isAdminRoute(path: string): boolean {
  const config = getRouteConfig(path);
  return config?.access === 'admin' || config?.access === 'platformAdmin';
}

/**
 * Check if a route requires Platform Admin access
 */
export function isPlatformAdminRoute(path: string): boolean {
  const config = getRouteConfig(path);
  return config?.access === 'platformAdmin' || config?.access === 'admin';
}

/**
 * Check if a route requires Org Admin access
 */
export function isOrgAdminRoute(path: string): boolean {
  const config = getRouteConfig(path);
  return config?.access === 'orgAdmin';
}

/**
 * Get the default route for a user type
 */
export function getDefaultRoute(effectiveUserType: UserType): string {
  return effectiveUserType === 'external' ? '/meetings' : '/';
}

// =====================================================
// Legacy Route Mappings (for redirects)
// =====================================================

export const LEGACY_ROUTE_REDIRECTS: Record<string, string> = {
  // Admin routes -> Platform
  '/admin': '/platform',
  '/admin/users': '/platform/users',
  '/admin/pipeline': '/platform/crm/pipeline',
  '/admin/audit': '/platform/audit',
  '/admin/smart-tasks': '/platform/crm/smart-tasks',
  '/admin/email-categorization': '/platform/integrations/email-categorization',
  '/admin/pipeline-automation': '/platform/crm/automation',
  '/admin/health-rules': '/platform/crm/health-rules',
  '/admin/ai-settings': '/platform/ai/providers',
  '/admin/model-settings': '/platform/ai/models',
  '/admin/prompts': '/platform/ai/prompts',
  '/admin/api-testing': '/platform/dev/api',
  '/admin/function-testing': '/platform/dev/functions',
  '/admin/savvycal-settings': '/platform/integrations/savvycal',
  '/admin/booking-sources': '/platform/integrations/booking',
  '/admin/internal-domains': '/platform/integrations/domains',
  '/admin/branding': '/settings',
  // SaaS Admin routes -> Platform
  '/saas-admin': '/platform',
  '/saas-admin/customers': '/platform/customers',
  '/saas-admin/plans': '/platform/plans',
  '/saas-admin/usage': '/platform/usage',
  '/saas-admin/features': '/platform/features',
  // Settings routes
  '/settings/team': '/settings',
  // Legacy team routes -> settings
  '/team': '/settings',
  '/team/team': '/settings/team-members',
  '/team/branding': '/settings',
  '/team/billing': '/settings/billing',
  // Legacy org routes -> settings
  '/org': '/settings',
  '/org/team': '/settings/team-members',
  '/org/branding': '/settings',
  '/org/billing': '/settings/billing',
};

/**
 * Get redirect path for legacy routes
 */
export function getLegacyRedirect(path: string): string | null {
  // Check exact match
  if (LEGACY_ROUTE_REDIRECTS[path]) {
    return LEGACY_ROUTE_REDIRECTS[path];
  }

  // Check prefix matches for nested routes
  for (const [legacyPath, newPath] of Object.entries(LEGACY_ROUTE_REDIRECTS)) {
    if (path.startsWith(legacyPath + '/')) {
      // Replace the prefix with the new path
      return path.replace(legacyPath, newPath);
    }
  }

  return null;
}
