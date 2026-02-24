/**
 * SaaS Admin Dashboard
 *
 * Central dashboard for managing external customers, subscriptions, plans, and usage.
 * Only accessible to super admins (internal users with is_admin flag).
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  BarChart3,
  Settings2,
  TrendingUp,
  Building2,
  Zap,
  DollarSign,
  AlertCircle,
  ChevronRight,
  Search,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getAdminDashboardStats,
  getCustomers,
  getSubscriptionPlans,
  deleteOrganization,
} from '@/lib/services/saasAdminService';
import type {
  AdminDashboardStats,
  CustomerWithDetails,
  SubscriptionPlan,
} from '@/lib/types/saasAdmin';
import { CustomerList } from '@/components/saas-admin/CustomerList';
import { UsageOverview } from '@/components/saas-admin/UsageOverview';
import { FeatureFlagsManager } from '@/components/saas-admin/FeatureFlagsManager';
import { toast } from 'sonner';

type TabId = 'overview' | 'customers' | 'usage' | 'features';

interface Tab {
  id: TabId;
  label: string;
  icon: typeof Users;
  description: string;
}

const tabs: Tab[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: BarChart3,
    description: 'Dashboard metrics and KPIs',
  },
  {
    id: 'customers',
    label: 'Customers',
    icon: Building2,
    description: 'Manage organizations and subscriptions',
  },
  {
    id: 'usage',
    label: 'Usage',
    icon: Zap,
    description: 'Track resource consumption',
  },
  {
    id: 'features',
    label: 'Features',
    icon: Settings2,
    description: 'Manage feature flags',
  },
];

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function SaasAdminDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [customers, setCustomers] = useState<CustomerWithDetails[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [statsData, customersData, plansData] = await Promise.all([
        getAdminDashboardStats(),
        getCustomers(),
        getSubscriptionPlans(),
      ]);
      setStats(statsData);
      setCustomers(customersData);
      setPlans(plansData);
    } catch (error) {
      console.error('Error loading SaaS admin data:', error);
      toast.error('Failed to load admin data');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDeleteOrganization(orgId: string) {
    try {
      const result = await deleteOrganization(orgId);
      toast.success(`Organization deleted successfully. ${result.affectedUsers} user${result.affectedUsers !== 1 ? 's' : ''} unassigned.`);
      await loadData();
    } catch (error: any) {
      toast.error('Failed to delete organization: ' + (error.message || 'Unknown error'));
      throw error; // Re-throw so CustomerList dialog knows it failed
    }
  }

  // Filter customers by search query
  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                SaaS Admin
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Manage customers, subscriptions, and platform configuration
              </p>
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

          {/* Tabs */}
          <div className="mt-6 flex gap-1 overflow-x-auto pb-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                  activeTab === tab.id
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <OverviewTab stats={stats} customers={customers} plans={plans} isLoading={isLoading} />
            </motion.div>
          )}

          {activeTab === 'customers' && (
            <motion.div
              key="customers"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-6 flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search customers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button variant="outline" className="flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  Filters
                </Button>
              </div>
              <CustomerList
                customers={filteredCustomers}
                plans={plans}
                isLoading={isLoading}
                onRefresh={loadData}
                onDelete={handleDeleteOrganization}
              />
            </motion.div>
          )}

          {activeTab === 'usage' && (
            <motion.div
              key="usage"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <UsageOverview customers={customers} isLoading={isLoading} />
            </motion.div>
          )}

          {activeTab === 'features' && (
            <motion.div
              key="features"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <FeatureFlagsManager customers={customers} onRefresh={loadData} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================================
// Overview Tab Component
// ============================================================================

interface OverviewTabProps {
  stats: AdminDashboardStats | null;
  customers: CustomerWithDetails[];
  plans: SubscriptionPlan[];
  isLoading: boolean;
}

function OverviewTab({ stats, customers, plans, isLoading }: OverviewTabProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-900 rounded-xl p-6 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/2 mb-4" />
            <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-3/4" />
          </div>
        ))}
      </div>
    );
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

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800"
          >
            <div className="flex items-center justify-between">
              <div className={cn('p-2 rounded-lg', stat.bgColor)}>
                <stat.icon className={cn('w-5 h-5', stat.color)} />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {stat.value}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Customers by Plan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Customers by Plan
          </h3>
          <div className="space-y-3">
            {plans.map((plan) => {
              const count = stats?.customers_by_plan[plan.slug] || 0;
              const percentage =
                stats?.total_customers ? Math.round((count / stats.total_customers) * 100) : 0;
              return (
                <div key={plan.id} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {plan.name}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {count} ({percentage}%)
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Customers */}
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Recent Customers
          </h3>
          <div className="space-y-3">
            {customers.slice(0, 5).map((customer) => (
              <div
                key={customer.id}
                className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{customer.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {customer.plan?.name || 'No plan'} • {customer.member_count} members
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>
            ))}
            {customers.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No customers yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SaasAdminDashboard;
