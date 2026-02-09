import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Calendar,
  Video,
  Users,
  Phone,
  CheckSquare,
  Zap,
  Mail,
  Database,
  FileSignature,
  CreditCard,
  Bot,
  Sparkles,
  Info,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { HelpPanel } from '@/components/docs/HelpPanel';
import { motion } from 'framer-motion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Integration components
import { IntegrationCard, IntegrationStatus } from '@/components/integrations/IntegrationCard';
import { ConnectModal, Permission } from '@/components/integrations/ConnectModal';
import { GoogleConfigModal } from '@/components/integrations/GoogleConfigModal';
import { FathomConfigModal } from '@/components/integrations/FathomConfigModal';
import { SavvyCalConfigModal } from '@/components/integrations/SavvyCalConfigModal';
import { SlackConfigModal } from '@/components/integrations/SlackConfigModal';
import { JustCallConfigModal } from '@/components/integrations/JustCallConfigModal';
import { HubSpotConfigModal } from '@/components/integrations/HubSpotConfigModal';
import { NotetakerConfigModal } from '@/components/integrations/NotetakerConfigModal';
import { FirefliesConfigModal } from '@/components/integrations/FirefliesConfigModal';
import { ApolloConfigModal } from '@/components/integrations/ApolloConfigModal';
import { AiArkConfigModal } from '@/components/integrations/AiArkConfigModal';
import { InstantlyConfigModal } from '@/components/integrations/InstantlyConfigModal';

// Hooks and stores
import { useGoogleIntegration } from '@/lib/stores/integrationStore';
import { useFathomIntegration } from '@/lib/hooks/useFathomIntegration';
import { useSlackIntegration } from '@/lib/hooks/useSlackIntegration';
import { useJustCallIntegration } from '@/lib/hooks/useJustCallIntegration';
import { useSavvyCalIntegration } from '@/lib/hooks/useSavvyCalIntegration';
import { useHubSpotIntegration } from '@/lib/hooks/useHubSpotIntegration';
import { useNotetakerIntegration } from '@/lib/hooks/useNotetakerIntegration';
import { useFirefliesIntegration } from '@/lib/hooks/useFirefliesIntegration';
import { useApolloIntegration } from '@/lib/hooks/useApolloIntegration';
import { useAiArkIntegration } from '@/lib/hooks/useAiArkIntegration';
import { useInstantlyIntegration } from '@/lib/hooks/useInstantlyIntegration';
import { getIntegrationDomain, getLogoS3Url, useIntegrationLogo } from '@/lib/hooks/useIntegrationLogo';
import { useUser } from '@/lib/hooks/useUser';
import { IntegrationVoteState, useIntegrationUpvotes } from '@/lib/hooks/useIntegrationUpvotes';
import { useBrandingSettings } from '@/lib/hooks/useBrandingSettings';
import { DEFAULT_SIXTY_ICON_URL } from '@/lib/utils/sixtyBranding';
import { isHubSpotIntegrationEnabled } from '@/lib/utils/featureFlags';

// Integration definitions
interface IntegrationConfig {
  id: string;
  name: string;
  description: string;
  permissions?: Permission[];
  brandColor?: string;
  iconBgColor?: string;
  iconBorderColor?: string;
  fallbackIcon: React.ReactNode;
  isBuilt?: boolean;
}

// Category definitions
interface IntegrationCategory {
  id: string;
  name: string;
  description: string;
  tooltip?: string; // Explains how this category integrates with Sixty
  icon: React.ReactNode;
  integrations: IntegrationConfig[];
}

function IntegrationCardWithLogo({
  config,
  isBuilt,
  status,
  onAction,
  actionLoading,
  vote,
  onToggleUpvote,
  sixtyLogoUrl,
}: {
  config: IntegrationConfig;
  isBuilt: boolean;
  status: IntegrationStatus;
  onAction?: () => void;
  actionLoading?: boolean;
  vote?: IntegrationVoteState | null;
  onToggleUpvote?: (args: { integrationId: string; integrationName: string; description?: string }) => Promise<void>;
  sixtyLogoUrl?: string | null;
}) {
  // Skip S3 fetch for 60-notetaker since it's our own product
  const is60Notetaker = config.id === '60-notetaker';
  // Only warm the S3 cache for "built" integrations to avoid a request storm on the huge "coming soon" list.
  const { logoUrl } = useIntegrationLogo(config.id, { enableFetch: isBuilt && !is60Notetaker });

  // Use DEFAULT_SIXTY_ICON_URL directly for 60 Notetaker
  const finalLogoUrl = is60Notetaker ? DEFAULT_SIXTY_ICON_URL : logoUrl;

  return (
    <IntegrationCard
      name={config.name}
      description={config.description}
      logoUrl={finalLogoUrl}
      fallbackIcon={config.fallbackIcon}
      status={status}
      onAction={onAction}
      actionLoading={actionLoading}
      iconBgColor={config.iconBgColor}
      iconBorderColor={config.iconBorderColor}
      sixtyLogoUrl={sixtyLogoUrl}
      footer={
        !isBuilt && vote && onToggleUpvote ? (
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500 dark:text-gray-400">Vote to prioritize</div>
            <button
              type="button"
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                  await onToggleUpvote({
                    integrationId: config.id,
                    integrationName: config.name,
                    description: config.description,
                  });
                } catch (err: any) {
                  toast.error(err?.message || 'Failed to upvote');
                }
              }}
              disabled={vote?.isLoading}
              className={[
                'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors',
                vote?.hasVoted
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700',
                vote?.isLoading ? 'opacity-60 cursor-not-allowed' : '',
              ].join(' ')}
              aria-label={`${vote?.hasVoted ? 'Remove upvote' : 'Upvote'} ${config.name} integration`}
            >
              <ChevronUp className="w-4 h-4" />
              <span>{(vote?.votesCount ?? 0).toLocaleString()}</span>
            </button>
          </div>
        ) : undefined
      }
    />
  );
}

