import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { BookOpen, Search, Menu, X, Copy, Check, ChevronRight, FileText, Clock } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DocsFeedback } from '@/components/docs/DocsFeedback';
import { toast } from 'sonner';

interface Article {
  id: string;
  slug: string;
  title: string;
  category: string;
  content: string;
  metadata: any;
  order_index: number;
  updated_at: string;
}

interface GroupedArticles {
  [category: string]: Article[];
}

// Code block with copy button
function CodeBlock({ children, className }: { children: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-xl border border-gray-200 dark:border-gray-700/50 overflow-hidden my-4">
      <pre className={`${className || ''} bg-gray-50 dark:bg-gray-800/50 p-4 overflow-x-auto`}>
        <code className="text-sm text-gray-800 dark:text-gray-200">{children}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 p-1.5 rounded-lg bg-gray-200/80 dark:bg-gray-700/80 hover:bg-gray-300 dark:hover:bg-gray-600
          opacity-0 group-hover:opacity-100 transition-all"
        aria-label="Copy code"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
        ) : (
          <Copy className="w-3.5 h-3.5 text-gray-500 dark:text-gray-300" />
        )}
      </button>
    </div>
  );
}

// Category icon colors
const categoryColors: Record<string, { bg: string; text: string; dot: string }> = {
  'Getting Started': { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  'Core Features': { bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
  'Advanced': { bg: 'bg-violet-50 dark:bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', dot: 'bg-violet-500' },
};

function getCategoryColor(category: string) {
  return categoryColors[category] || { bg: 'bg-gray-50 dark:bg-gray-500/10', text: 'text-gray-600 dark:text-gray-400', dot: 'bg-gray-500' };
}

export default function DocsPage() {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Fetch org tables and columns for personalized examples
  const { data: orgData } = useQuery({
    queryKey: ['ops-tables-for-docs'],
    queryFn: async () => {
      const { data: tables, error } = await supabase
        .from('dynamic_tables')
        .select('id, name')
        .limit(5);

      if (error) {
        console.error('Failed to load tables for personalization:', error);
        return null;
      }

      // Get columns from first table
      const firstTableId = tables?.[0]?.id;
      let columns: any[] = [];
      if (firstTableId) {
        const { data: cols } = await supabase
          .from('dynamic_table_columns')
          .select('name, type')
          .eq('table_id', firstTableId)
          .limit(10);
        columns = cols || [];
      }

      return { tables, columns };
    },
  });

  // Fetch all published articles directly from the table
  const { data: articlesData, isLoading } = useQuery({
    queryKey: ['docs-articles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('docs_articles')
        .select('id, slug, title, category, content, metadata, order_index, updated_at')
        .eq('published', true)
        .order('order_index');

      if (error) throw error;

      // Group by category in explicit display order
      const CATEGORY_ORDER = ['Getting Started', 'Core Features', 'Advanced'];
      const grouped: GroupedArticles = {};
      for (const cat of CATEGORY_ORDER) {
        const catArticles = (data || []).filter((a) => a.category === cat);
        if (catArticles.length > 0) grouped[cat] = catArticles;
      }
      // Include any other categories not in the predefined list
      for (const article of data || []) {
        if (!CATEGORY_ORDER.includes(article.category)) {
          if (!grouped[article.category]) grouped[article.category] = [];
          grouped[article.category].push(article);
        }
      }

      return grouped;
    },
  });

  // Get selected article from already-fetched data
  const article = useMemo(() => {
    if (!selectedSlug || !articlesData) return null;
    const allArticles = Object.values(articlesData).flat();
    return allArticles.find((a) => a.slug === selectedSlug) || null;
  }, [selectedSlug, articlesData]);

  // Auto-select first article on load
  useEffect(() => {
    if (!selectedSlug && articlesData) {
      const firstCategory = Object.keys(articlesData)[0];
      const firstArticle = articlesData[firstCategory]?.[0];
      if (firstArticle) {
        setSelectedSlug(firstArticle.slug);
      }
    }
  }, [articlesData, selectedSlug]);

  // Filter articles by search
  const filteredArticles = articlesData
    ? Object.entries(articlesData).reduce((acc, [category, articles]) => {
        const filtered = articles.filter(
          (a) =>
            a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            a.content.toLowerCase().includes(searchQuery.toLowerCase())
        );
        if (filtered.length > 0) {
          acc[category] = filtered;
        }
        return acc;
      }, {} as GroupedArticles)
    : {};

  // Handle initial hash-based navigation (runs once when articles load)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const slug = hash.substring(1);
      if (articlesData) {
        const allArticles = Object.values(articlesData).flat();
        const matchedArticle = allArticles.find((a) => a.slug === slug);
        if (matchedArticle) {
          setSelectedSlug(matchedArticle.slug);
        } else {
          const element = document.getElementById(slug);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
          }
        }
        // Clear hash so it doesn't override future sidebar clicks
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  }, [articlesData]);

  const handleArticleClick = (slug: string) => {
    setSelectedSlug(slug);
    setMobileMenuOpen(false);
    window.history.replaceState(null, '', `${window.location.pathname}#${slug}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Total article count
  const totalArticles = articlesData
    ? Object.values(articlesData).flat().length
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-semibold text-gray-900 dark:text-gray-100">Documentation</span>
              <span className="text-gray-400 dark:text-gray-500 mx-1">/</span>
              <span className="text-gray-600 dark:text-gray-400 font-medium text-sm">Ops Intelligence</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-medium rounded-full">
                {totalArticles} articles
              </span>
              {/* Mobile menu toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-lg transition-colors lg:hidden"
              >
                {mobileMenuOpen ? (
                  <X className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                ) : (
                  <Menu className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <aside
            className={`
              lg:col-span-1 lg:block
              ${mobileMenuOpen ? 'fixed inset-0 z-50 bg-black/50 lg:relative lg:bg-transparent' : 'hidden lg:block'}
            `}
            onClick={(e) => {
              if (e.target === e.currentTarget) setMobileMenuOpen(false);
            }}
          >
            <div
              className={`
                ${mobileMenuOpen ? 'fixed right-0 top-0 h-full w-80 z-50' : 'sticky top-24'}
                bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm
                border border-gray-200 dark:border-gray-700/50
                rounded-xl overflow-hidden
              `}
            >
              <div className="p-5">
                {/* Search */}
                <div className="relative mb-5">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search docs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-xl
                      text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
                      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>

                {/* Category-grouped navigation */}
                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="space-y-2">
                        <div className="h-3 w-20 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
                        <div className="h-9 bg-gray-100 dark:bg-gray-800/50 rounded-lg animate-pulse" />
                        <div className="h-9 bg-gray-100 dark:bg-gray-800/50 rounded-lg animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <nav className="space-y-5">
                    {Object.entries(filteredArticles).map(([category, articles]) => {
                      const colors = getCategoryColor(category);
                      return (
                        <div key={category}>
                          <div className="flex items-center gap-2 mb-2 px-3">
                            <div className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                              {category}
                            </h3>
                          </div>
                          <ul className="space-y-0.5">
                            {articles.map((a) => (
                              <li key={a.slug}>
                                <button
                                  onClick={() => handleArticleClick(a.slug)}
                                  className={`
                                    w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-2
                                    ${
                                      selectedSlug === a.slug
                                        ? `${colors.bg} ${colors.text} font-medium border border-transparent dark:border-current/20`
                                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50'
                                    }
                                  `}
                                >
                                  <FileText className="w-3.5 h-3.5 shrink-0 opacity-60" />
                                  <span className="truncate">{a.title}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </nav>
                )}
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="lg:col-span-3">
            {isLoading ? (
              <div className="bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl p-8">
                <div className="space-y-4">
                  <div className="h-8 w-2/3 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse" />
                  <div className="h-4 w-1/4 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
                  <div className="space-y-3 mt-8">
                    <div className="h-4 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
                    <div className="h-4 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
                    <div className="h-4 w-3/4 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
                    <div className="h-4 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
                    <div className="h-4 w-5/6 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ) : article ? (
              <div className="bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl overflow-hidden">
                {/* Article Header */}
                <div className="p-6 sm:p-8 border-b border-gray-200 dark:border-gray-800">
                  <div className="flex items-center gap-2 mb-4">
                    {/* Category breadcrumb */}
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getCategoryColor(article.category).bg} ${getCategoryColor(article.category).text}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${getCategoryColor(article.category).dot}`} />
                      {article.category}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-600" />
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{article.title}</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3">
                    {article.title}
                  </h1>
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      Updated{' '}
                      {new Date(article.updated_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                {/* Article Body */}
                <div className="p-6 sm:p-8">
                  <article className="prose prose-gray dark:prose-invert max-w-none
                    prose-headings:text-gray-900 dark:prose-headings:text-white prose-headings:font-semibold
                    prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-gray-200 dark:prose-h2:border-gray-800
                    prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-3
                    prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:leading-relaxed
                    prose-strong:text-gray-900 dark:prose-strong:text-white
                    prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
                    prose-code:text-gray-800 dark:prose-code:text-gray-200
                    prose-code:bg-gray-100 dark:prose-code:bg-gray-800/50
                    prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-sm prose-code:font-medium
                    prose-code:before:content-none prose-code:after:content-none
                    prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-li:leading-relaxed
                    prose-ul:my-4 prose-ol:my-4
                    prose-blockquote:border-blue-500 dark:prose-blockquote:border-blue-400
                    prose-blockquote:bg-blue-50/50 dark:prose-blockquote:bg-blue-500/5
                    prose-blockquote:rounded-r-xl prose-blockquote:py-1 prose-blockquote:px-4
                    prose-blockquote:text-gray-600 dark:prose-blockquote:text-gray-400 prose-blockquote:not-italic
                    prose-hr:border-gray-200 dark:prose-hr:border-gray-800"
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ node, inline, className, children, ...props }: any) {
                          if (inline) {
                            return <code className={className} {...props}>{children}</code>;
                          }
                          return (
                            <CodeBlock className={className}>
                              {String(children).replace(/\n$/, '')}
                            </CodeBlock>
                          );
                        },
                        table: ({ children, ...props }: any) => (
                          <div className="overflow-x-auto my-6 rounded-xl border border-gray-200 dark:border-gray-700/50">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700/50" {...props}>
                              {children}
                            </table>
                          </div>
                        ),
                        thead: ({ children, ...props }: any) => (
                          <thead className="bg-gray-50 dark:bg-gray-800/50" {...props}>{children}</thead>
                        ),
                        th: ({ children, ...props }: any) => (
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider" {...props}>
                            {children}
                          </th>
                        ),
                        td: ({ children, ...props }: any) => (
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 border-t border-gray-100 dark:border-gray-800" {...props}>
                            {children}
                          </td>
                        ),
                        h1: ({ children, ...props }: any) => (
                          <h1 id={slugify(String(children))} {...props}>
                            {children}
                          </h1>
                        ),
                        h2: ({ children, ...props }: any) => (
                          <h2 id={slugify(String(children))} className="scroll-mt-24" {...props}>
                            {children}
                          </h2>
                        ),
                        h3: ({ children, ...props }: any) => (
                          <h3 id={slugify(String(children))} className="scroll-mt-24" {...props}>
                            {children}
                          </h3>
                        ),
                      }}
                    >
                      {processTemplateVars(article.content, orgData)}
                    </ReactMarkdown>
                  </article>
                </div>

                {/* Feedback Section */}
                <div className="px-6 sm:px-8 py-6 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
                  <DocsFeedback articleId={article.id} />
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl p-12 text-center">
                <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="text-gray-500 dark:text-gray-400 font-medium">Select an article from the sidebar</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Choose a topic to get started</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

// Helper to create URL-safe slugs from headings
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// Process template variables in content
function processTemplateVars(content: string, orgData: any): string {
  if (!orgData) return content;

  let processed = content;

  // Replace {{table_name}}
  if (orgData.tables?.[0]) {
    processed = processed.replace(/\{\{table_name\}\}/g, orgData.tables[0].name);
  }

  // Replace {{column_name}}
  if (orgData.columns?.[0]) {
    processed = processed.replace(/\{\{column_name\}\}/g, orgData.columns[0].name);
  }

  return processed;
}
