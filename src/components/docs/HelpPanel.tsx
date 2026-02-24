import { useState } from 'react';
import { HelpCircle, X, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DocsFeedback } from './DocsFeedback';
import { CalloutBlock } from './CalloutBlock';

interface HelpPanelProps {
  docSlug: string;
  tooltip?: string;
  className?: string;
}

interface ContentSegment {
  type: 'markdown' | 'callout';
  level: string;
  content: string;
}

function parseCalloutBlocks(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const calloutTypes = ['tip', 'warning', 'info', 'note'];
  const lines2 = content.split('\n');
  let lastIndex = 0;
  let i = 0;

  while (i < lines2.length) {
    const line = lines2[i].trim();
    const openMatch = line.match(new RegExp('^:::(' + calloutTypes.join('|') + ')$'));

    if (openMatch) {
      const precedingText = lines2.slice(lastIndex, i).join('\n').trim();
      if (precedingText) {
        segments.push({ type: 'markdown', level: '', content: precedingText });
      }

      const blockType = openMatch[1];
      let j = i + 1;
      while (j < lines2.length && lines2[j].trim() !== ':::') {
        j++;
      }

      const blockContent = lines2.slice(i + 1, j).join('\n').trim();
      segments.push({ type: 'callout', level: blockType, content: blockContent });

      lastIndex = j + 1;
      i = j + 1;
    } else {
      i++;
    }
  }

  const remainingText = lines2.slice(lastIndex).join('\n').trim();
  if (remainingText) {
    segments.push({ type: 'markdown', level: '', content: remainingText });
  }

  return segments;
}

export function HelpPanel({ docSlug, tooltip = 'Learn more', className }: HelpPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { data: article, isLoading } = useQuery({
    queryKey: ['docs-help-panel', docSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('docs_articles')
        .select('id, slug, title, category, content, updated_at')
        .eq('slug', docSlug)
        .eq('published', true)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: isOpen,
  });

  const segments = article?.content ? parseCalloutBlocks(article.content) : [];

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors ${className || ''}`}
        title={tooltip}
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="fixed top-16 left-0 right-0 bottom-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30 dark:bg-black/50"
            onClick={() => setIsOpen(false)}
          />

          <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700/50 shadow-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2.5">
                <HelpCircle className="w-5 h-5 text-blue-500" />
                <span className="font-semibold text-gray-900 dark:text-white">
                  {article?.title || 'Help'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/docs#${docSlug}`}
                  className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
                  title="Open in Docs"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-6">
              {isLoading ? (
                <div className="space-y-3">
                  <div className="h-6 w-2/3 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse" />
                  <div className="h-4 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
                  <div className="h-4 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
                  <div className="h-4 w-3/4 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
                </div>
              ) : article ? (
                <article className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-gray-900 dark:prose-headings:text-white prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-3 prose-h3:text-base prose-h3:mt-5 prose-h3:mb-2 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:leading-relaxed prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-code:text-gray-800 dark:prose-code:text-gray-200 prose-code:bg-gray-100 dark:prose-code:bg-gray-800/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-li:text-gray-700 dark:prose-li:text-gray-300">
                  {segments.map((segment, idx) =>
                    segment.type === 'callout' ? (
                      <div key={idx} className="not-prose">
                        <CalloutBlock type={segment.level as 'tip' | 'warning' | 'info' | 'note'}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {segment.content}
                          </ReactMarkdown>
                        </CalloutBlock>
                      </div>
                    ) : (
                      <ReactMarkdown key={idx} remarkPlugins={[remarkGfm]}>
                        {segment.content}
                      </ReactMarkdown>
                    )
                  )}
                </article>
              ) : (
                <div className="text-center py-8">
                  <HelpCircle className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    Documentation not available yet.
                  </p>
                </div>
              )}
            </div>

            {article && (
              <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
                <DocsFeedback articleId={article.id} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
