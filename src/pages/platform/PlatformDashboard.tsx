/**
 * PlatformDashboard - Platform Admin Dashboard (Tier 3)
 *
 * Unified Platform Admin hub for internal team members with is_admin flag.
 * Merges functionality from AdminDashboard + SaasAdminDashboard.
 *
 * Access: Platform Admins only (internal + is_admin)
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Building2,
  BarChart3,
  Settings2,
  Shield,
  Zap,
  Sparkles,
  Code2,
  Target,
  PanelLeft,
  Workflow,
  Calendar,
  Tag,
  RefreshCw,
  TrendingUp,
  DollarSign,
  ChevronRight,
  ChevronDown,
  Layers,
  Globe,
  MessageSquare,
  Mail,
  Brain,
  Clock,
  ListChecks,
  Share2,
  Play,
  Bug,
  FileCode,
  Bell,
  Activity,
  Eye,
  GitBranch,
  Bot,
  Video,
  Search,
  X,
  Cpu,
  PhoneCall,
  Mic,
  LifeBuoy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  getAdminDashboardStats,
  getCustomers,
} from '@/lib/services/saasAdminService';
import type { AdminDashboardStats, CustomerWithDetails } from '@/lib/types/saasAdmin';
import { toast } from 'sonner';

interface PlatformSection {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  color: string;
  badge?: string;
}

const platformSections: Record<string, PlatformSection[]> = {
  'Customer Management': [
    {
      id: 'activation',
      title: 'Activation Dashboard',
      description: 'Track user activation funnel and North Star metric',
      icon: Target,
      href: '/platform/activation',
      color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30',
      badge: 'North Star',
    },
    {
      id: 'customers',
      title: 'Customers',
      description: 'Manage organizations, subscriptions, and customer details',
      icon: Building2,
      href: '/platform/customers',
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
    },
    {
      id: 'waitlist',
      title: 'Waitlist Admin',
      description: 'Manage meeting intelligence waitlist signups and approvals',
      icon: Users,
      href: '/platform/meetings-waitlist',
      color: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30',
      badge: 'New',
    },
    {
      id: 'vsl-analytics',
      title: 'VSL Analytics',
      description: 'Split test analytics for landing page videos',
      icon: Play,
      href: '/platform/vsl-analytics',
      color: 'text-rose-600 bg-rose-100 dark:bg-rose-900/30',
    },
    {
      id: 'meta-ads',
      title: 'Meta Ads Analytics',
      description: 'Track Facebook & Instagram ad conversions',
      icon: Target,
      href: '/platform/meta-ads',
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
      badge: 'New',
    },
    {
      id: 'pricing',
      title: 'Pricing Control',
      description: 'Manage pricing page, free tier, and Stripe integration',
      icon: DollarSign,
      href: '/platform/pricing',
      color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30',
      badge: 'New',
    },
    {
      id: 'cost-analysis',
      title: 'Cost Analysis',
      description: 'Analyze costs per organization, tier, and AI model',
      icon: BarChart3,
      href: '/platform/cost-analysis',
      color: 'text-cyan-600 bg-cyan-100 dark:bg-cyan-900/30',
      badge: 'New',
    },
    {
      id: 'billing-analytics',
      title: 'Billing Analytics',
      description: 'RevenueCat-inspired subscription metrics (MRR, churn, retention, LTV)',
      icon: DollarSign,
      href: '/platform/dev/billing-analytics',
      color: 'text-green-600 bg-green-100 dark:bg-green-900/30',
      badge: 'New',
    },
    {
      id: 'users',
      title: 'User Management',
      description: 'View all users, manage permissions, and admin access',
      icon: Users,
      href: '/platform/users',
      color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30',
    },
    {
      id: 'support-tickets',
      title: 'Support Tickets',
      description: 'View and manage customer support tickets',
      icon: LifeBuoy,
      href: '/platform/support-tickets',
      color: 'text-cyan-600 bg-cyan-100 dark:bg-cyan-900/30',
    },
  ],
  'Pipeline & Automation': [
    {
      id: 'pipeline',
      title: 'Pipeline Settings',
      description: 'Configure sales pipeline stages and automation rules',
      icon: PanelLeft,
      href: '/platform/crm/pipeline',
      color: 'text-green-600 bg-green-100 dark:bg-green-900/30',
    },
    {
      id: 'smart-tasks',
      title: 'Smart Tasks',
      description: 'Manage automated task templates and intelligent triggers',
      icon: Zap,
      href: '/platform/crm/smart-tasks',
      color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30',
    },
    {
      id: 'pipeline-automation',
      title: 'Pipeline Automation',
      description: 'Set up automated transitions and workflow rules',
      icon: Workflow,
      href: '/platform/crm/automation',
      color: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30',
    },
  ],
  'AI & Intelligence': [
    {
      id: 'ai-settings',
      title: 'AI Configuration',
      description: 'Configure AI providers, models, and intelligent features',
      icon: Sparkles,
      href: '/platform/ai/settings',
      color: 'text-pink-600 bg-pink-100 dark:bg-pink-900/30',
    },
    {
      id: 'ai-models',
      title: 'AI Model Config',
      description: 'Granular per-feature AI model assignment (driver/planner)',
      icon: Cpu,
      href: '/platform/ai/models',
      color: 'text-violet-600 bg-violet-100 dark:bg-violet-900/30',
    },
    {
      id: 'ai-prompts',
      title: 'AI Prompts',
      description: 'Customize prompt templates for analysis and generation',
      icon: Layers,
      href: '/platform/ai/prompts',
      color: 'text-fuchsia-600 bg-fuchsia-100 dark:bg-fuchsia-900/30',
    },
    {
      id: 'platform-skills',
      title: 'Platform Skills',
      description: 'Manage agent-executable skill documents for AI automation',
      icon: FileCode,
      href: '/platform/skills',
      color: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30',
      badge: 'New',
    },
    {
      id: 'agent-sequences',
      title: 'Agent Sequences',
      description: 'Create and manage multi-step skill chains for automated workflows',
      icon: GitBranch,
      href: '/platform/agent-sequences',
      color: 'text-violet-600 bg-violet-100 dark:bg-violet-900/30',
      badge: 'New',
    },
    {
      id: 'agent-abilities',
      title: 'Agent Abilities',
      description: 'Catalog of agent capabilities, tools, and skill execution',
      icon: Sparkles,
      href: '/platform/agent-abilities',
      color: 'text-pink-600 bg-pink-100 dark:bg-pink-900/30',
      badge: 'New',
    },
    {
      id: 'agent-performance',
      title: 'Agent Performance',
      description: 'Observability dashboard for agent execution analytics',
      icon: Activity,
      href: '/platform/agent-performance',
      color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
      badge: 'New',
    },
    {
      id: 'copilot-lab',
      title: 'Copilot Lab',
      description: 'Testing, discovery, and improvement hub for copilot',
      icon: Brain,
      href: '/platform/copilot-lab',
      color: 'text-violet-600 bg-violet-100 dark:bg-violet-900/30',
      badge: 'New',
    },
    {
      id: 'quickadd-simulator',
      title: 'Quick Add Simulator',
      description: 'Preview Quick Add versions and control internal vs external rollout',
      icon: Brain,
      href: '/platform/quickadd-simulator',
      color: 'text-violet-600 bg-violet-100 dark:bg-violet-900/30',
      badge: 'New',
    },
    {
      id: 'copilot-console',
      title: 'Copilot Console',
      description: 'Test, monitor, and analyze your AI copilot in one place',
      icon: Bot,
      href: '/platform/copilot-console',
      color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
      badge: 'New',
    },
    {
      id: 'exa-abilities-demo',
      title: 'Exa Prospecting Demo',
      description: 'Guided 4-step showcase for account discovery, persona discovery, intent signals, and Websets strategy',
      icon: Search,
      href: '/demo/exa-abilities',
      color: 'text-sky-600 bg-sky-100 dark:bg-sky-900/30',
      badge: 'New',
    },
    {
      id: 'feature-flags',
      title: 'Feature Flags',
      description: 'Control feature availability per customer',
      icon: Settings2,
      href: '/platform/features',
      color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30',
    },
  ],
  'Integrations': [
    {
      id: 'integration-testing',
      title: 'Integration Testing',
      description: 'Monitor integration health and run diagnostic tests',
      icon: RefreshCw,
      href: '/platform/integrations',
      color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
      badge: 'New',
    },
    {
      id: 'integration-roadmap',
      title: 'Integration Roadmap',
      description: 'Implementation plans for all coming-soon integrations (searchable)',
      icon: Layers,
      href: '/platform/integrations/roadmap',
      color: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30',
    },
    {
      id: 'slack-demo',
      title: 'Slack Demo',
      description: 'Test Slack integration and notification workflows',
      icon: MessageSquare,
      href: '/platform/slack-demo',
      color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30',
      badge: 'New',
    },
    {
      id: 'google-integration',
      title: 'Google Integration',
      description: 'Test Calendar, Gmail, and OAuth integrations',
      icon: Globe,
      href: '/platform/integrations/google',
      color: 'text-red-600 bg-red-100 dark:bg-red-900/30',
    },
    {
      id: 'savvycal',
      title: 'SavvyCal Sources',
      description: 'Map booking link IDs to lead sources',
      icon: Calendar,
      href: '/platform/integrations/savvycal',
      color: 'text-teal-600 bg-teal-100 dark:bg-teal-900/30',
    },
    {
      id: 'booking-sources',
      title: 'Booking Sources',
      description: 'Manage predefined booking source mappings',
      icon: Tag,
      href: '/platform/integrations/booking-sources',
      color: 'text-cyan-600 bg-cyan-100 dark:bg-cyan-900/30',
    },
    {
      id: 'notetaker-branding',
      title: 'MeetingBaaS Bot Branding',
      description: 'Configure default bot avatar image for all organizations',
      icon: Bot,
      href: '/platform/integrations/notetaker-branding',
      color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
    },
    {
      id: 'notetaker-recording-limit',
      title: 'MeetingBaaS Recording Limit',
      description: 'Set the default monthly recording limit for all organizations',
      icon: Video,
      href: '/platform/integrations/notetaker-recording-limit',
      color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
    },
  ],
  'Email & Communications': [
    {
      id: 'email-templates',
      title: 'Email Templates',
      description: 'Manage Encharge email templates programmatically',
      icon: Mail,
      href: '/platform/email-templates',
      color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
      badge: 'New',
    },
  ],
  'Security & Audit': [
    {
      id: 'audit',
      title: 'Audit Logs',
      description: 'View system activity, user actions, and security events',
      icon: Shield,
      href: '/platform/audit',
      color: 'text-violet-600 bg-violet-100 dark:bg-violet-900/30',
    },
    {
      id: 'usage',
      title: 'Usage Analytics',
      description: 'Track resource consumption and usage patterns',
      icon: BarChart3,
      href: '/platform/usage',
      color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
    },
  ],
  'Development Tools': [
    {
      id: 'deal-truth-simulator',
      title: 'Deal Truth Simulator',
      description: 'Visualize Deal Truth fields, clarity scoring, and close plan execution',
      icon: Eye,
      href: '/platform/deal-truth-simulator',
      color: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30',
      badge: 'New',
    },
    {
      id: 'engagement-simulator',
      title: 'Engagement Simulator',
      description: 'Test Smart Engagement Algorithm with mock and live user data',
      icon: Activity,
      href: '/platform/engagement-simulator',
      color: 'text-green-600 bg-green-100 dark:bg-green-900/30',
      badge: 'New',
    },
    {
      id: 'tasks-demo',
      title: 'Tasks Demo',
      description: 'End-to-end test AI suggestions → action items → tasks (meeting-first, calls toggle)',
      icon: ListChecks,
      href: '/platform/tasks-demo',
      color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
      badge: 'New',
    },
    {
      id: 'process-maps',
      title: 'Process Maps',
      description: 'AI-generated Mermaid diagrams visualizing integration flows and workflows',
      icon: Share2,
      href: '/platform/process-maps',
      color: 'text-violet-600 bg-violet-100 dark:bg-violet-900/30',
      badge: 'New',
    },
    {
      id: 'cron-jobs',
      title: 'Cron Jobs',
      description: 'Monitor and manage scheduled jobs with failure notifications',
      icon: Clock,
      href: '/platform/cron-jobs',
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
      badge: 'New',
    },
    {
      id: 'launch-checklist',
      title: 'Launch Checklist',
      description: 'Track MVP launch progress and task completion',
      icon: Target,
      href: '/platform/launch-checklist',
      color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
      badge: 'New',
    },
    {
      id: 'api-testing',
      title: 'API Testing',
      description: 'Test API endpoints and debug issues',
      icon: Code2,
      href: '/platform/dev/api-testing',
      color: 'text-cyan-600 bg-cyan-100 dark:bg-cyan-900/30',
    },
    {
      id: 'api-monitor',
      title: 'API Monitor',
      description: 'Monitor REST API usage, errors, bursts, and track improvements',
      icon: Activity,
      href: '/platform/dev/api-monitor',
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
      badge: 'New',
    },
    {
      id: 'function-testing',
      title: 'Function Testing',
      description: 'Test edge functions and serverless endpoints',
      icon: Target,
      href: '/platform/dev/function-testing',
      color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30',
    },
    {
      id: 'onboarding-simulator',
      title: 'Onboarding Simulator',
      description: 'Simulate and visualize the free trial journey',
      icon: Calendar,
      href: '/platform/onboarding-simulator',
      color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30',
    },
    {
      id: 'vsl-analytics-tests',
      title: 'VSL Analytics Tests',
      description: 'Test video analytics tracking, database storage, and dashboard queries',
      icon: Play,
      href: '/platform/vsl-analytics-tests',
      color: 'text-rose-600 bg-rose-100 dark:bg-rose-900/30',
      badge: 'New',
    },
    {
      id: 'sentry-bridge',
      title: 'Sentry Bridge',
      description: 'Auto-create AI Dev Hub tickets from Sentry errors with triage and routing',
      icon: Bug,
      href: '/platform/sentry-bridge',
      color: 'text-red-600 bg-red-100 dark:bg-red-900/30',
      badge: 'New',
    },
    {
      id: 'agent-teams',
      title: 'Agent Teams',
      description: 'Configure multi-agent team roles and coordination',
      icon: Users,
      href: '/platform/agent-teams',
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
      badge: 'New',
    },
    {
      id: 'enrichment-demo',
      title: 'Enrichment Comparison',
      description: 'Compare enrichment providers side-by-side',
      icon: Search,
      href: '/platform/enrichment-demo',
      color: 'text-cyan-600 bg-cyan-100 dark:bg-cyan-900/30',
      badge: 'New',
    },
    {
      id: 'agent-research',
      title: 'Agent Research Demo',
      description: 'AI research agent with parallel web-grounded queries',
      icon: Globe,
      href: '/demo/agent-research',
      color: 'text-teal-600 bg-teal-100 dark:bg-teal-900/30',
      badge: 'New',
    },
  ],
  'Feature Development': [
    {
      id: 'calls',
      title: 'Calls (JustCall)',
      description: 'Call recordings and transcripts via JustCall integration — feature in development',
      icon: PhoneCall,
      href: '/calls',
      color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
      badge: 'In Dev',
    },
    {
      id: 'voice',
      title: 'Voice Recorder',
      description: 'Voice recording and transcription — feature in development',
      icon: Mic,
      href: '/voice',
      color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
      badge: 'In Dev',
    },
    {
      id: 'content-topics',
      title: 'Content Topics',
      description: 'AI-powered content topic extraction and trend analysis from meetings',
      icon: Layers,
      href: '/insights/content-topics',
      color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
      badge: 'In Dev',
    },
  ],
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default function PlatformDashboard() {
  const navigate = useNavigate();
  // Permission check is handled by route guard
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [customers, setCustomers] = useState<CustomerWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    // Load from localStorage, default all collapsed
    const saved = localStorage.getItem('platform-dashboard-sections');
    if (saved) {
      return JSON.parse(saved);
    }
    return Object.keys(platformSections).reduce((acc, key) => {
      acc[key] = false;
      return acc;
    }, {} as Record<string, boolean>);
  });

  useEffect(() => {
    loadData();
  }, []);

  const toggleSection = (sectionTitle: string) => {
    setExpandedSections(prev => {
      const updated = { ...prev, [sectionTitle]: !prev[sectionTitle] };
      localStorage.setItem('platform-dashboard-sections', JSON.stringify(updated));
      return updated;
    });
  };

  async function loadData() {
    setIsLoading(true);
    try {
      const [statsData, customersData] = await Promise.all([
        getAdminDashboardStats(),
        getCustomers(),
      ]);
      setStats(statsData);
      setCustomers(customersData);
    } catch (error) {
      console.error('Error loading platform data:', error);
      toast.error('Failed to load platform data');
    } finally {
      setIsLoading(false);
    }
  }

  const statCards = [
    {
      label: 'Total Customers',
      value: stats?.total_customers || 0,
      icon: Building2,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      label: 'Active Subscriptions',
      value: stats?.active_subscriptions || 0,
      icon: Users,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
    },
    {
      label: 'Monthly Recurring Revenue',
      value: formatCurrency(stats?.total_mrr || 0),
      icon: DollarSign,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      label: 'Annual Recurring Revenue',
      value: formatCurrency(stats?.total_arr || 0),
      icon: TrendingUp,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
    },
  ];

  // Filter sections and items based on search query
  const filteredSections = Object.entries(platformSections)
    .map(([sectionTitle, items]) => {
      if (!searchQuery) {
        return [sectionTitle, items] as const;
      }

      const filteredItems = items.filter(item =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase())
      );

      return [sectionTitle, filteredItems] as const;
    })
    .filter(([, items]) => items.length > 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-lg">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Platform Administration
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Manage customers, configuration, and system settings
              </p>
            </div>
            <Badge variant="outline" className="ml-4 bg-purple-500/10 text-purple-600 border-purple-500/30">
              <Shield className="w-3 h-3 mr-1" />
              Platform Admin
            </Badge>
          </div>
          <Button
            variant="outline"
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <Card className="border-gray-200 dark:border-gray-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                        {isLoading ? (
                          <span className="inline-block w-16 h-7 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" />
                        ) : (
                          stat.value
                        )}
                      </p>
                    </div>
                    <div className={cn('p-3 rounded-xl', stat.bgColor)}>
                      <stat.icon className={cn('w-5 h-5', stat.color)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Search Bar */}
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search admin features..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700/50 rounded-lg pl-10 pr-10 py-2.5 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Section Cards */}
        <div className="space-y-6">
          {filteredSections.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400">No features match your search.</p>
            </div>
          ) : (
            filteredSections.map(([sectionTitle, items], sectionIndex) => {
              const isExpanded = expandedSections[sectionTitle] ?? false;

              return (
                <motion.div
                  key={sectionTitle}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 + sectionIndex * 0.1 }}
                >
                  {/* Section Header - Clickable */}
                  <button
                    onClick={() => toggleSection(sectionTitle)}
                    className="w-full flex items-center justify-between mb-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
                  >
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white text-left">
                      {sectionTitle}
                    </h2>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {items.length} {items.length === 1 ? 'item' : 'items'}
                      </span>
                      <motion.div
                        initial={false}
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown className="w-5 h-5 text-gray-400 group-hover:text-indigo-600" />
                      </motion.div>
                    </div>
                  </button>

                  {/* Section Content - Collapsible */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden mb-6"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {items.map((item) => (
                            <motion.div
                              key={item.id}
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: 0.2 }}
                            >
                              <Card
                                className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-indigo-200 dark:hover:border-indigo-800 group"
                                onClick={() => navigate(item.href)}
                              >
                                <CardHeader className="pb-3">
                                  <div className="flex items-start justify-between">
                                    <div className={cn('p-3 rounded-xl', item.color)}>
                                      <item.icon className="w-5 h-5" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {item.badge && (
                                        <Badge variant="outline" className="text-xs">
                                          {item.badge}
                                        </Badge>
                                      )}
                                      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                                    </div>
                                  </div>
                                  <CardTitle className="text-base mt-3">{item.title}</CardTitle>
                                  <CardDescription className="text-sm">{item.description}</CardDescription>
                                </CardHeader>
                              </Card>
                            </motion.div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
        </div>

            {/* Recent Customers Preview */}
            {customers.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.5 }}
                className="mt-8"
              >
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Recent Customers</CardTitle>
                      <CardDescription>Latest organizations on the platform</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => navigate('/platform/customers')}>
                      View All
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {customers.slice(0, 5).map((customer) => (
                        <div
                          key={customer.id}
                          className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"
                        >
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{customer.name}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {customer.plan?.name || 'No plan'} • {customer.member_count} members
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {customer.subscription_status || 'Unknown'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
      </div>
    </div>
  );
}
