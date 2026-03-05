/**
 * PrepBriefCard
 *
 * IMP-UI-002: Base prep brief card for MeetingDetail page.
 * Renders the AI-generated prep brief from command_centre_items.
 *
 * Includes type-specific variants:
 * - IMP-UI-003: PipelineReviewPrepVariant (weighted pipeline, bottleneck alerts)
 * - IMP-UI-004: OneOnOnePrepVariant (rep performance, coaching notes)
 * - IMP-UI-005: QBRPrepVariant (account health summary)
 *
 * Stories: IMP-UI-002, IMP-UI-003, IMP-UI-004, IMP-UI-005
 */

import { useState } from 'react';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Clock,
  BarChart2,
  Users,
  TrendingUp,
  Radio,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Trophy,
  MessageSquare,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PrepBrief, PrepSection, InternalMeetingType } from '@/lib/hooks/useMeetingPrepBrief';
import { INTERNAL_TYPE_CONFIG } from './InternalMeetingTypeBadge';

// ============================================================================
// Helpers
// ============================================================================

function formatAge(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ============================================================================
// Section icon map — infer from section title keywords
// ============================================================================

function sectionIcon(title: string): React.ElementType {
  const t = title.toLowerCase();
  if (t.includes('pipeline') || t.includes('deal')) return BarChart2;
  if (t.includes('win') || t.includes('close')) return Trophy;
  if (t.includes('risk') || t.includes('block') || t.includes('alert')) return AlertTriangle;
  if (t.includes('coach') || t.includes('talk') || t.includes('skill')) return MessageSquare;
  if (t.includes('action') || t.includes('topic') || t.includes('agenda')) return CheckCircle2;
  if (t.includes('account') || t.includes('health')) return TrendingUp;
  return CheckCircle2;
}

// ============================================================================
// Markdown-lite section renderer
// ============================================================================

function SectionBody({ body }: { body: string }) {
  return (
    <div className="space-y-1">
      {body.split('\n').map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        if (line.startsWith('## ')) {
          return <p key={i} className="text-xs font-semibold text-gray-600 dark:text-gray-300 mt-2">{line.slice(3)}</p>;
        }
        if (line.startsWith('**') && line.endsWith('**')) {
          return <p key={i} className="text-xs font-semibold text-gray-700 dark:text-gray-200">{line.slice(2, -2)}</p>;
        }
        if (line.match(/^[•\-*]\s/)) {
          const text = line.replace(/^[•\-*]\s/, '');
          // Bold inline **text**
          const parts = text.split(/\*\*(.*?)\*\*/g);
          return (
            <div key={i} className="flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span className="flex-shrink-0 mt-0.5 text-gray-400 dark:text-gray-600">•</span>
              <span>
                {parts.map((p, j) =>
                  j % 2 === 1
                    ? <strong key={j} className="text-gray-700 dark:text-gray-200 font-medium">{p}</strong>
                    : p
                )}
              </span>
            </div>
          );
        }
        // Inline bold pass
        const parts = line.split(/\*\*(.*?)\*\*/g);
        return (
          <p key={i} className="text-xs text-gray-500 dark:text-gray-400">
            {parts.map((p, j) =>
              j % 2 === 1
                ? <strong key={j} className="text-gray-700 dark:text-gray-200 font-medium">{p}</strong>
                : p
            )}
          </p>
        );
      })}
    </div>
  );
}

// ============================================================================
// IMP-UI-003: Pipeline Review variant header
// ============================================================================

function PipelineReviewHeader() {
  return (
    <div className="flex items-center gap-1.5 text-violet-400">
      <BarChart2 className="h-3.5 w-3.5" />
      <span className="text-xs font-medium">Pipeline review prep</span>
    </div>
  );
}

// ============================================================================
// IMP-UI-004: 1:1 variant header
// ============================================================================

