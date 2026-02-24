import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

interface DocsFeedbackProps {
  articleId: string;
  sectionSlug?: string;
}

export function DocsFeedback({ articleId, sectionSlug }: DocsFeedbackProps) {
  const [voted, setVoted] = useState(false);

  const feedbackMutation = useMutation({
    mutationFn: async (helpful: boolean) => {
      const { error } = await supabase.functions.invoke('docs-api', {
        body: {
          action: 'feedback',
          article_id: articleId,
          helpful,
          section_slug: sectionSlug || null,
        },
      });

      if (error) throw error;
    },
    onSuccess: () => {
      setVoted(true);
      toast.success('Thanks for your feedback!');
    },
    onError: (error) => {
      toast.error(`Failed to submit feedback: ${error.message}`);
    },
  });

  const handleFeedback = (helpful: boolean) => {
    feedbackMutation.mutate(helpful);
  };

  if (voted) {
    return (
      <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
        <span>Thanks for your feedback!</span>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-4">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Was this helpful?
      </span>
      <div className="flex space-x-2">
        <button
          onClick={() => handleFeedback(true)}
          disabled={feedbackMutation.isPending}
          className="p-2 rounded-lg border border-gray-300 dark:border-gray-700
            hover:bg-green-50 dark:hover:bg-green-500/10 hover:border-green-500 dark:hover:border-green-500/30
            disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="This was helpful"
        >
          <ThumbsUp className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </button>
        <button
          onClick={() => handleFeedback(false)}
          disabled={feedbackMutation.isPending}
          className="p-2 rounded-lg border border-gray-300 dark:border-gray-700
            hover:bg-red-50 dark:hover:bg-red-500/10 hover:border-red-500 dark:hover:border-red-500/30
            disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="This was not helpful"
        >
          <ThumbsDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </button>
      </div>
    </div>
  );
}