function CategorySection({
  category,
  isBuilt,
  getIntegrationStatus,
  onBuiltAction,
  builtActionLoadingById,
  getVoteState,
  toggleUpvote,
  sixtyLogoUrl,
}: {
  category: IntegrationCategory;
  isBuilt: boolean;
  getIntegrationStatus: (integrationId: string) => IntegrationStatus;
  onBuiltAction: (integrationId: string) => void;
  builtActionLoadingById: Record<string, boolean>;
  getVoteState: (integrationId: string) => IntegrationVoteState;
  toggleUpvote: (args: { integrationId: string; integrationName: string; description?: string }) => Promise<void>;
  sixtyLogoUrl?: string | null;
}) {
  const [isExpanded, setIsExpanded] = useState(() => {
    // Load from localStorage, default to collapsed
    try {
      const stored = localStorage.getItem(`integrations-section-${category.id}`);
      return stored ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  });

  const handleToggle = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    try {
      localStorage.setItem(`integrations-section-${category.id}`, JSON.stringify(newState));
    } catch {
      // ignore
    }
  };

  return (
    <div className="mb-12">
      {/* Collapsible Header */}
      <motion.button
        onClick={handleToggle}
        className="w-full flex items-center justify-between mb-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
      >
        <div className="flex items-center gap-3 flex-1 text-left">
          <div className="p-2 rounded-lg bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
            {category.icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {category.name}
              </h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {category.integrations.length} items
              </span>
              {category.tooltip && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      className="max-w-xs text-sm bg-gray-900 dark:bg-white text-white dark:text-gray-900 border border-gray-700 dark:border-gray-200"
                    >
                      <p className="font-medium mb-1">How it works with Sixty:</p>
                      <p className="text-gray-100 dark:text-gray-800">{category.tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{category.description}</p>
          </div>
        </div>

        {/* Chevron Icon */}
        <motion.div
          initial={false}
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0 ml-2"
        >
          <ChevronDown className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
        </motion.div>
      </motion.button>

      {/* Expandable Cards Section */}
      {isExpanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {category.integrations.map((integration) => {
            const status = isBuilt ? getIntegrationStatus(integration.id) : 'coming_soon';
            const vote = !isBuilt ? getVoteState(integration.id) : null;
            return (
              <IntegrationCardWithLogo
                key={integration.id}
                config={integration}
                isBuilt={isBuilt}
                status={status}
                onAction={isBuilt ? () => onBuiltAction(integration.id) : undefined}
                actionLoading={builtActionLoadingById[integration.id]}
                vote={vote}
                onToggleUpvote={!isBuilt ? toggleUpvote : undefined}
                sixtyLogoUrl={sixtyLogoUrl}
              />
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

// =====================================================
// BUILT INTEGRATIONS (Active functionality)
// =====================================================

const builtIntegrations: IntegrationConfig[] = [
  {
    id: 'google-workspace',
    name: 'Google Workspace',
    description: 'Gmail, Calendar, Drive & Tasks.',
    permissions: [
      { title: 'View and send email', description: 'Send emails from contact pages.' },
      { title: 'Access calendar', description: 'Schedule meetings and sync events.' },
      { title: 'Access files', description: 'Share and attach files from Drive.' },
      { title: 'Manage tasks', description: 'Sync tasks bidirectionally.' },
    ],
    brandColor: 'blue',
    iconBgColor: 'bg-gray-50 dark:bg-gray-800',
    iconBorderColor: 'border-gray-200 dark:border-gray-700',
    fallbackIcon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    ),
    isBuilt: true,
  },
  {
    id: 'fathom',
    name: 'Fathom',
    description: 'Sync meeting recordings & insights.',
    permissions: [
      { title: 'Access recordings', description: 'View and sync meeting recordings.' },
      { title: 'Read transcripts', description: 'Access meeting transcripts and notes.' },
      { title: 'View insights', description: 'Import AI-generated meeting insights.' },
    ],
    brandColor: 'cyan',
    iconBgColor: 'bg-gray-900 dark:bg-[#1a1a1a]',
    iconBorderColor: 'border-gray-800 dark:border-gray-700',
    fallbackIcon: (
      <div className="flex items-center space-x-1">
        <span className="text-white font-bold text-sm">F</span>
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
          <path d="M4 16C4 14 4 12 6 10C8 8 10 8 12 6C14 4 16 4 18 6C20 8 20 10 20 12" stroke="#00BEFF" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
    ),
    isBuilt: true,
  },
  {
    id: 'savvycal',
    name: 'SavvyCal',
    description: 'Instant booking notifications.',
    permissions: [
      { title: 'Receive webhooks', description: 'Get notified when meetings are booked.' },
      { title: 'Track lead sources', description: 'Map booking links to lead sources.' },
    ],
    brandColor: 'purple',
    iconBgColor: 'bg-purple-50 dark:bg-purple-900/30',
    iconBorderColor: 'border-purple-100 dark:border-purple-800',
    fallbackIcon: <Calendar className="w-6 h-6 text-purple-600 dark:text-purple-400" />,
    isBuilt: true,
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Team notifications & deal rooms.',
    permissions: [
      { title: 'Send messages', description: 'Post notifications to channels and DMs.' },
      { title: 'Create channels', description: 'Auto-create deal room channels.' },
      { title: 'Read members', description: 'Map Slack users to Sixty users.' },
    ],
    brandColor: 'purple',
    iconBgColor: 'bg-purple-50 dark:bg-purple-900/30',
    iconBorderColor: 'border-purple-200 dark:border-purple-800',
    fallbackIcon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52z" fill="#36C5F0"/>
        <path d="M6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#2EB67D"/>
        <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834z" fill="#ECB22E"/>
        <path d="M8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#E01E5A"/>
        <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834z" fill="#36C5F0"/>
        <path d="M17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
        <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52z" fill="#ECB22E"/>
        <path d="M15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#E01E5A"/>
      </svg>
    ),
    isBuilt: true,
  },
  {
    id: 'justcall',
    name: 'JustCall',
    description: 'Sync call recordings & transcripts.',
    permissions: [
      { title: 'Read calls', description: 'Backfill and sync call history.' },
      { title: 'Read recordings', description: 'Stream call recordings securely.' },
      { title: 'Read transcripts', description: 'Fetch JustCall IQ transcripts.' },
      { title: 'Receive webhooks', description: 'Real-time call updates.' },
    ],
    brandColor: 'emerald',
    iconBgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    iconBorderColor: 'border-emerald-100 dark:border-emerald-800/40',
    fallbackIcon: <Phone className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />,
    isBuilt: true,
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Bi-directional CRM sync + AI writeback.',
    permissions: [
      { title: 'Read/write contacts', description: 'Sync contacts both ways (email-based matching).' },
      { title: 'Read/write deals', description: 'Sync deals + stage mapping; maintain associations.' },
      { title: 'Read/write tasks', description: 'Two-way tasks with stable Sixty ID mapping.' },
      { title: 'Create notes', description: 'Write meeting summaries/action items back to HubSpot.' },
      { title: 'Ingest forms', description: 'Poll HubSpot forms and create Sixty leads + follow-ups.' },
    ],
    brandColor: 'orange',
    iconBgColor: 'bg-orange-50 dark:bg-orange-900/20',
    iconBorderColor: 'border-orange-100 dark:border-orange-800/40',
    fallbackIcon: <Users className="w-6 h-6 text-orange-500" />,
    isBuilt: true,
  },
  {
    id: '60-notetaker',
    name: '60 Notetaker',
    description: 'Auto-record & transcribe your meetings.',
    permissions: [
      { title: 'Access calendar', description: 'View your meetings to know when to join.' },
      { title: 'Join meetings', description: 'Bot joins as a participant to record.' },
      { title: 'Transcribe audio', description: 'Convert speech to text with speaker identification.' },
      { title: 'Generate insights', description: 'AI-powered summaries and action items.' },
    ],
    brandColor: 'emerald',
    iconBgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    iconBorderColor: 'border-emerald-100 dark:border-emerald-800/40',
    fallbackIcon: <img src={DEFAULT_SIXTY_ICON_URL} alt="60" className="w-6 h-6 rounded" />,
    isBuilt: true,
  },
  {
    id: 'fireflies',
    name: 'Fireflies.ai',
    description: 'AI meeting notes & transcription.',
    permissions: [
      { title: 'Access recordings', description: 'View and sync meeting recordings.' },
      { title: 'Read transcripts', description: 'Access meeting transcripts and notes.' },
      { title: 'View insights', description: 'Import AI-generated meeting insights.' },
    ],
    brandColor: 'yellow',
    iconBgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    iconBorderColor: 'border-yellow-100 dark:border-yellow-800/40',
    fallbackIcon: <Video className="w-6 h-6 text-yellow-500" />,
    isBuilt: true,
  },
  {
    id: 'apollo',
    name: 'Apollo.io',
    description: 'Sales intelligence & lead search.',
    permissions: [
      { title: 'Search leads', description: 'Search Apollo database for prospects.' },
      { title: 'Enrich contacts', description: 'Enrich contact data with Apollo intelligence.' },
    ],
    brandColor: 'blue',
    iconBgColor: 'bg-blue-50 dark:bg-blue-900/20',
    iconBorderColor: 'border-blue-100 dark:border-blue-800/40',
    fallbackIcon: <Database className="w-6 h-6 text-blue-600 dark:text-blue-400" />,
    isBuilt: true,
  },
  {
    id: 'ai-ark',
    name: 'AI Ark',
    description: 'B2B data, AI search & enrichment.',
    permissions: [
      { title: 'Search companies', description: 'Find companies by firmographic filters and AI similarity.' },
      { title: 'Search people', description: 'Find contacts by role, seniority, and department.' },
      { title: 'Enrich records', description: 'Refresh contact data with current job titles and emails.' },
    ],
    brandColor: 'violet',
    iconBgColor: 'bg-violet-50 dark:bg-violet-900/20',
    iconBorderColor: 'border-violet-100 dark:border-violet-800/40',
    fallbackIcon: <Database className="w-6 h-6 text-violet-600 dark:text-violet-400" />,
    isBuilt: true,
  },
  {
    id: 'instantly',
    name: 'Instantly',
    description: 'Cold email campaigns at scale.',
    permissions: [
      { title: 'Push leads', description: 'Add leads to Instantly campaigns.' },
      { title: 'Create campaigns', description: 'Create new email campaigns.' },
    ],
    brandColor: 'gray',
    iconBgColor: 'bg-gray-50 dark:bg-gray-800',
    iconBorderColor: 'border-gray-200 dark:border-gray-700',
    fallbackIcon: <Mail className="w-6 h-6 text-gray-600 dark:text-gray-400" />,
    isBuilt: true,
  },
];

// =====================================================
// COMING SOON INTEGRATIONS (Organized by Category)
// =====================================================

const integrationCategories: IntegrationCategory[] = [
  {
    id: 'meeting-recorders',
    name: 'Meeting Recorders',
    description: 'Capture and analyze your sales conversations',
    tooltip: 'Syncs meeting transcripts and AI insights directly to contact records. Automatically links meetings to deals and creates follow-up tasks based on action items discussed.',
    icon: <Video className="w-5 h-5" />,
    integrations: [
      // Fireflies is now a built integration (moved to builtIntegrations array)
      { id: 'otter', name: 'Otter.ai', description: 'Real-time transcription.', fallbackIcon: <Video className="w-6 h-6 text-blue-500" /> },
      { id: 'granola', name: 'Granola', description: 'AI note-taking assistant.', fallbackIcon: <Video className="w-6 h-6 text-amber-600" /> },
      { id: 'gong', name: 'Gong', description: 'Revenue intelligence platform.', fallbackIcon: <Video className="w-6 h-6 text-purple-500" /> },
      { id: 'chorus', name: 'Chorus', description: 'Conversation intelligence.', fallbackIcon: <Video className="w-6 h-6 text-indigo-500" /> },
      { id: 'avoma', name: 'Avoma', description: 'AI meeting lifecycle assistant.', fallbackIcon: <Video className="w-6 h-6 text-green-500" /> },
      { id: 'grain', name: 'Grain', description: 'Video highlights from meetings.', fallbackIcon: <Video className="w-6 h-6 text-orange-500" /> },
    ],
  },
  {
    id: 'video-conferencing',
    name: 'Video Conferencing',
    description: 'Connect your meeting platforms',
    tooltip: 'Creates calendar events and meeting activities automatically. Links video call recordings to contacts and deals for complete conversation history.',
    icon: <Video className="w-5 h-5" />,
    integrations: [
      { id: 'zoom', name: 'Zoom', description: 'Video meetings & webinars.', fallbackIcon: <Video className="w-6 h-6 text-blue-500" /> },
      { id: 'teams', name: 'Microsoft Teams', description: 'Team collaboration & meetings.', fallbackIcon: <Video className="w-6 h-6 text-purple-600" /> },
      { id: 'google-meet', name: 'Google Meet', description: 'Google video conferencing.', fallbackIcon: <Video className="w-6 h-6 text-green-500" /> },
      { id: 'webex', name: 'Webex', description: 'Cisco video conferencing.', fallbackIcon: <Video className="w-6 h-6 text-cyan-500" /> },
    ],
  },
  {
    id: 'crms',
    name: 'CRM Platforms',
    description: 'Sync with your existing CRM',
    tooltip: 'Bi-directional sync of contacts, deals, and activities. Use Sixty as your sales command center while keeping your existing CRM updated in real-time.',
    icon: <Users className="w-5 h-5" />,
    integrations: [
      { id: 'salesforce', name: 'Salesforce', description: 'Enterprise CRM leader.', fallbackIcon: <Users className="w-6 h-6 text-blue-500" /> },
      { id: 'pipedrive', name: 'Pipedrive', description: 'Sales-focused CRM.', fallbackIcon: <Users className="w-6 h-6 text-green-500" /> },
      { id: 'zoho', name: 'Zoho CRM', description: 'Business suite CRM.', fallbackIcon: <Users className="w-6 h-6 text-red-500" /> },
      { id: 'close', name: 'Close', description: 'CRM built for sales teams.', fallbackIcon: <Users className="w-6 h-6 text-emerald-500" /> },
      { id: 'bullhorn', name: 'Bullhorn', description: 'Staffing & recruiting CRM.', fallbackIcon: <Users className="w-6 h-6 text-amber-600" /> },
      { id: 'highlevel', name: 'GoHighLevel', description: 'All-in-one agency CRM.', fallbackIcon: <Users className="w-6 h-6 text-blue-600" /> },
      { id: 'copper', name: 'Copper', description: 'Google Workspace CRM.', fallbackIcon: <Users className="w-6 h-6 text-orange-400" /> },
      { id: 'attio', name: 'Attio', description: 'Next-gen CRM for startups.', fallbackIcon: <Users className="w-6 h-6 text-violet-500" /> },
      { id: 'folk', name: 'Folk', description: 'CRM for relationship builders.', fallbackIcon: <Users className="w-6 h-6 text-pink-500" /> },
    ],
  },
  {
    id: 'calendar-booking',
    name: 'Calendar & Booking',
    description: 'Scheduling and calendar management',
    tooltip: 'Auto-creates contacts when meetings are booked. Tracks lead sources by booking link and triggers smart follow-up tasks based on meeting outcomes.',
    icon: <Calendar className="w-5 h-5" />,
    integrations: [
      { id: 'calendly', name: 'Calendly', description: 'Scheduling automation.', fallbackIcon: <Calendar className="w-6 h-6 text-blue-500" /> },
      { id: 'outlook', name: 'Microsoft Outlook', description: 'Email & calendar.', fallbackIcon: <Calendar className="w-6 h-6 text-blue-600" /> },
      { id: 'cal-com', name: 'Cal.com', description: 'Open-source scheduling.', fallbackIcon: <Calendar className="w-6 h-6 text-gray-700 dark:text-gray-300" /> },
      { id: 'acuity', name: 'Acuity', description: 'Client scheduling software.', fallbackIcon: <Calendar className="w-6 h-6 text-teal-500" /> },
    ],
  },
  {
    id: 'dialers',
    name: 'Dialers & Phone',
    description: 'Cloud phone systems and call tracking',
    tooltip: 'Logs call activities automatically with duration and outcome. Click-to-call from contact pages and syncs call recordings for coaching and compliance.',
    icon: <Phone className="w-5 h-5" />,
    integrations: [
      { id: 'ringover', name: 'Ringover', description: 'Business phone system.', fallbackIcon: <Phone className="w-6 h-6 text-green-500" /> },
      { id: 'cloudcall', name: 'CloudCall', description: 'CRM telephony integration.', fallbackIcon: <Phone className="w-6 h-6 text-cyan-500" /> },
      { id: '8x8', name: '8x8', description: 'Unified communications.', fallbackIcon: <Phone className="w-6 h-6 text-blue-600" /> },
      { id: 'aircall', name: 'Aircall', description: 'Cloud call center.', fallbackIcon: <Phone className="w-6 h-6 text-emerald-500" /> },
      { id: 'dialpad', name: 'Dialpad', description: 'AI-powered calling.', fallbackIcon: <Phone className="w-6 h-6 text-purple-500" /> },
      { id: 'ringcentral', name: 'RingCentral', description: 'Business communications.', fallbackIcon: <Phone className="w-6 h-6 text-orange-500" /> },
    ],
  },
  {
    id: 'task-management',
    name: 'Task Management',
    description: 'Sync tasks and projects',
    tooltip: 'Two-way task sync keeps your workflow tools updated. Deal stage changes can auto-create tasks, and completing tasks in external tools updates Sixty.',
    icon: <CheckSquare className="w-5 h-5" />,
    integrations: [
      { id: 'notion', name: 'Notion', description: 'All-in-one workspace.', fallbackIcon: <CheckSquare className="w-6 h-6 text-gray-800 dark:text-gray-200" /> },
      { id: 'asana', name: 'Asana', description: 'Project management.', fallbackIcon: <CheckSquare className="w-6 h-6 text-pink-500" /> },
      { id: 'monday', name: 'Monday.com', description: 'Work OS platform.', fallbackIcon: <CheckSquare className="w-6 h-6 text-red-500" /> },
      { id: 'clickup', name: 'ClickUp', description: 'Productivity platform.', fallbackIcon: <CheckSquare className="w-6 h-6 text-purple-500" /> },
      { id: 'linear', name: 'Linear', description: 'Issue tracking for teams.', fallbackIcon: <CheckSquare className="w-6 h-6 text-violet-500" /> },
      { id: 'todoist', name: 'Todoist', description: 'Personal task manager.', fallbackIcon: <CheckSquare className="w-6 h-6 text-red-600" /> },
      { id: 'trello', name: 'Trello', description: 'Kanban-style boards.', fallbackIcon: <CheckSquare className="w-6 h-6 text-blue-500" /> },
      { id: 'airtable', name: 'Airtable', description: 'Spreadsheet-database hybrid.', fallbackIcon: <CheckSquare className="w-6 h-6 text-yellow-500" /> },
    ],
  },
  {
    id: 'automation',
    name: 'Automation & No-Code',
    description: 'Connect everything together',
    tooltip: 'Trigger workflows when deals change stages or activities are logged. Push data to any tool and pull updates back into Sixty automatically.',
    icon: <Zap className="w-5 h-5" />,
    integrations: [
      { id: 'zapier', name: 'Zapier', description: 'Connect 5000+ apps.', fallbackIcon: <Zap className="w-6 h-6 text-orange-500" /> },
      { id: 'make', name: 'Make', description: 'Visual automation platform.', fallbackIcon: <Zap className="w-6 h-6 text-purple-500" /> },
      { id: 'n8n', name: 'n8n', description: 'Open-source workflows.', fallbackIcon: <Zap className="w-6 h-6 text-red-500" /> },
      { id: 'webhooks', name: 'Webhooks', description: 'Custom integrations.', fallbackIcon: <Zap className="w-6 h-6 text-gray-600 dark:text-gray-400" /> },
      { id: 'tray', name: 'Tray.io', description: 'Enterprise automation.', fallbackIcon: <Zap className="w-6 h-6 text-blue-500" /> },
    ],
  },
  {
    id: 'communication',
    name: 'Team Communication',
    description: 'Stay connected with your team',
    tooltip: 'Get deal alerts and activity notifications in your team channels. Share wins, flag at-risk deals, and collaborate without leaving your chat app.',
    icon: <Users className="w-5 h-5" />,
    integrations: [
      { id: 'discord', name: 'Discord', description: 'Community chat.', fallbackIcon: <Users className="w-6 h-6 text-indigo-500" /> },
      { id: 'intercom', name: 'Intercom', description: 'Customer messaging.', fallbackIcon: <Users className="w-6 h-6 text-blue-500" /> },
      { id: 'microsoft-teams', name: 'Microsoft Teams', description: 'Team collaboration.', fallbackIcon: <Users className="w-6 h-6 text-purple-600" /> },
    ],
  },
];

// =====================================================
// SUGGESTED INTEGRATIONS (20 High-Value Additions)
// =====================================================

const suggestedIntegrations: IntegrationCategory[] = [
  {
    id: 'email-outreach',
    name: 'Email & Outreach',
    description: 'Automate your email campaigns',
    tooltip: 'Logs outbound email activities automatically. Syncs email sequences to contact timelines and tracks opens/clicks as engagement signals on deals.',
    icon: <Mail className="w-5 h-5" />,
    integrations: [
      { id: 'lemlist', name: 'Lemlist', description: 'Cold email outreach.', fallbackIcon: <Mail className="w-6 h-6 text-purple-500" /> },
      { id: 'outreach', name: 'Outreach', description: 'Sales engagement platform.', fallbackIcon: <Mail className="w-6 h-6 text-purple-600" /> },
      { id: 'salesloft', name: 'Salesloft', description: 'Revenue workflow platform.', fallbackIcon: <Mail className="w-6 h-6 text-blue-500" /> },
    ],
  },
  {
    id: 'sales-intelligence',
    name: 'Sales Intelligence',
    description: 'Enrich your leads with data',
    tooltip: 'Auto-enriches contacts with company data, phone numbers, and social profiles. Fills in missing fields and keeps your contact database accurate and complete.',
    icon: <Database className="w-5 h-5" />,
    integrations: [
      { id: 'linkedin-sales-navigator', name: 'LinkedIn Sales Nav', description: 'Social selling platform.', fallbackIcon: <Database className="w-6 h-6 text-blue-700" /> },
      { id: 'zoominfo', name: 'ZoomInfo', description: 'B2B contact database.', fallbackIcon: <Database className="w-6 h-6 text-green-500" /> },
      { id: 'clearbit', name: 'Clearbit', description: 'Data enrichment.', fallbackIcon: <Database className="w-6 h-6 text-blue-500" /> },
      { id: 'lusha', name: 'Lusha', description: 'Contact data platform.', fallbackIcon: <Database className="w-6 h-6 text-pink-500" /> },
      { id: 'cognism', name: 'Cognism', description: 'GDPR-compliant B2B data.', fallbackIcon: <Database className="w-6 h-6 text-indigo-500" /> },
    ],
  },
  {
    id: 'esignature',
    name: 'E-Signature & Documents',
    description: 'Close deals faster',
    tooltip: 'Moves deals to "Signed" stage automatically when contracts are executed. Tracks document views and creates activities for proposal sends.',
    icon: <FileSignature className="w-5 h-5" />,
    integrations: [
      { id: 'docusign', name: 'DocuSign', description: 'E-signature leader.', fallbackIcon: <FileSignature className="w-6 h-6 text-yellow-600" /> },
      { id: 'pandadoc', name: 'PandaDoc', description: 'Document automation.', fallbackIcon: <FileSignature className="w-6 h-6 text-green-500" /> },
      { id: 'hellosign', name: 'HelloSign', description: 'Simple e-signatures.', fallbackIcon: <FileSignature className="w-6 h-6 text-blue-500" /> },
      { id: 'proposify', name: 'Proposify', description: 'Proposal software.', fallbackIcon: <FileSignature className="w-6 h-6 text-teal-500" /> },
    ],
  },
  {
    id: 'payments',
    name: 'Payments & Billing',
    description: 'Get paid faster',
    tooltip: 'Reconciles deal values with actual payments received. Updates deal status when invoices are paid and calculates accurate revenue metrics.',
    icon: <CreditCard className="w-5 h-5" />,
    integrations: [
      { id: 'stripe', name: 'Stripe', description: 'Payment processing.', fallbackIcon: <CreditCard className="w-6 h-6 text-purple-600" /> },
      { id: 'quickbooks', name: 'QuickBooks', description: 'Accounting software.', fallbackIcon: <CreditCard className="w-6 h-6 text-green-600" /> },
      { id: 'xero', name: 'Xero', description: 'Cloud accounting.', fallbackIcon: <CreditCard className="w-6 h-6 text-blue-500" /> },
      { id: 'chargebee', name: 'Chargebee', description: 'Subscription billing.', fallbackIcon: <CreditCard className="w-6 h-6 text-orange-500" /> },
    ],
  },
  {
    id: 'ai-productivity',
    name: 'AI & Productivity',
    description: 'Supercharge with AI',
    tooltip: 'Powers AI-generated email drafts, meeting summaries, and deal insights. Extends Meeting Intelligence features with custom AI capabilities.',
    icon: <Bot className="w-5 h-5" />,
    integrations: [
      { id: 'openai', name: 'OpenAI / ChatGPT', description: 'AI assistant integration.', fallbackIcon: <Bot className="w-6 h-6 text-green-500" /> },
      { id: 'anthropic', name: 'Anthropic / Claude', description: 'AI for enterprises.', fallbackIcon: <Bot className="w-6 h-6 text-orange-500" /> },
    ],
  },
];

// =====================================================
// MAIN COMPONENT
// =====================================================

export default function Integrations() {
  const navigate = useNavigate();
  const hubspotEnabled = isHubSpotIntegrationEnabled();
  const [searchParams] = useSearchParams();
  useUser(); // ensures auth/user is initialized (needed for upvotes under Clerk)
  const { settings: brandingSettings } = useBrandingSettings();
  const sixtyLogoUrl = brandingSettings?.icon_url || DEFAULT_SIXTY_ICON_URL;

  const allComingSoonIntegrationIds = useMemo(() => {
    const ids: string[] = [];
    for (const cat of integrationCategories) ids.push(...cat.integrations.map((i) => i.id));
    for (const cat of suggestedIntegrations) ids.push(...cat.integrations.map((i) => i.id));
    return ids;
  }, []);

  const { getVoteState, toggleUpvote, roadmapSchemaAvailable } = useIntegrationUpvotes(allComingSoonIntegrationIds);

  // Integration states
  const {
    isConnected: googleConnected,
    status: googleStatus,
    isLoading: googleLoading,
    checkConnection: checkGoogleConnection,
    connect: connectGoogle,
  } = useGoogleIntegration();

  const {
    isConnected: fathomConnected,
    loading: fathomLoading,
    error: fathomError,
    connectFathom,
  } = useFathomIntegration();

  const { isConnected: slackConnected, loading: slackLoading, connectSlack } = useSlackIntegration();

  const { isConnected: justcallConnected, loading: justcallLoading } = useJustCallIntegration();

  const { isConnected: savvycalConnected, loading: savvycalLoading, hasApiToken: savvycalHasApiToken } = useSavvyCalIntegration();

  const { isConnected: hubspotConnected, loading: hubspotLoading, connectHubSpot } = useHubSpotIntegration(hubspotEnabled);

  const {
    isConnected: notetakerConnected,
    isLoading: notetakerLoading,
    isOrgEnabled: notetakerOrgEnabled,
    needsCalendar: notetakerNeedsCalendar,
    status: notetakerStatus,
  } = useNotetakerIntegration();

  const {
    isConnected: firefliesConnected,
    loading: firefliesLoading,
  } = useFirefliesIntegration();

  const {
    isConnected: apolloConnected,
    loading: apolloLoading,
  } = useApolloIntegration();

  const {
    isConnected: aiArkConnected,
    loading: aiArkLoading,
  } = useAiArkIntegration();

  const {
    isConnected: instantlyConnected,
    loading: instantlyLoading,
  } = useInstantlyIntegration();

  // Modal states
  const [activeConnectModal, setActiveConnectModal] = useState<string | null>(null);
  const [activeConfigModal, setActiveConfigModal] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Check for OAuth callback parameters
  useEffect(() => {
    const statusParam = searchParams.get('status');
    const errorParam = searchParams.get('error');
    const emailParam = searchParams.get('email');
    const hubspotStatus = searchParams.get('hubspot_status');
    const hubspotError = searchParams.get('hubspot_error');
    const fathomStatus = searchParams.get('fathom');

    if (statusParam === 'connected' && emailParam) {
      toast.success(`Successfully connected Google account: ${emailParam}`);
      checkGoogleConnection();
      window.history.replaceState({}, '', '/integrations');
    } else if (errorParam) {
      const errorDescription = searchParams.get('error_description');
      toast.error(`Failed to connect Google: ${errorDescription || errorParam}`);
      window.history.replaceState({}, '', '/integrations');
    } else if (hubspotStatus === 'connected') {
      toast.success('HubSpot connected');
      window.history.replaceState({}, '', '/integrations');
    } else if (hubspotError) {
      const desc = searchParams.get('hubspot_error_description');
      toast.error(`Failed to connect HubSpot: ${desc || hubspotError}`);
      window.history.replaceState({}, '', '/integrations');
    } else if (fathomStatus === 'connected') {
      toast.success('Fathom connected successfully!', {
        description: 'Your Fathom account has been connected. Starting initial sync...',
      });
      window.history.replaceState({}, '', '/integrations');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]); // Only depend on searchParams, not checkGoogleConnection

  // Check integration status on mount
  useEffect(() => {
    checkGoogleConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount to avoid infinite loop

  // Get integration status
  const getIntegrationStatus = (integrationId: string): IntegrationStatus => {
    switch (integrationId) {
      case 'google-workspace':
        if (googleStatus === 'error') return 'error';
        if (googleStatus === 'refreshing') return 'syncing';
        return googleConnected ? 'active' : 'inactive';
      case 'fathom':
        // If we're connected, always show Active even if there was a non-fatal error
        // (e.g. user clicked Connect again and the Edge Function returned 400 "already connected").
        if (fathomConnected) return 'active';
        if (fathomError) return 'error';
        return 'inactive';
      case 'savvycal':
        // Show as active if connected (has API token), syncing if API token exists but webhook not verified
        if (savvycalConnected) return 'active';
        if (savvycalHasApiToken) return 'syncing';
        return 'inactive';
      case 'slack':
        return slackConnected ? 'active' : 'inactive';
      case 'justcall':
        return justcallConnected ? 'active' : 'inactive';
      case 'hubspot':
        return hubspotConnected ? 'active' : 'inactive';
      case '60-notetaker':
        // Show as inactive if org hasn't enabled, or if user needs to set up
        if (!notetakerOrgEnabled) return 'inactive';
        if (notetakerNeedsCalendar) return 'syncing'; // Shows "needs setup" state
        return notetakerConnected ? 'active' : 'inactive';
      case 'fireflies':
        return firefliesConnected ? 'active' : 'inactive';
      case 'apollo':
        return apolloConnected ? 'active' : 'inactive';
      case 'ai-ark':
        return aiArkConnected ? 'active' : 'inactive';
      case 'instantly':
        return instantlyConnected ? 'active' : 'inactive';
      default:
        return 'coming_soon';
    }
  };

  // Handle card action
  const handleCardAction = (integrationId: string, isBuilt: boolean = false) => {
    if (!isBuilt) return; // Don't handle clicks on coming soon integrations

    const status = getIntegrationStatus(integrationId);

    if (status === 'active' || status === 'syncing') {
      // Meeting recorders navigate to dedicated settings pages when connected
      if (integrationId === 'fathom') {
        navigate('/settings/integrations/fathom');
        return;
      }
      if (integrationId === 'fireflies') {
        navigate('/settings/integrations/fireflies');
        return;
      }
      if (integrationId === '60-notetaker') {
        navigate('/meetings/recordings/settings');
        return;
      }
      // Other integrations use config modals
      setActiveConfigModal(integrationId);
    } else {
      // JustCall is API-key based (no OAuth flow) so go straight to config.
      if (integrationId === 'justcall') {
        setActiveConfigModal('justcall');
        return;
      }
      // Fireflies is API-key based - go straight to config modal for initial connection
      if (integrationId === 'fireflies') {
        setActiveConfigModal('fireflies');
        return;
      }
      if (integrationId === 'apollo') {
        setActiveConfigModal('apollo');
        return;
      }
      if (integrationId === 'ai-ark') {
        setActiveConfigModal('ai-ark');
        return;
      }
      if (integrationId === 'instantly') {
        setActiveConfigModal('instantly');
        return;
      }
      // 60 Notetaker goes straight to config modal (handles its own enable flow)
      if (integrationId === '60-notetaker') {
        setActiveConfigModal('60-notetaker');
        return;
      }
      setActiveConnectModal(integrationId);
    }
  };

  // Handle authorization
  const handleAuthorize = async (integrationId: string) => {
    setIsConnecting(true);
    try {
      switch (integrationId) {
        case 'google-workspace':
          const authUrl = await connectGoogle();
          if (authUrl) {
            window.location.href = authUrl;
          } else {
            toast.error('Failed to get authentication URL');
          }
          break;
        case 'fathom':
          // connectFathom returns whether initiation succeeded (popup opened)
          if (await connectFathom()) {
            setActiveConnectModal(null);
          } else {
            // If the org is already connected, guide user to Configure instead of leaving them stuck on Connect.
            // connectFathom() will toast an info message in this case.
            setActiveConnectModal(null);
            setActiveConfigModal('fathom');
          }
          break;
        case 'savvycal':
          setActiveConnectModal(null);
          setActiveConfigModal('savvycal');
          break;
        case 'slack':
          connectSlack();
          setActiveConnectModal(null);
          break;
        case 'justcall':
          // JustCall does not support OAuth; go straight to API key/secret configuration.
          setActiveConnectModal(null);
          setActiveConfigModal('justcall');
          break;
        case 'hubspot':
          await connectHubSpot();
          setActiveConnectModal(null);
          break;
        default:
          toast.info('Integration coming soon');
          setActiveConnectModal(null);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to connect');
    } finally {
      setIsConnecting(false);
    }
  };

  // Find built integration config
  const getBuiltIntegrationConfig = (id: string) => builtIntegrations.find((i) => i.id === id);

  // Integration Card wrapper with logo hook
  const builtActionLoadingById: Record<string, boolean> = useMemo(
    () => ({
      'google-workspace': googleLoading,
      fathom: fathomLoading,
      slack: slackLoading,
      justcall: justcallLoading,
      savvycal: savvycalLoading,
      hubspot: hubspotLoading,
      '60-notetaker': notetakerLoading,
      fireflies: firefliesLoading,
      apollo: apolloLoading,
      'ai-ark': aiArkLoading,
      instantly: instantlyLoading,
    }),
    [googleLoading, fathomLoading, slackLoading, justcallLoading, savvycalLoading, hubspotLoading, notetakerLoading, firefliesLoading, apolloLoading, aiArkLoading, instantlyLoading]
  );

  // Preload cached S3 logo URLs on page load to prevent any visible swap/flicker.
  useEffect(() => {
    const allIds = [
      ...builtIntegrations.map((i) => i.id),
      ...integrationCategories.flatMap((c) => c.integrations.map((i) => i.id)),
      ...suggestedIntegrations.flatMap((c) => c.integrations.map((i) => i.id)),
    ];

    // De-dupe
    const urls = Array.from(new Set(allIds.map((id) => getLogoS3Url(getIntegrationDomain(id)))));

    for (const url of urls) {
      try {
        const img = new Image();
        img.decoding = 'async';
        img.src = url;
      } catch {
        // ignore (non-browser environments)
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Integrations</h1>
          <HelpPanel docSlug="integrations-overview" tooltip="Integrations help" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Connect your favorite tools to supercharge your sales workflow.
        </p>
      </div>

      <div className="max-w-7xl mx-auto">
        {/* Connected Integrations */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Available Integrations
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Connect these integrations to get started
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {builtIntegrations
              .filter((integration) => (integration.id === 'hubspot' ? hubspotEnabled : true))
              .map((integration) => (
                <IntegrationCardWithLogo
                  key={integration.id}
                  config={integration}
                  isBuilt={true}
                  status={getIntegrationStatus(integration.id)}
                  onAction={() => handleCardAction(integration.id, true)}
                  actionLoading={builtActionLoadingById[integration.id]}
                  sixtyLogoUrl={sixtyLogoUrl}
                />
              ))}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-gray-800 my-8" />

        {/* Coming Soon Categories */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Coming Soon</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
            We're working on these integrations. Vote for the ones you need most!
          </p>
          {!roadmapSchemaAvailable && (
            <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
              Voting is currently unavailable in this environment (roadmap tables not deployed).
            </div>
          )}

          {integrationCategories.map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              isBuilt={false}
              getIntegrationStatus={getIntegrationStatus}
              onBuiltAction={(integrationId) => handleCardAction(integrationId, true)}
              builtActionLoadingById={builtActionLoadingById}
              getVoteState={getVoteState}
              toggleUpvote={toggleUpvote}
              sixtyLogoUrl={sixtyLogoUrl}
            />
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-gray-800 my-8" />

        {/* Suggested Integrations */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Suggested Integrations
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
            Popular tools that could supercharge your workflow
          </p>

          {suggestedIntegrations.map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              isBuilt={false}
              getIntegrationStatus={getIntegrationStatus}
              onBuiltAction={(integrationId) => handleCardAction(integrationId, true)}
              builtActionLoadingById={builtActionLoadingById}
              getVoteState={getVoteState}
              toggleUpvote={toggleUpvote}
              sixtyLogoUrl={sixtyLogoUrl}
            />
          ))}
        </div>

      </div>

      {/* Connect Modals */}
      {activeConnectModal && getBuiltIntegrationConfig(activeConnectModal) && (
        <ConnectModal
          open={true}
          onOpenChange={(open) => !open && setActiveConnectModal(null)}
          integrationId={getBuiltIntegrationConfig(activeConnectModal)!.id}
          integrationName={getBuiltIntegrationConfig(activeConnectModal)!.name}
          permissions={getBuiltIntegrationConfig(activeConnectModal)!.permissions || []}
          onAuthorize={() => handleAuthorize(activeConnectModal)}
          isAuthorizing={isConnecting}
          brandColor={getBuiltIntegrationConfig(activeConnectModal)!.brandColor}
          fallbackIcon={getBuiltIntegrationConfig(activeConnectModal)!.fallbackIcon}
          sixtyLogoUrl={sixtyLogoUrl}
        />
      )}

      {/* Configure Modals */}
      <GoogleConfigModal
        open={activeConfigModal === 'google-workspace'}
        onOpenChange={(open) => !open && setActiveConfigModal(null)}
      />
      <FathomConfigModal
        open={activeConfigModal === 'fathom'}
        onOpenChange={(open) => !open && setActiveConfigModal(null)}
      />
      <SavvyCalConfigModal
        open={activeConfigModal === 'savvycal'}
        onOpenChange={(open) => !open && setActiveConfigModal(null)}
      />
      <SlackConfigModal
        open={activeConfigModal === 'slack'}
        onOpenChange={(open) => !open && setActiveConfigModal(null)}
      />
      <JustCallConfigModal
        open={activeConfigModal === 'justcall'}
        onOpenChange={(open) => !open && setActiveConfigModal(null)}
      />
      <HubSpotConfigModal
        open={hubspotEnabled && activeConfigModal === 'hubspot'}
        onOpenChange={(open) => !open && setActiveConfigModal(null)}
      />
      <NotetakerConfigModal
        open={activeConfigModal === '60-notetaker'}
        onOpenChange={(open) => !open && setActiveConfigModal(null)}
      />
      <FirefliesConfigModal
        open={activeConfigModal === 'fireflies'}
        onOpenChange={(open) => !open && setActiveConfigModal(null)}
      />
      <ApolloConfigModal
        open={activeConfigModal === 'apollo'}
        onOpenChange={(open) => !open && setActiveConfigModal(null)}
      />
      <AiArkConfigModal
        open={activeConfigModal === 'ai-ark'}
        onOpenChange={(open) => !open && setActiveConfigModal(null)}
      />
      <InstantlyConfigModal
        open={activeConfigModal === 'instantly'}
        onOpenChange={(open) => !open && setActiveConfigModal(null)}
      />
    </div>
  );
}
