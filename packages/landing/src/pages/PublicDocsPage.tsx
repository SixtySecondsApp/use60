/**
 * PublicDocsPage — Public-facing documentation for use60.com/docs
 *
 * Fetches published + external articles from docs-public edge function.
 * Self-contained: all markdown rendering, callouts, skill blocks, and TOC are inline.
 * Styled to match V19 landing page (dark/light mode, glassmorphism).
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BookOpen, Search, Menu, X, Copy, Check, ChevronRight, FileText,
  Clock, ChevronDown, Lightbulb, AlertTriangle, Info, StickyNote,
  List, GraduationCap, Zap, Flame, ArrowLeft,
} from 'lucide-react';
import { NavbarV19 } from '../components/landing-v19/NavbarV19';
import { FooterV19 } from '../components/landing-v19/PremiumSectionsV19';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ygdpgliavpxeugaajgrb.supabase.co';
const THEME_KEY = 'v19-theme';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Article {
  id: string;
  slug: string;
  title: string;
  category: string;
  content?: string;
  metadata: Record<string, unknown>;
  order_index: number;
  updated_at: string;
}

interface GroupedArticles {
  [category: string]: Article[];
}

interface ContentSegment {
  type: 'markdown' | 'skill' | 'callout';
  level: string;
  content: string;
}

// ─── Category colors ─────────────────────────────────────────────────────────

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
};

function getCategoryColor(category: string) {
  return categoryColors[category] || { bg: 'bg-gray-50 dark:bg-gray-500/10', text: 'text-gray-600 dark:text-gray-400', dot: 'bg-gray-500' };
}

const CATEGORY_ORDER = [
  'Getting Started',
  'Core Features',
  'Meetings',
  'Pipeline & Deals',
  'AI Copilot',
  'Contacts & CRM',
  'Tasks & Activity',
  'Integrations',
  'Admin & Settings',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
}

function stripTemplateVars(content: string): string {
  // Remove {{#if ...}}...{{/if}} conditional blocks
  let result = content.replace(/\{\{#if\s+\w+\}\}[\s\S]*?\{\{\/if\}\}/g, '');
  // Replace template variables with friendly defaults
  result = result.replace(/\{\{user_first_name\}\}/g, 'there');
  result = result.replace(/\{\{org_name\}\}/g, 'your team');
  result = result.replace(/\{\{table_name\}\}/g, 'Leads');
  result = result.replace(/\{\{column_name\}\}/g, 'Company');
  result = result.replace(/\{\{contact_name\}\}/g, 'Sarah Johnson');
  result = result.replace(/\{\{deal_name\}\}/g, 'Enterprise Deal');
  result = result.replace(/\{\{company_name\}\}/g, 'Acme Corp');
  result = result.replace(/\{\{meeting_title\}\}/g, 'Quarterly Review');
  return result;
}

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

    // Skip try-it blocks (not relevant for public docs)
    if (line.startsWith(':::try-it{')) {
      const precedingLines = lines.slice(lastIndex, i);
      const precedingText = precedingLines.join('\n').trim();
      if (precedingText) segments.push({ type: 'markdown', level: '', content: precedingText });
      lastIndex = i + 1;
      i++;
      continue;
    }

    const openMatch = line.match(new RegExp(`^:::(${allTypes.join('|')})$`));
    if (openMatch) {
      const precedingLines = lines.slice(lastIndex, i);
      const precedingText = precedingLines.join('\n').trim();
      if (precedingText) segments.push({ type: 'markdown', level: '', content: precedingText });

      const blockType = openMatch[1];
      const isSkill = skillLevels.includes(blockType);

      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== ':::') j++;

      const blockContent = lines.slice(i + 1, j).join('\n').trim();
      segments.push({ type: isSkill ? 'skill' : 'callout', level: blockType, content: blockContent });

      lastIndex = j + 1;
      i = j + 1;
    } else {
      i++;
    }
  }

  const remainingText = lines.slice(lastIndex).join('\n').trim();
  if (remainingText) segments.push({ type: 'markdown', level: '', content: remainingText });

  return segments;
}

// ─── Inline components ───────────────────────────────────────────────────────

function CodeBlock({ children, className }: { children: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-xl border border-gray-200 dark:border-gray-700/50 overflow-hidden my-6">
      <pre className={`${className || ''} bg-gray-50 dark:bg-gray-800/50 p-4 overflow-x-auto`}>
        <code className="text-sm text-gray-800 dark:text-gray-200">{children}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 p-1.5 rounded-lg bg-gray-200/80 dark:bg-gray-700/80 hover:bg-gray-300 dark:hover:bg-gray-600
          opacity-0 group-hover:opacity-100 transition-all"
        aria-label="Copy code"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-gray-500 dark:text-gray-300" />}
      </button>
    </div>
  );
}

const calloutConfig = {
  tip: { label: 'Tip', icon: Lightbulb, border: 'border-l-emerald-500 dark:border-l-emerald-400', bg: 'bg-emerald-50/50 dark:bg-emerald-500/5', iconColor: 'text-emerald-500 dark:text-emerald-400', titleColor: 'text-emerald-700 dark:text-emerald-400' },
  warning: { label: 'Warning', icon: AlertTriangle, border: 'border-l-amber-500 dark:border-l-amber-400', bg: 'bg-amber-50/50 dark:bg-amber-500/5', iconColor: 'text-amber-500 dark:text-amber-400', titleColor: 'text-amber-700 dark:text-amber-400' },
  info: { label: 'Info', icon: Info, border: 'border-l-blue-500 dark:border-l-blue-400', bg: 'bg-blue-50/50 dark:bg-blue-500/5', iconColor: 'text-blue-500 dark:text-blue-400', titleColor: 'text-blue-700 dark:text-blue-400' },
  note: { label: 'Note', icon: StickyNote, border: 'border-l-gray-400 dark:border-l-gray-500', bg: 'bg-gray-50/50 dark:bg-gray-500/5', iconColor: 'text-gray-500 dark:text-gray-400', titleColor: 'text-gray-700 dark:text-gray-400' },
} as const;

function CalloutBlock({ type, children }: { type: keyof typeof calloutConfig; children: React.ReactNode }) {
  const c = calloutConfig[type];
  const Icon = c.icon;
  return (
    <div className={`my-6 rounded-r-xl border border-l-4 ${c.border} border-gray-200 dark:border-gray-700/50 ${c.bg} px-5 py-4`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`w-4 h-4 ${c.iconColor}`} />
        <span className={`text-sm font-semibold ${c.titleColor}`}>{c.label}</span>
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:my-1 prose-code:before:content-none prose-code:after:content-none">
        {children}
      </div>
    </div>
  );
}

const skillConfig = {
  beginner: { label: 'Beginner', icon: GraduationCap, border: 'border-emerald-300 dark:border-emerald-500/30', bg: 'bg-emerald-50/50 dark:bg-emerald-500/5', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400', text: 'text-emerald-600 dark:text-emerald-400' },
  intermediate: { label: 'Intermediate', icon: Zap, border: 'border-blue-300 dark:border-blue-500/30', bg: 'bg-blue-50/50 dark:bg-blue-500/5', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400', text: 'text-blue-600 dark:text-blue-400' },
  advanced: { label: 'Advanced', icon: Flame, border: 'border-violet-300 dark:border-violet-500/30', bg: 'bg-violet-50/50 dark:bg-violet-500/5', badge: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400', text: 'text-violet-600 dark:text-violet-400' },
} as const;

function SkillLevelBlock({ level, children }: { level: keyof typeof skillConfig; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(level === 'beginner');
  const c = skillConfig[level];
  const Icon = c.icon;
  return (
    <div className={`my-6 rounded-xl border ${c.border} ${c.bg} overflow-hidden`}>
      <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-2.5">
          <Icon className={`w-4 h-4 ${c.text}`} />
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${c.badge}`}>{c.label}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="px-4 pb-4 prose prose-sm dark:prose-invert max-w-none prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-code:before:content-none prose-code:after:content-none">
          {children}
        </div>
      )}
    </div>
  );
}

function TableOfContents({ content }: { content: string }) {
  const [activeId, setActiveId] = useState('');

  const headings = useMemo(() => {
    const items: { id: string; text: string; level: number }[] = [];
    const seenSlugs = new Map<string, number>();
    for (const line of content.split('\n')) {
      const match = line.match(/^(#{2,3})\s+(.+)/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        const baseSlug = slugify(text);
        const count = seenSlugs.get(baseSlug) ?? 0;
        const id = count === 0 ? baseSlug : `${baseSlug}-${count}`;
        seenSlugs.set(baseSlug, count + 1);
        items.push({ id, text, level });
      }
    }
    return items;
  }, [content]);

  useEffect(() => {
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => { for (const e of entries) if (e.isIntersecting) setActiveId(e.target.id); },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0.1 }
    );
    for (const h of headings) { const el = document.getElementById(h.id); if (el) observer.observe(el); }
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 3) return null;

  return (
    <nav className="hidden xl:block sticky top-24 w-56 shrink-0 max-h-[calc(100vh-8rem)] overflow-y-auto">
      <div className="flex items-center gap-2 mb-3 px-2">
        <List className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">On this page</span>
      </div>
      <ul className="space-y-0.5">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              onClick={(e) => { e.preventDefault(); document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' }); setActiveId(h.id); }}
              className={`block text-sm py-1 transition-colors ${h.level === 3 ? 'pl-5' : 'pl-2'} ${
                activeId === h.id
                  ? 'text-blue-600 dark:text-blue-400 font-medium border-l-2 border-blue-500 dark:border-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border-l-2 border-transparent'
              }`}
            >
              <span className="block truncate">{h.text}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ─── Markdown renderer ───────────────────────────────────────────────────────

const markdownComponents = {
  code({ inline, className, children, ...props }: any) {
    if (inline) return <code className={className} {...props}>{children}</code>;
    return <CodeBlock className={className}>{String(children).replace(/\n$/, '')}</CodeBlock>;
  },
  table: ({ children, ...props }: any) => (
    <div className="overflow-x-auto my-6 rounded-xl border border-gray-200 dark:border-gray-700/50">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700/50" {...props}>{children}</table>
    </div>
  ),
  thead: ({ children, ...props }: any) => <thead className="bg-gray-50 dark:bg-gray-800/50" {...props}>{children}</thead>,
  th: ({ children, ...props }: any) => (
    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider" {...props}>{children}</th>
  ),
  td: ({ children, ...props }: any) => (
    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 border-t border-gray-100 dark:border-gray-800" {...props}>{children}</td>
  ),
  h1: ({ children, ...props }: any) => <h1 id={slugify(String(children))} {...props}>{children}</h1>,
  h2: ({ children, ...props }: any) => <h2 id={slugify(String(children))} className="scroll-mt-24" {...props}>{children}</h2>,
  h3: ({ children, ...props }: any) => <h3 id={slugify(String(children))} className="scroll-mt-24" {...props}>{children}</h3>,
};

const PROSE_CLASSES = `prose prose-lg prose-gray dark:prose-invert max-w-none
  prose-headings:text-gray-900 dark:prose-headings:text-white prose-headings:font-semibold
  prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-5 prose-h2:pb-3 prose-h2:border-b prose-h2:border-gray-200 dark:prose-h2:border-white/[0.08]
  prose-h3:text-xl prose-h3:mt-10 prose-h3:mb-4
  prose-p:text-gray-600 dark:prose-p:text-gray-300 prose-p:leading-[1.8] prose-p:my-5
  prose-strong:text-gray-900 dark:prose-strong:text-white
  prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
  prose-code:text-gray-800 dark:prose-code:text-gray-200
  prose-code:bg-gray-100 dark:prose-code:bg-gray-800/50
  prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-sm prose-code:font-medium
  prose-code:before:content-none prose-code:after:content-none
  prose-li:text-gray-600 dark:prose-li:text-gray-300 prose-li:leading-[1.8] prose-li:my-2
  prose-ul:my-6 prose-ol:my-6
  prose-blockquote:border-blue-500 dark:prose-blockquote:border-blue-400
  prose-blockquote:bg-blue-50/50 dark:prose-blockquote:bg-blue-500/5
  prose-blockquote:rounded-r-xl prose-blockquote:py-2 prose-blockquote:px-5 prose-blockquote:my-6
  prose-blockquote:text-gray-600 dark:prose-blockquote:text-gray-400 prose-blockquote:not-italic
  prose-hr:border-gray-200 dark:prose-hr:border-white/[0.08] prose-hr:my-10
  prose-table:my-8
  prose-img:rounded-xl prose-img:my-8`;

// ─── Data fetching ───────────────────────────────────────────────────────────

async function fetchArticleList(): Promise<GroupedArticles> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/docs-public`);
  if (!res.ok) throw new Error('Failed to load docs');
  const { data } = await res.json();
  return data || {};
}

async function fetchArticle(slug: string): Promise<Article | null> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/docs-public?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  const { data } = await res.json();
  return data || null;
}

// ─── Main component ─────────────────────────────────────────────────────────

export function PublicDocsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === null ? true : stored === 'dark';
  });

  // State
  const [grouped, setGrouped] = useState<GroupedArticles>({});
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [articleLoading, setArticleLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const selectedSlug = searchParams.get('article') || '';

  // Theme
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    return () => {
      document.documentElement.classList.remove('dark');
      document.documentElement.removeAttribute('data-theme');
    };
  }, [isDark]);

  // Load article list
  useEffect(() => {
    fetchArticleList()
      .then(setGrouped)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Auto-select first article when list loads
  useEffect(() => {
    if (!selectedSlug && !loading && Object.keys(grouped).length > 0) {
      const firstCat = CATEGORY_ORDER.find((c) => grouped[c]?.length) || Object.keys(grouped)[0];
      const firstSlug = grouped[firstCat]?.[0]?.slug;
      if (firstSlug) setSearchParams({ article: firstSlug }, { replace: true });
    }
  }, [grouped, loading, selectedSlug, setSearchParams]);

  // Load selected article content
  useEffect(() => {
    if (!selectedSlug) { setArticle(null); return; }
    setArticleLoading(true);
    fetchArticle(selectedSlug)
      .then(setArticle)
      .catch(console.error)
      .finally(() => setArticleLoading(false));
  }, [selectedSlug]);

  const handleArticleClick = useCallback((slug: string) => {
    setSearchParams({ article: slug });
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setSearchParams]);

  // Order and filter articles
  const orderedGroups = useMemo(() => {
    const result: GroupedArticles = {};
    for (const cat of CATEGORY_ORDER) {
      if (grouped[cat]?.length) result[cat] = grouped[cat];
    }
    // Uncategorized
    for (const cat of Object.keys(grouped)) {
      if (!CATEGORY_ORDER.includes(cat) && grouped[cat]?.length) result[cat] = grouped[cat];
    }
    return result;
  }, [grouped]);

  // Search filter
  const filteredGroups = useMemo(() => {
    if (!searchQuery) return orderedGroups;
    const q = searchQuery.toLowerCase();
    return Object.entries(orderedGroups).reduce((acc, [cat, articles]) => {
      const filtered = articles.filter((a) => a.title.toLowerCase().includes(q));
      if (filtered.length > 0) acc[cat] = filtered;
      return acc;
    }, {} as GroupedArticles);
  }, [orderedGroups, searchQuery]);

  const totalArticles = Object.values(filteredGroups).flat().length;

  // Process article content
  const processedContent = useMemo(() => {
    if (!article?.content) return '';
    let content = stripTemplateVars(article.content);
    content = content.replace(/^#\s+.+\n*/, '');
    return content;
  }, [article]);

  const contentSegments = useMemo(() => parseCustomBlocks(processedContent), [processedContent]);

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDark ? 'bg-[#070b18] text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      <NavbarV19 isDark={isDark} onToggleTheme={() => setIsDark((p) => !p)} />

      {/* Spacer for fixed navbar */}
      <div className="h-16" />

      {/* Header */}
      <header className="border-b border-gray-200 dark:border-white/[0.06] bg-white/80 dark:bg-[#070b18]/80 backdrop-blur-xl sticky top-16 z-30">
        <div className="max-w-[90rem] mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <a href="/v19" className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </a>
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 dark:from-emerald-500 dark:to-emerald-600 rounded-lg flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-semibold text-gray-900 dark:text-gray-100">Documentation</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-gray-400 text-xs font-medium rounded-full">
                {totalArticles} articles
              </span>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-white/[0.06] rounded-lg transition-colors lg:hidden"
              >
                {mobileMenuOpen ? <X className="w-5 h-5 text-gray-700 dark:text-gray-300" /> : <Menu className="w-5 h-5 text-gray-700 dark:text-gray-300" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 py-6">
        <div className="flex gap-6">
          {/* Sidebar */}
          <aside className={`w-64 shrink-0 lg:block ${mobileMenuOpen ? 'fixed inset-0 z-50 bg-black/50 lg:relative lg:bg-transparent' : 'hidden lg:block'}`}
            onClick={(e) => { if (e.target === e.currentTarget) setMobileMenuOpen(false); }}
          >
            <div className={`${mobileMenuOpen ? 'fixed right-0 top-0 h-full w-80 z-50' : 'sticky top-36'}
              bg-white dark:bg-white/[0.03] backdrop-blur-sm border border-gray-200 dark:border-white/[0.06]
              rounded-xl overflow-hidden max-h-[calc(100vh-10rem)] overflow-y-auto`}
            >
              <div className="p-5">
                {/* Search */}
                <div className="relative mb-5">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search docs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08]
                      rounded-xl text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
                      focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-emerald-500 focus:border-transparent text-sm"
                  />
                </div>

                {loading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="space-y-2">
                        <div className="h-3 w-20 bg-gray-200 dark:bg-white/[0.06] rounded animate-pulse" />
                        <div className="h-9 bg-gray-100 dark:bg-white/[0.04] rounded-lg animate-pulse" />
                        <div className="h-9 bg-gray-100 dark:bg-white/[0.04] rounded-lg animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <nav className="space-y-5">
                    {Object.entries(filteredGroups).map(([category, articles]) => {
                      const colors = getCategoryColor(category);
                      return (
                        <div key={category}>
                          <div className="flex items-center gap-2 mb-2 px-3">
                            <div className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{category}</h3>
                            <span className="text-[10px] text-gray-400 dark:text-gray-600 ml-auto">{articles.length}</span>
                          </div>
                          <ul className="space-y-0.5">
                            {articles.map((a) => (
                              <li key={a.slug}>
                                <button
                                  onClick={() => handleArticleClick(a.slug)}
                                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-2 ${
                                    selectedSlug === a.slug
                                      ? `${colors.bg} ${colors.text} font-medium`
                                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.04]'
                                  }`}
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

          {/* Main content */}
          <main className="flex-1 min-w-0">
            {loading || articleLoading ? (
              <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] rounded-xl p-8">
                <div className="space-y-4 animate-pulse">
                  <div className="h-8 w-2/3 bg-gray-200 dark:bg-white/[0.06] rounded-lg" />
                  <div className="h-4 w-1/4 bg-gray-100 dark:bg-white/[0.04] rounded" />
                  <div className="space-y-3 mt-8">
                    <div className="h-4 bg-gray-100 dark:bg-white/[0.04] rounded" />
                    <div className="h-4 bg-gray-100 dark:bg-white/[0.04] rounded" />
                    <div className="h-4 w-3/4 bg-gray-100 dark:bg-white/[0.04] rounded" />
                  </div>
                </div>
              </div>
            ) : article ? (
              <div className="flex gap-6">
                {/* Article card */}
                <div className="flex-1 min-w-0 bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] rounded-xl overflow-hidden">
                  {/* Article header */}
                  <div className="p-6 sm:p-8 border-b border-gray-200 dark:border-white/[0.06]">
                    <div className="flex items-center gap-2 mb-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getCategoryColor(article.category).bg} ${getCategoryColor(article.category).text}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${getCategoryColor(article.category).dot}`} />
                        {article.category}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-600" />
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{article.title}</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3">{article.title}</h1>
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Updated {new Date(article.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>
                  </div>

                  {/* Article body */}
                  <div className="p-6 sm:p-10 lg:p-12">
                    {contentSegments.map((segment, i) => {
                      if (segment.type === 'skill') {
                        return (
                          <SkillLevelBlock key={i} level={segment.level as keyof typeof skillConfig}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{segment.content}</ReactMarkdown>
                          </SkillLevelBlock>
                        );
                      }
                      if (segment.type === 'callout') {
                        return (
                          <CalloutBlock key={i} type={segment.level as keyof typeof calloutConfig}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{segment.content}</ReactMarkdown>
                          </CalloutBlock>
                        );
                      }
                      return (
                        <article key={i} className={PROSE_CLASSES}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {segment.content}
                          </ReactMarkdown>
                        </article>
                      );
                    })}
                  </div>

                  {/* CTA footer */}
                  <div className="px-6 sm:px-8 py-6 border-t border-gray-200 dark:border-white/[0.06] bg-gray-50/50 dark:bg-white/[0.02]">
                    <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Ready to get started?</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Try 60 free and see these features in action.</p>
                      </div>
                      <a
                        href="https://www.use60.com/waitlist"
                        className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 dark:bg-emerald-500 text-white hover:bg-blue-700 dark:hover:bg-emerald-600 transition-colors shrink-0"
                      >
                        Get Started
                      </a>
                    </div>
                  </div>
                </div>

                {/* Table of Contents */}
                <TableOfContents content={processedContent} />
              </div>
            ) : (
              <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.06] rounded-xl p-12 text-center">
                <div className="w-12 h-12 bg-gray-100 dark:bg-white/[0.06] rounded-xl flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="text-gray-500 dark:text-gray-400 font-medium">Select an article from the sidebar</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Choose a topic to get started</p>
              </div>
            )}
          </main>
        </div>
      </div>

      <FooterV19 />
    </div>
  );
}

export default PublicDocsPage;
