/**
 * CapabilityOverview Component
 *
 * Visual map of what capabilities are available for the organization's copilot.
 * Shows connected integrations and what skills/sequences they enable.
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Database,
  Calendar,
  Mail,
  Mic,
  MessageSquare,
  ChevronRight,
  Zap,
  ListTodo,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CapabilityStatus } from '@/lib/hooks/useOrgCapabilities';
import type { PlatformSkill } from '@/lib/services/platformSkillService';
import { getCapabilityLabel, getProviderLabel } from '@/lib/utils/skillReadiness';

interface CapabilityOverviewProps {
  capabilities: CapabilityStatus[];
  skills: PlatformSkill[];
  isLoading?: boolean;
  onCapabilityClick?: (capability: CapabilityStatus) => void;
}

const CAPABILITY_ICONS: Record<string, React.ElementType> = {
  crm: Database,
  calendar: Calendar,
  email: Mail,
  meetings: Mic,
  messaging: MessageSquare,
  tasks: ListTodo,
};

const CAPABILITY_DESCRIPTIONS: Record<string, string> = {
  crm: 'Contact & deal management, pipeline data',
  calendar: 'Meeting scheduling, availability, events',
  email: 'Email drafting, search, send capabilities',
  meetings: 'Transcripts, recordings, and AI summaries',
  messaging: 'Slack notifications, channel messages',
  tasks: 'Task creation, management, and tracking',
};

interface CapabilityCluster {
  name: string;
  description: string;
  capability: CapabilityStatus;
  skillCount: number;
  availableSkillCount: number;
  skills: PlatformSkill[];
}

export function CapabilityOverview({
  capabilities,
  skills,
  isLoading,
  onCapabilityClick,
}: CapabilityOverviewProps) {
  // Group skills by their required capabilities
  const clusters = useMemo<CapabilityCluster[]>(() => {
    return capabilities.map((cap) => {
      // Find skills that require this capability
      const relatedSkills = skills.filter((skill) => {
        const requiredCaps = (skill.frontmatter.requires_capabilities || []) as string[];
        return requiredCaps.includes(cap.capability);
      });

      // Skills that work with this capability (have it available)
      const availableSkills = cap.available ? relatedSkills : [];

      return {
        name: getCapabilityLabel(cap.capability),
        description: CAPABILITY_DESCRIPTIONS[cap.capability] || '',
        capability: cap,
        skillCount: relatedSkills.length,
        availableSkillCount: availableSkills.length,
        skills: relatedSkills,
      };
    });
  }, [capabilities, skills]);

  // Calculate overall stats
  const stats = useMemo(() => {
    const connected = capabilities.filter((c) => c.available).length;
    const total = capabilities.length;
    const activeSkills = skills.filter((s) => s.is_active).length;
    return { connected, total, activeSkills };
  }, [capabilities, skills]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-24 bg-gray-100 dark:bg-gray-800/50 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-32 bg-gray-100 dark:bg-gray-800/50 rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500 rounded-lg">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-2xl font-semibold text-emerald-900 dark:text-emerald-100">
                {stats.connected}/{stats.total}
              </div>
              <div className="text-sm text-emerald-700 dark:text-emerald-300">
                Integrations Connected
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-2xl font-semibold text-blue-900 dark:text-blue-100">
                {stats.activeSkills}
              </div>
              <div className="text-sm text-blue-700 dark:text-blue-300">
                Active Skills
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500 rounded-lg">
              <Mic className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-2xl font-semibold text-purple-900 dark:text-purple-100">
                {skills.filter((s) => s.category === 'agent-sequence').length}
              </div>
              <div className="text-sm text-purple-700 dark:text-purple-300">
                Sequences Available
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Capability Cards */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
          Integration Status
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clusters.map((cluster, index) => {
            const Icon = CAPABILITY_ICONS[cluster.capability.capability] || Database;
            const isConnected = cluster.capability.available;
            const provider = cluster.capability.provider;

            return (
              <motion.div
                key={cluster.capability.capability}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
                onClick={() => onCapabilityClick?.(cluster.capability)}
                className={cn(
                  'relative bg-white dark:bg-gray-900/80 border rounded-xl p-5 transition-all cursor-pointer',
                  'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600',
                  isConnected
                    ? 'border-emerald-200 dark:border-emerald-800'
                    : 'border-gray-200 dark:border-gray-700/50'
                )}
              >
                {/* Status indicator */}
                <div className="absolute top-4 right-4">
                  {isConnected ? (
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        Connected
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <XCircle className="w-4 h-4 text-gray-400" />
                      <span className="text-xs font-medium text-gray-500">
                        Not Connected
                      </span>
                    </div>
                  )}
                </div>

                {/* Icon and name */}
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className={cn(
                      'p-2.5 rounded-lg',
                      isConnected
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">
                      {cluster.name}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {cluster.description}
                    </p>
                  </div>
                </div>

                {/* Provider badge */}
                {provider && provider !== 'db' && (
                  <Badge
                    variant="outline"
                    className="mb-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                  >
                    {getProviderLabel(provider)}
                  </Badge>
                )}

                {/* Skills count */}
                {cluster.skillCount > 0 && (
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {isConnected
                        ? `${cluster.availableSkillCount} skills available`
                        : `${cluster.skillCount} skills require this`}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                )}

                {/* Features */}
                {cluster.capability.features && cluster.capability.features.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {cluster.capability.features.slice(0, 3).map((feature) => (
                      <Badge
                        key={feature}
                        variant="secondary"
                        className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                      >
                        {feature}
                      </Badge>
                    ))}
                    {cluster.capability.features.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{cluster.capability.features.length - 3} more
                      </Badge>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Not connected message */}
      {stats.connected < stats.total && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-medium text-amber-900 dark:text-amber-100">
                Unlock More Capabilities
              </h4>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Connect more integrations to enable additional AI capabilities.
                Some skills require specific integrations to function.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 text-amber-700 border-amber-300 hover:bg-amber-100"
              >
                View Integrations
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CapabilityOverview;
