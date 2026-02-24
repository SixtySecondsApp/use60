/**
 * IntegrationRoadmap - Platform Admin Integration Roadmap
 *
 * Displays platform integration plans with:
 * - Grid of integration cards organized by category
 * - Upvote functionality to prioritize requests
 * - Dedicated detail page per integration (no modal)
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  ArrowLeftRight,
  ExternalLink,
  Clock,
  Zap,
  Shield,
  Key,
  Webhook,
  Users,
  Code2,
  CheckCircle2,
  AlertTriangle,
  Star,
  TrendingUp,
  ChevronUp,
  Layers,
  RefreshCw,
  Search,
  Link as LinkIcon,
} from 'lucide-react';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { useNavigate, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  integrationPlans,
  integrationStats,
  type IntegrationPlan,
  type AuthType,
  type Priority,
  type DataFlow,
  getIntegrationById,
} from '@/lib/data/integrationPlans';
import { useIntegrationLogo } from '@/lib/hooks/useIntegrationLogo';
import { useIntegrationUpvotes, type IntegrationVoteState } from '@/lib/hooks/useIntegrationUpvotes';

// Auth type display config
const authTypeConfig: Record<AuthType, { label: string; icon: React.ElementType; color: string }> = {
  oauth2: { label: 'OAuth 2.0', icon: Shield, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30' },
  api_key: { label: 'API Key', icon: Key, color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30' },
  webhook_only: { label: 'Webhooks Only', icon: Webhook, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30' },
  partner_api: { label: 'Partner API', icon: Users, color: 'text-rose-600 bg-rose-100 dark:bg-rose-900/30' },
};

// Priority display config
const priorityConfig: Record<Priority, { label: string; color: string; bgColor: string }> = {
  critical: { label: 'Critical', color: 'text-red-600', bgColor: 'bg-red-100 dark:bg-red-900/30' },
  high: { label: 'High', color: 'text-orange-600', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
  medium: { label: 'Medium', color: 'text-yellow-600', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' },
  low: { label: 'Low', color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900/30' },
};

// Data flow direction icons
function DataFlowIcon({ direction }: { direction: DataFlow['direction'] }) {
  switch (direction) {
    case 'inbound':
      return <ArrowLeft className="w-4 h-4 text-blue-500" />;
    case 'outbound':
      return <ArrowRight className="w-4 h-4 text-green-500" />;
    case 'bidirectional':
      return <ArrowLeftRight className="w-4 h-4 text-purple-500" />;
  }
}

// Integration logo component
function IntegrationLogo({ integration, size = 'md' }: { integration: IntegrationPlan; size?: 'sm' | 'md' | 'lg' }) {
  const { logoUrl, isLoading } = useIntegrationLogo(integration.logo || integration.id);
  
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  };

  if (isLoading) {
    return <div className={cn(sizeClasses[size], 'bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse')} />;
  }

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${integration.name} logo`}
        className={cn(sizeClasses[size], 'object-contain')}
      />
    );
  }

  // Fallback to first letter
  return (
    <div className={cn(sizeClasses[size], 'rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold', size === 'lg' ? 'text-xl' : 'text-lg')}>
      {integration.name.charAt(0)}
    </div>
  );
}

// Stars rating component
function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            'w-3.5 h-3.5',
            star <= rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600'
          )}
        />
      ))}
    </div>
  );
}

// Upvote button component
function UpvoteButton({
  vote,
  onToggle,
  size = 'md',
}: {
  vote: IntegrationVoteState;
  onToggle: () => void;
  size?: 'sm' | 'md';
}) {
  const sizeClasses = size === 'sm' 
    ? 'px-2 py-1 text-xs gap-1'
    : 'px-3 py-1.5 text-sm gap-1.5';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      disabled={vote.isLoading}
      className={cn(
        'inline-flex items-center rounded-lg border font-semibold transition-all',
        sizeClasses,
        vote.hasVoted
          ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
        vote.isLoading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
      )}
      title={vote.hasVoted ? 'Remove upvote' : 'Upvote to prioritize'}
    >
      <ChevronUp className={cn('transition-transform', vote.hasVoted && 'text-emerald-600', size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4')} />
      <span>{(vote.votesCount ?? 0).toLocaleString()}</span>
    </button>
  );
}

// Integration card for grid view
function IntegrationCard({
  integration,
  vote,
  onToggleVote,
  onSelect,
}: {
  integration: IntegrationPlan;
  vote: IntegrationVoteState;
  onToggleVote: () => void;
  onSelect: () => void;
}) {
  const priority = priorityConfig[integration.priority];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="group"
    >
      <Card
        className="h-full cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-indigo-200 dark:hover:border-indigo-800 relative"
        onClick={onSelect}
      >
        <CardContent className="p-4">
          {/* Header with logo, name, and upvote */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="shrink-0">
                <IntegrationLogo integration={integration} size="sm" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                  {integration.name}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {integration.category}
                </p>
              </div>
            </div>
            <UpvoteButton vote={vote} onToggle={onToggleVote} size="sm" />
          </div>

          {/* Use case */}
          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">
            {integration.useCase}
          </p>

          {/* Bottom row with badges */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', priority.color, priority.bgColor)}>
                {priority.label}
              </Badge>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-gray-500">
                {integration.estimatedDays}d
              </Badge>
            </div>
            <StarRating rating={integration.popularity} />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function IntegrationDetailPage({
  integration,
  vote,
  onToggleVote,
}: {
  integration: IntegrationPlan;
  vote: IntegrationVoteState;
  onToggleVote: () => void;
}) {
  const navigate = useNavigate();
  const auth = authTypeConfig[integration.authType];
  const priority = priorityConfig[integration.priority];

  const copyLink = async () => {
    try {
      const url = `${window.location.origin}/platform/integrations/roadmap/${integration.id}`;
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/platform/integrations/roadmap')}
            className="shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <IntegrationLogo integration={integration} size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{integration.name}</h1>
              <Badge variant="outline" className={cn('text-xs', priority.color, priority.bgColor)}>
                {priority.label}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {integration.category}
              </Badge>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Integration roadmap entry #{integration.priorityOrder}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={copyLink}>
            <LinkIcon className="w-3.5 h-3.5 mr-1.5" />
            Copy link
          </Button>
          <UpvoteButton vote={vote} onToggle={onToggleVote} />
          {integration.apiDocsUrl && (
            <Button asChild variant="outline" size="sm">
              <a href={integration.apiDocsUrl} target="_blank" rel="noopener noreferrer">
                API Docs
                <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
              </a>
            </Button>
          )}
        </div>
      </div>

      <Separator />

      {/* Use Case / Ideas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            Integration ideas
          </CardTitle>
          <CardDescription>What we can build and why it matters.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">
            {integration.useCase}
          </p>
          <ul className="space-y-1.5">
            {integration.useCaseDetails.map((detail, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                {detail}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* API Requirements + Data Flows */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Code2 className="w-4 h-4 text-blue-500" />
              API requirements
            </CardTitle>
            <CardDescription>Auth model, base URL, scopes, and limits.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center gap-2">
              <div className={cn('p-1.5 rounded-md', auth.color)}>
                <auth.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{auth.label}</p>
                <p className="text-xs text-gray-500">Auth method</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {integration.baseUrl && (
                <div>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Base URL</p>
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded block break-all">
                    {integration.baseUrl}
                  </code>
                </div>
              )}
              {integration.rateLimit && (
                <div>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Rate limit</p>
                  <p className="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 px-2 py-1 rounded">
                    {integration.rateLimit}
                  </p>
                </div>
              )}
            </div>

            {integration.scopes && integration.scopes.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Scopes</p>
                <div className="flex flex-wrap gap-1">
                  {integration.scopes.map((scope) => (
                    <Badge key={scope} variant="outline" className="text-[10px] font-mono">
                      {scope}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {integration.webhookEvents && integration.webhookEvents.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Webhook events</p>
                <div className="flex flex-wrap gap-1">
                  {integration.webhookEvents.map((evt) => (
                    <Badge key={evt} variant="outline" className="text-[10px] font-mono">
                      <Webhook className="w-3 h-3 mr-1" />
                      {evt}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-emerald-500" />
              Data flows
            </CardTitle>
            <CardDescription>How records map between Sixty and the integration.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {integration.dataFlows.map((flow, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 rounded-md bg-gray-50 dark:bg-gray-800/50 text-sm"
              >
                <span className="font-medium text-gray-900 dark:text-white flex-1 truncate">
                  {flow.sixtyEntity}
                </span>
                <DataFlowIcon direction={flow.direction} />
                <span className="text-gray-600 dark:text-gray-400 flex-1 truncate text-right">
                  {flow.externalEntity}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Plan / API surface */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-500" />
            Implementation plan (API surface)
          </CardTitle>
          <CardDescription>The endpoints/events we’ll use to ship a reliable v1.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {integration.apiEndpoints.map((ep, idx) => (
            <div
              key={`${ep.method}-${ep.endpoint}-${idx}`}
              className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/40"
            >
              <div className="shrink-0">
                <Badge variant="secondary" className="text-[10px] font-mono">
                  {ep.method}
                </Badge>
              </div>
              <code className="text-xs font-mono text-gray-900 dark:text-gray-100 break-all flex-1">
                {ep.endpoint}
              </code>
              <p className="text-xs text-gray-600 dark:text-gray-400 sm:text-right sm:max-w-[45%]">
                {ep.purpose}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Effort & Impact */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-purple-500" />
            Effort & impact
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
              <p className="text-xl font-bold text-gray-900 dark:text-white">{integration.estimatedDays}</p>
              <p className="text-xs text-gray-500">Days</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
              <p
                className={cn('text-xl font-bold capitalize', {
                  'text-emerald-600': integration.impactScore === 'high',
                  'text-amber-600': integration.impactScore === 'medium',
                  'text-gray-600': integration.impactScore === 'low',
                })}
              >
                {integration.impactScore}
              </p>
              <p className="text-xs text-gray-500">Impact</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
              <p
                className={cn('text-xl font-bold capitalize', {
                  'text-red-600': integration.complexity === 'high',
                  'text-amber-600': integration.complexity === 'medium',
                  'text-emerald-600': integration.complexity === 'low',
                })}
              >
                {integration.complexity}
              </p>
              <p className="text-xs text-gray-500">Complexity</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
              <div className="flex justify-center mb-0.5">
                <StarRating rating={integration.popularity} />
              </div>
              <p className="text-xs text-gray-500">Popularity</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* What's Possible / Limitations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-emerald-200 dark:border-emerald-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              What's possible
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 dark:text-gray-300">{integration.whatsPossible}</p>
          </CardContent>
        </Card>

        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              Limitations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 dark:text-gray-300">{integration.limitations}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Props interface
interface IntegrationRoadmapProps {
  /** When true, removes outer wrapper and header for embedding in parent pages */
  embedded?: boolean;
}

// Main component
export default function IntegrationRoadmap({ embedded = false }: IntegrationRoadmapProps) {
  const navigate = useNavigate();
  const { integrationId } = useParams<{ integrationId?: string }>();
  const [query, setQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const { getVoteState, toggleUpvote, userId } = useIntegrationUpvotes(integrationPlans.map((p) => p.id));
  const selectedFromRoute = useMemo(() => {
    if (!integrationId) return null;
    return getIntegrationById(integrationId) ?? null;
  }, [integrationId]);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(integrationPlans.map((p) => p.category))).sort((a, b) => a.localeCompare(b));
    return unique;
  }, []);

  const filteredIntegrations = useMemo(() => {
    const q = query.trim().toLowerCase();
    return integrationPlans.filter((p) => {
      if (priorityFilter !== 'all' && p.priority !== priorityFilter) return false;
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.useCase.toLowerCase().includes(q)
      );
    });
  }, [query, priorityFilter, categoryFilter]);

  // Group by category for display
  const groupedByCategory = useMemo(() => {
    const groups: Record<string, IntegrationPlan[]> = {};
    filteredIntegrations.forEach((p) => {
      (groups[p.category] ??= []).push(p);
    });
    // Sort categories by number of integrations (descending)
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [filteredIntegrations]);

  const handleToggleVote = (integration: IntegrationPlan) => {
    if (!userId) {
      toast.error('Please sign in to upvote integrations');
      return;
    }
    toggleUpvote({
      integrationId: integration.id,
      integrationName: integration.name,
      description: integration.useCase,
    }).catch((err: any) => {
      toast.error(err?.message || 'Failed to upvote');
    });
  };

  // If we’re on /roadmap/:integrationId, render the dedicated detail page.
  if (integrationId) {
    if (!selectedFromRoute) {
      const notFound = (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/platform/integrations/roadmap')}
              className="shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Integration not found</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No roadmap entry exists for <code className="font-mono">{integrationId}</code>.
              </p>
            </div>
          </div>
          <Card>
            <CardContent className="p-4 text-sm text-gray-600 dark:text-gray-400">
              Tip: the link is usually the integration ID (e.g. <code className="font-mono">slack</code>,{' '}
              <code className="font-mono">hubspot</code>, <code className="font-mono">calendly</code>).
            </CardContent>
          </Card>
        </div>
      );

      if (embedded) return <div className="space-y-6">{notFound}</div>;
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{notFound}</div>
        </div>
      );
    }

    const vote = getVoteState(selectedFromRoute.id);
    const detail = (
      <IntegrationDetailPage
        integration={selectedFromRoute}
        vote={vote}
        onToggleVote={() => handleToggleVote(selectedFromRoute)}
      />
    );

    if (embedded) return <div className="space-y-6">{detail}</div>;
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{detail}</div>
      </div>
    );
  }

  const content = (
    <>
      {/* Header */}
      {!embedded && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/platform')}
              className="mr-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg">
              <Layers className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Integration Roadmap
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Vote for the integrations you need most
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{integrationStats.total}</p>
            </div>
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <Layers className="w-4 h-4 text-indigo-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Critical</p>
              <p className="text-xl font-bold text-red-600">{integrationStats.critical}</p>
            </div>
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
              <Zap className="w-4 h-4 text-red-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">High</p>
              <p className="text-xl font-bold text-orange-600">{integrationStats.high}</p>
            </div>
            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <TrendingUp className="w-4 h-4 text-orange-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Est. Days</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{integrationStats.totalDays}</p>
            </div>
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Clock className="w-4 h-4 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search integrations..."
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as any)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(query || priorityFilter !== 'all' || categoryFilter !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQuery('');
                    setPriorityFilter('all');
                    setCategoryFilter('all');
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Showing {filteredIntegrations.length} of {integrationPlans.length} integrations
          </p>
        </CardContent>
      </Card>

      {/* Integration Grid by Category */}
      <div className="space-y-8">
        {groupedByCategory.map(([category, integrations]) => (
          <div key={category}>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{category}</h2>
              <Badge variant="secondary" className="text-xs">
                {integrations.length}
              </Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {integrations.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  vote={getVoteState(integration.id)}
                  onToggleVote={() => handleToggleVote(integration)}
                  onSelect={() => navigate(`/platform/integrations/roadmap/${integration.id}`)}
                />
              ))}
            </div>
          </div>
        ))}

        {filteredIntegrations.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">No integrations match your filters</p>
            <Button
              variant="link"
              onClick={() => {
                setQuery('');
                setPriorityFilter('all');
                setCategoryFilter('all');
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </div>
    </>
  );

  if (embedded) {
    return <div className="space-y-6">{content}</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <BackToPlatform />
        {content}
      </div>
    </div>
  );
}
