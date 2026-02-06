import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { BookOpen, Search, Menu, X, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { DocsFeedback } from '@/components/docs/DocsFeedback';
import { PersonalizedExample } from '@/components/docs/PersonalizedExample';
import { TryItButton } from '@/components/docs/TryItButton';
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
    <div className="relative group">
      <pre className={className}>
        <code>{children}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-2 rounded-lg bg-slate-800 hover:bg-slate-700
          opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Copy code"
      >
        {copied ? (
          <Check className="w-4 h-4 text-green-400" />
        ) : (
          <Copy className="w-4 h-4 text-slate-300" />
        )}
      </button>
    </div>
  );
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

  // Fetch all published articles
  const { data: articlesData, isLoading } = useQuery({
    queryKey: ['docs-articles'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('docs-api', {
        method: 'GET',
        body: null,
      });

      if (error) throw error;
      return data.data as GroupedArticles;
    },
  });

  // Fetch selected article
  const { data: article, isLoading: isLoadingArticle } = useQuery({
    queryKey: ['docs-article', selectedSlug],
    queryFn: async () => {
      if (!selectedSlug) return null;

      const { data, error } = await supabase.functions.invoke('docs-api', {
        method: 'GET',
        body: null,
      });

      if (error) throw error;

      // Find article in grouped data
      const allArticles = Object.values(articlesData || {}).flat();
      return allArticles.find((a) => a.slug === selectedSlug) || null;
    },
    enabled: !!selectedSlug,
  });

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

  // Scroll to section when hash changes
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const element = document.getElementById(hash.substring(1));
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [selectedSlug]);

  const handleArticleClick = (slug: string) => {
    setSelectedSlug(slug);
    setMobileMenuOpen(false);
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900">
      {/* Mobile menu toggle */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="fixed top-4 right-4 z-50 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-lg lg:hidden"
      >
        {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Main Content - Article Display */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 lg:px-12 py-12">
          {isLoadingArticle ? (
            <div className="text-center py-12 text-slate-500">Loading article...</div>
          ) : article ? (
            <article className="prose prose-slate dark:prose-invert max-w-none">
              <h1 className="text-4xl font-bold mb-4">{article.title}</h1>
              <div className="text-sm text-slate-500 dark:text-slate-400 mb-8">
                Last updated:{' '}
                {new Date(article.updated_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>

              <ReactMarkdown
                components={{
                  code({ node, inline, className, children, ...props }) {
                    if (inline) {
                      return <code className={className} {...props}>{children}</code>;
                    }
                    return (
                      <CodeBlock className={className}>
                        {String(children).replace(/\n$/, '')}
                      </CodeBlock>
                    );
                  },
                  h1: ({ children, ...props }) => (
                    <h1 id={slugify(String(children))} {...props}>
                      {children}
                    </h1>
                  ),
                  h2: ({ children, ...props }) => (
                    <h2 id={slugify(String(children))} {...props}>
                      {children}
                    </h2>
                  ),
                  h3: ({ children, ...props }) => (
                    <h3 id={slugify(String(children))} {...props}>
                      {children}
                    </h3>
                  ),
                }}
              >
                {processTemplateVars(article.content, orgData)}
              </ReactMarkdown>

              {/* Feedback Section */}
              <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
                <DocsFeedback articleId={article.id} />
              </div>
            </article>
          ) : (
            <div className="text-center py-12 text-slate-500">
              Select an article from the sidebar
            </div>
          )}
        </div>
      </main>

      {/* Sidebar Navigation - Right Side */}
      <aside
        className={`
          fixed lg:sticky top-0 right-0 h-screen w-80 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700
          overflow-y-auto transition-transform duration-300 z-40
          ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="p-6">
          <div className="flex items-center space-x-2 mb-6">
            <BookOpen className="w-6 h-6 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Navigation
            </h2>
          </div>

          {/* Search */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search docs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg
                  bg-white dark:bg-slate-700 text-slate-900 dark:text-white
                  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Category-grouped navigation */}
          {isLoading ? (
            <div className="text-center py-8 text-slate-500">Loading...</div>
          ) : (
            <nav className="space-y-6">
              {Object.entries(filteredArticles).map(([category, articles]) => (
                <div key={category}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    {category}
                  </h3>
                  <ul className="space-y-1">
                    {articles.map((article) => (
                      <li key={article.slug}>
                        <button
                          onClick={() => handleArticleClick(article.slug)}
                          className={`
                            w-full text-left px-3 py-2 rounded-lg text-sm transition-colors
                            ${
                              selectedSlug === article.slug
                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }
                          `}
                        >
                          {article.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          )}
        </div>
      </aside>
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
