/**
 * Scorecard Meeting Link Component
 *
 * When a rep's scorecard shows a low score on a skill dimension,
 * clicking it shows the meeting transcript excerpt that relates
 * to that skill via a Popover.
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, FileText, ExternalLink } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { supabase } from '@/lib/supabase/clientV2';
import { cn } from '@/lib/utils';

interface ScorecardMeetingLinkProps {
  meetingId: string;
  skillName: string;
  score: number;
  children: React.ReactNode;
}

interface TranscriptExcerpt {
  text: string;
  paragraphIndex: number;
}

/**
 * Generate keyword variants from a skill name for transcript search.
 * Splits the skill name into terms and includes common synonyms.
 */
function getSkillKeywords(skillName: string): string[] {
  const normalized = skillName.toLowerCase().replace(/_/g, ' ');
  const terms = normalized.split(/\s+/).filter((t) => t.length > 2);

  const synonymMap: Record<string, string[]> = {
    talk: ['speaking', 'talked', 'talking', 'spoke'],
    listen: ['listening', 'heard', 'hearing'],
    ratio: ['balance', 'proportion', 'percentage'],
    discovery: ['question', 'asked', 'inquiry', 'probing', 'explore'],
    questions: ['question', 'asked', 'asking', 'inquire'],
    next: ['follow', 'action', 'step'],
    steps: ['step', 'action', 'plan', 'follow-up'],
    monologue: ['long', 'extended', 'uninterrupted', 'continuous'],
    objection: ['concern', 'pushback', 'hesitation', 'resistance'],
    closing: ['close', 'commit', 'agreement', 'sign'],
    rapport: ['relationship', 'connect', 'trust', 'comfortable'],
    value: ['benefit', 'ROI', 'worth', 'advantage'],
    pain: ['challenge', 'problem', 'issue', 'struggle'],
    budget: ['cost', 'price', 'investment', 'spend'],
    timeline: ['deadline', 'schedule', 'when', 'timing'],
    demo: ['demonstration', 'showing', 'walkthrough', 'present'],
    engagement: ['engage', 'interactive', 'participate', 'involve'],
    empathy: ['understand', 'feel', 'perspective', 'appreciate'],
  };

  const allKeywords = new Set(terms);
  for (const term of terms) {
    const synonyms = synonymMap[term];
    if (synonyms) {
      synonyms.forEach((s) => allKeywords.add(s));
    }
  }

  return Array.from(allKeywords);
}

/**
 * Search transcript text for paragraphs related to the skill keywords.
 * Returns up to 3 relevant excerpts.
 */
function findRelevantExcerpts(transcriptText: string, skillName: string): TranscriptExcerpt[] {
  const keywords = getSkillKeywords(skillName);
  const paragraphs = transcriptText.split(/\n\n+/).filter((p) => p.trim().length > 20);

  if (paragraphs.length === 0) return [];

  // Score each paragraph by keyword matches
  const scored = paragraphs.map((text, paragraphIndex) => {
    const lower = text.toLowerCase();
    let matchCount = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        matchCount++;
      }
    }
    return { text: text.trim(), paragraphIndex, matchCount };
  });

  // Filter to paragraphs with at least one match, sort by match density
  const relevant = scored
    .filter((p) => p.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, 3);

  return relevant.map(({ text, paragraphIndex }) => ({
    text: text.length > 400 ? text.slice(0, 400) + '...' : text,
    paragraphIndex,
  }));
}

export function ScorecardMeetingLink({
  meetingId,
  skillName,
  score,
  children,
}: ScorecardMeetingLinkProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [excerpts, setExcerpts] = useState<TranscriptExcerpt[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const fetchExcerpts = useCallback(async () => {
    if (excerpts !== null || loading) return;

    try {
      setLoading(true);
      setFetchError(null);

      const { data, error } = await supabase
        .from('meetings')
        .select('transcript_text, title, meeting_start')
        .eq('id', meetingId)
        .maybeSingle();

      if (error) throw error;

      if (!data?.transcript_text) {
        setExcerpts([]);
        return;
      }

      const found = findRelevantExcerpts(data.transcript_text, skillName);
      setExcerpts(found);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch transcript');
      setExcerpts([]);
    } finally {
      setLoading(false);
    }
  }, [meetingId, skillName, excerpts, loading]);

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      fetchExcerpts();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'cursor-pointer transition-all',
            'hover:underline hover:decoration-dotted hover:underline-offset-2',
            score < 60 && 'text-red-500 hover:text-red-600',
            score >= 60 && score < 70 && 'text-yellow-600 hover:text-yellow-700',
          )}
          title={`View transcript excerpt for ${skillName.replace(/_/g, ' ')}`}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-96 max-h-80 overflow-y-auto"
        side="right"
        align="start"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium capitalize">
                {skillName.replace(/_/g, ' ')}
              </span>
            </div>
            <span className={cn(
              'text-xs font-medium px-2 py-0.5 rounded-full',
              score < 60 && 'bg-red-500/10 text-red-600',
              score >= 60 && score < 70 && 'bg-yellow-500/10 text-yellow-600',
            )}>
              {Math.round(score)}%
            </span>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {fetchError && (
            <p className="text-xs text-destructive">{fetchError}</p>
          )}

          {!loading && excerpts !== null && excerpts.length === 0 && !fetchError && (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No matching transcript section found
            </p>
          )}

          {!loading && excerpts && excerpts.length > 0 && (
            <div className="space-y-2">
              {excerpts.map((excerpt, i) => (
                <div
                  key={i}
                  className="p-2 bg-muted/50 rounded text-xs leading-relaxed text-muted-foreground"
                >
                  {excerpt.text}
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate(`/meetings/${meetingId}`);
            }}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors w-full pt-1 border-t border-border"
          >
            <ExternalLink className="h-3 w-3" />
            View Full Meeting
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default ScorecardMeetingLink;