function OneOnOneHeader() {
  return (
    <div className="flex items-center gap-1.5 text-blue-400">
      <Users className="h-3.5 w-3.5" />
      <span className="text-xs font-medium">1:1 prep</span>
    </div>
  );
}

// ============================================================================
// IMP-UI-005: QBR variant header
// ============================================================================

function QBRHeader() {
  return (
    <div className="flex items-center gap-1.5 text-amber-400">
      <TrendingUp className="h-3.5 w-3.5" />
      <span className="text-xs font-medium">QBR prep</span>
    </div>
  );
}

function StandupHeader() {
  return (
    <div className="flex items-center gap-1.5 text-emerald-400">
      <Radio className="h-3.5 w-3.5" />
      <span className="text-xs font-medium">Standup prep</span>
    </div>
  );
}

function GenericHeader() {
  return (
    <div className="flex items-center gap-1.5 text-gray-400">
      <Building2 className="h-3.5 w-3.5" />
      <span className="text-xs font-medium">Internal meeting prep</span>
    </div>
  );
}

const TYPE_HEADERS: Record<InternalMeetingType, React.FC> = {
  pipeline_review: PipelineReviewHeader,
  one_on_one: OneOnOneHeader,
  qbr: QBRHeader,
  standup: StandupHeader,
  general: GenericHeader,
};

// ============================================================================
// Single collapsible section
// ============================================================================

const PREVIEW_LINES = 5;

function PrepSectionBlock({ section }: { section: PrepSection }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = sectionIcon(section.title);
  const lines = section.body.split('\n').filter(l => l.trim());
  const needsExpand = lines.length > PREVIEW_LINES;

  const previewBody = needsExpand && !expanded
    ? lines.slice(0, PREVIEW_LINES).join('\n')
    : section.body;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-500 flex-shrink-0" />
        <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300">{section.title}</h4>
      </div>
      <SectionBody body={previewBody} />
      {needsExpand && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-400 transition-colors"
        >
          {expanded
            ? <><ChevronUp className="h-3 w-3" />Show less</>
            : <><ChevronDown className="h-3 w-3" />Show {lines.length - PREVIEW_LINES} more lines</>
          }
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Main PrepBriefCard
// ============================================================================

interface PrepBriefCardProps {
  brief: PrepBrief;
}

export function PrepBriefCard({ brief }: PrepBriefCardProps) {
  const [collapsed, setCollapsed] = useState(false);

  const TypeHeader = TYPE_HEADERS[brief.meeting_type] ?? GenericHeader;
  const typeConfig = INTERNAL_TYPE_CONFIG[brief.meeting_type] ?? INTERNAL_TYPE_CONFIG.general;

  return (
    <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/40">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400 flex-shrink-0" />
              Meeting Prep
            </CardTitle>
            <TypeHeader />
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-600">
              <Clock className="h-3 w-3" />
              {formatAge(brief.generated_at)}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed
                ? <ChevronDown className="h-3.5 w-3.5" />
                : <ChevronUp className="h-3.5 w-3.5" />
              }
            </Button>
          </div>
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="px-4 pb-4 space-y-4">
          {/* Type badge */}
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn('text-[10px] border flex items-center gap-1', typeConfig.cls)}
            >
              <typeConfig.Icon className="h-2.5 w-2.5" />
              {typeConfig.label}
            </Badge>
            {brief.is_lightweight && (
              <Badge variant="outline" className="text-[10px] border-gray-300 dark:border-gray-700 text-gray-500">
                Lightweight
              </Badge>
            )}
          </div>

          {/* Sections */}
          <div className="space-y-4 divide-y divide-gray-200 dark:divide-gray-800">
            {brief.sections.map((section, i) => (
              <div key={i} className={cn(i > 0 && 'pt-4')}>
                <PrepSectionBlock section={section} />
              </div>
            ))}
          </div>

          {brief.sections.length === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-600 text-center py-2">
              Prep brief is being generated...
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
