/**
 * Settings - User Settings Page (Tier 1)
 *
 * Simplified settings page for all authenticated users.
 * Contains only user-specific settings:
 * - Account (profile)
 * - Appearance (theme)
 * - Proposals
 * - AI Personalization
 * - Email Sync
 * - Task Auto-Sync
 *
 * Team-level settings are shown here for admins only.
 * Platform-level settings (internal-only) are separate.
 */

import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { useMemo } from 'react';
import {
  User,
  Palette,
  Sparkles,
  MessageSquare,
  Mail,
  CheckSquare,
  Key,
  ChevronRight,
  Users,
  Building2,
  Video,
  Phone,
  Workflow,
  CreditCard,
  Brain,
  Briefcase,
  Zap,
  Eye,
  Wallet,
  Bot,
  Plug,
  BookOpen,
} from 'lucide-react';

interface SettingsSection {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  path: string;
  requiresOrgAdmin?: boolean;
}

export default function Settings() {
  const navigate = useNavigate();
  const { permissions } = useOrg();
  const { isPlatformAdmin } = useUserPermissions();
  const allSettingsSections: SettingsSection[] = [
    {
      id: 'account',
      label: 'Account',
      icon: User,
      description: 'Manage your profile and account settings',
      path: '/settings/account',
    },
    {
      id: 'appearance',
      label: 'Appearance',
      icon: Palette,
      description: 'Customize theme and display preferences',
      path: '/settings/appearance',
    },
    {
      id: 'ai-intelligence',
      label: 'AI Intelligence',
      icon: Brain,
      description: 'Company context, AI skills, and writing styles',
      path: '/settings/ai-intelligence',
      requiresOrgAdmin: true,
    },
    {
      id: 'ai-personalization',
      label: 'AI Personalization',
      icon: Sparkles,
      description: 'Customize AI behavior and preferences',
      path: '/settings/ai-personalization',
    },
    {
      id: 'sales-coaching',
      label: 'Sales Coaching',
      icon: MessageSquare,
      description: 'Configure AI coaching preferences and reference meetings',
      path: '/settings/sales-coaching',
    },
    {
      id: 'api-keys',
      label: 'API Keys',
      icon: Key,
      description: 'Manage AI provider API keys (encrypted and secure)',
      path: '/settings/api-keys',
    },
    {
      id: 'follow-ups',
      label: 'Follow Ups',
      icon: Workflow,
      description: 'Configure follow-up workflows, templates, and AI settings',
      path: '/settings/follow-ups',
      requiresOrgAdmin: true,
    },
    {
      id: 'task-sync',
      label: 'Task Auto-Sync',
      icon: CheckSquare,
      description: 'AI-powered automatic task creation from action items',
      path: '/settings/task-sync',
    },
    {
      id: 'fathom',
      label: 'Fathom',
      icon: Video,
      description: 'AI meeting notes and user mapping settings',
      path: '/settings/integrations/fathom',
    },
    {
      id: 'fireflies',
      label: 'Fireflies',
      icon: Video,
      description: 'AI meeting notes and transcription settings',
      path: '/settings/integrations/fireflies',
    },
    {
      id: '60-notetaker',
      label: '60 Notetaker',
      icon: Video,
      description: 'Configure automated meeting recording preferences',
      path: '/meetings/recordings/settings',
    },
    {
      id: 'call-types',
      label: 'Call Types',
      icon: Phone,
      description: 'Configure call types for AI-powered meeting classification',
      path: '/settings/call-types',
      requiresOrgAdmin: true,
    },
    {
      id: 'google-workspace',
      label: 'Google Workspace',
      icon: Mail,
      description: 'Gmail, Calendar, Drive, and Tasks integration',
      path: '/settings/integrations/google-workspace',
    },
    {
      id: 'email-sync',
      label: 'Email Sync',
      icon: Mail,
      description: 'Sync and analyze email communications',
      path: '/settings/email-sync',
    },
    {
      id: 'slack',
      label: 'Slack',
      icon: MessageSquare,
      description: 'Send meeting, deal, and digest notifications to Slack',
      path: '/settings/integrations/slack',
    },
    {
      id: 'justcall',
      label: 'JustCall',
      icon: Phone,
      description: 'Configure call sync, webhooks, and outbound activity logging',
      path: '/settings/integrations/justcall',
      requiresOrgAdmin: true,
    },
    {
      id: 'hubspot',
      label: 'HubSpot',
      icon: Users,
      description: 'Configure pipeline sync, contact sync, deal sync, and AI notes',
      path: '/settings/integrations/hubspot',
      requiresOrgAdmin: true,
    },
    {
      id: 'attio',
      label: 'Attio',
      icon: Users,
      description: 'Configure object sync, attribute mapping, and AI notes',
      path: '/settings/integrations/attio',
      requiresOrgAdmin: true,
    },
    {
      id: 'bullhorn',
      label: 'Bullhorn ATS',
      icon: Briefcase,
      description: 'Configure candidate sync, job orders, placements, and AI notes',
      path: '/settings/integrations/bullhorn',
      requiresOrgAdmin: true,
    },
    {
      id: 'instantly',
      label: 'Instantly',
      icon: Zap,
      description: 'Email outreach campaigns, lead push, and engagement sync',
      path: '/settings/integrations/instantly',
      requiresOrgAdmin: true,
    },
    {
      id: 'smart-listening',
      label: 'Smart Listening',
      icon: Eye,
      description: 'Monitor key accounts for job changes, funding, news, and custom research',
      path: '/settings/smart-listening',
    },
    {
      id: 'proactive-agent',
      label: 'Proactive Agent',
      icon: Bot,
      description: 'Configure autonomous AI workflows that monitor your pipeline and take action',
      path: '/settings/proactive-agent',
      requiresOrgAdmin: true,
    },
    {
      id: 'organization-management',
      label: 'Organization Management',
      icon: Building2,
      description: 'Manage organization, team members, and invitations',
      path: '/settings/organization-management',
      requiresOrgAdmin: false,
    },
    {
      id: 'credits',
      label: 'Credits & AI',
      icon: Wallet,
      description: 'View AI credit balance, usage trends, and purchase history',
      path: '/settings/credits',
      requiresOrgAdmin: true,
    },
    {
      id: 'billing',
      label: 'Billing',
      icon: CreditCard,
      description: 'Manage your subscription and billing',
      path: '/settings/billing',
      requiresOrgAdmin: true,
    },
    {
      id: 'integrations-hub',
      label: 'Integrations Hub',
      icon: Plug,
      description: 'Connect your tools and services',
      path: '/integrations',
    },
    {
      id: 'help-docs',
      label: 'Help & Docs',
      icon: BookOpen,
      description: 'Product guides, help articles, and support',
      path: '/docs',
    },
  ];

  // Filter sections based on permissions
  const settingsSections = useMemo(() => {
    return allSettingsSections.filter(section => {
      // Non-functional sections — hidden from external users, visible to platform admins.
      if (['task-sync', 'smart-listening', 'proactive-agent'].includes(section.id)) {
        return isPlatformAdmin;
      }
      if (section.requiresOrgAdmin) {
        // Allow org admins AND platform admins to see team settings
        return permissions.canManageTeam || permissions.canManageSettings || isPlatformAdmin;
      }
      return true;
    });
  }, [allSettingsSections, permissions, isPlatformAdmin]);

  const categories = useMemo(() => {
    const personalSections = settingsSections.filter(s =>
      ['account', 'appearance'].includes(s.id)
    );
    const aiSections = settingsSections.filter(s =>
      ['ai-intelligence', 'ai-personalization', 'sales-coaching', 'api-keys', 'follow-ups', 'task-sync', 'call-types', 'smart-listening', 'proactive-agent'].includes(s.id)
    );
    const integrationSections = settingsSections.filter(s =>
      ['google-workspace', 'email-sync', 'slack', 'justcall', 'hubspot', 'attio', 'bullhorn', 'instantly', 'fathom', 'fireflies', '60-notetaker'].includes(s.id)
    );
    const teamSections = settingsSections.filter(s =>
      ['organization-management', 'credits', 'billing'].includes(s.id)
    );

    const cats = [
      {
        id: 'personal',
        label: 'Personal',
        sections: personalSections,
      },
      {
        id: 'ai',
        label: 'AI & Intelligence',
        sections: aiSections,
      },
      {
        id: 'integrations',
        label: 'Integrations',
        sections: integrationSections,
      },
    ];

    // Only show Team category if user has team management permissions
    if (teamSections.length > 0) {
      cats.push({
        id: 'team',
        label: 'Team',
        sections: teamSections,
      });
    }

    // "More" category for pages removed from nav but still accessible
    const moreSections = settingsSections.filter(s =>
      ['integrations-hub', 'help-docs'].includes(s.id)
    );
    if (moreSections.length > 0) {
      cats.push({
        id: 'more',
        label: 'More',
        sections: moreSections,
      });
    }

    return cats.filter(cat => cat.sections.length > 0);
  }, [settingsSections]);

  return (
    <div className="min-h-screen">
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Page Header */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#1E293B] dark:text-white">
              Settings
            </h1>
            <p className="text-[#64748B] dark:text-gray-400 mt-2">
              Manage your account, preferences, and integrations
            </p>
          </div>

          {/* Settings Categories */}
          {categories.map((category) => (
            <div key={category.id} className="space-y-4">
              {/* Category Header */}
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-800 to-transparent" />
                <h2 className="text-xs font-semibold text-[#64748B] dark:text-gray-500 uppercase tracking-wider px-3">
                  {category.label}
                </h2>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-800 to-transparent" />
              </div>

              {/* Setting Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {category.sections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <button
                      key={section.id}
                      onClick={() => navigate(section.path)}
                      className="group bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800/50 rounded-xl p-5 backdrop-blur-xl transition-all hover:border-[#37bd7e]/50 dark:hover:border-[#37bd7e]/50 hover:shadow-lg hover:shadow-[#37bd7e]/10 text-left"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1">
                          <div className="p-3 bg-[#37bd7e]/10 dark:bg-[#37bd7e]/20 rounded-xl group-hover:bg-[#37bd7e]/20 dark:group-hover:bg-[#37bd7e]/30 transition-colors">
                            <Icon className="w-6 h-6 text-[#37bd7e]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-[#1E293B] dark:text-white text-base mb-1">
                              {section.label}
                            </h3>
                            <p className="text-sm text-[#64748B] dark:text-gray-400 line-clamp-2">
                              {section.description}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-[#64748B] dark:text-gray-400 group-hover:text-[#37bd7e] transition-colors flex-shrink-0 mt-1" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
