/**
 * Response Grading Component
 * 
 * LAB-005: Rate AI responses on quality dimensions.
 * 
 * Features:
 * - Rate accuracy, helpfulness, tone, actionability (1-5)
 * - Store grades linked to message_id
 * - Optional feedback text
 * - Show aggregate scores in Quality Dashboard
 * 
 * @see docs/PRD_PROACTIVE_AI_TEAMMATE.md
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Star,
  ThumbsUp,
  ThumbsDown,
  Send,
  Loader2,
  Target,
  HelpCircle,
  MessageSquare,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrganization } from '@/lib/hooks/useActiveOrganization';

// ============================================================================
// Types
// ============================================================================

interface GradingDimension {
  id: 'accuracy' | 'helpfulness' | 'tone' | 'actionability';
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface ResponseGradingProps {
  messageId?: string;
  conversationId?: string;
  promptLibraryId?: string;
  userPrompt: string;
  assistantResponse: string;
  responseType?: string;
  sequenceKey?: string;
  executionDuration?: number;
  tokenCount?: number;
  onGradeSubmitted?: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const DIMENSIONS: GradingDimension[] = [
  {
    id: 'accuracy',
    label: 'Accuracy',
    description: 'Was the information correct?',
    icon: Target,
  },
  {
    id: 'helpfulness',
    label: 'Helpfulness',
    description: 'Did it address the request?',
    icon: HelpCircle,
  },
  {
    id: 'tone',
    label: 'Tone',
    description: 'Was the tone appropriate?',
    icon: MessageSquare,
  },
  {
    id: 'actionability',
    label: 'Actionability',
    description: 'Can you act on this?',
    icon: Zap,
  },
];

// ============================================================================
// Component
// ============================================================================

export function ResponseGrading({
  messageId,
  conversationId,
  promptLibraryId,
  userPrompt,
  assistantResponse,
  responseType,
  sequenceKey,
  executionDuration,
  tokenCount,
  onGradeSubmitted,
}: ResponseGradingProps) {
  const { organizationId } = useActiveOrganization();
  const queryClient = useQueryClient();

  const [scores, setScores] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState('');
  const [isPositive, setIsPositive] = useState<boolean | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Submit grade mutation
  const submitMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('copilot_response_grades')
        .insert({
          organization_id: organizationId,
          graded_by: user.id,
          message_id: messageId,
          conversation_id: conversationId,
          prompt_library_id: promptLibraryId,
          user_prompt: userPrompt,
          assistant_response: assistantResponse,
          response_type: responseType,
          sequence_key: sequenceKey,
          accuracy_score: scores.accuracy || null,
          helpfulness_score: scores.helpfulness || null,
          tone_score: scores.tone || null,
          actionability_score: scores.actionability || null,
          feedback_text: feedback || null,
          is_positive: isPositive,
          execution_duration_ms: executionDuration,
          token_count: tokenCount,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Feedback submitted');
      queryClient.invalidateQueries({ queryKey: ['response-grades'] });
      onGradeSubmitted?.();
      // Reset form
      setScores({});
      setFeedback('');
      setIsPositive(null);
      setIsExpanded(false);
    },
    onError: (error) => {
      toast.error(`Failed to submit: ${error.message}`);
    },
  });

  const hasAnyScore = Object.values(scores).some(s => s > 0);

  return (
    <Card className="border-dashed">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Star className="w-4 h-4" />
            Rate this response
          </CardTitle>
          
          {/* Quick thumbs */}
          <div className="flex items-center gap-1">
            <Button
              variant={isPositive === true ? 'default' : 'ghost'}
              size="sm"
              onClick={() => {
                setIsPositive(true);
                setIsExpanded(true);
              }}
              className={cn(
                'h-7 w-7 p-0',
                isPositive === true && 'bg-green-500 hover:bg-green-600'
              )}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant={isPositive === false ? 'default' : 'ghost'}
              size="sm"
              onClick={() => {
                setIsPositive(false);
                setIsExpanded(true);
              }}
              className={cn(
                'h-7 w-7 p-0',
                isPositive === false && 'bg-red-500 hover:bg-red-600'
              )}
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 space-y-4">
          {/* Dimension Ratings */}
          <div className="grid grid-cols-2 gap-3">
            {DIMENSIONS.map((dim) => (
              <div key={dim.id} className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <dim.icon className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs font-medium">{dim.label}</span>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      onClick={() => setScores({ ...scores, [dim.id]: value })}
                      className={cn(
                        'w-7 h-7 rounded text-xs font-medium transition-all',
                        scores[dim.id] === value
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Feedback Text */}
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Additional feedback (optional)
            </label>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What could be improved?"
              rows={2}
              className="mt-1 text-sm"
            />
          </div>

          {/* Context Info */}
          {(responseType || sequenceKey) && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {responseType && (
                <Badge variant="secondary" className="text-xs">
                  {responseType}
                </Badge>
              )}
              {sequenceKey && (
                <Badge variant="outline" className="text-xs">
                  {sequenceKey}
                </Badge>
              )}
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => submitMutation.mutate()}
              disabled={(!hasAnyScore && isPositive === null) || submitMutation.isPending}
            >
              {submitMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-1" />
              )}
              Submit
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ============================================================================
// Compact Inline Version
// ============================================================================

export function InlineResponseGrading({
  messageId,
  userPrompt,
  assistantResponse,
  responseType,
}: {
  messageId?: string;
  userPrompt: string;
  assistantResponse: string;
  responseType?: string;
}) {
  const { organizationId } = useActiveOrganization();
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = useMutation({
    mutationFn: async (isPositive: boolean) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('copilot_response_grades')
        .insert({
          organization_id: organizationId,
          graded_by: user.id,
          message_id: messageId,
          user_prompt: userPrompt,
          assistant_response: assistantResponse.substring(0, 5000),
          response_type: responseType,
          is_positive: isPositive,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      setSubmitted(true);
      toast.success('Thanks for your feedback!');
    },
  });

  if (submitted) {
    return (
      <span className="text-xs text-gray-400">
        Thanks for the feedback!
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-400 mr-1">Helpful?</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => submitMutation.mutate(true)}
        disabled={submitMutation.isPending}
        className="h-6 w-6 p-0"
      >
        <ThumbsUp className="w-3 h-3 text-gray-400 hover:text-green-500" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => submitMutation.mutate(false)}
        disabled={submitMutation.isPending}
        className="h-6 w-6 p-0"
      >
        <ThumbsDown className="w-3 h-3 text-gray-400 hover:text-red-500" />
      </Button>
    </div>
  );
}

export default ResponseGrading;
