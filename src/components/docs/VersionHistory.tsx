import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { Clock, RotateCcw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface VersionHistoryProps {
  articleId: string;
  onRevert?: (versionId: string) => void;
}

export function VersionHistory({ articleId, onRevert }: VersionHistoryProps) {
  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['docs-versions', articleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('docs_versions')
        .select('id, version_number, content, changed_by, diff_summary, created_at')
        .eq('article_id', articleId)
        .order('version_number', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 text-center text-slate-500">
        Loading version history...
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="p-4 text-center text-slate-500">
        No version history yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {versions.map((version) => (
        <div
          key={version.id}
          className="p-3 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-1">
                <span className="font-semibold text-sm">
                  Version {version.version_number}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center">
                  <Clock className="w-3 h-3 mr-1" />
                  {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
                </span>
              </div>
              {version.diff_summary && (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {version.diff_summary}
                </p>
              )}
            </div>
            {onRevert && (
              <button
                onClick={() => onRevert(version.id)}
                className="ml-4 p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                title="Revert to this version"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
