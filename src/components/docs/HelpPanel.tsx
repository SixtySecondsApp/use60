import { useState, useEffect } from 'react';
import { HelpCircle, X, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
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

// Inline fallback content for slugs that may not yet be seeded in the DB.
// Once the migration runs, DB content takes precedence automatically.
const FALLBACK_CONTENT: Record<string, { title: string; content: string }> = {
  'integrations-overview': {
    title: 'Integrations',
    content: `# Integrations

Connect your favourite tools to 60 and let AI work across your entire sales stack. Each integration feeds context into the platform so your copilot, pipeline, and meeting intelligence get smarter with every connection.

## Available Integrations

### CRM
- **HubSpot** — Bi-directional sync. Deals, contacts, and activities flow both ways so your CRM stays up to date without manual entry.
- **Attio** — Bi-directional CRM sync with AI writeback for enriched contact and company data.

### Meeting Intelligence
- **Fathom** — Automatically sync meeting recordings, transcripts, and AI-generated summaries.
- **Fireflies.ai** — Import meeting notes, transcripts, and action items.
- **JustCall** — Sync call recordings and transcripts from your phone system.
- **60 Notetaker** — 60's built-in AI meeting recorder. Joins your calls automatically and captures everything.

### Calendar & Scheduling
- **Google Workspace** — Connect Gmail, Calendar, Drive, and Tasks. Powers email sync, meeting prep, and calendar intelligence.
- **SavvyCal** — Instant booking links for frictionless scheduling.

### Outreach & Prospecting
- **Instantly** — Monitor email campaign performance, classify replies, and trigger follow-ups.
- **Apollo.io** — Sales intelligence and lead search. Enrich contacts with verified emails and company data.
- **AI Ark** — B2B data and AI-powered company and people search.

### Automation
- **Apify** — Run web scrapers and automation actors to pull data from any website into your Ops tables.

### Communication
- **Slack** — Get deal alerts, meeting summaries, and AI briefings delivered straight to your channels.

## How Integrations Work

1. **Connect** — Click the integration card and follow the setup steps (usually just an API key or OAuth sign-in).
2. **Configure** — Choose what data to sync and how often.
3. **Use** — Once connected, 60 automatically pulls data into your pipeline, contacts, and meeting intelligence. Your AI Copilot gains access to richer context for better recommendations.

:::tip
Start with Google Workspace and one meeting recorder. These two integrations unlock the most value from 60's AI features.
:::

## Managing Integrations

- **Active** integrations show a green badge and can be configured or disconnected at any time.
- **Inactive** integrations show a grey badge and are ready to connect.
- Disconnecting an integration does not delete previously synced data.`,
  },
  'meetings-overview': {
    title: 'Meetings',
    content: `# Meetings

Your central hub for every sales conversation. 60 automatically syncs recordings, transcripts, and AI-generated summaries from your connected meeting recorders so you never lose context.

## What You'll Find Here

- **All Recordings** — Every synced meeting from Fathom, Fireflies, JustCall, or 60 Notetaker in one unified list.
- **AI Summaries** — Each meeting gets an automatic summary with key topics, action items, and sentiment analysis.
- **Transcripts** — Full searchable transcripts with speaker labels and timestamps.
- **Coaching Scores** — Performance grades, talk-time ratios, and coaching recommendations for every call.

## Getting Started

1. **Connect a recorder** — Go to Integrations and connect Fathom, Fireflies, JustCall, or enable 60 Notetaker.
2. **Sync** — Meetings appear automatically after your next call. Historical meetings are backfilled on first sync.
3. **Review** — Click any meeting to view the full transcript, AI summary, action items, and analytics.

:::tip
Enable 60 Notetaker for automatic recording — it joins your calendar meetings and captures everything without any extra software.
:::

## Meeting Details

Click into any meeting to see:
- **Summary** — AI-generated overview of what was discussed
- **Action Items** — Extracted commitments and follow-ups
- **Sentiment** — How the conversation went (positive, neutral, negative)
- **Analytics** — Talk-time balance, question count, and coaching insights
- **Transcript** — Full text with speaker attribution`,
  },
  'insights-overview': {
    title: 'Insights',
    content: `# Insights

AI-powered analytics across all your meetings. Search conversations, track performance trends, get coaching recommendations, and schedule automated reports — all in one place.

## Tabs

### Dashboard
Team-level analytics including meeting volume, average performance scores, pipeline health, and week-over-week trends. See at a glance how your team is performing.

### Transcripts
Browse and search all meeting transcripts. Use AI-powered search to find specific topics, objections, or commitments across every conversation.

### Insights
Detailed performance breakdowns, coaching recommendations, and pattern analysis derived from your meeting data.

### Reports
Generate and schedule automated reports. Preview before sending, deliver to Slack webhooks or email, and track report history.

## AI Search

Use the search bar to ask questions across all your meetings:
- *"What objections came up about pricing?"*
- *"Which deals mentioned a competitor?"*
- *"Show me meetings where next steps were unclear"*

:::tip
The more meetings you record, the smarter Insights gets. AI recommendations and trend analysis improve with volume.
:::

## Reports & Notifications

1. **Preview** — Generate a report preview to review before sending.
2. **Send** — Deliver to all configured notification channels (Slack, email).
3. **Schedule** — Set up daily or weekly automated reports in Notification Settings.`,
  },
};

export function HelpPanel({ docSlug, tooltip = 'Learn more', className }: HelpPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Lock body scroll when panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

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

  // Use DB article if found, otherwise fall back to inline content
  const fallback = FALLBACK_CONTENT[docSlug];
  const resolvedArticle = article ?? (fallback ? { id: null, slug: docSlug, title: fallback.title, category: '', content: fallback.content, updated_at: null } : null);
  const segments = resolvedArticle?.content ? parseCalloutBlocks(resolvedArticle.content) : [];

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors ${className || ''}`}
        title={tooltip}
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed top-16 left-0 right-0 bottom-0 z-50 flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/30 dark:bg-black/50"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative w-full max-w-lg bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700/50 shadow-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2.5">
                <HelpCircle className="w-5 h-5 text-blue-500" />
                <span className="font-semibold text-gray-900 dark:text-white">
                  {resolvedArticle?.title || 'Help'}
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

            <div className="flex-1 overflow-y-auto px-5 py-6 scrollbar-custom">
              {isLoading ? (
                <div className="space-y-3">
                  <div className="h-6 w-2/3 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse" />
                  <div className="h-4 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
                  <div className="h-4 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
                  <div className="h-4 w-3/4 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
                </div>
              ) : resolvedArticle ? (
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
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
                    Documentation for this section is coming soon.
                  </p>
                  <a
                    href="https://use60.com/support"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Visit use60.com/support for help
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>

            {article?.id && (
              <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
                <DocsFeedback articleId={article.id} />
              </div>
            )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
