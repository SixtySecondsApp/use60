import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { BookOpen, Search, Menu, X, Copy, Check, ChevronRight, FileText, Clock, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DocsFeedback } from '@/components/docs/DocsFeedback';
import { SkillLevelBlock } from '@/components/docs/SkillLevelBlock';
import { CalloutBlock } from '@/components/docs/CalloutBlock';
import { TableOfContents } from '@/components/docs/TableOfContents';
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

interface OrgContext {
  tables?: Array<{ name: string; id: string }>;
  columns?: Array<{ name: string; type: string }>;
  orgName?: string;
  userFirstName?: string;
  contacts?: Array<{ name: string }>;
  deals?: Array<{ name: string }>;
  companies?: Array<{ name: string }>;
  meetingTitle?: string;
  enabledIntegrations?: string[];
  userRole?: string;
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

// Category icon colors — expanded for all doc categories
const categoryColors: Record<string, { bg: string; text: string; dot: string }> = {
  'Getting Started': { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  'Core Features': { bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
  'Pipeline & Deals': { bg: 'bg-indigo-50 dark:bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400', dot: 'bg-indigo-500' },
  'Meetings': { bg: 'bg-sky-50 dark:bg-sky-500/10', text: 'text-sky-600 dark:text-sky-400', dot: 'bg-sky-500' },
  'AI Copilot': { bg: 'bg-purple-50 dark:bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-500' },
  'Contacts & CRM': { bg: 'bg-teal-50 dark:bg-teal-500/10', text: 'text-teal-600 dark:text-teal-400', dot: 'bg-teal-500' },
  'Tasks & Activity': { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  'Integrations': { bg: 'bg-rose-50 dark:bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', dot: 'bg-rose-500' },
  'Admin & Settings': { bg: 'bg-slate-50 dark:bg-slate-500/10', text: 'text-slate-600 dark:text-slate-400', dot: 'bg-slate-500' },
  'Query Bar': { bg: 'bg-cyan-50 dark:bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400', dot: 'bg-cyan-500' },
  'Conversations': { bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
  'Workflows': { bg: 'bg-orange-50 dark:bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500' },
  'Recipes': { bg: 'bg-lime-50 dark:bg-lime-500/10', text: 'text-lime-600 dark:text-lime-400', dot: 'bg-lime-500' },
  'Cross-Table': { bg: 'bg-fuchsia-50 dark:bg-fuchsia-500/10', text: 'text-fuchsia-600 dark:text-fuchsia-400', dot: 'bg-fuchsia-500' },
  'Insights & Predictions': { bg: 'bg-violet-50 dark:bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', dot: 'bg-violet-500' },
  'Advanced': { bg: 'bg-violet-50 dark:bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', dot: 'bg-violet-500' },
};

function getCategoryColor(category: string) {
  return categoryColors[category] || { bg: 'bg-gray-50 dark:bg-gray-500/10', text: 'text-gray-600 dark:text-gray-400', dot: 'bg-gray-500' };
}

// Category display order — internal users see all categories
const INTERNAL_CATEGORY_ORDER = [
  'Getting Started',
  'Core Features',
  'Pipeline & Deals',
  'Meetings',
  'AI Copilot',
  'Contacts & CRM',
  'Tasks & Activity',
  'Query Bar',
  'Conversations',
  'Workflows',
  'Recipes',
  'Cross-Table',
  'Insights & Predictions',
  'Integrations',
  'Admin & Settings',
  'Advanced',
];

// External users see customer-relevant categories first
const EXTERNAL_CATEGORY_ORDER = [
  'Getting Started',
  'Meetings',
  'Core Features',
  'Integrations',
  'Admin & Settings',
];

export default function DocsPage() {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { effectiveUserType } = useUserPermissions();

  // Fetch org context for personalized examples
  const { data: orgContext } = useQuery<OrgContext | null>({
    queryKey: ['docs-org-context'],
    queryFn: async () => {
      try {
        // Batch fetch org context
        const [tablesRes, profileRes, contactsRes, dealsRes, companiesRes, credentialsRes, membershipRes] = await Promise.all([
          supabase.from('dynamic_tables').select('id, name').limit(5),
          supabase.from('profiles').select('first_name, last_name').eq('id', (await supabase.auth.getUser()).data.user?.id || '').maybeSingle(),
          supabase.from('contacts').select('first_name, last_name').limit(3),
          supabase.from('deals').select('name').limit(3),
          supabase.from('companies').select('name').limit(3),
          supabase.from('integration_credentials').select('provider').eq('is_active', true),
          supabase.from('organization_memberships').select('role, organization:organizations(name)').eq('user_id', (await supabase.auth.getUser()).data.user?.id || '').maybeSingle(),
        ]);

        // Get columns from first table
        let columns: any[] = [];
        const firstTableId = tablesRes.data?.[0]?.id;
        if (firstTableId) {
          const { data: cols } = await supabase
            .from('dynamic_table_columns')
            .select('name, type')
            .eq('table_id', firstTableId)
            .limit(10);
          columns = cols || [];
        }

        return {
          tables: tablesRes.data || [],
          columns,
          userFirstName: profileRes.data?.first_name || undefined,
          orgName: (membershipRes.data?.organization as any)?.name || undefined,
          contacts: (contactsRes.data || []).map((c: any) => ({ name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Contact' })),
          deals: (dealsRes.data || []).map((d: any) => ({ name: d.name })),
          companies: (companiesRes.data || []).map((c: any) => ({ name: c.name })),
          enabledIntegrations: (credentialsRes.data || []).map((c: any) => c.provider),
          userRole: membershipRes.data?.role || 'member',
        };
      } catch (err) {
        console.error('Failed to load org context for docs:', err);
        return null;
      }
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
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
      return data || [];
    },
  });

  // Filter articles by org integrations and role, then group by category
  const groupedArticles = useMemo(() => {
    if (!articlesData) return {};

    const filtered = articlesData.filter((article) => {
      const meta = article.metadata || {};

      // Integration filter: if article requires specific integrations, check org has at least one
      if (meta.required_integrations && Array.isArray(meta.required_integrations) && meta.required_integrations.length > 0) {
        const enabled = orgContext?.enabledIntegrations || [];
        const hasAny = meta.required_integrations.some((req: string) => enabled.includes(req));
        if (!hasAny) return false;
      }

      // Role filter: if article targets specific roles, check user has one
      if (meta.target_roles && Array.isArray(meta.target_roles) && meta.target_roles.length > 0) {
        const userRole = orgContext?.userRole || 'member';
        if (!meta.target_roles.includes(userRole)) return false;
      }

      // Audience filter: if article specifies target_audience, check user type matches
      if (meta.target_audience && Array.isArray(meta.target_audience) && meta.target_audience.length > 0) {
        if (!meta.target_audience.includes(effectiveUserType)) return false;
      }

      return true;
    });

    // Group by category in display order (different order for external users)
    const categoryOrder = effectiveUserType === 'external' ? EXTERNAL_CATEGORY_ORDER : INTERNAL_CATEGORY_ORDER;
    const grouped: GroupedArticles = {};
    for (const cat of categoryOrder) {
      const catArticles = filtered.filter((a) => a.category === cat);
      if (catArticles.length > 0) grouped[cat] = catArticles;
    }
    // Include any uncategorized articles
    for (const article of filtered) {
      if (!categoryOrder.includes(article.category)) {
        if (!grouped[article.category]) grouped[article.category] = [];
        if (!grouped[article.category].find((a) => a.id === article.id)) {
          grouped[article.category].push(article);
        }
      }
    }

    return grouped;
  }, [articlesData, orgContext, effectiveUserType]);

  // Get selected article from already-fetched data
  const article = useMemo(() => {
    if (!selectedSlug || !articlesData) return null;
    return articlesData.find((a) => a.slug === selectedSlug) || null;
  }, [selectedSlug, articlesData]);

  // Auto-select first article on load
  useEffect(() => {
    if (!selectedSlug && groupedArticles) {
      const firstCategory = Object.keys(groupedArticles)[0];
      const firstArticle = groupedArticles[firstCategory]?.[0];
      if (firstArticle) {
        setSelectedSlug(firstArticle.slug);
      }
    }
  }, [groupedArticles, selectedSlug]);

  // Filter articles by search
  const filteredArticles = useMemo(() => {
    if (!searchQuery) return groupedArticles;
    const q = searchQuery.toLowerCase();
    return Object.entries(groupedArticles).reduce((acc, [category, articles]) => {
      const filtered = articles.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.content.toLowerCase().includes(q)
      );
      if (filtered.length > 0) acc[category] = filtered;
      return acc;
    }, {} as GroupedArticles);
  }, [groupedArticles, searchQuery]);

  // Handle initial hash-based navigation (runs once when articles load)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && articlesData) {
      const slug = hash.substring(1);
      const matchedArticle = articlesData.find((a) => a.slug === slug);
      if (matchedArticle) {
        setSelectedSlug(matchedArticle.slug);
      } else {
        const element = document.getElementById(slug);
        if (element) element.scrollIntoView({ behavior: 'smooth' });
      }
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [articlesData]);

  const handleArticleClick = (slug: string) => {
    setSelectedSlug(slug);
    setMobileMenuOpen(false);
    window.history.replaceState(null, '', `${window.location.pathname}#${slug}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Total article count (after filtering)
  const totalArticles = Object.values(filteredArticles).flat().length;

  // Process content: template vars + strip leading H1 (already shown in page header)
  const processedContent = useMemo(() => {
    if (!article) return '';
    let content = processTemplateVars(article.content, orgContext);
    // Remove the first H1 heading to avoid duplicate title
    content = content.replace(/^#\s+.+\n*/, '');
    return content;
  }, [article, orgContext]);

  // Parse content into segments (markdown + custom blocks)
  const contentSegments = useMemo(() => {
    return parseCustomBlocks(processedContent);
  }, [processedContent]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40">
        <div className="max-w-[90rem] mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-semibold text-gray-900 dark:text-gray-100">Documentation</span>
              {orgContext?.orgName && (
                <>
                  <span className="text-gray-400 dark:text-gray-500 mx-1">/</span>
                  <span className="text-gray-600 dark:text-gray-400 font-medium text-sm">{orgContext.orgName}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              {orgContext?.userFirstName && (
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium rounded-full">
                  <Sparkles className="w-3 h-3" />
                  Personalized
                </span>
              )}
              <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-medium rounded-full">
                {totalArticles} articles
              </span>
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

      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 py-6">
        <div className="flex gap-6">
          {/* Sidebar Navigation */}
          <aside
            className={`
              w-64 shrink-0 lg:block
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
                rounded-xl overflow-hidden max-h-[calc(100vh-6rem)] overflow-y-auto
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
                            <span className="text-[10px] text-gray-400 dark:text-gray-600 ml-auto">
                              {articles.length}
                            </span>
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
          <main className="flex-1 min-w-0">
            {isLoading ? (
              <div className="bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl p-8">
                <div className="space-y-4">
                  <div className="h-8 w-2/3 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse" />
                  <div className="h-4 w-1/4 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
                  <div className="space-y-3 mt-8">
                    <div className="h-4 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
                    <div className="h-4 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
                    <div className="h-4 w-3/4 bg-gray-100 dark:bg-gray-800/50 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ) : article ? (
              <div className="flex gap-6">
                {/* Article Card */}
                <div className="flex-1 min-w-0 bg-white dark:bg-gray-900/80 dark:backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 rounded-xl overflow-hidden">
                  {/* Article Header */}
                  <div className="p-6 sm:p-8 border-b border-gray-200 dark:border-gray-800">
                    <div className="flex items-center gap-2 mb-4">
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

                  {/* Article Body — renders segments (markdown + custom blocks) */}
                  <div className="p-6 sm:p-8">
                    {contentSegments.map((segment, i) => {
                      if (segment.type === 'skill') {
                        return (
                          <SkillLevelBlock key={i} level={segment.level as any}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {segment.content}
                            </ReactMarkdown>
                          </SkillLevelBlock>
                        );
                      }
                      if (segment.type === 'callout') {
                        return (
                          <CalloutBlock key={i} type={segment.level as any}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {segment.content}
                            </ReactMarkdown>
                          </CalloutBlock>
                        );
                      }
                      if (segment.type === 'try-it' && segment.meta?.tableId) {
                        return (
                          <div key={i} className="my-4">
                            <TryItButton
                              tableId={segment.meta.tableId}
                              query={segment.meta.query}
                              label={segment.meta.label}
                            />
                          </div>
                        );
                      }
                      // Regular markdown
                      return (
                        <article key={i} className="prose prose-gray dark:prose-invert max-w-none
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
                              code({ inline, className, children, ...props }: any) {
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
                                <h1 id={slugify(String(children))} {...props}>{children}</h1>
                              ),
                              h2: ({ children, ...props }: any) => (
                                <h2 id={slugify(String(children))} className="scroll-mt-24" {...props}>{children}</h2>
                              ),
                              h3: ({ children, ...props }: any) => (
                                <h3 id={slugify(String(children))} className="scroll-mt-24" {...props}>{children}</h3>
                              ),
                            }}
                          >
                            {segment.content}
                          </ReactMarkdown>
                        </article>
                      );
                    })}
                  </div>

                  {/* Feedback Section */}
                  <div className="px-6 sm:px-8 py-6 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
                    <DocsFeedback articleId={article.id} />
                  </div>
                </div>

                {/* Table of Contents (right side, desktop only) */}
                <TableOfContents content={processedContent} />
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

// Content segment types
interface ContentSegment {
  type: 'markdown' | 'skill' | 'callout' | 'try-it';
  level: string; // 'beginner'|'intermediate'|'advanced' for skill, 'tip'|'warning'|'info'|'note' for callout
  content: string;
  meta?: Record<string, string>; // extra data for try-it blocks (tableId, query, label)
}

// Parse content into segments, extracting :::level and :::try-it blocks
function parseCustomBlocks(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const skillLevels = ['beginner', 'intermediate', 'advanced'];
  const calloutTypes = ['tip', 'warning', 'info', 'note'];
  const allTypes = [...skillLevels, ...calloutTypes];

  let lastIndex = 0;
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Match :::try-it{tableId="abc" query="..." label="..."}
    const tryItMatch = line.match(/^:::try-it\{(.+)\}$/);
    if (tryItMatch) {
      // Flush preceding markdown
      const precedingLines = lines.slice(lastIndex, i);
      const precedingText = precedingLines.join('\n').trim();
      if (precedingText) {
        segments.push({ type: 'markdown', level: '', content: precedingText });
      }

      // Parse key="value" pairs
      const meta: Record<string, string> = {};
      const attrStr = tryItMatch[1];
      const attrRegex = /(\w+)="([^"]*)"/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
        meta[attrMatch[1]] = attrMatch[2];
      }

      segments.push({ type: 'try-it', level: '', content: '', meta });
      lastIndex = i + 1;
      i++;
      continue;
    }

    const openMatch = line.match(new RegExp(`^:::(${allTypes.join('|')})$`));

    if (openMatch) {
      // Flush preceding markdown
      const precedingLines = lines.slice(lastIndex, i);
      const precedingText = precedingLines.join('\n').trim();
      if (precedingText) {
        segments.push({ type: 'markdown', level: '', content: precedingText });
      }

      const blockType = openMatch[1];
      const isSkill = skillLevels.includes(blockType);

      // Find closing :::
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== ':::') {
        j++;
      }

      const blockContent = lines.slice(i + 1, j).join('\n').trim();
      segments.push({
        type: isSkill ? 'skill' : 'callout',
        level: blockType,
        content: blockContent,
      });

      lastIndex = j + 1;
      i = j + 1;
    } else {
      i++;
    }
  }

  // Flush remaining markdown
  const remainingLines = lines.slice(lastIndex);
  const remainingText = remainingLines.join('\n').trim();
  if (remainingText) {
    segments.push({ type: 'markdown', level: '', content: remainingText });
  }

  return segments;
}

// Process template variables in content with rich org context
function processTemplateVars(content: string, orgContext: OrgContext | null | undefined): string {
  if (!orgContext) return content;

  let processed = content;

  // Table/column vars
  if (orgContext.tables?.[0]) {
    processed = processed.replace(/\{\{table_name\}\}/g, orgContext.tables[0].name);
  }
  if (orgContext.columns?.[0]) {
    processed = processed.replace(/\{\{column_name\}\}/g, orgContext.columns[0].name);
  }

  // Org & user vars
  if (orgContext.orgName) {
    processed = processed.replace(/\{\{org_name\}\}/g, orgContext.orgName);
  }
  if (orgContext.userFirstName) {
    processed = processed.replace(/\{\{user_first_name\}\}/g, orgContext.userFirstName);
  }

  // Entity vars — use real data or sensible fallbacks
  const contactName = orgContext.contacts?.[0]?.name || 'Sarah Johnson';
  const dealName = orgContext.deals?.[0]?.name || 'Enterprise Deal';
  const companyName = orgContext.companies?.[0]?.name || 'Acme Corp';

  processed = processed.replace(/\{\{contact_name\}\}/g, contactName);
  processed = processed.replace(/\{\{deal_name\}\}/g, dealName);
  processed = processed.replace(/\{\{company_name\}\}/g, companyName);
  processed = processed.replace(/\{\{meeting_title\}\}/g, orgContext.meetingTitle || 'Quarterly Review');

  // Conditional blocks: {{#if variable_name}}...{{/if}}
  const conditionalRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  processed = processed.replace(conditionalRegex, (_match, varName, blockContent) => {
    // Integration checks: {{#if hubspot_enabled}}
    if (varName.endsWith('_enabled')) {
      const integration = varName.replace('_enabled', '');
      const enabled = orgContext.enabledIntegrations || [];
      return enabled.includes(integration) ? blockContent : '';
    }
    // Generic variable checks: {{#if user_first_name}}
    const varLookup: Record<string, any> = {
      user_first_name: orgContext.userFirstName,
      org_name: orgContext.orgName,
      table_name: orgContext.tables?.[0]?.name,
      contact_name: orgContext.contacts?.[0]?.name,
      deal_name: orgContext.deals?.[0]?.name,
      company_name: orgContext.companies?.[0]?.name,
    };
    return varLookup[varName] ? blockContent : '';
  });

  return processed;
}
