/**
 * QualityDashboard Component
 *
 * Shows overall health metrics, readiness scores, and issues requiring attention.
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  TrendingDown,
  Activity,
  Shield,
  Zap,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { PlatformSkill } from '@/lib/services/platformSkillService';
import type { CapabilityStatus } from '@/lib/hooks/useOrgCapabilities';
import { evaluateReadiness, type ReadinessCheck } from '@/lib/utils/skillReadiness';

interface QualityDashboardProps {
  skills: PlatformSkill[];
  capabilities: CapabilityStatus[];
  isLoading?: boolean;
  onSkillClick?: (skill: PlatformSkill) => void;
}

interface Issue {
  skill: PlatformSkill;
  readiness: ReadinessCheck;
  severity: 'error' | 'warning';
  message: string;
}

export function QualityDashboard({
  skills,
  capabilities,
  isLoading,
  onSkillClick,
}: QualityDashboardProps) {
  // Calculate readiness for all skills
  const readinessMap = useMemo(() => {
    const map = new Map<string, ReadinessCheck>();
    skills.forEach((skill) => {
      map.set(skill.id, evaluateReadiness(skill, capabilities));
    });
    return map;
  }, [skills, capabilities]);

  // Aggregate stats
  const stats = useMemo(() => {
    const checks = Array.from(readinessMap.values());
    const ready = checks.filter((c) => c.isReady).length;
    const total = checks.length;
    const avgScore = checks.length > 0
      ? Math.round(checks.reduce((sum, c) => sum + c.score, 0) / checks.length)
      : 0;
    const errorCount = checks.reduce(
      (sum, c) => sum + c.issues.filter((i) => i.severity === 'error').length,
      0
    );
    const warningCount = checks.reduce(
      (sum, c) => sum + c.issues.filter((i) => i.severity === 'warning').length,
      0
    );
    const activeSkills = skills.filter((s) => s.is_active);
    const activeReady = activeSkills.filter((s) => readinessMap.get(s.id)?.isReady).length;
    const sequences = skills.filter((s) => s.category === 'agent-sequence');
    const sequencesReady = sequences.filter((s) => readinessMap.get(s.id)?.isReady).length;

    return {
      ready,
      total,
      avgScore,
      errorCount,
      warningCount,
      activeSkills: activeSkills.length,
      activeReady,
      sequences: sequences.length,
      sequencesReady,
      healthPercent: total > 0 ? Math.round((ready / total) * 100) : 0,
    };
  }, [skills, readinessMap]);

  // Collect all issues
  const issues = useMemo<Issue[]>(() => {
    const allIssues: Issue[] = [];
    skills.forEach((skill) => {
      const readiness = readinessMap.get(skill.id);
      if (!readiness) return;
      readiness.issues.forEach((issue) => {
        allIssues.push({
          skill,
          readiness,
          severity: issue.severity,
          message: issue.message,
        });
      });
    });
    // Sort by severity (errors first), then by skill name
    return allIssues.sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === 'error' ? -1 : 1;
      }
      return a.skill.frontmatter.name.localeCompare(b.skill.frontmatter.name);
    });
  }, [skills, readinessMap]);

  // Skills not ready
  const notReadySkills = useMemo(() => {
    return skills
      .filter((s) => !readinessMap.get(s.id)?.isReady)
      .map((s) => ({ skill: s, readiness: readinessMap.get(s.id)! }))
      .sort((a, b) => a.readiness.score - b.readiness.score);
  }, [skills, readinessMap]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800/50 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-48 bg-gray-100 dark:bg-gray-800/50 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Overall Health */}
        <div className="bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">Overall Health</span>
            <Shield className="w-5 h-5 text-gray-400" />
          </div>
          <div className="flex items-end gap-2 mb-2">
            <span
              className={cn(
                'text-3xl font-semibold',
                stats.healthPercent >= 80
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : stats.healthPercent >= 60
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-red-600 dark:text-red-400'
              )}
            >
              {stats.healthPercent}%
            </span>
          </div>
          <Progress
            value={stats.healthPercent}
            className={cn(
              'h-2',
              stats.healthPercent >= 80
                ? '[&>div]:bg-emerald-500'
                : stats.healthPercent >= 60
                ? '[&>div]:bg-amber-500'
                : '[&>div]:bg-red-500'
            )}
          />
        </div>

        {/* Skills Ready */}
        <div className="bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">Skills Ready</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
              {stats.ready}
            </span>
            <span className="text-lg text-gray-500 mb-0.5">/ {stats.total}</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {stats.activeReady}/{stats.activeSkills} active skills ready
          </div>
        </div>

        {/* Sequences Ready */}
        <div className="bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">Sequences Ready</span>
            <Activity className="w-5 h-5 text-purple-500" />
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
              {stats.sequencesReady}
            </span>
            <span className="text-lg text-gray-500 mb-0.5">/ {stats.sequences}</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">Multi-step workflows</div>
        </div>

        {/* Issues */}
        <div className="bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">Issues</span>
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-1">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-2xl font-semibold text-red-600 dark:text-red-400">
                  {stats.errorCount}
                </span>
              </div>
              <div className="text-xs text-gray-500">Errors</div>
            </div>
            <div>
              <div className="flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
                  {stats.warningCount}
                </span>
              </div>
              <div className="text-xs text-gray-500">Warnings</div>
            </div>
          </div>
        </div>
      </div>

      {/* Issues List */}
      {issues.length > 0 && (
        <div className="bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700/50 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Issues Requiring Attention
              <Badge variant="secondary" className="ml-2">
                {issues.length}
              </Badge>
            </h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-96 overflow-y-auto">
            {issues.slice(0, 20).map((issue, idx) => (
              <motion.div
                key={`${issue.skill.id}-${idx}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.02 }}
                onClick={() => onSkillClick?.(issue.skill)}
                className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
              >
                <div
                  className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    issue.severity === 'error' ? 'bg-red-500' : 'bg-amber-500'
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {issue.skill.frontmatter.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-xs',
                        issue.severity === 'error'
                          ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                          : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'
                      )}
                    >
                      {issue.severity}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {issue.message}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
              </motion.div>
            ))}
          </div>
          {issues.length > 20 && (
            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 text-center">
              <span className="text-sm text-gray-500">
                +{issues.length - 20} more issues
              </span>
            </div>
          )}
        </div>
      )}

      {/* Skills Not Ready */}
      {notReadySkills.length > 0 && (
        <div className="bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700/50 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              Skills Not Ready for Production
              <Badge variant="secondary" className="ml-2">
                {notReadySkills.length}
              </Badge>
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
            {notReadySkills.slice(0, 9).map(({ skill, readiness }) => (
              <motion.div
                key={skill.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => onSkillClick?.(skill)}
                className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-lg p-4 cursor-pointer hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {skill.frontmatter.name}
                    </h4>
                    <p className="text-xs text-gray-500 font-mono truncate">
                      {skill.skill_key}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'shrink-0 text-xs',
                      readiness.score >= 50
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    )}
                  >
                    {readiness.score}%
                  </Badge>
                </div>
                <Progress
                  value={readiness.score}
                  className={cn(
                    'h-1.5',
                    readiness.score >= 50 ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500'
                  )}
                />
                <div className="mt-2 text-xs text-gray-500">
                  {readiness.issues.filter((i) => i.severity === 'error').length} errors,{' '}
                  {readiness.issues.filter((i) => i.severity === 'warning').length} warnings
                </div>
              </motion.div>
            ))}
          </div>
          {notReadySkills.length > 9 && (
            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 text-center">
              <Button variant="ghost" size="sm">
                View All {notReadySkills.length} Skills
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* All Ready Message */}
      {stats.ready === stats.total && stats.total > 0 && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-emerald-900 dark:text-emerald-100">
            All Skills Production Ready
          </h3>
          <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
            All {stats.total} skills are passing quality checks and ready for production use.
          </p>
        </div>
      )}
    </div>
  );
}

export default QualityDashboard;
