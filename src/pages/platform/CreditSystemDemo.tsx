/**
 * CreditSystemDemo — Interactive showcase of the AI Credit Control System.
 *
 * Route: /platform/credit-system-demo
 * Access: PlatformAdminRouteGuard
 *
 * Demonstrates all credit system components with live data + mock previews.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  Wallet,
  Brain,
  AlertTriangle,
  Shield,
  BarChart3,
  ArrowRight,
  Settings,
  Zap,
  Eye,
  Code2,
  Database,
  Server,
  Layout,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// Live credit components
import { CreditWidget } from '@/components/credits/CreditWidget';
import { CreditGate } from '@/components/credits/CreditGate';
import { LowBalanceBanner } from '@/components/credits/LowBalanceBanner';
import { UsageChart } from '@/components/credits/UsageChart';
import { TransactionLog } from '@/components/credits/TransactionLog';
import { ModelConfigPanel } from '@/components/credits/ModelConfigPanel';
import { SimpleModelTierSelector } from '@/components/credits/SimpleModelTierSelector';
import CreditPurchaseModal from '@/components/credits/CreditPurchaseModal';
import { useCreditBalance } from '@/lib/hooks/useCreditBalance';
import { useRequireCredits } from '@/lib/hooks/useRequireCredits';

// ============================================================================
// Architecture map
// ============================================================================

interface ArchNode {
  label: string;
  description: string;
  file: string;
  type: 'migration' | 'edge-function' | 'service' | 'hook' | 'component' | 'page';
}

const ARCHITECTURE: Record<string, ArchNode[]> = {
  'Database Layer': [
    { label: 'org_credit_balance', description: 'Per-org balance with auto-topup settings', file: 'supabase/migrations/20260210200001_credit_balance_tables.sql', type: 'migration' },
    { label: 'credit_transactions', description: 'Immutable ledger of all credit movements', file: 'supabase/migrations/20260210200001_credit_balance_tables.sql', type: 'migration' },
    { label: 'deduct_credits()', description: 'Atomic PL/pgSQL with FOR UPDATE row lock', file: 'supabase/migrations/20260210200001_credit_balance_tables.sql', type: 'migration' },
    { label: 'planner_model_id', description: 'Added to ai_feature_config + org_ai_config', file: 'supabase/migrations/20260210200002_planner_model_support.sql', type: 'migration' },
  ],
  'Edge Functions': [
    { label: 'get-credit-balance', description: 'Returns balance, burn rate, projected days, usage breakdown', file: 'supabase/functions/get-credit-balance/index.ts', type: 'edge-function' },
    { label: 'create-credit-checkout', description: 'Stripe one-time payment for credit packs', file: 'supabase/functions/create-credit-checkout/index.ts', type: 'edge-function' },
    { label: 'stripe-webhook', description: 'Extended for credit_purchase fulfillment', file: 'supabase/functions/stripe-webhook/index.ts', type: 'edge-function' },
    { label: 'costTracking.ts', description: 'checkCreditBalance() + deduction after cost logging', file: 'supabase/functions/_shared/costTracking.ts', type: 'edge-function' },
    { label: 'credit-auto-topup', description: 'Scheduled balance check for auto-replenishment', file: 'supabase/functions/credit-auto-topup/index.ts', type: 'edge-function' },
  ],
  'Service Layer': [
    { label: 'creditService.ts', description: 'getBalance, getTransactions, purchaseCredits, getUsageBreakdown', file: 'src/lib/services/creditService.ts', type: 'service' },
    { label: 'useCreditBalance', description: 'React Query hook with 30s polling', file: 'src/lib/hooks/useCreditBalance.ts', type: 'hook' },
    { label: 'useRequireCredits', description: 'Returns hasCredits, isLoading, showTopUpPrompt', file: 'src/lib/hooks/useRequireCredits.ts', type: 'hook' },
  ],
  'UI Components': [
    { label: 'CreditWidget', description: 'Header bar balance indicator with dropdown', file: 'src/components/credits/CreditWidget.tsx', type: 'component' },
    { label: 'CreditWidgetDropdown', description: 'Rich dropdown: balance, burn rate, usage, transactions', file: 'src/components/credits/CreditWidgetDropdown.tsx', type: 'component' },
    { label: 'CreditPurchaseModal', description: 'Stripe checkout with pack selection + custom amount', file: 'src/components/credits/CreditPurchaseModal.tsx', type: 'component' },
    { label: 'CreditGate', description: 'Blocks children when credits are zero', file: 'src/components/credits/CreditGate.tsx', type: 'component' },
    { label: 'LowBalanceBanner', description: 'Dismissible warning banner (red/amber)', file: 'src/components/credits/LowBalanceBanner.tsx', type: 'component' },
    { label: 'UsageChart', description: '30-day Recharts area chart', file: 'src/components/credits/UsageChart.tsx', type: 'component' },
    { label: 'TransactionLog', description: 'Paginated, filterable transaction table', file: 'src/components/credits/TransactionLog.tsx', type: 'component' },
    { label: 'ModelConfigPanel', description: 'Per-feature planner/driver model selector with presets', file: 'src/components/credits/ModelConfigPanel.tsx', type: 'component' },
    { label: 'FeatureModelRow', description: 'Individual feature config with cost tier badges', file: 'src/components/credits/FeatureModelRow.tsx', type: 'component' },
  ],
  'Pages': [
    { label: 'CreditsSettingsPage', description: 'Settings > Credits & AI (6 sections)', file: 'src/pages/settings/CreditsSettingsPage.tsx', type: 'page' },
    { label: 'CreditPurchaseSuccess', description: 'Post-Stripe success with auto-redirect', file: 'src/pages/settings/CreditPurchaseSuccess.tsx', type: 'page' },
  ],
};

const TYPE_COLORS: Record<string, string> = {
  migration: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'edge-function': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  service: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  hook: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  component: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  page: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
};

const TYPE_ICONS: Record<string, typeof Database> = {
  migration: Database,
  'edge-function': Server,
  service: Code2,
  hook: Zap,
  component: Layout,
  page: Eye,
};

// ============================================================================
// Collapsible section
// ============================================================================

function CollapsibleSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-5 py-3 text-left bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</span>
      </button>
      {open && <div className="p-5 border-t border-gray-200 dark:border-gray-800">{children}</div>}
    </div>
  );
}

// ============================================================================
// Main demo page
// ============================================================================

export default function CreditSystemDemo() {
  const navigate = useNavigate();
  const { data: balance, isLoading } = useCreditBalance();
  const { hasCredits } = useRequireCredits();
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [expandedArch, setExpandedArch] = useState<Set<string>>(new Set(['UI Components']));

  const toggleArch = (key: string) => {
    setExpandedArch((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="container mx-auto px-6 py-6 space-y-8 max-w-6xl">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/platform')}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-4 flex items-center gap-1"
        >
          <ArrowRight className="w-3 h-3 rotate-180" />
          Back to Platform Admin
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <CreditCard className="w-7 h-7 text-[#37bd7e]" />
              AI Credit Control System
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
              Prepay credit top-up system for all AI usage. Org-configurable planner/driver models per feature.
              Credits visible in header, hard block at zero, Stripe self-serve purchase.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/settings/credits')}>
              <Settings className="w-3.5 h-3.5 mr-1.5" />
              Live Settings Page
            </Button>
          </div>
        </div>
      </div>

      {/* Live status card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#37bd7e]" />
            Live Status
          </CardTitle>
          <CardDescription>Current org credit state from the useCreditBalance hook (30s polling)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-lg border p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">Balance</p>
              <p className={cn('text-xl font-bold tabular-nums', balance && balance.balance <= 0 ? 'text-red-500' : 'text-gray-900 dark:text-white')}>
                {isLoading ? '...' : `$${balance?.balance.toFixed(2) ?? '0.00'}`}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">Burn Rate</p>
              <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">
                {isLoading ? '...' : `$${balance?.dailyBurnRate.toFixed(2) ?? '0.00'}/d`}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">Projected Days</p>
              <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">
                {isLoading ? '...' : (balance?.projectedDaysRemaining ?? 0) < 0 ? 'No usage' : `${Math.round(balance?.projectedDaysRemaining ?? 0)}d`}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">Has Credits</p>
              <p className="text-xl font-bold">
                {hasCredits
                  ? <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0">Yes</Badge>
                  : <Badge variant="destructive">No</Badge>
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Component demos */}
      <Tabs defaultValue="components" className="space-y-4">
        <TabsList>
          <TabsTrigger value="components">
            <Layout className="w-3.5 h-3.5 mr-1.5" />
            Components
          </TabsTrigger>
          <TabsTrigger value="architecture">
            <Code2 className="w-3.5 h-3.5 mr-1.5" />
            Architecture
          </TabsTrigger>
          <TabsTrigger value="flows">
            <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
            User Flows
          </TabsTrigger>
        </TabsList>

        {/* ================================================================
            Tab 1: Live Component Previews
        ================================================================ */}
        <TabsContent value="components" className="space-y-6">
          {/* Credit Widget */}
          <CollapsibleSection title="CreditWidget (Header Bar)" defaultOpen>
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Lives in AppLayout.tsx top bar. Color-coded: green (&gt;14d), amber (7-14d), red (&lt;7d), pulsing red (0 balance).
                Click to open dropdown with balance details, usage bars, recent transactions, and CTAs.
              </p>
              <div className="flex items-center gap-4 p-4 bg-gray-900 rounded-lg">
                <span className="text-xs text-gray-400 mr-2">Preview:</span>
                <CreditWidget />
              </div>
              <p className="text-[10px] text-gray-400">
                File: <code>src/components/credits/CreditWidget.tsx</code> + <code>CreditWidgetDropdown.tsx</code>
              </p>
            </div>
          </CollapsibleSection>

          {/* Low Balance Banner */}
          <CollapsibleSection title="LowBalanceBanner" defaultOpen>
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Rendered in AppLayout below the trial/integration banners. Shows when balance &lt; $5 or projected days &lt; 7.
                Red when depleted, amber when low. Dismissible per session.
              </p>
              <div className="rounded-lg overflow-hidden border">
                <LowBalanceBanner />
                {balance && balance.balance > 5 && balance.projectedDaysRemaining > 7 && (
                  <div className="p-4 text-xs text-gray-500 text-center">
                    Banner hidden (balance is healthy). It would show here when credits are low.
                  </div>
                )}
              </div>
              <p className="text-[10px] text-gray-400">
                File: <code>src/components/credits/LowBalanceBanner.tsx</code>
              </p>
            </div>
          </CollapsibleSection>

          {/* Credit Gate */}
          <CollapsibleSection title="CreditGate (Hard Block)">
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Wraps AI-powered features. Renders children when credits &gt; 0, shows a block screen at zero balance.
                Admins see a "Top Up" button; non-admins see "Contact your admin".
              </p>
              <div className="rounded-lg border overflow-hidden">
                <CreditGate>
                  <div className="p-6 text-center text-sm text-gray-600 dark:text-gray-400">
                    This content is gated by CreditGate. If balance is zero, you'll see the block screen instead.
                  </div>
                </CreditGate>
              </div>
              <p className="text-[10px] text-gray-400">
                File: <code>src/components/credits/CreditGate.tsx</code> + <code>src/lib/hooks/useRequireCredits.ts</code>
              </p>
            </div>
          </CollapsibleSection>

          {/* Purchase Modal */}
          <CollapsibleSection title="CreditPurchaseModal">
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Dialog with $10/$25/$50/$100/$250 packs + custom amount ($5-$1000). Creates a Stripe checkout session
                via <code>create-credit-checkout</code> edge function. Redirects to Stripe, then to <code>/settings/credits/success</code>.
              </p>
              <Button variant="outline" size="sm" onClick={() => setPurchaseModalOpen(true)}>
                <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                Open Purchase Modal
              </Button>
              <p className="text-[10px] text-gray-400">
                File: <code>src/components/credits/CreditPurchaseModal.tsx</code>
              </p>
            </div>
          </CollapsibleSection>

          {/* Usage Chart */}
          <CollapsibleSection title="UsageChart (30-day Spend Trend)">
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Recharts area chart showing daily AI spend over last 30 days. Data from <code>ai_cost_events</code> table,
                aggregated client-side. Pre-fills empty days so there are no gaps.
              </p>
              <div className="rounded-lg border p-4">
                <UsageChart days={30} />
              </div>
              <p className="text-[10px] text-gray-400">
                File: <code>src/components/credits/UsageChart.tsx</code>
              </p>
            </div>
          </CollapsibleSection>

          {/* Transaction Log */}
          <CollapsibleSection title="TransactionLog">
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Paginated table with type filter (All/Purchase/Deduction/Refund/Adjustment/Bonus).
                Data from <code>credit_transactions</code> table via <code>creditService.getTransactions()</code>.
              </p>
              <div className="rounded-lg border p-4">
                <TransactionLog />
              </div>
              <p className="text-[10px] text-gray-400">
                File: <code>src/components/credits/TransactionLog.tsx</code>
              </p>
            </div>
          </CollapsibleSection>

          {/* Simple Tier Selector (User-facing) */}
          <CollapsibleSection title="SimpleModelTierSelector (User-Facing)">
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Simplified Low/Medium/High intelligence tier selector per category.
                This is what end users see in Settings &gt; Credits &amp; AI.
              </p>
              <SimpleModelTierSelector />
              <p className="text-[10px] text-gray-400">
                File: <code>src/components/credits/SimpleModelTierSelector.tsx</code>
              </p>
            </div>
          </CollapsibleSection>

          {/* Granular Model Config (Platform Admin) */}
          <CollapsibleSection title="ModelConfigPanel (Platform Admin)">
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Granular per-feature model selector for planner (reasoning/routing) and driver (execution) models.
                Quick presets: Economy, Balanced, Maximum Intelligence. Lives at{' '}
                <code>/platform/ai/models</code> for platform admins.
              </p>
              <ModelConfigPanel />
              <p className="text-[10px] text-gray-400">
                File: <code>src/components/credits/ModelConfigPanel.tsx</code> + <code>FeatureModelRow.tsx</code>
              </p>
            </div>
          </CollapsibleSection>
        </TabsContent>

        {/* ================================================================
            Tab 2: Architecture Map
        ================================================================ */}
        <TabsContent value="architecture" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">File Map</CardTitle>
              <CardDescription>All files created or modified for the credit system (34 files, +4,623 lines)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(ARCHITECTURE).map(([section, nodes]) => {
                const isExpanded = expandedArch.has(section);
                return (
                  <div key={section} className="border rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleArch(section)}
                      className="flex items-center justify-between w-full px-4 py-2.5 text-left bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800/50"
                    >
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        {section}
                      </span>
                      <Badge variant="outline" className="text-[10px]">{nodes.length}</Badge>
                    </button>
                    {isExpanded && (
                      <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {nodes.map((node) => {
                          const Icon = TYPE_ICONS[node.type] ?? Code2;
                          return (
                            <div key={node.label} className="flex items-start gap-3 px-4 py-3">
                              <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{node.label}</span>
                                  <Badge className={cn('text-[9px] px-1.5 py-0 border-0', TYPE_COLORS[node.type])}>
                                    {node.type}
                                  </Badge>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{node.description}</p>
                                <code className="text-[10px] text-gray-400 dark:text-gray-500">{node.file}</code>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================
            Tab 3: User Flows
        ================================================================ */}
        <TabsContent value="flows" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Purchase flow */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-blue-500" />
                  Purchase Credits
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">1</Badge> User clicks "Top Up" in widget dropdown or settings page</li>
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">2</Badge> CreditPurchaseModal opens with pack selection</li>
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">3</Badge> <code>create-credit-checkout</code> creates Stripe session</li>
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">4</Badge> User completes payment on Stripe</li>
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">5</Badge> <code>stripe-webhook</code> calls <code>add_credits()</code> RPC</li>
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">6</Badge> CreditPurchaseSuccess page, balance updates via polling</li>
                </ol>
              </CardContent>
            </Card>

            {/* Deduction flow */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-500" />
                  Credit Deduction
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">1</Badge> User triggers AI feature (copilot, enrichment, etc.)</li>
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">2</Badge> Edge function calls <code>checkCreditBalance()</code></li>
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">3</Badge> If no credits: returns 402 Payment Required</li>
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">4</Badge> AI call executes, tokens consumed</li>
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">5</Badge> <code>logAICostEvent()</code> records cost + calls <code>deduct_credits()</code></li>
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">6</Badge> Atomic deduction with <code>FOR UPDATE</code> row lock</li>
                </ol>
              </CardContent>
            </Card>

            {/* Model selection flow */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-500" />
                  Planner/Driver Model Selection
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">1</Badge> Admin configures models in Settings &gt; Credits &gt; AI Model Config</li>
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">2</Badge> Saves to <code>org_ai_config</code> (overrides platform defaults)</li>
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">3</Badge> Edge function calls <code>get_model_for_feature(org, feature, 'planner')</code></li>
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">4</Badge> Returns org override or platform default model</li>
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">5</Badge> Planner model handles reasoning/routing</li>
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">6</Badge> Driver model handles execution/generation</li>
                </ol>
              </CardContent>
            </Card>

            {/* Zero balance flow */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  Zero Balance Hard Block
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">1</Badge> Balance reaches $0.00</li>
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">2</Badge> CreditWidget turns red + pulsing</li>
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">3</Badge> LowBalanceBanner shows "AI credits depleted"</li>
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">4</Badge> CreditGate blocks AI feature UI</li>
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">5</Badge> Edge functions return 402 at gateway</li>
                  <li className="flex gap-2"><Badge variant="outline" className="text-[9px] w-5 h-5 p-0 flex items-center justify-center shrink-0">6</Badge> Backward compat: orgs without balance row are ALLOWED</li>
                </ol>
              </CardContent>
            </Card>
          </div>

          {/* Quick links */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                Quick Navigation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate('/settings/credits')}>
                  Settings &gt; Credits Page
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPurchaseModalOpen(true)}>
                  Purchase Modal
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate('/copilot')}>
                  Test Copilot (Credit Gate)
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate('/settings')}>
                  Settings Hub
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Purchase modal */}
      <CreditPurchaseModal
        open={purchaseModalOpen}
        onOpenChange={setPurchaseModalOpen}
      />
    </div>
  );
}
